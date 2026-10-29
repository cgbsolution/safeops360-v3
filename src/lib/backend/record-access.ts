import { redirect } from "next/navigation";
import { BackendError, backendFetch } from "@/lib/backend/fetch";

/**
 * Gate a server-rendered detail page on the FastAPI GET-by-id for the record.
 *
 * Several detail pages still read their record straight from Postgres through
 * Prisma, which applies no RBAC: any signed-in user who typed /ptw/<id> saw a
 * permit their own API calls would refuse with 403. Calling the backend's
 * detail endpoint first makes the page obey the same plant / department /
 * own-records scope as the API. 403 → access-denied page. 404 is left to the
 * page's own missing-record handling (redirectMissingRecord), which already
 * covers a record Prisma cannot find.
 */
export async function assertRecordAccess(path: string, permission: string): Promise<void> {
  try {
    await backendFetch(path);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) return;
    if (e instanceof BackendError && e.status === 403) {
      redirect(
        `/access-denied?code=${encodeURIComponent(permission)}&reason=${encodeURIComponent(e.message)}`
      );
    }
    throw e;
  }
}
