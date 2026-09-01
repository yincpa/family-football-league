import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "Home" depends on whether you're signed in: signed-in users land on
// their Account tab (team name, etc.) -- the same place login/signup
// already send you -- while a signed-out visitor lands on Standings, the
// one page open to everyone. Keeps the site title / "/" behaving the same
// way regardless of login state, instead of a fixed destination.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/account" : "/standings");
}
