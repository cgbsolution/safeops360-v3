import { PageHeader } from "@/components/page-header";
import { MeetingDetail } from "@/components/ims/meeting-detail";
import { ImsNav } from "@/components/ims/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { Meeting } from "@/lib/ims/api";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  let meeting: Meeting | null = null;
  let error: string | null = null;
  try {
    meeting = await backendFetch<Meeting>(`/api/ims/meetings/${encodeURIComponent(id)}`);
  } catch (e: any) {
    error = e?.message ?? "Could not load the meeting";
  }
  return (
    <div>
      <PageHeader
        title={meeting ? `${meeting.meetingNo} · ${meeting.title}` : "Safety meeting"}
        breadcrumbs={[
          { label: "IMS / MIS", href: "/ims" },
          { label: "Safety Meetings", href: "/ims/meetings" },
          { label: meeting?.meetingNo ?? "Meeting" },
        ]}
      />
      <ImsNav />
      {meeting ? (
        <MeetingDetail initial={meeting} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      )}
    </div>
  );
}
