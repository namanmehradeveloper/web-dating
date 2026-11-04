'use client';
import { useEffect, useState } from 'react';
import {useSearchParams} from 'next/navigation';
import { isAdultDateOfBirth } from '@/lib/validation';
import { Heart, ShieldCheck, Sparkles, ArrowRight, Mail, Phone, LockKeyhole, CheckCircle2 } from 'lucide-react';
import { request, messageOf } from '@/lib/api';
import { useApp } from './provider';
import { Button } from './ui';
import type { Session } from '@/lib/types';

type FormMode = 'phone'|'otp'|'email'|'register';

const COUNTRY_OPTIONS = [
  { code: 'IN', dial: '+91', label: 'India' },
  { code: 'US', dial: '+1', label: 'United States' },
  { code: 'GB', dial: '+44', label: 'United Kingdom' },
  { code: 'AE', dial: '+971', label: 'UAE' },
  { code: 'SA', dial: '+966', label: 'Saudi Arabia' },
  { code: 'AU', dial: '+61', label: 'Australia' },
  { code: 'CA', dial: '+1', label: 'Canada' },
  { code: 'SG', dial: '+65', label: 'Singapore' },
  { code: 'PK', dial: '+92', label: 'Pakistan' },
  { code: 'BD', dial: '+880', label: 'Bangladesh' },
  { code: 'NP', dial: '+977', label: 'Nepal' },
  { code: 'LK', dial: '+94', label: 'Sri Lanka' },
  { code: 'DE', dial: '+49', label: 'Germany' },
  { code: 'FR', dial: '+33', label: 'France' },
  { code: 'NL', dial: '+31', label: 'Netherlands' },
  { code: 'IE', dial: '+353', label: 'Ireland' },
  { code: 'NZ', dial: '+64', label: 'New Zealand' },
  { code: 'ZA', dial: '+27', label: 'South Africa' },
  { code: 'NG', dial: '+234', label: 'Nigeria' },
  { code: 'PH', dial: '+63', label: 'Philippines' },
] as const;

function toE164(dial: string, national: string) {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return `${dial}${digits}`;
}

export function Auth({initialMode='phone'}:{initialMode?:FormMode}) {
  const {signIn,notify} = useApp();
  const searchParams=useSearchParams();
  const [mode, setMode] = useState<FormMode>(initialMode);
  const [countryCode, setCountryCode] = useState<string>('IN');
  const [nationalNumber, setNationalNumber] = useState('');
  const [phone,setPhone] = useState('');
  const [otp,setOtp] = useState('');
  const [email,setEmail] = useState(()=>searchParams.get('email') || '');
  const [password,setPassword] = useState('');
  const [displayName,setDisplayName] = useState('');
  const [dob,setDob] = useState('');
  const [terms,setTerms] = useState(false);
  const [resend,setResend] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === countryCode) || COUNTRY_OPTIONS[0];
  useEffect(()=>{if(resend<=0)return;const id=setTimeout(()=>setResend(v=>Math.max(0,v-1)),1000);return ()=>clearTimeout(id)},[resend]);
  async function exec(fn:()=>Promise<void>) {setBusy(true);setError('');try{await fn()}catch(e){setError(messageOf(e))}finally{setBusy(false)}}
  async function sendOtp(){ await exec(async()=>{
    const digits = nationalNumber.replace(/\D/g, '');
    if (mode !== 'otp' && digits.length !== 10) throw new Error('Enter a 10-digit phone number.');
    const normalized = phone && mode === 'otp'
      ? phone
      : toE164(selectedCountry.dial, digits);
    if(!/^\+[1-9]\d{7,14}$/.test(normalized))throw new Error('Enter a valid phone number for the selected country.');
    setPhone(normalized);
    const data = await request<{resendAfterSeconds?:number}>('POST','/auth/otp/request',{body:{phoneNumber:normalized}});
    setResend(data?.resendAfterSeconds||0);setMode('otp');
  }); }
  async function verify(){await exec(async()=>{
    if(!/^\d{6}$/.test(otp.trim()))throw new Error('Enter the 6-digit verification code.');
    const data=await request<{ tokens: Session;user:{id:string;role:string}}>('POST','/auth/otp/verify',{body:{phoneNumber:phone.trim(),code:otp.trim()}});
    if(data.user?.role && data.user.role!=='USER') throw new Error('Use the separate Admin Panel for staff accounts.');
    await signIn({accessToken:data.tokens.accessToken,refreshToken:data.tokens.refreshToken,userId:data.user.id});
  });}
  async function emailSubmit(){await exec(async()=>{
    const register=mode==='register';
    if(register&&!terms) throw new Error('Please accept the terms to continue.');
    if(register&&!isAdultDateOfBirth(dob))throw new Error('You must be at least 18 years old to register.');
    const data=await request<{tokens: Session;user:{id:string;role:string}}>('POST',register?'/auth/register':'/auth/login',{
      body:register?{email,password,displayName,dateOfBirth:dob,acceptedTermsVersion:process.env.NEXT_PUBLIC_TERMS_VERSION || '2026-01'}:{email,password}
    });
    if (data.user.role!=='USER') throw new Error('Staff accounts should use the Admin Panel.');
    await signIn({...data.tokens,userId:data.user.id});
  });}
  return <div className="auth-layout">
    <section className="auth-visual">
      <div className="auth-glow glow-one"/><div className="auth-glow glow-two"/><div className="auth-ornament"><Heart size={138} fill="currentColor" strokeWidth={1}/></div>
      <div className="auth-visual-copy"><div className="eyebrow"><Sparkles size={14}/> A BETTER WAY TO CONNECT</div><h1>Where genuine<br/><em>connections</em> begin.</h1><p>Discover interesting people, create meaningful matches, and start your next great conversation.</p><div className="auth-trust"><span><ShieldCheck size={16}/> Privacy first</span><span><Heart size={16}/> Meaningful matches</span></div></div>
    </section>
    <section className="auth-form-area"><div className="auth-card">
      <div className="mobile-logo"><Heart fill="currentColor" size={22}/> Dating Cloud</div>
      <div className="small-heart"><Heart fill="currentColor" size={23}/></div>
      <span className="overline">{mode==='register'?'CREATE AN ACCOUNT':mode==='otp'?'VERIFY YOUR NUMBER':'WELCOME TO DATING CLOUD'}</span>
      <h2>{mode==='otp'?'One more step':mode==='register'?'Join Dating Cloud':mode==='email'?'Welcome back':'Find your person.'}</h2>
      <p className="muted">{mode==='otp'?`Enter the code requested for ${phone}`:'Start meeting people who share your interests and values.'}</p>
      {error && <p className="field-error">{error}</p>}
      {(mode==='phone'||mode==='otp') && <form onSubmit={e=>{e.preventDefault();void(mode==='phone'?sendOtp():verify())}}>
        {mode==='phone'? <>
          <label htmlFor="auth-phone">Phone number</label>
          <div className="phone-row">
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={`${country.code}-${country.dial}`} value={country.code}>
                  {country.dial} {country.label}
                </option>
              ))}
            </select>
            <div className="input-with-icon">
              <Phone size={18}/>
              <input
                id="auth-phone"
                value={nationalNumber}
                onChange={(e) => setNationalNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                minLength={10}
                placeholder="9876543210"
              />
            </div>
          </div>
        </>
        :<><label>Verification code</label><div className="input-with-icon"><LockKeyhole size={18}/><input value={otp} onChange={e=>setOtp(e.target.value)} required inputMode="numeric" maxLength={6} placeholder="6-digit OTP"/></div></>}
        <Button disabled={busy} className="full large" type="submit">{busy?'Please wait...':mode==='phone'?'Continue with phone':'Verify & continue'} <ArrowRight size={17}/></Button>
        {mode==='otp' && <div className="auth-actions"><button type="button" onClick={()=>setMode('phone')}>Change number</button><button type="button" disabled={busy||resend>0} onClick={()=>void sendOtp()}>{resend>0?`Resend in ${resend}s`:'Resend code'}</button></div>}
      </form>}
      {(mode==='email'||mode==='register') && <form onSubmit={e=>{e.preventDefault();void emailSubmit()}}>
        {mode==='register' && <><label>Your name</label><input required maxLength={40} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Full name"/><label>Date of birth</label><input required type="date" value={dob} onChange={e=>setDob(e.target.value)}/></>}
        <label>Email address</label><div className="input-with-icon"><Mail size={18}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div>
        <label>Password</label><div className="input-with-icon"><LockKeyhole size={18}/><input type="password" required minLength={mode==='register'?10:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password"/></div>
        {mode==='register' && <label className="check-row"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/> I accept the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a></label>}
        <Button type="submit" disabled={busy} className="full large">{busy?'Please wait...':mode==='register'?'Create account':'Sign in'} <ArrowRight size={17}/></Button>
      </form>}
      <div className="auth-divider">or continue with</div><div className="auth-choice">
        <Button tone="outline" onClick={()=>{setMode(mode==='email'?'phone':'email');setError('')}}>{mode==='email'?<Phone size={17}/>:<Mail size={17}/>} {mode==='email'?'Phone':'Email'}</Button>
        <Button tone="outline" onClick={()=>{setMode(mode==='register'?'phone':'register');setError('')}}><Sparkles size={16}/> {mode==='register'?'Sign in':'Sign up'}</Button>
      </div>
      <p className="auth-note"><CheckCircle2 size={15}/> Share at your own pace. You choose how much of your story to tell.</p>
      <p className="auth-bottom">By continuing, you agree to use Dating Cloud respectfully. This platform is for adults 18+.</p>
    </div></section>
  </div>;
}
