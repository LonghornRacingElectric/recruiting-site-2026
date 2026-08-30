// Start the dev server hardened for the sandbox. Everything that could reach
// the outside world is either pointed at the emulator or given credentials
// that cannot authenticate anywhere:
//   - Firestore/Auth/Storage: emulator hosts set -> lib/firebase/admin.ts
//     initialises with the demo project id and NO credentials
//   - SES: no keys exist locally; dummy values make that explicit
//   - PostHog: token blanked so no analytics/error events leave the machine
//   node scripts/qa/sandbox/serve.mjs
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { ROOT, EMULATOR_PROJECT_ID } from "./common.mjs";

const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  NEXT_PUBLIC_FIREBASE_EMULATOR: "1",
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "",
  NEXT_PUBLIC_POSTHOG_HOST: "",
  AWS_SES_ACCESS_KEY_ID: "SANDBOX-NO-SEND",
  AWS_SES_SECRET_ACCESS_KEY: "SANDBOX-NO-SEND",
  AWS_SES_REGION: "us-east-1",
  AWS_SES_FROM_EMAIL: "sandbox@invalid",
  STATS_API_TOKEN: process.env.STATS_API_TOKEN || "sandbox-stats-token",
  GOOGLE_CALENDAR_PRIVATE_KEY: "",
  GOOGLE_CALENDAR_CLIENT_SECRET: "",
};
for (const d of [".next/types", ".next/dev/types"]) { try { rmSync(path.join(ROOT, d), { recursive: true, force: true }); } catch {} }
// Refuse to start if :3000 is taken. Next would silently fall back to :3001,
// leaving whatever already holds :3000 (possibly a prod-credentialed `npm run
// dev` from another terminal) to receive the sandbox scripts' requests.
const net = await import("node:net");
await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once("error", () => { console.error("refusing: port 3000 is already in use — stop that server first (the sandbox scripts target localhost:3000 and must not drive an unknown one)"); process.exit(1); });
  probe.once("listening", () => probe.close(resolve));
  probe.listen(3000, "127.0.0.1");
});
console.log(`sandbox dev server: Firebase -> emulator (${EMULATOR_PROJECT_ID}, no credentials); SES -> dummy keys; PostHog -> off`);
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { cwd: ROOT, env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
