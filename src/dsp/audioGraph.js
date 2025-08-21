// Lightweight audio graph: mic -> [highpass + lowpass] -> analyser
// Provides start/stop and an onFrame(callback) render loop.

let ctx = null;
let stream = null;
let source = null;
let hp = null;         // highpass
let lp = null;         // lowpass
let analyser = null;
let rafId = null;
let running = false;
let frameBuf = null;
let frameCb = null;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export async function startGraph({ lowHz = 60, highHz = 400 } = {}) {
  if (running) return;
  const audioCtx = ensureCtx();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    }
  });

  source = audioCtx.createMediaStreamSource(stream);

  // Bandpass using HP + LP for clearer control
  hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = lowHz;
  hp.Q.value = 0.707;

  lp = audioCtx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = highHz;
  lp.Q.value = 0.707;

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; // good balance
  analyser.smoothingTimeConstant = 0; // we'll do our own smoothing
  frameBuf = new Float32Array(analyser.fftSize);

  // wire graph
  source.connect(hp);
  hp.connect(lp);
  lp.connect(analyser);

  running = true;
  loop();
}

export function stopGraph() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  try { source && source.disconnect(); } catch {}
  try { hp && hp.disconnect(); } catch {}
  try { lp && lp.disconnect(); } catch {}
  try { analyser && analyser.disconnect(); } catch {}
  source = hp = lp = analyser = null;

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

export function setBandpass({ lowHz, highHz }) {
  if (hp && typeof lowHz === "number") hp.frequency.value = lowHz;
  if (lp && typeof highHz === "number") lp.frequency.value = highHz;
}

export function onFrame(cb) {
  frameCb = cb; // cb({buffer, sampleRate})
}

function loop() {
  if (!running || !analyser) return;
  analyser.getFloatTimeDomainData(frameBuf);
  if (frameCb) frameCb({ buffer: frameBuf, sampleRate: ctx.sampleRate || 48000 });
  rafId = requestAnimationFrame(loop);
}

export function isRunning() {
  return running;
}
