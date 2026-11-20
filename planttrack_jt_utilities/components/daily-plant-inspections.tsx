"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDailyInspectionPdf } from "../lib/daily-inspection-pdf";
import { requiresDailyPlantCheck } from "../lib/daily-check-requirements";

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
type PlantAsset={id:string;status:string;ownership_type:"owned"|"hired_in";hire_supplier:string|null;asset_code:string;description:string|null;registration:string|null;category:string|null;daily_plant_check_required:boolean|null;location:string|null;hour_meter:number|null;serial_number:string|null};
type InspectionRow={id:string;report_path:string|null;asset_id:string|null;project_id:string|null;hired_plant_name:string|null;hired_plant_reference:string|null;submitted_at:string;submitted_by:string;meter_reading:number|null;result:string;answers:Record<string,string>;comments:string|null;status:string};
const showDate=(date:string)=>new Date(date).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");
const failAnswer=(answer:string)=>answer==="Unsafe"||answer==="No";
const isSuccess=(answer:string)=>answer==="Safe"||answer==="Yes";
const groupStyle={background:"#eef1f5",padding:"10px 13px",display:"flex",justifyContent:"space-between",alignItems:"center",fontWeight:700,fontSize:13,color:"#202832"};
const statuses=(key:string)=>yesNoChecks.has(key)?["Yes","No","N/A"]:["Safe","Unsafe","N/A"];
const photoPrompts=["Front of machine","Rear of machine","Left side of machine","Right side of machine","Tracks / tyres","Operator steps and handrails","Hydraulic hoses","Working attachment / bucket / blade","Engine bay","Operator cab and seatbelt"];
type Evidence={prompt:string;path:string};
function randomPrompts(){const items=[...photoPrompts];for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items.slice(0,3);}
type Project={id:string;project_name:string;site_address:string|null;site_postcode:string|null};
type Allocation={project_id:string;asset_id:string};

export default function DailyPlantInspections({supabase}:{supabase:SupabaseClient}){
  const [assets,setAssets]=useState<PlantAsset[]>([]);
  const [lockedAssets,setLockedAssets]=useState<Set<string>>(new Set());
  const [projects,setProjects]=useState<Project[]>([]);
  const [allocations,setAllocations]=useState<Allocation[]>([]);
  const [projectId,setProjectId]=useState("");
  const [plantSource,setPlantSource]=useState<"own"|"hired">("own");
  const [hiredPlant,setHiredPlant]=useState("");
  const [hiredReference,setHiredReference]=useState("");
  const [randomPhotoQuestions,setRandomPhotoQuestions]=useState<string[]>([]);
  const [photos,setPhotos]=useState<Record<string,File>>({});
  const [photoLinks,setPhotoLinks]=useState<{prompt:string;url:string}[]>([]);
  const [showingPhotoId,setShowingPhotoId]=useState<string|null>(null);
  const [records,setRecords]=useState<InspectionRow[]>([]);
  const [assetId,setAssetId]=useState("");
  const [hours,setHours]=useState("");
  const [site,setSite]=useState("");
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [comments,setComments]=useState("");
  const [operator,setOperator]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [signature,setSignature]=useState("");
  const signatureRef=useRef<HTMLCanvasElement|null>(null);
  const drawingRef=useRef(false);
  const [saving,setSaving]=useState(false);
  const [filing,setFiling]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [filter,setFilter]=useState("");
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  const asset=assetMap.get(assetId);
  const assetLocked=Boolean(assetId&&lockedAssets.has(assetId));
  const answered=dailyPlantChecks.filter(k=>Boolean(answers[k])).length;
  const defects=dailyPlantChecks.filter(k=>failAnswer(answers[k]));
  const score=dailyPlantChecks.filter(k=>isSuccess(answers[k])||answers[k]==="N/A").length;
  const [mobileStep,setMobileStep]=useState(0);
  const stepNames=["Machine","Checks 1–9","Checks 10–20","Checks 21–32","Photos","Sign & send"];
  const stepCounts=[0,9,11,12,3,0];
  const stepAnswered=[0,dailyPlantChecks.slice(0,9).filter(k=>answers[k]).length,dailyPlantChecks.slice(9,20).filter(k=>answers[k]).length,dailyPlantChecks.slice(20).filter(k=>answers[k]).length,randomPhotoQuestions.filter(prompt=>Boolean(photos[prompt])).length,0];
  const selectedMachine=plantSource==="own"?!!assetId:!!assetId||!!hiredPlant.trim();
  const projectReady=!!projectId&&selectedMachine&&hours.trim()!==""&&Number.isFinite(Number(hours))&&Number(hours)>=0;
  const completedStep=(step:number)=>step===0?projectReady:step>=1&&step<=3?stepAnswered[step]===stepCounts[step]:step===4?randomPhotoQuestions.length===3&&stepAnswered[4]===3:!!confirmed&&!!signature&&(!defects.length||!!comments.trim());
  const nextMobileStep=()=>{
    if(!completedStep(mobileStep)){setError(mobileStep===0?"Choose your project and machine, then enter the hours reading.":mobileStep<=3?"Complete each check. Tap Not applicable when a check does not apply.":mobileStep===4?"Take all three required photographs.":"Complete your signature and declaration.");return;}
    setError("");setMobileStep(n=>Math.min(n+1,5));
    window.scrollTo({top:0,behavior:"smooth"});
  };

  async function load(){
    setLoading(true);setError("");
    const [a,r,p,alloc]=await Promise.all([
      supabase.from("assets").select("id,asset_code,status,ownership_type,hire_supplier,description,registration,category,daily_plant_check_required,location,hour_meter,serial_number").order("asset_code").limit(1500),
      supabase.from("inspections").select("id,report_path,asset_id,project_id,hired_plant_name,hired_plant_reference,submitted_at,submitted_by,meter_reading,result,answers,comments,status").eq("inspection_type","daily_plant_pre_start").order("submitted_at",{ascending:false}).limit(200),
      supabase.from("projects").select("id,project_name,site_address,site_postcode").neq("status","archived").order("project_name"),
      supabase.from("project_allocations").select("project_id,asset_id").is("returned_at",null)
    ]);
    if(a.error||r.error||p.error||alloc.error)setError("Unable to load inspection records: "+(a.error||r.error||p.error||alloc.error)?.message);
    else{setAssets((a.data||[]) as PlantAsset[]);setRecords((r.data||[]) as InspectionRow[]);setProjects((p.data||[]) as Project[]);setAllocations((alloc.data||[]) as Allocation[]);}
    const {data:locks,error:lockError}=await supabase.from("plant_safety_lockouts").select("asset_id").is("released_at",null);
    if(lockError)setError("Unable to load safety holds: "+lockError.message);
    else setLockedAssets(new Set((locks||[]).map(l=>l.asset_id)));
    setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
  useEffect(()=>{let active=true;void supabase.auth.getUser().then(async ({data})=>{
    if(!data.user)return;
    const {data:profile}=await supabase.from("profiles").select("full_name").eq("id",data.user.id).maybeSingle();
    if(active)setOperator(profile?.full_name||data.user?.email||"");
  });return ()=>{active=false};},[supabase]);
  const projectAssets=projectId?assets.filter(a=>requiresDailyPlantCheck(a)&&allocations.some(x=>x.project_id===projectId&&x.asset_id===a.id)):[];
  const ownedProjectAssets=projectAssets.filter(a=>a.ownership_type!=="hired_in");
  const hiredProjectAssets=projectAssets.filter(a=>a.ownership_type==="hired_in");
  function selectProject(id:string){setProjectId(id);setAssetId("");setHiredPlant("");setHiredReference("");const p=projects.find(p=>p.id===id);setSite([p?.site_address,p?.site_postcode].filter(Boolean).join(", "));}
  function selectSource(value:"own"|"hired"){setPlantSource(value);setAssetId("");setHiredPlant("");setHiredReference("");setHours("");}
  function chooseAsset(id:string){setAssetId(id);const a=assetMap.get(id);setHours(a?.hour_meter==null?"":String(a.hour_meter));setSite(a?.location||"");}
  function pointerPosition(e:React.PointerEvent<HTMLCanvasElement>){const canvas=e.currentTarget,rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};}
  function beginSignature(e:React.PointerEvent<HTMLCanvasElement>){const canvas=e.currentTarget,ctx=canvas.getContext("2d");if(!ctx)return;canvas.setPointerCapture(e.pointerId);const p=pointerPosition(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle="#17212b";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";drawingRef.current=true;}
  function drawSignature(e:React.PointerEvent<HTMLCanvasElement>){if(!drawingRef.current)return;const ctx=e.currentTarget.getContext("2d");if(!ctx)return;const p=pointerPosition(e);ctx.lineTo(p.x,p.y);ctx.stroke();}
  function endSignature(e:React.PointerEvent<HTMLCanvasElement>){if(!drawingRef.current)return;drawingRef.current=false;setSignature(e.currentTarget.toDataURL("image/png"));}
  function clearSignature(){const canvas=signatureRef.current;if(canvas)canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);setSignature("");}
  function uploadPhotoSelection(prompt:string,file:File|undefined){if(!file){setPhotos(old=>{const result={...old};delete result[prompt];return result;});return;}if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12*1024*1024){setError("Choose a JPG, PNG or WebP photo under 12 MB.");return;}setError("");setPhotos(old=>({...old,[prompt]:file}));}
  async function showPhotos(row:InspectionRow){setShowingPhotoId(row.id);setPhotoLinks([]);setError("");const evidence=row.answers?._photo_evidence as unknown as Evidence[]|undefined;if(!evidence?.length)return;const links:typeof photoLinks=[];for(const entry of evidence){const {data,error}=await supabase.storage.from("plant-inspection-photos").createSignedUrl(entry.path,3600);if(error){setError("Could not open photo evidence: "+error.message);return;}links.push({prompt:entry.prompt,url:data.signedUrl});}setPhotoLinks(links);}
  useEffect(()=>{if(answered===32&&randomPhotoQuestions.length===0)setRandomPhotoQuestions(randomPrompts());},[answered,randomPhotoQuestions.length]);
  function updateAnswer(key:string,value:string){setAnswers(old=>({...old,[key]:value}));setMessage("");}

  async function generateEvidenceReport(row:{asset_id:string|null;hired_plant_name:string|null;submitted_at:string;meter_reading:number|null;result:string;answers:Record<string,unknown>;comments:string|null}){
    const asset=row.asset_id?assetMap.get(row.asset_id):undefined;
    const evidence=(row.answers?._photo_evidence as unknown as Evidence[]|undefined)||[];
    const attachments:{prompt:string;bytes:Uint8Array;mimeType:string}[]=[];
    for(const entry of evidence){
      const {data,error}=await supabase.storage.from("plant-inspection-photos").download(entry.path);
      if(error||!data)throw new Error("Photo evidence unavailable: "+(error?.message||entry.prompt));
      const mime=data.type||"image/jpeg";
      let bytes:Uint8Array;
      if(mime==="image/webp"){
        const bitmap=await createImageBitmap(data);
        const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Cannot process WebP photo");
        ctx.drawImage(bitmap,0,0);bitmap.close();
        const jpeg:Blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Cannot convert camera photo")),"image/jpeg",0.84));
        bytes=new Uint8Array(await jpeg.arrayBuffer());
      }else bytes=new Uint8Array(await data.arrayBuffer());
      attachments.push({prompt:entry.prompt,bytes,mimeType:mime==="image/png"?"image/png":"image/jpeg"});
    }
    return generateDailyInspectionPdf({
      assetName:asset?[asset.asset_code,asset.description,asset.serial_number].filter(Boolean).join(" - "):row.hired_plant_name||"Hired plant",
      operator:String(row.answers?._operator||"Operator"),
      location:String(row.answers?._location||asset?.location||""),
      submittedAt:row.submitted_at,meterReading:row.meter_reading,
      answers:(row.answers||{}) as Record<string,string>,comments:row.comments||"",result:row.result,photos:attachments
    });
  }
  async function fileReport(row:InspectionRow){
    if(row.report_path)return;
    setFiling(row.id);setError("");
    try{
      const blob=await generateEvidenceReport(row);
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Session expired");
      const path=user.id+"/"+row.id+".pdf";
      const uploaded=await supabase.storage.from("plant-inspection-reports").upload(path,blob,{contentType:"application/pdf",upsert:false});
      if(uploaded.error)throw uploaded.error;
      const linked=await supabase.from("inspections").update({report_path:path}).eq("id",row.id);
      if(linked.error)throw linked.error;
      setMessage("Inspection report filed in the asset folder.");await load();
    }catch(err){setError("Could not file inspection report: "+(err instanceof Error?err.message:String(err)));}
    finally{setFiling(null);}
  }
  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(saving)return;
    setError("");setMessage("");
    if(answered!==32){setError("Complete all 32 checks. Select N/A for items that do not apply.");return;}
    if(!projectId||((plantSource==="own"&&!assetId)||(plantSource==="hired"&&!assetId&&!hiredPlant.trim()))||!operator.trim()||!confirmed||!signature){setError("Select a project and machine (or enter hired plant), sign and confirm the declaration.");return;}
    if(hours.trim()===""||!Number.isFinite(Number(hours))||Number(hours)<0){setError("Enter a valid hours reading.");return;}
    if(defects.length&&!comments.trim()){setError("Describe all unsafe items in the comments. Defective critical equipment must not be operated.");return;}
    if(randomPhotoQuestions.length!==3||randomPhotoQuestions.some(prompt=>!photos[prompt])){setError("Take each of the three randomly selected machine photographs before submitting.");return;}
    setSaving(true);
    const {data,error:userError}=await supabase.auth.getUser();
    if(userError||!data.user){setError("Session expired. Please sign in again.");setSaving(false);return;}
    const inspectionId=crypto.randomUUID();
    const evidence:Evidence[]=[];
    for(let i=0;i<randomPhotoQuestions.length;i++){
      const prompt=randomPhotoQuestions[i],file=photos[prompt];
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=data.user.id+"/"+inspectionId+"/"+(i+1)+"."+ext;
      const {error:photoError}=await supabase.storage.from("plant-inspection-photos").upload(path,file,{upsert:false,contentType:file.type});
      if(photoError){if(evidence.length)await supabase.storage.from("plant-inspection-photos").remove(evidence.map(x=>x.path));setError("Mandatory photos could not be saved: "+photoError.message);setSaving(false);return;}
      evidence.push({prompt,path});
    }
    const submittedAt=new Date().toISOString();
    const {error:saveError}=await supabase.from("inspections").insert({
      submitted_at:submittedAt,
      id:inspectionId,project_id:projectId,
      hired_plant_name:plantSource==="hired"&&!assetId?hiredPlant.trim():null,hired_plant_reference:plantSource==="hired"&&!assetId?(hiredReference.trim()||null):null,
      asset_id:assetId||null,inspection_type:"daily_plant_pre_start",result:defects.length?"fail":"pass",
      answers:{...answers,_template:"JT Utilities Plant & Machinery Pre Start Inspection",_template_version:"2026-09",_operator:operator.trim(),_location:site.trim(),_signed:true,_signature:signature,_score:score,_photo_evidence:evidence,_project_name:projects.find(p=>p.id===projectId)?.project_name||""},
      comments:comments.trim()||null,meter_reading:Number(hours),submitted_by:data.user.id,
      status:defects.length?"defect_reported":"submitted"
    });
    if(saveError){await supabase.storage.from("plant-inspection-photos").remove(evidence.map(x=>x.path));setError("Unable to save inspection: "+saveError.message);}
    else{
      let warning="";
      try{
        const report=await generateEvidenceReport({
          asset_id:assetId||null,hired_plant_name:hiredPlant||null,submitted_at:submittedAt,meter_reading:Number(hours),
          result:defects.length?"fail":"pass",
          answers:{...answers,_operator:operator.trim(),_location:site.trim(),_signature:signature,_photo_evidence:evidence},
          comments:comments.trim()
        });
        const path=data.user.id+"/"+inspectionId+".pdf";
        const uploaded=await supabase.storage.from("plant-inspection-reports").upload(path,report,{contentType:"application/pdf",upsert:false});
        if(uploaded.error)throw uploaded.error;
        const linked=await supabase.from("inspections").update({report_path:path}).eq("id",inspectionId);
        if(linked.error)throw linked.error;
      }catch(err){warning=" PDF filing needs a retry: "+(err instanceof Error?err.message:String(err))+". Use File PDF below.";}
      setMessage((defects.length?"Inspection saved with defects. STOP: lock/tag out critical faults immediately. A workshop job card has been raised for admin review.":"Inspection saved successfully. PDF and three photographs are filed against the asset.")+warning);
      setMobileStep(0);setAnswers({});setComments("");setConfirmed(false);clearSignature();setHours("");setAssetId("");setProjectId("");setHiredPlant("");setHiredReference("");setPhotos({});setRandomPhotoQuestions([]);setSite("");await load();
    }
    setSaving(false);
  }
  async function download(row:InspectionRow){
    setError("");
    try{
      const related=row.asset_id?assetMap.get(row.asset_id):undefined;
      const blob=await generateEvidenceReport(row);
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download="JT-Plant-Pre-Start-"+(related?.asset_code||"hired-plant")+"-"+row.submitted_at.slice(0,10)+".pdf";a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setError("Could not generate the inspection PDF: "+(e instanceof Error?e.message:String(e)));}
  }
  const filtered=records.filter(r=>!filter||r.asset_id===filter);
  const row=(key:string,i:number)=><div key={key} className={"operator-check-row"+(failAnswer(answers[key])?" operator-check-danger":"")}>
    <div className="operator-check-label"><strong>{i+1}. {key}</strong><span>{answers[key]||"Not checked yet"}</span></div>
    <div className="operator-check-options" role="group" aria-label={key}>
      {statuses(key).map(status=><button key={status} type="button" aria-pressed={answers[key]===status} className={"operator-answer "+(answers[key]===status?"selected "+(failAnswer(status)?"unsafe":status==="N/A"?"not-applicable":"safe"):"")} onClick={()=>updateAnswer(key,status)}>
       {status==="Safe"||status==="Yes"?"✓ ":status==="Unsafe"||status==="No"?"! ":""}{status==="N/A"?"Not applicable":status}
      </button>)}
    </div>
    <select className="operator-check-desktop" aria-label={key} required value={answers[key]||""} onChange={e=>updateAnswer(key,e.target.value)}
      style={{height:"100%",minHeight:47,width:"100%",fontWeight:750,textAlign:"center",borderRadius:0,background:failAnswer(answers[key])?"#dc2626":answers[key]==="N/A"?"#74777e":answers[key]?(answers[key]==="Yes"?"#a1b83d":"#059669"):"#fff",color:answers[key]?"#fff":"#333",border:"1px solid #d2d7dd"}}>
      <option value="">Select</option>{statuses(key).map(status=><option key={status} value={status}>{status}</option>)}
    </select>
  </div>;
  const stepNav=(step:number)=><div className="operator-step-nav">
    {step>0&&<button type="button" className="secondary" onClick={()=>{setMobileStep(step-1);setError("");window.scrollTo({top:0,behavior:"smooth"});}}>Back</button>}
    {step<5&&<button type="button" className="primary" onClick={nextMobileStep} disabled={!completedStep(step)}>Continue <span aria-hidden="true">→</span></button>}
  </div>;
  return <section className="panel" style={{maxWidth:1050,margin:"auto"}}>
    <div className="panel-head"><div><h3>Daily Plant Check</h3><p>Choose your machine, check it, take photographs and sign before use.</p></div><button type="button" className="secondary" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {message&&<div className="notice" role="status">{message}</div>}
    <div className="operator-mobile-progress" aria-label="Daily Plant Check progress">
      <div className="operator-step-top"><b>Step {mobileStep+1} of 6 · {stepNames[mobileStep]}</b><span>{answered}/32 checks</span></div>
      <div className="operator-progress-rail"><span style={{width:((mobileStep+1)/6*100)+"%"}}/></div>
      <p>{mobileStep===0?"Start by choosing your site and machine.":mobileStep===4?"Use your phone camera to take the three requested photos.":mobileStep===5?"Check any faults, sign and submit.": "Tap one answer for each check. Use Not applicable where needed."}</p>
      {defects.length>0&&<div className="operator-danger-banner" role="alert">⚠ {defects.length} defect(s) reported — STOP. Do not operate unsafe plant. Report the fault immediately.</div>}
    </div>
    <form onSubmit={e=>void save(e)} className="operator-inspection-form" style={{background:"#fff",border:"1px solid #d8dde4",borderRadius:4,overflow:"hidden"}}>
      <div className="operator-desktop-summary" style={{padding:"18px 16px",background:"#f2f4f7",borderBottom:"1px solid #dbe1e7"}}>
        <div style={{fontSize:17,fontWeight:800,color:"#202832"}}>JT Utilities - Plant & Machinery Pre Start Inspection</div>
        <div style={{fontSize:12,color:"#586374"}}>Inspection status: In progress</div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:15,fontSize:13}}>
          <span><strong>Score:</strong> {score} / 32 ({Math.round(score/32*100)}%)</span>
          <span><strong>Flagged items:</strong> {defects.length}</span>
          <span><strong>Actions:</strong> {defects.length}</span>
        </div>
      </div>
      <div className={"operator-machine-section operator-section"+(mobileStep!==0?" operator-step-hidden":"")} style={{padding:"13px 15px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
        <label style={{margin:0}}>Prepared by / operator<input required readOnly value={operator} style={{width:"100%",marginTop:5}}/></label>
        <label style={{margin:0}}>Location<input value={site} onChange={e=>setSite(e.target.value)} style={{width:"100%",marginTop:5}} placeholder="Site / location"/></label>
        <label style={{margin:0}}>Project<select required value={projectId} onChange={e=>selectProject(e.target.value)} style={{width:"100%",marginTop:5}}><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_name}</option>)}</select></label>
        <label style={{margin:0}}>Plant type<select value={plantSource} onChange={e=>selectSource(e.target.value as "own"|"hired")} style={{width:"100%",marginTop:5}}><option value="own">JT Utilities plant</option><option value="hired">Hired-in plant</option></select></label>
        {plantSource==="own"?<label style={{margin:0}}>Select Asset<select required value={assetId} disabled={!projectId} onChange={e=>chooseAsset(e.target.value)} style={{width:"100%",marginTop:5}}><option value="">Choose machine allocated to project</option>{ownedProjectAssets.map(a=><option key={a.id} value={a.id}>{a.asset_code} - {a.description||a.registration||a.category||"Plant"}</option>)}</select>{projectId&&ownedProjectAssets.length===0&&<small>No company assets allocated to this project. Allocate plant in Projects or choose Hired-in plant.</small>}</label>:<><label style={{margin:0}}>Select hired-in plant from Asset List<select value={assetId} disabled={!projectId} onChange={e=>{chooseAsset(e.target.value);setHiredPlant("");setHiredReference("");}}><option value="">New hired machine (enter below)</option>{hiredProjectAssets.map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.description} · {a.hire_supplier||"Hire company not recorded"}</option>)}</select></label>{!assetId&&<><label style={{margin:0}}>Hired-in machine / description<input required value={hiredPlant} onChange={e=>setHiredPlant(e.target.value)} placeholder="e.g. 6-tonne excavator / Make and model" maxLength={200} style={{width:"100%",marginTop:5}}/></label><label style={{margin:0}}>Hire reference / fleet ID<input value={hiredReference} maxLength={100} onChange={e=>setHiredReference(e.target.value)} placeholder="Hire company reference or serial" style={{width:"100%",marginTop:5}}/></label></>}</>}
        <label style={{margin:0}}>Date and time<input value={showDate(new Date().toISOString())} readOnly style={{width:"100%",marginTop:5}}/></label>
        <label style={{margin:0}}>Records hours reading<input required type="number" min="0" step="0.1" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Hours" style={{width:"100%",marginTop:5}}/></label>
      </div>
      <div className={"operator-step-controls"+(mobileStep!==0?" operator-step-hidden":"")}>{stepNav(0)}</div>
      {assetLocked&&<div role="alert" style={{padding:14,background:"#fee2e2",border:"2px solid #dc2626",fontWeight:700,color:"#991b1b"}}>SAFETY LOCKOUT — This machine is out of service. Do not operate it. You may record an inspection, but only an administrator can authorise its return to use after recorded defects are resolved.</div>}
      <div className={"operator-safety-instruction"+(mobileStep===0||mobileStep===5?"":" operator-step-hidden")} style={{padding:"12px 15px",background:"#fff5e9",borderTop:"1px solid #e7e8eb",borderBottom:"1px solid #e7e8eb",color:"#6e3214",fontSize:13,fontWeight:650}}>
        If any of the following critical components are found to be defective the equipment is to be Locked and Tagged out and reported immediately. it shall not be operated until the fault has been rectified.
      </div>
      <div className={"operator-check-section operator-section"+(mobileStep!==1?" operator-step-hidden":"")}><div style={groupStyle}><span>First 9 checks</span><span>{dailyPlantChecks.slice(0,9).filter(k=>Boolean(answers[k])).length} / 9</span></div>
      {dailyPlantChecks.slice(0,9).map((k,i)=>row(k,i))}<div className="operator-step-controls">{stepNav(1)}</div></div>
      <div className={"operator-check-section operator-section"+(mobileStep!==2?" operator-step-hidden":"")}><div style={groupStyle}><span>Checks 10–20</span><span>{dailyPlantChecks.slice(9,20).filter(k=>Boolean(answers[k])).length} / 11</span></div>
      {dailyPlantChecks.slice(9,20).map((k,i)=>row(k,i+9))}<div className="operator-step-controls">{stepNav(2)}</div></div>
      <div className={"operator-check-section operator-section"+(mobileStep!==3?" operator-step-hidden":"")}><div style={groupStyle}><span>Checks 21–32</span><span>{dailyPlantChecks.slice(20).filter(k=>Boolean(answers[k])).length} / 12</span></div>
      {dailyPlantChecks.slice(20).map((k,i)=>row(k,i+20))}<div className="operator-step-controls">{stepNav(3)}</div></div>
      <div className={"operator-final-reminder"+(mobileStep!==5?" operator-step-hidden":"")} style={{...groupStyle,display:"block"}}>IMPORTANT: Check around the machine before moving off</div>
      {answered===32&&<div className={"operator-photo-section operator-section"+(mobileStep!==4?" operator-step-hidden":"")} style={{padding:16,background:"#f8fafc",borderBottom:"2px solid #e31b36"}}>
        <h4 style={{margin:"0 0 5px"}}>Required random photographs · 3 of 3</h4>
        <p style={{fontSize:12,color:"#475569"}}>These three inspection views were randomly selected after completing the checklist. Take a fresh photograph of each requested area of the selected machine. All three must be provided before submission.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12}}>
        {randomPhotoQuestions.map((prompt,i)=><label key={prompt} style={{margin:0,background:"#fff",border:"1px solid #d7dfe8",padding:12}}>
          <strong>{i+1}. {prompt}</strong>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required={!photos[prompt]} onChange={e=>uploadPhotoSelection(prompt,e.target.files?.[0])} style={{display:"block",width:"100%",marginTop:8,fontSize:12}}/>
          <small style={{display:"block",marginTop:7,color:photos[prompt]?"#176b35":"#9a3412"}}>{photos[prompt]?"Photo ready: "+photos[prompt].name:"Required photograph missing"}</small>
        </label>)}
        </div><div className="operator-step-controls">{stepNav(4)}</div>
      </div>}
      <div className={"operator-sign-section operator-section"+(mobileStep!==5?" operator-step-hidden":"")} style={{padding:15}}>
        {defects.length>0&&<p role="alert" style={{color:"#b91c1c",fontWeight:750}}>Unsafe / No selected on {defects.length} check(s). Equipment with critical defects must not be operated. Report faults immediately.</p>}
        <label>Comments / defect details{defects.length>0?" (required)":""}<textarea rows={3} required={defects.length>0} value={comments} onChange={e=>setComments(e.target.value)} placeholder="Enter observations, faults or remedial action" style={{width:"100%",marginTop:7}}/></label>
        <p style={{fontSize:13,fontWeight:700,marginBottom:6}}>Signed by operator</p>
        <div style={{border:"1px solid #cbd5e1",padding:12,background:"#f8fafc",fontSize:13}}><strong>{operator||"Signed-in operator"}</strong><div style={{fontSize:12,margin:"7px 0"}}>Draw your signature in the box below (finger, mouse or stylus).</div><canvas ref={signatureRef} width={650} height={125} aria-label="Operator handwritten signature pad" onPointerDown={beginSignature} onPointerMove={drawSignature} onPointerUp={endSignature} onPointerCancel={endSignature} style={{display:"block",width:"100%",maxWidth:650,height:125,background:"#fff",border:"1px solid #9da8b5",touchAction:"none",cursor:"crosshair"}}/><button type="button" className="secondary" onClick={clearSignature} style={{marginTop:8}}>Clear signature</button><div style={{color:"#64748b",fontSize:11,marginTop:7}}>Signature and submission date/time are stored with the inspection report.</div></div>
        <label style={{display:"flex",alignItems:"start",gap:9,fontWeight:500}}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I have carried out the above checks and confirmed that I have checked around the machine before moving off.</label>
        <button type="submit" className="primary" disabled={saving||loading||!projectId||(plantSource==="own"?!assetId:!assetId&&!hiredPlant.trim())||answered!==32||randomPhotoQuestions.some(prompt=>!photos[prompt])||!confirmed||!signature}>{saving?"Saving inspection…":"Submit and sign inspection"}</button>
        <div style={{fontSize:12,color:"#667085",marginTop:8}}>Complete all 32 checks. Use N/A for items that do not apply to this machine. A submitted inspection cannot be edited.</div><div className="operator-step-controls">{stepNav(5)}</div>
      </div>
    </form>
    <div style={{marginTop:26}}>
      <div className="panel-head"><div><h3>Completed inspection reports</h3><p>Saved against each asset · Download the three-page PDF</p></div><select aria-label="Filter inspection history by asset" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All assets</option>{assets.map(a=><option key={a.id} value={a.id}>{a.asset_code}</option>)}</select></div>
      {loading?<p>Loading inspections…</p>:filtered.length===0?<p className="muted">No daily pre-start inspections recorded yet.</p>:<div className="table-wrap"><table><thead><tr><th>Project</th><th>Asset</th><th>Date / time</th><th>Operator</th><th>Result</th><th>Report</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{projects.find(p=>p.id===r.project_id)?.project_name||r.answers?._project_name||"Not recorded"}</td><td>{r.asset_id?assetMap.get(r.asset_id)?.asset_code||"Asset":r.hired_plant_name||"Hired plant"}</td><td>{showDate(r.submitted_at)}</td><td>{r.answers?._operator||"Not recorded"}</td><td><span className={"tag "+(r.result==="fail"?"red":"green")}>{r.result==="fail"?"Defects flagged":"Complete"}</span></td><td><button className="secondary" type="button" onClick={()=>void download(r)}>Download PDF</button> {!r.report_path&&<button className="secondary" type="button" disabled={filing===r.id} onClick={()=>void fileReport(r)}>{filing===r.id?"Filing…":"File PDF"}</button>} <button type="button" className="secondary" onClick={()=>setExpanded(expanded===r.id?null:r.id)}>Details</button> {(r.answers?._photo_evidence as unknown as Evidence[]|undefined)?.length?<button type="button" className="secondary" onClick={()=>void showPhotos(r)}>View photos</button>:null}</td></tr>)}</tbody></table>
      {showingPhotoId&&<div style={{padding:14,borderTop:"1px solid #ddd"}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong>Photo evidence</strong><button className="secondary" type="button" onClick={()=>{setShowingPhotoId(null);setPhotoLinks([]);}}>Close</button></div>{photoLinks.map((p,i)=><div key={i} style={{marginTop:13}}><p><strong>{p.prompt}</strong></p><a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.prompt} style={{maxWidth:340,width:"100%",height:"auto",border:"1px solid #ddd"}}/></a></div>)}</div>}
      {expanded&&records.find(r=>r.id===expanded)&&<div style={{padding:15,borderTop:"1px solid #ddd"}}>{(()=>{const r=records.find(row=>row.id===expanded)!;return <><strong>Inspection responses</strong><p>{r.comments||"No comments"}</p>{dailyPlantChecks.map(k=><div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:"1px solid #eee",padding:"5px 0"}}><span>{k}</span><strong>{r.answers?.[k]||"—"}</strong></div>)}</>})()}</div>}</div>}
    </div>
  </section>;
}
