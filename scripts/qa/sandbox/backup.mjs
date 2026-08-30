// Read-only backup of production Firestore + Auth. Every top-level
// collection is DISCOVERED (listCollections, not a hardcoded list), and every
// document in every collection is walked for subcollections via
// listDocuments — which also catches phantom parents (deleted doc, surviving
// subcollections). Firebase Auth accounts ride along (inspection/manual-
// restore data; the emulator import rebuilds Auth from the users collection,
// and a few Google-irrelevant Auth fields are dropped).
//
// WHAT THIS DOES NOT BACK UP: Cloud Storage objects. Resumes and portfolios
// live in the lhr-recruiting-2026.firebasestorage.app bucket; Firestore holds
// only their URLs. This script records a MANIFEST of every stored object
// (path, size, md5) but NOT the bytes — scripts/wipe-cycle-data.mjs deletes
// those objects and they are unrecoverable from this backup alone. Download
// the bucket separately before any Storage-destructive operation.
//
// Output is a timestamped gzip in ~/Downloads/lhr-backups (never
// overwritten; NOT covered by import.mjs --purge — prune old backups by
// hand), written atomically (.part then rename) and verified readable before
// success is reported. Same shape import.mjs loads, so any backup can be
// inspected in the emulator: gunzip it over snapshot.json.
//
//   node scripts/qa/sandbox/backup.mjs [--out <dir>]
//
// Restoring to PRODUCTION is deliberately not scripted: that is a manual,
// case-by-case operation that should never be one command away.
import { writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import os from "node:os";
import { prodApp, serialize, require as req } from "./common.mjs";

const { db, projectId } = prodApp("backup");
const outIdx = process.argv.indexOf("--out");
if (outIdx > 0 && !process.argv[outIdx + 1]) { console.error("usage: node backup.mjs [--out <dir>]"); process.exit(1); }
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : path.join(os.homedir(), "Downloads", "lhr-backups");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = { projectId, exportedAt: new Date().toISOString(), kind: "full-backup", collections: {}, subcollections: {}, authUsers: [], storageManifest: [] };

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

// 2. subcollections under EVERY document of EVERY top-level collection,
// via listDocuments so phantom parents (deleted doc, surviving
// subcollections) are walked too. Costs roughly a minute over ~9k docs and
// guarantees a subcollection added anywhere later is still captured.
const found = {};
async function walkOne(ref, colId) {
  const subs = await ref.listCollections();
  for (const sub of subs) {
    const snap = await sub.get();
    for (const d of snap.docs) (found[colId + "/" + sub.id] ||= []).push({ path: d.ref.path, data: serialize(d.data()) });
  }
}
for (const col of topLevel) {
  const refs = await col.listDocuments();
  let walked = 0;
  for (let i = 0; i < refs.length; i += 100) {
    await Promise.all(refs.slice(i, i + 100).map((r) => walkOne(r, col.id)));
    walked += Math.min(100, refs.length - i);
    if (walked % 2000 === 0) console.log(`  walked ${walked}/${refs.length} ${col.id} docs for subcollections`);
  }
}
backup.subcollections = Object.fromEntries(Object.entries(found).map(([k, v]) => [k.split("/")[1], v]));
for (const [name, docs] of Object.entries(found)) { totalDocs += docs.length; console.log(`  ${name.padEnd(24)} ${String(docs.length).padStart(6)} docs`); }

// 3. Firebase Auth accounts (not in Firestore): uid, email, providers, claims
const firebase = req("firebase-admin");
let pageToken;
do {
  const page = await firebase.auth().listUsers(1000, pageToken);
  for (const u of page.users) backup.authUsers.push({ uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, disabled: u.disabled, customClaims: u.customClaims, providerData: u.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid, email: p.email, displayName: p.displayName })), created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime });
  pageToken = page.pageToken;
} while (pageToken);
console.log(`  auth accounts        ${String(backup.authUsers.length).padStart(6)}`);

// 4. Cloud Storage MANIFEST (paths/sizes/hashes — NOT the bytes; see header)
try {
  const [files] = await firebase.storage().bucket("lhr-recruiting-2026.firebasestorage.app").getFiles();
  backup.storageManifest = files.map((f) => ({ name: f.name, size: Number(f.metadata.size || 0), md5: f.metadata.md5Hash, contentType: f.metadata.contentType, updated: f.metadata.updated }));
  const bytes = backup.storageManifest.reduce((a, b) => a + b.size, 0);
  console.log(`  storage objects      ${String(backup.storageManifest.length).padStart(6)} (${(bytes / 1e6).toFixed(1)} MB in the bucket — NOT downloaded by this backup)`);
} catch (e) {
  console.warn(`  storage manifest FAILED (${e.message}) — continuing without it`);
}

const json = JSON.stringify(backup);
const gz = gzipSync(Buffer.from(json));
const file = path.join(outDir, `lhr-backup-${stamp}.json.gz`);
// atomic: a Ctrl-C / full disk mid-write must not leave a plausible-looking
// truncated backup — write .part, verify it gunzips, then rename into place
writeFileSync(file + ".part", gz);
gunzipSync(gzipSync(Buffer.from("verify"))); // sanity that zlib itself is alive
JSON.parse(gunzipSync(require_fs_read(file + ".part")).toString());
renameSync(file + ".part", file);
console.log(`\n${totalDocs} documents + ${backup.authUsers.length} auth accounts + ${backup.storageManifest.length} storage-object manifest entries in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`wrote ${file} (${(gz.length / 1e6).toFixed(1)} MB gzipped, ${(json.length / 1e6).toFixed(1)} MB raw) — holds applicant PII; Storage objects NOT included (manifest only)`);

function require_fs_read(p2) { return req("node:fs").readFileSync(p2); }
