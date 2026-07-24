import { type NextRequest } from "next/server";
// Relative, not the "@/" alias: the Vercel build emits this entrypoint without
// resolving tsconfig paths, which breaks the Edge Function bundle.
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
