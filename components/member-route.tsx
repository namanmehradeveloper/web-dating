'use client';
import {Suspense,useCallback,useEffect} from 'react';
import {useRouter,usePathname,useSearchParams} from 'next/navigation';
import {useApp} from './provider';
import {Button,Loading} from './ui';
import {Discover} from './discover';import {Matches} from './matches';import {Chat} from './chat';import {Profile} from './profile';import {Onboarding} from './onboarding';import {Account,Help,LoginActivity,Notifications,Premium} from './extras';
import {MemberDetail} from './member-detail';
type Section='discover'|'matches'|'messages'|'profile'|'notifications'|'premium'|'help'|'account'|'security'|'member';
function View({section,memberId}:{section:Section;memberId?:string}){
  const {session,ready,me,meStatus,reloadMe,signOut}=useApp();
  const router=useRouter();
  const pathname=usePathname();
  const query=useSearchParams();
  useEffect(()=>{
    if(ready&&!session){
      const next=pathname+(query.toString()?`?${query.toString()}`:'');
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  },[ready,session,pathname,query,router]);
  const go=useCallback((url:string)=>{router.push(url)},[router]);
  if(!ready||!session)return <div className="dc-wait"><Loading label="Opening Dating Cloud…"/></div>;
  if(!me&&meStatus==='error')return <div className="dc-wait"><div><h2>Unable to load your profile</h2><p>We couldn’t connect. Please try again in a moment.</p><Button onClick={()=>void reloadMe()}>Retry</Button> <Button tone="outline" onClick={()=>void signOut()}>Sign out</Button></div></div>;
  if(!me)return <div className="dc-wait"><Loading label="Loading your profile…"/></div>;
  if(!me.onboardingComplete)return <Onboarding/>;
  return <main id="main-content" className={`dc-member dc-${section}${section==='messages'?' dc-member-messages':''}`}>
    {section==='discover'?<Discover go={go}/>:section==='matches'?<Matches go={go}/>:section==='messages'?<Chat go={go}/>:section==='profile'?<Profile go={go}/>:section==='notifications'?<Notifications/>:section==='premium'?<Premium/>:section==='help'?<Help/>:section==='account'?<Account/>:section==='security'?<LoginActivity/>:section==='member'&&memberId?<MemberDetail id={memberId} go={go}/>:null}
  </main>;
}
export function MemberRoute(props:{section:Section;conversationId?:string;memberId?:string}){
  return <Suspense fallback={<div className="dc-wait"><Loading/></div>}><View section={props.section} memberId={props.memberId}/></Suspense>;
}
