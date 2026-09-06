-- AlterEnum
-- Owner capital movements: money the owner puts in (capital_in) and takes out
-- (owner_draw). They are cash flow, not operating income/expense.
ALTER TYPE "TransactionCategory" ADD VALUE 'capital_in';
ALTER TYPE "TransactionCategory" ADD VALUE 'owner_draw';
