import firebase from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

// Don't re-initialize
if (!firebase.apps.length) {
  // Initialize Firebase admin (with service account key)
  firebase.initializeApp({
    credential: firebase.credential.cert({
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
      projectId: process.env.FIREBASE_PROJECT_ID,
    }),
    // databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

// get Firestore and Auth and allow other files to use this
const adminDb: Firestore = getFirestore();
const adminAuth: Auth = getAuth();

export { adminDb, adminAuth };
