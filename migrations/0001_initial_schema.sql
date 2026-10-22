-- Migration 0001: initial schema for the Neuropulse Inc. website.
-- Apply locally:   npm run db:migrate:local
-- Apply remotely:  npm run db:migrate:remote

-- Client and in-house projects shown on the "Our work" showcase.
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  client        TEXT,
  industry      TEXT,
  summary       TEXT    NOT NULL,              -- one line for cards
  description   TEXT,                          -- longer case-study text
  url           TEXT,                          -- live site the "Visit site" button opens
  image_url     TEXT,                          -- screenshot; card falls back to a generated cover
  accent        TEXT    DEFAULT '#1E9BFF',     -- cover colour when there is no screenshot
  tech          TEXT    NOT NULL DEFAULT '[]', -- JSON array of strings
  status        TEXT    NOT NULL DEFAULT 'in_development'
                CHECK (status IN ('live','in_development','coming_soon')),
  featured      INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  published     INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 100,
  launched_at   TEXT,                          -- ISO date
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects (published, sort_order);

-- Project enquiries from the "Start a project" form.
CREATE TABLE IF NOT EXISTS enquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,        -- e.g. NP-7K3QX2, shown to the visitor
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  phone         TEXT,
  company       TEXT,
  service       TEXT    NOT NULL,
  budget        TEXT,
  timeline      TEXT,
  message       TEXT    NOT NULL,
  contact_pref  TEXT    NOT NULL DEFAULT 'email' CHECK (contact_pref IN ('email','phone','whatsapp')),
  status        TEXT    NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','in_progress','won','lost','spam')),
  notes         TEXT,                           -- internal notes, admin only
  source_page   TEXT,
  ip_hash       TEXT,                           -- salted hash, never the raw IP (POPIA)
  consent       INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status_created ON enquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at DESC);

-- Newsletter / updates list.
CREATE TABLE IF NOT EXISTS subscribers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Admin users (created with scripts/create-admin.mjs, never through the website).
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,               -- pbkdf2$sha256$<iterations>$<salt>$<hash>
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Login sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT    PRIMARY KEY,
  admin_id      INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Fixed-window rate limiting (per action + hashed IP).
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT    NOT NULL,
  window_start  INTEGER NOT NULL,               -- unix seconds, start of window
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Who changed what in the admin area.
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  action        TEXT    NOT NULL,               -- e.g. project.update
  entity        TEXT,
  entity_id     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
