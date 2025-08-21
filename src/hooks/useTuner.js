import { useEffect, useMemo, useRef, useState } from "react";
import { startGraph, stopGraph, onFrame, setBandpass, isRunning } from "../dsp/audioGraph.js";
import { detectPitchHz } from "../dsp/pitchDetect.js";
import { formatNote, centsDiff } from "../lib/notes.js";
import { useAppStore } from "../store/AppProvider.jsx";

export function useTuner() {
  const { state } = useAppStore();
  const { bandpassLowHz, bandpassHighHz, rmsThreshold, holdMs } = state.settings;

  const active = useMemo(() => {
    const id = state.activeDrumId;
    return state.kit.drums.find(d => d.id === id) || state.kit.drums[0] || null;
  }, [state.activeDrumId, state.kit.drums]);

  const targetHz = active?.target?.batter_hz || null;

  const [running, setRunning] = useState(isRunning());
  const [rms, setRms] = useState(0);
  const [hz, setHz] = useState(null);
  const [note, setNote] = useState("--");
  const [cents, setCents] = useState(null);
  const [status, setStatus] = useState("idle");

  const lastHz = useRef([]);
  const holdValue = useRef(null);
  const holdUntil = useRef(0);

  useEffect(() => {
    if (running) setBandpass({ lowHz: bandpassLowHz, highHz: bandpassHighHz });
  }, [running, bandpassLowHz, bandpassHighHz]);

  function clearState() {
    setHz(null); setNote("--"); setCents(null); setRms(0); setStatus("idle");
    lastHz.current = []; holdValue.current = null; holdUntil.current = 0;
  }

  async function start() {
    try {
      await startGraph({ lowHz: bandpassLowHz, highHz: bandpassHighHz });
      setRunning(true);
      setStatus("listening");
    } catch (e) { alert("Mic failed: " + (e?.message || e)); }
  }
  function stop() { stopGraph(); setRunning(false); clearState(); }

  useEffect(() => {
    function handleFrame({ buffer, sampleRate }) {
      const { hz: rawHz, rms: frameRms } = detectPitchHz(buffer, sampleRate, { minHz: 40, maxHz: 900 });
      setRms(frameRms);
      const now = performance.now();

      if (frameRms > (rmsThreshold || 0.02) && rawHz) {
        const arr = lastHz.current; arr.push(rawHz); if (arr.length > 5) arr.shift();
        const sorted = [...arr].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        holdValue.current = median;
        holdUntil.current = now + (holdMs || 300);
        setStatus("holding");
      }
      if (now < holdUntil.current && holdValue.current) {
        const stableHz = holdValue.current;
        setHz(stableHz);
        setNote(formatNote(stableHz));
        if (targetHz) setCents(Math.round(centsDiff(stableHz, targetHz)));
        else setCents(null);
      } else {
        setStatus(running ? "listening" : "idle");
      }
    }
    onFrame(handleFrame);
  }, [running, rmsThreshold, holdMs, targetHz]);

  return { running, start, stop, hz, note, cents, rms, status, targetHz, activeDrum: active };
}
