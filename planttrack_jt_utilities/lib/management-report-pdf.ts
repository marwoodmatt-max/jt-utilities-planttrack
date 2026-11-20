import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReportTable = {
 title:string;
 subtitle:string;
 generatedBy:string;
 columns:string[];
 rows:string[][];
 summary:string[];
};

const ascii=(value:unknown)=>String(value??"").replace(/[^\x20-\x7e]/g," ").trim();
const fit=(value:unknown,limit:number)=>{const v=ascii(value);return v.length>limit?v.slice(0,limit-3)+"...":v;};

export async function generateManagementReportPdf(report:ReportTable):Promise<Blob>{
 const doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica);
 const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const dark=rgb(.12,.16,.22),light=rgb(.95,.96,.98),red=rgb(.82,.1,.19);
 let logoBytes:ArrayBuffer|null=null;
 try{
  const response=await fetch("/jt-utilities-logo.jpg");
  if(response.ok)logoBytes=await response.arrayBuffer();
 }catch{}
 const logo=logoBytes?await doc.embedJpg(logoBytes):null;
 const pages=[];
 const firstPageCapacity=Math.max(8,Math.floor((655-report.summary.length*40-27-85)/24));
 const laterPageCapacity=22;
 const sections=report.rows.length<=firstPageCapacity?1:1+Math.ceil((report.rows.length-firstPageCapacity)/laterPageCapacity);
 for(let p=0;p<sections;p++){
  const page=doc.addPage([595.28,841.89]);
  pages.push(page);
  if(logo){
   const dimensions=logo.scaleToFit(136,69);
   page.drawImage(logo,{x:38,y:748,width:dimensions.width,height:dimensions.height});
  }else page.drawText("JT UTILITIES LTD",{x:40,y:788,font:bold,size:14,color:dark});
  page.drawText("JT UTILITIES LTD",{x:193,y:802,font:bold,size:13,color:dark});
  page.drawText(fit(report.title,46),{x:193,y:779,font:bold,size:13,color:dark});
  page.drawLine({start:{x:38,y:727},end:{x:557,y:727},thickness:2,color:red});
  page.drawText(fit(report.subtitle,102),{x:40,y:708,font:regular,size:9,color:dark});
  const generated=new Date().toLocaleString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).replaceAll("/","-");
  page.drawText("Generated: "+generated+" UK | "+fit(report.generatedBy,35),{x:40,y:685,font:regular,size:8,color:dark});
  let y=655;
  if(p===0){
   for(const summary of report.summary){
    page.drawRectangle({x:38,y:y-30,width:519,height:34,color:light});
    const maxChars=104;
    page.drawText(fit(summary,maxChars),{x:47,y:y-17,size:8.5,font:regular,color:dark});
    y-=40;
   }
  }
  const widths=report.columns.length;
  const xStart=39;
  const cellWidth=518/Math.max(1,widths);
  page.drawRectangle({x:38,y:y-26,width:519,height:26,color:dark});
  report.columns.forEach((name,i)=>{
   page.drawText(fit(name,Math.max(9,Math.floor(cellWidth/5)-1)),{x:xStart+i*cellWidth+4,y:y-17,size:8,font:bold,color:rgb(1,1,1)});
  });
  y-=27;
  const from=p===0?0:firstPageCapacity+(p-1)*laterPageCapacity;
  const records=report.rows.slice(from,from+(p===0?firstPageCapacity:laterPageCapacity));
  if(records.length===0)page.drawText("No records in this report.",{x:45,y:y-19,font:regular,size:10,color:dark});
  for(let r=0;r<records.length;r++){
   const record=records[r];
   if(r%2===0)page.drawRectangle({x:38,y:y-22,width:519,height:24,color:light});
   for(let c=0;c<widths;c++){
    page.drawText(fit(record[c]||"",Math.max(9,Math.floor(cellWidth/4.7)-2)),{x:xStart+c*cellWidth+4,y:y-13,font:regular,size:7.8,color:dark});
   }
   y-=24;
  }
  page.drawLine({start:{x:38,y:46},end:{x:557,y:46},thickness:.7,color:dark});
  page.drawText("JT Utilities Ltd | Greendown Farm, Chittlehampton, Umberleigh, EX37 9QR",{x:38,y:31,font:regular,size:7,color:dark});
  page.drawText("Page "+(p+1)+" / "+sections,{x:498,y:31,font:regular,size:7,color:dark});
 }
 return new Blob([new Uint8Array(await doc.save())],{type:"application/pdf"});
}

export function reportCsv(report:ReportTable):Blob{
 const quote=(value:unknown)=>'"'+String(value??"").replaceAll('"','""')+'"';
 const lines:string[][]=[[report.title],...report.summary.map(value=>[value]),[],report.columns,...report.rows];
 return new Blob([lines.map(row=>row.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
}
