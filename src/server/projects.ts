import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diagrams, projects } from "@/db/schema";
import {
  docSchema,
  emptyDoc,
  exportFileSchema,
  MAX_DOC_CHARS,
  type CircuitDoc,
} from "@/lib/circuit/doc";
import { AppError, notFound } from "./errors";

export const nameInput = z.string().trim().min(1, "Give it a name").max(120);

export interface DiagramSummary {
  id: string;
  name: string;
  position: number;
}
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  diagrams: DiagramSummary[];
}
export interface DiagramFull {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  version: number;
  doc: CircuitDoc;
}

export function serializeDoc(doc: CircuitDoc): string {
  const text = JSON.stringify(docSchema.parse(doc));
  if (text.length > MAX_DOC_CHARS) throw new AppError(400, "This diagram is too large to save");
  return text;
}

/** A stored doc, checked again on the way out. */
function parseDoc(text: string): CircuitDoc {
  const parsed = docSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : emptyDoc();
}

async function ownedProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
  if (!row) throw notFound("Project");
  return row;
}

async function diagramsOf(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({ id: diagrams.id, projectId: diagrams.projectId, name: diagrams.name, position: diagrams.position })
    .from(diagrams)
    .where(inArray(diagrams.projectId, projectIds))
    .orderBy(asc(diagrams.position), asc(diagrams.name));
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.updatedAt), asc(projects.name));
  const ds = await diagramsOf(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt,
    diagrams: ds.filter((d) => d.projectId === r.id).map(({ projectId: _, ...d }) => d),
  }));
}

export async function getProject(userId: string, projectId: string): Promise<ProjectSummary> {
  const r = await ownedProject(userId, projectId);
  const ds = await diagramsOf([r.id]);
  return { id: r.id, name: r.name, updatedAt: r.updatedAt, diagrams: ds.map(({ projectId: _, ...d }) => d) };
}

/** Creates a project with its diagrams in one batch. */
export async function createProject(
  userId: string,
  name: string,
  contents: { name: string; doc: CircuitDoc }[] = [{ name: "Main circuit", doc: emptyDoc() }],
): Promise<ProjectSummary> {
  const id = crypto.randomUUID();
  const texts = contents.map((c) => serializeDoc(c.doc));
  await db.batch([
    db.insert(projects).values({ id, ownerId: userId, name }),
    ...contents.map((c, i) =>
      db.insert(diagrams).values({ id: crypto.randomUUID(), projectId: id, ownerId: userId, name: c.name, position: i, doc: texts[i]! }),
    ),
  ]);
  return getProject(userId, id);
}

const touch = (projectId: string) =>
  db.update(projects).set({ updatedAt: sql`(current_timestamp)` }).where(eq(projects.id, projectId));

export async function renameProject(userId: string, projectId: string, name: string) {
  await ownedProject(userId, projectId);
  await db.update(projects).set({ name, updatedAt: sql`(current_timestamp)` }).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
  return getProject(userId, projectId);
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await ownedProject(userId, projectId);
  await db.batch([
    db.delete(diagrams).where(and(eq(diagrams.projectId, projectId), eq(diagrams.ownerId, userId))),
    db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId))),
  ]);
}

export async function duplicateProject(userId: string, projectId: string): Promise<ProjectSummary> {
  const p = await ownedProject(userId, projectId);
  const rows = await db.select().from(diagrams).where(and(eq(diagrams.projectId, projectId), eq(diagrams.ownerId, userId))).orderBy(asc(diagrams.position));
  return createProject(userId, `${p.name} (copy)`, rows.map((r) => ({ name: r.name, doc: parseDoc(r.doc) })));
}

async function ownedDiagram(userId: string, diagramId: string) {
  const [row] = await db.select().from(diagrams).where(and(eq(diagrams.id, diagramId), eq(diagrams.ownerId, userId)));
  if (!row) throw notFound("Diagram");
  return row;
}

export async function getDiagram(userId: string, diagramId: string): Promise<DiagramFull> {
  const d = await ownedDiagram(userId, diagramId);
  const p = await ownedProject(userId, d.projectId);
  return { id: d.id, projectId: d.projectId, projectName: p.name, name: d.name, version: d.version, doc: parseDoc(d.doc) };
}

export async function addDiagram(userId: string, projectId: string, name: string, doc: CircuitDoc = emptyDoc()): Promise<DiagramSummary> {
  await ownedProject(userId, projectId);
  const text = serializeDoc(doc);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${diagrams.position}) + 1, 0)` })
    .from(diagrams)
    .where(eq(diagrams.projectId, projectId));
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(diagrams).values({ id, projectId, ownerId: userId, name, position: next, doc: text }),
    touch(projectId),
  ]);
  return { id, name, position: next };
}

export async function renameDiagram(userId: string, diagramId: string, name: string) {
  const d = await ownedDiagram(userId, diagramId);
  await db.batch([
    db.update(diagrams).set({ name }).where(and(eq(diagrams.id, diagramId), eq(diagrams.ownerId, userId))),
    touch(d.projectId),
  ]);
}

export async function duplicateDiagram(userId: string, diagramId: string): Promise<DiagramSummary> {
  const d = await ownedDiagram(userId, diagramId);
  return addDiagram(userId, d.projectId, `${d.name} (copy)`, parseDoc(d.doc));
}

/** Swaps a diagram with its neighbour above or below. */
export async function moveDiagram(userId: string, diagramId: string, direction: "up" | "down") {
  const d = await ownedDiagram(userId, diagramId);
  const list = (await diagramsOf([d.projectId])).map((x) => x.id);
  const i = list.indexOf(d.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await db.batch([
    ...list.map((id, position) => db.update(diagrams).set({ position }).where(and(eq(diagrams.id, id), eq(diagrams.ownerId, userId)))),
    touch(d.projectId),
  ] as unknown as Parameters<typeof db.batch>[0]);
}

export async function deleteDiagram(userId: string, diagramId: string) {
  const d = await ownedDiagram(userId, diagramId);
  const siblings = await diagramsOf([d.projectId]);
  if (siblings.length <= 1) throw new AppError(400, "A project keeps at least one diagram");
  await db.batch([
    db.delete(diagrams).where(and(eq(diagrams.id, diagramId), eq(diagrams.ownerId, userId))),
    touch(d.projectId),
  ]);
}

export const saveInput = z.object({ doc: z.unknown(), version: z.number().int() });

/** Saves only over the version the editor loaded, so newer work is never overwritten. */
export async function saveDiagram(userId: string, diagramId: string, input: z.infer<typeof saveInput>): Promise<{ version: number }> {
  const d = await ownedDiagram(userId, diagramId);
  const parsed = docSchema.safeParse(input.doc);
  if (!parsed.success) throw new AppError(400, "That is not a valid diagram");
  const text = serializeDoc(parsed.data);
  const [row] = await db
    .update(diagrams)
    .set({ doc: text, version: sql`${diagrams.version} + 1`, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(diagrams.id, diagramId), eq(diagrams.ownerId, userId), eq(diagrams.version, input.version)))
    .returning({ version: diagrams.version });
  if (!row) throw new AppError(409, "This diagram was changed somewhere else. Reload to get the latest version.");
  await touch(d.projectId);
  return row;
}

/** Adds an exported file to one of the person's projects as a new diagram. */
export async function importDiagram(userId: string, projectId: string, file: unknown): Promise<DiagramSummary> {
  const parsed = exportFileSchema.safeParse(file);
  if (!parsed.success) throw new AppError(400, "This file isn't a diagram exported from this app");
  return addDiagram(userId, projectId, parsed.data.name, parsed.data.doc);
}
