import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type WheelJob = Record<string, any>;
const POSITIONS = [
 ["Front axle","1st steer","N/S"],["Front axle","1st steer","O/S"],
 ["Front axle","2nd steer","N/S"],["Front axle","2nd steer","O/S"],
 ["Rear axle","1st drive","N/S"],["Rear axle","1st drive","O/S"],
 ["Rear axle","2nd drive","N/S"],["Rear axle","2nd drive","O/S"],
 ["Trailer axle","1st trailer","N/S"],["Trailer axle","1st trailer","O/S"],
 ["Trailer axle","2nd trailer","N/S"],["Trailer axle","2nd trailer","O/S"],
 ["Trailer axle","3rd trailer","N/S"],["Trailer axle","3rd trailer","O/S"]
] as const;
export const WHEEL_POSITIONS = POSITIONS.map(([axle,position,side])=>axle+" / "+position+" / "+side);
export const WHEEL_JOB_TYPE = "Wheel removal / re-torque";
export const WHEEL_REQUIRED = [
 "Refit date","Refit mileage","Refitted and torqued by","Initial re-torque confirmed",
 "2nd re-torque by","2nd re-torque mileage","2nd re-torque date",
 "3rd re-torque by","3rd re-torque mileage","3rd re-torque date"
];
export const missingWheelFields = (values: Record<string,string>)=>[
 ...WHEEL_REQUIRED.filter(key=>!String(values[key]||"").trim()),
 ...(values["Initial re-torque confirmed"]!=="Yes"?["Confirm initial wheel torque"]:[]),
 ...(!WHEEL_POSITIONS.some(key=>values["Wheel: "+key]==="Yes")?["Select the wheel positions worked on"]:[]),
 ...((values["Refit date"]&&values["2nd re-torque date"]&&values["2nd re-torque date"]<values["Refit date"]) ? ["Second re-torque date cannot precede refit"]:[]),
 ...((values["2nd re-torque date"]&&values["3rd re-torque date"]&&values["3rd re-torque date"]<values["2nd re-torque date"]) ? ["Third re-torque date cannot precede second"]:[])
];

const white=rgb(1,1,1),ink=rgb(.11,.15,.21),navy=rgb(.13,.18,.26),grey=rgb(.93,.95,.97),red=rgb(.82,.09,.16);
const str=(v:unknown)=>String(v??"").replace(/[^\x20-\x7e]/g," ").trim();
const shownDate=(v:unknown)=>{const s=str(v);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+"-"+m[2]+"-"+m[1]:s||"Not recorded";};
function fitted(value:unknown,font:PDFFont,size:number,width:number):string{
 let s=str(value);
 while(s&&font.widthOfTextAtSize(s,size)>width)s=s.slice(0,-1);
 return s+(s.length<str(value).length?"...":"");
}
export async function generateWheelRetorquePdf(job:WheelJob,assetLabel:string,draft=false):Promise<Blob>{
 const doc=await PDFDocument.create(),page=doc.addPage([595.28,841.89]);
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const values:Record<string,string>=job.completion_checklist||{};
 const left=37,right=558,width=right-left;
 const text=(v:unknown,x:number,y:number,size=9,font=regular,maxWidth=right-x-4,color=ink)=>{
  page.drawText(fitted(v,font,size,maxWidth)||" ",{x,y,size,font,color});
 };
 const bar=(label:string,top:number)=>{
  page.drawRectangle({x:left,y:top-23,width,height:23,color:navy});
  text(label,left+9,top-16,10,bold,width-16,white);
 };
 const cell=(label:string,value:unknown,x:number,y:number,w:number,h=42)=>{
  page.drawRectangle({x,y:y-h,width:w,height:h,borderColor:rgb(.77,.81,.86),borderWidth:.65});
  page.drawRectangle({x,y:y-16,width:w,height:16,color:grey});
  text(label,x+6,y-11,7.5,bold,w-12);
  text(value||"Not recorded",x+6,y-32,9,regular,w-12);
 };
 try{
  const res=await fetch("/jt-utilities-logo.jpg");
  if(res.ok){const logo=await doc.embedJpg(await res.arrayBuffer());const d=logo.scaleToFit(136,65);page.drawImage(logo,{x:left,y:756,width:d.width,height:d.height});}
 }catch{/* Logo is optional. */}
 text("JT UTILITIES LTD",190,806,14,bold,350);
 text("WHEEL REMOVAL & RE-TORQUE RECORD",190,784,11,bold,365);
 text("Record no: "+(job.job_card_number||"Pending"),190,766,9,bold,355);
 page.drawLine({start:{x:left,y:742},end:{x:right,y:742},thickness:1.6,color:red});
 if(draft)text("DRAFT - NOT A COMPLETED RE-TORQUE CERTIFICATE",left,726,9,bold,500,red);
 cell("ASSET / REGISTRATION",assetLabel,left,710,275);
 cell("JOB SHEET REFERENCE",job.job_details?.["Related workshop job"]||"Separate wheel job",left+275,710,246);
 cell("WHEELS REMOVED / REFITTED ON",shownDate(values["Refit date"]),left,665,175);
 cell("MILEAGE / KMS",values["Refit mileage"],left+175,665,170);
 cell("REFITTED & TORQUED BY",values["Refitted and torqued by"],left+345,665,176);
 bar("WHEEL POSITIONS REMOVED AND REFITTED",617);
 let y=584;
 for(const [axle,position,side] of POSITIONS){
  if(y<305)break;
  const key="Wheel: "+axle+" / "+position+" / "+side;
  const checked=values[key]==="Yes";
  const idx=POSITIONS.findIndex(item=>item[0]===axle&&item[1]===position&&item[2]===side);
  const column=idx%2, row=Math.floor(idx/2);
  const yy=584-row*31,x=left+column*261;
  page.drawRectangle({x,y:yy-25,width:261,height:29,borderColor:rgb(.8,.84,.88),borderWidth:.5});
  text(axle+" - "+position+" - "+side,x+7,yy-15,8.2,regular,213);
  text(checked?"YES":"--",x+227,yy-15,8.2,bold,28,checked?rgb(.08,.44,.25):ink);
 }
 const yAfter=584-7*31-7;
 bar("INITIAL WHEEL TORQUE CONFIRMATION",yAfter);
 text("Wheels re-torqued when refitted: "+(values["Initial re-torque confirmed"]==="Yes"?"YES":"NOT CONFIRMED"),left+9,yAfter-43,9,bold,490);
 bar("FOLLOW-UP RE-TORQUE CHECKS",yAfter-60);
 const second=yAfter-90;
 cell("2ND RE-TORQUE - COMPLETED BY",values["2nd re-torque by"],left,second,235,47);
 cell("MILEAGE / KMS",values["2nd re-torque mileage"],left+235,second,132,47);
 cell("DATE",shownDate(values["2nd re-torque date"]),left+367,second,154,47);
 text("Required after 30 minutes / 30 miles (per supplied sheet)",left+7,second-60,8,regular,500);
 const third=second-72;
 cell("3RD RE-TORQUE - COMPLETED BY",values["3rd re-torque by"],left,third,235,47);
 cell("MILEAGE / KMS",values["3rd re-torque mileage"],left+235,third,132,47);
 cell("DATE",shownDate(values["3rd re-torque date"]),left+367,third,154,47);
 text("Required after 7 days (per supplied sheet)",left+7,third-60,8,regular,500);
 page.drawLine({start:{x:left,y:65},end:{x:right,y:65},color:rgb(.6,.64,.68),thickness:.7});
 text("Mechanic signed: "+(job.engineer_signature||"Awaiting signature"),left,52,8,regular,490);
 text("Office approved: "+(job.office_signature||"Awaiting approval")+" | "+shownDate(job.office_signed_at),left,38,8,regular,490);
 text("Separate JT wheel record | "+(job.job_card_number||"DRAFT")+" | Asset: "+assetLabel,left,24,7,regular,500);
 return new Blob([new Uint8Array(await doc.save())],{type:"application/pdf"});
}
