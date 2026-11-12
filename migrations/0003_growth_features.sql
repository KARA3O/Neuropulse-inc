-- Migration 0003: case studies, testimonials, lead source tracking, call booking and admin 2FA.
-- Apply locally:   npm run db:migrate:local
-- Apply remotely:  npm run db:migrate:remote
-- Safe to apply once on top of 0001 and 0002; existing rows are kept.

-- ---- Case studies: three optional text blocks per project --------------------------------------
-- The public case-study page only shows a block when it has text, so nothing is invented.
ALTER TABLE projects ADD COLUMN problem  TEXT;   -- what the client needed
ALTER TABLE projects ADD COLUMN solution TEXT;   -- what was built
ALTER TABLE projects ADD COLUMN results  TEXT;   -- what changed (real, measured outcomes only)

-- ---- Lead source: where each enquiry came from, and the estimate the visitor built ---------------
ALTER TABLE enquiries ADD COLUMN heard_from      TEXT;   -- "How did you hear about us?" answer
ALTER TABLE enquiries ADD COLUMN utm_source      TEXT;   -- from ?utm_source= on the link they followed
ALTER TABLE enquiries ADD COLUMN utm_medium      TEXT;
ALTER TABLE enquiries ADD COLUMN utm_campaign    TEXT;
ALTER TABLE enquiries ADD COLUMN quote_selection TEXT;   -- JSON from the instant estimator

-- ---- Testimonials: real client quotes, shown on the home page and on case studies ----------------
CREATE TABLE IF NOT EXISTS testimonials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  author_name   TEXT    NOT NULL,
  author_role   TEXT,                              -- e.g. "Owner, 4Guard Cleaning"
  quote         TEXT    NOT NULL,
  published     INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_testimonials_public ON testimonials (published, sort_order);

-- ---- Discovery-call bookings -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,           -- e.g. CALL-7K3QX2
  starts_at     TEXT    NOT NULL,                  -- ISO time in UTC, e.g. 2026-11-16T07:00:00.000Z
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  phone         TEXT,
  company       TEXT,
  topic         TEXT,
  status        TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled','no_show')),
  cancel_token  TEXT    NOT NULL UNIQUE,           -- link in the confirmation email
  consent       INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1)),
  ip_hash       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Two people can never hold the same time: only one active booking per start time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_active_slot ON call_bookings (starts_at) WHERE status IN ('confirmed','completed','no_show');
CREATE INDEX IF NOT EXISTS idx_call_starts ON call_bookings (starts_at);

-- ---- Admin two-factor sign-in (TOTP, works with Google Authenticator, Microsoft Authenticator, Authy) --
ALTER TABLE admins ADD COLUMN totp_secret  TEXT;                            -- base32 secret, set during setup
ALTER TABLE admins ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;      -- 1 once the first code was verified
