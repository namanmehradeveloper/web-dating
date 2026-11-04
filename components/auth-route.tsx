'use client';
import {Suspense,useEffect} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {useApp} from './provider';
import {Auth} from './auth';import {Loading} from './ui';
function View({signup}:{signup:boolean}){const {session,ready}=useApp();const router=useRouter();const query=useSearchParams();const next=query.get('next');const destination=next?.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')&&!/^\/(login|signup)([/?#]|$)/.test(next)?next:'/discover';useEffect(()=>{if(ready&&session)router.replace(destination)},[ready,session,destination,router]);if(!ready||session)return <div className="dc-wait"><Loading/></div>;return <main id="main-content"><Auth initialMode={signup?'register':'phone'}/></main>}
export function AuthRoute({signup=false}:{signup?:boolean}){return <Suspense fallback={<Loading/>}><View signup={signup}/></Suspense>}
