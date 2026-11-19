import { defaultProps, PART_BY_TYPE } from "./catalog";
import type { CircuitDoc, Part, Rung } from "./doc";

export interface Example {
  slug: string;
  title: string;
  summary: string;
  doc: CircuitDoc;
}

/** Builds a circuit by label: part("K1", "contactor", x, y) then wire("K1.13", "K1.A1"). */
function circuit(build: (part: (label: string, type: string, x: number, y: number, props?: Part["props"]) => void, wire: (...ends: string[]) => void) => void, rungs: Rung[] = []): CircuitDoc {
  const parts: Part[] = [];
  const wires: CircuitDoc["wires"] = [];
  const byLabel = new Map<string, Part>();
  const part = (label: string, type: string, x: number, y: number, props: Part["props"] = {}) => {
    const def = PART_BY_TYPE[type];
    if (!def) throw new Error(`Unknown part ${type}`);
    const p: Part = { id: `p${parts.length + 1}`, type, x, y, rot: 0, label, props: { ...defaultProps(def), ...props } };
    parts.push(p);
    byLabel.set(label, p);
  };
  const end = (ref: string) => {
    const dot = ref.indexOf(".");
    const p = byLabel.get(ref.slice(0, dot));
    const term = ref.slice(dot + 1);
    const def = p && PART_BY_TYPE[p.type];
    if (!p || !def || ![...def.top, ...def.bottom].includes(term)) throw new Error(`Bad terminal ${ref}`);
    return { part: p.id, term };
  };
  /** Wires each end to the next: a chain. */
  const wire = (...ends: string[]) => {
    for (let i = 0; i + 1 < ends.length; i++) wires.push({ id: `w${wires.length + 1}`, from: end(ends[i]!), to: end(ends[i + 1]!) });
  };
  build(part, wire);
  return { v: 1, parts, wires, plc: { rungs }, supply: { voltagePct: 100 } };
}

type PartFn = Parameters<Parameters<typeof circuit>[0]>[0];
type WireFn = Parameters<Parameters<typeof circuit>[0]>[1];

/** Supply, motor breaker, contactor K1, overload F1 and motor M1, plus control breaker Q2. */
function motorFeeder(part: PartFn, wire: WireFn, power = 4) {
  part("SUP1", "supply3", 40, 40);
  part("Q1", "mcb3", 40, 180, { curve: "C", rating: 16 });
  part("K1", "contactor", 40, 320);
  part("F1", "overload", 40, 460, { setting: Math.round(power * 2 * 10) / 10 });
  part("M1", "motor3", 40, 600, { power });
  part("Q2", "mcb1", 400, 180, { curve: "C", rating: 6 });
  wire("SUP1.L1", "Q1.1");
  wire("SUP1.L2", "Q1.3");
  wire("SUP1.L3", "Q1.5");
  wire("Q1.2", "K1.1");
  wire("Q1.4", "K1.3");
  wire("Q1.6", "K1.5");
  wire("K1.2", "F1.1");
  wire("K1.4", "F1.3");
  wire("K1.6", "F1.5");
  wire("F1.2", "M1.U");
  wire("F1.4", "M1.V");
  wire("F1.6", "M1.W");
  wire("SUP1.PE", "M1.PE");
  wire("SUP1.L1", "Q2.1");
  wire("Q2.2", "F1.95");
}

const dol = circuit((part, wire) => {
  motorFeeder(part, wire);
  part("S1", "pb_nc", 400, 320);
  part("S2", "pb_no", 520, 320);
  part("H1", "lamp", 680, 460, { color: "green" });
  part("H2", "lamp", 800, 460, { color: "red" });
  wire("F1.96", "S1.11");
  wire("S1.12", "S2.13", "K1.13");
  wire("S2.14", "K1.A1", "H1.X1");
  wire("K1.14", "K1.A1");
  wire("K1.A2", "SUP1.N");
  wire("H1.X2", "SUP1.N");
  wire("Q2.2", "F1.97");
  wire("F1.98", "H2.X1");
  wire("H2.X2", "SUP1.N");
});

const forwardReverseDoc = circuit((part, wire) => {
  motorFeeder(part, wire, 3);
  part("K2", "contactor", 360, 600);
  part("S1", "pb_nc", 400, 320);
  part("S2", "pb_no", 520, 320);
  part("S3", "pb_no", 640, 320);
  wire("Q1.2", "K2.5");
  wire("Q1.4", "K2.3");
  wire("Q1.6", "K2.1");
  wire("K2.2", "F1.1");
  wire("K2.4", "F1.3");
  wire("K2.6", "F1.5");
  wire("F1.96", "S1.11");
  wire("S1.12", "S2.13", "S3.13");
  wire("S1.12", "K1.13");
  wire("S1.12", "K2.13");
  wire("S2.14", "K2.21");
  wire("K1.14", "S2.14");
  wire("K2.22", "K1.A1");
  wire("S3.14", "K1.21");
  wire("K2.14", "S3.14");
  wire("K1.22", "K2.A1");
  wire("K1.A2", "SUP1.N");
  wire("K2.A2", "SUP1.N");
});

/** Star-delta: K1 main, K2 star, K3 delta, switched by `changeover` (a timer or a relay). */
function starDelta(auto: boolean): CircuitDoc {
  return circuit((part, wire) => {
    part("SUP1", "supply3", 40, 40);
    part("Q1", "mcb3", 40, 180, { curve: "D", rating: 32 });
    part("K1", "contactor", 40, 320, { rating: 32 });
    part("F1", "overload", 40, 460, { setting: 13 });
    part("M1", "motor_sd", 40, 600, { power: 11 });
    part("K2", "contactor", 40, 760);
    part("K3", "contactor", 320, 760);
    part("Q2", "mcb1", 400, 180, { curve: "C", rating: 6 });
    part("S1", "pb_nc", 400, 320);
    part("S2", "pb_no", 520, 320);
    wire("SUP1.L1", "Q1.1");
    wire("SUP1.L2", "Q1.3");
    wire("SUP1.L3", "Q1.5");
    wire("Q1.2", "K1.1");
    wire("Q1.4", "K1.3");
    wire("Q1.6", "K1.5");
    wire("K1.2", "F1.1");
    wire("K1.4", "F1.3");
    wire("K1.6", "F1.5");
    wire("F1.2", "M1.U1");
    wire("F1.4", "M1.V1");
    wire("F1.6", "M1.W1");
    // Delta: W2 to L1, U2 to L2, V2 to L3.
    wire("K1.2", "K3.1");
    wire("K1.4", "K3.3");
    wire("K1.6", "K3.5");
    wire("K3.2", "M1.W2");
    wire("K3.4", "M1.U2");
    wire("K3.6", "M1.V2");
    // Star: the three winding ends tied together.
    wire("M1.W2", "K2.1");
    wire("M1.U2", "K2.3");
    wire("M1.V2", "K2.5");
    wire("K2.2", "K2.4", "K2.6");
    wire("SUP1.L1", "Q2.1");
    wire("Q2.2", "F1.95");
    wire("F1.96", "S1.11");
    wire("S1.12", "S2.13", "K1.13");
    wire("S2.14", "K1.A1");
    wire("K1.14", "K1.A1");
    if (auto) {
      part("KT1", "timer_on", 680, 320, { delay: 2 });
      wire("K1.A1", "KT1.A1");
      wire("K1.A1", "KT1.15");
      wire("KT1.16", "K3.21");
      wire("KT1.18", "K2.21");
      wire("KT1.A2", "SUP1.N");
    } else {
      part("S3", "pb_no", 640, 320);
      part("KA1", "relay", 760, 320);
      wire("K1.A1", "S3.13");
      wire("S3.14", "KA1.A1");
      wire("K1.A1", "KA1.11");
      wire("KA1.14", "KA1.A1");
      wire("K1.A1", "KA1.21");
      wire("KA1.22", "K3.21");
      wire("KA1.24", "K2.21");
      wire("KA1.A2", "SUP1.N");
    }
    wire("K3.22", "K2.A1");
    wire("K2.22", "K3.A1");
    wire("K1.A2", "SUP1.N");
    wire("K2.A2", "SUP1.N");
    wire("K3.A2", "SUP1.N");
  });
}

const timerControl = circuit((part, wire) => {
  part("SUP1", "supply3", 40, 40);
  part("Q1", "mcb1", 40, 180, { curve: "C", rating: 6 });
  part("S1", "pb_nc", 40, 320);
  part("S2", "pb_no", 160, 320);
  part("KA1", "relay", 320, 320);
  part("KT1", "timer_on", 560, 320, { delay: 5 });
  part("H1", "lamp", 560, 480, { color: "yellow" });
  wire("SUP1.L1", "Q1.1");
  wire("Q1.2", "S1.11");
  wire("S1.12", "S2.13", "KA1.11");
  wire("S2.14", "KA1.A1");
  wire("KA1.14", "KA1.A1", "KT1.A1");
  wire("Q1.2", "KT1.15");
  wire("KT1.18", "H1.X1");
  wire("KA1.A2", "SUP1.N");
  wire("KT1.A2", "SUP1.N");
  wire("H1.X2", "SUP1.N");
});

const multiLocation = circuit((part, wire) => {
  motorFeeder(part, wire, 2.2);
  part("S1", "pb_nc", 400, 320);
  part("S3", "pb_nc", 520, 320);
  part("S2", "pb_no", 640, 320);
  part("S4", "pb_no", 760, 320);
  wire("F1.96", "S1.11");
  wire("S1.12", "S3.11");
  wire("S3.12", "S2.13", "S4.13", "K1.13");
  wire("S2.14", "K1.A1");
  wire("S4.14", "K1.A1");
  wire("K1.14", "K1.A1");
  wire("K1.A2", "SUP1.N");
});

const alarm = circuit((part, wire) => {
  motorFeeder(part, wire, 5.5);
  part("S0", "estop", 400, 320);
  part("S1", "pb_nc", 520, 320);
  part("S2", "pb_no", 640, 320);
  part("KT1", "flasher", 760, 460, { delay: 0.5 });
  part("H1", "lamp", 760, 600, { color: "red" });
  part("H2", "horn", 880, 600);
  part("Q3", "rcbo", 1000, 180, { curve: "B", rating: 10 });
  part("H3", "lamp", 1000, 320, { color: "white" });
  wire("F1.96", "S0.11");
  wire("S0.12", "S1.11");
  wire("S1.12", "S2.13", "K1.13");
  wire("S2.14", "K1.A1");
  wire("K1.14", "K1.A1");
  wire("K1.A2", "SUP1.N");
  wire("Q2.2", "F1.97");
  wire("F1.98", "KT1.A1", "KT1.15");
  wire("F1.98", "H2.X1");
  wire("KT1.18", "H1.X1");
  wire("KT1.A2", "SUP1.N");
  wire("H1.X2", "SUP1.N");
  wire("H2.X2", "SUP1.N");
  wire("SUP1.L2", "Q3.1");
  wire("SUP1.N", "Q3.N");
  wire("Q3.2", "H3.X1");
  wire("Q3.N'", "H3.X2");
});

const transfer = circuit((part, wire) => {
  part("SUP1", "supply3", 40, 40);
  part("G1", "generator", 520, 40);
  part("Q1", "mcb3", 40, 180, { curve: "C", rating: 32 });
  part("Q2", "mcb3", 520, 180, { curve: "C", rating: 32 });
  part("K1", "contactor", 40, 320);
  part("K2", "contactor", 520, 320);
  part("M1", "motor3", 280, 520, { power: 5.5 });
  part("KF1", "phase_monitor", 800, 180);
  part("H1", "lamp", 880, 400, { color: "green" });
  part("H2", "lamp", 1000, 400, { color: "yellow" });
  wire("SUP1.L1", "Q1.1");
  wire("SUP1.L2", "Q1.3");
  wire("SUP1.L3", "Q1.5");
  wire("G1.L1", "Q2.1");
  wire("G1.L2", "Q2.3");
  wire("G1.L3", "Q2.5");
  wire("Q1.2", "K1.1");
  wire("Q1.4", "K1.3");
  wire("Q1.6", "K1.5");
  wire("Q2.2", "K2.1");
  wire("Q2.4", "K2.3");
  wire("Q2.6", "K2.5");
  wire("K1.2", "M1.U", "K2.2");
  wire("K1.4", "M1.V", "K2.4");
  wire("K1.6", "M1.W", "K2.6");
  wire("SUP1.PE", "M1.PE");
  wire("Q1.2", "KF1.L1");
  wire("Q1.4", "KF1.L2");
  wire("Q1.6", "KF1.L3");
  part("KA1", "relay", 800, 560);
  wire("Q1.2", "KF1.11");
  wire("KF1.14", "KA1.A1");
  wire("KA1.A2", "SUP1.N");
  // Mains healthy (KA1 on): K1 through K2's interlock.
  wire("Q1.2", "KA1.11");
  wire("KA1.14", "K2.21");
  wire("K2.22", "K1.A1", "H1.X1");
  // Mains lost: K2 from the generator through K1's interlock.
  wire("Q2.2", "KA1.21");
  wire("KA1.22", "K1.21");
  wire("K1.22", "K2.A1");
  wire("SUP1.N", "G1.N");
  wire("K1.A2", "SUP1.N");
  wire("K2.A2", "SUP1.N");
  wire("H1.X2", "SUP1.N");
  wire("H2.X2", "SUP1.N");
  wire("K2.A1", "H2.X1");
});

/** A pump, compressor or fan switched by a sensor contact. */
function sensorControl(kind: "Level" | "Pressure" | "Temperature"): CircuitDoc {
  return circuit((part, wire) => {
    motorFeeder(part, wire, kind === "Temperature" ? 1.5 : 3);
    part("S1", "selector", 400, 320, { positions: "2" });
    part("B1", "sensor", 560, 320, { kind });
    part("H1", "lamp", 760, 460, { color: "green" });
    wire("F1.96", "S1.13");
    // Level and pressure: run while low (NC). Temperature: run while hot (NO).
    if (kind === "Temperature") wire("S1.14", "B1.13"), wire("B1.14", "K1.A1");
    else wire("S1.14", "B1.11"), wire("B1.12", "K1.A1");
    wire("K1.A1", "H1.X1");
    wire("K1.A2", "SUP1.N");
    wire("H1.X2", "SUP1.N");
  });
}

const plcStartStop = circuit(
  (part, wire) => {
    part("SUP1", "supply3", 40, 40);
    part("Q1", "mcb1", 40, 180, { curve: "C", rating: 6 });
    part("S2", "pb_no", 40, 320);
    part("S1", "pb_no", 160, 320);
    part("PLC1", "plc", 320, 320);
    part("H1", "lamp", 360, 520, { color: "green" });
    wire("SUP1.L1", "Q1.1");
    wire("Q1.2", "PLC1.L");
    wire("SUP1.N", "PLC1.N");
    wire("Q1.2", "S2.13", "S1.13");
    wire("S2.14", "PLC1.I1");
    wire("S1.14", "PLC1.I2");
    wire("Q1.2", "PLC1.Q1a");
    wire("PLC1.Q1b", "H1.X1");
    wire("H1.X2", "SUP1.N");
  },
  [
    {
      id: "r1",
      branches: [
        [{ addr: "I1", nc: false }, { addr: "I2", nc: true }],
        [{ addr: "Q1", nc: false }, { addr: "I2", nc: true }],
      ],
      coil: { kind: "coil", target: "Q1", preset: 0 },
    },
  ],
);

export const EXAMPLES: Example[] = [
  { slug: "dol-start", title: "Direct-on-line start", summary: "Start and stop a motor with one contactor, a hold-in contact and an overload relay.", doc: dol },
  { slug: "forward-reverse", title: "Forward and reverse", summary: "Two interlocked contactors swap two phases to change the direction of rotation.", doc: forwardReverseDoc },
  { slug: "star-delta-manual", title: "Star-delta, manual changeover", summary: "Start in star, then press a second button to switch to delta.", doc: starDelta(false) },
  { slug: "star-delta-auto", title: "Star-delta, automatic", summary: "An on-delay timer switches the motor from star to delta.", doc: starDelta(true) },
  { slug: "timer-control", title: "Timer control", summary: "A lamp comes on five seconds after the start button is pressed.", doc: timerControl },
  { slug: "multi-location", title: "Start and stop from two places", summary: "Stops in series, starts in parallel.", doc: multiLocation },
  { slug: "alarm-protection", title: "Alarm and protection", summary: "Emergency stop, an overload alarm with a flashing lamp and horn, and an RCBO-protected circuit.", doc: alarm },
  { slug: "mains-generator", title: "Mains and generator changeover", summary: "A phase monitor hands the load to the generator when the mains fails.", doc: transfer },
  { slug: "liquid-level", title: "Liquid level control", summary: "A pump fills the tank while the level switch reads low.", doc: sensorControl("Level") },
  { slug: "pressure-control", title: "Pressure control", summary: "A compressor runs until the pressure switch opens.", doc: sensorControl("Pressure") },
  { slug: "temperature-control", title: "Temperature control", summary: "A fan runs while the thermostat reads hot.", doc: sensorControl("Temperature") },
  { slug: "plc-start-stop", title: "PLC start/stop", summary: "The same start/stop logic as a ladder program in the PLC.", doc: plcStartStop },
];

export const EXAMPLE_BY_SLUG: Record<string, Example> = Object.fromEntries(EXAMPLES.map((e) => [e.slug, e]));
