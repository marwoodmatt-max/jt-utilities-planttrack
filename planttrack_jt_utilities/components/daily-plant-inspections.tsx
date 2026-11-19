"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDailyInspectionPdf } from "../lib/daily-inspection-pdf";

export const dailyPlantChecks = [
  "Operator understands machine",
  "Check fire extinguisher",
  "Check steps and handrails",
  "Check seating and seatbelts",
  "Check hydraulic hoses",
  "Check engine bay is clean",
  "Check for fuel, coolant or oil leaks",
  "Check engine and hydraulic oil level",
  "Check engine coolant",
  "Check spray bar (Roller)",
  "Check drums (Roller)",
  "Abrasive wheel bearings (Trencher)",
  "Mirrors, CCTV reversing system",
  "Abrasive wheel, teeth and picks (Top Cutter & Trencher)",
  "Check exhaust system",
  "Check booms/boom pins/cracks",
  "Check frame and body cracks",
  "Check visible wiring protected",
  "Check tracks / tyres",
  "Check blade",
  "Check signs/ labels/SWL are displayed",
  "Check bucket and teeth that is in use",
  "Abrasive wheel",
  "Check warning alarms",
  "Steering gear",
  "Park lock brake",
  "Greased points and greased?",
  "Check lights / warning lights / beacon are working",
  "Check horn is working",
  "Check tracks and final drives",
  "Instruments and gauges",
  "Lights-flashing and vehicle"
] as const;
const yesNoChecks = new Set([
  "Operator understands machine", "Check engine bay is clean",
  "Check signs/ labels/SWL are displayed", "Greased points and greased?",
  "Check lights / warning lights / beacon are working",
  "Check horn is working", "Lights-flashing and vehicle"
]);
type PlantAsset={id:string;asset_code:string;description:string|null;registration:string|null;category:string|null;location:string|null;hour_meter:number|null;serial_number:string|null};
type InspectionRow={id:string;asset_id:string;submitted_at:string;submitted_by:string;meter_reading:number|null;result:string;answers:Record<string,string>;comments:string|null;status:string};
const showDate=(date:string)=>new Date(date).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const failAnswer=(answer:string)=>answer==="Unsafe"||answer==="No";
const isSuccess=(answer:string)=>answer==="Safe"||answer==="Yes";
const groupStyle={background:"#eef1f5",padding:"10px 13px",display:"flex",justifyContent:"space-between",alignItems:"center",fontWeight:700,fontSize:13,color:"#202832"};
const statuses=(key:string)=>yesNoChecks.has(key)?["Yes","No","N/A"]:["Safe","Unsafe","N/A"];

export default function DailyPlantInspections({supabase}:{supabase:SupabaseClient}){
  const [assets,setAssets]=useState<PlantAsset[]>([]);
  const [records,setRecords]=useState<InspectionRow[]>([]);
  const [assetId,setAssetId]=useState("");
  const [hours,setHours]=useState("");
  const [site,setSite]=useState("");
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [comments,setComments]=useState("");
  const [operator,setOperator]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [filter,setFilter]=useState("");
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  const asset=assetMap.get(assetId);
  const answered=dailyPlantChecks.filter(k=>Boolean(answers[k])).length;
  const defects=dailyPlantChecks.filter(k=>failAnswer(answers[k]));
  const score=dailyPlantChecks.filter(k=>isSuccess(answers[k])||answers[k]==="N/A").length;
  async function load(){
    setLoading(true);setError("");
    const [a,r]=await Promise.all([
      supabase.from("assets").select("id,asset_code,description,registration,category,location,hour_meter,serial_number").order("asset_code").limit(1500),
      supabase.from("inspections").select("id,asset_id,submitted_at,submitted_by,meter_reading,result,answers,comments,status").eq("inspection_type","daily_plant_pre_start").order("submitted_at",{ascending:false}).limit(200)
    ]);
    if(a.error||r.error)setError("Unable to load inspection records: "+(a.error||r.error)?.message);
    else{setAssets((a.data||[]) as PlantAsset[]);setRecords((r.data||[]) as InspectionRow[]);}
    setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
  useEffect(()=>{let active=true;void supabase.auth.getUser().then(async ({data})=>{
    if(!data.user)return;
    const {data:profile}=await supabase.from("profiles").select("full_name").eq("id",data.user.id).maybeSingle();
    if(active)setOperator(profile?.full_name||data.user?.email||"");
  });return ()=>{active=false};},[supabase]);
  function chooseAsset(id:string){setAssetId(id);const a=assetMap.get(id);setHours(a?.hour_meter==null?"":String(a.hour_meter));setSite(a?.location||"");}
  function updateAnswer(key:string,value:string){setAnswers(old=>({...old,[key]:value}));setMessage("");}
  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(saving)return;
    setError("");setMessage("");
    if(answered!==32){setError("Complete all 32 checks. Select N/A for items that do not apply.");return;}
    if(!assetId||!operator.trim()||!confirmed){setError("Select a machine and confirm the operator declaration.");return;}
    if(hours.trim()===""||!Number.isFinite(Number(hours))||Number(hours)<0){setError("Enter a valid hours reading.");return;}
    if(defects.length&&!comments.trim()){setError("Describe all unsafe items in the comments. Defective critical equipment must not be operated.");return;}
    setSaving(true);
    const {data,error:userError}=await supabase.auth.getUser();
    if(userError||!data.user){setError("Session expired. Please sign in again.");setSaving(false);return;}
    const {error:saveError}=await supabase.from("inspections").insert({
      asset_id:assetId,inspection_type:"daily_plant_pre_start",result:defects.length?"fail":"pass",
      answers:{...answers,_template:"JT Utilities Plant & Machinery Pre Start Inspection",_template_version:"2026-09",_operator:operator.trim(),_location:site.trim(),_signed:true,_score:score},
      comments:comments.trim()||null,meter_reading:Number(hours),submitted_by:data.user.id,
      status:defects.length?"defect_reported":"submitted"
    });
    if(saveError)setError("Unable to save inspection: "+saveError.message);
    else{
      setMessage(defects.length?"Inspection saved with defects. STOP: lock/tag out defective critical equipment and report it immediately. This submission does not automatically change the asset's availability.":"Inspection saved successfully. You can download its report from the history below.");
      setAnswers({});setComments("");setConfirmed(false);setHours("");setAssetId("");setSite("");await load();
    }
    setSaving(false);
  }
  async function download(row:InspectionRow){
    setError("");
    try{
      const related=assetMap.get(row.asset_id);
      const blob=await generateDailyInspectionPdf({
        assetName:related?[related.asset_code,related.description,related.serial_number].filter(Boolean).join(" - "):"Asset "+row.asset_id,
        operator:String(row.answers?._operator||"Not recorded"),
        location:String(row.answers?._location||related?.location||"Not recorded"),
        submittedAt:row.submitted_at,meterReading:row.meter_reading,
        answers:row.answers||{},comments:row.comments||"",result:row.result
      });
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download="JT-Plant-Pre-Start-"+(related?.asset_code||"asset")+"-"+row.submitted_at.slice(0,10)+".pdf";a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setError("Could not generate the inspection PDF: "+(e instanceof Error?e.message:String(e)));}
  }
  const filtered=records.filter(r=>!filter||r.asset_id===filter);
  const row=(key:string,i:number)=><div key={key} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(145px,220px)",borderBottom:"1px solid #dfe3e8",minHeight:47,alignItems:"stretch"}}>
    <label htmlFor={"check-"+i} style={{margin:0,padding:"12px 12px",fontSize:13,fontWeight:600,alignSelf:"center",color:"#1f2937"}}>{key}</label>
    <select id={"check-"+i} aria-label={key} required value={answers[key]||""} onChange={e=>updateAnswer(key,e.target.value)}
      style={{height:"100%",minHeight:47,width:"100%",fontWeight:750,textAlign:"center",borderRadius:0,background:failAnswer(answers[key])?"#dc2626":answers[key]==="N/A"?"#74777e":answers[key]?(answers[key]==="Yes"?"#a1b83d":"#059669"):"#fff",color:answers[key]?"#fff":"#333",border:"1px solid #d2d7dd"}}>
      <option value="">Select</option>{statuses(key).map(status=><option key={status} value={status}>{status}</option>)}
    </select>
  </div>;
  return <section className="panel" style={{maxWidth:1050,margin:"auto"}}>
    <div className="panel-head"><div><h3>Plant & Machinery Pre Start Inspection</h3><p>JT Utilities · Based on your current 32-check site inspection template</p></div><button type="button" className="secondary" onClick={()=>void load()} disabled={loading}>Refresh history</button></div>
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {message&&<div className="notice" role="status">{message}</div>}
    <form onSubmit={e=>void save(e)} style={{background:"#fff",border:"1px solid #d8dde4",borderRadius:4,overflow:"hidden"}}>
      <div style={{padding:"18px 16px",background:"#f2f4f7",borderBottom:"1px solid #dbe1e7"}}>
        <div style={{fontSize:17,fontWeight:800,color:"#202832"}}>JT Utilities - Plant & Machinery Pre Start Inspection</div>
        <div style={{fontSize:12,color:"#586374"}}>Inspection status: In progress</div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:15,fontSize:13}}>
          <span><strong>Score:</strong> {score} / 32 ({Math.round(score/32*100)}%)</span>
          <span><strong>Flagged items:</strong> {defects.length}</span>
          <span><strong>Actions:</strong> {defects.length}</span>
        </div>
      </div>
      <div style={{padding:"13px 15px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
        <label style={{margin:0}}>Prepared by / operator<input required readOnly value={operator} style={{width:"100%",marginTop:5}}/></label>
        <label style={{margin:0}}>Location<input value={site} onChange={e=>setSite(e.target.value)} style={{width:"100%",marginTop:5}} placeholder="Site / location"/></label>
        <label style={{margin:0}}>Select Asset<select required value={assetId} onChange={e=>chooseAsset(e.target.value)} style={{width:"100%",marginTop:5}}><option value="">Choose machine</option>{assets.map(a=><option key={a.id} value={a.id}>{a.asset_code} - {a.description||a.registration||a.category||"Plant"}</option>)}</select></label>
        <label style={{margin:0}}>Date and time<input value={new Date().toLocaleString("en-GB",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/London"})} readOnly style={{width:"100%",marginTop:5}}/></label>
        <label style={{margin:0}}>Records hours reading<input required type="number" min="0" step="0.1" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Hours" style={{width:"100%",marginTop:5}}/></label>
      </div>
      <div style={{padding:"12px 15px",background:"#fff5e9",borderTop:"1px solid #e7e8eb",borderBottom:"1px solid #e7e8eb",color:"#6e3214",fontSize:13,fontWeight:650}}>
        If any of the following critical components are found to be defective the equipment is to be Locked and Tagged out and reported immediately. it shall not be operated until the fault has been rectified.
      </div>
      <div style={groupStyle}><span>1. Audit</span><span>{dailyPlantChecks.slice(0,9).filter(k=>Boolean(answers[k])).length} / 9</span></div>
      {dailyPlantChecks.slice(0,9).map((k,i)=>row(k,i))}
      <div style={groupStyle}><span>1.1. Conditional Checks</span><span>{dailyPlantChecks.slice(9).filter(k=>Boolean(answers[k])).length} / 23</span></div>
      {dailyPlantChecks.slice(9).map((k,i)=>row(k,i+9))}
      <div style={{...groupStyle,display:"block"}}>1.2. IMPORTANT: Check around plant before moving off</div>
      <div style={{padding:15}}>
        {defects.length>0&&<p role="alert" style={{color:"#b91c1c",fontWeight:750}}>Unsafe / No selected on {defects.length} check(s). Equipment with critical defects must not be operated. Report faults immediately.</p>}
        <label>Comments / defect details{defects.length>0?" (required)":""}<textarea rows={3} required={defects.length>0} value={comments} onChange={e=>setComments(e.target.value)} placeholder="Enter observations, faults or remedial action" style={{width:"100%",marginTop:7}}/></label>
        <p style={{fontSize:13,fontWeight:700,marginBottom:6}}>Signed by operator</p>
        <div style={{border:"1px solid #cbd5e1",padding:12,background:"#f8fafc",fontSize:13}}>{operator||"Signed-in operator"}<div style={{color:"#64748b",fontSize:11}}>Electronic acknowledgement on submission · Date/time automatically recorded</div></div>
        <label style={{display:"flex",alignItems:"start",gap:9,fontWeight:500}}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I have carried out the above checks and confirmed that I have checked around the machine before moving off.</label>
        <button type="submit" className="primary" disabled={saving||loading||!assetId||answered!==32||!confirmed}>{saving?"Saving inspection…":"Submit and sign inspection"}</button>
        <div style={{fontSize:12,color:"#667085",marginTop:8}}>Complete all 32 checks. Use N/A for items that do not apply to this machine. A submitted inspection cannot be edited.</div>
      </div>
    </form>
    <div style={{marginTop:26}}>
      <div className="panel-head"><div><h3>Completed inspection reports</h3><p>Saved against each asset · Download the three-page PDF</p></div><select aria-label="Filter inspection history by asset" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All assets</option>{assets.map(a=><option key={a.id} value={a.id}>{a.asset_code}</option>)}</select></div>
      {loading?<p>Loading inspections…</p>:filtered.length===0?<p className="muted">No daily pre-start inspections recorded yet.</p>:<div className="table-wrap"><table><thead><tr><th>Asset</th><th>Date / time</th><th>Operator</th><th>Result</th><th>Report</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{assetMap.get(r.asset_id)?.asset_code||"Asset"}</td><td>{showDate(r.submitted_at)}</td><td>{r.answers?._operator||"Not recorded"}</td><td><span className={"tag "+(r.result==="fail"?"red":"green")}>{r.result==="fail"?"Defects flagged":"Complete"}</span></td><td><button className="secondary" type="button" onClick={()=>void download(r)}>Download PDF</button> <button type="button" className="secondary" onClick={()=>setExpanded(expanded===r.id?null:r.id)}>Details</button></td></tr>)}</tbody></table>
      {expanded&&records.find(r=>r.id===expanded)&&<div style={{padding:15,borderTop:"1px solid #ddd"}}>{(()=>{const r=records.find(row=>row.id===expanded)!;return <><strong>Inspection responses</strong><p>{r.comments||"No comments"}</p>{dailyPlantChecks.map(k=><div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:"1px solid #eee",padding:"5px 0"}}><span>{k}</span><strong>{r.answers?.[k]||"—"}</strong></div>)}</>})()}</div>}</div>}
    </div>
  </section>;
}
