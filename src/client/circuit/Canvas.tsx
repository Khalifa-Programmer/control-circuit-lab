import { forwardRef, type PointerEvent as ReactPointerEvent } from "react";
import { PART_BY_TYPE, PART_H, partWidth, terminalOffset, terminalPoint } from "@/lib/circuit/catalog";
import type { CircuitDoc, Part, Wire } from "@/lib/circuit/doc";
import type { Phase, SimState } from "@/lib/circuit/engine";

export const PHASE_COLOR: Record<Phase, string> = {
  L1: "var(--chart-1)",
  L2: "var(--chart-2)",
  L3: "var(--chart-3)",
  G1: "var(--chart-1)",
  G2: "var(--chart-2)",
  G3: "var(--chart-3)",
  N: "var(--info)",
  PE: "var(--success)",
  "+24": "var(--warning)",
  "0V": "var(--muted-foreground)",
};

const LAMP_COLOR: Record<string, string> = {
  green: "var(--success)",
  red: "var(--destructive)",
  yellow: "var(--warning)",
  blue: "var(--info)",
  white: "var(--muted-foreground)",
};

export interface CanvasProps {
  doc: CircuitDoc;
  sim: SimState | null;
  selectedPart?: string | null;
  selectedWire?: string | null;
  pendingFrom?: { part: string; term: string } | null;
  onPartPointerDown?: (part: Part, event: ReactPointerEvent) => void;
  onPartPointerUp?: (part: Part, event: ReactPointerEvent) => void;
  onTerminalClick?: (part: Part, term: string) => void;
  onWireClick?: (wire: Wire) => void;
  onBackgroundClick?: () => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

export function canvasSize(doc: CircuitDoc) {
  let w = 1000;
  let h = 640;
  for (const p of doc.parts) {
    const def = PART_BY_TYPE[p.type];
    if (!def) continue;
    const size = Math.max(partWidth(def), PART_H);
    w = Math.max(w, p.x + size + 80);
    h = Math.max(h, p.y + size + 80);
  }
  return { w, h };
}

function wirePath(doc: CircuitDoc, wire: Wire): string | null {
  const pa = doc.parts.find((p) => p.id === wire.from.part);
  const pb = doc.parts.find((p) => p.id === wire.to.part);
  const a = pa && terminalPoint(pa, wire.from.term);
  const b = pb && terminalPoint(pb, wire.to.term);
  if (!a || !b) return null;
  const mid = (a.y + b.y) / 2;
  if (a.y === b.y) {
    const dip = a.y + 20;
    return `M${a.x},${a.y} V${dip} H${b.x} V${b.y}`;
  }
  return `M${a.x},${a.y} V${mid} H${b.x} V${b.y}`;
}

export const Canvas = forwardRef<SVGSVGElement, CanvasProps>(function Canvas(props, ref) {
  const { doc, sim } = props;
  const { w, h } = canvasSize(doc);
  return (
    <svg
      ref={ref}
      data-testid="canvas"
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block touch-none select-none text-foreground"
      fontFamily="system-ui, sans-serif"
      onPointerMove={props.onPointerMove}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onBackgroundClick?.();
      }}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--border)" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#grid)" pointerEvents="none" />
      {doc.wires.map((wire) => {
        const d = wirePath(doc, wire);
        if (!d) return null;
        const phase = sim?.netPhase[`${wire.from.part}:${wire.from.term}`] ?? "";
        const selected = props.selectedWire === wire.id;
        const color = phase ? PHASE_COLOR[phase] : "var(--muted-foreground)";
        return (
          <g key={wire.id} data-testid="wire" data-phase={phase} onPointerDown={() => props.onWireClick?.(wire)} className="cursor-pointer">
            <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
            <path d={d} fill="none" stroke={selected ? "var(--ring)" : color} strokeWidth={phase ? 3 : selected ? 3 : 1.5} strokeLinejoin="round" />
          </g>
        );
      })}
      {doc.parts.map((part) => (
        <PartSymbol key={part.id} part={part} {...props} />
      ))}
    </svg>
  );
});

function PartSymbol({ part, sim, selectedPart, pendingFrom, onPartPointerDown, onPartPointerUp, onTerminalClick }: CanvasProps & { part: Part }) {
  const def = PART_BY_TYPE[part.type];
  if (!def) return null;
  const width = partWidth(def);
  const view = sim?.view[part.id];
  const selected = selectedPart === part.id;
  const tripped = view?.tripped;
  const active = Boolean(view?.on || view?.running || view?.lit);
  const stroke = tripped ? "var(--destructive)" : selected ? "var(--ring)" : active ? "var(--primary)" : "var(--foreground)";
  const cx = width / 2;
  const cy = PART_H / 2;
  const off = sim?.controls.off[part.id];
  let status = "";
  if (tripped) status = `tripped: ${tripped}`;
  else if (off) status = "off";
  else if (view?.remaining !== undefined) status = `${view.remaining.toFixed(1)} s`;
  else if (view?.reading) status = view.reading;
  else if (part.type === "selector" && sim) status = `position ${(sim.controls.position[part.id] ?? (part.props.positions === "2" ? 0 : 1))}`;
  else if (part.type === "estop" && sim?.controls.latched[part.id]) status = "latched";
  else if (part.type === "sensor" && sim) status = sim.controls.sensorOn[part.id] ? "active" : "idle";
  else if (part.type === "generator" && sim) status = sim.controls.generatorRunning[part.id] ? "running" : "stopped";
  else if (view?.running) status = `${view.direction === "reverse" ? "↺" : "↻"} ${view.mode && view.mode !== "stopped" ? view.mode : view.direction}`;
  else if (sim?.controls.earthFault[part.id]) status = "earth fault";
  const lampColor = LAMP_COLOR[String(part.props.color)] ?? "var(--warning)";
  const label = def.glyph || (part.type === "lamp" ? "" : def.name);
  const details = summary(part);

  return (
    <g
      data-testid={`part-${part.label}`}
      data-type={part.type}
      data-rot={part.rot}
      data-on={String(Boolean(view?.on))}
      data-lit={String(Boolean(view?.lit))}
      data-running={String(Boolean(view?.running))}
      data-direction={view?.running ? (view.direction ?? "") : ""}
      data-mode={part.type === "motor_sd" ? (view?.mode ?? "stopped") : undefined}
      data-tripped={tripped ?? ""}
      transform={`translate(${part.x} ${part.y}) rotate(${part.rot} ${cx} ${cy})`}
    >
      <g
        className="cursor-pointer"
        onPointerDown={(event) => onPartPointerDown?.(part, event)}
        onPointerUp={(event) => onPartPointerUp?.(part, event)}
        onPointerLeave={(event) => onPartPointerUp?.(part, event)}
      >
        <rect x={2} y={8} width={width - 4} height={PART_H - 16} rx={6} fill={active ? "var(--accent)" : "var(--card)"} stroke={stroke} strokeWidth={selected || active || tripped ? 2 : 1.2} />
        {part.type === "lamp" ? (
          <g>
            <circle cx={cx} cy={cy} r={16} fill={view?.lit ? lampColor : "var(--muted)"} fillOpacity={view?.lit ? 0.35 + 0.65 * (view.brightness ?? 1) : 1} stroke={lampColor} strokeWidth={2} />
            <path d={`M${cx - 11},${cy - 11} L${cx + 11},${cy + 11} M${cx + 11},${cy - 11} L${cx - 11},${cy + 11}`} stroke="var(--foreground)" strokeWidth={1.2} />
          </g>
        ) : part.type.startsWith("motor") || part.type === "generator" ? (
          <circle cx={cx} cy={cy} r={22} fill="none" stroke={stroke} strokeWidth={1.5} />
        ) : null}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
          {part.type === "lamp" ? "" : label}
        </text>
        {details ? (
          <text x={cx} y={cy + 17} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
            {details}
          </text>
        ) : null}
      </g>
      <text x={width + 4} y={cy - 4} fontSize={12} fontWeight={700} fill="var(--foreground)" pointerEvents="none">
        {part.label}
      </text>
      {status ? (
        <text x={width + 4} y={cy + 10} fontSize={10} fill={tripped ? "var(--destructive)" : "var(--primary)"} pointerEvents="none">
          {status}
        </text>
      ) : null}
      {[...def.top, ...def.bottom].map((term) => {
        const p = terminalOffset(def, term)!;
        const pending = pendingFrom?.part === part.id && pendingFrom.term === term;
        const top = def.top.includes(term);
        return (
          <g key={term}>
            <line x1={p.x} y1={p.y} x2={p.x} y2={top ? 8 : PART_H - 8} stroke="var(--foreground)" strokeWidth={1} />
            <text x={p.x + 4} y={top ? 18 : PART_H - 12} fontSize={8} fill="var(--muted-foreground)" pointerEvents="none">
              {term}
            </text>
            <circle
              data-testid={`term-${part.label}-${term}`}
              cx={p.x}
              cy={p.y}
              r={pending ? 7 : 5}
              fill={pending ? "var(--ring)" : "var(--card)"}
              stroke="var(--foreground)"
              strokeWidth={1.2}
              className="cursor-crosshair"
              onPointerDown={(event) => {
                event.stopPropagation();
                onTerminalClick?.(part, term);
              }}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The settings worth reading on the symbol itself. */
function summary(part: Part): string {
  const p = part.props;
  switch (part.type) {
    case "mcb1":
    case "mcb3":
    case "rcbo":
      return `${p.curve}${p.rating}`;
    case "mccb":
    case "rccb":
      return `${p.rating} A`;
    case "overload":
      return `${p.setting} A`;
    case "contactor":
    case "relay":
      return String(p.coilVoltage ?? "");
    case "timer_on":
    case "timer_off":
    case "flasher":
      return `${p.delay} s`;
    case "motor3":
    case "motor_sd":
    case "motor1":
      return `${p.power} kW`;
    case "sensor":
      return String(p.kind);
    default:
      return "";
  }
}
