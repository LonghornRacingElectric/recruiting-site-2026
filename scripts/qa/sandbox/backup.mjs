// Exact, read-only backup of production: every top-level collection is
// DISCOVERED (listCollections, not a hardcoded list), every application's
// subcollections are walked the same way, and Firebase Auth accounts are
// exported alongside. Output is a timestamped gzip in ~/Downloads/lhr-backups
// (never overwritten), in the same shape import.mjs loads — so any backup can
// be inspected in the emulator: copy it over snapshot.json (gunzip first).
//
//   node scripts/qa/sandbox/backup.mjs [--out <dir>]
//
// Restoring to PRODUCTION is deliberately not scripted: that is a manual,
// case-by-case operation that should never be one command away.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import os from "node:os";
import { prodApp, serialize } from "./common.mjs";

const { db, projectId } = prodApp("backup");
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : path.join(os.homedir(), "Downloads", "lhr-backups");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = { projectId, exportedAt: new Date().toISOString(), kind: "full-backup", collections: {}, subcollections: {}, authUsers: [] };

// 1. every top-level collection, discovered — a collection added since this
// script was written is still captured
const topLevel = await db.listCollections();
console.log(`top-level collections: ${topLevel.map((c) => c.id).join(", ")}`);
let totalDocs = 0;
for (const col of topLevel) {
  const snap = await col.get();
  backup.collections[col.id] = snap.docs.map((d) => ({ id: d.id, data: serialize(d.data()) }));
  totalDocs += snap.size;
  console.log(`  ${col.id.padEnd(20)} ${String(snap.size).padStart(6)} docs`);
}

// 2. subcollections under every application document, discovered per document
// (only `applications` carries subcollections in this schema; walking all
// 2,000+ docs costs ~a minute and guarantees nothing is missed)
const appDocs = backup.collections.applications || [];
const found = {};
let walked = 0;
async function walkOne(id) {
  const subs = await db.doc(`applications/${id}`).listCollections();
  for (const sub of subs) {
    const snap = await sub.get();
    for (const d of snap.docs) (found[sub.id] ||= []).push({ path: d.ref.path, data: serialize(d.data()) });
  }
}
for (let i = 0; i < appDocs.length; i += 100) {
  await Promise.all(appDocs.slice(i, i + 100).map((d) => walkOne(d.id)));
  walked += Math.min(100, appDocs.length - i);
  if (walked % 1000 === 0 || walked === appDocs.length) console.log(`  walked ${walked}/${appDocs.length} application docs for subcollections`);
}
backup.subcollections = found;
for (const [name, docs] of Object.entries(found)) { totalDocs += docs.length; console.log(`  applications/*/${name.padEnd(8)} ${String(docs.length).padStart(6)} docs`); }

// 3. Firebase Auth accounts (not in Firestore): uid, email, providers, claims
const { require: req } = await import("./common.mjs");
const firebase = req("firebase-admin");
let pageToken;
do {
  const page = await firebase.auth().listUsers(1000, pageToken);
  for (const u of page.users) backup.authUsers.push({ uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, disabled: u.disabled, customClaims: u.customClaims, providerData: u.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid, email: p.email, displayName: p.displayName })), created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime });
  pageToken = page.pageToken;
} while (pageToken);
console.log(`  auth accounts        ${String(backup.authUsers.length).padStart(6)}`);

const json = JSON.stringify(backup);
const gz = gzipSync(Buffer.from(json));
const file = path.join(outDir, `lhr-backup-${stamp}.json.gz`);
writeFileSync(file, gz);
console.log(`\n${totalDocs} documents + ${backup.authUsers.length} auth accounts in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`wrote ${file} (${(gz.length / 1e6).toFixed(1)} MB gzipped, ${(json.length / 1e6).toFixed(1)} MB raw) — holds applicant PII`);
