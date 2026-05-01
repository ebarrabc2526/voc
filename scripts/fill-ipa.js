#!/usr/bin/env node
// Rellena uk_ipa y us_ipa de toda fila en `words` que tenga alguno vacío,
// usando cmu-pronouncing-dictionary (ARPABET) con conversor a IPA UK/US.
// Uso: node scripts/fill-ipa.js  (o `npm run db:fill-ipa`)

const path = require('path');
const Database = require('better-sqlite3');
const { dictionary: cmu } = require('cmu-pronouncing-dictionary');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const db = new Database(DB_PATH);

const VOWEL_BASES = new Set(['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW']);
const CONS_MAP = {
  B:'b', CH:'tʃ', D:'d', DH:'ð', F:'f', G:'ɡ', HH:'h', JH:'dʒ',
  K:'k', L:'l', M:'m', N:'n', NG:'ŋ', P:'p', S:'s', SH:'ʃ',
  T:'t', TH:'θ', V:'v', W:'w', Y:'j', Z:'z', ZH:'ʒ',
};
const VOWEL_MAP_FIXED = {
  AA:'ɑː', AE:'æ', AO:'ɔː', AW:'aʊ', AY:'aɪ', EH:'ɛ',
  EY:'eɪ', IH:'ɪ', IY:'iː', OY:'ɔɪ', UH:'ʊ', UW:'uː',
};

function arpaTokenize(arpaStr) {
  return arpaStr.split(/\s+/).filter(Boolean).map(p => {
    const m = p.match(/^([A-Z]+)([012])?$/);
    return { base: m[1], stress: m[2] !== undefined ? parseInt(m[2]) : null };
  });
}

function tokensToIpaCore(parsed, dialect) {
  // Build IPA tokens with metadata
  const out = parsed.map(ph => {
    if (ph.base === 'AH') {
      const stressed = ph.stress > 0;
      return { ipa: stressed ? 'ʌ' : 'ə', stress: ph.stress, vowel: true };
    }
    if (ph.base === 'ER') {
      const stressed = ph.stress > 0;
      const ipa = dialect === 'US'
        ? (stressed ? 'ɝ' : 'ɚ')
        : (stressed ? 'ɜː' : 'ə');
      return { ipa, stress: ph.stress, vowel: true };
    }
    if (ph.base === 'OW') {
      return { ipa: dialect === 'US' ? 'oʊ' : 'əʊ', stress: ph.stress, vowel: true };
    }
    if (VOWEL_BASES.has(ph.base)) {
      return { ipa: VOWEL_MAP_FIXED[ph.base], stress: ph.stress, vowel: true };
    }
    if (ph.base === 'R') {
      return { ipa: 'ɹ', stress: null, vowel: false, isR: true };
    }
    return { ipa: CONS_MAP[ph.base] || '', stress: null, vowel: false };
  });

  // UK non-rhotic: drop post-vocalic R when not pre-vocalic
  if (dialect === 'UK') {
    for (let i = 0; i < out.length; i++) {
      if (out[i].isR) {
        const prev = out[i-1];
        const next = out[i+1];
        if (prev && prev.vowel && (!next || !next.vowel)) {
          out[i].drop = true;
        }
      }
    }
  }

  const visible = out.filter(t => !t.drop);

  // Place stress marks at syllable onset (walk back through consonants)
  let result = '';
  for (let i = 0; i < visible.length; i++) {
    const t = visible[i];
    if (t.vowel && t.stress > 0) {
      let pos = result.length;
      let k = i - 1;
      while (k >= 0 && !visible[k].vowel) {
        pos -= visible[k].ipa.length;
        k--;
      }
      const mark = t.stress === 1 ? 'ˈ' : 'ˌ';
      result = result.slice(0, pos) + mark + result.slice(pos);
    }
    result += t.ipa;
  }
  return result;
}

function lookupIpa(word, dialect) {
  const tokens = word.toLowerCase().trim().split(/\s+/);
  const parts = [];
  for (const tok of tokens) {
    // Strip non-alpha for lookup (apostrophes, hyphens edge cases)
    const clean = tok.replace(/[^a-z']/g, '');
    if (!clean) return null;
    const phones = cmu[clean];
    if (!phones) return null;
    const arpaStr = Array.isArray(phones) ? phones[0] : phones;
    parts.push(tokensToIpaCore(arpaTokenize(arpaStr), dialect));
  }
  return `/${parts.join(' ')}/`;
}

function main() {
  const rows = db.prepare(`
    SELECT id, word, uk_ipa, us_ipa
    FROM words
    WHERE uk_ipa = '' OR us_ipa = ''
  `).all();

  console.log(`[fill-ipa] Filas a procesar: ${rows.length}`);

  const updates = [];
  const missing = [];
  let ukOnly = 0, usOnly = 0, both = 0;

  for (const r of rows) {
    const needUk = r.uk_ipa === '';
    const needUs = r.us_ipa === '';

    const uk = needUk ? lookupIpa(r.word, 'UK') : r.uk_ipa;
    const us = needUs ? lookupIpa(r.word, 'US') : r.us_ipa;

    const ukOk = uk !== null;
    const usOk = us !== null;

    if ((needUk && !ukOk) || (needUs && !usOk)) {
      missing.push({ id: r.id, word: r.word });
      continue;
    }

    updates.push({ id: r.id, uk_ipa: uk, us_ipa: us });
    if (needUk && needUs) both++;
    else if (needUk) ukOnly++;
    else if (needUs) usOnly++;
  }

  console.log(`[fill-ipa] Listos para UPDATE: ${updates.length}`);
  console.log(`[fill-ipa]   ambos uk+us:    ${both}`);
  console.log(`[fill-ipa]   solo uk:        ${ukOnly}`);
  console.log(`[fill-ipa]   solo us:        ${usOnly}`);
  console.log(`[fill-ipa] Sin entrada CMU: ${missing.length}`);

  const upd = db.prepare('UPDATE words SET uk_ipa = ?, us_ipa = ? WHERE id = ?');
  const tx = db.transaction((items) => {
    for (const it of items) upd.run(it.uk_ipa, it.us_ipa, it.id);
  });
  tx(updates);

  console.log(`[fill-ipa] OK — ${updates.length} filas actualizadas en transacción.`);

  if (missing.length) {
    console.log(`\n[fill-ipa] Palabras sin entrada CMU (primeras 20):`);
    missing.slice(0, 20).forEach(m => console.log(`  ${m.id.toString().padEnd(6)} ${m.word}`));
    if (missing.length > 20) console.log(`  … y ${missing.length - 20} más`);
  }

  db.close();
}

main();
