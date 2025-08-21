const NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export function hzToNote(hz) {
  if (!hz || !isFinite(hz)) return null;
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NAMES_SHARP[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const exactHz = 440 * Math.pow(2, (midi - 69) / 12);
  return { midi, name, octave, exactHz };
}

export function formatNote(hz) {
  const n = hzToNote(hz);
  if (!n) return "--";
  return `${n.name}${n.octave}`;
}

export function centsDiff(measuredHz, targetHz) {
  if (!measuredHz || !targetHz) return null;
  return 1200 * Math.log2(measuredHz / targetHz);
}
