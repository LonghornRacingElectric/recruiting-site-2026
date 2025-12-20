import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { updateUserData, userExists } from "@/lib/firebase/database";
import { User, UserRole } from "@/lib/models/User";
import { getUser } from "@/lib/firebase/users";
import { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import pino from "pino";

const logger = pino();

export async function POST(request: Request) {
  const { idToken } = await request.json();

  if (!idToken) {
    return NextResponse.json(
      { error: "ID token is required." },
      { status: 400 }
    );
  }

  // 5 day
  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    const options = {
      name: "session",
      value: sessionCookie,
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const decodedId: DecodedIdToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );

    const user: UserRecord = await adminAuth.getUser(decodedId.uid);

    // if (!user.email?.endsWith("@utexas.edu")) {
    //   const response = NextResponse.json(
    //     {
    //       status: "error",
    //       error:
    //         "You must use your UTMail @utexas.edu email address. https://get.utmail.utexas.edu/",
    //     },
    //     { status: 400 }
    //   );

    //   return response;
    // }

    const existingUser = await getUser(decodedId.uid);
    let role = UserRole.APPLICANT;

    if (existingUser) {
        role = existingUser.role;
    } else {
      logger.info("User didn't exist, creating new user");
      // user doesn't exist, create a new user document for them
      const newUser: User = {
        name: user.displayName || "NA",
        role: UserRole.APPLICANT,
        blacklisted: false,
        applications: [],
        uid: user.uid,
        phoneNumber: null,
        email: user.email || "NA",
        isMember: false,
      };

      // write the new user to firestore
      await updateUserData(newUser);
    }

    const response = NextResponse.json(
      {
        status: "success",
        role,
      },
      { status: 200 }
    );

    response.cookies.set(options);

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Unauthorized request." },
      { status: 401 }
    );
  }
}
