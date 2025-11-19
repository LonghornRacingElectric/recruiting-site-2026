"use client";

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyCrOMNWkTf4zhW4Prmma-UT0ebYGGnrcdM",
  authDomain: "lhr-recruiting-2026.firebaseapp.com",
  projectId: "lhr-recruiting-2026",
  storageBucket: "lhr-recruiting-2026.firebasestorage.app",
  messagingSenderId: "790227400201",
  appId: "1:790227400201:web:0aa808fee357ea6a27ead8",
  measurementId: "G-9Y3MFL8L76",
};

export const firebaseClientApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseClientApp);
export const db = getFirestore(firebaseClientApp);
export const storage = getStorage(firebaseClientApp);
