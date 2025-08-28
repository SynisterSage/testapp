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

const LugRing = memo(function LugRing({ count, active, locked, deltas, onSelect }) {
  const size = 172, cx = size/2, cy = size/2, r = 64;
  const angle = (i)=>(-90 + (360 / count) * i) * (Math.PI/180);
  const pos = (i)=>({ x: cx + r*Math.cos(angle(i)), y: cy + r*Math.sin(angle(i)) });
  const lockedArr = normalizeLocked(locked, count);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="lug-ring">
      <circle cx={cx} cy={cy} r={r+10} className="lug-ring-outline" />
      {Array.from({length:count}).map((_,i)=>{
        const {x,y}=pos(i);
        const isActive=i===active, isLocked=lockedArr[i];
        const c = Math.max(-50, Math.min(50, (deltas?.get(i) ?? 0)));
        const hint = c>3?"high": c<-3?"low": isLocked?"ok":"mid";
        return (
          <g key={i} onClick={()=>onSelect?.(i)} style={{cursor:"pointer"}}>
            {isActive && <circle cx={x} cy={y} r={15} className="lug-node-glow" />}
            <circle cx={x} cy={y} r={9}
              className={["lug-node", isActive?"lug-node--active":"", isLocked?"lug-node--locked":"", `lug-node--${hint}`].join(" ").trim()} />
            {/* ✓ for every locked lug */}
            {isLocked && <text x={x} y={y+4} textAnchor="middle" className="lug-check">✓</text>}
            <text x={x} y={y+22} className="lug-label">{i+1}</text>
            {Number.isFinite(c) && Math.abs(c)>0 && (
              <text x={x} y={y-14} className="lug-cents">{c>0?`+${Math.round(c)}`:Math.round(c)}¢</text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

export default LugRing;
