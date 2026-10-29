"use client";

// SafeOps Copilot — client state + streaming transport.
//
// One provider for the whole app (mounted in AppShell), so the conversation
// survives client-side navigation. The provider owns:
//   * the visible chat (items) and the exact API transcript (apiMessages) the
//     backend needs back each turn — append-only, never edited here;
//   * the page context, derived from the URL (module + record id);
//   * the bridge to the New Permit form, which the form registers while it is
//     mounted so the copilot can read the draft and apply patches live;
//   * a second, generic bridge for the New Observation form and the HIRA entry
//     editor (same idea: the form reports its state, the copilot proposes
//     patches, the user saves);
//   * risk-change notices: plain, non-AI cards a form can post into the chat
//     (e.g. the HIRA editor when a control change moves the residual risk).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { PtwDraft, PtwDraftCheck } from "@/lib/ptw/wizard-config";

export type ToolChip = { id: string; name: string; label: string; status: "pending" | "running" | "done" | "error"; error?: string | null };
export type CopilotAction =
  | { type: "navigate"; path: string; label: string }
  | { type: "specialist"; invocationId: string; invocationNumber: string; agentCode: string; label: string; module: string; recordId: string; href: string | null };
export type RiskNotice = { tone: "down" | "up" | "same" | "info"; title: string; lines: string[] };
export type ChatItem = {
  id: string;
  role: "user" | "assistant" | "notice";
  notice?: RiskNotice;
  text: string;
  tools: ToolChip[];
  actions: CopilotAction[];
  error?: string | null;
  streaming?: boolean;
  patchedFields?: string[];
};

export type PtwBridge = {
  getDraft: () => PtwDraft;
  applyPatch: (patch: Partial<PtwDraft>) => void;
};

export type FormKind = "OBSERVATION" | "HIRA_ENTRY";
export type FormBridge = {
  kind: FormKind;
  getDraft: () => Record<string, unknown>;
  applyPatch: (patch: Record<string, unknown>) => void;
};

export type PageContext = { path: string; module: string | null; recordId: string | null; recordLabel: string | null };

type CopilotContextValue = {
  available: boolean;
  /** Set when the licence allows the copilot but the server can't run it. */
  unavailableReason: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  items: ChatItem[];
  sending: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  page: PageContext;
  ptwFormOpen: boolean;
  registerPtwBridge: (bridge: PtwBridge) => () => void;
  /** Which non-PTW form is open (observation form / HIRA entry editor), if any. */
  formKind: FormKind | null;
  registerFormBridge: (bridge: FormBridge) => () => void;
  /** Post a non-AI notice card into the chat (never sent to the model). */
  pushNotice: (notice: RiskNotice) => void;
  lastCheck: PtwDraftCheck | null;
  conversationTooLong: boolean;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

const STORE_KEY = "safeops.copilot.v1";
const MAX_STORED_BYTES = 1_500_000;

/** Map the URL to the record the user is looking at. */
export function pageFromPath(path: string): PageContext {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  const isId = (s?: string) => !!s && !["new", "edit", "register", "reports", "dashboard", "analytics", "settings", "schedules"].includes(s);
  const base: PageContext = { path, module: null, recordId: null, recordLabel: null };
  const map: Record<string, string> = {
    ptw: "PTW", incidents: "INCIDENT", observations: "OBSERVATION", "near-miss": "NEAR_MISS", capa: "CAPA"
  };
  if (seg[0] === "ptw" && seg[1] === "new") return { ...base, module: "PTW", recordLabel: "New permit form" };
  if (map[seg[0]]) return { ...base, module: map[seg[0]], recordId: seg.length === 2 && isId(seg[1]) ? seg[1] : null };
  // /hira/{studyId}/entries/{entryId} — the HIRA agent works on the entry.
  if (seg[0] === "hira") {
    if (seg[2] === "entries" && isId(seg[3])) return { ...base, module: "HIRA", recordId: seg[3] };
    return { ...base, module: "HIRA" };
  }
  return base;
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localNow(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type Stored = { conversationId: string; apiMessages: unknown[]; items: ChatItem[] };

function loadStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j.conversationId === "string" && Array.isArray(j.apiMessages) && Array.isArray(j.items)) return j;
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return null;
}

/** Parse an SSE byte stream into (event, data) pairs. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of chunk.split("\n")) {
          if (line.startsWith(":")) continue; // keepalive comment
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) continue;
        try {
          yield { event, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          /* ignore a malformed frame */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function CopilotProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const pathname = usePathname() ?? "/";
  const page = useMemo(() => pageFromPath(pathname), [pathname]);
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [sending, setSending] = useState(false);
  const [lastCheck, setLastCheck] = useState<PtwDraftCheck | null>(null);
  const [conversationTooLong, setTooLong] = useState(false);
  const [bridgeCount, setBridgeCount] = useState(0);
  const conversationId = useRef<string>(uid());
  const apiMessages = useRef<unknown[]>([]);
  const bridge = useRef<PtwBridge | null>(null);
  const formBridge = useRef<FormBridge | null>(null);
  const [formKind, setFormKind] = useState<FormKind | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Restore the chat after a reload (per tab).
  useEffect(() => {
    const s = loadStored();
    if (s) {
      conversationId.current = s.conversationId;
      apiMessages.current = s.apiMessages;
      setItems(s.items.map((i) => ({ ...i, streaming: false })));
    }
  }, []);

  const persist = useCallback((nextItems: ChatItem[]) => {
    try {
      const raw = JSON.stringify({ conversationId: conversationId.current, apiMessages: apiMessages.current, items: nextItems });
      if (raw.length < MAX_STORED_BYTES) sessionStorage.setItem(STORE_KEY, raw);
    } catch {
      /* quota / private mode — the chat still works in memory */
    }
  }, []);

  // The launcher shows whenever the AI licence is on. Whether the server can
  // actually answer (backend updated, API key, flag) is checked separately and
  // explained in the panel, rather than silently hiding the button.
  useEffect(() => {
    setAvailable(enabled);
    if (!enabled) return;
    let alive = true;
    fetch("/api/copilot/status", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return { enabled: false, reason: "The backend hasn't been updated with the copilot yet. Deploy the latest backend." };
        return r.ok ? r.json() : { enabled: false, reason: "Could not check copilot status." };
      })
      .then((j) => { if (alive) setUnavailableReason(j?.enabled ? null : (j?.reason ?? "The copilot is not available.")); })
      .catch(() => { if (alive) setUnavailableReason("Could not reach the server."); });
    return () => { alive = false; };
  }, [enabled]);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try { sessionStorage.setItem(`${STORE_KEY}.open`, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  // Ctrl/Cmd + J toggles the panel (Ctrl/Cmd + B is the sidebar).
  useEffect(() => {
    if (!available) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpenState((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [available]);

  const registerPtwBridge = useCallback((b: PtwBridge) => {
    bridge.current = b;
    setBridgeCount((n) => n + 1);
    return () => {
      if (bridge.current === b) bridge.current = null;
      setBridgeCount((n) => n - 1);
      setLastCheck(null);
    };
  }, []);

  const registerFormBridge = useCallback((b: FormBridge) => {
    formBridge.current = b;
    setFormKind(b.kind);
    return () => {
      if (formBridge.current === b) {
        formBridge.current = null;
        setFormKind(null);
      }
    };
  }, []);

  const pushNotice = useCallback((notice: RiskNotice) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      const same = last?.role === "notice" && last.notice?.title === notice.title &&
        last.notice?.lines.join("|") === notice.lines.join("|");
      if (same) return prev;
      // Consecutive notices collapse into the latest one, so dragging through
      // several effectiveness values doesn't flood the chat.
      const base = last?.role === "notice" ? prev.slice(0, -1) : prev;
      const next = [...base, { id: uid(), role: "notice" as const, text: "", tools: [], actions: [], notice }];
      persist(next);
      return next;
    });
  }, [persist]);

  const updateItem = useCallback((id: string, fn: (i: ChatItem) => ChatItem) => {
    setItems((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));
  }, []);

  const stop = useCallback(() => { abort.current?.abort(); }, []);

  const newChat = useCallback(() => {
    abort.current?.abort();
    conversationId.current = uid();
    apiMessages.current = [];
    setItems([]);
    setTooLong(false);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const userItem: ChatItem = { id: uid(), role: "user", text: message, tools: [], actions: [] };
    const reply: ChatItem = { id: uid(), role: "assistant", text: "", tools: [], actions: [], streaming: true };
    setItems((prev) => [...prev, userItem, reply]);
    setSending(true);
    const ctrl = new AbortController();
    abort.current = ctrl;

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          conversationId: conversationId.current,
          message,
          messages: apiMessages.current,
          page: { path: page.path, module: page.module, recordId: page.recordId, recordLabel: page.recordLabel },
          ptwDraft: bridge.current ? bridge.current.getDraft() : null,
          formDraft: formBridge.current ? { kind: formBridge.current.kind, draft: formBridge.current.getDraft() } : null,
          nowLocal: localNow(),
          timezoneOffsetMinutes: new Date().getTimezoneOffset()
        })
      });
      if (!res.ok || !res.body) {
        let detail = "The copilot could not answer.";
        try { const j = await res.json(); detail = typeof j?.detail === "string" ? j.detail : detail; } catch { /* ignore */ }
        if (res.status === 413) setTooLong(true);
        updateItem(reply.id, (i) => ({ ...i, streaming: false, error: detail }));
        return;
      }
      for await (const { event, data } of readSse(res.body)) {
        if (event === "text") {
          updateItem(reply.id, (i) => ({ ...i, text: i.text + (data.delta ?? "") }));
        } else if (event === "tool") {
          updateItem(reply.id, (i) => {
            const chip: ToolChip = { id: data.id, name: data.name, label: data.label, status: data.status, error: data.error };
            const exists = i.tools.some((t) => t.id === chip.id);
            return { ...i, tools: exists ? i.tools.map((t) => (t.id === chip.id ? chip : t)) : [...i.tools, chip] };
          });
        } else if (event === "draft_patch") {
          bridge.current?.applyPatch(data.patch ?? {});
          if (data.check) setLastCheck(data.check);
          const fields = Object.keys(data.patch ?? {});
          updateItem(reply.id, (i) => ({ ...i, patchedFields: Array.from(new Set([...(i.patchedFields ?? []), ...fields])) }));
        } else if (event === "form_patch") {
          if (formBridge.current && formBridge.current.kind === data.kind) formBridge.current.applyPatch(data.patch ?? {});
          const fields = Object.keys(data.patch ?? {});
          updateItem(reply.id, (i) => ({ ...i, patchedFields: Array.from(new Set([...(i.patchedFields ?? []), ...fields])) }));
        } else if (event === "draft_check") {
          if (data.check) setLastCheck(data.check);
        } else if (event === "action") {
          updateItem(reply.id, (i) => ({ ...i, actions: [...i.actions, data as CopilotAction] }));
        } else if (event === "error") {
          updateItem(reply.id, (i) => ({ ...i, error: data.message ?? "Something went wrong." }));
        } else if (event === "done") {
          const base = Array.isArray(data.replaceHistory) ? data.replaceHistory : apiMessages.current;
          apiMessages.current = [...base, ...(Array.isArray(data.appendMessages) ? data.appendMessages : [])];
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        updateItem(reply.id, (i) => ({ ...i, error: i.text ? null : "Stopped." }));
      } else {
        updateItem(reply.id, (i) => ({ ...i, error: "Connection lost. Try again." }));
      }
    } finally {
      setSending(false);
      abort.current = null;
      // A turn that never reached "done" added nothing to the transcript, so
      // the user can simply resend; the bubble stays visible.
      setItems((prev) => {
        const next = prev.map((i) => (i.id === reply.id ? { ...i, streaming: false } : i));
        persist(next);
        return next;
      });
    }
  }, [sending, page, updateItem, persist]);

  // Remember the panel state for the tab; restore it on first load.
  useEffect(() => {
    try { if (sessionStorage.getItem(`${STORE_KEY}.open`) === "1") setOpenState(true); } catch { /* ignore */ }
  }, []);

  const value: CopilotContextValue = {
    available,
    unavailableReason,
    open: available && open,
    setOpen,
    toggle,
    items,
    sending,
    send,
    stop,
    newChat,
    page,
    ptwFormOpen: bridgeCount > 0,
    registerPtwBridge,
    formKind,
    registerFormBridge,
    pushNotice,
    lastCheck,
    conversationTooLong
  };
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

const NOOP_CONTEXT: CopilotContextValue = {
  available: false,
  unavailableReason: null,
  open: false,
  setOpen: () => {},
  toggle: () => {},
  items: [],
  sending: false,
  send: async () => {},
  stop: () => {},
  newChat: () => {},
  page: { path: "/", module: null, recordId: null, recordLabel: null },
  ptwFormOpen: false,
  registerPtwBridge: () => () => {},
  formKind: null,
  registerFormBridge: () => () => {},
  pushNotice: () => {},
  lastCheck: null,
  conversationTooLong: false
};

export function useCopilot(): CopilotContextValue {
  return useContext(CopilotContext) ?? NOOP_CONTEXT;
}
