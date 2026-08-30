// Handles the redirect from a Supabase email-confirmation link: exchanges
// the one-time `code` for a real session, then sends the user on to their
// account page. Only reached if "Confirm email" is turned on in Supabase —
// with it off, signup logs the user in immediately and this route is unused.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
