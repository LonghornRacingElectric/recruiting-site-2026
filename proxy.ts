import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routes } from "@/lib/routes";

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  const isLoginPage = request.nextUrl.pathname === routes.login;

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/apply");

  if (!sessionCookie && isProtectedRoute) {
    const loginUrl = new URL(routes.login, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Already-logged-in users hitting the login page get sent to their dashboard.
  // Note: we do NOT redirect from "/" anymore — the home page is publicly
  // navigable for everyone, including authenticated users.
  if (sessionCookie && isLoginPage) {
    const userRole = request.cookies.get("user_role")?.value;
    const staffRoles = ["admin", "team_captain_ob", "system_lead", "reviewer"];
    const targetPath = staffRoles.includes(userRole || "") ? "/admin/dashboard" : "/dashboard";
    const dashboardUrl = new URL(targetPath, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Strict check for admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const userRole = request.cookies.get("user_role")?.value;
    const allowedRoles = ["admin", "team_captain_ob", "system_lead", "reviewer"];
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      // Redirect unauthorized users to their dashboard
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  console.log("Middleware pass:", request.nextUrl.pathname, "Session:", !!sessionCookie);
  return NextResponse.next();
}

// protected routes AND routes we want to redirect FROM if logged in
export const config = {
  matcher: ["/dashboard/:path*", "/profile", "/", "/auth/login", "/apply/:path*", "/admin/:path*"],
};
