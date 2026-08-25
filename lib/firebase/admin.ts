import firebase from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { EMULATOR_PROJECT_ID } from "./emulator";

// Don't re-initialize
if (!firebase.apps.length) {
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (firestoreEmulator || authEmulator) {
    // Local emulator suite: the SDK picks the emulators up from these two
    // variables and needs no credentials. They must be set together — with
    // only one set, the other service silently talks to production.
    if (!firestoreEmulator || !authEmulator) {
      throw new Error(
        "Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST together (or neither); with one missing, the other service would hit production"
      );
    }
    // A stray emulator variable in a deployment must fail loudly rather than
    // point production at 127.0.0.1.
    if (process.env.VERCEL) {
      throw new Error("Firebase emulator variables are set in a Vercel environment — remove them");
    }
    console.warn(`Firebase admin using emulators (firestore ${firestoreEmulator}, auth ${authEmulator})`);
    firebase.initializeApp({ projectId: EMULATOR_PROJECT_ID });
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
