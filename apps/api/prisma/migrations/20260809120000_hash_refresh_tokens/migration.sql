-- Store refresh tokens hashed, and give each login a revocable family.
--
-- Written by hand rather than generated, and applied with `prisma migrate
-- deploy`, because this database holds a real company's books: `migrate dev`
-- is allowed to reset a schema it considers drifted, and that is not a risk
-- worth taking for a column rename.
--
-- Existing sessions survive: the plaintext is still in the table at this point,
-- so it can be hashed in place. Users stay logged in.

ALTER TABLE "refresh_tokens" ADD COLUMN "token_hash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID;

UPDATE "refresh_tokens"
SET "token_hash" = encode(sha256("token"::bytea), 'hex'),
    -- Pre-existing tokens each become their own family: we cannot know which
    -- rotations they descended from, and guessing would join unrelated
    -- sessions into one revocation blast radius.
    "family_id" = gen_random_uuid()
WHERE "token_hash" IS NULL;

-- Anything that failed to backfill cannot be authenticated against and has no
-- business surviving the migration.
DELETE FROM "refresh_tokens" WHERE "token_hash" IS NULL OR "family_id" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

DROP INDEX IF EXISTS "refresh_tokens_token_key";
ALTER TABLE "refresh_tokens" DROP COLUMN "token";

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
