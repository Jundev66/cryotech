-- A payment settles exactly one payable. The service enforces this too, but the
-- constraint is what makes it impossible: a payment linked to both a purchase
-- and a processing would be counted twice when computing either balance, and a
-- payment linked to neither is money that left the bank against nothing.
--
-- Prisma cannot express this in the schema, hence the hand-written migration.
ALTER TABLE "payable_payments"
  ADD CONSTRAINT "payable_payments_single_target"
  CHECK (("entry_id" IS NOT NULL)::int + ("processing_id" IS NOT NULL)::int = 1);
