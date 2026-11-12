import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Job = Record<string, any>;
const owner = "JT Utilities LTD, Greendown Farm, Chittlehampton, Nr Umberleigh, Devon EX37 9QR";
const plantDefaults: Record<string,string> = {"NAME OF INSPECTOR":"Simon Squire","QUALIFICATIONS":"NPORS N039 and IRTEC Level 3","COMPANY":"JT Utilities LTD"};
const chainsFields = [
 "Date of Thorough Examination","Date of report","Report number",
 "Name & address of employer for whom the Thorough Examination was made",
 "Address of premises at which the Examination took place",
 "Description & identification of the equipment or accessories","SWL","Date of manufacture","Serial no:","Date of last examination",
 "Name & address of employer/ examiner who carried out the previous thorough examination. (if applicable):",
 "Within an interval of 6 months?","Within an interval of 12 months?","In accordance with an examination scheme?","After the occurrence of exceptional circumstances?",
 "Identification of any part to have a defect which is or could become a danger to persons and a description of defect or Identification of deteriorating conditions which require attention, repair or adjustment. (If none state NONE)",
 "Status","IS THE EQUIPMENT/ ACCESSORY SAFE TO OPERATE/ USE?",
 "Name, address & qualifications of person making this report:","Name of person authenticating this report:","Latest date by which next thorough examination must be carried out:",
 "Is person making this report","Name & address of employer of person making this report:"
];
const plantFields = [
 "CERTIFICATE NO","ORIGINAL CERTIFICATE NO/CE","EXAMINATION/TEST DATE","LAST EXAMINATION/TEST DATE",
 "TYPE OF EXAMINATION/TEST","ITEM","NAME AND ADDRESS OF EQUIPMENT OWNER","LOCATION OF EQUIPMENT WHEN EXAMINED",
 "ACCESSORIES 6 MONTHLY","LIFTING PERSONS 6 MONTHLY","APPLIANCES 12 MONTHLY","EXAMINATION SCHEME","EXCEPTIONAL CIRCUMSTANCES",
 "QUANTITY","ID NO/S","EQUIPMENT DESCRIPTION","SWL/WLL","PROOF LOAD","NEXT EXAMINATION / TEST DUE DATE",
 "CRITICAL DEFECTS FOUND DURING EXAMINATION/TESTING OR ‘NONE’","FURTHER DETAILS OR REMEDIAL ACTION REQUIRED",
 "NAME OF INSPECTOR","QUALIFICATIONS","COMPANY"
];
const faultWording=[
 "Immediate - Defects which are a danger to persons - equipment or accessories must be REMOVED FROM SERVICE",
 "A- Defects which are a danger or may become a danger to persons, action required - repairs to be concluded within 1 month",
 "B- Identification of components / assemblies found to be deteriorating which need to be checked or rectified.",
 "C - Observations on the condition of the equipment or accessories, comments & recommendations",
 "No faults have been detected",
 "Faults have been detected and the above actions are required within the time limits specified",
 "Equipment or accessories should not be used until the above instructions are carried out"
];
function ascii(value: unknown): string {
 return String(value ?? "").replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,"-").replace(/[^\x20-\x7e\n]/g," ");
}
export async function generateApprovedJobPdf(job:Job,assetLabel:string,draft=false):Promise<Blob>{
 const pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const isPlant=job.job_type==="LOLER thorough examination";
 const isChains=job.job_type==="LOLER chains & accessories";
 const isLoler=isPlant||isChains;
 const values:Record<string,any>={...(isPlant?plantDefaults:{}),...(job.job_details||{}),...(job.completion_checklist||{})};
 if(isPlant){values["CERTIFICATE NO"]=job.certificate_number||"Not assigned";values["NAME AND ADDRESS OF EQUIPMENT OWNER"] ||=owner;}
 if(isChains){values["Report number"]=job.certificate_number||"Not assigned";values["Name & address of employer for whom the Thorough Examination was made"] ||=owner;}
 const navy=rgb(0.08,0.16,0.25),grey=rgb(0.37,0.43,0.50);
 let page=pdf.addPage([595,842]);let y=800;const margin=38;const usable=519;
 const next=(height=26)=>{if(y-height<54){page=pdf.addPage([595,842]);y=800;}};
 const wrap=(value:string,fontSize:number,maxWidth:number,font=regular)=>{
  const out:string[]=[];for(const paragraph of ascii(value).split("\n")){
   let line="";for(const word of paragraph.split(/\s+/)){if(!word)continue;const candidate=line?line+" "+word:word;
    if(font.widthOfTextAtSize(candidate,fontSize)>maxWidth&&line){out.push(line);line=word;}else line=candidate;
   }out.push(line||" ");}return out;
 };
 const write=(value:string,size=9,emphasis=false,indent=0)=>{
  const font=emphasis?bold:regular;const lines=wrap(value,size,usable-indent,font);
  for(const line of lines){next(15);page.drawText(line,{x:margin+indent,y,size,font,color:emphasis?navy:grey});y-=size+4;}
 };
 const heading=(value:string)=>{next(42);y-=8;write(value,12,true);y-=7;page.drawLine({start:{x:margin,y},end:{x:557,y},thickness:0.8,color:navy});y-=13;};
 const field=(label:string,value:unknown)=>{next(45);write(label,8,true);const str=String(value??"").trim();write(str||"Not recorded",10,false,10);y-=8;};
 const title=isPlant?"REPORT OF THOROUGH EXAMINATION AND/OR TEST OF EQUIPMENT":isChains?"REPORT OF A THOROUGH EXAMINATION OF LIFTING EQUIPMENT & ACCESSORIES":"APPROVED WORKSHOP JOB RECORD";
 write("JT UTILITIES LTD",12,true);write(title,14,true);y-=10;
 write("Asset: "+assetLabel,10,true);
 write("Certificate / record number: "+(job.certificate_number||job.job_card_number||job.id),10,true);
 write("Office approval: "+(job.office_signed_at||"Not recorded"),8);y-=10;
 if(isPlant){
  write("Lifting Operations and Lifting Equipment Regulations L.O.L.E.R 1998 SI 2307",8);
  write("Provision and Use of Work Equipment Regulations P.U.W.E.R 1998 SI 2306",8);
  write("Supply of Machinery (Safety) Regulations 2008",8);
 }
 heading("Examination particulars");
 for(const key of isPlant?plantFields:isChains?chainsFields:[])field(key,values[key]);
 if(isChains){
  heading("Fault code reference and status wording");
  for(const text of faultWording)write(text,8);
  write("This report complies with the requirements of the Lifting Operations and Lifting Equipment Regulations 1998",8);
  write("JT TC Version 1 LOLER Dec 2021 - reference template",8);
 }
 if(isPlant){
  heading("Inspector declaration - conditional");
  const defects=String(values["CRITICAL DEFECTS FOUND DURING EXAMINATION/TESTING OR ‘NONE’"]||"").trim();
  if(defects.toUpperCase()==="NONE"){
   write("I hereby certify that no critical defects were found on the equipment described on this certificate at the time of inspection and that this equipment was found to be fit for use.",9);
  }else write("The fit-for-use declaration is withheld: critical defects have not been explicitly recorded as NONE. See examination findings.",9,true);
 }
 heading("Examiner authentication");
 field("Examiner / engineer typed sign-off",job.engineer_signature);
 field("Examiner signed at",job.engineer_signed_at);
 write("The typed name is a recorded sign-off, not a handwritten signature image.",8);
 heading("Office receipt and review");
 field("Office reviewer",job.office_signature);
 field("Office approval date",job.office_signed_at);
 field("Office review comments",job.office_comments);
 if(!isLoler){
  if(job.job_type==="General repair"){
   heading("ASSET JOB CARD - GENERAL REPAIR");
   field("ASSET NUMBER",assetLabel);
   field("DATE OF DEFECT",job.job_details?.["Date of defect"]||job.created_at);
   field("JOB CARD NO",job.job_card_number);
   field("DESCRIPTION",assetLabel);
   field("SERIAL NUMBER",job.job_details?.["Serial number"]);
   field("JOB DETAILS",job.instructions);
   field("PARTS ADDED",job.engineer_parts);
   field("LOCATION",job.job_details?.Location);
   field("WORK COMPLETED BY",job.engineer_signature);
   field("POSITION",job.job_details?.Position);
   field("SIGNED",job.engineer_signature);
   field("COMPLIANT AS OF (DD/MM/YY)",job.job_details?.["Compliant as of"]);
   write("Greendown Farm, Chittlehampton, Umberleigh, EX37 9QR",8);
   write("www.jtutilities.com  |  020 3840 4826",8);
  }
  field("Job",job.title);field("Instructions",job.instructions);
  for(const [key,value] of Object.entries(values))field(key,value);
 }
 field("Work performed / findings",job.engineer_work);
 field("Parts / remedial materials",job.engineer_parts);
 write("Generated by PlantTrack. Confirm all statutory particulars and examiner authentication before relying on this as a legal thorough-examination report.",8);
 if(draft){
  for(const page of pdf.getPages()){
   const {width,height}=page.getSize();
   page.drawRectangle({x:16,y:height-66,width:width-32,height:24,color:rgb(1,0.93,0.8)});
   page.drawText("DRAFT - TEST / PREVIEW ONLY - NOT A VALID LOLER CERTIFICATE",{x:23,y:height-58,size:10,font:bold,color:rgb(0.65,0.15,0.1)});
   page.drawText("NOT SIGNED OR APPROVED - DO NOT USE AS EVIDENCE OF EXAMINATION",{x:23,y:17,size:8,font:bold,color:rgb(0.65,0.15,0.1)});
  }
 }
 const bytes=await pdf.save();return new Blob([new Uint8Array(bytes)],{type:"application/pdf"});
}
