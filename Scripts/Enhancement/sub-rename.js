/*
 * Surge Script · 通用订阅改名
 * 版本：2026-03-11R12-Local
 *
 * arguments 格式：
 * domain:airport.net,airport.com,rules:airport.net|HK|1+airport.com|SG|0
 *
 * 说明：
 * · domain：给模块 hostname 用，逗号分隔
 * · rules ：给脚本用，格式为 domain|prefix|twflag，多条用 + 分隔
 * · prefix 建议 URL 编码，例如：【Kitty】%20
 *
 * 示例：
 * domain:kitty.su,airport.com,rules:kitty.su|%E3%80%90Kitty%E3%80%91%20|1+airport.com|%E3%80%90SG%E3%80%91%20|0
 */

const RAW_ARGUMENT = typeof $argument === "string" ? $argument : "";
const RULES_STR = extractArg(RAW_ARGUMENT, "rules");
const RULE_MAP = parseRules(RULES_STR || "");

(function main() {
  try {
    if (!$request || !$response || !$response.body) {
      return $done({});
    }

    const url = new URL($request.url);
    const host = url.hostname;
    const rule = matchRule(host, RULE_MAP);

    // 没匹配到规则就不处理，避免误伤
    if (!rule) {
      return $done({});
    }

    const prefix = rule.prefix || "";
    const twFlagMode = rule.twflag || "0";

    let content = String($response.body || "").trim();
    if (!content) {
      return $done({});
    }

    let isBase64Wrapped = false;

    if (looksLikeBase64(content)) {
      const decoded = tryDecodeBase64ToText(content);
      if (decoded && looksLikeUsefulDecodedText(decoded)) {
        isBase64Wrapped = true;
        content = decoded.trim();
      }
    }

    let outText = looksLikeClashYaml(content)
      ? rewriteClashYamlProxyNames(content, prefix, twFlagMode)
      : rewriteSubscriptionLines(content, prefix, twFlagMode);

    const finalBody = isBase64Wrapped ? encodeTextToBase64(outText) : outText;
    return $done({ body: finalBody });
  } catch (e) {
    console.log("SubRename error: " + String(e));
    return $done({});
  }
})();

/* =========================================================
 * 参数解析
 * ========================================================= */

function extractArg(raw, key) {
  const str = String(raw || "");
  const reg = new RegExp(`(?:^|,)${escapeRegExp(key)}:(.*?)(?=,[a-zA-Z0-9_]+:|$)`);
  const match = str.match(reg);
  return match ? match[1] : "";
}

function parseRules(str) {
  const map = {};
  const raw = String(str || "").trim();
  if (!raw) return map;

  raw.split("+").forEach(entry => {
    const item = String(entry || "").trim();
    if (!item) return;

    const parts = item.split("|");
    if (parts.length < 3) return;

    const domain = decodeURIComponent(parts[0] || "").trim();
    const prefix = decodeURIComponent(parts[1] || "");
    const twflag = String(parts[2] || "0").trim();

    if (!domain) return;

    map[domain] = {
      prefix,
      twflag: twflag === "1" ? "1" : "0"
    };
  });

  return map;
}

function matchRule(host, rules) {
  const hostname = String(host || "");
  for (const domain of Object.keys(rules || {})) {
    if (hostname === domain || hostname.endsWith("." + domain)) {
      return rules[domain];
    }
  }
  return null;
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
  "🇧🇩": "孟加拉",
  "🇰🇭": "柬埔寨"
};

/* =========================================================
 * 城市规则（优先）
 * ========================================================= */

const CITY_RULES = [
  { zh: "香港", alias: ["Hong Kong", "HongKong"] },
  { zh: "澳门", alias: ["Macau", "Macao"] },

  { zh: "台北", alias: ["Taipei", "Taibei"] },
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
  { zh: "吉尔吉斯斯坦", alias: ["Кыргызстан", "Kyrgyzstan", "KG"] }
];

/* =========================================================
 * 需要保留的线路标签
 * ========================================================= */

const KEEP_TAG_WORDS = [
  "ISP", "Hinet", "Amazon", "Telecom", "IEPL", "IPLC", "BGP",
  "CN2", "AWS", "Oracle", "Azure", "Google", "Premium", "Pro", "Lite"
];

/* =========================================================
 * 城市优先展示映射
 * ========================================================= */

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

function applySmartRewrite(name, prefix, twFlagMode) {
  if (!name) return "";

  let n = normalizeSeparators(String(name || ""));

  if (shouldSkipRename(n)) {
    return compactName(prefix + n);
  }

  n = injectZhFromFlag(n);
  n = replaceByRules(n, CITY_RULES);
  n = replaceByRules(n, COUNTRY_RULES);
  n = cleanupAfterReplace(n);
  n = cleanupPreferredCityDisplay(n);

  if (twFlagMode === "1" && hasTaiwanKeyword(n)) {
    n = fixTaiwanFlag(n);
  }

  n = cleanupNodeName(n);

  return compactName(prefix + n);
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
    `(^|[\\s|\\[\\]【】()（）_\\-+])${pattern}(?=($|[\\s|\\[\\]【】()（）_\\-+]))`,
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

function hasTaiwanKeyword(name) {
  return /台湾/.test(String(name || ""));
}

function fixTaiwanFlag(name) {
  let s = String(name || "");
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, "");
  s = s.replace(/台湾/g, "🇹🇼 台湾");
  s = s.replace(/(🇹🇼\s*){2,}/g, "🇹🇼 ");
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

/* =========================================================
 * 订阅改写
 * ========================================================= */

function rewriteSubscriptionLines(text, prefix, twFlagMode) {
  return text.split(/\r?\n/).map(line => {
    const trimLine = line.trim();
    if (!trimLine) return line;

    if (/^vmess:\/\//i.test(trimLine)) {
      try {
        const raw = trimLine.slice(8);
        const decoded = tryDecodeBase64ToText(raw);
        if (!decoded) return line;

        const obj = JSON.parse(decoded);
        obj.ps = applySmartRewrite(obj.ps || "", prefix, twFlagMode);
        return "vmess://" + encodeTextToBase64(JSON.stringify(obj));
      } catch {
        return line;
      }
    }

    const hashIdx = line.indexOf("#");
    if (hashIdx !== -1) {
      const before = line.slice(0, hashIdx + 1);
      const after = line.slice(hashIdx + 1);

      let name = after;
      try {
        name = decodeURIComponent(after);
      } catch {}

      name = applySmartRewrite(name, prefix, twFlagMode);
      return before + encodeURIComponent(name);
    }

    return line;
  }).join("\n");
}

function rewriteClashYamlProxyNames(text, prefix, twFlagMode) {
  return text.split(/\r?\n/).map(line => {
    const match = line.match(/^(\s*-\s*name\s*:\s*)(.*)$/i);
    if (!match) return line;

    const head = match[1];
    let oldName = match[2].trim();

    if (
      (oldName.startsWith('"') && oldName.endsWith('"')) ||
      (oldName.startsWith("'") && oldName.endsWith("'"))
    ) {
      oldName = oldName.slice(1, -1);
    }

    const newName = applySmartRewrite(oldName, prefix, twFlagMode);
    return `${head}"${newName}"`;
  }).join("\n");
}

/* =========================================================
 * 文本 / 编码工具
 * ========================================================= */

function encodeTextToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function tryDecodeBase64ToText(b64) {
  try {
    const bin = atob(String(b64 || "").replace(/\s+/g, ""));
    return new TextDecoder("utf-8").decode(
      Uint8Array.from(bin, c => c.charCodeAt(0))
    );
  } catch {
    return null;
  }
}

function looksLikeBase64(s) {
  const t = String(s || "").replace(/\s+/g, "");
  return t.length >= 16 && t.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(t);
}

function looksLikeClashYaml(s) {
  return /proxies\s*:/i.test(s) && /-\s*name\s*:/i.test(s);
}

function looksLikeUsefulDecodedText(s) {
  return /(vmess|vless|trojan|ss|ssr|hy2|tuic):\/\//i.test(s) || looksLikeClashYaml(s);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
