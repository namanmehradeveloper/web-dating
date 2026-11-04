'use client';

import Link from 'next/link';
import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight, ArrowUpRight, Check, Heart, MessageCircle, ShieldCheck, Sparkles, Compass, Plus, Minus} from 'lucide-react';
import {useApp} from './provider';
import {FeaturedMembers} from './featured-members';

const steps = [
  {number:'01', icon:Sparkles, title:'A profile that feels like you.', text:'Your favorite things. Your little quirks. Let the real you make the first impression.'},
  {number:'02', icon:Compass, title:'Find a little common ground.', text:'Discover people, explore shared interests and send a like when someone catches your eye.'},
  {number:'03', icon:MessageCircle, title:'See where hello takes you.', text:'A mutual like opens a new possibility. Start a conversation and take it at your own pace.'}
];
const questions = [
  ['Is Dating Cloud free to join?', 'You can create an account for free. Any available paid features and prices are shown before you choose to purchase.'],
  ['How do I start a conversation?', 'Complete your profile, explore Discover and send a like. Your mutual connections appear in Matches, where you can open a conversation.'],
  ['Can I choose who I discover?', 'Yes. Use your profile preferences to set an age range, distance and other available discovery options.'],
  ['How can I protect my privacy?', 'Choose what you share, keep sensitive details private and use the block and report tools whenever you need them. Visit our Safety Center for more guidance.']
];

export function Landing() {
  const {session}=useApp();
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [question,setQuestion]=useState<number|null>(0);
  const join=session?'/discover':'/signup';
  function quickJoin(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(session?'/discover':`/signup?email=${encodeURIComponent(email.trim())}`);
  }
  return <main id="main-content" className="v5-home">
    <section className="v5-hero"><div className="v5-container v5-hero-grid">
      <div className="v5-hero-copy"><span className="v5-kicker"><span/> REAL PEOPLE. REAL POSSIBILITIES.</span><h1>A little spark.<br/>A whole new<br/><em>kind of story.</em></h1><p>For the easy conversations. The shared little things. And the person who makes you feel like yourself.</p><div className="v5-hero-actions"><Link href={join} className="v5-button">{session?'Discover your people':'Find your connection'}<ArrowUpRight size={19}/></Link><span>One hello can<br/>change everything.</span></div><div className="v5-hero-foot"><ShieldCheck size={19}/><span>Made for adults 18+<br/><strong>Go at your own pace.</strong></span><span className="v5-hero-foot-line"/><Heart size={19}/><span>Less pressure.<br/><strong>More possibility.</strong></span></div></div>
      <div className="v5-hero-art"><div className="v5-hero-photo"><img src="/images/couple.jpg" alt="Two people forming a heart with their hands at sunset" fetchPriority="high"/><span className="v5-image-caption">THE BEST THINGS START WITH HELLO.</span></div><span className="v5-art-orbit" aria-hidden="true"/><span className="v5-spark v5-spark-one" aria-hidden="true">✳</span><span className="v5-spark v5-spark-two" aria-hidden="true">✦</span><div className="v5-floating-note"><span><Heart size={19} fill="currentColor"/></span><div><strong>A good feeling.</strong><small>A great place to start.</small></div></div><span className="v5-side-caption">A NEW CHAPTER AWAITS · DATING CLOUD</span></div>
    </div></section>
    <div className="v5-principles"><div className="v5-container"><span><Check size={16}/> Come as you are</span><span><Heart size={16}/> Connect with intention</span><span><MessageCircle size={16}/> Start with a conversation</span><span><ShieldCheck size={16}/> You set the pace</span></div></div>
    <section className="v5-section v5-introduction"><div className="v5-container v5-split"><div className="v5-editorial-image"><img src="/images/moment.jpg" alt="Two decorated chairs together in a sunlit garden" loading="lazy"/><span className="v5-photo-label">A little more real. <Heart size={18}/></span></div><div className="v5-editorial-copy"><span className="v5-kicker">MORE THAN A FIRST IMPRESSION</span><h2>Someone who gets<br/>your <em>kind of weird.</em></h2><p>The same songs on repeat. A very specific coffee order. A laugh that feels like home. We believe the small things can be the start of something meaningful.</p><p>Share who you are, discover people with something in common, and make room for a genuine connection.</p><Link href="/about" className="v5-text-link">A little about us <ArrowUpRight size={18}/></Link><div className="v5-handwritten">Good things take a little hello. ♡</div></div></div></section>
    <section className="v5-section v5-how" id="how-it-works"><div className="v5-container"><div className="v5-section-top"><div><span className="v5-kicker">A FRESH START, SIMPLY</span><h2>From nice profile<br/>to <em>nice to meet you.</em></h2></div><Link href="/how-it-works" className="v5-text-link">How it works <ArrowUpRight size={18}/></Link></div><div className="v5-steps">{steps.map(({number,icon:Icon,title,text})=><article key={number} className="v5-step"><div className="v5-step-top"><span>{number}</span><Icon size={25} strokeWidth={1.5}/></div><h3>{title}</h3><p>{text}</p><span className="v5-step-line"/></article>)}</div></div></section>
    <FeaturedMembers/>
    <section className="v5-section v5-world"><div className="v5-container v5-split"><div className="v5-editorial-copy"><span className="v5-kicker">YOUR PEOPLE ARE OUT THERE</span><h2>Different interests.<br/><em>The same spark.</em></h2><p>Maybe it starts with a weekend hike, a favorite book, or the courage to say hello. Explore the details that make someone more than just a photo.</p><div className="v5-interest-tags"><span>☕ Coffee & conversation</span><span>♫ One more song</span><span>↗ The next adventure</span><span>♡ The little things</span></div><Link href={join} className="v5-button">Meet someone new <ArrowRight size={18}/></Link></div><div className="v5-world-art"><img src="/images/friends.jpg" alt="Adults spending a relaxed day together outside" loading="lazy"/><div className="v5-world-card"><MessageCircle size={22}/><p>“Wait, you love<br/><em>that too?</em>”</p><span>THE START OF SOMETHING GOOD.</span></div></div></div></section>
    <section className="v5-safety"><div className="v5-container v5-safety-inner"><div className="v5-safety-mark"><ShieldCheck size={52} strokeWidth={1.3}/></div><div><span className="v5-kicker">YOUR COMFORT COMES FIRST</span><h2>A little trust.<br/><em>A lot of respect.</em></h2><p>Share only what feels right. Take your time. Stay in control with the block and report tools available in your account.</p></div><Link href="/safety" className="v5-button v5-button-outline">Explore our safety center <ArrowUpRight size={18}/></Link></div></section>
    <section className="v5-section v5-faq"><div className="v5-container v5-split"><div><span className="v5-kicker">GOOD QUESTIONS</span><h2>Before the hello,<br/><em>a little clarity.</em></h2><p>Everything you need to feel ready<br/>for your next chapter.</p><Link href="/faq" className="v5-text-link">All your questions, answered <ArrowUpRight size={17}/></Link></div><div className="v5-accordion">{questions.map(([title,answer],i)=><div className="v5-question" key={title}><h3><button aria-expanded={question===i} aria-controls={`home-answer-${i}`} onClick={()=>setQuestion(question===i?null:i)}>{title}{question===i?<Minus size={18}/>:<Plus size={18}/>}</button></h3><div className="v5-answer" id={`home-answer-${i}`} inert={question!==i} aria-hidden={question!==i} data-open={question===i}><div><p>{answer}</p></div></div></div>)}</div></div></section>
    <section className="v5-ending"><div className="v5-container"><span className="v5-kicker"><Sparkles size={15}/> YOUR NEXT CHAPTER</span><h2>Every good story<br/>starts <em>somewhere.</em></h2><p>Maybe yours starts right here.</p><form onSubmit={quickJoin} className="v5-join-form">{!session&&<label><span className="sr-only">Email address</span><input type="email" required placeholder="Your email address" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}<button className="v5-button" type="submit">{session?'Keep discovering':'Let’s begin'}<ArrowUpRight size={19}/></button></form><small>For adults 18+. Your story, at your pace.</small><Heart className="v5-ending-heart" size={200} strokeWidth={.5} aria-hidden="true"/></div></section>
  </main>;
}
