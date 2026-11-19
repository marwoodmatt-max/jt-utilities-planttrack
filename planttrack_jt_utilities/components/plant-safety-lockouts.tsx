"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck } from "lucide-react";

type Hold={id:string;asset_id:string;inspection_id:string;locked_at:string;defect_summary:string;previous_status:string;released_at:string|null;released_by:string|null;release_notes:string|null};
type Job={id:string;inspection_id:string|null;status:string;job_card_number:string|null};
const dateLabel=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");

export default function PlantSafetyLockouts({supabase,isAdmin,assetId}:{supabase:SupabaseClient;isAdmin:boolean;assetId?:string}){
  const [holds,setHolds]=useState<Hold[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [assets,setAssets]=useState<Record<string,string>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [dismissalReasons,setDismissalReasons]=useState<Record<string,string>>({});
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    let query=supabase.from("plant_safety_lockouts").select("id,asset_id,inspection_id,locked_at,defect_summary,previous_status,released_at,released_by,release_notes").order("locked_at",{ascending:false}).limit(300);
    if(assetId)query=query.eq("asset_id",assetId);
    const [h,j,a]=await Promise.all([
      query,
      supabase.from("workshop_job_cards").select("id,inspection_id,status,job_card_number").not("inspection_id","is",null).limit(300),
      supabase.from("assets").select("id,asset_code").limit(1500)
    ]);
    if(h.error||j.error||a.error)setError("Unable to load safety lockouts: "+(h.error||j.error||a.error)?.message);
    else{setHolds((h.data||[]) as Hold[]);setJobs((j.data||[]) as Job[]);setAssets(Object.fromEntries((a.data||[]).map(x=>[x.id,x.asset_code])));}
    setLoading(false);
  },[supabase,assetId]);
  useEffect(()=>{void load();const channel=supabase.channel("plant-safety-holds-"+(assetId||"all")).on("postgres_changes",{event:"*",schema:"public",table:"plant_safety_lockouts"},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[supabase,assetId,load]);
  const active=holds.filter(h=>!h.released_at),history=holds.filter(h=>Boolean(h.released_at));
  const byAsset=Array.from(new Set(active.map(h=>h.asset_id)));
  const associated=(hold:Hold)=>jobs.find(job=>job.inspection_id===hold.inspection_id);
  async function dismissIncorrectJob(job:Job){
    if(!job.id||busy)return;
    const reason=(dismissalReasons[job.id]||"").trim();
    if(reason.length<5){setError("Please enter a reason for dismissing this reported defect.");return;}
    setError("");setNotice("");setBusy(job.id);
    const {error:rpcError}=await supabase.rpc("admin_triage_plant_defect_job",{p_job:job.id,p_action:"dismiss",p_mechanic:null,p_reason:reason});
    if(rpcError)setError("Job card could not be dismissed: "+rpcError.message);
    else{
      setNotice("Defect job dismissed with your reason. The machine remains locked out until you separately confirm it is safe and authorise release.");
      setDismissalReasons(prev=>({...prev,[job.id]:""}));
      await load();
    }
    setBusy(null);
  }
  async function release(id:string){
    if(busy)return;
    const detail=(notes[id]||"").trim();
    if(detail.length<15||!confirmed[id]){setError("Confirm the machine is safe and enter at least 15 characters describing the repairs or inspection.");return;}
    setError("");setNotice("");setBusy(id);
    const {data,error:err}=await supabase.rpc("release_plant_safety_lockout",{p_asset:id,p_confirmation:detail,p_confirm_safe:true});
    if(err)setError("Safety release refused: "+err.message);
    else{setNotice(String(data||"Safety hold released"));setNotes(prev=>({...prev,[id]:""}));setConfirmed(prev=>({...prev,[id]:false}));await load();}
    setBusy(null);
  }
  return <section className="panel" style={{borderTop:"4px solid #dc2626",marginBottom:22}}>
    <div className="panel-head"><div><h3><AlertTriangle size={19} style={{verticalAlign:"-4px",marginRight:7,color:"#dc2626"}}/>Plant safety lockouts ({byAsset.length})</h3><p>Machine use is prohibited until every safety hold is properly released</p></div><button type="button" className="secondary" onClick={()=>void load()} disabled={loading}><RefreshCcw size={15}/> Refresh</button></div>
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {notice&&<div className="notice" role="status">{notice}</div>}
    {loading?<p>Loading safety holds…</p>:byAsset.length===0?<p><CheckCircle2 size={16} style={{verticalAlign:"-3px",marginRight:6}}/>No active plant safety lockouts.</p>:byAsset.map(id=>{
      const entries=active.filter(h=>h.asset_id===id);
      const allResolved=entries.every(h=>["Approved","Dismissed"].includes(associated(h)?.status||""));
      return <div key={id} style={{border:"2px solid #ef4444",borderRadius:6,padding:14,marginBottom:14,background:"#fff8f8"}}>
        <h4 style={{margin:"0 0 6px",color:"#b91c1c"}}>LOCKED OUT — {assets[id]||"Machine"}</h4>
        <p style={{fontSize:12,fontWeight:600}}>Do not operate, physically isolate and tag out where required. {entries.length} outstanding failed inspection(s).</p>
        {entries.map(h=><div key={h.id} style={{borderTop:"1px solid #fecaca",padding:"9px 0"}}>
          <strong>{dateLabel(h.locked_at)}</strong>
          <div style={{fontSize:13,marginTop:4}}>{h.defect_summary}</div>
          <div style={{fontSize:12,marginTop:5}}>Linked job card: <b>{associated(h)?.job_card_number||"Inspection defect job"}</b> · Status: <b>{associated(h)?.status||"Not found"}</b></div>
          {isAdmin&&associated(h)&&["New","Assigned"].includes(associated(h)!.status)&&<div style={{marginTop:9,padding:11,background:"#fff",border:"1px solid #fca5a5",borderRadius:5}}>
            <strong>Incorrect defect / test? Dismiss the job card here</strong>
            <p style={{fontSize:12,margin:"5px 0"}}>Only dismiss if the report was incorrect or there is no genuine defect. For genuine defects, assign a mechanic and complete the repair first.</p>
            <label>Reason for dismissing this job
              <textarea rows={2} style={{width:"100%",marginTop:5}} placeholder="e.g. Test-machine inspection only; equipment checked and no actual defect found" value={dismissalReasons[associated(h)!.id]||""} onChange={e=>setDismissalReasons(prev=>({...prev,[associated(h)!.id]:e.target.value}))}/>
            </label>
            <button type="button" className="secondary" disabled={busy!==null||(dismissalReasons[associated(h)!.id]||"").trim().length<5} onClick={()=>void dismissIncorrectJob(associated(h)!)}>{busy===associated(h)!.id?"Dismissing…":"Dismiss incorrect / test job card"}</button>
          </div>}
        </div>)}
        {isAdmin&&<div style={{background:"#fff",border:"1px solid #fca5a5",padding:12,marginTop:10}}>
          {!allResolved&&<p role="alert" style={{color:"#991b1b",fontWeight:650}}>Step 1: Every related defect job must be Approved after repair or Dismissed with a reason. For an incorrect test defect, use the dismissal form directly above.</p>}
          {allResolved&&<p style={{color:"#166534",fontWeight:650}}>Step 1 complete: all associated job cards have been reviewed. Step 2: confirm the machine has been checked and is safe to return to service.</p>}
          <label>Repairs and safety confirmation<textarea rows={3} value={notes[id]||""} onChange={e=>setNotes(p=>({...p,[id]:e.target.value}))} placeholder="Describe repairs, reinspection, checks and why the machine is safe to return to service" style={{width:"100%",marginTop:6}}/></label>
          <label style={{display:"flex",gap:8,alignItems:"start",fontWeight:550}}><input type="checkbox" checked={Boolean(confirmed[id])} onChange={e=>setConfirmed(p=>({...p,[id]:e.target.checked}))}/> I have confirmed that all recorded defects are resolved and the machine is safe to release.</label>
          <button type="button" className="primary" disabled={!allResolved||busy!==null||!confirmed[id]||(notes[id]||"").trim().length<15} onClick={()=>void release(id)}><ShieldCheck size={16}/> {busy===id?"Releasing…":"Authorise safety release"}</button>
          {!allResolved&&<small style={{display:"block",marginTop:7}}>The release button will enable after the job-card review above is completed.</small>}
        </div>}
      </div>;
    })}
    {history.length>0&&<details style={{marginTop:15}}><summary style={{cursor:"pointer",fontWeight:650}}>Previous authorised releases ({history.length})</summary><div style={{marginTop:10}}>{history.slice(0,40).map(h=><div key={h.id} style={{borderBottom:"1px solid #e5e7eb",padding:"9px 0"}}><b>{assets[h.asset_id]||"Asset"}</b> · Released {h.released_at?dateLabel(h.released_at):""}<div style={{fontSize:12}}>{h.release_notes}</div></div>)}</div></details>}
  </section>;
}
