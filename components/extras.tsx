'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { BellRing, Crown, ShieldCheck, Ban, LogOut, AlertTriangle, Shield, ChevronRight, MapPin, Monitor, UserRound, Database, LifeBuoy, Mail, Phone } from 'lucide-react';
import { useApp } from './provider';
import { request,messageOf } from '@/lib/api';
import type {Notification,Product,Entitlement,Member,Ticket} from '@/lib/types';
import { Avatar,Button,Panel,Loading,Empty,Badge,Failure } from './ui';
function useGet<T>(path:string) {const [data,setData]=useState<T|null>(null);const [loading,setLoading]=useState(true);const[error,setError]=useState('');const refresh=async()=>{setLoading(true);setError('');try{setData(await request<T>('GET',path))}catch(e){setError(messageOf(e))}finally{setLoading(false)}};useEffect(()=>{void refresh()},[path]);return {data,loading,error,refresh}}
export function Notifications(){const {notify}=useApp();const {data,loading,error,refresh}=useGet<{items:Notification[]}>('/notifications?limit=50');const prefs=useGet<Record<string,boolean>>('/notification-preferences');
 const change=async(key:string,v:boolean)=>{try{await request('PATCH','/notification-preferences',{body:{[key]:v}});void prefs.refresh()}catch(e){notify(messageOf(e))}};
 const read=async(id:string)=>{try{await request('POST',`/notifications/${id}/read`);void refresh()}catch(e){notify(messageOf(e))}};
 return <div><Heading label="STAY IN THE LOOP" title="Notifications" description="Never miss a connection."/><div className="two-panel"><Panel title="Your notifications" subtitle="All the latest updates in one place.">{loading?<Loading/>:error?<p className="field-error">{error}</p>:data?.items?.length?data.items.map(n=><button key={n.id} className={`notification-row ${!n.isRead&&!n.readAt?'unread':''}`} onClick={()=>void read(n.id)}><span className="notification-icon"><BellRing size={18}/></span><span><strong>{n.title||n.type||'Notification'}</strong><small>{n.body||n.message||''}</small><small>{n.createdAt?new Date(n.createdAt).toLocaleString():''}</small></span>{!n.isRead&&!n.readAt&&<span className="notification-dot"/>}</button>):<Empty title="All caught up" detail="Your notifications will appear here."/>}</Panel>
 <Panel title="Notification preferences" subtitle="Choose which updates to receive.">{prefs.loading?<Loading/>:['newMatches','messages','likes','promotions'].map(k=><label key={k} className="setting-row"><span><strong>{({newMatches:'New matches',messages:'Messages',likes:'Likes',promotions:'Offers and updates'} as Record<string,string>)[k]}</strong></span><input type="checkbox" checked={Boolean(prefs.data?.[k])} onChange={e=>void change(k,e.target.checked)} disabled={!prefs.data}/></label>)}</Panel></div></div>
}
export function Premium(){
  const {notify}=useApp();
  const plans=useGet<{items:Product[];billing?:{configured?:boolean;provider?:string}}>('/subscriptions/products');
  const entitlement=useGet<Entitlement>('/subscriptions/entitlement');
  const history=useGet<{items:import('@/lib/types').PaymentHistoryItem[]}>('/subscriptions/history?limit=10');
  const [busyId,setBusyId]=useState('');
  const billing=plans.data?.billing;
  const isPlus=Boolean(entitlement.data?.isActive&&entitlement.data?.tier==='PLUS');

  const refreshAll=async()=>{await Promise.all([plans.refresh(),entitlement.refresh(),history.refresh()])};

  const buy=async(productId:string,outcome:'SUCCESS'|'FAILURE')=>{
    setBusyId(`${productId}:${outcome}`);
    try{
      const checkout=await request<import('@/lib/types').CheckoutSession>('POST','/subscriptions/checkout',{body:{productId,platform:'WEB',idempotencyKey:crypto.randomUUID()}});
      const result=await request<{entitlement:Entitlement;payment:{status:string;isDemo?:boolean}}>('POST','/subscriptions/verify',{body:{checkoutId:checkout.checkoutId,providerProof:{outcome}}});
      if(result.payment.status==='SUCCEEDED')notify(result.payment.isDemo?'Demo Plus activated.':'Plus activated.');
      else notify('Payment failed. You were not charged.');
      await refreshAll();
    }catch(e){notify(messageOf(e))}
    finally{setBusyId('')}
  };

  const cancel=async()=>{
    setBusyId('cancel');
    try{await request('POST','/subscriptions/cancel',{body:{}});notify('Auto-renew turned off. Plus stays active until it expires.');await refreshAll()}
    catch(e){notify(messageOf(e))}
    finally{setBusyId('')}
  };

  return <div>
    <Heading label="MORE WAYS TO CONNECT" title="Dating Cloud Plus" description="Unlock more possibilities with premium features."/>
    <div className="premium-hero"><Crown size={32}/><span>ENJOY MORE CONNECTIONS</span><h2>Love the possibilities.</h2>
      <p>{billing?.configured?`Payments run through the ${billing.provider||'configured'} provider. Demo charges are simulated and never real money.`:'Billing is not configured on this server yet.'}</p>
    </div>
    <div className="plan-grid">{plans.loading?<Loading/>:plans.error?<p className="field-error">{plans.error}</p>:plans.data?.items.map(p=>
      <section key={p.id} className="price-card"><Crown size={23}/><h2>{p.title}</h2><p>{p.description}</p>
        <h3>{p.priceLabel||'See store price'}<small>{p.period?` / ${p.period.toLowerCase()}`:''}</small></h3>
        {billing?.configured&&billing.provider==='demo'?<div className="stack">
          <Button disabled={Boolean(busyId)} className="full" onClick={()=>void buy(p.id,'SUCCESS')}>{busyId===`${p.id}:SUCCESS`?'Activating…':'Simulate successful purchase'}</Button>
          <Button tone="outline" disabled={Boolean(busyId)} className="full" onClick={()=>void buy(p.id,'FAILURE')}>{busyId===`${p.id}:FAILURE`?'Simulating…':'Simulate failed purchase'}</Button>
        </div>:<Button disabled className="full">Purchases unavailable</Button>}
      </section>
    )}</div>
    <div className="notice-line"><Shield size={20}/><div>
      <strong>Current membership: {entitlement.data?.tier||'Free'}{isPlus?' · Active':''}</strong>
      <p>{isPlus?`Renews: ${entitlement.data?.willRenew?'yes':'no'}${entitlement.data?.expiresAt?` · Expires ${new Date(entitlement.data.expiresAt).toLocaleString()}`:''}${entitlement.data?.provider?` · Provider ${entitlement.data.provider}`:''}${entitlement.data?.environment==='demo'?' · DEMO':''}`:'Choose a plan above to unlock unlimited likes, see who likes you, and undo.'}</p>
      {isPlus&&entitlement.data?.willRenew?<Button tone="outline" disabled={busyId==='cancel'} onClick={()=>void cancel()}>{busyId==='cancel'?'Cancelling…':'Cancel auto-renew'}</Button>:null}
    </div></div>
    <Panel title="Payment history" subtitle="Server-verified transactions for this account.">
      {history.loading?<Loading/>:history.error?<p className="field-error">{history.error}</p>:history.data?.items?.length?history.data.items.map(item=>
        <div key={item.id} className="setting-row">
          <span><strong>{item.productId}</strong><small className="muted"> · {item.status}{item.isDemo?' · DEMO':''} · {(item.amountMinor/100).toLocaleString(undefined,{style:'currency',currency:item.currency||'INR'})}</small></span>
          <small className="muted">{item.createdAt?new Date(item.createdAt).toLocaleString():''}</small>
        </div>
      ):<Empty title="No payments yet" detail="Successful and failed checkouts will appear here."/>}
    </Panel>
  </div>;
}
export function Help(){const {notify}=useApp();const faqs=useGet<{items:{id?:string;question:string;answer:string}[]}>('/support/faqs');const [category,setCategory]=useState('ACCOUNT');const[subject,setSubject]=useState('');const[body,setBody]=useState('');const [sending,setSending]=useState(false);const[tickets,setTickets]=useState<Ticket[]>([]);const{session}=useApp();
 useEffect(()=>{if(!session)return;let keys:string[]=[];try{keys=JSON.parse(localStorage.getItem(`dating_tickets_${session.userId}`)||'[]')}catch{};void Promise.all(keys.map(id=>request<Ticket>('GET',`/support/tickets/${id}`).catch(()=>null))).then(rows=>setTickets(rows.filter((x):x is Ticket=>Boolean(x))))},[session?.userId]);
 const send=async()=>{setSending(true);try{const t=await request<Ticket>('POST','/support/tickets',{body:{category,subject,message:body}});notify('Support ticket created.');if(session){const k=`dating_tickets_${session.userId}`;let ids:string[]=[];try{ids=JSON.parse(localStorage.getItem(k)||'[]')}catch{};localStorage.setItem(k,JSON.stringify([t.id,...ids].slice(0,25)))}setTickets(p=>[t,...p]);setBody('');setSubject('')}catch(e){notify(messageOf(e))}finally{setSending(false)}};
 return <div><Heading label="WE'RE HERE TO HELP" title="Help & support" description="Need something? Let's sort it out."/><div className="two-panel"><Panel title="Frequently asked questions" subtitle="Quick answers to common questions.">{faqs.loading?<Loading/>:faqs.data?.items.map((faq,i)=><details key={faq.id||i} className="faq"><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}{!faqs.loading&&!faqs.data?.items?.length&&<Empty title="No FAQs yet" detail="Please submit a ticket for help."/>}</Panel>
 <Panel title="Contact support" subtitle="Tell us what happened and we'll help."><div className="stack"><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{['ACCOUNT','BILLING','SAFETY','BUG','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label><label>Subject<input minLength={3} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What's going on?"/></label><label>Message<textarea minLength={10} maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Tell us more..."/></label><Button disabled={sending||subject.trim().length<3||body.trim().length<10} onClick={()=>void send()}>Send support request</Button></div></Panel></div>
 <Panel title="Your tickets" subtitle="Tickets sent from this browser.">{tickets.length?tickets.map(t=><div key={t.id} className="ticket-row"><div><strong>{t.subject}</strong><p className="muted">{t.category} · {new Date(t.createdAt).toLocaleDateString()}</p></div><Badge>{t.status}</Badge><details><summary>Read updates</summary>{t.messages?.map((m,i)=><p key={i}>{m.author}: {m.body}</p>)}</details></div>):<Empty title="No tickets" detail="Your support requests will appear here after you submit one."/>}</Panel></div>
}
type LoginActivityEntry={id:string;ipAddress?:string|null;country?:string|null;state?:string|null;city?:string|null;deviceName:string;deviceType:string;browser:string;operatingSystem:string;loginAt:string};
type LoginActivityPage={items:LoginActivityEntry[];nextCursor?:string|null};
export function LoginActivity(){const [items,setItems]=useState<LoginActivityEntry[]>([]);const[cursor,setCursor]=useState<string|null>(null);const[loading,setLoading]=useState(true);const[loadingMore,setLoadingMore]=useState(false);const[error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');void request<LoginActivityPage>('GET','/profile/login-activity?limit=20').then(page=>{if(active){setItems(page.items);setCursor(page.nextCursor||null)}}).catch(e=>{if(active)setError(messageOf(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const loadMore=async()=>{if(!cursor||loadingMore)return;setLoadingMore(true);setError('');try{const page=await request<LoginActivityPage>('GET',`/profile/login-activity?limit=20&cursor=${encodeURIComponent(cursor)}`);setItems(current=>[...current,...page.items]);setCursor(page.nextCursor||null)}catch(e){setError(messageOf(e))}finally{setLoadingMore(false)}};
 return <div><Heading label="SECURITY" title="Login Activity" description="Review recent sign-ins to your account."/><div className="security-back"><Link href="/account" className="button outline">Back to Settings</Link></div><Panel title="Recent sign-ins" subtitle="Only you can see your login activity. Times are shown in UTC.">{loading?<Loading/>:error&&!items.length?<Failure error={error} retry={()=>{setLoading(true);void request<LoginActivityPage>('GET','/profile/login-activity?limit=20').then(page=>{setItems(page.items);setCursor(page.nextCursor||null);setError('')}).catch(e=>setError(messageOf(e))).finally(()=>setLoading(false))}}/>:items.length?<div className="login-history-list">{items.map(entry=>{const location=[entry.city,entry.state,entry.country].filter(Boolean).join(', ');return <article key={entry.id} className="login-history-entry"><div className="login-history-entry__top"><strong>{new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'}).format(new Date(entry.loginAt))}</strong><span>{entry.ipAddress||'IP unavailable'}</span></div><div className="login-history-entry__details"><span><MapPin size={15}/>{location||'Location unavailable'}</span><span><Monitor size={15}/>{entry.deviceName} · {entry.deviceType.toLowerCase()}</span><span><ShieldCheck size={15}/>{entry.browser} · {entry.operatingSystem}</span></div></article>})}</div>:<Empty title="No login activity yet" detail="Successful sign-ins will appear here."/>}{error&&items.length>0&&<Failure error={error} />}{cursor&&<div className="login-history-more"><Button tone="outline" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Loading…':'Load older activity'}</Button></div>}</Panel></div>}
export function Account(){
  const {me,signOut,notify}=useApp();
  const blocked=useGet<{items:{user:Member;blockedAt:string}[]}>('/blocks?limit=50');
  const exported=useGet<{status:string; downloadUrl?:string;expiresAt?:string}>('/account/export-status');
  const[reason,setReason]=useState('');
  const[feedback,setFeedback]=useState('');
  const[confirmText,setConfirmText]=useState('');
  const[showDelete,setShowDelete]=useState(false);

  const unblock=async(id:string)=>{
    try{
      await request('DELETE',`/users/${id}/block`);
      notify('Member unblocked.');
      void blocked.refresh();
    }catch(e){notify(messageOf(e))}
  };

  const deletion=async()=>{
    if(confirmText!=='DELETE')return;
    try{
      await request('POST','/account/deletion-request',{body:{confirm:true,reason,feedback}});
      await signOut(true);
      notify('Your account deletion has been requested.');
    }catch(e){notify(messageOf(e))}
  };

  const exportReady=exported.data?.status==='READY'&&exported.data.downloadUrl;

  return (
    <div className="dc-account-page">
      <Heading label="YOUR ACCOUNT" title="Account & settings" description="Privacy, safety, and session controls in one place."/>

      <section className="dc-account-identity" aria-label="Your profile summary">
        <div className="dc-account-identity-main">
          <Avatar user={me} size={72}/>
          <div className="dc-account-identity-copy">
            <h2>{me?.displayName||'Your profile'}</h2>
            <ul>
              {me?.phoneNumber?<li><Phone size={14}/><span>{me.phoneNumber}</span></li>:null}
              {me?.email?<li><Mail size={14}/><span>{me.email}</span></li>:null}
              {!me?.phoneNumber&&!me?.email?<li><span>Add contact details from your profile.</span></li>:null}
            </ul>
          </div>
        </div>
        <div className="dc-account-identity-actions">
          <Link href="/profile" className="button outline"><UserRound size={16}/> Edit profile</Link>
          <Button tone="outline" onClick={()=>void signOut()}><LogOut size={16}/> Log out</Button>
          <Button tone="quiet" onClick={()=>{if(confirm('Sign out everywhere?'))void signOut(true)}}>Sign out all devices</Button>
        </div>
      </section>

      <section className="dc-account-block" aria-labelledby="dc-account-manage">
        <div className="dc-account-block-head">
          <h2 id="dc-account-manage">Manage</h2>
          <p>Security and everyday account shortcuts.</p>
        </div>
        <div className="dc-account-rows">
          <Link href="/account/security" className="dc-account-row">
            <span className="dc-account-row-icon"><ShieldCheck size={18}/></span>
            <span className="dc-account-row-copy">
              <strong>Login activity</strong>
              <small>Review recent sign-ins and devices</small>
            </span>
            <ChevronRight size={18}/>
          </Link>
          <Link href="/notifications" className="dc-account-row">
            <span className="dc-account-row-icon"><BellRing size={18}/></span>
            <span className="dc-account-row-copy">
              <strong>Notifications</strong>
              <small>Alerts and preference controls</small>
            </span>
            <ChevronRight size={18}/>
          </Link>
          <Link href="/help" className="dc-account-row">
            <span className="dc-account-row-icon"><LifeBuoy size={18}/></span>
            <span className="dc-account-row-copy">
              <strong>Help & support</strong>
              <small>FAQs and contact support</small>
            </span>
            <ChevronRight size={18}/>
          </Link>
        </div>
      </section>

      <section className="dc-account-block" aria-labelledby="dc-account-privacy">
        <div className="dc-account-block-head">
          <h2 id="dc-account-privacy">Privacy & safety</h2>
          <p>Blocked members and your personal data.</p>
        </div>

        <div className="dc-account-panel">
          <div className="dc-account-panel-title">
            <Ban size={17}/>
            <div>
              <strong>Blocked members</strong>
              <p>People you have blocked will not appear in discovery or chat.</p>
            </div>
          </div>
          {blocked.loading?<Loading label="Loading blocked members…"/>:blocked.data?.items?.length?(
            <div className="dc-account-blocked-list">
              {blocked.data.items.map((item,i)=>(
                <div key={item.user?.id||i} className="dc-account-blocked-row">
                  <div className="dc-account-blocked-person">
                    <Avatar user={item.user} size={40}/>
                    <strong>{item.user?.displayName||'Member'}</strong>
                  </div>
                  <Button tone="outline" onClick={()=>void unblock(item.user.id)}>Unblock</Button>
                </div>
              ))}
            </div>
          ):(
            <p className="dc-account-empty">No blocked members yet.</p>
          )}
        </div>

        <div className="dc-account-panel">
          <div className="dc-account-panel-title">
            <Database size={17}/>
            <div>
              <strong>Data & privacy</strong>
              <p>Request or download a copy of your account data.</p>
            </div>
          </div>
          <div className="dc-account-data-meta">
            <div>
              <span>Export status</span>
              <Badge kind={exportReady?'green':'gray'}>{exported.data?.status||'NONE'}</Badge>
            </div>
            <div>
              <span>Download</span>
              {exportReady?(
                <a href={exported.data!.downloadUrl!} target="_blank" rel="noreferrer">Download your data</a>
              ):(
                <em>Not ready</em>
              )}
            </div>
          </div>
          <p className="dc-account-note">To request a new export, contact Help & Support.</p>
        </div>
      </section>

      <section className="dc-account-danger" aria-labelledby="dc-account-delete">
        <div className="dc-account-danger-head">
          <div>
            <h2 id="dc-account-delete">Delete account</h2>
            <p>This hides your account and signs you out. It cannot be undone from here.</p>
          </div>
          {!showDelete?(
            <Button tone="danger" onClick={()=>setShowDelete(true)}>
              <AlertTriangle size={16}/> Continue
            </Button>
          ):null}
        </div>
        {showDelete?(
          <div className="dc-account-danger-body">
            <div className="danger-box">
              <AlertTriangle size={21}/>
              <p>Submitting this request hides your account and signs you out on all devices. Type DELETE to confirm.</p>
            </div>
            <div className="form-grid">
              <label>Reason (optional)<input maxLength={100} value={reason} onChange={e=>setReason(e.target.value)}/></label>
              <label>Type DELETE to confirm<input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off"/></label>
              <label className="wide">Feedback (optional)<textarea maxLength={1000} value={feedback} onChange={e=>setFeedback(e.target.value)}/></label>
            </div>
            <div className="dc-account-danger-actions">
              <Button tone="outline" onClick={()=>{setShowDelete(false);setConfirmText('');}}>Cancel</Button>
              <Button tone="danger" disabled={confirmText!=='DELETE'} onClick={()=>void deletion()}>Request account deletion</Button>
            </div>
          </div>
        ):null}
      </section>
    </div>
  );
}
export function Heading({label,title,description}: {label:string;title:string;description:string}){return <div className="page-heading"><div><span className="overline purple">{label}</span><h1>{title}<span className="title-dot">.</span></h1><p>{description}</p></div></div>}
