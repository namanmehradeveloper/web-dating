/* Offline unit and syntax checks. Run after npm install: npm run test:smoke */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const findSources = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap(item => {
  const p=path.join(dir,item.name);
  return item.isDirectory()?findSources(p):/\.tsx?$/.test(p)?[p]:[];
});
function transpile(relative) {
  const filename=path.join(root,relative);
  const source=fs.readFileSync(filename,'utf8');
  const result=ts.transpileModule(source,{
    fileName:filename,
    reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}
  });
  assert.equal(result.diagnostics?.length || 0,0,`${relative} failed syntax validation:\n${(result.diagnostics || []).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n')}`);
  return result.outputText;
}
function loadModule(relative,context={}) {
  const exports={};
  vm.runInNewContext(transpile(relative),{exports,require,Response,FormData,File,crypto:globalThis.crypto,...context},{filename:relative});
  return exports;
}
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

(async()=>{
  const sources=[...findSources(path.join(root,'app')),...findSources(path.join(root,'components')),...findSources(path.join(root,'lib')),path.join(root,'next.config.ts')];
  for(const file of sources)transpile(path.relative(root,file));
  console.log(`✓ Parsed ${sources.length} TypeScript / TSX source files`);

  const {isAdultDateOfBirth}=loadModule('lib/validation.ts');
  const date=new Date(2026,9,23);
  assert.equal(isAdultDateOfBirth('2008-10-23',date),true);
  assert.equal(isAdultDateOfBirth('2008-10-24',date),false);
  assert.equal(isAdultDateOfBirth('2008-02-30',date),false);
  assert.equal(isAdultDateOfBirth('invalid',date),false);
  console.log('✓ Age validation incl. birthday boundary and impossible dates');

  const calls=[];
  const queue=[];
  const api=loadModule('lib/api.ts');
  // Route the shared Axios client through the same queue used by the old fetch mock.
  api.http.defaults.adapter=async(config)=>{
    const base=(config.baseURL||'').replace(/\/$/,'');
    const path=String(config.url||'');
    const url=path.startsWith('http')?path:`${base}${path.startsWith('/')?path:`/${path}`}`;
    const headers={...(config.headers&&typeof config.headers.toJSON==='function'?config.headers.toJSON():config.headers)||{}};
    calls.push({url,options:{method:config.method,headers,data:config.data}});
    assert.ok(queue.length,'Unexpected outgoing API call');
    const res=await queue.shift()();
    const raw=await res.text();
    return {data:raw,status:res.status,statusText:res.statusText,headers:Object.fromEntries(res.headers.entries()),config,request:{}};
  };
  queue.push(()=>json(200,{success:true,data:{items:[{id:'one'}]}}));
  assert.equal((await api.request('GET','/discovery')).items[0].id,'one');
  assert.equal(calls[0].url,'/api/v1/discovery');
  console.log('✓ Standard REST request and API response parsing');

  const old={accessToken:'access-old',refreshToken:'refresh-old',userId:'member-1'};
  let refreshed=null;
  api.configureSession(old,session=>{refreshed=session;});
  queue.push(
    ()=>json(401,{success:false,error:{code:'UNAUTHENTICATED',message:'Expired'}}),
    ()=>json(200,{success:true,data:{accessToken:'access-new',refreshToken:'refresh-new'}}),
    ()=>json(200,{success:true,data:{id:'member-1',displayName:'Pat'}}),
  );
  assert.equal((await api.request('GET','/profile/me')).displayName,'Pat');
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer access-new');
  assert.equal(refreshed.refreshToken,'refresh-new');
  console.log('✓ HTTP 401 token rotation and request retry with updated authorization');

  // An in-flight call must not resurrect the old login after logout.
  api.configureSession({accessToken:'old-again',refreshToken:'refresh-again',userId:'member-1'});
  let finishRefresh;
  queue.push(()=>json(401,{success:false,error:{code:'UNAUTHENTICATED',message:'Expired'}}));
  queue.push(()=>new Promise(resolve=>{finishRefresh=resolve;}));
  const inflight=api.request('GET','/profile/me');
  for(let i=0;i<10 && !finishRefresh;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof finishRefresh,'function','Expected refresh request');
  api.configureSession(null);
  finishRefresh(json(200,{success:true,data:{accessToken:'must-not-use',refreshToken:'must-not-use'}}));
  await assert.rejects(inflight,e=>e.code==='SESSION_CHANGED');
  console.log('✓ Logout prevents an in-flight token refresh from restoring the prior session');

  api.configureSession(null);
  queue.push(()=>new Response('<html>Not Found</html>',{status:200,headers:{'Content-Type':'text/html'}}));
  await assert.rejects(api.request('GET','/profile/me'),e=>e.code==='INVALID_RESPONSE');
  await assert.rejects(api.request('GET','invalid-path'),e=>e.code==='INVALID_PATH');
  await assert.rejects(api.upload(new File(['not an image'],'hello.txt',{type:'text/plain'})),e=>e.code==='INVALID_FILE');
  console.log('✓ Unexpected HTML proxy responses, invalid paths, upload validation');

  assert.equal(queue.length,0);
  console.log('Offline smoke tests passed. Live API tests and Next.js build require installed dependencies and backend.');
})().catch(error=>{console.error(error);process.exitCode=1;});
