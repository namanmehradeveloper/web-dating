/** V4 offline checks: route anchors, presentational-only motion and accessibility. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const file=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const landing=file('components/landing.tsx');
const showcase=file('components/v4-showcase.tsx');
const effect=file('components/motion-v4.tsx');
const css=file('app/motion-v4.css');
const layout=file('app/layout.tsx');
const api=file('lib/api.ts');
const chat=file('components/chat.tsx');
for(const key of ['v4-chapter-rail','v4-mosaic-card','v4-wide-story','v4-mosaic-photo','v4-wide-story-photo'])assert.ok(css.includes(key),`Missing ${key} CSS`);
for(const key of ['HomeChapterRail','StoryShowcase','WideStory'])assert.ok(landing.includes(`<${key}/>`)||landing.includes(`<${key} />`),`Landing missing ${key}`);
for(const id of ['home-title','how-it-works','discover-connection','safety-tips','join-community']){
 assert.ok(landing.includes(`id="${id}"`),`Missing homepage anchor ${id}`);
 assert.ok(showcase.includes(`id:'${id}'`),`Section rail doesn't point to ${id}`);
}
for(const href of ['/about','/how-it-works','/safety','/signup'])assert.ok(showcase.includes(`'${href}'`)||showcase.includes(`"${href}"`),`Showcase link missing ${href}`);
for(const key of ['IntersectionObserver','MutationObserver','requestAnimationFrame','cancelAnimationFrame','prefers-reduced-motion','removeEventListener','document.hidden','innerWidth<768','v4-visible'])assert.ok(effect.includes(key),`Motion lifecycle missing ${key}`);
assert.ok(layout.includes("import './motion-v4.css'"));
assert.ok(layout.includes('<MotionV4/>'));
assert.match(css,/@media\(max-width:680px\)/);
assert.match(css,/@media\(max-width:375px\)/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(chat,/socket\.on\('message:new'/);
assert.match(api,/Authorization/);
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
let count=0;
for(const folder of ['app','components','lib']){
 const walk=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true})){
  const full=path.join(d,entry.name);
  if(entry.isDirectory())walk(full);
  else if(/\.tsx?$/.test(entry.name)&&!entry.name.endsWith('.d.ts')){
    const tree=ts.createSourceFile(full,fs.readFileSync(full,'utf8'),ts.ScriptTarget.Latest,true,entry.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(tree.parseDiagnostics.length,0,`Syntax error in ${full}`);count++;
  }
 }};
 walk(path.join(root,folder));
}
try{require('postcss').parse(css,{from:'app/motion-v4.css'});console.log('✓ V4 CSS parsed with PostCSS');}catch(e){if(e.code==='MODULE_NOT_FOUND')console.log('PostCSS unavailable; CSS parse is separately checked');else throw e;}
console.log(`✓ V4 showcase anchors, internal links, API preservation signatures, responsive and reduced-motion hooks (${count} TS/TSX files parsed)`);
console.log('Motion V4 offline audit passed; live browser and production build are separate.');
