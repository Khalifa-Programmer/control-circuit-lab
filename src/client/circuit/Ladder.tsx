import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { COIL_KINDS, type CircuitDoc, type CoilKind, type Contact, type Rung } from "@/lib/circuit/doc";
import type { SimState } from "@/lib/circuit/engine";

const ADDRESSES = [
  ...Array.from({ length: 8 }, (_, i) => `I${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Q${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `M${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `T${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `C${i + 1}`),
];

const KIND_LABEL: Record<CoilKind, string> = {
  coil: "Coil",
  set: "Set",
  reset: "Reset",
  ton: "On-delay timer",
  tof: "Off-delay timer",
  ctu: "Up counter",
  ctr: "Counter reset",
};

function targetsFor(kind: CoilKind): string[] {
  if (kind === "ton" || kind === "tof") return ADDRESSES.filter((a) => a[0] === "T");
  if (kind === "ctu" || kind === "ctr") return ADDRESSES.filter((a) => a[0] === "C");
  return ADDRESSES.filter((a) => a[0] === "Q" || a[0] === "M");
}

const chip = (active: boolean | undefined) =>
  active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-foreground";

export function LadderPanel({ doc, sim, onChange }: { doc: CircuitDoc; sim: SimState | null; onChange?: (doc: CircuitDoc) => void }) {
  const rungs = doc.plc.rungs;
  const edit = (next: Rung[]) => onChange?.({ ...doc, plc: { rungs: next } });
  const setRung = (i: number, rung: Rung) => edit(rungs.map((r, j) => (j === i ? rung : r)));
  const readOnly = !onChange;

  return (
    <section data-testid="ladder" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">PLC program</h2>
        {sim ? (
          <div className="flex flex-wrap gap-1 text-xs">
            {sim.plcInputs.map((on, i) => (
              <span key={`I${i}`} className={`rounded border px-1.5 py-0.5 ${chip(on)}`}>I{i + 1}</span>
            ))}
            {sim.plc.Q.map((on, i) => (
              <span key={`Q${i}`} className={`rounded border px-1.5 py-0.5 ${chip(on)}`}>Q{i + 1}</span>
            ))}
          </div>
        ) : null}
      </div>
      {rungs.length === 0 ? <p className="text-sm text-muted-foreground">No rungs yet.</p> : null}
      <ol className="space-y-3">
        {rungs.map((rung, i) => {
          const live = sim?.plc.view[i];
          const timer = rung.coil.target[0] === "T" ? sim?.plc.T[Number(rung.coil.target.slice(1)) - 1] : undefined;
          const counter = rung.coil.target[0] === "C" ? sim?.plc.C[Number(rung.coil.target.slice(1)) - 1] : undefined;
          return (
            <li key={rung.id} data-testid="rung" className="flex flex-wrap items-stretch gap-3 rounded-lg border border-border p-3">
              <span className="w-6 shrink-0 pt-1 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                {rung.branches.map((branch, b) => (
                  <div key={b} className="flex flex-wrap items-center gap-1.5">
                    {b > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
                    {branch.map((contact, c) => (
                      <ContactChip
                        key={c}
                        contact={contact}
                        active={live?.contacts[b]?.[c]}
                        readOnly={readOnly}
                        onChange={(next) =>
                          setRung(i, { ...rung, branches: rung.branches.map((br, x) => (x === b ? br.map((ct, y) => (y === c ? next : ct)) : br)) })
                        }
                        onRemove={() => {
                          const nextBranch = branch.filter((_, y) => y !== c);
                          setRung(i, {
                            ...rung,
                            branches: nextBranch.length ? rung.branches.map((br, x) => (x === b ? nextBranch : br)) : rung.branches.filter((_, x) => x !== b),
                          });
                        }}
                      />
                    ))}
                    {!readOnly && branch.length < 8 ? (
                      <Button variant="ghost" size="xs" onClick={() => setRung(i, { ...rung, branches: rung.branches.map((br, x) => (x === b ? [...br, { addr: "I2", nc: false }] : br)) })}>
                        <Plus /> And
                      </Button>
                    ) : null}
                  </div>
                ))}
                {!readOnly && rung.branches.length < 6 ? (
                  <Button variant="ghost" size="xs" onClick={() => setRung(i, { ...rung, branches: [...rung.branches, [{ addr: "I1", nc: false }]] })}>
                    <Plus /> Or branch
                  </Button>
                ) : null}
              </div>
              <div data-testid={`coil-${i}`} data-active={String(Boolean(live?.result))} className={`flex flex-wrap items-center gap-1.5 self-start rounded-md border px-2 py-1.5 ${chip(live?.result)}`}>
                <NativeSelect
                  size="sm"
                  data-testid={`rung-${i}-coil-kind`}
                  aria-label={`Rung ${i + 1} output`}
                  disabled={readOnly}
                  value={rung.coil.kind}
                  onChange={(event) => {
                    const kind = event.target.value as CoilKind;
                    const targets = targetsFor(kind);
                    setRung(i, { ...rung, coil: { kind, target: targets.includes(rung.coil.target) ? rung.coil.target : targets[0]!, preset: rung.coil.preset || (kind === "ctu" ? 3 : 5) } });
                  }}
                >
                  {COIL_KINDS.map((k) => (
                    <NativeSelectOption key={k} value={k}>{KIND_LABEL[k]}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  size="sm"
                  aria-label={`Rung ${i + 1} address`}
                  disabled={readOnly}
                  value={rung.coil.target}
                  onChange={(event) => setRung(i, { ...rung, coil: { ...rung.coil, target: event.target.value } })}
                >
                  {targetsFor(rung.coil.kind).map((a) => (
                    <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>
                  ))}
                </NativeSelect>
                {rung.coil.kind === "ton" || rung.coil.kind === "tof" || rung.coil.kind === "ctu" ? (
                  <label className="flex items-center gap-1 text-xs">
                    <Input
                      data-testid={`rung-${i}-preset`}
                      aria-label={`Rung ${i + 1} preset`}
                      type="number"
                      min={0}
                      step={rung.coil.kind === "ctu" ? 1 : 0.1}
                      className="h-7 w-20"
                      disabled={readOnly}
                      value={rung.coil.preset}
                      onChange={(event) => setRung(i, { ...rung, coil: { ...rung.coil, preset: Math.max(0, Number(event.target.value) || 0) } })}
                    />
                    {rung.coil.kind === "ctu" ? "counts" : "s"}
                  </label>
                ) : null}
                {timer && sim ? <span className="text-xs tabular-nums">{timer.acc.toFixed(1)} s</span> : null}
                {counter && sim ? <span className="text-xs tabular-nums">{counter.count}</span> : null}
                {!readOnly ? (
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete rung ${i + 1}`} onClick={() => edit(rungs.filter((_, x) => x !== i))}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!readOnly ? (
        <Button
          data-testid="add-rung"
          variant="outline"
          size="sm"
          disabled={rungs.length >= 64}
          onClick={() => edit([...rungs, { id: crypto.randomUUID().slice(0, 8), branches: [[{ addr: "I1", nc: false }]], coil: { kind: "coil", target: "Q2", preset: 0 } }])}
        >
          <Plus /> Add rung
        </Button>
      ) : null}
    </section>
  );
}

function ContactChip({ contact, active, readOnly, onChange, onRemove }: { contact: Contact; active?: boolean; readOnly: boolean; onChange: (c: Contact) => void; onRemove: () => void }) {
  return (
    <span data-active={String(Boolean(active))} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${chip(active)}`}>
      <Button
        variant="ghost"
        size="xs"
        disabled={readOnly}
        className="font-mono"
        title={contact.nc ? "Normally closed" : "Normally open"}
        onClick={() => onChange({ ...contact, nc: !contact.nc })}
      >
        {contact.nc ? "-|/|-" : "-| |-"}
      </Button>
      <NativeSelect
        size="sm"
        aria-label="Contact address"
        disabled={readOnly}
        value={contact.addr}
        onChange={(event) => onChange({ ...contact, addr: event.target.value })}
      >
        {ADDRESSES.map((a) => (
          <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>
        ))}
      </NativeSelect>
      {!readOnly ? (
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${contact.addr}`} onClick={onRemove}>
          <X />
        </Button>
      ) : null}
    </span>
  );
}
