import { useMemo } from "react";

function labelFor(d) {
  if (!d) return "";
  if (d.type === "kick") return `${d.size_in}″ Kick`;
  if (d.type === "snare") return `${d.size_in}″ Snare`;
  return `${d.size_in}″ Tom`;
}

export default function DrumPicker({ drums = [], activeId, onSelect }) {
  const ordered = useMemo(() => {
    // order: kick, snare, smallest tom -> largest
    const kicks = drums.filter(d => d.type === "kick");
    const snares = drums.filter(d => d.type === "snare");
    const toms = drums.filter(d => d.type === "tom").sort((a,b) => a.size_in - b.size_in);
    return [...kicks, ...snares, ...toms];
  }, [drums]);

  if (!ordered.length) return null;

  return (
    <div className="drum-picker" role="tablist" aria-label="Select drum to tune">
      <div className="drum-scroll">
        {ordered.map(d => {
          const active = d.id === activeId;
          return (
            <button
              key={d.id}
              role="tab"
              aria-selected={active}
              className={"chip" + (active ? " chip--active" : "")}
              onClick={() => onSelect(d.id)}
              title={labelFor(d)}
            >
              <span className="chip-emoji" aria-hidden="true">🥁</span>
              <span className="chip-label">{labelFor(d)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
