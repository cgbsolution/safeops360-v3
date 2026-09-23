import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { invalidateUserPermissions } from "./auth/permissions";
import { backendFetch } from "./backend-fetch";
import { backendBaseUrl, backendCandidates } from "./backend-hosts";
import { prisma } from "./prisma";

// Python-only auth. NextAuth is now just the Next.js session manager;
// every login is verified by POSTing to Python's /api/auth/login. There
// is no Prisma fallback — if Python is unreachable, login simply fails.
// This is the contract: the frontend never touches the database, even
// for credentials.
// Host selection lives in lib/backend-hosts.ts, shared with the
// /api/[...path] proxy so login and every other API call resolve the same
// host. It reads `BACKEND_URL` and nothing else — no hardcoded fallback, no
// rewriting. If login is hitting the wrong server, the env var is wrong.
const BACKEND_URL = backendBaseUrl();

if (!BACKEND_URL) {
  // Fail loudly at module import time in dev so a misconfigured env is
  // obvious rather than producing mysterious 401s for every user.
  console.error("[auth] BACKEND_URL is unset. Login will return null for every request.");
}

async function authorizeViaBackend(email: string, password: string) {
  // Server-side log lines visible in `npm run dev` terminal — without this,
  // NextAuth's authorize() swallows the failure and the browser only sees a
  // generic 401. With it, you can tell whether Python is unreachable, the
  // user doesn't exist, or the password is wrong.
  const bases = backendCandidates();
  if (!bases.length) {
    // No host configured — every login would otherwise POST to the literal
    // string "undefined". Fail with the same code an unreachable backend
    // produces, so the login page shows a server fault rather than blaming
    // the user's password.
    console.error("[auth] BACKEND_URL is unset — cannot verify credentials.");
    throw new Error("BACKEND_UNREACHABLE");
  }
  console.log(`[auth] -> ${bases[0]}/api/auth/login  (email=${email.toLowerCase()})`);
  // ── Why this is retried ────────────────────────────────────────────────
  // Measured against production on 2026-08-06: 2 of 8 logins failed, and the
  // failures were always a *cold* connection — ~10.6s of nothing, i.e. the TCP
  // connect never completed. Every attempt that got a connection answered in
  // ~0.3s. Vercel functions dial out from many rotating egress IPs, and the
  // backend host drops the first SYN from an IP it hasn't seen; the retry
  // lands on a path that is now open.
  //
  // Retrying is safe here specifically because a connect-phase failure means
  // the request never reached the server, so nothing can be applied twice.
  // Login is idempotent anyway — it mints a token, it doesn't mutate state.
  // Do NOT generalise this retry to backendFetch: the mutating POSTs that go
  // through it are not safe to replay once the bytes are on the wire.
  //
  // ── Time budget ────────────────────────────────────────────────────────
  // Every attempt is bounded by a single DEADLINE rather than a fixed
  // per-base script. This matters because the candidate list is no longer a
  // fixed length — backend-hosts.ts supplies the canonical host plus every
  // spare router, and that list can grow. With a hard-coded schedule, adding
  // one spare silently pushed the worst case past the 30s vercel.json
  // maxDuration, which kills the function and gives the user a dead spinner
  // instead of the "check your password" they needed to see.
  //
  // 26s leaves ~4s of headroom for NextAuth's own session work afterwards.
  const DEADLINE_MS = 26_000;
  const startedAt = Date.now();
  const remaining = () => DEADLINE_MS - (Date.now() - startedAt);

  let r: Response | null = null;
  let lastErr: any = null;
  let url = `${bases[0]}/api/auth/login`;

  outer: for (let b = 0; b < bases.length; b++) {
    url = `${bases[b]}/api/auth/login`;
    if (b > 0) {
      console.warn(
        `[auth] ⚠ ${bases[0]} is unreachable — falling back to ${bases[b]}. ` +
          `The primary router is being dropped upstream; fix the host firewall ` +
          `(see docs/ops/BACKEND_DOWNTIME.md).`
      );
    }
    // The last base gets a second attempt, but only if the clock allows it.
    const isLast = b === bases.length - 1;
    const budgetPerBase = Math.floor(remaining() / (bases.length - b));
    const tries = isLast && remaining() > 16_000 ? [8_000, remaining() - 9_000] : [budgetPerBase];
    for (let i = 0; i < tries.length; i++) {
      // Never start an attempt we cannot finish inside the deadline.
      if (remaining() < 2_000) break outer;
      const timeoutMs = Math.max(2_000, Math.min(tries[i], remaining() - 500));
      try {
        // Use backendFetch, not the global fetch: login is the one backend call
        // that used to bypass the shared helper, so it alone had no abort timeout
        // and no INSECURE_BACKEND_TLS escape hatch. On a hung backend the raw
        // fetch sat there until Vercel killed the function at maxDuration (30s),
        // which surfaces to the user as a dead spinner rather than an error.
        r = await backendFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.toLowerCase(), password }),
          cache: "no-store",
          timeoutMs
        });
        if (b > 0 || i > 0) console.log(`[auth] backend reachable at ${url}`);
        break outer;
      } catch (e: any) {
        lastErr = e;
        console.error(
          `[auth] backend fetch FAILED ${url} attempt ${i + 1}/${tries.length} ` +
            `(${e?.code ?? e?.name ?? ""}): ${e?.message ?? e}`
        );
      }
    }
  }

  if (r === null) {
    console.error(`[auth] is the Python backend running at ${BACKEND_URL}?`);
    console.error(`[auth] try: curl ${BACKEND_URL.replace(/\/$/, "")}/health`);
    console.error(`[auth] last error: ${lastErr?.message ?? lastErr}`);
    // Thrown error messages are propagated verbatim into signIn()'s res.error
    // (NextAuth v4 callback route encodes error.message into ?error=…). The
    // login page maps these codes to the right toast.
    throw new Error("BACKEND_UNREACHABLE");
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`[auth] backend ${url} returned ${r.status}: ${body.slice(0, 300)}`);
    // 404 = no such account, 401 = account exists but wrong password.
    if (r.status === 404) throw new Error("USER_NOT_FOUND");
    if (r.status === 401) throw new Error("INVALID_CREDENTIALS");
    // Anything 5xx is the SERVER failing, not the user's password. Reporting
    // it as "Invalid credentials" is actively misleading — it sends people to
    // re-type a correct password while the real fault is server-side. Give it
    // its own code so the toast tells the truth and the log tells us where to
    // look.
    if (r.status >= 500) throw new Error("BACKEND_ERROR");
    throw new Error("INVALID_CREDENTIALS");
  }
  const j = (await r.json()) as { access_token: string; user: any };
  console.log(`[auth] backend login OK for ${email.toLowerCase()} (id=${j.user.id})`);
  return {
    id: j.user.id,
    email: j.user.email,
    name: j.user.name,
    role: j.user.role,
    plantId: j.user.plantId ?? null,
    plantName: null,
    designation: j.user.designation ?? null,
    backendAccessToken: j.access_token
  } as any;
}

console.log(`[auth] BACKEND_URL=${BACKEND_URL || "(unset — login disabled)"}`);

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        if (!BACKEND_URL) {
          console.error("[auth] cannot authenticate: BACKEND_URL is unset");
          throw new Error("BACKEND_UNREACHABLE");
        }
        // Python is the only authentication path. If Python rejects the
        // credentials or is unreachable, login fails — there is no DB
        // fallback. The frontend has no direct database access.
        return authorizeViaBackend(credentials.email, credentials.password);
      }
    })
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.plantId = (user as any).plantId;
        token.designation = (user as any).designation;
        if ((user as any).backendAccessToken) {
          (token as any).backendAccessToken = (user as any).backendAccessToken;
        }
        // Resolve plant name from DB so the header shows the real plant
        // instead of "All Plants" for every user.
        if ((user as any).plantId) {
          try {
            const plant = await prisma.plant.findUnique({
              where: { id: (user as any).plantId },
              select: { name: true },
            });
            token.plantName = plant?.name ?? null;
          } catch {
            token.plantName = null;
          }
        } else {
          token.plantName = null;
        }
        invalidateUserPermissions((user as any).id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).plantId = token.plantId;
        (session.user as any).plantName = token.plantName;
        (session.user as any).designation = token.designation;
        if ((token as any).backendAccessToken) {
          (session.user as any).backendAccessToken = (token as any).backendAccessToken;
        }
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string; // Role.code from the Role master table
  plantId: string | null;
  plantName: string | null;
  designation: string | null;
};
