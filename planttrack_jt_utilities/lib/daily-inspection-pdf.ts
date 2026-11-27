import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
type Input={assetName:string;operator:string;location:string;submittedAt:string;meterReading:number|null;answers:Record<string,string>;comments:string;result:string;photos?:{prompt:string;bytes:Uint8Array;mimeType:string}[]};
const checks=[
"Operator understands machine","Check fire extinguisher","Check steps and handrails","Check seating and seatbelts","Check hydraulic hoses","Check engine bay is clean","Check for fuel, coolant or oil leaks","Check engine and hydraulic oil level","Check engine coolant",
"Check spray bar (Roller)","Check drums (Roller)","Abrasive wheel bearings (Trencher)","Mirrors, CCTV reversing system","Abrasive wheel, teeth and picks (Top Cutter & Trencher)","Check exhaust system","Check booms/boom pins/cracks","Check frame and body cracks","Check visible wiring protected","Check tracks / tyres","Check blade","Check signs/ labels/SWL are displayed","Check bucket and teeth that is in use","Abrasive wheel","Check warning alarms","Steering gear","Park lock brake","Greased points and greased?","Check lights / warning lights / beacon are working","Check horn is working","Check tracks and final drives","Instruments and gauges","Lights-flashing and vehicle"];
const W=595.28,H=841.89,left=40,right=555;
const ink=rgb(.15,.17,.2),grey=rgb(.91,.93,.96),line=rgb(.81,.84,.88),green=rgb(.63,.72,.21),teal=rgb(0,.63,.43),red=rgb(.85,.18,.21),na=rgb(.46,.47,.5);
const clean=(v:unknown)=>String(v??"").replace(/[^\x20-\x7e]/g," ").trim();
function wrap(font:PDFFont,value:string,size:number,width:number){
 const lines:string[]=[];let current="";
 for(const token of clean(value).split(/\s+/)){if(!token)continue;const next=current?current+" "+token:token;
  if(font.widthOfTextAtSize(next,size)<=width){current=next;continue;}
  if(current){lines.push(current);current="";}
  if(font.widthOfTextAtSize(token,size)<=width){current=token;continue;}
  let chunk="";for(const char of token){if(font.widthOfTextAtSize(chunk+char,size)>width&&chunk){lines.push(chunk);chunk="";}chunk+=char;}current=chunk;
 }
 if(current)lines.push(current);return lines;
}
function write(page:PDFPage,font:PDFFont,value:string,x:number,y:number,size=9,maxWidth=500,leading=12,maxLines=4,color=ink){
 const lines=wrap(font,value,size,maxWidth).slice(0,maxLines);
 lines.forEach((t,i)=>page.drawText(t,{x,y:y-i*leading,font,size,color}));
}
function headerBar(page:PDFPage,bold:PDFFont,label:string,rightLabel:string,y:number){
 page.drawRectangle({x:left,y:y-31,width:right-left,height:31,color:grey});
 write(page,bold,label,left+9,y-19,10,395);
 write(page,bold,rightLabel,right-105,y-19,9,105);
}
function row(page:PDFPage,font:PDFFont,bold:PDFFont,name:string,answer:string,y:number,height:number){
 page.drawLine({start:{x:left,y:y-height},end:{x:right,y:y-height},thickness:.5,color:line});
 const cy=y-height/2+4;
 write(page,font,name,left+10,cy,8.7,310,10,2);
 const fail=answer==="Unsafe"||answer==="No";
 const color=answer==="N/A"?na:fail?red:answer==="Safe"?teal:green;
 page.drawRectangle({x:378,y:y-height+3,width:177,height:height-6,color:answer?color:na});
 const value=answer||"Not recorded",sz=9;
 page.drawText(value,{x:546-bold.widthOfTextAtSize(value,sz),y:y-height/2-3,font:bold,size:sz,color:rgb(1,1,1)});
}
function footer(page:PDFPage,font:PDFFont,n:number,total=3){write(page,font,n+"/"+total,right-30,28,9,50);}
export async function generateDailyInspectionPdf(input:Input):Promise<Blob>{
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const when=new Date(input.submittedAt);
 const date=when.toLocaleDateString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric"}).replaceAll("/","-");
 const time=when.toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"});
 const passCount=checks.filter(k=>["Safe","Yes","N/A"].includes(input.answers?.[k])).length;
 const flags=checks.filter(k=>["Unsafe","No"].includes(input.answers?.[k])).length;
 const p1=pdf.addPage([W,H]);
 try{const response=await fetch("/jt-utilities-logo.jpg");if(response.ok){const logo=await pdf.embedJpg(new Uint8Array(await response.arrayBuffer()));const dims=logo.scaleToFit(148,78);p1.drawImage(logo,{x:left,y:741,width:dims.width,height:dims.height});}}catch{/* A missing logo must not block the safety record. */}
 write(p1,bold,"PLANT & MACHINERY",left+165,788,15,345);
 write(p1,bold,"PRE START INSPECTION",left+165,765,15,345);
 p1.drawLine({start:{x:left,y:728},end:{x:right,y:728},thickness:2,color:rgb(.85,.12,.2)});
 p1.drawRectangle({x:left,y:682,width:515,height:30,color:grey});
 write(p1,bold,input.result==="fail"?"Flagged - defects recorded":"Complete",right-200,692,12,190);
 write(p1,bold,"Score",left+5,648,9,90);write(p1,bold,passCount+" / 32 ("+Math.round(passCount/32*100)+"%)",left+85,647,12,147);
 write(p1,bold,"Flagged items",left+245,648,9,95);write(p1,bold,String(flags),left+346,647,12,40);
 write(p1,bold,"Actions",left+394,648,9,64);write(p1,bold,String(flags),left+469,647,12,38);
 const details:[string,string][]=[["Prepared by",input.operator],["Location",input.location||"Not recorded"],["Select Asset",input.assetName],["Inspection date",date],["Inspection time",time+" UK"],["Hours reading",input.meterReading==null?"Not recorded":String(input.meterReading)+" hr"]];
 let yDetail=609;
 for(let i=0;i<details.length;i++){
  const [label,value]=details[i];
  p1.drawRectangle({x:left,y:yDetail-29,width:right-left,height:34,color:i%2===0?rgb(.97,.97,.98):rgb(1,1,1)});
  write(p1,bold,label,left+10,yDetail-15,10,150);
  write(p1,regular,value,left+168,yDetail-15,10,334,13,2);
  yDetail-=38;
 }
 write(p1,bold,"Safety-critical defects: lock/tag out, report and do not operate until rectified.",left+8,yDetail-26,9,500,12,2,rgb(.65,.1,.15));

 const p2=pdf.addPage([W,H]);
 headerBar(p2,bold,"1. Audit","32 / 32 ("+Math.round(passCount/32*100)+"%)",809);
 write(p2,bold,"Date:",left+12,751,9,95);
 write(p2,regular,date+" "+time+" UK",right-130,751,9,130);
 write(p2,bold,"Records hours reading",left+12,710,9,210);
 write(p2,regular,input.meterReading==null?"Not recorded":String(input.meterReading)+" hr",right-130,710,9,130);
 write(p2,regular,"If any of the following critical components are found to be defective the equipment is to be",left+10,669,9,495);
 write(p2,regular,"Locked and Tagged out and reported immediately. it shall not be operated until the fault has",left+10,656,9,495);
 write(p2,regular,"been rectified.",left+10,643,9,490);
 let y=621;
 for(const key of checks.slice(0,9)){row(p2,regular,bold,key,input.answers?.[key]||"",y,29);y-=29;}
 headerBar(p2,bold,"1.1. Conditional Checks","",y-5);
 y-=43;
 for(const key of checks.slice(9,17)){row(p2,regular,bold,key,input.answers?.[key]||"",y,29);y-=29;}

 const p3=pdf.addPage([W,H]);
 let y3=813;
 for(const key of checks.slice(17)){row(p3,regular,bold,key,input.answers?.[key]||"",y3,35);y3-=35;}
 headerBar(p3,bold,"1.2. IMPORTANT: Check around plant before moving off","",y3-2);
 y3-=63;
 if(input.comments){
  write(p3,bold,"Comments / defect details",left+8,y3,10,485);
  write(p3,regular,input.comments,left+8,y3-18,8.6,490,11,5);
  y3-=78;
 }
 write(p3,bold,"Signed by operator",left+8,y3,10,490);
 const signatureData=input.answers?._signature;
 if(signatureData&&signatureData.startsWith("data:image/png;base64,")){
  try{const signatureImage=await pdf.embedPng(signatureData);const dims=signatureImage.scaleToFit(150,54);p3.drawImage(signatureImage,{x:left+8,y:y3-73,width:dims.width,height:dims.height});}catch{write(p3,regular,"Signature image could not be displayed",left+8,y3-42,8,155);}
 }
 write(p3,regular,input.operator,left+195,y3-33,11,295);
 write(p3,regular,date+" "+time+" UK - electronic acknowledgement",left+95,y3-50,9,410);



 if(flags>0){
  const faultPage=pdf.addPage([W,H]);
  write(faultPage,bold,"JT UTILITIES — OPERATOR DEFECT REPORT",left,798,14,515);
  write(faultPage,regular,input.assetName+"  |  "+date+" "+time+" UK",left,779,9,510);
  faultPage.drawLine({start:{x:left,y:764},end:{x:right,y:764},thickness:1.5,color:red});
  write(faultPage,regular,"ATTENTION WORKSHOP — Unsafe equipment must not be operated until assessed and made safe.",left,745,9,500,12,2,red);
  let position=715;
  const descriptions=(input.answers?._defect_details||{}) as unknown as Record<string,string>;
  for(const key of checks.filter(check=>["Unsafe","No"].includes(input.answers?.[check]))){
    const details=String(descriptions[key]||"See inspection comments");
    const rows=wrap(regular,details,9,490);
    const height=37+rows.length*13;
    if(position-height<65){
     // A defect can be lengthy. Continue on a fresh report page.
     const next=pdf.addPage([W,H]);position=785;
     write(next,bold,"OPERATOR DEFECT REPORT — CONTINUED",left,position,13,510);
     position-=31;
    }
    const active=pdf.getPages()[pdf.getPageCount()-1];
    active.drawRectangle({x:left,y:position-22,width:right-left,height:26,color:rgb(.97,.91,.92)});
    write(active,bold,key+" — UNSAFE / NO",left+8,position-13,9,490);
    const chunk=rows.length?rows:["No further details provided"];
    chunk.forEach((line,i)=>write(active,regular,line,left+9,position-41-i*13,9,487,13,1));
    position-=height+11;
  }

 }
 if(input.photos?.length){
  for(let offset=0;offset<input.photos.length;offset+=3){
   const imagePage=pdf.addPage([W,H]);
   write(imagePage,bold,"JT UTILITIES - INSPECTION PHOTO EVIDENCE",left,801,15,520);
   write(imagePage,regular,input.assetName,left,782,9,500);
   write(imagePage,regular,date+" "+time+" UK",left,766,9,500);
   imagePage.drawLine({start:{x:left,y:753},end:{x:right,y:753},thickness:1.5,color:rgb(.85,.12,.2)});
   let photoY=731;
   for(let i=offset;i<Math.min(offset+3,input.photos.length);i++){
    const photo=input.photos[i];
    write(imagePage,bold,(i+1)+". "+photo.prompt,left+8,photoY,10,490,12,2);
    try{
     const embedded=photo.mimeType==="image/png"?await pdf.embedPng(photo.bytes):await pdf.embedJpg(photo.bytes);
     const size=embedded.scaleToFit(320,188);
     imagePage.drawImage(embedded,{x:left+9,y:photoY-199,width:size.width,height:size.height});
    }catch{write(imagePage,regular,"Photo stored separately with the inspection.",left+9,photoY-24,9,470);}
    photoY-=228;
   }

  }
 }
 pdf.getPages().forEach((page,index)=>footer(page,regular,index+1,pdf.getPageCount()));
 return new Blob([new Uint8Array(await pdf.save())],{type:"application/pdf"});
}
