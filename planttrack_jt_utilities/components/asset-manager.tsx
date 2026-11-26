"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AssetFolder from "./asset-folder";
import AssetPhoto from "./asset-photo";
import { Plus, Search, Pencil, X, Save, RefreshCw, FolderOpen, Trash2 } from "lucide-react";

type AssetRow = {
  id: string;
  asset_code: string;
  asset_image_path?: string|null;
  ownership_type: "owned"|"hired_in";
  hire_supplier: string|null;
  description: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  registration: string | null;
  location: string | null;
  hour_meter: number | string | null;
  status: string;
  loler_next_due?: string | null;
  loler_examined_at?: string | null;
  pmi_next_due?: string | null;
  pmi_last_completed?: string | null;
  mot_due?: string | null;
  tacho_calibration_due?: string | null;
};

type AssetForm = {
  asset_code: string;
  ownership_type: "owned"|"hired_in";
  hire_supplier: string;
  description: string;
  category: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  registration: string;
  location: string;
  hour_meter: string;
  status: string;
  loler_next_due: string;
  loler_examined_at: string;
  pmi_next_due: string;
  pmi_last_completed: string;
  mot_due: string;
  tacho_calibration_due: string;
};

const emptyForm: AssetForm = {
  asset_code: "", ownership_type:"owned",hire_supplier:"",description: "", category: "", manufacturer: "", model: "",
  serial_number: "", registration: "", location: "", hour_meter: "", status: "available",
  loler_next_due: "", loler_examined_at: "",
  pmi_next_due: "", pmi_last_completed: "", mot_due: "", tacho_calibration_due: ""
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

const categories = [
  "Vehicle", "Plant", "Lifting equipment", "Trailer",
  "Agricultural equipment", "CAT & Genny calibration equipment"
];

const statuses = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In use" },
  { value: "in_workshop", label: "In workshop" },
  { value: "out_of_service", label: "Out of service" },
  { value: "off_hire", label: "Off hire" }
];

const vehicleStatuses = [
  { value: "available", label: "Active" },
  { value: "out_of_service", label: "VOR" }
];

function statusLabel(asset: AssetRow) {
  if (["hgv","vehicle","trailer"].includes((asset.category || "").toLowerCase())) {
    return asset.status === "out_of_service" ? "VOR" : "Active";
  }
  return statuses.find((s) => s.value === asset.status)?.label || asset.status;
}

export default function AssetManager({ supabase, isAdmin, categoryFilter = "All", statusFilter = "All", onOpenPmi, vorOnly = false }: { supabase: SupabaseClient; isAdmin: boolean; categoryFilter?: string; statusFilter?: string; onOpenPmi?: () => void; vorOnly?: boolean }) {
  const [allocatedAssetIds,setAllocatedAssetIds]=useState<Set<string>>(new Set());
  const [showFleetImport,setShowFleetImport]=useState(false);
  const [showBulkUpload,setShowBulkUpload]=useState(false);
  const [uploadAssetId,setUploadAssetId]=useState("");
  const [bulkUploading,setBulkUploading]=useState(false);
  const [vorSaving,setVorSaving]=useState(false);
  const [vorFeedback,setVorFeedback]=useState("");
  const [releaseAsset,setReleaseAsset]=useState("");
  const [releasePmi,setReleasePmi]=useState("");
  const [releaseRepairs,setReleaseRepairs]=useState("");
  const [releaseName,setReleaseName]=useState("");
  const [releaseRecords,setReleaseRecords]=useState<{id:string;inspected_on:string;result:string;brake_test_type:string|null;report_path:string|null;created_at:string}[]>([]);
  const [releaseBusy,setReleaseBusy]=useState(false);
  const [releaseFeedback,setReleaseFeedback]=useState("");
  useEffect(()=>{
    let cancelled=false;
    setReleasePmi("");setReleaseRecords([]);
    if(!releaseAsset)return;
    void (async()=>{
      const {data,error}=await supabase.from("hgv_pmi_records").select("id,inspected_on,result,brake_test_type,report_path,created_at").eq("asset_id",releaseAsset).in("result",["Pass","Pass - defects rectified"]).in("brake_test_type",["RBT","Laden RBT"]).not("report_path","is",null).order("created_at",{ascending:false}).limit(20);
      if(!cancelled){if(error)setReleaseFeedback(error.message);else setReleaseRecords(data||[]);}
    })();
    return ()=>{cancelled=true};
  },[releaseAsset,supabase]);
  async function releaseFromVor(){
    if(!releaseAsset||!releasePmi||releaseRepairs.trim().length<5||releaseName.trim().length<2)return;
    setReleaseBusy(true);setReleaseFeedback("");
    const {error}=await supabase.rpc("release_vehicle_from_vor",{p_asset_id:releaseAsset,p_pmi_record_id:releasePmi,p_repairs:releaseRepairs.trim(),p_signatory:releaseName.trim()});
    if(error)setReleaseFeedback("Release refused: "+error.message);
    else{setReleaseFeedback("Vehicle released from VOR. The PMI calendar is active again.");setReleaseAsset("");setReleasePmi("");setReleaseRepairs("");setReleaseName("");await loadAssets();}
    setReleaseBusy(false);
  }
  const [bulkFeedback,setBulkFeedback]=useState("");
  const [importing,setImporting]=useState(false);
  const [importFeedback,setImportFeedback]=useState("");
  const [includeCalculatedPmi,setIncludeCalculatedPmi]=useState(false);
  const [importConfirmed,setImportConfirmed]=useState(false);
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [assetPhotoUrls,setAssetPhotoUrls]=useState<Record<string,string>>({});
  const [photoUploadingId,setPhotoUploadingId]=useState<string|null>(null);
  const [lockedAssets,setLockedAssets]=useState<Set<string>>(new Set());
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ownershipFilter,setOwnershipFilter]=useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [lolerRecordId, setLolerRecordId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function uploadRegisterPhoto(asset:AssetRow,file?:File){
    if(!file||!isAdmin||photoUploadingId)return;
    setMessage("");setError("");
    const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if(!extensions[file.type]){
      setError("Choose a JPG, PNG or WebP photo for "+asset.asset_code+".");
      return;
    }
    if(file.size>5*1024*1024){
      setError("Photos must be no larger than 5 MB.");
      return;
    }
    setPhotoUploadingId(asset.id);
    const path=asset.id+"/"+crypto.randomUUID()+"."+extensions[file.type];
    try{
      const bucket=supabase.storage.from("asset-images");
      const uploaded=await bucket.upload(path,file,{contentType:file.type,upsert:false});
      if(uploaded.error)throw uploaded.error;
      const saved=await supabase.from("assets").update({asset_image_path:path}).eq("id",asset.id).select("id").single();
      if(saved.error||!saved.data){
        await bucket.remove([path]);
        throw saved.error||new Error("Asset photo could not be linked.");
      }
      if(asset.asset_image_path&&asset.asset_image_path!==path){
        await bucket.remove([asset.asset_image_path]);
      }
      setMessage("Photo saved for "+asset.asset_code+".");
      await loadAssets();
    }catch(e){
      setError("Could not save photo for "+asset.asset_code+": "+(e instanceof Error?e.message:String(e)));
    }finally{
      setPhotoUploadingId(null);
    }
  }
  const registerPhoto=(asset:AssetRow)=>{
    const photo=<AssetPhoto url={assetPhotoUrls[asset.id]} description={asset.description} category={asset.category} assetCode={asset.asset_code}/>;
    if(!isAdmin)return photo;
    return <label className="asset-register-photo-upload" title={"Add or replace photo for "+asset.asset_code}>
      {photo}
      <span className="asset-register-photo-upload-label">{photoUploadingId===asset.id?"Saving…":asset.asset_image_path?"Change photo":"+ Add photo"}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={"Upload asset photo for "+asset.asset_code} disabled={!!photoUploadingId} onChange={e=>{const file=e.target.files?.[0];e.target.value="";void uploadRegisterPhoto(asset,file);}}/>
    </label>;
  };
  async function loadAssets() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("assets")
      .select("id, asset_code, asset_image_path, ownership_type, hire_supplier, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status, pmi_next_due, pmi_last_completed, mot_due, tacho_calibration_due")
      .order("asset_code", { ascending: true })
      .limit(1000);
    if (loadError) setError("Could not load assets: " + loadError.message);
    else {
      const assetRows = (data || []) as AssetRow[];
      const imageAssets=assetRows.filter(a=>a.asset_image_path);
      const photoUrls:Record<string,string>={};
      for(let offset=0;offset<imageAssets.length;offset+=100){
        const chunk=imageAssets.slice(offset,offset+100);
        const {data:urls,error:photoError}=await supabase.storage.from("asset-images").createSignedUrls(chunk.map(a=>a.asset_image_path!),3600);
        if(!photoError)(urls||[]).forEach((entry,index)=>{
          if(entry.signedUrl)photoUrls[chunk[index].id]=entry.signedUrl;
        });
      }
      setAssetPhotoUrls(photoUrls);
      const {data:locks,error:lockError}=await supabase.from("plant_safety_lockouts").select("asset_id").is("released_at",null);
      if(lockError)setError("Asset safety holds could not be checked: "+lockError.message);
      else setLockedAssets(new Set((locks||[]).map(l=>l.asset_id)));
      const {data:activeAllocations,error:allocationError}=await supabase.from("project_allocations").select("asset_id").is("returned_at",null);
      if(allocationError)setError("Assets loaded but allocations could not be checked: "+allocationError.message);
      const allocatedIds=new Set((activeAllocations||[]).map(a=>a.asset_id));
      for(const item of assetRows){if(item.status==="available"&&allocatedIds.has(item.id))item.status="in_use";}

      const assetIds = assetRows.map((asset) => asset.id);
      if (assetIds.length) {
        const { data: examinationRows, error: examinationError } = await supabase
          .from("examinations")
          .select("asset_id,next_due,examined_at,created_at")
          .ilike("examination_type", "%LOLER%")
          .in("asset_id", assetIds)
          .order("created_at", { ascending: false });
        if (examinationError) setError("Assets loaded, but LOLER dates could not be loaded: " + examinationError.message);
        const latestByAsset = new Map<string, { next_due: string | null; examined_at: string | null }>();
        for (const examination of examinationRows || []) {
          if (!latestByAsset.has(examination.asset_id)) {
            latestByAsset.set(examination.asset_id, { next_due: examination.next_due, examined_at: examination.examined_at });
          }
        }
        setRows(assetRows.map((asset) => ({
          ...asset,
          loler_next_due: latestByAsset.get(asset.id)?.next_due || null,
          loler_examined_at: latestByAsset.get(asset.id)?.examined_at || null
        })));
      } else setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadAssets(); }, [supabase]);

  useEffect(()=>{let cancelled=false;void supabase.from("project_allocations").select("asset_id").is("returned_at",null).then(({data})=>{if(!cancelled)setAllocatedAssetIds(new Set((data||[]).map(row=>row.asset_id)));});return ()=>{cancelled=true;};},[supabase]);
  const filtered = useMemo(() => rows.filter((a) =>
    (ownershipFilter==="all"||(a.ownership_type||"owned")===ownershipFilter) &&
    (statusFilter==="All" || (statusFilter==="In use" ? (a.status==="in_use" || (a.status==="available"&&allocatedAssetIds.has(a.id))) : statusFilter==="Available" ? (a.status==="available"&&!allocatedAssetIds.has(a.id)) : statusFilter==="In workshop" ? a.status==="in_workshop" : statusFilter==="Out of service" ? a.status==="out_of_service"&&!["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase()) : statusFilter==="VOR" ? a.status==="out_of_service"&&["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase()) : true)) &&
    (categoryFilter === "All" || (categoryFilter === "Vehicle VOR" && ["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase()) && a.status==="out_of_service") || (categoryFilter === "Plant Out of Service" && !["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase()) && a.status==="out_of_service") || (a.category || "").toLowerCase() === categoryFilter.toLowerCase() || (categoryFilter.toLowerCase() === "hgv" && a.asset_code.toUpperCase() === "C545766")) &&
    [a.asset_code, a.description, a.category, a.registration, a.location, a.manufacturer, a.model]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  ), [rows, search, categoryFilter, statusFilter, allocatedAssetIds, ownershipFilter]);

  const categoryOptions = useMemo(
    () => Array.from(new Set([...categories, ...rows.map((r) => r.category || "").filter(Boolean)])).sort(),
    [rows]
  );

  function startNew() {
    setEditing("new");
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  async function startEdit(asset: AssetRow) {
    setEditing(asset.id);
    setLolerRecordId(null);
    setForm({
      asset_code: asset.asset_code || "",
      ownership_type:asset.ownership_type||"owned",
      hire_supplier:asset.hire_supplier||"",
      description: asset.description || "",
      category: asset.category || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      serial_number: asset.serial_number || "",
      registration: asset.registration || "",
      location: asset.location || "",
      hour_meter: asset.hour_meter == null ? "" : String(asset.hour_meter),
      status: asset.status || "available",
      loler_next_due: asset.loler_next_due || "",
      loler_examined_at: asset.loler_examined_at || "",
      pmi_next_due: asset.pmi_next_due || "",
      pmi_last_completed: asset.pmi_last_completed || "",
      mot_due: asset.mot_due || "",
      tacho_calibration_due: asset.tacho_calibration_due || ""
    });
    setMessage("");
    setError("");
    if ((asset.category || "").trim().toLowerCase() === "lifting equipment") {
      const { data, error: lolerError } = await supabase
        .from("examinations")
        .select("id,next_due,examined_at")
        .eq("asset_id", asset.id)
        .ilike("examination_type", "%LOLER%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lolerError) {
        setError("Could not load LOLER dates: " + lolerError.message);
      } else if (data) {
        setLolerRecordId(data.id);
        setForm((current) => ({
          ...current,
          loler_next_due: data.next_due || "",
          loler_examined_at: data.examined_at || ""
        }));
      }
    }
  }

  async function deleteAsset(asset: AssetRow) {
    if (!isAdmin || saving) return;
    if (!window.confirm("Delete asset " + asset.asset_code + "? This cannot be undone. Assets with linked compliance records or documents must be retained.")) return;
    const confirmation = window.prompt('Type the asset code "' + asset.asset_code + '" to confirm deletion:');
    if (confirmation !== asset.asset_code) { setError("Asset deletion cancelled: asset code did not match."); return; }
    setSelectedAsset(null);
    setSaving(true); setError(""); setMessage("");
    const {error:deleteError} = await supabase.rpc("delete_unused_asset",{p_asset:asset.id});
    if (deleteError) setError("Asset not deleted. It may have linked job cards, documents or compliance records: " + deleteError.message);
    else { setMessage("Asset " + asset.asset_code + " deleted."); setSelectedAsset(null); setEditing(null); await loadAssets(); }
    setSaving(false);
  }

  async function saveAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      asset_code: form.asset_code.trim(),
      ownership_type:form.ownership_type,
      hire_supplier:form.ownership_type==="hired_in"?(form.hire_supplier.trim()||null):null,
      description: form.description.trim(),
      category: form.category.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      registration: form.registration.trim() || null,
      location: form.location.trim() || null,
      hour_meter: form.hour_meter.trim() === "" ? null : Number(form.hour_meter),
      status: form.status,
      pmi_next_due: (form.category || "").trim().toLowerCase() === "hgv" ? form.pmi_next_due || null : null,
      pmi_last_completed: (form.category || "").trim().toLowerCase() === "hgv" ? form.pmi_last_completed || null : null,
      mot_due: (form.category || "").trim().toLowerCase() === "hgv" ? form.mot_due || null : null,
      tacho_calibration_due: (form.category || "").trim().toLowerCase() === "hgv" ? form.tacho_calibration_due || null : null
    };

    if (payload.ownership_type==="hired_in"&&!payload.hire_supplier){setError("Enter the hire company for hired-in plant.");setSaving(false);return;}
    if (!payload.asset_code || !payload.description) {
      setError("Enter an asset code and description.");
      setSaving(false);
      return;
    }
    if (payload.hour_meter !== null && (!Number.isFinite(payload.hour_meter) || payload.hour_meter < 0)) {
      setError("Enter a valid non-negative hours reading.");
      setSaving(false);
      return;
    }

    const result = editing === "new"
      ? await supabase.from("assets").insert(payload).select("id, asset_code, ownership_type, hire_supplier, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status, pmi_next_due, pmi_last_completed, mot_due, tacho_calibration_due").single()
      : await supabase.from("assets").update(payload).eq("id", editing).select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status").single();

    let saveError = result.error;
    if (!saveError && editing !== "new" && (form.category || "").trim().toLowerCase() === "lifting equipment" && (form.loler_next_due || form.loler_examined_at)) {
      const examinationPayload = { asset_id: editing, examination_type: "LOLER", examination_scheme: "LOLER", next_due: form.loler_next_due || null, examined_at: form.loler_examined_at || null };
      const examinationResult = lolerRecordId
        ? await supabase.from("examinations").update(examinationPayload).eq("id", lolerRecordId)
        : await supabase.from("examinations").insert(examinationPayload);
      if (examinationResult.error) saveError = examinationResult.error;
    }

    if (saveError) {
      const duplicate = saveError.code === "23505";
      setError(duplicate
        ? "That asset code is already in use. Check the register and enter a unique code."
        : "The asset could not be saved: " + saveError.message);
    } else {
      setMessage(editing === "new" ? "Asset added to the live register." : "Asset details updated.");
      setEditing(null);
      setForm(emptyForm);
      await loadAssets();
    }
    setSaving(false);
  }

  async function bulkUploadFleetFiles(files:FileList|null){
    if(!files || !isAdmin || bulkUploading) return;
    const asset=rows.find(a=>a.id===uploadAssetId);
    if(!asset){setBulkFeedback("Choose the asset these PDFs belong to first.");return;}
    const selectedFiles=Array.from(files);
    if(!selectedFiles.length)return;
    setBulkUploading(true);setBulkFeedback("");
    const {data:authData,error:authError}=await supabase.auth.getUser();
    if(authError || !authData.user){setBulkFeedback("Please sign in again as Admin.");setBulkUploading(false);return;}
    let uploaded=0,skipped=0,failed=0;
    const outcomes:string[]=[];
    for(const file of selectedFiles){
      if(!file.name.toLowerCase().endsWith(".pdf") || file.size>25*1024*1024){skipped++;outcomes.push(file.name+": PDF only, maximum 25 MB");continue;}
      const {data:existing,error:existingError}=await supabase.from("asset_documents").select("id").eq("asset_id",asset.id).eq("file_name",file.name).limit(1);
      if(existingError){failed++;outcomes.push(file.name+": "+existingError.message);continue;}
      if(existing?.length){skipped++;outcomes.push(file.name+": already in this asset folder");continue;}
      const storagePath=asset.id+"/"+crypto.randomUUID()+"/"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const {error:storageError}=await supabase.storage.from("asset-documents").upload(storagePath,file,{contentType:"application/pdf",upsert:false});
      if(storageError){failed++;outcomes.push(file.name+": "+storageError.message);continue;}
      const {error:rowError}=await supabase.from("asset_documents").insert({asset_id:asset.id,file_name:file.name,storage_path:storagePath,document_type:"Asset documents",description:"Bulk upload to "+asset.asset_code,uploaded_by:authData.user.id});
      if(rowError){await supabase.storage.from("asset-documents").remove([storagePath]);failed++;outcomes.push(file.name+": "+rowError.message);}
      else uploaded++;
    }
    setBulkFeedback(asset.asset_code+": "+uploaded+" uploaded · "+skipped+" skipped · "+failed+" failed"+(outcomes.length?" — "+outcomes.slice(0,6).join("; "):""));
    setBulkUploading(false);
  }

  async function setR500Vor(){
    if(!isAdmin || vorSaving) return;
    const asset=rows.find(a=>a.asset_code.toUpperCase()==="R500 JTU");
    if(!asset){setVorFeedback("R500 JTU asset not found.");return;}
    if(!window.confirm("Mark R500 JTU as VOR now? The source notice starts 26 August 2026, but does not confirm whether it has since returned to service. Only proceed if it is currently off road."))return;
    setVorSaving(true);setVorFeedback("");
    const {data:auth,error:authError}=await supabase.auth.getUser();
    if(authError||!auth.user){setVorFeedback("Please sign in as Admin.");setVorSaving(false);return;}
    const {error:writeError}=await supabase.from("assets").update({status:"out_of_service"}).eq("id",asset.id);
    setVorFeedback(writeError?"VOR not saved: "+writeError.message:"R500 JTU marked VOR. Upload the VOR PDF using the bulk upload control above.");
    setVorSaving(false);
    if(!writeError)await loadAssets();
  }

  // Import is deliberately executed by the signed-in Admin in the app, not by a service account.
  // The existing database audit trigger therefore records the real authenticated actor.
  async function importFleetDates(){
    if(!isAdmin || importing || !importConfirmed) return;
    setImporting(true);setImportFeedback("");
    const {data:authData,error:authError}=await supabase.auth.getUser();
    if(authError || !authData.user){setImportFeedback("Sign in again as Admin before importing.");setImporting(false);return;}
    const imports: Array<{code:string;values:Record<string,string>;calculated:string}>=[
      {code:"R500 JTU",values:{pmi_last_completed:"2026-07-16",tacho_calibration_due:"2028-08-03"},calculated:"2026-08-27"},
      {code:"WP63 PFD",values:{pmi_last_completed:"2026-10-02",mot_due:"2027-10-31",tacho_calibration_due:"2028-08-17"},calculated:"2026-11-13"},
      {code:"C545766",values:{pmi_last_completed:"2026-10-02",mot_due:"2027-10-31"},calculated:"2026-11-13"}
    ];
    const outcomes:string[]=[];
    for(const item of imports){
      const matching=rows.filter(r=>r.asset_code.toUpperCase()===item.code && (r.category||"").toLowerCase()==="hgv");
      if(matching.length!==1){outcomes.push(item.code+": skipped (expected exactly one HGV record)");continue;}
      const payload:Record<string,string>={...item.values};
      if(includeCalculatedPmi && item.calculated)payload.pmi_next_due=item.calculated;
      const {error:writeError}=await supabase.from("assets").update(payload).eq("id",matching[0].id).eq("category","HGV");
      outcomes.push(item.code+": "+(writeError?"NOT SAVED — "+writeError.message:"saved"));
    }
    setImportFeedback(outcomes.join(" · "));
    setImporting(false);setImportConfirmed(false);
    await loadAssets();
  }

  // On returning from an Asset Folder, bring the editable form into view after
  // React has mounted it.  The form sits above the asset register and importing
  // controls, so staying at the folder's old scroll position hides it.
  useEffect(() => {
    if (!editing || selectedAsset || !isAdmin) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("asset-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, selectedAsset, isAdmin]);

  if (selectedAsset) return <AssetFolder supabase={supabase} asset={selectedAsset} canUpload={true} isAdmin={isAdmin} onBack={() => setSelectedAsset(null)} onEdit={() => {const asset=selectedAsset;setSelectedAsset(null);void startEdit(asset);}} onDelete={() => void deleteAsset(selectedAsset)} deleting={saving} onImageChanged={()=>void loadAssets()} />;

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "10px 11px", border: "1px solid #dcdce0",
    borderRadius: 6, background: "#fff", color: "#222", font: "inherit", marginTop: 6
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, margin: "12px 0" };

  if(vorOnly) return <section className="panel"><div className="panel-head"><div><h3>Vehicle VOR management</h3><p>One place for HGV, vehicle and trailer return-to-service approvals.</p></div></div>
    {isAdmin&&<section className="panel" style={{padding:18,marginBottom:18}}>
      <h3>Vehicle VOR · Return to Service</h3>
      <p className="muted">An administrator must confirm completed repairs and select a new signed passing PMI with RBT or Laden RBT and an uploaded report. The database checks the inspection was recorded after the vehicle went VOR.</p>
      <div style={{display:"grid",gap:10,maxWidth:650}}>
        <label>VOR vehicle<select style={fieldStyle} value={releaseAsset} onChange={e=>{setReleaseAsset(e.target.value);setReleaseFeedback("");}}>
          <option value="">Select VOR HGV, vehicle or trailer</option>
          {rows.filter(a=>a.status==="out_of_service"&&["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase())).map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.description}</option>)}
        </select></label>
        {releaseAsset&&<><label>Passing PMI and brake test<select style={fieldStyle} value={releasePmi} onChange={e=>setReleasePmi(e.target.value)}>
          <option value="">Select signed PMI / RBT record</option>
          {releaseRecords.map(p=><option key={p.id} value={p.id}>{formatDate(p.inspected_on)} · {p.result} · {p.brake_test_type}</option>)}
        </select></label>
        {releaseRecords.length===0&&<p className="muted">No eligible PMI with RBT and attached report found. Complete the PMI sign-off first in Workshop job cards.</p>}
        {onOpenPmi&&<button type="button" className="secondary" onClick={onOpenPmi}>Complete PMI / RBT in Workshop job cards</button>}
        <label>Repairs completed and roadworthiness confirmation<textarea style={fieldStyle} rows={3} value={releaseRepairs} onChange={e=>setReleaseRepairs(e.target.value)} placeholder="Describe repairs completed and checks confirming roadworthiness"/></label>
        <label>Authorised signatory name<input style={fieldStyle} value={releaseName} onChange={e=>setReleaseName(e.target.value)} placeholder="Full name"/></label>
        <button type="button" className="primary" disabled={releaseBusy||!releasePmi||releaseRepairs.trim().length<5||releaseName.trim().length<2} onClick={()=>void releaseFromVor()}>{releaseBusy?"Checking…":"Sign off · Return to Service"}</button></>}
        {releaseFeedback&&<p role="status">{releaseFeedback}</p>}
      </div>
    </section>}
  </section>;

  return <section className="panel">
    <div className="panel-head">
      <div><h3>{statusFilter==="All"?"Live asset register":statusFilter+" assets"}</h3><p>{filtered.length} matching of {rows.length} assets · {isAdmin ? "Select Edit asset beside the asset number to make changes" : "View only — an administrator can edit asset details"}</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => void loadAssets()}><RefreshCw size={15}/> Refresh</button>
        {isAdmin && <button className="primary" onClick={startNew}><Plus size={16}/> Add new asset</button>}
      </div>
    </div>

    {isAdmin && <div style={{marginBottom:12}}>
      <button type="button" className="secondary" onClick={()=>setShowBulkUpload(v=>!v)}>{showBulkUpload?"Close bulk PDF upload":"Bulk upload PDFs to an asset"}</button>
      {showBulkUpload&&<div style={{marginTop:10,padding:16,border:"1px solid #cbd5e1",borderRadius:12,background:"#f8fafc"}}>
        <h3 style={{marginTop:0}}>Upload PDFs to any asset</h3>
        <p className="muted">Choose an asset first. All selected PDFs will be filed in that asset's document folder. Maximum 25 MB per PDF; existing filenames are skipped.</p>
        <label style={{display:"block",fontWeight:700}}>Asset
          <select value={uploadAssetId} onChange={e=>{setUploadAssetId(e.target.value);setBulkFeedback("");}} style={{display:"block",marginTop:6,maxWidth:"100%",padding:10}}>
            <option value="">Select an asset</option>{rows.map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.description}</option>)}
          </select>
        </label>
        <label style={{display:"block",marginTop:14,fontWeight:700}}>Select PDFs
          <input type="file" accept=".pdf,application/pdf" multiple disabled={bulkUploading||!uploadAssetId} onChange={e=>void bulkUploadFleetFiles(e.target.files)} style={{display:"block",marginTop:7}}/>
        </label>
        {bulkUploading&&<p role="status">Uploading…</p>}
        {bulkFeedback&&<p role="status" style={{whiteSpace:"pre-wrap"}}>{bulkFeedback}</p>}
      </div>}
    </div>}
    {isAdmin && categoryFilter.toLowerCase()==="hgv" && <div style={{marginBottom:16,padding:14,border:"1px solid #cbd5e1",borderRadius:10}}>
      <b>C545766 trailer dates missing?</b>
      <p className="muted">Uploading an inspection PDF does not update the PMI fields automatically. Use “Review fleet dates for import” above, tick the confirmation box and approve. This saves last PMI 02 Oct 2026 and MOT 31 Oct 2027. Tick the separate calculated-PMI option only if 13 Nov 2026 matches your actual six-week inspection schedule.</p>
    </div>}
    {isAdmin && categoryFilter.toLowerCase()==="hgv" && <div style={{marginBottom:16,padding:16,border:"1px solid #fca5a5",borderRadius:12}}>
      <h3 style={{marginTop:0}}>R500 JTU · Vehicle Off Road (VOR)</h3>
      <p>Source notice: 26 Aug 2026, 08:55 · Reason: VEHICLE NOT IN USE. The return-to-service section is blank. The notice alone does not prove the vehicle remains off road today.</p>
      <button type="button" className="primary" disabled={vorSaving||rows.some(a=>a.asset_code.toUpperCase()==="R500 JTU"&&a.status==="out_of_service")} onClick={()=>void setR500Vor()}>{vorSaving?"Saving…":rows.some(a=>a.asset_code.toUpperCase()==="R500 JTU"&&a.status==="out_of_service")?"R500 JTU is marked VOR":"Confirm currently off road · Mark VOR"}</button>
      <p className="muted">The VOR PDF is included in the R500_JTU folder of the bulk upload pack and will be filed as a VOR record. No return-to-service approval is assumed.</p>
      {vorFeedback&&<p role="status">{vorFeedback}</p>}
    </div>}
    {isAdmin && <div style={{marginBottom:16}}>
      <button type="button" className="primary" onClick={()=>setShowFleetImport(v=>!v)}>{showFleetImport?"Close fleet import":"Review fleet dates for import"}</button>
      {showFleetImport && <div style={{marginTop:12,padding:20,border:"1px solid #cbd5e1",borderRadius:14,background:"#f8fafc"}}>
        <h3 style={{margin:"0 0 6px"}}>Fleet compliance import · Admin review</h3>
        <p className="muted">Updates existing PlantTrack assets only. The database audit log records your signed-in account. No separate system is used.</p>
        <div className="table-wrap"><table><thead><tr><th>HGV</th><th>Last PMI</th><th>MOT expiry</th><th>Tacho due</th><th>Calculated next PMI (optional)</th></tr></thead><tbody>
          <tr><td><b>R500 JTU</b></td><td>16 Jul 2026</td><td>Not supplied</td><td>3 Aug 2028</td><td>27 Aug 2026 · overdue if no later PMI</td></tr>
          <tr><td><b>WP63 PFD</b></td><td>2 Oct 2026</td><td>31 Oct 2027</td><td>17 Aug 2028</td><td>13 Nov 2026 · schedule needs verification</td></tr>
          <tr><td><b>C545766 · trailer</b></td><td>2 Oct 2026 · user confirmed</td><td>31 Oct 2027 · user confirmed</td><td>Not applicable</td><td>13 Nov 2026 · provisional six-week interval</td></tr>
        </tbody></table></div>
        <p className="muted" style={{marginTop:10}}>C545766 MOT expiry and last inspection date can be imported following your confirmation. PDFs showing C545776 remain held for identifier review. No VOR status or return-to-service authorisation will be changed.</p>
        <label style={{display:"block",marginTop:12}}><input type="checkbox" checked={includeCalculatedPmi} onChange={e=>setIncludeCalculatedPmi(e.target.checked)}/> Also import the calculated 42-day next PMI dates (only after checking the actual planned schedule)</label>
        <label style={{display:"block",marginTop:10}}><input type="checkbox" checked={importConfirmed} onChange={e=>setImportConfirmed(e.target.checked)}/> I have reviewed the source dates and authorise saving these values to the live register.</label>
        <button type="button" className="primary" style={{marginTop:14}} disabled={!importConfirmed||importing||loading} onClick={()=>void importFleetDates()}>{importing?"Saving dates…":"Approve and import to PlantTrack"}</button>
        {importFeedback&&<p role="status" style={{marginTop:12}}>{importFeedback}</p>}
      </div>}
    </div>}
    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}

    {editing !== null && isAdmin && <form id="asset-edit-form" onSubmit={saveAsset} style={{ scrollMarginTop: 20, border: "1px solid #e5e5e8", borderRadius: 8, padding: 16, marginBottom: 18, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><span className="eyebrow">ADMIN ONLY</span><h3 style={{ marginTop: 5 }}>{editing === "new" ? "Add new asset" : "Edit asset details"}</h3></div>
        <button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label="Close form"><X size={19}/></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 14px" }}>
        <label style={labelStyle}>Asset code *<input style={fieldStyle} required value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} placeholder="Enter JT Utilities asset number"/></label>
        <label style={labelStyle}>Description *<input style={fieldStyle} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Asset description"/></label>
        <label style={labelStyle}>Ownership<select style={fieldStyle} value={form.ownership_type} onChange={e=>setForm({...form,ownership_type:e.target.value as "owned"|"hired_in"})}><option value="owned">JT Utilities owned</option><option value="hired_in">Hired-in plant</option></select></label>
        {form.ownership_type==="hired_in"&&<label style={labelStyle}>Hire company<input required style={fieldStyle} value={form.hire_supplier} onChange={e=>setForm({...form,hire_supplier:e.target.value})} placeholder="Name of hire supplier"/></label>}
        <label style={labelStyle}>Category<select style={fieldStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="">Select category</option>{categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label style={labelStyle}>Manufacturer<input style={fieldStyle} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}/></label>
        <label style={labelStyle}>Model<input style={fieldStyle} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}/></label>
        <label style={labelStyle}>Serial number<input style={fieldStyle} value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })}/></label>
        <label style={labelStyle}>Registration<input style={fieldStyle} value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })}/></label>
        <label style={labelStyle}>Location<input style={fieldStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}/></label>
        <label style={labelStyle}>Hour meter<input style={fieldStyle} type="number" min="0" step="0.1" value={form.hour_meter} onChange={(e) => setForm({ ...form, hour_meter: e.target.value })}/></label>
        <label style={labelStyle}>Status<select disabled={editing!=="new"&&(lockedAssets.has(editing)||rows.some(a=>a.id===editing&&a.status==="out_of_service"&&["hgv","vehicle","trailer"].includes((a.category||"").toLowerCase())))} style={fieldStyle} value={["hgv","vehicle","trailer"].includes((form.category || "").toLowerCase()) && form.status !== "out_of_service" ? "available" : form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{(["hgv","vehicle","trailer"].includes((form.category || "").toLowerCase()) ? vehicleStatuses : statuses).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        {(form.category || "").trim().toLowerCase() === "hgv" && <>
          <label style={labelStyle}>Next PMI<input style={fieldStyle} type="date" value={form.pmi_next_due} onChange={(e) => setForm({ ...form, pmi_next_due: e.target.value })}/></label>
          <label style={labelStyle}>Last PMI<input style={fieldStyle} type="date" value={form.pmi_last_completed} onChange={(e) => setForm({ ...form, pmi_last_completed: e.target.value })}/></label>
          <label style={labelStyle}>MOT expiry<input style={fieldStyle} type="date" value={form.mot_due} onChange={(e) => setForm({ ...form, mot_due: e.target.value })}/></label>
          <label style={labelStyle}>Tacho Calibration expiry<input style={fieldStyle} type="date" value={form.tacho_calibration_due} onChange={(e) => setForm({ ...form, tacho_calibration_due: e.target.value })}/></label>
        </>}
      {(form.category || "").trim().toLowerCase() === "lifting equipment" && editing !== "new" && <>
          <label style={labelStyle}>LOLER next examination due<input style={fieldStyle} type="date" value={form.loler_next_due} onChange={(e) => setForm({ ...form, loler_next_due: e.target.value })}/></label>
          <label style={labelStyle}>Actual LOLER examination date<input style={fieldStyle} type="date" value={form.loler_examined_at} onChange={(e) => setForm({ ...form, loler_examined_at: e.target.value })}/></label>
        </> }
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 12 }}>
        <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}><Save size={15}/>{saving ? "Saving…" : "Save asset"}</button>
      </div>
      <p className="fine">Asset numbers are entered manually. Existing asset records are retained when edited; changes are recorded in the audit log.</p>
    </form>}

    <div className="toolbar">
      <div className="search"><Search size={17}/><input placeholder="Search asset code, description, registration or location…" value={search} onChange={(e) => setSearch(e.target.value)}/></div><select aria-label="Filter assets by ownership" value={ownershipFilter} onChange={e=>setOwnershipFilter(e.target.value)}><option value="all">All plant ownership</option><option value="owned">JT Utilities owned</option><option value="hired_in">Hired-in plant</option></select>
    </div>
    {categoryFilter.toLowerCase() === "hgv" && <div style={{background:"linear-gradient(115deg,#111827,#253449)",borderRadius:16,padding:"22px 24px",color:"#fff",marginBottom:18,display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",alignItems:"center"}}>
      <div><div style={{fontSize:11,fontWeight:800,letterSpacing:2,color:"#fda4af"}}>JT UTILITIES · FLEET COMPLIANCE</div><h2 style={{fontSize:25,margin:"7px 0"}}>HGV & trailer control centre</h2><div style={{color:"#cbd5e1",fontSize:13}}>HGVs and trailer C545766 · PMI · MOT · Tacho · VOR</div></div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{background:"#ffffff16",borderRadius:12,padding:"12px 18px"}}><div style={{fontSize:11,color:"#cbd5e1"}}>Fleet assets</div><strong style={{fontSize:24}}>{filtered.length}</strong></div>
        <div style={{background:"#ffffff16",borderRadius:12,padding:"12px 18px"}}><div style={{fontSize:11,color:"#cbd5e1"}}>PMI overdue</div><strong style={{fontSize:24,color:"#fda4af"}}>{filtered.filter(a=>a.pmi_next_due && a.pmi_next_due < new Date().toISOString().slice(0,10)).length}</strong></div>
        <div style={{background:"#ffffff16",borderRadius:12,padding:"12px 18px"}}><div style={{fontSize:11,color:"#cbd5e1"}}>VOR</div><strong style={{fontSize:24}}>{filtered.filter(a=>a.status==="out_of_service").length}</strong></div>
      </div>
    </div>}
    {loading ? <p className="muted">Loading assets…</p> : <div className="table-wrap">
      {categoryFilter.toLowerCase() === "hgv" ? <table><thead><tr><th>Registration</th><th>Description</th><th>Folder</th><th>Next PMI</th><th>Last PMI</th><th>MOT</th><th>Tacho Calibration</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead>
      <tbody>{filtered.map((a) => <tr key={a.id}>
        <td><div className="asset-register-identity">{registerPhoto(a)}<div><b>{a.registration || a.asset_code}</b>{isAdmin&&<div style={{marginTop:7}}><button type="button" className="secondary" style={{padding:"5px 9px",minHeight:30}} onClick={()=>void startEdit(a)}><Pencil size={13}/> Edit asset</button></div>}</div></div></td><td>{a.description}{a.asset_code.toUpperCase()==="C545766" && <small>Trailer · C545766</small>}</td>
        <td><button className="secondary" onClick={() => setSelectedAsset(a)}><FolderOpen size={14}/> Open folder</button></td>
        <td><span className={a.pmi_next_due && a.pmi_next_due < new Date().toISOString().slice(0,10) ? "tag red" : "tag"}>{formatDate(a.pmi_next_due)}</span></td><td>{formatDate(a.pmi_last_completed)}</td><td><span className={a.mot_due && a.mot_due < new Date().toISOString().slice(0,10) ? "tag red" : "tag"}>{formatDate(a.mot_due)}</span></td><td><span className={a.tacho_calibration_due && a.tacho_calibration_due < new Date().toISOString().slice(0,10) ? "tag red" : "tag"}>{formatDate(a.tacho_calibration_due)}</span></td>
        <td><span className={a.status === "out_of_service" ? "tag red" : "tag green"}>{statusLabel(a)}</span>{lockedAssets.has(a.id)&&<span className="tag red" style={{marginLeft:6}}>SAFETY LOCKOUT</span>}</td>
        {isAdmin && <td><button className="secondary" onClick={() => startEdit(a)}><Pencil size={14}/> Edit</button> <button className="secondary" disabled={saving} onClick={() => void deleteAsset(a)}><Trash2 size={14}/> Delete</button></td>}
      </tr>)}</tbody></table> : <table><thead><tr><th>Asset code</th><th>Description</th><th>Folder</th><th>Registration</th><th>Location</th><th>Hours</th><th>Next LOLER due</th><th>Last LOLER examination</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead>
      <tbody>{filtered.map((a) => <tr key={a.id}>
        <td><div className="asset-register-identity">{registerPhoto(a)}<div><b>{a.asset_code}</b>{isAdmin&&<div style={{marginTop:7}}><button type="button" className="secondary" style={{padding:"5px 9px",minHeight:30}} onClick={()=>void startEdit(a)}><Pencil size={13}/> Edit asset</button></div>}</div></div></td>
        <td>{a.description}{a.ownership_type==="hired_in"&&<span className="tag amber" style={{marginLeft:8}}>HIRED-IN</span>}<small>{a.category || "Uncategorised"}{a.manufacturer ? " · " + a.manufacturer : ""}{a.model ? " " + a.model : ""}{a.ownership_type==="hired_in"&&a.hire_supplier?" · Hire company: "+a.hire_supplier:""}</small></td>
        <td><button className="secondary" onClick={() => setSelectedAsset(a)}><FolderOpen size={14}/> Open folder</button></td><td>{a.registration || "—"}</td><td>{a.location || "Not recorded"}</td>
        <td>{a.hour_meter == null ? "—" : a.hour_meter}</td>
        <td><span className={a.loler_next_due && a.loler_next_due < new Date().toISOString().slice(0, 10) ? "tag red" : "tag"}>{formatDate(a.loler_next_due)}</span></td><td>{formatDate(a.loler_examined_at)}</td>
        <td><span className={a.loler_next_due && a.loler_next_due < new Date().toISOString().slice(0, 10) ? "tag red" : a.status === "available" ? "tag green" : a.status === "out_of_service" ? "tag red" : a.status === "in_workshop" ? "tag amber" : "tag"}>{a.loler_next_due && a.loler_next_due < new Date().toISOString().slice(0, 10) ? "Overdue · Out of service" : statusLabel(a)}</span></td>
        {isAdmin && <td><button className="secondary" onClick={() => startEdit(a)}><Pencil size={14}/> Edit</button></td>}
      </tr>)}</tbody></table>}
      {!filtered.length && <p className="empty">No matching assets.</p>}
    </div>}
    <p className="muted" style={{ marginTop: 12 }}>Showing {filtered.length} of {rows.length} assets.</p>
  </section>;
}
