'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'voc.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT NOT NULL,
    translation TEXT NOT NULL,
    level       TEXT NOT NULL CHECK(level IN ('A1','A2','B1','B2','C1','C2')),
    category    TEXT NOT NULL DEFAULT 'general',
    uk_ipa      TEXT NOT NULL DEFAULT '',
    us_ipa      TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_words_level     ON words(level);
  CREATE INDEX IF NOT EXISTS idx_words_level_cat ON words(level, category);
  CREATE INDEX IF NOT EXISTS idx_words_word      ON words(word);

  CREATE TABLE IF NOT EXISTS hof (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    level     TEXT NOT NULL DEFAULT '',
    mode      TEXT NOT NULL DEFAULT '',
    challenge TEXT NOT NULL DEFAULT '',
    category  TEXT NOT NULL DEFAULT '',
    score     INTEGER NOT NULL DEFAULT 0,
    correct   INTEGER NOT NULL DEFAULT 0,
    total     INTEGER NOT NULL DEFAULT 0,
    date      TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_hof_score ON hof(score DESC);
  CREATE INDEX IF NOT EXISTS idx_hof_name  ON hof(name);
`);

db.close();
console.log('[VOC] Base de datos creada:', DB_PATH);
