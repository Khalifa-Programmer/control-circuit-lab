import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ChevronLeft, FileUp, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage, isNotFound } from "@/client/lib/errors";
import {
  addDiagram,
  deleteDiagram,
  duplicateDiagram,
  getProject,
  importDiagram,
  moveDiagram,
  renameDiagram,
} from "@/serverFunctions/circuits";

export const Route = createFileRoute("/projects/$projectId/")({
  loader: async ({ params }) => {
    try {
      return await getProject({ data: { id: params.projectId } });
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.name} · Control Circuit Lab` }] : [] }),
  component: ProjectPage,
});

type Dialog =
  | { kind: "add" }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string; name: string };

function ProjectPage() {
  const project = Route.useLoaderData();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      setDialog(null);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function importFile(file: File) {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportError("This file isn't a diagram exported from this app");
      return;
    }
    try {
      await importDiagram({ data: { projectId: project.id, file: parsed } });
      toast.success(`Imported ${file.name}`);
      await router.invalidate();
    } catch (error) {
      setImportError(errorMessage(error));
    }
  }

  const open = (d: Dialog) => {
    setName(d.kind === "rename" ? d.name : "");
    setDialog(d);
  };
  const last = project.diagrams.length - 1;

  return (
    <AppShell>
      <PageHeader
        title={project.name}
        backLink={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
            Projects
          </Link>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <FileUp /> Import
            </Button>
            <Button data-testid="add-diagram" onClick={() => open({ kind: "add" })}>
              <Plus /> Add diagram
            </Button>
          </>
        }
      />
      <input
        ref={fileInput}
        data-testid="import-file"
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      {importError ? (
        <Alert variant="destructive" data-testid="import-error">
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      ) : null}
      <ol className="divide-y divide-border rounded-xl border border-border bg-card">
        {project.diagrams.map((d, i) => (
          <li key={d.id} data-testid="diagram-row" className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <Link
              to="/projects/$projectId/diagrams/$diagramId"
              params={{ projectId: project.id, diagramId: d.id }}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {d.name}
            </Link>
            <RowActionsMenu label={`Actions for ${d.name}`}>
              <DropdownMenuItem onClick={() => open({ kind: "rename", id: d.id, name: d.name })}>Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(() => duplicateDiagram({ data: { id: d.id } }))}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem disabled={i === 0} onClick={() => run(() => moveDiagram({ data: { id: d.id, direction: "up" } }))}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={i === last} onClick={() => run(() => moveDiagram({ data: { id: d.id, direction: "down" } }))}>
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={last === 0} onClick={() => open({ kind: "delete", id: d.id, name: d.name })}>
                Delete
              </DropdownMenuItem>
            </RowActionsMenu>
          </li>
        ))}
      </ol>

      {dialog?.kind === "add" || dialog?.kind === "rename" ? (
        <FormDialog
          title={dialog.kind === "add" ? "Add diagram" : "Rename diagram"}
          onClose={() => setDialog(null)}
          actions={
            <Button form="diagram-form" type="submit" pending={pending}>
              {dialog.kind === "add" ? "Add" : "Save"}
            </Button>
          }
        >
          <form
            id="diagram-form"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
                dialog.kind === "add"
                  ? addDiagram({ data: { projectId: project.id, name } })
                  : renameDiagram({ data: { id: dialog.id, name } }),
              );
            }}
          >
            <Label htmlFor="diagram-name">Diagram name</Label>
            <Input id="diagram-name" autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          </form>
        </FormDialog>
      ) : null}
      {dialog?.kind === "delete" ? (
        <ConfirmDialog
          title={`Delete ${dialog.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={() => run(() => deleteDiagram({ data: { id: dialog.id } }))}
        />
      ) : null}
    </AppShell>
  );
}
