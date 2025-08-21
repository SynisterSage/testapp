import { useEffect, useMemo, useState } from "react";
import { suggestHz } from "../lib/targets.js";

const TOM_SIZES = [8, 10, 12, 13, 14, 16];
const SNARE_SIZES = [12, 13, 14];
const KICK_SIZES = [18, 20, 22, 24];

export default function DrumEditor({
  open,            // boolean
  mode,            // 'add' | 'edit'
  initial,         // drum object when editing (optional for add)
  onCancel,        // () => void
  onSave           // (payload) => void  // payload: { type, size_in, lugs, head, updateTarget:boolean }
}) {
  const [type, setType] = useState(initial?.type || "tom");
  const [size, setSize] = useState(initial?.size_in || 12);
  const [lugs, setLugs] = useState(initial?.lugs || (type === "snare" ? 10 : 8));
  const [head, setHead] = useState(initial?.head || "both");
  const [updateTarget, setUpdateTarget] = useState(mode === "add"); // default on for add, off for edit

  // keep lugs sensible when switching type
  useEffect(() => {
    if (mode === "add") setLugs(type === "snare" ? 10 : 8);
  }, [type]);

  // change size options per type
  const sizeOptions = useMemo(() => {
    if (type === "kick") return KICK_SIZES;
    if (type === "snare") return SNARE_SIZES;
    return TOM_SIZES;
  }, [type]);

  // if current size not in new options, set a default
  useEffect(() => {
    if (!sizeOptions.includes(size)) setSize(sizeOptions[0]);
  }, [sizeOptions, size]);

  const suggested = useMemo(() => suggestHz(type, size), [type, size]);

  function save() {
    onSave({ type, size_in: size, lugs: Number(lugs), head, updateTarget });
  }

  return (
    <div className={"sheet " + (open ? "sheet--open" : "")} onClick={onCancel}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="brand-text" style={{ marginBottom: 8 }}>
          <span className="headline">{mode === "add" ? "Add Drum" : "Edit Drum"}</span>
          <span className="sub">type • size • lugs</span>
        </div>

        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="tom">Tom</option>
            <option value="snare">Snare</option>
            <option value="kick">Kick</option>
          </select>
        </div>

        <div className="field">
          <label>Size (inches)</label>
          <select value={size} onChange={(e)=>setSize(Number(e.target.value))}>
            {sizeOptions.map(s => <option key={s} value={s}>{s}″</option>)}
          </select>
        </div>

        <div className="field">
          <label>Lugs</label>
          <select value={lugs} onChange={(e)=>setLugs(Number(e.target.value))}>
            <option value={6}>6</option>
            <option value={8}>8</option>
            <option value={10}>10</option>
          </select>
        </div>

        <div className="field">
          <label>Head</label>
          <select value={head} onChange={(e)=>setHead(e.target.value)}>
            <option value="both">Both</option>
            <option value="batter">Batter (top)</option>
            <option value="reso">Reso (bottom)</option>
          </select>
        </div>

        <div className="field">
          <label>Suggested target</label>
          <div className="hint">≈ <strong>{suggested}</strong> Hz for {size}″ {type}</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={updateTarget} onChange={(e)=>setUpdateTarget(e.target.checked)} />
            <span>Update target to suggested when saving</span>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <button className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button className="primary-btn" onClick={save}>{mode === "add" ? "Add Drum" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
