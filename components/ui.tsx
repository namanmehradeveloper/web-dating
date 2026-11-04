'use client';
import { AlertCircle, Heart, MapPin, ShieldCheck, X, LoaderCircle } from 'lucide-react';
import type { Member } from '@/lib/types';
import { mediaUrl } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
export function Avatar({user, size = 46}: { user?: Partial<Member> | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = mediaUrl(user?.photos?.[0]?.url);
  useEffect(()=>setBroken(false),[src]);
  return <span className="avatar" style={{width:size,height:size,fontSize:Math.round(size*.4)}}>
    {src && !broken ? <img alt={user?.displayName ? `${user.displayName} avatar` : ''} src={src} onError={()=>setBroken(true)} /> : <span>{(user?.displayName || '?').slice(0,1).toUpperCase()}</span>}
  </span>;
}
export function Button({children, tone='primary', className='', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {tone?: 'primary'|'outline'|'quiet'|'danger'|'light'}) {
  return <button {...props} className={`button ${tone} ${className}`}>{children}</button>;
}
export function Panel({title, subtitle, children, aside}: {title?: string; subtitle?: string; children: React.ReactNode; aside?: React.ReactNode}) {
  return <section className="panel"><div className="panel-heading">{title && <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>}{aside}</div>{children}</section>;
}
export function Empty({title, detail, icon}: {title:string; detail:string; icon?:React.ReactNode}) {
  return <div className="empty"><div className="empty-icon">{icon || <Heart size={25}/>}</div><h3>{title}</h3><p>{detail}</p></div>;
}
export function Loading({label='Loading...'}: {label?:string}) { return <div className="loading"><LoaderCircle className="spin" size={20}/>{label}</div>; }
export function Failure({error, retry}: {error:string; retry?:()=>void}) {return <div className="failure"><AlertCircle size={18}/><span>{error}</span>{retry && <Button tone="outline" onClick={retry}>Retry</Button>}</div>}
export function UserPill({member}: {member: Member}) {return <div className="member-pill"><Avatar user={member} size={42}/><div><strong>{member.displayName}{member.age ? `, ${member.age}`:''}</strong><span><MapPin size={12}/>{member.city || 'Location not shared'}</span></div>{member.isVerified && <ShieldCheck size={16} className="purple"/>}</div>}
export function Modal({title, onClose, children}: {title:string;onClose:()=>void;children:React.ReactNode}) {
  const dialog=useRef<HTMLElement>(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previousFocus=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const node=dialog.current;
    const selector='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
    const focusables=()=>Array.from(node?.querySelectorAll<HTMLElement>(selector)||[]).filter(el=>el.getClientRects().length>0);
    (focusables()[0]||node)?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const items=focusables();const first=items[0];const last=items.at(-1);
        if(!first){event.preventDefault();node?.focus();return;}
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);previousFocus?.focus();};
  },[]);
  return <div className="overlay" role="presentation" onMouseDown={e => {if(e.target===e.currentTarget) onClose()}}><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></div>{children}</section></div>;
}
export function Badge({children, kind='purple'}: {children:React.ReactNode;kind?:'purple'|'green'|'red'|'gray'|'orange'}) {return <span className={`badge ${kind}`}>{children}</span>}
