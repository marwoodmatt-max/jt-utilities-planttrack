"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Download, RefreshCw, X } from "lucide-react";

type Asset={id:string;asset_code:string;description:string|null;registration:string|null;ownership_type:string|null};
type Project={id:string;project_name:string;status:string};
type Allocation={id:string;asset_id:string;project_id:string;allocated_at:string;returned_at:string|null};
type Inspection={id:string;asset_id:string|null;project_id:string|null;submitted_at:string;result:string;answers:Record<string,unknown>|null;report_path:string|null;comments:string|null};
type Evidence={path:string;prompt:string};
type Status="checked"|"missing"|"defect";
type Line={asset:Asset;project:Project;status:Status;latest:Inspection|null;defects:Inspection[];count:number};
const ukParts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"});
const ukDate=(date:Date)=>{const p=Object.fromEntries(ukParts.formatToParts(date).map(part=>[part.type,part.value]));return p.year+"-"+p.month+"-"+p.day;};
const displayDate=(date:string)=>date.slice(8,10)+"-"+date.slice(5,7)+"-"+date.slice(0,4);
const displayTime=(iso:string)=>new Date(iso).toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"});
function evidenceFor(record:Inspection):Evidence[]{const evidence=record.answers?._photo_evidence;return Array.isArray(evidence)?evidence.filter((entry):entry is Evidence=>typeof entry?.path==="string"&&typeof entry?.prompt==="string"):[];}
const labelStatus=(status:Status)=>status==="defect"?"Defect reported":status==="checked"?"Checked":"Not checked";
const statusRank:Record<Status,number>={defect:0,missing:1,checked:2};

export default function DailyInspectionDashboard({supabase,onOpenChecks}:{supabase:SupabaseClient;onOpenChecks:()=>void}){
 const [date,setDate]=useState(()=>ukDate(new Date()));
 const [projectFilter,setProjectFilter]=useState("all");
 const [statusFilter,setStatusFilter]=useState("all");
 const [assets,setAssets]=useState<Asset[]>([]);
 const [projects,setProjects]=useState<Project[]>([]);
 const [allocations,setAllocations]=useState<Allocation[]>([]);
 const [inspections,setInspections]=useState<Inspection[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [linkBusy,setLinkBusy]=useState<string|null>(null);
 const [photoRecord,setPhotoRecord]=useState<Inspection|null>(null);
 const [photoLinks,setPhotoLinks]=useState<{prompt:string;url:string}[]>([]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [a,p,al]=await Promise.all([
    supabase.from("assets").select("id,asset_code,description,registration,ownership_type").order("asset_code").limit(2000),
    supabase.from("projects").select("id,project_name,status").eq("status","active").order("project_name").limit(500),
    supabase.from("project_allocations").select("id,asset_id,project_id,allocated_at,returned_at").is("returned_at",null).order("allocated_at",{ascending:false}).limit(3000)
   ]);
   if(a.error||p.error||al.error)throw(a.error||p.error||al.error);
   // Include a day's surrounding UTC hours so the UK daylight-saving boundary is handled
   // by the actual Europe/London date comparison below.
   const start=new Date(date+"T00:00:00Z");start.setUTCDate(start.getUTCDate()-1);
   const end=new Date(date+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+2);
   const relevant:Inspection[]=[];
   for(let offset=0;offset<10000;offset+=1000){
    const batch=await supabase.from("inspections")
     .select("id,asset_id,project_id,submitted_at,result,answers,report_path,comments")
     .eq("inspection_type","daily_plant_pre_start")
     .gte("submitted_at",start.toISOString()).lt("submitted_at",end.toISOString())
     .order("submitted_at",{ascending:false}).range(offset,offset+999);
    if(batch.error)throw batch.error;
    const rows=(batch.data||[]) as Inspection[];
    relevant.push(...rows.filter(record=>ukDate(new Date(record.submitted_at))===date));
    if(rows.length<1000)break;
    if(offset===9000)throw new Error("Too many inspections to load for the selected day.");
   }
   setAssets((a.data||[]) as Asset[]);
   setProjects((p.data||[]) as Project[]);
   setAllocations((al.data||[]) as Allocation[]);
   setInspections(relevant);
  }catch(e){setError("Could not load daily inspection compliance: "+(e instanceof Error?e.message:String(e)));}
  finally{setLoading(false);}
 },[supabase,date]);
 useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener("focus",refresh);
  const channel=supabase.channel("daily-inspection-compliance").on("postgres_changes",{event:"*",schema:"public",table:"inspections"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"project_allocations"},refresh).subscribe();
  return()=>{window.removeEventListener("focus",refresh);void supabase.removeChannel(channel);};
 },[supabase,load]);
 const lines=useMemo(()=>{
  const assetById=new Map(assets.map(a=>[a.id,a]));
  const projectById=new Map(projects.map(p=>[p.id,p]));
  const current=new Map<string,Allocation>();
  const today=new Date();
  for(const allocation of allocations){
   if(!projectById.has(allocation.project_id)||!assetById.has(allocation.asset_id))continue;
   // Only allocations already in effect on the chosen day; future allocations must not count.
   if(allocation.allocated_at&&ukDate(new Date(allocation.allocated_at))>date)continue;
   const previous=current.get(allocation.asset_id);
   if(!previous||allocation.allocated_at>previous.allocated_at)current.set(allocation.asset_id,allocation);
  }
  const byAsset=new Map<string,Inspection[]>();
  for(const i of inspections){
   if(!i.asset_id)continue;const list=byAsset.get(i.asset_id)||[];list.push(i);byAsset.set(i.asset_id,list);
  }
  const entries:Line[]=[];
  for(const [id,allocation] of current){
   const asset=assetById.get(id),project=projectById.get(allocation.project_id);
   if(!asset||!project)continue;
   const dayChecks=byAsset.get(id)||[];
   const defects=dayChecks.filter(i=>i.result==="fail");
   const latest=dayChecks[0]||null;
   entries.push({asset,project,status:defects.length?"defect":dayChecks.length?"checked":"missing",latest,defects,count:dayChecks.length});
  }
  return entries.sort((a,b)=>statusRank[a.status]-statusRank[b.status]||a.project.project_name.localeCompare(b.project.project_name)||a.asset.asset_code.localeCompare(b.asset.asset_code));
 },[assets,projects,allocations,inspections,date]);
 const visible=lines.filter(line=>(projectFilter==="all"||line.project.id===projectFilter)&&(statusFilter==="all"||line.status===statusFilter));
 const totals={total:visible.length,checked:visible.filter(v=>v.status==="checked").length,missing:visible.filter(v=>v.status==="missing").length,defect:visible.filter(v=>v.status==="defect").length};
 async function openReport(row:Inspection){
  setError("");setLinkBusy(row.id);
  try{
   if(!row.report_path){setError("This inspection PDF has not been filed yet. Open Plant Checks and select File PDF on the inspection.");return;}
   const {data,error}=await supabase.storage.from("plant-inspection-reports").createSignedUrl(row.report_path,600);
   if(error||!data)throw error||new Error("PDF link unavailable");
   window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }catch(e){setError("Could not open inspection PDF: "+(e instanceof Error?e.message:String(e)));}
  finally{setLinkBusy(null);}
 }
 async function openPhotos(row:Inspection){
  setError("");setLinkBusy(row.id);setPhotoRecord(null);setPhotoLinks([]);
  try{
   const evidence=evidenceFor(row);
   if(!evidence.length)throw new Error("No photographs are attached to this inspection");
   const links: {prompt:string;url:string}[]=[];
   for(const file of evidence){
    const {data,error}=await supabase.storage.from("plant-inspection-photos").createSignedUrl(file.path,600);
    if(error||!data)throw error||new Error("Photo link unavailable");
    links.push({prompt:file.prompt,url:data.signedUrl});
   }
   setPhotoLinks(links);setPhotoRecord(row);
  }catch(e){setError("Could not open inspection photographs: "+(e instanceof Error?e.message:String(e)));}
  finally{setLinkBusy(null);}
 }
 return <section className="panel" id="daily-inspection-dashboard" style={{marginTop:24,borderTop:"4px solid #e31b36"}}>
  <div className="panel-head"><div><h3><ClipboardCheck size={19} style={{verticalAlign:"-4px",marginRight:8,color:"#e31b36"}}/>Daily Plant Inspection Compliance</h3><p>Machines allocated to active projects right now · Only recorded daily pre-start inspections count</p></div><button type="button" className="secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end",margin:"15px 0"}}>
   <label style={{fontSize:12,fontWeight:700}}>Inspection date
    <input aria-label="Inspection date" type="date" max={ukDate(new Date())} value={date} onChange={e=>setDate(e.target.value)} style={{display:"block",marginTop:5,minWidth:145}}/>
    <small style={{display:"block",fontWeight:400}}>Showing {displayDate(date)} (UK)</small>
   </label>
   <label style={{fontSize:12,fontWeight:700}}>Project
    <select aria-label="Filter by project" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)} style={{display:"block",marginTop:5,minWidth:185}}><option value="all">All active projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_name}</option>)}</select>
   </label>
   <label style={{fontSize:12,fontWeight:700}}>Inspection status
    <select aria-label="Filter by inspection status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{display:"block",marginTop:5,minWidth:150}}><option value="all">All statuses</option><option value="missing">Not checked</option><option value="checked">Checked</option><option value="defect">Defect reported</option></select>
   </label>
   <button type="button" className="secondary" onClick={onOpenChecks}>Open Plant Checks</button>
  </div>
  {error&&<p className="auth-error" role="alert">{error}</p>}
  {loading?<p>Loading inspection compliance…</p>:<>
   <div className="stats" style={{margin:"15px 0 18px"}}>
    {[
      ["Allocated machines",totals.total,"Active project allocations",ClipboardCheck],
      ["Checked today",totals.checked,"No reported defects on selected date",CheckCircle2],
      ["Not checked",totals.missing,"No daily check submitted",AlertTriangle],
      ["Defects reported",totals.defect,"At least one failed daily check",AlertTriangle]
    ].map(([label,value,caption,Icon]:any)=><div className="stat" key={label} style={{borderTopColor:label==="Defects reported"&&value>0?"#dc2626":undefined}}><div className="stat-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{caption}</small></div>)}
   </div>
   <div className="table-wrap"><table><thead><tr><th>Machine</th><th>Project</th><th>Status</th><th>Operator / time (UK)</th><th>Report / evidence</th></tr></thead><tbody>
    {visible.map(line=><tr key={line.asset.id}>
      <td><b>{line.asset.asset_code}</b><small>{line.asset.description||line.asset.registration||"Registered asset"}{line.asset.ownership_type==="hired_in"?" · Hired-in":""}</small></td>
      <td>{line.project.project_name}</td>
      <td><span className={"tag "+(line.status==="checked"?"green":line.status==="defect"?"red":"amber")}>{labelStatus(line.status)}</span>{line.count>1&&<small>{line.count} inspections</small>}</td>
      <td>{line.latest?<>{String(line.latest.answers?._operator||"Not recorded")}<small>{displayTime(line.latest.submitted_at)} · {displayDate(date)}</small></>:"—"}</td>
      <td>{line.latest?<div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
        <button type="button" className="secondary" disabled={linkBusy===line.latest.id||!line.latest.report_path} onClick={()=>void openReport(line.latest!)} title={!line.latest.report_path?"PDF not filed yet":"Open latest inspection PDF"}><Download size={14}/> PDF</button>
        <button type="button" className="secondary" disabled={linkBusy===line.latest.id||!evidenceFor(line.latest).length} onClick={()=>void openPhotos(line.latest!)}><Camera size={14}/> Photos</button>
        {line.status==="defect"&&line.defects[0].id!==line.latest.id&&<button type="button" className="secondary" onClick={()=>void openReport(line.defects[0])} disabled={!line.defects[0].report_path}>Defect PDF</button>}
      </div>:<span style={{color:"#64748b"}}>Awaiting inspection</span>}</td>
    </tr>)}
   </tbody></table>{visible.length===0&&<p style={{padding:14}}>{lines.length===0?"No machines are currently allocated to an active project for this date.":"No machines match the selected filters."}</p>}</div>
   <p className="muted" style={{marginTop:13,fontSize:12}}>Each machine is counted once. If any inspection for the selected day reports a defect, it stays in “Defects reported” even after a later pass. This report uses current active project allocations, not historical allocation records. Hired-in machines count when registered and allocated; one-off unregistered hires cannot be matched to an asset.</p>
  </>}
  {photoRecord&&<div style={{marginTop:18,padding:14,border:"1px solid #e2e8f0",borderRadius:6}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h4>Inspection photographs · {displayDate(date)}</h4><button className="secondary" type="button" onClick={()=>{setPhotoRecord(null);setPhotoLinks([]);}}><X size={14}/> Close</button></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginTop:12}}>{photoLinks.map((photo,i)=><div key={i}><b>{photo.prompt}</b><a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.prompt} style={{display:"block",width:"100%",maxHeight:260,objectFit:"contain",marginTop:7,border:"1px solid #e2e8f0"}}/></a></div>)}</div>
  </div>}
 </section>;
}
