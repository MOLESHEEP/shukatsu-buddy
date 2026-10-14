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

-- ---------- v0.7: 注册限制 / 邀请码 ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip_hash TEXT;     -- sha256(AUTH_SECRET + IP), never the raw IP
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code    TEXT;
CREATE INDEX IF NOT EXISTS users_signup_ip_idx ON users(signup_ip_hash, created_at);

CREATE TABLE IF NOT EXISTS invite_codes (
  code            TEXT PRIMARY KEY,
  note            TEXT NOT NULL DEFAULT '',
  max_uses        INT,                                  -- NULL = unlimited
  uses            INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  disabled        BOOLEAN NOT NULL DEFAULT false,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- v0.7: 全站通知 ----------
CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  link            TEXT NOT NULL DEFAULT '',
  level           TEXT NOT NULL DEFAULT 'info',         -- info | important
  audience        TEXT NOT NULL DEFAULT 'all',          -- all | ids
  user_ids        BIGINT[] NOT NULL DEFAULT '{}',
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS announcements_time_idx ON announcements(created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- ---------- v0.8: 找回密码 ----------
-- Bumped on password reset/change; sessions carrying an older version are rejected (logs out other devices).
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash      TEXT PRIMARY KEY,                     -- sha256 of the token; the token itself is only in the link
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL DEFAULT 'email',        -- email | admin
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id, created_at DESC);

-- Generic throttle log (forgot-password requests, failed logins). Keys are hashed; rows older than a day are pruned.
CREATE TABLE IF NOT EXISTS auth_throttle (
  kind            TEXT NOT NULL,                        -- forgot | login_fail
  key             TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_throttle_idx ON auth_throttle(kind, key, created_at);

-- ---------- v0.9: 超级管理员授予 / 取消管理员 ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_granted_at TIMESTAMPTZ;

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

-- ---------- v0.10: 发布审核 + 积分（point） ----------
-- Posts: status may also be 'pending' (waiting for review) or 'rejected' (review failed; only the author sees it).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_note   TEXT NOT NULL DEFAULT '';      -- why it was rejected / sent to manual review
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_by     TEXT NOT NULL DEFAULT '';      -- '' | ai | admin
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewer_id   BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ;                   -- last time the author sent it for review
-- '' = no reward yet, 'awarded' = point given, 'capped' = approved on a day the author had already hit the daily cap.
-- A post is rewarded at most once, however often it is edited and re-reviewed.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reward        TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS posts_review_idx ON posts(status, submitted_at) WHERE status IN ('pending', 'rejected');

ALTER TABLE users ADD COLUMN IF NOT EXISTS points         INT NOT NULL DEFAULT 0;
-- Spend a point automatically when today's free AI uses run out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS points_auto_ai BOOLEAN NOT NULL DEFAULT true;

-- Every change to a balance. users.points is the running total, kept in step inside one transaction.
CREATE TABLE IF NOT EXISTS point_ledger (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta           INT NOT NULL,
  kind            TEXT NOT NULL,                        -- post_reward | ai_extra | ai_refund | admin_adjust | redeem
  item            TEXT NOT NULL DEFAULT '',             -- market item id / AI quota kind
  post_id         BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  note            TEXT NOT NULL DEFAULT '',
  actor_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  balance_after   INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_ledger_user_idx ON point_ledger(user_id, created_at DESC);

-- ---------- v0.11: 本选考开放通知 ----------
-- One public record per company (normalised name) and 届. Users follow a company and get an in-app notice when it opens.
CREATE TABLE IF NOT EXISTS openings (
  id              BIGSERIAL PRIMARY KEY,
  company_name    TEXT NOT NULL,
  company_key     TEXT NOT NULL,                        -- normalised name: no 株式会社 / spaces, NFKC, lower case
  grad_year       INT,                                  -- 届; NULL = not limited to one 届
  opens_at        TIMESTAMPTZ,                          -- エントリー受付開始
  deadline        TIMESTAMPTZ,                          -- エントリー締切
  url             TEXT NOT NULL DEFAULT '',             -- 采用页 / エントリー链接 (https only)
  note            TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'admin',        -- admin | user
  reporter_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- first user who reported it; shown only to admins
  anonymous       BOOLEAN NOT NULL DEFAULT true,        -- false = the reporter chose to show their name
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS openings_key_idx ON openings(company_key, COALESCE(grad_year, 0));

-- Public reports from users wait here for an admin. Private ("仅自己可见") reports never come here: they go straight into the user's tracker.
CREATE TABLE IF NOT EXISTS opening_reports (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opening_id      BIGINT REFERENCES openings(id) ON DELETE SET NULL,  -- correction of an existing record, or the record it became
  company_name    TEXT NOT NULL,
  company_key     TEXT NOT NULL,
  grad_year       INT,
  opens_at        TIMESTAMPTZ,
  deadline        TIMESTAMPTZ,
  url             TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  anonymous       BOOLEAN NOT NULL DEFAULT true,
  status          TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  review_note     TEXT NOT NULL DEFAULT '',
  reviewer_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  reward          TEXT NOT NULL DEFAULT '',             -- '' | awarded | capped
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opening_reports_status_idx ON opening_reports(status, created_at);
CREATE INDEX IF NOT EXISTS opening_reports_user_idx ON opening_reports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS opening_follows (
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_key     TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_key)
);
CREATE INDEX IF NOT EXISTS opening_follows_key_idx ON opening_follows(company_key);

-- point_ledger.kind may also be 'opening_reward' (a public report approved); it shares the daily cap with post_reward.
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS opening_report_id BIGINT REFERENCES opening_reports(id) ON DELETE SET NULL;
