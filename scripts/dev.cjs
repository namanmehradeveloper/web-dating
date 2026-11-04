// Accept common preview-runner flags and translate them to Next.js CLI flags.
const {spawn}=require('node:child_process');
const input=process.argv.slice(2),args=['dev'];
let hasPort=false;
for(let i=0;i<input.length;i++){
  if(input[i]==='--strictPort')continue;
  if(input[i]==='--host'){args.push('--hostname',input[++i]);continue;}
  if(input[i]==='--port'||input[i]==='-p')hasPort=true;
  args.push(input[i]);
}
if(!hasPort)args.push('--port',process.env.PORT||'3000');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),...args],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
