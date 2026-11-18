"use client";
import {useEffect,useState} from "react";
import {createClient} from "@supabase/supabase-js";
export default function SetupPassword(){
 const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");
 const [ready,setReady]=useState(false);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const [client]=useState(()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||"",process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||""));
 useEffect(()=>{
  let live=true;
  const check=async()=>{const {data}=await client.auth.getSession();if(live)setReady(!!data.session);};
  void check();
  const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{if(live)setReady(!!session);});
  const hash=new URLSearchParams(window.location.hash.slice(1));
  if(hash.get("error_description"))setMessage(hash.get("error_description")||"Invitation expired");
  return()=>{live=false;listener.subscription.unsubscribe();};
 },[client]);
 async function submit(e:React.FormEvent){e.preventDefault();if(password.length<10){setMessage("Use at least 10 characters.");return;}if(password!==confirm){setMessage("Passwords do not match.");return;}
 setBusy(true);setMessage("");const {error}=await client.auth.updateUser({password});setBusy(false);
 if(error)setMessage(error.message);else{setMessage("Password saved. You can now sign in to PlantTrack.");await client.auth.signOut();}
 }
 return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f5f7fa"}}><section style={{width:"100%",maxWidth:460,background:"white",padding:32,borderRadius:16,boxShadow:"0 4px 24px #0012"}}>
 <h1>PlantTrack · Set your password</h1>
 {ready?<form onSubmit={submit} style={{display:"grid",gap:16}}>
 <p>Choose a password for your PlantTrack account.</p>
 <label>New password<input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",padding:12}}/></label>
 <label>Confirm password<input type="password" required minLength={10} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={{display:"block",width:"100%",padding:12}}/></label>
 <button type="submit" disabled={busy} style={{padding:12,background:"#123d70",color:"white",border:0,borderRadius:8}}>{busy?"Saving…":"Activate account"}</button>
 </form>:<p>{message||"Checking your invitation… If this link has expired, ask your PlantTrack administrator to resend the setup email."}</p>}
 {ready&&message&&<p role="status">{message}</p>}
 <p><a href="/">Return to PlantTrack sign-in</a></p>
 </section></main>;
}