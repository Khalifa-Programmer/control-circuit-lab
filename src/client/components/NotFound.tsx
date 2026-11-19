import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";

/** An address with nothing of the person's behind it. */
export function NotFound() {
  return (
    <AppShell>
      <div data-testid="not-found">
        <EmptyState
          variant="plain"
          icon={SearchX}
          title="Not found"
          description="It doesn't exist, or it isn't yours."
          action={
            <Button nativeButton={false} render={<Link to="/" />}>
              Go to Projects
            </Button>
          }
        />
      </div>
    </AppShell>
  );
}
