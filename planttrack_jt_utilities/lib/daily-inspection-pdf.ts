import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
type Input={assetName:string;operator:string;location:string;submittedAt:string;meterReading:number|null;answers:Record<string,string>;comments:string;result:string};
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
function footer(page:PDFPage,font:PDFFont,n:number){write(page,font,n+"/3",right-30,28,9,50);}
export async function generateDailyInspectionPdf(input:Input):Promise<Blob>{
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const when=new Date(input.submittedAt);
 const date=when.toLocaleDateString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric"}).replaceAll("/","." );
 const time=when.toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"});
 const passCount=checks.filter(k=>["Safe","Yes","N/A"].includes(input.answers?.[k])).length;
 const flags=checks.filter(k=>["Unsafe","No"].includes(input.answers?.[k])).length;
 const p1=pdf.addPage([W,H]);
 write(p1,bold,"JT Utilities - Plant & Machinery Pre Start",left,788,17,510,22,2);
 write(p1,bold,"Inspection",left,761,17,510);
 p1.drawRectangle({x:left,y:708,width:515,height:28,color:grey});
 write(p1,bold,input.result==="fail"?"Flagged - defects recorded":"Complete",right-190,717,12,176);
 write(p1,bold,"Score",left+6,680,9,90);write(p1,bold,passCount+" / 32 ("+Math.round(passCount/32*100)+"%)",left+88,679,12,145);
 write(p1,bold,"Flagged items",left+245,680,9,85);write(p1,bold,String(flags),left+347,679,12,30);
 write(p1,bold,"Actions",left+393,680,9,68);write(p1,bold,String(flags),left+471,679,12,30);
 p1.drawLine({start:{x:left,y:657},end:{x:right,y:657},color:line,thickness:.8});
 write(p1,bold,"Prepared by",left,609,10,140);
 write(p1,regular,input.operator,left+260,608,11,250,15,3);
 write(p1,bold,"Location",left,517,10,140);
 write(p1,regular,input.location||"Not recorded",left+260,516,10,245,14,5);
 write(p1,bold,"Select Asset",left,409,10,140);
 write(p1,regular,input.assetName,left+260,407,10,245,14,6);
 write(p1,bold,"Inspection",left,303,10,140);
 write(p1,regular,date+" "+time+" BST/GMT (UK time)",left+260,303,10,245);
 footer(p1,regular,1);
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
 footer(p2,regular,2);
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
 write(p3,regular,input.operator,left+95,y3-33,11,395);
 write(p3,regular,date+" "+time+" UK - electronic acknowledgement",left+95,y3-50,9,410);
 footer(p3,regular,3);
 return new Blob([new Uint8Array(await pdf.save())],{type:"application/pdf"});
}
