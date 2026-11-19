import type { Contact, Rung } from "./doc";

export interface PlcMemory {
  Q: boolean[];
  M: boolean[];
  T: { acc: number; done: boolean }[];
  C: { count: number; done: boolean; prev: boolean; preset: number }[];
  /** Per rung: the result and each contact's state, for the live view. */
  view: { result: boolean; contacts: boolean[][] }[];
}

export function newPlcMemory(): PlcMemory {
  return {
    Q: [false, false, false, false],
    M: Array(8).fill(false),
    T: Array.from({ length: 8 }, () => ({ acc: 0, done: false })),
    C: Array.from({ length: 8 }, () => ({ count: 0, done: false, prev: false, preset: 0 })),
    view: [],
  };
}

function bit(mem: PlcMemory, inputs: boolean[], addr: string): boolean {
  const n = Number(addr.slice(1)) - 1;
  switch (addr[0]) {
    case "I": return inputs[n] ?? false;
    case "Q": return mem.Q[n] ?? false;
    case "M": return mem.M[n] ?? false;
    case "T": return mem.T[n]?.done ?? false;
    case "C": return mem.C[n]?.done ?? false;
    default: return false;
  }
}

function contactValue(mem: PlcMemory, inputs: boolean[], c: Contact): boolean {
  const v = bit(mem, inputs, c.addr);
  return c.nc ? !v : v;
}

/** One PLC scan: evaluates every rung in order and writes its coil. */
export function scan(rungs: Rung[], mem: PlcMemory, inputs: boolean[], dt: number): void {
  mem.view = [];
  for (const rung of rungs) {
    const contacts = rung.branches.map((b) => b.map((c) => contactValue(mem, inputs, c)));
    const result = contacts.some((b) => b.every(Boolean));
    mem.view.push({ result, contacts });
    const { kind, target, preset } = rung.coil;
    const n = Number(target.slice(1)) - 1;
    const area = target[0];
    if (kind === "coil" || kind === "set" || kind === "reset") {
      const list = area === "Q" ? mem.Q : area === "M" ? mem.M : null;
      if (!list) continue;
      if (kind === "coil") list[n] = result;
      else if (kind === "set" && result) list[n] = true;
      else if (kind === "reset" && result) list[n] = false;
    } else if (kind === "ton" || kind === "tof") {
      const t = mem.T[n];
      if (!t || area !== "T") continue;
      if (kind === "ton") {
        if (result) {
          t.acc = Math.min(preset, t.acc + dt);
          t.done = t.acc >= preset;
        } else {
          t.acc = 0;
          t.done = false;
        }
      } else if (result) {
        t.acc = 0;
        t.done = true;
      } else if (t.done) {
        t.acc += dt;
        if (t.acc >= preset) {
          t.done = false;
          t.acc = 0;
        }
      }
    } else {
      const c = mem.C[n];
      if (!c || area !== "C") continue;
      if (kind === "ctu") {
        c.preset = preset;
        if (result && !c.prev) c.count += 1;
        c.prev = result;
        c.done = c.count >= preset;
      } else if (result) {
        c.count = 0;
        c.done = false;
      }
    }
  }
}
