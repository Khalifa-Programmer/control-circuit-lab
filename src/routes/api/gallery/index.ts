import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { listInput, listPosts, publish, publishInput } from "@/server/gallery";

export const Route = createFileRoute("/api/gallery/")({
  server: {
    handlers: {
      GET: api(async ({ member, request }) => {
        const url = new URL(request.url);
        const input = listInput.parse({ sort: url.searchParams.get("sort") ?? undefined, q: url.searchParams.get("q") ?? undefined });
        return { posts: await listPosts(member.id, input) };
      }),
      POST: api(async ({ member, body }) => {
        const { post, created } = await publish(member, publishInput.parse(await body()));
        return Response.json({ post }, { status: created ? 201 : 200 });
      }),
    },
  },
});
