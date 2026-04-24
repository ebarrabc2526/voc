#!/usr/bin/env node
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(__dirname, '..', 'data', 'voc.db');

const PROPER_NOUN_CATEGORIES = [
  'family_and_friends',
  'geography',
  'general',
  'religion',
  'transport',
  'places',
  'military',
  'sports_and_leisure',
  'school',
  'numbers_and_time',
  'arts',
  'the_home',
  'clothes',
  'toys_and_technology',
  'science',
  'food_and_drink',
  'body',
  'work',
  'law_and_crime',
];

function main() {
  const db = new Database(DB_PATH);
  const placeholders = PROPER_NOUN_CATEGORIES.map(() => '?').join(',');

  const before = db.prepare('SELECT COUNT(*) c FROM words').get().c;

  const toDelete = db
    .prepare(
      `SELECT COUNT(*) c FROM words
       WHERE category IN (${placeholders})
         AND translation GLOB '[A-Z]*'`,
    )
    .get(...PROPER_NOUN_CATEGORIES).c;

  console.log(`Before: ${before} words`);
  console.log(`Deleting: ${toDelete} proper nouns`);

  const result = db
    .prepare(
      `DELETE FROM words
       WHERE category IN (${placeholders})
         AND translation GLOB '[A-Z]*'`,
    )
    .run(...PROPER_NOUN_CATEGORIES);

  const after = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  console.log(`Deleted rows: ${result.changes}`);
  console.log(`After: ${after} words`);

  db.close();
}

main();
