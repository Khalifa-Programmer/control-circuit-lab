import { Download, Pause, Play, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Switch } from "@/client/components/ui/switch";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { CATEGORIES, defaultProps, GRID, nextLabel, PART_BY_TYPE, PART_H, PARTS, partWidth } from "@/lib/circuit/catalog";
import type { CircuitDoc, Part } from "@/lib/circuit/doc";
import { readings, type SimState } from "@/lib/circuit/engine";
import { errorMessage } from "@/client/lib/errors";
import { Canvas } from "./Canvas";
import { exportJson, exportPdf, exportPng, exportSvg } from "./exporters";
import { LadderPanel } from "./Ladder";
import { useSimulation } from "./useSimulation";

const LOADS = new Set(["lamp", "horn", "motor3", "motor_sd", "motor1"]);
const MOMENTARY = new Set(["pb_no", "pb_nc"]);

/** Where a new part goes: the first free spot, left to right, top to bottom. */
function freeSpot(doc: CircuitDoc, width: number) {
  const boxes = doc.parts.map((p) => {
    const def = PART_BY_TYPE[p.type];
    const w = def ? partWidth(def) : 80;
    const size = p.rot % 180 ? { w: PART_H, h: w } : { w, h: PART_H };
    return { x: p.x, y: p.y, ...size };
  });
  for (let y = 40; ; y += 140) {
    for (let x = 40; x + width <= 1160; x += 20) {
      const clash = boxes.some((b) => x < b.x + b.w + 60 && x + width + 60 > b.x && y < b.y + b.h + 40 && y + PART_H + 40 > b.y);
      if (!clash) return { x, y };
    }
  }
}

export function Workbench({ doc, name, onChange, toolbar }: { doc: CircuitDoc; name: string; onChange?: (doc: CircuitDoc) => void; toolbar?: React.ReactNode }) {
  const editable = Boolean(onChange);
  const { sim, start, stop, reset, act } = useSimulation(doc);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [selectedWire, setSelectedWire] = useState<string | null>(null);
  const [pendingFrom, setPendingFrom] = useState<{ part: string; term: string } | null>(null);
  const [showPlc, setShowPlc] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const change = (next: CircuitDoc) => onChange?.(next);
  const updatePart = (id: string, patch: Partial<Part>) => change({ ...docRef.current, parts: docRef.current.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removePart = (id: string) => {
    change({ ...docRef.current, parts: docRef.current.parts.filter((p) => p.id !== id), wires: docRef.current.wires.filter((w) => w.from.part !== id && w.to.part !== id) });
    setSelectedPart(null);
  };
  const removeWire = (id: string) => {
    change({ ...docRef.current, wires: docRef.current.wires.filter((w) => w.id !== id) });
    setSelectedWire(null);
  };
  const rotate = (id: string) => {
    const p = docRef.current.parts.find((x) => x.id === id);
    if (p) updatePart(id, { rot: ((p.rot + 90) % 360) as Part["rot"] });
  };

  function addPart(type: string) {
    const def = PART_BY_TYPE[type]!;
    const spot = freeSpot(doc, partWidth(def));
    const part: Part = { id: crypto.randomUUID().slice(0, 12), type, ...spot, rot: 0, label: nextLabel(def, doc.parts.map((p) => p.label)), props: defaultProps(def) };
    change({ ...doc, parts: [...doc.parts, part] });
    setSelectedPart(part.id);
    setSelectedWire(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = event.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "Escape") setPendingFrom(null);
      if (!editable || sim) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedPart) removePart(selectedPart);
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedWire) removeWire(selectedWire);
      else if (event.key.toLowerCase() === "r" && selectedPart) rotate(selectedPart);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPartPointerDown(part: Part, event: ReactPointerEvent) {
    setSelectedWire(null);
    if (sim) {
      setSelectedPart(part.id);
      act((s) => {
        const c = s.controls;
        if (MOMENTARY.has(part.type)) c.held[part.id] = true;
        else if (part.type === "estop") c.latched[part.id] = !c.latched[part.id];
        else if (part.type === "selector") {
          const positions = part.props.positions === "2" ? 2 : 3;
          c.position[part.id] = ((c.position[part.id] ?? (positions === 3 ? 1 : 0)) + 1) % positions;
        } else if (part.type === "sensor") c.sensorOn[part.id] = !c.sensorOn[part.id];
        else if (part.type === "generator") c.generatorRunning[part.id] = !c.generatorRunning[part.id];
        else if (["mcb1", "mcb3", "mccb", "rccb", "rcbo"].includes(part.type)) {
          if (s.tripped[part.id]) {
            delete s.tripped[part.id];
            c.off[part.id] = false;
          } else c.off[part.id] = !c.off[part.id];
        } else if (part.type === "overload" && s.tripped[part.id]) delete s.tripped[part.id];
      });
      return;
    }
    setSelectedPart(part.id);
    if (!editable) return;
    drag.current = { id: part.id, startX: event.clientX, startY: event.clientY, x: part.x, y: part.y };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const x = Math.max(0, Math.round((d.x + e.clientX - d.startX) / GRID) * GRID);
      const y = Math.max(0, Math.round((d.y + e.clientY - d.startY) / GRID) * GRID);
      const cur = docRef.current.parts.find((p) => p.id === d.id);
      if (cur && (cur.x !== x || cur.y !== y)) updatePart(d.id, { x, y });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onPartPointerUp(part: Part) {
    if (!sim || !MOMENTARY.has(part.type) || !sim.controls.held[part.id]) return;
    act((s) => {
      s.controls.held[part.id] = false;
      s.controls.pressedUntil[part.id] = s.time + 0.2;
    });
  }

  function onTerminalClick(part: Part, term: string) {
    if (!editable || sim) return;
    if (!pendingFrom) return setPendingFrom({ part: part.id, term });
    if (pendingFrom.part === part.id && pendingFrom.term === term) return setPendingFrom(null);
    const exists = doc.wires.some(
      (w) => (w.from.part === pendingFrom.part && w.from.term === pendingFrom.term && w.to.part === part.id && w.to.term === term) || (w.to.part === pendingFrom.part && w.to.term === pendingFrom.term && w.from.part === part.id && w.from.term === term),
    );
    if (!exists) change({ ...doc, wires: [...doc.wires, { id: crypto.randomUUID().slice(0, 12), from: pendingFrom, to: { part: part.id, term } }] });
    setPendingFrom(null);
  }

  async function runExport(kind: "json" | "png" | "svg" | "pdf") {
    const svg = svgRef.current;
    try {
      if (kind === "json") exportJson(name, doc);
      else if (!svg) return;
      else if (kind === "svg") exportSvg(name, svg);
      else if (kind === "png") await exportPng(name, svg);
      else await exportPdf(name, svg);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const selected = doc.parts.find((p) => p.id === selectedPart) ?? null;
  const list = sim ? readings(doc, sim) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="sim-toggle" variant={sim ? "destructive" : "default"} onClick={() => (sim ? stop() : start())}>
          {sim ? <Pause /> : <Play />} {sim ? "Stop" : "Simulate"}
        </Button>
        {sim ? (
          <Button data-testid="sim-reset" variant="outline" onClick={reset}>
            <RotateCcw /> Reset
          </Button>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          Supply
          <Input
            data-testid="supply-voltage"
            type="number"
            min={50}
            max={120}
            className="h-8 w-20"
            value={doc.supply.voltagePct}
            onChange={(event) => {
              const v = Math.min(120, Math.max(50, Number(event.target.value) || 100));
              change({ ...doc, supply: { voltagePct: v } });
            }}
            disabled={!editable}
          />
          %
        </label>
        <Button data-testid="plc-toggle" variant={showPlc ? "secondary" : "outline"} aria-pressed={showPlc} onClick={() => setShowPlc((v) => !v)}>
          PLC program
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button data-testid="export-menu" variant="outline" />}>
            <Download /> Export
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-44">
            <DropdownMenuItem onClick={() => runExport("json")}>Project file (.json)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("png")}>Image (.png)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("svg")}>Image (.svg)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("pdf")}>PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {toolbar}
      </div>

      {sim?.halted ? (
        <Alert variant="destructive">
          <AlertDescription>{sim.halted}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row">
        {editable && !sim ? (
          <aside className="flex max-h-[70vh] shrink-0 gap-4 overflow-auto rounded-xl border border-border bg-card p-3 lg:w-56 lg:flex-col">
            {CATEGORIES.map((category) => (
              <div key={category} className="min-w-40 space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">{category}</h3>
                {PARTS.filter((p) => p.category === category).map((p) => (
                  <Button key={p.type} data-testid={`palette-${p.type}`} variant="ghost" size="sm" className="w-full justify-start truncate" onClick={() => addPart(p.type)}>
                    {p.name}
                  </Button>
                ))}
              </div>
            ))}
          </aside>
        ) : null}

        <div className="max-h-[75vh] min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-background">
          <Canvas
            ref={svgRef}
            doc={doc}
            sim={sim}
            selectedPart={selectedPart}
            selectedWire={selectedWire}
            pendingFrom={pendingFrom}
            onPartPointerDown={onPartPointerDown}
            onPartPointerUp={onPartPointerUp}
            onTerminalClick={onTerminalClick}
            onWireClick={(w) => {
              if (sim || !editable) return;
              setSelectedWire(w.id);
              setSelectedPart(null);
            }}
            onBackgroundClick={() => {
              setSelectedPart(null);
              setSelectedWire(null);
            }}
          />
        </div>

        <aside className="shrink-0 space-y-4 lg:w-72">
          {sim ? <SimPanel doc={doc} sim={sim} list={list} selected={selected} act={act} /> : null}
          {!sim && selected && editable ? (
            <PartPanel part={selected} onPatch={(patch) => updatePart(selected.id, patch)} onRotate={() => rotate(selected.id)} onDelete={() => removePart(selected.id)} />
          ) : null}
          {!sim && selectedWire && editable ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <Button data-testid="delete-wire" variant="outline" onClick={() => removeWire(selectedWire)}>
                <Trash2 /> Delete wire
              </Button>
            </div>
          ) : null}
          {!sim && pendingFrom ? <p className="text-sm text-muted-foreground">Pick a second terminal to connect.</p> : null}
        </aside>
      </div>

      {showPlc ? <LadderPanel doc={doc} sim={sim} onChange={editable ? change : undefined} /> : null}
    </div>
  );
}

function PartPanel({ part, onPatch, onRotate, onDelete }: { part: Part; onPatch: (p: Partial<Part>) => void; onRotate: () => void; onDelete: () => void }) {
  const def = PART_BY_TYPE[part.type]!;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium">{def.name}</h2>
      <div className="space-y-1.5">
        <Label htmlFor="prop-label">Label</Label>
        <Input id="prop-label" data-testid="prop-label" maxLength={40} value={part.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </div>
      {def.props.map((spec) => (
        <div key={spec.key} className="space-y-1.5">
          <Label htmlFor={`prop-${spec.key}`}>
            {spec.label}
            {spec.kind === "number" && spec.unit ? <span className="text-muted-foreground"> ({spec.unit})</span> : null}
          </Label>
          {spec.kind === "select" ? (
            <NativeSelect id={`prop-${spec.key}`} data-testid={`prop-${spec.key}`} className="w-full" value={String(part.props[spec.key] ?? spec.default)} onChange={(e) => onPatch({ props: { ...part.props, [spec.key]: e.target.value } })}>
              {spec.options.map((o) => (
                <NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id={`prop-${spec.key}`}
              data-testid={`prop-${spec.key}`}
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 1}
              value={String(part.props[spec.key] ?? spec.default)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && e.target.value !== "") onPatch({ props: { ...part.props, [spec.key]: Math.min(spec.max, Math.max(spec.min, v)) } });
              }}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button data-testid="rotate-part" variant="outline" size="sm" onClick={onRotate}>
          <RotateCw /> Rotate
        </Button>
        <Button data-testid="delete-part" variant="outline" size="sm" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </section>
  );
}

function SimPanel({ doc, sim, list, selected, act }: { doc: CircuitDoc; sim: SimState; list: { label: string; value: string }[]; selected: Part | null; act: (f: (s: SimState) => void) => void }) {
  void doc;
  return (
    <section data-testid="sim-readings" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-medium">Readings</h2>
      {list.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {list.map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-medium">{r.label}</dt>
              <dd className="text-muted-foreground tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground">Nothing to measure yet.</p>
      )}
      {sim.warnings.map((w) => (
        <Alert key={w} variant="warning">
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}
      {selected && LOADS.has(selected.type) ? (
        <div className="space-y-3 border-t border-border pt-3">
          <h3 className="font-medium">{selected.label}</h3>
          <label className="flex items-center justify-between gap-2">
            Earth fault
            <Switch
              data-testid="earth-fault"
              checked={Boolean(sim.controls.earthFault[selected.id])}
              onCheckedChange={(on) => act((s) => void (s.controls.earthFault[selected.id] = on))}
            />
          </label>
          {selected.type.startsWith("motor") ? (
            <label className="flex items-center justify-between gap-2">
              Mechanical load
              <span className="flex items-center gap-1">
                <Input
                  data-testid="motor-load"
                  type="number"
                  min={0}
                  max={400}
                  className="h-8 w-20"
                  value={sim.controls.motorLoad[selected.id] ?? 100}
                  onChange={(e) => act((s) => void (s.controls.motorLoad[selected.id] = Math.min(400, Math.max(0, Number(e.target.value) || 0))))}
                />
                %
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
      {sim.events.length ? (
        <ul className="space-y-1 border-t border-border pt-3">
          {sim.events.slice(0, 8).map((e, i) => (
            <li key={i} className={e.kind === "warning" ? "text-muted-foreground" : "text-destructive"}>
              {e.at.toFixed(1)} s · {e.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
