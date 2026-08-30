// Imported FIRST by the .mts scripts: ESM evaluates this module's body before
// any app import (and transitively lib/firebase/admin.ts) is constructed, so a
// shell with production credentials but no emulator vars is refused before the
// Admin SDK ever initialises — not merely before it is used.
for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (!process.env[v]) {
    console.error(`refusing: ${v} is not set. This script only ever talks to the local emulator.`);
    process.exit(1);
  }
}
