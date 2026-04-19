'use strict';
/**
 * Asigna categorías a todas las palabras de voc.db.
 *
 * - A1:      mapa hardcoded de los topics Cambridge Pre-A1/A1
 * - A2, B1:  parsea el Appendix 2 de los PDFs oficiales de Cambridge
 * - B2-C2:   sin topics en los PDFs — se dejan como 'general'
 *
 * Uso: node scripts/assign-categories.js
 */

const path      = require('path');
const fs        = require('fs');
const { execSync } = require('child_process');
const Database  = require('better-sqlite3');

const DB_PATH   = path.join(__dirname, '..', 'data', 'voc.db');
const DATA_DIR  = path.join(__dirname, '..', 'data');

// ─── Mapeo topic Cambridge → categoría interna ───────────────────────────────
const TOPIC_TO_CAT = {
  'appliances':                                           'toys_and_technology',
  'clothes and accessories':                              'clothes',
  'colours':                                              'colours',
  'communication and technology':                         'toys_and_technology',
  'communications and technology':                        'toys_and_technology',
  'documents and texts':                                  'school',
  'education':                                            'school',
  'entertainment and media':                              'sports_and_leisure',
  'environment':                                          'weather_and_nature',
  'food and drink':                                       'food_and_drink',
  'health':                                               'body',
  'health, medicine and exercise':                        'body',
  'hobbies and leisure':                                  'sports_and_leisure',
  'house and home':                                       'the_home',
  'people':                                               'family_and_friends',
  'personal feelings, opinions and experiences':          'feelings',
  'personal feelings, opinions and experiences (adjectives)': 'feelings',
  'places and buildings':                                 'places',
  'services':                                             'places',
  'shopping':                                             'places',
  'sport':                                                'sports_and_leisure',
  'time':                                                 'numbers_and_time',
  'travel and transport':                                 'transport',
  'weather':                                              'weather_and_nature',
  'work and jobs':                                        'work',
};

// ─── Topics hardcoded para A1 (Pre-A1 Starters + A1 Movers) ─────────────────
const A1_TOPICS = {
  animals: [
    'animal','bear','bee','bird','bug','cat','chicken','cow','crocodile','dog',
    'donkey','duck','elephant','fish','fox','frog','giraffe','goat','hippo',
    'horse','lizard','monkey','mouse','panda','pet','sheep','snake','spider',
    'tail','tiger','zebra','zoo','bat','dolphin','kangaroo','jellyfish','kitten',
    'lion','parrot','penguin','polar bear','puppy','shark','snail','whale',
    'fly','insect','lamb','owl','rabbit','swan','wolf',
  ],
  body: [
    'arm','body','ear','eye','face','foot','hair','hand','head','leg','mouth',
    'nose','smile','wash','beard','blond','curly','moustache','neck','shoulder',
    'stomach','tooth','wing','back','bottom','hurt','ill','sick','cough',
    'earache','headache','stomach ache','toothache','temperature',
  ],
  clothes: [
    'bag','cap','boots','clothes','coat','dress','glasses','hat','jeans','shirt',
    'shoe','shorts','skirt','sock','trousers','t-shirt','wear','blanket','closet',
    'glove','helmet','jacket','leggings','pants','scarf','sweater','swimsuit',
    'towel','wardrobe','belt','pocket','pyjamas','uniform','boot',
  ],
  colours: [
    'black','blue','brown','colour','color','gray','green','grey','orange','pink',
    'purple','red','white','yellow','blond','dark','light',
  ],
  family_and_friends: [
    'baby','boy','brother','child','classmate','cousin','dad','family','father',
    'friend','girl','grandfather','grandma','grandmother','grandpa','kid','little',
    'live','man','mother','mum','mom','old','person','sister','woman','young',
    'aunt','daughter','granddaughter','grandparent','grandson','grown-up','son',
    'teenager','uncle','baby','big','people','wife','husband','twin','partner',
  ],
  feelings: [
    'angry','happy','sad','scared','scary','sorry','tired','afraid','bored',
    'boring','brave','brilliant','excited','exciting','naughty','surprised',
    'worry','great','fine','terrible','awful','fantastic','wonderful','ok',
    'asleep','awake','hungry','thirsty','cold','hot',
  ],
  food_and_drink: [
    'apple','banana','bean','bread','breakfast','burger','cake','candy','carrot',
    'cheese','chicken','chips','chocolate','coconut','dinner','drink','eat','egg',
    'fish','food','fruit','ice cream','juice','kiwi','lemon','lemonade','lunch',
    'mango','meat','meatballs','milk','orange','pea','pear','pie','pizza',
    'potato','rice','salad','sweet','tomato','watermelon','cabbage','cafe',
    'coffee','noodles','nuts','pancake','pasta','peach','pineapple','sandwich',
    'sauce','sausage','soup','sushi','tea','vegetable','meal','menu','cooking',
    'snack','recipe','flour','butter','sugar','salt','pepper','oil',
  ],
  the_home: [
    'bath','bathroom','bedroom','bed','bookcase','chair','cupboard','desk','door',
    'floor','garden','home','house','kitchen','lamp','room','shelf','sofa',
    'table','television','tv','wall','window','balcony','basement','bowl',
    'bottle','downstairs','elevator','lift','pot','rug','shower','upstairs',
    'living room','dining room','yard','roof','ceiling','stair',
    'closet','wardrobe','clean','tidy','mat','mirror','towel','blanket',
    'cushion','curtain','garage','hall',
  ],
  numbers_and_time: [
    'count','first','hundred','number','second','third','clock','time','hour',
    'minute','morning','afternoon','evening','night','today','yesterday',
    'tomorrow','monday','tuesday','wednesday','thursday','friday','saturday',
    'sunday','week','weekend','month','year','day','date','birthday','holiday',
    'always','never','often','sometimes','every','early','late','now','then',
    'when','at','before','after',
  ],
  places: [
    'beach','city','cinema','funfair','hospital','hotel','island','jungle','lake',
    'library','market','mountain','park','playground','pool','pond','river',
    'road','sand','sea','skate park','shopping centre','shopping mall',
    'sports centre','station','street','supermarket','town','village','waterfall',
    'bus station','bus stop','car park','ice rink','zoo','museum','cafe',
    'restaurant','shop','store','bank','post office','airport','port','farm',
    'forest','field','ground','world','country','countryside','place','area',
    'centre','center','square','corner','opposite','near','between',
  ],
  school: [
    'alphabet','answer','ask','board','book','bookcase','class','classroom',
    'correct','crayon','draw','english','eraser','find','keyboard','learn',
    'lesson','letter','listen','look','mouse','music','name','open','page',
    'paint','painting','pen','pencil','picture','point','question','read',
    'rubber','ruler','say','school','sentence','show','spell','stand','start',
    'stop','story','tablet','tell','tick','understand','write','test','exam',
    'homework','dictionary','notebook','teacher','student','pupil','subject',
    'geography','history','maths','science','art','pe','drama','project',
  ],
  sports_and_leisure: [
    'badminton','ball','basketball','bat','catch','climb','dance','drum',
    'football','goal','golf','hockey','hop','jump','kick','net','play',
    'practice','practise','ride','roller skates','roller skating','run','score',
    'sing','skateboard','skateboarding','skip','soccer','sport','swim',
    'swimming pool','swim shorts','swimsuit','table tennis','tennis',
    'tennis racket','throw','win','guitar','piano','trumpet','ice skating',
    'ice skates','bounce','exercise','match','race','team','game','hobby',
    'concert','festival','performance','competition','trophy','medal',
  ],
  toys_and_technology: [
    'balloon','bicycle','bike','camera','comic','comic book','computer','doll',
    'dragon','game','kite','laptop','model','phone','puzzle','robot','scooter',
    'skateboard','teddy','toy','train','video','video game','internet','email',
    'app','website','tablet','tv','television','text','message','call','chat',
    'photo','take','send','screen','keyboard','mouse',
  ],
  transport: [
    'bicycle','bike','boat','bus','car','drive','fly','helicopter','motorbike',
    'plane','ride','rocket','scooter','ship','station','taxi','train','tram',
    'travel','truck','van','ambulance','fire engine','bus stop','bus station',
    'car park','airport','port','journey','trip','ticket','road','map',
  ],
  weather_and_nature: [
    'cloud','cloudy','cold','dry','hot','rainbow','rain','snow','storm','sun',
    'sunny','temperature','warm','weather','wet','wind','windy','ice','lightning',
    'thunder','foggy','sky','moon','star','leaf','flower','grass','tree','plant',
    'rock','mountain','river','sea','lake','forest','jungle','desert','island',
  ],
  work: [
    'acrobat','builder','circus','cleaner','clown','cook','dancer','dentist',
    'doctor','driver','farmer','film star','movie star','nurse','painter',
    'pilot','player','scientist','singer','teacher','writer','actor','artist',
    'chef','engineer','firefighter','journalist','photographer','plumber','vet',
    'job','work','worker','office','factory','uniform',
  ],
  actions: [
    'bring','build','buy','carry','catch','change','climb','come','cook','cry',
    'dance','do','draw','dream','drink','drive','drop','eat','fall','feed','find',
    'fish','fix','fly','go','grow','help','hide','hop','hurt','invite','jump',
    'kick','know','laugh','learn','listen','live','look','lose','make','meet',
    'move','need','paint','pick up','play','point','put','put on','read','ride',
    'run','sail','say','see','send','sing','sit','skip','sleep','smile','speak',
    'spell','stand','start','stop','swim','take','talk','teach','tell','think',
    'throw','travel','try','understand','use','wait','wake','walk','want','wash',
    'watch','wave','wear','win','write','sell','drop','fix','hide','hop','bounce',
    'dive','exercise','score','train',
  ],
  descriptions: [
    'above','bad','badly','beautiful','big','brave','brilliant','busy','careful',
    'carefully','cheap','clean','clever','cold','curly','dangerous','dark',
    'difficult','different','down','dry','easy','excited','exciting','famous',
    'fantastic','fat','fine','funny','good','great','hard','huge','ill','kind',
    'large','last','little','long','lost','loud','loudly','lovely','lucky','mean',
    'more','most','much','near','new','next','nice','naughty','noisy','old',
    'only','other','out','outside','pretty','proud','quick','quickly','quiet',
    'quietly','really','right','round','safe','scary','short','sick','silly',
    'slow','slowly','small','smart','sorry','straight','strong','sure','surprised',
    'tall','terrible','thin','tired','ugly','warm','well','wet','wrong',
    'sad','angry','afraid','bored','boring','awful','wonderful',
  ],
  grammar: [
    'a','an','the','all','along','another','any','around','at','both','by',
    'down','every','he','her','him','his','how','i','in','inside','into','it',
    'its','me','my','no','nothing','of','off','on','only','or','other','our',
    'out','over','please','she','so','some','someone','something','sometimes',
    'than','that','their','theirs','them','there','these','they','this','those',
    'to','too','under','up','us','very','we','what','when','where','which','who',
    'whose','why','with','would','yes','you','your','yours','and','but',
    'because','if','then','also','well',
  ],
  miscellaneous: [
    'address','age','band','circle','difference','dream','everyone','everything',
    'information','machine','matter','mistake','noise','pair','paper','party',
    'part','plate','poster','present','shape','shell','shout','sign','song',
    'toothbrush','toothpaste','treasure','vacation','word','film','movie',
    'show','ticket','music','instrument','idea',
  ],
};

// ─── Parser de Appendix 2 de PDFs Cambridge (A2, B1) ─────────────────────────
const PAGE_NOISE = /^(©|Page \d|Cambridge|Preliminary|Key and Key|Schools|Vocabulary List|Appendix)/i;
const KNOWN_TOPICS = new Set(Object.keys(TOPIC_TO_CAT));

function isTopicHeading(line) {
  if (!line || line.length > 70) return false;
  if (PAGE_NOISE.test(line)) return false;
  // Multi-column word rows contain 2+ spaces between columns
  if (/\s{3,}/.test(line)) return false;
  // Must start with uppercase
  if (!/^[A-Z]/.test(line)) return false;
  const normalized = line.toLowerCase().replace(/[^a-z ,/()]/g, '').trim();
  return KNOWN_TOPICS.has(normalized);
}

function cleanWord(raw) {
  return raw
    .replace(/\(v\)|\(n\)|\(adj\)|\(adv\)|\(phr v\)|\(prep\)/gi, '')
    .replace(/\(n & v\)|\(adv & prep\)|\(det & pron\)/gi, '')
    .replace(/\s*\([^)]{0,20}\)\s*/g, ' ')
    .replace(/[^a-zA-Z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parsePdfTopics(pdfPath) {
  const wordToCat = {};
  if (!fs.existsSync(pdfPath)) return wordToCat;

  const text = execSync(`pdftotext -layout "${pdfPath}" -`, { maxBuffer: 20 * 1024 * 1024 }).toString();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const startIdx = lines.findIndex(l => /^Topic Lists$/.test(l));
  if (startIdx === -1) return wordToCat;

  let currentCat = null;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    if (isTopicHeading(line)) {
      currentCat = TOPIC_TO_CAT[line.toLowerCase().replace(/[^a-z ,/()]/g, '').trim()] || null;
      continue;
    }

    if (!currentCat) continue;
    if (PAGE_NOISE.test(line)) continue;

    // Split multi-column rows
    const tokens = line.split(/\s{2,}/);
    for (const token of tokens) {
      // Handle "word / variant" (e.g., "grey / gray", "jewellery / jewelry")
      const variants = token.split('/').map(s => s.trim());
      for (const variant of variants) {
        const w = cleanWord(variant);
        if (!w || w.length < 2 || w.split(' ').length > 3) continue;
        if (!/[a-z]/.test(w)) continue;
        // First category wins (avoids overwriting with a weaker topic)
        if (!wordToCat[w]) wordToCat[w] = currentCat;
      }
    }
  }

  return wordToCat;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const db = new Database(DB_PATH);
  const update = db.prepare('UPDATE words SET category = ? WHERE word = ? AND level = ?');
  const allWords = db.prepare('SELECT word, level FROM words').all();

  // Reset todo a 'general'
  db.prepare("UPDATE words SET category = 'general'").run();

  // ── A1: mapa hardcoded ──
  const a1Map = {};
  for (const [cat, words] of Object.entries(A1_TOPICS)) {
    for (const w of words) a1Map[w.toLowerCase()] = cat;
  }

  // ── A2 y B1: parseo de PDFs ──
  const pdfMaps = {
    A2: parsePdfTopics(path.join(DATA_DIR, 'A2_Key_Vocabulary.pdf')),
    B1: parsePdfTopics(path.join(DATA_DIR, 'B1_Preliminary_Vocabulary.pdf')),
  };

  const stats = {};
  for (const lvl of ['A1','A2','B1','B2','C1','C2']) stats[lvl] = { total: 0, categorized: 0 };

  for (const { word, level } of allWords) {
    stats[level].total++;
    const w = word.toLowerCase();
    let cat = null;

    if (level === 'A1') {
      cat = a1Map[w] || null;
    } else if (pdfMaps[level]) {
      cat = pdfMaps[level][w] || null;
    }

    if (cat) {
      update.run(cat, word, level);
      stats[level].categorized++;
    }
  }

  db.close();

  console.log('\n[cat] Resultado por nivel:');
  for (const [lvl, s] of Object.entries(stats)) {
    const pct = s.total ? Math.round(s.categorized / s.total * 100) : 0;
    console.log(`  ${lvl}: ${s.categorized}/${s.total} categorizadas (${pct}%)`);
  }

  // Distribución final
  const db2 = new Database(DB_PATH);
  const dist = db2.prepare("SELECT level, category, COUNT(*) as n FROM words GROUP BY level, category ORDER BY level, n DESC").all();
  db2.close();
  console.log('\n[cat] Distribución final:');
  let lastLevel = null;
  for (const { level, category, n } of dist) {
    if (level !== lastLevel) { console.log(`\n  ${level}:`); lastLevel = level; }
    console.log(`    ${n.toString().padStart(5)}  ${category}`);
  }
}

main();
