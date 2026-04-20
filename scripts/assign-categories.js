'use strict';
/**
 * Asigna categorías a todas las palabras de voc.db.
 *
 * - A1:      mapa hardcoded de los topics Cambridge Pre-A1/A1
 * - A2, B1:  parsea el Appendix 2 de los PDFs oficiales de Cambridge
 * - Todas:   mapa universal de 5.700+ palabras únicas para máxima cobertura
 *
 * Uso: node scripts/assign-categories.js
 */

const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');
const Database     = require('better-sqlite3');

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

// ─── Mapa universal palabra → categoría (cubre A1-C2) ────────────────────────
// Función helper: añade todas las palabras de un array a la categoría dada
const UNIVERSAL = {};
function cat(category, words) {
  for (const w of words) UNIVERSAL[w.toLowerCase()] = category;
}

// GRAMMAR: palabras funcionales sin contenido semántico propio
cat('grammar', [
  // artículos
  'a','an','the',
  // pronombres personales
  'i','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their',
  'mine','yours','hers','ours','theirs',
  'myself','yourself','himself','herself','itself','ourselves','themselves',
  'this','that','these','those',
  // pronombres relativos/interrogativos
  'who','whom','whose','which','what',
  'whoever','whichever','whatever','wherever','whenever','however',
  // pronombres indefinidos
  'somebody','someone','something','somewhere',
  'anybody','anyone','anything','anywhere',
  'everybody','everyone','everything','everywhere',
  'nobody','no one','nothing','nowhere',
  'one','both','either','neither','each','each other',
  'another','other','others',
  // preposiciones
  'about','above','across','after','against','ago','along','amid','among',
  'among amongst','amongst','around','as','at','before','behind','below',
  'beneath','beside','besides','between','beyond','by','by accident',
  'by mistake','by hand','by name','close to','down','during','except',
  'for','from','in','in advance','in australia','in fact','in ink',
  'in love','in order','in pencil','in time','in two','inside',
  'instead','instead of','into','near','next to','of','off','on',
  'on fire','on purpose','on request','on sale','onto','opposite',
  'out','out of','outdoor','outdoors','outside','over','past','per',
  'since','through','throughout','till','to','toward','towards',
  'under','underneath','until','up','upon','via','with','within',
  'without','up to','apart from','alongside','amid',
  // conjunciones
  'although','and','as well','as well as','because','because of','but',
  'if','nor','or','so','than','that','though','unless','when','whereas',
  'whether','while','whilst','yet','owing to','due to','despite',
  // modales / auxiliares
  'am','are','be','been','being','can','cannot','could','do','does',
  'did','had','has','have','is','let','may','might','must','ought',
  'ought to','shall','should','was','were','will','would','need',
  'will \'ll',
  // determinantes
  'all','any','both','every','few','many','more','most','much','no',
  'only','several','some','such','various',
  // marcadores discursivos / adverbios funcionales
  'absolutely','actually','additionally','afterwards','again',
  'ago','all right','alright','almost','already','also',
  'altogether','always','anyhow','anyway','apart','approximately',
  'as well','at all','at first','at i','at last','at least','at once',
  'at present','away','badly','barely','basically','certainly',
  'certainly not','clearly','completely','consequently','currently',
  'definitely','directly','down','early','easily','else','enough',
  'especially','essentially','even','eventually','ever','everywhere',
  'exactly','finally','for','fortunately','frankly','freely','frequently',
  'further','furthermore','generally','gradually','hardly','here',
  'however','immediately','including','indeed','initially','just',
  'largely','last','late','lately','later','largely','least','luckily',
  'mainly','maybe','meanwhile','merely','moreover','mostly','much',
  'narrowly','naturally','nearly','necessarily','nevertheless','next',
  'nonetheless','not','now','nowadays','nowhere','obviously',
  'of course','often','once','only','otherwise','particularly',
  'perhaps','plus','pm','possibly','presumably','previously','probably',
  'properly','publicly','purely','quickly','quite','rather','readily',
  'really','reasonably','recently','regularly','respectively','round',
  'same','separately','shortly','similarly','simply',
  'simultaneously','so-called','so-so','somehow','somewhere','soon',
  'specifically','still','straight','suddenly','supposedly','surely',
  'than','then','therefore','though','together','too','totally',
  'twice','typically','ultimately','unfortunately','unless','until',
  'usually','very','well','whenever','wherever','yet','actually',
  'admittedly','albeit','altogether','broadly','commonly','considerably',
  'continuously','conveniently','efficiently','entirely','equally',
  'exceptionally','extensively','fairly','firmly','formally','fully',
  'genuinely','globally','honestly','independently','internally',
  'jointly','literally','loosely','markedly','partially','passionately',
  'permanently','personally','politically','positively','practically',
  'primarily','professionally','progressively','relatively','reliably',
  'reluctantly','remarkably','repeatedly','satisfactorily','selectively',
  'sensibly','significantly','specially','steeply','strategically',
  'subsequently','technically','temporarily','ultimately','universally',
  'voluntarily','wisely','moreover','notwithstanding','whereabouts',
  'efficiently','accordingly','firstly','secondly','lastly',
  'meaningfully','broadly','admittedly','culturally','deliberately',
  'evidently','accordingly','morally','emotionally',
  // expresiones sociales / interjecciones
  'all right','alright','best wishes','bye','congratulations',
  'dear','dear sir','excuse','good afternoon','good evening',
  'good morning','good night','goodbye','good-looking','hello',
  'hey','hi','madam','mr','mrs','ms','dr','oh','oh dear',
  'okay','ok','pardon','please','please note','poor thing','see you',
  'thank you','thankfully','thanks','welcome','well done','wow',
  'yeah','yes','you know','youre welcome','zero','cheers',
  'come on','at all',
]);

// ANIMALS: seres vivos
cat('animals', [
  'ant','aubergine'/*no - comida*/,'bat','bear','bee','beetle','bird',
  'bug','bull','butterfly','calf','camel','cat','cattle','cod',
  'crab','creature','crocodile','deer','dinosaur','dog','dolphin',
  'donkey','dove','duck','eagle','elephant','fish','fly','fox',
  'frog','giraffe','goat','gorilla','hippo','horse','insect',
  'jellyfish','kangaroo','kitten','lamb','leopard','lion','lizard',
  'monkey','mouse','owl','parrot','penguin','pet','pig','polar bear',
  'predator','puppy','rabbit','reptile','shark','sheep','snail',
  'snake','spider','swan','tiger','tortoise','wasp','whale','wolf',
  'worm','zebra','mammal',
]);

// BODY: partes del cuerpo, salud, medicina
cat('body', [
  'ache','addict','addicted','addiction','antibiotic','arm','bacteria',
  'beak','blind','blindness','blister','blood','blush','body',
  'bone','bra','brain','breath','bruise','bump','cell','cheek',
  'cheeks','chest','chew','cholesterol','chronic','circulation',
  'clinical','consciousness','contraception','contraceptive','cough',
  'crawl','cure','diarrhoea','digest','digestion','disease',
  'dna','drug','ear','elbow','eyebrow','eyelash','eyelid','eyesight',
  'faint','fever','fingernail','fingertip','flesh','foot',
  'gum','heal','health care','heart','heel','hip','hunger',
  'hungry','hygiene','hygienic','ill','illness','immune','immune system',
  'infection','infectious','injection','injury','jaw','kidney',
  'knee','kneel','knuckle','lip','liver','lung','medication',
  'moustache','nail','neck','nerve','nose','nostril','nutrition',
  'nutritional','nutritious','obesity','obese','organ','pain',
  'painful','palm','pregnancy','pregnant','pulse','rib','shave',
  'skin','skull','sleep','sneeze','snore','stomach','surgery',
  'surgeon','swallow','sweat','symptom','tear','thigh','throat',
  'thumb','toe','toenail','tongue','tooth','vaccination','vaccine',
  'vomit','waist','weight','wing','wound','wrist','x-ray',
  'pharmacist','therapist','therapy','counselling','counsellor',
  'cholesterol','fibre','protein','vitamin','calcium','heartbeat',
]);

// CLOTHES: ropa y accesorios
cat('clothes', [
  'accessory','bald'/*no*/,'bathing suit','belt','blanket'/*no*/,
  'blouse','boot','boots','bracelet','bra','cap','cardigan',
  'chain','cloth','clothing','collar','costume','cotton','dress',
  'earring','fashion','fold','garment','glasses','glove','handbag',
  'hat','hoodie','jacket','jeans','jewel','jewellery','jumper',
  'kit','knit','label','laundry','leather','leggings','linen',
  'make-up','material','necklace','old-fashioned','pants','pattern',
  'perfume','plastic','pocket','pullover','purse','raincoat','ring',
  'rucksack','scarf','shirt','shoes','shorts','silk','size',
  'sleeve','sock','suit','sunglasses','sweater','swimsuit',
  'tights','tie','tracksuit','trainers','trousers','t-shirt',
  'umbrella','underpants','underwear','uniform','vest','wallet',
  'wardrobe','watch','wool','zip','stripe','stripes','striped',
]);

// COLOURS: colores
cat('colours', [
  'beige','black','blonde','blue','brown','colour','color','copper',
  'cream','crimson','dark','golden','green','grey','gray','ivory',
  'light','navy','navy blue','olive','orange','pale','pink','purple',
  'red','silver','tan','transparent','turquoise','white','yellow',
]);

// DESCRIPTIONS: adjetivos, adverbios y sustantivos abstractos de cualidad
cat('descriptions', [
  'abandoned','abnormal','absence','absolute','abstract','absurd',
  'abusive','academic','accepted','acclaimed','accuracy','accurate',
  'active','actively','activity','adaptation','additional','adequate',
  'adequately','adjacent','adjustment','admiration','admitted',
  'adolescent'/*no - family*/,
  'adventurous','adverse','affectionate','affluent','aggressive',
  'aggressively','alarming','alike','alive','allege','alleged',
  'ambitious','ambiguous','ambiguity','amused','amusement','ancient',
  'animated','anonymous','anti-social','apparent','appalling',
  'appropriate','approximate','arrogant','artistic','asleep',
  'aspect','aspiration','assertive','astonished','astonishing',
  'astonishment','athletic','attached','authentic','automatic',
  'automatically','availability','available','average','awesome',
  'awful','awkward','bad','bad-tempered','balanced','bare',
  'basic','basics','beneficial','bestseller','better','bizarre',
  'bland','bleak','blind','bold','bossy','bothered','breathtaking',
  'brief','bright','brilliant','broadminded','broken','bulk','bulky',
  'calm','capable','capability','capacity','careless','carelessly',
  'carelessness','caring','cautious','certain','certainty','chaos',
  'chaotic','characteristic','charisma','charismatic','cheap',
  'cheerful','childish','clear','clinical','closed','closely',
  'closeness','clumsy','clumsiness','coincidence','colourful',
  'comfortable','committed','common','comparative','competitive',
  'complex','complexity','complicated','compulsive','concerned',
  'confident','constant','constructive','contemporary','convenient',
  'convincing','cool','cooperative','cowardly','crazy','craziness',
  'creative','credibility','critical','crude','cruel','cruel',
  'curly','current','cutting-edge','cynical','damaged','dangerous',
  'dazzling','dead','decent','decisive','dedicated','deep','definite',
  'definitive','delicate','demanding','dense','desperate','determined',
  'devoted','direct','dirty','disabled','distinct','distinctive',
  'disturbing','diverse','dizzy','domestic','doubtful','dramatic',
  'drastic','dreadful','dry','dull','dynamic','eager','eagerness',
  'economic','economical','educated','effective','efficiently',
  'elaborate','elegant','elegance','elite','emotional','emotionally',
  'empty','energetic','enormous','entire','equal','equality','essential',
  'evident','evil','exceptional','exclusive','exhausting','exhaustive',
  'exotic','extreme','extraordinarily','extraordinary','extravagant',
  'fabulous','fair','fake','false','familiar with','fantastic',
  'fascinating','fashionable','fat','faultless','faulty','fierce',
  'filthy','fine','finite','fixed','flair','flat','flawed','flawless',
  'flexible','fluent','fond','foolish','forceful','fortunate',
  'fragile','fragrant','fresh','frustrated','frustrating','full',
  'functional','furious','general','generous','genuine','gifted',
  'glad','global','gorgeous','grand','grateful','great','greedy',
  'gripping','gross','grumpy','hard','hard-working','hard wood',
  'harmful','harmless','harsh','healthy','heavy','hectic','helpless',
  'heroic','hierarchical','high','hilarious','hollow','holy',
  'homogenous','honest','hopeful','hopeless','hostile','huge',
  'humble','humorous','identical','idealistic','illegal','imaginary',
  'imaginative','immediate','immense','imminent','immoral','immortal',
  'imperfect','impolite','impressive','inappropriate','inconsiderate',
  'incredible','independent','industrious','inexperienced','infinite',
  'influential','informative','inhuman','innovative','insane',
  'insecure','insensitive','insignificant','instant','intact',
  'intense','intriguing','intrinsic','irrational','irritating',
  'isolated','jealous','keen','kind','kindness','known','large',
  'lavish','lazy','lethal','lively','logical','lonely','loyal',
  'lucrative','luxurious','mad','magnificent','main','major',
  'malicious','marvellous','massive','mature','meaningful','merciful',
  'merciless','meticulous','mighty','mild','minimal','modest',
  'monotonous','motivated','mysterious','naive','naked','nasty',
  'natural','narrow','negative','nervous','new','obvious',
  'odd','outstanding','overall','overwhelming','painful',
  'paramount','passive','pathetic','peaceful','peculiar','perfect',
  'permanent','pessimistic','petty','phenomenal','physical','plain',
  'pointless','poisonous','polite','political','popular','positive',
  'potential','powerful','practical','precious','precise','primitive',
  'private','problematic','productive','prominent','protective',
  'proud','psychological','pure','radical','rare','rational',
  'reckless','redundant','reliable','reluctant','remarkable',
  'repetitive','reserved','resourceful','responsible','restless',
  'rewarding','ridiculous','rigid','risky','rocky','romantic',
  'rotten','rough','royal','rude','rusty','sacred','sane',
  'sarcastic','selfish','sensational','sensible','sensitive',
  'serene','serious','severe','shallow','shaky','sharp',
  'shocked','shocking','short','shrewd','significant','silent',
  'silly','skilled','skilful','slight','slim','slippery',
  'smart','smooth','sophisticated','spacious','spectacular',
  'spiritual','splendid','stable','stale','state-of-the-art',
  'steady','steep','stiff','strict','striking','strong','stuck',
  'stubborn','stubbornness','stunning','stylish','subjective',
  'substantial','successful','suitable','superb','superficial',
  'supernatural','supportive','suspicious','swift','symbolic',
  'systematic','tactful','tactless','talented','talkative',
  'tasteful','tasteless','technical','technological','tedious',
  'temporary','terrific','terrified','terrifying','thorough',
  'thoughtful','thoughtless','time-consuming','tired','traditional',
  'tragic','tranquil','transparent','tremendous','troubled',
  'trustworthy','typical','ugly','unaware','unbalanced',
  'uncertain','uncommon','unconditional','unconscious','unusual',
  'unique','universal','urban','urgent','useful','useless','vague',
  'valuable','various','vast','violent','virtual','vivid','vulnerable',
  'weak','wealthy','weird','wild','willingness','wise','witty',
  'wonderful','worthless','worthy','worthwhile','wretched',
  'wrinkled','wrong','young',
  // sustantivos abstractos de cualidad
  'ability','advantage','anger','annoyance','anxiety','appearance',
  'argument','assurance','attitude','awareness','beauty','behaviour',
  'belief','character','chaos','choice','comfort','complexity',
  'concept','condition','confidence','conflict','consequence',
  'controversy','courage','creativity','criticism','curiosity',
  'damage','darkness','deadline','depth','detail','determination',
  'difference','difficulty','dilemma','dignity','disadvantage',
  'discipline','discomfort','disgrace','dishonesty','disorder',
  'distinction','emotion','emphasis','energy','equality','evidence',
  'evolution','existence','experience','failure','fame','fault',
  'feature','feedback','feeling','feelings','flexibility','focus',
  'freedom','friendship','frustration','generosity','glory','grace',
  'greed','grief','growth','guilt','habit','happiness','hardship',
  'harmony','hatred','honesty','honour','hope','humanity','humility',
  'humour','hunger','identity','ignorance','illusion','imagination',
  'impact','importance','impossibility','impression','improvement',
  'independence','inequality','influence','injustice','innocence',
  'inspiration','instance','intelligence','intention','interest',
  'intrusion','jealousy','joy','justice','kindness','knowledge',
  'laughter','liberty','logic','loneliness','loyalty','luck',
  'maturity','meaning','memory','mentality','merit','mess','modesty',
  'mood','morality','motivation','mystery','nervousness','novelty',
  'opportunity','optimism','option','origin','passion','patience',
  'peace','penalty','perfection','permission','perseverance',
  'personality','perspective','poverty','pride','priority','privacy',
  'probability','productivity','progress','promise','property',
  'prosperity','protection','publicity','purpose','quality',
  'quality','reality','reason','recognition','recovery','relief',
  'reputation','resistance','respect','responsibility','reward',
  'richness','right','risk','routine','sadness','safety','satisfaction',
  'security','self-awareness','self-esteem','self-respect','sense',
  'sensitivity','silence','simplicity','skill','solitude','sorrow',
  'soul','spirit','stability','stamina','standard','strength',
  'stress','style','success','suggestion','support','surprise',
  'survival','sympathy','talent','tension','tolerance','tradition',
  'trust','truth','uncertainty','understanding','unity','value',
  'violence','virtue','vision','vitality','weakness','wealth',
  'wisdom','wonder',
]);

// FEELINGS: emociones y estados psicológicos
cat('feelings', [
  'admire','affection','afraid','aggression','alarm','amazed',
  'amazement','ambition','anger','annoy','annoyance','anticipation',
  'anxiety','anxious','ashamed','awe','awe','biased','bored',
  'care','concern','confidence','contempt','craving','curiosity',
  'dare','delight','depression','desire','despair','disappointment',
  'discomfort','dislike','dismay','disgust','disillusion',
  'distress','distressed','doubt','dread','eager','eagerness',
  'embarrassment','empathy','envy','excitement','exhausted','faith',
  'fascinated','fascination','fear','fearful','fearless','fed up',
  'fond','frustrated','frustration','grief','guilt','guilty',
  'happiness','hate','hatred','hope','hopeful','horror','hunger',
  'jealousy','joy','kindness','loathe','loathing','loneliness',
  'longing','love','mercy','misery','mood','morale','motivation',
  'nostalgia','nostalgic','optimism','passion','patience','petrified',
  'pity','pleasure','pride','rage','regret','relief','remorse',
  'resentment','sadness','satisfaction','scared','scare','shame',
  'shyness','sorrow','stressed','stressful','sympathy','terror',
  'thirst','trust','worry','yearn','wonder','enthusiasm',
  'enthusiastic','excited','exciting','terrified','thrilled',
  'thrilling','miserable','upset','nervous',
]);

// FAMILY_AND_FRIENDS: personas, relaciones, grupos sociales
cat('family_and_friends', [
  'acquaintance','adolescent','adult','ally','ambassador','ancestor',
  'aunt','babysit','baby','boy','boyfriend','bride','brother',
  'brother-in-law','champion','citizen','civilian','classmate',
  'colleague','companion','cousin','crowd','dad','daughter',
  'daughter-in-law','elder','elderly','family','father',
  'father-in-law','fellow','female','friend','girl','girlfriend',
  'granddad','grandfather','grandma','grandmother','grandpa',
  'grandparent','grandson','granddaughter','granny','groom','guy',
  'husband','kid','kids','lady','lad','leader','male','man',
  'mate','mother','mother-in-law','mum','nephew','niece','nurse',
  'orphan','parent','partner','people','person','prince','princess',
  'roommate','scientist','sister','sister-in-law','son','son-in-law',
  'stepfather','stranger','teenager','uncle','victim','warrior',
  'widow','wife','woman','youngster','youth','twin','relative',
  'sibling','toddler','infant','peasant','pensioner','resident',
  'refugee','immigrant','tenant','volunteer','couple','bride',
  'prisoner','spy','worker','trainer','trainee',
]);

// FOOD_AND_DRINK: comida, bebida, cocina
cat('food_and_drink', [
  'alcohol','alcoholic','appetising','aubergine','bakery','banana',
  'bean','beef','berry','bitter','blend','boil','bun','butter',
  'cake','canned','catering','casserole','cherry','chew','chop',
  'cod','coffee','cook','cookie','cooking','crab','cream','crisp',
  'crop','dairy','decaffeinated','diet','dish','dough','drink','eat',
  'egg','fast food','fatty','feast','fish','flavour','flour',
  'food','fresh','fridge','fruit','grill','grilled','harvest',
  'herb','ingredient','jam','juice','junk food','leek','loaf',
  'lunchtime','meal','menu','milk','mint','mushroom','mustard',
  'noodles','nut','olive','pancake','pasta','pastry','peach',
  'peas','peel','pie','pineapple','pizza','popcorn','pork',
  'potato','pour','prawn','protein','pudding','recipe','rice',
  'roast','salad','salt','sauce','sausage','seed','snack','soup',
  'spice','supper','sweet food','sweets','soya','stir','sugar',
  'taste','tasty','tea','teaspoon','toast','tomato','vanilla',
  'vegetable','vinegar','water','wheat','wine','yoghurt','yummy',
  'cutlery','spoon','cooker','oven','grill','frying pan',
]);

// NUMBERS_AND_TIME: números, tiempo, fechas
cat('numbers_and_time', [
  'age','aged','alarm clock','anniversary','amount','annual',
  'annually','april','august','average','billion','calendar',
  'century','centigrade','clock','date','day','daylight','daytime',
  'december','decade','delay','duration','early','eighty','era',
  'february','fifty','first','first name','first prize','first then',
  'fortnight','forty','friday','future','generation','gramme',
  'hour','hourly','hundred','inch','january','july','june','last',
  'life','lifetime','long','lunchtime','march','may','midday',
  'midnight','mile','millennium','minute','monday','month',
  'morning','nighttime','ninety','nine','number','november',
  'o\'clock','october','past','percent','percentage','period',
  'point','pm','quarter','rate','ratio','second','september',
  'seventy','sixty','sunday','temperature','term','third',
  'thirty','thousand','thursday','timetable','timing','today',
  'today\'s date','tomorrow','tuesday','twenty','twice','wednesday',
  'week','weekend','year','zero','decade','season','schedule',
  'milestone','frequency','interval','duration',
]);

// PLACES: lugares, geografía, edificios
cat('places', [
  'accommodation','apartment building','arch','area','avenue',
  'bakery','barn','bay','block','bridge','building','cabin',
  'capital','cathedral','cave','cemetery','centre','chapel',
  'cinema','city','coast','coastal','coastline','community',
  'corner','corridor','council','countryside','county','crossing',
  'crossroads','district','domain','doorway','downtown','entrance',
  'escalator','estate','forest','frontier','gallery','graveyard',
  'ground','grounds','gym','harbour','headquarters','home',
  'hotel','house','hut','island','jungle','kingdom','lake',
  'landmark','lane','location','lounge','mansion','market',
  'mine','monument','mountain','museum','neighbourhood','nightclub',
  'north','northeast','northwest','office','outskirts','passage',
  'pavement','parking','platform','playground','pond','pool',
  'port','province','region','republic','restaurant','road',
  'route','salon','school','shopping','shopping centre','shore',
  'site','south','southeast','southwest','space','square',
  'stadium','stairs','staircase','statue','storey','street',
  'suburb','supermarket','terrace','territory','town','track',
  'universe','village','warehouse','ward','yard','zone',
  'arid','region','republic','rural','urban','residential',
  'apartment','flat','loft','cellar','basement','balcony',
  'semi-detached','slope','trail','waterfall','wilderness',
  'river','ocean','sea','field','meadow','woodland','forest',
]);

// THE_HOME: hogar, muebles, objetos domésticos
cat('the_home', [
  'appliance','armchair','balcony','bath','bathtub','bed','bin',
  'blanket','blind','bookcase','booklet','bowl','brick','broom',
  'brush','bulb','cabinet','carpet','ceiling','chimney','chore',
  'closet','cloth','cooker','corner','cupboard','curtain',
  'cushion','desk','door','doorbell','drawer','duvet','electricity',
  'fridge','furniture','garage','garden','hall','heating',
  'hook','iron','ironing','kettle','kitchen','lamp','laundry',
  'lawn','light switch','lighter','living room','lock','loft',
  'lounge','mat','mattress','microwave','mirror','oven','paint',
  'pillow','plug','pot','rack','refrigerator','roof','rug',
  'shelf','shower','sink','sofa','stairs','stool','storage',
  'table','tap','toilet','towel','washing machine','washing-up',
  'window','yard','counter','cosy',
]);

// TOYS_AND_TECHNOLOGY: tecnología, medios, gadgets
cat('toys_and_technology', [
  'algorithm','answerphone','app','application','artificial intelligence',
  'battery','blog','bookmark','broadband','broadcast','browser',
  'calculator','camera','cd player','channel','chat','chatroom',
  'click','code','computer','connection','database','desktop',
  'device','digital','digital camera','disc','disk','download',
  'dvd player','electric','electronic','electronics','email',
  'equipment','file','folder','gadget','graphic','graphics',
  'hard drive','headphones','icon','internet','invention',
  'keyboard','laptop','laptop computer','link technology',
  'media','memory','microphone','mobile phone','mouse',
  'mp3 player','network','online','password','phone',
  'photograph','photography','printer','program','programme',
  'programming','radio','record','robot','screen','social media',
  'software','tablet','telephone','television','television tv','text',
  'text message','upload','video','video game','virtual reality',
  'website','web','webcam','wifi','youtube','zoom',
  'telescope','thermometer','x-ray','scanner',
]);

// TRANSPORT: vehículos e infraestructura de viaje
cat('transport', [
  'aeroplane','aircraft','ambulance','arrival','arrive',
  'baggage','bike','bicycle','boat','brake','bumper',
  'bus','cabin','captain','cargo','carriage','car','clutch',
  'commute','cruise','cycle','departure','drive','dvd player'/*no*/,
  'engine','ferry','flight','fuel','helicopter','highway',
  'journey','landing','lane','lorry','map','motorcycle',
  'motorist','parking','parachute','passenger','pilot','plane',
  'port','rail','road','rocket','route','runway','sail',
  'seat belt','ship','shuttle','station','steering wheel',
  'stopover','subway','taxi','ticket','timetable','track',
  'traffic','train','tram','transport','transportation','travel',
  'trip','truck','underground','underground trains','van','vehicle',
  'voyage','yacht','airport','bus stop','bus station','car park',
  'fire engine','ice rink',
]);

// WEATHER_AND_NATURE: tiempo atmosférico, naturaleza, medio ambiente
cat('weather_and_nature', [
  'acid','agriculture','air','arid','atmosphere','atom','bacteria',
  'bay','biological','carbon','carbon dioxide','carbon footprint',
  'carbon monoxide','centigrade','climate','climate change',
  'cloud','cloudy','coal','coastal','coastline','cold','conservation',
  'copper','crop','cultivation','daylight','desert','drought',
  'dust','dusty','earthquake','ecology','ecologically','ecological',
  'electrician','electricity','element','emission','endangered',
  'energy','environment','environmentally','environmentally friendly',
  'environmentalist','erosion','eruption','explosion','extinct',
  'extinction','farming','field','fire','flood','flower','fog',
  'foggy','forest','frost','gas','genetics','geology','global warming',
  'grass','habitat','harvest','heat','hurricane','ice','island',
  'jungle','lake','landscape','leaf','lightning','mammal',
  'mineral','mist','misty','moon','moonlight','mountain','mud',
  'muddy','nature','natural','ocean','oil','organic','oxygen',
  'ozone','pine','plant','pollution','pond','predator','rainbow',
  'rain','river','rock','sand','sea','seed','soil','species',
  'star','storm','stormy','stream','sun','sunlight','sustainable',
  'sustainability','thunder','thunderstorm','tide','toxic','tree',
  'vegetation','volcano','water','waterfall','wave','weather',
  'weather forecast','weed','wild','wilderness','wildlife','wind',
  'windy','woodland','world','solar','lunar','geothermal',
  'biodiversity','endangered','fertilizer','pesticide',
]);

// WORK: trabajo, negocio, economía, política, sociedad
cat('work', [
  'account','accountant','accounting','administration','administrative',
  'administrator','advertising','adviser','agency','agenda','agent',
  'agriculture','agreement','air force','allocate','allocation',
  'allowance','ambassador','ambition','amendment','apply','appoint',
  'appointment','approval','approve','architecture','army','arrest',
  'asset','assignment','assist','assistance','association','auction',
  'authority','authorize','award','bakery','bank','bank account',
  'banker','banking','bankrupt','bid','bonus','brand','broadcast',
  'budget','bureaucracy','burglar','burglary','business','buyer',
  'campaign','candidate','capitalism','capitalist','captain','career',
  'catering','celebrity','ceremony','chancellor','charity','checkout',
  'claim','client','closure','collaborate','collaboration','commerce',
  'commercial','committee','commodity','commute','company','compete',
  'competitor','complaint','construction','consultant','consultation',
  'consumer','contract','corporation','corruption','cost',
  'council','coup','craft','crew','crime','criterion','database',
  'deadline','deal','dealer','debit','debit card','debt','decision',
  'declaration','defence','deficit','delegation','democracy',
  'demonstrate','demonstration','design','developer','development',
  'diplomat','diplomatic','director','discount','dispute','distribute',
  'distribution','document','donation','donor','duty','earn',
  'earnings','economist','economy','edition','educate','elect',
  'election','employer','employment','enterprise','entertainment',
  'episode','estate','evaluate','evaluation','evidence','executive',
  'expansion','expense','expenses','expenditure','expert','exploit',
  'export','facility','fee','finance','financial','firefighter',
  'fisherman','fund','funding','gain','gardener','government',
  'grant','guarantee','immigration','income','independence',
  'industry','inflation','infrastructure','inquiry','institute',
  'institution','insurance','invest','investigation','investment',
  'investor','journalism','journalist','judge','jury','justice',
  'labour','law','lawyer','leader','leadership','lecture','lecturer',
  'legislation','licence','loan','lobby','lottery','magistrate',
  'management','manufacturer','manufacturing','market','mayor',
  'media','membership','minister','ministry','mission','monopoly',
  'nomination','officer','official','operate','operator','opportunity',
  'organisation','organise','output','parliament','partnership',
  'pension','pensioner','permit','personnel','pharmacist',
  'philosopher','photography','pilot','plan','planning','police',
  'police car','policy','politician','politics','population',
  'post','poverty','power','premium','presentation','press',
  'prison','producer','product','production','profession',
  'professional','profile','profit','programme','progress',
  'prohibition','project','promotion','property','proposal',
  'prosecute','prosecution','psychiatrist','publication','publicity',
  'publish','purchase','qualification','qualify','rate','receipt',
  'recruitment','reduction','redundancy','redundant','reference',
  'reform','registration','regulation','reign','research','resign',
  'resignation','resort','resource','retail','retailer','retirement',
  'revolution','reward','robbery','rule','ruler','sack','sale',
  'salary','savings','schedule','scheme','scholarship','secretary',
  'security','self-catering','seminar','senior','series',
  'service','settlement','shareholder','solicitor','sponsorship',
  'spokesman','spokesperson','statistics','stock','stock market',
  'strategy','strike','studio','success','supplier','supply',
  'support','surgery','survey','sustainability','takeover',
  'target','tax','taxpayer','teamwork','technology','terrorism',
  'terrorist','theft','tourism','tournament','trade','trader',
  'traffic','trial','tuition','turnover','unemployment','union',
  'unit','vacancy','value','venture','verdict','wages','welfare',
  'workaholic','workforce','workplace','workshop','world',
]);

// SCHOOL: educación, aprendizaje, materias
cat('school', [
  'ability','accent','algebra','analysis','analogy','anatomy',
  'apostrophe','assignment','astronomy','atom','author',
  'background','bracket','brainstorm','calculation','calligraphy',
  'chemistry','chapter','circular','class','classmate','classification',
  'classify','clause','collocation','column','comma','competence',
  'composition','concentrate','concept','consonant','context',
  'course','curriculum','debate','description','detective',
  'diagram','dictionary','diploma','discussion','dissertation',
  'documentary','document','drama','economics','edition','education',
  'educational','effect','element','engineer','engineering',
  'equation','essay','evaluate','examination','examiner','exclamation mark',
  'experiment','expert','explanation','exploration','exposure',
  'fiction','first language','fluency','fluent','formula','full stop',
  'geography','grammar','gramme','graphic','guidebook',
  'historian','historical','history','homework','hyphen','hypothesis',
  'idiom','index','information','initial','instruction','integration',
  'inverted commas','issue','jargon','knowledge','laboratory lab',
  'language','learner','learning','lecture','lecturer','lesson',
  'linguistic','literacy','literate','literature','mark',
  'maths','mathematics','meaning','method','model','museum',
  'native speaker','notebook','notepaper','novel','novelist','nursery',
  'objective','organic','orientation','origin','painting','paragraph',
  'pencil','pencil case','physics','poetry','presentation',
  'primary','principle','print','professor','project','proper noun',
  'psychology','publication','punctuation','qualification','qualify',
  'reading','rectangle','register','rehearsal','repetition',
  'reporter','research','revision','rhetoric','ruler','scholarship',
  'schoolchild','school work','science','science fiction','scissors',
  'scroll','secondly','semicolon','seminar','sentence','session',
  'sketch','skill','sociology','solution','source','specific',
  'speculation','speech','spelling','statistic','statistical',
  'stereotype','story','student','subject','subtraction','suffix',
  'syllabus','technology','tertiary','textbook','theme','theory',
  'thermometer','thesis','topic','tuition','vocabulary','vowel',
  'writing','written','year',
]);

// SPORTS_AND_LEISURE: deportes, hobbies, entretenimiento, música, arte
cat('sports_and_leisure', [
  'adventure','album','amateur','art','artistic','athletics',
  'audition','badge','ball','band','biography','cable','camp',
  'carnival','cast','celebrate','celebration','cello','chess',
  'choir','cinema','circus','classical','climbing','club','coach',
  'coaching','collection','collector','comedy','competition',
  'concert','contestant','craft','crew','dance','dancing',
  'disco','discotheque','documentary','drama','drum','entertainment',
  'entertainer','episode','event','exercise','extreme sport',
  'festival','fiction','film','flute','folk','fun','gallery',
  'game','going out','golf','guitar','gym','gymnastic','hobby',
  'ice skating','instrument','journalism','kit','leisure',
  'lyrics','magazine','marathon','martial art','match','medal',
  'melody','movie','music','musician','nightclub','orchestra',
  'orchestral','painting','parade','pastime','performance',
  'photography','piano','player','poetry','pop','poster',
  'practice','practise','quiz','race','rehearsal','rehearse',
  'ride','role','rowing','rugby','sailing','score','serial',
  'show','sing','singing','skateboarding','skating','ski','skiing',
  'souvenir','spectator','splash','sport','star','surfer',
  'surfing','swim','swimmer','swimming','symphony','team',
  'theatre','thriller','ticket','tour','tourism','tournament',
  'training','trekking','trio','trophy','tune','violin','windsurfing',
  'winner','workshop','yacht','yoga',
]);

// MISCELLANEOUS: palabras que no encajan bien en ninguna categoría
cat('miscellaneous', [
  'ability'/*ya en descriptions*/,'advice','affair','aim','alarm',
  'alert','allowance','aluminium','anchor','anniversary','arrow',
  'aside','aspect','attitude','badge','bargain','bark','barrier',
  'basis','bat','battle','beam','belongings','blade','bullet',
  'bundle','burial','buzz','cardboard','case','category','caution',
  'circle','circumstance','clue','code','combination','comfort',
  'compound','concept','content','copyright','customs','detail',
  'device','difference','direction','disaster','display','document',
  'dose','draft','earth','error','etc','event','example','exchange',
  'experiment','explanation','facility','fact','figure','fit',
  'flag','format','fortune','frame','function','glass','goal',
  'grain','guidebook','horn','information','instance','item',
  'label','lack','limitation','link','list','lottery','lump',
  'machine','matter','medium','message','mess','method','milestone',
  'mixture','model','nail','network','note','nuisance','option',
  'outline','output','overview','pack','package','pair',
  'passage','path','phrase','piece','pirate','pile','pin',
  'plan','plot','point','policy','post','poster','problem',
  'procedure','product','program','promise','proof','purpose',
  'puzzle','quality','question','range','result','review',
  'risk','role','round','rule','sample','saying','series',
  'sign','source','stage','statement','stuff','summary','supply',
  'symbol','system','thing','tip','title','topic','type',
  'unit','value','variety','version','view','wave',
]);

// ─── EXPANSIÓN MASIVA: animales, comida, cuerpo, ciencia, tecnología, etc. ───

cat('animals', [
  // mamíferos
  'aardvark','alpaca','antelope','ape','armadillo','baboon','badger',
  'bat','beaver','bison','boar','buffalo','bull','caribou','cheetah',
  'chipmunk','coyote','dingo','elk','ferret','fox','gazelle','gerbil',
  'gnu','gopher','gorilla','grizzly','groundhog','hamster','hare',
  'hedgehog','hippopotamus','hyena','jackal','jaguar','kangaroo',
  'koala','lemur','leopard','llama','lynx','manatee','mink','mole',
  'mongoose','moose','mule','musk ox','opossum','orangutan','otter',
  'panther','platypus','porcupine','prairie dog','puma','raccoon',
  'ram','reindeer','rhinoceros','sea lion','seal','skunk','sloth',
  'squirrel','stoat','tapir','tiger','vole','walrus','warthog',
  'weasel','wildebeest','wolverine','wombat','yak',
  // aves
  'albatross','blackbird','canary','condor','crane','crow','cuckoo',
  'dove','finch','flamingo','goose','gull','hawk','heron','humming',
  'ibis','kestrel','kingfisher','kiwi','lark','magpie','nightingale',
  'osprey','ostrich','peacock','pelican','pheasant','pigeon','puffin',
  'quail','raven','robin','rooster','seagull','sparrow','starling',
  'stork','swallow','toucan','turkey','vulture','wren','woodpecker',
  // reptiles y anfibios
  'alligator','chameleon','cobra','gecko','iguana','komodo','mamba',
  'newt','python','salamander','toad','viper','boa','asp',
  // peces e invertebrados
  'anchovy','barracuda','catfish','clam','clownfish','crawfish',
  'crayfish','eel','flounder','lobster','mussel','octopus','oyster',
  'perch','pike','piranha','plankton','prawn','salmon','sardine',
  'scallop','seahorse','shrimp','squid','starfish','swordfish',
  'trout','tuna','walrus','anchovy','herring','mackerel',
  // insectos y otros
  'aphid','caterpillar','centipede','cicada','cockroach','cricket',
  'dragonfly','earthworm','firefly','flea','gnat','grasshopper',
  'ladybird','locust','mantis','millipede','mosquito','moth','slug',
  'termite','tick','wasp','woodlouse',
  // términos generales
  'amphibian','arachnid','avian','canine','carnivore','colony',
  'crustacean','cub','feline','flock','foal','fowl','hatchling',
  'herbivore','herd','hibernation','hive','horn','hound','kit',
  'larvae','litter','mammal','marsupial','migration','molt','omnivore',
  'pack','paw','plumage','pod','pouch','predator','prey','primate',
  'pup','rodent','school','shoal','spawn','swarm','territory','tusk',
  'vertebrate','warm-blooded','wild','wildlife',
]);

cat('food_and_drink', [
  // frutas
  'apricot','avocado','blackberry','blueberry','cantaloupe','cherry',
  'clementine','coconut','cranberry','currant','fig','gooseberry',
  'grape','grapefruit','guava','honeydew','kiwi','kumquat','lime',
  'litchi','lychee','mango','melon','nectarine','papaya','passionfruit',
  'persimmon','plum','pomegranate','pomelo','quince','raspberry',
  'rhubarb','starfruit','strawberry','tangerine','watermelon',
  // verduras
  'artichoke','asparagus','beetroot','bok choy','broccoli','brussels',
  'cabbage','cauliflower','celery','chard','chicory','courgette',
  'cucumber','eggplant','endive','fennel','garlic','kale','kohlrabi',
  'leek','lettuce','mange','onion','parsley','parsnip','pea',
  'pepper','pumpkin','radish','shallot','spinach','squash','turnip',
  'watercress','yam','zucchini',
  // carnes y proteínas
  'bacon','brisket','chop','fillet','ham','lamb','liver','loin',
  'mince','mutton','offal','poultry','sirloin','steak','turkey',
  'veal','venison','anchovy','caviar','crab','crayfish','lobster',
  'mussel','oyster','prawn','salmon','sardine','scallop','shrimp',
  'squid','tuna','tofu','tempeh','seitan',
  // lácteos y huevos
  'brie','butter','camembert','cheddar','cottage','cream','feta',
  'gouda','gruyere','mozzarella','parmesan','ricotta','stilton',
  'whipped','yogurt',
  // pan y cereales
  'bagel','baguette','brioche','ciabatta','croissant','doughnut',
  'granola','muesli','muffin','pita','pretzel','rye','sourdough',
  'tortilla','waffle','wholemeal',
  // bebidas
  'ale','beer','bourbon','brandy','champagne','cider','cocktail',
  'espresso','gin','lager','latte','liqueur','mojito','prosecco',
  'rum','tequila','vodka','whiskey','whisky','gin','sake',
  // términos de cocina
  'bake','barbecue','baste','blanch','blend','boil','braise',
  'broil','caramelize','chop','dice','fillet','flambe','fry',
  'garnish','grate','grill','knead','marinate','mince','pickle',
  'poach','puree','roast','saute','season','sieve','simmer',
  'slice','smoke','steam','stew','stir','whisk',
  // condimentos y otros
  'basil','bay leaf','capers','cardamom','chilli','cinnamon','cloves',
  'coriander','cumin','curry','dill','ginger','herbs','horseradish',
  'ketchup','lemongrass','mayonnaise','nutmeg','oregano','paprika',
  'parsley','pepper','rosemary','saffron','sage','soy sauce','tarragon',
  'thyme','turmeric','wasabi','worcestershire',
  // postres y dulces
  'brownie','caramel','cheesecake','custard','fudge','gelatin',
  'gingerbread','glaze','icing','jam','jelly','macaron','macaroon',
  'meringue','mousse','parfait','praline','profiterole','shortbread',
  'sorbet','souffle','sponge','tiramisu','toffee','truffle','tart',
]);

cat('body', [
  // anatomía interna
  'abdomen','adrenaline','appendix','artery','bile','bladder','capillary',
  'cartilage','chromosome','colon','cortisol','diaphragm','duodenum',
  'endocrine','enzyme','esophagus','estrogen','femur','fibula','gland',
  'hormone','humerus','hypothalamus','insulin','intestine','larynx',
  'ligament','lymph','marrow','membrane','menopause','mucus','muscle',
  'neuron','ovary','pancreas','patella','pituitary','placenta','plasma',
  'platelet','prostate','puberty','radius','rectum','rib','sacrum',
  'scrotum','sinew','sinus','skeleton','spleen','sternum','synapse',
  'tendon','testosterone','thyroid','tibia','tonsil','trachea','ulna',
  'urethra','uterus','vein','vertebra','womb',
  // síntomas y condiciones
  'abscess','addiction','adhd','aids','allergy','anaemia','asthma',
  'autism','bipolar','bronchitis','cancer','cardiac','chronic',
  'cirrhosis','coma','concussion','constipation','dementia','diabetes',
  'diarrhea','epilepsy','fracture','gallstone','gastritis','gout',
  'haemorrhage','headache','hernia','hypertension','hypothermia',
  'incontinent','infection','infertility','inflammation','influenza',
  'insomnia','irritable','lupus','menstruation','migraine','nausea',
  'obesity','osteoporosis','paralysis','pneumonia','psoriasis',
  'schizophrenia','seizure','sprain','strain','stress','stroke',
  'tumor','ulcer','vertigo',
  // tratamientos y profesiones
  'acupuncture','anaesthetic','antibiotic','antidepressant','aspirin',
  'biopsy','chemotherapy','defibrillator','dialysis','dosage',
  'endoscopy','immunotherapy','incision','infusion','injection',
  'inoculation','insulin','laxative','morphine','painkiller',
  'paracetamol','physiotherapy','prescription','probiotic','radiation',
  'rehabilitation','sedative','steroid','stimulant','supplement',
  'transfusion','transplant','ultrasound','vaccine','x-ray',
  'cardiologist','dermatologist','endocrinologist','gastroenterologist',
  'gynaecologist','haematologist','neurologist','oncologist',
  'ophthalmologist','orthopaedic','paediatrician','pathologist',
  'psychiatrist','radiologist','rheumatologist','urologist',
]);

cat('science', [
  // física
  'acceleration','acoustics','aerodynamics','angular','buoyancy',
  'centripetal','coefficient','collision','compressibility','conductivity',
  'diffraction','dipole','displacement','dynamics','elasticity',
  'electromagnetic','electrostatics','entropy','equilibrium','friction',
  'impedance','inductance','inertia','insulator','interference',
  'luminosity','magnetism','mechanics','momentum','optics','oscillation',
  'pendulum','polarization','radioactivity','refraction','relativity',
  'resistance','resonance','semiconductor','spectrum','statics',
  'superconductor','thermodynamics','torque','turbulence','viscosity',
  'wavelength','work',
  // química
  'alcohol','aldehyde','alkane','alkene','alkyne','alloy','amino acid',
  'base','buffer','carbohydrate','catalyst','chromatography','colloid',
  'combustion','compound','condensation','corrosion','covalent',
  'crystallization','decomposition','displacement','distillation',
  'electrolysis','electrolyte','esterification','fermentation','fission',
  'halogen','hydrocarbon','hydrolysis','ionic','isomer','ketone',
  'lipid','mixture','molarity','mole','monomer','neutralization',
  'nucleophile','orbital','oxidation','ozone','peptide','phenol',
  'photon','polymerization','precipitation','protein','proton',
  'purification','radical','reaction','reduction','salt','solubility',
  'solute','solution','sublimation','substrate','titration',
  // biología
  'adaptation','allele','anaerobic','bacteria','biodegradable',
  'biome','biosphere','biotechnology','carnivore','cell','cellulose',
  'chlorophyll','chloroplast','chromosome','clone','cyanobacteria',
  'cytoplasm','decomposition','differentiation','digestion','diploid',
  'dominant','dormancy','ecosystem','embryo','endemic','enzyme',
  'eukaryote','evolution','excretion','fertilization','flagella',
  'flora','fossil','fungus','gamete','gene','genotype','germination',
  'habitat','haploid','herbivore','homeostasis','hybrid','immunity',
  'ingestion','inheritance','instinct','kingdom','larva','meiosis',
  'membrane','metabolism','microorganism','mitosis','mutation',
  'natural selection','nucleotide','nucleus','nutrient','organism',
  'osmosis','parasite','phenotype','photosynthesis','pollination',
  'predator','prokaryote','protein','receptor','reproduction',
  'respiration','ribosome','saprophyte','selective breeding',
  'symbiosis','taxonomy','translocation','transpiration','tropism',
  'vaccination','variation','vertebrate','virus','zygote',
  // matemáticas y estadística
  'algebra','algorithm','asymptote','binomial','calculus','circumference',
  'coefficient','combinatorics','denominator','derivative','diagonal',
  'differentiation','distribution','divisor','equation','exponent',
  'factorial','fraction','geometry','gradient','histogram','hyperbola',
  'hypothesis','inequality','infinity','integer','integral','intersection',
  'irrational','logarithm','matrix','mean','median','midpoint',
  'mode','modulus','multiple','numerator','parabola','parallel',
  'percentile','permutation','perpendicular','polynomial','prime',
  'probability','proof','proportion','quadrant','quotient','radius',
  'range','ratio','regression','remainder','root','sequence','series',
  'sigma','simultaneous','sine','skew','slope','square root',
  'standard deviation','statistic','subset','symmetry','tangent',
  'theorem','topology','transformation','trigonometry','variable',
  'variance','vector','vertex','volume',
]);

cat('law_and_crime', [
  // procedimiento judicial
  'acquittal','adjudication','admissible','affidavit','arraignment',
  'bailiff','certification','chambers','charge','citation','claim',
  'clemency','contempt','counsel','cross-examination','deposition',
  'detention','disposition','docket','enforcement','exoneration',
  'extradition','filing','garnishment','habeas','hearing','immunity',
  'impeachment','indictment','injunction','inquest','interrogation',
  'jurisdiction','litigation','mandate','motion','negligence','oath',
  'objection','ordinance','pardon','penal','plaintiff','pleading',
  'precedent','probate','proceedings','prosecution','restitution',
  'sentencing','settlement','statute','subpoena','summons',
  'testimony','tribunal','verdict','warrant','witness',
  // crímenes
  'abduction','arson','assassination','assault','blackmail','burglary',
  'bribery','counterfeiting','cybercrime','defraud','embezzlement',
  'extortion','felony','forgery','fraud','genocide','harassment',
  'homicide','identity theft','kidnapping','looting','manslaughter',
  'misdemeanor','money laundering','mugging','murder','perjury',
  'piracy','poaching','rape','robbery','shoplifting','smuggling',
  'stalking','theft','trespassing','vandalism','war crime',
  // policia y seguridad
  'constable','cop','detective','forensic','interrogation',
  'investigation','officer','patrol','perpetrator','police','sergeant',
  'sheriff','surveillance','suspect','undercover',
  // términos legales
  'affidavit','annulment','arbitration','breach','clause','compensation',
  'confidentiality','contract','copyright','covenant','damages',
  'defamation','disclaimer','enforcement','franchise','indemnity',
  'injunction','intellectual property','lawsuit','leasehold','liability',
  'libel','licensee','mediation','negligence','patent','penalty',
  'plaintiff','privilege','provision','slander','trademark','waiver',
]);

cat('military', [
  // rangos y personal
  'admiral','airman','battalion','brigadier','cadet','cavalry',
  'colonel','commando','conscript','corporal','general','gunner',
  'infantryman','lieutenant','major','marshal','mercenary','militia',
  'paratrooper','private','ranger','recruit','sergeant','sniper',
  'soldier','trooper','veteran',
  // armas y equipamiento
  'ammunition','armour','artillery','bazooka','bayonet','caliber',
  'cannon','carbine','cartridge','catapult','crossbow','detonator',
  'explosive','firearm','flamethrower','fragmentation','fuselage',
  'grenade','howitzer','launcher','magazine','mortar','munition',
  'pistol','projectile','radar','revolver','rifle','rocket','shrapnel',
  'slingshot','torpedo','turret',
  // vehículos militares
  'aircraft carrier','armored','battleship','bomber','corvette',
  'destroyer','fighter jet','frigate','helicopter','interceptor',
  'minesweeper','patrol boat','reconnaissance','stealth','submarine',
  'tank','transport',
  // operaciones y conceptos
  'ambush','armistice','assault','attrition','barrage','blockade',
  'bombardment','breach','ceasefire','counterattack','covert',
  'debriefing','deployment','disarmament','encirclement','flanking',
  'garrison','guerrilla','incursion','infiltration','insurgency',
  'invasion','maneuver','mobilization','occupation','offensive',
  'peacekeeping','propaganda','recon','reinforcement','retreat',
  'sabotage','siege','skirmish','sortie','stealth','strategy',
  'surrender','tactics','trench','warfare',
]);

cat('arts', [
  // música
  'acoustic','album','ambient','arrangement','ballad','bass','beat',
  'blues','broadcast','cadence','chord','chromatic','classical',
  'climax','composition','concerto','country','crescendo','debut',
  'diatonic','discography','dissonance','duet','electronic','ensemble',
  'forte','folk','funk','gospel','grunge','harmony','indie','interval',
  'jazz','lyrics','metal','minuet','notation','octave','operatic',
  'orchestration','overture','phrase','polyphony','pop','punk',
  'quartet','quintet','rap','recital','reggae','refrain','remix',
  'repertoire','requiem','rhythm','riff','rock','scale','score',
  'serenade','solo','sonata','soundtrack','suite','swing','symphonic',
  'tempo','timbre','tone','tremolo','trio','tune','vibrato','waltz',
  // artes visuales
  'abstract','acrylic','aesthetic','airbrush','allegory','anatomy',
  'animation','architect','baroque','brushstroke','charcoal','chiaroscuro',
  'collage','composition','contemporary','contrast','cubism','design',
  'digital','drawing','easel','engraving','etching','expressionism',
  'figurative','fresco','futurism','glaze','gouache','graphic',
  'illustration','impressionism','installation','kinetic','landscape',
  'lithograph','medium','minimalism','mural','neoclassical','palette',
  'pastel','perspective','pigment','portrait','printmaking','realism',
  'renaissance','sculpture','silhouette','sketch','still life','surrealism',
  'symbolism','tempera','texture','trompe','watercolour',
  // literatura
  'allegory','alliteration','anachronism','analogy','anecdote',
  'antagonist','anticlimaz','archetype','assonance','ballad','cliché',
  'climax','comedy','denouement','dialogue','epic','epilogue','epitaph',
  'foreshadowing','imagery','irony','juxtaposition','limerick','lyric',
  'memoir','metaphor','motif','novella','ode','omniscient','onomatopoeia',
  'oxymoron','parable','paradox','parody','pathos','personification',
  'plot','prologue','protagonist','prose','satire','simile','soliloquy',
  'sonnet','subplot','subtext','symbolism','synopsis','tragedy',
  // teatro y cine
  'auditorium','cinematography','costume','debut','dialogue','director',
  'documentary','encore','episode','genre','improvise','intermission',
  'monologue','narrator','pantomime','performance','playwright',
  'premiere','props','rehearsal','repertory','screenplay','script',
  'sequel','stage','subplot','understudy',
]);

cat('geography', [
  // países y regiones (vocabulario, no nombres propios)
  'african','alpine','amazonian','american','antarctic','arabian',
  'arctic','asian','atlantic','balkan','caribbean','caucasian',
  'central','coastal','colonial','continental','eastern','equatorial',
  'european','far east','iberian','insular','island','landlocked',
  'latin','mediterranean','middle east','northern','oceanic','pacific',
  'peninsular','polar','saharan','scandinavian','siberian','southern',
  'subcontinent','subtropical','tropical','western',
  // términos físicos
  'alluvial','altitude','archipelago','atoll','basin','bay','biome',
  'butte','cape','catchment','cliff','continent','contour','delta',
  'desert','dune','elevation','erosion','escarpment','estuary','fjord',
  'floodplain','geyser','gorge','glacier','gulf','habitat','headland',
  'hemisphere','highland','hill','inlet','interior','isthmus','lagoon',
  'landmass','latitude','lava','longitude','lowland','maquis',
  'maritime','marsh','meadow','mesa','monsoon','moor','peninsula',
  'permafrost','plain','plateau','promontory','ravine','reef',
  'ridge','savanna','shoreline','steppe','strait','swamp','tableland',
  'taiga','tundra','valley','watershed','wetland',
  // términos humanos
  'colonization','demography','emigration','ethnicity','geopolitics',
  'globalization','immigration','indigenous','megalopolis','migration',
  'nationalism','nomad','overpopulation','rural','settlement','suburb',
  'territory','township','urban','urbanization',
]);

cat('religion', [
  // conceptos espirituales
  'afterlife','agnostic','animism','asceticism','atonement','aura',
  'baptize','benediction','catechism','celestial','chakra','chant',
  'compassion','consecrate','conversion','covenant','creed','crusade',
  'deity','damnation','dharma','disciple','divine','divinity','dogma',
  'enlightenment','eternal','eternity','evangelist','exorcism','faith',
  'fundamentalism','grace','heresy','heretic','holy','icon','idol',
  'immortality','incarnation','infidel','karma','liturgy','martyrdom',
  'meditation','messianic','metaphysical','miracle','missionary',
  'monotheism','morality','mortal','mysticism','occult','ordination',
  'orthodoxy','paradise','paranormal','penance','polytheism',
  'prophecy','prophet','purgatory','rapture','reincarnation',
  'relic','repentance','resurrection','revelation','righteousness',
  'sacred','sacrament','salvation','sanctity','sect','sermon',
  'shrine','sin','sinful','soul','spiritual','spirituality','supplication',
  'theology','transcendence','trinity','virtue','vow','zen',
  // personas y roles
  'abbot','archbishop','bishop','brahmin','cardinal','clergy','cleric',
  'confessor','curate','deacon','disciple','evangelist','friar','guru',
  'hermit','imam','inquisitor','lama','monk','mullah','novice',
  'nun','padre','patriarch','pontiff','pope','priest','prior',
  'prophet','rabbi','rector','reverend','saint','shaman','vicar',
  // textos y lugares
  'altar','amen','cathedral','chapel','cloister','convent','dome',
  'epistle','gospel','hymn','idol','incantation','liturgy','mantra',
  'minaret','mosque','nave','parable','parish','psalm','pulpit',
  'quran','rosary','scripture','synagogue','tabernacle','talmud',
  'torah','vestry',
]);

// ─── FORMAS IRREGULARES Y PALABRAS QUE EL STEMMER NO RESUELVE ────────────────
cat('family_and_friends', [
  // plurales irregulares de personas
  'children','men','women','kids','folks','guys','boys','girls',
  'ladies','gentlemen','brothers','sisters','sons','daughters',
  'parents','grandparents','ancestors','relatives','cousins',
  'teens','adults','elders','toddlers','infants','twins',
  // nombres usados como vocabulario común
  'adam','alan','alex','alice','amanda','amy','andy','angela',
  'anne','annie','anthony','arthur','barbara','barry','ben','beth',
  'betty','bill','billy','bob','bobby','brad','brian','carol',
  'charlie','chris','claire','daniel','danny','dave','david','diana',
  'donna','edward','emily','emma','eric','eve','frank','fred',
  'gary','george','grace','harry','helen','henry','jack','james',
  'jane','janet','jason','jennifer','jessica','jim','jimmy','joe',
  'john','johnny','julia','karen','kate','kevin','kim','laura',
  'lee','lily','lisa','lucy','mark','mary','matt','michael',
  'mike','nancy','nick','nicole','paul','peter','rachel','richard',
  'robert','rose','ryan','sam','sara','sarah','scott','sharon',
  'simon','sophie','steve','sue','susan','thomas','tim','tom',
  'tony','victoria','william','anna','ben','charlie','chris',
]);

cat('actions', [
  // verbos irregulares (past tense y participios)
  'ate','became','began','blew','bought','broke','brought','built',
  'came','caught','chose','cut','dealt','did','drank','drew',
  'drove','fed','fell','felt','flew','forgot','froze','gave','got',
  'grew','heard','held','hid','hit','hung','hurt','kept','knew',
  'laid','led','left','lent','let','lost','made','meant','met',
  'paid','put','ran','rang','rode','rose','said','sang','sat',
  'saw','sent','shone','shot','shrank','shut','sang','slept',
  'slid','spoke','spent','stood','stole','struck','swam','swore',
  'swung','took','tore','told','threw','understood','upset',
  'woke','wore','won','wrote',
  // -ing de verbos irregulares
  'asking','coming','doing','eating','feeling','getting','giving',
  'going','having','making','running','saying','seeing','taking',
  'talking','telling','thinking','trying','using','walking',
  'wanting','working',
  // formas conjugadas comunes que el stemmer no resuelve
  'added','agreed','allowed','answered','appeared','asked','avoided',
  'believed','broke','built','called','caught','changed','checked',
  'chose','closed','control','covered','created','decided','described',
  'developed','died','ended','enjoyed','expected','faced','failed',
  'followed','formed','found','gave','happened','heard','helped',
  'includes','kept','killed','knew','learned','liked','lived',
  'loved','moved','needed','opened','passed','placed','played',
  'reached','realized','received','remained','required','resulted',
  'seemed','shown','started','stopped','turned','used','wanted',
]);

cat('miscellaneous', [
  // slang, jerga, palabrotas, interjecciones
  'ah','ahh','aw','aye','aah','argh','bah','blah','bleep','beep',
  'beeps','boo','boom','bro','buddy','bullshit','chuckles','cos',
  'crap','crikey','crud','dang','damn','darn','dude','erm','eww',
  'fart','frickin','friggin','frig','fudge','gee','geez','golly',
  'goodness','gosh','grr','hah','heck','hmm','hooray','huh','hurrah',
  'jeez','jerk','lol','nah','nope','oops','ouch','phew','piss',
  'poop','shh','shoo','shucks','sigh','ugh','uhh','umm','whoa',
  'whoops','whoo','woo','wow','yay','yikes','yuck','yup','zap',
  // abreviaturas y siglas comunes
  'abc','adhd','aids','aka','asap','atm','btw','cc','ceo','dna',
  'etc','fbi','fyi','gps','html','http','iq','irs','lol','nba',
  'nfl','ngo','omg','pcs','pdf','pm','ps','suv','ui','url',
  'usa','usd','vip','vs','www',
  // palabras muy cortas/ruido
  'er','em','en','uh','um','ya','yo','af','ah','ai','bi','bo',
  'bu','da','de','di','du','el','ga','ge','gi','gu','ha','he',
  'hi','ho','hu','ka','ke','ki','ko','la','le','li','lo','lu',
  'ma','mi','mo','mu','na','ne','ni','nu','op','ou','pa','pe',
  'pi','pu','qi','ra','re','ri','ro','ru','sa','se','si','su',
  'ta','te','ti','tu','wa','we','wi','wu','xa','xe','xi','xu',
  'ya','ye','yi','yu','za','ze','zi','zo','zu',
]);

cat('geography', [
  // países y lugares usados como vocabulario
  'america','american','africa','african','asia','asian','europe',
  'european','china','chinese','english','french','german','italian',
  'japanese','korean','spanish','arabic','russian','indian','mexican',
  'british','australian','canadian','irish','scottish','welsh',
  'greek','roman','latin','arabic','israeli','iraqi','iranian',
  'afghan','pakistani','nigerian','egyptian','turkish','swedish',
  'dutch','danish','norwegian','portuguese','polish','hungarian',
  'czech','romanian','ukrainian','bulgarian','croatian','serbian',
  'Albanian','bosnian','slovenian','slovak',
  // ciudades y lugares como vocabulario geográfico
  'paris','london','berlin','moscow','tokyo','beijing','rome',
  'madrid','athens','amsterdam','brussels','vienna','prague',
  'budapest','warsaw','stockholm','oslo','helsinki','dublin',
  'lisbon','copenhagen','zurich','geneva','milan','barcelona',
  'seoul','bangkok','singapore','mumbai','delhi','cairo',
  'istanbul','dubai','sydney','melbourne','toronto','montreal',
  'chicago','boston','dallas','houston','miami','seattle',
  'washington','angeles','francisco','york',
]);

cat('numbers_and_time', [
  // fechas y festividades
  'christmas','halloween','thanksgiving','easter','hanukkah','ramadan',
  'new year','birthday','anniversary','holiday','vacation','weekend',
  // números escritos
  'zero','one','two','three','four','five','six','seven','eight',
  'nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
  'sixteen','seventeen','eighteen','nineteen','twenty','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
  'thousand','million','billion','trillion',
  // tiempo relativo
  'anytime','nowadays','lately','recently','currently','previously',
  'formerly','shortly','eventually','temporarily','permanently',
  'instantly','immediately','simultaneously','consecutively',
]);

cat('work', [
  // profesiones no cubiertas
  'accountant','actor','actress','agent','analyst','architect',
  'artist','astronaut','baker','barber','bartender','butcher',
  'carpenter','cashier','chef','clerk','coach','consultant',
  'contractor','controller','decorator','designer','diplomat',
  'director','doctor','editor','electrician','engineer','executive',
  'farmer','firefighter','fisherman','florist','gardener','guard',
  'guide','janitor','journalist','judge','lawyer','lecturer',
  'librarian','manager','mechanic','midwife','minister','musician',
  'nurse','officer','operator','painter','pharmacist','photographer',
  'physicist','pilot','plumber','policeman','politician','postman',
  'programmer','psychiatrist','psychologist','publisher','receptionist',
  'researcher','sailor','secretary','security','soldier','surgeon',
  'taxi driver','teacher','technician','therapist','trainer',
  'translator','veterinarian','waiter','waitress','writer',
  // términos laborales no cubiertos
  'backup','boss','budget','career','colleague','commission',
  'complaint','contract','corporation','crew','deadline','demo',
  'department','director','employee','employer','enterprise',
  'entrepreneur','executive','expense','fee','freelance','income',
  'industry','interview','invoice','leadership','management',
  'manager','meeting','negotiate','network','office','outsource',
  'partnership','payroll','pension','presentation','profit',
  'project','promotion','proposal','qualify','quota','raise',
  'redundant','revenue','salary','schedule','sector','seminar',
  'shareholder','staff','strategy','task','team','tenure',
  'termination','trade','union','vacancy','wage','workshop',
]);

// ─── FORMAS FRECUENTES NO CUBIERTAS POR EL STEMMER ───────────────────────────

cat('transport', [
  'airplane','airplanes','airline','airlines','aircraft','airport','airports',
  'airlift','airspace','airstrip','airway','airways','airbase','airfield',
  'automobile','automobiles','barge','barges','cab','cabs','caravan',
  'carriages','convoy','cruiser','cruise','destroyer','dinghy','dirigible',
  'freighter','gondola','hatchback','jeep','jets','kayak','limo','limousine',
  'locomotive','luggage','minivan','moped','motorbike','motorcycle','motorcycles',
  'parachute','patrol','pickup','propeller','raft','roadster','rocket','rockets',
  'rowboat','runway','sailboat','scooter','sedan','shuttle','sleigh','speedboat',
  'stagecoach','steamship','submarine','submarines','tanker','taxi','taxicab',
  'throttle','tractor','trailer','tram','trams','transit','trolleybus',
  'tugboat','turbine','van','vans','vehicle','vehicles','wagon','warship',
]);

cat('body', [
  'abdomen','abdominal','abscess','acne','ache','aches','ached','aging',
  'ailment','ailments','allergic','allergy','amputate','amputation','anatomy',
  'ankles','antidote','arteries','artery','ashes','atrophy','autism',
  'backache','backbone','bandages','bathe','bathrooms','bladder','bleed',
  'bleeding','blisters','bloodstream','bolts','bowels','brains','bruises',
  'bruising','catheter','cavity','cells','chemotherapy','chromosomes',
  'circulatory','clot','coma','concussion','corpse','corpses','cortex',
  'cramps','cranium','defect','deformity','dementia','dental','diagnosis',
  'dialysis','diarrhea','dissect','dizzy','dizziness','dosage','embryo',
  'epidemic','estrogen','exhausted','exhaustion','eyebrows','eyelid','eyelids',
  'fatigue','fetus','fever','fevers','fracture','fractures','fungal',
  'genes','genetic','genetics','glands','glucose','groin','gums',
  'hallucinate','hallucination','hallucinations','hemorrhage','hepatitis',
  'hereditary','hormone','hormones','hygiene','immune','immunity','implant',
  'infection','infections','infectious','inhale','injection','injections',
  'insulin','intestine','intestines','itch','itching','kidney','kidneys',
  'larynx','ligament','limb','limbs','lungs','lymph','malaria','malnutrition',
  'mammogram','menstrual','migraine','miscarriage','molecules','morphine',
  'nausea','nerves','neuron','neurons','obese','obesity','organ','organs',
  'outbreak','overdose','oxygen','pancreas','paralysis','parasite','pathogen',
  'pelvis','physiology','pimple','plague','plasma','pneumonia','poisoning',
  'postmortem','pregnancy','premature','prognosis','prostate','puberty',
  'pulse','rash','reflexes','relapse','remedy','reproduct','respiration',
  'retina','ribs','saliva','seizure','seizures','spasm','spinal','spleen',
  'starvation','stimulant','stroke','strokes','sutures','sweat','sweating',
  'symptom','symptoms','syndrome','tendon','testosterone','thermometer',
  'thyroid','tissue','tissues','toxin','toxins','transplant','trauma',
  'tumor','tumors','ulcer','ulcers','uterus','vaccination','veins',
  'vertebra','viral','virus','viruses','vitamin','vitamins','vomit','vomiting',
  'wheelchair','wound','wounds','wrist','xray',
]);

cat('actions', [
  'abide','abort','absorb','abstain','accelerate','accumulate','achieve',
  'acknowledge','activate','adapt','adjust','admire','adore','advance',
  'advertise','advise','affect','afford','aggravate','aid','alert',
  'allocate','alter','analyze','analyze','annoy','apologize','append',
  'apply','appreciate','approve','arise','arrange','arrest','assemble',
  'assess','assign','assist','assume','astonish','attract','authorize',
  'await','awaken','bake','ban','battle','beg','betray','boil','bounce',
  'broadcast','browse','burn','cancel','capture','celebrate','challenge',
  'charge','chase','cheat','clarify','classify','collapse','command',
  'commit','communicate','compare','compete','comply','conceal','concentrate',
  'confess','configure','confirm','confront','connect','consult','contact',
  'convince','cooperate','crawl','customize','damage','deceive','dedicate',
  'defeat','defend','delay','delete','deliver','demand','deploy','deserve',
  'detect','determine','devote','dig','disagree','disappear','discover',
  'discuss','dismiss','dispatch','display','distribute','drag','dump',
  'earn','emerge','encounter','enforce','enhance','escape','evaluate',
  'execute','expand','experiment','expose','extend','fake','fetch','filter',
  'fix','float','focus','force','forgive','gather','grab','guide','handle',
  'harm','highlight','hire','identify','ignore','implement','inform',
  'inspect','inspire','integrate','invade','investigate','involve','judge',
  'launch','limit','link','locate','maintain','manage','measure','monitor',
  'motivate','obtain','operate','organize','overcome','participate','perceive',
  'perform','plan','predict','prepare','prevent','process','produce','prove',
  'pursue','qualify','recruit','reduce','refer','release','remove','repair',
  'replace','request','rescue','resolve','restore','retrieve','reward',
  'sacrifice','search','select','share','signal','simulate','solve',
  'submit','suggest','support','survive','tackle','translate','trigger',
  'trust','update','upgrade','upload','validate','verify','warn',
]);

cat('places', [
  'abbey','abode','accommodation','arena','archives','attic','auditorium',
  'avenue','backyard','balcony','ballroom','bar','barn','barracks','basement',
  'battlefield','bay','cabin','cage','camp','campus','canal','capital',
  'capitol','cave','cavern','cemetery','chapel','cinema','clinic','cloister',
  'closet','colony','compound','convent','corridor','cottage','courthouse',
  'courtyard','cove','crater','creek','crossroads','dam','deck','desert',
  'destination','dock','downtown','driveway','dungeon','embassy','estate',
  'factory','fairground','farmhouse','fortress','gallery','ghetto','glacier',
  'gorge','graveyard','greenhouse','grounds','gulf','gym','harbor','headquarters',
  'hideout','hill','hills','hotspot','hut','inlet','intersection','island',
  'islands','jungle','kennel','kingdom','lab','landmark','lighthouse',
  'lobby','lodge','loft','lookout','mall','manor','marketplace','marsh',
  'meadow','monastery','monument','moorland','mountain','mountains','oasis',
  'observatory','parking','parliament','peninsula','pier','plaza','pond',
  'portal','preserve','prison','province','pyramid','quarry','quarters',
  'ravine','reef','refuge','reservoir','ridge','ruins','runway','shanty',
  'shelter','shrine','site','slope','slum','squad','stadium','staircase',
  'suburb','suburbs','swamp','terminal','theater','theatre','throne',
  'tomb','tower','tunnel','underground','village','volcano','warehouse',
  'waterfall','wilderness','workshop','yard',
]);

cat('food_and_drink', [
  'almonds','aloe','apple','apples','asparagus','avocado','bacon','bagel',
  'banana','bananas','beef','beet','biscuit','blueberry','broccoli',
  'brownie','burger','burrito','butter','cabbage','cake','cakes','candy',
  'caramel','cashew','casserole','caviar','cereal','cheddar','cheese',
  'cherries','cherry','chestnut','chili','chip','chips','chocolate',
  'cinnamon','clam','cocoa','coconut','cod','cookie','cookies','corn',
  'crab','cracker','cranberry','cream','crepe','croissant','cucumber',
  'cupcake','dairy','dumpling','eggnog','eggs','espresso','falafel',
  'fig','fries','frosting','garlic','ginger','grape','grapes','grill',
  'guacamole','ham','hamburger','herb','herbs','honey','hotdog','hummus',
  'icecream','icing','jam','ketchup','lamb','lasagna','lemon','lettuce',
  'lime','lobster','maple','margarine','mayo','mayonnaise','melon',
  'menu','milk','milkshake','mint','miso','mozzarella','muffin','mushroom',
  'mushrooms','mustard','noodle','noodles','nut','nuts','octopus',
  'olive','olives','onion','onions','oyster','paprika','pasta','pastry',
  'peanut','peanuts','pear','peas','peach','pepper','peppers','pesto',
  'pickle','pie','pineapple','pizza','plum','pomegranate','popcorn',
  'pork','potato','potatoes','pudding','pumpkin','raspberry','ribs',
  'rice','roast','rolls','salad','salami','salmon','salt','sandwich',
  'sardine','sauce','sausage','seafood','shrimp','smoothie','soup',
  'spaghetti','spinach','steak','stew','strawberry','sushi','taco',
  'tangerine','tea','tomato','tomatoes','tofu','turkey','tuna','vanilla',
  'vegetable','vegetables','walnut','watermelon','wheat','yogurt','zucchini',
]);

cat('animals', [
  'aardvark','albatross','alligator','amphibian','antelope','apes','arachnid',
  'baboon','badger','bacteria','beetle','bison','boar','buffalo','bulldog',
  'bumblebee','butterfly','camel','canine','caribou','caterpillar','chameleon',
  'cheetah','chimp','chimpanzee','cobra','cockroach','condor','coyote','crane',
  'crawfish','creature','creatures','crow','crustacean','cubs','deer','dinosaur',
  'dinosaurs','dragonfly','drone','elk','emu','falcon','feline','ferret',
  'finch','firefly','flamingo','flee','flea','fleas','flock','fowl','gecko',
  'gerbil','gnu','gorilla','grasshopper','hamster','hare','hawk','hedgehog',
  'herd','heron','hippopotamus','hornets','hummingbird','hyena','iguana',
  'impala','insects','jaguar','jellyfish','larvae','leech','lemur','leopard',
  'locust','lynx','maggot','mallard','mammal','mammals','manatee','mantis',
  'marmot','marsupial','mink','moose','mosquito','moth','mule','mussel',
  'narwhal','nightingale','ocelot','octopi','orangutan','orca','ostrich',
  'otter','parakeet','peacock','pelican','pheasant','piglet','pigeon','poodle',
  'porcupine','praying','predator','prey','primate','primates','puffer',
  'python','quail','rabbit','raccoon','ram','raptor','ravens','reptile',
  'reptiles','rhino','robin','rodent','roosters','salamander','scorpion',
  'seagull','seahorse','seal','seals','slug','sparrow','squid','stallion',
  'starfish','stork','swallow','tarantula','termite','tortoise','toucan',
  'trout','turtle','turtles','vermin','vulture','walrus','wasp','weasel',
  'wolverine','worm','worms','yak',
]);

cat('descriptions', [
  'abnormal','abrupt','absent','absolute','abstract','abundant','acceptable',
  'accidental','accurate','acute','adequate','adjacent','aggressive','agile',
  'alike','aloof','alternative','amazing','ambiguous','ambivalent','ample',
  'ancient','anonymous','apparent','appropriate','approximate','apt','arbitrary',
  'ardent','arid','arrogant','artificial','astonishing','astronomical','atomic',
  'atrocious','attractive','authentic','automatic','average','awesome',
  'awkward','balanced','bare','basic','bizarre','bland','bleak','blunt',
  'bold','brief','brilliant','brutal','candid','capable','careless','casual',
  'cautious','circular','classic','clever','coincidental','compact','compatible',
  'complete','complex','compulsory','concise','confidential','conscious',
  'consistent','constant','controversial','convenient','corporate','correct',
  'corrupt','countless','covert','crazy','creative','criminal','crisp',
  'crucial','cruel','curious','current','customary','dangerous','decisive',
  'defective','defensive','deliberate','democratic','dense','dependent',
  'desperate','determined','devout','diligent','diplomatic','discrete',
  'distant','distinct','dramatic','drastic','dual','dubious','durable',
  'dynamic','efficient','elaborate','elegant','endless','enormous','entire',
  'equivalent','exceptional','exhausted','extinct','extreme','faint',
  'faithful','false','familiar','fanatical','fatal','fertile','fierce',
  'flexible','flimsy','formal','fragile','frequent','frustrated','fundamental',
  'genuine','gigantic','gloomy','grand','grateful','grave','gross','guilty',
  'harsh','hazardous','hollow','humble','identical','illegal','immense',
  'impossible','independent','infinite','informal','innocent','insufficient',
  'intense','invisible','irregular','isolated','keen','legitimate','linear',
  'literal','local','logical','loyal','magnificent','massive','mechanical',
  'memorable','minimal','moderate','neutral','normal','notable','notorious',
  'obvious','ordinary','original','outstanding','partial','passive','peculiar',
  'permanent','personal','physical','positive','potential','precise','productive',
  'profound','progressive','proper','radical','random','realistic','relative',
  'relevant','remarkable','rigid','risky','rural','sacred','sensitive','severe',
  'significant','silent','similar','simple','sincere','social','solid',
  'sophisticated','spontaneous','stable','strict','subtle','sudden','super',
  'superior','sustainable','temporary','total','traditional','transparent',
  'typical','universal','unusual','urgent','valid','various','vast','violent',
  'virtual','visual','vivid','voluntary','vulnerable','widespread',
]);

cat('miscellaneous', [
  'alarm','alarms','alias','ammo','annex','array','artifact','artifacts',
  'audio','autograph','autopsy','badge','barrels','bonus','broadcast',
  'brochure','bulletin','bytes','calendar','cameras','cargo','channel',
  'channels','checklist','code','codes','database','debug','device',
  'devices','dial','diagram','directory','directory','disk','documents',
  'domain','download','draft','drone','email','encryption','file','files',
  'footage','format','format','fossil','fragment','gadget','grid','hack',
  'hardware','hazard','hub','icon','input','installation','interface',
  'keyboard','launch','lens','log','manual','matrix','module','monitor',
  'output','password','portal','protocol','proxy','queue','radar','radio',
  'receiver','recording','recordings','relay','remote','request','resources',
  'sample','scan','scanner','sensor','sequence','server','signal','signals',
  'software','source','storage','stream','terminal','transmit','update',
  'upload','username','video','videos','virus','website','wireless',
]);

// ─── ADJETIVOS -al/-ic Y PALABRAS COMUNES AÚN SIN CATEGORÍA ─────────────────

cat('descriptions', [
  // adjetivos en -al muy frecuentes (demasiado cortos para el sufijo heurístico)
  'actual','bilateral','central','commercial','conditional','cultural',
  'digital','doctoral','equal','ethical','extra','fatal','federal','final',
  'fiscal','formal','frugal','functional','global','gradual','horizontal',
  'ideal','identical','illegal','immortal','imperial','individual','internal',
  'legal','liberal','literal','local','loyal','manual','marginal','mental',
  'modal','moral','mutual','national','natural','naval','neutral','nominal',
  'normal','oral','orbital','partial','pastoral','personal','pivotal',
  'plural','political','primal','racial','radical','rational','real',
  'regional','royal','rural','seasonal','sectoral','sexual','singular',
  'social','special','spiritual','structural','superficial','temporal',
  'thermal','topical','total','traditional','tribal','typical','unequal',
  'unilateral','universal','unusual','verbal','vertical','viral','visual',
  'vital','vocal','fundamental','essential','classical','botanical',
  'biblical','fanatical','technical','typical','topical','logical',
  'physical','surgical','cynical','tactical','optical','ethical','identical',
  // adjetivos en -ic frecuentes
  'academic','acidic','acoustic','aerobic','aesthetic','algebraic',
  'allergic','analytic','anatomic','angelic','aquatic','archaic',
  'arctic','aristocratic','arithmetic','arthritic','artistic',
  'asthmatic','athletic','atomic','authentic','automatic',
  'ballistic','basic','biometric','botanic','bureaucratic','catastrophic',
  'caustic','ceramic','chaotic','charismatic','climatic','comic','cosmic',
  'cubic','democratic','demographic','diabetic','diagnostic','diplomatic',
  'dynamic','eccentric','economic','electric','electronic','elliptic',
  'endemic','energetic','epic','erratic','exotic','fanatic',
  'forensic','frantic','futuristic','generic','genetic','geographic',
  'geometric','gigantic','graphic','harmonic','heroic','historic',
  'holistic','hydraulic','iconic','idyllic','linguistic','magnetic',
  'mechanic','melodic','metabolic','microscopic','monastic','mystic',
  'mythic','neurotic','nomadic','oceanic','olympic','operatic','organic',
  'panoramic','pandemic','parasitic','patriotic','philanthropic','phonetic',
  'photographic','poetic','pragmatic','problematic','prophetic','psychiatric',
  'psychic','robotic','romantic','sarcastic','scholastic','seismic',
  'semantic','skeptic','socratic','static','strategic','synthetic',
  'systematic','thematic','therapeutic','toxic','traumatic','volcanic',
  'volcanic',
  // high-freq adjectives not caught above
  'absolute','abstract','actual','aggressive','alien','almighty','alpha',
  'ample','angry','anxious','ashamed','asleep','awake','aware',
  'bare','blank','blessed','blind','brave','bright','broad','calm',
  'cheap','cheerful','chief','clean','clear','clever','cold','cross',
  'cute','deaf','dear','deep','dense','different','dirty','distant',
  'diverse','dull','early','easy','effective','efficient','empty','evil',
  'exact','exciting','expensive','extreme','fair','famous','fancy','far',
  'fast','fat','flat','fresh','full','funny','gentle','glad','good',
  'great','guilty','handsome','happy','hard','heavy','helpful','honest',
  'huge','hungry','immune','important','independent','inner','innocent',
  'junior','just','kind','large','late','lazy','lean','light','likely',
  'lone','long','loud','lovely','lower','lucky','mad','mere','mild',
  'minor','modern','moist','narrow','nice','noble','noisy','nude',
  'odd','outer','partial','passive','patient','peaceful','plain','poor',
  'popular','possible','pretty','proud','pure','quick','rare','rapid',
  'raw','ready','rich','rough','round','rude','sacred','safe','scared',
  'sharp','short','shy','slim','slow','small','smart','smooth','soft',
  'solid','sorry','stable','steady','steep','strange','strong','sure',
  'sweet','swift','thick','thin','tight','tiny','tired','tough','true',
  'ugly','unclear','unfit','unhappy','unique','unkind','unlikely','upset',
  'useful','vague','warm','weak','weird','wide','wild','wise','worth',
  'wrong','young',
]);

cat('miscellaneous', [
  'abyss','aftermath','agony','alias','amnesia','amulet','anarchy',
  'apocalypse','apparition','artifact','assassin','assassins','asteroid',
  'attaboy','avatar','awhile','babes','backseat','backstage','badass',
  'baked','baking','balloon','balloons','bamboo','bandit','bandits',
  'banquet','barefoot','barren','beacon','beads','beaten','beforehand',
  'beggar','beggars','behold','belly','bingo','bikini','billionaire',
  'bizarre','blackout','blizzard','blockbuster','blossom','bonanza',
  'boomerang','bounty','brainwash','breakthrough','bromance','bystander',
  'capsule','catastrophe','chaos','clueless','comet','conspiracy',
  'countdown','crisis','crossfire','deja','delusion','distress',
  'duplicity','encounter','enigma','epidemic','eruption','exodus',
  'extravaganza','fiasco','flaw','flaws','flashback','frenzy','glitch',
  'grudge','havoc','heist','hypnosis','illusion','impostor','incognito',
  'inferno','karma','kidnap','loophole','marathon','matrix','meltdown',
  'menace','mercy','miracle','misfit','mystery','nightmare','nemesis',
  'ordeal','paranoia','paradox','phenomenon','phobia','prank','predicament',
  'rampage','rebellion','resurrection','revelation','revenge','scandal',
  'spectacle','standoff','stalemate','surge','suspense','takeover',
  'tension','thriller','tornado','trauma','underdog','uprising','vortex',
  'whirlwind','witchcraft',
]);

cat('body', [
  'agony','agonize','adrenaline','adrenalin','alcohol','alcoholic',
  'alcoholism','alzheimer','amphetamine','anesthesia','angina','anguish',
  'anorexia','antibiotic','antibiotics','antiviral','appendix','aspirin',
  'asthmatics','bellyache','biomedical','biopsy','birthmark','bloodshot',
  'bodybuilder','botulism','breathe','breathing','bruised','calories',
  'cardiogram','cardiovascular','cataracts','chicken pox','cholesterol',
  'cloning','cognitive','convulsion','convulsions','corpulent','cortisol',
  'cosmetic','cramps','dehydrated','dehydration','detox','diabetic',
  'diarrhea','digestive','disability','dislocate','dissociation',
  'dizziness','eczema','endocrine','enzyme','enzymes','epidermis',
  'epilepsy','epileptic','erection','fatigue','feces','fertility',
  'fetal','fibromyalgia','flesh','flu','fluoride','follicle',
  'gastrointestinal','glaucoma','glucose','gout','hemorrhoids','hernia',
  'heroin','hormonal','hormones','hyperthyroid','hypothyroid','immunize',
  'impotence','inflammation','inhaler','intestinal','jaundice','lesion',
  'leukemia','libido','ligaments','liposuction','lupus','lymphoma',
  'malnourished','mammography','medication','medications','meningitis',
  'menopause','menstruation','mental','metabolic','metabolism',
  'muscular','myocardial','neurological','neurosurgery','nutrition',
  'nutritional','obesity','optic','ovulation','pacemaker','pathology',
  'pharmaceutical','pharmacology','pneumatic','potassium','psychiatric',
  'pubescent','quarantine','radiology','rehabilitation','remission',
  'respiration','respiratory','rheumatism','salmonella','schizophrenia',
  'sedation','serotonin','sexually','skeletal','spinal','sterile',
  'sterilization','steroid','steroids','stillbirth','stomach','stool',
  'surgical','swollen','testicular','testosterone','therapy','thrombosis',
  'typhoid','typhus','uterine','vaccination','vascular','venous',
  'vertigo','vital','vitamin','vitality','vitiligo','whooping',
]);

cat('places', [
  'aisle','alcove','alley','alleyway','altar','amphitheater','aquarium',
  'backstage','backyard','balcony','bay','bedrooms','boulevard','bunker',
  'bureau','canyon','capitol','cavern','citadel','civic','coastal',
  'colonial','colosseum','commercial','commune','concentration','convent',
  'corridor','countryside','courthouse','cove','cultural','destination',
  'dock','downtown','dungeon','embassy','enclave','estate','factory',
  'farmland','fortress','gallery','gated','ghetto','gorge','habitat',
  'harbor','highland','hilltop','historical','hub','hut','landmark',
  'marina','meadow','memorial','metropolis','metropolitan','monument',
  'municipal','municipality','museum','neighborhood','oasis','outback',
  'outskirts','parish','plaza','precinct','provincial','quarters',
  'ravine','reef','reservation','residential','resort','rooftop','ruins',
  'sanctuary','seaport','settlement','shrine','skyline','slum','staircase',
  'suburb','suburbs','swamp','territory','thoroughfare','tundra',
  'urban','wasteland','wetland','wilderness','woodland',
]);

cat('animals', [
  'alpha','amoeba','amphibian','angler','antler','antlers','aquatic',
  'barnacle','beast','beasts','breeding','canine','carnivore','claw',
  'claws','colony','cub','cubs','den','ecosystem','fang','fangs',
  'feathers','feline','flock','foal','foraging','habitat','herd',
  'hibernate','hibernation','horn','horns','hound','hounds','instinct',
  'invertebrate','larva','larvae','mammal','mammals','mane','marsh',
  'migrate','migration','migratory','molt','nesting','nocturnal',
  'omnivore','pack','parasite','plumage','pod','predator','predators',
  'prey','primate','primates','pupil','reptile','reptiles','rodent',
  'rodents','scale','scales','scavenger','snout','species','specimen',
  'spine','stinger','tentacle','tentacles','venom','vertebrate','webbed',
  'wildlife','wings',
]);

cat('geography', [
  'alpine','altitude','arid','arctic','basin','bay','border','borders',
  'canyon','cape','capital','cardinal','cartography','celsius','climate',
  'coastal','continental','coordinate','coordinates','current','currents',
  'delta','desert','eastern','elevation','equator','estuary','fahrenheit',
  'fjord','frontiers','frontier','geography','geopolitical','glacier',
  'global','gulf','hemisphere','highland','humid','humidity','inland',
  'island','latitude','longitude','lowland','maritime','meridian',
  'monsoon','mountainous','northern','plateau','polar','populated',
  'precipitation','region','regional','rainfall','ridge','savanna',
  'seismic','southern','steppe','subtropical','temperate','terrain',
  'territory','topography','tropical','tsunami','tundra','urban',
  'vegetation','volcanic','watershed','western','wetland',
]);

// ─── NUEVAS CATEGORÍAS ────────────────────────────────────────────────────────

// RELIGION: fe, espiritualidad, religión
cat('religion', [
  'god','prayer','angel','holy','priest','bible','soul','faith','sin',
  'heaven','hell','spiritual','divine','worship','sacred','ritual',
  'baptism','saint','monk','nun','pope','bishop','church','temple',
  'mosque','synagogue','cathedral','chapel','monastery','convent',
  'crusade','heresy','theology','supernatural','blessing','salvation',
  'redemption','resurrection','scripture','gospel','sermon','psalm',
  'hymn','deity','miracle','confession','pilgrimage','shrine','pagan',
  'atheist','agnostic','theist','mystical','mythological','baptize',
  'ordain','preach','pray','meditate','convert','evangelize','blessed',
  'devout','pious','secular','religious','angelic','cherub','seraph',
  'demon','satan','devil','paradise','purgatory','karma','nirvana',
  'dharma','zen','buddha','buddhism','hinduism','islam','christianity',
  'judaism','sikhism','atheism','paganism','shamanism','animism',
  'totem','ceremony','sacrifice','offering','altar','communion',
  'eucharist','mass','congregation','parish','diocese','clergy',
  'laity','reformation','inquisition','crusader','martyr','apostle',
  'disciple','prophet','messiah','saviour','trinity','creed','doctrine',
  'dogma','schism','sect','cult','denomination','evangelical','orthodox',
  'protestant','catholic','muslim','jewish','hindu','buddhist',
  'sikh','shaman','druid','wicca','pagan','monk','friar','abbot',
  'archbishop','cardinal','deacon','vicar','rector','parson','reverend',
  'rabbi','imam','mullah','lama','guru','swami','yogi','meditation',
  'mindfulness','enlightenment','transcendence','mysticism','occult',
  'supernatural','paranormal','ghost','spirit','soul','afterlife',
  'reincarnation','immortality','eternity','infinity','creation',
  'genesis','exodus','revelation','judgement','damnation','absolution',
  'penance','indulgence','relic','icon','idol','incense','candle',
  'rosary','crucifix','cross','star of david','crescent','om',
  'yin yang','mandala','mantra','chakra','aura','transcendental',
  'metaphysical','spiritual','celestial','ethereal','divine',
]);

// SCIENCE: ciencia, física, química, biología
cat('science', [
  'atom','molecule','electron','proton','neutron','nucleus','ion',
  'isotope','compound','element','periodic','chemistry','physics',
  'biology','astronomy','geology','botany','zoology','ecology',
  'genetics','evolution','photosynthesis','respiration','metabolism',
  'enzyme','catalyst','reaction','hypothesis','observation','microscope',
  'telescope','thermometer','barometer','compass','magnet','magnetic',
  'electricity','circuit','voltage','ampere','watt','joule','newton',
  'gravity','acceleration','velocity','momentum','force','energy',
  'matter','mass','density','pressure','wave','frequency','amplitude',
  'radiation','radioactive','nuclear','fusion','fission',
  'thermodynamics','quantum','relativity','algorithm','formula',
  'equation','variable','constant','oxidation','reduction','acid',
  'base','alkali','salt','solvent','solution','covalent','ionic',
  'molecular','atomic','subatomic','quark','lepton','boson','photon',
  'electromagnetic','gravitational','kinetic','potential','thermal',
  'chemical','solar','geothermal','renewable','fossil','carbon',
  'hydrogen','oxygen','nitrogen','helium','lithium','sodium','calcium',
  'iron','copper','zinc','silver','gold','lead','mercury','uranium',
  'laboratory','experiment','hypothesis','theory','law','model',
  'observation','measurement','data','analysis','conclusion',
  'peer review','publication','research','scientist','researcher',
  'physicist','chemist','biologist','astronomer','geologist',
  'botanist','zoologist','ecologist','geneticist','neuroscientist',
  'mathematician','statistician','computer scientist','engineer',
  'nanotechnology','biotechnology','robotics','artificial intelligence',
  'machine learning','neural network','algorithm','programming',
  'software','hardware','processor','memory','storage','bandwidth',
  'optics','acoustics','mechanics','dynamics','kinematics','statics',
  'electromagnetism','thermodynamics','quantum mechanics','relativity',
  'cosmology','astrophysics','geophysics','biophysics','biochemistry',
  'molecular biology','cell biology','microbiology','immunology',
  'neuroscience','psychology','sociology','anthropology','archaeology',
  'meteorology','climatology','oceanography','hydrology','seismology',
  'volcanology','palaeontology','evolutionary biology','taxonomy',
  'classification','species','genus','family','order','class','phylum',
  'kingdom','domain','prokaryote','eukaryote','organelle','chromosome',
  'gene','allele','mutation','selection','adaptation','ecosystem',
  'habitat','niche','population','community','biome','biodiversity',
  'conservation','extinction','fossil','sediment','stratum','core',
  'mantle','crust','tectonic','plate','fault','earthquake','volcano',
  'erosion','weathering','deposition','sedimentation','metamorphism',
  'igneous','sedimentary','metamorphic','mineral','crystal','gem',
  'ore','alloy','polymer','ceramic','composite','semiconductor',
  'conductor','insulator','superconductor','laser','fiber optic',
  'antenna','satellite','rocket','orbit','gravity','vacuum','plasma',
]);

// LAW_AND_CRIME: derecho, justicia, crimen
cat('law_and_crime', [
  'court','judge','jury','trial','verdict','sentence','evidence',
  'witness','defendant','plaintiff','prosecutor','defense','attorney',
  'barrister','solicitor','legal','illegal','crime','criminal',
  'punishment','prison','fine','bail','parole','probation','appeal',
  'hearing','case','lawsuit','settlement','contract','agreement',
  'clause','liability','rights','obligation','regulation','legislation',
  'statute','constitution','amendment','referendum','jurisdiction',
  'sovereignty','treaty','extradition','indictment','acquittal',
  'conviction','innocence','guilt','alibi','testimony','subpoena',
  'warrant','arrest','charge','restraining','theft','robbery',
  'burglary','fraud','forgery','bribery','blackmail','assault',
  'murder','manslaughter','arson','vandalism','trespassing',
  'kidnapping','trafficking','smuggling','corruption','embezzlement',
  'perjury','contempt','libel','slander','defamation','trademark',
  'copyright','patent','intellectual property','federal','constitutional',
  'administrative','international','criminal law','civil law',
  'common law','statute law','case law','precedent','ruling','decree',
  'injunction','subpoena','affidavit','deposition','pleading',
  'indictment','arraignment','plea','sentencing','imprisonment',
  'probation','parole','appeal','acquittal','conviction','exoneration',
  'pardon','clemency','amnesty','extradition','asylum','immunity',
  'privilege','confidentiality','attorney-client','habeas corpus',
  'due process','equal protection','civil rights','human rights',
  'discrimination','harassment','defamation','negligence','liability',
  'damages','compensation','restitution','injunction','remedy',
  'enforcement','compliance','violation','breach','infringement',
  'penalty','sanction','fine','imprisonment','community service',
  'suspended sentence','probation','parole','supervised release',
  'detective','police','officer','constable','sheriff','marshal',
  'agent','investigator','forensics','autopsy','fingerprint','dna',
  'evidence','alibi','motive','opportunity','means','suspect',
  'accused','charged','convicted','acquitted','sentenced','released',
  'victim','perpetrator','accomplice','accessory','conspiracy',
  'premeditated','manslaughter','homicide','genocide','war crime',
  'terrorism','treason','espionage','sabotage','sedition',
  'insurrection','rebellion','riot','looting','piracy','hijacking',
  'extortion','ransom','stalking','harassment','abuse','exploitation',
]);

// MILITARY: ejército, guerra, defensa
cat('military', [
  'army','navy','marines','soldier','sailor','pilot','officer',
  'general','colonel','major','captain','lieutenant','sergeant',
  'corporal','private','recruit','veteran','combat','battle','war',
  'conflict','siege','attack','defense','retreat','surrender',
  'ceasefire','truce','weapon','gun','rifle','pistol','ammunition',
  'bullet','bomb','missile','grenade','tank','aircraft','ship',
  'submarine','helicopter','drone','radar','intelligence','espionage',
  'sabotage','propaganda','strategy','maneuver','reinforcement',
  'barracks','bunker','trench','fort','garrison','patrol','ambush',
  'invasion','occupation','liberation','resistance','guerrilla',
  'hostage','medal','rank','salute','drill','uniform','camouflage',
  'artillery','infantry','cavalry','battalion','regiment','division',
  'brigade','squadron','fleet','armada','warship','destroyer',
  'cruiser','carrier','fighter','bomber','paratroop','commando',
  'special forces','mercenary','militia','rebel','insurgent',
  'blockade','embargo','armistice','peacekeeping','deployment',
  'mission','operation','raid','ambush','offensive','defensive',
  'strategic','tactical','logistic','supply','command','headquarters',
  'intelligence','reconnaissance','surveillance','counterintelligence',
  'encryption','decryption','cipher','code','signal','communication',
  'weapon','arms','armament','arsenal','stockpile','nuclear','chemical',
  'biological','conventional','ballistic','cruise','intercontinental',
  'detonator','explosive','landmine','booby trap','improvised',
  'sniper','marksman','bombardier','gunner','tanker','submariner',
  'paratrooper','ranger','special forces','navy seal','green beret',
  'marine','airborne','cavalry','armored','mechanized','motorized',
  'artillery','mortar','howitzer','cannon','rocket launcher',
  'anti-aircraft','anti-tank','surface-to-air','air-to-ground',
  'air superiority','close air support','strategic bombing',
  'naval blockade','amphibious','landing','beachhead','bridgehead',
  'offensive','defensive','retreat','withdrawal','encirclement',
  'breakthrough','flanking','pincer','attrition','scorched earth',
]);

// ARTS: arte, música, literatura, teatro
cat('arts', [
  'painting','sculpture','sketch','portrait','landscape','abstract',
  'gallery','exhibition','canvas','palette','brush','chisel','marble',
  'clay','pottery','ceramics','drawing','watercolor','fresco','mosaic',
  'tapestry','calligraphy','opera','ballet','choreography','screenplay',
  'playwright','novelist','poet','prose','fiction','biography',
  'autobiography','essay','genre','classic','modernist','baroque',
  'impressionist','cubist','surrealist','melody','harmony','chord',
  'scale','note','pitch','key','octave','symphony','concerto','sonata',
  'quartet','aria','overture','conductor','ensemble','acoustic',
  'strings','woodwind','brass','composition','improvisation','lyrics',
  'refrain','chorus','verse','stanza','rhyme','meter','beat','jazz',
  'blues','rock','pop','classical','folk','country','reggae','hip-hop',
  'electronic','soundtrack','remix','debut','anthology','retrospective',
  'critique','premiere','audition','understudy','curtain call','encore',
  'standing ovation','mural','graffiti','street art','installation',
  'performance art','conceptual','multimedia','digital art','animation',
  'illustration','graphic design','typography','architecture','aesthetic',
  'artistic','creative','expressive','abstract','figurative','realistic',
  'symbolic','allegorical','narrative','lyrical','dramatic','comedic',
  'tragic','satirical','ironic','metaphorical','imaginary','fictional',
  'poetic','musical','theatrical','cinematic','photographic',
  'sculptural','architectural','ornamental','decorative','functional',
  'minimalist','maximalist','avant-garde','experimental','traditional',
  'contemporary','modern','postmodern','renaissance','gothic','romantic',
  'realist','naturalist','symbolist','expressionist','futurist',
  'dadaist','constructivist','abstract','expressionism','pop art',
  'conceptual art','land art','body art','video art','net art',
  'manuscript','scroll','codex','illuminated','typeface','font',
  'serif','sans-serif','italic','bold','headline','caption','layout',
  'composition','perspective','proportion','balance','symmetry',
  'contrast','texture','form','shape','line','color','light','shadow',
  'depth','space','movement','rhythm','unity','variety','emphasis',
  'harmony','gradient','transparency','opacity','saturation','hue',
  'tint','shade','tone','monochrome','polychrome','complementary',
  'analogous','triadic','split-complementary','warm','cool','neutral',
]);

// GEOGRAPHY: geografía, países, territorios
cat('geography', [
  'continent','hemisphere','equator','latitude','longitude','tropics',
  'arctic','tundra','savanna','prairie','steppe','taiga','boreal',
  'temperate','subtropical','tropical','arid','humid','oceanic',
  'altitude','elevation','slope','ridge','peak','summit','cliff',
  'gorge','canyon','ravine','plain','plateau','mesa','basin',
  'depression','delta','estuary','fjord','atoll','lagoon','reef',
  'strait','channel','peninsula','cape','isthmus','archipelago',
  'glacier','iceberg','permafrost','alluvial','sedimentary',
  'tectonic','seismic','topography','cartography','geopolitics',
  'sovereign','independent','colony','municipality','county',
  'district','township','ward','density','urban','rural','suburban',
  'metropolitan','cosmopolitan','indigenous','diaspora','nomadic',
  'pastoral','agricultural','industrial','developing','developed',
  'emerging','third world','first world','global north','global south',
  'africa','europe','asia','americas','oceania','antarctica',
  'atlantic','pacific','indian','arctic','mediterranean',
  'sahara','amazon','himalayas','andes','alps','rockies','pyrenees',
  'nile','amazon river','ganges','yangtze','mississippi','rhine',
  'thames','danube','euphrates','tigris','congo','niger','zambezi',
  'amazon','orinoco','paraguay','parana','colorado','columbia',
  'latitude','longitude','meridian','parallel','tropic','cancer',
  'capricorn','arctic circle','antarctic circle','international date line',
  'prime meridian','greenwich','compass','direction','orientation',
  'north','south','east','west','northeast','northwest','southeast',
  'southwest','cardinal','intercardinal','bearing','heading',
  'coordinates','grid','map','atlas','globe','projection','scale',
  'legend','contour','elevation','bathymetry','topography','relief',
  'plateau','mesa','butte','escarpment','scarp','terrace','bench',
  'alluvial fan','delta','floodplain','levee','oxbow','meander',
  'tributary','watershed','catchment','basin','drainage','divide',
  'groundwater','aquifer','spring','geyser','hot spring','geyser',
  'stalactite','stalagmite','karst','sinkhole','cave','cavern',
  'coast','shoreline','beach','dune','cliff','headland','promontory',
  'bay','cove','inlet','estuary','fjord','sound','strait','channel',
  'lagoon','atoll','reef','shoal','sandbar','barrier island',
  'peninsula','cape','promontory','headland','isthmus','land bridge',
  'border','frontier','boundary','demarcation','partition','division',
]);

// ─────────────────────────────────────────────────────────────────────────────

// ACTIONS: verbos generales y phrasal verbs
cat('actions', [
  'abandon','absorb','accept','accomplish','accord','accumulate','accuse',
  'achieve','acknowledge','acquire','act','adapt','add','adjust','admit',
  'adopt','advance','advise','affect','afford','agree','aid','allow','alter',
  'amend','amuse','analyse','announce','anticipate','apologise','appeal',
  'appear','approach','argue','arise','arouse','arrange','ask','aspire',
  'assert','assess','assign','associate','assume','assure','attach','attack',
  'attempt','attend','attract','avoid','awake','ban','base on','be over',
  'beat','become','beg','begin','behave','believe','belong','benefit',
  'betray','bind','bite','blow','boast','bomb','book','boost','borrow',
  'bother','bounce','bow','break','break down','break in','bring back',
  'bring up','browse','bully','burn','burst','bury','calculate','call',
  'call for','call in','cancel','capture','carry','carry on','carry out',
  'carve','catch','cause','cease','challenge','change','charge','chase',
  'cheat','check','cheer','choose','clap','clarify','clash','climb',
  'collect','combat','combine','come','come back','commit','communicate',
  'compare','compel','compensate','compile','complete','complicate','comply',
  'compose','comprise','compromise','conceal','concede','conceive','conclude',
  'condemn','conduct','confess','confine','confirm','confront','confuse',
  'congratulate','connect','conquer','consider','consist','construct',
  'consult','consume','contain','contemplate','continue','contradict',
  'contribute','convert','convey','convict','convince','cope','copy',
  'correct','correspond','count','cover','crack','create','cross','cross out',
  'crush','cry','cut','cut up','dash','decide','declare','decline','dedicate',
  'deduce','deem','deepen','defeat','defect','define','defy','deliver',
  'demolish','demand','deny','depend','depict','derive','describe','deserve',
  'destroy','detect','determine','develop','devise','devote','diagnose',
  'dictate','die','dig','diminish','disappear','disappoint','disapprove',
  'disclose','discover','discriminate','discuss','disguise','dismiss',
  'displace','dispose','disqualify','disrespect','disrupt','dissolve',
  'distinguish','distort','distract','disturb','divide','donate','drag',
  'draw','drift','drop','drown','dwell','edit','eliminate','embarrass',
  'embody','embrace','emerge','emit','employ','enclose','encounter',
  'encourage','end','endorse','endow','endure','enforce','engage','enhance',
  'enjoy','enter','entertain','envisage','equip','eradicate','erode','erupt',
  'escape','establish','estimate','evolve','exaggerate','examine','exceed',
  'excel','exclude','execute','exhaust','exhibit','exist','expand','explain',
  'explode','explore','expose','express','extend','facilitate','fail',
  'fascinate','fasten','fetch','fight','fill','fill in','fill up','filter',
  'find out','finish','flee','float','flourish','flow','fluctuate','follow',
  'forbid','force','foresee','forget','forgive','form','found','freeze',
  'frown','fulfil','gamble','gather','give','give back','give in','give out',
  'give up','give way','glance','glare','glimpse','go','go for','go off',
  'go on','grab','grow','grow up','guard','happen','harm','haunt','have to',
  'hear','hesitate','hide','highlight','hinder','hire','hold','hold up',
  'hunt','hurry','identify','ignore','illustrate','implement','impose',
  'improve','incur','indicate','infect','infer','inhabit','inherit',
  'initiate','inspect','inspire','instruct','integrate','interfere',
  'interpret','interrupt','intervene','introduce','invade','invent','invite',
  'involve','join','juggle','jump','justify','keep','keep in','keep on',
  'keep up','kick','kill','kiss','knock','knock down','know','launch','lay',
  'lead','learn','leave','lend','lengthen','lick','listen','locate','log',
  'look','look after','look for','look out','look up','lose','maintain',
  'manage','marry','maximize','meet','mention','misbehave','mislead','miss',
  'modify','motivate','mount','move','multiply','mumble','mutter','negotiate',
  'notify','object','obey','observe','obtain','occupy','occur','offer','omit',
  'order','participate','pass','pat','pay','perceive','persist','persuade',
  'pick','pick up','pinpoint','place','plead','plunge','ponder','portray',
  'possess','postpone','pray','precede','predict','prefer','prepare',
  'prescribe','pretend','prevail','prevent','proceed','produce','prohibit',
  'prolong','promote','propose','protect','protest','prove','provide',
  'provoke','publish','pull','pump','punch','punish','pursue','push','put',
  'put away','put down','put off','put on','put out','put through','put up',
  'quarrel','raise','react','realise','reassure','rebuild','recall','receive',
  'recognise','recollect','recommend','reconcile','reconsider','reconstruct',
  'recover','recreate','recruit','rectify','reduce','refer','refine',
  'reflect','refresh','refuse','regain','regulate','reinforce','reject',
  'relate','relax','release','relieve','relocate','remain','remind','remove',
  'renovate','repair','repeat','replace','report','represent','request',
  'require','rescue','resent','resist','resolve','respond','restart',
  'restore','restrain','restrict','resume','retain','reveal','run',
  'sacrifice','save','say','search','see','seek','seem','send','separate',
  'serve','set','set off','set out','set up','share','shoot','show','shrink',
  'shut','sit','sit down','sit still','skip','slide','sneak','solve','sort',
  'speak','stand','start','steal','stimulate','store','strengthen','study',
  'submit','succeed','suggest','supervise','survive','sustain','take',
  'take away','take off','take part','take place','take up','talk','teach',
  'tell','tend','testify','throw','throw away','tidy','tidy up','try','turn',
  'turn down','turn into','turn left','turn off','turn on','turn up',
  'understand','unite','update','urge','use','vaccinate','vanish','verify',
  'violate','vote','wait','wake','wake up','walk','warn','waste','weaken',
  'win','wish','withdraw','withstand','work out','wrap','wrap up','write',
  'write down','yell','yield',
  // phrasal verbs / expresiones verbales
  'break in','break down','bring','build','buy','carry','catch','change',
  'climb','come','cook','dance','do','dream','drink','drive','eat','fall',
  'fall over','feed','find','fish','fix','fly','go','grow','help','hop',
  'hurt','invite','jump','learn','live','look','make','move','need','paint',
  'play','point','ride','run','sail','see','sing','sit','sleep','smile',
  'speak','spell','stand','start','stop','swim','think','travel','wash',
  'watch','wear','wave','sell','dive','score','train',
]);

// Expansión adicional de FEELINGS
cat('feelings', [
  'apologetic','carefree','cheerful','cheerfully','cheerfulness','comforting',
  'depressed','depressing','devastated','disgusted','disgusting','disillusioned',
  'distressing','disturbed','elated','engrossed','frightened','frightening',
  'horrified','horrifying','humiliated','humiliating','hysterical','impatient',
  'impatiently','irritated','laid-back','overwhelm','pitiful','pleased',
  'shaken','soothing','stunned','sympathize','temptation','terribly','thrilled',
  'timid','traumatic','uneasy','vivacious','wary','weary',
]);

// Expansión adicional de DESCRIPTIONS
cat('descriptions', [
  'abrupt','abruptly','analogous','artificially','blunt','boldly','brand new',
  'brightly','broadly','casually','coherent','coherence','comfortably',
  'comprehensively','conscientious','consistent','conclusive','conclusively',
  'continual','continually','conventional','curiously','damp','dated','deadly',
  'decisively','deliberately','delightful','densely','diplomatic','diplomatically',
  'disastrous','discreet','distinguished','drastically','dramatically','drastic',
  'dubious','eagerly','easygoing','eccentric','effectively','efficiently',
  'elegantly','elusive','empirical','enthusiastically','ethical','eventful',
  'exact','excessive','exclusively','exhaustive','extensively','extraordinarily',
  'extremely','extrovert','faithful','faithfully','feeble','fictional','firm',
  'floppy','fluid','frail','frantically','functional','fussy','gently','giant',
  'graceful','grim','handy','harshly','high-profile','high-tech','hi-tech',
  'historic','historically','ideally','idle','immensely','imperative',
  'inadequate','inappropriately','inconvenient','indefinitely','indifferent',
  'indirect','innate','innocent','innocently','intensively','intimate',
  'intolerant','ironic','ironically','juvenile','legendary','lenient','likely',
  'logically','long-lasting','long-term','luxury','magnetic','mainstream',
  'merely','messy','military','miniature','minimal','moderate','moderately',
  'mundane','mysteriously','narrow-minded','neat','neatly','numerous',
  'objectively','obsessive','ongoing','open-minded','outrageous','packed',
  'paradoxical','passionate','patiently','peacefully','peculiar','perceptive',
  'perfectly','permanent','philosophical','physically','picturesque','poetic',
  'posh','potentially','pragmatic','prestigious','previous','priceless',
  'prime','privately','privileged','profound','profoundly','progressive',
  'promising','prone','proper','prosperous','psychological','psychologically',
  'pure','pushy','random','rapidly','rarely','rational','realistically',
  'relentless','relentlessly','remote','resilient','rightly','scenic',
  'scientifically','self-assured','self-centred','self-conscious',
  'self-reliant','self-sufficient','selfish','severe','severely','shabby',
  'shameful','sincere','sincerely','skilled','slim','smooth','snobbish',
  'sober','softness','solely','sophisticated','sparkling','spiritual',
  'spotless','steadily','stern','strategic','stubborn','subtle','successive',
  'sudden','systematic','systematically','tactful','tender','theoretical',
  'theoretically','thoroughly','thoughtfully','tolerant','tough','toughness',
  'tremendous','tremendously','turbulent','unanimous','unanimously','unbiased',
  'uncomfortable','uncomfortably','unconventional','undoubted','undoubtedly',
  'unethical','uneven','unexpected','unexpectedly','unfair','unfairly',
  'unforgettable','unjustified','unkind','unlimited','unnatural','unnecessary',
  'unquestionably','unrealistic','unreasonably','unsafe','unsatisfactory',
  'vague','vaguely','vicious','vivid','vividly','vulnerable','wicked','widely',
  'willingly','worldwide','wrongly','well-balanced','well-built','well-dressed',
  'well-educated','well-equipped','well-informed','well-known','well-off',
  'well-paid','well-qualified',
]);

// Expansión adicional de GRAMMAR
cat('grammar', [
  'accordingly','ahead','alone','aloud','anymore','apparently','appropriately',
  'backwards','boldly','brightly','broadly','casually','cheerfully','coldness',
  'comfortably','comparatively','consequently','coolness','curiously',
  'decisively','dramatically','drastically','eagerly','elaborately','elsewhere',
  'enormously','entirely','exclusively','extensively','extremely','faithfully',
  'far','faraway','fast','firmly','formally','frankly','freely','gently',
  'genuinely','gracefully','greatly','happily','harshly','hence','hereby',
  'icily','importantly','incidentally','increasingly','independently',
  'inherently','innocently','instead','internally','ironically','jointly',
  'kindly','largely','lightly','little','logically','loosely','loudly','low',
  'mainly','markedly','mentally','merely','moderately','momentarily',
  'morally','mysteriously','namely','narrowly','negatively','nervously',
  'nicely','normally','officially','openly','outwardly','overall',
  'particularly','partially','patiently','personally','physically','plainly',
  'politically','positively','precisely','previously','profoundly','properly',
  'purely','quietly','randomly','rapidly','rarely','rationally','readily',
  'rightly','roughly','rudely','safely','seemingly','seriously','sharply',
  'silently','slightly','slowly','solely','sometimes','somewhat','specifically',
  'spiritually','steadily','steeply','strangely','strictly','strongly',
  'supposedly','swiftly','technically','temporarily','tightly','totally',
  'traditionally','tragically','tremendously','typically','undeniably',
  'urgently','utterly','vaguely','virtually','visibly','voluntarily','warmly',
  'wisely','wrongly',
  // términos gramaticales adicionales
  'gerund','prefix','suffix','clause','synonym','synonymous','synonymously',
  'the first person','the second person','the third person',
  'suggest ing','used to','while whilst','vice versa',
]);

// Expansión adicional de FAMILY_AND_FRIENDS
cat('family_and_friends', [
  'bilingual','businessman','business person','celebrity','childhood',
  'children playing','clown','comedian','commander','crowd','deputy','elder',
  'enemy','entertainer','fanatic','follower','foreigner','founder','gang',
  'gossip','grandchild','guest','heir','homeless','host','housewife','idol',
  'inhabitant','king','landlady','landlord','liar','lord','mankind','native',
  'neighbour','newcomer','offspring','opponent','orphan','patron','pioneer',
  'president','prisoner','protagonist','public','queen','referee','rival',
  'role model','saint','scholar','servant','shopkeeper','spy','stranger',
  'survivor','suspect','thinker','veteran','villain','villager','warrior',
  'witch',
]);

// Expansión adicional de WORK
cat('work', [
  'abduction','abuse','allege','allegation','alliance','allied','armed',
  'assassination','bankruptcy','bribery','blackmail','bombing','bomber',
  'casualty','combat','commander','confiscation','corruption','court',
  'coverage','crackdown','crime','criminal','declaration','demonstration',
  'director','disposal','drone','emergency','espionage','executive','exploit',
  'expulsion','fighter','force','fraud','fraudulent','governance','guilty',
  'headquarters','hostage','hostility','human rights','humanitarian',
  'imprisonment','incident','injustice','inquiry','inspection','investigator',
  'judiciary','killing','lawsuit','leader','leadership','legislation','liberty',
  'massacre','mayor','mediation','medically','memorial','migration','military',
  'minister','missile','murder','national','nationwide','navy','negotiation',
  'nomination','nuclear','officer','official','oppression','organisation',
  'parliament','patrol','pension','persecution','pilot','pioneer','plumber',
  'politician','poverty','presidency','presidential','prime minister','prison',
  'propaganda','prosecutor','protest','protester','province','punishment',
  'racist','racism','racially','rebel','rebellion','referendum','refugee',
  'reign','religion','religious','representative','researcher','resignation',
  'riot','robbery','ruling','sanctions','security','senator','shooting',
  'slaughter','slavery','smuggle','soldier','sovereignty','spokesperson',
  'spy','squad','stabbing','statement','suicide','summit','talks','tank',
  'taxation','technician','terrorism','terrorist','testimony','theft',
  'torture','totalitarian','treason','treaty','tribunal','troops','union',
  'vandalism','victim','war','warfare','weapon','workforce',
]);

// Expansión adicional de WEATHER_AND_NATURE
cat('weather_and_nature', [
  'agricultural','agriculture','arid','atmospheric','atomic','biodiversity',
  'biological','biologically','bush','carbon','climate change','coastal',
  'conservation','contamination','copper','cultivation','dam','dawn',
  'daylight','decompose','deforestation','dense','desert','deteriorate',
  'dew','drizzle','drought','dust','dusty','earthquake','ecological',
  'ecologically','ecology','ecosystem','emission','endangered','eruption',
  'fertilizer','fertile','fume','fumes','genetic','genetically modified',
  'geography','geothermal','glacier','globe','grass','glow','habitat',
  'harvest','heat','hail','horizon','hurricane','irrigation','jungle',
  'landscape','laser','leaf','lightning','lunar','mammal','meadow',
  'mineral','moon','mud','muddy','natural resources','nitrogen','nuclear',
  'oak','organic','oxygen','ozone','pesticide','pollution','radiation',
  'rainfall','reservoir','solar','species','sustainable','tide','timber',
  'toxic','tropics','tsunami','underwater','vegetation','vine','volcano',
  'waterproof','wavelength','wilderness','woodland',
]);

// Expansión adicional de PLACES
cat('places', [
  'archaeological','arch','basement','cabin','cellar','colony','corridor',
  'courtroom','destination','domain','dock','doorway','downtown','embassy',
  'escalator','flat','frontier','gallery','gateway','graveyard','harbour',
  'hemisphere','hostel','housing','hut','kingdom','landmark','lane','loft',
  'mansion','memorial','mine','monument','mosque','motorway','northeast',
  'northwest','outskirts','province','pyramid','recreation','republic',
  'residential','route','ruins','sanctuary','semi-detached','settlement',
  'shore','southeast','southwest','suburb','territory','trail','tunnel',
  'vicinity','warehouse','waterfall','yard','zone',
]);

// Expansión adicional de THE_HOME
cat('the_home', [
  'appliance','attic','bin','bookcase','brick','broom','brush','bulb',
  'cabinet','carpet','ceiling','chimney','chore','cloth','cosy','counter',
  'doorbell','drawer','duvet','furnish','furnished','furniture','hallway',
  'heating','hook','household','housewife','interior','iron','ironing',
  'kettle','laundry','lawn','lighter','living room','lock','lounge','mat',
  'mattress','microwave','paint','pillow','plug','pot','rack','renovation',
  'rug','shelf','shower','sink','stool','storage','tap','toilet','towel',
  'washing machine','washing-up','yard',
]);

// Expansión adicional de BODY
cat('body', [
  'allergy','ache','autopsy','bacteria','beak','blackout','blister','blood',
  'blush','bruise','cardiac','chemotherapy','chromosome','circulation',
  'clinical','consciousness','contraception','contagious','corpse','crawl',
  'cure','deceased','dehydrate','dental','diagnosis','diarrhoea','digestion',
  'disease','disorder','DNA','dosage','drug','dysfunction','ear','elbow',
  'epidemic','eyebrow','eyelash','eyelid','eyesight','faint','fever',
  'fingernail','fingertip','flesh','genetic','gum','heal','healthcare',
  'heartbeat','heel','hip','hormone','hygiene','hygienic','immune','immune system',
  'infection','infectious','injection','injury','insomnia','jaw','kidney',
  'knee','kneel','knuckle','lip','liver','lung','medication','moustache',
  'nail','neck','nerve','nose','nostril','nutrition','nutritious','obesity',
  'obese','organ','pain','painful','palm','pharmacy','pharmacist','pregnancy',
  'pregnant','pulse','rib','sedentary','shave','skeleton','skin','skull',
  'sleep','sneeze','snore','stomach','surgery','surgeon','swallow','sweat',
  'symptom','tear','thigh','throat','thumb','toe','toenail','tongue','tooth',
  'transplant','vaccination','vaccine','vomit','waist','wound','wrist','x-ray',
]);

// Expansión adicional de NUMBERS_AND_TIME
cat('numbers_and_time', [
  'annual','annually','approximately','budget','calendar','centigrade',
  'chronological','clockwise','countdown','currency','deadline','daylight',
  'daytime','decade','delay','duration','era','estimated','fiscal','fortnight',
  'fraction','frequency','gramme','hourly','imperial','inch','interval',
  'kilometre','last-minute','latter','length','lifespan','lifetime',
  'lunchtime','measurement','metric','midday','midnight','mileage','milestone',
  'millimetre','millisecond','nighttime','outdated','pace','period','quarterly',
  'rush hour','scale','scheduled','seasonal','sequence','simultaneously',
  'span','timetable','timing',
]);

// Expansión adicional de TRANSPORT
cat('transport', [
  'aerial','aeroplane','boarding','canal','cargo','carriage','circuit',
  'clutch','commute','customs','departure','driver','driving licence',
  'engine','ferry','freight','fuel','highway','immigration','itinerary',
  'landing','lorry','motorcycle','motorist','navigation','parachute',
  'passenger','pipeline','port','public transport','rail','railroad',
  'roadblock','rocket','runway','sail','seatbelt','shuttle','stopover',
  'subway','taxi','terminal','tram','transit','transportation','tunnel',
  'underground','van','vehicle','voyage','yacht',
]);

// Expansión adicional de SCHOOL
cat('school', [
  'academic','achievement','acquire','application','arithmetic','assessment',
  'assignment','biology','brainstorm','calculate','calligraphy','campus',
  'certificate','chemistry','circular','clarification','clarity','classify',
  'coaching','collocation','column','comma','competence','concept','context',
  'definition','degree','detective','dialogue','diploma','discovery',
  'dissertation','documentary','essay','evaluate','examination','exclamation mark',
  'experiment','explanation','exposure','fiction','formula','full stop',
  'grammar','guidance','guidebook','historian','historical','hypothesis',
  'idiom','index','infrastructure','instruction','integration','interpretation',
  'knowledge','laboratory','language','learner','learning','lecture',
  'linguistic','literacy','literate','literature','marking','mathematics',
  'meaning','memorise','methodology','microscope','module','native speaker',
  'note','notebook','novelist','nursery','objective','observation','orientation',
  'origin','outline','painting','paragraph','physics','poetry','presentation',
  'primary','principle','print','professor','project','proper noun',
  'psychology','punctuation','qualification','reading','rectangle',
  'register','rehearsal','repetition','reporter','research','revision',
  'rhetoric','ruler','scholarship','schooling','science','science fiction',
  'scissors','sentence','session','sketch','skill','sociology','solution',
  'source','speculation','speech','spelling','statistics','stereotype',
  'student','subject','subtraction','syllabus','tertiary','textbook',
  'theme','theory','thesis','topic','tuition','tutorial','vocabulary',
  'vowel','writing','written',
]);

// Expansión adicional de SPORTS_AND_LEISURE
cat('sports_and_leisure', [
  'acrobat','aerobics','archery','athlete','audition','autobiography',
  'badminton','ballet','band','biography','boxing','broadcast','broadcast',
  'cable','campfire','carnival','cast','celebrate','celebration','cello',
  'championship','character','chess','choir','circus','classical',
  'climbing','club','coach','coaching','collector','comedy','competition',
  'contestant','craft','crew','disco','documentary','drama','drum',
  'entertain','entertainer','episode','event','exercise','extreme sport',
  'fame','fanatic','fashion','fiction','film','flute','folk','fun',
  'gallery','going out','golf','gymnastic','hiking','hobby','idol',
  'instrument','jazz','jogging','karate','kit','leisure','lyrics',
  'magazine','marathon','martial art','match','medal','melody','movie',
  'musical','musician','nightclub','orchestra','orchestral','painting',
  'parade','pastime','performance','photography','piano','player','poetry',
  'pop','poster','practice','practise','quiz','race','record',
  'rehearsal','rehearse','ride','role','rowing','rugby','sailing',
  'score','serial','show','sing','singing','skateboarding','skating',
  'ski','skiing','souvenir','spectator','splash','star','surfer',
  'surfing','swim','swimmer','swimming','symphony','team','theatre',
  'thriller','tour','tourism','tournament','training','trekking','trio',
  'trophy','tune','violin','windsurfing','winner','workshop','yoga',
]);

// Expansión adicional de FOOD_AND_DRINK
cat('food_and_drink', [
  'alcoholic','appetising','aubergine','bakery','bean','beef','berry',
  'bitter','blend','boil','bun','butter','cake','canned','catering',
  'casserole','cherry','chew','chop','cod','coffee','cookie','cooking',
  'crab','cream','crisp','crop','dairy','decaffeinated','diet','dish',
  'dough','eat','fast food','fatty','feast','fish','flavour','flour',
  'food','fresh','fridge','fruit','grill','grilled','harvest','herb',
  'ingredient','jam','juice','junk food','leek','loaf','lunchtime',
  'meal','menu','milk','mint','mushroom','mustard','noodles','nut',
  'olive','pancake','pasta','pastry','peach','peas','peel','pie',
  'pineapple','pizza','popcorn','pork','potato','pour','prawn','protein',
  'pudding','recipe','rice','roast','salad','salt','sauce','sausage',
  'seed','snack','soup','spice','supper','sweet food','sweets','soya',
  'stir','sugar','taste','tasty','tea','teaspoon','toast','tomato',
  'vanilla','vegetable','vinegar','water','wheat','wine','yoghurt',
  'yummy','cutlery','spoon','cooker','oven','frying pan',
]);

// Expansión adicional de TOYS_AND_TECHNOLOGY
cat('toys_and_technology', [
  'algorithm','answerphone','app','application','artificial intelligence',
  'battery','blog','bookmark','broadband','broadcast','browser',
  'calculator','camera','channel','chat','chatroom','click','code',
  'computer','connection','database','desktop','device','digital',
  'digital camera','disc','disk','download','dvd player','electric',
  'electronic','electronics','email','equipment','file','folder','gadget',
  'graphic','graphics','hard drive','headphones','icon','internet',
  'invention','keyboard','laptop','link technology','media','memory',
  'microphone','mobile phone','mp3 player','network','online','password',
  'phone','photograph','photography','printer','program','programme',
  'programming','radio','record','robot','screen','social media',
  'software','tablet','telephone','television','text','text message',
  'upload','video','video game','virtual reality','website','web',
  'webcam','wifi','youtube','zoom','telescope','thermometer','scanner',
  'satellite','telecommunications','share digitally','cell phone',
  'hand-held','hi-tech','high-tech',
]);

// Segunda expansión: palabras aún sin categoría
cat('grammar', [
  'aboard','aboard','according to','alternatively','anxiously','back',
  'backward','backwards','considering','consistently','constantly',
  'corresponding','cruelly','desperately','downward','downwards','due',
  'electronically','fantastically','financially','fluently','foolishly',
  'following','foremost','forever','formerly','forward','forwards',
  'furiously','furthest','grammatical','guess what','hence','highly',
  'hopelessly','hopefully','how','how much','icily','illegally','inclined',
  'indirectly','individually','indoors','inevitably','infinitely',
  'informally','insofar as','instantly','intensely','interestingly',
  'invariably','ironically','irrespective','jealously','knowingly',
  'lately','legally','less','like','likewise','little','long term',
  'look like','loudly','low','magnificently','make sure','meantime',
  'modestly','musically','namely','nearby','negatively','never','newly',
  'non-smoking','none','noticeably','nowadays','onwards','proudly',
  'radically','rapidly','rarely','readily','rudely','saturday','seldom',
  'seemingly','shortly','silently','slowly','subconsciously','swiftly',
  'technically','terribly','thereafter','thereby','thus','tight',
  'tightly','times','ultimately','unavoidably','undeniably','urgently',
  'utterly','vaguely','virtually','visibly','voluntarily','vitally',
  'warmly','well known','whatsoever','whereby','wholeheartedly','wholly',
  'why','wildly','worldwide','there','concerning','otherwise','hence',
  'twice','lots','kind of','luckily','unluckily','strangely','creatively',
  'brilliantly','calmly','deeply','carefully','widely','notably','nicely',
  'effectively','efficiently','extensively','fantastically','finely',
  'firmly','fluently','gently','generously','gracefully','greatly',
  'harshly','highly','ideally','immensely','importantly','increasingly',
  'independently','internally','ironically','jointly','largely','lightly',
  'logically','loosely','loudly','mainly','markedly','mechanically',
  'mentally','merely','moderately','momentarily','morally','mysteriously',
  'narrowly','naturally','nearly','necessarily','nervously','nicely',
  'normally','obviously','officially','outwardly','overall','particularly',
  'partially','patiently','permanently','personally','physically',
  'plainly','politically','positively','precisely','previously','profoundly',
  'properly','purely','quietly','randomly','rationally','readily',
  'rightly','roughly','rudely','safely','seriously','sharply','slightly',
  'solely','somewhat','specifically','spiritually','steadily','steeply',
  'strictly','strongly','supposedly','technically','temporarily',
  'traditionally','tragically','tremendously','typically','unexpectedly',
  'unfortunately','unanimously','usually','utterly','voluntarily','warmly',
  'wisely','wrongly',
]);

cat('descriptions', [
  'acceptance','accustomed','addictive','admission','analytical','apology',
  'appreciation','arbitrary','arrangement','aspiring','assumption',
  'attachment','attractive','aware','beginning','bias','blank','blunt',
  'bond','bravery','breakthrough','broad','burden','catastrophe','chance',
  'chatty','cheeky','classic','commitment','communicative','comparison',
  'competent','completion','complexion','complication','comprehensive',
  'compulsory','conceited','concentration','conception','concrete',
  'conscience','conscious','consensus','considerate','consideration',
  'constraint','consumption','continuity','continuous','contradiction',
  'contradictory','conviction','convinced','core','correction','cosmopolitan',
  'counterpart','countless','courageous','courteous','courtesy','coward',
  'culture','cunning','customary','day-to-day','deadly','death','deception',
  'deceptive','dedication','denial','dependence','dependent','deprivation',
  'deprived','deserted','destiny','destruction','deterrent','detrimental',
  'devastating','devastation','difficult','dignified','disability',
  'disadvantaged','disagreement','discontent','discretion','dishonest',
  'disloyal','displacement','disruption','disruptive','dissatisfaction',
  'distance','diversity','dominance','dominant','doom','drawback','dumb',
  'ease','effectiveness','efficiency','effort','eminent','endurance',
  'enjoyment','entity','essence','ethic','ethnic','exaggeration','exception',
  'existing','expectation','explicit','explosive','expression','expressive',
  'exquisite','extent','external','extremist','fairness','fate','flaw',
  'forbid','foreign','forthcoming','foundation','free','frenzy','frequent',
  'friction','fringe','fruitful','fulfilling','fulfilment','gender',
  'genius','goodness','greatness','guidance','heritage','hierarchy',
  'hidden','homelessness','honoured','hospitality','hypocrisy','hypocritical',
  'ignorant','illiterate','imitation','immature','implication','implicit',
  'impossibility','improved','impulse','impulsive','inability','inaccuracy',
  'incentive','inclination','inclusion','inconsiderate','individualism',
  'inefficient','infancy','inferiority','inherent','initiative','innovation',
  'insecurity','insight','instinct','integrity','intellect','intellectual',
  'intensity','interaction','interference','interim','internal','intolerance',
  'introvert','intuition','involved','involvement','isolation','justifiable',
  'justification','justified','key','laziness','leading','legacy',
  'legitimate','lengthy','liability','lifelong','likelihood','limitation',
  'limited','living','long-lasting','long-running','long-time','longevity',
  'loss','loud','magic','magical','masculine','mass','master','masterpiece',
  'materialism','materialist','materialistic','maximum','means','mechanical',
  'mechanism','mediocrity','minimum','minor','minority','misfortune',
  'misleading','misunderstanding','mode','modification','momentum',
  'mortality','motion','motive','movement','muddled','myth','nationality',
  'necessary','necessity','needless','negligence','negligent','never-ending',
  'norm','normality','notorious','notion','obsolete','obstacle','operation',
  'optimism','ordinary','orthodoxe','ownership','packed','paradox',
  'persistent','phenomenon','philosophy','possibility','potential',
  'precedent','predominant','preliminary','presence','preservation',
  'presumption','prevention','prior','progressive','promising','prone',
  'proposition','prospect','prospective','provision','proximity','purity',
  'pursuit','rarity','reasoning','rebellion','receptive','recession',
  'related','relation','relevance','reliability','reliance','religion',
  'reputation','requirement','resemblance','resolution','restricted',
  'restriction','restrictive','retention','revelation','revival','riches',
  'rivalry','routine','satisfaction','scope','secret','security',
  'selfishness','senseless','sentiment','separation','serenity','severity',
  'significance','sincerity','situation','skill','solidarity','solitary',
  'soul','stability','stance','starvation','state','status','stubbornness',
  'substance','successor','sufficient','sufficiency','suitability',
  'superiority','survival','sympathy','talent','tendency','tension',
  'testimony','thought','threat','thriving','tradition','tragedy',
  'transformation','transition','trial','tribute','triumph','trouble',
  'troublesome','turmoil','uncertainty','unity','usage','validity',
  'variety','victory','vision','vitality','weakness','wealth','wisdom',
  'wonder','worth',
]);

cat('feelings', [
  'addictive','appetite','apology','blame','desperation','discontent',
  'disapproval','dissatisfied','disturbed','eagerly','elation','frenzy',
  'fright','fury','giggle','groan','grudge','guilt','hatred','horror',
  'impatience','impulse','insecurity','inhibition','irritation',
  'misfortune','nightmare','panic','petrified','regret','remorse',
  'resentment','sensation','sentiment','shame','shyness','sob','sorrow',
  'spite','stress','temper','temptation','thrill','tiredness','uneasy',
  'uncertainty','wish','wonder','yearn',
]);

cat('family_and_friends', [
  'adopted','adoption','ancestor','birth','born','business person','child',
  'childhood','children playing','clown','comedian','commander','darling',
  'daycare','descendant','devil','divorce','eldest','enemy','entertainer',
  'fanatic','follower','fool','foreigner','founder','gang','get married',
  'god','gossip','grandchild','grandchild','helper','heir','homeless',
  'honeymoon','host','housewife','human','idiot','idol','infancy',
  'inhabitant','inheritance','intruder','liar','lord','mankind','marriage',
  'middle-aged','name','native','neighbour','newcomer','offspring',
  'old','opponent','orphan','patron','peer','pioneer','prisoner',
  'protagonist','public','queen','refugee','rival','role model','saint',
  'servant','shopkeeper','sir','stranger','survivor','suspect','thief',
  'thinker','trainer','trainee','veteran','villain','villager','warrior',
  'witch','worker',
]);

cat('work', [
  'abolish','abortion','accusation','ad n','advert','agreed','alliance',
  'allied','analyst','armed','assembly','assault','assassination',
  'audience','backing','bribe','bribery','bomb','bomber','bombing','burgle',
  'captain','casualty','chief','command','corporate','court','coverage',
  'crackdown','crash','credit','critic','custody','cutback','data',
  'death','declaration','democratic','denial','department','department store',
  'deposit','designer','detection','devil','diplomacy','director','dismissal',
  'dole','emission','emperor','empire','establishment','exile','expense',
  'fighting','fire brigade','forgery','for hire','formation','fraud',
  'fraudulent','full-time','government','gun','half-price','hammer',
  'hard work','harassment','headline','headteacher','industrialization',
  'industrialized','invasion','investigation','journalist','keeper',
  'leaflet','left-wing','legacy','machinery','mail','maintenance','maker',
  'manage','manufacture','margin','master','mathematical','maximum',
  'merger','miner','mining','monetary','money','nation','network',
  'networking','news','newsletter','nomination','occupation','offence',
  'offender','offensive','output','output','paperwork','part-time',
  'permitted','perk','petition','phase','privatize','programmer',
  'progression','proportion','proposal','proposed','prosecution','provider',
  'publication','publisher','race','rank','rally','rape','rating',
  'readership','recognition','recruitment','redundancy','regime','registry',
  'reliance','right-wing','robbery','ruling','sanction','scam','scandal',
  'secretary','scheme','semi-final','sentence','setting','slavery',
  'slaughter','smuggle','socialism','socialist','society','solicitor',
  'sovereignty','spokesperson','sponsorship','squad','stabbing','statute',
  'stock','suicide','summit','talks','task','taxation','technician',
  'testimony','token','toll','torture','transaction','transfer','treaty',
  'tribunal','troops','turmoil','vacancy','vandalism','venture','verdict',
  'warfare','weapon','workforce','xenophobia',
]);

cat('body', [
  'beard','complexion','deaf','deodorant','disability','disorder','eye',
  'face','finger','fist','footstep','fur','gasp','germ','guts','hair',
  'haircut','head','headache','insomnia','itch','jaw','joint','left hand',
  'medical','mind','mouth','nail','nerves','non-smoking','posture',
  'seduce','sensation','sex','shoulder','sickness','sip','skin','skull',
  'swollen','throat','tiredness','tiresome','tiring','tobacco','tooth',
  'weakness','wrist',
]);

cat('places', [
  'country','directions','directory','department store','distance',
  'dome','eastern','entry','foreign','frontier','gap','globe','grave',
  'gulf','headquarters','heaven','hedge','hell','hill','holiday',
  'homeless','hostel','island','kingdom','lane','load','location',
  'loft','mansion','middle','mine','nation','neighbouring','northern',
  'olympic','passage','plateau','pond','province','river','rose',
  'ruin','rural','sanctuary','scenic','scene','secluded','settlement',
  'shore','southern','suburb','surrounding','surroundings','territory',
  'tomb','tower','trail','tunnel','uninhabited','unspoiled','vacancy',
  'verge','venue','vicinity','viewpoint',
]);

cat('the_home', [
  'attic','basket','bench','board','brass','bubble','cage','card',
  'carrot','clean','cleaner','decoration','decorative','deck','doll',
  'dot','drain','dump','fence','fireplace','firework','glue',
  'hairdryer','hammer','hang','jar','knob','ladder','leak','lid',
  'mail','mug','nap','nest','noise','noticeboard','roll','rope',
  'rubber','rug','scissors','script','seal','setting','shed','shelf',
  'shell','shield','slot','spare','tin','tissue','toothpaste','torch',
  'toy','tray','trolley','trunk','tube','vacuum','wall',
]);

cat('weather_and_nature', [
  'acid','atmosphere','boiling','branch','bronze','burning','bush',
  'cage','carbon','chain','chilly','chill','coal','copper','crystal',
  'cultivate','culture','dam','dawn','decay','diamond','dirt','domain',
  'dot','draught','drought','electrical','flame','flash','flood',
  'fragrance','frost','fumes','generation','globe','hail','hazard',
  'hot','horizon','icy','lightning','melt','mineral','moon','mud',
  'muddy','natural','nitrogen','nuclear','oak','ocean','oil','oxygen',
  'pesticide','precipitation','radiation','rainfall','rose','rot',
  'ruin','sand','scar','scarcity','sky','snow','soar','soaring',
  'solar','solid','spark','species','stone','storm','stormy','stream',
  'tide','timber','torrential','toxic','underground','volcanic',
  'waterfall','waterproof','wave','weed','wet','wildlife','wind',
  'woodland','world',
]);

cat('transport', [
  'crash','directions','diving','expedition','fleet','for hire',
  'helmet','holiday','itinerary','land','lap','launch','long-distance',
  'load','motorway','naval','overseas','pilot','rail','race','rapid',
  'route','runner','rush','rush hour','seatbelt','short-term','signal',
  'speed','stopover','travel','voyage',
]);

cat('school', [
  'alphabet','alphabetical','analyse','analyst','answer','assembly',
  'archaeologist','archaeology','catalogue','chart','chemical','comparison',
  'data','design drawing','design planning','design process','detail',
  'dialect','dimension','exploration','fabric','feedback','framework',
  'generalize','generalization','grade','graduation','grammatical','graph',
  'guideline','handout','heading','illustration','image','ink','input',
  'introduction','layout','leaflet','legend','linguistic','marker',
  'mathematical','medium','mentor','metaphor','method','model','moderately',
  'myth','narrator','noticeboard','notion','overview','phase','prediction',
  'preparation','premise','primary','process','project','publication',
  'quote','radical','ratio','reading','realistic','record','reflection',
  'remedy','revision','rhyme','rhythm','role','round','sample','schedule',
  'scenario','scheme','scope','script','selection','simulation','snippet',
  'structure','style','subject','succession','symbolic','summary',
  'technique','template','term','timeline','topic','trend','tutorial',
  'understanding','update','version','viewpoint','vocabulary',
]);

cat('sports_and_leisure', [
  'audience','bet','comeback','composer','dice','diving','doll','fan',
  'fanatic','fantasy','firework','foul','gambling','gardening','gear',
  'get fit','gossip','hunting','idol','jog','keeper','kite','magic',
  'masterpiece','narrative','opponent','oval','participant','performer',
  'prize','race','reader','recreation','relax','rivalry','rose',
  'running','saint','semi-final','singer','skating','souvenir','splash',
  'spotlight','stamina','star','stretch','supporter','swim','swimmer',
  'tactic','task','team','trick','triumph','trophy','tune music',
  'twist','victory','viewer','warrior','winner','wit',
]);

cat('numbers_and_time', [
  'billion','coin','consecutive','countdown','cutback','daycare','double',
  'dozen','effective','efficiency','elapse','end up','entry','erode',
  'expire','extensive','formation','fraction','graduation','half',
  'handful','level','majority','million','minimum','moment','monetary',
  'money','pace','ratio','reset','rush hour','scale','scope','simultaneous',
  'span','specific','stage','times','timing','toll','ton','two','year',
]);

cat('food_and_drink', [
  'appetite','baker','carrot','cater','draught','drizzle','drunk',
  'flavour','fresh','fruit','fusion','ingredient','jar','juicy','lemon',
  'liquid','loaf','mock','mustard','nut','olive','paste','pastry',
  'peel','pint','plump','portion','pour','recipe','roast','ripe',
  'salty','savoury','seed','snack','sour','sow','spice','spread',
  'starter','sticky','stir','supper','sweet','sweets','taste','tasty',
  'thirst','toast','vinegar','yeast',
]);

cat('colours', [
  'bronze','gold','brass','crystal','denim','diamond','velvet',
]);

cat('clothes', [
  'dressed','fabric','hood','pyjamas','ribbon','scruffy','shade',
  'shampoo','silk','sleeve','sock','stocking','stripe','strap',
  'thread','woven',
]);

cat('toys_and_technology', [
  'cell phone','electrical','electric','gear','hand-held','hi-tech',
  'high-tech','kite','photocopy','photo','programming','satellite',
  'spread','spreadsheet','telecommunications','telescope','telly',
  'video','wifi',
]);

cat('animals', [
  'beast','breed','bull','cage','cow','feather','fur','germ',
  'nest','paw','tail','tortoise','toad','vine','worm',
]);

cat('miscellaneous', [
  'action','addition','address','affair','alert','alteration',
  'alternative','assembly','bandwagon','bang','batch','belonging',
  'bill','birthday','bit','booking','breakdown','brink','bronze',
  'bubble','bunch','cancellation','card','chain','coin','collapse',
  'collection','comeback','command','commemorate','comment','concept',
  'conversion','copyright','counterpart','credit','cure','custom',
  'customs','cutback','darling','data','decade','deck','delivery',
  'denial','deposit','destiny','detail','details','diamond','difference',
  'dimension','direction','directory','discovery','division','doom',
  'dot','double','draft','dream','edge','echo','ending','enquiry',
  'entry','equivalent','error','etc','evaluation','event','evidence',
  'example','exchange','experiment','explanation','explosion','facility',
  'fact','formation','fortune','framework','function','gap','gathering',
  'goal','grain','guidance','guideline','gun','handful','heading',
  'heap','hint','hole','horn','id','id card','identification','image',
  'initiative','inquiry','installation','item','journal','key','knot',
  'label','ladder','lap','launch','layer','layout','legacy','level',
  'licence','lid','line','link','load','loot','lump','magic','manner',
  'mask','match','measure','message','milestone','mix','mode','model',
  'modification','noise','note','notion','null','nutshell','odds',
  'opening','option','ornament','outline','outcome','packet','pact',
  'page','paper','paperwork','parcel','part','passage','path','pause',
  'peak','phase','phrase','pile','pin','plan','plot','pocket money',
  'portion','post','powder','preview','priority','prize','process',
  'promise','proof','proportion','puzzle','quantity','query','question',
  'queue','quote','race','range','rating','record','reminder','result',
  'reunion','review','ribbon','ritual','role','round','rule','rut',
  'sake','sample','saving','scenario','series','setting','shade','shape',
  'signal','situation','slot','source','stage','state','stuff',
  'summary','supply','sword','symbol','system','tale','task','theme',
  'theory','thing','thread','tip','title','token','tone','tool',
  'trait','tribute','trick','trilogy','trouble','twist','type','unit',
  'usage','variety','venue','version','vice','view','wave','wire',
  'word','wreck','wreckage','zone',
]);

// Tercera expansión: barrido final de palabras restantes
cat('actions', [
  'accelerate','accompany','applaud','attain','blink','broaden',
  'coincide','commence','concede','constitute','contact','crave','creep',
  'curb','dazzle','deceive','decrease','defend','depend on','descend',
  'differ','differentiate','dip','disagree','discourage','dominate',
  'enrich','envision','equate','exclaim','exemplify','fade','familiarize',
  'feel','fend','flick','generate','gesture','get','get back','get down',
  'get in','get off','get on','get up','govern','grasp','greet','grin',
  'grip','guess','hand in','hand out','hang up','haul','hit','hug','hum',
  'imitate','imply','impress','imprison','include','incorporate','increase',
  'indulge','inform','insert','insist','intend','interact','intrude',
  'investigate','irritate','lean','leap','lessen','linger','loom',
  'loosen','lower','lure','mend','merge','minimize','misinterpret',
  'misplace','misunderstand','moan','murmur','neglect','nod','oblige',
  'offend','omission','oppose','originate','overcome','overlook','owe',
  'perform','pollute','populate','praise','preserve','reckon','refrain',
  'relish','render','renew','repay','reproach','reproduce','respond',
  'retreat','retrieve','revise','revive','rewrite','rob','scramble',
  'scream','scratch','seize','sharpen','shift','simplify','slide','snap',
  'snatch','sniff','soak','specify','speculate','spoil','sponsor','spray',
  'spread','squeeze','stab','stagger','stare','steer','stem','stumble',
  'subtract','suck','sue','suppress','swap','sweep','swing','tease',
  'tempt','terrify','tick','tolerate','toss','transform','translate',
  'transmit','trap','tread','trigger','trudge','twist','undo','unfold',
  'vary','vent','weep','weigh','whisper','widen','wield','wipe',
  'worship','yawn','ring back','run out','slam','slash','slice','slip',
  'slap','squander','squash','squeeze','stroll','stroke','strip','strive',
  'suffer','summarize','summon','surf','surrender','surround','suspend',
  'stamp','stain','roar','rise','rip','reach','react','recharge',
  'recur','redevelop','redistribute','revolt','rethink','retrace',
  'ring back','scan','scramble','scrap','scratch','seal','select',
  'sigh','sip','sit','skate','slam','slash','sniff','sow','spring',
  'sprinkle','spur','split','split up','spot','stay','stay behind',
  'stir','stroll','sweep','swing','switch','throw away','tighten',
  'tolerate','touch','trace','trek','trudge','toss','wander','want',
  'wear out','wink','wipe','withdraw','wreck','yell',
]);

cat('descriptions', [
  'accumulation','acceleration','attention','attraction','behalf','best',
  'big','bloody','boundary','breadth','butt','charm','cling','complimentary',
  'component','concession','conclusion','confession','confidential',
  'confidently','confirmation','confrontation','confused','confusion',
  'congestion','consent','conservative','container','contents','convenient',
  'conversation','corrupt','creation','crowded','cruelty','daydream',
  'dazed','defective','defensive','deficiency','deliberate','density',
  'deduction','desired','detached','detailed','developed','developing',
  'dim','disappearance','discontent','disrespectful','distant','distraction',
  'disturbance','divided','down-to-earth','downhill','downside','easy',
  'efficient','elimination','encouragement','encouraging','endeavour',
  'endless','entertaining','exhaustion','expect','expected','experienced',
  'extension','face-to-face','faculty','favourite','feminine','flashback',
  'forbidden','former','frantic','friendliness','front','fuss','good',
  'growing','gift','handsome','hazardous','heavenly','helpful','hesitation',
  'impossible','impressed','inaccurate','inclusive','inconvenience',
  'incorrect','indicator','indifference','indoor','influx','inner',
  'insufficient','intensive','interactive','international','introvert',
  'invitation','irony','job','junior','junk','junk mail','knowledgeable',
  'latest','left-hand','liberation','lifestyle','likely','limited',
  'listener','loose','lost','low','mean','mere','minimum','mishap',
  'missing','mistake','mistaken','moderation','monster','moving','naughty',
  'nosy','non-existent','nonsense','objection','obligation','obligatory',
  'obscene','observant','observer','obsessed','obsession','obstacle',
  'occasional','open','openness','optimist','optimistic','optional',
  'ordeal','originally','orthodox','outbreak','outer','outgoing',
  'outgoings','outlook','overcrowded','overweight','overworked','packed',
  'paradigm','paradise','parallel','partial','peer pressure','persistence',
  'persuasion','persuasive','pit','plague','plenty','plethora','plight',
  'point of view','poor','poorly','possessive','possible','powerfully',
  'practitioner','precaution','predecessor','predominantly','preferably',
  'preference','prejudice','prejudiced','preliminary','prepared','pressure',
  'prestige','prestigious','pretty','preventive','price','prior',
  'proceedings','projection','prolonged','prompt','prospect','prospective',
  'proudly','proverb','provision','provocation','psychologist','public opinion',
  'quaint','qualified','quest','quiet','quotation','racket','rash',
  'raw','ray','readiness','ready','realization','realm','rear',
  'reassurance','reassuring','rebellious','recent','reception','receptive',
  'recollection','recommendation','recreational','refined','refreshing',
  'rejection','relationship','relaxation','relaxed','relaxing','relevant',
  'reliant','relieved','remaining','remains','remark','renowned','repeated',
  'replacement','reportedly','representation','reservation','reserve',
  'residence','resilience','respected','respectful','respectfully',
  'respective','response','restraint','restricted','restrictive','rethink',
  'retired','retrospect','reversal','revolutionary','rich','right-hand',
  'rip-off','rosy','rubbish','rudeness','rumour','sad','sadly','safe',
  'satisfactory','satisfied','scarce','scarcely','scarcity','scary',
  'sceptical','scientific','secluded','select','selective','self',
  'self-assurance','self-control','self-discipline','self-made',
  'self-reliance','self-service','setback','short term','short-sighted',
  'short-term','shortage','shortcoming','sickness','side','side effect',
  'significance','similarity','simplification','simulation','simultaneous',
  'single','situated','situation','sleepless','sleepy','slender','slogan',
  'slow','smart clever','smart stylish','smoky','smoothly','social studies',
  'soft','sole','sore','sorry','soundtrack','specialist','speciality',
  'specification','specimen','spectrum','spending','sphere','spine','spiral',
  'splendour','sporty','spotlight','spouse','standpoint','stardom',
  'starvation','status symbol','stereotypical','stimulus','stocking',
  'straightforward','strain','stranded','strenuous','striker','structural',
  'structured','subsequent','substantially','substitute','substitution',
  'sufficiently','suitability','superfluous','supervision','supplementary',
  'suppose','surface','surplus','surprised','surprising','suspicion',
  'suspiciously','sympathetic','tact','tactics','teaching','tenderness',
  'tense','terms','texture','thankful','the last minute','the same',
  'the upper class','the working class','therapeutic','thick','thin',
  'things','threshold','thrive','thriving','tiring','tiresome','top',
  'touch','tranquility','transmission','trap','tricky','troublesome',
  'true','truly','ultimate','unaffected','unattractive','unbelievable',
  'unchanged','unclear','underdeveloped','undeveloped','unemployed',
  'uneventful','unfamiliar','unfit','unforeseen','unfortunate','unfriendly',
  'unhappiness','unhealthy','unhelpful','unimportant','uninterested',
  'uninteresting','unknown','unlike','unlikely','unlikey','unpleasant',
  'unpopular','unprecedented','unproductive','unprofessional','unqualified',
  'unreal','unrelated','unrest','unscrupulous','unsolved','unsuccessful',
  'unsuccessfully','unsure','untouched','untrue','unusually','unwanted',
  'unwell','unwilling','unwillingly','unwillingness','unwise','upper',
  'upper-class','upright','usage','user','usual','utmost','vacant',
  'vain','valid','vanity','variation','varied','versatile','verse',
  'virgin','voice','voluntary','well-being','wide','widespread','willing',
  'winding','withdrawn','worrying','worse','worsen','worst','would-be',
  'wrinkle','yawn',
]);

cat('grammar', [
  'aboard','accidentally','allegedly','behalf','big','bottom','bound',
  'broadly','calmly','casually','competently','confidently','consciously',
  'contrary','critically','cruelly','curiously','decisively','deeply',
  'desperately','easy','efficiently','elaborately','encouragingly','endlessly',
  'enjoyably','extensively','formerly','frankly','front','furiously',
  'furthest','gently','gracefully','gratefully','harshly','hence','highly',
  'hopefully','how','how much','icily','illegally','incredibly','indirectly',
  'individually','indoors','inevitably','informally','innocently','insofar as',
  'instantly','intensely','interestingly','invariably','ironically',
  'irrespective','jealously','jointly','latest','lately','legal','lightly',
  'logically','loosely','loudly','magnificently','meely','mere','modestly',
  'momentarily','morally','musically','mysteriously','namely','narrowly',
  'naturally','nearly','necessarily','negatively','nervously','nicely',
  'non-smoking','noticeably','oddly','officially','onwards','outwardly',
  'overall','partly','patiently','permanently','personally','physically',
  'plainly','politically','positively','predominantly','presumably',
  'promptly','properly','purely','quietly','radically','randomly','rapidly',
  'rarely','rationally','readily','recently','reportedly','rightly',
  'roughly','rudely','safely','seemingly','seldom','seriously','sharply',
  'silently','slightly','slowly','smoothly','solely','somewhat',
  'specifically','sparsely','spiritually','steadily','steeply','strangely',
  'strictly','strongly','subconsciously','subsequently','supposedly',
  'surprisingly','swiftly','technically','temporarily','terribly',
  'thankfully','thereafter','thereby','thus','tightly','totally',
  'traditionally','tragically','tremendously','typically','unavoidably',
  'undeniably','unfortunately','unanimously','usually','utterly','vaguely',
  'virtually','visibly','voluntarily','warmly','westward','widely',
  'wisely','wrongly','where','whereby','whim',
]);

cat('family_and_friends', [
  'accompany','defender','fellow','foreigner','get married','group',
  'helper','listener','mentor','nickname','penfriend','per','psychologist',
  'reader','sponsor','visitor','voter','writer','you',
]);

cat('body', [
  'beard','complexion','deaf','deodorant','disability','disorder','eye',
  'face','finger','fist','footstep','fur','gasp','germ','guts','hair',
  'haircut','hand','head','headache','insomnia','itch','jaw','joint',
  'left hand','medical','mind','mouth','nail','nerves','posture',
  'right hand','seduce','sensation','sex','shoulder','sickness','sip',
  'skin','skull','spine','swollen','throat','tiredness','tobacco',
  'weakness','wrist',
]);

cat('work', [
  'access','allegedly','analyst','assembly','booking','charge','cruelty',
  'cutback','data','delivery','dole','endeavour','expert','faculty',
  'fighting','fire brigade','forgery','formation','half-price','hammer',
  'hard work','harassment','headline','headteacher','industrialization',
  'industrialized','job','keeper','lawyer','leadership','left-wing',
  'machinery','maker','manufacture','master','memo','miner','mining',
  'missionary','monetary','money','news','newsletter','nomination',
  'obligation','occupation','offence','offender','offset','omission',
  'operation','opponent','outrage','outset','overtime','payment',
  'pedestrian','pence','performer','pit','plea','plethora','plight',
  'poison','pole','pound','practitioner','precaution','premises',
  'presence','presenter','proceedings','projection','prostit','prowl',
  'quota','raise','reach','reaction','readership','reckon',
  'recommendation','reconstruction','recording','reduction','refund',
  'refusal','representation','requirement','restructure','retirement',
  'revenue','review','revolution','revolt','right-wing','robbery',
  'ruling','sanction','satisfaction','savings','scan','scholarship',
  'scope','script','scrutiny','seat','secretariat','sector','security',
  'self-service','semi-final','shortage','shortcoming','siren','slavery',
  'slaughter','smuggle','social studies','soldier','solicitor','solely',
  'specialist','sponsorship','spokesperson','squad','stab','statement',
  'statute','stock','suicide','summary','summit','surplus','suspect',
  'tactic','target','task','taxation','technician','testimony','theft',
  'threat','ticker','token','toll','torture','totalitarian','transaction',
  'transfer','treaty','tribunal','troops','union','vacancy','vandalism',
  'verdict','warfare','weapon','workforce','writer',
]);

cat('places', [
  'country','department store','distance','eastern','entry','foreign',
  'heaven','hedge','hell','holiday','homelessness','hostel','influx',
  'inner','international','land','lane','lighthouse','lookout','north',
  'northern','nearby','olympic','outer','overnight','overseas','paradise',
  'passport','pedestrian','pension','pit','pitch','pole','pond',
  'pony','popularity','premises','presidency','province','public',
  'realm','residence','right hand','room','rosy','route','rural',
  'saddle','sanctuary','scan','scattered','scenic','secluded','sector',
  'settlement','shore','sight','sightseeing','situated','situated',
  'southern','sphere','spotlight','sprawl','stall','standpoint',
  'strand','stranded','street','suburb','surroundings','territory',
  'tomb','tourist','track','trail','transit','trek','tunnel','venue',
  'vicinity','viewpoint','western',
]);

cat('the_home', [
  'basket','bell','bench','board','brass','bubble','cage','card',
  'chain','cleaner','clean','closet','coin','cover','crack','curtain',
  'deck','doll','dot','drain','dump','fabric','fence','fireplace',
  'firework','fixture','furniture','glue','hairdryer','hammer','hang',
  'hook','jar','knob','knot','ladder','leak','lid','lighting','litter',
  'mail','memo','mug','nap','nest','noticeboard','roll','room','rope',
  'rubber','rubbish','rug','scissors','seal','setting','shed','shelf',
  'shell','shield','slot','spare','tin','tissue','toothpaste','torch',
  'toy','tray','trolley','trunk','tube','wall',
]);

cat('food_and_drink', [
  'appetite','baker','carrot','cater','drunk','draught','drizzle',
  'juicy','liquid','lemon','portion','pound','ripe','salty','scent',
  'snack','sour','seed','spice','spray','spread','sticky','stir',
  'supper','taste','thirst','toast','vinegar','yeast',
]);

cat('sports_and_leisure', [
  'applause','bet','comeback','composer','dice','diving','doll',
  'expedition','fan','fantasy','firework','foul','gambling','gardening',
  'get fit','hunting','jog','jest','kite','laugh','listener',
  'masterpiece','melody','opponent','performer','playground','portfolio',
  'prize','reader','recreation','rivalry','runner','running','saint',
  'semi-final','shock','sightseeing','skateboard','song','splendour',
  'sporty','spot','stroll','supporter','swim','tactic','task','team',
  'theme','thrill','trigger','trio','trophy','twist','victory','viewer',
  'walker','walking','wit','wonder',
]);

cat('numbers_and_time', [
  'billion','countdown','decade','double','dozen','half','handful',
  'half-price','level','majority','million','moment','pace','portion',
  'ratio','rush hour','scale','schedule','span','times','two','volume',
]);

cat('weather_and_nature', [
  'boiling','boundary','branch','bronze','burning','chain','chilly',
  'chill','cultivate','daydream','decay','dim','dirt','domain','dot',
  'draught','drought','electrical','explosion','flame','flash','flood',
  'fragrance','frost','fumes','genesis','globe','glow','hazard','hot',
  'horizon','ice','icy','lightning','melt','mineral','moon','mud',
  'muddy','natural','nitrogen','oak','ocean','oil','oxygen','pesticide',
  'radiation','rainfall','rose','rot','ruin','sand','scar','scarcity',
  'sky','snow','soar','soaring','solar','solid','spark','species',
  'spring','stem','stone','storm','stormy','stream','tide','timber',
  'torrential','toxic','underground','volcanic','waterfall','waterproof',
  'wave','weed','wet','wildlife','wind','woodland','world',
]);

cat('miscellaneous', [
  'access','accumulation','action','ad n','addition','affair','alert',
  'alteration','alternative','arrangement','bandwagon','bang','batch',
  'belonging','bill','birth','bit','blow','board','booking','boundary',
  'breakdown','brink','bronze','bubble','bunch','cancellation','card',
  'chain','charm','chart','coin','collapse','collection','comeback',
  'command','concept','concession','conclusion','confirmation','context',
  'conversion','copyright','counterpart','credit','custom','customs',
  'cutback','data','decade','deck','delivery','denial','deposit',
  'destiny','detail','details','diamond','difference','dimension',
  'direction','discovery','disposition','disposition','division','doom',
  'dot','double','draft','dream','edge','echo','ending','enquiry',
  'entry','equivalent','error','evaluation','event','evidence','example',
  'exchange','experiment','explanation','explosion','extension','facility',
  'fact','favourite','feat','formation','fortune','framework','function',
  'fuss','gap','gathering','gaze','gift','goal','grain','greeting',
  'guidance','guideline','gun','handful','hand out','heading','heap',
  'hint','hole','horn','id','id card','identification','image',
  'initiative','installation','item','journal','key','knot','label',
  'ladder','lap','launch','layer','layout','legacy','level','licence',
  'lid','line','litter','load','loot','lump','magic','manner','mask',
  'match','measure','message','milestone','mix','mode','model','molecule',
  'noise','note','notion','nutshell','odds','opening','option','ornament',
  'outline','outcome','packet','pact','page','paper','paperwork',
  'parcel','part','particle','passage','path','pause','peak','phase',
  'phrase','pile','pin','plan','plot','pocket money','portion','post',
  'powder','preview','priority','prize','process','promise','proof',
  'proportion','puzzle','quantity','query','question','queue','quote',
  'race','range','rating','record','reminder','result','reunion',
  'review','ribbon','ritual','role','round','rule','rut','sake',
  'sample','saving','scenario','series','setting','shade','shape',
  'signal','situation','slot','source','stage','state','stuff','summary',
  'supply','symbol','system','tale','task','theme','theory','thing',
  'thread','tip','title','token','tone','tool','trait','tribute',
  'trick','trouble','type','unit','usage','variety','venue','version',
  'vice','view','wave','wire','word','wreck','wreckage','zone',
]);

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

// ─── Parser de Appendix 2 de PDFs Cambridge (A2, B1) ─────────────────────────
const PAGE_NOISE = /^(©|Page \d|Cambridge|Preliminary|Key and Key|Schools|Vocabulary List|Appendix)/i;
const KNOWN_TOPICS = new Set(Object.keys(TOPIC_TO_CAT));

function isTopicHeading(line) {
  if (!line || line.length > 70) return false;
  if (PAGE_NOISE.test(line)) return false;
  if (/\s{3,}/.test(line)) return false;
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

    const tokens = line.split(/\s{2,}/);
    for (const token of tokens) {
      const variants = token.split('/').map(s => s.trim());
      for (const variant of variants) {
        const w = cleanWord(variant);
        if (!w || w.length < 2 || w.split(' ').length > 3) continue;
        if (!/[a-z]/.test(w)) continue;
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

  // ── Stemmer mejorado: busca la raíz en UNIVERSAL ────────────────────────────
  function stemLookup(w) {
    const check = (...candidates) => {
      for (const c of candidates) if (UNIVERSAL[c]) return UNIVERSAL[c];
      return null;
    };

    // consonante doble: running→run, stopped→stop, bigger→big
    const doubleConsonant = (base) => {
      if (base.length > 3) {
        const last = base[base.length - 1];
        if (last === base[base.length - 2] && !/[aeiou]/.test(last)) {
          return base.slice(0, -1);
        }
      }
      return null;
    };

    // -ing
    if (w.endsWith('ing') && w.length > 6) {
      const s = w.slice(0, -3);
      const dc = doubleConsonant(s);
      const r = check(s, s + 'e', dc);
      if (r) return r;
    }
    // -ed
    if (w.endsWith('ed') && w.length > 5) {
      const s = w.slice(0, -2);
      const s1 = w.slice(0, -1);
      const dc = doubleConsonant(s);
      const r = check(s, s + 'e', s1, dc);
      if (r) return r;
    }
    // -ied → -y
    if (w.endsWith('ied') && w.length > 5) {
      const r = check(w.slice(0, -3) + 'y');
      if (r) return r;
    }
    // -ies → -y
    if (w.endsWith('ies') && w.length > 5) {
      const r = check(w.slice(0, -3) + 'y');
      if (r) return r;
    }
    // -es
    if (w.endsWith('es') && w.length > 4) {
      const s = w.slice(0, -2);
      const r = check(s, s + 'e', w.slice(0, -1));
      if (r) return r;
    }
    // -s
    if (w.endsWith('s') && w.length > 4 && !w.endsWith('ss')) {
      const r = check(w.slice(0, -1));
      if (r) return r;
    }
    // -er / -est
    if (w.endsWith('est') && w.length > 6) {
      const s = w.slice(0, -3);
      const dc = doubleConsonant(s);
      const r = check(s, s + 'e', dc);
      if (r) return r;
    }
    if (w.endsWith('er') && w.length > 5) {
      const s = w.slice(0, -2);
      const dc = doubleConsonant(s);
      const r = check(s, s + 'e', dc);
      if (r) return r;
    }
    // -ly → adjetivo base
    if (w.endsWith('ly') && w.length > 5) {
      const s = w.slice(0, -2);
      const r = check(s, s.replace(/il$/, 'le'));
      if (r) return r;
    }
    // -ness / -ment / -tion / -sion / -ance / -ence / -ity / -ism → raíz
    for (const [suf, repl] of [
      ['ness',4],['ment',4],['tion',4],['sion',4],
      ['ance',4],['ence',4],['ity',3],['ism',3],
      ['ful',3],['less',4],['able',4],['ible',4],
    ]) {
      if (w.endsWith(suf) && w.length > suf.length + 3) {
        const s = w.slice(0, -suf.length);
        const r = check(s, s + 'e', s + 'y');
        if (r) return r;
      }
    }
    // -ist / -ian / -er / -or (agentes)
    for (const suf of ['ist','ian']) {
      if (w.endsWith(suf) && w.length > suf.length + 3) {
        const r = check(w.slice(0, -suf.length));
        if (r) return r;
      }
    }
    return null;
  }

  // ── Heurísticas por sufijo (fallback para palabras de frecuencia) ──
  function suffixCategory(w) {
    // Adverbios → grammar
    if (w.length > 5 && w.endsWith('ly')) return 'grammar';
    // Adjetivos en -ful, -less, -ous, -ive, -able, -ible, -ish, -al, -ic → descriptions
    if (w.length > 6 && (w.endsWith('ful') || w.endsWith('less') || w.endsWith('ous'))) return 'descriptions';
    if (w.length > 6 && (w.endsWith('able') || w.endsWith('ible'))) return 'descriptions';
    if (w.length > 6 && (w.endsWith('ive') || w.endsWith('ish'))) return 'descriptions';
    if (w.length > 6 && (w.endsWith('ical') || w.endsWith('ical'))) return 'descriptions';
    if (w.length > 6 && w.endsWith('ic') && !w.endsWith('eric') && !w.endsWith('edric')) return 'descriptions';
    if (w.length >= 5 && w.endsWith('al') && !/^[bcdfghjklmnpqrstvwxyz]{3,}al$/.test(w)) return 'descriptions';
    // Sustantivos abstractos → descriptions
    if (w.length > 7 && (w.endsWith('ness') || w.endsWith('ment'))) return 'descriptions';
    if (w.length > 7 && (w.endsWith('tion') || w.endsWith('sion'))) return 'descriptions';
    if (w.length > 7 && (w.endsWith('ance') || w.endsWith('ence'))) return 'descriptions';
    if (w.length > 6 && (w.endsWith('ity') || w.endsWith('ety'))) return 'descriptions';
    if (w.length > 6 && (w.endsWith('ship') || w.endsWith('hood') || w.endsWith('dom'))) return 'descriptions';
    if (w.length > 6 && w.endsWith('ism')) return 'descriptions';
    if (w.length > 6 && (w.endsWith('ery') || w.endsWith('ary') || w.endsWith('ory'))) return 'descriptions';
    // Agentes (persona que hace algo) → work
    if (w.length > 5 && (w.endsWith('ist') || w.endsWith('ian'))) return 'work';
    if (w.length > 5 && w.endsWith('eer')) return 'work';
    if (w.length > 4 && w.endsWith('or') && !['color','floor','door','poor','for'].includes(w)) return 'work';
    // Verbos conjugados → actions
    if (w.length > 5 && w.endsWith('ing') && !w.endsWith('ring') && !w.endsWith('king')) return 'actions';
    if (w.length > 5 && w.endsWith('ize') || w.length > 5 && w.endsWith('ise')) return 'actions';
    if (w.length > 5 && (w.endsWith('ify') || w.endsWith('ate'))) return 'actions';
    // Participios y pasados regulares → actions (threshold alto para evitar nombres)
    if (w.length > 7 && w.endsWith('ed') && /[^aeiou]ed$/.test(w)) return 'actions';
    return null;
  }

  for (const { word, level } of allWords) {
    stats[level].total++;
    const w = word.toLowerCase();
    let assigned = null;

    if (level === 'A1') {
      assigned = a1Map[w] || UNIVERSAL[w] || stemLookup(w) || suffixCategory(w) || null;
    } else if (pdfMaps[level]) {
      assigned = pdfMaps[level][w] || UNIVERSAL[w] || stemLookup(w) || suffixCategory(w) || null;
    } else {
      assigned = UNIVERSAL[w] || stemLookup(w) || suffixCategory(w) || null;
    }

    if (assigned) {
      update.run(assigned, word, level);
      stats[level].categorized++;
    }
  }

  db.close();

  console.log('\n[cat] Resultado por nivel:');
  let totalCat = 0, totalAll = 0;
  for (const [lvl, s] of Object.entries(stats)) {
    const pct = s.total ? Math.round(s.categorized / s.total * 100) : 0;
    console.log(`  ${lvl}: ${s.categorized}/${s.total} (${pct}%)`);
    totalCat += s.categorized;
    totalAll += s.total;
  }
  console.log(`\n  TOTAL: ${totalCat}/${totalAll} (${Math.round(totalCat/totalAll*100)}%)`);

  const db2 = new Database(DB_PATH);
  const dist = db2.prepare(`
    SELECT level, category, COUNT(*) as n
    FROM words GROUP BY level, category
    ORDER BY level, n DESC
  `).all();
  db2.close();

  console.log('\n[cat] Distribución final:');
  let lastLevel = null;
  for (const { level, category, n } of dist) {
    if (level !== lastLevel) { console.log(`\n  ${level}:`); lastLevel = level; }
    console.log(`    ${n.toString().padStart(5)}  ${category}`);
  }
}

main();
