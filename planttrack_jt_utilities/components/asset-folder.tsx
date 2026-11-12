"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Download, FileText, FolderOpen, RefreshCw, Trash2, Upload } from "lucide-react";

type Asset = { id:string; asset_code:string; description:string; category:string|null; registration:string|null };
type Doc = { id:string; asset_id:string; file_name:string; storage_path:string; document_type:string; description:string|null; uploaded_at:string; uploaded_by:string };

const types = ["Vehicle documents","MOT certificate","Service record","Inspection report","LOLER certificate","Risk assessment","Manual","Other"];
const dateLabel = (value:string) => new Date(value).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});

export default function AssetFolder({supabase,asset,canUpload,isAdmin,onBack}:{supabase:SupabaseClient;asset:Asset;canUpload:boolean;isAdmin:boolean;onBack:()=>void}) {
  const [docs,setDocs]=useState<Doc[]>([]);
  const [uploadAllowed,setUploadAllowed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [docType,setDocType]=useState("Other");
  const [description,setDescription]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true); setError("");
    const {data,error:err}=await supabase.from("asset_documents").select("id,asset_id,file_name,storage_path,document_type,description,uploaded_at,uploaded_by").eq("asset_id",asset.id).order("uploaded_at",{ascending:false});
    if(err) setError("Could not load this asset folder: "+err.message);
    else setDocs((data||[]) as Doc[]);
    setLoading(false);
  }
  useEffect(()=>{\n    void load();\n    void (async()=>{const {data}=await supabase.auth.getUser();if(data.user){const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",data.user.id).maybeSingle();setUploadAllowed(!!profile?.active && ["admin","plant_manager","mechanic","inspector"].includes(profile.role));}})();\n  },[asset.id]);

  async function upload(file?:File) {
    if(!file) return;
    setBusy(true);setError("");setNotice("");
    if(file.type!=="application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF document.");setBusy(false);return;
    }
    if(file.size>25*1024*1024){setError("The PDF must be smaller than 25 MB.");setBusy(false);return;}
    const {data:userData,error:userError}=await supabase.auth.getUser();
    if(userError||!userData.user){setError("Please sign in again before uploading.");setBusy(false);return;}
    const id=crypto.randomUUID();
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=asset.id+"/"+id+"/"+safeName;
    const {error:storageError}=await supabase.storage.from("asset-documents").upload(path,file,{contentType:"application/pdf",upsert:false});
    if(storageError){setError("Upload failed: "+storageError.message);setBusy(false);return;}
    const {error:rowError}=await supabase.from("asset_documents").insert({asset_id:asset.id,file_name:file.name,storage_path:path,document_type:docType,description:description.trim()||null,uploaded_by:userData.user.id});
    if(rowError){
      await supabase.storage.from("asset-documents").remove([path]);
      setError("The PDF uploaded but its folder entry could not be saved: "+rowError.message);
    } else {setNotice("PDF uploaded to this asset folder.");setDescription("");if(fileRef.current)fileRef.current.value="";await load();}
    setBusy(false);
  }

  async function openDoc(doc:Doc) {
    const {data,error:err}=await supabase.storage.from("asset-documents").createSignedUrl(doc.storage_path,300);
    if(err||!data?.signedUrl){setError("Could not open this PDF: "+(err?.message||"No secure link returned."));return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  async function removeDoc(doc:Doc) {
    if(!isAdmin||!window.confirm("Delete "+doc.file_name+" from this asset folder?")) return;
    setBusy(true);setError("");setNotice("");
    const {error:storageError}=await supabase.storage.from("asset-documents").remove([doc.storage_path]);
    if(storageError){setError("Could not delete the PDF: "+storageError.message);setBusy(false);return;}
    const {error:rowError}=await supabase.from("asset_documents").delete().eq("id",doc.id);
    if(rowError)setError("PDF removed from storage but folder entry could not be removed: "+rowError.message);
    else {setNotice("Document deleted.");await load();}
    setBusy(false);
  }

  const field:React.CSSProperties={padding:"9px 10px",border:"1px solid #d8d8dc",borderRadius:6,background:"#fff",color:"#222",font:"inherit"};
  return <section className="panel">
    <div className="panel-head">
      <div><button className="secondary" onClick={onBack}><ArrowLeft size={15}/> Back to asset register</button><h2 style={{marginTop:14,display:"flex",alignItems:"center",gap:9}}><FolderOpen color="#c62828"/> {asset.asset_code} – Asset folder</h2><p>{asset.description} · {asset.category||"Uncategorised"}{asset.registration?" · "+asset.registration:""}</p></div>
      <button className="secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </div>
    {notice&&<div className="notice" role="status">{notice}</div>}
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {canUpload&&uploadAllowed&&<div style={{padding:16,border:"1px dashed #c9c9ce",borderRadius:8,marginBottom:18,background:"#fafafa"}}>
      <h3 style={{marginTop:0}}>Upload a PDF document</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        <label style={{fontSize:12,fontWeight:700}}>Document type<select style={{...field,width:"100%",marginTop:6}} value={docType} onChange={e=>setDocType(e.target.value)}>{types.map(t=><option key={t}>{t}</option>)}</select></label>
        <label style={{fontSize:12,fontWeight:700}}>Description (optional)<input style={{...field,width:"100%",marginTop:6}} value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. Annual inspection 2026"/></label>
        <label style={{fontSize:12,fontWeight:700}}>Choose PDF<input ref={fileRef} style={{display:"block",width:"100%",marginTop:9}} type="file" accept="application/pdf,.pdf" onChange={e=>void upload(e.target.files?.[0])}/></label>
      </div>
      <p className="fine">PDF files only · maximum 25 MB per document. Uploads are linked to this asset and recorded against your login.</p>
      {busy&&<p className="muted">Working…</p>}
    </div>}
    <h3>Saved documents ({docs.length})</h3>
    {loading?<p className="muted">Loading documents…</p>:docs.length===0?<p className="empty">No documents saved for this asset yet. Upload its first PDF above when ready.</p>:
      <div className="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th>Description</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>
      {docs.map(doc=><tr key={doc.id}><td><b><FileText size={15} style={{verticalAlign:"middle",marginRight:6}}/>{doc.file_name}</b></td><td>{doc.document_type}</td><td>{doc.description||"—"}</td><td>{dateLabel(doc.uploaded_at)}</td><td style={{display:"flex",gap:7}}><button className="secondary" onClick={()=>void openDoc(doc)}><Download size={14}/> Open PDF</button>{isAdmin&&<button className="secondary" disabled={busy} onClick={()=>void removeDoc(doc)} aria-label="Delete document"><Trash2 size={14}/></button>}</td></tr>)}
      </tbody></table></div>}
  </section>;
}
