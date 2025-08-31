import React, { memo } from "react";

/** Accepts locked as Set<number>, boolean[], or { [i]: true } */
function normalizeLocked(locked, count) {
  const arr = Array.from({ length: count }, () => false);
  if (!locked) return arr;
  if (locked instanceof Set) { locked.forEach(i => { if (i >= 0 && i < count) arr[i] = true; }); return arr; }
  if (Array.isArray(locked)) { for (let i = 0; i < Math.min(count, locked.length); i++) arr[i] = !!locked[i]; return arr; }
  if (typeof locked === "object") { for (let i = 0; i < count; i++) arr[i] = !!locked[i]; return arr; }
  return arr;
}

const LugRing = memo(function LugRing({
  count, active, locked, deltas, onSelect,
  centerMessage // ← NEW (optional)
}) {
  // same geometry
  const size = 172, cx = size/2, cy = size/2, r = 64;
  const angle = (i)=>(-90 + (360 / count) * i) * (Math.PI/180);
  const pos = (i)=>({ x: cx + r*Math.cos(angle(i)), y: cy + r*Math.sin(angle(i)) });

  const lockedArr = normalizeLocked(locked, count);
  const activeIsLocked = !!lockedArr[active];

  // tiny helper for one-time glint on lock
  const Glint = ({ x, y, r=13 }) => (
    <g className="lug-glint">
      <path d={`M ${x-r} ${y} A ${r} ${r} 0 0 1 ${x+r} ${y}`} className="lug-glint-arc" />
      <path d={`M ${x-r} ${y} A ${r} ${r} 0 0 0 ${x+r} ${y}`} className="lug-glint-arc lug-glint-arc--delayed" />
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="lug-ring"
      aria-label="Lug ring"
    >
      <defs>
        {/* purple base gradient for idle ring */}
        <linearGradient id="lr-outer-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        {/* green sweep gradient used when active lug locks */}
        <linearGradient id="lr-green-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>

      {/* OUTER RING: base purple (slow rotate) */}
      <g className="outer-ring-group">
        <g className="outer-rotate" transform={`rotate(0 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r+10} className="outer-ring" />
        </g>

        {/* OUTER RING: green sweep on when the CURRENT lug is locked; off otherwise.
            We use pathLength=100 + CSS transition on stroke-dashoffset to animate sweep both directions. */}
        <circle
          cx={cx}
          cy={cy}
          r={r+10}
          className={`outer-ring-green ${activeIsLocked ? "is-on" : "is-off"}`}
          pathLength="100"
        />

        {/* very faint outward idle pulses */}
        <g className="outer-pulse">
          <circle cx={cx} cy={cy} r={r+10} className="outer-ripple" />
          <circle cx={cx} cy={cy} r={r+10} className="outer-ripple outer-ripple--late1" />
          <circle cx={cx} cy={cy} r={r+10} className="outer-ripple outer-ripple--late2" />
        </g>
      </g>

      {/* keep your static outline */}
      <circle cx={cx} cy={cy} r={r+10} className="lug-ring-outline" />
{centerMessage && (
        <g className="lug-center" aria-live="polite">
          <rect
            x={size/2 - 72} y={size/2 - 16} rx="10" ry="10"
            width="144" height="32"
            className="lug-center-bg"
          />
          <text x={size/2} y={size/2 + 5} textAnchor="middle" className="lug-center-text">
            {centerMessage}
          </text>
        </g>
      )}
      {/* LUGS */}
      {Array.from({length:count}).map((_,i)=>{
        const {x,y}=pos(i);
        const isActive=i===active;
        const isLocked=lockedArr[i];
        const c = Math.max(-50, Math.min(50, (deltas?.get(i) ?? 0)));
        const hint = c>3?"high": c<-3?"low": isLocked?"ok":"mid";

        return (
          <g
            key={i}
            onClick={()=>onSelect?.(i)}
            className="lug-interactive"
            style={{cursor:"pointer"}}
            data-active={isActive || undefined}
            data-locked={isLocked || undefined}
            data-hint={hint}
          >
            {/* ACTIVE (not complete): in-place pulse (no directional movement) */}
            {isActive && !isLocked && (
              <circle cx={x} cy={y} r={14} className="lug-active-pulse" />
            )}

            {/* node */}
            <circle
              cx={x} cy={y} r={9}
              className={[
                "lug-node",
                isActive ? "lug-node--active" : "",
                isLocked ? "lug-node--locked" : "",
                `lug-node--${hint}`
              ].join(" ").trim()}
            />

            {/* COMPLETED: slower ring draw + subtle glint (one time) */}
            {isLocked && (
              <>
                <circle cx={x} cy={y} r={11.5} className="lug-lock-ring" />
                <Glint x={x} y={y} r={13} />
              </>
            )}

            {isLocked && <text x={x} y={y+4} textAnchor="middle" className="lug-check">✓</text>}
            <text x={x} y={y+22} className="lug-label">{i+1}</text>
            {Number.isFinite(c) && Math.abs(c)>0 && (
              <text x={x} y={y-14} className="lug-cents">
                {c>0?`+${Math.round(c)}`:Math.round(c)}¢
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

export default LugRing;
