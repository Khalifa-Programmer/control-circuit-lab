import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "@/server/http";
import { createProject, listProjects, nameInput } from "@/server/projects";

export const Route = createFileRoute("/api/projects/")({
  server: {
    handlers: {
      GET: api(async ({ member }) => ({ projects: await listProjects(member.id) })),
      POST: api(async ({ member, body }) => {
        const { name } = z.object({ name: nameInput }).parse(await body());
        return { project: await createProject(member.id, name) };
      }, 201),
    },
  },
});
