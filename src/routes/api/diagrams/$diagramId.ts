import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { getDiagram, saveDiagram, saveInput } from "@/server/projects";

export const Route = createFileRoute("/api/diagrams/$diagramId")({
  server: {
    handlers: {
      GET: api(async ({ member, params }) => ({ diagram: await getDiagram(member.id, params.diagramId!) })),
      PUT: api(async ({ member, params, body }) => ({
        diagram: await saveDiagram(member.id, params.diagramId!, saveInput.parse(await body())),
      })),
    },
  },
});
