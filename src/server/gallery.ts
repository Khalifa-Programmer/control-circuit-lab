import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { galleryPosts, galleryVotes } from "@/db/schema";
import { docSchema, emptyDoc, type CircuitDoc } from "@/lib/circuit/doc";
import { AppError, notFound } from "./errors";
import { createProject, getDiagram, type ProjectSummary } from "./projects";
import type { Member } from "./users";

export const postInput = z.object({
  title: z.string().trim().min(1, "Give it a title").max(120),
  description: z.string().trim().max(2000).default(""),
});
export const publishInput = postInput.extend({ diagramId: z.string().min(1).max(64) });
export const listInput = z.object({
  sort: z.enum(["votes", "newest"]).default("votes"),
  q: z.string().trim().max(120).default(""),
});

export interface PostSummary {
  id: string;
  title: string;
  description: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  votes: number;
  voted: boolean;
  mine: boolean;
}
export interface PostFull extends PostSummary {
  doc: CircuitDoc;
  canRemove: boolean;
}

const voteCount = sql<number>`(select count(*) from ${galleryVotes} where ${galleryVotes.postId} = ${galleryPosts.id})`;
const votedBy = (userId: string) =>
  sql<number>`exists(select 1 from ${galleryVotes} where ${galleryVotes.postId} = ${galleryPosts.id} and ${galleryVotes.userId} = ${userId})`;

const summaryColumns = (userId: string) => ({
  id: galleryPosts.id,
  title: galleryPosts.title,
  description: galleryPosts.description,
  authorEmail: galleryPosts.authorEmail,
  authorId: galleryPosts.authorId,
  createdAt: galleryPosts.createdAt,
  updatedAt: galleryPosts.updatedAt,
  votes: voteCount,
  voted: votedBy(userId),
});

type Row = { authorId: string; votes: number; voted: number } & Omit<PostSummary, "votes" | "voted" | "mine">;
const toSummary = (userId: string, { authorId, ...r }: Row): PostSummary => ({ ...r, votes: Number(r.votes), voted: Boolean(r.voted), mine: authorId === userId });

/** Every member sees every post: the gallery is the organisation's. */
export async function listPosts(userId: string, input: z.infer<typeof listInput>): Promise<PostSummary[]> {
  const escaped = input.q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await db
    .select(summaryColumns(userId))
    .from(galleryPosts)
    .where(input.q ? like(galleryPosts.title, sql`${`%${escaped}%`} escape '\\'`) : undefined)
    .orderBy(...(input.sort === "votes" ? [desc(voteCount), desc(galleryPosts.createdAt)] : [desc(galleryPosts.createdAt)]))
    .limit(200);
  return rows.map((r) => toSummary(userId, r));
}

export async function getPost(user: Member, postId: string): Promise<PostFull> {
  const [row] = await db.select({ ...summaryColumns(user.id), doc: galleryPosts.doc }).from(galleryPosts).where(eq(galleryPosts.id, postId));
  if (!row) throw notFound("Post");
  const { doc, ...rest } = row;
  const parsed = docSchema.safeParse(JSON.parse(doc));
  return { ...toSummary(user.id, rest), doc: parsed.success ? parsed.data : emptyDoc(), canRemove: rest.authorId === user.id || user.admin };
}

/** Publishes a snapshot of one of the person's diagrams, or refreshes their earlier post of it. */
export async function publish(user: Member, input: z.infer<typeof publishInput>): Promise<{ post: PostFull; created: boolean }> {
  const d = await getDiagram(user.id, input.diagramId);
  const doc = JSON.stringify(d.doc);
  const [existing] = await db
    .select({ id: galleryPosts.id })
    .from(galleryPosts)
    .where(and(eq(galleryPosts.authorId, user.id), eq(galleryPosts.sourceDiagramId, d.id)));
  if (existing) {
    await db
      .update(galleryPosts)
      .set({ title: input.title, description: input.description, doc, updatedAt: sql`(current_timestamp)` })
      .where(and(eq(galleryPosts.id, existing.id), eq(galleryPosts.authorId, user.id)));
    return { post: await getPost(user, existing.id), created: false };
  }
  const id = crypto.randomUUID();
  await db.insert(galleryPosts).values({ id, authorId: user.id, authorEmail: user.email, sourceDiagramId: d.id, title: input.title, description: input.description, doc });
  return { post: await getPost(user, id), created: true };
}

/** The person's earlier post of a diagram, if any. */
export async function postForDiagram(userId: string, diagramId: string) {
  const [row] = await db
    .select({ id: galleryPosts.id, title: galleryPosts.title, description: galleryPosts.description })
    .from(galleryPosts)
    .where(and(eq(galleryPosts.authorId, userId), eq(galleryPosts.sourceDiagramId, diagramId)));
  return row ?? null;
}

async function postRow(postId: string) {
  const [row] = await db.select({ id: galleryPosts.id, authorId: galleryPosts.authorId, title: galleryPosts.title, doc: galleryPosts.doc }).from(galleryPosts).where(eq(galleryPosts.id, postId));
  if (!row) throw notFound("Post");
  return row;
}

export async function updatePost(user: Member, postId: string, input: z.infer<typeof postInput>): Promise<PostFull> {
  const row = await postRow(postId);
  if (row.authorId !== user.id) throw new AppError(403, "Only the author can edit this post");
  await db.update(galleryPosts).set({ ...input, updatedAt: sql`(current_timestamp)` }).where(and(eq(galleryPosts.id, postId), eq(galleryPosts.authorId, user.id)));
  return getPost(user, postId);
}

/** The author unpublishes; an admin may remove any post. */
export async function removePost(user: Member, postId: string): Promise<void> {
  const row = await postRow(postId);
  if (row.authorId !== user.id && !user.admin) throw new AppError(403, "Only the author or an admin can remove this post");
  await db.batch([
    db.delete(galleryVotes).where(eq(galleryVotes.postId, postId)),
    db.delete(galleryPosts).where(eq(galleryPosts.id, postId)),
  ]);
}

/** One vote per member per post; voting again takes it back. */
export async function toggleVote(userId: string, postId: string): Promise<{ votes: number; voted: boolean }> {
  const row = await postRow(postId);
  if (row.authorId === userId) throw new AppError(403, "You can't vote on your own post");
  const removed = await db
    .delete(galleryVotes)
    .where(and(eq(galleryVotes.postId, postId), eq(galleryVotes.userId, userId)))
    .returning({ postId: galleryVotes.postId });
  if (removed.length === 0) await db.insert(galleryVotes).values({ postId, userId }).onConflictDoNothing();
  const [{ votes } = { votes: 0 }] = await db.select({ votes: sql<number>`count(*)` }).from(galleryVotes).where(eq(galleryVotes.postId, postId));
  return { votes: Number(votes), voted: removed.length === 0 };
}

/** Copies a post into a new project of the person's own. */
export async function copyPost(userId: string, postId: string): Promise<ProjectSummary> {
  const row = await postRow(postId);
  const parsed = docSchema.safeParse(JSON.parse(row.doc));
  return createProject(userId, row.title.slice(0, 120), [{ name: "Main circuit", doc: parsed.success ? parsed.data : emptyDoc() }]);
}

