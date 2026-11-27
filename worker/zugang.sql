-- Tables of worker/zugang.mjs (SCHEMA there is the source; this file is for wrangler d1 execute, on a database that does not exist yet).
-- The live database was made before konto_bis: it gets only worker/zugang-konto.sql, once.
CREATE TABLE IF NOT EXISTS zaehler (tag TEXT NOT NULL, wer TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tag, wer)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS zugang (hash TEXT PRIMARY KEY, kennung TEXT NOT NULL, stufe TEXT NOT NULL DEFAULT 'browser', grenze INTEGER, gesperrt INTEGER NOT NULL DEFAULT 0, notiz TEXT, erzeugt TEXT NOT NULL, zuletzt TEXT, konto_bis TEXT) WITHOUT ROWID;
