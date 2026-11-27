"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Evidence={prompt:string;path:string};
type Photo=Evidence&{url:string};
type Props={supabase:SupabaseClient;inspectionId:string};

export default function OperatorDefectEvidence({supabase,inspectionId}:Props){
 const [details,setDetails]=useState<{item:string;description:string}[]>([]);
 const [photos,setPhotos]=useState<Photo[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  setLoading(true);setDetails([]);setPhotos([]);setError("");
  void (async()=>{
   const {data,error:readError}=await supabase.from("inspections")
    .select("answers,comments").eq("id",inspectionId).maybeSingle();
   if(!active)return;
   if(readError||!data){setError(readError?.message||"Inspection report not found");setLoading(false);return;}
   const answers=(data.answers||{}) as Record<string,unknown>;
   const fields=(answers._defect_details||{}) as Record<string,string>;
   const list=Object.entries(fields).filter(([item,description])=>typeof description==="string"&&description.trim())
     .map(([item,description])=>({item,description}));
   if(!list.length&&data.comments){
    const faults=Object.entries(answers).filter(([key,val])=>!key.startsWith("_")&&(val==="Unsafe"||val==="No"));
    setDetails(faults.map(([item])=>({item,description:data.comments||"Defect reported"})));
   }else setDetails(list);
   const evidence=Array.isArray(answers._photo_evidence)?(answers._photo_evidence as Evidence[]):[];
   const defectFiles=evidence.filter(x=>x&&typeof x.prompt==="string"&&x.prompt.startsWith("Defect: ")&&typeof x.path==="string");
   if(defectFiles.length){
    const {data:signed,error:signError}=await supabase.storage.from("plant-inspection-photos")
     .createSignedUrls(defectFiles.map(x=>x.path),3600);
    if(!active)return;
    if(signError)setError("Defect photos could not load: "+signError.message);
    else setPhotos(defectFiles.flatMap((file,index)=>signed?.[index]?.signedUrl?[{...file,url:signed[index].signedUrl}]:[]));
   }
   setLoading(false);
  })();
  return()=>{active=false;};
 },[supabase,inspectionId]);
 return <section className="workshop-operator-defects">
  <h4>Operator-reported defects</h4>
  <p className="muted">Reported in the plant pre-start check. Review the fault and photographs before starting work. Keep unsafe plant out of use until authorised.</p>
  {loading?<p>Loading operator fault report…</p>:
   <>
    {details.length>0?<div className="workshop-operator-defect-list">{details.map(entry=><article key={entry.item}>
     <strong>{entry.item}</strong><p>{entry.description}</p>
    </article>)}</div>:<p className="muted">No individual item descriptions are stored on this inspection.</p>}
    {photos.length>0&&<div className="workshop-operator-defect-photos">{photos.map(photo=><a key={photo.path} href={photo.url} target="_blank" rel="noreferrer">
     <img src={photo.url} alt={photo.prompt}/><small>{photo.prompt.replace("Defect: ","")}</small>
    </a>)}</div>}
   </>}
  {error&&<p role="alert" className="notice">{error}</p>}
 </section>;
}
