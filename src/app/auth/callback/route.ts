import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/auth/server";

// Handles email-confirmation / OAuth code exchange.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/projects"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
