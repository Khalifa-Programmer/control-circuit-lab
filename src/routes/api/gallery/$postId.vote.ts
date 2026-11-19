import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/server/http";
import { toggleVote } from "@/server/gallery";

export const Route = createFileRoute("/api/gallery/$postId/vote")({
  server: {
    handlers: {
      POST: api(({ member, params }) => toggleVote(member.id, params.postId!)),
    },
  },
});
