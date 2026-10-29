"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { LicenceProvider, useLicence } from "@/components/licensing/licence-provider";
import { LicenceLockedScreen } from "@/components/licensing/licence-locked-screen";
import { LicenceBanner } from "@/components/licensing/licence-banner";
import { ModuleRouteGuard } from "@/components/licensing/module-route-guard";
import { CopilotProvider, useCopilot } from "@/components/copilot/copilot-provider";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LicenceProvider>
      <AppShellInner>{children}</AppShellInner>
    </LicenceProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isLocked, hasModule } = useLicence();

  // EXPIRED_LOCKED / INVALID / MISSING → the whole app routes to the restricted
  // licence screen (view status / export data / upload renewal) only.
  if (isLocked) {
    return <LicenceLockedScreen />;
  }

  return (
    // The copilot rides on the AI Assistance licence module, like the agents.
    <CopilotProvider enabled={hasModule("AI_ASSIST")}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <ShellContent>{children}</ShellContent>
        <CopilotPanel />
      </SidebarProvider>
    </CopilotProvider>
  );
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const { open } = useCopilot();
  return (
    // On wide screens the open copilot docks beside the page instead of
    // covering it, so the permit form stays visible while it fills.
    <SidebarInset className={cn("min-w-0 max-w-full overflow-hidden transition-[padding]", open && "lg:pr-[420px]")}>
      <Header />
      <LicenceBanner />
      <div className="min-w-0 flex-1 p-4 lg:p-8">
        <ModuleRouteGuard>{children}</ModuleRouteGuard>
      </div>
      <footer className="border-t bg-white py-4 px-8 text-center text-xs text-[color:var(--me-ink-muted)]">
        SafeOps360 · Powered by{" "}
        <span className="font-semibold text-primary-800">Vizionforge Technologies</span>
      </footer>
    </SidebarInset>
  );
}
