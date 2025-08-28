import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import LugRing from "../components/LugRing.jsx";
import StripChart from "../components/StripChart.jsx";
import { suggestHz } from "../lib/targets.js";
import "../styles/tuner.css";

// ---------- helpers ----------
const log2 = (x) => Math.log(x) / Math.log(2);
const hzToCentsDiff = (hz, target) => 1200 * log2(hz / Math.max(1e-6, target));
const centsToRatio = (c) => Math.pow(2, (c || 0) / 1200);

function detectPitchAC(buffer, sampleRate) {
  let SIZE = buffer.length, rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return { hz: 0, rms };

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const buf = buffer.slice(r1, r2); SIZE = buf.length;

  const c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];

  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0) return { hz: 0, rms };

  const x1 = c[maxpos - 1] || 0, x2 = c[maxpos] || 1, x3 = c[maxpos + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
  const shift = a ? -b / (2 * a) : 0;
  const period = (maxpos + shift) / sampleRate;
  const hz = 1 / Math.max(period, 1e-6);
  return { hz, rms };
}

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 30_000); return () => clearInterval(id); }, []);
  const hrs = t.getHours(); const h12 = ((hrs + 11) % 12) + 1;
  const mins = String(t.getMinutes()).padStart(2, "0"); const ampm = hrs >= 12 ? "PM" : "AM";
  return `${h12}:${mins} ${ampm}`;
}

// sequential 0..n-1
const lugOrderSequential = (n) => Array.from({ length: n }, (_, i) => i);

// defaults
function defaultLugsFor(drum) {
  if (!drum) return 8;
  const s = drum.size_in || 14;
  if (drum.type === "snare") return 8;
  if (drum.type === "kick")  return s >= 24 ? 10 : 8;
  return s <= 13 ? 6 : 8;
}

function ensureHeadTunedShape(drum, head, lugs) {
  const t = drum?.tuned || {}, hv = t?.[head];
  if (Array.isArray(hv?.lugs) && hv.lugs.length === lugs) return hv;
  return { lugs: Array.from({ length: lugs }, () => ({ hz: 0, cents: 0, locked: false, at: 0 })), meta: { avgHz: 0, spreadCents: 0 } };
}

// union merge (keep any local/store locks)
function mergeHeadShapes(local, storeShape, lugCount) {
  const base = storeShape && Array.isArray(storeShape.lugs)
    ? storeShape
    : { lugs: Array.from({ length: lugCount }, () => ({ hz: 0, cents: 0, locked: false, at: 0 })), meta: { avgHz: 0, spreadCents: 0 } };

  const lugs = Array.from({ length: lugCount }, (_, i) => {
    const st = base.lugs[i] || { hz: 0, cents: 0, locked: false, at: 0 };
    const lc = local?.lugs?.[i] || { hz: 0, cents: 0, locked: false, at: 0 };
    const locked = lc.locked || st.locked;
    const hz   = st.locked ? st.hz   : lc.hz;
    const cents= st.locked ? st.cents: lc.cents;
    const at   = st.locked ? st.at   : lc.at;
    return { hz: hz || 0, cents: cents || 0, locked, at: at || 0 };
  });

  const lockedArr = lugs.filter(l => l.locked);
  const avgHz = lockedArr.length ? Math.round(lockedArr.reduce((s, l) => s + l.hz, 0) / lockedArr.length) : 0;
  const centsVals = lockedArr.map(l => l.cents);
  const spread = centsVals.length ? Math.round(Math.max(...centsVals) - Math.min(...centsVals)) : 0;

  return { lugs, meta: { avgHz, spreadCents: spread } };
}

// per-lug offsets
function lugOffsetsFor(drum, head, lugCount) {
  const arr = new Array(lugCount).fill(0);
  if (!drum) return arr;
  if (drum.type === "snare") {
    const a = 0, b = Math.floor(lugCount / 2) % lugCount;
    arr[a] = -12; arr[b] = -12;
  }
  return arr;
}

export default function Tuner() {
  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const clock = useClock();

  const drums = state.kit.drums || [];
  const hasKit = drums.length > 0;
  const activeId = state.activeDrumId || drums[0]?.id || null;
  const activeIndex = Math.max(0, drums.findIndex(d => d.id === activeId));
  const active = drums[activeIndex] || null;

  // per-lug flow
  const [head, setHead] = useState("batter");          // default Batter
  const headRef = useRef(head);
  useEffect(() => { headRef.current = head; }, [head]);

  const lugCount = useMemo(() => defaultLugsFor(active), [active]);
  const order = useMemo(() => lugOrderSequential(lugCount), [lugCount]);
  const [lugPos, setLugPos] = useState(0);
  const activeLug = order[lugPos] ?? 0;

  // keep current lug in a ref so RAF loop always has the latest lug
  const activeLugRef = useRef(activeLug);
  useEffect(() => { activeLugRef.current = activeLug; }, [activeLug]);

  // settings
  const baseLock = state.settings.lockCents ?? 5;
  const lockWindow = baseLock + 4;
  const holdMs = state.settings.holdMs ?? 300;
  const rmsThreshold = state.settings.rmsThreshold ?? 0.02;
  const bpLow = state.settings.bandpassLowHz ?? 60;
  const bpHigh = state.settings.bandpassHighHz ?? 400;
  const autoAdvance = state.settings.autoAdvanceOnLock ?? true;

  // targets
  const headTargetHz = useMemo(() => {
    if (!active) return 0;
    const batter = active.target?.batter_hz ?? suggestHz(active.type, active.size_in);
    if (head === "reso") {
      const ratio = active.target?.reso_ratio ?? 1.06;
      return Math.max(1, batter * ratio);
    }
    return Math.max(1, batter);
  }, [active, head]);

  const lugOffsetsCents = useMemo(() => lugOffsetsFor(active, head, lugCount), [active, head, lugCount]);
  const lugTargetsHz = useMemo(() => lugOffsetsCents.map(c => Math.max(1, headTargetHz * centsToRatio(c))), [lugOffsetsCents, headTargetHz]);
  const lugTargetsRef = useRef(lugTargetsHz);
  useEffect(() => { lugTargetsRef.current = lugTargetsHz; }, [lugTargetsHz]);

  // mic + pitch
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const [reading, setReading] = useState({ hz: 0, cents: 0, level: 0 });
  const [history, setHistory] = useState([]);
  const [micStatus, setMicStatus] = useState("idle");
  const [micKey, setMicKey] = useState(0);

  const [justLocked, setJustLocked] = useState(false);

  // timers/smoothing
  const zoneMsRef = useRef(0);
  const lastKeyRef = useRef(null);
  const hzBufRef = useRef([]);
  const rearmAtRef = useRef(0);            // simple cool-down timestamp

  // ---- LOCAL HEAD (state + ref) ----
  const [headLocal, setHeadLocal] = useState(() => ensureHeadTunedShape(active, head, lugCount));
  const headLocalRef = useRef(headLocal);
  useEffect(() => { headLocalRef.current = headLocal; }, [headLocal]);

  // completion helpers (for chip ✓)
  function headCompleteFromStore(drum, h) {
    const lugs = ensureHeadTunedShape(drum, h, defaultLugsFor(drum)).lugs;
    return lugs.length > 0 && lugs.every(l => l.locked);
  }
  const drumComplete = (d) => headCompleteFromStore(d, "batter") && headCompleteFromStore(d, "reso");

  // refresh local WHEN drum/head/lugCount changes (and reset to Lug 1)
  useEffect(() => {
    const fresh = ensureHeadTunedShape(active, head, lugCount);
    setHeadLocal(fresh);
    headLocalRef.current = fresh;
    setLugPos(0);
    activeLugRef.current = 0;
    setJustLocked(false);
    zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
  }, [active?.id, head, lugCount]);

  // merge store-tuned into local (DO NOT reset lugPos)
  useEffect(() => {
    const storeHead = ensureHeadTunedShape(active, head, lugCount);
    setHeadLocal(prev => {
      const merged = mergeHeadShapes(prev, storeHead, lugCount);
      headLocalRef.current = merged;
      return merged;
    });
  }, [active?.tuned, head, lugCount, active?.id]);

  // autoscroll active chip
  const activeChipRef = useRef(null);
  useEffect(() => { activeChipRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }, [activeId]);

  // mic init + loop  (NOTE: loop reads current lug/head/targets via refs)
  useEffect(() => {
    if (!hasKit || !active) { setMicStatus("idle"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMicStatus("unavailable"); return; }
    setMicStatus("loading");

    let canceled = false;
    (async () => {
      try {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          if (!devs.some(d => d.kind === "audioinput")) { setMicStatus("noinput"); return; }
        } catch {}
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (canceled) return;
        streamRef.current = stream;

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = bpLow;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = bpHigh;
        const an = ctx.createAnalyser(); an.fftSize = 2048; analyserRef.current = an;
        src.connect(hp); hp.connect(lp); lp.connect(an);
        const buf = new Float32Array(an.fftSize);
        setMicStatus("ok");

        let last = performance.now();
        const loop = () => {
          rafRef.current = requestAnimationFrame(loop);
          an.getFloatTimeDomainData(buf);
          const now = performance.now(); const dt = now - last; last = now;

          const { hz: hzRaw, rms } = detectPitchAC(buf, ctx.sampleRate);

          // median smoothing over last 5 loud frames
          let hzSmooth = hzRaw;
          if (rms >= rmsThreshold && hzRaw) {
            const b = hzBufRef.current; b.push(hzRaw); if (b.length > 5) b.shift();
            const sorted = [...b].sort((a,b)=>a-b);
            hzSmooth = sorted[Math.floor(sorted.length/2)];
          } else {
            hzBufRef.current = [];
          }

          // UI readout uses current head's target
          const currLug = activeLugRef.current;
          const targets = lugTargetsRef.current || [];
          const targetHz = targets[currLug] || headTargetHz || 0;
          const cents = targetHz ? hzToCentsDiff(hzSmooth || 1, targetHz) : 0;

          setReading({ hz: hzSmooth | 0, cents, level: rms });
          setHistory(arr => {
            const next=[...arr, Number.isFinite(cents)?cents:0];
            return next.length>120?next.slice(next.length-120):next;
          });

          onFrame(hzSmooth, cents, rms >= rmsThreshold, dt, now);
        };
        loop();
      } catch (e) {
        const n = e?.name || "";
        if (n === "NotAllowedError" || n === "SecurityError") setMicStatus("denied");
        else if (n === "NotFoundError") setMicStatus("noinput");
        else setMicStatus("error");
      }
    })();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { ctxRef.current && ctxRef.current.close(); } catch {}
      try { streamRef.current?.getTracks()?.forEach(t => t.stop()); } catch {}
    };
  // only restart when device/filters change or drum changes
  }, [hasKit, activeId, bpLow, bpHigh, rmsThreshold, micKey]);

  // lock + advance (reads current lug/head via refs)
  function onFrame(hz, cents, loud, dt, nowTs) {
    if (!active) return;

    // cool-down: after a lock, ignore new locks briefly
    if (nowTs < rearmAtRef.current) { zoneMsRef.current = 0; return; }

    const currHead = headRef.current;
    const currLug  = activeLugRef.current;
    const targets = lugTargetsRef.current || [];
    const targetHz = targets[currLug] || headTargetHz || 0;

    if (!targetHz || !hz || !loud) { zoneMsRef.current = 0; return; }
    if (Math.abs(cents) > lockWindow) { zoneMsRef.current = 0; return; }
    zoneMsRef.current += dt;

    const key = `${active.id}-${currHead}-${currLug}`;
    if (zoneMsRef.current >= holdMs && lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      setJustLocked(true);

      // update LOCAL head
      const curr = headLocalRef.current || { lugs: [], meta: { avgHz: 0, spreadCents: 0 } };
      const nextLugs = Array.from({ length: lugCount }, (_, i) =>
        i === currLug ? { hz, cents, locked: true, at: Date.now() } :
        (curr.lugs[i] || { hz: 0, cents: 0, locked: false, at: 0 })
      );
      const lockedArr = nextLugs.filter(l => l.locked);
      const avgHz = lockedArr.length ? Math.round(lockedArr.reduce((s,l)=>s+l.hz,0)/lockedArr.length) : 0;
      const centsVals = lockedArr.map(l=>l.cents);
      const spread = centsVals.length ? Math.round(Math.max(...centsVals)-Math.min(...centsVals)) : 0;
      const localHeadObj = { lugs: nextLugs, meta: { avgHz, spreadCents: spread } };

      headLocalRef.current = localHeadObj;
      setHeadLocal(localHeadObj);

      // persist to store
      const prev = active.tuned || {};
      actions.updateDrum(active.id, { tuned: { ...prev, [currHead]: localHeadObj } });
      actions.addSession?.({ id: crypto.randomUUID?.() || String(Date.now()), at: Date.now(), drumId: active.id, head: currHead, hz, cents });

      if (!autoAdvance) return;

      const allLockedLocal = nextLugs.every(l => l.locked);

      // Decide next step
      if (allLockedLocal) {
        if (currHead === "batter") {
          // Switch to Reso (use existing progress if any; don't overwrite)
          setTimeout(() => {
            setHead("reso"); headRef.current = "reso";
            const resoFromStore = ensureHeadTunedShape(active, "reso", lugCount);
            headLocalRef.current = resoFromStore;
            setHeadLocal(resoFromStore);
            setLugPos(0);
            activeLugRef.current = 0;
            zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = []; setJustLocked(false);
          }, 380);
          rearmAtRef.current = performance.now() + 320;
          return;
        } else {
          // Finished Reso: if Batter incomplete, go back to Batter; else next drum
          const batterDone = headCompleteFromStore(active, "batter");
          if (!batterDone) {
            setTimeout(() => {
              setHead("batter"); headRef.current = "batter";
              const batterFromStore = ensureHeadTunedShape(active, "batter", lugCount);
              headLocalRef.current = batterFromStore;
              setHeadLocal(batterFromStore);
              setLugPos(0);
              activeLugRef.current = 0;
              zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = []; setJustLocked(false);
            }, 380);
            rearmAtRef.current = performance.now() + 320;
            return;
          }
          // both heads done → next drum
          setTimeout(() => goNext(), 500);
          rearmAtRef.current = performance.now() + 380;
          return;
        }
      }

      // Next lug (strictly in order)
      setTimeout(() => {
        setLugPos(p => {
          const np = (p + 1) % order.length;
          activeLugRef.current = order[np] ?? np;
          return np;
        });
        zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = []; setJustLocked(false);
      }, 240);

      // short cool-down so we don't double-lock on the next frame
      rearmAtRef.current = performance.now() + 280;
    }
  }

  // navigation (chip ✓ = both heads done)
  function goIndex(i) {
    const idx = Math.max(0, Math.min(drums.length - 1, i));
    const drum = drums[idx];
    if (drum) {
      actions.setActiveDrumId(drum.id);
      // default to Batter when switching drums (user can tap Reso manually)
      const nextHead = "batter";
      setHead(nextHead);
      headRef.current = nextHead;
      // local resets via effect on [active?.id, head, lugCount]
    }
  }
  const goNext = () => {
    const nextIdx = activeIndex + 1 >= drums.length ? activeIndex : activeIndex + 1;
    goIndex(nextIdx);
  };
  const goPrev = () => goIndex(activeIndex - 1);

  // manual reset head
  function resetCurrentHead() {
    if (!active) return;
    const fresh = { lugs: Array.from({ length: lugCount }, () => ({ hz: 0, cents: 0, locked: false, at: 0 })), meta: { avgHz: 0, spreadCents: 0 } };
    const prev = active.tuned || {};
    actions.updateDrum(active.id, { tuned: { ...prev, [head]: fresh } });
    headLocalRef.current = fresh;
    setHeadLocal(fresh);
    setLugPos(0);
    activeLugRef.current = 0;
    setJustLocked(false);
    zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
  }

  // mic warnings
  const showMicWarning = hasKit && ["denied","unavailable","noinput","error"].includes(micStatus);
  const micMsg =
    micStatus === "denied" ? "Microphone access is blocked" :
    micStatus === "unavailable" ? "Microphone not supported in this browser" :
    micStatus === "noinput" ? "No microphone input found" :
    "Could not start microphone";

  // VIEW from ref (ensures checks render immediately)
  const headView = headLocalRef.current || headLocal;
  const lockedSet = new Set(headView.lugs.map((l,i) => (l.locked ? i : null)).filter(v => v !== null));
  const deltaMap = new Map(headView.lugs.map((l,i) => [i, l.cents || 0]));

  if (!hasKit) {
    return (
      <div className="tuner-page">
        <div className="dash-top">
          <div><div className="brand-tag-title">OVERTONE</div><div className="brand-tag-sub">Mobile Drum Tuner</div></div>
          <button className="top-gear" onClick={()=>navigate("/settings")}>⚙︎</button>
        </div>
        <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <div className="tile-title">Tuner</div><div className="top-clock">{clock}</div>
        </div>
        <div className="tuner-empty">Please build your kit before tuning.</div>
      </div>
    );
  }

  if (showMicWarning) {
    return (
      <div className="tuner-page">
        <div className="dash-top">
          <div><div className="brand-tag-title">OVERTONE</div><div className="brand-tag-sub">Mobile Drum Tuner</div></div>
          <button className="top-gear" onClick={()=>navigate("/settings")}>⚙︎</button>
        </div>
        <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <div className="tile-title">Tuner</div><div className="top-clock">{clock}</div>
        </div>
        <div className="tuner-empty" style={{textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>No microphone found</div>
          <div style={{opacity:.8,marginBottom:12}}>{micMsg}</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <button className="primary-btn" onClick={()=>setMicKey(k=>k+1)}>Retry</button>
            <button className="ghost-btn" onClick={()=>navigate("/settings")}>Settings</button>
          </div>
        </div>
      </div>
    );
  }

  // current active lug target for the UI readout only
  const activeLugTargetHz = (lugTargetsHz[activeLug] || headTargetHz);

  return (
    <div className="tuner-page tuner-page--fixed">
      {/* header */}
      <div className="dash-top">
        <div><div className="brand-tag-title">OVERTONE</div><div className="brand-tag-sub">Mobile Drum Tuner</div></div>
        <button className="top-gear" onClick={()=>navigate("/settings")}>⚙︎</button>
      </div>

      <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div className="tile-title">Tuner</div><div className="top-clock">{clock}</div>
      </div>

      {/* chips (purple ✓ when BOTH heads done) */}
      <div className="drum-picker drum-picker--tight">
        <div className="drum-scroll mask-fade-lr">
          {drums.map((d,i)=>{
            const isActive=d.id===activeId;
            const isDone=drumComplete(d);
            return (
              <button key={d.id}
                ref={isActive?activeChipRef:null}
                className={`chip ${isActive?"chip--active":""} ${isDone?"chip--done":""}`}
                onClick={()=>goIndex(i)}
                title={isDone?"Completed — tap to retune":"Tap to tune"}>
                <span className="chip-emoji">{d.type==="kick"?"🦶":d.type==="snare"?"🥁":"🛢️"}</span>
                <span className="chip-label">{d.size_in}″ {d.type}</span>
                {isDone && <span style={{ marginLeft: 6 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* head controls (both selectable; default Batter) */}
      <div className="tuner-head panel">
        <div className="tuner-head-inner">
          <div className="tuner-head-row">
            <button className="ghost-btn ghost-btn--sm" onClick={()=>goPrev()}>‹</button>
            <div className="tuner-head-title">
              <div className="t-title">{active?`${active.size_in}″ ${active.type}`:"No drum"}</div>
              <div className="t-sub">Target (head): {Math.round(headTargetHz)} Hz • Lock ±{lockWindow}¢ • Lugs {lugCount}</div>
            </div>
            <button className="ghost-btn ghost-btn--sm" onClick={()=>goNext()}>›</button>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:8}}>
            <div className="seg" role="tablist" aria-label="Drum head">
              <button
                className={`seg-btn ${head==="batter"?"seg-btn--on":""}`}
                onClick={()=>{ setHead("batter"); headRef.current="batter"; }}
              >
                Batter
              </button>
              <button
                className={`seg-btn ${head==="reso"?"seg-btn--on":""}`}
                onClick={()=>{ setHead("reso"); headRef.current="reso"; }}
                title="Resonant head"
              >
                Reso
              </button>
            </div>
            <button className="btn-reset-ghost" onClick={resetCurrentHead}>Reset head</button>
          </div>
        </div>
      </div>

      {/* lug ring */}
      <div className="tuner-ring-wrap">
        <LugRing
          count={lugCount}
          active={activeLug}
          locked={lockedSet}
          deltas={deltaMap}
          onSelect={(i)=>setLugPos(order.findIndex(v=>v===i))}
        />
      </div>

      {/* readouts */}
      <div className="tuner-hero tuner-hero--flat" style={{minWidth:0}}>
        <div className="tuner-note">{Math.round(reading.hz || 0)} Hz</div>
        <div className="tuner-hz">
          Lug target: {Math.round(activeLugTargetHz)} Hz • {Number.isFinite(reading.cents) ? `${Math.round(reading.cents)}¢` : "—"}
        </div>

        <div className="cents-wrap tuner-measure">
          <div className="cents-scale"><span>-50¢</span><span>-25¢</span><span>0</span><span>+25¢</span><span>+50¢</span></div>
          <div className="cents-bar cents-bar--accent">
            <div className="cents-green" />
            <div className="cents-needle" style={{ left: `${Math.max(0, Math.min(100, 1.25 + 50 + (reading.cents / 50) * 50))}%` }} />
          </div>
          <div className={`cents-readout ${justLocked ? "cents-readout--locked" : ""}`}>{justLocked ? "LOCKED ✓" : "adjust"}</div>
        </div>
      </div>

      {/* chart + stats */}
      <div className="tuner-measure">
        <StripChart values={history} lockWindow={lockWindow} height={54} />
        <div className="tuner-stats-row">
          <div><span className="metric-label">Avg</span> {headView.meta?.avgHz || 0} Hz</div>
          <div><span className="metric-label">Spread</span> {headView.meta?.spreadCents || 0}¢</div>
          <div><span className="metric-label">Lug</span> {activeLug + 1}/{lugCount}</div>
        </div>
      </div>
    </div>
  );
}
