import { createFileRoute } from "@tanstack/react-router";
import { EXAMPLES } from "@/lib/circuit/examples";
import { api } from "@/server/http";

export const Route = createFileRoute("/api/examples/")({
  server: {
    handlers: {
      GET: api(async () => ({ examples: EXAMPLES.map(({ slug, title, summary }) => ({ slug, title, summary })) })),
    },
  },
});
