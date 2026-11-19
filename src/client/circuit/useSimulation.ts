import { useEffect, useRef, useState } from "react";
import type { CircuitDoc } from "@/lib/circuit/doc";
import { newSimState, step, type SimState } from "@/lib/circuit/engine";

const TICK = 0.05;

/** Runs the simulation in real time while `running`; the doc is read fresh each tick. */
export function useSimulation(doc: CircuitDoc) {
  const docRef = useRef(doc);
  docRef.current = doc;
  const [sim, setSim] = useState<SimState | null>(null);
  const simRef = useRef<SimState | null>(null);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!sim) return;
    simRef.current = sim;
    step(docRef.current, sim, 0.001);
    setFrame((f) => f + 1);
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      let dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      while (dt > 1e-6) {
        const d = Math.min(TICK, dt);
        step(docRef.current, sim, d);
        dt -= d;
      }
      setFrame((f) => f + 1);
    }, TICK * 1000);
    return () => clearInterval(timer);
  }, [sim]);

  return {
    sim,
    start: () => setSim(newSimState()),
    stop: () => {
      simRef.current = null;
      setSim(null);
    },
    reset: () => setSim(newSimState()),
    /** Applies a change to the controls and steps once so the canvas shows it at once. */
    act: (change: (s: SimState) => void) => {
      if (!sim) return;
      change(sim);
      step(docRef.current, sim, 0.001);
      setFrame((f) => f + 1);
    },
  };
}
