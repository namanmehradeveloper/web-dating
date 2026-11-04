/** Offline Motion V3 validation: no network, no fabricated API data. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const file=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const motion=file('components/motion-effects.tsx');
const css=file('app/motion.css');
const landing=file('components/landing.tsx');
const discover=file('components/discover.tsx');
const layout=file('app/layout.tsx');
for(const token of ['v3-reading-progress','v3-back-to-top','v3-pointer-active','v3-ink-ripple','--v3-magnet-x','prefers-reduced-motion','requestAnimationFrame','removeEventListener','cancelAnimationFrame'])assert.ok(motion.includes(token),`Motion orchestration missing ${token}`);
for(const token of ['v3-hero-atmosphere','v3-love-ribbon','v3-scroll-cue'])assert.ok(landing.includes(token),`Homepage motion hook missing ${token}`);
assert.match(landing,/href="#how-it-works"/);
assert.match(discover,/v3-confetti/);
assert.match(discover,/response=await request[\s\S]*?setSwipeFeedback\(action\)/);
assert.match(discover,/response\?\.isMatch&&response\.match/);
for(const token of ['v3-heart-burst','v3-ribbon-move','v3-image-unveil','v3-shine-text','v3-scroll-nudge','v3-ripple-spread','v3-back-to-top-enter'])assert.ok(css.includes(`@keyframes ${token}`),`Missing animation ${token}`);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/@media\(max-width:680px\)/);
assert.match(layout,/<MotionEffects\/>/);
assert.match(file('components/chat.tsx'),/socket\.on\('message:new'/);
assert.match(file('lib/api.ts'),/Authorization/);
let ts;
try {ts=require('typescript');}catch{ try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}catch{}}
let parsed=0;
if(ts){const folders=['app','components','lib'];for(const folder of folders){const walk=(p)=>{for(const ent of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,ent.name);if(ent.isDirectory())walk(full);else if(/\.tsx?$/.test(ent.name)&&!ent.name.endsWith('.d.ts')){const source=ts.createSourceFile(full,fs.readFileSync(full,'utf8'),ts.ScriptTarget.Latest,true,ent.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(source.parseDiagnostics.length,0,`TypeScript syntax error: ${full}`);parsed++;}}};walk(path.join(root,folder));}}
try{const postcss=require('postcss');postcss.parse(css,{from:'app/motion.css'});console.log('✓ Motion CSS parsed with PostCSS')}catch(e){if(e.code==='MODULE_NOT_FOUND')console.log('PostCSS not installed; CSS parse skipped');else throw e;}
console.log(`✓ Motion V3 hooks, match conditions, accessibility, cleanup and responsive selectors verified (${parsed} TS/TSX files parsed)`);
console.log('Motion V3 audit passed. This is not a production build or live end-to-end test.');
