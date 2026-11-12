"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateApprovedJobPdf } from "../lib/loler-pdf";
import { ArrowLeft, Download, FileText, FolderOpen, RefreshCw, Trash2 } from "lucide-react";

type Asset = { id:string; asset_code:string; description:string; category:string|null; registration:string|null };
type JobCertificate = { id:string;certificate_number:string|null;job_card_number:string|null;job_type:string|null;status:string;approved_pdf_path:string;office_signed_at:string|null };
type Doc = { id:string; asset_id:string; file_name:string; storage_path:string; document_type:string; description:string|null; uploaded_at:string; uploaded_by:string };

const types = ["Vehicle documents","MOT certificate","Service record","Inspection report","LOLER certificate","Risk assessment","Manual","Other"];
const fleetTypes = ["Vehicle documents","MOT certificate","Tachograph calibration","PMI inspection","Plating certificate","Brake test","VOR record","Service / repair record","Insurance","Other"];
const dateLabel = (value:string) => new Date(value).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});

export default function AssetFolder({supabase,asset,canUpload,isAdmin,onBack}:{supabase:SupabaseClient;asset:Asset;canUpload:boolean;isAdmin:boolean;onBack:()=>void}) {
  const [docs,setDocs]=useState<Doc[]>([]);
  const [certificates,setCertificates]=useState<JobCertificate[]>([]);
  const [uploadAllowed,setUploadAllowed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [docType,setDocType]=useState("Vehicle documents");
  const [description,setDescription]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true); setError("");
    const {data,error:err}=await supabase.from("asset_documents").select("id,asset_id,file_name,storage_path,document_type,description,uploaded_at,uploaded_by").eq("asset_id",asset.id).order("uploaded_at",{ascending:false});
    if(err) setError("Could not load this asset folder: "+err.message);
    else setDocs((data||[]) as Doc[]);
    const certs=await supabase.from("workshop_job_cards").select("id,certificate_number,job_card_number,job_type,status,approved_pdf_path,office_signed_at").eq("asset_id",asset.id).not("approved_pdf_path","is",null).order("created_at",{ascending:false});
    if(certs.error)setError(prev=>[prev,"Could not load generated certificates: "+certs.error.message].filter(Boolean).join(" "));
    else setCertificates((certs.data||[]) as JobCertificate[]);
    setLoading(false);
  }
  useEffect(()=>{
    void load();
    void (async()=>{const {data}=await supabase.auth.getUser();if(data.user){const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",data.user.id).maybeSingle();setUploadAllowed(!!profile?.active && ["admin","plant_manager","mechanic","inspector"].includes(profile.role));}})();
  },[asset.id]);

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

  async function refreshDummyCertificate(cert:JobCertificate){
    if(asset.asset_code!=="TEST-LOLER-001"||cert.certificate_number!=="JT-LOLER-000001"){setError("Regeneration is restricted to the dummy certificate.");return;}
    if(!window.confirm("TEST ONLY: regenerate the statutory LOLER certificate and replace the old test PDF in this asset folder?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      const {data:job,error:jobError}=await supabase.from("workshop_job_cards").select("*").eq("id",cert.id).single();
      if(jobError||!job)throw jobError||new Error("Test job not found.");
      if(job.asset_id!==asset.id||job.certificate_number!=="JT-LOLER-000001"||job.status!=="Approved"||job.job_type!=="LOLER thorough examination")throw new Error("The job does not match the approved dummy LOLER test.");
      const pdf=await generateApprovedJobPdf(job,asset.asset_code+" - "+asset.description,true);
      const result=await supabase.storage.from("planttrack-job-certificates").update(cert.approved_pdf_path,pdf,{contentType:"application/pdf",upsert:true,cacheControl:"0"});
      if(result.error)throw result.error;
      setNotice("The current TEST ONLY LOLER certificate has replaced the old PDF. Open PDF to verify the saved copy.");
      await load();
    }catch(e){setError("Could not update test certificate: "+(e instanceof Error?e.message:String(e)));}
    finally{setBusy(false);}
  }

  async function openCertificate(cert:JobCertificate) {
    const {data,error:err}=await supabase.storage.from("planttrack-job-certificates").createSignedUrl(cert.approved_pdf_path,300);
    if(err||!data?.signedUrl){setError("Could not open generated certificate: "+(err?.message||"No secure link returned."));return;}
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
        <label style={{fontSize:12,fontWeight:700}}>Document type<select style={{...field,width:"100%",marginTop:6}} value={docType} onChange={e=>setDocType(e.target.value)}>{((asset.category||"").toLowerCase()==="hgv" || asset.asset_code.toUpperCase()==="C545766"?fleetTypes:types).map(t=><option key={t}>{t}</option>)}</select></label>
        <label style={{fontSize:12,fontWeight:700}}>Description (optional)<input style={{...field,width:"100%",marginTop:6}} value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. Annual inspection 2026"/></label>
        <label style={{fontSize:12,fontWeight:700}}>Choose PDF<input ref={fileRef} style={{display:"block",width:"100%",marginTop:9}} type="file" accept="application/pdf,.pdf" onChange={e=>void upload(e.target.files?.[0])}/></label>
      </div>
      <p className="fine">PDF files only · maximum 25 MB per document. Uploads are linked to this asset and recorded against your login.</p>
      {busy&&<p className="muted">Working…</p>}
    </div>}
    <h3>Generated job certificates ({certificates.length})</h3>
    {certificates.length===0?<p className="muted">No approved job PDFs filed against this asset yet.</p>:<div className="table-wrap"><table><thead><tr><th>Certificate / job</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>{certificates.map(cert=><tr key={cert.id}><td><b>{cert.certificate_number||cert.job_card_number||cert.id.slice(0,8)}</b></td><td>{cert.job_type||"Workshop job"}</td><td>{cert.status}</td><td><button className="secondary" onClick={()=>void openCertificate(cert)}><Download size={14}/> Open PDF</button>{asset.asset_code==="TEST-LOLER-001"&&cert.certificate_number==="JT-LOLER-000001"&&<button className="secondary" style={{marginLeft:8}} disabled={busy} onClick={()=>void refreshDummyCertificate(cert)}><RefreshCw size={14}/> Regenerate test certificate</button>}</td></tr>)}</tbody></table></div>}
    <h3>Saved documents ({docs.length})</h3>
    {loading?<p className="muted">Loading documents…</p>:docs.length===0?<p className="empty">No documents saved for this asset yet. Upload its first PDF above when ready.</p>:
      <div className="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th>Description</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>
      {docs.map(doc=><tr key={doc.id}><td><b><FileText size={15} style={{verticalAlign:"middle",marginRight:6}}/>{doc.file_name}</b></td><td>{doc.document_type}</td><td>{doc.description||"—"}</td><td>{dateLabel(doc.uploaded_at)}</td><td style={{display:"flex",gap:7}}><button className="secondary" onClick={()=>void openDoc(doc)}><Download size={14}/> Open PDF</button>{isAdmin&&<button className="secondary" disabled={busy} onClick={()=>void removeDoc(doc)} aria-label="Delete document"><Trash2 size={14}/></button>}</td></tr>)}
      </tbody></table></div>}
  </section>;
}
