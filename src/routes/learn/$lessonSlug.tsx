import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { OpenExampleButton } from "@/client/circuit/OpenExampleButton";
import { EXAMPLE_BY_SLUG } from "@/lib/circuit/examples";
import { LESSON_BY_SLUG, LESSONS } from "@/lib/circuit/lessons";

export const Route = createFileRoute("/learn/$lessonSlug")({
  loader: ({ params }) => {
    const lesson = LESSON_BY_SLUG[params.lessonSlug];
    if (!lesson) throw notFound();
    return lesson;
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.title} · Control Circuit Lab` }] : [] }),
  component: LessonPage,
});

function LessonPage() {
  const lesson = Route.useLoaderData();
  const index = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const next = LESSONS[index + 1];
  return (
    <AppShell>
      <PageHeader
        title={lesson.title}
        description={`Lesson ${index + 1} of ${LESSONS.length}`}
        backLink={
          <Link to="/learn" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            Learn
          </Link>
        }
      />
      <div data-testid="lesson-body" className="space-y-4 leading-relaxed">
        {lesson.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {lesson.examples.length ? (
        <ul className="space-y-2">
          {lesson.examples.map((slug) => {
            const example = EXAMPLE_BY_SLUG[slug]!;
            return (
              <li key={slug} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-medium">{example.title}</p>
                  <p className="text-sm text-muted-foreground">{example.summary}</p>
                </div>
                <OpenExampleButton slug={slug} />
              </li>
            );
          })}
        </ul>
      ) : null}
      {next ? (
        <Button variant="outline" nativeButton={false} render={<Link to="/learn/$lessonSlug" params={{ lessonSlug: next.slug }} />}>
          Next: {next.title}
        </Button>
      ) : null}
    </AppShell>
  );
}
