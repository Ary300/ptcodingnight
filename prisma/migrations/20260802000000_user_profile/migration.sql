-- A student's profile: an uploaded avatar. The display name already exists on User.
--
-- avatarData is bytea. It is nullable because most students never upload one, and the serving
-- route falls back to the initial disc when it is NULL. avatarUpdatedAt exists only to bust the
-- browser cache on the <img> URL, so a freshly uploaded picture is visible immediately.
ALTER TABLE "User" ADD COLUMN "avatarData" BYTEA;
ALTER TABLE "User" ADD COLUMN "avatarMime" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);
