import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const now = sql`(current_timestamp)`;

/** One row per person the Gateway has signed in, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

/** A person's own projects; nobody else reads them. */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

/** The diagrams in a project. `doc` is the circuit as JSON; `version` guards against lost updates. */
export const diagrams = sqliteTable(
  "diagrams",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    doc: text("doc").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("diagrams_project_idx").on(t.projectId, t.position)],
);

/** A snapshot of a diagram shared with every member of the organisation. */
export const galleryPosts = sqliteTable(
  "gallery_posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id").notNull(),
    authorEmail: text("author_email").notNull(),
    sourceDiagramId: text("source_diagram_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    doc: text("doc").notNull(),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("gallery_source_idx").on(t.authorId, t.sourceDiagramId)],
);

export const galleryVotes = sqliteTable(
  "gallery_votes",
  {
    postId: text("post_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
