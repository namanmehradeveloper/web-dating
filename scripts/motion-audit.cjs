/** Motion integration audit. No network and no extra runtime dependencies. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const layout=read('app/layout.tsx');
const motion=read('components/motion-effects.tsx');
const css=read('app/motion.css');
const discover=read('components/discover.tsx');
const chat=read('components/chat.tsx');
assert.match(layout,/import '\.\/motion\.css'/);
assert.match(layout,/<MotionEffects\/>/);
assert.match(motion,/IntersectionObserver/);
assert.match(motion,/MutationObserver/);
assert.match(motion,/prefers-reduced-motion/);
assert.match(motion,/\.dc-matches/);
assert.match(motion,/\.dc-messages/);
assert.match(css,/\.motion-enabled \[data-motion-reveal\]/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
for(const category of ['dc-drift-photo','dc-reveal-up','dc-pop-in','dc-feedback-like','dc-feedback-pass','dc-message-in','dc-typing-bounce','dc-toast-in']){
 assert.ok(css.includes(`@keyframes ${category}`),`Animation ${category} missing`);
}
assert.match(discover,/data-swipe-feedback=\{swipeFeedback\|\|undefined\}/);
const swipeBlock=discover.slice(discover.indexOf('const swipe=async'),discover.indexOf('const undo=async'));
assert.ok(swipeBlock.indexOf('const response=await request')<swipeBlock.indexOf('setSwipeFeedback(action)'), 'Swipes must only animate after successful server responses');
assert.match(chat,/className="dc-typing-dots"/);
assert.match(chat,/prefers-reduced-motion/);
assert.ok(!read('lib/api.ts').includes('data-motion-reveal'), 'Motion code should not touch API client');
// A safe JSX/TS syntax check if TypeScript is installed. Full type checking is npm run lint.
let checked=0;
try {
 const ts=require('typescript');
 function walk(folder){for(const ent of fs.readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,ent.name);
  if(ent.isDirectory())walk(p);else if(/\.tsx?$/.test(ent.name)&&!ent.name.endsWith('.d.ts')){
   const file=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   if(file.parseDiagnostics.length){throw new Error(`TypeScript syntax: ${p}: ${file.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`)} checked++;
  }
 }}
 walk(path.join(root,'app'));walk(path.join(root,'components'));walk(path.join(root,'lib'));
}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;console.log('TypeScript parser unavailable until npm install; source content checks still pass.');}
console.log(`✓ Motion orchestration, accessibility, chat/swipe integration and CSS identifiers verified${checked?` (${checked} TS/TSX files parsed)`:''}`);
console.log('Motion source audit passed. Live browser and backend testing are separate.');
