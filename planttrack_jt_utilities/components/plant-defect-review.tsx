"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, RefreshCcw, Wrench } from "lucide-react";

type DefectJob={id:string;inspection_id:string|null;asset_id:string;title:string;instructions:string;priority:string;status:string;created_at:string;assigned_engineer:string|null;office_comments:string|null};
type Mechanic={id:string;name:string};
const displayDate=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");

export default function PlantDefectReview({supabase,onOpenWorkshop}:{supabase:SupabaseClient;onOpenWorkshop:()=>void}){
  const [jobs,setJobs]=useState<DefectJob[]>([]);
  const [mechanics,setMechanics]=useState<Mechanic[]>([]);
  const [assets,setAssets]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState<Record<string,string>>({});
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    const [j,m,a]=await Promise.all([
      supabase.from("workshop_job_cards").select("id,inspection_id,asset_id,title,instructions,priority,status,created_at,assigned_engineer,office_comments").not("inspection_id","is",null).order("created_at",{ascending:false}).limit(100),
      supabase.rpc("list_plant_defect_mechanics"),
      supabase.from("assets").select("id,asset_code")
    ]);
    if(j.error||m.error||a.error)setError("Could not load defect jobs: "+(j.error||m.error||a.error)?.message);
    else{setJobs((j.data||[]) as DefectJob[]);setMechanics((m.data||[]) as Mechanic[]);setAssets(Object.fromEntries((a.data||[]).map(v=>[v.id,v.asset_code])));}
    setLoading(false);
  },[supabase]);
  useEffect(()=>{void load();const channel=supabase.channel("daily-plant-defect-review").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[supabase,load]);
  const pending=jobs.filter(j=>j.status==="New"||j.status==="Assigned");
  async function triage(job:DefectJob,action:"assign"|"dismiss"){
    setError("");setNotice("");
    if(action==="assign"&&!selected[job.id]){setError("Choose the mechanic before assigning this job.");return;}
    if(action==="dismiss"&&(reasons[job.id]||"").trim().length<5){setError("Enter a reason for dismissing the defect job (at least 5 characters).");return;}
    setBusy(job.id);
    const {error,result}=await (async()=>{const {data,error}=await supabase.rpc("admin_triage_plant_defect_job",{p_job:job.id,p_action:action,p_mechanic:action==="assign"?selected[job.id]:null,p_reason:action==="dismiss"?reasons[job.id]:null});return {error,result:data};})();
    if(error)setError("Could not change job status: "+error.message);
    else{setNotice(action==="dismiss"?"Job card dismissed and reason recorded. The failed inspection is retained and does not clear the machine for use.":"Job card assigned to mechanic.");await load();}
    setBusy(null);
  }
  return <section className="panel" style={{marginBottom:20,borderTop:"4px solid #e31b36"}}>
    <div className="panel-head"><div><h3><AlertTriangle size={18} style={{verticalAlign:"-3px",color:"#d91f32",marginRight:7}}/>Daily plant inspection defects</h3><p>{pending.length} job card(s) awaiting admin review or mechanic allocation</p></div><button className="secondary" type="button" onClick={()=>void load()}><RefreshCcw size={15}/> Refresh</button></div>
    {error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
    {loading?<p>Loading reported defects…</p>:pending.length===0?<p><CheckCircle2 size={17} style={{verticalAlign:"-4px",marginRight:7}}/>No new plant defects requiring review.</p>:pending.map(job=><article key={job.id} style={{border:"1px solid #f1bac3",borderLeft:"5px solid #e31b36",borderRadius:4,padding:15,marginBottom:12,background:"#fffafb"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div><strong>{assets[job.asset_id]||"Asset"} · {job.title}</strong><p style={{margin:"4px 0",fontSize:12}}>{displayDate(job.created_at)} · {job.status} · {job.priority} priority</p></div>
        <span className="tag red">Defect reported</span>
      </div>
      <p style={{fontSize:13,whiteSpace:"pre-wrap",margin:"10px 0"}}>{job.instructions}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:12}}>
        <div><label>Allocate to mechanic<select style={{width:"100%",marginTop:6}} value={selected[job.id]||job.assigned_engineer||""} onChange={e=>setSelected(old=>({...old,[job.id]:e.target.value}))}><option value="">Choose mechanic</option>{mechanics.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button type="button" className="primary" disabled={busy===job.id} onClick={()=>void triage(job,"assign")}><Wrench size={15}/> Assign to mechanic</button></div>
        <div><label>Dismissal reason (admin decision)<textarea rows={2} style={{width:"100%",marginTop:6}} value={reasons[job.id]||""} onChange={e=>setReasons(old=>({...old,[job.id]:e.target.value}))} placeholder="Explain why no job card is required"/></label><button type="button" className="secondary" disabled={busy===job.id} onClick={()=>void triage(job,"dismiss")}>Dismiss job with reason</button></div>
      </div>
      <small>Dismissal closes the job-card request only. The original failed check remains saved and the machine must not be operated if unsafe.</small>
    </article>)}
    {jobs.length>0&&<button className="secondary" type="button" onClick={onOpenWorkshop}>Open all workshop job cards</button>}
  </section>;
}
