// Consolidated into /fire-safety/register.
//
// The list view here duplicated the extinguisher register's add/edit path on the
// same FireEquipment table. The "All other fire assets" tab of the new register
// replaces this list; the asset DETAIL page (./[id]) is unaffected and still owns
// status override, out-of-service, frequency override and inspection history.
//
// Redirect rather than delete: this path is linked from the sidebar history, the
// fire dashboard and the asset detail breadcrumb.

import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/server";
export default async function FireEquipmentRedirect() {
  await requirePermission("INCIDENT.READ");
  redirect("/fire-safety/register");
}
