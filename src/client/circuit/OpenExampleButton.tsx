import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { errorMessage } from "@/client/lib/errors";
import { openExample } from "@/serverFunctions/circuits";

/** Copies a built-in example into a new project and opens it. */
export function OpenExampleButton({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  return (
    <Button
      data-testid={`open-${slug}`}
      variant="outline"
      size="sm"
      className="self-start"
      pending={pending}
      onClick={async () => {
        setPending(true);
        try {
          const project = await openExample({ data: { slug } });
          await navigate({
            to: "/projects/$projectId/diagrams/$diagramId",
            params: { projectId: project.id, diagramId: project.diagrams[0]!.id },
          });
        } catch (error) {
          toast.error(errorMessage(error));
          setPending(false);
        }
      }}
    >
      Open as project
    </Button>
  );
}
