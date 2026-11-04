/* Source-only V2 guardrails. Does NOT replace a full browser test or production build. */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const landing=read('components/landing.tsx');const publicPage=read('components/public-page.tsx');const appLayout=read('app/layout.tsx');const css=read('app/premium-v2.css');
assert.match(appLayout,/premium-v2\.css/,'V2 CSS must be loaded after shared CSS');
for(const section of ['v2-hero','v2-quick','v2-steps-section','FeaturedMembers','v2-discover-teaser','v2-features-section','v2-story-section','v2-safety-section','v2-faq-section','v2-ending'])assert.ok(landing.includes(section),'Missing home section: '+section);
assert.match(landing,/\/signup\?email=/,'Quick signup must hand email to signup flow');
assert.match(read('components/auth.tsx'),/searchParams\.get\('email'\)/,'Signup must read quick-join email');
assert.match(read('components/featured-members.tsx'),/request<\{items:Member\[\]\}>\('GET','\/discovery'\)/,'Featured members must be real API results');
assert.match(read('components/chat.tsx'),/socket\.on\('message:new'/,'Retain Socket.IO messages');
assert.match(read('components/discover.tsx'),/request<\{items:Member\[\]\}>\('GET',`\/discovery/,'Retain API-powered discovery');
assert.ok(read('components/profile.tsx').includes("'PATCH','/profile/me'"));
assert.ok(read('components/matches.tsx').includes("'GET','/matches?limit=50'"));
for(const route of ['/about','/how-it-works','/success-stories','/safety','/faq','/privacy','/terms'])assert.ok(publicPage.includes(`'${route}'`),'Missing public content: '+route);
for(const breakpoint of [380,680,850,1024,1190])assert.ok(css.includes(`max-width:${breakpoint}px`),'Missing breakpoint '+breakpoint);
for(const item of ['prefers-reduced-motion','focus-visible','v2-discover-skeleton','v2-match-skeleton','v2-profile-hero'])assert.ok(css.includes(item)||read('app/unified.css').includes(item),'Missing UI affordance: '+item);
const staticHrefs=[...landing.matchAll(/href="(\/[^"#?]*)/g),...publicPage.matchAll(/href="(\/[^"#?]*)/g)].map(x=>x[1]);
for(const href of staticHrefs){const pathname=href==='/'?'app/page.tsx':`app${href}/page.tsx`;assert.ok(fs.existsSync(path.join(root,pathname)),`Broken V2 internal link: ${href}`)}
console.log('✓ Homepage sections, real discovery feed and signup handoff');
console.log('✓ Existing auth, profile, matches and Socket.IO integration signatures');
console.log('✓ Responsive media queries, reduced-motion support and loading skeleton selectors');
console.log(`✓ ${staticHrefs.length} authored static internal page links resolve to Next.js routes`);
console.log('V2 source audit passed (not a live browser or backend test).');
