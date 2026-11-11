 "use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck,
  Clock3, FileCheck2, FileText, LayoutDashboard, Menu, Search, Settings, ShieldCheck,
  Truck, Users, Wrench, X, Plus, Bell, ArrowUpRight, QrCode, History, Download
} from "lucide-react";

type Asset = { id:string; name:string; category:string; location:string; hours:string; status:string; loler:string; service:string };
type DbAsset = { id:string; asset_code:string; description:string; category:string|null; manufacturer:string|null; model:string|null; serial_number:string|null; registration:string|null; location:string|null; hour_meter:number|string|null; status:string };
function displayStatus(status:string) {
  const labels:Record<string,string> = { available:"Available", in_use:"In use", in_workshop:"In workshop", out_of_service:"Out of service", off_hire:"Off hire" };
  return labels[status] || status;
}
const jobs = [
  {id:"JC-00128",asset:"EX-024",fault:"Hydraulic oil leak at boom cylinder",priority:"High",status:"Awaiting allocation",date:"11 Nov 2026"},
  {id:"JC-00131",asset:"FL-012",fault:"Investigate brake performance",priority:"Critical",status:"In progress",date:"10 Nov 2026"},
  {id:"JC-00134",asset:"RD-015",fault:"Scheduled service and inspection",priority:"Normal",status:"Awaiting parts",date:"09 Nov 2026"}
];
const nav = [
  ["Dashboard",LayoutDashboard],["Plant register",Truck],["Inspection calendar",CalendarDays],
  ["Plant checks",ClipboardCheck],["LOLER & certificates",FileCheck2],
  ["Workshop job cards",Wrench],["Maintenance history",History],["Users & sign-offs",Users],["Reports",Activity]
] as const;
function Tag({children,tone="neutral"}:{children:React.ReactNode;tone?:string}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Dashboard({supabase}:{supabase:SupabaseClient}) {
  const [page,setPage]=useState("Dashboard");
  const [query,setQuery]=useState("");
  const [assets,setAssets]=useState<Asset[]>([]);
  const [assetsLoading,setAssetsLoading]=useState(true);
  const [assetsError,setAssetsError]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [assetFilter,setAssetFilter]=useState("All");
  const [jobStatus,setJobStatus]=useState("All");
  const [notice,setNotice]=useState("");
  const [form,setForm]=useState({asset:"",fault:"",priority:"Normal"});
  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setAssetsLoading(true);
      setAssetsError("");
      try {
        // Confirm the authenticated session before requesting protected asset rows.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          throw new Error("Your session has expired. Please sign out and sign in again.");
        }

        const { data, error } = await supabase
          .from("assets")
          .select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status")
          .order("asset_code", { ascending: true })
          .limit(1000);

        if (error) throw error;
        if (cancelled) return;

        const mapped = ((data || []) as DbAsset[]).map((item) => ({
          id: item.asset_code,
          name: item.description || [item.manufacturer, item.model].filter(Boolean).join(" ") || "Description not recorded",
          category: item.category || "Uncategorised",
          location: item.location || "Not recorded",
          hours: item.hour_meter == null ? "—" : String(item.hour_meter),
          status: displayStatus(item.status),
          loler: "Not recorded",
          service: "Not recorded"
        }));
        setAssets(mapped);
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : String(loadError);
          setAssetsError(`Could not load assets: ${message}`);
          setAssets([]);
        }
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    }

    loadAssets();
    return () => { cancelled = true; };
  }, [supabase]);
  const filtered=useMemo(()=>assets.filter(a=>(a.id+" "+a.name+" "+a.location).toLowerCase().includes(query.toLowerCase()) && (assetFilter==="All"||a.status===assetFilter)),[query,assetFilter]);
  const filteredJobs=jobs.filter(j=>jobStatus==="All"||j.status===jobStatus);
  function action(msg:string){setNotice(msg);setTimeout(()=>setNotice(""),3500)}
  const title=page;
  return <div className="shell">
    <aside className={`sidebar ${mobileNav?"open":""}`}>
      <div className="brand"><img className="brand-logo" src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd logo" /><div><b>JT UTILITIES LTD</b><small>PLANTTRACK</small></div><button className="close-nav" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="nav-caption">WORKSPACE</div>
      {nav.map(([label,Icon])=><button key={label} onClick={()=>{setPage(label);setMobileNav(false)}} className={`nav-item ${page===label?"active":""}`}><Icon size={18}/><span>{label}</span>{label==="Workshop job cards"&&<em>3</em>}</button>)}
      <div className="sidebar-bottom"><div className="online-dot"/> Online workspace <small>v0.1 prototype</small></div>
    </aside>
    {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">JT Utilities <span>/</span> {title}</div><div className="top-actions"><button className="icon-btn" onClick={()=>action("No new notifications in this prototype.")}><Bell size={18}/></button><div className="avatar">JT</div></div></header>
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">JT UTILITIES LTD · PLANT MANAGEMENT</div><h1>{title}</h1><p>Wednesday, 11 November 2026 · Central workshop</p></div><button className="primary" onClick={()=>setShowNew(true)}><Plus size={17}/> New {page==="Workshop job cards"?"job card":"record"}</button></div>
        {notice&&<div className="notice">{notice}</div>}
        {page==="Dashboard"&&<>
          <div className="welcome"><div><span className="eyebrow light">FLEET OVERVIEW</span><h2>Good morning, JT Utilities.</h2><p>Your plant, inspections and workshop activity at a glance.</p></div><div className="welcome-icon"><Truck size={58}/></div></div>
          <div className="stats">
            {[["Total plant","68","Across all categories",Truck],["Available","57","Ready for allocation",CheckCircle2],["Inspections due","12","Next 30 days",CalendarDays],["Open job cards","18","3 critical / high",Wrench]].map(([label,value,sub,Icon]:any)=><div className="stat" key={label}><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{sub}</small></div>)}
          </div>
          <div className="two-col"><section className="panel"><div className="panel-head"><div><h3>Attention required</h3><p>Items requiring management action</p></div><Tag tone="red">Action needed</Tag></div>{[["LOLER examinations","3 overdue","red"],["Plant checks","5 outstanding","amber"],["Workshop jobs","4 awaiting parts","amber"],["Defects requiring review","2 new reports","red"]].map(x=><div className="attention" key={x[0]}><span className={`bullet ${x[2]}`}/><div><b>{x[0]}</b><small>{x[1]}</small></div><ArrowUpRight size={16}/></div>)}</section><section className="panel"><div className="panel-head"><div><h3>Upcoming inspections</h3><p>Next scheduled activities</p></div><button className="text-btn" onClick={()=>setPage("Inspection calendar")}>View calendar</button></div>{[["13 Nov","EX-024","LOLER examination"],["14 Nov","FL-012","Weekly plant check"],["16 Nov","MEWP-008","LOLER examination"],["19 Nov","RD-015","Planned service"]].map(x=><div className="event" key={x[1]}><div className="datebox"><b>{x[0].split(" ")[0]}</b><small>NOV</small></div><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</section></div>
          <section className="panel"><div className="panel-head"><div><h3>Recent workshop activity</h3><p>Latest job card updates</p></div><button className="text-btn" onClick={()=>setPage("Workshop job cards")}>All job cards</button></div><JobTable jobs={jobs.slice(0,3)}/></section>
        </>}
        {page==="Plant register"&&<section className="panel"><div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Search asset, machine or location..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={assetFilter} onChange={e=>setAssetFilter(e.target.value)}><option value="All">All</option><option value="Available">Available</option><option value="In use">In use</option><option value="In workshop">In workshop</option><option value="Out of service">Out of service</option><option value="Off hire">Off hire</option></select><button className="secondary" onClick={()=>action("Asset export will be enabled when connected to the live database.")}><Download size={16}/> Export</button></div><AssetTable rows={filtered}/>{assetsLoading&&<p className="muted">Loading assets from the live register…</p>}{assetsError&&<p className="auth-error">{assetsError}</p>}<p className="muted">{assets.length} assets loaded from the live register.</p></section>}
        {page==="Workshop job cards"&&<section className="panel"><div className="toolbar"><div><h3>Workshop work queue</h3><p>Central workshop · All maintenance requests</p></div><select value={jobStatus} onChange={e=>setJobStatus(e.target.value)}><option>All</option><option>Awaiting allocation</option><option>In progress</option><option>Awaiting parts</option></select></div><JobTable jobs={filteredJobs}/></section>}
        {page==="Inspection calendar"&&<Calendar action={action}/>}
        {page==="Plant checks"&&<Checks action={action}/>}
        {page==="LOLER & certificates"&&<section className="panel"><div className="panel-head"><div><h3>Examination register</h3><p>Illustrative records – replace with verified asset data</p></div><Tag tone="amber">3 require attention</Tag></div><AssetTable rows={assets}/></section>}
        {page==="Maintenance history"&&<section className="panel"><h3>Maintenance history</h3><p className="muted">A chronological record of work, inspections, parts and approvals for each asset.</p><JobTable jobs={jobs}/></section>}
        {page==="Users & sign-offs"&&<UsersPanel action={action}/>}
        {page==="Reports"&&<Reports/>}
      </div>
    </main>
    {showNew&&<div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">WORKSHOP</span><h2>Raise a job card</h2></div><button className="icon-btn" onClick={()=>setShowNew(false)}><X/></button></div><label>Plant asset<select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})}><option value="">Select asset</option>{assets.map(a=><option key={a.id}>{a.id} – {a.name}</option>)}</select></label><label>Fault / work required<textarea value={form.fault} onChange={e=>setForm({...form,fault:e.target.value})} placeholder="Describe the fault or maintenance required..."/></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Normal</option><option>High</option><option>Critical</option></select></label><div className="modal-actions"><button className="secondary" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary" onClick={()=>{if(!form.asset||!form.fault.trim()){action("Select an asset and enter the fault description.");return;}action("Prototype only: job card form validated. Connect the database to save live job cards.");setShowNew(false);setForm({asset:"",fault:"",priority:"Normal"});}}>Create job card <ArrowUpRight size={16}/></button></div><p className="fine">Live saving, user identity and audit history require the configured backend.</p></div></div>}
    </div>;
}
function AssetTable({rows}:{rows:Asset[]}) {return <div className="table-wrap"><table><thead><tr><th>Asset code</th><th>Description</th><th>Location</th><th>Hours</th><th>LOLER / exam due</th><th>Status</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><b>{a.id}</b></td><td>{a.name}<small>{a.category}</small></td><td>{a.location}</td><td>{a.hours}</td><td>{a.loler}</td><td><Tag tone={a.status==="Available"?"green":a.status==="In workshop"?"amber":"red"}>{a.status}</Tag></td></tr>)}</tbody></table>{!rows.length&&<p className="empty">No matching assets.</p>}</div>}
function JobTable({jobs}:{jobs:any[]}) {return <div className="table-wrap"><table><thead><tr><th>Job reference</th><th>Asset</th><th>Fault / work required</th><th>Priority</th><th>Status</th><th>Date raised</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td><b>{j.id}</b></td><td>{j.asset}</td><td>{j.fault}</td><td><Tag tone={j.priority==="Critical"?"red":j.priority==="High"?"amber":"neutral"}>{j.priority}</Tag></td><td><Tag tone={j.status==="In progress"?"blue":"amber"}>{j.status}</Tag></td><td>{j.date}</td></tr>)}</tbody></table>{!jobs.length&&<p className="empty">No job cards match this filter.</p>}</div>}
function Calendar({action}:{action:(s:string)=>void}) {const [month,setMonth]=useState(10);const names=["January","February","March","April","May","June","July","August","September","October","November","December"];const first=new Date(2026,month,1).getDay();const count=new Date(2026,month+1,0).getDate();const events:any={13:"LOLER",14:"Check",16:"LOLER",19:"Service",24:"Check",27:"Service"};return <section className="panel"><div className="panel-head"><div><h3>{names[month]} 2026</h3><p>Inspection and maintenance schedule</p></div><div><button className="secondary" onClick={()=>setMonth((month+11)%12)}>‹</button> <button className="secondary" onClick={()=>setMonth((month+1)%12)}>›</button></div></div><div className="calendar-grid">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><b key={d}>{d}</b>)}{Array.from({length:first},(_,i)=><div key={"blank"+i}/>)}{Array.from({length:count},(_,i)=>i+1).map(d=><div className="day" key={d}><span>{d}</span>{events[d]&&<small className={events[d]==="LOLER"?"red-event":"green-event"}>{events[d]}</small>}</div>)}</div><div className="legend"><span className="red-event">LOLER / examination</span><span className="green-event">Check / service</span></div><button className="primary" onClick={()=>action("Calendar event form is ready for backend integration.")}><Plus size={16}/> Schedule event</button></section>}
function Checks({action}:{action:(s:string)=>void}) {const items=["Engine oil and coolant","Brakes and steering","Tyres / tracks","Hydraulic hoses and leaks","Lights and warning devices","Safety equipment","General condition"];const [answers,setAnswers]=useState<Record<string,string>>({});return <section className="panel"><div className="panel-head"><div><h3>Operator plant check</h3><p>Example daily inspection form</p></div><Tag tone="blue">Draft</Tag></div><label>Asset<select><option>EX-024 – 20T Excavator</option><option>FL-012 – Forklift</option></select></label>{items.map(i=><div className="check-row" key={i}><b>{i}</b><div><button className={answers[i]==="Pass"?"choice selected": "choice"} onClick={()=>setAnswers({...answers,[i]:"Pass"})}>Pass</button><button className={answers[i]==="Fail"?"choice fail selected": "choice fail"} onClick={()=>setAnswers({...answers,[i]:"Fail"})}>Fail</button><button className={answers[i]==="N/A"?"choice selected": "choice"} onClick={()=>setAnswers({...answers,[i]:"N/A"})}>N/A</button></div></div>)}<label>Comments<textarea placeholder="Record observations or defects..."/></label><button className="primary" onClick={()=>action("Demo form only. Live authenticated submission and defect escalation require backend setup.")}>Submit check for sign-off</button></section>}
function UsersPanel({action}:{action:(s:string)=>void}) {return <section className="panel"><div className="panel-head"><div><h3>Users and permissions</h3><p>Proposed role structure</p></div><Tag tone="blue">Access control</Tag></div>{["Plant Manager","Operator / Driver","Workshop Mechanic","Inspector","Director / Administrator"].map((r,i)=><div className="attention" key={r}><div className="avatar">{r.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><b>{r}</b><small>{["Fleet, schedules, jobs and approvals","Assigned plant checks and defects","Assigned jobs, labour and parts","Assigned examinations and reports","Read-only oversight and management reports"][i]}</small></div><Tag>Role</Tag></div>)}<button className="primary" onClick={()=>action("User administration will be activated with Supabase Auth and role policies.")}><Plus size={16}/> Add user</button></section>}
function Reports(){return <section className="panel"><h3>Management reporting</h3><p className="muted">Example reporting categories for the first release.</p><div className="report-grid">{["Inspection compliance","LOLER due and overdue","Workshop workload","Plant downtime","Maintenance costs","User sign-off audit"].map((x,i)=><div className="report-card" key={x}><FileText/><b>{x}</b><small>Report template</small></div>)}</div></section>}


function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default function Home() {
  const [supabase] = useState<SupabaseClient | null>(() => getSupabase());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [roleName, setRoleName] = useState("");

  useEffect(() => {
    if (!supabase) { setSessionReady(true); return; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (data.session) await loadProfile(data.session.user.id);
      else setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        // Defer profile query to avoid running Supabase calls inside the auth callback.
        window.setTimeout(() => { if (alive) loadProfile(session.user.id); }, 0);
      } else {
        setSignedIn(false); setDisplayName(""); setRoleName(""); setSessionReady(true);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from("profiles").select("full_name, role, active").eq("id", userId).single();
    if (profileError || !data || !data.active) {
      await supabase.auth.signOut();
      setError("Your login is not linked to an active PlantTrack profile. Please contact the Plant Manager.");
      setSessionReady(true);
      return;
    }
    setDisplayName(data.full_name);
    setRoleName(String(data.role).replaceAll("_", " "));
    setSignedIn(true);
    setSessionReady(true);
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError("Sign-in failed. Check your email and password, then try again.");
    setBusy(false);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  if (!supabase) return <div className="auth-screen"><div className="auth-card"><img src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd" /><h1>PlantTrack</h1><p>Supabase connection settings are missing. Add the project URL and publishable key in Vercel Environment Variables, then redeploy.</p></div></div>;
  if (!sessionReady) return <div className="auth-screen"><div className="auth-card"><p>Checking your secure PlantTrack session…</p></div></div>;
  if (!signedIn) return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}>
    <img src="/jt-utilities-logo.jpg" alt="JT Utilities Ltd logo" />
    <div className="auth-eyebrow">JT UTILITIES LTD</div><h1>PlantTrack</h1>
    <p>Sign in to your plant management workspace.</p>
    <label htmlFor="planttrack-email">Company email</label>
    <input id="planttrack-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} />
    <label htmlFor="planttrack-password">Password</label>
    <input id="planttrack-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} />
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="primary auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    <small>Access is provided through your individual JT Utilities account.</small>
  </form></main>;
  return <><div className="signed-in-strip"><span>Signed in: <b>{displayName}</b> · {roleName}</span><button onClick={signOut}>Sign out</button></div><Dashboard supabase={supabase} /></>;
}
