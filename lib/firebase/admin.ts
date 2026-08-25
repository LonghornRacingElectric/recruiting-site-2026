import firebase from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

// Don't re-initialize
if (!firebase.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Local emulator suite: the SDK picks the emulators up from
    // FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST and needs no
    // credentials. Never set these in a deployed environment.
    console.warn(`Firebase admin using emulators (${process.env.FIRESTORE_EMULATOR_HOST})`);
    firebase.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "lhr-recruiting-2026" });
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    firebase.initializeApp({
      credential: firebase.credential.cert({
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Accept the key in any of the forms it realistically gets pasted in:
        // real newlines (dashboard multiline paste), "\n" escapes (single-line
        // .env form — dotenv expands them, hosting dashboards don't), and/or
        // surrounding quotes carried over from a .env copy. Quoted values pass
        // firebase-admin's own PEM check but make OpenSSL fail at token-signing
        // time with "DECODER routines::unsupported".
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          .trim()
          .replace(/^["']|["']$/g, "")
          .replace(/\\n/g, "\n"),
        projectId: process.env.FIREBASE_PROJECT_ID,
      }),
    });
  } else if (process.env.NEXT_PHASE === "phase-production-build") {
    // Credential-less fallback so `next build` can evaluate modules in
    // environments without secrets (CI sandboxes). Build-time Firestore reads
    // fail against this app and callers fall back to their defaults.
    console.warn("Firebase admin credentials missing; using build-only stub project");
    firebase.initializeApp({
      projectId: "demo-project",
    });
  } else {
    // At runtime, missing credentials must fail loudly at startup — a silent
    // stub would surface only as confusing permission errors on every query.
    throw new Error(
      "Missing Firebase admin credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)"
    );
  }
}

// get Firestore and Auth and allow other files to use this
const adminDb: Firestore = getFirestore();
const adminAuth: Auth = getAuth();

export { adminDb, adminAuth };
