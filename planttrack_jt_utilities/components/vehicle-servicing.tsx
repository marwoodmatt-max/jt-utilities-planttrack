"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, RefreshCw, Wrench } from "lucide-react";

type Vehicle = { id:string; asset_code:string; description:string; registration:string|null; hour_meter:number|string|null };
type ServiceRecord = {
  id:string; asset_id:string; service_date:string; mileage_at_service:number|string;
  work_done:string; parts_used:string|null; invoice_reference:string|null;
  next_service_date:string|null; next_service_mileage:number|string|null;
  created_at:string; created_by:string;
};
type FormState = {
  asset_id:string; service_date:string; mileage_at_service:string; work_done:string;
  parts_used:string; invoice_reference:string; next_service_date:string; next_service_mileage:string;
};
const today = () => {
  const date = new Date();
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
};
const blankForm = ():FormState => ({
  asset_id:"", service_date:today(), mileage_at_service:"", work_done:"",
  parts_used:"", invoice_reference:"", next_service_date:"", next_service_mileage:""
});
const dateLabel = (value:string|null) => value ? new Date(value+"T00:00:00").toLocaleDateString("en-GB") : "—";
const numberLabel = (value:number|string|null) => value == null || value === "" ? "—" : Number(value).toLocaleString("en-GB");

export default function VehicleServicing({supabase}:{supabase:SupabaseClient}) {
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [records,setRecords]=useState<ServiceRecord[]>([]);
  const [form,setForm]=useState<FormState>(blankForm);
  const [showForm,setShowForm]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState("All vehicles");
  const [canAdd,setCanAdd]=useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [{data:assetRows,error:assetError},{data:serviceRows,error:serviceError},{data:userData}] = await Promise.all([
      supabase.from("assets").select("id,asset_code,description,registration,hour_meter").ilike("category","Vehicle").order("asset_code"),
      supabase.from("vehicle_services").select("id,asset_id,service_date,mileage_at_service,work_done,parts_used,invoice_reference,next_service_date,next_service_mileage,created_at,created_by").order("service_date",{ascending:false}).order("created_at",{ascending:false}),
      supabase.auth.getUser()
    ]);
    if(assetError || serviceError) {
      setError("Could not load vehicle servicing: "+(assetError?.message || serviceError?.message));
      setVehicles([]); setRecords([]); setLoading(false); return;
    }
    setVehicles((assetRows||[]) as Vehicle[]);
    setRecords((serviceRows||[]) as ServiceRecord[]);
    if(userData.user) {
      const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",userData.user.id).maybeSingle();
      setCanAdd(Boolean(profile?.active && ["admin","plant_manager","mechanic"].includes(profile.role)));
    }
    setLoading(false);
  },[supabase]);

  useEffect(()=>{ void load(); },[load]);

  const visibleRecords=useMemo(()=>records.filter(record=>{
    if(filter==="All vehicles") return true;
    return vehicles.find(vehicle=>vehicle.id===record.asset_id)?.id===filter;
  }),[records,vehicles,filter]);

  async function saveRecord(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const mileage=Number(form.mileage_at_service);
    const nextMileage=form.next_service_mileage.trim()===""?null:Number(form.next_service_mileage);
    if(!form.asset_id || !form.service_date || !Number.isSafeInteger(mileage) || mileage<0 || !form.work_done.trim()) {
      setError("Choose a vehicle, enter the service date and a whole-number mileage, and describe the work carried out."); return;
    }
    if(nextMileage!==null && (!Number.isSafeInteger(nextMileage) || nextMileage<mileage)) {
      setError("The next service mileage must be a whole number at or above the mileage recorded for this service."); return;
    }
    if(form.next_service_date && form.next_service_date<form.service_date) {
      setError("The next service date cannot be before the service date."); return;
    }
    setSaving(true);
    const {data:userData,error:userError}=await supabase.auth.getUser();
    if(userError || !userData.user) { setError("Your login has expired. Please sign in again."); setSaving(false); return; }
    const {error:insertError}=await supabase.from("vehicle_services").insert({
      asset_id:form.asset_id, service_date:form.service_date, mileage_at_service:mileage,
      work_done:form.work_done.trim(), parts_used:form.parts_used.trim()||null,
      invoice_reference:form.invoice_reference.trim()||null,
      next_service_date:form.next_service_date||null, next_service_mileage:nextMileage,
      created_by:userData.user.id
    });
    if(insertError) { setError("Could not save service record: "+insertError.message); setSaving(false); return; }
    setNotice("Service record saved and added to the vehicle history.");
    setForm(blankForm()); setShowForm(false); setSaving(false);
    await load();
  }

  const vehicleFor=(id:string)=>vehicles.find(vehicle=>vehicle.id===id);
  return <section className="panel">
    <div className="panel-head">
      <div><h3>Vehicle servicing</h3><p>Service records and maintenance history for company vehicles</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="secondary" type="button" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button>
        {canAdd&&<button className="primary" type="button" onClick={()=>{setForm(blankForm());setShowForm(v=>!v)}}><Plus size={16}/> Add service record</button>}
      </div>
    </div>
    <div className="stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",marginBottom:18}}>
      <div className="stat"><div className="stat-top"><span>Vehicles</span><Wrench size={18}/></div><strong>{loading?"…":vehicles.length}</strong><small>In the vehicle register</small></div>
      <div className="stat"><div className="stat-top"><span>Service records</span></div><strong>{loading?"…":records.length}</strong><small>Saved service history entries</small></div>
      <div className="stat"><div className="stat-top"><span>Next services set</span></div><strong>{loading?"…":records.filter(record=>record.next_service_date||record.next_service_mileage!=null).length}</strong><small>Records with a next due point</small></div>
    </div>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    {showForm&&<form onSubmit={saveRecord} className="panel" style={{background:"#fafafa",marginBottom:18}}>
      <div className="panel-head"><div><h3>Record a vehicle service</h3><p>Enter the details from the completed service</p></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
        <label>Vehicle<select required value={form.asset_id} onChange={event=>{const vehicle=vehicles.find(item=>item.id===event.target.value);setForm(current=>({...current,asset_id:event.target.value,mileage_at_service:vehicle?.hour_meter==null?"":String(vehicle.hour_meter)}))}}><option value="">Select a vehicle</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.asset_code} · {vehicle.description}{vehicle.registration?" · "+vehicle.registration:""}</option>)}</select></label>
        <label>Service date<input required type="date" value={form.service_date} onChange={event=>setForm(current=>({...current,service_date:event.target.value}))}/></label>
        <label>Mileage at service<input required type="number" min="0" step="1" value={form.mileage_at_service} onChange={event=>setForm(current=>({...current,mileage_at_service:event.target.value}))} placeholder="e.g. 45210"/></label>
        <label>Next service due date<input type="date" min={form.service_date} value={form.next_service_date} onChange={event=>setForm(current=>({...current,next_service_date:event.target.value}))}/></label>
        <label>Next service due mileage<input type="number" min={form.mileage_at_service||"0"} step="1" value={form.next_service_mileage} onChange={event=>setForm(current=>({...current,next_service_mileage:event.target.value}))} placeholder="Optional"/></label>
        <label>Invoice / job reference<input value={form.invoice_reference} onChange={event=>setForm(current=>({...current,invoice_reference:event.target.value}))} placeholder="Optional reference"/></label>
      </div>
      <label style={{display:"block",marginTop:12}}>Work carried out<textarea required rows={3} value={form.work_done} onChange={event=>setForm(current=>({...current,work_done:event.target.value}))} placeholder="Describe the service and work completed..."/></label>
      <label style={{display:"block",marginTop:12}}>Parts used<textarea rows={2} value={form.parts_used} onChange={event=>setForm(current=>({...current,parts_used:event.target.value}))} placeholder="Oil, filters, parts fitted, etc. (optional)"/></label>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}>
        <button className="secondary" type="button" onClick={()=>setShowForm(false)}>Cancel</button>
        <button className="primary" type="submit" disabled={saving}>{saving?"Saving…":"Save service record"}</button>
      </div>
    </form>}
    <div className="toolbar" style={{marginBottom:12}}>
      <div><h3>Service history</h3><p>Newest services first</p></div>
      <select value={filter} onChange={event=>setFilter(event.target.value)} style={{maxWidth:260}}><option value="All vehicles">All vehicles</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.asset_code}</option>)}</select>
    </div>
    {loading?<p className="muted">Loading vehicle service history…</p>:visibleRecords.length===0?<p className="muted">{vehicles.length===0?"No vehicles are currently listed in the asset register.":"No service records have been saved"+(filter==="All vehicles"?".":" for this vehicle yet.")}</p>:<div className="table-wrap"><table><thead><tr><th>Service date</th><th>Vehicle</th><th>Mileage</th><th>Work carried out</th><th>Parts used</th><th>Next service</th><th>Reference</th></tr></thead><tbody>{visibleRecords.map(record=>{const vehicle=vehicleFor(record.asset_id);return <tr key={record.id}><td>{dateLabel(record.service_date)}</td><td><b>{vehicle?.asset_code||"Vehicle"}</b><small>{vehicle?.description||"Asset details unavailable"}</small></td><td>{numberLabel(record.mileage_at_service)} mi</td><td style={{whiteSpace:"pre-wrap",minWidth:220}}>{record.work_done}</td><td style={{whiteSpace:"pre-wrap"}}>{record.parts_used||"—"}</td><td>{record.next_service_date?dateLabel(record.next_service_date):"—"}{record.next_service_mileage!=null&&<small>{numberLabel(record.next_service_mileage)} mi</small>}</td><td>{record.invoice_reference||"—"}</td></tr>})}</tbody></table></div>}
    {!canAdd&&!loading&&<p className="fine" style={{marginTop:12}}>You can view service history. Adding records is available to workshop mechanics and plant managers.</p>}
  </section>;
}
