#!/usr/bin/env node
// Segunda pasada: rellena IPA de palabras que el primer pase no encontró.
// Estrategias adicionales:
//   1. Hyphen split: "brother-in-law" → ["brother","in","law"], lookup cada parte.
//   2. British→American spelling: "yoghurt"→"yogurt", "flavour"→"flavor", etc.
//   3. Compound split fallback: prueba dividir compuestos sin guión en sub-palabras conocidas.

const path = require('path');
const Database = require('better-sqlite3');
const { dictionary: cmu } = require('cmu-pronouncing-dictionary');

const DB_PATH = path.join(__dirname, '..', 'data', 'voc.db');
const db = new Database(DB_PATH);

const VOWEL_BASES = new Set(['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW']);
const CONS_MAP = {B:'b',CH:'tʃ',D:'d',DH:'ð',F:'f',G:'ɡ',HH:'h',JH:'dʒ',K:'k',L:'l',M:'m',N:'n',NG:'ŋ',P:'p',S:'s',SH:'ʃ',T:'t',TH:'θ',V:'v',W:'w',Y:'j',Z:'z',ZH:'ʒ'};
const VM = {AA:'ɑː',AE:'æ',AO:'ɔː',AW:'aʊ',AY:'aɪ',EH:'ɛ',EY:'eɪ',IH:'ɪ',IY:'iː',OY:'ɔɪ',UH:'ʊ',UW:'uː'};

function tok(s){return s.split(/\s+/).filter(Boolean).map(p=>{const m=p.match(/^([A-Z]+)([012])?$/);return{base:m[1],stress:m[2]!==undefined?+m[2]:null};});}
function core(parsed,dia){
  const out=parsed.map(ph=>{
    if(ph.base==='AH')return{ipa:ph.stress>0?'ʌ':'ə',stress:ph.stress,vowel:true};
    if(ph.base==='ER'){const s=ph.stress>0;return{ipa:dia==='US'?(s?'ɝ':'ɚ'):(s?'ɜː':'ə'),stress:ph.stress,vowel:true};}
    if(ph.base==='OW')return{ipa:dia==='US'?'oʊ':'əʊ',stress:ph.stress,vowel:true};
    if(VOWEL_BASES.has(ph.base))return{ipa:VM[ph.base],stress:ph.stress,vowel:true};
    if(ph.base==='R')return{ipa:'ɹ',stress:null,vowel:false,isR:true};
    return{ipa:CONS_MAP[ph.base]||'',stress:null,vowel:false};
  });
  if(dia==='UK'){
    for(let i=0;i<out.length;i++){
      if(out[i].isR){const p=out[i-1],n=out[i+1];if(p&&p.vowel&&(!n||!n.vowel))out[i].drop=true;}
    }
  }
  const v=out.filter(t=>!t.drop);
  let r='';
  for(let i=0;i<v.length;i++){
    const t=v[i];
    if(t.vowel&&t.stress>0){
      let pos=r.length,k=i-1;
      while(k>=0&&!v[k].vowel){pos-=v[k].ipa.length;k--;}
      r=r.slice(0,pos)+(t.stress===1?'ˈ':'ˌ')+r.slice(pos);
    }
    r+=t.ipa;
  }
  return r;
}

const BR_TO_US = {
  'yoghurt':'yogurt','flavour':'flavor','splendour':'splendor','colour':'color','behaviour':'behavior',
  'omelette':'omelet','gramme':'gram','aeroplane':'airplane','pyjamas':'pajamas','t-shirt':'tshirt',
  'mum':'mom','grey':'gray','centre':'center','metre':'meter','theatre':'theater',
  'organise':'organize','realise':'realize','chilli':'chili','offence':'offense','defence':'defense',
};

function lookupClean(token) {
  const c = token.toLowerCase().replace(/[^a-z']/g, '');
  if (!c) return null;
  const ph = cmu[c];
  if (!ph) return null;
  return Array.isArray(ph) ? ph[0] : ph;
}

// Estrategia 2: probar British→American mapping
function lookupWithBrEn(token) {
  const c = token.toLowerCase().trim();
  if (BR_TO_US[c]) {
    return lookupClean(BR_TO_US[c]);
  }
  return null;
}

// Estrategia 3: split por guion y/o espacio
function lookupHyphenSplit(word, dialect) {
  const parts = word.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return null;
  const ipas = [];
  for (const p of parts) {
    let ph = lookupClean(p);
    if (!ph) ph = lookupWithBrEn(p);
    if (!ph) return null;
    ipas.push(core(tok(ph), dialect));
  }
  return `/${ipas.join(' ')}/`;
}

// Estrategia 4: compound split (heuristic) - prueba splits comunes
const COMMON_COMPOUNDS = {
  'snowboarding': ['snow','boarding'],
  'windsurfing': ['wind','surfing'],
  'motor-racing': ['motor','racing'],
  'motor':['motor'],
  'funfair': ['fun','fair'],
  'webcam': ['web','cam'],
  'hairdryer': ['hair','dryer'],
  'toothache': ['tooth','ache'],
  'earache': ['ear','ache'],
  'headteacher': ['head','teacher'],
  'noticeboard': ['notice','board'],
  'notepaper': ['note','paper'],
  'cashpoint': ['cash','point'],
  'outgoings': ['out','goings'],
  'penfriend': ['pen','friend'],
  'answerphone': ['answer','phone'],
  'windscreen': ['wind','screen'],
  'motorway': ['motor','way'],
  'duvet': ['doo','vey'],  // french loan, approximation
  'hi-tech': ['high','tech'],
  'duty-free': ['duty','free'],
  'half-price': ['half','price'],
  'last-minute': ['last','minute'],
  'day-to-day': ['day','to','day'],
  'well-paid': ['well','paid'],
  'self-assured': ['self','assured'],
  'self-assurance': ['self','assurance'],
  'self-awareness': ['self','awareness'],
  'self-conscious': ['self','conscious'],
  'self-control': ['self','control'],
  'self-esteem': ['self','esteem'],
  'self-respect': ['self','respect'],
  'self-discipline': ['self','discipline'],
  'self-reliance': ['self','reliance'],
  'self-service': ['self','service'],
  'self-catering': ['self','catering'],
  'semi-detached': ['semi','detached'],
  'check-in': ['check','in'],
  'washing-up': ['washing','up'],
  'youre welcome': ['youre','welcome'],
  'x-ray': ['x','ray'],
  'semicolon': ['semi','colon'],
  'pullover': ['pull','over'],
  'tracksuit': ['track','suit'],
  'hoodie': ['hood','y'],  // approximation
  'counselling': ['counseling'],
  'brother-in-law': ['brother','in','law'],
  'sister-in-law': ['sister','in','law'],
  'mother-in-law': ['mother','in','law'],
  'father-in-law': ['father','in','law'],
  'daughter-in-law': ['daughter','in','law'],
  'son-in-law': ['son','in','law'],
  'burgle': ['burgle'],  // CMU should have it actually
};

function lookupCompound(word, dialect) {
  const c = word.toLowerCase().trim();
  const parts = COMMON_COMPOUNDS[c];
  if (!parts) return null;
  const ipas = [];
  for (const p of parts) {
    let ph = lookupClean(p);
    if (!ph) ph = lookupWithBrEn(p);
    if (!ph) return null;
    ipas.push(core(tok(ph), dialect));
  }
  return `/${ipas.join(' ')}/`;
}

function tryAll(word, dialect) {
  // 1. Direct (con BR→US)
  let ph = lookupClean(word) || lookupWithBrEn(word);
  if (ph) return `/${core(tok(ph), dialect)}/`;
  // 2. Hyphen/space split
  let r = lookupHyphenSplit(word, dialect);
  if (r) return r;
  // 3. Compound table
  r = lookupCompound(word, dialect);
  if (r) return r;
  return null;
}

function main() {
  const rows = db.prepare(`SELECT id, word FROM words WHERE uk_ipa = '' OR us_ipa = ''`).all();
  console.log(`[fill-ipa-pass2] Filas pendientes: ${rows.length}`);

  const updates = [];
  const stillMissing = [];
  for (const r of rows) {
    const uk = tryAll(r.word, 'UK');
    const us = tryAll(r.word, 'US');
    if (uk && us) {
      updates.push({ id: r.id, uk_ipa: uk, us_ipa: us });
    } else {
      stillMissing.push(r);
    }
  }

  console.log(`[fill-ipa-pass2] Resueltos: ${updates.length}`);
  console.log(`[fill-ipa-pass2] Aún sin IPA: ${stillMissing.length}`);

  const upd = db.prepare('UPDATE words SET uk_ipa = ?, us_ipa = ? WHERE id = ?');
  const tx = db.transaction((items) => { for (const it of items) upd.run(it.uk_ipa, it.us_ipa, it.id); });
  tx(updates);

  if (stillMissing.length) {
    console.log(`\n[fill-ipa-pass2] Restantes:`);
    stillMissing.forEach(r => console.log(`  ${r.id.toString().padEnd(6)} ${r.word}`));
  }
  db.close();
}

main();
