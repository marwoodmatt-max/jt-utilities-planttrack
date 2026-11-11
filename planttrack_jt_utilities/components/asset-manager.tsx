"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, Search, Pencil, X, Save, RefreshCw } from "lucide-react";

type AssetRow = {
  id: string;
  asset_code: string;
  description: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  registration: string | null;
  location: string | null;
  hour_meter: number | string | null;
  status: string;
  loler_next_due?: string | null;
  loler_examined_at?: string | null;
};

type AssetForm = {
  asset_code: string;
  description: string;
  category: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  registration: string;
  location: string;
  hour_meter: string;
  status: string;
  loler_next_due: string;
  loler_examined_at: string;
};

const emptyForm: AssetForm = {
  asset_code: "", description: "", category: "", manufacturer: "", model: "",
  serial_number: "", registration: "", location: "", hour_meter: "", status: "available",
  loler_next_due: "", loler_examined_at: ""
};

const categories = [
  "Vehicle", "Plant", "Lifting equipment", "Trailer",
  "Agricultural equipment", "CAT & Genny calibration equipment"
];

const statuses = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In use" },
  { value: "in_workshop", label: "In workshop" },
  { value: "out_of_service", label: "Out of service" },
  { value: "off_hire", label: "Off hire" }
];

export default function AssetManager({ supabase, isAdmin, categoryFilter = "All" }: { supabase: SupabaseClient; isAdmin: boolean; categoryFilter?: string }) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [lolerRecordId, setLolerRecordId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAssets() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("assets")
      .select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status")
      .order("asset_code", { ascending: true })
      .limit(1000);
    if (loadError) setError("Could not load assets: " + loadError.message);
    else {
      const assetRows = (data || []) as AssetRow[];
      const assetIds = assetRows.map((asset) => asset.id);
      if (assetIds.length) {
        const { data: examinationRows, error: examinationError } = await supabase
          .from("examinations")
          .select("asset_id,next_due,examined_at,created_at")
          .ilike("examination_type", "%LOLER%")
          .in("asset_id", assetIds)
          .order("created_at", { ascending: false });
        if (examinationError) setError("Assets loaded, but LOLER dates could not be loaded: " + examinationError.message);
        const latestByAsset = new Map<string, { next_due: string | null; examined_at: string | null }>();
        for (const examination of examinationRows || []) {
          if (!latestByAsset.has(examination.asset_id)) {
            latestByAsset.set(examination.asset_id, { next_due: examination.next_due, examined_at: examination.examined_at });
          }
        }
        setRows(assetRows.map((asset) => ({
          ...asset,
          loler_next_due: latestByAsset.get(asset.id)?.next_due || null,
          loler_examined_at: latestByAsset.get(asset.id)?.examined_at || null
        })));
      } else setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadAssets(); }, [supabase]);

  const filtered = useMemo(() => rows.filter((a) =>
    (categoryFilter === "All" || (a.category || "").toLowerCase() === categoryFilter.toLowerCase()) &&
    [a.asset_code, a.description, a.category, a.registration, a.location, a.manufacturer, a.model]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  ), [rows, search, categoryFilter]);

  const categoryOptions = useMemo(
    () => Array.from(new Set([...categories, ...rows.map((r) => r.category || "").filter(Boolean)])).sort(),
    [rows]
  );

  function startNew() {
    setEditing("new");
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  async function startEdit(asset: AssetRow) {
    setEditing(asset.id);
    setLolerRecordId(null);
    setForm({
      asset_code: asset.asset_code || "",
      description: asset.description || "",
      category: asset.category || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      serial_number: asset.serial_number || "",
      registration: asset.registration || "",
      location: asset.location || "",
      hour_meter: asset.hour_meter == null ? "" : String(asset.hour_meter),
      status: asset.status || "available",
      loler_next_due: asset.loler_next_due || "",
      loler_examined_at: asset.loler_examined_at || ""
    });
    setMessage("");
    setError("");
    if ((asset.category || "").trim().toLowerCase() === "lifting equipment") {
      const { data, error: lolerError } = await supabase
        .from("examinations")
        .select("id,next_due,examined_at")
        .eq("asset_id", asset.id)
        .ilike("examination_type", "%LOLER%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lolerError) {
        setError("Could not load LOLER dates: " + lolerError.message);
      } else if (data) {
        setLolerRecordId(data.id);
        setForm((current) => ({
          ...current,
          loler_next_due: data.next_due || "",
          loler_examined_at: data.examined_at || ""
        }));
      }
    }
  }

  async function saveAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      asset_code: form.asset_code.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      registration: form.registration.trim() || null,
      location: form.location.trim() || null,
      hour_meter: form.hour_meter.trim() === "" ? null : Number(form.hour_meter),
      status: form.status
    };

    if (!payload.asset_code || !payload.description) {
      setError("Enter an asset code and description.");
      setSaving(false);
      return;
    }
    if (payload.hour_meter !== null && (!Number.isFinite(payload.hour_meter) || payload.hour_meter < 0)) {
      setError("Enter a valid non-negative hours reading.");
      setSaving(false);
      return;
    }

    const result = editing === "new"
      ? await supabase.from("assets").insert(payload).select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status").single()
      : await supabase.from("assets").update(payload).eq("id", editing).select("id, asset_code, description, category, manufacturer, model, serial_number, registration, location, hour_meter, status").single();

    let saveError = result.error;
    if (!saveError && editing !== "new" && (form.category || "").trim().toLowerCase() === "lifting equipment" && (form.loler_next_due || form.loler_examined_at)) {
      const examinationPayload = { asset_id: editing, examination_type: "LOLER", examination_scheme: "LOLER", next_due: form.loler_next_due || null, examined_at: form.loler_examined_at || null };
      const examinationResult = lolerRecordId
        ? await supabase.from("examinations").update(examinationPayload).eq("id", lolerRecordId)
        : await supabase.from("examinations").insert(examinationPayload);
      if (examinationResult.error) saveError = examinationResult.error;
    }

    if (saveError) {
      const duplicate = saveError.code === "23505";
      setError(duplicate
        ? "That asset code is already in use. Check the register and enter a unique code."
        : "The asset could not be saved: " + saveError.message);
    } else {
      setMessage(editing === "new" ? "Asset added to the live register." : "Asset details updated.");
      setEditing(null);
      setForm(emptyForm);
      await loadAssets();
    }
    setSaving(false);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "10px 11px", border: "1px solid #dcdce0",
    borderRadius: 6, background: "#fff", color: "#222", font: "inherit", marginTop: 6
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, margin: "12px 0" };

  return <section className="panel">
    <div className="panel-head">
      <div><h3>Live asset register</h3><p>{rows.length} assets · {isAdmin ? "Admin asset management enabled" : "View only"}</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => void loadAssets()}><RefreshCw size={15}/> Refresh</button>
        {isAdmin && <button className="primary" onClick={startNew}><Plus size={16}/> Add new asset</button>}
      </div>
    </div>

    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}

    {editing !== null && isAdmin && <form onSubmit={saveAsset} style={{ border: "1px solid #e5e5e8", borderRadius: 8, padding: 16, marginBottom: 18, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><span className="eyebrow">ADMIN ONLY</span><h3 style={{ marginTop: 5 }}>{editing === "new" ? "Add new asset" : "Edit asset details"}</h3></div>
        <button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label="Close form"><X size={19}/></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "0 14px" }}>
        <label style={labelStyle}>Asset code *<input style={fieldStyle} required value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} placeholder="Enter JT Utilities asset number"/></label>
        <label style={labelStyle}>Description *<input style={fieldStyle} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Asset description"/></label>
        <label style={labelStyle}>Category<select style={fieldStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="">Select category</option>{categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label style={labelStyle}>Manufacturer<input style={fieldStyle} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}/></label>
        <label style={labelStyle}>Model<input style={fieldStyle} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}/></label>
        <label style={labelStyle}>Serial number<input style={fieldStyle} value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })}/></label>
        <label style={labelStyle}>Registration<input style={fieldStyle} value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })}/></label>
        <label style={labelStyle}>Location<input style={fieldStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}/></label>
        <label style={labelStyle}>Hour meter<input style={fieldStyle} type="number" min="0" step="0.1" value={form.hour_meter} onChange={(e) => setForm({ ...form, hour_meter: e.target.value })}/></label>
        <label style={labelStyle}>Status<select style={fieldStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        {(form.category || "").trim().toLowerCase() === "lifting equipment" && editing !== "new" && <>
          <label style={labelStyle}>LOLER next examination due<input style={fieldStyle} type="date" value={form.loler_next_due} onChange={(e) => setForm({ ...form, loler_next_due: e.target.value })}/></label>
          <label style={labelStyle}>Actual LOLER examination date<input style={fieldStyle} type="date" value={form.loler_examined_at} onChange={(e) => setForm({ ...form, loler_examined_at: e.target.value })}/></label>
        </> }
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 12 }}>
        <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}><Save size={15}/>{saving ? "Saving…" : "Save asset"}</button>
      </div>
      <p className="fine">Asset numbers are entered manually. Existing asset records are retained when edited; changes are recorded in the audit log.</p>
    </form>}

    <div className="toolbar">
      <div className="search"><Search size={17}/><input placeholder="Search asset code, description, registration or location…" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
    </div>
    {loading ? <p className="muted">Loading assets…</p> : <div className="table-wrap">
      <table><thead><tr><th>Asset code</th><th>Description</th><th>Registration</th><th>Location</th><th>Hours</th><th>Next LOLER due</th><th>Last LOLER examination</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead>
      <tbody>{filtered.map((a) => <tr key={a.id}>
        <td><b>{a.asset_code}</b></td>
        <td>{a.description}<small>{a.category || "Uncategorised"}{a.manufacturer ? " · " + a.manufacturer : ""}{a.model ? " " + a.model : ""}</small></td>
        <td>{a.registration || "—"}</td><td>{a.location || "Not recorded"}</td>
        <td>{a.hour_meter == null ? "—" : a.hour_meter}</td>
        <td>{a.loler_next_due || "—"}</td><td>{a.loler_examined_at || "—"}</td>
        <td><span className="tag">{statuses.find((s) => s.value === a.status)?.label || a.status}</span></td>
        {isAdmin && <td><button className="secondary" onClick={() => startEdit(a)}><Pencil size={14}/> Edit</button></td>}
      </tr>)}</tbody></table>
      {!filtered.length && <p className="empty">No matching assets.</p>}
    </div>}
    <p className="muted" style={{ marginTop: 12 }}>Showing {filtered.length} of {rows.length} assets.</p>
  </section>;
}
