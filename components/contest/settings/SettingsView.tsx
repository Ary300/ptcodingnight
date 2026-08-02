"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Crumbs } from "@/components/ui";
import {
  AccountProfileSchema,
  API_ROUTES,
  RenameAccountResponseSchema,
  type AccountProfile,
} from "@/lib/schemas/api";

/**
 * The Settings screen: change your display name and your profile picture, HackerRank-style.
 *
 * ## The picture is resized in the browser, not on the server
 *
 * A phone camera produces a multi-megabyte JPEG, and the UI renders the avatar at 96px. Sending
 * the original would waste the student's data and push against the server's size cap for no visible
 * gain, so the file is drawn onto a 256px square canvas and re-encoded to WebP before upload. The
 * server still enforces its own type and size limits, because a resized-in-the-browser image is a
 * courtesy, not a guarantee: the route cannot trust that the client resized anything.
 *
 * ## Everything is first-person
 *
 * The component never sends an id. It reads `/api/me` and writes `/api/me` and `/api/me/avatar`,
 * all of which resolve the account from the session cookie, so there is no field a student could
 * change to touch somebody else's profile.
 */

const AVATAR_CANVAS_PX = 256;

/** Draw a File onto a square canvas and return a WebP blob, cropping to the centre. */
async function resizeToSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CANVAS_PX;
  canvas.height = AVATAR_CANVAS_PX;
  const ctx = canvas.getContext("2d");
  if (ctx === null)
    throw new Error("Your browser could not process that image.");
  ctx.drawImage(
    bitmap,
    sx,
    sy,
    side,
    side,
    0,
    0,
    AVATAR_CANVAS_PX,
    AVATAR_CANVAS_PX,
  );
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null
          ? reject(new Error("Could not read that image."))
          : resolve(blob),
      "image/webp",
      0.9,
    );
  });
}

type Feedback = { kind: "ok" | "error"; text: string } | null;

export function SettingsView() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback>(null);
  /** Bumped after every avatar change so the preview <img> refetches without a full reload. */
  const [avatarVersion, setAvatarVersion] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.me, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setLoadError(
              response.status === 403
                ? "Settings are for signed-in accounts. Sign in with Google, GitHub or an organizer account."
                : "We could not load your profile. Try again in a moment.",
            );
          }
          return;
        }
        const body: unknown = await response.json();
        const data =
          typeof body === "object" && body !== null && "data" in body
            ? (body as { data: unknown }).data
            : null;
        const parsed = AccountProfileSchema.safeParse(data);
        if (!parsed.success) {
          if (!cancelled) setLoadError("We could not load your profile.");
          return;
        }
        if (cancelled) return;
        setProfile(parsed.data);
        setName(parsed.data.displayName);
        setAvatarVersion(parsed.data.avatarUpdatedAt);
      } catch {
        if (!cancelled) setLoadError("We could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveName = useCallback(async () => {
    setNameBusy(true);
    setNameFeedback(null);
    try {
      const response = await fetch(API_ROUTES.me, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const body: unknown = await response.json();
      const data =
        typeof body === "object" && body !== null && "data" in body
          ? (body as { data: unknown }).data
          : null;
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? (body as { error: { message?: string } }).error.message
            : undefined;
        setNameFeedback({
          kind: "error",
          text: message ?? "That name was not accepted.",
        });
        return;
      }
      const parsed = RenameAccountResponseSchema.safeParse(data);
      if (!parsed.success) {
        setNameFeedback({ kind: "error", text: "That name was not accepted." });
        return;
      }
      setName(parsed.data.displayName);
      setProfile((current) =>
        current === null
          ? current
          : { ...current, displayName: parsed.data.displayName },
      );
      setNameFeedback({
        kind: "ok",
        text: parsed.data.preservedOnLockedBoards
          ? "Saved for your account and open contests. Frozen and completed results keep the name you competed under."
          : parsed.data.adjustedOnABoard
            ? "Saved. Someone in one of your contests already had this name, so the board shows yours with a number after it."
            : "Saved. Your new name is live on your account and current leaderboard.",
      });
    } catch {
      setNameFeedback({
        kind: "error",
        text: "We could not reach the server.",
      });
    } finally {
      setNameBusy(false);
    }
  }, [name]);

  const uploadAvatar = useCallback(async (file: File) => {
    setAvatarBusy(true);
    setAvatarFeedback(null);
    try {
      const blob = await resizeToSquareWebp(file);
      const response = await fetch(API_ROUTES.myAvatar, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? (body as { error: { message?: string } }).error.message
            : undefined;
        setAvatarFeedback({
          kind: "error",
          text: message ?? "That image was not accepted.",
        });
        return;
      }
      const updatedAt =
        typeof body === "object" && body !== null && "data" in body
          ? (body as { data: { avatarUpdatedAt?: unknown } }).data
              .avatarUpdatedAt
          : null;
      setAvatarVersion(
        typeof updatedAt === "string" ? updatedAt : String(Date.now()),
      );
      setAvatarFeedback({ kind: "ok", text: "Your picture is updated." });
    } catch {
      setAvatarFeedback({
        kind: "error",
        text: "We could not read that image. Try a PNG, JPEG or WebP.",
      });
    } finally {
      setAvatarBusy(false);
      if (fileInput.current !== null) fileInput.current.value = "";
    }
  }, []);

  const removeAvatar = useCallback(async () => {
    setAvatarBusy(true);
    setAvatarFeedback(null);
    try {
      const response = await fetch(API_ROUTES.myAvatar, { method: "DELETE" });
      if (!response.ok) {
        setAvatarFeedback({
          kind: "error",
          text: "We could not remove your picture.",
        });
        return;
      }
      setAvatarVersion(null);
      setAvatarFeedback({ kind: "ok", text: "Your picture is removed." });
    } catch {
      setAvatarFeedback({
        kind: "error",
        text: "We could not reach the server.",
      });
    } finally {
      setAvatarBusy(false);
    }
  }, []);

  if (loadError !== null) {
    return (
      <div className="max-w-md">
        <h1
          className="font-display font-bold"
          style={{ fontSize: "var(--text-lg)" }}
        >
          Settings
        </h1>
        <p
          role="alert"
          className="mt-3 text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {loadError}
        </p>
        <Link
          href="/contest"
          className="mt-4 inline-block text-panther underline underline-offset-2"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Back to Problems
        </Link>
      </div>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const hasAvatar = avatarVersion !== null;

  return (
    <div className="mx-auto max-w-2xl">
      <Crumbs
        trail={[
          { href: "/contest", label: "Coding Night" },
          { label: "Settings" },
        ]}
      />
      <h1
        className="mt-2 font-display font-bold"
        style={{ fontSize: "var(--text-xl)" }}
      >
        Settings
      </h1>
      <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Your name and picture are what the room sees on the leaderboard.
      </p>

      {/* --- Profile picture ------------------------------------------------ */}
      <section className="mt-8 rounded border border-rule-edge bg-paper p-5">
        <h2
          className="font-display font-bold"
          style={{ fontSize: "var(--text-md)" }}
        >
          Profile picture
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          {hasAvatar && profile !== null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={API_ROUTES.userAvatar(profile.userId, avatarVersion)}
              alt="Your current profile picture"
              className="h-24 w-24 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-panther font-display font-bold text-paper"
              style={{ fontSize: "var(--text-xl)" }}
            >
              {initial}
            </span>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={avatarBusy}
                onClick={() => fileInput.current?.click()}
              >
                {avatarBusy
                  ? "Working…"
                  : hasAvatar
                    ? "Change picture"
                    : "Upload a picture"}
              </Button>
              {hasAvatar && (
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  disabled={avatarBusy}
                  onClick={() => void removeAvatar()}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              PNG, JPEG or WebP. It is cropped to a square and shrunk before it
              leaves your device.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void uploadAvatar(file);
              }}
            />
          </div>
        </div>
        {avatarFeedback !== null && (
          <p
            role={avatarFeedback.kind === "error" ? "alert" : "status"}
            className={
              avatarFeedback.kind === "error"
                ? "mt-3 text-panther"
                : "mt-3 text-ink/75"
            }
            style={{ fontSize: "var(--text-xs)" }}
          >
            {avatarFeedback.text}
          </p>
        )}
      </section>

      {/* --- Display name --------------------------------------------------- */}
      <section className="mt-6 rounded border border-rule-edge bg-paper p-5">
        <h2
          className="font-display font-bold"
          style={{ fontSize: "var(--text-md)" }}
        >
          Display name
        </h2>
        <label
          htmlFor="settings-display-name"
          className="mt-4 block text-ink/70"
          style={{ fontSize: "var(--text-xs)" }}
        >
          This is the name on your team roster and on the leaderboard.
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            id="settings-display-name"
            type="text"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
          <Button
            type="button"
            disabled={
              nameBusy ||
              name.trim() === "" ||
              name.trim() === profile?.displayName
            }
            onClick={() => void saveName()}
          >
            {nameBusy ? "Saving…" : "Save"}
          </Button>
        </div>
        {nameFeedback !== null && (
          <p
            role={nameFeedback.kind === "error" ? "alert" : "status"}
            className={
              nameFeedback.kind === "error"
                ? "mt-3 text-panther"
                : "mt-3 text-ink/75"
            }
            style={{ fontSize: "var(--text-xs)" }}
          >
            {nameFeedback.text}
          </p>
        )}
      </section>

      {/* --- Account facts (read-only) -------------------------------------- */}
      {profile !== null &&
        (profile.email !== null || profile.gradYear !== null) && (
          <section className="mt-6 rounded border border-rule-edge bg-paper p-5">
            <h2
              className="font-display font-bold"
              style={{ fontSize: "var(--text-md)" }}
            >
              Account
            </h2>
            <dl
              className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {profile.email !== null && (
                <>
                  <dt className="text-ink/60">Email</dt>
                  <dd className="numeric">{profile.email}</dd>
                </>
              )}
              {profile.gradYear !== null && (
                <>
                  <dt className="text-ink/60">Class of</dt>
                  <dd className="numeric">{profile.gradYear}</dd>
                </>
              )}
            </dl>
            <p
              className="mt-3 text-ink/60"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Your email comes from the account you signed in with and cannot be
              changed here.
            </p>
          </section>
        )}
    </div>
  );
}
