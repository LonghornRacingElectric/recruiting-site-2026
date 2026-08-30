// Advance the sandbox's recruiting step the way the admin does on the day:
// through the real route, one step at a time (so every one-shot sweep fires),
// signed in as a real admin account via the emulator's fake IdP.
//   FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... node scripts/qa/sandbox/drive.mjs release_interviews [--as tea@utexas.edu]
import { emulatorApp, session, api, STEPS } from "./common.mjs";

const { db } = emulatorApp("drive");
const target = process.argv[2];
if (!STEPS.includes(target)) { console.error(`usage: drive.mjs <${STEPS.join("|")}> [--as email]`); process.exit(1); }
const asIdx = process.argv.indexOf("--as");
let email = asIdx > 0 ? process.argv[asIdx + 1] : null;
if (!email) {
  const admins = await db.collection("users").where("role", "==", "admin").get();
  email = admins.docs.map((d) => d.data().email).find(Boolean);
  if (!email) { console.error("no admin account in the sandbox"); process.exit(1); }
}
const cookie = await session(email);
console.log(`acting as ${email}`);

const before = (await db.doc("config/recruiting").get()).data()?.currentStep;
const from = STEPS.indexOf(before), to = STEPS.indexOf(target);
console.log(`current step: ${before} -> target: ${target}`);
if (to < from) { console.error("target is behind the current step; the sandbox never goes backwards (re-import to reset)"); process.exit(1); }
for (let i = from + 1; i <= to; i++) {
  const step = STEPS[i];
  const t0 = Date.now();
  const r = await api(cookie, "POST", "/api/admin/config/recruiting", { step, confirm: step });
  const ms = Date.now() - t0;
  const now = (await db.doc("config/recruiting").get()).data()?.currentStep;
  console.log(`${r.status === 200 ? "OK  " : "FAIL"} -> ${step.padEnd(24)} HTTP ${r.status} in ${ms}ms${r.json?.sweepError ? "  SWEEP ERROR: " + r.json.sweepError : ""}${r.json?.error ? "  " + r.json.error : ""}  (stored: ${now})`);
  if (r.status !== 200 || now !== step) process.exit(1);
}
console.log("done");
