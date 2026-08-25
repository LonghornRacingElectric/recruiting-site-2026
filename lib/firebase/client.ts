"use client";

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { EMULATOR_PROJECT_ID } from "./emulator";

const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";

export const firebaseConfig = {
  apiKey: "AIzaSyCrOMNWkTf4zhW4Prmma-UT0ebYGGnrcdM",
  authDomain: "lhr-recruiting-2026.firebaseapp.com",
  // Auth tokens carry the project id and the server verifies it, so the
  // browser must use the emulator project when the server does.
  projectId: useEmulator ? EMULATOR_PROJECT_ID : "lhr-recruiting-2026",
  storageBucket: "lhr-recruiting-2026.firebasestorage.app",
  messagingSenderId: "790227400201",
  appId: "1:790227400201:web:0aa808fee357ea6a27ead8",
  measurementId: "G-9Y3MFL8L76",
};

export const firebaseClientApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseClientApp);
export const db = getFirestore(firebaseClientApp);
export const storage = getStorage(firebaseClientApp);

// Local emulator suite. Set NEXT_PUBLIC_FIREBASE_EMULATOR=1 in .env alongside
// the server-side FIRESTORE_EMULATOR_HOST — both halves must point at the
// emulator or the Google sign-in popup mints a token the server can't verify.
if (useEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
