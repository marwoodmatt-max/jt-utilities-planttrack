"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRightLeft, History } from "lucide-react";

type Person={user_id:string;display_name:string};
type RecordRow={
 id:string;previous_lead_name:string;new_lead_name:string;
 reassigned_by_name:string;reason:string;created_at:string;
};
type Props={
 supabase:SupabaseClient;jobId:string;jobType?:string;status:string;
 leadId?:string|null;staff:Person[];canReassign:boolean;
 onReassigned:()=>void;
};

export default function WorkshopReassignment({supabase,jobId,jobType,status,leadId,staff,canReassign,onReassigned}:Props){
 const [records,setRecords]=useState<RecordRow[]>([]);
 const [nextLead,setNextLead]=useState("");
 const [reason,setReason]=useState("");
 const [expanded,setExpanded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const locked=!["Assigned","In progress","Returned for correction"].includes(status)||
  String(jobType||"").startsWith("LOLER")||!leadId;
 const load=async()=>{
  const {data,error}=await supabase.from("workshop_job_reassignments")
   .select("id,previous_lead_name,new_lead_name,reassigned_by_name,reason,created_at")
   .eq("job_id",jobId).order("created_at",{ascending:true});
  if(error)setNotice("Could not read lead transfer history: "+error.message);
  else setRecords((data||[]) as RecordRow[]);
 };
 useEffect(()=>{
  let active=true;
  setRecords([]);setExpanded(false);setNextLead("");setReason("");setNotice("");
  void (async()=>{
   const {data,error}=await supabase.from("workshop_job_reassignments")
    .select("id,previous_lead_name,new_lead_name,reassigned_by_name,reason,created_at")
    .eq("job_id",jobId).order("created_at",{ascending:true});
   if(!active)return;
   if(error)setNotice("Could not read lead transfer history: "+error.message);
   else setRecords((data||[]) as RecordRow[]);
  })();
  return()=>{active=false};
 },[supabase,jobId]);
 async function transfer(){
  if(!canReassign||locked||!nextLead||reason.trim().length<5||busy)return;
  const name=staff.find(s=>s.user_id===nextLead)?.display_name;
  if(!window.confirm("Reassign lead responsibility for this job to "+(name||"the chosen mechanic")+"? The new lead will be responsible for signing."))return;
  setBusy(true);setNotice("");
  try{
   const {error}=await supabase.rpc("reassign_open_workshop_job",{
    p_job:jobId,p_new_lead:nextLead,p_reason:reason.trim()
   });
   if(error)throw error;
   await load();
   setNextLead("");setReason("");setExpanded(false);
   setNotice("Lead mechanic changed. The previous lead, new lead, reason and time are saved in the job audit.");
   onReassigned();
  }catch(e){setNotice("Could not reassign job: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 const format=(date:string)=>new Date(date).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
 return <section className="workshop-reassignment">
  <div className="workshop-reassignment-heading"><strong><ArrowRightLeft size={17}/> Lead mechanic / job takeover</strong>
   {canReassign&&!locked&&<button className="secondary" type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?"Cancel takeover":"Reassign job"}</button>}
  </div>
  {expanded&&!locked&&canReassign&&<div className="workshop-reassignment-form">
    <p className="muted">For sickness, absence or handing over the job. The chosen mechanic becomes the lead and will be responsible for the final signature. Earlier work records stay on the job.</p>
    <label>New lead mechanic<select value={nextLead} onChange={e=>setNextLead(e.target.value)}>
      <option value="">Choose workshop mechanic</option>
      {staff.filter(person=>person.user_id!==leadId).map(person=><option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}
    </select></label>
    <label>Reason for reassignment<textarea rows={2} maxLength={1000} placeholder="e.g. Simon off sick — Brett taking over the remaining repairs" value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button className="primary" type="button" disabled={busy||!nextLead||reason.trim().length<5} onClick={()=>void transfer()}>{busy?"Reassigning…":"Confirm new lead mechanic"}</button>
   </div>}
  {records.length>0&&<div className="workshop-reassignment-history"><strong><History size={15}/> Reassignment history</strong>
   {records.map(row=><article key={row.id}>
    <b>{row.previous_lead_name} → {row.new_lead_name}</b>
    <small>{format(row.created_at)} · Reassigned by {row.reassigned_by_name}</small>
    <p>{row.reason}</p>
   </article>)}
  </div>}
  {notice&&<p className="notice" role="status">{notice}</p>}
 </section>;
}
