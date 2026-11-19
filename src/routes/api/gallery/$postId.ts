import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { getPost, postInput, removePost, updatePost } from "@/server/gallery";

export const Route = createFileRoute("/api/gallery/$postId")({
  server: {
    handlers: {
      GET: api(async ({ member, params }) => ({ post: await getPost(member, params.postId!) })),
      PATCH: api(async ({ member, params, body }) => ({
        post: await updatePost(member, params.postId!, postInput.parse(await body())),
      })),
      DELETE: api(async ({ member, params }) => {
        await removePost(member, params.postId!);
        return { ok: true };
      }),
    },
  },
});
