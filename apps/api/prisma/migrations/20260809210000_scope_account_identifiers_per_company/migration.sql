-- Los identificadores de cuenta pasan a ser únicos por empresa.
--
-- Siendo globales, dos granjas no podían tener cuentas terminadas en los mismos
-- cuatro dígitos y la segunda en registrarse recibía un conflicto. La búsqueda
-- (`AccountsService.resolveByIdentifier`) ya filtra por empresa, así que el
-- alcance global no protegía de nada: solo impedía el caso normal.
--
-- `company_id` se duplica desde la cuenta porque Prisma no sabe expresar un
-- índice único a través de una relación.

ALTER TABLE "account_identifiers" ADD COLUMN "company_id" UUID;

UPDATE "account_identifiers" i
SET "company_id" = a."company_id"
FROM "accounts" a
WHERE a."id" = i."account_id";

ALTER TABLE "account_identifiers" ALTER COLUMN "company_id" SET NOT NULL;

DROP INDEX IF EXISTS "account_identifiers_kind_value_bank_code_key";

CREATE UNIQUE INDEX "account_identifiers_company_id_kind_value_bank_code_key"
  ON "account_identifiers"("company_id", "kind", "value", "bank_code");

ALTER TABLE "account_identifiers"
  ADD CONSTRAINT "account_identifiers_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
