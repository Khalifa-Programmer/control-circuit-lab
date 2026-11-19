import { describe, expect, it } from "vitest";
import { docSchema, type CircuitDoc } from "./doc";
import { newSimState, step, type SimState } from "./engine";
import { EXAMPLE_BY_SLUG, EXAMPLES } from "./examples";
import { newPlcMemory, scan } from "./ladder";

const clone = (slug: string): CircuitDoc => structuredClone(EXAMPLE_BY_SLUG[slug]!.doc);
const id = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
function run(doc: CircuitDoc, s: SimState, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) step(doc, s, dt);
}
function click(doc: CircuitDoc, s: SimState, label: string) {
  s.controls.pressedUntil[id(doc, label)] = s.time + 0.2;
  run(doc, s, 0.4);
}

describe("examples", () => {
  it("are valid diagrams", () => {
    for (const e of EXAMPLES) expect(docSchema.safeParse(e.doc).success, e.slug).toBe(true);
  });
});

describe("direct-on-line start", () => {
  it("starts, holds in, shows inrush and stops", () => {
    const doc = clone("dol-start");
    const s = newSimState();
    run(doc, s, 0.2);
    expect(s.view[id(doc, "M1")]!.running).toBe(false);
    s.controls.pressedUntil[id(doc, "S2")] = s.time + 0.2;
    run(doc, s, 0.1);
    expect(s.view[id(doc, "K1")]!.on).toBe(true);
    const inrush = s.view[id(doc, "M1")]!.current!;
    run(doc, s, 3);
    const running = s.view[id(doc, "M1")]!.current!;
    expect(inrush).toBeGreaterThan(running * 4);
    expect(s.view[id(doc, "M1")]).toMatchObject({ running: true, direction: "forward" });
    expect(s.view[id(doc, "H1")]!.lit).toBe(true);
    expect(s.netPhase[`${id(doc, "SUP1")}:L1`]).toBe("L1");
    click(doc, s, "S1");
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
    expect(s.view[id(doc, "M1")]!.running).toBe(false);
  });

  it("trips the overload relay on sustained overcurrent until reset", () => {
    const doc = clone("dol-start");
    const s = newSimState();
    click(doc, s, "S2");
    s.controls.motorLoad[id(doc, "M1")] = 250;
    run(doc, s, 60, 0.1);
    const f1 = id(doc, "F1");
    expect(s.tripped[f1]).toBe("overload");
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
    expect(s.view[id(doc, "H2")]!.lit).toBe(true);
    s.controls.motorLoad[id(doc, "M1")] = 100;
    click(doc, s, "S2");
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
    delete s.tripped[f1];
    click(doc, s, "S2");
    expect(s.view[id(doc, "K1")]!.on).toBe(true);
  });

  it("a B-curve breaker trips on the starting current, a C-curve one does not", () => {
    const doc = clone("dol-start");
    const q1 = doc.parts.find((p) => p.label === "Q1")!;
    q1.props.rating = 6;
    q1.props.curve = "B";
    const s = newSimState();
    click(doc, s, "S2");
    expect(s.tripped[q1.id]).toBe("overcurrent");
    q1.props.curve = "C";
    const s2 = newSimState();
    click(doc, s2, "S2");
    expect(s2.tripped[q1.id]).toBeUndefined();
  });

  it("a supply voltage drop raises motor current and dims lamps", () => {
    const doc = clone("dol-start");
    const s = newSimState();
    click(doc, s, "S2");
    run(doc, s, 3);
    const normal = s.view[id(doc, "M1")]!.current!;
    doc.supply.voltagePct = 80;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "M1")]!.current!).toBeGreaterThan(normal * 1.3);
    expect(s.view[id(doc, "H1")]!.brightness!).toBeLessThan(1);
    expect(s.warnings.join(" ")).toContain("M1");
  });
});

describe("protection", () => {
  it("the nearest upstream breaker clears a short circuit", () => {
    const doc = clone("dol-start");
    // A wire from the control breaker's output straight to neutral.
    doc.wires.push({ id: "short", from: { part: id(doc, "Q2"), term: "2" }, to: { part: id(doc, "SUP1"), term: "N" } });
    const s = newSimState();
    run(doc, s, 0.1);
    expect(s.tripped[id(doc, "Q2")]).toBe("short circuit");
    expect(s.tripped[id(doc, "Q1")]).toBeUndefined();
    expect(s.events[0]!.text).toContain("Q2");
  });

  it("an RCBO trips on earth leakage", () => {
    const doc = clone("alarm-protection");
    const s = newSimState();
    run(doc, s, 0.2);
    expect(s.view[id(doc, "H3")]!.lit).toBe(true);
    s.controls.earthFault[id(doc, "H3")] = true;
    run(doc, s, 0.2);
    expect(s.tripped[id(doc, "Q3")]).toBe("earth leakage");
    expect(s.view[id(doc, "H3")]!.lit).toBe(false);
  });

  it("warns when a coil gets the wrong voltage", () => {
    const doc = clone("dol-start");
    doc.parts.find((p) => p.label === "K1")!.props.coilVoltage = "24 V DC";
    const s = newSimState();
    s.controls.held[id(doc, "S2")] = true;
    run(doc, s, 0.2);
    expect(s.warnings.join(" ")).toMatch(/K1: coil is rated 24 V DC but gets 230 V AC/);
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
  });
});

describe("star-delta and reversing", () => {
  it("the timer switches from star to delta", () => {
    const doc = clone("star-delta-auto");
    const s = newSimState();
    click(doc, s, "S2");
    expect(s.view[id(doc, "M1")]!.mode).toBe("star");
    expect(s.view[id(doc, "KT1")]!.remaining).toBeGreaterThan(0);
    run(doc, s, 2);
    expect(s.view[id(doc, "M1")]!.mode).toBe("delta");
    click(doc, s, "S1");
    expect(s.view[id(doc, "M1")]!.mode).toBe("stopped");
  });

  it("the manual changeover moves to delta on the second button", () => {
    const doc = clone("star-delta-manual");
    const s = newSimState();
    click(doc, s, "S2");
    expect(s.view[id(doc, "M1")]!.mode).toBe("star");
    click(doc, s, "S3");
    expect(s.view[id(doc, "M1")]!.mode).toBe("delta");
  });

  it("reverse runs the other way, and the interlock blocks forward", () => {
    const doc = clone("forward-reverse");
    const s = newSimState();
    click(doc, s, "S3");
    expect(s.view[id(doc, "M1")]).toMatchObject({ running: true, direction: "reverse" });
    click(doc, s, "S2");
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
  });
});

describe("changeover and sensors", () => {
  it("hands the load to the generator when the mains breaker opens", () => {
    const doc = clone("mains-generator");
    const s = newSimState();
    s.controls.generatorRunning[id(doc, "G1")] = true;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "K1")]!.on).toBe(true);
    expect(s.view[id(doc, "K2")]!.on).toBe(false);
    s.controls.off[id(doc, "Q1")] = true;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "K1")]!.on).toBe(false);
    expect(s.view[id(doc, "K2")]!.on).toBe(true);
    expect(s.view[id(doc, "M1")]!.running).toBe(true);
    s.controls.off[id(doc, "Q1")] = false;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "K1")]!.on).toBe(true);
  });

  it("the level switch runs the pump while low", () => {
    const doc = clone("liquid-level");
    const s = newSimState();
    s.controls.position[id(doc, "S1")] = 1;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "M1")]!.running).toBe(true);
    s.controls.sensorOn[id(doc, "B1")] = true;
    run(doc, s, 0.2);
    expect(s.view[id(doc, "M1")]!.running).toBe(false);
  });
});

describe("PLC", () => {
  it("runs the ladder program each scan", () => {
    const doc = clone("plc-start-stop");
    const s = newSimState();
    click(doc, s, "S2");
    expect(s.plc.Q[0]).toBe(true);
    expect(s.plc.view[0]!.result).toBe(true);
    expect(s.view[id(doc, "H1")]!.lit).toBe(true);
    click(doc, s, "S1");
    expect(s.view[id(doc, "H1")]!.lit).toBe(false);
  });

  it("timers, counters, set and reset", () => {
    const mem = newPlcMemory();
    const rungs = [
      { id: "a", branches: [[{ addr: "I1", nc: false }]], coil: { kind: "ton" as const, target: "T1", preset: 1 } },
      { id: "b", branches: [[{ addr: "T1", nc: false }]], coil: { kind: "set" as const, target: "M1", preset: 0 } },
      { id: "c", branches: [[{ addr: "I2", nc: false }]], coil: { kind: "ctu" as const, target: "C1", preset: 2 } },
      { id: "d", branches: [[{ addr: "C1", nc: false }]], coil: { kind: "coil" as const, target: "Q1", preset: 0 } },
      { id: "e", branches: [[{ addr: "I3", nc: false }]], coil: { kind: "ctr" as const, target: "C1", preset: 0 } },
      { id: "f", branches: [[{ addr: "I3", nc: false }]], coil: { kind: "reset" as const, target: "M1", preset: 0 } },
      { id: "g", branches: [[{ addr: "I4", nc: false }]], coil: { kind: "tof" as const, target: "T2", preset: 1 } },
    ];
    const io = (bits: number[]) => Array.from({ length: 8 }, (_, i) => bits.includes(i + 1));
    scan(rungs, mem, io([1]), 0.5);
    expect(mem.M[0]).toBe(false);
    scan(rungs, mem, io([1]), 0.6);
    expect(mem.M[0]).toBe(true);
    scan(rungs, mem, io([2]), 0.1);
    scan(rungs, mem, io([]), 0.1);
    expect(mem.Q[0]).toBe(false);
    scan(rungs, mem, io([2]), 0.1);
    expect(mem.C[0]!.count).toBe(2);
    expect(mem.Q[0]).toBe(true);
    scan(rungs, mem, io([3]), 0.1);
    scan(rungs, mem, io([]), 0.1);
    expect(mem.Q[0]).toBe(false);
    expect(mem.M[0]).toBe(false);
    scan(rungs, mem, io([4]), 0.1);
    expect(mem.T[1]!.done).toBe(true);
    scan(rungs, mem, io([]), 0.6);
    expect(mem.T[1]!.done).toBe(true);
    scan(rungs, mem, io([]), 0.6);
    expect(mem.T[1]!.done).toBe(false);
  });
});
