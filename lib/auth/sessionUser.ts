import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { getUser } from "@/lib/firebase/users";
import { User } from "@/lib/models/User";

/**
 * The signed-in user for the current request, or null. Memoised per request
 * with React's cache (#72): the Header and the Footer are both async server
 * components in the root layout, and each used to do its own
 * revocation-checked session verify plus a user read on every page.
 * Verification failures are treated as anonymous — the guards on the pages
 * themselves are the security boundary, not this.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return null;
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return (await getUser(decoded.uid)) ?? null;
  } catch {
    return null;
  }
});
