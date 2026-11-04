'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';

/**
 * V4's animation director is purely presentational. It never intercepts links,
 * forms, chat events or requests. Content is visible by default (without JS).
 * New API-rendered images/cards are discovered by MutationObserver.
 */
const effectTargets: ReadonlyArray<readonly [string,string]> = [
  ['.v2-intro-art > img, .v2-teaser-photo > img, .v2-interior-visual > img, .v2-stories-inspiration > img, .v2-story-image, .v2-about-image-band, .v4-mosaic-photo, .v4-wide-story-photo','image'],
  ['.v2-steps-section .v2-center-heading h2, .v2-features-section .v2-center-heading h2, .v2-faq-intro h2, .v2-safety-section h2, .v2-featured-heading h2, .v2-stories-feature h2, .v2-about-mission h2, .v2-interior-section-heading h2, .v2-story-copy h2, .v4-mosaic-heading h2, .v4-wide-story-copy h2','headline'],
  ['.v2-teaser-list > div, .v2-safety-points > span, .v2-intro-notes > span, .v2-faq-list > details, .v4-mosaic-tiles > a, .v4-wide-story-copy > p','rise'],
  ['.v2-hero-assurance, .v2-quick, .v2-stories-grid > *, .v2-interior-cta-grid > *, .v2-teaser-photo-label, .v2-intro-floating, .v4-mosaic-badge','soft'],
  ['.v2-step-icon, .v2-feature-icon, .v2-content-number, .v2-about-values-grid article > span, .v2-quote-mark, .v2-safety-symbol > svg','pop'],
  ['.dc-discover .discovery-hero, .dc-matches .person-tile, .dc-member .panel, .dc-messages .conversation-row, .dc-member-detail, .v2-featured-card, .auth-visual, .auth-card, .v4-wide-story','soft'],
];
const parallaxSelector = '.v2-hero-photo, .v2-story-image, .v2-ending-image, .v2-about-image-band, .v2-intro-art > img, .v2-teaser-photo > img, .v2-interior-visual > img, .v2-stories-inspiration > img, .v4-wide-story-photo';
const reactiveSelector = '.v2-step, .v2-feature, .v2-featured-card, .v2-content-card, .v2-about-values-grid article, .v4-mosaic-card, .dc-matches .person-tile';
const clamp = (value:number,minimum:number,maximum:number)=>Math.min(maximum,Math.max(minimum,value));

export function MotionV4(){
  const pathname=usePathname();
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine=window.matchMedia('(hover: hover) and (pointer: fine)');
    const root=document.documentElement;
    let observer:IntersectionObserver|null=null;
    let mutation:MutationObserver|null=null;
    let frame=0;
    let queueFrame=0;
    let pointerFrame=0;
    let current:HTMLElement|null=null;
    const discovered=new Set<HTMLElement>();
    let parallax:HTMLElement[]=[];
    let pointerEvent:PointerEvent|null=null;

    const revealEverything=()=>{
      root.classList.remove('v4-motion-ready');
      discovered.forEach(element=>{
        element.classList.add('v4-visible');
        element.style.removeProperty('--v4-delay');
      });
      parallax.forEach(element=>element.style.removeProperty('--v4-parallax'));
      if(current){current.style.removeProperty('--v4-tilt-x');current.style.removeProperty('--v4-tilt-y');current=null;}
    };
    const inViewport=(element:HTMLElement)=>{
      const b=element.getBoundingClientRect();
      return b.top<innerHeight*.9&&b.bottom>0;
    };
    const discover=()=>{
      queueFrame=0;
      if(!observer||reduced.matches)return;
      for(const [selector,name] of effectTargets){
        document.querySelectorAll<HTMLElement>(selector).forEach(element=>{
          if(discovered.has(element)||element.closest('[aria-hidden="true"],.modal,.overlay,[hidden]'))return;
          discovered.add(element);
          element.dataset.v4Effect=name;
          const index=Array.prototype.indexOf.call(element.parentElement?.children||[],element) as number;
          element.style.setProperty('--v4-delay',`${Math.min(index%5,4)*85}ms`);
          if(inViewport(element))element.classList.add('v4-visible');
          else observer?.observe(element);
        });
      }
      parallax=Array.from(document.querySelectorAll<HTMLElement>(parallaxSelector));
      scheduleScroll();
    };
    const queueDiscover=()=>{
      if(!queueFrame)queueFrame=requestAnimationFrame(discover);
    };
    const updateScroll=()=>{
      frame=0;
      if(reduced.matches||innerWidth<768||document.hidden){
        parallax.forEach(element=>element.style.removeProperty('--v4-parallax'));
        return;
      }
      const middle=innerHeight/2;
      for(const element of parallax){
        const bounds=element.getBoundingClientRect();
        if(bounds.bottom< -140||bounds.top>innerHeight+140)continue;
        const offset=clamp((middle-(bounds.top+bounds.height/2))*.055,-26,26);
        element.style.setProperty('--v4-parallax',`${offset.toFixed(1)}px`);
      }
    };
    function scheduleScroll(){if(!frame)frame=requestAnimationFrame(updateScroll);}
    const clearPointer=()=>{
      pointerEvent=null;
      if(pointerFrame){cancelAnimationFrame(pointerFrame);pointerFrame=0;}
      if(current){current.style.removeProperty('--v4-tilt-x');current.style.removeProperty('--v4-tilt-y');current=null;}
    };
    const onPointer=(event:PointerEvent)=>{
      if(reduced.matches||!fine.matches||event.pointerType==='touch'||document.hidden)return;
      pointerEvent=event;
      if(pointerFrame)return;
      pointerFrame=requestAnimationFrame(()=>{
        pointerFrame=0;
        const latest=pointerEvent;
        if(!latest)return;
        const target=latest.target;
        if(!(target instanceof Element))return;
        const next=target.closest<HTMLElement>(reactiveSelector);
        if(current!==next){
          if(current){current.style.removeProperty('--v4-tilt-x');current.style.removeProperty('--v4-tilt-y');}
          current=next;
        }
        if(next){
          const rect=next.getBoundingClientRect();
          next.style.setProperty('--v4-tilt-y',`${clamp(((latest.clientX-rect.left)/Math.max(rect.width,1)-0.5)*10,-5,5).toFixed(2)}deg`);
          next.style.setProperty('--v4-tilt-x',`${clamp((0.5-(latest.clientY-rect.top)/Math.max(rect.height,1))*10,-5,5).toFixed(2)}deg`);
        }
      });
    };
    const onFocus=(event:FocusEvent)=>{
      (event.target as Element|null)?.closest<HTMLElement>('[data-v4-effect]')?.classList.add('v4-visible');
    };
    const onPointerOut=(event:PointerEvent)=>{if(!event.relatedTarget)clearPointer();};
    const onPreference=()=>{
      if(reduced.matches){observer?.disconnect();mutation?.disconnect();revealEverything();clearPointer();}
      else start();
    };
    function start(){
      observer?.disconnect();mutation?.disconnect();
      if(reduced.matches||!('IntersectionObserver' in window))return;
      root.classList.add('v4-motion-ready');
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          (entry.target as HTMLElement).classList.add('v4-visible');
          observer?.unobserve(entry.target);
        }
      },{rootMargin:'0px 0px -22px 0px',threshold:.07});
      discover();
      mutation=new MutationObserver(records=>{
        if(records.some(record=>Array.from(record.addedNodes).some(node=>node.nodeType===Node.ELEMENT_NODE)))queueDiscover();
      });
      mutation.observe(document.body,{subtree:true,childList:true});
    }
    start();
    window.addEventListener('scroll',scheduleScroll,{passive:true});
    window.addEventListener('resize',scheduleScroll,{passive:true});
    document.addEventListener('pointermove',onPointer,{passive:true});
    document.addEventListener('pointerout',onPointerOut,{passive:true});
    document.addEventListener('focusin',onFocus);
    reduced.addEventListener('change',onPreference);
    fine.addEventListener('change',clearPointer);
    return ()=>{
      observer?.disconnect();mutation?.disconnect();
      if(frame)cancelAnimationFrame(frame);
      if(queueFrame)cancelAnimationFrame(queueFrame);
      if(pointerFrame)cancelAnimationFrame(pointerFrame);
      window.removeEventListener('scroll',scheduleScroll);
      window.removeEventListener('resize',scheduleScroll);
      document.removeEventListener('pointermove',onPointer);
      document.removeEventListener('pointerout',onPointerOut);
      document.removeEventListener('focusin',onFocus);
      reduced.removeEventListener('change',onPreference);
      fine.removeEventListener('change',clearPointer);
      root.classList.remove('v4-motion-ready');
      discovered.forEach(el=>{delete el.dataset.v4Effect;el.classList.remove('v4-visible');el.style.removeProperty('--v4-delay');});
      parallax.forEach(el=>el.style.removeProperty('--v4-parallax'));
      clearPointer();
    };
  },[pathname]);
  return null;
}
