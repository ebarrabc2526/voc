#!/usr/bin/env node
'use strict';

const Database = require('better-sqlite3');
const { dictionary: cmuDict } = require('cmu-pronouncing-dictionary');
const path = require('path');
const { execSync } = require('child_process');

// ARPABET to IPA mappings
const VOWELS_US = {
  'AA': 'ɑ', 'AE': 'æ', 'AH0': 'ə', 'AH1': 'ʌ', 'AH2': 'ʌ',
  'AO': 'ɔ', 'AW': 'aʊ', 'AY': 'aɪ', 'EH': 'ɛ', 'ER': 'ɝ',
  'EY': 'eɪ', 'IH': 'ɪ', 'IY': 'iː', 'OW': 'oʊ', 'OY': 'ɔɪ',
  'UH': 'ʊ', 'UW': 'uː'
};
const VOWELS_UK = {
  ...VOWELS_US,
  'ER': 'ɜː', 'OW': 'əʊ'
};
const CONSONANTS = {
  'B': 'b', 'CH': 'tʃ', 'D': 'd', 'DH': 'ð', 'F': 'f', 'G': 'ɡ',
  'HH': 'h', 'JH': 'dʒ', 'K': 'k', 'L': 'l', 'M': 'm', 'N': 'n',
  'NG': 'ŋ', 'P': 'p', 'R': 'ɹ', 'S': 's', 'SH': 'ʃ', 'T': 't',
  'TH': 'θ', 'V': 'v', 'W': 'w', 'Y': 'j', 'Z': 'z', 'ZH': 'ʒ'
};

function arpabetToIPA(phones, isUK) {
  const vowelMap = isUK ? VOWELS_UK : VOWELS_US;
  let result = '';

  for (const phone of phones) {
    const stressMatch = phone.match(/^([A-Z]+)([012])$/);
    if (stressMatch) {
      const base = stressMatch[1];
      const stress = stressMatch[2];

      let stressMark = '';
      if (stress === '1') stressMark = 'ˈ';
      else if (stress === '2') stressMark = 'ˌ';

      let ipaPhone;
      if (base === 'AH') {
        ipaPhone = stress === '0' ? 'ə' : 'ʌ';
      } else if (base === 'ER') {
        ipaPhone = isUK ? 'ɜː' : 'ɝ';
      } else if (vowelMap[base]) {
        ipaPhone = vowelMap[base];
      } else {
        ipaPhone = base; // fallback
      }

      result += stressMark + ipaPhone;
    } else {
      // Consonant (no stress digit)
      if (CONSONANTS[phone]) {
        result += CONSONANTS[phone];
      } else {
        result += phone; // fallback
      }
    }
  }

  return result;
}

// For UK: non-rhotic — drop post-vocalic consonantal R
function toUK(phones) {
  const vowelBases = new Set([
    'AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'
  ]);
  const result = [];
  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    const phoneBase = phone.replace(/[012]$/, '');

    // Drop consonantal R that follows a vowel (post-vocalic R)
    if (phoneBase === 'R' && phone === 'R') {
      if (i > 0) {
        const prevBase = phones[i - 1].replace(/[012]$/, '');
        if (vowelBases.has(prevBase)) {
          continue; // skip post-vocalic R
        }
      }
    }
    result.push(phone);
  }
  return result;
}

function wordToIPA(word, isUK) {
  const key = word.toLowerCase();
  const entry = cmuDict[key];
  if (!entry) return null;

  // cmu-pronouncing-dictionary returns a space-separated string of phones
  const phones = entry.split(' ');
  const processedPhones = isUK ? toUK(phones) : phones;
  return arpabetToIPA(processedPhones, isUK);
}

function phraseToIPA(phrase, isUK) {
  const tokens = phrase.toLowerCase().split(/\s+/);
  const ipaParts = [];

  for (const token of tokens) {
    // Handle hyphenated words
    const subTokens = token.split('-');
    const subIPAs = [];
    for (const sub of subTokens) {
      if (sub === '') continue;
      const ipa = wordToIPA(sub, isUK);
      if (ipa === null) return null; // Missing from CMU dict
      subIPAs.push(ipa);
    }
    ipaParts.push(subIPAs.join('-'));
  }

  return ipaParts.join(' ');
}

const DB_PATH = path.join(__dirname, '../data/voc.db');
const db = new Database(DB_PATH);

const rows = db.prepare(
  "SELECT id, word, level FROM words WHERE category='colours' AND (uk_ipa='' OR uk_ipa IS NULL OR us_ipa='' OR us_ipa IS NULL)"
).all();

console.log(`Found ${rows.length} rows with empty IPA in 'colours'`);

const toUpdate = [];
const missing = [];

for (const row of rows) {
  const us_ipa = phraseToIPA(row.word, false);
  const uk_ipa = phraseToIPA(row.word, true);

  if (us_ipa === null || uk_ipa === null) {
    missing.push(row.word);
    continue;
  }

  toUpdate.push({
    id: row.id,
    word: row.word,
    uk_ipa: `/${uk_ipa}/`,
    us_ipa: `/${us_ipa}/`
  });
}

console.log(`\nTo update: ${toUpdate.length}`);
console.log(`Missing from CMU dict: ${missing.length}`);
if (missing.length > 0) {
  console.log('Missing words:', missing.join(', '));
}

console.log('\nSample updates (first 5):');
for (const r of toUpdate.slice(0, 5)) {
  console.log(`  "${r.word}" -> UK: ${r.uk_ipa}  US: ${r.us_ipa}`);
}

// Backup
const backupName = `data/voc.db.bak-pre-ipa-fill-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
execSync(`cp data/voc.db ${backupName}`, { cwd: path.join(__dirname, '..') });
console.log(`\nBackup created: ${backupName}`);

// Update DB
if (toUpdate.length > 0) {
  const upd = db.prepare('UPDATE words SET uk_ipa=?, us_ipa=? WHERE id=?');
  const tx = db.transaction((rows) => {
    for (const r of rows) upd.run(r.uk_ipa, r.us_ipa, r.id);
  });
  tx(toUpdate);
  console.log(`Updated ${toUpdate.length} rows in DB`);
}

// Verify
const remaining = db.prepare(
  "SELECT COUNT(*) as c FROM words WHERE category='colours' AND (uk_ipa='' OR uk_ipa IS NULL OR us_ipa='' OR us_ipa IS NULL)"
).get();
console.log(`\nRemaining empty IPA in 'colours': ${remaining.c}`);

db.close();
