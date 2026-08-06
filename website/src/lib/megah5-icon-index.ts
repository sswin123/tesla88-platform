/**
 * MEGAH5 icon index and display name utilities.
 * Source: mega888gameicon_CNEN.zip → gameIcon_en/ → website/public/megah5/icons/
 *
 * Icon matching (resolveIconStem):
 *   1. Exact:      stems.includes(code)
 *   2. StartsWith: stems.find(s => s.startsWith(code))  ← handles santasurprise→santasurprise_press
 *   3. null        → GameImage shows 🎮 without any HTTP request
 *
 * Display name (formatGameDisplayName):
 *   Keyed by game_code.toLowerCase() → human-readable title.
 *   Unknown codes fall back to a generic capitalizer.
 */

// ── Icon stems (132 total) ────────────────────────────────────────────
export const MEGAH5_ICON_STEMS: readonly string[] = [
  "5dragon","5dragondeluxe","5fortune","5koi","5koideluxe","aladdin","alice","amazingthailand",
  "ancientegyptclassic","anightout","arctictreasure","aztec","baccarat","baozhuxuantian",
  "bigprosperity","bigshot","bonusbear","bonusdigger","boyking","captaintreasure","carracing",
  "cherrylove","circus","cleopatragold","cookiepop","coyotecash","crystal","deserttreasure",
  "dolphinop","dolphinreef","dragongold","dragonmaiden","dragontiger","eastersurprise",
  "emperorgate","fairygarden","fameandfortune","fashion","feicuigongzhu","fengshen",
  "footballcarnival","footballrules","forestdance","fortunelions","fortuneofthefox","fortunepanda",
  "fruit","geishastory","godofwealth","goldenisland","goldenlotus","goldenslut","goldentour",
  "goldentree","greatblue","greatchina","greatmingempire","greatstars","greenlight",
  "halloweenfortune","highwayking","hockeyleague","huanlecaishen","iceland","indianmyth",
  "irishluck","japan","jinqianwa","kimochi","kingderby","laura","lottomadness","luckyfisherman",
  "luckystreakmahjong","madamedestiny","magicalspin","marilynmonroe","masterchensfortune",
  "mermaidjewel","motorbike","mysticdragon","niannianyouyu","nitro","niulangzhinu","orient",
  "panjinlian","panthermoon","penguinvacation","pirateship","pokemon","rally","ranchstory",
  "romeandglory","roulette","safariheat","santasurprise_press","seacaptain","seasongreetings",
  "seaworld","shiningstars","shuangxi","sicbo","silentsamurai","silverbullet","sixiang","sparta",
  "spartan","steamtower","stoneage","stripnight","sunwukong","t-rex","talesofegypt","tallyho",
  "thaiparadise","thediscovery","threekingdoms","thunderbolt1","topgun","treasureisland",
  "tripletwister","victory","wealth","westernranch","wildfox","wolfhunter","wongchoy","wukong1",
  "xuanpulianhuan","yingcaishen","zhaocaijinbao","zhaocaitongzi",
] as const;

/**
 * Resolve game_code → icon filename stem (without .png).
 * Returns null when no icon exists (GameImage shows 🎮 immediately, no HTTP request).
 */
export function resolveIconStem(gameCode: string): string | null {
  const lower = gameCode.toLowerCase();
  if ((MEGAH5_ICON_STEMS as readonly string[]).includes(lower)) return lower;
  const partial = (MEGAH5_ICON_STEMS as readonly string[]).find(s => s.startsWith(lower));
  return partial ?? null;
}

// ── Display name lookup (keyed by game_code.toLowerCase()) ────────────
// Source: Production API 130 games — human-readable titles for each game_code.
// Unknown future games fall back to formatGameDisplayName()'s generic capitalizer.
const DISPLAY_NAME_MAP: Record<string, string> = {
  "5dragon":              "5 Dragon",
  "5dragondeluxe":        "5 Dragon Deluxe",
  "5fortune":             "5 Fortune",
  "5koi":                 "5 Koi",
  "5koideluxe":           "5 Koi Deluxe",
  "aladdin":              "Aladdin",
  "alice":                "Alice",
  "amazingthailand":      "Amazing Thailand",
  "ancientegyptclassic":  "Ancient Egypt Classic",
  "anightout":            "A Night Out",
  "arctictreasure":       "Arctic Treasure",
  "aztec":                "Aztec",
  "baccarat":             "Baccarat",
  "baozhuxuantian":       "Bao Zhu Xuan Tian",
  "bigprosperity":        "Big Prosperity",
  "bigshot":              "Big Shot",
  "bonusbear":            "Bonus Bear",
  "bonusdigger":          "Bonus Digger",
  "boyking":              "Boy King",
  "captaintreasure":      "Captain Treasure",
  "carracing":            "Car Racing",
  "cherrylove":           "Cherry Love",
  "circus":               "Circus",
  "cleopatragold":        "Cleopatra Gold",
  "cookiepop":            "Cookie Pop",
  "coyotecash":           "Coyote Cash",
  "crystal":              "Crystal",
  "deserttreasure":       "Desert Treasure",
  "dolphinop":            "Dolphin Op",
  "dolphinreef":          "Dolphin Reef",
  "dragongold":           "Dragon Gold",
  "dragonmaiden":         "Dragon Maiden",
  "dragontiger":          "Dragon Tiger",
  "eastersurprise":       "Easter Surprise",
  "emperorgate":          "Emperor Gate",
  "fairygarden":          "Fairy Garden",
  "fameandfortune":       "Fame and Fortune",
  "fashion":              "Fashion",
  "feicuigongzhu":        "Fei Cui Gong Zhu",
  "fengshen":             "Feng Shen",
  "footballcarnival":     "Football Carnival",
  "footballrules":        "Football Rules",
  "forestdance":          "Forest Dance",
  "fortunelions":         "Fortune Lions",
  "fortuneofthefox":      "Fortune of the Fox",
  "fortunepanda":         "Fortune Panda",
  "fruit":                "Fruit",
  "geishastory":          "Geisha Story",
  "godofwealth":          "God of Wealth",
  "goldenisland":         "Golden Island",
  "goldenlotus":          "Golden Lotus",
  "goldenslut":           "Golden Slut",
  "goldentour":           "Golden Tour",
  "goldentree":           "Golden Tree",
  "greatblue":            "Great Blue",
  "greatchina":           "Great China",
  "greatmingempire":      "Great Ming Empire",
  "greatstars":           "Great Stars",
  "greenlight":           "Green Light",
  "halloweenfortune":     "Halloween Fortune",
  "highwayking":          "Highway King",
  "hockeyleague":         "Hockey League",
  "huanlecaishen":        "Huan Le Cai Shen",
  "iceland":              "Iceland",
  "indianmyth":           "Indian Myth",
  "irishluck":            "Irish Luck",
  "japan":                "Japan",
  "jinqianwa":            "Jin Qian Wa",
  "kimochi":              "Kimochi",
  "kingderby":            "King Derby",
  "laura":                "Laura",
  "lottomadness":         "Lotto Madness",
  "luckyfisherman":       "Lucky Fisherman",
  "luckystreakmahjong":   "Lucky Streak Mahjong",
  "madamedestiny":        "Madame Destiny",
  "magicalspin":          "Magical Spin",
  "marilynmonroe":        "Marilyn Monroe",
  "masterchensfortune":   "Master Chen's Fortune",
  "mermaidjewel":         "Mermaid Jewel",
  "motorbike":            "Motorbike",
  "mysticdragon":         "Mystic Dragon",
  "niannianyouyu":        "Nian Nian You Yu",
  "nitro":                "Nitro",
  "niulangzhinu":         "Niu Lang Zhi Nu",
  "orient":               "Orient",
  "panjinlian":           "Pan Jin Lian",
  "panthermoon":          "Panther Moon",
  "penguinvacation":      "Penguin Vacation",
  "pirateship":           "Pirate Ship",
  "pokemon":              "Pokemon",
  "rally":                "Rally",
  "ranchstory":           "Ranch Story",
  "romeandglory":         "Rome and Glory",
  "roulette":             "Roulette",
  "safariheat":           "Safari Heat",
  "santasurprise":        "Santa Surprise",
  "seacaptain":           "Sea Captain",
  "seasongreetings":      "Season Greetings",
  "seaworld":             "Sea World",
  "shiningstars":         "Shining Stars",
  "shuangxi":             "Shuang Xi",
  "sicbo":                "Sic Bo",
  "silentsamurai":        "Silent Samurai",
  "silverbullet":         "Silver Bullet",
  "sixiang":              "Si Xiang",
  "sparta":               "Sparta",
  "spartan":              "Spartan",
  "stoneage":             "Stone Age",
  "stripnight":           "Strip Night",
  "sunwukong":            "Sun Wukong",
  "t-rex":                "T-Rex",
  "talesofegypt":         "Tales of Egypt",
  "tallyho":              "Tally Ho",
  "thaiparadise":         "Thai Paradise",
  "thediscovery":         "The Discovery",
  "threekingdoms":        "Three Kingdoms",
  "thunderbolt1":         "Thunderbolt",
  "topgun":               "Top Gun",
  "treasureisland":       "Treasure Island",
  "tripletwister":        "Triple Twister",
  "victory":              "Victory",
  "wealth":               "Wealth",
  "westernranch":         "Western Ranch",
  "wildfox":              "Wild Fox",
  "wolfhunter":           "Wolf Hunter",
  "wongchoy":             "Wong Choy",
  "wukong1":              "Wukong",
  "xuanpulianhuan":       "Xuan Pu Lian Huan",
  "yingcaishen":          "Ying Cai Shen",
  "zhaocaijinbao":        "Zhao Cai Jin Bao",
  "zhaocaitongzi":        "Zhao Cai Tong Zi",
};

/**
 * Format a game_code or display_name into a human-readable title.
 * Priority: DISPLAY_NAME_MAP → generic capitalizer.
 */
export function formatGameDisplayName(raw: string): string {
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (DISPLAY_NAME_MAP[key]) return DISPLAY_NAME_MAP[key];
  // Generic: split on spaces/hyphens/underscores, title-case each word
  return raw
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
