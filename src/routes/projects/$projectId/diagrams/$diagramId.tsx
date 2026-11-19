import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { Workbench } from "@/client/circuit/Workbench";
import { errorMessage, isNotFound } from "@/client/lib/errors";
import type { CircuitDoc } from "@/lib/circuit/doc";
import { getDiagram, publishDiagram, saveDiagram } from "@/serverFunctions/circuits";

export const Route = createFileRoute("/projects/$projectId/diagrams/$diagramId")({
  // The editor and simulator need the browser.
  ssr: false,
  loader: async ({ params }) => {
    try {
      const data = await getDiagram({ data: { id: params.diagramId } });
      if (data.diagram.projectId !== params.projectId) throw notFound();
      return data;
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  staleTime: Infinity,
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.diagram.name} · Control Circuit Lab` }] : [] }),
  component: Editor,
});

type SaveState = "saved" | "dirty" | "saving" | { error: string };

function Editor() {
  const { diagram, post } = Route.useLoaderData();
  const [doc, setDoc] = useState<CircuitDoc>(diagram.doc);
  const [status, setStatus] = useState<SaveState>("saved");
  const version = useRef(diagram.version);
  const latest = useRef(doc);
  const saving = useRef(false);
  const [publishing, setPublishing] = useState(false);

  async function flush() {
    if (saving.current) return;
    saving.current = true;
    try {
      while (true) {
        const snapshot = latest.current;
        setStatus("saving");
        const result = await saveDiagram({ data: { id: diagram.id, doc: snapshot, version: version.current } });
        version.current = result.version;
        if (latest.current === snapshot) {
          setStatus("saved");
          break;
        }
      }
    } catch (error) {
      setStatus({ error: errorMessage(error) });
    } finally {
      saving.current = false;
    }
  }

  useEffect(() => {
    if (doc === diagram.doc) return;
    latest.current = doc;
    if (typeof status === "object") return;
    setStatus("dirty");
    const timer = setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status !== "saved") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const statusText = status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : status.error;

  return (
    <AppShell wide>
      <PageHeader
        title={diagram.name}
        backLink={
          <Link
            data-testid="back-to-project"
            to="/projects/$projectId"
            params={{ projectId: diagram.projectId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {diagram.projectName}
          </Link>
        }
        description={
          <span data-testid="save-status" className={typeof status === "object" ? "text-destructive" : undefined}>
            {statusText}
          </span>
        }
        actions={
          <Button data-testid="publish" variant="outline" onClick={() => setPublishing(true)}>
            <Share2 /> Publish
          </Button>
        }
      />
      <Workbench doc={doc} name={diagram.name} onChange={setDoc} />
      {publishing ? <PublishDialog diagramId={diagram.id} name={diagram.name} post={post} beforePublish={flush} onClose={() => setPublishing(false)} /> : null}
    </AppShell>
  );
}

function PublishDialog({
  diagramId,
  name,
  post,
  beforePublish,
  onClose,
}: {
  diagramId: string;
  name: string;
  post: { id: string; title: string; description: string } | null;
  beforePublish: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? name);
  const [description, setDescription] = useState(post?.description ?? "");
  const [pending, setPending] = useState(false);
  return (
    <FormDialog
      title={post ? "Update gallery post" : "Publish to the gallery"}
      onClose={onClose}
      actions={
        <Button form="publish-form" type="submit" pending={pending}>
          {post ? "Update post" : "Publish"}
        </Button>
      }
    >
      <form
        id="publish-form"
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            await beforePublish();
            const published = await publishDiagram({ data: { diagramId, title, description } });
            toast.success(post ? "Post updated" : "Published", {
              action: { label: "View", onClick: () => window.location.assign(`/gallery/${published.id}`) },
            });
            onClose();
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="post-title">Title</Label>
          <Input id="post-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="post-description">Description</Label>
          <Textarea id="post-description" maxLength={2000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {post ? <p className="text-sm text-muted-foreground">The post gets this diagram as it is now.</p> : null}
      </form>
    </FormDialog>
  );
}
