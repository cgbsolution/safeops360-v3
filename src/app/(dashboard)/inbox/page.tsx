import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { backendFetch, isBackendEnabled } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Eye, FileCheck, Hourglass, Inbox as InboxIcon, Send } from "lucide-react";
import { formatDateTime, humanize, cn } from "@/lib/utils";
import { MarkAllReadButton } from "./mark-all-read";
import { formatPartyMeta, formatPartyName } from "@/lib/users/user-ref";

import { StepName } from "@/components/workflow/step-name";
export const dynamic = "force-dynamic";

// ── Data source: the Python backend, NOT Prisma ────────────────────────────
//
// This page used to query Postgres directly through Prisma. That made it one
// of ~140 frontend files holding their own database connection, and it is why
// the Inbox died with PrismaClientInitializationError while every
// backend-served module kept working: a bad DATABASE_URL takes out only the
// pages on the Prisma path.
//
// Querying the DB from Next.js also bypasses everything the FastAPI layer
// enforces — RBAC, plant scoping, licence/module entitlement, the soft-delete
// guard, and the tamper-evident audit hash-chain. The backend already owned a
// complete inbox contract (/my-count + /tasks?tab=), so this page now reads
// through it and holds no database credentials at all.
//
// The SLA sweeps that used to run here are gone too. They existed to flip
// PENDING → OVERDUE before counting; the backend derives overdue from
// `dueAt < now` in the tab filter and returns an `isOverdue` flag per row, so
// the display is correct without a write on every page view.

// Web tab key -> backend tab name (app/routers/workflow.py::_INBOX_TABS).
const TAB_TO_BACKEND = {
  approvals: "pending_approvals",
  tasks: "my_tasks",
  verifications: "pending_verification",
  submitted: "submitted_by_me",
  overdue: "overdue_escalated",
} as const;

type TabKey = keyof typeof TAB_TO_BACKEND;

const TABS = [
  { key: "approvals", label: "Pending Approvals", icon: FileCheck },
  { key: "tasks", label: "My Tasks", icon: Hourglass },
  { key: "verifications", label: "Pending Verification", icon: CheckCircle2 },
  { key: "submitted", label: "Submitted by Me", icon: Send },
  { key: "overdue", label: "Overdue / Escalated", icon: AlertTriangle }
] as const;

// Every module the workflow engine mints tasks for MUST appear here. A module
// missing from these maps renders a blank badge and links to /dashboard instead
// of the record — the row becomes a dead end, and (since read state is stamped
// by opening the record) it can never be marked read either.
const MODULE_HREF: Record<string, string> = {
  OBSERVATION: "/observations",
  NEAR_MISS: "/near-miss",
  PTW: "/ptw",
  INCIDENT: "/incidents",
  // TRAINING tasks carry a TrainingSchedule id, NOT a TrainingRecord id —
  // verified against the live table. "/training/{id}" is the record route, so
  // every training row in the inbox 404'd. Schedules is the correct target.
  TRAINING: "/training/schedules",
  INSPECTION: "/inspections",
  MANHOURS: "/manhours",
  CAPA: "/capa",
  MOC: "/moc",
  HIRA_STUDY: "/hira"
};

const MODULE_LABEL: Record<string, string> = {
  OBSERVATION: "Observation",
  NEAR_MISS: "Near Miss",
  PTW: "Permit",
  INCIDENT: "Incident",
  TRAINING: "Training",
  INSPECTION: "Inspection",
  MANHOURS: "Manhours",
  CAPA: "CAPA",
  MOC: "MOC",
  HIRA_STUDY: "HIRA"
};

/** One row of GET /api/workflow/tasks (schemas: WorkflowTaskOut). */
type TaskRow = {
  id: string;
  module: string;
  recordId: string;
  recordNumber: string | null;
  recordTitle: string | null;
  stepName: string;
  taskType: string;
  status: string;
  priority: string;
  assignedAt: string | null;
  dueAt: string | null;
  initiatedByName: string | null;
  initiatedByDesignation: string | null;
  initiatedByRole: string | null;
  initiatedByDepartment: string | null;
  initiatedByPlantName: string | null;
  isOverdue: boolean;
  isRead: boolean;
};

/** GET /api/workflow/my-count (schemas: MyCountResponse). */
type MyCount = {
  tabPendingApprovals: number;
  tabMyTasks: number;
  tabPendingVerification: number;
  tabSubmittedByMe: number;
  tabOverdueEscalated: number;
  unreadTotal: number;
  unreadPendingApprovals: number;
  unreadMyTasks: number;
  unreadPendingVerification: number;
  unreadOverdueEscalated: number;
};

const ZERO_COUNT: MyCount = {
  tabPendingApprovals: 0, tabMyTasks: 0, tabPendingVerification: 0,
  tabSubmittedByMe: 0, tabOverdueEscalated: 0, unreadTotal: 0,
  unreadPendingApprovals: 0, unreadMyTasks: 0,
  unreadPendingVerification: 0, unreadOverdueEscalated: 0,
};

export default async function InboxPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const requested = (searchParams.tab ?? "approvals") as string;
  const tab: TabKey = (requested in TAB_TO_BACKEND ? requested : "approvals") as TabKey;

  if (!isBackendEnabled()) {
    return (
      <ConfigError
        detail="BACKEND_URL is not set on this deployment, so the Inbox has no data source."
      />
    );
  }

  // Counters and the active tab's rows. Only the active tab's rows are
  // fetched — the other four are represented by their counts alone.
  const [counts, rows] = await Promise.all([
    backendFetch<MyCount>("/api/workflow/my-count").catch(() => null),
    backendFetch<{ items: TaskRow[] }>(
      `/api/workflow/tasks?tab=${TAB_TO_BACKEND[tab]}&limit=200`
    ).catch(() => null),
  ]);

  // A failed counter fetch must not blank the page — the rows are the point.
  const c = counts ?? ZERO_COUNT;
  let items = rows?.items ?? [];

  // "Submitted by Me" is instance-shaped in the UI but the backend tab returns
  // every TASK belonging to my instances, so a record with two open tasks would
  // appear twice. Collapse to one row per record, keeping the first (the tab is
  // ordered newest-assigned first, so that is the most recent step).
  if (tab === "submitted") {
    const seen = new Set<string>();
    items = items.filter((t) => {
      const key = `${t.module}:${t.recordId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const counts_: Record<TabKey, number> = {
    approvals: c.tabPendingApprovals,
    tasks: c.tabMyTasks,
    verifications: c.tabPendingVerification,
    submitted: c.tabSubmittedByMe,
    overdue: c.tabOverdueEscalated,
  };

  // Unread = the assignee has never opened the record. "Submitted by Me" has no
  // unread state: those tasks belong to other people.
  const unreadByTab: Record<TabKey, number> = {
    approvals: c.unreadPendingApprovals,
    tasks: c.unreadMyTasks,
    verifications: c.unreadPendingVerification,
    submitted: 0,
    overdue: c.unreadOverdueEscalated,
  };

  const emptyText: Record<TabKey, string> = {
    approvals: "No pending approvals — you're all caught up.",
    tasks: "No execution tasks assigned to you.",
    verifications: "No items awaiting your verification.",
    submitted: "You haven't submitted any records yet.",
    overdue: "🎉 Nothing overdue. Keep it up.",
  };

  const actionLabel: Record<TabKey, string> = {
    approvals: "Approve",
    tasks: "Execute",
    verifications: "Verify",
    submitted: "View",
    overdue: "Open",
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Your action queue across every SafeOps360 workflow"
        action={
          <div className="flex items-center gap-2">
            {c.unreadTotal > 0 && (
              <>
                <Badge className="bg-rose-600 text-white border-rose-600">{c.unreadTotal} unread</Badge>
                <MarkAllReadButton />
              </>
            )}
            <Badge className="bg-primary-100 text-primary-800 border-primary-200">
              {counts_.approvals + counts_.tasks + counts_.verifications} active
            </Badge>
          </div>
        }
      />

      {rows === null && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t reach the workflow service, so this queue may be incomplete. Refresh to retry.
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = counts_[t.key];
          const u = unreadByTab[t.key];
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/inbox?tab=${t.key}`}
              // The count badge keeps its meaning (open items). Unread is a
              // SEPARATE signal — a rose pip — so a tab can't be misread as
              // "5 unread" when it means "5 items, 2 of them new".
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition",
                active
                  ? "bg-primary-700 text-white border-primary-700"
                  : "bg-white text-slate-700 border-slate-300 hover:border-primary-400"
              )}
              title={u > 0 ? `${u} not opened yet` : undefined}
            >
              <Icon size={14} />
              {t.label}
              <span className={cn("ml-1 px-1.5 rounded text-xs", active ? "bg-white/20" : n > 0 ? "bg-primary-100 text-primary-800" : "bg-slate-100 text-slate-500")}>
                {n}
              </span>
              {u > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
                  {u > 99 ? "99+" : u}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          <TaskList
            tasks={items}
            actionLabel={actionLabel[tab]}
            emptyText={emptyText[tab]}
            emptyIcon={tab === "submitted" ? Send : InboxIcon}
            overdueMode={tab === "overdue"}
            showUnread={tab !== "submitted"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigError({ detail }: { detail: string }) {
  return (
    <div>
      <PageHeader title="Inbox" description="Your action queue across every SafeOps360 workflow" />
      <Card>
        <CardContent className="p-12 text-center text-slate-500">
          <AlertTriangle size={32} className="mx-auto text-amber-500 mb-2" />
          <p className="text-sm font-medium text-slate-700">Inbox is not configured</p>
          <p className="text-xs mt-1">{detail}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskList({
  tasks,
  actionLabel,
  emptyText,
  emptyIcon: EmptyIcon,
  overdueMode,
  showUnread,
}: {
  tasks: TaskRow[];
  actionLabel: string;
  emptyText: string;
  emptyIcon: typeof InboxIcon;
  overdueMode?: boolean;
  showUnread?: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500">
        <EmptyIcon size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="divide-y">
      {tasks.map((task) => {
        const slaInfo = computeSla(task.dueAt, task.isOverdue);
        const moduleHref = MODULE_HREF[task.module] ?? "/dashboard";
        const recordHref = `${moduleHref}/${task.recordId}`;
        // Unread = never opened. Same visual language as the notification bell:
        // tinted row + left accent + bolder title, cleared by opening the record.
        const unread = showUnread !== false && !task.isRead;
        // Identity comes back flattened on the row, so there is no second
        // round-trip and no nested include to keep in sync.
        const initiator = {
          name: task.initiatedByName,
          designation: task.initiatedByDesignation,
          role: task.initiatedByRole,
          department: task.initiatedByDepartment,
          plantName: task.initiatedByPlantName,
        };
        const meta = formatPartyMeta(initiator);
        return (
          <Link
            key={task.id}
            href={recordHref}
            className={cn(
              "block border-l-[3px] px-5 py-4 transition hover:bg-slate-50",
              unread ? "border-l-primary-600 bg-primary-50/40" : "border-l-transparent",
              overdueMode && (unread ? "bg-rose-50" : "bg-rose-50/50")
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {unread && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-primary-600"
                      aria-label="Not opened yet"
                      title="Not opened yet"
                    />
                  )}
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
                    {MODULE_LABEL[task.module] ?? humanize(task.module)}
                  </Badge>
                  <span className="font-mono text-xs text-slate-600">
                    {task.recordNumber ?? task.recordId.slice(0, 8)}
                  </span>
                  <Badge className={slaInfo.cls + " text-[10px]"}>{slaInfo.label}</Badge>
                  {task.priority !== "NORMAL" && (
                    <Badge className={priorityCls(task.priority) + " text-[10px]"}>{task.priority}</Badge>
                  )}
                  {unread && (
                    <Badge className="bg-primary-600 text-white border-primary-600 text-[10px] uppercase tracking-wide">New</Badge>
                  )}
                </div>
                <div className={cn("text-sm", unread ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                  <StepName name={task.stepName} />
                </div>
                {task.recordTitle && (
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.recordTitle}</div>
                )}
                <div className="text-xs text-slate-500 mt-1">
                  Initiated by <strong>{formatPartyName(initiator)}</strong>
                  {meta && <> <span className="text-slate-400">({meta})</span></>}
                  {task.assignedAt && <> · Received {formatDateTime(task.assignedAt)}</>}
                  {task.dueAt && <> · Due {formatDateTime(task.dueAt)}</>}
                </div>
              </div>
              <div className="flex-shrink-0 self-center">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-700">
                  <Eye size={14} /> {actionLabel}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// `isOverdue` is authoritative — the backend already accounts for tasks the SLA
// sweep rewrote to OVERDUE/ESCALATED, which a pure dueAt comparison misses.
function computeSla(dueAt: string | null, isOverdue?: boolean) {
  if (!dueAt) {
    return isOverdue
      ? { label: "Overdue", cls: "bg-rose-100 text-rose-700 border-rose-200" }
      : { label: "No SLA", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft < 0 || isOverdue) {
    return {
      label: `Overdue ${Math.abs(Math.round(hoursLeft))}h`,
      cls: "bg-rose-100 text-rose-700 border-rose-200"
    };
  }
  if (hoursLeft < 24) return { label: `${Math.round(hoursLeft)}h left`, cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: `${Math.round(hoursLeft / 24)}d left`, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
}

function priorityCls(p: string) {
  if (p === "URGENT") return "bg-rose-600 text-white border-rose-600";
  if (p === "HIGH") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}
