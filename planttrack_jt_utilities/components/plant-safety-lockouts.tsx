"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck } from "lucide-react";

type Hold={id:string;asset_id:string;inspection_id:string;locked_at:string;defect_summary:string;previous_status:string;released_at:string|null;released_by:string|null;release_notes:string|null};
type Job={inspection_id:string|null;status:string;job_card_number:string|null};
const dateLabel=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");

export default function PlantSafetyLockouts({supabase,isAdmin,assetId}:{supabase:SupabaseClient;isAdmin:boolean;assetId?:string}){
  const [holds,setHolds]=useState<Hold[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [assets,setAssets]=useState<Record<string,string>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
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
      supabase.from("workshop_job_cards").select("inspection_id,status,job_card_number").not("inspection_id","is",null).limit(300),
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
          <div style={{fontSize:12,marginTop:5}}>Linked job card: <b>{associated(h)?.job_card_number||associated(h)?.status||"Awaiting review"}</b> · Status: {associated(h)?.status||"Not found"}</div>
        </div>)}
        {isAdmin&&<div style={{background:"#fff",border:"1px solid #fca5a5",padding:12,marginTop:10}}>
          {!allResolved&&<p role="alert" style={{color:"#991b1b",fontWeight:650}}>Release blocked: every related defect job must first be Approved or Dismissed with a reason in Workshop Job Cards.</p>}
          <label>Repairs and safety confirmation<textarea rows={3} value={notes[id]||""} onChange={e=>setNotes(p=>({...p,[id]:e.target.value}))} placeholder="Describe repairs, reinspection, checks and why the machine is safe to return to service" style={{width:"100%",marginTop:6}}/></label>
          <label style={{display:"flex",gap:8,alignItems:"start",fontWeight:550}}><input type="checkbox" checked={Boolean(confirmed[id])} onChange={e=>setConfirmed(p=>({...p,[id]:e.target.checked}))}/> I have confirmed that all recorded defects are resolved and the machine is safe to release.</label>
          <button type="button" className="primary" disabled={!allResolved||busy!==null||!confirmed[id]||(notes[id]||"").trim().length<15} onClick={()=>void release(id)}><ShieldCheck size={16}/> {busy===id?"Releasing…":"Authorise safety release"}</button>
        </div>}
      </div>;
    })}
    {history.length>0&&<details style={{marginTop:15}}><summary style={{cursor:"pointer",fontWeight:650}}>Previous authorised releases ({history.length})</summary><div style={{marginTop:10}}>{history.slice(0,40).map(h=><div key={h.id} style={{borderBottom:"1px solid #e5e7eb",padding:"9px 0"}}><b>{assets[h.asset_id]||"Asset"}</b> · Released {h.released_at?dateLabel(h.released_at):""}<div style={{fontSize:12}}>{h.release_notes}</div></div>)}</div></details>}
  </section>;
}
