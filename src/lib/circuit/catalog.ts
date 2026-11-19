export type PropSpec =
  | { key: string; label: string; kind: "number"; unit?: string; min: number; max: number; step?: number; default: number }
  | { key: string; label: string; kind: "select"; options: readonly string[]; default: string };

export interface PartDef {
  type: string;
  name: string;
  category: Category;
  prefix: string;
  top: string[];
  bottom: string[];
  /** Short text drawn inside the symbol. */
  glyph: string;
  props: PropSpec[];
}

export const CATEGORIES = [
  "Supply",
  "Protection",
  "Switching",
  "Command",
  "Timers and relays",
  "Loads",
  "Distribution",
  "Measuring",
  "PLC",
] as const;
export type Category = (typeof CATEGORIES)[number];

const COIL = { key: "coilVoltage", label: "Coil voltage", kind: "select", options: ["230 V AC", "24 V DC", "400 V AC"], default: "230 V AC" } as const;
const CURVE = { key: "curve", label: "Trip curve", kind: "select", options: ["B", "C", "D"], default: "C" } as const;
const rating = (d: number, max = 125): PropSpec => ({ key: "rating", label: "Rated current", kind: "number", unit: "A", min: 0.5, max, step: 0.5, default: d });
const delay: PropSpec = { key: "delay", label: "Delay", kind: "number", unit: "s", min: 0.1, max: 3600, step: 0.1, default: 3 };
const power = (d: number): PropSpec => ({ key: "power", label: "Power", kind: "number", unit: "kW", min: 0.1, max: 200, step: 0.1, default: d });
const sensitivity: PropSpec = { key: "sensitivity", label: "Residual current", kind: "select", options: ["30 mA", "100 mA", "300 mA"], default: "30 mA" };

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

export const PARTS: PartDef[] = [
  { type: "supply3", name: "Three-phase supply", category: "Supply", prefix: "SUP", top: [], bottom: ["L1", "L2", "L3", "N", "PE"], glyph: "3~ 400/230 V", props: [] },
  { type: "generator", name: "Generator", category: "Supply", prefix: "G", top: [], bottom: ["L1", "L2", "L3", "N"], glyph: "G 3~", props: [{ key: "kva", label: "Rating", kind: "number", unit: "kVA", min: 1, max: 2000, default: 30 }] },
  { type: "psu24", name: "24 V power supply", category: "Supply", prefix: "T", top: ["L", "N"], bottom: ["+", "-"], glyph: "~/= 24 V", props: [] },

  { type: "mcb1", name: "MCB 1-pole", category: "Protection", prefix: "Q", top: ["1"], bottom: ["2"], glyph: "MCB", props: [CURVE, rating(10, 63)] },
  { type: "mcb3", name: "MCB 3-pole", category: "Protection", prefix: "Q", top: ["1", "3", "5"], bottom: ["2", "4", "6"], glyph: "MCB 3P", props: [CURVE, rating(16, 63)] },
  { type: "mccb", name: "MCCB", category: "Protection", prefix: "Q", top: ["1", "3", "5"], bottom: ["2", "4", "6"], glyph: "MCCB", props: [rating(100, 1600), { key: "magnetic", label: "Magnetic trip", kind: "number", unit: "× In", min: 2, max: 15, default: 10 }] },
  { type: "rccb", name: "RCCB (L + N)", category: "Protection", prefix: "Q", top: ["1", "N"], bottom: ["2", "N'"], glyph: "RCCB", props: [sensitivity, rating(40, 100)] },
  { type: "rcbo", name: "RCBO (L + N)", category: "Protection", prefix: "Q", top: ["1", "N"], bottom: ["2", "N'"], glyph: "RCBO", props: [CURVE, rating(16, 63), sensitivity] },
  { type: "overload", name: "Thermal overload relay", category: "Protection", prefix: "F", top: ["1", "3", "5", "95", "97"], bottom: ["2", "4", "6", "96", "98"], glyph: "OL", props: [{ key: "setting", label: "Current setting", kind: "number", unit: "A", min: 0.1, max: 400, step: 0.1, default: 9 }] },
  { type: "spd", name: "Surge arrester", category: "Protection", prefix: "F", top: ["L"], bottom: ["PE"], glyph: "SPD", props: [] },

  { type: "contactor", name: "Contactor", category: "Switching", prefix: "K", top: ["1", "3", "5", "13", "21", "A1"], bottom: ["2", "4", "6", "14", "22", "A2"], glyph: "KM", props: [COIL, rating(25, 400)] },
  { type: "relay", name: "Auxiliary relay", category: "Timers and relays", prefix: "KA", top: ["11", "21", "A1"], bottom: ["12", "14", "22", "24", "A2"], glyph: "KA", props: [COIL] },
  { type: "timer_on", name: "On-delay timer", category: "Timers and relays", prefix: "KT", top: ["15", "A1"], bottom: ["16", "18", "A2"], glyph: "TON", props: [delay, COIL] },
  { type: "timer_off", name: "Off-delay timer", category: "Timers and relays", prefix: "KT", top: ["15", "A1"], bottom: ["16", "18", "A2"], glyph: "TOF", props: [delay, COIL] },
  { type: "flasher", name: "Flasher timer", category: "Timers and relays", prefix: "KT", top: ["15", "A1"], bottom: ["16", "18", "A2"], glyph: "FLASH", props: [{ ...delay, default: 1 } as PropSpec, COIL] },
  { type: "phase_monitor", name: "Phase monitor", category: "Timers and relays", prefix: "KF", top: ["L1", "L2", "L3", "11"], bottom: ["12", "14"], glyph: "PHASE", props: [] },

  { type: "pb_no", name: "Push button (NO)", category: "Command", prefix: "S", top: ["13"], bottom: ["14"], glyph: "I", props: [] },
  { type: "pb_nc", name: "Push button (NC)", category: "Command", prefix: "S", top: ["11"], bottom: ["12"], glyph: "O", props: [] },
  { type: "estop", name: "Emergency stop", category: "Command", prefix: "S", top: ["11"], bottom: ["12"], glyph: "E-STOP", props: [] },
  { type: "selector", name: "Selector switch", category: "Command", prefix: "S", top: ["13", "23"], bottom: ["14", "24"], glyph: "SEL", props: [{ key: "positions", label: "Positions", kind: "select", options: ["2", "3"], default: "3" }] },
  { type: "sensor", name: "Level / pressure / temperature switch", category: "Command", prefix: "B", top: ["11", "13"], bottom: ["12", "14"], glyph: "SENSOR", props: [{ key: "kind", label: "Senses", kind: "select", options: ["Level", "Pressure", "Temperature"], default: "Level" }] },

  { type: "lamp", name: "Pilot lamp", category: "Loads", prefix: "H", top: ["X1"], bottom: ["X2"], glyph: "", props: [{ key: "color", label: "Colour", kind: "select", options: ["green", "red", "yellow", "white", "blue"], default: "green" }, { key: "voltage", label: "Voltage", kind: "select", options: ["230 V AC", "24 V DC"], default: "230 V AC" }] },
  { type: "horn", name: "Alarm horn", category: "Loads", prefix: "H", top: ["X1"], bottom: ["X2"], glyph: "HORN", props: [] },
  { type: "motor3", name: "Three-phase motor", category: "Loads", prefix: "M", top: ["U", "V", "W"], bottom: ["PE"], glyph: "M 3~", props: [power(4)] },
  { type: "motor_sd", name: "Motor for star-delta (6 terminals)", category: "Loads", prefix: "M", top: ["U1", "V1", "W1"], bottom: ["W2", "U2", "V2"], glyph: "M 3~ Y/Δ", props: [power(11)] },
  { type: "motor1", name: "Single-phase motor", category: "Loads", prefix: "M", top: ["L", "N"], bottom: ["PE"], glyph: "M 1~", props: [power(0.75)] },

  { type: "busbar", name: "Busbar", category: "Distribution", prefix: "W", top: ["1", "2", "3", "4"], bottom: [], glyph: "BUS", props: [] },
  { type: "comb3", name: "Comb busbar (3-phase)", category: "Distribution", prefix: "W", top: ["L1", "L2", "L3"], bottom: ["1", "2", "3", "4", "5", "6"], glyph: "COMB", props: [] },
  { type: "terminal", name: "Terminal block", category: "Distribution", prefix: "X", top: ["1"], bottom: ["2"], glyph: "", props: [] },

  { type: "ct", name: "Current transformer", category: "Measuring", prefix: "TA", top: ["P1", "S1"], bottom: ["P2", "S2"], glyph: "CT", props: [{ key: "ratio", label: "Primary current", kind: "number", unit: "A /5 A", min: 5, max: 5000, default: 100 }] },
  { type: "ammeter", name: "Ammeter", category: "Measuring", prefix: "P", top: ["1"], bottom: ["2"], glyph: "A", props: [] },
  { type: "voltmeter", name: "Voltmeter", category: "Measuring", prefix: "P", top: ["1"], bottom: ["2"], glyph: "V", props: [] },

  { type: "plc", name: "PLC (8 in, 4 out)", category: "PLC", prefix: "PLC", top: ["L", "N", ...range("I", 1, 8)], bottom: range("Q", 1, 4).flatMap((q) => [`${q}a`, `${q}b`]), glyph: "PLC", props: [] },
];

export const PART_BY_TYPE: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.type, p]));

export const GRID = 20;
export const PITCH = 40;
export const PART_H = 80;

export function partWidth(def: PartDef): number {
  return Math.max(2, def.top.length, def.bottom.length) * PITCH;
}

/** Terminal position relative to the part's unrotated top-left corner. */
export function terminalOffset(def: PartDef, term: string): { x: number; y: number } | null {
  const w = partWidth(def);
  const place = (list: string[], y: number) => {
    const i = list.indexOf(term);
    if (i < 0) return null;
    const start = (w - list.length * PITCH) / 2;
    return { x: start + PITCH / 2 + i * PITCH, y };
  };
  return place(def.top, 0) ?? place(def.bottom, PART_H);
}

/** Absolute position of a terminal, after rotation about the part's centre. */
export function terminalPoint(
  part: { type: string; x: number; y: number; rot: number },
  term: string,
): { x: number; y: number } | null {
  const def = PART_BY_TYPE[part.type];
  if (!def) return null;
  const off = terminalOffset(def, term);
  if (!off) return null;
  const w = partWidth(def);
  const cx = w / 2;
  const cy = PART_H / 2;
  const dx = off.x - cx;
  const dy = off.y - cy;
  const r = ((part.rot % 360) + 360) % 360;
  const [rx, ry] =
    r === 90 ? [-dy, dx] : r === 180 ? [-dx, -dy] : r === 270 ? [dy, -dx] : [dx, dy];
  return { x: part.x + cx + rx, y: part.y + cy + ry };
}

export function defaultProps(def: PartDef): Record<string, string | number> {
  return Object.fromEntries(def.props.map((p) => [p.key, p.default]));
}

/** The next free label for a part type: K1, K2, ... */
export function nextLabel(def: PartDef, used: string[]): string {
  for (let n = 1; ; n++) {
    const label = `${def.prefix}${n}`;
    if (!used.includes(label)) return label;
  }
}

/** The number in a property such as "230 V AC" or 10. */
export function num(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}
