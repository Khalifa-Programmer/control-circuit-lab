import { z } from "zod";

const id = z.string().min(1).max(64);
const propValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const partSchema = z.object({
  id,
  type: z.string().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  label: z.string().max(40),
  props: z.record(z.string().max(40), propValue),
});

const end = z.object({ part: id, term: z.string().min(1).max(20) });
export const wireSchema = z.object({ id, from: end, to: end });

export const ADDRESS = /^(I[1-8]|Q[1-4]|M[1-8]|T[1-8]|C[1-8])$/;
const contactSchema = z.object({
  addr: z.string().regex(ADDRESS),
  nc: z.boolean(),
});
export const COIL_KINDS = [
  "coil",
  "set",
  "reset",
  "ton",
  "tof",
  "ctu",
  "ctr",
] as const;
export const rungSchema = z.object({
  id,
  branches: z.array(z.array(contactSchema).max(8)).max(6),
  coil: z.object({
    kind: z.enum(COIL_KINDS),
    target: z.string().regex(ADDRESS),
    preset: z.number().min(0).max(100000),
  }),
});

export const docSchema = z.object({
  v: z.literal(1),
  parts: z.array(partSchema).max(400),
  wires: z.array(wireSchema).max(1500),
  plc: z.object({ rungs: z.array(rungSchema).max(64) }),
  supply: z.object({ voltagePct: z.number().min(50).max(120) }),
});

export type Part = z.infer<typeof partSchema>;
export type Wire = z.infer<typeof wireSchema>;
export type Rung = z.infer<typeof rungSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type CoilKind = (typeof COIL_KINDS)[number];
export type CircuitDoc = z.infer<typeof docSchema>;

/** Largest stored diagram, in characters of JSON. */
export const MAX_DOC_CHARS = 400_000;

export function emptyDoc(): CircuitDoc {
  return { v: 1, parts: [], wires: [], plc: { rungs: [] }, supply: { voltagePct: 100 } };
}

/** The file a diagram is exported to and imported from. */
export const exportFileSchema = z.object({
  format: z.literal("circuit-lab-diagram"),
  name: z.string().trim().min(1).max(120),
  doc: docSchema,
});
