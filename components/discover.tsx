'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Heart, MapPin, RotateCcw, Settings2, ShieldCheck, Sparkles, Star, X, Info } from 'lucide-react';
import { request, uid, messageOf, mediaUrl } from '@/lib/api';
import type { Member, Match } from '@/lib/types';
import { Badge, Button, Empty, Failure, Loading, Modal, Avatar } from './ui';
import { useApp } from './provider';

export function Discover({go}: {go:(path:string)=>void}) {
  const {notify,me} = useApp();
  const [profiles,setProfiles] = useState<Member[]>([]);
  const [busy,setBusy] = useState(false);
  const [swipeFeedback,setSwipeFeedback] = useState<'LIKE'|'PASS'|'SUPER_LIKE'|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [idx,setIdx] = useState(0);
  const [history,setHistory] = useState<{profile:Member;matched:boolean}[]>([]);
  const [details,setDetails] = useState<Member|null>(null);
  const [reportReason,setReportReason] = useState('FAKE_PROFILE'); const [reportDetails,setReportDetails]=useState(''); const [reportOpen,setReportOpen]=useState(false);
  const [matched,setMatched] = useState<Match|null>(null);
  const [filters,setFilters] = useState(false);
  const [minAge,setMinAge] = useState(String(me?.preferences?.minAge??18));const [maxAge,setMaxAge] = useState(String(me?.preferences?.maxAge??99));const [distance,setDistance] = useState(String(me?.preferences?.maxDistanceKm??50));
  const [appliedFilters,setAppliedFilters] = useState<{minAge:string;maxAge:string;distance:string}|null>(null);
  useEffect(()=>{if(!appliedFilters){setMinAge(String(me?.preferences?.minAge??18));setMaxAge(String(me?.preferences?.maxAge??99));setDistance(String(me?.preferences?.maxDistanceKm??50))}},[me?.preferences,appliedFilters]);
  const load=useCallback(async()=>{setLoading(true);setError('');try{
    const query=appliedFilters?`?${new URLSearchParams({minAge:appliedFilters.minAge,maxAge:appliedFilters.maxAge,distanceKm:appliedFilters.distance}).toString()}`:'';
    const d=await request<{items:Member[]}>('GET',`/discovery${query}`);
    setProfiles(d?.items||[]);setIdx(0);
  } catch(e){setError(messageOf(e))}finally{setLoading(false)}},[appliedFilters]);
  useEffect(()=>{void load()},[load]);
  const profile=profiles[0];
  const swipe=async(action:'LIKE'|'PASS'|'SUPER_LIKE')=>{
    if(!profile||busy) return;
    if(profile.alreadySwiped){setProfiles(p=>p.slice(1));notify('Earlier swipe has already been recorded.');return;}
    setBusy(true);
    try{const response=await request<{isMatch?:boolean;match?:Match}>('POST','/swipes',{body:{targetUserId:profile.id,action},idempotencyKey:uid()});
      setSwipeFeedback(action);
      // Celebrate only after the server accepts the swipe; no optimistic fake match.
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise<void>(resolve=>window.setTimeout(resolve,290));
      }
      setHistory(h=>[...h,{profile,matched:Boolean(response?.isMatch)}]);setProfiles(p=>p.slice(1));setIdx(0);setSwipeFeedback(null);
      if(response?.isMatch&&response.match) setMatched(response.match);
    }catch(e){setSwipeFeedback(null);notify(messageOf(e))}finally{setBusy(false)}
  };
  const undo=async()=>{const last=history.at(-1);if(!last||last.matched)return;
    setBusy(true);
    try{const restored=await request<{restoredProfile?:Member}>('POST','/swipes/undo');setProfiles(p=>[restored?.restoredProfile||last.profile,...p]);setHistory(h=>h.slice(0,-1));notify('Last swipe undone.');}
    catch(e){notify(messageOf(e))}finally{setBusy(false)}
  };
  const showDetails=async(member:Member)=>{setDetails(member);try{const full=await request<Member>('GET',`/profiles/${member.id}`);setDetails(full)}catch(e){notify(messageOf(e))}};
  const reportUser=async()=>{if(!details)return;try{await request('POST','/reports',{body:{targetType:'USER',targetId:details.id,reason:reportReason,details:reportDetails||undefined,alsoBlock:true}});notify('Report submitted.');setReportOpen(false);setDetails(null);setProfiles(p=>p.filter(x=>x.id!==details.id));}catch(e){notify(messageOf(e))}};
  const block=async()=>{if(!details||!confirm(`Block ${details.displayName}?`))return;try{await request('POST',`/users/${details.id}/block`);notify('Member blocked.');setProfiles(p=>p.filter(x=>x.id!==details.id));setDetails(null)}catch(e){notify(messageOf(e))}};
  const photos=profile?.photos||[];
  return <div className="discover-page">
    <div className="page-heading"><div><span className="overline purple"><Sparkles size={14}/> YOUR NEXT CONNECTION</span><h1>Discover people<span className="title-dot">.</span></h1><p>Someone amazing could be one swipe away.</p></div><Button tone="outline" onClick={()=>setFilters(true)}><Settings2 size={16}/> Preferences</Button></div>
    <div className="discover-columns">
      <div className="discover-main">
        {loading?<div className="v2-discover-skeleton" role="status" aria-label="Finding people for you"><div className="v2-skeleton v2-skeleton-hero"/><div className="v2-skeleton v2-skeleton-line"/><div className="v2-skeleton v2-skeleton-actions"/><span className="sr-only">Finding people for you...</span></div>:error?<Failure error={error} retry={()=>void load()}/> : !profile?<Empty title="You're all caught up" detail="No more profiles fit your preferences right now. Try widening your search or check again later." icon={<Heart size={28}/>}/>:<>
          <div className="discover-topline"><span className="presence-dot"/> <strong>Discover</strong><span className="muted">Real people. Real possibilities.</span><Badge>{profile.isVerified?'Verified profile':'Meet someone new'}</Badge></div>
          <div className="discovery-hero" data-swipe-feedback={swipeFeedback||undefined}>
            {photos[idx] && <img key={photos[idx].url} className="discovery-photo" alt={`${profile.displayName}'s profile`} src={mediaUrl(photos[idx].url)} />}
            <div className="photo-shade"/><div className="photo-count">{photos.map((_,i)=><span key={i} className={i===idx?'active':''}/>)}</div>
            {photos.length>1&&<><button className="image-arrow left" onClick={()=>setIdx(i=>(i-1+photos.length)%photos.length)} aria-label="Previous photo"><ArrowLeft/></button><button className="image-arrow right" onClick={()=>setIdx(i=>(i+1)%photos.length)} aria-label="Next photo"><ArrowRight/></button></>}
            <div className="discover-bio"><div className="profile-name"><h2>{profile.displayName}{profile.age?`, ${profile.age}`:''}</h2>{profile.isVerified&&<ShieldCheck size={24} className="blue"/>}</div>
              <p className="location"><MapPin size={16}/>{[profile.city,profile.distanceKm?`${profile.distanceKm} km away`:null].filter(Boolean).join(' · ') || 'Location private'}</p>
              {profile.bio&&<p className="profile-blurb">{profile.bio}</p>}
              <div className="tag-line">{(profile.interests||[]).slice(0,5).map(item=><span key={item}>{item}</span>)}</div>
            </div>
          </div>
          <div className="swipe-controls"><button disabled={!history.length||history.at(-1)?.matched||busy} className="swipe undo" onClick={()=>void undo()} title="Undo last swipe" aria-label="Undo last swipe"><RotateCcw size={21}/></button>
            <button disabled={busy} className="swipe pass" onClick={()=>void swipe('PASS')} title="Pass" aria-label="Pass on member"><X size={29}/></button>
            <button disabled={busy} className="swipe super" onClick={()=>void swipe('SUPER_LIKE')} title="Super like" aria-label="Super like member"><Star size={23} fill="currentColor"/></button>
            <button disabled={busy} className="swipe like" onClick={()=>void swipe('LIKE')} title="Like" aria-label="Like member"><Heart size={30} fill="currentColor"/></button>
            <button className="swipe info" onClick={()=>void showDetails(profile)} title="View full profile" aria-label="View full member profile"><Info size={22}/></button></div>
        </>}
      </div>
      <aside className="discover-aside"><div className="aside-feature"><div className="purple-icon"><Heart fill="currentColor" size={24}/></div><h3>Make your first move</h3><p>Swipe right to like, or use the star to send a super like. It's a match when you both like each other.</p><Button tone="light" onClick={()=>go('/matches')}>Explore matches <ArrowRight size={16}/></Button></div>
        <div className="panel mini-advice"><span className="overline">DATING CLOUD TIP</span><h3>Great profiles make great first impressions.</h3><p>Share your interests and choose clear photos to show your authentic self.</p><Button tone="outline" onClick={()=>go('/profile')}>Improve my profile</Button></div>
      </aside>
    </div>
    {details&&!reportOpen&&<Modal title={`${details.displayName}'s profile`} onClose={()=>setDetails(null)}><div className="profile-modal-gallery">{details.photos?.map((p,i)=><img key={i} alt={`Profile photo ${i+1}`} src={mediaUrl(p.url)}/>)}</div><p>{details.bio||'No bio added.'}</p><p className="muted">{details.occupation||''} · {details.city||'Location private'}</p><div className="tag-line dark">{details.interests?.map(x=><span key={x}>{x}</span>)}</div><div className="setting-actions"><Button tone="outline" onClick={()=>setReportOpen(true)}>Report profile</Button><Button tone="danger" onClick={()=>void block()}>Block member</Button></div></Modal>}
    {reportOpen&&<Modal title="Report profile" onClose={()=>setReportOpen(false)}><div className="stack"><label>Reason<select value={reportReason} onChange={e=>setReportReason(e.target.value)}>{['FAKE_PROFILE','INAPPROPRIATE_PHOTOS','HARASSMENT','SPAM_OR_SCAM','UNDERAGE','OFFLINE_BEHAVIOUR','OTHER'].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label><label>Additional details<textarea value={reportDetails} maxLength={1000} onChange={e=>setReportDetails(e.target.value)}/></label><p className="muted">Submitting a report also blocks this member.</p><Button tone="danger" onClick={()=>void reportUser()}>Submit report</Button></div></Modal>}
    {matched&&<Modal title="It's a match! 💗" onClose={()=>setMatched(null)}><div className="match-success v3-match-celebration"><div className="v3-confetti" aria-hidden="true">{Array.from({length:12},(_,i)=><span key={i}>♥</span>)}</div><Avatar user={matched.otherUser} size={104}/><h2>You and {matched.otherUser.displayName} like each other!</h2><p>Time to say hello.</p><Button onClick={()=>{setMatched(null);go(matched.conversationId?`/messages/${encodeURIComponent(matched.conversationId)}`:'/messages')}}>Go to messages <ArrowRight size={16}/></Button><Button tone="outline" onClick={()=>setMatched(null)}>Keep discovering</Button></div></Modal>}
    {filters&&<Modal title="Discovery preferences" onClose={()=>setFilters(false)}><div className="form-grid"><label>Minimum age<input type="number" min={18} max={99} value={minAge} onChange={e=>setMinAge(e.target.value)}/></label><label>Maximum age<input type="number" min={18} max={99} value={maxAge} onChange={e=>setMaxAge(e.target.value)}/></label><label className="wide">Distance (km)<input type="number" min={1} max={500} value={distance} onChange={e=>setDistance(e.target.value)}/></label></div><Button className="full" onClick={()=>{if(!Number.isInteger(Number(minAge))||!Number.isInteger(Number(maxAge))||Number(minAge)<18||Number(maxAge)>99||Number(minAge)>Number(maxAge)){notify('Choose an age range between 18 and 99.');return;}if(!Number.isInteger(Number(distance))||Number(distance)<1||Number(distance)>500){notify('Distance must be between 1 and 500 km.');return;}setAppliedFilters({minAge,maxAge,distance});setFilters(false)}}>Apply filters</Button></Modal>}
  </div>;
}
