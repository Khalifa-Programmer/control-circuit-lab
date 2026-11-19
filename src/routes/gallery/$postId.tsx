import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Copy, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { Workbench } from "@/client/circuit/Workbench";
import { errorMessage, isNotFound } from "@/client/lib/errors";
import { copyPost, getPost, removePost, updatePost, votePost } from "@/serverFunctions/circuits";

export const Route = createFileRoute("/gallery/$postId")({
  ssr: false,
  loader: async ({ params }) => {
    try {
      return await getPost({ data: { id: params.postId } });
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.title} · Control Circuit Lab` }] : [] }),
  component: PostPage,
});

function PostPage() {
  const post = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [votes, setVotes] = useState({ votes: post.votes, voted: post.voted });
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      toast.error(errorMessage(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell wide>
      <PageHeader
        title={post.title}
        description={
          <>
            {post.description ? <p className="whitespace-pre-line">{post.description}</p> : null}
            <p>
              Shared by {post.authorEmail} · {new Date(`${post.updatedAt.replace(" ", "T")}Z`).toLocaleDateString()}
            </p>
          </>
        }
        backLink={
          <Link to="/gallery" search={{ sort: "votes", q: "" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            Gallery
          </Link>
        }
        actions={
          <>
            <Button
              data-testid="vote"
              variant={votes.voted ? "secondary" : "outline"}
              aria-pressed={votes.voted}
              disabled={post.mine || busy}
              title={post.mine ? "You can't vote on your own post" : undefined}
              onClick={async () => {
                const next = await run(() => votePost({ data: { id: post.id } }));
                if (next) setVotes(next);
              }}
            >
              <ThumbsUp /> {votes.votes}
            </Button>
            <Button
              data-testid="copy-post"
              disabled={busy}
              onClick={async () => {
                const project = await run(() => copyPost({ data: { id: post.id } }));
                if (project)
                  await navigate({ to: "/projects/$projectId/diagrams/$diagramId", params: { projectId: project.id, diagramId: project.diagrams[0]!.id } });
              }}
            >
              <Copy /> Copy to my projects
            </Button>
            {post.mine ? (
              <Button variant="outline" onClick={() => setDialog("edit")}>
                Edit
              </Button>
            ) : null}
            {post.canRemove ? (
              <Button data-testid="delete-post" variant="outline" onClick={() => setDialog("remove")}>
                <Trash2 /> {post.mine ? "Unpublish" : "Remove"}
              </Button>
            ) : null}
          </>
        }
      />
      <Workbench doc={post.doc} name={post.title} />
      {dialog === "edit" ? (
        <FormDialog
          title="Edit post"
          onClose={() => setDialog(null)}
          actions={
            <Button form="edit-post" type="submit" pending={busy}>
              Save
            </Button>
          }
        >
          <form
            id="edit-post"
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await run(() => updatePost({ data: { id: post.id, title, description } }));
              if (saved) {
                setDialog(null);
                await router.invalidate();
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea id="edit-description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">To change the circuit, publish its diagram again from the editor.</p>
          </form>
        </FormDialog>
      ) : null}
      {dialog === "remove" ? (
        <ConfirmDialog
          title={post.mine ? "Unpublish this post?" : "Remove this post?"}
          confirmLabel={post.mine ? "Unpublish" : "Remove"}
          destructive
          pending={busy}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const done = await run(async () => {
              await removePost({ data: { id: post.id } });
              return true;
            });
            if (done) await navigate({ to: "/gallery", search: { sort: "votes", q: "" } });
          }}
        >
          Its votes are lost. Copies people made stay.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
