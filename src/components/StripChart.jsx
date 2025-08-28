import React, { useMemo } from "react";

/** Responsive cents strip; never forces overflow. */
export default function StripChart({ values = [], lockWindow = 9, height = 54 }) {
  const W = 320, H = height, mid = H/2;
  const clamp=(v)=>Math.max(-60,Math.min(60,v));
  const yOf=(c)=> mid - (clamp(c)/60) * (H/2 - 6);

  const pathD = useMemo(()=>{
    if(!values.length) return "";
    const step = W / Math.max(1, values.length-1);
    let d = `M 0 ${yOf(values[0])}`;
    for(let i=1;i<values.length;i++) d += ` L ${i*step} ${yOf(values[i])}`;
    return d;
  },[values]);

  return (
    <div className="strip-wrap">
      <svg className="strip-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect x="0" y="0" width={W} height={H} rx="10" className="strip-bg" />
        <rect x="0" y={yOf(lockWindow)} width={W} height={yOf(-lockWindow)-yOf(lockWindow)} className="strip-lock" />
        <line x1="0" y1={mid} x2={W} y2={mid} className="strip-mid" />
        {pathD && <path d={pathD} className="strip-trace" />}
        <text x="6" y="12" className="strip-scale">+50¢</text>
        <text x="6" y={H-4} className="strip-scale">-50¢</text>
      </svg>
    </div>
  );
}
