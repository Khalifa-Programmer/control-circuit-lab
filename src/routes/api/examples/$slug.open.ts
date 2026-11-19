import { createFileRoute } from "@tanstack/react-router";
import { openExample } from "@/server/examples";
import { api } from "@/server/http";

export const Route = createFileRoute("/api/examples/$slug/open")({
  server: {
    handlers: {
      POST: api(async ({ member, params }) => ({ project: await openExample(member.id, params.slug!) }), 201),
    },
  },
});
