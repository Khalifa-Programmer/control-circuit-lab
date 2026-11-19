// The app's tools for AI clients, served by the Gateway at /mcp. Each one
// calls the same queries as the pages, scoped to the signed-in member.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listInput, listPosts } from "@/server/gallery";
import { listProjects } from "@/server/projects";

export const tools = defineTools({
  list_projects: {
    description: "List the member's own circuit projects and the diagrams in each.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => listProjects(user.id),
  },
  list_gallery: {
    description: "List circuits shared in the organisation's gallery, by votes or newest, optionally filtered by title.",
    risk: "read",
    input: listInput,
    handler: (input, { user }) => listPosts(user.id, input),
  },
});
