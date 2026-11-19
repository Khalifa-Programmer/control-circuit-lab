import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";

/**
 * The frame every page sits in: a bar with the way back to the Gateway and
 * the theme pick, then one scrolling column. The document itself doesn't
 * scroll (src/client/styles/app.css); the column does. A page starts with a
 * `PageHeader`.
 */
export function AppShell({
  wide = false,
  children,
}: {
  /** The editor's canvas uses the full width. */
  wide?: boolean;
  children: ReactNode;
}) {
  // From the root route's loader (src/serverFunctions/gateway.ts).
  const gatewayUrl = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "gatewayUrl" in root ? root.gatewayUrl : null;
    },
  });
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div
          className={`${wide ? WIDE : COLUMN} flex h-12 items-center justify-between gap-3`}
        >
          <div className="flex min-w-0 items-center gap-4">
            {gatewayUrl ? (
              <a
                href={gatewayUrl}
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All apps
              </a>
            ) : null}
            <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <ThemePreferenceRadio />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main
          className={`${wide ? WIDE : COLUMN} space-y-6 pt-8 pb-24 md:pt-10`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** The column the bar and the page share. */
const COLUMN = "mx-auto w-full max-w-3xl px-4 md:px-10";
const WIDE = "mx-auto w-full max-w-screen-2xl px-4 md:px-6";

const NAV = [
  { to: "/", label: "Projects" },
  { to: "/learn", label: "Learn" },
  { to: "/gallery", label: "Gallery" },
] as const;
