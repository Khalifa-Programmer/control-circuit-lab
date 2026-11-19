import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { deleteProject, getProject } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$projectId")({
  server: {
    handlers: {
      GET: api(async ({ member, params }) => ({ project: await getProject(member.id, params.projectId!) })),
      DELETE: api(async ({ member, params }) => {
        await deleteProject(member.id, params.projectId!);
        return { ok: true };
      }),
    },
  },
});
