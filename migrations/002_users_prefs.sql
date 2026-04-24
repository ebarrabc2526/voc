-- VOC – English Vocabulary Master
-- Migración 002: tablas de usuarios y preferencias

CREATE TABLE IF NOT EXISTS users (
  sub        TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  picture    TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_prefs (
  sub             TEXT PRIMARY KEY REFERENCES users(sub),
  level           TEXT NOT NULL DEFAULT 'A1',
  mode            TEXT NOT NULL DEFAULT 'en-es',
  category        TEXT NOT NULL DEFAULT 'all',
  challenge_type  TEXT NOT NULL DEFAULT '10',
  auto_play       INTEGER NOT NULL DEFAULT 0,
  auto_play_langs TEXT NOT NULL DEFAULT '["uk","us"]'
);
