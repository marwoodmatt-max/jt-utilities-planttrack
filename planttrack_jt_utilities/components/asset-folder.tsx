"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Download, FileText, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import PlantSafetyLockouts from "./plant-safety-lockouts";
import AssetPhoto from "./asset-photo";

type Asset = { id:string; asset_code:string; description:string; category:string|null; registration:string|null };
type JobCertificate = { id:string;certificate_number:string|null;job_card_number:string|null;job_type:string|null;status:string;approved_pdf_path:string;job_card_pdf_path:string|null;office_signed_at:string|null;pdf_filed_at:string|null;pdf_filed_by_email:string|null;pdf_filed_by:string|null };
type DailyReport={id:string;submitted_at:string;result:string;report_path:string|null;answers:Record<string,unknown>;comments:string|null};
type JobCard={id:string;title:string;status:string;priority:string;created_at:string;job_card_number:string|null;instructions:string;job_type:string|null;engineer_signed_at:string|null;office_signed_at:string|null;approved_pdf_path:string|null;job_card_pdf_path:string|null;certificate_number:string|null};
type PmiReport = { id:string; inspected_on:string; result:string; defects:string|null; inspector_name:string; signed_off_by:string; report_path:string|null; brake_test_type:string|null };
type Doc = { id:string; asset_id:string; file_name:string; storage_path:string; document_type:string; description:string|null; uploaded_at:string; uploaded_by:string };

const types = ["Vehicle documents","MOT certificate","Service record","Inspection report","LOLER certificate","Risk assessment","Manual","Other"];
const fleetTypes = ["Vehicle documents","MOT certificate","Tachograph calibration","PMI inspection","Plating certificate","Brake test","VOR record","Service / repair record","Insurance","Other"];
const dateLabel = (value:string) => new Date(value).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-").replace(",","");

export default function AssetFolder({supabase,asset,canUpload,isAdmin,onBack,onEdit,onDelete,deleting,onImageChanged}:{supabase:SupabaseClient;asset:Asset;canUpload:boolean;isAdmin:boolean;onBack:()=>void;onEdit:()=>void;onDelete:()=>void;deleting:boolean;onImageChanged?:()=>void}) {
  const [docs,setDocs]=useState<Doc[]>([]);
  const [assetPhotoPath,setAssetPhotoPath]=useState<string|null>(null);
  const [assetPhotoUrl,setAssetPhotoUrl]=useState<string|null>(null);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [photoNotice,setPhotoNotice]=useState("");
  const photoInputRef=useRef<HTMLInputElement>(null);
  const [pmiReports,setPmiReports]=useState<PmiReport[]>([]);
  const [dailyReports,setDailyReports]=useState<DailyReport[]>([]);
  const [jobCards,setJobCards]=useState<JobCard[]>([]);
  const [ownerCanDelete,setOwnerCanDelete]=useState(false);
  const [photosOpen,setPhotosOpen]=useState<string|null>(null);
  const [signedPhotos,setSignedPhotos]=useState<{prompt:string;url:string}[]>([]);
  const [certificates,setCertificates]=useState<JobCertificate[]>([]);
  const [uploadAllowed,setUploadAllowed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [docType,setDocType]=useState("Vehicle documents");
  const [description,setDescription]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{let active=true;void supabase.auth.getUser().then(({data})=>{
   if(active)setOwnerCanDelete(isAdmin&&data.user?.id==="2807b17d-6507-4808-9909-15e11e44637a");
  });return()=>{active=false;};},[supabase,isAdmin]);
  const canDeleteUnsigned=(job:JobCard)=>ownerCanDelete&&
   ["New","Assigned","In progress","Returned for correction"].includes(job.status)&&
   !job.engineer_signed_at&&!job.office_signed_at&&!job.approved_pdf_path&&!job.job_card_pdf_path&&
   !String(job.job_type||"").startsWith("LOLER")&&!job.certificate_number;
  async function deleteUnsigned(job:JobCard){
   if(!canDeleteUnsigned(job))return;
   const number=job.job_card_number||"";
   if(!window.confirm("Delete unsigned job "+number+" permanently from this asset? Signed records cannot be deleted."))return;
   const confirmation=window.prompt("Type "+number+" to confirm:","");
   if(confirmation!==number){if(confirmation!==null)setError("Deletion cancelled — job number did not match.");return;}
   setBusy(true);setError("");
   try{
    const {error:removeError}=await supabase.rpc("delete_my_test_workshop_job",{p_job:job.id,p_confirmation:confirmation});
    if(removeError)throw removeError;
    setNotice(number+" deleted from Workshop and this Asset Folder. Audit record retained.");
    await load();
   }catch(e){setError("Could not delete test job: "+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
  }
  async function refreshPhoto(){
    const {data,error:photoError}=await supabase.from("assets").select("asset_image_path").eq("id",asset.id).single();
    if(photoError){setError("Could not load asset photo: "+photoError.message);return;}
    const path=(data?.asset_image_path||null) as string|null;
    setAssetPhotoPath(path);
    if(path){
      const {data:link,error:linkError}=await supabase.storage.from("asset-images").createSignedUrl(path,3600);
      setAssetPhotoUrl(!linkError&&link?link.signedUrl:null);
    }else setAssetPhotoUrl(null);
  }
  async function uploadAssetPhoto(file?:File){
    if(!file||!isAdmin)return;
    setError("");setPhotoNotice("");
    const allowed:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if(!allowed[file.type]){setError("Choose a JPEG, PNG or WebP photo.");return;}
    if(file.size>5*1024*1024){setError("The asset photo must be smaller than 5 MB.");return;}
    setPhotoBusy(true);
    try{
      const path=asset.id+"/"+crypto.randomUUID()+"."+allowed[file.type];
      const {error:uploadError}=await supabase.storage.from("asset-images").upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {data:changed,error:saveError}=await supabase.from("assets").update({asset_image_path:path}).eq("id",asset.id).select("id").single();
      if(saveError||!changed){
        await supabase.storage.from("asset-images").remove([path]);
        throw saveError||new Error("Photo could not be linked to this asset.");
      }
      const oldPath=assetPhotoPath;
      await refreshPhoto();
      if(oldPath&&oldPath!==path)await supabase.storage.from("asset-images").remove([oldPath]);
      setPhotoNotice("Main photo saved against "+asset.asset_code+".");
      onImageChanged?.();
    }catch(e){setError("Photo upload failed: "+(e instanceof Error?e.message:String(e)));}
    finally{setPhotoBusy(false);if(photoInputRef.current)photoInputRef.current.value="";}
  }
  async function removeAssetPhoto(){
    if(!isAdmin||!assetPhotoPath||!window.confirm("Remove the main photo for "+asset.asset_code+"?"))return;
    setPhotoBusy(true);setError("");setPhotoNotice("");
    try{
      const oldPath=assetPhotoPath;
      const {error:saveError}=await supabase.from("assets").update({asset_image_path:null}).eq("id",asset.id);
      if(saveError)throw saveError;
      setAssetPhotoPath(null);setAssetPhotoUrl(null);
      await supabase.storage.from("asset-images").remove([oldPath]);
      setPhotoNotice("Main photo removed. Asset details retained.");
      onImageChanged?.();
    }catch(e){setError("Could not remove photo: "+(e instanceof Error?e.message:String(e)));}
    finally{setPhotoBusy(false);}
  }
  async function load() {
    setLoading(true); setError("");
    await refreshPhoto();
    const [daily,jobs]=await Promise.all([supabase.from("inspections").select("id,submitted_at,result,report_path,answers,comments").eq("asset_id",asset.id).eq("inspection_type","daily_plant_pre_start").order("submitted_at",{ascending:false}),supabase.from("workshop_job_cards").select("id,title,status,priority,created_at,job_card_number,instructions,job_type,engineer_signed_at,office_signed_at,approved_pdf_path,job_card_pdf_path,certificate_number").eq("asset_id",asset.id).order("created_at",{ascending:false})]);
    if(daily.error)setError("Daily inspections could not load: "+daily.error.message);else setDailyReports((daily.data||[]) as DailyReport[]);
    if(jobs.error)setError("Job cards could not load: "+jobs.error.message);else setJobCards((jobs.data||[]) as JobCard[]);
    const pmi=await supabase.from("hgv_pmi_records").select("id,inspected_on,result,defects,inspector_name,signed_off_by,report_path,brake_test_type").eq("asset_id",asset.id).order("inspected_on",{ascending:false});
    if(pmi.error)setError("Could not load PMI history: "+pmi.error.message);
    else setPmiReports((pmi.data||[]) as PmiReport[]);
    const {data,error:err}=await supabase.from("asset_documents").select("id,asset_id,file_name,storage_path,document_type,description,uploaded_at,uploaded_by").eq("asset_id",asset.id).order("uploaded_at",{ascending:false});
    if(err) setError("Could not load this asset folder: "+err.message);
    else setDocs((data||[]) as Doc[]);
    const certs=await supabase.from("workshop_job_cards").select("id,certificate_number,job_card_number,job_type,status,approved_pdf_path,job_card_pdf_path,office_signed_at,pdf_filed_at,pdf_filed_by_email,pdf_filed_by").eq("asset_id",asset.id).not("approved_pdf_path","is",null).order("created_at",{ascending:false});
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

  async function openDailyReport(report:DailyReport){
    if(!report.report_path){setError("This inspection has no filed PDF yet. Open Plant Checks and use File PDF in inspection history.");return;}
    const {data,error}=await supabase.storage.from("plant-inspection-reports").createSignedUrl(report.report_path,600);
    if(error||!data){setError("Could not open the inspection report: "+(error?.message||"Unknown error"));return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  async function viewDailyPhotos(report:DailyReport){
    setPhotosOpen(report.id);setSignedPhotos([]);setError("");
    const evidence=Array.isArray(report.answers?._photo_evidence)?report.answers._photo_evidence as {prompt:string;path:string}[]:[];
    const photos:{prompt:string;url:string}[]=[];
    for(const entry of evidence){
      const {data,error}=await supabase.storage.from("plant-inspection-photos").createSignedUrl(entry.path,600);
      if(error||!data){setError("Photo could not be opened: "+(error?.message||entry.prompt));return;}
      photos.push({prompt:entry.prompt,url:data.signedUrl});
    }
    setSignedPhotos(photos);
  }
  const sectionTitle=(title:string,count:number)=><h3 style={{margin:"27px 0 12px",padding:"11px 14px",background:"#191b20",color:"#fff",borderLeft:"5px solid #e31b36",borderRadius:4}}>{title} ({count})</h3>;
  async function openDoc(doc:Doc) {
    const {data,error:err}=await supabase.storage.from("asset-documents").createSignedUrl(doc.storage_path,300);
    if(err||!data?.signedUrl){setError("Could not open this PDF: "+(err?.message||"No secure link returned."));return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  // Open the tab synchronously from the tap; mobile browsers may block
  // window.open after the awaited Supabase signed-URL request.
  async function openStoredPdf(path:string) {
    const tab=window.open("","_blank");
    if(tab){tab.document.title="PlantTrack PDF";tab.document.body.textContent="Opening your JT Utilities document…";}
    const {data,error:err}=await supabase.storage.from("planttrack-job-certificates").createSignedUrl(path,300);
    if(err||!data?.signedUrl){
      if(tab)tab.close();
      setError("Could not open job document: "+(err?.message||"No secure link returned."));
      return;
    }
    if(tab){tab.location.href=data.signedUrl;}
    else{ // Fallback for browsers that prevent new tabs entirely.
      window.location.assign(data.signedUrl);
    }
  }

  async function openCertificate(cert:JobCertificate) {
    await openStoredPdf(cert.approved_pdf_path);
  }

  async function openPmiReport(report:PmiReport) {
    if(!report.report_path)return;
    const {data,error:err}=await supabase.storage.from("hgv-pmi-reports").createSignedUrl(report.report_path,300);
    if(err||!data?.signedUrl){setError("Could not open PMI report: "+(err?.message||"No secure link returned."));return;}
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
      <div><button className="secondary" onClick={onBack}><ArrowLeft size={15}/> Back to asset register</button> {isAdmin&&<><button className="secondary" onClick={onEdit} style={{marginLeft:8}}>Edit asset</button><button className="secondary" onClick={onDelete} disabled={deleting} style={{marginLeft:8,color:"#b91c1c"}}>{deleting?"Deleting…":"Delete asset"}</button></>}<h2 style={{marginTop:14,display:"flex",alignItems:"center",gap:9}}><FolderOpen color="#c62828"/> {asset.asset_code} – Asset folder</h2><p>{asset.description} · {asset.category||"Uncategorised"}{asset.registration?" · "+asset.registration:""}</p></div>
      <button className="secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </div>
    <div className="asset-photo-section">
      <AssetPhoto url={assetPhotoUrl} description={asset.description} category={asset.category} assetCode={asset.asset_code} large/>
      <div className="asset-photo-details">
        <h3>Main asset photo</h3>
        <p className="muted">{assetPhotoPath?"Main image saved with this asset.":"No photo uploaded yet. The register shows this asset's description and category instead."}</p>
        {isAdmin&&<div className="asset-photo-actions">
          <label className="secondary asset-photo-upload-label">
            {photoBusy?"Saving photo…":assetPhotoPath?"Replace photo":"Upload asset photo"}
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={e=>void uploadAssetPhoto(e.target.files?.[0])}/>
          </label>
          {assetPhotoPath&&<button className="secondary" type="button" disabled={photoBusy} onClick={()=>void removeAssetPhoto()}>Remove photo</button>}
        </div>}
        {isAdmin&&<small>JPEG, PNG or WebP · maximum 5 MB · one main photo per asset</small>}
        {photoNotice&&<p className="notice" role="status">{photoNotice}</p>}
      </div>
    </div>
    <PlantSafetyLockouts supabase={supabase} isAdmin={isAdmin} assetId={asset.id}/>
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
    {sectionTitle("Daily Plant Inspections",dailyReports.length)}
    {dailyReports.length===0?<p className="muted">No daily pre-start inspections filed against this asset yet.</p>:<div className="table-wrap"><table><thead><tr><th>Date</th><th>Operator</th><th>Result</th><th>Report and photographs</th></tr></thead><tbody>{dailyReports.map(report=><tr key={report.id}><td>{dateLabel(report.submitted_at)}</td><td>{String(report.answers?._operator||"Unknown")}</td><td><span className={"tag "+(report.result==="fail"?"red":"green")}>{report.result==="fail"?"Defect reported":"Pass"}</span></td><td><button className="secondary" type="button" onClick={()=>void openDailyReport(report)}><Download size={14}/> {report.report_path?"Open PDF":"PDF not yet filed"}</button> <button className="secondary" type="button" onClick={()=>void viewDailyPhotos(report)}>View 3 photos</button></td></tr>)}</tbody></table>{photosOpen&&<div style={{padding:14,borderTop:"1px solid #e2e8f0"}}><button className="secondary" onClick={()=>{setPhotosOpen(null);setSignedPhotos([]);}}>Close photographs</button><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:15,marginTop:12}}>{signedPhotos.map((photo,i)=><div key={i}><strong>{photo.prompt}</strong><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.prompt} style={{width:"100%",maxWidth:300,border:"1px solid #e2e8f0"}}/></a></div>)}</div></div>}</div>}
    {sectionTitle("Workshop Job Cards",jobCards.length)}
    <p className="muted">Every workshop job is linked to this asset as soon as it is raised. Signed PDFs become available after office approval.</p>
    {jobCards.length===0?<p className="muted">No workshop job cards for this machine.</p>:<div className="table-wrap"><table><thead><tr><th>Job card no.</th><th>Work type / title</th><th>Date</th><th>Status</th><th>Record</th></tr></thead><tbody>{jobCards.map(job=><tr key={job.id}>
     <td><b>{job.job_card_number||"Number pending"}</b></td>
     <td><strong>{job.job_type||"Workshop job"}</strong><small>{job.title}</small></td>
     <td>{dateLabel(job.created_at)}</td><td>{job.status}</td>
     <td>{job.job_card_pdf_path||job.job_type==="Wheel removal / re-torque"&&job.approved_pdf_path?<button type="button" className="secondary" onClick={()=>void openStoredPdf((job.job_card_pdf_path||job.approved_pdf_path)!)}><FileText size={15}/> {job.job_type==="Wheel removal / re-torque"?"View wheel re-torque PDF":"View filed PDF"}</button>:<span className="muted">{job.status==="Approved"?"PDF filing pending":"Pending completion / office approval"}</span>}
      {canDeleteUnsigned(job)&&<button type="button" className="secondary workshop-delete-test" disabled={busy} onClick={()=>void deleteUnsigned(job)}><Trash2 size={14}/> Delete unsigned test</button>}
     </td></tr>)}</tbody></table></div>}
    {sectionTitle("Pre-Use / Return-to-Work PDFs",certificates.filter(cert=>cert.job_type==="Pre-use / return-to-work check").length)}
    {certificates.filter(cert=>cert.job_type==="Pre-use / return-to-work check").length===0?<p className="muted">No approved Pre-Use inspection PDFs filed for this asset yet. The office must approve the signed check before the PDF is filed.</p>:<div className="asset-pre-use-pdfs">
     {certificates.filter(cert=>cert.job_type==="Pre-use / return-to-work check").map(cert=><div key={cert.id} className="asset-pre-use-pdf">
      <div><strong>{cert.job_card_number||"Pre-Use Inspection"}</strong><small>Pre-Use / Return-to-Work Inspection · {cert.status} · Office signed {cert.office_signed_at?dateLabel(cert.office_signed_at):"Date not recorded"}</small></div>
      <div className="asset-pre-use-actions">
       {cert.job_card_pdf_path?<button type="button" className="primary" onClick={()=>void openStoredPdf(cert.job_card_pdf_path!)}><Download size={16}/> View Pre-Use PDF</button>:cert.approved_pdf_path?<button type="button" className="primary" onClick={()=>void openStoredPdf(cert.approved_pdf_path)}><Download size={16}/> View filed inspection PDF</button>:<span>PDF not yet filed</span>}
      </div>
     </div>)}
    </div>}
    {sectionTitle("Wheel removal & re-torque PDFs",certificates.filter(cert=>cert.job_type==="Wheel removal / re-torque").length)}
    {certificates.filter(cert=>cert.job_type==="Wheel removal / re-torque").length===0?<p className="muted">No completed wheel re-torque sheets filed against this asset.</p>:<div className="table-wrap"><table><thead><tr><th>Separate wheel job no.</th><th>Status</th><th>Office approval</th><th>PDF</th></tr></thead><tbody>{certificates.filter(cert=>cert.job_type==="Wheel removal / re-torque").map(cert=><tr key={cert.id}><td><b>{cert.job_card_number||"Pending number"}</b></td><td>{cert.status}</td><td>{cert.office_signed_at?dateLabel(cert.office_signed_at):"Not recorded"}</td><td><button className="secondary" type="button" onClick={()=>void openStoredPdf(cert.approved_pdf_path)}><Download size={14}/> View re-torque PDF</button></td></tr>)}</tbody></table></div>}
    {sectionTitle("Approved Workshop Job Cards & Certificates",certificates.filter(cert=>cert.job_type!=="Pre-use / return-to-work check"&&cert.job_type!=="Wheel removal / re-torque").length)}
    {certificates.filter(cert=>cert.job_type!=="Pre-use / return-to-work check"&&cert.job_type!=="Wheel removal / re-torque").length===0?<p className="muted">No approved job cards or certificates filed against this asset yet.</p>:<div className="table-wrap"><table><thead><tr><th>Certificate / job</th><th>Type</th><th>Status</th><th>Filed at</th><th>Filed by</th><th>Action</th></tr></thead><tbody>{certificates.filter(cert=>cert.job_type!=="Pre-use / return-to-work check"&&cert.job_type!=="Wheel removal / re-torque").map(cert=><tr key={cert.id}><td><b>{cert.certificate_number||cert.job_card_number||cert.id.slice(0,8)}</b></td><td>{cert.job_type||"Workshop job"}</td><td>{cert.status}</td><td>{cert.pdf_filed_at?dateLabel(cert.pdf_filed_at):"Not recorded (older certificate)"}</td><td>{cert.pdf_filed_by_email|| (cert.pdf_filed_by?"User "+cert.pdf_filed_by.slice(0,8):"Not recorded")}</td><td style={{minWidth:195}}>
   {cert.job_card_pdf_path&&<button className="secondary" onClick={()=>void openStoredPdf(cert.job_card_pdf_path!)}><Download size={14}/> JT Asset Job Card</button>}
   {cert.approved_pdf_path&&<button className="secondary" onClick={()=>void openCertificate(cert)}><Download size={14}/> {String(cert.job_type||"").startsWith("LOLER")?"Statutory LOLER certificate":cert.job_card_pdf_path?"Original filed record":"JT job card / filed record"}</button>}
  </td></tr>)}</tbody></table></div>}
    {sectionTitle("PMI Inspection Reports",pmiReports.length)}
    {pmiReports.length===0?<p className="muted">No PMI inspection records for this asset yet.</p>:<div className="table-wrap"><table><thead><tr><th>Inspection date</th><th>Result</th><th>Brake test</th><th>Inspector</th><th>Signed off by</th><th>Report</th></tr></thead><tbody>{pmiReports.map(p=><tr key={p.id}><td>{p.inspected_on.split("-").reverse().join("-")}</td><td>{p.result}{p.defects?<small style={{display:"block"}}>{p.defects}</small>:null}</td><td>{p.brake_test_type||"—"}</td><td>{p.inspector_name}</td><td>{p.signed_off_by}</td><td>{p.report_path?<button className="secondary" onClick={()=>void openPmiReport(p)}><Download size={14}/> Open PMI report</button>:"No report attached"}</td></tr>)}</tbody></table></div>}
    {sectionTitle("Certificates & Other Documents",docs.length)}
    {loading?<p className="muted">Loading documents…</p>:docs.length===0?<p className="empty">No documents saved for this asset yet. Upload its first PDF above when ready.</p>:
      <div className="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th>Description</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>
      {docs.map(doc=><tr key={doc.id}><td><b><FileText size={15} style={{verticalAlign:"middle",marginRight:6}}/>{doc.file_name}</b></td><td>{doc.document_type}</td><td>{doc.description||"—"}</td><td>{dateLabel(doc.uploaded_at)}</td><td style={{display:"flex",gap:7}}><button className="secondary" onClick={()=>void openDoc(doc)}><Download size={14}/> Open PDF</button>{isAdmin&&<button className="secondary" disabled={busy} onClick={()=>void removeDoc(doc)} aria-label="Delete document"><Trash2 size={14}/></button>}</td></tr>)}
      </tbody></table></div>}
  </section>;
}
