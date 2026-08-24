// Browser-side Supabase client — safe to use in Client Components.
// Uses the public anon key, which relies on the Row Level Security
// policies in supabase/schema.sql to keep data access scoped correctly.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
