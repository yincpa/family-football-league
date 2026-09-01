"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Read by the handle_new_user() database trigger, which copies
        // these into the profiles table so the commissioner can see who
        // signed up and what team name they want, before ever creating an
        // account/team assignment for them.
        data: {
          full_name: fullName.trim(),
          requested_team_name: teamName.trim(),
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // "Confirm email" is off in Supabase — the account is usable right away.
      router.push("/account");
      router.refresh();
      return;
    }
    // "Confirm email" is on — wait for the confirmation link to be clicked.
    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-2xl font-semibold mb-4">Check your email</h1>
        <p className="text-sm text-neutral-500">
          We sent a confirmation link to {email}. Click it, then come back and sign in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold mb-2">Create an account</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Your name and team name go straight to the commissioner, so they can set up your team for you.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border border-neutral-300 rounded-md px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Team name
          <input
            type="text"
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="What do you want your team to be called?"
            className="border border-neutral-300 rounded-md px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-neutral-300 rounded-md px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-neutral-300 rounded-md px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-neutral-900 text-white rounded-md py-2 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-neutral-500 mt-4">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
