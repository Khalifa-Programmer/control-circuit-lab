import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { OpenExampleButton } from "@/client/circuit/OpenExampleButton";
import { EXAMPLES } from "@/lib/circuit/examples";
import { LESSONS } from "@/lib/circuit/lessons";

export const Route = createFileRoute("/learn/")({
  head: () => ({ meta: [{ title: "Learn · Control Circuit Lab" }] }),
  component: Learn,
});

function Learn() {
  return (
    <AppShell>
      <PageHeader title="Learn" />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lessons</h2>
        <ol className="divide-y divide-border rounded-xl border border-border bg-card">
          {LESSONS.map((lesson, i) => (
            <li key={lesson.slug}>
              <Link
                data-testid={`lesson-${lesson.slug}`}
                to="/learn/$lessonSlug"
                params={{ lessonSlug: lesson.slug }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="w-6 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-medium">{lesson.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Examples</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <li key={example.slug} data-testid={`example-${example.slug}`} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex-1 space-y-1">
                <h3 className="font-medium">{example.title}</h3>
                <p className="text-sm text-muted-foreground">{example.summary}</p>
              </div>
              <OpenExampleButton slug={example.slug} />
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
