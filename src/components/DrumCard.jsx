function labelFor(drum) {
    if (drum.type === "kick") return `${drum.size_in}″ Kick`;
    if (drum.type === "snare") return `${drum.size_in}″ Snare`;
    return `${drum.size_in}″ Tom`;
  }
  
  export default function DrumCard({ drum, onSetActive, onDelete, onEdit, isActive }) {
    return (
      <div className="navcard" style={{ alignItems: "center" }}>
        <div className="navcard-icon" aria-hidden="true">
          {drum.type === "kick" ? "🥁" : drum.type === "snare" ? "🥁" : "🥁"}
        </div>
        <div className="navcard-text" style={{ gap: 2 }}>
          <div className="navcard-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>{labelFor(drum)}</span>
            {isActive && <span className="pill" style={{ padding: "2px 8px" }}>Active</span>}
          </div>
          <div className="navcard-sub">
            {drum.lugs}-lug • target {drum.target.mode === "hz" ? `${drum.target.batter_hz} Hz` : drum.target.note}
            {drum.target.reso_ratio ? ` • reso ×${drum.target.reso_ratio}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost-btn" onClick={onEdit}>Edit</button>
          <button className="ghost-btn" onClick={onSetActive}>Set</button>
          <button className="ghost-btn" onClick={onDelete}>Del</button>
        </div>
      </div>
    );
  }
  