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
- Email: the SES keys exist only on Vercel; no local env file carries them, so
  the dev server cannot sign an SES request. The cloned `email_templates`
  document additionally has `globalEnabled=false`, and the report refuses to
  continue unless the email dry run reports `globally_disabled` for every
  recipient.
- `fingerprint.mjs` (read-only) records production's audit-log count and the
  latest `updatedAt` per collection; run it before and after a sandbox session
  and diff — identical output proves nothing changed.
- The snapshot file holds applicant PII. It is written to the scratchpad
  directory, never to the repo, and `import.mjs --purge` deletes it.

## Run

Snapshot and reports go to `%LOCALAPPDATA%/Temp/lhr-sandbox` (override with `SANDBOX_DIR`). The report is `.mts` because `tsx` compiles `.ts` as CommonJS in this repo and the script uses top-level await.

```
# 0. prove production is untouched, before
node scripts/qa/sandbox/fingerprint.mjs > before.json

# 1. production -> snapshot (read-only; emulator vars must be UNSET)
node scripts/qa/sandbox/export.mjs

# 2. emulator up (separate terminal), then snapshot -> emulator (emulator vars SET)
npx -y firebase-tools@13 emulators:start --project demo-lhr-recruiting
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/sandbox/import.mjs

# 3. hardened dev server (emulator vars, PostHog off, stats token)
node scripts/qa/sandbox/serve.mjs

# 4. advance the step as the admin would, then report
FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... node scripts/qa/sandbox/drive.mjs release_interviews
FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... npx -y tsx scripts/qa/sandbox/report.mts

# 5. prove production is untouched, after
node scripts/qa/sandbox/fingerprint.mjs > after.json && diff before.json after.json
```
