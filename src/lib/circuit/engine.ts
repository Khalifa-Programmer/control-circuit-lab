import { num, PART_BY_TYPE } from "./catalog";
import type { CircuitDoc, Part } from "./doc";
import { newPlcMemory, scan, type PlcMemory } from "./ladder";

/** A potential: a line phase (L1..L3 from the supply, G1..G3 from a generator), neutral, earth or 24 V DC. */
export type Phase = "L1" | "L2" | "L3" | "G1" | "G2" | "G3" | "N" | "PE" | "+24" | "0V";
const LINE: Phase[] = ["L1", "L2", "L3", "G1", "G2", "G3"];
const isLine = (p: Phase) => LINE.includes(p);

/** What a person can do to a part while the simulation runs. */
export interface Controls {
  /** Push buttons held down (until a time, so a quick click still registers). */
  pressedUntil: Record<string, number>;
  held: Record<string, boolean>;
  latched: Record<string, boolean>;
  position: Record<string, number>;
  /** Breakers switched off by hand. */
  off: Record<string, boolean>;
  sensorOn: Record<string, boolean>;
  generatorRunning: Record<string, boolean>;
  earthFault: Record<string, boolean>;
  /** Extra mechanical load on a motor, in percent of rated current. */
  motorLoad: Record<string, number>;
}

export interface PartView {
  energised: boolean;
  on?: boolean;
  lit?: boolean;
  brightness?: number;
  running?: boolean;
  direction?: "forward" | "reverse";
  mode?: "star" | "delta" | "stopped";
  current?: number;
  reading?: string;
  tripped?: string;
  remaining?: number;
}

export interface SimEvent {
  at: number;
  kind: "trip" | "warning" | "fault";
  text: string;
}

export interface SimState {
  time: number;
  controls: Controls;
  coil: Record<string, boolean>;
  timer: Record<string, { acc: number; out: boolean; prevCoil: boolean }>;
  tripped: Record<string, string>;
  thermal: Record<string, number>;
  motorStart: Record<string, number>;
  plc: PlcMemory;
  events: SimEvent[];
  warnings: string[];
  /** A short circuit no device could clear: the simulation is halted. */
  halted: string | null;
  netPhase: Record<string, Phase | "">;
  view: Record<string, PartView>;
  through: Record<string, number>;
  loadAmps: Record<string, number>;
  motorKey: Record<string, string>;
  plcInputs: boolean[];
}

export function newSimState(): SimState {
  return {
    time: 0,
    controls: { pressedUntil: {}, held: {}, latched: {}, position: {}, off: {}, sensorOn: {}, generatorRunning: {}, earthFault: {}, motorLoad: {} },
    coil: {},
    timer: {},
    tripped: {},
    thermal: {},
    motorStart: {},
    plc: newPlcMemory(),
    events: [],
    warnings: [],
    halted: null,
    netPhase: {},
    view: {},
    through: {},
    loadAmps: {},
    motorKey: {},
    plcInputs: Array(8).fill(false),
  };
}

const key = (part: string, term: string) => `${part}:${term}`;

const BREAKERS = new Set(["mcb1", "mcb3", "mccb", "rccb", "rcbo"]);
const RCD = new Set(["rccb", "rcbo"]);
const COILED = new Set(["contactor", "relay", "timer_on", "timer_off", "flasher"]);
const MEASURED = new Set(["mcb1", "mcb3", "mccb", "rcbo", "rccb", "overload", "ammeter", "ct"]);

function selectorPosition(part: Part, s: SimState): number {
  const positions = num(part.props.positions, 3);
  return s.controls.position[part.id] ?? (positions === 3 ? 1 : 0);
}

function pressed(part: Part, s: SimState): boolean {
  return Boolean(s.controls.held[part.id]) || (s.controls.pressedUntil[part.id] ?? -1) > s.time;
}

/** Pairs of terminals a part connects inside itself in its present state. */
function closures(part: Part, s: SimState, forcedOpen?: string): [string, string][] {
  const t = part.type;
  const open = part.id === forcedOpen;
  const def = PART_BY_TYPE[t];
  if (!def) return [];
  const poles = (): [string, string][] => def.top.map((a, i) => [a, def.bottom[i]!] as [string, string]).filter(([, b]) => b);
  if (BREAKERS.has(t)) return open || s.tripped[part.id] || s.controls.off[part.id] ? [] : poles();
  switch (t) {
    case "overload": {
      const main: [string, string][] = open ? [] : [["1", "2"], ["3", "4"], ["5", "6"]];
      return s.tripped[part.id] ? [...main, ["97", "98"]] : [...main, ["95", "96"]];
    }
    case "contactor":
      return s.coil[part.id] ? [["1", "2"], ["3", "4"], ["5", "6"], ["13", "14"]] : [["21", "22"]];
    case "relay":
      return s.coil[part.id] ? [["11", "14"], ["21", "24"]] : [["11", "12"], ["21", "22"]];
    case "timer_on":
    case "timer_off":
    case "flasher":
      return s.timer[part.id]?.out ? [["15", "18"]] : [["15", "16"]];
    case "phase_monitor":
      return s.coil[part.id] ? [["11", "14"]] : [["11", "12"]];
    case "pb_no":
      return pressed(part, s) ? [["13", "14"]] : [];
    case "pb_nc":
      return pressed(part, s) ? [] : [["11", "12"]];
    case "estop":
      return s.controls.latched[part.id] ? [] : [["11", "12"]];
    case "selector": {
      const pos = selectorPosition(part, s);
      if (num(part.props.positions, 3) === 2) return pos === 1 ? [["13", "14"]] : [["23", "24"]];
      return pos === 0 ? [["13", "14"]] : pos === 2 ? [["23", "24"]] : [];
    }
    case "sensor":
      return s.controls.sensorOn[part.id] ? [["13", "14"]] : [["11", "12"]];
    case "busbar":
      return [["1", "2"], ["2", "3"], ["3", "4"]];
    case "comb3":
      return [["L1", "1"], ["L1", "4"], ["L2", "2"], ["L2", "5"], ["L3", "3"], ["L3", "6"]];
    case "terminal":
    case "ammeter":
      return open ? [] : [["1", "2"]];
    case "ct":
      return open ? [] : [["P1", "P2"]];
    case "plc":
      return s.plc.Q.flatMap((on, i) => (on ? [[`Q${i + 1}a`, `Q${i + 1}b`] as [string, string]] : []));
    default:
      return [];
  }
}

interface Solution {
  find: (k: string) => string;
  phases: Map<string, Set<Phase>>;
  shorts: string[];
  psuOn: Set<string>;
}

function solve(doc: CircuitDoc, s: SimState, forcedOpen?: string): Solution {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    if (!parent.has(k)) parent.set(k, k);
    let c = k;
    while (c !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const w of doc.wires) union(key(w.from.part, w.from.term), key(w.to.part, w.to.term));
  for (const p of doc.parts) for (const [a, b] of closures(p, s, forcedOpen)) union(key(p.id, a), key(p.id, b));

  const sources: [string, Phase][] = [];
  for (const p of doc.parts) {
    if (p.type === "supply3") for (const t of ["L1", "L2", "L3", "N", "PE"] as Phase[]) sources.push([key(p.id, t), t]);
    if (p.type === "generator" && s.controls.generatorRunning[p.id]) {
      (["L1", "L2", "L3"] as const).forEach((t, i) => sources.push([key(p.id, t), (["G1", "G2", "G3"] as Phase[])[i]!]));
      sources.push([key(p.id, "N"), "N"]);
    }
  }
  const build = (extra: [string, Phase][]) => {
    const phases = new Map<string, Set<Phase>>();
    for (const [k, ph] of [...sources, ...extra]) {
      const r = find(k);
      if (!phases.has(r)) phases.set(r, new Set());
      phases.get(r)!.add(ph);
    }
    return phases;
  };
  let phases = build([]);
  // A 24 V supply gives DC once its input sees AC: two passes settle it.
  const psuOn = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    const extra: [string, Phase][] = [];
    for (const p of doc.parts) {
      if (p.type !== "psu24") continue;
      const v = voltage(phases.get(find(key(p.id, "L"))), phases.get(find(key(p.id, "N"))));
      if (v.ac && v.v >= 150) {
        psuOn.add(p.id);
        extra.push([key(p.id, "+"), "+24"], [key(p.id, "-"), "0V"]);
      }
    }
    phases = build(extra);
  }
  const shorts: string[] = [];
  for (const [r, set] of phases) {
    const lines = [...set].filter(isLine);
    const dc = set.has("+24") && set.has("0V");
    const earthed = set.has("N") || set.has("PE");
    if (lines.length > 1 || (lines.length === 1 && earthed) || dc || (set.has("+24") && lines.length > 0)) shorts.push(r);
  }
  return { find, phases, shorts, psuOn };
}

/** Voltage between two nets: 400/230 V AC or 24 V DC. */
function voltage(a?: Set<Phase>, b?: Set<Phase>): { v: number; ac: boolean } {
  if (!a || !b) return { v: 0, ac: true };
  const la = [...a].find(isLine);
  const lb = [...b].find(isLine);
  if (la && lb && la !== lb) return { v: 400, ac: true };
  if ((la && !lb && (b.has("N") || b.has("PE"))) || (lb && !la && (a.has("N") || a.has("PE")))) return { v: 230, ac: true };
  if ((a.has("+24") && b.has("0V")) || (b.has("+24") && a.has("0V"))) return { v: 24, ac: false };
  return { v: 0, ac: true };
}

function dominant(set?: Set<Phase>): Phase | "" {
  if (!set || set.size === 0) return "";
  for (const p of [...LINE, "+24", "0V", "N", "PE"] as Phase[]) if (set.has(p)) return p;
  return "";
}

function rated(part: Part): { v: number; ac: boolean } {
  const text = String(part.props.coilVoltage ?? part.props.voltage ?? "230 V AC");
  return { v: num(text, 230), ac: !text.includes("DC") };
}

function across(sol: Solution, part: Part, a: string, b: string, pct: number) {
  const pa = sol.phases.get(sol.find(key(part.id, a)));
  const pb = sol.phases.get(sol.find(key(part.id, b)));
  const v = voltage(pa, pb);
  // Only the mains is affected by the supply voltage setting.
  const fromMains = [...(pa ?? []), ...(pb ?? [])].some((p) => p === "L1" || p === "L2" || p === "L3");
  return { v: v.ac && fromMains ? (v.v * pct) / 100 : v.v, ac: v.ac };
}

const phaseIndex = (set?: Set<Phase>) => {
  const l = set && [...set].find(isLine);
  return l ? { sys: l[0], n: Number(l[1]) } : null;
};

interface MotorState { running: boolean; direction?: "forward" | "reverse"; mode?: "star" | "delta" | "stopped"; factor: number; singlePhasing?: boolean }

function motorState(part: Part, sol: Solution): MotorState {
  const ph = (t: string) => phaseIndex(sol.phases.get(sol.find(key(part.id, t))));
  const order = (a: ReturnType<typeof ph>, b: ReturnType<typeof ph>) => (a && b && (b.n - a.n + 3) % 3 === 1 ? "forward" : "reverse");
  if (part.type === "motor1") return { running: false, factor: 1 };
  if (part.type === "motor3") {
    const [u, v, w] = [ph("U"), ph("V"), ph("W")];
    const live = [u, v, w].filter(Boolean);
    const distinct = new Set(live.map((x) => `${x!.sys}${x!.n}`)).size;
    if (live.length === 3 && distinct === 3) return { running: true, direction: order(u, v), factor: 1 };
    if (live.length === 2 && distinct === 2) return { running: false, factor: 2.2, singlePhasing: true };
    return { running: false, factor: 0 };
  }
  // Star-delta motor: windings U1-U2, V1-V2, W1-W2.
  const ends = [["U1", "U2"], ["V1", "V2"], ["W1", "W2"]] as const;
  const firsts = ends.map(([a]) => ph(a));
  const seconds = ends.map(([, b]) => ph(b));
  const firstDistinct = firsts.every(Boolean) && new Set(firsts.map((x) => `${x!.sys}${x!.n}`)).size === 3;
  if (firstDistinct) {
    const delta = ends.every((_, i) => seconds[i] && `${seconds[i]!.sys}${seconds[i]!.n}` !== `${firsts[i]!.sys}${firsts[i]!.n}`);
    if (delta) return { running: true, direction: order(firsts[0], firsts[1]), mode: "delta", factor: 1 };
    const roots = ends.map(([, b]) => sol.find(key(part.id, b)));
    const star = roots[0] === roots[1] && roots[1] === roots[2] && !seconds.some(Boolean);
    if (star) return { running: true, direction: order(firsts[0], firsts[1]), mode: "star", factor: 1 / 3 };
  }
  return { running: false, mode: "stopped", factor: 0 };
}

const CURVE_K: Record<string, number> = { B: 5, C: 10, D: 20 };

/** Advances the simulation by dt seconds. */
export function step(doc: CircuitDoc, s: SimState, dt: number): void {
  if (s.halted) return;
  s.time += dt;
  const pct = doc.supply.voltagePct;
  const warnings = new Set<string>();
  const event = (kind: SimEvent["kind"], text: string) => {
    s.events.unshift({ at: s.time, kind, text });
    s.events.length = Math.min(s.events.length, 30);
  };

  const settle = () => {
    let sol = solve(doc, s);
    for (let i = 0; i < 12; i++) {
      // Short circuits: the nearest upstream breaker trips.
      if (sol.shorts.length) {
        const candidates = doc.parts.filter((p) => BREAKERS.has(p.type) && !s.tripped[p.id] && !s.controls.off[p.id]);
        let best: { part: Part; live: number } | null = null;
        for (const c of candidates) {
          const trial = solve(doc, s, c.id);
          if (trial.shorts.length) continue;
          const live = [...trial.phases.values()].filter((x) => x.size).length;
          if (!best || live > best.live) best = { part: c, live };
        }
        if (!best) {
          s.halted = "Short circuit with no breaker in front of it.";
          event("fault", s.halted);
          return sol;
        }
        s.tripped[best.part.id] = "short circuit";
        event("trip", `${best.part.label} tripped: short circuit`);
        sol = solve(doc, s);
        continue;
      }
      let changed = false;
      for (const p of doc.parts) {
        if (COILED.has(p.type)) {
          const v = across(sol, p, "A1", "A2", pct);
          const r = rated(p);
          const on = v.v > 0 && v.ac === r.ac && v.v >= 0.7 * r.v;
          if (v.v > 0 && (v.ac !== r.ac || Math.abs(v.v - r.v) > 0.2 * r.v))
            warnings.add(`${p.label}: coil is rated ${r.v} V ${r.ac ? "AC" : "DC"} but gets ${Math.round(v.v)} V ${v.ac ? "AC" : "DC"}`);
          if (Boolean(s.coil[p.id]) !== on) {
            s.coil[p.id] = on;
            changed = true;
            if (p.type !== "contactor" && p.type !== "relay") timerCoilChanged(p, s, on);
          }
        } else if (p.type === "phase_monitor") {
          const sets = ["L1", "L2", "L3"].map((t) => phaseIndex(sol.phases.get(sol.find(key(p.id, t)))));
          const ok = sets.every(Boolean) && sets[0]!.sys === sets[1]!.sys && sets[1]!.sys === sets[2]!.sys
            && (sets[1]!.n - sets[0]!.n + 3) % 3 === 1 && (sets[2]!.n - sets[1]!.n + 3) % 3 === 1 && pct >= 85;
          if (Boolean(s.coil[p.id]) !== ok) {
            s.coil[p.id] = ok;
            changed = true;
          }
        }
      }
      if (!changed) break;
      sol = solve(doc, s);
    }
    return sol;
  };

  let sol = settle();
  if (s.halted) return finishView(doc, s, sol, warnings);

  // PLC scan: inputs from the circuit, outputs to its relay contacts.
  const plc = doc.parts.find((p) => p.type === "plc");
  if (plc) {
    const power = across(sol, plc, "L", "N", pct);
    const powered = power.v >= 20;
    const inputs = Array.from({ length: 8 }, (_, i) => {
      const set = sol.phases.get(sol.find(key(plc.id, `I${i + 1}`)));
      return powered && !!set && ([...set].some(isLine) || set.has("+24"));
    });
    if (powered) scan(doc.plc.rungs, s.plc, inputs, dt);
    else s.plc.Q = [false, false, false, false];
    s.plcInputs = inputs;
    sol = settle();
  }

  // Timers count in real time.
  let timerChanged = false;
  for (const p of doc.parts) {
    const t = s.timer[p.id];
    if (!t) continue;
    const delay = num(p.props.delay, 3);
    const coil = Boolean(s.coil[p.id]);
    const before = t.out;
    if (p.type === "timer_on" && coil && !t.out) {
      t.acc += dt;
      if (t.acc >= delay) t.out = true;
    } else if (p.type === "timer_off" && !coil && t.out) {
      t.acc += dt;
      if (t.acc >= delay) t.out = false;
    } else if (p.type === "flasher" && coil) {
      t.acc += dt;
      if (t.acc >= delay) {
        t.acc = 0;
        t.out = !t.out;
      }
    }
    if (before !== t.out) timerChanged = true;
  }
  if (timerChanged) sol = settle();

  // Currents, then protection.
  const loadCurrent = loadCurrents(doc, s, sol, pct, warnings);
  s.loadAmps = Object.fromEntries(loadCurrent);
  s.through = {};
  let tripped = false;
  for (const d of doc.parts.filter((p) => MEASURED.has(p.type))) {
    if (BREAKERS.has(d.type) && (s.tripped[d.id] || s.controls.off[d.id])) continue;
    const trial = solve(doc, s, d.id);
    let through = 0;
    let leak = 0;
    for (const [id, amps] of loadCurrent) {
      const load = doc.parts.find((p) => p.id === id)!;
      if (!energisedIn(load, sol) || energisedIn(load, trial)) continue;
      through += amps;
      if (s.controls.earthFault[id]) leak += 0.1;
    }
    s.through[d.id] = through;
    const In = num(d.type === "overload" ? d.props.setting : d.props.rating, 10);
    if (d.type === "overload" || BREAKERS.has(d.type)) {
      const tau = d.type === "overload" ? 40 : 20;
      const ratio = through / In;
      const th = (s.thermal[d.id] ?? 0) + ((ratio * ratio - (s.thermal[d.id] ?? 0)) * dt) / tau;
      s.thermal[d.id] = Math.max(0, th);
      const limit = d.type === "overload" ? 1.44 : 1.69;
      if (th > limit && ratio > 1.05) {
        s.tripped[d.id] = "overload";
        s.thermal[d.id] = 0;
        event("trip", `${d.label} tripped: sustained overcurrent (${through.toFixed(1)} A)`);
        tripped = true;
        continue;
      }
    }
    if (BREAKERS.has(d.type) && d.type !== "rccb") {
      const k = d.type === "mccb" ? num(d.props.magnetic, 10) : (CURVE_K[String(d.props.curve)] ?? 10);
      if (through > k * In) {
        s.tripped[d.id] = "overcurrent";
        event("trip", `${d.label} tripped: ${through.toFixed(1)} A is over its curve ${d.type === "mccb" ? "" : d.props.curve}`.trim());
        tripped = true;
        continue;
      }
    }
    if (RCD.has(d.type) && leak * 1000 >= num(d.props.sensitivity, 30)) {
      s.tripped[d.id] = "earth leakage";
      event("trip", `${d.label} tripped: earth leakage`);
      tripped = true;
    }
  }
  if (tripped) sol = settle();
  finishView(doc, s, sol, warnings);
}

function energisedIn(load: Part, sol: Solution): boolean {
  const def = PART_BY_TYPE[load.type];
  if (!def) return false;
  return [...def.top, ...def.bottom].some((t) => [...(sol.phases.get(sol.find(key(load.id, t))) ?? [])].some((p) => isLine(p) || p === "+24"));
}

function timerCoilChanged(p: Part, s: SimState, on: boolean) {
  const t = (s.timer[p.id] ??= { acc: 0, out: false, prevCoil: false });
  t.prevCoil = on;
  t.acc = 0;
  if (p.type === "timer_on" && !on) t.out = false;
  if (p.type === "timer_off" && on) t.out = true;
  if (p.type === "flasher") t.out = on;
}

function loadCurrents(doc: CircuitDoc, s: SimState, sol: Solution, pct: number, warnings: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of doc.parts) {
    if (p.type === "lamp" || p.type === "horn") {
      const v = across(sol, p, "X1", "X2", pct);
      if (v.v > 0) out.set(p.id, v.ac ? 0.1 : 0.5);
    } else if (COILED.has(p.type)) {
      if (s.coil[p.id]) out.set(p.id, 0.05);
    } else if (p.type === "motor3" || p.type === "motor_sd" || p.type === "motor1") {
      const m = motorCurrent(p, s, sol, pct, warnings);
      if (m > 0) out.set(p.id, m);
    }
  }
  return out;
}

function motorCurrent(p: Part, s: SimState, sol: Solution, pct: number, warnings: Set<string>): number {
  const kw = num(p.props.power, 4);
  let st = motorState(p, sol);
  let rated = (kw * 1000) / (Math.sqrt(3) * 400 * 0.85 * 0.88);
  if (p.type === "motor1") {
    const v = across(sol, p, "L", "N", pct);
    st = { running: v.v >= 150 && v.ac, factor: 1 };
    rated = (kw * 1000) / (230 * 0.8 * 0.85);
  }
  if (st.singlePhasing) warnings.add(`${p.label}: one phase is missing, the motor hums and draws high current`);
  if (!st.running) {
    delete s.motorStart[p.id];
    return st.singlePhasing ? rated * st.factor : 0;
  }
  const key = `${p.id}:${st.mode ?? "run"}`;
  const prev = s.motorStart[p.id];
  const prevKey = s.motorKey;
  if (prev === undefined || prevKey[p.id] !== key) {
    s.motorStart[p.id] = s.time;
    prevKey[p.id] = key;
  }
  const since = s.time - (s.motorStart[p.id] ?? s.time);
  const inrush = since < 0.5 ? 6 : since < 1.5 ? 6 - (since - 0.5) * 5 : 1;
  const sag = pct < 100 ? (100 / pct) ** 2 : 1;
  if (pct < 85) warnings.add(`${p.label}: supply is at ${pct}%, the motor slows and draws more current`);
  const load = (s.controls.motorLoad[p.id] ?? 100) / 100;
  return rated * st.factor * Math.max(inrush, load) * sag;
}

function finishView(doc: CircuitDoc, s: SimState, sol: Solution, warnings: Set<string>) {
  const pct = doc.supply.voltagePct;
  const through = s.through;
  s.warnings = [...warnings];
  s.netPhase = {};
  for (const w of doc.wires) {
    const k = key(w.from.part, w.from.term);
    s.netPhase[k] = s.halted ? "" : dominant(sol.phases.get(sol.find(k)));
  }
  const view: Record<string, PartView> = {};
  for (const p of doc.parts) {
    const def = PART_BY_TYPE[p.type];
    const terms = def ? [...def.top, ...def.bottom] : [];
    const energised = !s.halted && terms.some((t) => [...(sol.phases.get(sol.find(key(p.id, t))) ?? [])].some((x) => isLine(x) || x === "+24"));
    const v: PartView = { energised };
    if (COILED.has(p.type) || p.type === "phase_monitor") v.on = Boolean(s.coil[p.id]);
    if (s.timer[p.id]) {
      v.on = Boolean(s.coil[p.id]);
      const delay = num(p.props.delay, 3);
      const t = s.timer[p.id]!;
      if ((p.type === "timer_on" && v.on && !t.out) || (p.type === "timer_off" && !v.on && t.out)) v.remaining = Math.max(0, delay - t.acc);
    }
    if (s.tripped[p.id]) v.tripped = s.tripped[p.id];
    if (p.type === "lamp" || p.type === "horn") {
      const volts = across(sol, p, "X1", "X2", pct);
      const r = rated(p);
      const lit = !s.halted && volts.v >= 0.5 * (p.type === "horn" ? 230 : r.v) && (p.type === "horn" || volts.ac === r.ac);
      v.lit = lit;
      v.brightness = lit ? Math.min(1, volts.v / (p.type === "horn" ? 230 : r.v)) : 0;
      if (p.type === "lamp" && volts.v > 0 && (volts.ac !== r.ac || volts.v > 1.3 * r.v)) warnings.add(`${p.label}: lamp is rated ${r.v} V ${r.ac ? "AC" : "DC"} but gets ${Math.round(volts.v)} V`);
    }
    if (p.type === "motor3" || p.type === "motor_sd" || p.type === "motor1") {
      let st = motorState(p, sol);
      if (p.type === "motor1") st = { running: across(sol, p, "L", "N", pct).v >= 150, factor: 1 };
      v.running = !s.halted && st.running && pct >= 60;
      v.direction = st.direction ?? (st.running ? "forward" : undefined);
      if (p.type === "motor_sd") v.mode = v.running ? st.mode : "stopped";
      v.current = s.loadAmps[p.id] ?? 0;
    }
    if (p.type === "voltmeter") v.reading = `${Math.round(across(sol, p, "1", "2", pct).v)} V`;
    if (p.type === "ammeter") {
      let amps = through[p.id] ?? 0;
      const ct = doc.parts.find((c) => c.type === "ct" && sol.find(key(c.id, "S1")) === sol.find(key(p.id, "1")));
      if (ct) amps = through[ct.id] ?? 0;
      v.reading = `${amps.toFixed(1)} A`;
    }
    if (MEASURED.has(p.type) && p.type !== "ammeter" && p.type !== "ct") v.current = through[p.id] ?? 0;
    view[p.id] = v;
  }
  s.warnings = [...warnings];
  s.view = view;
}

/** Readings worth listing beside the canvas: motors, device currents and meters. */
export function readings(doc: CircuitDoc, s: SimState): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const p of doc.parts) {
    const v = s.view[p.id];
    if (!v) continue;
    if (p.type.startsWith("motor")) {
      const what = v.running ? [v.direction, v.mode !== "stopped" ? v.mode : undefined].filter(Boolean).join(", ") : "stopped";
      out.push({ label: p.label, value: `${what}, ${(v.current ?? 0).toFixed(1)} A` });
    } else if (v.reading) out.push({ label: p.label, value: v.reading });
    else if (v.current !== undefined && v.current > 0) out.push({ label: p.label, value: `${v.current.toFixed(1)} A` });
  }
  return out;
}
