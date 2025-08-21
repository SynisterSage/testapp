import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { suggestHz } from "../lib/targets.js";
import { useToast } from "../ui/ToastProvider.jsx";
import "../styles/kit.compact.css";
import "../styles/kit.ui.css";

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const h = t.getHours();
  const h12 = ((h + 11) % 12) + 1;
  const m = String(t.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${m} ${ampm}`;
}

const DrumIcon = ({ type }) => (
  <div className="tile-icon" aria-hidden>
    {type === "kick" ? "🦶" : type === "snare" ? "🥁" : "🛢️"}
  </div>
);

/* ---------- Target logic helpers ---------- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function typicalLugs(type, size) {
  if (type === "snare") return 10;
  if (type === "kick") return 8;
  return Number(size) >= 14 ? 8 : 6; // toms
}
function defaultsForType(type) {
  if (type === "kick")  return { size: 22, lugs: 8 };
  if (type === "snare") return { size: 14, lugs: 10 };
  return { size: 12, lugs: 6 }; // tom default
}


// Base curves so kick/snare react to size too
function baseKickHz(sizeIn) {
  const s = Number(sizeIn) || 22;          // ref 22"
  const ref = 60;                           // 22" ≈ 60 Hz
  const hz = ref * Math.pow(22 / s, 0.7);   // smaller → higher
  return clamp(hz, 45, 85);
}
function baseSnareHz(sizeIn) {
  const s = Number(sizeIn) || 14;          // ref 14"
  const ref = 260;                          // 14" ≈ 260 Hz
  const hz = ref * Math.pow(14 / s, 0.9);
  return clamp(hz, 180, 400);
}
function computeBaseHz(type, size) {
  if (type === "kick")  return Math.round(baseKickHz(size));
  if (type === "snare") return Math.round(baseSnareHz(size));
  // toms use your library
  return Math.round(Number(suggestHz(type, size)) || 150);
}

/** Final suggested target with lugs nudge (~4% per step, ±8% clamp) */
function computeTargetHz(type, size, lugs) {
  const base = computeBaseHz(type, size);
  const typical = typicalLugs(type, Number(size));
  const ratio = typical ? (Number(lugs || typical) / typical) : 1;
  const factor = clamp(1 + 0.04 * (ratio - 1), 0.92, 1.08);
  return Math.round(base * factor);
}

export default function Kit() {
  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const clock = useClock();
  const { show } = (() => { try { return useToast(); } catch { return { show: () => {} }; } })();

  const drums = state.kit.drums ?? [];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null | drum obj

  // Template definitions (ids drive order: high→low toms applied below)
  const templates = [
    { name: "3-piece", ids: ["kick", "snare", "tom"] },
    { name: "4-piece", ids: ["kick", "snare", "tom", "tom"] },
    { name: "5-piece", ids: ["kick", "snare", "tom", "tom", "tom"] },
  ];

  function applyTemplate(t) {
    const kick  = { type: "kick",  size_in: 22, lugs: 8 };
    const snare = { type: "snare", size_in: 14, lugs: 10 };
    const toms  = [
      { type: "tom", size_in: 10, lugs: 6 }, // high rack
      { type: "tom", size_in: 12, lugs: 6 }, // mid rack
      { type: "tom", size_in: 16, lugs: 8 }, // floor
    ];

    const out = [];
    let tomIndex = 0;
    for (const id of t.ids) {
      if (id === "kick") out.push(kick);
      else if (id === "snare") out.push(snare);
      else {
        // 3-pc: just floor 16; 4-pc: 12,16; 5-pc: 10,12,16
        const size =
          t.ids.length === 3 ? toms[2] :
          t.ids.length === 4 ? (tomIndex++ === 0 ? toms[1] : toms[2]) :
          toms[Math.min(tomIndex++, toms.length - 1)];
        out.push(size);
      }
    }

    const hydrated = out.map(d => {
      const hz = computeTargetHz(d.type, d.size_in, d.lugs);
      return {
        id: crypto.randomUUID?.() || String(Math.random()),
        type: d.type,
        size_in: d.size_in,
        lugs: d.lugs,
        target: { batter_hz: hz, reso_ratio: 1.06 },
      };
    });

    actions.replaceKit?.({ drums: hydrated });
  }

  function openAdd() {
    const type = "tom", size = 12, lugs = 6;
    setEditing({
      id: null,
      type, size_in: size, lugs,
      target: { batter_hz: computeTargetHz(type, size, lugs) }
    });
    setSheetOpen(true);
  }
  function openEdit(d) { setEditing(d); setSheetOpen(true); }
  function closeSheet() { setSheetOpen(false); setEditing(null); }

  function saveDrum(form) {
    const isNew = !form.id;
    const drum = {
      id: form.id || crypto.randomUUID?.() || String(Date.now()),
      type: form.type,
      size_in: Number(form.size_in || 12),
      lugs: Number(form.lugs || 6),
      target: {
        batter_hz: Number((form.target?.batter_hz ?? form.batter_hz) || computeTargetHz(form.type, form.size_in, form.lugs)),
        reso_ratio: 1.06,
      }
    };
    if (isNew) {
      actions.addDrum?.(drum);
      show?.("Drum added ✅");
    } else {
      // keep your existing action signature
      actions.updateDrum?.(drum);
      show?.("Drum saved ✅");
    }
    closeSheet();
  }

  function removeDrum(id) {
    actions.removeDrum?.(id);
    show?.("Drum deleted 🗑️");
  }

  // Auto-update target when TYPE / SIZE / LUGS change
  function handleTypeChange(newType) {
  const { size, lugs } = defaultsForType(newType);
  setEditing(prev => ({
    ...prev,
    type: newType,
    size_in: size,          // RESET size to type default
    lugs,                   // RESET lugs to type default
    target: {
      ...(prev?.target || {}),
      batter_hz: computeTargetHz(newType, size, lugs),
    },
  }));
}
  
  function handleSizeChange(val) {
    const size = Number(val || 12);
    const type = editing?.type || "tom";
    const lugs = Number(editing?.lugs ?? typicalLugs(type, size));
    setEditing(prev => ({
      ...prev,
      size_in: size,
      target: { ...(prev?.target || {}), batter_hz: computeTargetHz(type, size, lugs) },
    }));
  }
  function handleLugsChange(val) {
    const lugs = Number(val || 6);
    const type = editing?.type || "tom";
    const size = Number(editing?.size_in ?? 12);
    setEditing(prev => ({
      ...prev,
      lugs,
      target: { ...(prev?.target || {}), batter_hz: computeTargetHz(type, size, lugs) },
    }));
  }

  const rows = useMemo(() => drums, [drums]);

  return (
    <div className="kit-page kit--compact">
      {/* Top brand row */}
      <div className="dash-top">
        <div>
          <div className="brand-tag-title">OVERTONE</div>
        <div className="brand-tag-sub">Mobile Drum Tuner</div>
        </div>
        <button className="top-gear" aria-label="Settings" onClick={() => navigate("/settings")}>⚙︎</button>
      </div>

      {/* Page title */}
      <div className="dash-welcome welcome-row">
        <div className="tile-title kit-page-title">Your Kit</div>
        <div className="top-clock">{clock}</div>
      </div>

      {/* Templates card — subtitle under header; pills scroll */}
      <section className="panel dash-tile dash-tile--wide tile--template">
        <div className="tile-head tile-head--row">
          <div className="tile-icon">📦</div>
          <div className="tile-title">Templates</div>
        </div>
        <div className="tile-sub tile-sub--below">Start with a common setup</div>

        <div
          className="template-chips"
          style={{
            display: "flex",
            gap: 10,
            marginTop: 10,
            overflowX: "auto",
            padding: "2px 2px",
            flexWrap: "nowrap",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {templates.map(t => (
            <button key={t.name} className="action-chip" onClick={() => applyTemplate(t)}>
              {t.name}
            </button>
          ))}
          <button className="action-chip action-chip--ghost" onClick={() => actions.replaceKit?.({ drums: [] })}>
            Reset
          </button>
        </div>
      </section>

      {/* List of drums */}
      <section className="list-stack">
        {rows.map((d) => (
          <article
            key={d.id}
            className="panel list-card"
            onClick={() => openEdit(d)}
            role="button"
          >
            <div className="list-left"><DrumIcon type={d.type} /></div>
            <div className="list-main">
              <div className="list-title">{d.size_in}″ {d.type}</div>
              <div className="list-sub">
                {d.lugs} lugs • Target {Math.round(d.target?.batter_hz ?? computeTargetHz(d.type, d.size_in, d.lugs))} Hz
              </div>
            </div>

            <div className="list-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn icon-btn--edit" aria-label="Edit drum" onClick={() => openEdit(d)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="m14.06 6.19 1.77-1.77a1.5 1.5 0 0 1 2.12 0l1.63 1.63a1.5 1.5 0 0 1 0 2.12l-1.77 1.77" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              </button>
              <button className="icon-btn icon-btn--delete" aria-label="Delete drum" onClick={() => removeDrum(d.id)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M6 7 7 20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              </button>
            </div>
          </article>
        ))}

        {/* Add drum */}
        <article className="panel list-card list-card--add" onClick={openAdd} role="button">
          <div className="list-left"><div className="tile-icon">＋</div></div>
          <div className="list-main">
            <div className="list-title">Add Drum</div>
            <div className="list-sub">Type • size • lugs • target</div>
          </div>
          <div className="tile-arrow tile-arrow--circle" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </article>
      </section>

      {/* Bottom sheet */}
      <div className={`sheet ${sheetOpen ? "sheet--open" : ""}`} onClick={closeSheet}>
        <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="panel-title" style={{ marginBottom: 8 }}>
            {editing?.id ? "Edit Drum" : "Add Drum"}
          </div>

          <div className="field">
            <label>Type</label>
            <select
              value={editing?.type || "tom"}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="kick">Kick</option>
              <option value="snare">Snare</option>
              <option value="tom">Tom</option>
            </select>
          </div>

          <div className="field">
            <label>Size (inches)</label>
            <input
              type="number"
              min="6"
              max="28"
              value={editing?.size_in ?? 12}
              onChange={(e) => handleSizeChange(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Lugs</label>
            <input
              type="number"
              min="4"
              max="24"
              value={editing?.lugs ?? typicalLugs(editing?.type || "tom", editing?.size_in || 12)}
              onChange={(e) => handleLugsChange(e.target.value)}
            />
          </div>

          <div className="hint" style={{ marginTop: 4 }}>
            Suggested target: {computeTargetHz(editing?.type || "tom", editing?.size_in || 12, editing?.lugs ?? typicalLugs(editing?.type || "tom", editing?.size_in || 12))} Hz
          </div>

          <div className="field">
            <label>Target Hz</label>
            <input
              type="number"
              min="20"
              max="600"
              value={editing?.target?.batter_hz ?? computeTargetHz(editing?.type || "tom", editing?.size_in || 12, editing?.lugs ?? typicalLugs(editing?.type || "tom", editing?.size_in || 12))}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  target: { ...(editing?.target || {}), batter_hz: Number(e.target.value) },
                })
              }
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {editing?.id && (
              <button className="ghost-btn" onClick={() => { removeDrum(editing.id); closeSheet(); }}>
                Delete
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="primary-btn" onClick={() => saveDrum(editing)}>
              {editing?.id ? "Save" : "Add Drum"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
