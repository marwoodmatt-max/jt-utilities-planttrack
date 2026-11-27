"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock3, Plus, Users } from "lucide-react";

export type WorkshopContribution={
 id:string;job_id:string;mechanic_id:string;mechanic_name:string;
 work_done:string;parts_used:string;hours_worked:number|string;created_at:string;
};
type Props={
 supabase:SupabaseClient;jobId:string;editable:boolean;
 leadName?:string;onAdded?:()=>void;
};
const when=(date:string)=>new Date(date).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});

export default function WorkshopContributions({supabase,jobId,editable,leadName,onAdded}:Props){
 const [entries,setEntries]=useState<WorkshopContribution[]>([]);
 const [work,setWork]=useState("");
 const [parts,setParts]=useState("");
 const [hours,setHours]=useState("0");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const load=async()=>{
  const {data,error}=await supabase.from("workshop_job_contributions")
   .select("id,job_id,mechanic_id,mechanic_name,work_done,parts_used,hours_worked,created_at")
   .eq("job_id",jobId).order("created_at",{ascending:true});
  if(error)setNotice("Could not load team contributions: "+error.message);
  else setEntries((data||[]) as WorkshopContribution[]);
  setLoading(false);
 };
 useEffect(()=>{
  let cancelled=false;
  setEntries([]);setNotice("");setLoading(true);setWork("");setParts("");setHours("0");
  const refresh=async()=>{
   const {data,error}=await supabase.from("workshop_job_contributions")
    .select("id,job_id,mechanic_id,mechanic_name,work_done,parts_used,hours_worked,created_at")
    .eq("job_id",jobId).order("created_at",{ascending:true});
   if(cancelled)return;
   if(error)setNotice("Could not load team contributions: "+error.message);
   else setEntries((data||[]) as WorkshopContribution[]);
   setLoading(false);
  };
  void refresh();
  const channel=supabase.channel("job-contributions-"+jobId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"workshop_job_contributions",filter:"job_id=eq."+jobId},()=>void refresh())
    .subscribe();
  return()=>{cancelled=true;void supabase.removeChannel(channel);};
 },[supabase,jobId]);
 const total=entries.reduce((sum,e)=>sum+Number(e.hours_worked||0),0);
 async function save(){
  const value=Number(hours);
  if(work.trim().length<3){setNotice("Describe the work you completed.");return;}
  if(!Number.isFinite(value)||value<0||value>1000){setNotice("Enter valid hours (0–1000).");return;}
  setBusy(true);setNotice("");
  try{
   const {error}=await supabase.rpc("record_workshop_contribution",{
    p_job:jobId,p_work:work.trim(),p_parts:parts.trim(),p_hours:value
   });
   if(error)throw error;
   setWork("");setParts("");setHours("0");
   await load();
   onAdded?.();
   setNotice("Work entry saved with your name and time. The lead mechanic can see it.");
  }catch(e){setNotice("Work entry could not be saved: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 return <section className="workshop-contributions">
  <div className="workshop-contributions-head">
   <div><h4><Users size={18}/> Team work history</h4>
    <p className="muted">Each entry records who did the work and when. {leadName?"Lead mechanic: "+leadName+". ":""}The lead retains the final signature.</p>
   </div><span className="tag blue">{entries.length} entries · {total.toFixed(2)} hrs</span>
  </div>
  {loading?<p className="muted">Loading work history…</p>:
   entries.length===0?<p className="muted">No additional mechanic entries recorded yet.</p>:
   <div className="workshop-contributions-list">{entries.map(entry=>
    <article key={entry.id} className="workshop-contribution-entry">
     <div><strong>{entry.mechanic_name}</strong><span><Clock3 size={13}/> {when(entry.created_at)}</span></div>
     <p>{entry.work_done}</p>
     {entry.parts_used&&<small><b>Parts:</b> {entry.parts_used}</small>}
     <small><b>Time:</b> {Number(entry.hours_worked).toFixed(2)} hours</small>
    </article>)}</div>}
  {editable&&<div className="workshop-contribution-form">
    <strong><Plus size={17}/> Record work you helped with</strong>
    <label>Work completed<textarea rows={3} value={work} maxLength={5000} placeholder="What did you do on this job?" onChange={e=>setWork(e.target.value)}/></label>
    <label>Parts / materials (optional)<textarea rows={2} value={parts} maxLength={2000} placeholder="Any parts used" onChange={e=>setParts(e.target.value)}/></label>
    <label>Hours worked<input type="number" min="0" max="1000" step=".25" inputMode="decimal" value={hours} onChange={e=>setHours(e.target.value)}/></label>
    <button className="primary" type="button" disabled={busy||work.trim().length<3} onClick={()=>void save()}>{busy?"Saving entry…":"Save my work entry"}</button>
    <small>Saved under your signed-in name, with an automatic date and time. Entries cannot be edited or erased. This does not sign the lead mechanic's job.</small>
  </div>}
  {notice&&<p role="status" className="notice">{notice}</p>}
 </section>;
}
