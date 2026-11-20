'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, ArrowRight, LockKeyhole, Star, MessageCircleHeart, Ban, HeartOff } from 'lucide-react';
import { ApiFailure, request, uid, messageOf, mediaUrl } from '@/lib/api';
import { fetchLikesReceived, fetchLikesSent, fetchMatches } from '@/lib/query/fetchers';
import { invalidateAfterLikeCancel, invalidateAfterSwipeOrMatch } from '@/lib/query/invalidation';
import { queryKeys } from '@/lib/query/keys';
import { cachePolicies } from '@/lib/query/policies';
import type { Like, Match } from '@/lib/types';
import { UserPill, Button, Empty, Failure, Modal } from './ui';
import { useApp } from './provider';

type MatchTab = 'matches' | 'received' | 'sent';

function tabFromQuery(value: string | null): MatchTab {
  if (value === 'received' || value === 'sent' || value === 'matches') return value;
  return 'matches';
}

export function Matches({go}: {go:(p:string)=>void}) {
 const {toast,confirmAction,session}=useApp();
 const queryClient = useQueryClient();
 const router = useRouter();
 const searchParams = useSearchParams();
 const userId = session?.userId || '';
 const [active,setActive]=useState<MatchTab>(() => tabFromQuery(searchParams.get('tab')));
 const [more,setMore]=useState<Match|null>(null);
 const [likeBusy,setLikeBusy]=useState<string|null>(null);
 const [cancelTarget,setCancelTarget]=useState<Like|null>(null);
 const [cancelBusy,setCancelBusy]=useState(false);

 const setTab = (tab: MatchTab) => {
   setActive(tab);
   const params = new URLSearchParams(searchParams.toString());
   if (tab === 'matches') params.delete('tab');
   else params.set('tab', tab);
   const qs = params.toString();
   router.replace(qs ? `/matches?${qs}` : '/matches', { scroll: false });
 };

 const matchesQuery = useQuery({
   queryKey: queryKeys.matches.list(userId),
   queryFn: fetchMatches,
   enabled: Boolean(userId),
   staleTime: cachePolicies.matches.staleTime,
   gcTime: cachePolicies.matches.gcTime,
 });
 const receivedQuery = useQuery({
   queryKey: queryKeys.likes.received(userId),
   queryFn: fetchLikesReceived,
   enabled: Boolean(userId),
   staleTime: cachePolicies.likes.staleTime,
   gcTime: cachePolicies.likes.gcTime,
   retry: (count, err) => {
     if (err instanceof ApiFailure && err.code === 'SUBSCRIPTION_REQUIRED') return false;
     return count < 2;
   },
 });
 const sentQuery = useQuery({
   queryKey: queryKeys.likes.sent(userId),
   queryFn: fetchLikesSent,
   enabled: Boolean(userId),
   staleTime: cachePolicies.likes.staleTime,
   gcTime: cachePolicies.likes.gcTime,
 });

 useEffect(() => { setActive(tabFromQuery(searchParams.get('tab'))); }, [searchParams]);

 const matches = matchesQuery.data?.items || [];
 const received = receivedQuery.data?.items || [];
 const sent = sentQuery.data?.items || [];
 const locked = receivedQuery.error instanceof ApiFailure && receivedQuery.error.code === 'SUBSCRIPTION_REQUIRED';
 const loading = matchesQuery.isPending && !matchesQuery.data;
 const error = matchesQuery.isError ? messageOf(matchesQuery.error) : '';

 const refreshAll = () => {
   if (!userId) return;
   void queryClient.invalidateQueries({ queryKey: queryKeys.matches.all(userId) });
   void queryClient.invalidateQueries({ queryKey: queryKeys.likes.all(userId) });
 };

 async function likeBack(id:string){
  if(likeBusy) return;
  setLikeBusy(id);
  try{
   const response=await request<{isMatch?:boolean;match?:Match}>('POST','/swipes',{body:{targetUserId:id,action:'LIKE'},idempotencyKey:uid()});
   toast.success(response?.isMatch?'It\'s a match!':'Like sent!');
   if (userId) invalidateAfterSwipeOrMatch(userId, queryClient);
  }catch(e){toast.error(messageOf(e))}
  finally{setLikeBusy(null)}
 }
 async function unmatch(match:Match){
  const ok=await confirmAction({
    title:`Unmatch ${match.otherUser.displayName}?`,
    message:`Remove your match with ${match.otherUser.displayName}? You can still discover each other later.`,
    confirmLabel:'Unmatch',
    danger:true,
  });
  if(!ok)return;
  try{
    await request('POST',`/matches/${match.id}/unmatch`);
    setMore(null);
    toast.success('Match removed.');
    if (userId) invalidateAfterSwipeOrMatch(userId, queryClient);
  }catch(e){toast.error(messageOf(e))}
 }
 async function confirmCancelLike(){
  if(!cancelTarget||cancelBusy) return;
  const targetId=cancelTarget.user.id;
  const wasSuper=cancelTarget.action==='SUPER_LIKE';
  setCancelBusy(true);
  try{
   await request('POST',`/likes/sent/${encodeURIComponent(targetId)}/cancel`);
   if (userId) {
     queryClient.setQueryData(queryKeys.likes.sent(userId), (prev: { items: Like[] } | undefined) => {
       if (!prev) return prev;
       return { ...prev, items: (prev.items || []).filter((item) => item.user.id !== targetId) };
     });
     invalidateAfterLikeCancel(userId, queryClient);
   }
   setCancelTarget(null);
   toast.success(wasSuper?'Super like canceled.':'Like canceled.');
  }catch(e){
   toast.error(messageOf(e));
   refreshAll();
  }finally{setCancelBusy(false)}
 }
 return <div><div className="page-heading"><div><span className="overline purple">CONNECTIONS</span><h1>Matches & likes<span className="title-dot">.</span></h1><p>Every great conversation starts with a spark.</p></div></div>
  <div className="section-tabs"><button className={active==='matches'?'current':''} onClick={()=>setTab('matches')}>Your matches <span>{matches.length}</span></button><button className={active==='received'?'current':''} onClick={()=>setTab('received')}>Liked you <Heart size={14}/></button><button className={active==='sent'?'current':''} onClick={()=>setTab('sent')}>Likes sent</button></div>
  {loading?<div className="v2-match-skeleton" role="status" aria-label="Loading matches">{[0,1,2,3].map(i=><div className="v2-skeleton" key={i}/>)}<span className="sr-only">Loading your matches...</span></div>:error&&active==='matches'?<Failure error={error} retry={refreshAll}/>:active==='matches'?<>{matches.length?<div className="match-cards">{matches.map(match=><article key={match.id} className="person-tile"><div className="portrait-placeholder">{match.otherUser.photos?.[0]?.url?<img src={mediaUrl(match.otherUser.photos[0].url)} alt={match.otherUser.displayName}/>:<Heart size={46}/>}</div><div className="person-details"><button className="dc-profile-link" aria-label={`View ${match.otherUser.displayName} profile`} onClick={()=>go(`/members/${encodeURIComponent(match.otherUser.id)}`)}><UserPill member={match.otherUser}/></button><div className="person-actions"><Button onClick={()=>go(match.conversationId?`/messages/${encodeURIComponent(match.conversationId)}`:'/messages')}><MessageCircleHeart size={16}/> Message</Button><Button tone="outline" aria-label={`Manage match with ${match.otherUser.displayName}`} onClick={()=>setMore(match)}>•••</Button></div></div></article>)}</div>:<Empty title="No matches yet" detail="When two people like each other, the magic begins here."/>}</>:
  active==='received'?locked?<div className="premium-lock"><LockKeyhole size={35}/><h2>Someone might be waiting for you.</h2><p>See who likes you with a Plus subscription, or keep discovering for free.</p><Button onClick={()=>go('/premium')}>Explore premium <Star size={16}/></Button></div>:received.length?<div className="people-list">{received.map((like,i)=><div key={like.user?.id||like.id||i} className="person-row"><UserPill member={like.user}/><span className="muted">{like.action==='SUPER_LIKE'?'★ Super like':'♥ Like'}</span><Button disabled={likeBusy===like.user.id} onClick={()=>void likeBack(like.user.id)}>Like back <Heart size={15}/></Button></div>)}</div>:<Empty title="No new likes" detail="Check back soon or keep swiping to discover someone new."/>:
  sent.length?<div className="people-list">{sent.map((like,i)=><div className="person-row" key={like.id||like.user?.id||i}><UserPill member={like.user}/><span className="muted">{like.action==='SUPER_LIKE'?'★ Super like':'♥ Like'} · {like.likedAt?new Date(like.likedAt).toLocaleDateString():''}</span><Button tone="outline" disabled={cancelBusy} aria-label={`Cancel like for ${like.user.displayName}`} onClick={()=>{if(!cancelBusy)setCancelTarget(like)}}><HeartOff size={15}/> Unlike</Button></div>)}</div>:<Empty title="No outgoing likes" detail="Send a like to someone who catches your eye."/>}
  <div className="bottom-prompt"><Heart size={22}/><div><strong>Your next connection is waiting.</strong><p>Keep exploring to meet more people.</p></div><Button onClick={()=>go('/discover')}>Discover <ArrowRight size={16}/></Button></div>
  {more&&<Modal title={`Manage your match with ${more.otherUser.displayName}`} onClose={()=>setMore(null)}><div className="stack"><Button tone="danger" onClick={()=>void unmatch(more)}><Ban size={15}/> Unmatch</Button><p className="muted">To block or report a user, open the conversation and choose Safety actions.</p></div></Modal>}
  {cancelTarget&&<Modal title={`Cancel ${cancelTarget.action==='SUPER_LIKE'?'super like':'like'}?`} onClose={()=>!cancelBusy&&setCancelTarget(null)}><div className="stack"><p>Withdraw your {cancelTarget.action==='SUPER_LIKE'?'super like':'like'} for <strong>{cancelTarget.user.displayName}</strong>? They will no longer see it in Liked you.</p><p className="muted">This does not restore swipe undo or daily like quota. If you already matched, unmatch from Your matches instead.</p><div className="setting-actions"><Button tone="outline" disabled={cancelBusy} onClick={()=>setCancelTarget(null)}>Keep like</Button><Button tone="danger" disabled={cancelBusy} onClick={()=>void confirmCancelLike()}><HeartOff size={15}/> {cancelBusy?'Canceling…':'Cancel like'}</Button></div></div></Modal>}
 </div>;
}
