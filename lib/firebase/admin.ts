import firebase from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

// Don't re-initialize
if (!firebase.apps.length) {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
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
  } else {
    firebase.initializeApp({
      projectId: "demo-project",
    });
  }
}

// get Firestore and Auth and allow other files to use this
const adminDb: Firestore = getFirestore();
const adminAuth: Auth = getAuth();

export { adminDb, adminAuth };
