import { NextResponse } from "next/server";

export async function POST() {
  // Options for the cookie must match the options used when setting it
  const options = {
    name: "session",
    value: "",
    maxAge: -1,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  // Clear session cookie to log out user
  const response = NextResponse.json({ status: "success" }, { status: 200 });
  response.cookies.set(options);

  return response;
}
