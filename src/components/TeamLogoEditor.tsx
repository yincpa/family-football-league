"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { setMyTeamLogo, uploadTeamLogo } from "@/lib/queries";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB -- plenty for a small avatar-sized logo
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Renders whatever logo is currently set (image > emoji > a plain letter
 * fallback), at a given pixel size -- used both by the preview here and
 * anywhere else in the app that shows a team's logo. */
export function TeamLogo({
  emoji,
  imageUrl,
  teamName,
  size = 32,
}: {
  emoji: string | null;
  imageUrl: string | null;
  teamName: string;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.6) };
  if (imageUrl) {
    return (
      // User-uploaded URLs from Supabase Storage, not local/static assets, so next/image's optimization doesn't apply.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={`${teamName} logo`}
        style={style}
        className="rounded-full object-cover border border-neutral-200 shrink-0"
      />
    );
  }
  if (emoji) {
    return (
      <span
        style={style}
        className="rounded-full bg-neutral-100 flex items-center justify-center leading-none shrink-0"
        title={teamName}
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      style={style}
      className="rounded-full bg-neutral-200 text-neutral-500 font-medium flex items-center justify-center leading-none shrink-0"
      title={teamName}
    >
      {teamName.charAt(0).toUpperCase()}
    </span>
  );
}

export default function TeamLogoEditor({
  teamId,
  teamName,
  initialEmoji,
  initialImageUrl,
}: {
  teamId: string;
  teamName: string;
  initialEmoji: string | null;
  initialImageUrl: string | null;
}) {
  const [emoji, setEmoji] = useState(initialEmoji);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [emojiInput, setEmojiInput] = useState(initialEmoji ?? "");
  const [savingEmoji, setSavingEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveEmoji() {
    const trimmed = emojiInput.trim();
    if (!trimmed) {
      setError("Type or paste an emoji first.");
      return;
    }
    setSavingEmoji(true);
    setError(null);
    try {
      const supabase = createClient();
      await setMyTeamLogo(supabase, teamId, trimmed, null);
      setEmoji(trimmed);
      setImageUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEmoji(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires onChange
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please choose a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is too large -- please use something under 2MB.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const url = await uploadTeamLogo(supabase, teamId, file);
      await setMyTeamLogo(supabase, teamId, null, url);
      setImageUrl(url);
      setEmoji(null);
      setEmojiInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      const supabase = createClient();
      await setMyTeamLogo(supabase, teamId, null, null);
      setEmoji(null);
      setImageUrl(null);
      setEmojiInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex items-start gap-4">
      <TeamLogo emoji={emoji} imageUrl={imageUrl} teamName={teamName} size={56} />
      <div className="flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={emojiInput}
            onChange={(e) => setEmojiInput(e.target.value)}
            placeholder="Paste an emoji, e.g. 🏈"
            maxLength={8}
            className="text-sm border border-neutral-300 rounded px-2 py-1 w-40"
          />
          <button
            onClick={handleSaveEmoji}
            disabled={savingEmoji}
            className="text-xs bg-neutral-900 text-white rounded px-2 py-1 disabled:opacity-50"
          >
            {savingEmoji ? "Saving…" : "Use emoji"}
          </button>
        </div>
        <p className="text-xs text-neutral-400 -mt-2">
          No emoji key on your keyboard? Mac: Cmd+Ctrl+Space. Windows: Win+.
        </p>
        <label className="text-xs text-neutral-600">
          <span className="underline underline-offset-4 cursor-pointer hover:text-neutral-900">
            {uploading ? "Uploading…" : "Or upload a photo"}
          </span>
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {(emoji || imageUrl) && (
          <button
            onClick={handleRemove}
            className="text-xs text-neutral-400 underline underline-offset-4 hover:text-neutral-700 self-start"
          >
            Remove logo
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
