import { redirect } from "next/navigation";

/**
 * A deep link to a record that does not exist (bad id, soft-deleted, or gone
 * from the backend) used to hit `notFound()`, which renders the framework 404
 * INSIDE the dashboard shell — i.e. a blank content area with no way back. That
 * reads as a broken app rather than a missing record.
 *
 * Instead we bounce the reader to the module's register with `?missing=<label>`
 * on the URL. <MissingRecordToast>, mounted once in the dashboard layout, turns
 * that param into a toast and then strips it, so the address bar stays clean and
 * a refresh does not re-fire the message.
 *
 * `label` is the human name of the thing that was not found ("Permit",
 * "Observation"), never an id — it goes straight into the toast title.
 */
export function redirectMissingRecord(listHref: string, label: string): never {
  const separator = listHref.includes("?") ? "&" : "?";
  redirect(`${listHref}${separator}missing=${encodeURIComponent(label)}`);
}
