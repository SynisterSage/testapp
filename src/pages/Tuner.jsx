import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppProvider.jsx";
import { suggestHz } from "../lib/targets.js";

const log2 = (x) => Math.log(x) / Math.log(2);
const hzToCentsDiff = (hz, target) => 1200 * log2(hz / Math.max(1e-6, target));

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

/** Prefer batter first; if batter done, pick reso. */
function pickUndoneHeadFor(drum, doneSet) {
  if (!drum) return "batter";
  const b = doneSet.has(`${drum.id}-batter`);
  const r = doneSet.has(`${drum.id}-reso`);
  if (b && !r) return "reso";
  return "batter";
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

  // Head selection
  const [head, setHead] = useState("batter"); // 'batter' | 'reso'

  // Tuning params
  const baseLock = state.settings.lockCents ?? 5;
  const lockWindow = baseLock + 4;
  const holdMs = state.settings.holdMs ?? 300;
  const rmsThreshold = state.settings.rmsThreshold ?? 0.02;
  const bpLow = state.settings.bandpassLowHz ?? 60;
  const bpHigh = state.settings.bandpassHighHz ?? 400;
  const autoAdvance = state.settings.autoAdvanceOnLock ?? true;

  const targetHz = useMemo(() => {
    if (!active) return 0;
    const batter = active.target?.batter_hz ?? suggestHz(active.type, active.size_in);
    if (head === "reso") {
      const ratio = active.target?.reso_ratio ?? 1.06;
      return Math.max(1, batter * ratio);
    }
    return Math.max(1, batter);
  }, [active, head]);

  // Mic + pitch
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const [reading, setReading] = useState({ hz: 0, cents: 0, level: 0 });

  // Mic status: 'idle' | 'loading' | 'ok' | 'denied' | 'unavailable' | 'noinput' | 'error'
  const [micStatus, setMicStatus] = useState("idle");
  const [micKey, setMicKey] = useState(0); // to retry init

  // LOCKED label under the bar
  const [justLocked, setJustLocked] = useState(false);
  useEffect(() => { setJustLocked(false); }, [activeId, head]);

  // Keep active chip centered
  const activeChipRef = useRef(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  // ✓ seed doneSet from persisted state
  const doneSet = useRef(new Set());
  useEffect(() => {
    const s = new Set();
    drums.forEach(d => {
      if (d?.tuned?.batter) s.add(`${d.id}-batter`);
      if (d?.tuned?.reso)   s.add(`${d.id}-reso`);
    });
    doneSet.current = s;
  }, [drums]);

  useEffect(() => {
    if (!hasKit || !active) {
      setMicStatus("idle");
      return () => {};
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus("unavailable");
      return () => {};
    }

    setMicStatus("loading");

    let canceled = false;
    (async () => {
      try {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const hasInput = devs.some(d => d.kind === "audioinput");
          if (!hasInput) { setMicStatus("noinput"); return; }
        } catch {}

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (canceled) return;
        streamRef.current = stream;

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;

        const src = ctx.createMediaStreamSource(stream);
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = bpLow;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = bpHigh;
        const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyserRef.current = analyser;

        src.connect(hp); hp.connect(lp); lp.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        setMicStatus("ok");

        let last = performance.now();
        const loop = () => {
          rafRef.current = requestAnimationFrame(loop);
          analyser.getFloatTimeDomainData(buf);
          const now = performance.now(); const dt = now - last; last = now;

          const { hz, rms } = detectPitchAC(buf, ctx.sampleRate);
          const loud = rms >= rmsThreshold;
          const cents = targetHz ? hzToCentsDiff(hz || 1, targetHz) : 0;

          setReading({ hz: hz | 0, cents, level: rms });
          onFrame(hz, cents, loud, dt);
        };
        loop();
      } catch (e) {
        const n = e && (e.name || "");
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
  }, [hasKit, activeId, bpLow, bpHigh, rmsThreshold, targetHz, micKey]);

  // Guided lock
  const zoneMsRef = useRef(0);
  const lockedKeyRef = useRef(null);

  function onFrame(hz, cents, loud, dtMs) {
    if (!active || !targetHz || !hz || !loud) { zoneMsRef.current = 0; return; }
    const inGreen = Math.abs(cents) <= lockWindow;
    if (inGreen) {
      zoneMsRef.current += dtMs;
      const key = `${active.id}-${head}`;
      if (zoneMsRef.current >= holdMs && lockedKeyRef.current !== key) {
        lockedKeyRef.current = key;
        doneSet.current.add(key);
        setJustLocked(true);

        // persist ✓ for this head
        const prev = active.tuned || {};
        actions.updateDrum(active.id, { tuned: { ...prev, [head]: true } });

        actions.addSession?.({
          id: crypto.randomUUID?.() || String(Date.now()),
          at: Date.now(),
          drumId: active.id,
          head,
          hz,
          cents
        });

        if (autoAdvance) {
          const hasB = doneSet.current.has(`${active.id}-batter`);
          const hasR = doneSet.current.has(`${active.id}-reso`);
          if (hasB && hasR) {
            setTimeout(() => goNext(), 800);         // both heads done → next drum
          } else {
            const nextHead = hasB ? "reso" : "batter"; // flip head on same drum
            setTimeout(() => setHead(nextHead), 600);
          }
        }
      }
    } else {
      zoneMsRef.current = 0;
    }
  }

  // Navigation – pick unfinished head when switching drums
  function goIndex(i) {
    const clampIdx = (n, a, b) => Math.max(a, Math.min(b, n));
    const idx = clampIdx(i, 0, Math.max(0, drums.length - 1));
    const drum = drums[idx];
    if (drum) {
      const nextHead = pickUndoneHeadFor(drum, doneSet.current);
      lockedKeyRef.current = null;
      actions.setActiveDrumId(drum.id);
      setHead(nextHead);
    }
  }
  function goNext() { goIndex(activeIndex + 1 >= drums.length ? activeIndex : activeIndex + 1); }
  function goPrev() { goIndex(activeIndex - 1); }

  // Reset only the current drum
  function resetCurrentDrum() {
    if (!active) return;
    actions.updateDrum(active.id, { tuned: { batter: false, reso: false } });
    doneSet.current.delete(`${active.id}-batter`);
    doneSet.current.delete(`${active.id}-reso`);
    setJustLocked(false);
  }

  // mic warning empty-state (like no-kit)
  const showMicWarning = hasKit && ["denied", "unavailable", "noinput", "error"].includes(micStatus);
  const micMsg =
    micStatus === "denied"      ? "Microphone access is blocked" :
    micStatus === "unavailable" ? "Microphone not supported in this browser" :
    micStatus === "noinput"     ? "No microphone input found" :
    "Could not start microphone";

  if (!hasKit) {
    return (
      <div className="tuner-page">
        <div className="dash-top">
          <div>
            <div className="brand-tag-title">OVERTONE</div>
            <div className="brand-tag-sub">Mobile Drum Tuner</div>
          </div>
          <button className="top-gear" onClick={() => navigate("/settings")}>⚙︎</button>
        </div>
        <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <div className="tile-title">Tuner</div>
          <div className="top-clock">{clock}</div>
        </div>
        <div className="tuner-empty">Please build your kit before tuning.</div>
      </div>
    );
  }

  if (showMicWarning) {
    return (
      <div className="tuner-page">
        <div className="dash-top">
          <div>
            <div className="brand-tag-title">OVERTONE</div>
            <div className="brand-tag-sub">Mobile Drum Tuner</div>
          </div>
          <button className="top-gear" onClick={() => navigate("/settings")}>⚙︎</button>
        </div>
        <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <div className="tile-title">Tuner</div>
          <div className="top-clock">{clock}</div>
        </div>

        <div className="tuner-empty" style={{textAlign:"center"}}>
          <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>No microphone found</div>
          <div style={{opacity:.8, marginBottom:12}}>{micMsg}</div>
          <div style={{display:"flex", gap:8, justifyContent:"center"}}>
            <button className="primary-btn" onClick={() => setMicKey(k => k + 1)}>Retry</button>
            <button className="ghost-btn" onClick={() => navigate("/settings")}>Settings</button>
          </div>
        </div>
      </div>
    );
  }

  const centerBiasPct = 1.25; // tiny visual fix for scale/needle alignment

  return (
    <div className="tuner-page">
      {/* top header like Home */}
      <div className="dash-top">
        <div>
          <div className="brand-tag-title">OVERTONE</div>
          <div className="brand-tag-sub">Mobile Drum Tuner</div>
        </div>
        <button className="top-gear" onClick={() => navigate("/settings")}>⚙︎</button>
      </div>
      <div className="dash-welcome" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div className="tile-title">Tuner</div>
        <div className="top-clock">{clock}</div>
      </div>

      {/* drum chips */}
      <div className="drum-picker drum-picker--tight">
        <div className="drum-scroll mask-fade-lr">
          {drums.map((d, i) => {
            const isActive = d.id === activeId;
            const keyB = `${d.id}-batter`, keyR = `${d.id}-reso`;
            const isDone = doneSet.current.has(keyB) || doneSet.current.has(keyR);
            return (
              <button
                key={d.id}
                ref={isActive ? activeChipRef : null}
                className={`chip ${isActive ? "chip--active" : ""} ${isDone ? "chip--done" : ""}`}
                onClick={() => goIndex(i)}
                title={isDone ? "Completed — tap to retune" : "Tap to tune"}
              >
                <span className="chip-emoji">{d.type === "kick" ? "🦶" : d.type === "snare" ? "🥁" : "🛢️"}</span>
                <span className="chip-label">{d.size_in}″ {d.type}</span>
                {isDone && <span style={{ marginLeft: 6 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* header card */}
      <div className="tuner-head panel">
        <div className="tuner-head-inner">
          <div className="tuner-head-row">
            <button className="ghost-btn" onClick={goPrev}>‹ Prev</button>
            <div className="tuner-head-title">
              <div className="t-title">{active ? `${active.size_in}″ ${active.type}` : "No drum"}</div>
              <div className="t-sub">Target: {Math.round(targetHz)} Hz • Lock ±{lockWindow}¢</div>
            </div>
            <button className="ghost-btn" onClick={goNext}>Next ›</button>
          </div>

          <div style={{display:"flex", justifyContent:"center"}}>
            <div className="seg" role="tablist" aria-label="Drum head">
              <button
                className={`seg-btn ${head === "batter" ? "seg-btn--on" : ""}`}
                onClick={() => setHead("batter")}
              >Batter</button>
              <button
                className={`seg-btn ${head === "reso" ? "seg-btn--on" : ""}`}
                onClick={() => setHead("reso")}
              >Reso</button>
            </div>
          </div>

          {/* reset progress – this drum only */}
          <div className="tuner-reset-row">
            <button className="btn-reset-ghost" onClick={resetCurrentDrum} title="Clear ✓ for this drum">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{marginRight:6}}>
                <path d="M4 4h16M7 4l1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Reset tuning for this drum
            </button>
          </div>
        </div>
      </div>

      {/* big readout */}
      <div className="tuner-hero tuner-hero--accent">
        <div className="tuner-note">{Math.round(reading.hz || 0)} Hz</div>
        <div className="tuner-hz">
          {targetHz ? `${Math.round(targetHz)} Hz target` : "Free"} • {Number.isFinite(reading.cents) ? `${Math.round(reading.cents)}¢` : "—"}
        </div>
      </div>

      {/* cents bar + status */}
      <div className="cents-wrap">
        <div className="cents-scale">
          <span>-50¢</span><span>-25¢</span><span>0</span><span>+25¢</span><span>+50¢</span>
        </div>
        <div className="cents-bar cents-bar--accent">
          <div className="cents-green" />
          <div
            className="cents-needle"
            style={{
              left: `${Math.max(0, Math.min(100, centerBiasPct + 50 + (reading.cents / 50) * 50))}%`
            }}
          />
        </div>

        <div className={`cents-readout ${justLocked ? "cents-readout--locked" : ""}`}>
          {justLocked ? "LOCKED ✓" : "adjust"}
        </div>
      </div>
    </div>
  );
}
