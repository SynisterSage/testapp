function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  
  export function suggestHz(type, size_in) {
    if (type === "kick") return 60; // safe default
    if (type === "snare") return 260;
    if (size_in <= 10) return 150;
    if (size_in === 12) return 140;
    if (size_in === 13) return 125;
    if (size_in === 14) return 110;
    if (size_in >= 16) return 85;
    return 130;
  }
  
  function makeDrum(type, size_in, lugs = type === "snare" ? 10 : 8) {
    return {
      id: uid(),
      type,
      size_in,
      lugs,
      head: "both",
      target: { mode: "hz", batter_hz: suggestHz(type, size_in), reso_ratio: 1.06 }
    };
  }
  
  /** pieces: 3 | 4 | 5 */
  export function buildTemplate(pieces = 4) {
    if (pieces === 3) {
      return [ makeDrum("kick", 22), makeDrum("snare", 14, 10), makeDrum("tom", 13) ];
    }
    if (pieces === 4) {
      return [ makeDrum("kick", 22), makeDrum("snare", 14, 10), makeDrum("tom", 12), makeDrum("tom", 16) ];
    }
    return [ makeDrum("kick", 22), makeDrum("snare", 14, 10), makeDrum("tom", 10), makeDrum("tom", 12), makeDrum("tom", 16) ];
  }
  
  // EXPORT: create a fresh drum for the Add sheet
  export function createDrum(type, size_in, lugs) {
    return makeDrum(type, size_in, lugs ?? (type === "snare" ? 10 : 8));
  }
  