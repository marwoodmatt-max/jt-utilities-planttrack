"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, ImagePlus, Trash2 } from "lucide-react";

type Photo={id:string;job_id:string;storage_path:string;caption:string;created_at:string;uploaded_by:string};
type Props={supabase:SupabaseClient;jobId:string;jobNumber?:string;jobType?:string;role:string;status:string};
const allowedStatuses=["Assigned","In progress","Returned for correction"];

export default function WorkshopJobPhotos({supabase,jobId,jobNumber,jobType,role,status}:Props){
 const [open,setOpen]=useState(false);
 const [photos,setPhotos]=useState<Photo[]>([]);
 const [urls,setUrls]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [caption,setCaption]=useState("");
 const canAdd=role==="engineer"&&allowedStatuses.includes(status);
 const isLoler=String(jobType||"").startsWith("LOLER");
 useEffect(()=>{
  let active=true;
  setPhotos([]);setUrls({});setOpen(false);setMessage("");setCaption("");
  if(isLoler)return;
  void (async()=>{
   const {data,error}=await supabase.from("workshop_job_photos")
     .select("id,job_id,storage_path,caption,created_at,uploaded_by")
     .eq("job_id",jobId).order("created_at",{ascending:true});
   if(!active)return;
   if(error){setMessage("Photos could not load: "+error.message);return;}
   const items=(data||[]) as Photo[];
   setPhotos(items);
   if(!items.length)return;
   const signed=await supabase.storage.from("workshop-job-photos").createSignedUrls(items.map(x=>x.storage_path),3600);
   if(!active||signed.error)return;
   const links:Record<string,string>={};
   (signed.data||[]).forEach((item,i)=>{if(item.signedUrl)links[items[i].id]=item.signedUrl;});
   setUrls(links);
  })();
  return()=>{active=false};
 },[supabase,jobId,isLoler]);
 if(isLoler)return null;
 async function add(files:FileList|null){
  if(!files||!canAdd||busy)return;
  if(photos.length+files.length>8){setMessage("Maximum 8 photos per job.");return;}
  setBusy(true);setMessage("");
  const added:Photo[]=[];
  const links:Record<string,string>={};
  try{
   const {data:user,error:userError}=await supabase.auth.getUser();
   if(userError||!user.user)throw userError||new Error("Sign in required");
   for(const file of Array.from(files)){
    if(!["image/jpeg","image/png"].includes(file.type))throw new Error("Use JPEG or PNG pictures.");
    if(file.size>5*1024*1024)throw new Error("Each image must be smaller than 5 MB.");
    const path=jobId+"/"+crypto.randomUUID()+(file.type==="image/png"?".png":".jpg");
    const bucket=supabase.storage.from("workshop-job-photos");
    const uploaded=await bucket.upload(path,file,{contentType:file.type,upsert:false});
    if(uploaded.error)throw uploaded.error;
    const saved=await supabase.from("workshop_job_photos").insert({
     job_id:jobId,storage_path:path,caption:caption.trim().slice(0,160),uploaded_by:user.user.id
    }).select("id,job_id,storage_path,caption,created_at,uploaded_by").single();
    if(saved.error||!saved.data){
     await bucket.remove([path]);
     throw saved.error||new Error("Could not attach photo to job");
    }
    const item=saved.data as Photo;
    added.push(item);
    const signed=await bucket.createSignedUrl(path,3600);
    if(signed.data?.signedUrl)links[item.id]=signed.data.signedUrl;
   }
   setPhotos(prev=>[...prev,...added]);
   setUrls(prev=>({...prev,...links}));
   setCaption("");
   setMessage(added.length+" photo(s) added to "+(jobNumber||"the job")+". They will be placed in the PDF when the office approves it.");
  }catch(e){
   if(added.length){setPhotos(prev=>[...prev,...added]);setUrls(prev=>({...prev,...links}));}
   setMessage("Photo upload: "+(e instanceof Error?e.message:String(e)));
  }finally{setBusy(false);}
 }
 async function remove(photo:Photo){
  if(!canAdd||busy||!window.confirm("Remove this photo from the job?"))return;
  setBusy(true);setMessage("");
  try{
   const row=await supabase.from("workshop_job_photos").delete().eq("id",photo.id);
   if(row.error)throw row.error;
   const storage=await supabase.storage.from("workshop-job-photos").remove([photo.storage_path]);
   if(storage.error)setMessage("Photo detached; storage clean-up needs attention: "+storage.error.message);
   else setMessage("Photo removed.");
   setPhotos(prev=>prev.filter(p=>p.id!==photo.id));
  }catch(e){setMessage("Could not remove photo: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 return <section className="workshop-job-photos">
  <button type="button" className="secondary workshop-job-photos-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <Camera size={18}/> {open?"Hide job photos":"Optional job photos"} {photos.length?"("+photos.length+")":""}
  </button>
  {open&&<div className="workshop-job-photos-content">
   <p className="muted">Attach photos of faults, repairs or completed work when needed. Photos stay with this job and are included as extra pages on the approved PDF. They are optional and unavailable on LOLER certificates.</p>
   {canAdd&&<div className="workshop-job-photo-upload">
    <label>Photo notes (optional)<input value={caption} maxLength={160} onChange={e=>setCaption(e.target.value)} placeholder="e.g. repaired brake hose, completed work"/></label>
    <label className="secondary workshop-photo-pick"><ImagePlus size={17}/> {busy?"Uploading…":"Take or add photos"}<input type="file" accept="image/jpeg,image/png" multiple disabled={busy||photos.length>=8} onChange={e=>{void add(e.target.files);e.target.value="";}}/></label>
    <small>Up to 8 photos per job · JPG or PNG · maximum 5 MB each. Save photos before the mechanic signs the job.</small>
   </div>}
   {photos.length>0?<div className="workshop-photo-grid">{photos.map(photo=><div className="workshop-photo-tile" key={photo.id}>
    {urls[photo.id]?<a href={urls[photo.id]} target="_blank" rel="noreferrer"><img src={urls[photo.id]} alt={photo.caption||"Job evidence"}/></a>:<div>Photo saved</div>}
    <small>{photo.caption||"Job photo"}</small>
    {canAdd&&<button type="button" className="secondary" disabled={busy} onClick={()=>void remove(photo)}><Trash2 size={14}/> Remove</button>}
   </div>)}</div>:<p className="muted">No photos added to this job.</p>}
   {!canAdd&&role==="engineer"&&<small>Photos are locked once the mechanic has signed or submitted the job.</small>}
   {message&&<p className="notice" role="status">{message}</p>}
  </div>}
 </section>;
}
