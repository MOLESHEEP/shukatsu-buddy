-- Idempotent schema. Applied automatically when the app first touches the database.
-- Seven core tables from the PRD; every business row is scoped to a user.

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  grad_year       INT,
  major           TEXT NOT NULL DEFAULT '',
  jp_level        TEXT NOT NULL DEFAULT '',
  plan            TEXT NOT NULL DEFAULT 'free',          -- free | pro
  es_used         INT  NOT NULL DEFAULT 0,
  email_used      INT  NOT NULL DEFAULT 0,
  ics_token       TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  industry        TEXT NOT NULL DEFAULT '',
  channel         TEXT NOT NULL DEFAULT '',             -- 投递渠道
  current_stage   TEXT NOT NULL DEFAULT 'エントリー',
  status          TEXT NOT NULL DEFAULT 'active',       -- active | offer | rejected | withdrawn
  next_action     TEXT NOT NULL DEFAULT '',
  next_deadline   TIMESTAMPTZ,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_user_idx ON companies(user_id);

CREATE TABLE IF NOT EXISTS stages (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  date            TIMESTAMPTZ,
  result          TEXT NOT NULL DEFAULT 'pending',      -- pending | passed | failed
  position        INT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS stages_company_idx ON stages(company_id);

CREATE TABLE IF NOT EXISTS tests (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'unknown',
  format          TEXT NOT NULL DEFAULT 'unknown',
  deadline        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'todo',         -- todo | done | passed | failed
  confidence      REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tests_company_idx ON tests(company_id);

CREATE TABLE IF NOT EXISTS emails (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw             TEXT NOT NULL,
  parsed          JSONB,
  confirmed       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_user_idx ON emails(user_id);

CREATE TABLE IF NOT EXISTS events (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'other',        -- deadline | interview | briefing | test | other
  title           TEXT NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  location        TEXT NOT NULL DEFAULT '',
  prep            TEXT NOT NULL DEFAULT '',
  source_email_id BIGINT REFERENCES emails(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS events_company_idx ON events(company_id);

CREATE TABLE IF NOT EXISTS es_docs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  company_name    TEXT NOT NULL DEFAULT '',
  question        TEXT NOT NULL,
  char_limit      INT,
  draft           TEXT NOT NULL,
  rewritten       TEXT NOT NULL DEFAULT '',
  review          JSONB,
  is_material     BOOLEAN NOT NULL DEFAULT false,       -- saved to 素材库
  material_tag    TEXT NOT NULL DEFAULT '',             -- ガクチカ / 自己PR / 志望動機 ...
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS es_docs_user_idx ON es_docs(user_id);
