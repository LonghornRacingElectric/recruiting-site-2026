/**
 * Seed the local emulator with just enough to click through the app:
 * one admin, one applicant, and an open recruiting cycle. Every other config
 * doc has a hardcoded default in lib/firebase/config.ts, so leaving them empty
 * is the same as seeding them.
 *
 * Usage:  npm run seed        (emulators must already be running)
 */
import * as dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must both be set. " +
      "This script only seeds the emulator, and with either one missing that service would be production."
  );
  process.exit(1);
}

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "lhr-recruiting-2026" });
const db = admin.firestore();
const auth = admin.auth();

// Passwords are for the emulator's built-in login form only — the app itself
// uses the Google popup, where the emulator lets you invent an account.
const USERS = [
  { uid: "seed-admin", email: "admin@utexas.edu", name: "Seed Admin", role: "admin" },
  { uid: "seed-applicant", email: "applicant@utexas.edu", name: "Seed Applicant", role: "applicant" },
];

for (const u of USERS) {
  await auth.importUsers([{
    uid: u.uid,
    email: u.email,
    emailVerified: true,
    displayName: u.name,
    providerData: [{ uid: u.email, email: u.email, displayName: u.name, providerId: "google.com" }],
  }]);
  await db.doc(`users/${u.uid}`).set({
    uid: u.uid,
    email: u.email,
    name: u.name,
    role: u.role,
    blacklisted: false,
    applications: [],
    phoneNumber: null,
    isMember: false,
  }, { merge: true });
  console.log(`user  ${u.email.padEnd(24)} ${u.role}`);
}

await db.doc("config/recruiting").set({
  currentStep: "open",
  renegEnabled: true,
  updatedAt: new Date(),
  updatedBy: "seed",
}, { merge: true });
console.log("config/recruiting -> open");

console.log("\nDone. Sign in at /auth/login with the Google popup and pick one of the seeded emails.");
process.exit(0);
