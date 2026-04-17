'use strict';
/**
 * Asigna categorías a las palabras de voc.db basándose en los topics
 * oficiales Cambridge (Pre A1 Starters + A1 Movers + A2 Flyers).
 *
 * Las categorías coinciden exactamente con los temas del PDF oficial.
 *
 * Uso: node scripts/assign-categories.js
 */

const path     = require('path');
const Database = require('better-sqlite3');
const DB_PATH  = path.join(__dirname, '..', 'data', 'voc.db');

// ─── Mapeo topic → palabras (Cambridge official topics) ───────────────────────
const TOPICS = {
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
    'living room','dining room','yard','roof','ceiling','stair','basement',
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
    'watch','wave','wear','win','write','bring','sell','buy','build','drop','fix',
    'hide','hop','invite','lose','move','sail','sit','sleep','wait','wake',
    'bounce','dive','exercise','kick','score','skip','train',
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
    'out','out of','over','please','she','so','some','someone','something',
    'sometimes','than','that','the','their','theirs','them','there','these',
    'they','this','those','to','too','under','up','us','very','we','what',
    'when','where','which','who','whose','why','with','would','yes','you',
    'your','yours','and','but','because','if','then','also','well',
  ],
  miscellaneous: [
    'ability','address','age','band','circle','difference','dream','etc',
    'everyone','everything','information','machine','matter','milkshake',
    'mistake','noise','pair','paper','pardon','part','party','pirate',
    'plate','pop star','poster','present','shape','shell','shout','sign',
    'song','toothbrush','toothpaste','top','treasure','vacation','word',
    'wow','hey','thank you','thanks','see you','well done','pardon',
    'film','movie','show','poster','ticket','band','music','instrument',
    'comic','comic book','idea','message','email','app','website',
  ],
};

// ─── Build word → category map ────────────────────────────────────────────────
const wordToCategory = {};
for (const [cat, words] of Object.entries(TOPICS)) {
  for (const w of words) wordToCategory[w.toLowerCase()] = cat;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const db = new Database(DB_PATH);

  // Reset all to 'general'
  db.prepare("UPDATE words SET category = 'general'").run();

  const update   = db.prepare('UPDATE words SET category = ? WHERE word = ?');
  const allWords = db.prepare('SELECT word FROM words').all();

  let updated = 0, unmatched = [];

  for (const { word } of allWords) {
    const cat = wordToCategory[word.toLowerCase()];
    if (cat) { update.run(cat, word); updated++; }
    else unmatched.push(word);
  }

  db.close();

  const total = allWords.length;
  console.log(`[cat] Total: ${total} | Con categoría: ${updated} | Sin categoría: ${unmatched.length}`);
  if (unmatched.length) {
    console.log(`[cat] Sin categoría (${unmatched.length}):`);
    console.log(unmatched.join(', '));
  }

  // Show distribution
  const db2 = new Database(DB_PATH);
  const dist = db2.prepare("SELECT category, COUNT(*) as n FROM words GROUP BY category ORDER BY n DESC").all();
  db2.close();
  console.log('\n[cat] Distribución:');
  for (const { category, n } of dist) console.log(`  ${n.toString().padStart(4)}  ${category}`);
}

main();
