"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileText, RefreshCw } from "lucide-react";
import { generateManagementReportPdf, reportCsv, type ReportTable } from "../lib/management-report-pdf";
import { requiresDailyPlantCheck, ukDateString } from "../lib/daily-check-requirements";

type Kind="checks"|"loler"|"workshop"|"safety"|"pmi";
type Asset={id:string;asset_code:string;description:string|null;category:string|null;daily_plant_check_required:boolean|null;status:string;pmi_next_due:string|null;pmi_last_completed:string|null;registration:string|null};
type Inspection={id:string;asset_id:string|null;hired_plant_name:string|null;submitted_at:string;result:string;answers:Record<string,string>|null;comments:string|null};
type Exam={id:string;asset_id:string;examination_type:string;examined_at:string|null;next_due:string|null;report_reference:string|null};
type Job={id:string;asset_id:string;job_card_number:string|null;job_type:string|null;title:string;priority:string;status:string;created_at:string;engineer_hours:number|null;engineer_signed_at:string|null;office_signed_at:string|null};
type Hold={id:string;asset_id:string;defect_summary:string|null;locked_at:string;released_at:string|null;release_notes:string|null};
type Pmi={id:string;asset_id:string;inspected_on:string;result:string;inspector_name:string|null;defects:string|null};
const config:{key:Kind;name:string;help:string}[]=[
 {key:"checks",name:"Daily Plant Checks",help:"Checks completed, defects and machine coverage"},
 {key:"loler",name:"LOLER Due & Overdue",help:"Latest recorded examination due date for each asset"},
 {key:"workshop",name:"Workshop Jobs",help:"Job status, mechanic hours and office sign-off"},
 {key:"safety",name:"Plant Lockouts",help:"Safety holds, releases and recorded reasons"},
 {key:"pmi",name:"HGV / Trailer PMI",help:"PMI due dates and recorded inspections"}
];
const date=(value:string|null|undefined)=>value?String(value).slice(0,10).split("-").reverse().join("-"):"Not recorded";
const dateTime=(value:string|null|undefined)=>value?new Date(value).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",",""):"Not recorded";
const addDays=(value:string,days:number)=>{const d=new Date(value+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const nonTest=(code:string)=>!code.toUpperCase().startsWith("TEST-LOLER");
function saveBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export default function ManagementReports({supabase}:{supabase:SupabaseClient}){
 const [kind,setKind]=useState<Kind>("checks");
 const [days,setDays]=useState(30);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [preparedBy,setPreparedBy]=useState("");
 const [assets,setAssets]=useState<Asset[]>([]);
 const [inspections,setInspections]=useState<Inspection[]>([]);
 const [exams,setExams]=useState<Exam[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [holds,setHolds]=useState<Hold[]>([]);
 const [pmis,setPmis]=useState<Pmi[]>([]);
 const [refresh,setRefresh]=useState(0);
 const today=ukDateString(new Date());
 const periodStart=addDays(today,1-days);
 useEffect(()=>{let live=true;void (async()=>{
  setLoading(true);setError("");
  const [a,i,e,j,h,p,user]=await Promise.all([
   supabase.from("assets").select("id,asset_code,description,category,daily_plant_check_required,status,pmi_next_due,pmi_last_completed,registration").order("asset_code").limit(3000),
   supabase.from("inspections").select("id,asset_id,hired_plant_name,submitted_at,result,answers,comments").eq("inspection_type","daily_plant_pre_start").order("submitted_at",{ascending:false}).limit(5000),
   supabase.from("examinations").select("id,asset_id,examination_type,examined_at,next_due,report_reference").ilike("examination_type","%LOLER%").order("created_at",{ascending:false}).limit(3000),
   supabase.from("workshop_job_cards").select("id,asset_id,job_card_number,job_type,title,priority,status,created_at,engineer_hours,engineer_signed_at,office_signed_at").order("created_at",{ascending:false}).limit(3000),
   supabase.from("plant_safety_lockouts").select("id,asset_id,defect_summary,locked_at,released_at,release_notes").order("locked_at",{ascending:false}).limit(2000),
   supabase.from("hgv_pmi_records").select("id,asset_id,inspected_on,result,inspector_name,defects").order("inspected_on",{ascending:false}).limit(3000),
   supabase.auth.getUser()
  ]);
  if(!live)return;
  const failure=a.error||i.error||e.error||j.error||h.error||p.error||user.error;
  if(failure){setError("Could not load reporting data: "+failure.message);setLoading(false);return;}
  if(!user.data.user){setError("Sign in to view reports.");setLoading(false);return;}
  const profile=await supabase.from("profiles").select("full_name,role,active").eq("id",user.data.user.id).single();
  if(!live)return;
  if(profile.error||!profile.data?.active||profile.data.role!=="admin"){
   setError("Reports require an active Admin account.");setLoading(false);return;
  }
  setPreparedBy(profile.data.full_name||"Administrator");
  setAssets((a.data||[]) as Asset[]);setInspections((i.data||[]) as Inspection[]);setExams((e.data||[]) as Exam[]);
  setJobs((j.data||[]) as Job[]);setHolds((h.data||[]) as Hold[]);setPmis((p.data||[]) as Pmi[]);
  setLoading(false);
 })();return()=>{live=false;};},[supabase,refresh]);
 const report=useMemo<ReportTable>(()=>{
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  const name=(id:string|null)=>id?(assetMap.get(id)?.asset_code||"Unlisted asset"):"Hired plant";
  const active=assets.filter(a=>nonTest(a.asset_code));
  const windowText=date(periodStart)+" to "+date(today);
  const common={generatedBy:preparedBy||"JT Utilities office"};
  if(kind==="checks"){
   const required=active.filter(requiresDailyPlantCheck);
   const records=inspections.filter(i=>i.submitted_at.slice(0,10)>=periodStart&&i.submitted_at.slice(0,10)<=today&&(!i.asset_id||nonTest(name(i.asset_id))));
   const checked=new Set(records.map(i=>i.asset_id).filter(Boolean));
   const requiredChecked=required.filter(a=>checked.has(a.id)).length;
   const failed=records.filter(i=>i.result==="fail").length;
   return {...common,title:"Daily Plant Check Report",subtitle:"Completed pre-start checks: "+windowText,
    columns:["Machine / plant","Date and time","Operator","Result"],
    rows:records.map(i=>[i.asset_id?name(i.asset_id):i.hired_plant_name||"Hired plant",dateTime(i.submitted_at),i.answers?._operator||"Not recorded",i.result==="fail"?"DEFECT REPORTED":"Pass"]),
    summary:[records.length+" checks submitted in the selected period; "+failed+" flagged with defects.",
     requiredChecked+" of "+required.length+" registered machines requiring daily checks have at least one check in this period.",
     "Coverage is period-wide, not a daily compliance percentage. TEST-LOLER machines are excluded."]};
  }
  if(kind==="loler"){
   const latest=new Map<string,Exam>();
   for(const e of exams){if(!latest.has(e.asset_id))latest.set(e.asset_id,e);}
   const rows=[...latest.values()].filter(e=>nonTest(name(e.asset_id))).sort((a,b)=>String(a.next_due||"9999").localeCompare(String(b.next_due||"9999")));
   const overdue=rows.filter(e=>e.next_due&&e.next_due<today).length;
   const dueSoon=rows.filter(e=>e.next_due&&e.next_due>=today&&e.next_due<=addDays(today,30)).length;
   return {...common,title:"LOLER Due & Overdue Report",subtitle:"Latest recorded examinations as at "+date(today),
    columns:["Asset","Last examined","Next due","Status"],
    rows:rows.map(e=>[name(e.asset_id),date(e.examined_at),date(e.next_due),!e.next_due?"Due date missing":e.next_due<today?"OVERDUE":e.next_due<=addDays(today,30)?"Due within 30 days":"Scheduled"]),
    summary:[overdue+" overdue examinations; "+dueSoon+" due in the next 30 days.",
     "This is a due-date tracking report, not a statutory LOLER certificate. See original certificates for examination findings.",
     "Only assets with a recorded LOLER examination appear. TEST-LOLER machines are excluded."]};
  }
  if(kind==="workshop"){
   const rows=jobs.filter(j=>j.created_at.slice(0,10)>=periodStart&&j.created_at.slice(0,10)<=today&&nonTest(name(j.asset_id)));
   const awaiting=rows.filter(j=>j.status==="Awaiting office approval").length;
   const approved=rows.filter(j=>j.status==="Approved").length;
   const hours=rows.reduce((n,j)=>n+Number(j.engineer_hours||0),0);
   return {...common,title:"Workshop Job Report",subtitle:"Job cards raised: "+windowText,
    columns:["Job number / asset","Work type","Status","Hours"],
    rows:rows.map(j=>[(j.job_card_number||j.id.slice(0,8))+" / "+name(j.asset_id),j.job_type||j.title,j.status,String(j.engineer_hours??"—")]),
    summary:[rows.length+" jobs raised; "+approved+" approved; "+awaiting+" awaiting office approval.",hours.toFixed(2)+" total recorded mechanic hours.",
     "Job status and sign-off are sourced from PlantTrack. Labour and parts costs are not calculated because no approved cost rates are recorded."]};
  }
  if(kind==="safety"){
   const rows=holds.filter(h=>h.locked_at.slice(0,10)>=periodStart&&h.locked_at.slice(0,10)<=today&&nonTest(name(h.asset_id)));
   const activeHolds=holds.filter(h=>!h.released_at&&nonTest(name(h.asset_id)));
   return {...common,title:"Plant Safety Lockout Report",subtitle:"New safety holds: "+windowText,
    columns:["Asset","Locked at","Status","Defect / reason"],
    rows:rows.map(h=>[name(h.asset_id),dateTime(h.locked_at),h.released_at?"Released "+date(h.released_at):"LOCKED OUT",h.defect_summary||"See recorded inspection"]),
    summary:[activeHolds.length+" currently active safety lockouts across the plant register.",rows.length+" lockouts started in this reporting period.",
     "Safety lockout status is an operational record. This report does not authorise any machine to be returned to service."]};
  }
  const rows=pmis.filter(p=>p.inspected_on>=periodStart&&p.inspected_on<=today&&nonTest(name(p.asset_id)));
  const due=active.filter(a=>a.pmi_next_due);
  const overdue=due.filter(a=>a.pmi_next_due!<today);
  const upcoming=due.filter(a=>a.pmi_next_due!>=today&&a.pmi_next_due!<=addDays(today,30));
  return {...common,title:"HGV / Trailer PMI Report",subtitle:"PMI inspections: "+windowText,
   columns:["Asset","Inspection date","Result","Inspector"],
   rows:rows.map(p=>[name(p.asset_id),date(p.inspected_on),p.result||"Not recorded",p.inspector_name||"Not recorded"]),
   summary:[rows.length+" PMI inspections recorded in this period.",overdue.length+" registered PMI due dates overdue; "+upcoming.length+" due within the next 30 days.",
    "Use the individually filed PMI records for the complete statutory or inspection details."]};
 },[kind,days,assets,inspections,exams,jobs,holds,pmis,periodStart,today,preparedBy]);
 const pdf=async()=>{
  if(loading||error)return;setBusy(true);setNotice("");
  try{saveBlob(await generateManagementReportPdf(report),"JT-Utilities-"+kind+"-"+today+".pdf");setNotice("Branded PDF report downloaded.");}
  catch(e){setError("PDF could not be generated: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 const csv=()=>{saveBlob(reportCsv(report),"JT-Utilities-"+kind+"-"+today+".csv");setNotice("CSV report downloaded.");};
 return <section className="panel management-reports">
  <div className="panel-head"><div><h3>JT Utilities Reports</h3><p>Live management reporting · Branded PDFs with JT Utilities logo · UK dates</p></div><button type="button" className="secondary" disabled={loading} onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={15}/> Refresh</button></div>
  {error&&<p role="alert" className="auth-error">{error}</p>}
  {notice&&<p role="status" className="notice">{notice}</p>}
  <div className="management-report-picker" role="group" aria-label="Select report">
   {config.map(c=><button key={c.key} type="button" className={kind===c.key?"active":""} aria-pressed={kind===c.key} onClick={()=>{setKind(c.key);setNotice("");}}><FileText size={19}/><strong>{c.name}</strong><small>{c.help}</small></button>)}
  </div>
  <div className="management-report-bar">
   <label>Report period <select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
   <div><button type="button" className="primary" disabled={busy||loading||!!error} onClick={()=>void pdf()}><Download size={16}/> {busy?"Preparing PDF…":"Download branded PDF"}</button><button type="button" className="secondary" disabled={loading||!!error} onClick={csv}><Download size={16}/> Export CSV</button></div>
  </div>
  {loading?<p>Loading current PlantTrack records…</p>:!error&&<div className="management-report-preview">
   <img src="/jt-utilities-logo.jpg" alt="JT Utilities" width={135} height={67} style={{objectFit:"contain"}}/>
   <div><h4>{report.title}</h4><p>{report.subtitle}</p></div>
   <div className="management-report-metrics">{report.summary.map((line,i)=><p key={i}>{line}</p>)}</div>
   <p className="muted">{report.rows.length} report rows · Preview of first 30. Download PDF or CSV for all returned rows.</p>
   <div className="table-wrap"><table><thead><tr>{report.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{report.rows.slice(0,30).map((r,i)=><tr key={i}>{r.map((value,j)=><td key={j}>{value}</td>)}</tr>)}</tbody></table>{report.rows.length===0&&<p className="muted">No matching records for this report.</p>}</div>
  </div>}
  <p className="muted">Reports are generated from existing records and downloaded to your device. No inspections, approvals or safety statuses are changed.</p>
 </section>;
}
