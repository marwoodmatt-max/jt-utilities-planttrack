import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";

type Contribution={
 mechanic_name:string;work_done:string;parts_used:string;
 hours_worked:number|string;created_at:string;
};
const clean=(value:unknown)=>String(value??"").replace(/[^\x20-\x7e\n]/g," ").trim();
function wrap(text:string,font:PDFFont,size:number,maxWidth:number):string[]{
 const lines:string[]=[];
 for(const paragraph of clean(text).split("\n")){
  let current="";
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   const candidate=current?current+" "+word:word;
   if(font.widthOfTextAtSize(candidate,size)<=maxWidth){current=candidate;continue;}
   if(current){lines.push(current);current="";}
   let rest=word;
   while(rest&&font.widthOfTextAtSize(rest,size)>maxWidth){
    let cut=1;while(cut<rest.length&&font.widthOfTextAtSize(rest.slice(0,cut+1),size)<=maxWidth)cut++;
    lines.push(rest.slice(0,cut));rest=rest.slice(cut);
   }
   current=rest;
  }
  lines.push(current||" ");
 }
 return lines;
}
export async function appendWorkshopContributionsToPdf(
 supabase:SupabaseClient,
 job:{id:string;job_type?:string;job_card_number?:string},
 original:Blob
):Promise<Blob>{
 // A statutory LOLER certificate must not be altered by workshop history.
 if(String(job.job_type||"").startsWith("LOLER"))return original;
 const {data,error}=await supabase.from("workshop_job_contributions")
  .select("mechanic_name,work_done,parts_used,hours_worked,created_at")
  .eq("job_id",job.id).order("created_at",{ascending:true});
 if(error)throw new Error("Cannot file job PDF without its team work history: "+error.message);
 const entries=(data||[]) as Contribution[];
 const transferResult=await supabase.from("workshop_job_reassignments")
  .select("previous_lead_name,new_lead_name,reassigned_by_name,reason,created_at")
  .eq("job_id",job.id).order("created_at",{ascending:true});
 if(transferResult.error)throw new Error("Cannot file job PDF without its lead reassignment history: "+transferResult.error.message);
 const transfers=(transferResult.data||[]) as {
  previous_lead_name:string;new_lead_name:string;reassigned_by_name:string;reason:string;created_at:string
 }[];
 if(!entries.length&&!transfers.length)return original;
 const pdf=await PDFDocument.load(await original.arrayBuffer());
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.12,.19,.3),grey=rgb(.4,.47,.55);
 let page:PDFPage;
 let y=0;
 function newPage(){
  page=pdf.addPage([595.28,841.89]);
  page.drawText("JT UTILITIES LTD - TEAM WORK RECORD",{x:39,y:795,size:14,font:bold,color:ink});
  page.drawLine({start:{x:39,y:779},end:{x:555,y:779},thickness:1.4,color:rgb(.82,.09,.18)});
  page.drawText("Job "+clean(job.job_card_number||job.id).slice(0,70)+" | Signed mechanic contributions",{x:39,y:758,size:10,font:font,color:grey});
  y=731;
 }
 const write=(text:string,size=10,heavy=false,indent=0)=>{
  const face=heavy?bold:font;
  for(const line of wrap(text,face,size,516-indent)){
   if(y<65)newPage();
   if(line.trim())page.drawText(line,{x:39+indent,y,size,font:face,color:ink});
   y-=size+4;
  }
 };
 newPage();
 write("Each entry is recorded under the contributor's authenticated account with its original timestamp.",9,false);
 y-=11;
 for(let i=0;i<entries.length;i++){
  const entry=entries[i];
  if(y<175)newPage();
  const timestamp=new Date(entry.created_at).toLocaleString("en-GB",{timeZone:"Europe/London"});
  write("Entry "+(i+1)+" - "+entry.mechanic_name+" - "+timestamp,11,true);
  write("Work: "+entry.work_done,10,false,8);
  if(entry.parts_used)write("Parts: "+entry.parts_used,9,false,8);
  write("Hours: "+Number(entry.hours_worked).toFixed(2),9,false,8);
  y-=14;
 }
 if(transfers.length){
  if(y<175)newPage();
  write("LEAD MECHANIC REASSIGNMENT HISTORY",12,true);
  y-=10;
  for(let i=0;i<transfers.length;i++){
   const move=transfers[i];
   if(y<165)newPage();
   write("Transfer "+(i+1)+": "+move.previous_lead_name+" to "+move.new_lead_name,10,true);
   write("Changed by "+move.reassigned_by_name+" on "+
    new Date(move.created_at).toLocaleString("en-GB",{timeZone:"Europe/London"}),9);
   write("Reason: "+move.reason,9);
   y-=13;
  }
 }
 return new Blob([new Uint8Array(await pdf.save())],{type:"application/pdf"});
}
