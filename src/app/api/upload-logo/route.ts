import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Uploads run through this server route instead of straight from the
// browser to Supabase Storage -- Storage's row-level security wasn't
// cooperating for reasons we couldn't pin down, so instead this route does
// its own plain-code ownership check (is this really your team?) and then
// writes the file using the service role key, which bypasses Storage RLS
// entirely. The service role key never reaches the browser -- it only ever
// lives here, on the server.
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const formData = await request.formData();
  const teamId = formData.get("teamId");
  const file = formData.get("file");
  if (typeof teamId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing teamId or file." }, { status: 400 });
  }

  // The one check that matters: is this really your team? Same rule the
  // storage policy was meant to enforce, just done here in plain code.
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) {
    return NextResponse.json({ error: "Not your team." }, { status: 403 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const path = `${teamId}/logo`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await serviceClient.storage
    .from("team-logos")
    .upload(path, bytes, { upsert: true, contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from("team-logos").getPublicUrl(path);

  return NextResponse.json({ url: `${publicUrl}?v=${Date.now()}` });
}
