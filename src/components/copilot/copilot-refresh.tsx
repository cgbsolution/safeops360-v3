"use client";

// Remounts a form when the copilot has saved its record.
//
// Editors such as the HIRA entry editor copy the server data into local state
// once, so a router.refresh() alone leaves them showing the old entry. This
// wrapper waits for the refreshed server data (a new `version`) and remounts
// its children only when the copilot changed this record since they mounted.
// The user's own saves also refresh the page, but they don't remount it, so
// the editor keeps its "Saved" message and other local state.

import { Fragment, useState } from "react";
import { useCopilot } from "./copilot-provider";

export function CopilotRefreshOnChange({
  recordId,
  version,
  children
}: {
  recordId: string;
  /** Any string that changes whenever the server copy of the record changes. */
  version: string;
  children: React.ReactNode;
}) {
  const { recordRevisions } = useCopilot();
  const rev = recordRevisions[recordId] ?? 0;
  const [state, setState] = useState({ mountKey: 0, version, seenRev: rev });

  if (state.version !== version) {
    const copilotChangedIt = rev > state.seenRev;
    setState({ mountKey: copilotChangedIt ? state.mountKey + 1 : state.mountKey, version, seenRev: rev });
  }

  return <Fragment key={state.mountKey}>{children}</Fragment>;
}
