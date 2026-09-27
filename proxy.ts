import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export function proxy(request: NextRequest) {
  // Server Action calls check the session themselves (getCurrentUser redirects to /login in a way the client
  // router understands); a proxy redirect here would reach the client as an unexpected HTML response instead.
  if (request.method === "POST" && request.headers.has("next-action")) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
