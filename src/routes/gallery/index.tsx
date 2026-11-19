import { createFileRoute, Link } from "@tanstack/react-router";
import { ThumbsUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Input } from "@/client/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { getGallery } from "@/serverFunctions/circuits";

const search = z.object({
  sort: z.enum(["votes", "newest"]).catch("votes").default("votes"),
  q: z.string().max(120).catch("").default(""),
});

export const Route = createFileRoute("/gallery/")({
  validateSearch: (s) => search.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getGallery({ data: deps }),
  head: () => ({ meta: [{ title: "Gallery · Control Circuit Lab" }] }),
  component: Gallery,
});

function Gallery() {
  const posts = Route.useLoaderData();
  const { sort, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== q) void navigate({ search: (prev) => ({ ...prev, q: text.trim() }), replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  return (
    <AppShell>
      <PageHeader title="Gallery" />
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs bg-card" aria-label="Search gallery" placeholder="Search by title" value={text} onChange={(e) => setText(e.target.value)} />
        <ToggleGroup
          size="sm"
          value={[sort]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "votes" || value === "newest") void navigate({ search: (prev) => ({ ...prev, sort: value }) });
          }}
        >
          <ToggleGroupItem value="votes">Most voted</ToggleGroupItem>
          <ToggleGroupItem value="newest">Newest</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {posts.length === 0 ? (
        q ? (
          <EmptyState kind="filtered" title="No matches" description={`Nothing is titled like “${q}”.`} />
        ) : (
          <EmptyState icon={Users} title="Nothing shared yet" description="Publish a diagram from the editor and it appears here." />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.id} data-testid="gallery-post" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <Link to="/gallery/$postId" params={{ postId: post.id }} className="font-medium hover:underline">
                {post.title}
              </Link>
              {post.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{post.description}</p> : null}
              <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{post.authorEmail}</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <ThumbsUp className="size-3.5" aria-hidden /> {post.votes}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
