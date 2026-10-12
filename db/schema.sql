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

-- ---------- v0.2: 经验分享社区 ----------

-- Users are not only 新卒 job seekers: working members share 工作体验 too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS career_stage TEXT NOT NULL DEFAULT 'student';   -- student | working

CREATE TABLE IF NOT EXISTS posts (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                        -- interview | work
  status          TEXT NOT NULL DEFAULT 'draft',        -- draft | published
  company_name    TEXT NOT NULL,
  industry        TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT '',             -- 职种 / 岗位
  -- Time labels (required so readers know how current the experience is)
  occurred_on     DATE NOT NULL,                        -- interview month, or work start month
  ended_on        DATE,                                 -- work end month; NULL = 至今
  grad_year       INT,                                  -- 届 of the author at the time (interview)
  -- Interview-specific
  stage           TEXT NOT NULL DEFAULT '',             -- 一次面试 / 最终面试 / 笔试 …
  result          TEXT NOT NULL DEFAULT 'unknown',      -- passed | failed | pending | unknown
  -- Work-specific
  employment_type TEXT NOT NULL DEFAULT '',             -- 新卒 / 中途 / 实习 / 派遣 / アルバイト
  rating          INT,                                  -- 1–5 overall (work)
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,                        -- "## 小标题" sections + paragraphs
  tags            TEXT[] NOT NULL DEFAULT '{}',
  anonymous       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT NOT NULL DEFAULT '',             -- the author's rough description; never shown publicly
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts(status, occurred_on DESC);
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts(user_id);

-- ---------- v0.4: 管理员 ----------

ALTER TABLE users ADD COLUMN IF NOT EXISTS role         TEXT NOT NULL DEFAULT 'user';     -- user | admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'active';   -- active | banned
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_enabled   BOOLEAN;                          -- NULL = follow the site default
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
-- Per-user daily AI limits; NULL = use the site default from the admin console.
ALTER TABLE users ADD COLUMN IF NOT EXISTS limit_es     INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS limit_email  INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS limit_post   INT;
-- Admin "reset today's count": usage before this moment is ignored for today's limit.
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ;

-- Runtime settings editable from the admin console (LLM providers, AI policy …).
CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per AI call, for cost tracking in the admin overview.
CREATE TABLE IF NOT EXISTS ai_usage (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  task            TEXT NOT NULL,                        -- es | email | reply | post | test
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT '',
  ok              BOOLEAN NOT NULL,
  ms              INT NOT NULL DEFAULT 0,
  error           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_time_idx ON ai_usage(created_at DESC);

CREATE TABLE IF NOT EXISTS post_votes (
  post_id         BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ---------- v0.5: 批量导入 ----------
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT '';   -- where imported content came from, shown on the post
ALTER TABLE posts ADD COLUMN IF NOT EXISTS import_batch TEXT;                       -- admin bulk-import batch id (for undo)
CREATE INDEX IF NOT EXISTS posts_import_batch_idx ON posts(import_batch) WHERE import_batch IS NOT NULL;
CREATE TABLE IF NOT EXISTS import_batches (
  id              TEXT PRIMARY KEY,
  admin_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  label           TEXT NOT NULL DEFAULT '',
  method          TEXT NOT NULL DEFAULT 'table',        -- table | ai
  count           INT NOT NULL DEFAULT 0,
  published       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- v0.6: 意见反馈 ----------
CREATE TABLE IF NOT EXISTS feedback (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  category        TEXT NOT NULL DEFAULT 'idea',         -- idea | bug | content | other
  content         TEXT NOT NULL,
  page            TEXT NOT NULL DEFAULT '',             -- where the user was when they opened the form
  status          TEXT NOT NULL DEFAULT 'new',          -- new | doing | accepted | done | closed
  reply           TEXT NOT NULL DEFAULT '',
  replied_at      TIMESTAMPTZ,
  reply_seen      BOOLEAN NOT NULL DEFAULT true,        -- false while the user has an unread reply
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback(user_id, created_at DESC);

-- Posts: status may also be 'hidden' (by an admin).
CREATE TABLE IF NOT EXISTS post_reports (
  id              BIGSERIAL PRIMARY KEY,
  post_id         BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,                        -- privacy | false | ad | offensive | other
  detail          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open',         -- open | resolved | dismissed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS post_reports_open_idx ON post_reports(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS post_reports_once_idx ON post_reports(post_id, reporter_id) WHERE status = 'open';
