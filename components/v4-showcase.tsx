'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowDownRight,ArrowRight,ArrowUpRight,Heart,MessageCircle,ShieldCheck,Sparkles} from 'lucide-react';

const chapters = [
  {id:'home-title',label:'Welcome'},
  {id:'how-it-works',label:'How it works'},
  {id:'discover-connection',label:'Discover'},
  {id:'safety-tips',label:'Safety'},
  {id:'join-community',label:'Join free'},
];
const tiles=[
  {title:'A moment to connect',label:'START WITH A HELLO',href:'/how-it-works',image:'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=860&q=85',alt:'Friends enjoying the outdoors',icon:MessageCircle},
  {title:'Space to be yourself',label:'YOUR KIND OF PEOPLE',href:'/about',image:'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=860&q=85',alt:'Friends spending time together',icon:Sparkles},
  {title:'Trust your own pace',label:'GOOD BOUNDARIES',href:'/safety',image:'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=860&q=85',alt:'Two people enjoying time together',icon:ShieldCheck},
];

export function HomeChapterRail(){
  const [active,setActive]=useState(chapters[0].id);
  useEffect(()=>{
    if(!('IntersectionObserver' in window))return;
    const nodes=chapters.map(item=>document.getElementById(item.id)).filter((item):item is HTMLElement=>Boolean(item));
    if(!nodes.length)return;
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting)setActive(entry.target.id);
    },{rootMargin:'-30% 0px -49% 0px',threshold:0});
    nodes.forEach(node=>observer.observe(node));
    return ()=>observer.disconnect();
  },[]);
  return <nav className="v4-chapter-rail" aria-label="Homepage sections">
    <span className="v4-rail-caption">EXPLORE</span>
    {chapters.map(({id,label},index)=><a key={id} href={`#${id}`} className={active===id?'active':''} aria-label={`Jump to ${label}`} aria-current={active===id?'location':undefined} title={label}><span className="v4-rail-dot"/><span className="v4-rail-label">{String(index+1).padStart(2,'0')} · {label}</span></a>)}
  </nav>;
}

export function StoryShowcase(){
  return <section className="v4-mosaic v2-section" aria-labelledby="v4-mosaic-title">
    <div className="v2-container">
      <div className="v4-mosaic-heading">
        <div><span className="v2-eyebrow"><Heart size={15} fill="currentColor"/> THE MOMENTS IN BETWEEN</span><h2 id="v4-mosaic-title" className="v2-heading">It's the little things that <em>make it real.</em></h2></div>
        <p>Shared laughter. A thoughtful question. The feeling of being seen. There's more to a meaningful connection than the first photo.</p>
      </div>
      <div className="v4-mosaic-tiles">
        {tiles.map(({title,label,image,alt,href,icon:Icon},index)=><Link href={href} key={title} className={`v4-mosaic-card v4-mosaic-card-${index+1}`} aria-label={`${title} — learn more`}>
          <img src={image} alt={alt} className="v4-mosaic-photo" loading="lazy"/>
          <span className="v4-mosaic-shade" aria-hidden="true"/>
          <span className="v4-mosaic-number">0{index+1}</span>
          <span className="v4-mosaic-content"><span className="v4-mosaic-kicker"><Icon size={15}/>{label}</span><strong>{title}</strong><span className="v4-mosaic-arrow"><ArrowUpRight size={20}/></span></span>
        </Link>)}
      </div>
      <div className="v4-mosaic-badge" aria-hidden="true"><Heart size={18} fill="currentColor"/><span>All kinds of connection.<br/><strong>One place to begin.</strong></span><ArrowDownRight size={18}/></div>
    </div>
  </section>;
}

export function WideStory(){
  return <section className="v4-wide-story" aria-labelledby="v4-wide-title">
    <div className="v4-wide-story-photo" role="img" aria-label="Sunlit landscape representing a fresh beginning"/>
    <div className="v4-wide-story-copy"><span className="v2-eyebrow v2-eyebrow-light"><Sparkles size={16}/> A DIFFERENT KIND OF START</span><h2 id="v4-wide-title">Meet for the moment.<br/><em>Stay for the connection.</em></h2><p>Dating is full of possibilities. Explore people at your own pace, share what matters to you and see where a thoughtful introduction can lead.</p><Link href="/signup" className="v2-btn v2-btn-white">Start your next chapter <ArrowRight size={18}/></Link><small>Adults 18+ · No promised outcomes</small></div>
    <div className="v4-wide-story-rings" aria-hidden="true"><i/><i/><i/></div>
  </section>;
}
