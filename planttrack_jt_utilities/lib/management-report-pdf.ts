import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export type ReportTable={title:string;subtitle:string;generatedBy:string;columns:string[];rows:string[][];summary:string[]};
const pageWidth=595.28,pageHeight=841.89;
const left=38,right=557;
const text=(value:unknown)=>String(value??"").replace(/[^\x20-\x7e]/g," ").trim();
function split(font:PDFFont,value:string,width:number,size:number){
 const result:string[]=[];let line="";
 for(const word of text(value).split(/\s+/)){
  if(!word)continue;
  const attempt=line?line+" "+word:word;
  if(font.widthOfTextAtSize(attempt,size)<=width){line=attempt;continue;}
  if(line)result.push(line);
  line="";
  for(const char of word){
   if(font.widthOfTextAtSize(line+char,size)>width&&line){result.push(line);line="";}
   line+=char;
  }
 }
 if(line)result.push(line);
 return result;
}
export async function generateManagementReportPdf(report:ReportTable):Promise<Blob>{
 const pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const black=rgb(.1,.15,.21),red=rgb(.8,.1,.18),edge=rgb(.83,.86,.9);
 let logo:Awaited<ReturnType<typeof pdf.embedJpg>>|null=null;
 try{const response=await fetch("/jt-utilities-logo.jpg",{cache:"force-cache"});if(response.ok)logo=await pdf.embedJpg(await response.arrayBuffer());}catch{}
 const pages:PDFPage[]=[];
 let page:PDFPage,y=0;
 const put=(font:PDFFont,v:unknown,x:number,yy:number,maxWidth:number,size=9,maxLines=2)=>{
  const lines=split(font,String(v??""),maxWidth,size).slice(0,maxLines);
  lines.forEach((line,index)=>page.drawText(line,{x,y:yy-index*(size+4),font,size,color:black}));
 };
 const header=()=>{
  page=pdf.addPage([pageWidth,pageHeight]);pages.push(page);
  if(logo){const dim=logo.scaleToFit(135,69);page.drawImage(logo,{x:left,y:747,width:dim.width,height:dim.height});}
  else put(bold,"JT UTILITIES LTD",left,792,155,13,1);
  put(bold,"JT UTILITIES LTD",left+158,802,355,13,1);
  put(bold,report.title,left+158,777,355,13,2);
  page.drawLine({start:{x:left,y:728},end:{x:right,y:728},color:red,thickness:2.2});
  put(regular,report.subtitle,left,705,right-left,9,2);
  put(regular,"Generated: "+new Date().toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-")+" UK",left,674,340,8,1);
  put(regular,"Prepared by: "+report.generatedBy,left,657,330,8,1);
  y=624;
 };
 header();
 for(const message of report.summary){
  if(y<160)header();
  const lines=split(regular,message,right-left-24,9).slice(0,3);
  const h=Math.max(25,lines.length*13+10);
  page.drawRectangle({x:left,y:y-h+7,width:right-left,height:h,color:rgb(.95,.96,.98)});
  lines.forEach((line,i)=>put(regular,line,left+10,y-10-i*13,right-left-20,9,1));
  y-=h+5;
 }
 y-=16;
 const columnWidths=report.columns.map((_,i)=>i===0?0.28:i===report.columns.length-1?0.22:0.5/Math.max(report.columns.length-2,1));
 const weights=columnWidths.reduce((a,b)=>a+b,0);
 const widths=columnWidths.map(c=>(right-left)*c/weights);
 const tableHeader=()=>{
  if(y<120)header();
  page.drawRectangle({x:left,y:y-27,width:right-left,height:27,color:rgb(.16,.19,.24)});
  let x=left;
  report.columns.forEach((c,i)=>{const label=split(bold,c,widths[i]-12,8).slice(0,2);label.forEach((l,j)=>page.drawText(l,{x:x+6,y:y-12-j*10,font:bold,size:8,color:rgb(1,1,1)}));x+=widths[i];});
  y-=30;
 };
 tableHeader();
 if(!report.rows.length){put(regular,"No records for the selected report period.",left+7,y-16,right-left-14,9);y-=35;}
 for(const [index,record] of report.rows.entries()){
  const wrapped=record.map((cell,i)=>split(regular,cell,widths[i]-12,8).slice(0,3));
  const rowHeight=Math.max(32,...wrapped.map(lines=>lines.length*11+10));
  if(y-rowHeight<68){header();tableHeader();}
  if(index%2===0)page.drawRectangle({x:left,y:y-rowHeight,width:right-left,height:rowHeight,color:rgb(.96,.97,.98)});
  let x=left;
  wrapped.forEach((lines,i)=>{lines.forEach((val,j)=>put(regular,val,x+6,y-14-j*11,widths[i]-12,8,1));x+=widths[i];});
  page.drawLine({start:{x:left,y:y-rowHeight},end:{x:right,y:y-rowHeight},color:edge,thickness:.5});
  y-=rowHeight;
 }
 pages.forEach((p,i)=>{
  p.drawLine({start:{x:left,y:47},end:{x:right,y:47},color:edge,thickness:.75});
  p.drawText("Greendown Farm, Chittlehampton, Umberleigh, EX37 9QR",{x:left,y:33,font:regular,size:7,color:black});
  p.drawText("JT Utilities PlantTrack  |  Page "+(i+1)+" of "+pages.length,{x:355,y:33,font:regular,size:7,color:black});
 });
 return new Blob([new Uint8Array(await pdf.save())],{type:"application/pdf"});
}

export function reportCsv(report:ReportTable):Blob{
 const escape=(v:unknown)=>'"'+String(v??"").replaceAll('"','""')+'"';
 const rows=[[report.title],...report.summary.map(t=>[t]),[],report.columns,...report.rows];
 return new Blob(["\ufeff"+rows.map(row=>row.map(escape).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
}
