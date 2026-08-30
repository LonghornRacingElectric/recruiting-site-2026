// Shared helpers for the sandbox scripts. Two worlds, never mixed in one process:
//   prodApp()     — production, READ ONLY, refuses to run if an emulator var is set
//   emulatorApp() — the local emulator, no credentials, refuses to run without both emulator vars
import { readFileSync, existsSync, mkdirSync, writeFileSync as io_writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const require = createRequire(path.join(ROOT, "package.json"));
const firebase = require("firebase-admin");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

export const EMULATOR_PROJECT_ID = "demo-lhr-recruiting";
export const EMULATOR_VARS = ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"];
export const SANDBOX_DIR = process.env.SANDBOX_DIR || path.join(os.tmpdir(), "lhr-sandbox");
export const SNAPSHOT_FILE = path.join(SANDBOX_DIR, "snapshot.json");
export const BASE = process.env.SANDBOX_BASE || "http://localhost:3000";
const IDP = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake";

export const SANDBOX_MARKER = ".lhr-sandbox-dir";
export function ensureSandboxDir() {
  if (!existsSync(SANDBOX_DIR)) mkdirSync(SANDBOX_DIR, { recursive: true });
  // marker consumed by import.mjs --purge: it refuses to delete a directory
  // this tooling didn't create/claim (SANDBOX_DIR is caller-controlled)
  const marker = path.join(SANDBOX_DIR, SANDBOX_MARKER);
  if (!existsSync(marker)) io_writeFileSync(marker, "created by scripts/qa/sandbox — import.mjs --purge deletes this directory's contents\n");
  return SANDBOX_DIR;
}

export function refuseEmulator(what) {
  for (const v of EMULATOR_VARS) if (process.env[v]) { console.error(`${what}: refusing — ${v} is set. This script reads production and must not run in an emulator shell.`); process.exit(1); }
}
export function requireEmulator(what) {
  for (const v of EMULATOR_VARS) if (!process.env[v]) { console.error(`${what}: refusing — ${v} is not set. This script only ever talks to the local emulator.`); process.exit(1); }
}

/** Production, read-only by construction of the callers: only .get()/.count() are ever used on this handle. */
export function prodApp(what) {
  refuseEmulator(what);
  // dotenv, not a hand-rolled parser: FIREBASE_PRIVATE_KEY may be a quoted
  // multi-line PEM, which line-oriented parsing truncates to its first line.
  const env = require("dotenv").parse(readFileSync(path.join(ROOT, ".env")));
  const privateKey = (env.FIREBASE_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !privateKey) { console.error(`${what}: FIREBASE_* credentials missing from .env`); process.exit(1); }
  firebase.initializeApp({ credential: firebase.credential.cert({ clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey, projectId: env.FIREBASE_PROJECT_ID }) });
  return { db: getFirestore(), projectId: env.FIREBASE_PROJECT_ID };
}

/** The emulator: no credentials at all, demo project id — cannot reach a real project. */
export function emulatorApp(what) {
  requireEmulator(what);
  firebase.initializeApp({ projectId: EMULATOR_PROJECT_ID });
  return { db: getFirestore(), auth: firebase.auth() };
}

// ---- snapshot (de)serialisation: Timestamps <-> {"$ts": millis, "$ns": nanos} ----
export function serialize(v) {
  if (v === null || v === undefined) return v;
  // A backup that silently mangles is the wrong failure mode: field types this
  // schema doesn't use (Bytes/Buffer) throw instead of round-tripping as junk.
  if (Buffer.isBuffer(v)) throw new Error("serialize: Bytes/Buffer field encountered — extend serialize/deserialize before backing this up");
  if (v instanceof Timestamp) return { $ts: v.seconds, $ns: v.nanoseconds };
  if (v instanceof Date) return { $ts: Math.floor(v.getTime() / 1000), $ns: (v.getTime() % 1000) * 1e6 };
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === "object") {
    if (typeof v.toDate === "function" && "seconds" in v) return { $ts: v.seconds, $ns: v.nanoseconds };
    if (v.constructor && v.constructor.name === "DocumentReference") return { $ref: v.path };
    const out = {}; for (const [k, x] of Object.entries(v)) out[k] = serialize(x); return out;
  }
  return v;
}
export function deserialize(v, db) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map((x) => deserialize(x, db));
  if (typeof v === "object") {
    if ("$ts" in v && Object.keys(v).length <= 2) return new Timestamp(v.$ts, v.$ns || 0);
    if ("$ref" in v && Object.keys(v).length === 1) return db.doc(v.$ref);
    const out = {}; for (const [k, x] of Object.entries(v)) out[k] = deserialize(x, db); return out;
  }
  return v;
}

// ---- signing in to the sandbox as a real account (emulator Auth, fake IdP) ----
export async function session(email) {
  const r1 = await fetch(IDP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postBody: "id_token=" + encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true, name: email })) + "&providerId=google.com", requestUri: BASE, returnSecureToken: true }) });
  const j1 = await r1.json(); if (!j1.idToken) throw new Error(`emulator sign-in failed for ${email}: ${JSON.stringify(j1).slice(0, 200)}`);
  const r2 = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: j1.idToken }) });
  if (r2.status !== 200) throw new Error(`session ${email} -> ${r2.status}`);
  return r2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
export async function api(cookie, method, path, body, extraHeaders = {}) {
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie, ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  const ms = Date.now() - t0;
  const ct = r.headers.get("content-type") || "";
  let json = null, text = null;
  if (ct.includes("application/json")) { try { json = await r.json(); } catch {} } else { text = await r.text(); }
  return { status: r.status, json, text, ms };
}
export const STEPS = ["pre_open", "open", "reviewing", "release_interviews", "interviewing", "close_interviews", "release_trial", "trial_workday", "release_decisions_day1", "release_decisions_day2", "release_decisions_day3"];
