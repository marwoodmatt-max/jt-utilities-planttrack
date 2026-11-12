 "use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AssetManager from "../components/asset-manager";
import LolerManager from "../components/loler-manager";
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck,
  Clock3, FileCheck2, FileText, LayoutDashboard, Menu, Search, Settings, ShieldCheck,
  Truck, Users, Wrench, X, Plus, Bell, ArrowUpRight, QrCode, History, Download
} from "lucide-react";

type Asset = { id:string; name:string; category:string; registration:string; location:string; hours:string; status:string; loler:string; service:string };
type DbAsset = { id:string; asset_code:string; description:string; category:string|null; manufacturer:string|null; model:string|null; serial_number:string|null; registration:string|null; location:string|null; hour_meter:number|string|null; status:string };
function displayStatus(status:string) {
  const labels:Record<string,string> = { available:"Available", in_use:"In use", in_workshop:"In workshop", out_of_service:"Out of service", off_hire:"Off hire" };
  return labels[status] || status;
}
const nav = [
  ["Dashboard",LayoutDashboard],["Plant register",Truck],["Projects",ClipboardCheck],["Inspection calendar",CalendarDays],["MOT checker",FileCheck2],
  ["Plant checks",ClipboardCheck],["LOLER & certificates",FileCheck2],
  ["Workshop job cards",Wrench],["Maintenance history",History],["Users & sign-offs",Users],["Reports",Activity]
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
function PmiDashboard({supabase,onOpenCalendar}:{supabase:SupabaseClient;onOpenCalendar:()=>void}){
  const [items,setItems]=useState<PmiItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [history,setHistory]=useState<any[]>([]);
  const [selected,setSelected]=useState("");
  const [inspectedOn,setInspectedOn]=useState(new Date().toISOString().slice(0,10));
  const [result,setResult]=useState("Pass");
  const [mileage,setMileage]=useState("");
  const [defects,setDefects]=useState("");
  const [inspector,setInspector]=useState("");
  const [signer,setSigner]=useState("");
  const [report,setReport]=useState<File|null>(null);
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState("");
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
      const {data:past}=await supabase.from("hgv_pmi_records").select("id,asset_id,inspected_on,result,inspector_name,signed_off_by,report_path").order("inspected_on",{ascending:false}).limit(100);
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
  const overdue=items.filter(x=>x.pmi_next_due!<today);
  const upcoming=items.filter(x=>x.pmi_next_due!>=today&&x.pmi_next_due!<=cutoff);
  const fmt=(d:string|null)=>d?d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"Not recorded";
  const hgvItems=items.filter(item=>["R500 JTU","WP63 PFD","C545766"].includes(item.asset_code));
  async function savePmi(e:React.FormEvent){
    e.preventDefault();setFeedback("");
    const asset=hgvItems.find(a=>a.asset_code===selected);
    if(!asset||!inspector.trim()||!signer.trim())return setFeedback("Select a vehicle, inspector and signatory.");
    if(inspectedOn>today)return setFeedback("Completion date cannot be in the future.");
    if(result!=="Pass"&&!defects.trim())return setFeedback("Describe the defects before saving.");
    setSaving(true);
    try{
      let path:string|null=null;
      if(report){
        if(report.size>10485760||!["application/pdf","image/jpeg","image/png"].includes(report.type))throw Error("Report must be PDF, JPG or PNG under 10MB.");
        path=asset.id+"/"+crypto.randomUUID()+"-"+report.name.replace(/[^A-Za-z0-9._-]/g,"_");
        const {error}=await supabase.storage.from("hgv-pmi-reports").upload(path,report);
        if(error)throw error;
      }
      const {error}=await supabase.from("hgv_pmi_records").insert({asset_id:asset.id,inspected_on:inspectedOn,result,mileage:mileage?Number(mileage):null,defects:defects||null,inspector_name:inspector.trim(),signed_off_by:signer.trim(),report_path:path});
      if(error)throw error;
      setFeedback(result==="Pass"?"Signed PMI saved; next PMI advanced by six weeks.":"Inspection saved with defects; next PMI was not advanced.");
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
    <div className="panel-head"><div><h3>PMI inspections · Fleet</h3><p>Live due dates from your plant register · Overdue and next 14 days</p></div><button className="text-btn" onClick={onOpenCalendar}>Open inspection calendar</button></div>
    <div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",marginBottom:14}}>
      <div className="stat"><div className="stat-top"><span>Overdue PMI</span><AlertTriangle size={18}/></div><strong>{loading?"…":overdue.length}</strong></div>
      <div className="stat"><div className="stat-top"><span>Due within 14 days</span><CalendarDays size={18}/></div><strong>{loading?"…":upcoming.length}</strong></div>
      <div className="stat"><div className="stat-top"><span>Scheduled PMI</span><ClipboardCheck size={18}/></div><strong>{loading?"…":items.length}</strong></div>
    </div>
    {error&&<p className="auth-error" role="alert">Could not load PMI inspections: {error}</p>}
    {!loading&&!error&&<div className="table-wrap"><table><thead><tr><th>Vehicle / trailer</th><th>Last PMI</th><th>Next PMI</th><th>Status</th></tr></thead><tbody>
      {[...overdue,...upcoming].map(item=><tr key={item.asset_code}><td><b>{item.asset_code}</b><small>{item.description||""}</small></td><td>{fmt(item.pmi_last_completed)}</td><td>{fmt(item.pmi_next_due)}</td><td><Tag tone={item.pmi_next_due!<today?"red":"amber"}>{item.pmi_next_due!<today?"Overdue":item.pmi_next_due===today?"Due today":"Due soon"}{item.status==="out_of_service"?" · VOR":""}</Tag></td></tr>)}
    </tbody></table>{overdue.length+upcoming.length===0&&<p className="muted">No PMI inspections overdue or due in the next 14 days.</p>}</div>}
    <div style={{marginTop:22}}>
      <h3>Record completed PMI and sign-off</h3>
      <p className="muted">Only a passed inspection advances the next due date. Reports are stored privately.</p>
      <form onSubmit={e=>void savePmi(e)} style={{display:"grid",gap:12,maxWidth:680}}>
        <label>Vehicle<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select HGV or trailer</option>{hgvItems.map(a=><option key={a.id} value={a.asset_code}>{a.asset_code} · {a.description}</option>)}</select></label>
        <label>Inspection date<input type="date" required max={today} value={inspectedOn} onChange={e=>setInspectedOn(e.target.value)}/></label>
        <label>Mileage / odometer<input type="number" min="0" value={mileage} onChange={e=>setMileage(e.target.value)}/></label>
        <label>Result<select value={result} onChange={e=>setResult(e.target.value)}><option>Pass</option><option>Defects noted</option><option>Fail</option></select></label>
        <label>Defects / remedial work<textarea value={defects} onChange={e=>setDefects(e.target.value)}/></label>
        <label>Inspector name<input required value={inspector} onChange={e=>setInspector(e.target.value)}/></label>
        <label>Signed off by<input required value={signer} onChange={e=>setSigner(e.target.value)}/></label>
        <label>PMI report (PDF, JPG, PNG, max 10MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setReport(e.target.files?.[0]||null)}/></label>
        <button type="submit" className="primary" disabled={saving}>{saving?"Saving…":"Save signed PMI"}</button>
      </form>
      {feedback&&<p role="status">{feedback}</p>}
      <h3 style={{marginTop:20}}>PMI completion history</h3>
      <div className="table-wrap"><table><thead><tr><th>Vehicle</th><th>Date</th><th>Result</th><th>Inspector</th><th>Signed off</th><th>Report</th></tr></thead><tbody>{history.map(r=><tr key={r.id}><td>{hgvItems.find(a=>a.id===r.asset_id)?.asset_code||r.asset_id}</td><td>{fmt(r.inspected_on)}</td><td>{r.result}</td><td>{r.inspector_name}</td><td>{r.signed_off_by}</td><td>{r.report_path?<button className="secondary" onClick={()=>void viewReport(r.report_path)}>View report</button>:"—"}</td></tr>)}</tbody></table></div>
    </div>
  </section>;
}
type MotVehicle={id:string;asset_code:string;registration:string|null;description:string|null;mot_due:string|null;status:string;category:string|null};
type DvsaMotRecord={asset_id:string;registration:string;expiry_date:string|null;last_checked_at:string|null;last_check_error:string|null;mot_status:string|null};
function MotChecker({supabase}:{supabase:SupabaseClient}){
  const [vehicles,setVehicles]=useState<MotVehicle[]>([]);
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
    const [assetsResult,recordsResult]=await Promise.all([
      supabase.from("assets").select("id,asset_code,registration,description,mot_due,status,category").order("asset_code"),
      supabase.from("vehicle_mot_records").select("asset_id,registration,expiry_date,last_checked_at,last_check_error,mot_status")
    ]);
    if(assetsResult.error)setError("Could not load vehicles: "+assetsResult.error.message);
    else setVehicles((assetsResult.data||[]).filter(v=>Boolean(v.registration)||Boolean(v.mot_due)) as MotVehicle[]);
    if(recordsResult.error)setError("Could not load saved DVSA MOT records: "+recordsResult.error.message);
    else setRecords((recordsResult.data||[]) as DvsaMotRecord[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
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
  const fmt=(d:string)=>d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
  const normaliseReg=(value:string|null|undefined)=>(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const recordByAsset=new Map(records.map(r=>[r.asset_id,r]));
  const expiry=(v:MotVehicle)=>recordByAsset.get(v.id)?.expiry_date||v.mot_due;
  const statusOf=(v:MotVehicle)=>{const record=recordByAsset.get(v.id);if(!record?.last_checked_at)return "unchecked";if(!record.expiry_date)return "unknown";const days=daysUntil(record.expiry_date);return days<0?"expired":days<=60?"soon":"valid";};
  const counts={valid:vehicles.filter(v=>statusOf(v)==="valid").length,soon:vehicles.filter(v=>statusOf(v)==="soon").length,expired:vehicles.filter(v=>statusOf(v)==="expired").length,unchecked:vehicles.filter(v=>statusOf(v)==="unchecked").length,unknown:vehicles.filter(v=>statusOf(v)==="unknown").length};
  const shownVehicles=vehicles.filter(v=>(statusFilter==="all"||statusOf(v)===statusFilter)&&(!registrationSearch||normaliseReg(v.registration).includes(normaliseReg(registrationSearch))));
  const dueSoon=vehicles.filter(v=>{const d=expiry(v);return d&&daysUntil(d)>=0&&daysUntil(d)<=60;}).length;
  const overdue=vehicles.filter(v=>{const d=expiry(v);return d&&daysUntil(d)<0;}).length;
  return <section className="panel">
    <div className="panel-head"><div><h3>DVSA MOT checker · All vehicles</h3><p>All vans, cars and other registered vehicles, plus separate HGV and trailer records</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>void checkAllVehicles()} disabled={loading||checking!==null}>Check all vehicles with DVSA</button><button className="secondary" onClick={()=>void load()} disabled={loading||checking!==null}>Refresh</button></div></div>
    {batchProgress&&<p role="status">{batchProgress}</p>}
    <div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",marginBottom:16}}>
      {([{key:"valid",label:"Valid MOT",tone:"green"},{key:"soon",label:"Due within 60 days",tone:"amber"},{key:"expired",label:"Expired MOT",tone:"red"},{key:"unchecked",label:"Not checked",tone:"neutral"},{key:"unknown",label:"DVSA date missing",tone:"neutral"}] as const).map(item=><button type="button" className="stat" key={item.key} onClick={()=>setStatusFilter(statusFilter===item.key?"all":item.key)} aria-pressed={statusFilter===item.key} style={{textAlign:"left",cursor:"pointer",border:statusFilter===item.key?"2px solid #2563eb":undefined}}><div className="stat-top"><span>{item.label}</span><FileCheck2 size={18}/></div><strong>{loading?"…":counts[item.key]}</strong><small>Click to filter</small></button>)}
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
            {tests.map((test:any,j:number)=><tr key={j}><td>{test.completedDate?String(test.completedDate).slice(0,10):"—"}</td><td>{test.testResult||"—"}</td><td>{test.expiryDate||"—"}</td><td>{test.odometerValue||"—"} {test.odometerUnit||""}</td></tr>)}
          </tbody></table></div>
          {!tests.length&&<p className="muted">DVSA returned no MOT tests for this registration.</p>}
        </div>;
      })}
    </div>}
    {!loading&&!error&&<div className="table-wrap"><table><thead><tr><th>Vehicle / trailer</th><th>MOT expiry</th><th>Warning</th><th>DVSA last checked</th><th>Action</th></tr></thead><tbody>
      {shownVehicles.slice().sort((a,b)=>(expiry(a)||"9999").localeCompare(expiry(b)||"9999")).map(v=>{
        const record=recordByAsset.get(v.id);const d=record?.expiry_date||null;const days=d?daysUntil(d):null;
        const label=!record?.last_checked_at?"Not checked":days===null?"DVSA date missing":days<0?"MOT overdue":days===0?"Expires today":days<=14?"14-day warning":days<=30?"30-day warning":days<=60?"60-day warning":"Current";
        return <tr key={v.id}><td><b>{normaliseReg(v.registration)||v.asset_code}</b><small>{v.description||v.category||""} · Asset {v.asset_code}</small></td><td>{d?fmt(d):"Not recorded"}</td><td><Tag tone={!record?.last_checked_at||days===null?"neutral":days<0?"red":days<=60?"amber":"green"}>{label}</Tag></td><td>{record?.last_checked_at?new Date(record.last_checked_at).toLocaleString("en-GB"):"Not checked"}{record?.last_check_error&&<small>{record.last_check_error}</small>}</td><td>{v.registration?<button className="secondary" disabled={checking!==null} onClick={()=>void checkMot(normaliseReg(v.registration))}>{checking===normaliseReg(v.registration)?"Checking…":"Check DVSA"}</button>:<span className="muted">Certificate record</span>}</td></tr>;
      })}
    </tbody></table>{vehicles.length===0&&<p className="muted">No registered vehicles or MOT records found.</p>}</div>}
    <p className="muted">DVSA checks use the existing secure Supabase connection. Trailer certificate dates remain in the Plant Register. The manual bulk check covers the Vehicle category. The daily 4am UK DVSA schedule is active; its first successful full-fleet run is still awaiting verification. Trailer certificate dates remain separate.</p>
  </section>;
}
function Dashboard({supabase,isAdmin}:{supabase:SupabaseClient;isAdmin:boolean}) {
  const [page,setPage]=useState("Dashboard");
  const [query,setQuery]=useState("");
  const [assets,setAssets]=useState<Asset[]>([]);
  const [assetsLoading,setAssetsLoading]=useState(true);
  const [assetsError,setAssetsError]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [assetFilter,setAssetFilter]=useState("All");
  const [categoryFilter,setCategoryFilter]=useState("All");
  const [notice,setNotice]=useState("");
  const [form,setForm]=useState({asset:"",fault:"",priority:"Normal"});
  useEffect(() => {
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

        const mapped = ((data || []) as DbAsset[]).map((item) => ({
          id: item.asset_code,
          name: item.description || [item.manufacturer, item.model].filter(Boolean).join(" ") || "Description not recorded",
          category: item.category || "Uncategorised",
          registration: item.registration || "—",
          location: item.location || "Not recorded",
          hours: item.hour_meter == null ? "—" : String(item.hour_meter),
          status: displayStatus(item.status),
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
  }, [supabase]);
  const filtered=useMemo(()=>assets.filter(a=>
    (a.id+" "+a.name+" "+a.category+" "+a.location+" "+a.registration).toLowerCase().includes(query.trim().toLowerCase()) &&
    (assetFilter==="All"||a.status===assetFilter) &&
    (categoryFilter==="All"||a.category.toLowerCase()===categoryFilter.toLowerCase())
  ),[assets,query,assetFilter,categoryFilter]);
  const availableCount=assets.filter(a=>a.status==="Available").length;
  function action(msg:string){setNotice(msg);setTimeout(()=>setNotice(""),3500)}
  const title=page;
  return <div className="shell">
    <aside className={`sidebar ${mobileNav?"open":""}`}>
      <div className="brand"><img className="brand-logo" src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd logo" /><div><b>JT UTILITIES LTD</b><small>PLANTTRACK</small></div><button className="close-nav" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="nav-caption">WORKSPACE</div>
      {nav.map(([label,Icon])=>label==="Plant register"?<div key={label}><button onClick={()=>{setPage(label);setCategoryFilter("All");setMobileNav(false)}} className={`nav-item ${page===label?"active":""}`}><Icon size={18}/><span>{label}</span></button>{page==="Plant register"&&<div style={{paddingLeft:28,display:"grid",gap:3}}>{[["All assets","All"],["Vehicles","Vehicle"],["HGVs","HGV"],["Plant & Machinery","Plant"],["Lifting Equipment","Lifting equipment"],["Trailers","Trailer"],["Agricultural Equipment","Agricultural equipment"],["CAT & Genny","CAT & Genny calibration equipment"]].map(([label,value])=><button key={value} className={`nav-item ${categoryFilter===value?"active":""}`} style={{fontSize:13,padding:"7px 9px"}} onClick={()=>{setCategoryFilter(value);setPage("Plant register");setMobileNav(false)}}>{label}</button>)}</div>}</div>:<button key={label} onClick={()=>{setPage(label);setMobileNav(false)}} className={`nav-item ${page===label?"active":""}`}><Icon size={18}/><span>{label}</span></button>)}
      <div className="sidebar-bottom"><div className="online-dot"/> Online workspace <small>v0.1 prototype</small></div>
    </aside>
    {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">JT Utilities <span>/</span> {title}</div><div className="top-actions"><button className="icon-btn" onClick={()=>action("No new notifications in this prototype.")}><Bell size={18}/></button><div className="avatar">JT</div></div></header>
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">JT UTILITIES LTD · PLANT MANAGEMENT</div><h1>{title}</h1><p>Wednesday, 11 November 2026 · Central workshop</p></div><button className="primary" onClick={()=>setShowNew(true)}><Plus size={17}/> New {page==="Workshop job cards"?"job card":"record"}</button></div>
        {notice&&<div className="notice">{notice}</div>}
        {page==="Dashboard"&&<>
          <div className="welcome"><div><span className="eyebrow light">JT UTILITIES FLEET</span><h2>Your plant, ready for the work ahead.</h2><p>A live overview of the equipment your teams rely on every day.</p></div><div className="welcome-icon"><Truck size={58}/></div></div>
          <div className="stats">
            {[
              ["Total assets",assetsLoading?"…":String(assets.length),"All vehicles, plant and equipment",Truck],
              ["Available",assetsLoading?"…":String(availableCount),"Ready for your own teams",CheckCircle2],
              ["In use",assetsLoading?"…":String(assets.filter(a=>a.status==="In use").length),"Currently allocated to work",Activity],
              ["In workshop",assetsLoading?"…":String(assets.filter(a=>a.status==="In workshop").length),"Being worked on",Wrench],
              ["Out of service",assetsLoading?"…":String(assets.filter(a=>a.status==="Out of service").length),"Requires attention",AlertTriangle]
            ].map(([label,value,sub,Icon]:any)=><button type="button" className="stat" key={label} style={{textAlign:"left",cursor:"pointer"}} onClick={()=>{setAssetFilter(label==="Total assets"?"All":label);setCategoryFilter("All");setPage("Plant register");}}><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{sub} · Click to view</small></button>)}
          </div>
          {assetsError&&<p className="auth-error">{assetsError}</p>}
          <div className="panel-head" style={{marginTop:24,marginBottom:12}}><div><h3>Inspection and examination schedule</h3><p>See what is overdue and what is coming up across your fleet.</p></div><button className="text-btn" onClick={()=>setPage("Inspection calendar")}>Open inspection calendar</button></div>
          <PmiDashboard supabase={supabase} onOpenCalendar={()=>setPage("Inspection calendar")}/>
          <Calendar supabase={supabase}/>
          <section className="panel"><div className="panel-head"><div><h3>Workshop and maintenance</h3><p>Repairs, defects and servicing for your own fleet.</p></div><button className="text-btn" onClick={()=>setPage("Workshop job cards")}>Workshop job cards</button></div><p className="muted">Live job-card and plant-check activity will appear here once those workflows are connected. No sample activity is shown.</p></section>
        </>}
        {page==="Plant register"&&<AssetManager supabase={supabase} isAdmin={isAdmin} categoryFilter={categoryFilter}/>}
        {page==="Projects"&&<Projects supabase={supabase}/>}
        {page==="Workshop job cards"&&<section className="panel"><div className="toolbar"><div><h3>Workshop work queue</h3><p>Central workshop · All maintenance requests</p></div></div><p className="muted">No live job-card records are connected yet. This page will show genuine job cards once the job-card database permissions and workflow are configured.</p></section>}
        {page==="Inspection calendar"&&<Calendar supabase={supabase}/>}
        {page==="MOT checker"&&<MotChecker supabase={supabase}/>}
        {page==="Plant checks"&&<Checks action={action}/>}
        {page==="LOLER & certificates"&&<LolerManager supabase={supabase} isAdmin={isAdmin}/> }
        {page==="Maintenance history"&&<section className="panel"><h3>Maintenance history</h3><p className="muted">A chronological record of work, inspections, parts and approvals for each asset.</p><p className="muted">No live maintenance history records are connected yet.</p></section>}
        {page==="Users & sign-offs"&&<UsersPanel action={action}/>}
        {page==="Reports"&&<Reports/>}
      </div>
    </main>
    {showNew&&<div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">WORKSHOP</span><h2>Raise a job card</h2></div><button className="icon-btn" onClick={()=>setShowNew(false)}><X/></button></div><label>Plant asset<select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})}><option value="">Select asset</option>{assets.map(a=><option key={a.id}>{a.id} – {a.name}</option>)}</select></label><label>Fault / work required<textarea value={form.fault} onChange={e=>setForm({...form,fault:e.target.value})} placeholder="Describe the fault or maintenance required..."/></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Normal</option><option>High</option><option>Critical</option></select></label><div className="modal-actions"><button className="secondary" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary" onClick={()=>{if(!form.asset||!form.fault.trim()){action("Select an asset and enter the fault description.");return;}action("Prototype only: job card form validated. Connect the database to save live job cards.");setShowNew(false);setForm({asset:"",fault:"",priority:"Normal"});}}>Create job card <ArrowUpRight size={16}/></button></div><p className="fine">Live saving, user identity and audit history require the configured backend.</p></div></div>}
    </div>;
}
function AssetTable({rows}:{rows:Asset[]}) {return <div className="table-wrap"><table><thead><tr><th>Asset code</th><th>Description</th><th>Registration</th><th>Location</th><th>Hours</th><th>Next LOLER Examination</th><th>Status</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><b>{a.id}</b></td><td>{a.name}<small>{a.category}</small></td><td>{a.registration}</td><td>{a.location}</td><td>{a.hours}</td><td>{a.loler}</td><td><Tag tone={a.status==="Available"?"green":a.status==="In workshop"?"amber":"red"}>{a.status}</Tag></td></tr>)}</tbody></table>{!rows.length&&<p className="empty">No matching assets.</p>}</div>}
type CalendarEvent = { id:string; date:string; kind:"examined"|"due"|"reminder"|"planned"; assetCode:string; description:string };
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
        .select("id,asset_code,registration,description,pmi_next_due,pmi_last_completed,mot_due,tacho_calibration_due")
        .in("asset_code",["R500 JTU","WP63 PFD","C545766"]);
      if(hgvError){if(!cancelled){setError("Could not load HGV compliance dates: "+hgvError.message);setLoading(false);}return;}
      // Include MOT expiry dates already saved by the existing DVSA integration.
      const {data:dvsaRecords}=await supabase.from("vehicle_mot_records").select("asset_id,registration,expiry_date");
      const savedDvsaIds=new Set<string>();
      for(const record of dvsaRecords||[]){
        if(!record.expiry_date)continue;
        savedDvsaIds.add(record.asset_id);
        mapped.push({id:record.asset_id+"-dvsa-mot",date:record.expiry_date.slice(0,10),kind:"due",assetCode:(record.registration||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),description:"DVSA MOT expiry · Verified MOT record"});
        for(const days of [60,30,14]){
          const reminder=new Date(record.expiry_date.slice(0,10)+"T00:00:00Z");
          reminder.setUTCDate(reminder.getUTCDate()-days);
          mapped.push({id:record.asset_id+"-dvsa-mot-"+days,date:reminder.toISOString().slice(0,10),kind:"reminder",assetCode:(record.registration||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),description:"DVSA MOT reminder · "+days+" days before "+record.expiry_date.slice(0,10)});
        }
      }
      for(const hgv of hgvs||[]){
        const code=hgv.asset_code==="C545766"?"C545766 · Trailer":hgv.registration||hgv.asset_code;
        const prefix=hgv.asset_code==="C545766"?"Trailer":"HGV";
        const add=(date:string|null,kind:"examined"|"due",label:string)=>{
          if(date) mapped.push({id:hgv.id+"-"+label,date:date.slice(0,10),kind,assetCode:code,description:label+" · "+(hgv.description||"HGV")});
        };
        add(hgv.pmi_last_completed,"examined",prefix+" PMI inspection completed");
        add(hgv.pmi_next_due,"due",prefix+" PMI inspection due");
        for(const planned of plannedPmiDates(hgv.pmi_next_due,today,13)){
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
  const selectedEvents=(byDate.get(selectedDate)||[]).slice().sort((a,b)=>a.kind===b.kind? a.assetCode.localeCompare(b.assetCode):a.kind==="due"?-1:1);
  const dueEvents=events.filter(event=>event.kind==="due");
  const motReminders=events.filter(event=>event.kind==="reminder" && event.date<=today && event.description.includes("MOT reminder"));
  const currentMotReminders=motReminders.filter(event=>{const expiry=event.description.split(" before ")[1];return expiry>=today;});
  const overdueCount=dueEvents.filter(event=>event.date<today).length;
  const upcomingCount=dueEvents.filter(event=>event.date>=today).length;
  const formatDate=(value:string)=>{const [y,m,d]=value.split("-");return d+" "+m+" "+y;};
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
    <div className="calendar-legend" style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:12,fontSize:12}}>
      <span><i style={{display:"inline-block",width:9,height:9,borderRadius:9,background:"#b91c1c",marginRight:6}}/>Overdue due date</span>
      <span><i style={{display:"inline-block",width:9,height:9,borderRadius:9,background:"#d97706",marginRight:6}}/>Upcoming due date</span>
      <span><i style={{display:"inline-block",width:9,height:9,borderRadius:9,background:"#2563eb",marginRight:6}}/>Completed examination</span>
    </div>
    <div className="calendar-grid">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><b key={day}>{day}</b>)}
      {Array.from({length:firstDay},(_,index)=><div key={"blank-"+index}/>)}
      {Array.from({length:daysInMonth},(_,index)=>index+1).map(day=>{
        const key=dateKey(day);const dayEvents=byDate.get(key)||[];
        return <button type="button" key={key} className="day" onClick={()=>setSelectedDate(key)} style={{textAlign:"left",border:selectedDate===key?"2px solid #b91c1c":undefined,background:key===today?"#fff7f7":undefined,cursor:"pointer",minHeight:76}}>
          <span>{day}</span>
          {dayEvents.slice(0,3).map(event=><small key={event.id} style={{display:"block",marginTop:3,padding:"3px 4px",borderRadius:4,fontSize:9,background:event.kind==="examined"?"#dbeafe":event.kind==="reminder"?"#fef3c7":event.date<today?"#fee2e2":"#fef3c7",color:event.kind==="examined"?"#1d4ed8":event.kind==="reminder"?"#92400e":event.date<today?"#991b1b":"#92400e"}}>{event.kind==="reminder"?"MOT reminder":event.kind==="planned"?"PMI planned":event.description.includes("MOT")?"MOT due":event.kind==="examined"?"Completed":event.description.includes("PMI")?"PMI due":event.description.includes("tacho")?"Tacho due":event.date<today?"LOLER overdue":"LOLER due"} · {event.assetCode}</small>)}
          {dayEvents.length>3&&<small>+{dayEvents.length-3} more</small>}
        </button>;
      })}
    </div>
    <div style={{marginTop:18,borderTop:"1px solid #e5e5e8",paddingTop:16}}>
      <div className="panel-head"><div><h3>{selectedDate? "Events for "+formatDate(selectedDate):"Select a date"}</h3><p>{selectedDate?"Recorded examination dates and due dates":"Choose a day on the calendar to see its records"}</p></div></div>
      {selectedDate&&selectedEvents.length===0&&<p className="muted">No compliance events recorded for this date.</p>}
      {selectedEvents.map(event=><div className="attention" key={event.id}><div className="avatar">{event.kind==="examined"?"EX":event.kind==="reminder"?"MOT":event.kind==="planned"?"PMI":"DU"}</div><div><b>{event.assetCode} · {event.description}</b><small>{event.kind==="examined"?"Examination completed":event.kind==="reminder"?"MOT advance reminder":event.kind==="planned"?"Projected PMI date — not booked":"Compliance due"} · {formatDate(event.date)}</small></div><span className={"tag "+(event.kind==="examined"?"blue":event.kind==="reminder"?"amber":event.date<today?"red":"amber")}>{event.kind==="examined"?"Completed":event.kind==="reminder"?"Reminder":event.kind==="planned"?"Planned":event.date<today?"Overdue":"Due"}</span></div>)}
    </div>
    {loading&&<p className="muted">Loading live compliance dates…</p>}
    {!loading&&!error&&events.length===0&&<p className="muted">No compliance dates are currently recorded.</p>}
  </section>;
}
function Projects({supabase}:{supabase:SupabaseClient}) {
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
  async function load(){
    setLoading(true);setError("");
    const [p,a]=await Promise.all([
      supabase.from("projects").select("*").order("project_name"),
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
  const activeAssetIds=new Set(allocations.map(a=>a.asset_id));
  const availableAssets=assets.filter(a=>!activeAssetIds.has(a.id));
  const fmt=(d:string)=>new Date(d).toLocaleDateString("en-GB");
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
        <div className="panel-head"><div><h3>{project.project_name}</h3><p>{[project.site_address,project.site_postcode].filter(Boolean).join(", ")||"Site location not yet added"} · {project.status.replace("_"," ")}</p></div><Tag tone={project.status==="active"?"green":project.status==="completed"?"neutral":"amber"}>{project.status}</Tag></div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13,color:"#666",marginBottom:12}}><span>{rows.length} items allocated</span>{project.client_name&&<span>Client: {project.client_name}</span>}{project.start_date&&<span>Start: {fmt(project.start_date)}</span>}</div>
        {rows.map(row=>{const asset=assets.find(a=>a.id===row.asset_id);return <div className="attention" key={row.id}><div className="avatar"><Truck size={16}/></div><div><b>{asset?.asset_code||"Asset"} · {asset?.description||"Equipment"}</b><small>{asset?.category||""} · Allocated {fmt(row.allocated_at)}</small></div><button className="secondary" onClick={()=>void release(row.id)}>Release</button></div>;})}
        {selectedProject===project.id?<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><select value={assetToAllocate} onChange={e=>setAssetToAllocate(e.target.value)}><option value="">Choose available equipment</option>{availableAssets.map(a=><option key={a.id} value={a.id}>{a.asset_code} – {a.description}</option>)}</select><input value={allocationNote} onChange={e=>setAllocationNote(e.target.value)} placeholder="Allocation note (optional)"/><button className="primary" disabled={!assetToAllocate} onClick={()=>void allocate()}>Allocate</button><button className="secondary" onClick={()=>setSelectedProject(null)}>Cancel</button></div>:<button className="secondary" style={{marginTop:10}} onClick={()=>{setSelectedProject(project.id);setAssetToAllocate("");}}> <Plus size={15}/> Allocate equipment</button>}
      </div>;
    })}
    {!loading&&<p className="muted" style={{marginTop:14}}>Available to allocate: {availableAssets.length} assets. Each asset can only be allocated to one active project at a time. Previous allocations remain in the database when equipment is released.</p>}
  </section>;
}

function Checks({action}:{action:(s:string)=>void}) {const items=["Engine oil and coolant","Brakes and steering","Tyres / tracks","Hydraulic hoses and leaks","Lights and warning devices","Safety equipment","General condition"];const [answers,setAnswers]=useState<Record<string,string>>({});return <section className="panel"><div className="panel-head"><div><h3>Operator plant check</h3><p>Daily plant check template — not yet connected to live submissions</p></div><Tag tone="blue">Draft</Tag></div><p className="muted">This checklist is a template only. Live asset selection, individual sign-off and submission are not yet connected.</p>{items.map(i=><div className="check-row" key={i}><b>{i}</b><div><button className={answers[i]==="Pass"?"choice selected": "choice"} onClick={()=>setAnswers({...answers,[i]:"Pass"})}>Pass</button><button className={answers[i]==="Fail"?"choice fail selected": "choice fail"} onClick={()=>setAnswers({...answers,[i]:"Fail"})}>Fail</button><button className={answers[i]==="N/A"?"choice selected": "choice"} onClick={()=>setAnswers({...answers,[i]:"N/A"})}>N/A</button></div></div>)}<label>Comments<textarea placeholder="Record observations or defects..."/></label><button className="primary" onClick={()=>action("Demo form only. Live authenticated submission and defect escalation require backend setup.")}>Submit check for sign-off</button></section>}
function UsersPanel({action}:{action:(s:string)=>void}) {return <section className="panel"><div className="panel-head"><div><h3>Users and permissions</h3><p>Proposed role structure</p></div><Tag tone="blue">Access control</Tag></div>{["Plant Manager","Operator / Driver","Workshop Mechanic","Inspector","Director / Administrator"].map((r,i)=><div className="attention" key={r}><div className="avatar">{r.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><b>{r}</b><small>{["Fleet, schedules, jobs and approvals","Assigned plant checks and defects","Assigned jobs, labour and parts","Assigned examinations and reports","Read-only oversight and management reports"][i]}</small></div><Tag>Role</Tag></div>)}<button className="primary" onClick={()=>action("User administration will be activated with Supabase Auth and role policies.")}><Plus size={16}/> Add user</button></section>}
function Reports(){return <section className="panel"><h3>Management reporting</h3><p className="muted">Example reporting categories for the first release.</p><div className="report-grid">{["Inspection compliance","LOLER due and overdue","Workshop workload","Plant downtime","Maintenance costs","User sign-off audit"].map((x,i)=><div className="report-card" key={x}><FileText/><b>{x}</b><small>Report template</small></div>)}</div></section>}


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
      .from("profiles").select("full_name, role, active").eq("id", userId).single();
    if (profileError || !data || !data.active) {
      await supabase.auth.signOut();
      setError("Your login is not linked to an active PlantTrack profile. Please contact the Plant Manager.");
      setSessionReady(true);
      return;
    }
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
  return <><div className="signed-in-strip"><span>Signed in: <b>{displayName}</b> · {roleName}</span><button onClick={signOut}>Sign out</button></div><Dashboard supabase={supabase} isAdmin={roleName === "admin"} /></>;
}
