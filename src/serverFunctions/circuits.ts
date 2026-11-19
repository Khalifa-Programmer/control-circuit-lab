import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as gallery from "@/server/gallery";
import { openExample as openExampleQuery } from "@/server/examples";
import * as projects from "@/server/projects";
import { rememberUser } from "@/server/users";

const id = z.string().min(1).max(64);
const named = z.object({ id, name: projects.nameInput });

// Every function runs behind ensureUserMiddleware: `context.user` is the
// member the Gateway signed in, and every query is scoped to them.

export const getProjects = createServerFn({ method: "GET" })
  .middleware([ensureUserMiddleware]).handler(async ({ context }) => {
  const me = await rememberUser(context.user);
  return projects.listProjects(me.id);
});

export const getProject = createServerFn({ method: "GET" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(({ data, context }) => projects.getProject(context.user.id, data.id));

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ name: projects.nameInput }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await rememberUser(context.user);
    return projects.createProject(me.id, data.name);
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => named.parse(d))
  .handler(({ data, context }) => projects.renameProject(context.user.id, data.id, data.name));

export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(({ data, context }) => projects.duplicateProject(context.user.id, data.id));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(({ data, context }) => projects.deleteProject(context.user.id, data.id));

export const addDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ projectId: id, name: projects.nameInput }).parse(d))
  .handler(({ data, context }) => projects.addDiagram(context.user.id, data.projectId, data.name));

export const renameDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => named.parse(d))
  .handler(({ data, context }) => projects.renameDiagram(context.user.id, data.id, data.name));

export const duplicateDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(({ data, context }) => projects.duplicateDiagram(context.user.id, data.id));

export const moveDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id, direction: z.enum(["up", "down"]) }).parse(d))
  .handler(({ data, context }) => projects.moveDiagram(context.user.id, data.id, data.direction));

export const deleteDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(({ data, context }) => projects.deleteDiagram(context.user.id, data.id));

export const getDiagram = createServerFn({ method: "GET" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    const diagram = await projects.getDiagram(context.user.id, data.id);
    const post = await gallery.postForDiagram(context.user.id, data.id);
    return { diagram, post };
  });

export const saveDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => projects.saveInput.extend({ id }).parse(d))
  .handler(({ data, context }) => projects.saveDiagram(context.user.id, data.id, data));

export const importDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ projectId: id, file: z.unknown() }).parse(d))
  .handler(({ data, context }) => projects.importDiagram(context.user.id, data.projectId, data.file));

export const openExample = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ slug: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await rememberUser(context.user);
    return openExampleQuery(me.id, data.slug);
  });

export const getGallery = createServerFn({ method: "GET" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => gallery.listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const me = await rememberUser(context.user);
    return gallery.listPosts(me.id, data);
  });

export const getPost = createServerFn({ method: "GET" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => gallery.getPost(await rememberUser(context.user), data.id));

export const publishDiagram = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => gallery.publishInput.parse(d))
  .handler(async ({ data, context }) => (await gallery.publish(await rememberUser(context.user), data)).post);

export const updatePost = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => gallery.postInput.extend({ id }).parse(d))
  .handler(async ({ data: { id: postId, ...rest }, context }) => gallery.updatePost(await rememberUser(context.user), postId, rest));

export const removePost = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => gallery.removePost(await rememberUser(context.user), data.id));

export const votePost = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => gallery.toggleVote((await rememberUser(context.user)).id, data.id));

export const copyPost = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => gallery.copyPost((await rememberUser(context.user)).id, data.id));
