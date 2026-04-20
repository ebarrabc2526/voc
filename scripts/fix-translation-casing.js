'use strict';

/**
 * Fix wrongly capitalized translations.
 * Rule: if the English word is a common word (not a proper noun), its Spanish
 * translation should start with lowercase, matching the word's own casing.
 *
 * Strategy:
 *  - 'transport' category: ALL entries are common nouns → blanket lowercase.
 *  - Other categories: only fix specific words known to be common words, but
 *    leave proper nouns (names, places, holidays, brands) intact.
 *  - 'general', 'family_and_friends', 'geography' categories: untouched
 *    (they are almost entirely proper nouns).
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/voc.db'));

function lcFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ── 1. Blanket fix: transport (all are common nouns) ──────────────────────────
const transportFixed = db.prepare(`
  UPDATE words
  SET translation = lower(substr(translation,1,1)) || substr(translation,2)
  WHERE category = 'transport'
    AND substr(translation,1,1) BETWEEN 'A' AND 'Z'
`).run();
console.log(`transport: ${transportFixed.changes} rows updated`);

// ── 2. Targeted fixes: specific common words across other categories ──────────
const targeted = [
  // animals
  { word: 'eel',          old: 'Anguila',                         new: 'anguila' },
  { word: 'pheasant',     old: 'Faisán',                          new: 'faisán' },

  // food_and_drink
  { word: 'gin',          old: 'Ginebra',                         new: 'ginebra' },
  { word: 'gooseberry',   old: 'Grosella',                        new: 'grosella' },
  { word: 'hotdog',       old: 'Hot dog',                         new: 'hot dog' },
  { word: 'popcorn',      old: 'Palomitas',                       new: 'palomitas' },
  { word: 'rum',          old: 'Ron',                             new: 'ron' },
  { word: 'scallop',      old: 'Vieira',                          new: 'vieira' },
  { word: 'tangerine',    old: 'Mandarina',                       new: 'mandarina' },

  // numbers_and_time
  { word: 'seven',        old: 'Siete',                           new: 'siete' },

  // grammar
  { word: 'no',           old: 'No',                              new: 'no',   cat: 'grammar' },
  { word: 'pleases',      old: 'Por favor',                       new: 'por favor' },
  { word: 'vicariously',  old: 'De forma indirecta',              new: 'de forma indirecta' },

  // science
  { word: 'voltage',      old: 'Voltaje',                         new: 'voltaje' },

  // military
  { word: 'radar',        old: 'Radar',                           new: 'radar' },

  // places
  { word: 'heavens',      old: 'Cielos',                          new: 'cielos' },
  { word: 'lookout',      old: 'Estar atento',                    new: 'estar atento' },

  // body
  { word: 'ached',        old: 'Me dolía',                        new: 'me dolía' },

  // feelings
  { word: 'dislikes',     old: 'No le gusta',                     new: 'no le gusta' },
  { word: 'regretted',    old: 'Lamenté',                         new: 'lamenté' },

  // actions
  { word: 'chose',        old: 'Elegí',                           new: 'elegí' },
  { word: 'compromising', old: 'Comprometerse',                   new: 'comprometerse' },
  { word: 'disagrees',    old: 'No está de acuerdo',              new: 'no está de acuerdo' },
  { word: 'requiring',    old: 'Requeriendo',                     new: 'requeriendo' },
  { word: 'unimpressed',  old: 'No me impresionó',                new: 'no me impresionó' },

  // descriptions
  { word: 'covertly',     old: 'Encubiertamente',                 new: 'encubiertamente' },
  { word: 'deeper',       old: 'Más adentro',                     new: 'más adentro' },
  { word: 'malfunction',  old: 'Funcionamiento defectuoso',       new: 'funcionamiento defectuoso' },
  { word: 'slower',       old: 'Más lento',                       new: 'más lento' },

  // work
  { word: 'belgian',      old: 'Belga',                           new: 'belga' },
  { word: 'backdoor',     old: 'Puerta trasera',                  new: 'puerta trasera' },
  { word: 'petitioned',   old: 'Petición',                        new: 'petición' },

  // miscellaneous — interjections and common phrases
  { word: 'ha',           old: 'Ja',                              new: 'ja',   cat: 'miscellaneous' },
  { word: 'hmm',          old: 'Mmm',                             new: 'mmm' },
  { word: 'gee',          old: 'Caramba',                         new: 'caramba' },
  { word: 'ouch',         old: 'Ay',                              new: 'ay' },
  { word: 'yay',          old: 'Hurra',                           new: 'hurra',  cat: 'miscellaneous' },
  { word: 'phew',         old: 'Uf',                              new: 'uf' },
  { word: 'bah',          old: 'Bah',                             new: 'bah' },
  { word: 'hurrah',       old: 'Hurra',                           new: 'hurra',  cat: 'miscellaneous' },
  { word: 'awhile',       old: 'Un rato',                         new: 'un rato' },
  { word: 'behold',       old: 'Mirad',                           new: 'mirad' },
  { word: 'luckiest',     old: 'El más afortunado',               new: 'el más afortunado' },
  { word: 'godspeed',     old: 'Buena suerte',                    new: 'buena suerte' },
  { word: 'rumored',      old: 'Se rumorea',                      new: 'se rumorea' },
  { word: 'backfired',    old: 'El resultado fue contraproducente.', new: 'el resultado fue contraproducente.' },
  { word: 'backfiring',   old: 'El efecto fue contraproducente',  new: 'el efecto fue contraproducente' },
  { word: 'outsmarted',   old: 'Engañada',                        new: 'engañada' },
  { word: 'whither',      old: 'Adónde',                          new: 'adónde' },
  { word: 'earths',       old: 'Tierras',                         new: 'tierras' },
  { word: 'clearwater',   old: 'Aguas claras',                    new: 'aguas claras' },
  { word: 'rollercoaster',old: 'Montaña rusa',                    new: 'montaña rusa' },
  { word: 'charmed',      old: 'Encantado',                       new: 'encantado' },
  { word: 'grandmaster',  old: 'Gran maestro',                    new: 'gran maestro' },
  { word: 'overstayed',   old: 'Me quedé más tiempo del debido',  new: 'me quedé más tiempo del debido' },
  { word: 'stillwater',   old: 'Agua sin gas',                    new: 'agua sin gas' },
  { word: 'guster',       old: 'Gustar',                          new: 'gustar' },
  { word: 'riddler',      old: 'Acertijo',                        new: 'acertijo' },

  // toys_and_technology
  { word: 'internet',     old: 'Internet',                        new: 'internet' },

  // general — clear interjections / vulgar words
  { word: 'ooh',          old: 'Oh',                              new: 'oh',   cat: 'general' },
  { word: 'ow',           old: 'Ay',                              new: 'ay',   cat: 'general' },
  { word: 'fuck',         old: 'Mierda',                          new: 'mierda' },
  { word: 'asshole',      old: 'Estúpido',                        new: 'estúpido' },
];

const stmtWithCat = db.prepare(
  `UPDATE words SET translation = ? WHERE word = ? AND translation = ? AND category = ?`
);
const stmtNoCat = db.prepare(
  `UPDATE words SET translation = ? WHERE word = ? AND translation = ?`
);

let totalTargeted = 0;
for (const fix of targeted) {
  const stmt = fix.cat ? stmtWithCat : stmtNoCat;
  const args = fix.cat
    ? [fix.new, fix.word, fix.old, fix.cat]
    : [fix.new, fix.word, fix.old];
  const result = stmt.run(...args);
  if (result.changes > 0) {
    totalTargeted += result.changes;
    console.log(`  ✓ ${fix.word}: "${fix.old}" → "${fix.new}" (${result.changes})`);
  } else {
    console.log(`  - ${fix.word}: no match for "${fix.old}"`);
  }
}

console.log(`\nTargeted fixes: ${totalTargeted} rows updated`);
console.log(`Total changes: ${transportFixed.changes + totalTargeted}`);
