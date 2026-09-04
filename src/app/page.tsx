import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "Home" depends on whether you're signed in: signed-in users land on
// their Account tab (team name, etc.) -- the same place login/signup
// already send you. A signed-out visitor sees a welcome/landing page
// instead of being dropped straight into Standings (which is meaningless
// before you've even joined) -- just the league crest, a welcome
// message, and Sign up / Sign in buttons. Standings is still one click
// away via the nav bar (or the small link below) for anyone who just
// wants to peek first.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/account");
  }

  return (
    <main className="mx-auto max-w-sm p-6 flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG in /public */}
      <img
        src="/league-logo.svg"
        alt="Yin Family Fantasy Football GM League"
        width={160}
        height={160}
        className="mb-6"
      />
      <h1 className="text-3xl font-semibold mb-2">Welcome!</h1>
      <p className="text-neutral-600 mb-8">
        Join the Yin Family Fantasy Football GM League — no draft, pick a fresh lineup from
        every available player each week, and see who&apos;s the best GM in the family.
      </p>
      <div className="flex flex-col gap-3 w-full">
        <Link
          href="/signup"
          className="bg-neutral-900 text-white rounded-md py-2 text-center font-medium"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="border border-neutral-300 rounded-md py-2 text-center font-medium"
        >
          Sign in
        </Link>
      </div>
      <Link
        href="/standings"
        className="text-sm text-neutral-400 underline underline-offset-4 mt-6"
      >
        Just want to peek at Standings first?
      </Link>
    </main>
  );
}
