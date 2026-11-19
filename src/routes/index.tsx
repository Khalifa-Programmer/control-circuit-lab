import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { Button } from "@/client/components/ui/button";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage } from "@/client/lib/errors";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProjects,
  renameProject,
} from "@/serverFunctions/circuits";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects · Control Circuit Lab" }] }),
  component: Projects,
});

type Dialog =
  | { kind: "create" }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string; name: string };

function Projects() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

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

  const open = (d: Dialog) => {
    setName(d.kind === "rename" ? d.name : "");
    setDialog(d);
  };

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project" onClick={() => open({ kind: "create" })}>
            <Plus /> New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          media="rows"
          icon={FolderOpen}
          title="No projects yet"
          description="Create one, or open an example from Learn."
          action={
            <Button variant="outline" nativeButton={false} render={<Link to="/learn" />}>
              Browse examples
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {projects.map((p) => (
            <li key={p.id} data-testid="project-row" className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="block truncate font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <p className="truncate text-sm text-muted-foreground">
                  {p.diagrams.map((d) => d.name).join(" · ")}
                </p>
              </div>
              <RowActionsMenu label={`Actions for ${p.name}`}>
                <DropdownMenuItem onClick={() => open({ kind: "rename", id: p.id, name: p.name })}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => run(() => duplicateProject({ data: { id: p.id } }))}
                >
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => open({ kind: "delete", id: p.id, name: p.name })}
                >
                  Delete
                </DropdownMenuItem>
              </RowActionsMenu>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "create" || dialog?.kind === "rename" ? (
        <FormDialog
          title={dialog.kind === "create" ? "New project" : "Rename project"}
          onClose={() => setDialog(null)}
          actions={
            <Button form="project-form" type="submit" pending={pending}>
              {dialog.kind === "create" ? "Create" : "Save"}
            </Button>
          }
        >
          <form
            id="project-form"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (dialog.kind === "create") {
                void run(async () => {
                  const project = await createProject({ data: { name } });
                  await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
                });
              } else {
                void run(() => renameProject({ data: { id: dialog.id, name } }));
              }
            }}
          >
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
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
          onConfirm={() => run(() => deleteProject({ data: { id: dialog.id } }))}
        >
          Its diagrams are deleted too. Posts you shared in the gallery stay.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
