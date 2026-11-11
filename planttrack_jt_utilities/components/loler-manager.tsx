"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, RefreshCw, Save, X } from "lucide-react";

type Row = {
  id: string; asset_id: string; examination_type: string; next_due: string | null;
  examined_at: string | null; competent_person: string | null; report_reference: string | null;
};
type Asset = { id: string; asset_code: string; description: string };
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
    {loading?<p className="muted">Loading LOLER records…</p>:<div className="table-wrap"><table><thead><tr><th>Asset</th><th>Next examination due</th><th>Examination date</th><th>Competent person</th><th>Report reference</th>{isAdmin&&<th>Action</th>}</tr></thead><tbody>
      {rows.map(r=>{const a=assetMap.get(r.asset_id);return <tr key={r.id}><td><b>{a?.asset_code||"Asset not found"}</b><small>{a?.description||r.examination_type}</small></td><td>{r.next_due||"Not recorded"}</td><td>{r.examined_at||"Not recorded"}</td><td>{r.competent_person||"Not recorded"}</td><td>{r.report_reference||"Not recorded"}</td>{isAdmin&&<td><button className="secondary" onClick={()=>start(r)}><Pencil size={14}/> Edit</button></td>}</tr>;})}
    </tbody></table>{!rows.length&&<p className="empty">No LOLER records found.</p>}</div>}
  </section>;
}
