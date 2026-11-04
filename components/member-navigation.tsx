'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Compass,Heart,MessageCircle,UserRound,Bell,Settings,Crown,LifeBuoy} from 'lucide-react';
const links=[
  {url:'/discover',label:'Discover',icon:Compass},{url:'/matches',label:'Matches',icon:Heart},
  {url:'/messages',label:'Messages',icon:MessageCircle},{url:'/profile',label:'My profile',icon:UserRound},
  {url:'/notifications',label:'Updates',icon:Bell},{url:'/premium',label:'Plus',icon:Crown},
  {url:'/help',label:'Help',icon:LifeBuoy},{url:'/account',label:'Settings',icon:Settings}
];
export function MemberNavigation(){
 const pathname=usePathname();
 return <nav className="v5-member-nav" aria-label="Member area">{links.map(({url,label,icon:Icon})=>{
  const active=pathname===url||pathname.startsWith(url+'/');
  return <Link key={url} href={url} aria-current={active?'page':undefined} className={active?'active':''}><Icon size={16}/><span>{label}</span></Link>;
 })}</nav>;
}
