'use client';
import { useEffect, useState } from 'react';
import { isAdultDateOfBirth } from '@/lib/validation';
import { Heart, ArrowRight, Camera, CheckCircle2, ChevronLeft, Sparkles } from 'lucide-react';
import { useApp } from './provider';
import { request, upload, messageOf } from '@/lib/api';
import { Button, Loading } from './ui';
const GOALS: Record<string,string> = { LONG_TERM: 'Long-term relationship', LONG_TERM_OPEN_TO_SHORT:'Long-term, open to short', SHORT_TERM_OPEN_TO_LONG:'Short-term, open to long', SHORT_TERM_FUN:'Something casual', NEW_FRIENDS:'New friends', STILL_FIGURING_OUT:'Still figuring it out' };
export function Onboarding() {
 const {reloadMe,notify} = useApp();
 const [step,setStep] = useState(0);
 const [name,setName] = useState('');const [dob,setDob] = useState(''); const [gender,setGender] = useState('WOMAN');const [showMe,setShowMe] = useState('EVERYONE');
 const [goal,setGoal] = useState('LONG_TERM');const [bio,setBio] = useState('');const [city,setCity] = useState('');const [distance,setDistance] = useState(50);
 const [catalog,setCatalog] = useState<{id:string;label:string}[]>([]); const [interests,setInterests] = useState<string[]>([]);
 const [files,setFiles] = useState<File[]>([]);const [busy,setBusy] = useState(false);const [error,setError] = useState('');
 useEffect(()=>{request<{items:{id:string;label:string}[]}>('GET','/interests').then(d=>setCatalog(d.items||[])).catch(e=>setError(messageOf(e)))},[]);
 const next=()=>{setError('');if(step===0 && (!name.trim()||!isAdultDateOfBirth(dob))){setError('Please enter your name and valid age (18+).');return;}if(step===1&&(interests.length<1||interests.length>10)){setError('Choose 1–10 interests.');return;} if(step===2&&(files.length<2||files.length>6)){setError('Upload 2–6 profile photos.');return;}setStep(step+1)};
 const submit=async()=>{setBusy(true);setError('');try{
  const photoMediaIds:string[]=[];
  for(const f of files){const result=await upload(f);photoMediaIds.push(result.mediaId|| (result as any).id)}
  await request('POST','/profile/onboarding',{body:{displayName:name.trim(),dateOfBirth:dob,gender,showGender:true,showMe,maxDistanceKm:distance,relationshipGoal:goal,interestIds:interests,photoMediaIds,bio:bio.trim()||undefined,city:city.trim()||undefined,acceptedTermsVersion:process.env.NEXT_PUBLIC_TERMS_VERSION || '2026-01'}});
  notify('Welcome to Dating Cloud! Your profile is ready.');await reloadMe();
 }catch(e){setError(messageOf(e))}finally{setBusy(false)}};
 return <div className="onboarding-layout"><div className="onboarding-card">
  <div className="onboarding-top"><span className="logo-icon"><Heart fill="currentColor" size={20}/></span><span>Dating Cloud</span><span className="step-tag">STEP {step+1} / 4</span></div>
  <div className="steps">{[0,1,2,3].map(n=><span key={n} className={n<=step?'current':''}/>)}</div>
  <span className="overline"><Sparkles size={14}/> LET'S MAKE IT PERSONAL</span>
  <h1>{['Tell us about yourself','What makes you, you?','Show your best self','Your preferences'][step]}</h1>
  <p className="muted">{['Start with the basics so others can get to know you.','Find people who share your interests.','Add 2–6 clear profile photos.','One final step before discovering connections.'][step]}</p>
  {error&&<p className="field-error">{error}</p>}
  {step===0&&<div className="form-grid"><label className="wide">Your name<input value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Your display name"/></label>
    <label>Date of birth<input type="date" value={dob} onChange={e=>setDob(e.target.value)}/></label><label>I identify as<select value={gender} onChange={e=>setGender(e.target.value)}><option value="WOMAN">Woman</option><option value="MAN">Man</option><option value="NON_BINARY">Non-binary</option></select></label>
    <label className="wide">Short bio (optional)<textarea maxLength={500} value={bio} onChange={e=>setBio(e.target.value)} placeholder="I love long conversations, weekend adventures..."/></label></div>}
  {step===1&&<div className="interest-grid">{catalog.map(item=><button key={item.id} className={`interest ${interests.includes(item.id)?'chosen':''}`} onClick={()=>setInterests(s=>s.includes(item.id)?s.filter(i=>i!==item.id):s.length<10?[...s,item.id]:s)}>{item.label}{interests.includes(item.id)&&<CheckCircle2 size={15}/>}</button>)}{catalog.length===0&&<Loading label="Loading interests..."/>}</div>}
  {step===2&&<><label className="upload-drop"><Camera size={27}/><strong>Add your photos</strong><span>JPG, PNG or WebP · 2–6 images · up to 10 MB each</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{const selected=Array.from(e.target.files||[]);if(selected.length>6){setError('Upload no more than 6 photos.');return;}if(selected.some(f=>f.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))){setError('Use JPG, PNG or WebP files, each no larger than 10 MB.');return;}setFiles(selected);setError('')}}/></label><div className="photos-preview">{files.map((f,i)=><div key={i}><PhotoPreview file={f} alt={`Your photo ${i+1}`}/><span>{i===0?'Main photo':`Photo ${i+1}`}</span></div>)}</div></>}
  {step===3&&<div className="form-grid"><label>Show me<select value={showMe} onChange={e=>setShowMe(e.target.value)}><option value="EVERYONE">Everyone</option><option value="WOMEN">Women</option><option value="MEN">Men</option></select></label><label>Max distance (km)<input type="number" min={1} max={500} value={distance} onChange={e=>setDistance(Math.max(1,Math.min(500,Number(e.target.value))))}/></label><label className="wide">Relationship goal<select value={goal} onChange={e=>setGoal(e.target.value)}>{Object.entries(GOALS).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label><p className="muted wide">Your profile will use the preferences and media you selected. You can adjust discovery preferences anytime.</p></div>}
  <div className="onboarding-actions">{step>0&&<Button tone="outline" onClick={()=>{setStep(step-1);setError('')}}><ChevronLeft size={16}/> Back</Button>}<Button onClick={()=>void(step<3?next():submit())} disabled={busy} className="push">{busy?'Uploading & saving...':step<3?'Continue':'Complete profile'}<ArrowRight size={16}/></Button></div>
 </div></div>
}

function PhotoPreview({file,alt}: {file:File;alt:string}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return ()=>URL.revokeObjectURL(objectUrl)},[file]);
  return url?<img src={url} alt={alt}/>:<span>{alt}</span>;
}
