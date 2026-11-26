import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";

type Photo={storage_path:string;caption:string;created_at:string};
const ascii=(s:unknown)=>String(s??"").replace(/[^\x20-\x7e]/g," ").trim();
const limited=(value:string,max:number)=>value.length>max?value.slice(0,max-3)+"...":value;

/** Append evidence photos as numbered pages of the same approved PDF.
 * Throws on failed storage retrieval so office sees a filing error rather
 * than silently filing a document without photos.
 */
export async function appendWorkshopPhotosToPdf(
 supabase:SupabaseClient,
 job:{id:string;job_type?:string;job_card_number?:string},
 original:Blob
):Promise<Blob>{
 if(String(job.job_type||"").startsWith("LOLER"))return original;
 const {data,error}=await supabase.from("workshop_job_photos")
  .select("storage_path,caption,created_at")
  .eq("job_id",job.id).order("created_at",{ascending:true});
 if(error)throw new Error("Could not retrieve attached job photos: "+error.message);
 const photos=(data||[]) as Photo[];
 if(!photos.length)return original;
 const doc=await PDFDocument.load(await original.arrayBuffer());
 const font=await doc.embedFont(StandardFonts.Helvetica);
 const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const navy=rgb(.12,.18,.28),grey=rgb(.42,.49,.59);
 for(let index=0;index<photos.length;index++){
  const photo=photos[index];
  const {data:imageBlob,error:downloadError}=await supabase.storage.from("workshop-job-photos").download(photo.storage_path);
  if(downloadError||!imageBlob)throw new Error("Could not download attached job photo "+(index+1)+": "+(downloadError?.message||"Missing image"));
  const bytes=await imageBlob.arrayBuffer();
  const ext=photo.storage_path.split(".").pop()?.toLowerCase();
  const image=ext==="png"?await doc.embedPng(bytes):await doc.embedJpg(bytes);
  const page=doc.addPage([595.28,841.89]);
  const text=(value:string,x:number,y:number,size=10,heavy=false,color=navy)=>{
   page.drawText(limited(ascii(value),100),{x,y,font:heavy?bold:font,size,color});
  };
  text("JT UTILITIES LTD | WORKSHOP JOB PHOTO EVIDENCE",38,803,14,true);
  page.drawLine({start:{x:38,y:786},end:{x:557,y:786},thickness:1.5,color:rgb(.85,.12,.24)});
  text("Job: "+(job.job_card_number||job.id)+"   |   Photo "+(index+1)+" of "+photos.length,38,766,10,true);
  text("Notes: "+(photo.caption||"No notes supplied"),38,745,9,false,grey);
  text("Attached: "+new Date(photo.created_at).toLocaleString("en-GB"),38,726,9,false,grey);
  const fitted=image.scaleToFit(510,630);
  page.drawImage(image,{x:(595.28-fitted.width)/2,y:690-fitted.height,width:fitted.width,height:fitted.height});
  text("Job photo evidence | "+(job.job_card_number||"Workshop job"),38,35,8,false,grey);
 }
 return new Blob([new Uint8Array(await doc.save())],{type:"application/pdf"});
}
