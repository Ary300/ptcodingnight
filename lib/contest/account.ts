import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

/**
 * A student's own account: their display name and their profile picture.
 *
 * ## Why a rename is more than one UPDATE
 *
 * `displayName` is denormalised into three tables on purpose, and each copy exists for a reason
 * that survives a rename:
 *
 *   - `User.displayName`      the account, and the source of truth this file writes first.
 *   - `Session.displayName`   copied at sign-in so the nav can name the viewer without a join to
 *                             User on every request. Stale after a rename until updated here.
 *   - `Participant.displayName` copied at enrolment, and `@@unique([contestId, displayName])`, so
 *                             two students in one contest can never share a name on the board.
 *
 * A rename that touched only `User` would leave the nav showing the old name until the next
 * sign-in and the leaderboard showing it forever. So this propagates to the live sessions and to
 * every participant row of the account, honouring the per-contest uniqueness the board depends on.
 */

/** The display-name bounds, shared by the schema and the UI copy. */
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 40;

/**
 * The hard ceiling on an uploaded avatar, enforced at the write boundary and never trusted from
 * the client. 512 KB is generous for a picture the UI renders at 96px; the Settings page resizes
 * before upload, so a well-behaved client sends a few KB and this only catches abuse.
 */
export const AVATAR_MAX_BYTES = 512 * 1024;

/**
 * The image types the avatar route will store and serve. An allow-list, not a block-list: an SVG
 * avatar is a script-injection vector when served same-origin, so it is simply not on the list.
 */
export const ALLOWED_AVATAR_MIME: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

export interface AccountProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly gradYear: number | null;
  readonly hasAvatar: boolean;
  /** ISO instant of the last avatar change, for cache-busting the image URL. Null if none. */
  readonly avatarUpdatedAt: string | null;
}

/** The profile a student sees on their own Settings page. */
export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      gradYear: true,
      avatarMime: true,
      avatarUpdatedAt: true,
    },
  });
  if (user === null) throw new ValidationError("No account is signed in.");

  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    gradYear: user.gradYear,
    hasAvatar: user.avatarMime !== null,
    avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * Validate and normalise a wanted display name, or throw with a message a student can act on.
 *
 * Collapses internal whitespace so " Aryav   Das " and "Aryav Das" cannot be two different names
 * on the board, and rejects control characters, which have no place in a name and are how someone
 * would try to spoof another player's row.
 */
function normaliseDisplayName(wanted: string): string {
  // Strip control characters (they have no place in a name and are how a row is spoofed),
  // then collapse internal whitespace so " Aryav   Das " and "Aryav Das" are one name.
  const cleaned = wanted.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < DISPLAY_NAME_MIN) {
    throw new ValidationError("Your name cannot be empty.");
  }
  if (cleaned.length > DISPLAY_NAME_MAX) {
    throw new ValidationError(`Keep your name to ${String(DISPLAY_NAME_MAX)} characters or fewer.`);
  }
  return cleaned;
}

/**
 * A per-contest unique name for THIS participant, i.e. excluding their own current row.
 *
 * `uniqueDisplayName` in enrolment.ts cannot be reused here because it counts the caller's own
 * row as a collision, so a student renaming to a name only they hold would be handed a "(2)"
 * suffix against themselves. This variant ignores the participant doing the renaming.
 */
async function uniqueNameExcluding(
  contestId: string,
  wanted: string,
  ownParticipantId: string,
): Promise<string> {
  const base = wanted.slice(0, DISPLAY_NAME_MAX);
  const taken = await prisma.participant.findMany({
    where: { contestId, displayName: { startsWith: base }, id: { not: ownParticipantId } },
    select: { displayName: true },
  });
  const names = new Set(taken.map((row) => row.displayName));
  if (!names.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} (${String(n)})`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base} (${String(ownParticipantId.slice(-4))})`;
}

export interface RenameResult {
  /** The name written to the account. */
  readonly displayName: string;
  /**
   * True when at least one contest already had someone with the wanted name, so a participant row
   * was stored with a suffix. The UI surfaces this so the student is not surprised that the board
   * shows "Aryav Das (2)".
   */
  readonly adjustedOnABoard: boolean;
}

/**
 * Rename the account and propagate the new name to the viewer's sessions and participant rows.
 *
 * The account gets exactly the validated name. Each participant row gets a per-contest-unique
 * form of it, which may carry a suffix; that divergence is inherent to a board that forbids
 * duplicate names, and the return value reports it rather than hiding it.
 */
export async function renameAccount(
  userId: string,
  wanted: string,
  now: Date = new Date(),
): Promise<RenameResult> {
  const name = normaliseDisplayName(wanted);

  const participants = await prisma.participant.findMany({
    where: { userId },
    select: { id: true, contestId: true },
  });

  let adjustedOnABoard = false;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { displayName: name } });

    // Live sessions only. A revoked or expired session's name never renders, and rewriting it
    // would be churn on rows that exist for the audit trail.
    await tx.session.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      data: { displayName: name },
    });

    for (const participant of participants) {
      const unique = await uniqueNameExcluding(participant.contestId, name, participant.id);
      if (unique !== name) adjustedOnABoard = true;
      await tx.participant.update({
        where: { id: participant.id },
        data: { displayName: unique },
      });
    }
  });

  return { displayName: name, adjustedOnABoard };
}

/**
 * Store an uploaded avatar. `mime` is validated against the allow-list and `bytes` against the
 * size ceiling before either reaches the database, because both arrive from the client.
 */
export async function setAvatar(
  userId: string,
  bytes: Uint8Array,
  mime: string,
  now: Date = new Date(),
): Promise<void> {
  if (!ALLOWED_AVATAR_MIME.includes(mime)) {
    throw new ValidationError("Upload a PNG, JPEG or WebP image.");
  }
  if (bytes.byteLength === 0) {
    throw new ValidationError("That file was empty.");
  }
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new ValidationError(
      `That image is too large. Keep it under ${String(Math.floor(AVATAR_MAX_BYTES / 1024))} KB.`,
    );
  }
  await prisma.user.update({
    where: { id: userId },
    data: { avatarData: Buffer.from(bytes), avatarMime: mime, avatarUpdatedAt: now },
  });
}

/** Remove the avatar, falling the UI back to the initial disc. */
export async function clearAvatar(userId: string, now: Date = new Date()): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { avatarData: null, avatarMime: null, avatarUpdatedAt: now },
  });
}

export interface StoredAvatar {
  readonly data: Buffer;
  readonly mime: string;
}

/**
 * Read an avatar for serving. Returns null when the user has none, which the route turns into a
 * 404 so the client renders the initial disc instead.
 *
 * This is the ONLY read of `avatarData`, so the image bytes never travel with any other query.
 */
export async function getAvatar(userId: string): Promise<StoredAvatar | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarData: true, avatarMime: true },
  });
  if (user === null || user.avatarData === null || user.avatarMime === null) return null;
  return { data: Buffer.from(user.avatarData), mime: user.avatarMime };
}
