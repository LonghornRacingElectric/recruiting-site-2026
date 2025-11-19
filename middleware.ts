import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routes } from "@/lib/routes";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  const isLoginPage = request.nextUrl.pathname === routes.login;
  const isHomePage = request.nextUrl.pathname === "/";

  // If no session cookie and the user is trying to access a protected page, redirect to login
  // We only need to check this for protected routes, but since we expanded the matcher, we need to be careful.
  // The matcher includes dashboard, profile, home, and login.
  // We should explicitly check if it's a protected route.
  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/profile");

  if (!sessionCookie && isProtectedRoute) {
    const loginUrl = new URL(routes.login, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If session cookie exists and user is on login or home page, redirect to dashboard
  if (sessionCookie && (isLoginPage || isHomePage)) {
    console.log("Redirecting to dashboard from", request.nextUrl.pathname);
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  console.log("Middleware pass:", request.nextUrl.pathname, "Session:", !!sessionCookie);
  return NextResponse.next();
}

// protected routes AND routes we want to redirect FROM if logged in
export const config = {
  matcher: ["/dashboard/:path*", "/profile", "/", "/auth/login"],
};
