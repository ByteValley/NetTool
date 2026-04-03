function operator(proxies) {
  return proxies.map(proxy => {
    const p = { ...proxy };
    p.name = applySmartRewrite(String(p.name || ""));
    return p;
  });
}

/* =========================================================
 * 公告型伪节点
 * ========================================================= */

const SKIP_RENAME_PATTERNS = [
  /套餐到期/i,
  /官网/i,
  /频道/i,
  /更新订阅/i,
  /节点不通/i,
  /流量/i,
  /到期/i,
  /\bTG\b/i,
  /Telegram/i,
  /通知/i,
  /客服/i,
  /订阅说明/i,
  /官方群/i,
  /备用网址/i,
  /剩余流量/i,
  /距离下次重置/i,
  /官方导航/i,
  /超时请/i,
  /订阅超时/i,
  /剩余/i
];

/* =========================================================
 * 旗帜到中文地区
 * ========================================================= */

const FLAG_TO_ZH = {
  "🇭🇰": "香港",
  "🇹🇼": "台湾",
  "🇯🇵": "日本",
  "🇰🇷": "韩国",
  "🇸🇬": "新加坡",
  "🇺🇸": "美国",
  "🇬🇧": "英国",
  "🇩🇪": "德国",
  "🇫🇷": "法国",
  "🇳🇱": "荷兰",
  "🇮🇹": "意大利",
  "🇪🇸": "西班牙",
  "🇨🇭": "瑞士",
  "🇦🇹": "奥地利",
  "🇧🇪": "比利时",
  "🇨🇦": "加拿大",
  "🇲🇽": "墨西哥",
  "🇮🇱": "以色列",
  "🇹🇷": "土耳其",
  "🇸🇦": "沙特",
  "🇿🇦": "南非",
  "🇮🇸": "冰岛",
  "🇩🇰": "丹麦",
  "🇸🇪": "瑞典",
  "🇳🇴": "挪威",
  "🇪🇬": "埃及",
  "🇱🇹": "立陶宛",
  "🇲🇰": "北马其顿",
  "🇨🇿": "捷克",
  "🇭🇺": "匈牙利",
  "🇨🇱": "智利",
  "🇳🇬": "尼日利亚",
  "🇲🇦": "摩洛哥",
  "🇦🇿": "阿塞拜疆",
  "🇷🇴": "罗马尼亚",
  "🇨🇴": "哥伦比亚",
  "🇰🇿": "哈萨克斯坦",
  "🇰🇬": "吉尔吉斯斯坦",
  "🇵🇹": "葡萄牙",
  "🇦🇺": "澳洲",
  "🇳🇿": "新西兰",

  "🇲🇴": "澳门",
  "🇦🇪": "阿联酋",
  "🇶🇦": "卡塔尔",
  "🇰🇼": "科威特",
  "🇧🇭": "巴林",
  "🇴🇲": "阿曼",
  "🇷🇺": "俄罗斯",
  "🇺🇦": "乌克兰",
  "🇵🇱": "波兰",
  "🇧🇬": "保加利亚",
  "🇬🇷": "希腊",
  "🇮🇪": "爱尔兰",
  "🇫🇮": "芬兰",
  "🇧🇷": "巴西",
  "🇦🇷": "阿根廷",
  "🇵🇪": "秘鲁",
  "🇲🇾": "马来西亚",
  "🇹🇭": "泰国",
  "🇻🇳": "越南",
  "🇵🇭": "菲律宾",
  "🇮🇩": "印尼",
  "🇮🇳": "印度",
  "🇧🇩": "孟加拉",
  "🇰🇭": "柬埔寨",
  "🇵🇰": "巴基斯坦"
};

/* =========================================================
 * 中文地区名 → 旗帜
 * ========================================================= */

const ZH_TO_FLAG = Object.fromEntries(
  Object.entries(FLAG_TO_ZH).map(([flag, zh]) => [zh, flag])
);

const CITY_ZH_TO_FLAG = {
  "香港": "🇭🇰",
  "澳门": "🇲🇴",

  "台北": "🇹🇼",
  "新北": "🇹🇼",
  "桃园": "🇹🇼",
  "台中": "🇹🇼",
  "台南": "🇹🇼",
  "高雄": "🇹🇼",
  "基隆": "🇹🇼",
  "新竹": "🇹🇼",
  "嘉义": "🇹🇼",
  "宜兰": "🇹🇼",
  "花莲": "🇹🇼",
  "台东": "🇹🇼",
  "屏东": "🇹🇼",
  "澎湖": "🇹🇼",

  "东京": "🇯🇵",
  "大阪": "🇯🇵",
  "名古屋": "🇯🇵",
  "札幌": "🇯🇵",
  "福冈": "🇯🇵",
  "冲绳": "🇯🇵",

  "首尔": "🇰🇷",
  "釜山": "🇰🇷",
  "仁川": "🇰🇷",
  "春川": "🇰🇷",

  "洛杉矶": "🇺🇸",
  "圣何塞": "🇺🇸",
  "硅谷": "🇺🇸",
  "纽约": "🇺🇸",
  "西雅图": "🇺🇸",
  "芝加哥": "🇺🇸",
  "凤凰城": "🇺🇸",
  "达拉斯": "🇺🇸",
  "迈阿密": "🇺🇸",
  "丹佛": "🇺🇸",
  "波特兰": "🇺🇸",
  "亚特兰大": "🇺🇸",
  "拉斯维加斯": "🇺🇸",

  "多伦多": "🇨🇦",
  "温哥华": "🇨🇦",
  "蒙特利尔": "🇨🇦",
  "渥太华": "🇨🇦",

  "墨西哥城": "🇲🇽",

  "伦敦": "🇬🇧",
  "曼彻斯特": "🇬🇧",
  "伯明翰": "🇬🇧",

  "法兰克福": "🇩🇪",
  "柏林": "🇩🇪",
  "慕尼黑": "🇩🇪",
  "杜塞尔多夫": "🇩🇪",

  "巴黎": "🇫🇷",
  "马赛": "🇫🇷",
  "里昂": "🇫🇷",

  "阿姆斯特丹": "🇳🇱",
  "鹿特丹": "🇳🇱",

  "米兰": "🇮🇹",
  "罗马": "🇮🇹",
  "那不勒斯": "🇮🇹",

  "马德里": "🇪🇸",
  "巴塞罗那": "🇪🇸",
  "瓦伦西亚": "🇪🇸",

  "悉尼": "🇦🇺",
  "墨尔本": "🇦🇺",
  "布里斯班": "🇦🇺",
  "珀斯": "🇦🇺",
  "阿德莱德": "🇦🇺",

  "迪拜": "🇦🇪",
  "阿布扎比": "🇦🇪",

  "多哈": "🇶🇦",

  "利雅得": "🇸🇦",
  "吉达": "🇸🇦",

  "麦纳麦": "🇧🇭",
  "马斯喀特": "🇴🇲",

  "特拉维夫": "🇮🇱",
  "耶路撒冷": "🇮🇱",

  "卡萨布兰卡": "🇲🇦",

  "约翰内斯堡": "🇿🇦",
  "开普敦": "🇿🇦",

  "开罗": "🇪🇬",

  "拉各斯": "🇳🇬",

  "马其顿": "🇲🇰",

  "阿拉木图": "🇰🇿",
  "阿斯塔纳": "🇰🇿",

  "比什凯克": "🇰🇬",

  "巴库": "🇦🇿",

  "达卡": "🇧🇩",

  "金边": "🇰🇭",

  "卡拉奇": "🇵🇰",
  "拉合尔": "🇵🇰"
};

/* =========================================================
 * 城市规则（优先）
 * ========================================================= */

const CITY_RULES = [
  { zh: "香港", alias: ["Hong Kong", "HongKong"] },
  { zh: "澳门", alias: ["Macau", "Macao"] },

  { zh: "台北", alias: ["Taipei", "Taibei"] },
  { zh: "新北", alias: ["New Taipei", "NewTaipei"] },
  { zh: "桃园", alias: ["Taoyuan"] },
  { zh: "台中", alias: ["Taichung"] },
  { zh: "台南", alias: ["Tainan"] },
  { zh: "高雄", alias: ["Kaohsiung"] },
  { zh: "基隆", alias: ["Keelung"] },
  { zh: "新竹", alias: ["Hsinchu"] },
  { zh: "嘉义", alias: ["Chiayi"] },
  { zh: "宜兰", alias: ["Yilan"] },
  { zh: "花莲", alias: ["Hualien"] },
  { zh: "台东", alias: ["Taitung"] },
  { zh: "屏东", alias: ["Pingtung"] },
  { zh: "澎湖", alias: ["Penghu"] },

  { zh: "东京", alias: ["Tokyo"] },
  { zh: "大阪", alias: ["Osaka"] },
  { zh: "名古屋", alias: ["Nagoya"] },
  { zh: "札幌", alias: ["Sapporo"] },
  { zh: "福冈", alias: ["Fukuoka"] },
  { zh: "冲绳", alias: ["Okinawa"] },
  { zh: "首尔", alias: ["Seoul"] },
  { zh: "釜山", alias: ["Busan"] },
  { zh: "仁川", alias: ["Incheon"] },
  { zh: "春川", alias: ["Chuncheon"] },

  { zh: "洛杉矶", alias: ["Los Angeles", "LosAngeles"] },
  { zh: "圣何塞", alias: ["San Jose", "SanJose"] },
  { zh: "硅谷", alias: ["Silicon Valley", "SiliconValley"] },
  { zh: "纽约", alias: ["New York", "NewYork"] },
  { zh: "西雅图", alias: ["Seattle"] },
  { zh: "芝加哥", alias: ["Chicago"] },
  { zh: "凤凰城", alias: ["Phoenix"] },
  { zh: "达拉斯", alias: ["Dallas"] },
  { zh: "迈阿密", alias: ["Miami"] },
  { zh: "丹佛", alias: ["Denver"] },
  { zh: "波特兰", alias: ["Portland"] },
  { zh: "亚特兰大", alias: ["Atlanta"] },
  { zh: "拉斯维加斯", alias: ["Las Vegas", "LasVegas"] },

  { zh: "多伦多", alias: ["Toronto"] },
  { zh: "温哥华", alias: ["Vancouver"] },
  { zh: "蒙特利尔", alias: ["Montreal"] },
  { zh: "渥太华", alias: ["Ottawa"] },

  { zh: "墨西哥城", alias: ["Mexico City", "MexicoCity"] },

  { zh: "伦敦", alias: ["London"] },
  { zh: "曼彻斯特", alias: ["Manchester"] },
  { zh: "伯明翰", alias: ["Birmingham"] },

  { zh: "法兰克福", alias: ["Frankfurt"] },
  { zh: "柏林", alias: ["Berlin"] },
  { zh: "慕尼黑", alias: ["Munich"] },
  { zh: "杜塞尔多夫", alias: ["Dusseldorf"] },

  { zh: "巴黎", alias: ["Paris"] },
  { zh: "马赛", alias: ["Marseille"] },
  { zh: "里昂", alias: ["Lyon"] },

  { zh: "阿姆斯特丹", alias: ["Amsterdam"] },
  { zh: "鹿特丹", alias: ["Rotterdam"] },

  { zh: "米兰", alias: ["Milan"] },
  { zh: "罗马", alias: ["Rome"] },
  { zh: "那不勒斯", alias: ["Naples"] },

  { zh: "马德里", alias: ["Madrid"] },
  { zh: "巴塞罗那", alias: ["Barcelona"] },
  { zh: "瓦伦西亚", alias: ["Valencia"] },

  { zh: "悉尼", alias: ["Sydney"] },
  { zh: "墨尔本", alias: ["Melbourne"] },
  { zh: "布里斯班", alias: ["Brisbane"] },
  { zh: "珀斯", alias: ["Perth"] },
  { zh: "阿德莱德", alias: ["Adelaide"] },

  { zh: "迪拜", alias: ["Dubai"] },
  { zh: "阿布扎比", alias: ["Abu Dhabi", "AbuDhabi"] },
  { zh: "多哈", alias: ["Doha"] },
  { zh: "利雅得", alias: ["Riyadh"] },
  { zh: "吉达", alias: ["Jeddah"] },
  { zh: "麦纳麦", alias: ["Manama"] },
  { zh: "马斯喀特", alias: ["Muscat"] },
  { zh: "特拉维夫", alias: ["Tel Aviv", "TelAviv"] },
  { zh: "耶路撒冷", alias: ["Jerusalem"] },

  { zh: "卡萨布兰卡", alias: ["Casablanca"] },
  { zh: "约翰内斯堡", alias: ["Johannesburg"] },
  { zh: "开普敦", alias: ["Cape Town", "CapeTown"] },
  { zh: "开罗", alias: ["Cairo"] },
  { zh: "拉各斯", alias: ["Lagos"] },

  { zh: "马其顿", alias: ["Macedonia"] },
  { zh: "卡拉奇", alias: ["Karachi"] },
  { zh: "拉合尔", alias: ["Lahore"] },
  { zh: "达卡", alias: ["Dhaka"] },
  { zh: "金边", alias: ["Phnom Penh", "PhnomPenh"] },
  { zh: "科伦坡", alias: ["Colombo"] },
  { zh: "加德满都", alias: ["Kathmandu"] },
  { zh: "巴库", alias: ["Baku"] },
  { zh: "阿拉木图", alias: ["Almaty"] },
  { zh: "阿斯塔纳", alias: ["Astana"] },
  { zh: "比什凯克", alias: ["Bishkek"] }
];

/* =========================================================
 * 国家规则
 * ========================================================= */

const COUNTRY_RULES = [
  { zh: "香港", alias: ["HKG", "HK"] },
  { zh: "台湾", alias: ["Tai Wan", "Taiwan", "TPE", "TW"] },
  { zh: "日本", alias: ["Japan", "JP"] },
  { zh: "韩国", alias: ["South Korea", "SouthKorea", "Korea", "KR", "KOR"] },
  { zh: "新加坡", alias: ["Singapore", "SGP", "SG"] },
  { zh: "美国", alias: ["United States", "UnitedStates", "America", "USA", "US"] },
  { zh: "英国", alias: ["United Kingdom", "UnitedKingdom", "Britain", "England", "GBR", "GB", "UK"] },
  { zh: "德国", alias: ["Deutschland", "Germany", "DEU", "DE"] },
  { zh: "法国", alias: ["France", "FRA", "FR"] },
  { zh: "荷兰", alias: ["Nederland", "Netherlands", "Holland", "NLD", "NL"] },
  { zh: "意大利", alias: ["Italia", "Italy", "ITA", "IT"] },
  { zh: "西班牙", alias: ["España", "Spain", "ESP", "ES"] },
  { zh: "葡萄牙", alias: ["Portugal", "PRT", "PT"] },
  { zh: "瑞士", alias: ["Schweiz", "Suisse", "Switzerland", "CHE", "CH"] },
  { zh: "奥地利", alias: ["Österreich", "Austria", "AUT", "AT"] },
  { zh: "比利时", alias: ["Belgique", "Belgium", "BEL", "BE"] },
  { zh: "爱尔兰", alias: ["Ireland", "IRL", "IE"] },
  { zh: "丹麦", alias: ["Danmark", "Denmark", "DNK", "DK"] },
  { zh: "瑞典", alias: ["Sverige", "Sweden", "SWE", "SE"] },
  { zh: "挪威", alias: ["Norge", "Norway", "NOR", "NO"] },
  { zh: "芬兰", alias: ["Suomi", "Finland", "FIN", "FI"] },
  { zh: "冰岛", alias: ["Iceland", "ISL", "IS"] },
  { zh: "波兰", alias: ["Polska", "Poland", "POL", "PL"] },
  { zh: "捷克", alias: ["Česko", "Czechia", "Czech", "CZ"] },
  { zh: "匈牙利", alias: ["Magyarország", "Hungary", "HU"] },
  { zh: "罗马尼亚", alias: ["România", "Romania", "RO"] },
  { zh: "保加利亚", alias: ["Bulgaria", "BG"] },
  { zh: "希腊", alias: ["Ελλάδα", "Greece", "GR"] },
  { zh: "土耳其", alias: ["Türkiye", "Turkey", "Turkiye", "TR"] },
  { zh: "俄罗斯", alias: ["Россия", "Russia", "RUS", "RU"] },
  { zh: "乌克兰", alias: ["Україна", "Ukraine", "UA"] },

  { zh: "加拿大", alias: ["Canada", "CAN", "CA"] },
  { zh: "墨西哥", alias: ["México", "Mexico", "MX"] },
  { zh: "巴西", alias: ["Brasil", "Brazil", "BRA", "BR"] },
  { zh: "阿根廷", alias: ["Argentina", "ARG", "AR"] },
  { zh: "智利", alias: ["Chile", "CL"] },
  { zh: "哥伦比亚", alias: ["Colombia", "CO"] },
  { zh: "秘鲁", alias: ["Perú", "Peru", "PE"] },

  { zh: "澳洲", alias: ["Australia", "AUS", "AU"] },
  { zh: "新西兰", alias: ["New Zealand", "NewZealand", "NZL", "NZ"] },

  { zh: "马来西亚", alias: ["Malaysia", "MYS", "MY"] },
  { zh: "泰国", alias: ["Thailand", "THA", "TH"] },
  { zh: "越南", alias: ["Việt Nam", "Vietnam", "VNM", "VN"] },
  { zh: "菲律宾", alias: ["Philippines", "PHL", "PH"] },
  { zh: "印尼", alias: ["Indonesia", "IDN", "ID"] },
  { zh: "印度", alias: ["India", "IND", "IN"] },
  { zh: "孟加拉", alias: ["Bangladesh", "BD"] },
  { zh: "柬埔寨", alias: ["Cambodia", "KH"] },

  { zh: "阿联酋", alias: ["United Arab Emirates", "UnitedArabEmirates", "UAE", "AE"] },
  { zh: "沙特", alias: ["Saudi Arabia", "SaudiArabia", "Saudi", "SA"] },
  { zh: "卡塔尔", alias: ["Qatar", "QA"] },
  { zh: "科威特", alias: ["Kuwait", "KW"] },
  { zh: "巴林", alias: ["Bahrain", "BH"] },
  { zh: "阿曼", alias: ["Oman", "OM"] },
  { zh: "以色列", alias: ["Israel", "IL"] },

  { zh: "澳门", alias: ["Macau", "Macao", "MO"] },
  { zh: "南非", alias: ["South Africa", "SouthAfrica", "ZA"] },
  { zh: "埃及", alias: ["Egypt", "EG"] },
  { zh: "尼日利亚", alias: ["Nigeria", "NG"] },
  { zh: "北马其顿", alias: ["North Macedonia", "NorthMacedonia", "MK"] },
  { zh: "立陶宛", alias: ["Lietuva", "Lithuania", "LT"] },
  { zh: "拉脱维亚", alias: ["Latvija", "Latvia", "LV"] },
  { zh: "爱沙尼亚", alias: ["Eesti", "Estonia", "EE"] },
  { zh: "阿塞拜疆", alias: ["Azərbaycan", "Azerbaijan", "AZ"] },
  { zh: "摩洛哥", alias: ["Maroc", "Morocco", "MA"] },
  { zh: "多哥", alias: ["Togo", "TG"] },
  { zh: "哈萨克斯坦", alias: ["Қазақстан", "Kazakhstan", "KZ"] },
  { zh: "吉尔吉斯斯坦", alias: ["Кыргызстан", "Kyrgyzstan", "KG"] },
  { zh: "巴基斯坦", alias: ["Pakistan", "PAK", "PK"] }
];

/* =========================================================
 * 需要保留的线路标签
 * ========================================================= */

const KEEP_TAG_WORDS = [
  "ISP", "Hinet", "Amazon", "Telecom", "IEPL", "IPLC", "BGP",
  "CN2", "AWS", "Oracle", "Azure", "Google", "Premium", "Pro", "Lite"
];

const CITY_PREFERRED_DISPLAY = {
  "悉尼": "澳洲",
  "墨尔本": "澳洲",
  "布里斯班": "澳洲",
  "珀斯": "澳洲",
  "阿德莱德": "澳洲",

  "多伦多": "加拿大",
  "温哥华": "加拿大",
  "蒙特利尔": "加拿大",
  "渥太华": "加拿大",

  "迪拜": "阿联酋",
  "阿布扎比": "阿联酋",

  "卡萨布兰卡": "摩洛哥",
  "马其顿": "北马其顿"
};

/* =========================================================
 * 核心逻辑
 * ========================================================= */

function applySmartRewrite(name) {
  if (!name) return "";

  let n = normalizeSeparators(String(name || ""));

  if (shouldSkipRename(n)) {
    return compactName(n);
  }

  n = injectZhFromFlag(n);
  n = replaceByRules(n, CITY_RULES);
  n = replaceByRules(n, COUNTRY_RULES);
  n = cleanupAfterReplace(n);
  n = cleanupPreferredCityDisplay(n);
  n = cleanupNodeName(n);
  n = injectFlagIfMissing(n);

  return compactName(n);
}

function shouldSkipRename(name) {
  return SKIP_RENAME_PATTERNS.some(reg => reg.test(String(name || "")));
}

function injectZhFromFlag(name) {
  let s = normalizePipes(String(name || ""));

  for (const [flag, zh] of Object.entries(FLAG_TO_ZH)) {
    const reg = new RegExp(`${escapeRegExp(flag)}(?!\\s*${escapeRegExp(zh)})`, "g");
    s = s.replace(reg, `${flag}${zh} `);
  }

  return s;
}

function hasEmojiFlag(name) {
  return /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(String(name || ""));
}

function inferFlagFromZhName(name) {
  const s = String(name || "");

  const cityKeys = Object.keys(CITY_ZH_TO_FLAG).sort((a, b) => b.length - a.length);
  for (const city of cityKeys) {
    if (s.includes(city)) return CITY_ZH_TO_FLAG[city];
  }

  const countryKeys = Object.keys(ZH_TO_FLAG).sort((a, b) => b.length - a.length);
  for (const zh of countryKeys) {
    if (s.includes(zh)) return ZH_TO_FLAG[zh];
  }

  return "";
}

function injectFlagIfMissing(name) {
  const s = String(name || "");
  if (hasEmojiFlag(s)) return s;

  const flag = inferFlagFromZhName(s);
  if (!flag) return s;

  return `${flag} ${s}`;
}

function replaceByRules(name, rules) {
  let result = normalizePipes(String(name || ""));

  for (const rule of rules) {
    for (const alias of rule.alias) {
      result = replaceAliasSafely(result, alias, rule.zh);
    }
  }

  return result;
}

function replaceAliasSafely(text, alias, replacement) {
  const source = normalizePipes(String(text || ""));

  const pattern = alias
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("[\\s_\\-+]+");

  const reg = new RegExp(
    `(^|[\\s|【】()（）_\\-+])${pattern}(?=($|[\\s|【】()（）_\\-+]))`,
    "ig"
  );

  return source.replace(reg, (_, left) => {
    if (!replacement) return left;
    return `${left}${replacement}`;
  });
}

function cleanupAfterReplace(name) {
  let s = normalizePipes(String(name || ""));
  const zhNames = getAllZhNamesSorted();
  const aliasList = getAllAliasesSorted();

  for (const alias of aliasList) {
    s = replaceAliasSafely(s, alias, "");
  }

  for (const zh of zhNames) {
    const ezh = escapeRegExp(zh);

    s = s.replace(new RegExp(`(${ezh})\\s+(${ezh})\\s*(\\d{1,4})`, "g"), `$1 $3`);
    s = s.replace(new RegExp(`(${ezh})\\s*(\\d{1,4})\\s+(${ezh})`, "g"), `$1 $2`);

    s = s.replace(
      new RegExp(`(${ezh})\\s+(${ezh})(\\s+(?:${KEEP_TAG_WORDS.join("|")})\\b.*)?`, "gi"),
      `$1$3`
    );

    s = s.replace(new RegExp(`(${ezh})\\s*\\|\\s*(${ezh})\\s*(\\d{1,4})`, "g"), `$1 $3`);

    s = s.replace(
      new RegExp(`(${ezh})\\s*\\|\\s*(${ezh})(\\s+(?:${KEEP_TAG_WORDS.join("|")})\\b.*)?`, "gi"),
      `$1$3`
    );

    s = s.replace(new RegExp(`(${ezh})\\s*\\|\\s*(${ezh})`, "g"), `$1`);
  }

  return s;
}

function cleanupPreferredCityDisplay(name) {
  let s = normalizePipes(String(name || ""));

  for (const [city, country] of Object.entries(CITY_PREFERRED_DISPLAY)) {
    const ecity = escapeRegExp(city);
    const ecountry = escapeRegExp(country);

    s = s.replace(
      new RegExp(`(?:${ecountry}\\s+)?(${ecity})\\s*\\|\\s*${ecity}(\\s+(?:${KEEP_TAG_WORDS.join("|")})\\b.*|\\s*\\d{1,4})?`, "gi"),
      `$1$2`
    );

    s = s.replace(
      new RegExp(`(?:${ecountry}\\s+)?(${ecity})\\s*\\|\\s*${ecountry}(\\s+(?:${KEEP_TAG_WORDS.join("|")})\\b.*|\\s*\\d{1,4})?`, "gi"),
      `$1$2`
    );

    s = s.replace(
      new RegExp(`${ecountry}\\s+(${ecity})(\\s+(?:${KEEP_TAG_WORDS.join("|")})\\b.*|\\s*\\d{1,4})?`, "gi"),
      `$1$2`
    );
  }

  return s;
}

/* =========================================================
 * 工具函数
 * ========================================================= */

function normalizePipes(s) {
  return String(s || "").replace(/[｜丨¦]/g, "|");
}

function normalizeSeparators(s) {
  return normalizePipes(String(s || ""))
    .replace(/[+]/g, " ")
    .replace(/\s+/g, " ");
}

function getAllAliasesSorted() {
  return [...new Set([
    ...CITY_RULES.flatMap(x => x.alias),
    ...COUNTRY_RULES.flatMap(x => x.alias)
  ])].sort((a, b) => b.length - a.length);
}

function getAllZhNamesSorted() {
  return [...new Set([
    ...CITY_RULES.map(x => x.zh),
    ...COUNTRY_RULES.map(x => x.zh),
    ...Object.values(FLAG_TO_ZH)
  ])].sort((a, b) => b.length - a.length);
}

function cleanupNodeName(name) {
  let s = normalizePipes(String(name || ""));

  s = s.replace(/[+]/g, " ");
  s = s.replace(/\s*\|\s*/g, " | ");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s+\]/g, "]");
  s = s.replace(/\[\s+/g, "[");
  s = s.trim();

  return s;
}

function compactName(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
