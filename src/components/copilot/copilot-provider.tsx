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
import { usePathname, useRouter } from "next/navigation";
import type { PtwDraft, PtwDraftCheck } from "@/lib/ptw/wizard-config";
import type { CopilotPhoto } from "@/lib/copilot-photos";

export type ToolChip = { id: string; name: string; label: string; status: "pending" | "running" | "done" | "error"; error?: string | null };
export type CopilotAction =
  | { type: "navigate"; path: string; label: string }
  | { type: "specialist"; invocationId: string; invocationNumber: string; agentCode: string; label: string; module: string; recordId: string; href: string | null }
  /** A record the copilot saved for the user (HIRA study / entry). */
  | { type: "record"; verb: "created" | "updated" | "submitted"; module: string; kind: "study" | "entry"; recordId: string; number: string | null; title: string | null; href: string };
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
  /** The connection dropped mid-answer and is being re-opened. */
  reconnecting?: boolean;
  patchedFields?: string[];
  /** Thumbnails of the photos the user sent with this message. */
  photos?: string[];
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
  /** The observation form: add photos the user gave the copilot to the form's Photos section. */
  attachPhotos?: (files: File[]) => void;
};

export type PageContext = {
  path: string;
  module: string | null;
  recordId: string | null;
  recordLabel: string | null;
  /** The HIRA study open on screen (its page or one of its entries). */
  studyId?: string | null;
};

type CopilotContextValue = {
  available: boolean;
  /** Set when the licence allows the copilot but the server can't run it. */
  unavailableReason: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  items: ChatItem[];
  sending: boolean;
  /** Send a message, optionally with photos (upload or camera). */
  send: (text: string, photos?: CopilotPhoto[]) => Promise<void>;
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
  /** How many times the copilot has saved each record (by id) in this tab. */
  recordRevisions: Record<string, number>;
  /** Record a save made outside the chat, so the open editor remounts on refresh. */
  markRecordChanged: (recordId: string) => void;
  /** Plant of the record on screen, when the page reports it (the URL has no plant). */
  pagePlantId: string | null;
  setPagePlantId: (plantId: string | null) => void;
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
  // /hira/{studyId}/entries/{entryId} — the HIRA agent works on the entry;
  // /hira/{studyId} is the study the copilot adds entries to.
  if (seg[0] === "hira") {
    const studyId = isId(seg[1]) && !["reviews", "entries"].includes(seg[1]) ? seg[1] : null;
    if (studyId && seg[2] === "entries" && isId(seg[3])) return { ...base, module: "HIRA", recordId: seg[3], studyId };
    return { ...base, module: "HIRA", studyId };
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

// ─── Turn transport ─────────────────────────────────────────────────────
// A turn runs on the backend on its own. The browser reads its events over
// one or more streams: the backend ends each stream after ~3 minutes (under
// Vercel's function limit) and the browser carries on from the last event it
// got. A dropped connection or a failed request is retried the same way, and
// the turn id makes a resent message join the turn it already started. A slow
// answer is never given up on; only a server that stays unreachable for
// minutes is. The Stop button is the only thing that stops a turn.

const ACTIVE_KEY = `${STORE_KEY}.turn`;
/** Give up only after the server has been unreachable this long. */
const UNREACHABLE_GIVE_UP_MS = 10 * 60_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** Responses that won't change on a retry. */
const FINAL_STATUSES = new Set([400, 401, 403, 404, 405, 409, 413, 422, 429]);

/** The turn being answered, kept so a reload can pick it up again. */
type ActiveTurn = { turnId: string; conversationId: string; userItem: ChatItem; replyId: string };

/** 32 hex characters: the backend also uses it as the audit row id. */
function newTurnId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function saveActive(turn: ActiveTurn | null) {
  try {
    if (turn) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(turn));
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable: the answer still arrives, it just can't be picked up after a reload */
  }
}

function loadActive(): ActiveTurn | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY);
    const j = raw ? JSON.parse(raw) : null;
    if (j && typeof j.turnId === "string" && /^[0-9a-f]{32}$/.test(j.turnId) &&
        typeof j.conversationId === "string" && typeof j.replyId === "string" && j.userItem?.role === "user") return j;
  } catch {
    /* ignore */
  }
  return null;
}

/** setTimeout that ends early when the turn is stopped. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function errorDetail(res: Response): Promise<string | null> {
  try {
    const j = await res.json();
    return typeof j?.detail === "string" ? j.detail : null;
  } catch {
    return null;
  }
}

/** Parse an SSE byte stream into (id, event, data). */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ id: number | null; event: string; data: any }> {
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
        let id: number | null = null;
        const dataLines: string[] = [];
        for (const line of chunk.split("\n")) {
          if (line.startsWith(":")) continue; // keepalive comment
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          else if (line.startsWith("id:")) {
            const n = Number(line.slice(3).trim());
            id = Number.isFinite(n) ? n : null;
          }
        }
        if (!dataLines.length) continue;
        try {
          yield { id, event, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          /* ignore a malformed frame */
        }
      }
    }
  } finally {
    // Leaving early (a `reconnect` event) closes the connection too.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function CopilotProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const page = useMemo(() => pageFromPath(pathname), [pathname]);
  const [recordRevisions, setRecordRevisions] = useState<Record<string, number>>({});
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
  const [pagePlantId, setPagePlantId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const activeTurn = useRef<string | null>(null);
  const restored = useRef(false);
  // Photos sent while the observation form was closed wait here for it; when it
  // opens they move into its Photos section and the copilot is asked to fill it.
  const pendingPhotos = useRef<File[]>([]);
  const carryOver = useRef(false);
  const [carryOverReady, setCarryOverReady] = useState(false);

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
    if (b.kind === "OBSERVATION" && b.attachPhotos && pendingPhotos.current.length) {
      b.attachPhotos(pendingPhotos.current);
      pendingPhotos.current = [];
      if (carryOver.current) setCarryOverReady(true);
      carryOver.current = false;
    }
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

  // A one-click action outside the chat (e.g. the calibrated HIRA review) saved
  // this record: count it like a copilot save so CopilotRefreshOnChange
  // remounts the open editor with the refreshed server copy.
  const markRecordChanged = useCallback((recordId: string) => {
    setRecordRevisions((r) => ({ ...r, [recordId]: (r[recordId] ?? 0) + 1 }));
  }, []);

  const updateItem = useCallback((id: string, fn: (i: ChatItem) => ChatItem) => {
    setItems((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));
  }, []);

  const stop = useCallback(() => {
    const turnId = activeTurn.current;
    abort.current?.abort();
    // Closing the stream doesn't stop the turn on the server; this does.
    if (turnId) void fetch(`/api/copilot/chat/${turnId}/cancel`, { method: "POST" }).catch(() => {});
  }, []);

  const newChat = useCallback(() => {
    stop();
    conversationId.current = uid();
    apiMessages.current = [];
    pendingPhotos.current = [];
    carryOver.current = false;
    setCarryOverReady(false);
    setItems([]);
    setTooLong(false);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, [stop]);

  /** Read a turn's events until it ends, reconnecting as often as needed.
   *  `startBody` is the POST that starts the turn, resent until the server
   *  accepts it; null = the turn already exists (picked up after a reload). */
  const streamTurn = useCallback(async (turnId: string, replyId: string, startBody: string | null, signal: AbortSignal) => {
    let after = 0;    // last event applied
    let textLen = 0;  // reply text applied, in the server's offsets
    let accepted = startBody === null;
    let failures = 0;
    let lastContact = Date.now();
    const update = (fn: (i: ChatItem) => ChatItem) => updateItem(replyId, fn);
    const fail = (message: string) => update((i) => ({ ...i, error: message, reconnecting: false }));

    while (!signal.aborted) {
      let res: Response | null = null;
      try {
        res = accepted
          ? await fetch(`/api/copilot/chat/${turnId}/events?after=${after}`, { cache: "no-store", signal })
          : await fetch("/api/copilot/chat", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: startBody ?? "", signal
          });
      } catch {
        if (signal.aborted) return;
      }

      if (res?.ok && res.body && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        accepted = true;
        let rollover = false;
        try {
          for await (const { id, event, data } of readSse(res.body)) {
            lastContact = Date.now();
            if (failures) {
              failures = 0;
              update((i) => ({ ...i, reconnecting: false }));
            }
            if (id !== null) {
              if (id <= after) continue; // already applied before the reconnect
              after = id;
            }
            if (event === "reconnect") {
              rollover = true;
              break;
            }
            if (event === "end") return;
            if (event === "text") {
              // `at` places the text in the reply, so a span that arrives twice
              // after a reconnect is only shown once.
              const delta = typeof data.delta === "string" ? data.delta : "";
              const at = typeof data.at === "number" ? data.at : textLen;
              const piece = at >= textLen ? delta : delta.slice(textLen - at);
              textLen = Math.max(textLen, at + delta.length);
              if (piece) update((i) => ({ ...i, text: i.text + piece }));
            } else if (event === "rewind") {
              // A model round failed half-way and is being run again.
              const to = typeof data.to === "number" ? data.to : textLen;
              const drop = new Set<string>(Array.isArray(data.dropTools) ? data.dropTools : []);
              textLen = Math.min(textLen, to);
              update((i) => ({ ...i, text: i.text.slice(0, to), tools: i.tools.filter((t) => !drop.has(t.id)) }));
            } else if (event === "tool") {
              update((i) => {
                const chip: ToolChip = { id: data.id, name: data.name, label: data.label, status: data.status, error: data.error };
                const exists = i.tools.some((t) => t.id === chip.id);
                return { ...i, tools: exists ? i.tools.map((t) => (t.id === chip.id ? chip : t)) : [...i.tools, chip] };
              });
            } else if (event === "draft_patch") {
              bridge.current?.applyPatch(data.patch ?? {});
              if (data.check) setLastCheck(data.check);
              const fields = Object.keys(data.patch ?? {});
              update((i) => ({ ...i, patchedFields: Array.from(new Set([...(i.patchedFields ?? []), ...fields])) }));
            } else if (event === "form_patch") {
              if (formBridge.current && formBridge.current.kind === data.kind) formBridge.current.applyPatch(data.patch ?? {});
              const fields = Object.keys(data.patch ?? {});
              update((i) => ({ ...i, patchedFields: Array.from(new Set([...(i.patchedFields ?? []), ...fields])) }));
            } else if (event === "draft_check") {
              if (data.check) setLastCheck(data.check);
            } else if (event === "action") {
              update((i) => ({ ...i, actions: [...i.actions, data as CopilotAction] }));
              if (data?.type === "record" && typeof data.recordId === "string") {
                // The copilot saved a record: re-read the page so registers and the
                // open editor show it (see CopilotRefreshOnChange).
                setRecordRevisions((r) => ({ ...r, [data.recordId]: (r[data.recordId] ?? 0) + 1 }));
                router.refresh();
              }
            } else if (event === "error") {
              update((i) => ({ ...i, error: data.message ?? "Something went wrong." }));
            } else if (event === "done") {
              const base = Array.isArray(data.replaceHistory) ? data.replaceHistory : apiMessages.current;
              apiMessages.current = [...base, ...(Array.isArray(data.appendMessages) ? data.appendMessages : [])];
              if (data.stopped) update((i) => ({ ...i, error: i.text ? null : "Stopped." }));
              return;
            }
          }
        } catch {
          if (signal.aborted) return;
        }
        if (rollover) continue; // the server ended this stream segment on purpose
      } else if (res) {
        const detail = await errorDetail(res);
        if (res.status === 413) setTooLong(true);
        // 503 "... not configured" is a setup problem, not a hiccup.
        const permanent = FINAL_STATUSES.has(res.status) || (res.status === 503 && !!detail && /configured/i.test(detail));
        if (permanent) {
          fail(detail ?? "The copilot could not answer.");
          return;
        }
      }

      // A dropped connection or a server hiccup: wait a little, then pick up
      // where we left off.
      if (Date.now() - lastContact > UNREACHABLE_GIVE_UP_MS) {
        fail("Lost the connection to the copilot. Reload the page to see the answer.");
        return;
      }
      failures += 1;
      update((i) => ({ ...i, reconnecting: true }));
      await wait(RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1], signal);
    }
  }, [updateItem, router]);

  const drive = useCallback(async (turn: ActiveTurn, startBody: string | null) => {
    setSending(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    activeTurn.current = turn.turnId;
    saveActive(turn);
    try {
      await streamTurn(turn.turnId, turn.replyId, startBody, ctrl.signal);
    } catch {
      updateItem(turn.replyId, (i) => ({ ...i, error: "Something went wrong. Try again." }));
    } finally {
      if (ctrl.signal.aborted) updateItem(turn.replyId, (i) => ({ ...i, error: i.text ? null : "Stopped." }));
      setSending(false);
      if (abort.current === ctrl) abort.current = null;
      if (activeTurn.current === turn.turnId) activeTurn.current = null;
      saveActive(null);
      // A turn that never reached "done" added nothing to the transcript, so
      // the user can simply resend; the bubble stays visible.
      setItems((prev) => {
        const next = prev.map((i) => (i.id === turn.replyId ? { ...i, streaming: false, reconnecting: false } : i));
        persist(next);
        return next;
      });
    }
  }, [streamTurn, updateItem, persist]);

  const send = useCallback(async (text: string, photos: CopilotPhoto[] = []) => {
    const typed = text.trim();
    if ((!typed && photos.length === 0) || sending) return;
    const message = typed || (photos.length === 1
      ? "Here is a photo of what I saw. Help me record a safety observation."
      : "Here are photos of what I saw. Help me record a safety observation.");
    const userItem: ChatItem = {
      id: uid(), role: "user", text: typed, tools: [], actions: [],
      photos: photos.length ? photos.map((p) => p.thumb) : undefined
    };
    if (photos.length) {
      // The photos also go on the observation form, so they are saved with it.
      const files = photos.map((p) => p.file);
      const fb = formBridge.current;
      if (fb?.kind === "OBSERVATION" && fb.attachPhotos) {
        fb.attachPhotos(files);
      } else {
        pendingPhotos.current = [...pendingPhotos.current, ...files];
        carryOver.current = true;
      }
    }
    const reply: ChatItem = { id: uid(), role: "assistant", text: "", tools: [], actions: [], streaming: true };
    setItems((prev) => [...prev, userItem, reply]);
    const turnId = newTurnId();
    // Built once, so a retry resends exactly the same request.
    const body = JSON.stringify({
      turnId,
      conversationId: conversationId.current,
      message,
      messages: apiMessages.current,
      page: { path: page.path, module: page.module, recordId: page.recordId, recordLabel: page.recordLabel, studyId: page.studyId ?? null },
      ptwDraft: bridge.current ? bridge.current.getDraft() : null,
      formDraft: formBridge.current ? { kind: formBridge.current.kind, draft: formBridge.current.getDraft() } : null,
      nowLocal: localNow(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      images: photos.map((p) => ({ mediaType: p.mediaType, data: p.data }))
    });
    await drive({ turnId, conversationId: conversationId.current, userItem, replyId: reply.id }, body);
  }, [sending, page, drive]);

  // The observation form opened after photos were sent from elsewhere: once the
  // copilot is free, ask it to fill the form from that conversation.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!carryOverReady || sending || formKind !== "OBSERVATION") return;
    setCarryOverReady(false);
    void sendRef.current("The New Observation form is open now, with my photos attached. Fill it from the photos and what we discussed.");
  }, [carryOverReady, sending, formKind]);

  // After a reload: restore the chat (per tab), and if an answer was still
  // coming in, show it again and carry on reading it — the server kept going.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const s = loadStored();
    if (s) {
      conversationId.current = s.conversationId;
      apiMessages.current = s.apiMessages;
    }
    const items0 = (s?.items ?? []).map((i) => ({ ...i, streaming: false, reconnecting: false }));
    const turn = loadActive();
    if (!turn || turn.conversationId !== conversationId.current) {
      saveActive(null);
      if (s) setItems(items0);
      return;
    }
    const reply: ChatItem = { id: turn.replyId, role: "assistant", text: "", tools: [], actions: [], streaming: true };
    setItems([...items0.filter((i) => i.id !== turn.userItem.id && i.id !== turn.replyId), turn.userItem, reply]);
    void drive(turn, null);
  }, [drive]);

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
    recordRevisions,
    markRecordChanged,
    pagePlantId,
    setPagePlantId,
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
  recordRevisions: {},
  markRecordChanged: () => {},
  pagePlantId: null,
  setPagePlantId: () => {},
  lastCheck: null,
  conversationTooLong: false
};

export function useCopilot(): CopilotContextValue {
  return useContext(CopilotContext) ?? NOOP_CONTEXT;
}

/**
 * Tells the copilot which plant the open page belongs to (e.g. the HIRA entry
 * page), so the panel can show what the calibrated review covers there.
 * Renders nothing; clears the plant when the page unmounts.
 */
export function CopilotPagePlant({ plantId }: { plantId: string | null }) {
  const { setPagePlantId } = useCopilot();
  useEffect(() => {
    setPagePlantId(plantId);
    return () => setPagePlantId(null);
  }, [setPagePlantId, plantId]);
  return null;
}
