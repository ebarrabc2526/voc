#!/usr/bin/env node
// Tercera pasada: IPA manual para los 24 que ni CMU ni la heurística cubren.
// Estos son colores especializados o compuestos que no están en CMU dict.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const db = new Database(DB_PATH);

const MANUAL = {
  'alizarin':       { uk: '/əˈlɪzəɹɪn/',         us: '/əˈlɪzɚɪn/' },
  'bistre':         { uk: '/ˈbɪstə/',             us: '/ˈbɪstɚ/' },
  'blanched almond':{ uk: '/blæntʃt ˈɑːmənd/',    us: '/blæntʃt ˈɑːmənd/' },
  'burlywood':      { uk: '/ˈbɜːliwʊd/',          us: '/ˈbɝliwʊd/' },
  'burnt umber':    { uk: '/bɜːnt ˈʌmbə/',        us: '/bɝnt ˈʌmbɚ/' },
  'feldgrau':       { uk: '/ˈfɛldɡɹaʊ/',          us: '/ˈfɛldɡɹaʊ/' },
  'fulvous':        { uk: '/ˈfʌlvəs/',            us: '/ˈfʌlvəs/' },
  'gamboge':        { uk: '/ɡæmˈbəʊdʒ/',          us: '/ɡæmˈboʊʒ/' },
  'glaucous':       { uk: '/ˈɡlɔːkəs/',           us: '/ˈɡlɔːkəs/' },
  'gunmetal':       { uk: '/ˈɡʌnˌmɛtəl/',         us: '/ˈɡʌnˌmɛtəl/' },
  'isabelline':     { uk: '/ɪzəˈbɛlɪn/',          us: '/ɪzəˈbɛlɪn/' },
  'oxblood':        { uk: '/ˈɒksblʌd/',           us: '/ˈɑːksblʌd/' },
  'puce':           { uk: '/pjuːs/',              us: '/pjuːs/' },
  'raw umber':      { uk: '/ɹɔː ˈʌmbə/',          us: '/ɹɔː ˈʌmbɚ/' },
  'seafoam':        { uk: '/ˈsiːfəʊm/',           us: '/ˈsiːfoʊm/' },
  'smalt':          { uk: '/smɔːlt/',             us: '/smɔːlt/' },
  'taupe':          { uk: '/təʊp/',               us: '/toʊp/' },
  'tumbleweed':     { uk: '/ˈtʌmbəlwiːd/',        us: '/ˈtʌmbəlwiːd/' },
  'tyrian purple':  { uk: '/ˌtɪɹiən ˈpɜːpəl/',    us: '/ˌtɪɹiən ˈpɝpəl/' },
  'ultramarine':    { uk: '/ˌʌltɹəməˈɹiːn/',      us: '/ˌʌltɹəməˈɹiːn/' },
  'viridian':       { uk: '/vɪˈɹɪdiən/',          us: '/vɪˈɹɪdiən/' },
  'wisteria':       { uk: '/wɪˈstɪɹiə/',          us: '/wɪˈstɪɹiə/' },
  'burgle':         { uk: '/ˈbɜːɡəl/',            us: '/ˈbɝɡəl/' },
  'youre welcome':  { uk: '/jɔː ˈwɛlkəm/',        us: '/jʊɹ ˈwɛlkəm/' },
};

const upd = db.prepare('UPDATE words SET uk_ipa = ?, us_ipa = ? WHERE word = ? AND (uk_ipa = \'\' OR us_ipa = \'\')');
let count = 0;
const tx = db.transaction(() => {
  for (const [word, ipa] of Object.entries(MANUAL)) {
    const r = upd.run(ipa.uk, ipa.us, word);
    if (r.changes > 0) count += r.changes;
  }
});
tx();
console.log(`[fill-ipa-pass3] Actualizadas: ${count}`);

const remaining = db.prepare("SELECT COUNT(*) c FROM words WHERE uk_ipa='' OR us_ipa=''").get().c;
console.log(`[fill-ipa-pass3] Sin IPA finales: ${remaining}`);

db.close();
