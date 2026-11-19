'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowRight,ShieldCheck,LifeBuoy,Mail,Send,CheckCircle2} from 'lucide-react';
import {request,messageOf} from '@/lib/api';
import {useApp} from './provider';

export function ContactPage(){
  const {session,notify}=useApp();
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [category,setCategory]=useState('ACCOUNT');
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [busy,setBusy]=useState(false);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState('');

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setError('');
    setSuccess(false);
    if(name.trim().length<1){
      setError('Enter your name.');
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())){
      setError('Enter a valid email address.');
      return;
    }
    if(subject.trim().length<3||body.trim().length<10){
      setError('Enter a subject and a message of at least 10 characters.');
      return;
    }
    setBusy(true);
    try{
      await request('POST','/support/tickets',{
        body:{
          name:name.trim(),
          email:email.trim(),
          category,
          subject:subject.trim(),
          message:body.trim(),
        },
      });
      setSuccess(true);
      setSubject('');
      setBody('');
      notify(session?'Your support ticket has been created.':'Your message was sent. Our team will reply by email.');
    }catch(e){
      setError(messageOf(e));
    }finally{
      setBusy(false);
    }
  }

  return (
    <main className="dc-contact" id="main-content">
      <div className="dc-contact-hero">
        <span className="dc-kicker">WE&apos;RE HERE TO HELP</span>
        <h1>We&apos;re only a <em>hello</em> away.</h1>
        <p>Have a question or a concern? Reach the right Dating Cloud support channel.</p>
      </div>
      <div className="dc-contact-inner">
        <aside>
          <div className="dc-contact-info">
            <LifeBuoy size={29}/>
            <h2>How can we help?</h2>
            <p>
              {session
                ? 'Send a secure support request linked to your account. You can also track updates in Help & Support.'
                : 'Send a support request with your name and email. Sign in if you want the request linked to your account.'}
            </p>
          </div>
          <div className="dc-contact-help">
            <ShieldCheck size={22}/>
            <div>
              <h3>Safety matters</h3>
              <p>Use Report or Block on the relevant member profile or conversation.</p>
              <Link href="/safety">Visit safety center <ArrowRight size={15}/></Link>
            </div>
          </div>
          <div className="dc-contact-help">
            <Mail size={22}/>
            <div>
              <h3>Looking for answers?</h3>
              <p>Our FAQ covers profiles, matching and messages.</p>
              <Link href="/faq">Read FAQs <ArrowRight size={15}/></Link>
            </div>
          </div>
        </aside>
        <section className="dc-contact-form">
          <span className="dc-kicker">CONTACT DATING CLOUD</span>
          <h2>Send a message</h2>
          <p>
            {session
              ? 'This creates a ticket using your signed-in account and the contact details below.'
              : 'No account needed. Include a working email so we can reply.'}
          </p>
          <form onSubmit={e=>void submit(e)}>
            <div className="dc-form-grid">
              <label>Your name
                <input required value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Your name"/>
              </label>
              <label>Email address
                <input required type="email" maxLength={120} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
              </label>
            </div>
            <label>Topic
              <select value={category} onChange={e=>setCategory(e.target.value)}>
                {['ACCOUNT','BILLING','SAFETY','BUG','OTHER'].map(c=><option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Subject
              <input required minLength={3} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="How can we help?"/>
            </label>
            <label>Your message
              <textarea required minLength={10} maxLength={5000} rows={6} value={body} onChange={e=>setBody(e.target.value)} placeholder="Tell us more…"/>
            </label>
            {error&&<p className="field-error" role="alert">{error}</p>}
            {success&&(
              <p className="dc-success" role="status">
                <CheckCircle2 size={18}/> Support ticket created successfully.
                {session?' Check Help & Support for updates.':' We will reply to the email you provided.'}
              </p>
            )}
            <button type="submit" className="dc-submit" disabled={busy}>
              <Send size={17}/>{busy?'Submitting…':'Submit support request'}
            </button>
            {!session&&(
              <div className="dc-contact-help-note">
                <p>Prefer tracking replies in the app? Sign in and submit from Help & Support.</p>
                <Link href="/login?next=%2Fhelp">Sign in for support <ArrowRight size={16}/></Link>
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
