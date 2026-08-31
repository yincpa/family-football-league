import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, team_name, league_id")
    .eq("owner_user_id", user.id);

  const myTeam = teams?.[0] ?? null;

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-1">My Account</h1>
      <p className="text-sm text-neutral-500 mb-6">{user.email}</p>

      {myTeam ? (
        <div className="border border-neutral-200 rounded-md p-4 mb-6">
          <p className="text-sm text-neutral-500 mb-1">Your team</p>
          <p className="text-lg font-medium">{myTeam.team_name}</p>
          <div className="flex gap-4 mt-3">
            {/* TEMP: hardcoded to season 2026 week 1 (the live season). */}
            <a href="/roster?season=2026&week=1" className="text-sm underline underline-offset-4">
              View my lineup
            </a>
            <a href="/players?season=2026&week=1" className="text-sm underline underline-offset-4">
              Available players
            </a>
          </div>
        </div>
      ) : (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-4 mb-6 text-sm text-amber-800">
          <p className="mb-2">
            No team is assigned to your account yet. Send the commissioner this ID and ask them to
            set it as a team&apos;s <code>owner_user_id</code> in Supabase:
          </p>
          <code className="block bg-white border border-amber-200 rounded px-2 py-1 text-xs break-all">
            {user.id}
          </code>
        </div>
      )}

      <form action="/logout" method="post">
        <button
          type="submit"
          className="text-sm border border-neutral-300 rounded-md px-4 py-2 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
