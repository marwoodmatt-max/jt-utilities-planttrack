"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CarFront, RefreshCw, Search, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

type Vehicle = { id:string; asset_code:string; description:string; registration:string|null; manufacturer:string|null; model:string|null };
type MotTest = { completedDate?:string; expiryDate?:string; testResult?:string; odometerValue?:string; odometerUnit?:string; motTestNumber?:string; defects?:{text?:string;type?:string;dangerous?:boolean}[] };
type MotRecord = { registration?:string; make?:string; model?:string; firstUsedDate?:string; fuelType?:string; primaryColour?:string; motTests?:MotTest[] };

function date(value?:string) {
  if (!value) return "—";
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

export default function MotHistory({supabase}:{supabase:SupabaseClient}) {
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [selected,setSelected]=useState("");
  const [loadingVehicles,setLoadingVehicles]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [record,setRecord]=useState<MotRecord|null>(null);
  const [lastRegistration,setLastRegistration]=useState("");
  const [saveNotice,setSaveNotice]=useState("");

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const {data,error}=await supabase.from("assets")
        .select("id,asset_code,description,registration,manufacturer,model")
        .eq("category","Vehicle").not("registration","is",null).order("asset_code");
      if(!alive)return;
      if(error)setError("Could not load registered vehicles: "+error.message);
      else {
        const rows=(data||[]) as Vehicle[];
        setVehicles(rows);
        if(rows.length)setSelected(rows[0].id);
      }
      setLoadingVehicles(false);
    })();
    return ()=>{alive=false;};
  },[supabase]);

  const vehicle=useMemo(()=>vehicles.find(v=>v.id===selected)||null,[vehicles,selected]);

  async function lookup() {
    if(!vehicle?.registration)return;
    setLoading(true);setError("");setSaveNotice("");setRecord(null);setLastRegistration(vehicle.registration);
    const {data,error}=await supabase.functions.invoke("dvsa-mot-lookup",{body:{registration:vehicle.registration}});
    if(error) {
      let message=error.message||"The MOT lookup could not be completed.";
      try { const body=await (error as any).context?.json?.(); if(body?.error)message=body.error; } catch {}
      setError(message);setLoading(false);return;
    }
    if(data?.error){setError(data.error);setLoading(false);return;}
    const result=data?.data;
    const records=Array.isArray(result)?result:Array.isArray(result?.vehicles)?result.vehicles:[result];
    const found=records.find((r:any)=>r&&typeof r==="object") as MotRecord|undefined;
    if(!found){setError("DVSA returned no MOT record for "+vehicle.registration+".");}
    else setRecord(found);
    setLoading(false);
  }

  const tests=Array.isArray(record?.motTests)?record!.motTests!.slice().sort((a,b)=>(b.completedDate||"").localeCompare(a.completedDate||"")):[];
  const latest=tests[0];
  const expiry=latest?.expiryDate;
  const isExpired=expiry ? new Date(expiry)<new Date(new Date().toDateString()) : false;

  return <section className="panel">
    <div className="panel-head"><div><h3>DVSA MOT history</h3><p>Look up official MOT test history for a vehicle in the JT Utilities register.</p></div><CarFront size={23}/></div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) auto",gap:10,alignItems:"end",maxWidth:760}}>
      <label style={{fontSize:13,fontWeight:700}}>Select vehicle
        <select value={selected} onChange={e=>{setSelected(e.target.value);setRecord(null);setError("");}} disabled={loadingVehicles||!vehicles.length} style={{display:"block",width:"100%",marginTop:6,padding:11,border:"1px solid #dcdce0",borderRadius:7,background:"#fff"}}>
          {loadingVehicles&&<option>Loading vehicles…</option>}
          {!loadingVehicles&&!vehicles.length&&<option value="">No vehicles with registrations found</option>}
          {vehicles.map(v=><option key={v.id} value={v.id}>{v.asset_code} · {v.registration} · {v.description}</option>)}
        </select>
      </label>
      <button className="primary" onClick={lookup} disabled={!vehicle||loading||loadingVehicles}><Search size={16}/>{loading?"Checking DVSA…":"Check MOT history"}</button>
    </div>
    {error&&<div className="auth-error" role="alert" style={{marginTop:16}}>{error}</div>}
    {loading&&<p className="muted" style={{marginTop:16}}>Contacting DVSA securely and retrieving MOT records…</p>}\n    {saveNotice&&<p className={saveNotice.startsWith("MOT result saved")?"notice":"auth-error"} role="status" style={{marginTop:14}}>{saveNotice}</p>}
    {record&&<div style={{marginTop:20}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center",borderBottom:"1px solid #eee",paddingBottom:14}}>
        <div><span className="eyebrow">DVSA VEHICLE RECORD</span><h3 style={{margin:"5px 0"}}>{record.registration||lastRegistration} · {record.make||vehicle?.manufacturer||""} {record.model||vehicle?.model||""}</h3><p className="muted">{[record.primaryColour,record.fuelType,record.firstUsedDate?"First used "+date(record.firstUsedDate):""].filter(Boolean).join(" · ")}</p></div>
        <span className={latest?(isExpired?"tag red":latest.testResult?.toLowerCase()==="pass"?"tag green":"tag amber"):"tag"}>{latest?(isExpired?"MOT expiry passed":latest.testResult||"Test recorded"):"No test details"}</span>
      </div>
      {latest&&<div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",marginTop:16}}>
        <div className="stat"><div className="stat-top"><span>Latest test</span><CheckCircle2 size={18}/></div><strong style={{fontSize:20}}>{date(latest.completedDate)}</strong><small>{latest.testResult||"Result not supplied"}</small></div>
        <div className="stat"><div className="stat-top"><span>MOT expiry</span><Clock3 size={18}/></div><strong style={{fontSize:20}}>{date(latest.expiryDate)}</strong><small>{isExpired?"Expiry date has passed":"Based on latest DVSA test"}</small></div>
        <div className="stat"><div className="stat-top"><span>Last recorded mileage</span><CarFront size={18}/></div><strong style={{fontSize:20}}>{latest.odometerValue||"—"}</strong><small>{latest.odometerUnit||"Unit not supplied"}</small></div>
      </div>}
      <h3 style={{marginTop:22}}>MOT test history ({tests.length})</h3>
      {!tests.length&&<p className="muted">DVSA returned the vehicle record but no MOT tests.</p>}
      {tests.map((test,i)=><article key={test.motTestNumber||test.completedDate||i} style={{padding:"14px 0",borderTop:"1px solid #eee"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>{date(test.completedDate)}</b><p className="muted" style={{margin:"4px 0"}}>Mileage: {test.odometerValue||"—"} {test.odometerUnit||""} · Test number: {test.motTestNumber||"—"}</p></div><span className={test.testResult?.toLowerCase()==="pass"?"tag green":"tag red"}>{test.testResult||"Result not supplied"}</span></div>
        {test.expiryDate&&<p className="muted" style={{margin:"4px 0"}}>Expiry date: {date(test.expiryDate)}</p>}
        {!!test.defects?.length&&<div style={{marginTop:8}}><b><AlertTriangle size={14} style={{display:"inline",verticalAlign:"-2px"}}/> Advisories and defects</b><ul style={{margin:"6px 0",paddingLeft:20}}>{test.defects.map((d,j)=><li key={j}>{d.text||"Defect"}{d.type?" ("+d.type+")":""}</li>)}</ul></div>}
      </article>)}
      <p className="fine">Information retrieved live from DVSA. Check the official record and certificate where a decision about vehicle use is required. This lookup does not automatically change PlantTrack asset status or mileage.</p>
    </div>}
    {!record&&!loading&&!error&&<p className="muted" style={{marginTop:18}}>Choose a registered vehicle and select Check MOT history. Results will appear here; nothing is changed in the asset register.</p>}
  </section>;
}
