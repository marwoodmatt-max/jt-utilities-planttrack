"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, RefreshCw, Save, X } from "lucide-react";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

type Row = {
  id: string; asset_id: string; examination_type: string; next_due: string | null;
  examined_at: string | null; competent_person: string | null; report_reference: string | null;
};
type Asset = { id: string; asset_code: string; description: string };
type ImportRow={file:File;asset_id:string;examined_at:string;next_due:string;competent_person:string;report_reference:string;notes:string;state:string};
function BulkLolerImport({supabase,assets,onImported}:{supabase:SupabaseClient;assets:Asset[];onImported:()=>Promise<void>}){
 const [items,setItems]=useState<ImportRow[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const setField=(index:number,key:keyof ImportRow,value:string)=>setItems(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
 const importAll=async()=>{
  if(busy)return;
  setBusy(true);setMessage("");
  let imported=0;
  for(let i=0;i<items.length;i++){
   const item=items[i];
   if(item.state==="Imported")continue;
   if(!item.asset_id||!item.examined_at||!item.next_due||!item.competent_person.trim()||!item.report_reference.trim()){setField(i,"state","Missing required information");continue;}
   if(item.next_due<item.examined_at){setField(i,"state","Due date is before examination");continue;}
   const {data:existing,error:checkError}=await supabase.from("examinations").select("id").eq("asset_id",item.asset_id).eq("report_reference",item.report_reference.trim()).ilike("examination_type","%LOLER%").limit(1);
   if(checkError){setField(i,"state",checkError.message);continue;}
   if(existing?.length){setField(i,"state","Duplicate certificate — not imported");continue;}
   const safeName=item.file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
   const path=item.asset_id+"/"+crypto.randomUUID()+"-"+safeName;
   const upload=await supabase.storage.from("asset-documents").upload(path,item.file,{contentType:"application/pdf",upsert:false});
   if(upload.error){setField(i,"state","PDF upload failed: "+upload.error.message);continue;}
   const result=await supabase.rpc("import_verified_loler",{p_asset:item.asset_id,p_exam:item.examined_at,p_due:item.next_due,p_examiner:item.competent_person.trim(),p_reference:item.report_reference.trim(),p_path:path,p_notes:item.notes});
   if(result.error){setField(i,"state","Register update failed: "+result.error.message);continue;}
   imported++;setField(i,"state","Imported");
  }
  setBusy(false);setMessage(imported+" certificate(s) imported. Review any rows not marked Imported.");if(imported)await onImported();
 };
 return <div style={{border:"1px solid #cbd5e1",borderRadius:10,padding:16,marginBottom:20}}>
  <h4>Bulk import handwritten LOLER certificates</h4>
  <p className="muted">Select multiple original PDFs. Review and enter the details from each certificate before importing. Handwriting is not automatically read by this screen; never guess a date, asset or examination result.</p>
  <label>Choose PDF certificates<input type="file" accept="application/pdf,.pdf" multiple onChange={e=>{const files=Array.from(e.target.files||[]).filter(file=>file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"));setItems(files.map(file=>({file,asset_id:"",examined_at:"",next_due:"",competent_person:"",report_reference:"",notes:"",state:"Ready for review"})));setMessage("");}}/></label>
  {items.map((item,i)=><div key={i} style={{borderTop:"1px solid #ddd",padding:"14px 0",display:"grid",gap:8}}>
   <strong>{i+1}. {item.file.name}</strong>
   <label>Match asset<select value={item.asset_id} onChange={e=>setField(i,"asset_id",e.target.value)}><option value="">Select verified asset</option>{assets.map(a=><option key={a.id} value={a.id}>{a.asset_code} — {a.description}</option>)}</select></label>
   <label>Certificate number<input value={item.report_reference} onChange={e=>setField(i,"report_reference",e.target.value)}/></label>
   <label>Examination date<input type="date" value={item.examined_at} onChange={e=>setField(i,"examined_at",e.target.value)}/></label>
   <label>Next examination due<input type="date" value={item.next_due} onChange={e=>setField(i,"next_due",e.target.value)}/></label>
   <label>Competent examiner<input value={item.competent_person} onChange={e=>setField(i,"competent_person",e.target.value)}/></label>
   <label>Defects / remarks / discrepancies<textarea value={item.notes} onChange={e=>setField(i,"notes",e.target.value)}/></label>
   <small role="status">{item.state}</small>
  </div>)}
  {items.length>0&&<button className="primary" disabled={busy} onClick={()=>void importAll()}>{busy?"Importing…":"Import verified certificates and PDFs"}</button>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
export default function LolerManager({ supabase, isAdmin }: { supabase: SupabaseClient; isAdmin: boolean }) {
  const [rows,setRows]=useState<Row[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<string|null>(null);
  const [form,setForm]=useState({next_due:"",examined_at:"",competent_person:"",report_reference:""});
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function load() {
    setLoading(true); setError("");
    const [ex,as]=await Promise.all([
      supabase.from("examinations").select("id,asset_id,examination_type,next_due,examined_at,competent_person,report_reference").ilike("examination_type","%LOLER%").order("next_due"),
      supabase.from("assets").select("id,asset_code,description").order("asset_code")
    ]);
    if(ex.error||as.error) setError("Could not load LOLER records: "+(ex.error||as.error)?.message);
    else { setRows((ex.data||[]) as Row[]); setAssets((as.data||[]) as Asset[]); }
    setLoading(false);
  }
  useEffect(()=>{void load();},[supabase]);
  const assetMap=new Map(assets.map(a=>[a.id,a]));
  function start(row:Row) {
    setEditing(row.id); setMessage(""); setError("");
    setForm({next_due:row.next_due||"",examined_at:row.examined_at||"",competent_person:row.competent_person||"",report_reference:row.report_reference||""});
  }
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!isAdmin||!editing||saving)return;
    setSaving(true);setError("");setMessage("");
    const result=await supabase.from("examinations").update({
      next_due:form.next_due||null, examined_at:form.examined_at||null,
      competent_person:form.competent_person.trim()||null, report_reference:form.report_reference.trim()||null
    }).eq("id",editing);
    if(result.error)setError("Could not save changes: "+result.error.message);
    else {setMessage("LOLER record updated.");setEditing(null);await load();}
    setSaving(false);
  }
  return <section className="panel">
    <div className="panel-head"><div><h3>LOLER examination dates</h3><p>{rows.length} recorded examinations · {isAdmin?"Admin editing enabled":"View only"}</p></div><button className="secondary" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>
    {message&&<div className="notice" role="status">{message}</div>}{error&&<div className="auth-error" role="alert">{error}</div>}
    {editing&&isAdmin&&<form onSubmit={save} style={{border:"1px solid #e5e5e8",borderRadius:8,padding:16,marginBottom:18,background:"#fafafa"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span className="eyebrow">ADMIN ONLY</span><h3>Edit LOLER record</h3></div><button type="button" className="icon-btn" onClick={()=>setEditing(null)}><X size={18}/></button></div>
      <label style={{display:"block",margin:"12px 0"}}>Next examination due<input type="date" required value={form.next_due} onChange={e=>setForm({...form,next_due:e.target.value})}/></label>
      <label style={{display:"block",margin:"12px 0"}}>Actual examination date (leave blank if not known)<input type="date" value={form.examined_at} onChange={e=>setForm({...form,examined_at:e.target.value})}/></label>
      <label style={{display:"block",margin:"12px 0"}}>Competent person<input value={form.competent_person} onChange={e=>setForm({...form,competent_person:e.target.value})}/></label>
      <label style={{display:"block",margin:"12px 0"}}>Certificate / report reference<input value={form.report_reference} onChange={e=>setForm({...form,report_reference:e.target.value})}/></label>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={saving}><Save size={15}/>{saving?"Saving…":"Save changes"}</button></div>
      <p className="fine">Only enter an examination date, competent person or report reference when verified by the certificate or examination record. Changes are audit logged.</p>
    </form>}
    {isAdmin&&<BulkLolerImport supabase={supabase} assets={assets} onImported={load}/>}
    {loading?<p className="muted">Loading LOLER records…</p>:<div className="table-wrap"><table><thead><tr><th>Asset</th><th>Next examination due</th><th>Examination date</th><th>Competent person</th><th>Report reference</th>{isAdmin&&<th>Action</th>}</tr></thead><tbody>
      {rows.map(r=>{const a=assetMap.get(r.asset_id);return <tr key={r.id}><td><b>{a?.asset_code||"Asset not found"}</b><small>{a?.description||r.examination_type}</small></td><td>{formatDate(r.next_due)}</td><td>{formatDate(r.examined_at)}</td><td>{r.competent_person||"Not recorded"}</td><td>{r.report_reference||"Not recorded"}</td>{isAdmin&&<td><button className="secondary" onClick={()=>start(r)}><Pencil size={14}/> Edit</button></td>}</tr>;})}
    </tbody></table>{!rows.length&&<p className="empty">No LOLER records found.</p>}</div>}
  </section>;
}
