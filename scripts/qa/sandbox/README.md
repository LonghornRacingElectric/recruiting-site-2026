# Sandbox: run the live cycle forward on a copy of production

A copy of the production database is loaded into the local Firebase emulator,
the recruiting step is advanced exactly as the admin will do it, and a report
says what every applicant would see, which systems still owe decisions, what
the email run would send, and whether the staff surfaces hold up under real
volume. Production is only ever **read**.

## Safety model (mechanisms, not intentions)

- The only script that talks to production is `export.mjs`. It performs reads
  (`.get()`) only, and refuses to run if either emulator variable is set.
- Everything else runs with `FIRESTORE_EMULATOR_HOST` and
  `FIREBASE_AUTH_EMULATOR_HOST` set. In that mode `lib/firebase/admin.ts`
  initialises the Admin SDK with the emulator project id
  (`demo-lhr-recruiting`) and **no credentials** — the production certificate
  branch is never executed, and `demo-` project ids cannot reach a real Firebase
  project. The sandbox server process holds nothing that can write to production.
- Email: `serve.mjs` overrides the SES credentials with dummy values that
  cannot sign a request — that is the mechanism, and it covers every send
  path (status emails, lead notifications, test emails). On this machine the
  keys also happen to exist only on Vercel. The cloned `email_templates`
  document additionally has `globalEnabled=false`; note that switch only
  gates applicant status emails (`sendStatusEmail`), not lead notifications
  or test sends — those rely on the dummy credentials alone. The report
  aborts before touching the email route unless the kill switch is set.
- `fingerprint.mjs` (read-only) records production's audit-log count and the
  latest `updatedAt` per collection; run it before and after a sandbox session
  and diff — identical output proves nothing changed.
- PII lives in three places, all under the sandbox directory and never in the
  repo: the snapshot, the rendered emails (real names and addresses), and the
  reports. `import.mjs --purge` deletes the whole directory's contents.
  Write `before.json`/`after.json` there too, not into the repo.

## Run

Snapshot and reports go to `%LOCALAPPDATA%/Temp/lhr-sandbox` (override with `SANDBOX_DIR`). The report is `.mts` because `tsx` compiles `.ts` as CommonJS in this repo and the script uses top-level await.

```
# 0. prove production is untouched, before
node scripts/qa/sandbox/fingerprint.mjs > "$SANDBOX_DIR/before.json"

# 1. production -> snapshot (read-only; emulator vars must be UNSET)
node scripts/qa/sandbox/export.mjs

# 2. emulator up (separate terminal), then snapshot -> emulator (emulator vars SET)
npx -y firebase-tools@13 emulators:start --project demo-lhr-recruiting
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/sandbox/import.mjs

# 3. hardened dev server (emulator vars, PostHog off, stats token).
#    Token gotcha: serve.mjs and report.mts both default STATS_API_TOKEN to
#    "sandbox-stats-token" — set it the same in BOTH shells or in neither.
#    The scripts/qa suites hardcode "test-stats-token", so to run those against
#    this server, start it with STATS_API_TOKEN=test-stats-token.
node scripts/qa/sandbox/serve.mjs

# 4. advance the step as the admin would, then report
FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... node scripts/qa/sandbox/drive.mjs release_interviews
FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... npx -y tsx scripts/qa/sandbox/report.mts

# 4b. render the emails the step's run would send (nothing is sent) — open the index in a browser
FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... npx -y tsx scripts/qa/sandbox/render-emails.mts

# 5. prove production is untouched, after
node scripts/qa/sandbox/fingerprint.mjs > "$SANDBOX_DIR/after.json" && diff "$SANDBOX_DIR/before.json" "$SANDBOX_DIR/after.json"
```
