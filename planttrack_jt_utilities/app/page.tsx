 "use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AssetManager from "../components/asset-manager";
import { generateApprovedJobPdf, generateAssetJobCardPdf } from "../lib/loler-pdf";
import { generateWheelRetorquePdf, WHEEL_JOB_TYPE, WHEEL_REQUIRED, missingWheelFields } from "../lib/wheel-retorque-pdf";
import WheelRetorqueFields from "../components/wheel-retorque-fields";
import ManagementReports from "../components/management-reports";
import { PRE_USE_SECTIONS, PRE_USE_ITEMS, PRE_USE_SHEET_VERSION, PRE_USE_RESULT_PASS, PRE_USE_RESULT_FAIL, preUseIsFullSheet, preUseHasDefects } from "../lib/pre-use-inspection";
import LolerManager from "../components/loler-manager";
import DailyPlantInspections from "../components/daily-plant-inspections";
import PlantSafetyLockouts from "../components/plant-safety-lockouts";
import DailyInspectionDashboard from "../components/daily-inspection-dashboard";
import { requiresDailyPlantCheck, MISSING_PLANT_CHECK_ALERT_HOUR_UK, ukDateString, ukHour } from "../lib/daily-check-requirements";
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck,
  Clock3, FileCheck2, FileText, LayoutDashboard, Menu, Search, Settings, ShieldCheck,
  Truck, Users, Wrench, X, Plus, Bell, ArrowUpRight, QrCode, History, Download
} from "lucide-react";

type Asset = { id:string; name:string; category:string; registration:string; location:string; hours:string; status:string; loler:string; service:string };
type DbAsset = { id:string; asset_code:string; description:string; category:string|null; manufacturer:string|null; model:string|null; serial_number:string|null; registration:string|null; location:string|null; hour_meter:number|string|null; status:string };
function displayStatus(status:string,category?:string|null) {
  const labels:Record<string,string> = { available:"Available", in_use:"In use", in_workshop:"In workshop", out_of_service:"Out of service", off_hire:"Off hire" };
  if(status==="out_of_service"&&["hgv","vehicle","trailer"].includes((category||"").toLowerCase()))return "VOR";
  return labels[status] || status;
}
// Format displayed dates only. Keep database ISO dates and native date input values unchanged.
function displayUkDate(value:string|null|undefined):string {
 if(!value)return "—";
 return String(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(_match,year,month,day)=>day+"-"+month+"-"+year);
}
const nav = [
  ["Dashboard",LayoutDashboard],["Plant register",Truck],["Projects",ClipboardCheck],["Calander",CalendarDays],["MOT Tracker",FileCheck2],
  ["Plant checks",ClipboardCheck],["LOLER & certificates",FileCheck2],
  ["Workshop job cards",Wrench],["Vehicle VOR management",AlertTriangle],["Maintenance history",History],["Users & sign-offs",Users],["Reports",Activity]
] as const;
function Tag({children,tone="neutral"}:{children:React.ReactNode;tone?:string}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function plannedPmiDates(nextDue:string|null,today:string,months=13){
 if(!nextDue)return [] as string[];
 const horizon=new Date(today+"T00:00:00Z");horizon.setUTCMonth(horizon.getUTCMonth()+months);
 const end=horizon.toISOString().slice(0,10),cursor=new Date(nextDue.slice(0,10)+"T00:00:00Z"),dates:string[]=[];
 if(Number.isNaN(cursor.getTime()))return dates;
 for(let i=0;i<40;i++){const d=cursor.toISOString().slice(0,10);if(d>end)break;if(d>=today)dates.push(d);cursor.setUTCDate(cursor.getUTCDate()+42);}
 return dates;
}
type PmiItem={id:string;asset_code:string;registration:string|null;description:string|null;pmi_last_completed:string|null;pmi_next_due:string|null;tacho_calibration_due:string|null;status:string};
function PmiDashboard({supabase,onOpenCalendar,showOverview=true,showSignoff=false}:{supabase:SupabaseClient;onOpenCalendar:()=>void;showOverview?:boolean;showSignoff?:boolean}){
  const [items,setItems]=useState<PmiItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [history,setHistory]=useState<any[]>([]);
  const [selected,setSelected]=useState("");
  const [inspectedOn,setInspectedOn]=useState(new Date().toISOString().slice(0,10));
  const [result,setResult]=useState("Pass");
  const [brakeTestType,setBrakeTestType]=useState("");
  const [mileage,setMileage]=useState("");
  const [defects,setDefects]=useState("");
  const [inspector,setInspector]=useState("");
  const [signer,setSigner]=useState("");
  const [report,setReport]=useState<File|null>(null);
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [pmiFilter,setPmiFilter]=useState<"all"|"overdue"|"soon">("all");
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      const {data,error}=await supabase.from("assets")
        .select("id,asset_code,registration,description,pmi_last_completed,pmi_next_due,tacho_calibration_due,status")
        .not("pmi_next_due","is",null)
        .order("pmi_next_due",{ascending:true}).limit(100);
      if(cancelled)return;
      if(error)setError(error.message);else setItems((data||[]) as PmiItem[]);
      const {data:past}=await supabase.from("hgv_pmi_records").select("id,asset_id,inspected_on,result,inspector_name,signed_off_by,report_path,brake_test_type").order("inspected_on",{ascending:false}).limit(100);
      if(!cancelled)setHistory(past||[]);
      setLoading(false);
    }
    void load();
    return()=>{cancelled=true;};
  },[supabase,reload]);
  const now=new Date();
  const today=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  const soon=new Date(today+"T00:00:00Z");soon.setUTCDate(soon.getUTCDate()+14);
  const cutoff=soon.toISOString().slice(0,10);
  const activePmi=items.filter(x=>x.status!=="out_of_service");
  const vorPmi=items.filter(x=>x.status==="out_of_service");
  const overdue=activePmi.filter(x=>x.pmi_next_due!<today);
  const upcoming=activePmi.filter(x=>x.pmi_next_due!>=today&&x.pmi_next_due!<=cutoff);
  const visiblePmi=pmiFilter==="overdue"?overdue:pmiFilter==="soon"?upcoming:activePmi;
  const fmt=(d:string|null)=>d?d.slice(8,10)+"-"+d.slice(5,7)+"-"+d.slice(0,4):"Not recorded";
  const hgvItems=items.filter(item=>["R500 JTU","WP63 PFD","C545766"].includes(item.asset_code));
  async function savePmi(e:React.FormEvent){
    e.preventDefault();setFeedback("");
    const asset=hgvItems.find(a=>a.asset_code===selected);
    if(!asset||!inspector.trim()||!signer.trim())return setFeedback("Select a vehicle, inspector and signatory.");
    if(inspectedOn>today)return setFeedback("Completion date cannot be in the future.");
    if(result!=="Pass"&&!defects.trim())return setFeedback("Describe the defects and any repairs before saving.");
    setSaving(true);
    try{
      let path:string|null=null;
      if(report){
        if(report.size>10485760||!["application/pdf","image/jpeg","image/png"].includes(report.type))throw Error("Report must be PDF, JPG or PNG under 10MB.");
        path=asset.id+"/"+crypto.randomUUID()+"-"+report.name.replace(/[^A-Za-z0-9._-]/g,"_");
        const {error}=await supabase.storage.from("hgv-pmi-reports").upload(path,report);
        if(error)throw error;
      }
      const {error}=await supabase.from("hgv_pmi_records").insert({asset_id:asset.id,inspected_on:inspectedOn,result,brake_test_type:brakeTestType||null,mileage:mileage?Number(mileage):null,defects:defects||null,inspector_name:inspector.trim(),signed_off_by:signer.trim(),report_path:path});
      if(error)throw error;
      setFeedback(result==="Pass"||result==="Pass - defects rectified"?"Roadworthy PMI signed off; next PMI advanced by six weeks. The uploaded report is available in the asset folder.":"Inspection saved with outstanding defects; next PMI was not advanced.");
      setDefects("");setMileage("");setReport(null);setReload(n=>n+1);
    }catch(e){setFeedback("Could not save: "+(e instanceof Error?e.message:String(e)));}
    finally{setSaving(false);}
  }
  async function viewReport(path:string){
    const {data,error}=await supabase.storage.from("hgv-pmi-reports").createSignedUrl(path,120);
    if(error||!data?.signedUrl)return setFeedback("Could not open inspection report.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  return <section className="panel" style={{marginTop:18}}>
    <div className="panel-head"><div><h3>PMI inspections · Fleet</h3><p>Live due dates from your plant register · Overdue and next 14 days</p></div><button className="text-btn" onClick={onOpenCalendar}>Open Calander</button></div>
    {showOverview&&<><div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",marginBottom:14}}>
      <button type="button" className="stat" style={{textAlign:"left",cursor:"pointer"}} onClick={()=>setPmiFilter(pmiFilter==="overdue"?"all":"overdue")}><div className="stat-top"><span>Overdue PMI</span><AlertTriangle size={18}/></div><strong>{loading?"…":overdue.length}</strong><small>Click to filter</small></button>
      <button type="button" className="stat" style={{textAlign:"left",cursor:"pointer"}} onClick={()=>setPmiFilter(pmiFilter==="soon"?"all":"soon")}><div className="stat-top"><span>Due within 14 days</span><CalendarDays size={18}/></div><strong>{loading?"…":upcoming.length}</strong><small>Click to filter</small></button>
      <button type="button" className="stat" style={{textAlign:"left",cursor:"pointer"}} onClick={()=>setPmiFilter("all")}><div className="stat-top"><span>Scheduled PMI</span><ClipboardCheck size={18}/></div><strong>{loading?"…":activePmi.length}</strong><small>{pmiFilter==="all"?"Showing all scheduled":"Click to show all"}</small></button>
    </div>
    {error&&<p className="auth-error" role="alert">Could not load PMI inspections: {error}</p>}
    {!loading&&!error&&vorPmi.length>0&&<p className="muted">{vorPmi.length} vehicle(s) VOR: routine PMI reminders paused; due dates retained for return-to-service checks.</p>}
    {!loading&&!error&&<div className="table-wrap"><table><thead><tr><th>Vehicle / trailer</th><th>Last PMI</th><th>Next PMI</th><th>Status</th></tr></thead><tbody>
      {visiblePmi.map(item=><tr key={item.asset_code}><td><b>{item.asset_code}</b><small>{item.description||""}</small></td><td>{fmt(item.pmi_last_completed)}</td><td>{fmt(item.pmi_next_due)}</td><td><Tag tone={item.pmi_next_due!<today?"red":"amber"}>{item.pmi_next_due!<today?"Overdue":item.pmi_next_due===today?"Due today":item.pmi_next_due!<=cutoff?"Due soon":"Scheduled"}{item.status==="out_of_service"?" · VOR":""}</Tag></td></tr>)}
    </tbody></table>{visiblePmi.length===0&&<p className="muted">{pmiFilter==="overdue"?"No overdue PMI inspections.":pmiFilter==="soon"?"No PMI inspections due within 14 days.":"No scheduled PMI inspections."}</p>}</div>}
    </>}
    {showSignoff&&<div style={{marginTop:22}}>
      <h3>Record completed PMI and sign-off</h3>
      <p className="muted">A roadworthy pass (including defects fully rectified and checked) advances the next due date. Outstanding defects do not. Uploaded reports also appear in the asset folder.</p>
      <form onSubmit={e=>void savePmi(e)} style={{display:"grid",gap:12,maxWidth:680}}>
        <label>Vehicle<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select HGV or trailer</option>{hgvItems.map(a=><option key={a.id} value={a.asset_code}>{a.asset_code} · {a.description}</option>)}</select></label>
        <label>Inspection date<input type="date" required max={today} value={inspectedOn} onChange={e=>setInspectedOn(e.target.value)}/></label>
        <label>Mileage / odometer<input type="number" min="0" value={mileage} onChange={e=>setMileage(e.target.value)}/></label>
        <label>Result<select value={result} onChange={e=>setResult(e.target.value)}><option>Pass</option><option value="Pass - defects rectified">Pass – defects rectified and roadworthy</option><option value="Defects noted">Outstanding defects – not roadworthy</option><option>Fail</option></select></label>
        <label>Brake test type<select value={brakeTestType} onChange={e=>setBrakeTestType(e.target.value)}><option value="">Not included / not recorded</option><option value="RBT">RBT – Roller Brake Test</option><option value="Laden RBT">Laden RBT – Laden Roller Brake Test</option></select></label>
        <label>Defects found, repairs completed and checks (required for any defects)<textarea value={defects} onChange={e=>setDefects(e.target.value)}/></label>
        <label>Inspector name<input required value={inspector} onChange={e=>setInspector(e.target.value)}/></label>
        <label>Signed off by<input required value={signer} onChange={e=>setSigner(e.target.value)}/></label>
        <label>PMI report (PDF, JPG, PNG, max 10MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setReport(e.target.files?.[0]||null)}/></label>
        <button type="submit" className="primary" disabled={saving}>{saving?"Saving…":"Save signed PMI"}</button>
      </form>
      {feedback&&<p role="status">{feedback}</p>}
      <h3 style={{marginTop:20}}>PMI completion history</h3>
      <div className="table-wrap"><table><thead><tr><th>Vehicle</th><th>Date</th><th>Result</th><th>Brake test</th><th>Inspector</th><th>Signed off</th><th>Report</th></tr></thead><tbody>{history.map(r=><tr key={r.id}><td>{hgvItems.find(a=>a.id===r.asset_id)?.asset_code||r.asset_id}</td><td>{fmt(r.inspected_on)}</td><td>{r.result}</td><td>{r.brake_test_type||"—"}</td><td>{r.inspector_name}</td><td>{r.signed_off_by}</td><td>{r.report_path?<button className="secondary" onClick={()=>void viewReport(r.report_path)}>View report</button>:"—"}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
type MotVehicle={id:string;asset_code:string;registration:string|null;description:string|null;mot_due:string|null;status:string;category:string|null};
type DvsaMotRecord={asset_id:string;registration:string;expiry_date:string|null;last_checked_at:string|null;last_check_error:string|null;mot_status:string|null;raw_response?:{motTestDueDate?:string;registrationDate?:string}|null;mot_tests?:{testResult?:string;expiryDate?:string|null}[]|null};
function firstMotDue(record:{mot_tests?:unknown[]|null;raw_response?:{motTestDueDate?:string}|null}|null|undefined){return record&&!record.mot_tests?.length&&/^\d{4}-\d{2}-\d{2}$/.test(record.raw_response?.motTestDueDate||"")?record.raw_response!.motTestDueDate!:null;}
function motExpiryFromHistory(record:{expiry_date:string|null;mot_tests?:{testResult?:string;expiryDate?:string|null}[]|null}){return record.expiry_date||record.mot_tests?.find(test=>test.testResult==="PASSED"&&test.expiryDate)?.expiryDate||null;}
type MotBooking={id:string;asset_id:string;booking_date:string;booking_time:string;garage_name:string;status:string};
function MotChecker({supabase}:{supabase:SupabaseClient}){
  const [vehicles,setVehicles]=useState<MotVehicle[]>([]);
  const [bookings,setBookings]=useState<MotBooking[]>([]);
  const [showBooking,setShowBooking]=useState(false);
  const [bookingForm,setBookingForm]=useState({asset_id:"",booking_date:"",booking_time:"09:00",garage_name:""});
  const [savingBooking,setSavingBooking]=useState(false);
  const [bookingMessage,setBookingMessage]=useState("");
  const [records,setRecords]=useState<DvsaMotRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [checking,setChecking]=useState<string|null>(null);
  const [batchProgress,setBatchProgress]=useState("");
  const [message,setMessage]=useState("");
  const [lookupResult,setLookupResult]=useState<any>(null);
  const [error,setError]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [registrationSearch,setRegistrationSearch]=useState("");
  async function load(){
    setLoading(true);setError("");
    const [assetsResult,recordsResult,bookingsResult]=await Promise.all([
      supabase.from("assets").select("id,asset_code,registration,description,mot_due,status,category").order("asset_code"),
      supabase.from("vehicle_mot_records").select("asset_id,registration,expiry_date,last_checked_at,last_check_error,mot_status,mot_tests,raw_response"),
      supabase.from("mot_garage_bookings").select("id,asset_id,booking_date,booking_time,garage_name,status").order("booking_date",{ascending:true})
    ]);
    if(assetsResult.error)setError("Could not load vehicles: "+assetsResult.error.message);
    else setVehicles((assetsResult.data||[]).filter(v=>Boolean(v.registration)||Boolean(v.mot_due)) as MotVehicle[]);
    if(recordsResult.error)setError("Could not load saved DVSA MOT records: "+recordsResult.error.message);
    else setRecords((recordsResult.data||[]) as DvsaMotRecord[]);
    if(bookingsResult.error)setError("Could not load MOT bookings: "+bookingsResult.error.message);
    else setBookings((bookingsResult.data||[]) as MotBooking[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
  async function saveBooking(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(savingBooking)return;
    setSavingBooking(true);setBookingMessage("");
    const {data:userResult,error:userError}=await supabase.auth.getUser();
    if(userError||!userResult.user){setBookingMessage("Sign in again to save the MOT booking.");setSavingBooking(false);return;}
    const {error:saveError}=await supabase.from("mot_garage_bookings").insert({...bookingForm,garage_name:bookingForm.garage_name.trim(),created_by:userResult.user.id});
    if(saveError)setBookingMessage("Could not save MOT booking: "+saveError.message);
    else{setBookingMessage("MOT booking saved and added to the inspection calendar.");setShowBooking(false);setBookingForm({asset_id:"",booking_date:"",booking_time:"09:00",garage_name:""});await load();}
    setSavingBooking(false);
  }
  async function cancelBooking(id:string){
    if(!window.confirm("Cancel this MOT booking?"))return;
    const {error:cancelError}=await supabase.from("mot_garage_bookings").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id);
    if(cancelError)setBookingMessage("Could not cancel booking: "+cancelError.message);
    else{setBookingMessage("MOT booking cancelled.");await load();}
  }
  async function checkMot(registration:string){
    setChecking(registration);setMessage("");setLookupResult(null);
    const {data,error}=await supabase.functions.invoke("dvsa-mot-lookup",{body:{registration}});
    if(data?.data)setLookupResult(data.data);
    if(error||data?.error)setMessage(registration+": "+(data?.error||error?.message||"DVSA check failed"));
    else setMessage(registration+": "+(data?.saved?"DVSA result saved to PlantTrack":"DVSA result received but not saved"+(data?.saveError?": "+data.saveError:"")));
    await load();setChecking(null);
  }
  async function checkAllVehicles(){
    const targets=vehicles.filter(v=>v.category==="Vehicle"&&v.registration);
    setChecking("all");setMessage("");setLookupResult(null);let saved=0;let failed=0;
    for(let i=0;i<targets.length;i++){
      const vehicle=targets[i];
      setBatchProgress("Checking "+(i+1)+" of "+targets.length+": "+vehicle.registration);
      try{
        const {data,error}=await supabase.functions.invoke("dvsa-mot-lookup",{body:{registration:(vehicle.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}});
        if(error||data?.error||!data?.saved)failed++;else saved++;
      }catch{failed++;}
    }
    setBatchProgress("");setMessage("DVSA fleet check finished: "+saved+" saved, "+failed+" not saved. Any failed vehicles can be retried individually.");
    await load();setChecking(null);
  }
  const now=new Date();const today=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  const daysUntil=(date:string)=>Math.round((Date.parse(date.slice(0,10)+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
  const fmt=(d:string)=>d.slice(8,10)+"-"+d.slice(5,7)+"-"+d.slice(0,4);
  const normaliseReg=(value:string|null|undefined)=>(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const recordByAsset=new Map(records.map(r=>[r.asset_id,r]));
  const expiry=(v:MotVehicle)=>{const record=recordByAsset.get(v.id);return (record?motExpiryFromHistory(record):null)||firstMotDue(record)||v.mot_due;};
  const statusOf=(v:MotVehicle)=>{const record=recordByAsset.get(v.id);if(record?.mot_status==="FAILED")return "failed";if(!record?.last_checked_at)return "unchecked";const expiryDate=expiry(v);if(!expiryDate)return "unknown";if(firstMotDue(record)&&daysUntil(expiryDate)>=0)return "first";const days=daysUntil(expiryDate);return days<0?"expired":days<=60?"soon":"valid";};
  const counts={first:vehicles.filter(v=>statusOf(v)==="first").length,failed:vehicles.filter(v=>statusOf(v)==="failed").length,valid:vehicles.filter(v=>statusOf(v)==="valid").length,soon:vehicles.filter(v=>statusOf(v)==="soon").length,expired:vehicles.filter(v=>statusOf(v)==="expired").length,unchecked:vehicles.filter(v=>statusOf(v)==="unchecked").length,unknown:vehicles.filter(v=>statusOf(v)==="unknown").length};
  const shownVehicles=vehicles.filter(v=>(statusFilter==="all"||statusOf(v)===statusFilter)&&(!registrationSearch||normaliseReg(v.registration).includes(normaliseReg(registrationSearch))));
  const dueSoon=vehicles.filter(v=>{const d=expiry(v);return d&&daysUntil(d)>=0&&daysUntil(d)<=60;}).length;
  const overdue=vehicles.filter(v=>{const d=expiry(v);return d&&daysUntil(d)<0;}).length;
  return <section className="panel">
    <div className="panel-head"><div><h3>MOT Tracker · All vehicles</h3><p>All vans, cars and other registered vehicles, plus separate HGV and trailer records</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>void checkAllVehicles()} disabled={loading||checking!==null}>Check all vehicles with DVSA</button><button className="secondary" onClick={()=>void load()} disabled={loading||checking!==null}>Refresh</button><button className="primary" type="button" onClick={()=>setShowBooking(value=>!value)}>{showBooking?"Close booking form":"+ Book MOT"}</button></div></div>
    {showBooking&&<form onSubmit={e=>void saveBooking(e)} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,padding:16,background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:10,marginBottom:16}}><label>Asset<select required value={bookingForm.asset_id} onChange={e=>setBookingForm(v=>({...v,asset_id:e.target.value}))}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registration||v.asset_code} · {v.asset_code}</option>)}</select></label><label>Date<input type="date" required value={bookingForm.booking_date} onChange={e=>setBookingForm(v=>({...v,booking_date:e.target.value}))}/></label><label>Time<input type="time" required value={bookingForm.booking_time} onChange={e=>setBookingForm(v=>({...v,booking_time:e.target.value}))}/></label><label>Garage / where<input required maxLength={200} placeholder="Garage name or location" value={bookingForm.garage_name} onChange={e=>setBookingForm(v=>({...v,garage_name:e.target.value}))}/></label><button className="primary" type="submit" disabled={savingBooking||!bookingForm.asset_id||!bookingForm.booking_date||!bookingForm.booking_time||!bookingForm.garage_name.trim()}>{savingBooking?"Saving…":"Save MOT booking"}</button></form>}
    {bookingMessage&&<p role="status">{bookingMessage}</p>}
    {bookings.some(b=>b.status==="booked")&&<div style={{marginBottom:18}}><h3>Garage MOT bookings</h3><div className="table-wrap"><table><thead><tr><th>Asset</th><th>Date</th><th>Time</th><th>Garage / where</th><th>Action</th></tr></thead><tbody>{bookings.filter(b=>b.status==="booked").map(b=><tr key={b.id}><td>{vehicles.find(v=>v.id===b.asset_id)?.registration||vehicles.find(v=>v.id===b.asset_id)?.asset_code||"Vehicle"}</td><td>{b.booking_date.slice(8,10)+"-"+b.booking_date.slice(5,7)+"-"+b.booking_date.slice(0,4)}</td><td>{b.booking_time.slice(0,5)}</td><td>{b.garage_name}</td><td><button type="button" className="secondary" onClick={()=>void cancelBooking(b.id)}>Cancel booking</button></td></tr>)}</tbody></table></div></div>}
    {batchProgress&&<p role="status">{batchProgress}</p>}
    <div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",marginBottom:16}}>
      {([{key:"first",label:"First MOT not yet due",tone:"green"},{key:"failed",label:"FAILED MOT",tone:"red"},{key:"valid",label:"Valid MOT",tone:"green"},{key:"soon",label:"Due within 60 days",tone:"amber"},{key:"expired",label:"Expired MOT",tone:"red"},{key:"unchecked",label:"Not checked",tone:"neutral"},{key:"unknown",label:"DVSA date missing",tone:"neutral"}] as const).map(item=><button type="button" className="stat" key={item.key} onClick={()=>setStatusFilter(statusFilter===item.key?"all":item.key)} aria-pressed={statusFilter===item.key} style={{textAlign:"left",cursor:"pointer",border:statusFilter===item.key?"2px solid #2563eb":undefined}}><div className="stat-top"><span>{item.label}</span><FileCheck2 size={18}/></div><strong>{loading?"…":counts[item.key]}</strong><small>Click to filter</small></button>)}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:16}}>
      <input aria-label="Search registration" placeholder="Search registration (no spaces needed)" value={registrationSearch} onChange={e=>setRegistrationSearch(e.target.value)} style={{flex:"1 1 220px",padding:10,border:"1px solid #d1d5db",borderRadius:8}}/>
      <button className="secondary" onClick={()=>{setStatusFilter("all");setRegistrationSearch("");}}>Show all vehicles ({vehicles.length})</button>
    </div>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {lookupResult&&<div className="panel" style={{marginBottom:16,padding:16}}>
      <h3>DVSA MOT history</h3>
      {(Array.isArray(lookupResult)?lookupResult:Array.isArray(lookupResult?.vehicles)?lookupResult.vehicles:[lookupResult]).map((vehicle:any,i:number)=>{
        const tests=Array.isArray(vehicle?.motTests)?vehicle.motTests:[];
        return <div key={i}><p><b>{vehicle?.registration||vehicle?.registrationNumber||"Vehicle"}</b> · {[vehicle?.make,vehicle?.model].filter(Boolean).join(" ")}</p>
          <div className="table-wrap"><table><thead><tr><th>Test date</th><th>Result</th><th>Expiry date</th><th>Mileage</th></tr></thead><tbody>
            {tests.map((test:any,j:number)=><tr key={j}><td>{displayUkDate(test.completedDate?String(test.completedDate).slice(0,10):null)}</td><td>{test.testResult||"—"}</td><td>{displayUkDate(test.expiryDate)}</td><td>{test.odometerValue||"—"} {test.odometerUnit||""}</td></tr>)}
          </tbody></table></div>
          {!tests.length&&<p className="muted">DVSA returned no MOT tests for this registration.</p>}
        </div>;
      })}
    </div>}
    {!loading&&!error&&<div className="table-wrap"><table><thead><tr><th>Vehicle / trailer</th><th>MOT due / expiry</th><th>Warning</th><th>DVSA last checked</th><th>Action</th></tr></thead><tbody>
      {shownVehicles.slice().sort((a,b)=>(expiry(a)||"9999").localeCompare(expiry(b)||"9999")).map(v=>{
        const record=recordByAsset.get(v.id);const d=expiry(v);const days=d?daysUntil(d):null;
        const isFirstMot=Boolean(firstMotDue(record));const label=record?.mot_status==="FAILED"?"FAILED MOT · repairs required":!record?.last_checked_at?"Not checked":days===null?"DVSA date missing":isFirstMot&&days>=0?(days<=60?"First MOT due soon":"First MOT not yet due"):days<0?"MOT overdue":days===0?"Expires today":days<=14?"14-day warning":days<=30?"30-day warning":days<=60?"60-day warning":"Current";
        return <tr key={v.id}><td><b>{normaliseReg(v.registration)||v.asset_code}</b><small>{v.description||v.category||""} · Asset {v.asset_code}</small></td><td>{d?fmt(d)+(isFirstMot?" · First MOT due":""):"Not recorded"}</td><td><Tag tone={record?.mot_status==="FAILED"?"red":!record?.last_checked_at||days===null?"neutral":days<0?"red":days<=60?"amber":"green"}>{label}</Tag></td><td>{record?.last_checked_at?new Date(record.last_checked_at).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-"):"Not checked"}{record?.last_check_error&&<small>{record.last_check_error}</small>}</td><td>{v.registration?<button className="secondary" disabled={checking!==null} onClick={()=>void checkMot(normaliseReg(v.registration))}>{checking===normaliseReg(v.registration)?"Checking…":"Check DVSA"}</button>:<span className="muted">Certificate record</span>}</td></tr>;
      })}
    </tbody></table>{vehicles.length===0&&<p className="muted">No registered vehicles or MOT records found.</p>}</div>}
    <p className="muted">DVSA checks use the existing secure Supabase connection. Trailer certificate dates remain in the Plant Register. The manual bulk check covers the Vehicle category. The daily 4am UK DVSA schedule is active; its first successful full-fleet run is still awaiting verification. Trailer certificate dates remain separate.</p>
  </section>;
}
function GeneralRepairPaperForm({job,asset}: {job:any;asset:any}){
 const field=(label:string,value:unknown)=><div style={{border:"1px solid #94a3b8",padding:10,minHeight:58}}><strong style={{fontSize:12}}>{label}</strong><div style={{whiteSpace:"pre-wrap",marginTop:5}}>{displayUkDate(String(value??""))}</div></div>;
 return <div style={{background:"#fff",color:"#17212b",border:"2px solid #64748b",padding:16,margin:"12px 0"}}>
  <h3 style={{textAlign:"center",color:"#17212b"}}>JT UTILITIES LTD · ASSET JOB CARD</h3><p style={{textAlign:"center",fontWeight:700}}>{[job.job_card_number,job.created_at?new Date(job.created_at).toLocaleDateString("en-GB").replaceAll("/","-"):"",asset?.asset_code].filter(Boolean).join(" · ")}</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))"}}>
   {field("ASSET NUMBER",asset?.asset_code)}{field("DATE OF JOB / DEFECT",job.job_details?.["Date of defect"]||job.created_at?.slice(0,10))}{field("JOB CARD NO",job.job_card_number)}
   {field("DESCRIPTION",asset?.description)}{field("SERIAL NUMBER",asset?.serial_number)}
  </div>
  <div style={{border:"1px solid #94a3b8",padding:10,marginTop:8}}><strong>JOB DETAILS</strong><p style={{whiteSpace:"pre-wrap"}}>{job.instructions||job.title}</p></div>
  <div style={{border:"1px solid #94a3b8",padding:10,marginTop:8}}><strong>PARTS ADDED</strong><p style={{whiteSpace:"pre-wrap"}}>{job.engineer_parts||"To be completed by engineer"}</p></div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",marginTop:8}}>
   {field("LOCATION",job.job_details?.Location||asset?.location)}{field("WORK COMPLETED BY",job.engineer_signature)}
   {field("ASSET LOCATION",job.job_details?.["Asset Location"]||job.job_details?.Position||asset?.location)}{field("SIGNED",job.engineer_signature?job.engineer_signature+" · "+(job.engineer_signed_at||""):"Awaiting signature")}
   {field("COMPLIANT AS OF (DD/MM/YY)",job.job_details?.["Compliant as of"])}
  </div>
  <div className="workshop-office-signoff-record" style={{border:"2px solid #334155",borderRadius:6,marginTop:12,padding:12,background:job.office_signed_at?"#f0fdf4":"#fffaf0"}}>
   <strong style={{fontSize:14,display:"block",marginBottom:8}}>OFFICE SIGN-OFF {job.office_signed_at?"· APPROVED":"· AWAITING APPROVAL"}</strong>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:8}}>
    {field("OFFICE AUTHORISED BY",job.office_signature||"Awaiting office approval")}
    {field("OFFICE SIGNED AT (UK)",job.office_signed_at?new Date(job.office_signed_at).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-"):"Not yet signed")}
   </div>
   {job.office_comments&&<div style={{paddingTop:10,fontSize:13}}><strong>Office review notes</strong><p style={{whiteSpace:"pre-wrap",margin:"5px 0"}}>{job.office_comments}</p></div>}
  </div>
  <p style={{textAlign:"center",fontSize:12,marginTop:12}}>Greendown Farm, Chittlehampton, Umberleigh, EX37 9QR · www.jtutilities.com · 020 3840 4826</p>
 </div>;
}
function LolerPaperForm({kind,values,onChange,readOnly=false}:{kind:"plant"|"chains";values:Record<string,string>;onChange:(key:string,value:string)=>void;readOnly?:boolean}){
 const chains=kind==="chains";
 const fields=chains?[
 ["Date of Thorough Examination","Date of report","Report number"],
 ["Name & address of employer for whom the Thorough Examination was made","Address of premises at which the Examination took place"],
 ["Description & identification of the equipment or accessories","SWL","Date of manufacture","Serial no:","Date of last examination"],
 ["Name & address of employer/ examiner who carried out the previous thorough examination. (if applicable):"],
 ["Within an interval of 6 months?","Within an interval of 12 months?","In accordance with an examination scheme?","After the occurrence of exceptional circumstances?"],
 ["Identification of any part to have a defect which is or could become a danger to persons and a description of defect or Identification of deteriorating conditions which require attention, repair or adjustment. (If none state NONE)"],
 ["Status","IS THE EQUIPMENT/ ACCESSORY SAFE TO OPERATE/ USE?"],
 ["Name, address & qualifications of person making this report:","Name of person authenticating this report:","Latest date by which next thorough examination must be carried out:"],
 ["Is person making this report","Name & address of employer of person making this report:"]
 ]:[
 ["CERTIFICATE NO","ORIGINAL CERTIFICATE NO/CE"],
 ["EXAMINATION/TEST DATE","LAST EXAMINATION/TEST DATE"],
 ["TYPE OF EXAMINATION/TEST","ITEM"],
 ["NAME AND ADDRESS OF EQUIPMENT OWNER","LOCATION OF EQUIPMENT WHEN EXAMINED"],
 ["ACCESSORIES 6 MONTHLY","LIFTING PERSONS 6 MONTHLY","APPLIANCES 12 MONTHLY","EXAMINATION SCHEME","EXCEPTIONAL CIRCUMSTANCES"],
 ["QUANTITY","ID NO/S","EQUIPMENT DESCRIPTION","SWL/WLL","PROOF LOAD","NEXT EXAMINATION / TEST DUE DATE"],
 ["CRITICAL DEFECTS FOUND DURING EXAMINATION/TESTING OR ‘NONE’"],
 ["FURTHER DETAILS OR REMEDIAL ACTION REQUIRED"],
 ["NAME OF INSPECTOR","QUALIFICATIONS","COMPANY"]
 ];
 const plantIntervalKeys=["ACCESSORIES 6 MONTHLY","LIFTING PERSONS 6 MONTHLY","APPLIANCES 12 MONTHLY","EXAMINATION SCHEME","EXCEPTIONAL CIRCUMSTANCES"];
 const choice=(key:string)=>(chains&&["Within an interval of 6 months?","Within an interval of 12 months?","In accordance with an examination scheme?","After the occurrence of exceptional circumstances?","IS THE EQUIPMENT/ ACCESSORY SAFE TO OPERATE/ USE?"].includes(key))||(!chains&&plantIntervalKeys.includes(key));
 return <div style={{background:"#fff",color:"#17212b",border:"2px solid #64748b",padding:18,margin:"14px 0",borderRadius:4}}>
  {chains?<h3 style={{textAlign:"center",color:"#17212b"}}>REPORT OF A THOROUGH EXAMINATION OF LIFTING EQUIPMENT & ACCESSORIES</h3>:<div style={{display:"flex",gap:18,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",marginBottom:20}}><img src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd" style={{maxWidth:210,width:"35%",height:"auto",objectFit:"contain"}}/><div style={{flex:"1 1 340px",textAlign:"right",color:"#17496b"}}><strong style={{fontSize:15}}>Report of Thorough Examination and/or Test of Equipment</strong><div style={{fontSize:12,marginTop:5}}>Lifting Operations and Lifting Equipment Regulations L.O.L.E.R 1998 SI 2307</div><div style={{fontSize:12,marginTop:5}}>Provision and Use of Work Equipment Regulations P.U.W.E.R 1998 SI 2306</div><div style={{fontSize:12,marginTop:5}}>Supply of Machinery (Safety) Regulations 2008</div></div></div>}
  {fields.map((group,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",borderTop:"1px solid #64748b"}}>
   {group.map(key=><label key={key} style={{borderRight:"1px solid #cbd5e1",padding:8,fontSize:12,fontWeight:600,color:"#17212b"}}>{key}
    {choice(key)?<select disabled={readOnly} value={values[key]||""} onChange={e=>onChange(key,e.target.value)} style={{width:"100%",marginTop:6}}><option value="">Not selected</option><option value="Yes">{chains?"Yes":"Selected (X)"}</option><option value="No">{chains?"No":"Not applicable"}</option></select>:
    <textarea readOnly={readOnly} rows={key.length>70?3:2} value={values[key]||""} onChange={e=>onChange(key,e.target.value)} style={{width:"100%",marginTop:6,background:readOnly?"#f1f5f9":"#fff"}}/>}
   </label>)}
  </div>)}
  {chains?<><p style={{fontSize:12,marginTop:12}}><b>* Fault code reference:</b></p>
   <p style={{fontSize:12}}>Immediate - Defects which are a danger to persons - equipment or accessories must be REMOVED FROM SERVICE</p>
   <p style={{fontSize:12}}>A- Defects which are a danger or may become a danger to persons, action required - repairs to be concluded within 1 month</p>
   <p style={{fontSize:12}}>B- Identification of components / assemblies found to be deteriorating which need to be checked or rectified.</p>
   <p style={{fontSize:12}}>C - Observations on the condition of the equipment or accessories, comments & recommendations</p>
   <p style={{fontSize:12}}>This report complies with the requirements of the Lifting Operations and Lifting Equipment Regulations 1998</p>
  </>:<p style={{fontSize:12,marginTop:12}}><b>DECLARATION BY INSPECTOR</b><br/>I hereby certify that no critical defects were found on the equipment described on this certificate at the time of inspection and that this equipment was found to be fit for use.</p>}
  {!chains&&<div style={{border:"1px solid #64748b",minHeight:90,padding:10,marginTop:12}}><b>INSPECTOR SIGNATURE</b><p style={{fontSize:12}}>To be signed by the competent person carrying out the examination. Name and qualifications above do not constitute a signature.</p>{readOnly&&<p>Signature recorded at examiner sign-off stage.</p>}</div>}
  <p style={{fontSize:12}}>Examiner sign-off is recorded separately when the engineer submits this job card.</p>
 </div>;
}
function createJobCertificatePdf(job:any,assetLabel:string):Blob{
 const lines:string[]=[];
 const add=(label:string,value:unknown)=>{lines.push(label);displayUkDate(String(value??"Not recorded")).split("\n").forEach(v=>{const words=v.replace(/[^\x20-\x7E]/g,"-").split(/\s+/);let line="";for(const word of words){if((line+" "+word).length>88){lines.push("  "+line);line=word;}else line=line?line+" "+word:word;}lines.push("  "+line);});lines.push("");};
 lines.push("JT UTILITIES LTD","APPROVED JOB CARD / EXAMINATION RECORD",""); 
 add("Certificate / job reference",job.certificate_number||job.id);
 add("Asset",assetLabel);add("Job type",job.job_type);add("Work order",job.title);add("Instructions",job.instructions);
 for(const [key,value] of Object.entries(job.job_details||{}))add(key,value);
 for(const [key,value] of Object.entries(job.completion_checklist||{}))add(key,value);
 add("Work completed",job.engineer_work);add("Parts used",job.engineer_parts);add("Hours",job.engineer_hours);
 add("Examiner / engineer sign-off",job.engineer_signature);add("Examiner signed at",job.engineer_signed_at);
 add("Office review comments",job.office_comments);add("Office approval",job.office_signature);add("Office approved at",job.office_signed_at);
 if(job.job_type==="LOLER chains & accessories"){lines.push("FAULT CODE REFERENCE","Immediate - Danger to persons: REMOVE FROM SERVICE","A - Dangerous or potentially dangerous defects: action required","B - Deteriorating components requiring attention","C - Condition observations and recommendations","");}
 if(job.job_type==="LOLER thorough examination"){lines.push("Lifting Operations and Lifting Equipment Regulations 1998","Provision and Use of Work Equipment Regulations 1998","");}
 lines.push("Record of engineer and office approvals. Review against the original","statutory examination template before using as a formal certificate.");
 const chunks:string[][]=[];for(let i=0;i<lines.length;i+=55)chunks.push(lines.slice(i,i+55));
 const objects:string[]=[];const push=(v:string)=>{objects.push(v);return objects.length;};
 const font=push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
 const pages=push("");
 const pageIds:number[]=[];
 for(const chunk of chunks){const stream="BT /F1 9 Tf 40 795 Td 12 TL "+chunk.map((line,i)=>(i?"T* ":"")+"("+line.split(String.fromCharCode(92)).join(String.fromCharCode(92,92)).split("(").join(String.fromCharCode(92)+"(").split(")").join(String.fromCharCode(92)+")")+") Tj").join(" ")+" ET";
  const content=push("<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream");
  pageIds.push(push("<< /Type /Page /Parent "+pages+" 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+font+" 0 R >> >> /Contents "+content+" 0 R >>"));
 }
 objects[pages-1]="<< /Type /Pages /Count "+pageIds.length+" /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] >>";
 const catalog=push("<< /Type /Catalog /Pages "+pages+" 0 R >>");
 let output="%PDF-1.4\n";const offsets=[0];objects.forEach((o,i)=>{offsets.push(output.length);output+=(i+1)+" 0 obj\n"+o+"\nendobj\n";});
 const start=output.length;output+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size "+(objects.length+1)+" /Root "+catalog+" 0 R >>\nstartxref\n"+start+"\n%%EOF";
 return new Blob([output],{type:"application/pdf"});
}
function WorkshopDashboardSummary({supabase,onOpen}:{supabase:SupabaseClient;onOpen:()=>void}){
 const [jobs,setJobs]=useState<any[]>([]),[assets,setAssets]=useState<Record<string,string>>({}),[error,setError]=useState("");
 useEffect(()=>{let active=true;const load=async()=>{
  const [j,a]=await Promise.all([supabase.from("workshop_job_cards").select("id,title,status,job_card_number,asset_id,created_at").order("created_at",{ascending:false}).limit(100),supabase.from("assets").select("id,asset_code")]);
  if(!active)return;if(j.error)setError(j.error.message);else{setError("");setJobs(j.data||[]);}if(!a.error)setAssets(Object.fromEntries((a.data||[]).map(x=>[x.id,x.asset_code])));
 };void load();const channel=supabase.channel("workshop-dashboard-live").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},()=>void load()).subscribe();return()=>{active=false;void supabase.removeChannel(channel);};},[supabase]);
 const groups=[{name:"Assigned / awaiting work",match:(s:string)=>["New","Assigned","In progress","Returned for correction"].includes(s)},{name:"Waiting for sign-off",match:(s:string)=>s==="Awaiting office approval"},{name:"Completed / done",match:(s:string)=>["Approved","Completed","Closed"].includes(s)}];
 return <section className="panel"><div className="panel-head"><div><h3>Workshop and maintenance</h3><p>Live workshop job cards, from new work through sign-off to completion.</p></div><button className="text-btn" onClick={onOpen}>Workshop job cards</button></div>
 {error&&<p role="alert">{error}</p>}
 {groups.map(group=>{const items=jobs.filter(j=>group.match(j.status));return <div key={group.name} style={{marginTop:14}}><h4>{group.name} · {items.length}</h4>{items.length===0?<p className="muted">No job cards in this stage.</p>:<div style={{display:"grid",gap:7}}>{items.slice(0,8).map(j=><button key={j.id} className="secondary" style={{textAlign:"left",display:"block",width:"100%"}} onClick={onOpen}><strong>{j.job_card_number||"Job card"} · {assets[j.asset_id]||"Asset"}</strong> — {j.title} <small>({j.status})</small></button>)}{items.length>8&&<p className="muted">+ {items.length-8} more — open Workshop job cards to view all.</p>}</div>}</div>})}
 {!jobs.length&&!error&&<p className="muted">No job cards raised yet.</p>}
 </section>;
}
function WorkshopJobs({supabase,activeOnly=false}:{supabase:SupabaseClient;activeOnly?:boolean}){
 const [jobs,setJobs]=useState<any[]>([]),[assets,setAssets]=useState<any[]>([]),[role,setRole]=useState(""),[engineers,setEngineers]=useState<any[]>([]);
 const [canDeleteTestJobs,setCanDeleteTestJobs]=useState(false);
 const [asset,setAsset]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState(""),[priority,setPriority]=useState("Normal"),[engineer,setEngineer]=useState("");
 const jobTypes=[["General repair","Job Card"],["Other / unexpected work","Ad hoc / unexpected work"],["Breakdown","Breakdown"],["Service","Service"],["Pre-use / return-to-work check","Pre-Use / Return-to-Work Check"],["HGV / trailer PMI","PMI"],["LOLER thorough examination","LOLERs"]];
 const plantLolerDefaults={"NAME OF INSPECTOR":"Simon Squire","QUALIFICATIONS":"NPORS N039 and IRTEC Level 3","COMPANY":"JT Utilities LTD"};
 const [jobType,setJobType]=useState("General repair"),[jobDetails,setJobDetails]=useState<Record<string,string>>({});
 const fieldsByType:Record<string,string[]>={
  "General repair":[],"Breakdown":["Breakdown location","Vehicle condition / recovery required"],
  "Service":["Mileage or engine hours","Service checklist / specification"],"HGV / trailer PMI":["Mileage","Inspection date","PMI checklist / inspection notes"],"LOLER thorough examination":["Equipment identification","Examination date","Competent person","Report / certificate reference"],
  "Defect rectification":["Original defect reference","Rectification and safety checks"],"Pre-use / return-to-work check":["Original job card / repair reference","Proposed job / site","Check notes"],"Other / unexpected work":["Where work occurred","Reason for unplanned work"]
 };
 const checklistByType:Record<string,string[]>={"HGV / trailer PMI":["Brakes","Steering","Tyres and wheels","Lights and electrics","Suspension and chassis","Safety equipment","Inspection result","Defects and action"],"LOLER thorough examination":["Identification and SWL","Structure and welds","Lifting components","Hydraulics and controls","Safety devices","Examination result","Defects and restrictions"],"Service":["Fluids and filters","Inspection checks","Service result"],"Pre-use / return-to-work check":["Fluid levels and visible leaks","Tyres / tracks and running gear","Brakes steering and controls","Guards alarms and safety devices","Functional test completed","Pre-use result","Outstanding defects / restrictions"]};
 const [checklist,setChecklist]=useState<Record<string,string>>({});
 const [assetLolerDue,setAssetLolerDue]=useState<Record<string,string>>({});
 const [lolerFields,setLolerFields]=useState<Record<string,string>>({});
 const [showCreateJob,setShowCreateJob]=useState(false);
 const [showWheelCreate,setShowWheelCreate]=useState(false);
 const [mechanicFilter,setMechanicFilter]=useState<"active"|"waiting"|"done">("active");
 const [officeFilter,setOfficeFilter]=useState<"approval"|"active"|"history">("active");
 const [showSpecialistFields,setShowSpecialistFields]=useState(false);
 const [editCard,setEditCard]=useState(false),[editTitle,setEditTitle]=useState(""),[editInstructions,setEditInstructions]=useState(""),[editDetails,setEditDetails]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState(""),[work,setWork]=useState(""),[parts,setParts]=useState(""),[partItems,setPartItems]=useState<string[]>([""]),[hours,setHours]=useState("0"),[signature,setSignature]=useState(""),[comments,setComments]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;(async()=>{
  const {data:user}=await supabase.auth.getUser();if(!user.user)return;
  const [j,a,r,e,profile,loler]=await Promise.all([supabase.from("workshop_job_cards").select("*").order("created_at",{ascending:false}),supabase.from("assets").select("id,asset_code,description,category,serial_number,location,manufacturer,model,registration").order("asset_code"),supabase.from("planttrack_roles").select("role").eq("user_id",user.user.id).maybeSingle(),supabase.rpc("list_assignable_workshop_engineers"),supabase.from("profiles").select("role,active").eq("id",user.user.id).maybeSingle(),supabase.from("examinations").select("asset_id,next_due,examined_at").ilike("examination_type","%LOLER%").order("examined_at",{ascending:false})]);
  if(!active)return;
  setCanDeleteTestJobs(user.user.id==="2807b17d-6507-4808-9909-15e11e44637a"&&profile.data?.role==="admin"&&profile.data?.active===true);
  if(j.error)setNotice(j.error.message);else setJobs(j.data||[]);
  setAssets(a.data||[]);setRole(r.data?.role||"");setEngineers(e.data||[]);
  if(!loler.error){const dates:Record<string,string>={};for(const exam of loler.data||[]){if(exam.asset_id&&exam.next_due&&!dates[exam.asset_id])dates[exam.asset_id]=String(exam.next_due).slice(0,10);}setAssetLolerDue(dates);}
 })();return()=>{active=false};},[supabase,refresh]);
 useEffect(()=>{const update=()=>setRefresh(n=>n+1);const channel=supabase.channel("mechanic-job-inbox").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},update).subscribe();window.addEventListener("focus",update);const timer=window.setInterval(update,30000);return()=>{window.clearInterval(timer);window.removeEventListener("focus",update);void supabase.removeChannel(channel);};},[supabase]);
 const jobStage=(status:string)=>["New","Assigned","In progress","Returned for correction"].includes(status)?0:status==="Awaiting office approval"?1:2;
 const orderedJobs=[...jobs].sort((a,b)=>jobStage(a.status)-jobStage(b.status)||String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const stageNames=["Work needing completion","Waiting for sign-off","Completed / history"];
 const mechanicActive=(job:any)=>["Assigned","In progress","Returned for correction"].includes(job.status);
 const mechanicVisible=orderedJobs.filter(job=>mechanicFilter==="active"?mechanicActive(job):mechanicFilter==="waiting"?job.status==="Awaiting office approval":!mechanicActive(job)&&job.status!=="Awaiting office approval");
 const officeVisible=orderedJobs.filter(job=>activeOnly?["New","Assigned","In progress","Returned for correction","Awaiting office approval"].includes(job.status):officeFilter==="approval"?job.status==="Awaiting office approval":officeFilter==="active"?["New","Assigned","In progress","Returned for correction"].includes(job.status):["Approved","Dismissed"].includes(job.status));
 const selectedJobRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{if(selected){const el=selectedJobRef.current;if(el){el.scrollIntoView({behavior:"smooth",block:"start"});}}},[selected]);
 const suggestedLolerDate=(months:number)=>{const d=new Date();const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);};
 const assetLolerDefaults=(assetId:string,kind:string,certificateNo?:string,jobNo?:string):Record<string,string>=>{const a=assets.find(x=>x.id===assetId);if(!a)return {};const description=[a.manufacturer,a.model,a.description].filter(Boolean).join(" · ");const common:Record<string,string>=kind==="LOLER thorough examination"?{"EXAMINATION/TEST DATE":new Date().toISOString().slice(0,10),"CERTIFICATE NO":certificateNo||jobNo||"","NAME AND ADDRESS OF EQUIPMENT OWNER":"JT Utilities LTD, Greendown Farm, Chittlehampton, Nr Umberleigh, Devon EX37 9QR","LOCATION OF EQUIPMENT WHEN EXAMINED":a.location||"","ITEM":a.asset_code||"","ID NO/S":a.asset_code||"","EQUIPMENT DESCRIPTION":description||a.asset_code||"","NEXT EXAMINATION / TEST DUE DATE":suggestedLolerDate(12)}:{"Date of Thorough Examination":new Date().toISOString().slice(0,10),"Date of report":new Date().toISOString().slice(0,10),"Latest date by which next thorough examination must be carried out:":suggestedLolerDate(6),"Report number":certificateNo||jobNo||"","Name & address of employer for whom the Thorough Examination was made":"JT Utilities LTD, Greendown Farm, Chittlehampton, Nr Umberleigh, Devon EX37 9QR","Address of premises at which the Examination took place":a.location||"","Description & identification of the equipment or accessories":[a.asset_code,description].filter(Boolean).join(" · "),"Serial no:":a.serial_number||""};return common;};
 const chosen=jobs.find(j=>j.id===selected);
 // Vehicle and HGV jobs use registrations; plant and equipment use asset codes.
 const isRegisteredVehicle=(a:any)=>["vehicle","hgv"].includes(String(a.category||"").trim().toLowerCase())&&Boolean(String(a.registration||"").trim());
 const registeredVehicles=assets.filter(isRegisteredVehicle).sort((a,b)=>String(a.registration).localeCompare(String(b.registration),undefined,{numeric:true}));
 const numberedAssets=assets.filter(a=>!isRegisteredVehicle(a));
 const assetLabel=(a:any)=>isRegisteredVehicle(a)?String(a.registration).trim():String(a.asset_code||"");
 const assetName=(id:string)=>{const a=assets.find(x=>x.id===id);return a?assetLabel(a)+" · "+a.description:id};
 const jobHeading=(job:any)=>[job.job_card_number||"Job card",new Date(job.created_at).toLocaleDateString("en-GB",{timeZone:"Europe/London"}).replaceAll("/","-"),assets.find(a=>a.id===job.asset_id)?assetLabel(assets.find(a=>a.id===job.asset_id)):"Asset"].join(" · ");
 const specialistJob=(job:any)=>["HGV / trailer PMI","LOLER thorough examination","LOLER chains & accessories","Service","Pre-use / return-to-work check",WHEEL_JOB_TYPE].includes(job.job_type);
 const requiredChecklist=(job:any)=>job.job_type===WHEEL_JOB_TYPE?WHEEL_REQUIRED:preUseIsFullSheet(job)?[...PRE_USE_ITEMS,"Pre-use result"]:checklistByType[job.job_type]||[];
 const preUseFullSheet=(job:any)=>preUseIsFullSheet(job);
 const preUseSheetForm=(job:any)=>{
  const completed=PRE_USE_ITEMS.filter(k=>["Checked","N/A","Defect"].includes(checklist[k])).length;
  return <div className="workshop-pre-use-sheet">
   <div className="workshop-pre-use-job-number"><span>Job card number (allocated automatically)</span><strong>{job.job_card_number||"Pending allocation"}</strong><small>Asset: {assetName(job.asset_id)}</small></div>
   <p className="workshop-pre-use-warning">JT UTILITIES PRE-USE INSPECTION SHEET · Before equipment returns to work. Complete each CHKD / N/A / DEFECT box and add comments or work done. Any defect must be described. A failed inspection can be sent to the office but it cannot be approved as safe to use.</p>
   <div className="workshop-pre-use-sheet-meta">
    <label>Next LOLER inspection due (where recorded)<input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(checklist["Statutory inspection expiry date"]||"")?checklist["Statutory inspection expiry date"]:""} onChange={e=>setChecklist(c=>({...c,"Statutory inspection expiry date":e.target.value}))}/><small>Pre-filled from the asset LOLER register where available. Check the current certificate before returning equipment to use.</small></label>
   </div>
   <p role="status" className="workshop-pre-use-progress">{completed} of {PRE_USE_ITEMS.length} checks marked · {PRE_USE_ITEMS.filter(k=>checklist[k]==="Defect").length} defect(s)</p>
   {PRE_USE_SECTIONS.map(group=><section className="workshop-pre-use-section" key={group.name}>
    <h4>{group.name}</h4>
    {group.items.map(item=><div className="workshop-pre-use-row" key={item}>
     <strong>{item}</strong>
     <div className="workshop-pre-use-choices" role="group" aria-label={item+" inspection result"}>
      {(["Checked","N/A","Defect"] as const).map(choice=><button type="button" key={choice} className={"workshop-pre-use-option "+(choice==="Checked"?"pass":choice==="N/A"?"na":"defect")+(checklist[item]===choice?" chosen":"")} aria-pressed={checklist[item]===choice} onClick={()=>setChecklist(c=>({...c,[item]:choice,...(choice==="Defect"&&c["Pre-use result"]===PRE_USE_RESULT_PASS?{"Pre-use result":PRE_USE_RESULT_FAIL}:{})}))}>{choice==="Checked"?"✓ PASS":choice==="N/A"?"— N/A":"! DEFECT"}</button>)}
     </div>
     <label className={checklist[item]==="Defect"?"workshop-pre-use-notes required": "workshop-pre-use-notes"}>Notes / comments &amp; work done {checklist[item]==="Defect"&&<span className="workshop-pre-use-required">Required for defect</span>}<textarea rows={2} value={checklist[item+" - Comments"]||""} onChange={e=>setChecklist(c=>({...c,[item+" - Comments"]:e.target.value}))} placeholder={checklist[item]==="Defect"?"Describe the defect, safety concern and action needed":"Add any notes or work done (optional)"}/></label>
    </div>)}
   </section>)}
   <div className="workshop-pre-use-finish">
    <label>Final inspection result
     <select value={checklist["Pre-use result"]||""} onChange={e=>setChecklist(c=>({...c,"Pre-use result":e.target.value}))}>
      <option value="">Choose inspection result</option>
      <option value={PRE_USE_RESULT_PASS}>PASS — no outstanding defects</option>
      <option value={PRE_USE_RESULT_FAIL}>FAIL — do not use</option>
     </select>
    </label>
    <label>Outstanding defects / restrictions<textarea rows={3} value={checklist["Outstanding defects / restrictions"]||""} onChange={e=>setChecklist(c=>({...c,"Outstanding defects / restrictions":e.target.value}))} placeholder="None, or details of any unsafe conditions"/></label>
   </div>
  </div>;
 };
 const preUseChoice=(key:string)=>["Fluid levels and visible leaks","Tyres / tracks and running gear","Brakes steering and controls","Guards alarms and safety devices","Functional test completed"].includes(key);
 const preUseInconsistent=(job:any)=>job.job_type==="Pre-use / return-to-work check"&&(
  checklist["Pre-use result"]===PRE_USE_RESULT_PASS&&
  (preUseFullSheet(job)?preUseHasDefects(checklist):requiredChecklist(job).some((key:string)=>preUseChoice(key)&&checklist[key]==="Fail")));
 const preUseMissing=(job:any):string[]=>{
  if(!preUseFullSheet(job))return requiredChecklist(job).filter((key:string)=>!String(checklist[key]||"").trim());
  const incomplete=PRE_USE_ITEMS.filter(item=>!["Checked","N/A","Defect"].includes(checklist[item]));
  const missingComments=PRE_USE_ITEMS.filter(item=>checklist[item]==="Defect"&&!String(checklist[item+" - Comments"]||"").trim());
  return [
   ...(incomplete.length? [incomplete.length+" inspection items still need CHKD, N/A or DEFECT ("+incomplete.slice(0,2).join(", ")+")"]:[]),
   ...(missingComments.length? [missingComments.length+" reported defect(s) need comments ("+missingComments.slice(0,2).join(", ")+")"]:[]),
   ...(![PRE_USE_RESULT_PASS,PRE_USE_RESULT_FAIL].includes(checklist["Pre-use result"])?["Final pre-use PASS or FAIL result"]:[])
  ];
 };
 const preUseField=(key:string)=><label key={key}>{key}
  {key==="Pre-use result"?<select value={checklist[key]||""} onChange={e=>setChecklist(c=>({...c,[key]:e.target.value}))}>
   <option value="">Choose pass or fail</option>
   <option value="Pass - safe for proposed use">Pass - safe for proposed use</option>
   <option value="Fail - do not use">Fail - do not use</option>
  </select>:preUseChoice(key)?<select value={checklist[key]||""} onChange={e=>setChecklist(c=>({...c,[key]:e.target.value}))}>
   <option value="">Choose result</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="N/A">Not applicable</option>
  </select>:<textarea rows={2} value={checklist[key]||""} onChange={e=>setChecklist(c=>({...c,[key]:e.target.value}))} placeholder={key==="Outstanding defects / restrictions"?"Enter None if no defects; otherwise list restrictions":"Enter the related job number or findings"}/>}
 </label>;
 const missingEngineerFields=(job:any)=>[
  ...(job.job_type===WHEEL_JOB_TYPE?missingWheelFields(checklist):preUseMissing(job)),
  ...(preUseInconsistent(job)?["Final result cannot be PASS while a defect is marked; choose FAIL"]:[]),
  ...(work.trim().length<3?["Work completed"]:[]),
  ...(!Number.isFinite(Number(hours))||Number(hours)<0?["Valid hours worked"]:[]),
  ...(signature.trim().length<2?["Mechanic signature"]:[])
 ];
 const openMechanicJob=(job:any)=>{
  setSelected(job.id);setShowWheelCreate(false);setNotice("");setEditCard(false);setShowSpecialistFields(specialistJob(job));
  setComments("");setSignature("");setWork(job.engineer_work||"");setParts(job.engineer_parts||"");
  setPartItems(job.engineer_parts?job.engineer_parts.split("\n"):[""]);setHours(String(job.engineer_hours??0));
  const saved=job.completion_checklist||{};
  setChecklist({...((preUseIsFullSheet(job)&&assetLolerDue[job.asset_id]&&!String(saved["Statutory inspection expiry date"]||"").trim())?{"Statutory inspection expiry date":assetLolerDue[job.asset_id]}:{}),...saved});setLolerFields(saved);
 };
 async function saveEngineerDraft(job:any){
  if(!Number.isFinite(Number(hours))||Number(hours)<0){setNotice("Enter a valid number of hours before saving.");return;}
  await perform(()=>supabase.rpc("save_engineer_workshop_draft",{
   p_job:job.id,p_work:work,p_parts:parts,p_hours:Number(hours),
   p_checklist:{...checklist,...((job.job_type==="LOLER thorough examination"||job.job_type==="LOLER chains & accessories")?{...assetLolerDefaults(job.asset_id,job.job_type,job.certificate_number,job.job_card_number),...lolerFields}:{})}
  }),"Progress and any inspection findings saved. Job has not been signed or submitted.");
 }
 async function submitEngineerJob(job:any){
  const missing=missingEngineerFields(job);
  if(missing.length){setNotice("Please complete these fields to send the job: "+missing.join("; "));if(requiredChecklist(job).length)setShowSpecialistFields(true);window.setTimeout(()=>document.getElementById("mechanic-submit-feedback")?.scrollIntoView({behavior:"smooth",block:"center"}),30);return;}
  await perform(()=>supabase.rpc("sign_engineer_job_typed",{
   p_job:job.id,p_work:work,p_parts:parts,p_hours:Number(hours),p_signature:signature,
   p_checklist:{...checklist,...((job.job_type==="LOLER thorough examination"||job.job_type==="LOLER chains & accessories")?{...assetLolerDefaults(job.asset_id,job.job_type,job.certificate_number,job.job_card_number),...lolerFields}:{})}
  }),"Signed and sent to office for approval. Your signature and time have been recorded.");
 }
 async function archiveApprovedPdf(job:any){
  const chosenAsset=assets.find(a=>a.id===job.asset_id);
  const fullJob={...job,asset_code:chosenAsset?.asset_code,asset_description:chosenAsset?.description,asset_serial_number:chosenAsset?.serial_number,asset_location:chosenAsset?.location};
  const bucket=supabase.storage.from("planttrack-job-certificates");
  // Preserve the separate statutory LOLER certificate under its established path.
  // Ordinary work continues to file a JT Asset Job Card as the primary PDF.
  if(!job.approved_pdf_path){
   const path=job.asset_id+"/"+job.id+".pdf";
   const pdf=job.job_type===WHEEL_JOB_TYPE?await generateWheelRetorquePdf(fullJob,assetName(job.asset_id)):await generateApprovedJobPdf(fullJob,assetName(job.asset_id));
   const upload=await bucket.upload(path,pdf,{contentType:"application/pdf",upsert:false});
   if(upload.error&&!upload.error.message.toLowerCase().includes("already exists"))throw upload.error;
   const attached=await supabase.rpc("attach_approved_job_pdf",{p_job:job.id,p_path:path});
   if(attached.error)throw attached.error;
  }
  // Every approved job gets its own signed JT Asset Job Card.
  // For LOLER, the original document above remains the separate statutory certificate.
  if(job.job_type!==WHEEL_JOB_TYPE&&!job.job_card_pdf_path){
   await fileStandardJobCard(fullJob);
  }
 }
 async function fileStandardJobCard(job:any){
  const chosenAsset=assets.find(a=>a.id===job.asset_id);
  const fullJob={...job,asset_code:chosenAsset?.asset_code,asset_description:chosenAsset?.description,asset_serial_number:chosenAsset?.serial_number,asset_location:chosenAsset?.location};
  const path=job.asset_id+"/"+job.id+"-job-card.pdf";
  const pdf=await generateAssetJobCardPdf(fullJob,assetName(job.asset_id));
  const upload=await supabase.storage.from("planttrack-job-certificates").upload(path,pdf,{contentType:"application/pdf",upsert:false});
  if(upload.error&&!upload.error.message.toLowerCase().includes("already exists"))throw upload.error;
  const linked=await supabase.rpc("attach_workshop_job_card_pdf",{p_job:job.id,p_path:path});
  if(linked.error)throw linked.error;
 }
 async function fileMissingApprovedJobCards(){
  if(busy)return;
  const missing=jobs.filter(j=>j.status==="Approved"&&!j.job_card_pdf_path&&j.job_type!==WHEEL_JOB_TYPE);
  if(!missing.length){setNotice("All approved jobs already have their JT Asset Job Cards filed.");return;}
  setBusy(true);setNotice("Filing "+missing.length+" missing JT job card(s)…");
  let completed=0;const problems:string[]=[];
  for(const job of missing){
   try{await fileStandardJobCard(job);completed++;}
   catch(e){problems.push((job.job_card_number||job.id)+": "+(e instanceof Error?e.message:String(e)));}
   setNotice("Filed "+completed+" of "+missing.length+" JT job card(s)"+(problems.length?" · "+problems.length+" need attention":"")+".");
  }
  setBusy(false);setRefresh(n=>n+1);
  setNotice(completed+" JT job card(s) filed. Original signed documents were preserved."+(problems.length?" Failed: "+problems.join(" | "):""));
 }
 async function approveAndArchive(job:any){
  setBusy(true);setNotice("");
  try{
   const result=await supabase.rpc("review_workshop_job",{p_job:job.id,p_approve:true,p_comments:comments,p_signature:signature});
   if(result.error)throw result.error;
   const updated={...job,status:"Approved",office_comments:comments,office_signature:signature,office_signed_at:new Date().toISOString()};
   const {data:approved,error}=await supabase.from("workshop_job_cards").select("*").eq("id",job.id).single();
   if(error)throw error;
   await archiveApprovedPdf(approved||updated);
   setNotice(job.job_type===WHEEL_JOB_TYPE?"Wheel removal / re-torque PDF filed against the asset under its own job number.":"Office signed and approved. The JT Asset Job Card has been filed"+(String(job.job_type||"").startsWith("LOLER")?" alongside the separate statutory LOLER certificate.":" against the machine."));
  }catch(e){setNotice("Approval or PDF filing needs attention: "+(e instanceof Error?e.message:String(e))+". If approved, use Retry PDF filing.");}
  finally{setBusy(false);setRefresh(n=>n+1);}
 }
 async function downloadJobCardPdf(job:any){
  try{
   const selectedAsset=assets.find(a=>a.id===job.asset_id);
   const data={...job,asset_code:selectedAsset?.asset_code,asset_description:selectedAsset?.description,asset_serial_number:selectedAsset?.serial_number,asset_location:selectedAsset?.location};
   const pdf=job.job_type===WHEEL_JOB_TYPE?await generateWheelRetorquePdf(data,assetName(job.asset_id),true):await generateAssetJobCardPdf(data,selectedAsset?.asset_code||assetName(job.asset_id),true);
   const url=URL.createObjectURL(pdf);
   const link=document.createElement("a");link.href=url;link.download=(job.job_card_number||"JT-Job-Card")+".pdf";document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){setNotice("Could not generate job card PDF: "+(e instanceof Error?e.message:String(e)));}
 }
 async function viewArchivedPdf(path:string){
  // Opening the tab before awaiting Supabase avoids popup blockers in installed mobile apps.
  const tab=window.open("","_blank");
  if(tab){tab.document.title="JT Utilities job document";tab.document.body.textContent="Opening your job document…";}
  const {data,error}=await supabase.storage.from("planttrack-job-certificates").createSignedUrl(path,120);
  if(error||!data?.signedUrl){if(tab)tab.close();setNotice(error?.message||"Could not open PDF");return;}
  if(tab)tab.location.href=data.signedUrl;
  else window.location.assign(data.signedUrl);
 }
 const mayDeleteTestJob=(job:any)=>canDeleteTestJobs&&
  ["New","Assigned","In progress","Returned for correction"].includes(job.status)&&
  !job.engineer_signed_at&&!job.office_signed_at&&!job.approved_pdf_path&&!job.job_card_pdf_path&&
  !String(job.job_type||"").startsWith("LOLER")&&!job.certificate_number;
 async function deleteTestJob(job:any){
  if(!mayDeleteTestJob(job))return;
  const number=String(job.job_card_number||"");
  if(!window.confirm("Permanently delete unsigned job "+number+"? This removes it from Workshop and the Asset Folder. Signed and filed jobs are protected."))return;
  const entered=window.prompt("To confirm deletion, type the full job number: "+number,"");
  if(entered!==number){if(entered!==null)setNotice("Deletion cancelled: job-card number did not match.");return;}
  setBusy(true);setNotice("");
  try{
   const result=await supabase.rpc("delete_my_test_workshop_job",{p_job:job.id,p_confirmation:entered});
   if(result.error)throw result.error;
   setSelected("");setNotice(number+" deleted. The removal was recorded in the audit log.");
   setRefresh(v=>v+1);
  }catch(e){setNotice("Could not delete "+number+": "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function perform(fn:()=>PromiseLike<{error:any}>,success:string){setBusy(true);setNotice("");try{const r=await fn();if(r.error)throw r.error;setNotice(success);setRefresh(x=>x+1);}catch(e){setNotice("Job action failed: "+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}}
 return <section className="panel workshop-job-panel">
  <div className="panel-head"><div className="workshop-heading"><img className="workshop-header-logo" src="/jt-utilities-logo.jpg" alt="JT Utilities logo"/><div><h3>Workshop job cards · Engineer and office sign-off</h3><p>Office assigns work → engineer signs completion → office inbox reviews and signs off → asset history</p></div></div><button className="secondary" onClick={()=>setRefresh(x=>x+1)}>Refresh</button></div>
  {notice&&<p role="status">{notice}</p>}
  <h3 className="workshop-jobs-title">{role==="office"?"Work needing completion":"My assigned jobs"} · {role==="engineer"?jobs.filter(j=>["Assigned","In progress","Returned for correction"].includes(j.status)).length+" active":jobs.filter(j=>["New","Assigned","In progress","Returned for correction"].includes(j.status)).length+" open jobs"}</h3>
  {role==="office"&&jobs.some(j=>j.status==="Approved"&&!j.job_card_pdf_path&&j.job_type!==WHEEL_JOB_TYPE)&&<div className="workshop-backfill">
   <p><strong>{jobs.filter(j=>j.status==="Approved"&&!j.job_card_pdf_path&&j.job_type!==WHEEL_JOB_TYPE).length} older approved job card(s)</strong> need a separate JT Asset Job Card PDF. Original documents and statutory LOLER certificates stay untouched.</p>
   <button type="button" className="secondary" disabled={busy} onClick={()=>void fileMissingApprovedJobCards()}>{busy?"Filing documents…":"File missing JT job cards"}</button>
  </div>}
  {(role==="office"||role==="engineer")&&<><div className="workshop-new-job-toolbar" style={{display:"flex",justifyContent:"flex-end",margin:"14px 0"}}><button type="button" className="primary" onClick={()=>{setShowCreateJob(true);setSelected("");setNotice("");setJobType(role==="engineer"?"Other / unexpected work":"General repair");setJobDetails({});}} aria-expanded={showCreateJob} aria-controls="workshop-new-job-form"><Plus size={18}/>{role==="engineer"?"New Ad Hoc Job":"Add New Job Card"}</button></div>{showCreateJob&&<div id="workshop-new-job-form" className={`workshop-create-form ${showCreateJob?"mobile-open":""}`} style={{display:"grid",gap:10,marginBottom:22}}>
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><h3 style={{margin:0}}>{role==="engineer"?"New Ad Hoc Job Card":"Raise and assign a job card"}</h3><button type="button" className="secondary" onClick={()=>{setShowCreateJob(false);setNotice("");}}>Cancel — back to jobs</button></div>
   <div className="workshop-job-number-notice"><FileText size={18}/><span><strong>JT job-card number:</strong> Automatically allocated when you create the card. It then appears in Workshop and the selected Asset Folder.</span></div>
   {role==="engineer"&&<p className="muted" style={{margin:"0 0 5px"}}>Choose the plant or vehicle, describe the unexpected work and create your own job card. It will appear in My Job Cards and go to the office for approval when you sign it off.</p>}
   <div className="workshop-asset-vehicle-pickers">
    <label>Plant & equipment — asset number
     <select value={numberedAssets.some(a=>a.id===asset)?asset:""} onChange={e=>setAsset(e.target.value)}><option value="">Select plant or equipment</option>{numberedAssets.map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.description}</option>)}</select>
    </label>
    <label>Vans, vehicles & HGVs — registration
     <select value={registeredVehicles.some(a=>a.id===asset)?asset:""} onChange={e=>setAsset(e.target.value)}><option value="">Select vehicle registration</option>{registeredVehicles.map(a=><option key={a.id} value={a.id}>{a.registration} · {a.description}</option>)}</select>
    </label>
   </div>
   <p className="muted" style={{margin:0,fontSize:12}}>Choose from either menu. Both create the same job card and file it against the correct asset.</p>
   {asset&&<div className="workshop-asset-summary"><strong>Asset details added automatically</strong><span>{assetLabel(assets.find(a=>a.id===asset))} · {assets.find(a=>a.id===asset)?.description||"Description not recorded"}</span><small>Serial number and asset location will be included from the Plant Register.</small></div>}
   <label>Job type<select value={jobType.startsWith("LOLER")?"LOLER thorough examination":jobType} onChange={e=>{setJobType(e.target.value);setJobDetails({});}}>{jobTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{jobType.startsWith("LOLER")&&<label>LOLER examination type<select value={jobType} onChange={e=>{setJobType(e.target.value);setJobDetails({});}}><option value="LOLER thorough examination">Plant and machinery</option><option value="LOLER chains & accessories">Chains and accessories</option></select></label>}
   {(jobType==="LOLER thorough examination"||jobType==="LOLER chains & accessories")&&asset&&<p className="muted">Suggested next LOLER date is prefilled (12 months for plant or 6 months for accessories). The competent examiner must confirm or amend it to match the examination scheme and equipment use.</p>}
   {jobType==="LOLER thorough examination"||jobType==="LOLER chains & accessories"?<LolerPaperForm kind={jobType==="LOLER thorough examination"?"plant":"chains"} values={{...assetLolerDefaults(asset,jobType),...(jobType==="LOLER thorough examination"?plantLolerDefaults:{}),...jobDetails}} onChange={(key,value)=>setJobDetails(d=>({...d,[key]:value}))}/>:null}
   {jobType==="General repair"&&<label>Date fault reported <input type="date" value={jobDetails["Date of defect"]||new Date().toISOString().slice(0,10)} onChange={e=>setJobDetails(d=>({...d,"Date of defect":e.target.value}))}/></label>}
   {jobType!=="LOLER thorough examination"&&jobType!=="LOLER chains & accessories"&&role!=="engineer"&&(fieldsByType[jobType]||[]).map(field=><label key={field}>{field}<textarea value={jobDetails[field]??(field==="Asset Location"?(assets.find(a=>a.id===asset)?.location||""):"")} onChange={e=>setJobDetails(d=>({...d,[field]:e.target.value}))}/></label>)}
   {role==="office"&&engineers.length===0&&<p role="status" style={{color:"#9a3412"}}>No engineer accounts are configured yet. You can create an unassigned job card, but an authorised examiner account must be added before it can be signed.</p>}
   <label>{jobType==="General repair"?"What needs fixing?":"Job title"}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder={jobType==="General repair"?"e.g. Hydraulic hose leak":"Repair, service or inspection"}/></label>
   <label>{jobType==="General repair"?"Fault details / work required":role==="engineer"?"What work is needed?":"Work instructions"}<textarea rows={3} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder={jobType==="General repair"?"Describe the problem and what the mechanic needs to do":role==="engineer"?"Describe the fault, repair or work required":"Describe the work to be carried out"}/></label>
   <label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>Normal</option><option>High</option><option>Critical</option></select></label>
   {role==="office"&&<label>Assign mechanic / engineer<select value={engineer} onChange={e=>setEngineer(e.target.value)}><option value="">Unassigned — allocate later</option>{engineers.map(x=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></label>}
   {notice&&<p role="alert" style={{padding:"10px 12px",background:"#fff4e5",border:"1px solid #e4b66d",borderRadius:6,color:"#7c2d12",fontWeight:600}}>{notice}</p>}
   <button className="primary" disabled={busy} onClick={()=>{if(!asset||title.trim().length<3||instructions.trim().length<3){setNotice("Before creating the job card, select an asset, enter a job title (at least 3 characters), and enter work instructions (at least 3 characters).");return;}void perform(async()=>{const r=await supabase.rpc(role==="engineer"?"create_engineer_unplanned_job":"create_workshop_job_typed",{p_asset:asset,p_title:title,p_instructions:instructions,p_priority:priority,p_job_type:jobType,p_details:(jobType==="LOLER thorough examination"||jobType==="LOLER chains & accessories")?{...assetLolerDefaults(asset,jobType),...(jobType==="LOLER thorough examination"?plantLolerDefaults:{}),...jobDetails}:jobType==="Pre-use / return-to-work check"?{"Inspection sheet version":PRE_USE_SHEET_VERSION,"Asset Location":assets.find(a=>a.id===asset)?.location||"",...jobDetails}:jobType==="General repair"?{"Date of defect":jobDetails["Date of defect"]||new Date().toISOString().slice(0,10),Location:assets.find(a=>a.id===asset)?.location||"","Serial number":assets.find(a=>a.id===asset)?.serial_number||"",Description:assets.find(a=>a.id===asset)?.description||"","Asset Location":assets.find(a=>a.id===asset)?.location||"",...jobDetails}:jobDetails,...(role==="office"?{p_engineer:engineer||null}:{})});if(!r.error){setTitle("");setInstructions("");setJobDetails({});setAsset("");setShowCreateJob(false);if(role==="engineer"){setMechanicFilter("active");if(r.data)setSelected(String(r.data));}}return r;},role==="engineer"?"Ad hoc job card created and assigned to you. Open it to record your work.":"Job card created — certificate reference reserved for LOLER jobs");}}>{role==="engineer"?"Create my Ad Hoc Job":"Create job card"}</button>
  </div>}</>}
  {!showCreateJob&&<>
  {role==="engineer"&&<div className={"workshop-mobile-jobs"+(selected?" mechanic-inbox-hidden":"")} aria-label="My assigned workshop jobs">
   <div className="mechanic-inbox-tabs" role="group" aria-label="Job status">
    <button type="button" className={mechanicFilter==="active"?"selected":""} onClick={()=>{setMechanicFilter("active");setSelected("");}}>To do ({jobs.filter(mechanicActive).length})</button>
    <button type="button" className={mechanicFilter==="waiting"?"selected":""} onClick={()=>{setMechanicFilter("waiting");setSelected("");}}>With office ({jobs.filter(j=>j.status==="Awaiting office approval").length})</button>
    <button type="button" className={mechanicFilter==="done"?"selected":""} onClick={()=>{setMechanicFilter("done");setSelected("");}}>Done</button>
   </div>
   {mechanicVisible.length===0?<p className="muted">{mechanicFilter==="active"?"No outstanding assigned jobs.":mechanicFilter==="waiting"?"No jobs awaiting office approval.":"No completed jobs yet."}</p>:mechanicVisible.map(j=><article className="workshop-mobile-job" key={j.id}>
    <div className="workshop-mobile-job-top"><span className={"tag "+(j.status==="Returned for correction"?"amber":"blue")}>{j.status==="Returned for correction"?"Correction requested":j.status==="Awaiting office approval"?"Sent to office":j.status}</span><span className="tag">{j.priority||"Normal"}</span></div>
    <h4>{jobHeading(j)}</h4><p className="workshop-mobile-asset">{j.title}</p>
    <p className="muted">{j.job_type||"General repair"}{j.certificate_number?" · Certificate "+j.certificate_number:""}</p>
    <button type="button" className={mechanicActive(j)?"primary":"secondary"} onClick={()=>openMechanicJob(j)}>{mechanicActive(j)?"Open & complete job":j.job_card_pdf_path?"View signed PDF":"View job"}</button>
   </article>)}
  </div>}
  {role==="office"&&<div className={"workshop-mobile-jobs"+(selected?" mechanic-inbox-hidden":"")} aria-label="Office workshop job inbox">
   {!activeOnly&&<div className="mechanic-inbox-tabs" role="group" aria-label="Office job status">
    <button type="button" className={officeFilter==="approval"?"selected":""} onClick={()=>{setOfficeFilter("approval");setSelected("");}}>Sign off ({jobs.filter(j=>j.status==="Awaiting office approval").length})</button>
    <button type="button" className={officeFilter==="active"?"selected":""} onClick={()=>{setOfficeFilter("active");setSelected("");}}>Work needing completion ({jobs.filter(j=>["New","Assigned","In progress","Returned for correction"].includes(j.status)).length})</button>
    <button type="button" className={officeFilter==="history"?"selected":""} onClick={()=>{setOfficeFilter("history");setSelected("");}}>History</button>
   </div>}
   {officeVisible.length===0?<p className="muted">{activeOnly?"No current open workshop job cards.":officeFilter==="approval"?"No jobs awaiting your approval.":officeFilter==="active"?"No open workshop jobs.":"No previous workshop records."}</p>:officeVisible.map(job=><article className="workshop-mobile-job" key={job.id}>
    <div className="workshop-mobile-job-top"><span className="tag blue">{job.status}</span><span className="tag">{job.priority||"Normal"}</span></div>
    <h4>{jobHeading(job)}</h4><p className="workshop-mobile-asset">{job.title}</p>
    <p className="muted">{job.job_type||"Workshop job"}</p>
    <button type="button" className={job.status==="Awaiting office approval"?"primary":"secondary"} onClick={()=>openMechanicJob(job)}>{job.status==="Awaiting office approval"?"Review & sign":"View job"}</button>
    {mayDeleteTestJob(job)&&<button type="button" className="secondary workshop-delete-test" disabled={busy} onClick={()=>void deleteTestJob(job)}><X size={15}/> Delete this unsigned test job</button>}
   </article>)}
  </div>}
  <div className={"table-wrap workshop-desktop-jobs"+(role==="engineer"?" workshop-mechanic-hide-table":"")}><table><thead><tr><th>Asset</th><th>Job</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>
   {(role==="engineer"?mechanicVisible:activeOnly?officeVisible:orderedJobs).map((j,index,displayJobs)=><Fragment key={j.id}>{(index===0||jobStage(displayJobs[index-1].status)!==jobStage(j.status))&&<tr><td colSpan={5} style={{fontWeight:700,background:"#eaf0f6"}}>{stageNames[jobStage(j.status)]} · {jobs.filter(x=>jobStage(x.status)===jobStage(j.status)).length}</td></tr>}<tr><td>{assetName(j.asset_id)}</td><td><b>{jobHeading(j)}</b><small>{j.title} · {j.job_type||"General repair"}{j.certificate_number?" · LOLER certificate "+j.certificate_number:""}</small></td><td>{j.priority}</td><td>{j.status}</td><td><button className="secondary" onClick={()=>openMechanicJob(j)}>Open job</button>{mayDeleteTestJob(j)&&<button type="button" className="secondary workshop-delete-test" disabled={busy} onClick={()=>void deleteTestJob(j)}><X size={14}/> Delete</button>}</td></tr></Fragment>)}
  </tbody></table>{!jobs.length&&<p className="muted">No job cards yet. Create one above to start.</p>}</div>
  </>}
  {chosen&&<div ref={selectedJobRef} className={"workshop-selected-job"+(role==="engineer"?" workshop-mechanic-selected":"")} style={{marginTop:20,display:"grid",gap:10}}>
   {chosen.job_type!==WHEEL_JOB_TYPE&&["office","engineer"].includes(role)&&<>
    <div style={{display:"flex",justifyContent:"flex-start",gap:9}}>
     <button type="button" className="secondary" disabled={busy} onClick={()=>setShowWheelCreate(v=>!v)} aria-expanded={showWheelCreate}>
      <FileText size={16}/> {showWheelCreate?"Close wheel sheet":"Add wheel removal / re-torque sheet (if required)"}
     </button>
    </div>
    {showWheelCreate&&<div style={{border:"1px solid #cbd5e1",borderRadius:9,padding:15,display:"grid",gap:9}}>
     <strong>Start a separate wheel re-torque record</strong>
     <p className="muted" style={{margin:0}}>Linked to {chosen.job_card_number||"this workshop job"} and {assetName(chosen.asset_id)}. This creates a new, independently numbered job card. It stays open until both follow-up checks are recorded, signed by the mechanic and approved by the office. A PDF is then filed in the asset folder.</p>
     <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
      <button type="button" className="primary" disabled={busy} onClick={()=>void perform(async()=>{
       const payload:any={p_asset:chosen.asset_id,p_title:"Wheel removal and re-torque",p_instructions:"Record wheels removed/refitted, initial torque and 2nd / 3rd re-torque checks.",p_priority:"Normal",p_job_type:WHEEL_JOB_TYPE,p_details:{"Related workshop job":chosen.job_card_number||"","Related workshop job ID":chosen.id,...(role==="office"?{}:{})}};
       if(role==="office")payload.p_engineer=chosen.assigned_engineer||null;
       const result=await supabase.rpc(role==="office"?"create_workshop_job_typed":"create_engineer_unplanned_job",payload);
       if(!result.error){setShowWheelCreate(false);setSelected(String(result.data));setShowSpecialistFields(true);}
       return result;
      },"Separate wheel job created. Its number is allocated automatically; complete the follow-up checks before signing.")}>Create numbered wheel sheet</button>
      <button type="button" className="secondary" onClick={()=>setShowWheelCreate(false)}>Cancel</button>
     </div>
    </div>}
   </>}
   {role==="office"&&<button type="button" className="secondary workshop-office-mobile-back" onClick={()=>{setSelected("");setNotice("");window.scrollTo({top:0,behavior:"smooth"});}}>← Back to office jobs</button>}
   {role==="engineer"&&<div className="mechanic-mobile-completion">
    <div className="mechanic-mobile-head">
     <button type="button" className="secondary" onClick={()=>{setSelected("");window.scrollTo({top:0,behavior:"smooth"});}}>← Back to jobs</button>
     <span className="tag blue">{chosen.status==="Awaiting office approval"?"With office":chosen.status}</span>
    </div>
    <h3>{jobHeading(chosen)}</h3>
    <p className="mechanic-mobile-subtitle">{chosen.title}</p>
    {notice&&<p id="mechanic-submit-feedback" role="status" className="notice">{notice}</p>}
    <div className="mechanic-mobile-instructions"><strong>Job instructions</strong><p>{chosen.instructions}</p></div>
    {mechanicActive(chosen)?<>
     {chosen.status==="Returned for correction"&&<p role="alert" className="auth-error">Office returned this job for correction. Review their comments below and resubmit when ready. {chosen.office_comments||""}</p>}
     {specialistJob(chosen)&&<section className="mechanic-specialist">
      <button type="button" className="secondary mechanic-specialist-toggle" onClick={()=>setShowSpecialistFields(v=>!v)} aria-expanded={showSpecialistFields}>{showSpecialistFields?"Hide":"Show"} {String(chosen.job_type||"").startsWith("LOLER")?"LOLER examination & mandatory checklist":"Required inspection checklist"} ({requiredChecklist(chosen).length} checks)</button>
      {showSpecialistFields&&<div className="mechanic-specialist-fields">
       {(chosen.job_type==="LOLER thorough examination"||chosen.job_type==="LOLER chains & accessories")&&<><p className="muted">Complete and verify all statutory LOLER certificate particulars. This job card does not replace the legal certificate.</p><LolerPaperForm kind={chosen.job_type==="LOLER thorough examination"?"plant":"chains"} values={{...assetLolerDefaults(chosen.asset_id,chosen.job_type,chosen.certificate_number,chosen.job_card_number),...(chosen.job_type==="LOLER thorough examination"?plantLolerDefaults:{}),...(chosen.job_details||{}),...lolerFields}} onChange={(key,value)=>setLolerFields(d=>({...d,[key]:value}))}/></>}
       {chosen.job_type==="Pre-use / return-to-work check"&&<p role="note" className="workshop-pre-use-warning">Check every item before signing. Any failed check means the machine must NOT be sent back to work. A completed job card does not release a plant lockout or replace the operator's daily pre-start check.</p>}
       {chosen.job_type===WHEEL_JOB_TYPE?<WheelRetorqueFields values={checklist} onChange={(key,value)=>setChecklist(c=>({...c,[key]:value}))}/>:preUseFullSheet(chosen)?preUseSheetForm(chosen):requiredChecklist(chosen).map((key:string)=>chosen.job_type==="Pre-use / return-to-work check"?preUseField(key):<label key={key}>{key}<textarea rows={2} value={checklist[key]||""} onChange={e=>setChecklist(c=>({...c,[key]:e.target.value}))} placeholder="Record findings or inspection result"/></label>)}
      </div>}
     </section>}
     <div className="mechanic-mobile-fields">
      <label>1. Work carried out <textarea rows={4} value={work} onChange={e=>setWork(e.target.value)} placeholder="Describe what was repaired, checked or completed"/></label>
      <label>2. Parts or materials used <textarea rows={2} value={parts} onChange={e=>{setParts(e.target.value);setPartItems(e.target.value.split("\n"));}} placeholder="Enter parts used, one per line, or None"/></label>
      <label>3. Hours worked <input type="number" inputMode="decimal" min="0" step=".25" value={hours} onChange={e=>setHours(e.target.value)}/></label>
      <button type="button" className="secondary mechanic-save-btn" disabled={busy} onClick={()=>void saveEngineerDraft(chosen)}>{busy?"Saving…":"Save progress (not submitted)"}</button>
      <div className="mechanic-mobile-sign">
       <label>4. Mechanic signature — full name <input autoComplete="name" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="Type your full name"/></label>
       <p>Your signed-in account and submission time will be recorded automatically for audit.</p>
      </div>
      {missingEngineerFields(chosen).length>0&&<p className="mechanic-missing" role="status">To submit, complete: {missingEngineerFields(chosen).join(", ")}</p>}
      <button type="button" className="primary mechanic-submit-btn" disabled={busy} onClick={()=>void submitEngineerJob(chosen)}>{busy?"Submitting…":"Sign & send to office"}</button>
      <small>Once submitted, the job moves to “With office” for independent approval. Locked-out equipment stays locked until authorised safety release.</small>
     </div>
    </>:<div className="mechanic-mobile-complete-status">
     <strong>{chosen.status==="Awaiting office approval"?"Submitted to office for approval":"Job status: "+chosen.status}</strong>
     {chosen.engineer_signed_at&&<p>Signed {new Date(chosen.engineer_signed_at).toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-")}</p>}
     <p>{chosen.engineer_work||""}</p>
     <div className="workshop-pdf-actions">
      {chosen.job_card_pdf_path?<button type="button" className="primary" onClick={()=>void viewArchivedPdf(chosen.job_card_pdf_path)}><FileText size={17}/> View filed JT PDF</button>:<button type="button" className="secondary" onClick={()=>void downloadJobCardPdf(chosen)}><FileText size={17}/> {chosen.status==="Awaiting office approval"?"Preview PDF — awaiting office signature":"Download Job Card PDF"}</button>}
      {chosen.job_type==="Pre-use / return-to-work check"&&<p className="muted">Full Pre-Use Inspection Sheet, comments and signatures are in the PDF. Approved copies are automatically filed in the machine's Asset Folder.</p>}
     </div>
    </div>}
   </div>}
   <div className={role==="engineer"?"mechanic-desktop-details":""}>
   <h3>{jobHeading(chosen)}</h3><p><b>Work:</b> {chosen.title} · {assetName(chosen.asset_id)}</p>
   <p><b>Form:</b> {chosen.job_type||"General repair"}</p>{chosen.certificate_number&&<p><b>Certificate number:</b> {chosen.certificate_number}</p>}<p>{chosen.instructions}</p>
   <p><b>Status:</b> {chosen.status}</p>
   {mayDeleteTestJob(chosen)&&<button type="button" className="secondary workshop-delete-test" disabled={busy} onClick={()=>void deleteTestJob(chosen)}><X size={15}/> Delete this unsigned test job</button>}
   {role==="office"&&chosen.status==="Awaiting office approval"&&<div className="workshop-office-approval-panel">
    <h4>Office review & sign-off</h4>
    <p>Review the completed work and required inspection records before approving. The signed-in account and approval time are recorded for audit.</p>
    {chosen.job_type===WHEEL_JOB_TYPE&&<WheelRetorqueFields values={chosen.completion_checklist||{}} readonly/>}
    {chosen.job_type==="Pre-use / return-to-work check"&&<div className="workshop-pre-use-office">
     <strong>Return-to-work safety review · {chosen.completion_checklist?.["Pre-use result"]||"Result not recorded"}</strong>
     <p>Verify every check below and the mechanic's signature. A failed check cannot be approved. An active safety hold must be released through the separate authorised process; this sign-off does not release it.</p>
     <button type="button" className="secondary" onClick={()=>void downloadJobCardPdf(chosen)}><FileText size={17}/> View inspection sheet PDF</button>
     <details><summary>Review full checklist and notes</summary>{requiredChecklist(chosen).map((key:string)=><p key={key}><b>{key}:</b> {String(chosen.completion_checklist?.[key]||"Not recorded")}{chosen.completion_checklist?.[key+" - Comments"]?" · Notes: "+chosen.completion_checklist[key+" - Comments"]:""}</p>)}</details>
    </div>}
    <label>Office reviewer — full name<input autoComplete="name" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="Enter your full name"/></label>
    <label>Review comments<textarea rows={3} value={comments} onChange={e=>setComments(e.target.value)} placeholder="Approval notes or reason for correction"/></label>
    <div className="workshop-office-actions">
     <button type="button" className="primary" disabled={busy||signature.trim().length<2||(chosen.job_type==="Pre-use / return-to-work check"&&(chosen.completion_checklist?.["Pre-use result"]!=="Pass - safe for proposed use"||Object.values(chosen.completion_checklist||{}).includes("Fail")))} onClick={()=>void approveAndArchive(chosen)}>{busy?"Processing…":"Approve & sign job card"}</button>
     <button type="button" className="secondary" disabled={busy||signature.trim().length<2||comments.trim().length<3} onClick={()=>void perform(()=>supabase.rpc("review_workshop_job",{p_job:chosen.id,p_approve:false,p_comments:comments,p_signature:signature}),"Returned to mechanic for correction")}>Return to mechanic</button>
    </div>
   </div>}
   {role==="office"&&chosen.status==="New"&&<div style={{display:"flex",gap:8,alignItems:"center"}}><select value={engineer} onChange={e=>setEngineer(e.target.value)}><option value="">Choose mechanic</option>{engineers.map(x=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select><button className="primary" disabled={!engineer||busy} onClick={()=>void perform(()=>supabase.rpc("assign_workshop_job",{p_job:chosen.id,p_engineer:engineer}),"Job assigned to mechanic")}>Assign job</button></div>}
   {role==="office"&&chosen.job_type!=="Pre-use / return-to-work check"&&Object.keys(chosen.completion_checklist||{}).length>0&&<details><summary style={{cursor:"pointer",fontWeight:700}}>Inspection details</summary>{Object.entries(chosen.completion_checklist||{}).map(([key,value])=><p key={key}><b>{key}:</b> {String(value)}</p>)}</details>}
   {(chosen.job_type==="LOLER thorough examination"||chosen.job_type==="LOLER chains & accessories")&&<details><summary style={{cursor:"pointer",fontWeight:600}}>View certificate details</summary><LolerPaperForm kind={chosen.job_type==="LOLER thorough examination"?"plant":"chains"} values={{...assetLolerDefaults(chosen.asset_id,chosen.job_type,chosen.certificate_number,chosen.job_card_number),...(chosen.job_type==="LOLER thorough examination"?plantLolerDefaults:{}),...(chosen.job_details||{}),...(chosen.completion_checklist||{})}} onChange={()=>{}} readOnly/></details>}
   {chosen.job_type==="General repair"&&["New","Assigned","In progress","Returned for correction"].includes(chosen.status)&&(role==="office"||role==="engineer")&&<div style={{marginBottom:12}}>
    <button className="secondary" type="button" onClick={()=>{if(editCard){setEditCard(false);return;}setEditTitle(chosen.title||"");setEditInstructions(chosen.instructions||"");setEditDetails({...chosen.job_details});setEditCard(true);}}>{editCard?"Cancel editing":"Edit Asset Job Card"}</button>
    {editCard&&<div style={{display:"grid",gap:12,padding:14,marginTop:10,border:"1px solid #cbd5e1",borderRadius:8}}>
     <p className="muted">Asset details and job card number are filled automatically and cannot be changed here.</p>
     <label>Job title<input value={editTitle} onChange={e=>setEditTitle(e.target.value)}/></label>
     <label>Job details / instructions<textarea rows={5} value={editInstructions} onChange={e=>setEditInstructions(e.target.value)}/></label>
     {["Date of defect","Job details","Location","Asset Location","Compliant as of"].map(key=><label key={key}>{key}{key==="Date of defect"||key==="Compliant as of"?<input type="date" value={editDetails[key]||""} onChange={e=>setEditDetails(d=>({...d,[key]:e.target.value}))}/>:<textarea rows={key==="Job details"?5:2} value={editDetails[key]??(key==="Asset Location"?(editDetails.Position||assets.find(a=>a.id===chosen.asset_id)?.location||""):"")} onChange={e=>setEditDetails(d=>({...d,[key]:e.target.value}))}/>}</label>)}
     <button className="primary" type="button" disabled={busy} onClick={()=>void perform(async()=>{const result=await supabase.rpc("update_open_workshop_job_card",{p_job:chosen.id,p_title:editTitle,p_instructions:editInstructions,p_details:editDetails});if(!result.error)setEditCard(false);return result;},"Job card updated — download a fresh PDF to see changes")}>Save job card changes</button>
    </div>}
   </div>}
   {role!=="engineer"&&<div><button className="secondary" type="button" onClick={()=>void downloadJobCardPdf(chosen)}><FileText size={16}/> {chosen.job_type===WHEEL_JOB_TYPE?"Download wheel re-torque sheet":chosen.job_type==="Pre-use / return-to-work check"?"Download Pre-Use Inspection PDF":"Download JT Asset Job Card PDF"}</button>
    {chosen.job_type!=="Pre-use / return-to-work check"&&chosen.job_type!==WHEEL_JOB_TYPE&&<GeneralRepairPaperForm job={chosen} asset={assets.find(a=>a.id===chosen.asset_id)}/>}</div>}
   {chosen.engineer_work&&<p><b>Engineer work:</b> {chosen.engineer_work}</p>}
   {chosen.engineer_parts&&<p><b>Parts:</b> {chosen.engineer_parts}</p>}
   {chosen.engineer_signature&&<p><b>Engineer signed:</b> {chosen.engineer_signature} · {new Date(chosen.engineer_signed_at).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-")}</p>}
   {chosen.job_card_number&&<p><b>Job card number:</b> {chosen.job_card_number}</p>}
   {chosen.approved_pdf_path&&<button className="secondary" onClick={()=>void viewArchivedPdf(chosen.approved_pdf_path)}>{chosen.job_type===WHEEL_JOB_TYPE?"View filed wheel re-torque PDF":String(chosen.job_type||"").startsWith("LOLER")?"View statutory LOLER certificate":"View original filed PDF"}</button>}
   {chosen.job_card_pdf_path&&role!=="engineer"&&<button className="secondary" onClick={()=>void viewArchivedPdf(chosen.job_card_pdf_path)}>{chosen.job_type==="Pre-use / return-to-work check"?"View filed Pre-Use Inspection PDF":"View filed JT Asset Job Card"}</button>}
   {role==="office"&&chosen.status==="Approved"&&(!chosen.approved_pdf_path||(chosen.job_type!==WHEEL_JOB_TYPE&&!chosen.job_card_pdf_path))&&<div className="workshop-missing-document">
    <strong>Approved job — document filing needs attention</strong>
    <p>{!chosen.approved_pdf_path?"Original approved document not filed. ":""}{chosen.job_type!==WHEEL_JOB_TYPE&&!chosen.job_card_pdf_path?"JT Asset Job Card not separately filed.":""} The office sign-off is saved; existing PDFs will not be overwritten.</p>
    <button className="secondary" type="button" disabled={busy} onClick={()=>void perform(async()=>{await archiveApprovedPdf(chosen);return {error:null};},"Missing PDF(s) filed against the asset. Original documents preserved.")}>{busy?"Filing…":"File missing job documents"}</button>
   </div>}
   {chosen.office_comments&&<p><b>Office comments:</b> {chosen.office_comments}</p>}
   {chosen.office_signature&&<p><b>Office signed:</b> {chosen.office_signature} · {new Date(chosen.office_signed_at).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-")}</p>}
   {(role==="engineer"||role==="office")&&["New","Assigned","In progress","Returned for correction"].includes(chosen.status)&&<>
    {(chosen.job_type==="LOLER thorough examination"||chosen.job_type==="LOLER chains & accessories")&&<LolerPaperForm kind={chosen.job_type==="LOLER thorough examination"?"plant":"chains"} values={{...assetLolerDefaults(chosen.asset_id,chosen.job_type,chosen.certificate_number,chosen.job_card_number),...(chosen.job_type==="LOLER thorough examination"?plantLolerDefaults:{}),...(chosen.job_details||{}),...lolerFields}} onChange={(key,value)=>setLolerFields(d=>({...d,[key]:value}))}/>} 
    {chosen.job_type==="Pre-use / return-to-work check"&&<p role="note" className="workshop-pre-use-warning">This pre-use inspection must pass before return to work. Safety holds and operator daily checks remain separate.</p>}
    {chosen.job_type===WHEEL_JOB_TYPE?<WheelRetorqueFields values={checklist} onChange={(key,value)=>setChecklist(c=>({...c,[key]:value}))}/>:preUseFullSheet(chosen)?preUseSheetForm(chosen):(checklistByType[chosen.job_type]||[]).map(field=>chosen.job_type==="Pre-use / return-to-work check"?preUseField(field):<label key={field}>{field}<textarea value={checklist[field]||""} onChange={e=>setChecklist(c=>({...c,[field]:e.target.value}))} placeholder={field.includes("result")||field.includes("Result")?"Record outcome and any restrictions":"Record inspection findings"}/></label>)}
    <label>Work completed<textarea value={work} onChange={e=>setWork(e.target.value)}/></label>
    <div style={{display:"grid",gap:8}}>
     <strong>Parts added</strong>
     {partItems.map((item,index)=><div key={index} style={{display:"flex",gap:8,alignItems:"center"}}>
       <label style={{flex:1}}>Part {index+1}<input value={item} onChange={e=>{const updated=[...partItems];updated[index]=e.target.value;setPartItems(updated);setParts(updated.filter(v=>v.trim()).join("\n"));}} placeholder="Enter part description"/></label>
       <button className="secondary" type="button" disabled={partItems.length===1} onClick={()=>{const updated=partItems.filter((_,i)=>i!==index);setPartItems(updated);setParts(updated.filter(v=>v.trim()).join("\n"));}}>Remove</button>
     </div>)}
     <button className="secondary" type="button" onClick={()=>setPartItems(items=>[...items,""])}>+ Add another part</button>
    </div>
    <label>Hours worked<input type="number" min="0" step=".25" value={hours} onChange={e=>setHours(e.target.value)}/></label>
    {role==="office"&&<><p className="muted">Office can prepare and save these details. Only the assigned mechanic can sign and submit the job.</p><button className="primary" type="button" disabled={busy} onClick={()=>void perform(()=>supabase.rpc("save_workshop_job_progress",{p_job:chosen.id,p_work:work,p_parts:partItems.filter(v=>v.trim()).join("\n"),p_hours:Number(hours)}),"Workshop details saved — awaiting mechanic signature")}>Save workshop details</button></>}{role==="engineer"&&<><label>Engineer signature (full name)<input value={signature} onChange={e=>setSignature(e.target.value)}/></label>
    {(work.trim().length<3||signature.trim().length<2||(checklistByType[chosen.job_type]||[]).some(k=>!checklist[k]?.trim()))&&<p role="status" style={{color:"#92400e",background:"#fffbeb",padding:"10px 12px",borderRadius:6,fontSize:13}}><strong>Before you can sign and submit:</strong>{" "}{[...(checklistByType[chosen.job_type]||[]).filter(k=>!checklist[k]?.trim()),...(work.trim().length<3?["Work completed"]:[]),...(signature.trim().length<2?["Engineer signature (full name)"]:[])].join(", ")}. Complete these fields below the examination form.</p>}
    <button type="button" className="primary" disabled={busy} onClick={()=>void submitEngineerJob(chosen)}>Sign and submit to office</button>
   </>}
   </>}

   </div>
  </div>}
 </section>;
}
function Dashboard({supabase,isAdmin,role}:{supabase:SupabaseClient;isAdmin:boolean;role:string}) {
  const isOperator=role==="operator";
  const isMechanic=role==="mechanic";
  const [page,setPage]=useState(isOperator?"Plant checks":isMechanic?"Workshop job cards":"Dashboard");
  useEffect(()=>{if(isOperator){setPage("Plant checks");return;}if(isMechanic){setPage("Workshop job cards");return;}if(window.matchMedia("(max-width: 700px)").matches)setPage("Dashboard");},[isOperator,isMechanic,isAdmin]);
  const [query,setQuery]=useState("");
  const [assets,setAssets]=useState<Asset[]>([]);
  const [assetsLoading,setAssetsLoading]=useState(true);
  const [workshopOverviewVersion,setWorkshopOverviewVersion]=useState(0);
  const [assetsError,setAssetsError]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [assetFilter,setAssetFilter]=useState("All");
  const [workshopDashboardOnly,setWorkshopDashboardOnly]=useState(false);
  const [categoryFilter,setCategoryFilter]=useState("All");
  const [notice,setNotice]=useState("");
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [notificationsLoading,setNotificationsLoading]=useState(false);
  const [notificationsError,setNotificationsError]=useState("");
  const [notifications,setNotifications]=useState<{key:string;label:string;details:string;page:string;priority:number}[]>([]);
  const [clearingNotifications,setClearingNotifications]=useState(false);
  const [jobCounts,setJobCounts]=useState({new:0,assigned:0,approval:0});
  const [jobsLoading,setJobsLoading]=useState(true);
  const [jobsError,setJobsError]=useState("");
  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    const loadJobs=async()=>{
      const {data,error}=await supabase.from("workshop_job_cards").select("status").in("status",["New","Assigned","In progress","Returned for correction","Awaiting office approval"]);
      if(!active)return;
      if(error)setJobsError("Could not load job card counts: "+error.message);
      else{
        setJobsError("");
        setJobCounts({
          new:(data||[]).filter(j=>j.status==="New").length,
          assigned:(data||[]).filter(j=>["Assigned","In progress","Returned for correction"].includes(j.status)).length,
          approval:(data||[]).filter(j=>j.status==="Awaiting office approval").length
        });
      }
      setJobsLoading(false);
    };
    void loadJobs();
    const channel=supabase.channel("dashboard-job-card-counts").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},()=>void loadJobs()).subscribe();
    const onFocus=()=>void loadJobs();
    window.addEventListener("focus",onFocus);
    return()=>{active=false;window.removeEventListener("focus",onFocus);void supabase.removeChannel(channel);};
  },[supabase,isAdmin]);

  const [form,setForm]=useState({asset:"",fault:"",priority:"Normal"});
  async function clearNotifications(){
    if(!notifications.length||clearingNotifications)return;
    setClearingNotifications(true);setNotificationsError("");
    try{
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user)throw new Error("Please sign in again.");
      const dismissed=notifications.map(n=>({user_id:user.id,notification_key:n.key,notification_label:n.label}));
      const {error}=await supabase.from("dismissed_notifications").upsert(dismissed,{onConflict:"user_id,notification_key"});
      if(error)throw error;
      setNotifications([]);
    }catch(e){setNotificationsError("Could not clear notifications: "+(e instanceof Error?e.message:String(e)));}
    finally{setClearingNotifications(false);}
  }
  async function loadNotifications(){
    setNotificationsLoading(true);setNotificationsError("");
    if(isMechanic){
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user){setNotificationsError("Sign in again to view assigned workshop jobs.");setNotificationsLoading(false);return;}
      const [assigned,dismissed]=await Promise.all([
        supabase.from("workshop_job_cards").select("id,title,status").eq("assigned_engineer",user.id).in("status",["Assigned","In progress","Returned for correction"]).order("created_at",{ascending:false}).limit(100),
        supabase.from("dismissed_notifications").select("notification_key,notification_label").eq("user_id",user.id)
      ]);
      if(assigned.error||dismissed.error){
        setNotificationsError("Could not load mechanic job alerts: "+(assigned.error||dismissed.error)?.message);
        setNotificationsLoading(false);return;
      }
      const jobs=(assigned.data||[]).map(job=>({key:"mechanic-job-"+job.id,label:"WORKSHOP JOB · "+job.title,details:job.status+" · Open Workshop Job Cards to start work",page:"Workshop job cards",priority:0}));
      const existing=new Map((dismissed.data||[]).map(d=>[d.notification_key,d.notification_label]));
      setNotifications(jobs.filter(job=>existing.get(job.key)!==job.label));
      setNotificationsLoading(false);return;
    }
    const [assetsResult,motResult,bookingsResult,lolerResult]=await Promise.all([
      supabase.from("assets").select("id,asset_code,registration,mot_due"),
      supabase.from("vehicle_mot_records").select("asset_id,registration,expiry_date,mot_status,mot_tests,raw_response"),
      supabase.from("mot_garage_bookings").select("id,asset_id,booking_date,booking_time,garage_name").eq("status","booked"),
      supabase.from("examinations").select("id,asset_id,next_due").ilike("examination_type","%LOLER%")
    ]);
    const defectsResult=isAdmin?await supabase.from("workshop_job_cards").select("id,asset_id,title,created_at,status").not("inspection_id","is",null).in("status",["New","Assigned"]).order("created_at",{ascending:false}).limit(75):null;
    const error=assetsResult.error||motResult.error||bookingsResult.error||lolerResult.error||defectsResult?.error;
    if(error){setNotificationsError("Could not load compliance alerts: "+error.message);setNotifications([]);setNotificationsLoading(false);return;}
    const now=new Date();
    const today=ukDateString(now);
    const dayDiff=(date:string)=>Math.round((Date.parse(date.slice(0,10)+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
    const fmt=(date:string)=>date.slice(8,10)+"-"+date.slice(5,7)+"-"+date.slice(0,4);
    const found:{key:string;label:string;details:string;page:string;priority:number}[]=[];
    const assetById=new Map((assetsResult.data||[]).map(a=>[a.id,a]));
    for(const job of defectsResult?.data||[]){const asset=assetById.get(job.asset_id);found.push({key:"plant-defect-"+job.id,label:"PLANT DEFECT · "+(asset?.asset_code||"Asset"),details:job.title+" · "+job.status+" · Admin review required",page:"Workshop job cards",priority:0});}
    const savedMotIds=new Set<string>();
    for(const record of motResult.data||[]){
      savedMotIds.add(record.asset_id);
      const asset=assetById.get(record.asset_id);
      const vehicle=asset?.registration||record.registration||asset?.asset_code||"Vehicle";
      if(record.mot_status==="FAILED")found.push({key:"fail-"+record.asset_id,label:"FAILED MOT · "+vehicle,details:"Repairs required — check the MOT Tracker",page:"MOT Tracker",priority:0});
      const due=motExpiryFromHistory(record)||firstMotDue(record);
      if(!due)continue;
      const days=dayDiff(due);
      if(days<0)found.push({key:"mot-"+record.asset_id,label:"MOT overdue · "+vehicle,details:"Due "+fmt(due),page:"MOT Tracker",priority:1});
      else if(days<=60)found.push({key:"mot-"+record.asset_id,label:(firstMotDue(record)?"First MOT due":"MOT due")+" · "+vehicle,details:fmt(due)+" · "+(days===0?"Today":days+" days remaining"),page:"MOT Tracker",priority:2});
    }
    for(const asset of assetsResult.data||[]){
      if(savedMotIds.has(asset.id)||!asset.mot_due)continue;
      const days=dayDiff(asset.mot_due);
      if(days<=60)found.push({key:"manual-mot-"+asset.id,label:(days<0?"MOT overdue":"MOT due")+" · "+(asset.registration||asset.asset_code),details:"Recorded deadline "+fmt(asset.mot_due),page:"MOT Tracker",priority:days<0?1:2});
    }
    for(const booking of bookingsResult.data||[]){
      const days=dayDiff(booking.booking_date);
      if(days<0||days>14)continue;
      const asset=assetById.get(booking.asset_id);
      found.push({key:"booking-"+booking.id,label:"MOT booked · "+(asset?.registration||asset?.asset_code||"Vehicle"),details:fmt(booking.booking_date)+" at "+booking.booking_time.slice(0,5)+" · "+booking.garage_name,page:"MOT Tracker",priority:3});
    }
    const latestLoler=new Map<string,string>();
    for(const exam of lolerResult.data||[]){if(exam.next_due){const existing=latestLoler.get(exam.asset_id);if(!existing||exam.next_due>existing)latestLoler.set(exam.asset_id,exam.next_due);}}
    for(const [assetId,due] of latestLoler){const days=dayDiff(due);if(days>30)continue;const asset=assetById.get(assetId);found.push({key:"loler-"+assetId,label:(days<0?"LOLER overdue":"LOLER due")+" · "+(asset?.asset_code||"Equipment"),details:"Examination "+fmt(due),page:"LOLER & certificates",priority:days<0?1:4});}
    // Only raise today's missing-check alerts after 10:00 UK time, and only for
    // allocated machines whose asset inspection requirement is enabled.
    if(isAdmin&&ukHour(now)>=MISSING_PLANT_CHECK_ALERT_HOUR_UK){
      const [plantAssets,activeProjects,currentAllocations,checks]=await Promise.all([
        supabase.from("assets").select("id,asset_code,description,category,daily_plant_check_required").limit(2000),
        supabase.from("projects").select("id,project_name").eq("status","active").limit(500),
        supabase.from("project_allocations").select("asset_id,project_id,allocated_at").is("returned_at",null).limit(3000),
        supabase.from("inspections").select("asset_id,submitted_at").eq("inspection_type","daily_plant_pre_start")
          .gte("submitted_at",new Date(Date.parse(today+"T00:00:00Z")-86400000).toISOString())
          .lt("submitted_at",new Date(Date.parse(today+"T00:00:00Z")+172800000).toISOString())
          .limit(1000)
      ]);
      const missingError=plantAssets.error||activeProjects.error||currentAllocations.error||checks.error;
      if(missingError){setNotificationsError("Could not check missing daily plant inspections: "+missingError.message);}
      else{
        const byAssetId=new Map((plantAssets.data||[]).map(a=>[a.id,a]));
        const byProjectId=new Map((activeProjects.data||[]).map(p=>[p.id,p]));
        const checked=new Set((checks.data||[]).filter(r=>ukDateString(new Date(r.submitted_at))===today).map(r=>r.asset_id));
        const allocated=new Set<string>();
        for(const allocation of currentAllocations.data||[]){
          const asset=byAssetId.get(allocation.asset_id);
          const project=byProjectId.get(allocation.project_id);
          if(!asset||!project||allocated.has(asset.id))continue;
          if(asset.asset_code==="TEST-LOLER"||!requiresDailyPlantCheck(asset))continue;
          if(ukDateString(new Date(allocation.allocated_at))>today)continue;
          allocated.add(asset.id);
          if(checked.has(asset.id))continue;
          found.push({
            key:"missing-plant-check-"+today+"-"+asset.id,
            label:"DAILY CHECK MISSING · "+asset.asset_code,
            details:project.project_name+" · No daily plant check submitted for "+fmt(today)+" by "+String(MISSING_PLANT_CHECK_ALERT_HOUR_UK).padStart(2,"0")+":00 UK",
            page:"Dashboard",priority:1
          });
        }
      }
    }
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){setNotificationsError("Please sign in again to see notifications.");setNotificationsLoading(false);return;}
    const {data:dismissed,error:dismissedError}=await supabase.from("dismissed_notifications").select("notification_key,notification_label").eq("user_id",user.id);
    if(dismissedError){setNotificationsError("Could not read cleared notifications: "+dismissedError.message);setNotificationsLoading(false);return;}
    const activeByKey=new Map(found.map(n=>[n.key,n.label]));
    const stale=(dismissed||[]).filter(d=>activeByKey.get(d.notification_key)!==d.notification_label).map(d=>d.notification_key);
    if(stale.length)await supabase.from("dismissed_notifications").delete().eq("user_id",user.id).in("notification_key",stale);
    const cleared=new Set((dismissed||[]).filter(d=>activeByKey.get(d.notification_key)===d.notification_label).map(d=>d.notification_key));
    found.sort((a,b)=>a.priority-b.priority||a.label.localeCompare(b.label));setNotifications(found.filter(n=>!cleared.has(n.key)));setNotificationsLoading(false);
  }
  useEffect(()=>{if(!isAdmin&&!isMechanic)return;void loadNotifications();const refresh=()=>void loadNotifications();const channel=supabase.channel("plant-defect-notifications").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},refresh).on("postgres_changes",{event:"INSERT",schema:"public",table:"inspections"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"project_allocations"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"assets"},refresh).subscribe();const timer=window.setInterval(refresh,300000);window.addEventListener("focus",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);void supabase.removeChannel(channel);};},[supabase,isAdmin,isMechanic]);
  useEffect(() => {
    // Mechanic workspace only needs the asset details supplied to assigned job cards.
    // Do not load the full fleet register or project allocations in its dashboard.
    if(isMechanic)return;
    let cancelled = false;

    async function loadAssets() {
      setAssetsLoading(true);
      setAssetsError("");
      try {
        // Confirm the authenticated session before requesting protected asset rows.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          throw new Error("Your session has expired. Please sign out and sign in again.");
        }

        const { data, error } = await supabase
          .from("assets")
          .select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status")
          .order("asset_code", { ascending: true })
          .limit(1000);

        if (error) throw error;
        if (cancelled) return;

        const [allocationResult,workshopResult]=await Promise.all([
          supabase.from("project_allocations").select("asset_id").is("returned_at",null),
          supabase.from("workshop_job_cards").select("asset_id,status").in("status",["New","Assigned","In progress","Returned for correction","Awaiting office approval"]).limit(5000)
        ]);
        if(allocationResult.error)throw allocationResult.error;
        if(workshopResult.error)throw workshopResult.error;
        const allocatedIds=new Set((allocationResult.data||[]).map(a=>a.asset_id));
        const workshopAssetIds=new Set((workshopResult.data||[]).map(j=>j.asset_id).filter(Boolean));
        const mapped = ((data || []) as DbAsset[]).map((item) => ({
          id: item.asset_code,
          name: item.description || [item.manufacturer, item.model].filter(Boolean).join(" ") || "Description not recorded",
          category: item.category || "Uncategorised",
          registration: item.registration || "—",
          location: item.location || "Not recorded",
          hours: item.hour_meter == null ? "—" : String(item.hour_meter),
          // Active workshop jobs take priority over allocation, but never conceal
          // an out-of-service/VOR state or another explicit statutory restriction.
          status: displayStatus(
            ["out_of_service","vor","off_hire"].includes(item.status)?item.status:
            workshopAssetIds.has(item.id)?"in_workshop":
            item.status==="available"&&allocatedIds.has(item.id)?"in_use":item.status,
            item.category
          ),
          loler: "Not recorded",
          service: "Not recorded"
        }));
        setAssets(mapped);
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : String(loadError);
          setAssetsError(`Could not load assets: ${message}`);
          setAssets([]);
        }
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    }

    loadAssets();
    return () => { cancelled = true; };
  }, [supabase,page,isMechanic,workshopOverviewVersion]);
  useEffect(()=>{
    if(isMechanic)return;
    const refresh=()=>setWorkshopOverviewVersion(v=>v+1);
    const channel=supabase.channel("workshop-status-overview").on("postgres_changes",{event:"*",schema:"public",table:"workshop_job_cards"},refresh).subscribe();
    window.addEventListener("focus",refresh);
    return()=>{window.removeEventListener("focus",refresh);void supabase.removeChannel(channel);};
  },[supabase,isMechanic]);
  const filtered=useMemo(()=>assets.filter(a=>
    (a.id+" "+a.name+" "+a.category+" "+a.location+" "+a.registration).toLowerCase().includes(query.trim().toLowerCase()) &&
    (assetFilter==="All"||a.status===assetFilter) &&
    (categoryFilter==="All"||a.category.toLowerCase()===categoryFilter.toLowerCase())
  ),[assets,query,assetFilter,categoryFilter]);
  const availableCount=assets.filter(a=>a.status==="Available").length;
  function action(msg:string){setNotice(msg);setTimeout(()=>setNotice(""),3500)}
  const title=page;
  if(isMechanic)return <div className="mechanic-only-shell">
    <header className="mechanic-only-header">
      <img src="/jt-utilities-logo.jpg" alt="JT Utilities" />
      <div><strong>Mechanic Workspace</strong><small>Job cards and calendar</small></div>
    </header>
    <nav className="mechanic-only-tabs" aria-label="Mechanic workspace">
      <button type="button" className={page==="Workshop job cards"?"selected":""} aria-current={page==="Workshop job cards"?"page":undefined} onClick={()=>setPage("Workshop job cards")}><Wrench size={18}/> My Job Cards</button>
      <button type="button" className={page==="Calander"?"selected":""} aria-current={page==="Calander"?"page":undefined} onClick={()=>setPage("Calander")}><CalendarDays size={18}/> Calendar</button>
    </nav>
    <main className="mechanic-only-main">
      {page==="Calander"?<Calendar supabase={supabase}/>:<WorkshopJobs supabase={supabase}/>}
    </main>
  </div>;
  return <div className={`shell ${isOperator?"operator-shell":"office-shell"}`}>
    {!isOperator&&<aside className={`sidebar ${mobileNav?"open":""}`}>
      <div className="brand"><img className="brand-logo" src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd logo" /><div><b>JT UTILITIES LTD</b><small>PLANTTRACK</small></div><button className="close-nav" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="nav-caption">WORKSPACE</div>
      {nav.filter(([label])=>label!=="Plant checks"||isAdmin).map(([label,Icon])=>label==="Plant register"?<div key={label}><button onClick={()=>{setPage(label);setCategoryFilter("All");setAssetFilter("All");setMobileNav(false)}} className={`nav-item ${page===label?"active":""}`}><Icon size={18}/><span>{label}</span></button>{page==="Plant register"&&<div style={{paddingLeft:28,display:"grid",gap:3}}>{[["All assets","All"],["Vehicles","Vehicle"],["HGVs","HGV"],["Plant & Machinery","Plant"],["Lifting Equipment","Lifting equipment"],["Trailers","Trailer"],["Agricultural Equipment","Agricultural equipment"],["CAT & Genny","CAT & Genny calibration equipment"]].map(([label,value])=><button key={value} className={`nav-item ${categoryFilter===value?"active":""}`} style={{fontSize:13,padding:"7px 9px"}} onClick={()=>{setCategoryFilter(value);setAssetFilter("All");setPage("Plant register");setMobileNav(false)}}>{label}</button>)}</div>}</div>:<button key={label} onClick={()=>{setWorkshopDashboardOnly(false);setPage(label);setMobileNav(false)}} className={`nav-item ${page===label?"active":""}`}><Icon size={18}/><span>{label}</span></button>)}
      <div className="sidebar-bottom"><div className="online-dot"/> Online workspace <small>PlantTrack</small></div>
    </aside>}
    {!isOperator&&mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar">{!isOperator&&<button className="mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button>}{isOperator&&<img src="/jt-utilities-logo.jpg" alt="JT Utilities" style={{height:38,width:78,objectFit:"contain",background:"#fff",padding:3,borderRadius:3,marginRight:12}}/>}<div className="crumb">JT Utilities <span>/</span> {title}</div><div className="top-actions">{!isOperator&&<div style={{position:"relative"}}><button className="icon-btn" type="button" aria-label="Compliance notifications" aria-expanded={notificationsOpen} onClick={()=>{setNotificationsOpen(value=>!value);if(!notificationsOpen)void loadNotifications();}}><Bell size={18}/>{notifications.length>0&&<span style={{position:"absolute",top:-5,right:-6,minWidth:18,height:18,padding:"1px 4px",background:"#b91c1c",color:"#fff",borderRadius:12,fontSize:10,fontWeight:700}}>{notifications.length>99?"99+":notifications.length}</span>}</button>{notificationsOpen&&<div role="region" aria-label="Compliance notifications" style={{position:"absolute",right:0,top:42,width:"min(355px,90vw)",maxHeight:420,overflowY:"auto",zIndex:50,background:"#fff",color:"#17212b",border:"1px solid #cbd5e1",borderRadius:10,boxShadow:"0 12px 28px rgba(0,0,0,.18)",padding:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:9}}><strong>Compliance notifications</strong><div style={{display:"flex",gap:5}}><button className="secondary" type="button" disabled={notificationsLoading||clearingNotifications} onClick={()=>void loadNotifications()}>Refresh</button><button className="secondary" type="button" disabled={notificationsLoading||clearingNotifications||notifications.length===0} onClick={()=>void clearNotifications()}>{clearingNotifications?"Clearing…":"Clear all"}</button></div></div>{notificationsError&&<p role="alert">{notificationsError}</p>}{notificationsLoading?<p>Checking live records…</p>:notifications.length===0?<p>No new notifications. Existing MOT, LOLER and defect records are unchanged.</p>:notifications.map(item=><button type="button" key={item.key} onClick={()=>{setPage(item.page);setNotificationsOpen(false);if(item.key.startsWith("missing-plant-check-"))window.setTimeout(()=>document.getElementById("daily-inspection-dashboard")?.scrollIntoView({behavior:"smooth",block:"start"}),120);}} style={{width:"100%",textAlign:"left",display:"block",background:item.priority<2?"#fff1f2":"#f8fafc",color:"#17212b",border:"1px solid #e2e8f0",borderRadius:7,padding:10,marginBottom:7,cursor:"pointer"}}><strong style={{display:"block",fontSize:12}}>{item.label}</strong><span style={{display:"block",fontSize:11,marginTop:3}}>{item.details}</span></button>)}</div>}</div>}<div className="avatar">JT</div></div></header>
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">JT UTILITIES LTD · {isOperator?"OPERATOR INSPECTIONS":"PLANT MANAGEMENT"}</div><h1>{title}</h1><p>{isOperator?"Complete a pre-start inspection before using your machine.":"PlantTrack management workspace"}</p></div>{!isOperator&&<button className="primary" onClick={()=>{setWorkshopDashboardOnly(false);setPage("Workshop job cards");setNotice("Complete the job details below, then click Create job card.");}}><Plus size={17}/> New job card</button>}</div>
        {notice&&<div className="notice">{notice}</div>}
        {page==="Dashboard"&&<>
          <div className="welcome"><div><span className="eyebrow light">JT UTILITIES FLEET</span><h2>Your plant, ready for the work ahead.</h2><p>A live overview of the equipment your teams rely on every day.</p></div><div className="welcome-icon"><Truck size={58}/></div></div>
          <div className="stats">
            {[
              ["Total assets",assetsLoading?"…":String(assets.length),"All vehicles, plant and equipment",Truck],
              ["Available",assetsLoading?"…":String(availableCount),"Ready for your own teams",CheckCircle2],
              ["In use",assetsLoading?"…":String(assets.filter(a=>a.status==="In use").length),"Currently allocated to work",Activity],
              ["In workshop",assetsLoading?"…":String(assets.filter(a=>a.status==="In workshop").length),"Being worked on",Wrench],
              ["Out of service",assetsLoading?"…":String(assets.filter(a=>a.status==="Out of service").length),"Plant and machinery",AlertTriangle],
              ["Vehicle VOR",assetsLoading?"…":String(assets.filter(a=>a.status==="VOR").length),"HGVs, vehicles and trailers",AlertTriangle]
            ].map(([label,value,sub,Icon]:any)=><button type="button" className="stat" key={label} style={{textAlign:"left",cursor:"pointer"}} onClick={()=>{if(label==="In workshop"){setWorkshopDashboardOnly(true);setPage("Workshop job cards");return;}setWorkshopDashboardOnly(false);setAssetFilter(label==="Total assets"?"All":label==="Vehicle VOR"?"VOR":label);setCategoryFilter(label==="Vehicle VOR"?"Vehicle VOR":label==="Out of service"?"Plant Out of Service":"All");setPage("Plant register");}}><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{sub} · Click to view</small></button>)}
          </div>
          {assetsError&&<p className="auth-error">{assetsError}</p>}
          {isAdmin&&<div className="stats" style={{marginTop:16}}>
            {[
              ["Job cards to review",jobsLoading?"…":String(jobCounts.new),"New jobs and plant defects waiting for admin review",ClipboardCheck],
              ["Jobs with mechanics",jobsLoading?"…":String(jobCounts.assigned),"Assigned or in progress",Wrench],
              ["Awaiting sign-off",jobsLoading?"…":String(jobCounts.approval),"Completed work needing office approval",FileCheck2]
            ].map(([label,value,sub,Icon]:any)=><button type="button" className="stat" key={label} style={{textAlign:"left",cursor:"pointer",borderTopColor:label==="Job cards to review"&&jobCounts.new>0?"#e31b36":undefined}} onClick={()=>setPage("Workshop job cards")}><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{sub} · Click to view</small></button>)}
          </div>}
          {jobsError&&<p className="auth-error" role="alert">{jobsError}</p>}

          {isAdmin&&<DailyInspectionDashboard supabase={supabase} onOpenChecks={()=>setPage("Plant checks")}/>}
          <div className="panel-head" style={{marginTop:24,marginBottom:12}}><div><h3>Inspection and examination schedule</h3><p>See what is overdue and what is coming up across your fleet.</p></div><button className="text-btn" onClick={()=>setPage("Calander")}>Open Calander</button></div>
          {isAdmin&&<PlantSafetyLockouts supabase={supabase} isAdmin={isAdmin}/>}
          
          <PmiDashboard supabase={supabase} onOpenCalendar={()=>setPage("Calander")}/>
          <Calendar supabase={supabase}/>
          <WorkshopDashboardSummary supabase={supabase} onOpen={()=>setPage("Workshop job cards")}/>
        </>}
        {page==="Plant register"&&<AssetManager supabase={supabase} isAdmin={isAdmin} categoryFilter={categoryFilter} statusFilter={assetFilter} onOpenPmi={()=>{setPage("Workshop job cards");window.setTimeout(()=>document.getElementById("workshop-pmi-signoff")?.scrollIntoView({behavior:"smooth",block:"start"}),120);}}/>}
        {page==="Vehicle VOR management"&&<AssetManager supabase={supabase} isAdmin={isAdmin} vorOnly onOpenPmi={()=>{setPage("Workshop job cards");window.setTimeout(()=>document.getElementById("workshop-pmi-signoff")?.scrollIntoView({behavior:"smooth",block:"start"}),120);}}/>}
        {page==="Projects"&&<Projects supabase={supabase} isAdmin={isAdmin}/>}
        {page==="Workshop job cards"&&<>{workshopDashboardOnly&&<div className="notice"><strong>Current workshop job cards</strong> — open and awaiting sign-off only. Completed and historical jobs are excluded. <button type="button" className="secondary" onClick={()=>setWorkshopDashboardOnly(false)}>Show all workshop jobs</button></div>}<WorkshopJobs key={workshopDashboardOnly?"current":"all"} supabase={supabase} activeOnly={workshopDashboardOnly}/><div id="workshop-pmi-signoff" className="workshop-office-pmi"><PmiDashboard supabase={supabase} showOverview={false} showSignoff onOpenCalendar={()=>setPage("Calander")}/></div></>}
        {page==="Calander"&&<Calendar supabase={supabase}/>}
        {page==="MOT Tracker"&&<MotChecker supabase={supabase}/>}
        {page==="Plant checks"&&(isOperator||isAdmin)&&<DailyPlantInspections supabase={supabase}/>}
        {page==="LOLER & certificates"&&<LolerManager supabase={supabase} isAdmin={isAdmin}/> }
        {page==="Maintenance history"&&<WorkshopJobs supabase={supabase}/>}
        {page==="Users & sign-offs"&&<UsersPanel supabase={supabase} isAdmin={isAdmin}/>}
        {page==="Reports"&&isAdmin&&<ManagementReports supabase={supabase}/>}
      </div>
    </main>

    </div>;
}
function AssetTable({rows}:{rows:Asset[]}) {return <div className="table-wrap"><table><thead><tr><th>Asset code</th><th>Description</th><th>Registration</th><th>Location</th><th>Hours</th><th>Next LOLER Examination</th><th>Status</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><b>{a.id}</b></td><td>{a.name}<small>{a.category}</small></td><td>{a.registration}</td><td>{a.location}</td><td>{a.hours}</td><td>{a.loler}</td><td><Tag tone={a.status==="Available"?"green":a.status==="In workshop"?"amber":"red"}>{a.status}</Tag></td></tr>)}</tbody></table>{!rows.length&&<p className="empty">No matching assets.</p>}</div>}
type CalendarEvent = { id:string; date:string; kind:"examined"|"due"|"reminder"|"planned"|"failed"|"booked"; assetCode:string; description:string };
const calendarCategory=(event:CalendarEvent):"loler"|"mot"|"pmi"|"tacho"=>{
  if(event.kind==="reminder"||/\bMOT\b/i.test(event.description))return "mot";
  if(/\bPMI\b/i.test(event.description)||event.kind==="planned")return "pmi";
  if(/tacho/i.test(event.description))return "tacho";
  return "loler";
};
const calendarStyle=(event:CalendarEvent)=>{
  const palette={
    loler:{background:"#e8f1ff",color:"#1d4ed8",border:"#a9c8ff"},
    mot:{background:"#fff0f1",color:"#b42335",border:"#f5b5bd"},
    pmi:{background:"#e8f7ee",color:"#18733e",border:"#a8ddbb"},
    tacho:{background:"#f2ebff",color:"#6941b3",border:"#cbb7f2"}
  }[calendarCategory(event)];
  return {...palette,border:"1px solid "+palette.border};
};
const calendarLabel=(event:CalendarEvent)=>{
  const category=calendarCategory(event);
  const type=category==="loler"?"LOLER":category==="mot"?"MOT":category==="pmi"?"PMI":"Tacho";
  if(event.kind==="failed")return "MOT FAILED";
  if(event.kind==="booked")return "MOT booked";
  const action=event.kind==="reminder"?"reminder":event.kind==="planned"?"planned":event.kind==="examined"?"completed":event.date<new Date().toISOString().slice(0,10)?"overdue":"due";
  return type+" "+action;
};
function Calendar({supabase}:{supabase:SupabaseClient}) {
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [events,setEvents]=useState<CalendarEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selectedDate,setSelectedDate]=useState("");
  const [summaryFilter,setSummaryFilter]=useState<"overdue"|"upcoming"|"examined"|null>(null);
  const now=new Date();
  const today=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  const monthLabel=month.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  useEffect(()=>{
    let cancelled=false;
    async function loadCalendar(){
      setLoading(true);setError("");
      const {data:examinations,error:examinationError}=await supabase
        .from("examinations")
        .select("id,asset_id,examination_type,examined_at,next_due")
        .ilike("examination_type","%LOLER%")
        .order("next_due",{ascending:true});
      if(examinationError){if(!cancelled){setError("Could not load LOLER calendar: "+examinationError.message);setEvents([]);setLoading(false);}return;}
      const rows=examinations||[];
      const assetIds=Array.from(new Set(rows.map((row:any)=>row.asset_id).filter(Boolean)));
      let assetMap=new Map<string,{asset_code:string;description:string}>();
      if(assetIds.length){
        const {data:assets,error:assetError}=await supabase.from("assets").select("id,asset_code,description").in("id",assetIds);
        if(assetError){if(!cancelled){setError("LOLER dates loaded, but asset details could not be loaded: "+assetError.message);setEvents([]);setLoading(false);}return;}
        assetMap=new Map((assets||[]).map((asset:any)=>[asset.id,{asset_code:asset.asset_code,description:asset.description}]));
      }
      const mapped:CalendarEvent[]=[];
      for(const row of rows as any[]){
        const asset=assetMap.get(row.asset_id);
        if(!asset) continue;
        if(row.examined_at) mapped.push({id:row.id+"-examined",date:row.examined_at,kind:"examined",assetCode:asset.asset_code,description:asset.description});
        if(row.next_due) mapped.push({id:row.id+"-due",date:row.next_due,kind:"due",assetCode:asset.asset_code,description:asset.description});
      }
      // HGV compliance deadlines live alongside LOLER events in the original PlantTrack calendar.
      // Keep the date types separate so an MOT is never presented as a LOLER examination.
      const {data:hgvs,error:hgvError}=await supabase.from("assets")
        .select("id,asset_code,registration,description,pmi_next_due,pmi_last_completed,mot_due,tacho_calibration_due,status")
        .in("asset_code",["R500 JTU","WP63 PFD","C545766"]);
      if(hgvError){if(!cancelled){setError("Could not load HGV compliance dates: "+hgvError.message);setLoading(false);}return;}
      // Include MOT expiry dates already saved by the existing DVSA integration.
      const {data:dvsaRecords}=await supabase.from("vehicle_mot_records").select("asset_id,registration,expiry_date,mot_tests,mot_status,latest_test_date,raw_response");
      const savedDvsaIds=new Set<string>();
      for(const record of dvsaRecords||[]){
        if(record.mot_status==="FAILED"&&record.latest_test_date){
          mapped.push({id:record.asset_id+"-dvsa-mot-failed-"+record.latest_test_date,date:record.latest_test_date.slice(0,10),kind:"failed",assetCode:(record.registration||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),description:"FAILED MOT · Repair defects and arrange retest · Not a passing certificate"});
        }
        const isFirstMot=Boolean(firstMotDue(record));
        const expiryDate=motExpiryFromHistory(record)||firstMotDue(record);
        if(!expiryDate)continue;
        savedDvsaIds.add(record.asset_id);
        mapped.push({id:record.asset_id+"-dvsa-mot",date:expiryDate.slice(0,10),kind:"due",assetCode:(record.registration||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),description:isFirstMot?"First MOT due · DVSA confirmed":"DVSA MOT expiry · Verified MOT record"});
        for(const days of [60,30,14]){
          const reminder=new Date(expiryDate.slice(0,10)+"T00:00:00Z");
          reminder.setUTCDate(reminder.getUTCDate()-days);
          mapped.push({id:record.asset_id+"-dvsa-mot-"+days,date:reminder.toISOString().slice(0,10),kind:"reminder",assetCode:(record.registration||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),description:(isFirstMot?"First MOT reminder · ":"DVSA MOT reminder · ")+days+" days before "+expiryDate.slice(0,10)});
        }
      }
      for(const hgv of hgvs||[]){
        const code=hgv.asset_code==="C545766"?"C545766 · Trailer":hgv.registration||hgv.asset_code;
        const prefix=hgv.asset_code==="C545766"?"Trailer":"HGV";
        const add=(date:string|null,kind:"examined"|"due",label:string)=>{
          if(date) mapped.push({id:hgv.id+"-"+label,date:date.slice(0,10),kind,assetCode:code,description:label+" · "+(hgv.description||"HGV")});
        };
        add(hgv.pmi_last_completed,"examined",prefix+" PMI inspection completed");
        if(hgv.status!=="out_of_service")add(hgv.pmi_next_due,"due",prefix+" PMI inspection due");
        for(const planned of hgv.status==="out_of_service"?[]:plannedPmiDates(hgv.pmi_next_due,today,13)){
          if(planned===hgv.pmi_next_due?.slice(0,10))continue;
          mapped.push({id:hgv.id+"-pmi-plan-"+planned,date:planned,kind:"planned",assetCode:code,description:prefix+" PMI planned · Six-week projected slot"});
        }
        if(!savedDvsaIds.has(hgv.id))add(hgv.mot_due,"due",prefix+" MOT expiry");
        if(hgv.mot_due&&!savedDvsaIds.has(hgv.id)){
          // Use UTC date arithmetic to avoid daylight-saving shifts in reminders.
          const expiry=hgv.mot_due.slice(0,10);
          for(const days of [60,30,14]){
            const reminderDate=new Date(expiry+"T00:00:00Z");
            reminderDate.setUTCDate(reminderDate.getUTCDate()-days);
            mapped.push({id:hgv.id+"-mot-reminder-"+days,date:reminderDate.toISOString().slice(0,10),kind:"reminder",assetCode:code,description:prefix+" MOT reminder · "+days+" days before "+expiry});
          }
        }
        if(prefix==="HGV")add(hgv.tacho_calibration_due,"due","HGV tacho calibration");
      }
      const {data:garageBookings,error:garageError}=await supabase.from("mot_garage_bookings").select("id,asset_id,booking_date,booking_time,garage_name,status,assets(asset_code,registration)").eq("status","booked");
      if(garageError){if(!cancelled){setError("Could not load MOT garage bookings: "+garageError.message);setLoading(false);}return;}
      for(const booking of garageBookings||[]){
        const asset=booking.assets as unknown as {asset_code:string;registration:string|null}|null;
        mapped.push({id:"mot-booking-"+booking.id,date:booking.booking_date,kind:"booked",assetCode:asset?.registration||asset?.asset_code||"Vehicle",description:"MOT booked · "+booking.booking_time.slice(0,5)+" · "+booking.garage_name});
      }
      if(!cancelled){setEvents(mapped);setLoading(false);}
    }
    void loadCalendar();
    return ()=>{cancelled=true;};
  },[supabase]);
  const year=month.getFullYear();
  const monthIndex=month.getMonth();
  const firstDay=new Date(year,monthIndex,1).getDay();
  const daysInMonth=new Date(year,monthIndex+1,0).getDate();
  const dateKey=(day:number)=>year+"-"+String(monthIndex+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  const byDate=new Map<string,CalendarEvent[]>();
  for(const event of events){const current=byDate.get(event.date)||[];current.push(event);byDate.set(event.date,current);}
  const selectedEvents=(byDate.get(selectedDate)||[]).slice().sort((a,b)=>a.kind===b.kind? a.assetCode.localeCompare(b.assetCode):a.kind==="failed"?-1:a.kind==="due"?-1:1);
  const dueEvents=events.filter(event=>event.kind==="due");
  const motReminders=events.filter(event=>event.kind==="reminder" && event.date<=today && event.description.includes("MOT reminder"));
  const currentMotReminders=motReminders.filter(event=>{const expiry=event.description.split(" before ")[1];return expiry>=today;});
  const overdueCount=dueEvents.filter(event=>event.date<today).length;
  const upcomingCount=dueEvents.filter(event=>event.date>=today).length;
  const formatDate=(value:string)=>{const [y,m,d]=value.split("-");return d+"-"+m+"-"+y;};
  return <section className="panel">
    <div className="panel-head"><div><h3>{monthLabel}</h3><p>LOLER, MOT and HGV compliance dates · Live register</p></div><div style={{display:"flex",gap:8}}><button className="secondary" onClick={()=>setMonth(new Date(year,monthIndex-1,1))}>‹</button><button className="secondary" onClick={()=>setMonth(new Date(year,monthIndex+1,1))}>›</button></div></div>
    <div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",marginBottom:18}}>
      <button type="button" className="stat" onClick={()=>setSummaryFilter(summaryFilter==="overdue"?null:"overdue")} aria-pressed={summaryFilter==="overdue"} style={{textAlign:"left",cursor:"pointer",border:summaryFilter==="overdue"?"2px solid #b91c1c":undefined}}>
        <div className="stat-top"><span>Overdue checks</span><AlertTriangle size={18}/></div><strong>{loading?"…":overdueCount}</strong><small>Past renewal date · Click to view</small>
      </button>
      <button type="button" className="stat" onClick={()=>setSummaryFilter(summaryFilter==="upcoming"?null:"upcoming")} aria-pressed={summaryFilter==="upcoming"} style={{textAlign:"left",cursor:"pointer",border:summaryFilter==="upcoming"?"2px solid #d97706":undefined}}>
        <div className="stat-top"><span>Upcoming checks</span><CalendarDays size={18}/></div><strong>{loading?"…":upcomingCount}</strong><small>Due today or later · Click to view</small>
      </button>
      <button type="button" className="stat" onClick={()=>setSummaryFilter(summaryFilter==="examined"?null:"examined")} aria-pressed={summaryFilter==="examined"} style={{textAlign:"left",cursor:"pointer",border:summaryFilter==="examined"?"2px solid #2563eb":undefined}}>
        <div className="stat-top"><span>Recorded examinations</span><FileCheck2 size={18}/></div><strong>{loading?"…":events.filter(event=>event.kind==="examined").length}</strong><small>Last examination dates · Click to view</small>
      </button>
    </div>
    {currentMotReminders.length>0&&<div role="status" style={{border:"1px solid #f59e0b",borderRadius:12,padding:14,marginBottom:18,background:"#fffbeb"}}>
      <b>MOT reminders · 60 / 30 / 14 days</b>
      {Array.from(new Map(currentMotReminders.map(e=>[e.assetCode,e])).values()).map(e=><p key={e.assetCode} style={{margin:"6px 0"}}>{e.assetCode} · MOT expires {e.description.split(" before ")[1]} · renewal reminder active</p>)}
    </div>}
    {summaryFilter&&<div style={{border:"1px solid #e5e5e8",borderRadius:12,padding:16,marginBottom:18}}>
      <div className="panel-head"><div><h3>{summaryFilter==="overdue"?"Overdue compliance dates":summaryFilter==="upcoming"?"Upcoming compliance dates":"Recorded examinations"}</h3><p>{summaryFilter==="overdue"?"These renewal dates are in the past and need checking.":summaryFilter==="upcoming"?"These are the next examination renewal dates in the register.":"These assets have a last examination date recorded."}</p></div><button type="button" className="secondary" onClick={()=>setSummaryFilter(null)}>Close</button></div>
      {(()=>{const list=dueEvents.filter(event=>summaryFilter==="overdue"?event.date<today:summaryFilter==="upcoming"?event.date>=today:false);const rows=summaryFilter==="examined"?events.filter(event=>event.kind==="examined"):list;return rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.assetCode.localeCompare(b.assetCode)).map(event=><div className="attention" key={event.id}><div className="avatar">{event.assetCode.slice(0,2)}</div><div><b>{event.assetCode} · {event.description}</b><small>{summaryFilter==="examined"?"Last examination":"Next compliance due"} · {formatDate(event.date)}</small></div><span className={"tag "+(summaryFilter==="overdue"?"red":summaryFilter==="upcoming"?"amber":"blue")}>{summaryFilter==="overdue"?"Overdue":summaryFilter==="upcoming"?"Upcoming":"Examined"}</span></div>);})()}
      {((summaryFilter==="overdue"?overdueCount:summaryFilter==="upcoming"?upcomingCount:events.filter(event=>event.kind==="examined").length)===0)&&<p className="muted">There are no records in this list.</p>}
    </div>}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <div className="calendar-legend" style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,fontSize:12}}>
      {([["LOLER","#1d4ed8"],["MOT","#b42335"],["PMI","#18733e"],["Tacho","#6941b3"]] as const).map(([name,colour])=><span key={name} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 10px",border:"1px solid #e5eaf0",borderRadius:999,background:"#fff"}}><i style={{display:"inline-block",width:10,height:10,borderRadius:3,background:colour}}/>{name}</span>)}
      <span style={{color:"#64748b",alignSelf:"center"}}>Labels show due, overdue, completed or reminder</span>
    </div>
    <div className="calendar-grid">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><b key={day}>{day}</b>)}
      {Array.from({length:firstDay},(_,index)=><div key={"blank-"+index}/>)}
      {Array.from({length:daysInMonth},(_,index)=>index+1).map(day=>{
        const key=dateKey(day);const dayEvents=byDate.get(key)||[];
        return <button type="button" key={key} className="day" onClick={()=>setSelectedDate(key)} style={{textAlign:"left",border:selectedDate===key?"2px solid #b91c1c":undefined,background:key===today?"#fff7f7":undefined,cursor:"pointer",minHeight:76}}>
          <span>{day}</span>
          {dayEvents.slice(0,3).map(event=><small key={event.id} title={event.description} style={{display:"block",marginTop:4,padding:"4px 6px",borderRadius:6,fontSize:10,fontWeight:700,lineHeight:1.35,...calendarStyle(event)}}>{calendarLabel(event)} · {event.assetCode}</small>)}
          {dayEvents.length>3&&<small>+{dayEvents.length-3} more</small>}
        </button>;
      })}
    </div>
    <div style={{marginTop:18,borderTop:"1px solid #e5e5e8",paddingTop:16}}>
      <div className="panel-head"><div><h3>{selectedDate? "Events for "+formatDate(selectedDate):"Select a date"}</h3><p>{selectedDate?"Recorded examination dates and due dates":"Choose a day on the calendar to see its records"}</p></div></div>
      {selectedDate&&selectedEvents.length===0&&<p className="muted">No compliance events recorded for this date.</p>}
      {selectedEvents.map(event=><div className="attention" key={event.id}><div className="avatar">{event.kind==="failed"?"FAIL":event.kind==="booked"?"MOT":event.kind==="examined"?"EX":event.kind==="reminder"?"MOT":event.kind==="planned"?"PMI":"DU"}</div><div><b>{event.assetCode} · {event.description}</b><small>{event.kind==="failed"?"MOT failed on this date · Repairs required":event.kind==="booked"?"Garage appointment":event.kind==="examined"?"Examination completed":event.kind==="reminder"?"MOT advance reminder":event.kind==="planned"?"Projected PMI date — not booked":"Compliance due"} · {formatDate(event.date)}</small></div><span style={{...calendarStyle(event),borderRadius:999,padding:"5px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{calendarLabel(event)}</span></div>)}
    </div>
    {loading&&<p className="muted">Loading live compliance dates…</p>}
    {!loading&&!error&&events.length===0&&<p className="muted">No compliance dates are currently recorded.</p>}
  </section>;
}
function Projects({supabase,isAdmin}:{supabase:SupabaseClient;isAdmin:boolean}) {
  const [projects,setProjects]=useState<any[]>([]);
  const [allocations,setAllocations]=useState<any[]>([]);
  const [assets,setAssets]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [selectedProject,setSelectedProject]=useState<string|null>(null);
  const [newProject,setNewProject]=useState({project_name:"",client_name:"",site_address:"",site_postcode:"",start_date:"",expected_end_date:"",notes:""});
  const [assetToAllocate,setAssetToAllocate]=useState("");
  const [allocationNote,setAllocationNote]=useState("");
  const [removingProject,setRemovingProject]=useState<string|null>(null);
  async function load(){
    setLoading(true);setError("");
    const [p,a]=await Promise.all([
      supabase.from("projects").select("*").neq("status","archived").order("project_name"),
      supabase.from("project_allocations").select("id,project_id,asset_id,allocated_at,returned_at,notes").is("returned_at",null).order("allocated_at",{ascending:false}),
    ]);
    if(p.error||a.error){setError(p.error?.message||a.error?.message||"Could not load projects.");setLoading(false);return;}
    const {data:assetRows,error:assetError}=await supabase.from("assets").select("id,asset_code,description,category,location,status").order("asset_code");
    if(assetError){setError(assetError.message);setLoading(false);return;}
    setProjects(p.data||[]);setAllocations(a.data||[]);setAssets(assetRows||[]);setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
  async function createProject(){
    if(!newProject.project_name.trim()){setError("Enter a project name.");return;}
    const {data:userData}=await supabase.auth.getUser();
    const {error:e}=await supabase.from("projects").insert({...newProject,created_by:userData.user?.id||null});
    if(e){setError(e.message);return;}
    setNotice("Project created.");setShowForm(false);setNewProject({project_name:"",client_name:"",site_address:"",site_postcode:"",start_date:"",expected_end_date:"",notes:""});await load();
  }
  async function allocate(){
    if(!selectedProject||!assetToAllocate)return;
    const {data:userData}=await supabase.auth.getUser();
    const {error:e}=await supabase.from("project_allocations").insert({project_id:selectedProject,asset_id:assetToAllocate,allocated_by:userData.user?.id||null,notes:allocationNote||null});
    if(e){setError(e.message);return;}
    setNotice("Equipment allocated to project.");setAssetToAllocate("");setAllocationNote("");await load();
  }
  async function release(allocationId:string){
    const {data:userData}=await supabase.auth.getUser();
    const {error:e}=await supabase.from("project_allocations").update({returned_at:new Date().toISOString(),returned_by:userData.user?.id||null}).eq("id",allocationId);
    if(e){setError(e.message);return;}
    setNotice("Equipment released from project.");await load();
  }
  async function removeProject(project:any){
    if(!isAdmin||removingProject)return;
    const hasActive=allocations.some(a=>a.project_id===project.id);
    const message=hasActive
      ?'Remove project "'+project.project_name+'"? Its allocated equipment will be released and the project archived. Allocation history will be retained.'
      :'Remove project "'+project.project_name+'"? Projects with previous allocations will be archived to retain history; empty projects will be permanently deleted.';
    if(!window.confirm(message))return;
    setRemovingProject(project.id);setError("");setNotice("");
    const {data,error:removeError}=await supabase.rpc("remove_project_safely",{p_project:project.id});
    if(removeError)setError("Project could not be removed: "+removeError.message);
    else {setNotice(data==="archived"?"Project archived and equipment released. Allocation history retained.":"Empty project deleted.");setSelectedProject(null);await load();}
    setRemovingProject(null);
  }
  const activeAssetIds=new Set(allocations.map(a=>a.asset_id));
  const availableAssets=assets.filter(a=>!activeAssetIds.has(a.id));
  const fmt=(d:string)=>new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}).replaceAll("/","-");
  return <section className="panel">
    <div className="panel-head"><div><h3>Projects and site equipment</h3><p>Manage your UK jobs and see which equipment is allocated to each site.</p></div><button className="primary" onClick={()=>setShowForm(!showForm)}><Plus size={16}/> New project</button></div>
    {notice&&<p className="notice">{notice}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}
    {showForm&&<div style={{border:"1px solid #e5e5e8",borderRadius:12,padding:16,marginBottom:18,display:"grid",gap:10}}>
      <h3>New project</h3>
      <label>Project name<input value={newProject.project_name} onChange={e=>setNewProject({...newProject,project_name:e.target.value})} placeholder="e.g. Tophams"/></label>
      <label>Client name (optional)<input value={newProject.client_name} onChange={e=>setNewProject({...newProject,client_name:e.target.value})} placeholder="Client / customer"/></label>
      <label>Site address<input value={newProject.site_address} onChange={e=>setNewProject({...newProject,site_address:e.target.value})} placeholder="Site address"/></label>
      <label>Postcode<input value={newProject.site_postcode} onChange={e=>setNewProject({...newProject,site_postcode:e.target.value})} placeholder="Postcode"/></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        <label>Start date<input type="date" value={newProject.start_date} onChange={e=>setNewProject({...newProject,start_date:e.target.value})}/></label>
        <label>Expected finish<input type="date" value={newProject.expected_end_date} onChange={e=>setNewProject({...newProject,expected_end_date:e.target.value})}/></label>
      </div>
      <label>Notes<textarea value={newProject.notes} onChange={e=>setNewProject({...newProject,notes:e.target.value})} placeholder="Project notes..."/></label>
      <div style={{display:"flex",gap:8}}><button className="primary" onClick={()=>void createProject()}>Save project</button><button className="secondary" onClick={()=>setShowForm(false)}>Cancel</button></div>
    </div>}
    {loading?<p className="muted">Loading projects and allocations…</p>:projects.length===0?<p className="muted">No projects have been added yet. Create your first project, such as Tophams, then allocate equipment to it.</p>:projects.map(project=>{
      const rows=allocations.filter(a=>a.project_id===project.id);
      return <div key={project.id} style={{border:"1px solid #e5e5e8",borderRadius:12,padding:16,marginBottom:12}}>
        <div className="panel-head"><div><h3>{project.project_name}</h3><p>{[project.site_address,project.site_postcode].filter(Boolean).join(", ")||"Site location not yet added"} · {project.status.replace("_"," ")}</p></div><div style={{display:"flex",alignItems:"center",gap:10}}><Tag tone={project.status==="active"?"green":project.status==="completed"?"neutral":"amber"}>{project.status}</Tag>{isAdmin&&<button className="secondary" disabled={removingProject!==null} onClick={()=>void removeProject(project)} style={{color:"#b91c1c"}}>{removingProject===project.id?"Removing…":"Delete project"}</button>}</div></div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13,color:"#666",marginBottom:12}}><span>{rows.length} items allocated</span>{project.client_name&&<span>Client: {project.client_name}</span>}{project.start_date&&<span>Start: {fmt(project.start_date)}</span>}</div>
        {rows.map(row=>{const asset=assets.find(a=>a.id===row.asset_id);return <div className="attention" key={row.id}><div className="avatar"><Truck size={16}/></div><div><b>{asset?.asset_code||"Asset"} · {asset?.description||"Equipment"}</b><small>{asset?.category||""} · Allocated {fmt(row.allocated_at)}</small></div><button className="secondary" onClick={()=>void release(row.id)}>Release</button></div>;})}
        {selectedProject===project.id?<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><select value={assetToAllocate} onChange={e=>setAssetToAllocate(e.target.value)}><option value="">Choose available equipment</option>{availableAssets.map(a=><option key={a.id} value={a.id}>{a.asset_code} – {a.description}</option>)}</select><input value={allocationNote} onChange={e=>setAllocationNote(e.target.value)} placeholder="Allocation note (optional)"/><button className="primary" disabled={!assetToAllocate} onClick={()=>void allocate()}>Allocate</button><button className="secondary" onClick={()=>setSelectedProject(null)}>Cancel</button></div>:<button className="secondary" style={{marginTop:10}} onClick={()=>{setSelectedProject(project.id);setAssetToAllocate("");}}> <Plus size={15}/> Allocate equipment</button>}
      </div>;
    })}
    {!loading&&<p className="muted" style={{marginTop:14}}>Available to allocate: {availableAssets.length} assets. Each asset can only be allocated to one active project at a time. Previous allocations remain in the database when equipment is released.</p>}
  </section>;
}

function UsersPanel({supabase,isAdmin}:{supabase:SupabaseClient;isAdmin:boolean}){
 const [users,setUsers]=useState<{id:string;email:string;full_name:string;role:string;active:boolean}[]>([]);
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [role,setRole]=useState("operator");
 const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
 const [manual,setManual]=useState(true);const [tempPassword,setTempPassword]=useState("");
 const [resetUser,setResetUser]=useState("");const [resetPassword,setResetPassword]=useState("");
 const roles=[["admin","Administrator"],["plant_manager","Plant Manager"],["supervisor","Supervisor"],["mechanic","Mechanic"],["inspector","Inspector"],["operator","Plant Operator — Plant Checks only"],["director","Director"]];
 async function request(body:Record<string,unknown>){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw Error("Please sign in again");
  const {data,error}=await supabase.functions.invoke("manage-planttrack-users",{body,headers:{Authorization:"Bearer "+session.access_token}});
  if(error){let detail=data?.error;const context=(error as {context?:Response}).context;if(!detail&&context){try{const body=await context.json();detail=body?.error||body?.message;}catch{}}throw Error(typeof detail==="string"?detail:error.message);}
  if(data?.error)throw Error(data.error);
  return data;
 }
 async function load(){if(!isAdmin)return;try{const data=await request({action:"list"});setUsers(data.users||[]);}catch(e){setFeedback(e instanceof Error?e.message:String(e));}}
 useEffect(()=>{void load();},[isAdmin,supabase]);
 async function invite(e:React.FormEvent){e.preventDefault();setBusy(true);setFeedback("");try{const d=await request(manual?{action:"create_manual",name,email,role,password:tempPassword}:{action:"invite",name,email,role});setFeedback(d.message);setName("");setEmail("");setTempPassword("");await load();}catch(e){setFeedback(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function update(id:string,patch:{role?:string;active?:boolean}){const u=users.find(x=>x.id===id);if(!u)return;setBusy(true);setFeedback("");try{const d=await request({action:"update",id,role:patch.role??u.role,active:patch.active??u.active});setFeedback(d.message);await load();}catch(e){setFeedback(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 if(!isAdmin)return <section className="panel"><h3>Users and permissions</h3><p>Only administrators can invite users or change account permissions.</p></section>;
 return <section className="panel"><div className="panel-head"><div><h3>Users and permissions</h3><p>Invite staff to PlantTrack and manage access</p></div></div>
 <form onSubmit={e=>void invite(e)} style={{display:"grid",gap:12,maxWidth:620,marginBottom:24}}>
 <h4>Add a new user</h4><label><input type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)}/> Create manually (no email required)</label>
 <label>Full name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label>
 <label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.co.uk"/></label>
 <label>Job role<select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{role==="operator"&&<p className="muted" style={{margin:"-4px 0 4px"}}>Plant Operators open directly into Daily Plant Checks. The dashboard, asset register, job cards and admin tools are hidden for this profile.</p>}
 {manual&&<label>Temporary password (minimum 8 characters)<input type="password" required minLength={8} autoComplete="new-password" value={tempPassword} onChange={e=>setTempPassword(e.target.value)}/></label>}<button className="primary" type="submit" disabled={busy}><Plus size={16}/>{busy?"Please wait…":manual?"Create user":"Send email invitation"}</button>
 <p className="muted">{manual?"Give the temporary password privately. The user must choose a new password at first sign-in.":"The user receives an activation email to set their own password."}</p>
 </form>
 {feedback&&<p role="status">{feedback}</p>}
 {resetUser&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setFeedback("");try{const d=await request({action:"set_temporary_password",id:resetUser,password:resetPassword});setFeedback(d.message);setResetUser("");setResetPassword("");}catch(err){setFeedback(err instanceof Error?err.message:String(err));}finally{setBusy(false);}}} style={{display:"grid",gap:10,maxWidth:500,marginBottom:20}}><h4>Set temporary password for {users.find(u=>u.id===resetUser)?.full_name}</h4><input type="password" required minLength={8} value={resetPassword} onChange={e=>setResetPassword(e.target.value)} placeholder="Temporary password (8+ characters)"/><button type="submit" disabled={busy}>Save temporary password</button><button type="button" onClick={()=>setResetUser("")}>Cancel</button></form>}
 <h4>Existing users</h4>
 <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.full_name}</td><td>{u.email}<div><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setFeedback("");try{const d=await request({action:"resend",id:u.id,email:u.email});setFeedback(d.message);}catch(e){setFeedback(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}}>Resend setup email</button> <button type="button" disabled={busy} onClick={()=>{setResetUser(u.id);setResetPassword("");}}>Set temporary password</button></div></td><td><select disabled={busy} value={u.role} onChange={e=>void update(u.id,{role:e.target.value})}>{roles.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td><td><button type="button" className="secondary" disabled={busy} onClick={()=>void update(u.id,{active:!u.active})}>{u.active?"Deactivate":"Reactivate"}</button></td></tr>)}</tbody></table></div>
 </section>;
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default function Home() {
  const [supabase] = useState<SupabaseClient | null>(() => getSupabase());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [mustChangePassword,setMustChangePassword]=useState(false);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");

  useEffect(() => {
    if (!supabase) { setSessionReady(true); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (data.session) await loadProfile(data.session.user.id);
      else setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        // Defer profile query to avoid running Supabase calls inside the auth callback.
        window.setTimeout(() => { if (alive) loadProfile(session.user.id); }, 0);
      } else {
        setSignedIn(false); setDisplayName(""); setRoleName(""); setSessionReady(true);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from("profiles").select("full_name, role, active, must_change_password").eq("id", userId).single();
    if (profileError || !data || !data.active) {
      await supabase.auth.signOut();
      setError("Your login is not linked to an active PlantTrack profile. Please contact the Plant Manager.");
      setSessionReady(true);
      return;
    }
    setMustChangePassword(!!data.must_change_password);
    setDisplayName(data.full_name);
    setRoleName(String(data.role).replaceAll("_", " "));
    setSignedIn(true);
    setSessionReady(true);
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError("Sign-in failed. Check your email and password, then try again.");
    setBusy(false);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  if (!supabase) return <div className="auth-screen"><div className="auth-card"><img src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd" /><h1>PlantTrack</h1><p>Supabase connection settings are missing. Add the project URL and publishable key in Vercel Environment Variables, then redeploy.</p></div></div>;
  if (!sessionReady) return <div className="auth-screen"><div className="auth-card"><p>Checking your secure PlantTrack session…</p></div></div>;
  if (!signedIn) return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}>
    <img src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd logo" />
    <div className="auth-eyebrow">JT UTILITIES LTD</div><h1>PlantTrack</h1>
    <p>Sign in to your plant management workspace.</p>
    <label htmlFor="planttrack-email">Company email</label>
    <input id="planttrack-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} />
    <label htmlFor="planttrack-password">Password</label>
    <input id="planttrack-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} />
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="primary auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    <small>Access is provided through your individual JT Utilities account.</small>
  </form></main>;
  if(mustChangePassword)return <main className="auth-screen"><form className="auth-card" onSubmit={async e=>{e.preventDefault();if(newPassword.length<8||newPassword!==confirmPassword){setError("Use at least 8 characters and make sure both passwords match.");return;}setBusy(true);setError("");const {error:passwordError}=await supabase.auth.updateUser({password:newPassword});if(passwordError){setError(passwordError.message);setBusy(false);return;}const {error:flagError}=await supabase.rpc("complete_first_password_change");if(flagError){setError("Password changed, but activation could not finish: "+flagError.message);setBusy(false);return;}setMustChangePassword(false);setNewPassword("");setConfirmPassword("");setBusy(false);}}><h1>Change your temporary password</h1><p>Before accessing PlantTrack, choose your own password.</p><label>New password<input type="password" required minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy}>Save password and continue</button><button type="button" onClick={signOut}>Sign out</button></form></main>;
  return <><div className="signed-in-strip"><span>Signed in: <b>{displayName}</b> · {roleName}</span><button onClick={signOut}>Sign out</button></div><Dashboard supabase={supabase} isAdmin={roleName === "admin"} role={roleName} /></>;
}
