import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import LugRing from "../components/LugRing.jsx";
import StripChart from "../components/StripChart.jsx";
import { suggestHz } from "../lib/targets.js";
import "../styles/tuner.css";

/* ---------- helpers ---------- */
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

const lugOrderSequential = (n) => Array.from({ length: n }, (_, i) => i);

function defaultLugsFor(drum) {
  if (!drum) return 8;
  const s = drum.size_in || 14;
  if (drum.type === "snare") return 8;
  if (drum.type === "kick")  return s >= 24 ? 10 : 8;
  return s <= 13 ? 6 : 8;
}

const emptyHead = (lugs) => ({
  lugs: Array.from({ length: lugs }, () => ({ hz: 0, cents: 0, locked: false, at: 0 })),
  meta: { avgHz: 0, spreadCents: 0 },
});

function ensureHeadTunedShape(drum, head, lugs) {
  const t = drum?.tuned || {}, hv = t?.[head];
  if (Array.isArray(hv?.lugs) && hv.lugs.length === lugs) return hv;
  return emptyHead(lugs);
}

/** Snap obvious harmonics (2×/3×/4×/5×) down toward the target fundamental. */
function snapToSubharmonic(hz, target) {
  if (!hz || !target) return hz;
  let best = hz, bestErr = Math.abs(hz - target);
  for (const k of [2, 3, 4, 5]) {
    const cand = hz / k;
    if (cand >= target * 0.5 && cand <= target * 1.5) {
      const err = Math.abs(cand - target);
      if (err < bestErr * 0.75) { best = cand; bestErr = err; }
    }
  }
  return best;
}

/* ============= Component ============= */
export default function Tuner() {
  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const clock = useClock();

  const drums = state.kit.drums || [];
  const hasKit = drums.length > 0;

  // respect whatever drum user chose before
  const activeId = state.activeDrumId || drums[0]?.id || null;
  const activeIndex = Math.max(0, drums.findIndex(d => d.id === activeId));
  const active = drums[activeIndex] || null;

  // refs to defeat stale closures
  const drumsRef = useRef(drums); useEffect(()=>{ drumsRef.current = drums; }, [drums]);
  const activeRef = useRef(active); useEffect(()=>{ activeRef.current = active; }, [active]);
  const activeIndexRef = useRef(activeIndex); useEffect(()=>{ activeIndexRef.current = activeIndex; }, [activeIndex]);

  // head + lug
  const [head, setHead] = useState("batter");
  const headRef = useRef(head); useEffect(() => { headRef.current = head; }, [head]);
const [centerMsg, setCenterMsg] = useState("");
const centerTimerRef = useRef(null);
  const lugCount = useMemo(() => defaultLugsFor(active), [active]);
  const lugCountRef = useRef(lugCount); useEffect(()=>{ lugCountRef.current = lugCount; }, [lugCount]);
  const order = useMemo(() => lugOrderSequential(lugCount), [lugCount]);
  const orderRef = useRef(order); useEffect(()=>{ orderRef.current = order; }, [order]);

  const [lugPos, setLugPos] = useState(0);
  const activeLug = order[lugPos] ?? 0;
  const activeLugRef = useRef(activeLug); useEffect(() => { activeLugRef.current = activeLug; }, [activeLug]);

  // settings
  const baseLock = state.settings.lockCents ?? 5;
  const lockWindow = baseLock + 4;
  const holdMs = state.settings.holdMs ?? 300;
  const rmsThreshold = state.settings.rmsThreshold ?? 0.02;
  const bpLow = state.settings.bandpassLowHz ?? 60;
  const bpHigh = state.settings.bandpassHighHz ?? 400;
  const autoAdvance = state.settings.autoAdvanceOnLock ?? true;

  // anti double-lock
  const rearmMsAfterLock = state.settings.rearmMsAfterLock ?? 1000;
  const requireSilenceMs = state.settings.requireSilenceMs ?? 280;
  const silenceGateFactor = 0.6;

  // next-lug step timer
  const nextLugTimerRef = useRef(null);
  const clearNextLugTimer = () => { if (nextLugTimerRef.current) { clearTimeout(nextLugTimerRef.current); nextLugTimerRef.current = null; } };

  // latest-write guard
  const lastWriteAtRef = useRef({ batter: 0, reso: 0 });

  // targets
  const headTargetHz = useMemo(() => {
    const act = active;
    if (!act) return 0;
    const batter = act.target?.batter_hz ?? suggestHz(act.type, act.size_in);
    if (head === "reso") {
      const ratio = act.target?.reso_ratio ?? 1.06;
      return Math.max(1, batter * ratio);
    }
    return Math.max(1, batter);
  }, [active, head]);

  const headTargetRef = useRef(headTargetHz); useEffect(()=>{ headTargetRef.current = headTargetHz; }, [headTargetHz]);

  const lugOffsetsCents = useMemo(() => {
    const arr = new Array(lugCount).fill(0);
    if (active?.type === "snare") { const a = 0, b = Math.floor(lugCount / 2) % lugCount; arr[a] = -12; arr[b] = -12; }
    return arr;
  }, [active, lugCount]);

  const lugTargetsHz = useMemo(() => lugOffsetsCents.map(c => Math.max(1, headTargetHz * centsToRatio(c))), [lugOffsetsCents, headTargetHz]);
  const lugTargetsRef = useRef(lugTargetsHz); useEffect(() => { lugTargetsRef.current = lugTargetsHz; }, [lugTargetsHz]);

  // mic + pitch
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const hpRef = useRef(null); // dynamic band-pass (HPF)
  const lpRef = useRef(null); // dynamic band-pass (LPF)
  const [reading, setReading] = useState({ hz: 0, cents: 0, level: 0 });
  const [history, setHistory] = useState([]);
  const [micStatus, setMicStatus] = useState("idle");
  const [micKey, setMicKey] = useState(0);
  const [justLocked, setJustLocked] = useState(false);

  // timers/smoothing
  const zoneMsRef = useRef(0);
  const lastKeyRef = useRef(null);
  const hzBufRef = useRef([]);
  const rearmAtRef = useRef(0);
  const needSilenceRef = useRef(false);
  const silentMsRef = useRef(0);

  // local view for CURRENT head (UI only; store is truth)
  const [headLocal, setHeadLocal] = useState(() => ensureHeadTunedShape(active, head, lugCount));
  const headLocalRef = useRef(headLocal); useEffect(() => { headLocalRef.current = headLocal; }, [headLocal]);

  // hydrate local when drum/head/lugs change
  useEffect(() => {
    clearNextLugTimer();
    const act = activeRef.current;
    const hv = ensureHeadTunedShape(act, headRef.current, lugCountRef.current);
    setHeadLocal(hv); headLocalRef.current = hv;
    setLugPos(0); activeLugRef.current = 0;
    setJustLocked(false);
    zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
    needSilenceRef.current = false; silentMsRef.current = 0;
  }, [active?.id, head, lugCount]);

  // rehydrate from store if store is as new as our last local write
  useEffect(() => {
    const act = activeRef.current;
    const h = headRef.current;
    const hv = ensureHeadTunedShape(act, h, lugCountRef.current);
    const incomingMaxAt = Math.max(0, ...hv.lugs.map(l => l.at || 0));
    const guard = lastWriteAtRef.current[h] || 0;
    if (incomingMaxAt >= guard) { setHeadLocal(hv); headLocalRef.current = hv; }
  }, [active?.tuned, active?.id, head, lugCount]);

  // chip done (store truth)
  const drumComplete = (d) => {
    const b = ensureHeadTunedShape(d, "batter", defaultLugsFor(d));
    const r = ensureHeadTunedShape(d, "reso",   defaultLugsFor(d));
    return b.lugs.length && b.lugs.every(x=>x.locked) && r.lugs.length && r.lugs.every(x=>x.locked);
  };

  // manual head switch
  function switchHead(h) {
    if (h === headRef.current) return;
    clearNextLugTimer();
    setHead(h); headRef.current = h;
    const act = activeRef.current;
    const hv = ensureHeadTunedShape(act, h, lugCountRef.current);
    setHeadLocal(hv); headLocalRef.current = hv;
    setLugPos(0); activeLugRef.current = 0;
    setJustLocked(false);
    zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
    needSilenceRef.current = false; silentMsRef.current = 0;
  }

  // autoscroll active chip
  const activeChipRef = useRef(null);
  useEffect(() => { activeChipRef.current?.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" }); }, [activeId]);

  // mic setup
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

        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = bpLow;  // initial
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = bpHigh; // initial
        hpRef.current = hp; lpRef.current = lp;

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

          // median smoothing
          let hzSmooth = hzRaw;
          if (rms >= rmsThreshold && hzRaw) {
            const b = hzBufRef.current; b.push(hzRaw); if (b.length > 5) b.shift();
            const sorted = [...b].sort((a,b)=>a-b);
            hzSmooth = sorted[Math.floor(sorted.length/2)];
          } else {
            hzBufRef.current = [];
          }

          const currLug = activeLugRef.current;
          const targets = lugTargetsRef.current || [];
          const targetHz = targets[currLug] || headTargetRef.current || 0;

          // fold obvious harmonics down toward the target
          const hzFund = snapToSubharmonic(hzSmooth, targetHz);

          const cents = targetHz ? hzToCentsDiff(hzFund || 1, targetHz) : 0;

          setReading({ hz: hzFund | 0, cents, level: rms });
          setHistory(arr => {
            const next=[...arr, Number.isFinite(cents)?cents:0];
            return next.length>120?next.slice(next.length-120):next;
          });

          onFrame(hzFund, cents, rms, dt, now);
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
  }, [hasKit, activeId, bpLow, bpHigh, rmsThreshold, micKey]);

  // dynamically steer the band-pass around the current head target
  useEffect(() => {
    if (!hpRef.current || !lpRef.current || !ctxRef.current) return;
    // keep the fundamental for low Hz (60–90) while trimming junk
    const low  = Math.max(20, Math.min(80, headTargetHz * 0.40));
    const high = Math.max(low + 150, Math.min(900, headTargetHz * 3));
    const t = ctxRef.current.currentTime;
    hpRef.current.frequency.setTargetAtTime(low,  t, 0.02);
    lpRef.current.frequency.setTargetAtTime(high, t, 0.02);
  }, [headTargetHz]);

  /* ---------- lock + advance ---------- */
  function onFrame(hz, cents, rms, dt, nowTs) {
    const act = activeRef.current;
    if (!act) return;

    // gates
    if (nowTs < rearmAtRef.current) { zoneMsRef.current = 0; return; }
    if (needSilenceRef.current) {
      if (rms < rmsThreshold * silenceGateFactor) {
        silentMsRef.current += dt;
        if (silentMsRef.current < requireSilenceMs) return;
        needSilenceRef.current = false; silentMsRef.current = 0;
      } else { silentMsRef.current = 0; return; }
    }

    const loud = rms >= rmsThreshold;
    const currHead = headRef.current;
    const currLug  = activeLugRef.current;
    const lugsN    = lugCountRef.current;
    const targetHz = (lugTargetsRef.current?.[currLug] || headTargetRef.current || 0);

    if (!targetHz || !hz || !loud) { zoneMsRef.current = 0; return; }
    if (Math.abs(cents) > lockWindow) { zoneMsRef.current = 0; return; }
    zoneMsRef.current += dt;

    const key = `${act.id}-${currHead}-${currLug}`;
    if (zoneMsRef.current < holdMs || lastKeyRef.current === key) return;

    // ---- LOCK ----
    lastKeyRef.current = key;
    setJustLocked(true);
    clearNextLugTimer();

    const ts = Date.now();

    // local snapshot for current head
    const before = headLocalRef.current || emptyHead(lugsN);
    const nextLugs = Array.from({ length: lugsN }, (_, i) =>
      i === currLug ? { hz, cents, locked: true, at: ts } :
      (before.lugs[i] || { hz: 0, cents: 0, locked: false, at: 0 })
    );
    const lockedArr = nextLugs.filter(l => l.locked);
    const avgHz = lockedArr.length ? Math.round(lockedArr.reduce((s,l)=>s+l.hz,0)/lockedArr.length) : 0;
    const centsVals = lockedArr.map(l=>l.cents);
    const spread = centsVals.length ? Math.round(Math.max(...centsVals)-Math.min(...centsVals)) : 0;
    const updatedHead = { lugs: nextLugs, meta: { avgHz, spreadCents: spread } };

    setHeadLocal(updatedHead); headLocalRef.current = updatedHead;

    // persist to store for CURRENT drum + head
    const prev = act.tuned || {};
    const tunedAfter = { ...prev, [currHead]: updatedHead };
    lastWriteAtRef.current[currHead] = ts;
    actions.updateDrum(act.id, { tuned: tunedAfter });
    actions.addSession?.({ id: crypto.randomUUID?.() || String(ts), at: ts, drumId: act.id, head: currHead, hz, cents });

    // re-arm/silence gate
    rearmAtRef.current = nowTs + rearmMsAfterLock;
    needSilenceRef.current = true;
    zoneMsRef.current = 0; hzBufRef.current = []; setJustLocked(false);

    if (!autoAdvance) return;

    // completion checks using tunedAfter
    const currComplete   = tunedAfter[currHead]?.lugs?.every(l => l.locked);
    const batterComplete = tunedAfter.batter?.lugs?.length === lugsN && tunedAfter.batter.lugs.every(l => l.locked);
    const resoComplete   = tunedAfter.reso?.lugs?.length   === lugsN && tunedAfter.reso.lugs.every(l => l.locked);

    if (currComplete) {
      if (currHead === "batter") {
        // Batter done → switch to Reso immediately
        switchHead("reso");
        return;
      } else {
        // Reso done
        if (batterComplete) {
          // Both heads done → advance to NEXT drum (wrap to first)
          const idx = activeIndexRef.current;
          const drumsArr = drumsRef.current || [];
          const nextIdx = drumsArr.length ? ((idx + 1) % drumsArr.length) : idx;
          const nextDrum = drumsArr[nextIdx];
          if (nextDrum) {
            actions.setActiveDrumId(nextDrum.id);
            setHead("batter"); headRef.current = "batter";
            const hv = ensureHeadTunedShape(nextDrum, "batter", defaultLugsFor(nextDrum));
            setHeadLocal(hv); headLocalRef.current = hv;
            setLugPos(0); activeLugRef.current = 0;
          }
          return;
        } else {
          // Reso finished first → go finish Batter
          switchHead("batter");
          return;
        }
      }
    }

    // not finished → step to next lug (NO wrap)
    nextLugTimerRef.current = setTimeout(() => {
      setLugPos(p => {
        const ord = orderRef.current || [];
        const np = Math.min(p + 1, ord.length - 1);
        activeLugRef.current = ord[np] ?? np;
        return np;
      });
      zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
      nextLugTimerRef.current = null;
    }, 260);
  }

  // nav (wrap to first on next)
  function goIndex(i) {
    const drumsArr = drumsRef.current || [];
    const idx = ((i % drumsArr.length) + drumsArr.length) % drumsArr.length; // clamp+wrap
    const drum = drumsArr[idx];
    if (drum) {
      clearNextLugTimer();
      actions.setActiveDrumId(drum.id);
      setHead("batter"); headRef.current = "batter";
      const hv = ensureHeadTunedShape(drum, "batter", defaultLugsFor(drum));
      setHeadLocal(hv); headLocalRef.current = hv;
      setLugPos(0); activeLugRef.current = 0;
    }
  }
  const goNext = () => {
    const idx = activeIndexRef.current;
    const drumsArr = drumsRef.current || [];
    if (!drumsArr.length) return;
    goIndex((idx + 1) % drumsArr.length); // wrap
  };
  const goPrev = () => {
    const idx = activeIndexRef.current;
    const drumsArr = drumsRef.current || [];
    if (!drumsArr.length) return;
    goIndex((idx - 1 + drumsArr.length) % drumsArr.length); // wrap back
  };

  // reset current head only
  function resetCurrentHead() {
    const act = activeRef.current; if (!act) return;
    clearNextLugTimer();
    const lugsN = lugCountRef.current;
    const fresh = emptyHead(lugsN);
    const prev = act.tuned || {};
    actions.updateDrum(act.id, { tuned: { ...prev, [headRef.current]: fresh } });
    setHeadLocal(fresh); headLocalRef.current = fresh;
    lastWriteAtRef.current[headRef.current] = Date.now();
    setLugPos(0); activeLugRef.current = 0;
    setJustLocked(false);
    zoneMsRef.current = 0; lastKeyRef.current = null; hzBufRef.current = [];
    needSilenceRef.current = false; silentMsRef.current = 0;
  }

  // mic warnings
  const showMicWarning = hasKit && ["denied","unavailable","noinput","error"].includes(micStatus);
  const micMsg =
    micStatus === "denied" ? "Microphone access is blocked" :
    micStatus === "unavailable" ? "Microphone not supported in this browser" :
    micStatus === "noinput" ? "No microphone input found" :
    "Could not start microphone";

  // derived view
  const headView = headLocalRef.current || headLocal;
  const lockedSet = new Set(headView.lugs.map((l,i) => (l.locked ? i : null)).filter(v => v !== null));
  const deltaMap = new Map(headView.lugs.map((l,i) => [i, l.cents || 0]));
  const activeLugTargetHz = (lugTargetsRef.current?.[activeLug] || headTargetRef.current);

  /* ---------- render ---------- */
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

      {/* chips (✓ shows when both heads done; persists) */}
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
                title={isDone?"Completed — tap to review/retune":"Tap to tune"}>
                <span className="chip-emoji">{d.type==="kick"?"🦶":d.type==="snare"?"🥁":"🛢️"}</span>
                <span className="chip-label">{d.size_in}″ {d.type}</span>
                {isDone && <span style={{ marginLeft: 6 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* head controls (clickable) */}
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
              <button className={`seg-btn ${head==="batter"?"seg-btn--on":""}`} onClick={()=>switchHead("batter")}>Batter</button>
              <button className={`seg-btn ${head==="reso"?"seg-btn--on":""}`} onClick={()=>switchHead("reso")} title="Resonant head">Reso</button>
            </div>
            <button className="btn-reset-ghost" onClick={resetCurrentHead}>Reset head</button>
          </div>
        </div>
      </div>

      {/* ring */}
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
          <div><span className="metric-label">Avg</span> {headLocal.meta?.avgHz || 0} Hz</div>
          <div><span className="metric-label">Spread</span> {headLocal.meta?.spreadCents || 0}¢</div>
          <div><span className="metric-label">Lug</span> {activeLug + 1}/{lugCount}</div>
        </div>
      </div>
    </div>
  );
}
