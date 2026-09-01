import { redirect } from "next/navigation";

// The old landing page here just duplicated links already in the nav bar
// (My Lineup, Players, Standings) — now that the nav bar covers all of
// that, "home" is just Standings, which is the one page open to everyone
// whether they're signed in or not.
export default function Home() {
  redirect("/standings");
}
