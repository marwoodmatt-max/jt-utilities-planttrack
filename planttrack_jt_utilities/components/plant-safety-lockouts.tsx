"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck, Wrench } from "lucide-react";

type Hold={id:string;asset_id:string;inspection_id:string;locked_at:string;defect_summary:string;previous_status:string;released_at:string|null;released_by:string|null;release_notes:string|null};
type Job={id:string;inspection_id:string|null;status:string;assigned_engineer:string|null;job_card_number:string|null};
type Mechanic={id:string;name:string};
type AuditEvent={event_id:string;action:string;actor_name:string;actor_id:string;happened_at:string;detail:string};
const dateLabel=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");

export default function PlantSafetyLockouts({supabase,isAdmin,assetId}:{supabase:SupabaseClient;isAdmin:boolean;assetId?:string}){
 const [holds,setHolds]=useState<Hold[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [mechanics,setMechanics]=useState<Mechanic[]>([]);
 const [auditByAsset,setAuditByAsset]=useState<Record<string,AuditEvent[]>>({});
 const [auditError,setAuditError]=useState("");
 const [assets,setAssets]=useState<Record<string,string>>({});
 const [mechanicChoice,setMechanicChoice]=useState<Record<string,string>>({});
 const [reason,setReason]=useState<Record<string,string>>({});
 const [safe,setSafe]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  setLoading(true);
  let query=supabase.from("plant_safety_lockouts").select("id,asset_id,inspection_id,locked_at,defect_summary,previous_status,released_at,released_by,release_notes").order("locked_at",{ascending:false}).limit(300);
  if(assetId)query=query.eq("asset_id",assetId);
  const [h,j,a,m]=await Promise.all([
   query,
   supabase.from("workshop_job_cards").select("id,inspection_id,status,assigned_engineer,job_card_number").not("inspection_id","is",null).limit(300),
   supabase.from("assets").select("id,asset_code").limit(1500),
   isAdmin?supabase.rpc("list_plant_defect_mechanics"):Promise.resolve({data:[],error:null})
  ]);
  if(h.error||j.error||a.error||m.error)setError("Could not load defect review: "+(h.error||j.error||a.error||m.error)?.message);
  else{
   const records=(h.data||[]) as Hold[];
   setHolds(records);setJobs((j.data||[]) as Job[]);setAssets(Object.fromEntries((a.data||[]).map(x=>[x.id,x.asset_code])));setMechanics((m.data||[]) as Mechanic[]);
   if(isAdmin){
    const activeAssets=[...new Set(records.map(x=>x.asset_id))];
    const results=await Promise.all(activeAssets.map(async id=>({id,...await supabase.rpc("read_plant_defect_audit",{p_asset:id})})));
    const failed=results.find(x=>x.error);
    if(failed)setAuditError("Could not load full audit history: "+failed.error?.message);
    else{setAuditError("");setAuditByAsset(Object.fromEntries(results.map(x=>[x.id,(x.data||[]) as AuditEvent[]])));}
   }
  }
  setLoading(false);
 },[supabase,assetId,isAdmin]);
 useEffect(()=>{
  void load();
  const channel=supabase.channel("plant-hold-review-"+(assetId||"all"))
   .on("postgres_changes",{event:"*",schema:"public",table:"plant_safety_lockouts"},()=>void load())
   .on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},()=>void load()).subscribe();
  const refresh=()=>void load();
  window.addEventListener("focus",refresh);
  return()=>{window.removeEventListener("focus",refresh);void supabase.removeChannel(channel);};
 },[supabase,assetId,load]);
 const active=holds.filter(h=>!h.released_at);
 const history=holds.filter(h=>!!h.released_at);
 const byAsset=Array.from(new Set(active.map(h=>h.asset_id)));
 const associated=(hold:Hold)=>jobs.find(j=>j.inspection_id===hold.inspection_id);
 const mechanicName=(id:string|null)=>mechanics.find(m=>m.id===id)?.name||"Assigned mechanic";

 async function act(job:Job,action:"assign"|"dismiss"){
  if(busy)return;
  setError("");setNotice("");
  const chosen=mechanicChoice[job.id]||job.assigned_engineer||"";
  const details=(reason[job.id]||"").trim();
  if(action==="assign"&&!chosen){setError("Choose a mechanic first.");return;}
  if(action==="dismiss"&&(!safe[job.id]||details.length<15)){
   setError("To dismiss and release, explain the incorrect report or safety checks (at least 15 characters), then tick the safety confirmation.");
   return;
  }
  setBusy(job.id);
  try{
   const {data,error:rpcError}=await supabase.rpc("admin_handle_plant_defect",{
    p_job:job.id,p_action:action,p_mechanic:action==="assign"?chosen:null,
    p_reason:action==="dismiss"?details:null,p_confirm_safe:action==="dismiss"
   });
   if(rpcError)throw rpcError;
   setNotice(String(data||"Defect action recorded."));
   setReason(prev=>({...prev,[job.id]:""}));setSafe(prev=>({...prev,[job.id]:false}));
  }catch(e){setError("Could not complete defect action: "+(e instanceof Error?e.message:String(e)));}
  finally{await load();setBusy(null);}
 }
 async function release(asset:string){
  if(busy)return;
  setError("");setNotice("");
  const details=(reason[asset]||"").trim();
  if(details.length<15||!safe[asset]){setError("Confirm repairs are complete and the machine is safe, with at least 15 characters explaining your checks.");return;}
  setBusy(asset);
  try{
   const {data,error:err}=await supabase.rpc("release_plant_safety_lockout",{p_asset:asset,p_confirmation:details,p_confirm_safe:true});
   if(err)throw err;
   setNotice(String(data||"Machine released."));setReason(prev=>({...prev,[asset]:""}));setSafe(prev=>({...prev,[asset]:false}));
  }catch(e){setError("Unable to release machine: "+(e instanceof Error?e.message:String(e)));}
  finally{await load();setBusy(null);}
 }
 const completed=useMemo(()=>new Set(["Approved","Dismissed"]),[]);
 return <section className="panel" style={{borderTop:"4px solid #dc2626",marginBottom:20}}>
  <div className="panel-head">
   <div><h3><AlertTriangle size={18} style={{verticalAlign:"-4px",marginRight:7,color:"#dc2626"}}/>Plant defects & lockouts ({byAsset.length})</h3><p>One review box per locked machine · Assign to mechanic or dismiss an incorrect defect</p></div>
   <button type="button" className="secondary" onClick={()=>void load()} disabled={loading}><RefreshCcw size={15}/> Refresh</button>
  </div>
  {error&&<p role="alert" className="auth-error">{error}</p>}{auditError&&<p role="alert" className="auth-error">{auditError}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  {loading?<p>Loading safety defects…</p>:byAsset.length===0?<p><CheckCircle2 size={17} style={{verticalAlign:"-3px",marginRight:7}}/>No locked-out machines requiring review.</p>:byAsset.map(asset=>{
   const assetHolds=active.filter(h=>h.asset_id===asset);
   const ready=assetHolds.every(h=>completed.has(associated(h)?.status||""));
   return <article key={asset} style={{border:"2px solid #e44a4a",borderRadius:7,padding:15,margin:"12px 0",background:"#fff9f9"}}>
    <h4 style={{margin:"0 0 6px",fontSize:17,color:"#a61927"}}>LOCKED OUT — {assets[asset]||"Machine"}</h4>
    <small>Do not operate until safe. The software lockout remains active when assigned to a mechanic.</small>
    {assetHolds.map(hold=>{
     const job=associated(hold);const canReview=job&&["New","Assigned"].includes(job.status);
     return <div key={hold.id} style={{borderTop:"1px solid #f7c9ce",marginTop:12,paddingTop:12}}>
      <strong>{hold.defect_summary}</strong><small style={{display:"block",margin:"5px 0 9px"}}>{dateLabel(hold.locked_at)} · Job: {job?.status||"Not linked"}{job?.assigned_engineer?" · "+mechanicName(job.assigned_engineer):""}</small>
      {isAdmin&&job&&canReview&&<div style={{background:"#fff",border:"1px solid #e8d6d8",borderRadius:7,padding:12,display:"grid",gap:12}}>
       <div><strong>Choose what to do</strong><p style={{fontSize:12,margin:"4px 0"}}>Assign a real defect for repair, or dismiss an incorrect report after verifying the machine is safe.</p></div>
       <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
        <div>
         <label style={{display:"block",fontWeight:600}}>Mechanic
          <select style={{width:"100%",marginTop:6}} value={mechanicChoice[job.id]||job.assigned_engineer||""} onChange={e=>setMechanicChoice(p=>({...p,[job.id]:e.target.value}))}>
           <option value="">Select mechanic</option>{mechanics.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
         </label>
         <button type="button" className="primary" style={{marginTop:9,width:"100%"}} disabled={busy!==null||!(mechanicChoice[job.id]||job.assigned_engineer)} onClick={()=>void act(job,"assign")}><Wrench size={16}/> {busy===job.id?"Saving…":"Assign to mechanic"}</button>
        </div>
        <div>
         <label style={{display:"block",fontWeight:600}}>Dismissal / safety reason
          <textarea rows={2} style={{width:"100%",marginTop:6}} placeholder="Only for an incorrect report: explain checks made and why it is safe" value={reason[job.id]||""} onChange={e=>setReason(p=>({...p,[job.id]:e.target.value}))}/>
         </label>
         <label style={{display:"flex",alignItems:"flex-start",gap:7,margin:"5px 0 8px",fontSize:12}}><input type="checkbox" checked={!!safe[job.id]} onChange={e=>setSafe(p=>({...p,[job.id]:e.target.checked}))}/> I have verified the machine is safe to return to use.</label>
         <button type="button" className="secondary" style={{width:"100%"}} disabled={busy!==null||!safe[job.id]||(reason[job.id]||"").trim().length<15} onClick={()=>void act(job,"dismiss")}>{busy===job.id?"Saving…":"Dismiss & release if safe"}</button>
        </div>
       </div>
      </div>}
      {!isAdmin&&<small>Awaiting administrator review.</small>}
      {job&&job.status==="Assigned"&&<p style={{fontSize:12,marginTop:8}}>Assigned to {mechanicName(job.assigned_engineer)}. The mechanic must complete the workshop job and obtain office approval before the machine can be released.</p>}
     </div>;
    })}
    {isAdmin&&ready&&<div style={{marginTop:14,padding:12,background:"#fff",border:"1px solid #e0e7e0",borderRadius:7}}>
     <strong>Repair approved — ready for safety release</strong>
     <label style={{display:"block",marginTop:8}}>Checks completed / reason for release<textarea style={{width:"100%",marginTop:5}} rows={2} value={reason[asset]||""} onChange={e=>setReason(p=>({...p,[asset]:e.target.value}))}/></label>
     <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,margin:"8px 0"}}><input type="checkbox" checked={!!safe[asset]} onChange={e=>setSafe(p=>({...p,[asset]:e.target.checked}))}/> I confirm the defects have been resolved and this machine is safe.</label>
     <button type="button" className="primary" disabled={busy!==null||!safe[asset]||(reason[asset]||"").trim().length<15} onClick={()=>void release(asset)}><ShieldCheck size={16}/> {busy===asset?"Releasing…":"Release machine"}</button>
    </div>}
    {isAdmin&&<details style={{marginTop:13,borderTop:"1px solid #e9bdc3",paddingTop:10}}><summary style={{cursor:"pointer",fontWeight:700,fontSize:13}}>Audit trail · who did what and when ({(auditByAsset[asset]||[]).length})</summary><div style={{maxHeight:260,overflowY:"auto",marginTop:9}}>{(auditByAsset[asset]||[]).map(event=><div key={event.event_id} style={{padding:"7px 0",borderBottom:"1px solid #f0e5e7",fontSize:12}}><b>{event.action}</b> · {event.actor_name} · {dateLabel(event.happened_at)}{event.detail&&<div style={{color:"#596271",marginTop:3,whiteSpace:"pre-wrap"}}>{event.detail}</div>}</div>)}{!(auditByAsset[asset]||[]).length&&<p className="muted">No audit events for this machine yet.</p>}</div></details>}
   </article>;
  })}
  {history.length>0&&<details><summary style={{cursor:"pointer",fontWeight:600}}>Previous releases ({history.length})</summary>{history.slice(0,30).map(h=><div key={h.id} style={{fontSize:12,borderBottom:"1px solid #eee",padding:"8px 6px"}}><b>{assets[h.asset_id]||"Machine"}</b> · Released {h.released_at?dateLabel(h.released_at):""}<div>{h.release_notes||""}</div>{isAdmin&&<details style={{marginTop:5}}><summary style={{cursor:"pointer"}}>View user and timestamp history</summary>{(auditByAsset[h.asset_id]||[]).map(ev=><div key={ev.event_id} style={{margin:"6px 0"}}>{ev.action} · {ev.actor_name} · {dateLabel(ev.happened_at)}</div>)}</details>}</div>)}</details>}
 </section>;
}
