-- Stufe 2 (account link): the day until which a key counts as "konto". Run ONCE on the existing database, BEFORE the
-- deploy of the code that reads it (not repeatable: a second run fails with "duplicate column name"):
--   npx wrangler d1 execute fundus --remote --file worker/zugang-konto.sql
-- Rows that exist keep konto_bis NULL, which is what they should have: nobody is linked yet.
ALTER TABLE zugang ADD COLUMN konto_bis TEXT;
