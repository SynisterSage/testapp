import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { suggestHz } from "../lib/targets.js";

function useClock() {
  const [t, setT] = useState(() => new Date());
  React.useEffect(() => {
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

export default function Kit() {
  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const clock = useClock();

  const drums = state.kit.drums ?? [];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null | drum obj

  const templates = [
    { name: "3-piece", ids: ["kick", "snare", "tom"] },
    { name: "4-piece", ids: ["kick", "snare", "tom", "tom"] },
    { name: "5-piece", ids: ["kick", "snare", "tom", "tom", "tom"] },
  ];

  function applyTemplate(t) {
    // light template: sizes default; user edits after
    const base = [
      { type: "kick", size_in: 22, lugs: 8 },
      { type: "snare", size_in: 14, lugs: 10 },
      { type: "tom", size_in: 10, lugs: 6 },
      { type: "tom", size_in: 12, lugs: 6 },
      { type: "tom", size_in: 16, lugs: 8 },
    ];
    const out = [];
    for (const id of t.ids) out.push(base.find(b => b.type === id) || base[2]);
    const hydrated = out.map(d => ({
      id: crypto.randomUUID?.() || String(Math.random()),
      type: d.type,
      size_in: d.size_in,
      lugs: d.lugs,
      // builder sets only batter target; tuner can compute reso via ratio
      target: { batter_hz: suggestHz(d.type, d.size_in), reso_ratio: 1.06 }
    }));
    actions.replaceKit?.({ drums: hydrated });
  }

  function openAdd() { setEditing({ id: null, type: "tom", size_in: 12, lugs: 6 }); setSheetOpen(true); }
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
        batter_hz: Number(form.batter_hz || suggestHz(form.type, form.size_in)),
        reso_ratio: 1.06, // fixed here; tuner still lets user hear reso
      }
    };
    if (isNew) actions.addDrum?.(drum);
    else actions.updateDrum?.(drum);
    closeSheet();
  }

  function removeDrum(id) {
    actions.removeDrum?.(id);
  }

  const rows = useMemo(() => drums, [drums]);

  return (
    <div className="kit-page">
      {/* Top brand row (matches Home/Tuner) */}
      <div className="dash-top">
        <div>
          <div className="brand-tag-title">OVERTONE</div>
          <div className="brand-tag-sub">Mobile Drum Tuner</div>
        </div>
        <button className="top-gear" onClick={() => navigate("/settings")} aria-label="Settings">
          {/* use the same glyph as Home */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="M19.4 13.5c.04-.5.04-1 .0-1.5l2-.9-1-3.1-2.2.3a7 7 0 0 0-1.1-.9l.2-2.2-3.1-1-1 2a7 7 0 0 0-1.5 0l-.9-2-3.1 1 .3 2.2c-.4.3-.7.6-1 .9l-2.1-.3-1 3.1 2 .9a7 7 0 0 0 0 1.5l-2 .9 1 3.1 2.2-.3c.3.4.6.7 1 .9l-.3 2.2 3.1 1 .9-2c.5.05 1 .05 1.5 0l.9 2 3.1-1-.3-2.2c.4-.3.7-.6 1-.9l2.2.3 1-3.1-2-.9Z" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
        </button>
      </div>

      <div className="dash-welcome welcome-row">
        <div className="tile-title">Your Kit</div>
        <div className="top-clock">{clock}</div>
      </div>

      {/* Templates card */}
      <section className="panel dash-tile dash-tile--wide">
        <div className="tile-head">
          <div className="tile-icon">📦</div>
          <div>
            <div className="tile-title">Templates</div>
            <div className="tile-sub">Start with a common setup</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {templates.map(t => (
            <button key={t.name} className="action-chip" onClick={() => applyTemplate(t)}>
              {t.name}
            </button>
          ))}
          <button className="action-chip" onClick={() => actions.replaceKit?.({ drums: [] })}>
            Reset to Template
          </button>
        </div>

        <div className="tile-arrow" aria-hidden>›</div>
      </section>

      {/* List view of drums */}
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
                {d.lugs} lugs • Target {Math.round(d.target?.batter_hz ?? suggestHz(d.type, d.size_in))} Hz (batter)
              </div>
            </div>
            <div className="tile-arrow">›</div>
          </article>
        ))}

        {/* Add drum row */}
        <article className="panel list-card" onClick={openAdd} role="button">
          <div className="list-left"><div className="tile-icon">＋</div></div>
          <div className="list-main">
            <div className="list-title">Add Drum</div>
            <div className="list-sub">Type • size • lugs • target</div>
          </div>
          <div className="tile-arrow">›</div>
        </article>
      </section>

      {/* Bottom sheet editor (no batter/reso choice here) */}
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
              onChange={(e) => setEditing({ ...editing, type: e.target.value })}
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
              onChange={(e) => setEditing({ ...editing, size_in: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label>Lugs</label>
            <input
              type="number"
              min="4"
              max="24"
              value={editing?.lugs ?? 6}
              onChange={(e) => setEditing({ ...editing, lugs: Number(e.target.value) })}
            />
          </div>

          <div className="hint" style={{ marginTop: 4 }}>
            Suggested target (batter): {Math.round(suggestHz(editing?.type || "tom", editing?.size_in || 12))} Hz
          </div>

          <div className="field">
            <label>Target (batter) Hz</label>
            <input
              type="number"
              min="20"
              max="600"
              value={
                editing?.target?.batter_hz ??
                Math.round(suggestHz(editing?.type || "tom", editing?.size_in || 12))
              }
              onChange={(e) =>
                setEditing({
                  ...editing,
                  target: {
                    ...(editing?.target || {}),
                    batter_hz: Number(e.target.value),
                  },
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
