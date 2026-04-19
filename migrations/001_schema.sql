-- VOC – English Vocabulary Master
-- Migración 001: esquema inicial

CREATE TABLE IF NOT EXISTS words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  word        TEXT    NOT NULL,
  translation TEXT    NOT NULL,
  level       TEXT    NOT NULL CHECK(level IN ('A1','A2','B1','B2','C1','C2')),
  category    TEXT    NOT NULL DEFAULT 'general',
  uk_ipa      TEXT    NOT NULL DEFAULT '',
  us_ipa      TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_words_level     ON words(level);
CREATE INDEX IF NOT EXISTS idx_words_level_cat ON words(level, category);
CREATE INDEX IF NOT EXISTS idx_words_word      ON words(word);

CREATE TABLE IF NOT EXISTS game_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT    NOT NULL,
  level      TEXT,
  mode       TEXT,
  challenge  TEXT,
  category   TEXT,
  prize      INTEGER DEFAULT 0,
  correct    INTEGER DEFAULT 0,
  total      INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  date       TEXT
);

CREATE TABLE IF NOT EXISTS hof (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  level      TEXT    NOT NULL DEFAULT '',
  mode       TEXT    NOT NULL DEFAULT '',
  challenge  TEXT    NOT NULL DEFAULT '',
  category   TEXT    NOT NULL DEFAULT '',
  score      INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  date       TEXT    NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hof_score ON hof(score DESC);
CREATE INDEX IF NOT EXISTS idx_hof_name  ON hof(name);
