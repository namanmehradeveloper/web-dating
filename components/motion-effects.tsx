'use client';

import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {ArrowUp} from 'lucide-react';

// Progressive enhancement: nothing is hidden while waiting for JavaScript.
// One observer handles public pages, authenticated screens and async API content.
const targets = [
  '.v5-hero-copy','.v5-hero-art','.v5-editorial-image','.v5-editorial-copy',
  '.v5-section-top','.v5-step','.v5-world-art','.v5-safety-inner','.v5-accordion',
  '.v5-faq .v5-split > div:first-child','.v5-ending .v5-container',
  '.v2-interior-headline','.v2-interior-visual','.v2-about-mission-grid > div',
  '.v2-about-values-grid > article','.v2-content-card','.v2-stories-grid > div',
  '.v2-interior-section-heading','.v2-interior-cta-grid','.v2-faq-layout > div',
  '.v2-featured-card','.page-heading','.v5-member-nav','.discovery-hero',
  '.aside-feature','.mini-advice','.person-tile','.person-row','.panel',
  '.chat-layout','.v2-profile-hero','.dc-member-detail','.premium-hero','.price-card',
  '.bottom-prompt','.auth-visual-copy','.auth-card','.onboarding-card',
  '.dc-contact-hero','.dc-contact-inner > aside','.dc-contact-form',
  '.dc-footer-brand','.dc-footer-links'
].join(',');

export function MotionEffects(){
  const pathname=usePathname();
  const progress=useRef<HTMLSpanElement>(null);
  const [showTop,setShowTop]=useState(false);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const watched=new Set<HTMLElement>();
    const seen=new WeakSet<HTMLElement>();
    const running=new Set<Animation>();
    let observer:IntersectionObserver|null=null;
    let mutation:MutationObserver|null=null;
    let frame=0,scanFrame=0;
    function reveal(element:HTMLElement){
      observer?.unobserve(element);
      if(reduced.matches||!element.animate||document.hidden)return;
      const index=Array.from(element.parentElement?.children||[]).indexOf(element);
      const animation=element.animate([
        {opacity:0,transform:'translate3d(0,22px,0)'},
        {opacity:1,transform:'translate3d(0,0,0)'}
      ],{duration:640,delay:Math.min(Math.max(index,0),3)*45,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
      running.add(animation);
      animation.finished.catch(()=>{}).finally(()=>running.delete(animation));
    }
    function scan(){
      scanFrame=0;
      document.querySelectorAll<HTMLElement>(targets).forEach(element=>{
        if(seen.has(element)||element.closest('.overlay,[hidden],[aria-hidden="true"]'))return;
        seen.add(element);
        // An animated parent already includes its children.
        if(element.parentElement?.closest('[data-v5-observed]'))return;
        watched.add(element);element.dataset.v5Observed='';
        observer?.observe(element);
      });
    }
    function start(){
      if(reduced.matches||!('IntersectionObserver' in window))return;
      observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting)reveal(entry.target as HTMLElement);
      }),{threshold:.06});
      scan();
      mutation=new MutationObserver(records=>{
        if(!scanFrame&&records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1)))scanFrame=requestAnimationFrame(scan);
      });
      mutation.observe(document.body,{childList:true,subtree:true});
    }
    function stop(){observer?.disconnect();mutation?.disconnect();running.forEach(a=>a.cancel());running.clear();}
    function preference(){stop();if(!reduced.matches)start();}
    function focus(event:FocusEvent){
      const element=(event.target as Element)?.closest<HTMLElement>('[data-v5-observed]');
      if(element){observer?.unobserve(element);element.getAnimations().forEach(a=>a.cancel());}
    }
    function update(){
      frame=0;
      const max=document.documentElement.scrollHeight-innerHeight;
      if(progress.current)progress.current.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;
      document.documentElement.classList.toggle('v5-scrolled',scrollY>20);
      setShowTop(scrollY>800);
    }
    function scroll(){if(!frame)frame=requestAnimationFrame(update);}
    start();update();
    reduced.addEventListener('change',preference);
    document.addEventListener('focusin',focus);
    window.addEventListener('scroll',scroll,{passive:true});
    window.addEventListener('resize',scroll,{passive:true});
    return ()=>{
      stop();cancelAnimationFrame(frame);cancelAnimationFrame(scanFrame);
      watched.forEach(el=>delete el.dataset.v5Observed);
      reduced.removeEventListener('change',preference);
      document.removeEventListener('focusin',focus);
      window.removeEventListener('scroll',scroll);window.removeEventListener('resize',scroll);
    };
  },[pathname]);
  return <><div className="v5-reading-progress" aria-hidden="true"><span ref={progress}/></div>{showTop&&!pathname.startsWith('/messages')&&<button className="v5-back-top" type="button" aria-label="Back to top" onClick={()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}><ArrowUp size={19}/></button>}</>;
}
