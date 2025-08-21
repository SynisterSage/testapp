// Time-domain autocorrelation with Hann window + parabolic interpolation.
// Returns Hz or null if not found.

export function detectPitchHz(buf, sr, { minHz = 40, maxHz = 800 } = {}) {
    const size = buf.length;
  
    // Copy + window + compute RMS
    let rms = 0;
    const win = 0.5;
    const tmp = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const w = win - win * Math.cos((2 * Math.PI * i) / (size - 1)); // Hann
      const v = buf[i] * w;
      tmp[i] = v;
      rms += v * v;
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.005) return { hz: null, rms }; // too quiet
  
    const maxLag = Math.floor(sr / minHz);
    const minLag = Math.floor(sr / maxHz);
  
    // Autocorrelation
    const ac = new Float32Array(maxLag + 1);
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < size - lag; i++) {
        sum += tmp[i] * tmp[i + lag];
      }
      ac[lag] = sum;
    }
  
    // Find peak after first zero crossing
    let peakLag = -1;
    let peakVal = 0;
  
    // Skip very small lags to avoid 0-peak
    for (let lag = minLag; lag <= maxLag - 1; lag++) {
      const val = ac[lag];
      if (val > peakVal) {
        peakVal = val;
        peakLag = lag;
      }
    }
  
    if (peakLag <= 0) return { hz: null, rms };
  
    // Parabolic interpolation around peak
    const c0 = ac[peakLag - 1] || 0;
    const c1 = ac[peakLag];
    const c2 = ac[peakLag + 1] || 0;
    const denom = 2 * (c0 - 2 * c1 + c2) || 1;
    const offset = (c0 - c2) / denom;
    const refinedLag = peakLag + offset;
  
    const hz = sr / refinedLag;
    if (hz < minHz || hz > maxHz || !isFinite(hz)) return { hz: null, rms };
    return { hz, rms };
  }
  