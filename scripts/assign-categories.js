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

  for (const { word, level } of allWords) {
    stats[level].total++;
    const w = word.toLowerCase();
    let assigned = null;

    if (level === 'A1') {
      assigned = a1Map[w] || UNIVERSAL[w] || null;
    } else if (pdfMaps[level]) {
      assigned = pdfMaps[level][w] || UNIVERSAL[w] || null;
    } else {
      assigned = UNIVERSAL[w] || null;
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
