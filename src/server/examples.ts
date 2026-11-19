import { EXAMPLE_BY_SLUG } from "@/lib/circuit/examples";
import { notFound } from "./errors";
import { createProject, type ProjectSummary } from "./projects";

/** Opens a built-in example as a new project of the person's own; the original never changes. */
export async function openExample(userId: string, slug: string): Promise<ProjectSummary> {
  const example = EXAMPLE_BY_SLUG[slug];
  if (!example) throw notFound("Example");
  return createProject(userId, example.title, [{ name: "Main circuit", doc: structuredClone(example.doc) }]);
}
