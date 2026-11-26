"use client";
import { WHEEL_POSITIONS, missingWheelFields } from "../lib/wheel-retorque-pdf";

type Props={
 values:Record<string,string>;
 onChange?:(key:string,value:string)=>void;
 readonly?:boolean;
 staff?:{user_id:string;display_name:string}[];
 currentUserId?:string;
};
const posGroups=[
 {title:"Front axles",items:WHEEL_POSITIONS.filter(x=>x.startsWith("Front axle"))},
 {title:"Rear axles",items:WHEEL_POSITIONS.filter(x=>x.startsWith("Rear axle"))},
 {title:"Trailer axles",items:WHEEL_POSITIONS.filter(x=>x.startsWith("Trailer axle"))}
];
export default function WheelRetorqueFields({values,onChange,readonly=false,staff=[],currentUserId=""}:Props){
 const change=(key:string,value:string)=>onChange?.(key,value);
 const field=(key:string,label:string,type="text")=><label key={key} style={{display:"grid",gap:5}}>
  {label}
  <input type={type} value={values[key]||""} readOnly={readonly} onChange={e=>change(key,e.target.value)}/>
 </label>;
 const staffOptions=Array.from(new Map(staff.filter(person=>person.display_name?.trim()).map(person=>[person.display_name.trim(),person])).values());
 const personField=(key:string,label:string)=><label key={key} style={{display:"grid",gap:5}}>
  {label}
  {readonly?<input value={values[key]||""} readOnly/>:
   <select value={values[key]||""} onChange={e=>change(key,e.target.value)}>
    <option value="">Select workshop mechanic</option>
    {values[key]&&!staffOptions.some(person=>person.display_name===values[key])&&<option value={values[key]}>{values[key]} (previously recorded)</option>}
    {staffOptions.map(person=><option key={person.user_id} value={person.display_name}>
     {person.user_id===currentUserId?"Me — "+person.display_name:person.display_name}
    </option>)}
   </select>}
 </label>;
 return <div style={{border:"1px solid #cbd5e1",borderRadius:9,padding:15,display:"grid",gap:16}}>
  <div><h4 style={{margin:"0 0 7px"}}>Wheel removal &amp; re-torque sheet</h4>
   <p className="muted" style={{margin:0}}>Separate numbered job record. Use only when wheels have been removed/refitted. The second check is due after 30 minutes / 30 miles and the third after 7 days, as stated on the supplied JT sheet. Do not mark a check complete before it has been carried out.</p></div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
   {field("Refit date","Wheels removed/refitted on","date")}
   {field("Refit mileage","Vehicle mileage / KMS","number")}
   {personField("Refitted and torqued by","Refitting and initial torque carried out by")}
  </div>
  <label style={{display:"flex",alignItems:"center",gap:9}}>
   <input type="checkbox" checked={values["Initial re-torque confirmed"]==="Yes"} disabled={readonly} onChange={e=>change("Initial re-torque confirmed",e.target.checked?"Yes":"")}/>
   Wheels have been re-torqued when refitted
  </label>
  <div><strong>Wheels removed and refitted</strong>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:9}}>
    {posGroups.map(group=><div key={group.title} style={{border:"1px solid #dce1e8",borderRadius:7,padding:10}}>
     <strong style={{display:"block",marginBottom:8}}>{group.title}</strong>
     {group.items.map(position=><label key={position} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
      <input type="checkbox" checked={values["Wheel: "+position]==="Yes"} disabled={readonly} onChange={e=>change("Wheel: "+position,e.target.checked?"Yes":"")}/>
      {position.split(" / ").slice(1).join(" / ")}
     </label>)}
    </div>)}
   </div>
  </div>
  <div style={{borderTop:"1px solid #e2e8f0",paddingTop:12}}>
   <strong>2nd re-torque — after 30 minutes / 30 miles</strong>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginTop:9}}>
    {personField("2nd re-torque by","Completed by")}
    {field("2nd re-torque mileage","Mileage / KMS","number")}
    {field("2nd re-torque date","Date completed","date")}
   </div>
  </div>
  <div style={{borderTop:"1px solid #e2e8f0",paddingTop:12}}>
   <strong>3rd re-torque — after 7 days</strong>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginTop:9}}>
    {personField("3rd re-torque by","Completed by")}
    {field("3rd re-torque mileage","Mileage / KMS","number")}
    {field("3rd re-torque date","Date completed","date")}
   </div>
  </div>
  {!readonly&&missingWheelFields(values).length>0&&<p role="status" className="muted" style={{margin:0}}>Still needed before final sign-off: {missingWheelFields(values).join("; ")}</p>}
  <small>The mechanic can save a draft while awaiting later checks. Only a fully checked and office-approved record is filed as a completed PDF.</small>
 </div>;
}
