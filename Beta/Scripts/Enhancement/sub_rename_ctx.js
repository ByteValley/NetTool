/* =========================================================
 * 模块分类 · 通用订阅改名 / Egern 原生版
 * 作者 · ByteValley
 * 版本 · 2026-03-14R1
 *
 * 模块分类 · 说明
 * · 运行方式：Egern http_response 脚本
 * · 用途：直接改写订阅响应内容，不依赖 Cloudflare Worker
 * · 环境变量：
 *   PREFIX = 自定义前缀，如 "【ByteEden】 "
 *   TWFLAG = 台湾旗帜修正开关，1=启用，0=关闭
 *
 * 模块分类 · 设计原则
 * · 旗帜优先于英文国家名
 * · 城市优先于国家
 * · 先替换，再清理重复
 * · 不重组复杂节点结构
 * · 尽量保留原有旗帜、倍率、标签、机场前缀
 * ========================================================= */

export default async function (ctx) {
  const env = ctx.env || {};
  const prefix = String(env.PREFIX || "");
  const twFlagMode = String(env.TWFLAG || "0");

  let rawBody = "";
  try {
    rawBody = await readResponseBodyText(ctx);
  } catch (e) {
    console.log(`[SubRename] 读取响应体失败: ${String(e)}`);
    return passthroughResponse(ctx);
  }

  let content = String(rawBody || "").trim();
  if (!content) {
    console.log("[SubRename] 响应体为空，跳过处理");
    return passthroughResponse(ctx);
  }

  let isBase64Wrapped = false;

  try {
    if (looksLikeBase64(content)) {
      const decoded = tryDecodeBase64ToText(content);
      if (decoded && looksLikeUsefulDecodedText(decoded)) {
        isBase64Wrapped = true;
        content = decoded.trim();
      }
    }

    const outText = looksLikeClashYaml(content)
      ? rewriteClashYamlProxyNames(content, prefix, twFlagMode)
      : rewriteSubscriptionLines(content, prefix, twFlagMode);

    const finalBody = isBase64Wrapped ? encodeTextToBase64(outText) : outText;
    console.log(`[SubRename] 处理完成，base64=${isBase64Wrapped}, clash=${looksLikeClashYaml(content)}`);

    return buildModifiedResponse(ctx, finalBody);
  } catch (e) {
    console.log(`[SubRename] 改写失败: ${String(e)}`);
    return passthroughResponse(ctx);
  }
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
  "🇳🇿": "新西兰"
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

/* =========================================================
 * Clash YAML 改写
 * ========================================================= */

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

async function readResponseBodyText(ctx) {
  if (ctx?.response?.text && typeof ctx.response.text === "function") {
    return await ctx.response.text();
  }

  if (typeof ctx?.response?.body === "string") {
    return ctx.response.body;
  }

  if (ctx?.response?.bodyBytes) {
    return new TextDecoder("utf-8").decode(ctx.response.bodyBytes);
  }

  throw new Error("当前响应对象不支持读取文本 body");
}

function buildModifiedResponse(ctx, bodyText) {
  const headers = cloneHeaders(ctx?.response?.headers || {});
  headers["content-length"] = String(byteLengthUtf8(bodyText));
  headers["content-type"] = headers["content-type"] || "text/plain; charset=utf-8";
  headers["cache-control"] = "no-store";

  const status = Number(ctx?.response?.status || 200);

  // Egern 常见可接受返回形态
  return {
    status,
    headers,
    body: bodyText
  };
}

function passthroughResponse(ctx) {
  const status = Number(ctx?.response?.status || 200);
  const headers = cloneHeaders(ctx?.response?.headers || {});
  const body = typeof ctx?.response?.body === "string" ? ctx.response.body : undefined;

  return {
    status,
    headers,
    body
  };
}

function cloneHeaders(headers) {
  const out = {};
  if (!headers) return out;

  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = String(value);
    });
    return out;
  }

  for (const key of Object.keys(headers)) {
    out[String(key).toLowerCase()] = String(headers[key]);
  }
  return out;
}

function byteLengthUtf8(str) {
  return new TextEncoder().encode(String(str || "")).length;
}

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
}      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      i++;
      if (i >= str.length) break;
      const low = str.charCodeAt(i);
      const cp = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      bytes.push(0xf0 | (cp >> 18));
      bytes.push(0x80 | ((cp >> 12) & 0x3f));
      bytes.push(0x80 | ((cp >> 6) & 0x3f));
      bytes.push(0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++];

    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0) {
      const b1 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | b1);
    } else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | (b1 << 6) | b2);
    } else {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      let cp = ((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3;
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10));
      out += String.fromCharCode(0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(str) {
  const bytes = utf8ToBytes(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : NaN;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : NaN;

    const n = (b0 << 16) | ((b1 || 0) << 8) | (b2 || 0);
    out += B64_CHARS[(n >> 18) & 63];
    out += B64_CHARS[(n >> 12) & 63];
    out += Number.isNaN(b1) ? "=" : B64_CHARS[(n >> 6) & 63];
    out += Number.isNaN(b2) ? "=" : B64_CHARS[n & 63];
  }
  return out;
}

function base64Decode(str) {
  const clean = String(str).replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length % 4 === 1) {
    throw new Error("invalid base64");
  }

  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean[i];
    const c1 = clean[i + 1];
    const c2 = clean[i + 2];
    const c3 = clean[i + 3];

    const n0 = B64_CHARS.indexOf(c0);
    const n1 = B64_CHARS.indexOf(c1);
    const n2 = c2 === "=" ? 0 : B64_CHARS.indexOf(c2);
    const n3 = c3 === "=" ? 0 : B64_CHARS.indexOf(c3);

    if (n0 < 0 || n1 < 0 || (c2 !== "=" && n2 < 0) || (c3 !== "=" && n3 < 0)) {
      throw new Error("invalid base64 chars");
    }

    const num = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3;
    bytes.push((num >> 16) & 0xff);
    if (c2 !== "=") bytes.push((num >> 8) & 0xff);
    if (c3 !== "=") bytes.push(num & 0xff);
  }

  return bytesToUtf8(bytes);
}

function looksLikeSubscriptionText(text) {
  if (!text) return false;
  return (
    /(?:^|\n)\s*(ss|ssr|vmess|vless|trojan|hysteria|hy2|tuic):\/\//i.test(text) ||
    /(?:^|\n)\s*proxies:\s*$/im.test(text) ||
    /(?:^|\n)\s*-\s*name\s*:/im.test(text)
  );
}

function tryDecodeSubscriptionBody(body) {
  const raw = String(body || "");
  const trimmed = raw.trim();

  if (!trimmed) {
    return { text: raw, isBase64: false };
  }

  if (looksLikeSubscriptionText(trimmed)) {
    return { text: raw, isBase64: false };
  }

  try {
    const decoded = base64Decode(trimmed);
    if (looksLikeSubscriptionText(decoded) || decoded.includes("\n")) {
      return { text: decoded, isBase64: true };
    }
  } catch (_) {}

  return { text: raw, isBase64: false };
}

function hasAnyFlagEmoji(str) {
  return /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/.test(str);
}

function normalizeTaiwanFlag(name, twFlag) {
  if (String(twFlag) !== "1") return name;
  if (!/(台灣|台湾|taiwan|\bTW\b)/i.test(name)) return name;
  if (name.includes("🇹🇼")) return name;

  if (hasAnyFlagEmoji(name)) {
    return name.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/, "🇹🇼");
  }
  return `🇹🇼 ${name}`;
}

function addPrefix(name, prefix, twFlag) {
  let out = String(name || "").trim();
  if (!out) out = "未命名节点";

  if (prefix && !out.startsWith(prefix)) {
    out = prefix + out;
  }

  out = normalizeTaiwanFlag(out, twFlag);
  return out;
}

function processVmessLine(line, prefix, twFlag) {
  const m = line.match(/^\s*(vmess:\/\/)([A-Za-z0-9+/=_-]+)\s*$/i);
  if (!m) return null;

  const head = m[1];
  const payload = m[2];

  try {
    const jsonText = base64Decode(payload);
    const obj = JSON.parse(jsonText);
    obj.ps = addPrefix(obj.ps || obj.name || "VMess", prefix, twFlag);
    return head + base64Encode(JSON.stringify(obj));
  } catch (_) {
    return null;
  }
}

function processUriLine(line, prefix, twFlag) {
  const trimmed = line.trim();
  if (!/^(ss|ssr|vless|trojan|hysteria|hy2|tuic):\/\//i.test(trimmed)) return null;

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    const before = trimmed.slice(0, hashIndex);
    const oldName = safeDecodeURIComponent(trimmed.slice(hashIndex + 1));
    const newName = addPrefix(oldName || "节点", prefix, twFlag);
    return before + "#" + safeEncodeURIComponent(newName);
  }

  const fallbackName = addPrefix("节点", prefix, twFlag);
  return trimmed + "#" + safeEncodeURIComponent(fallbackName);
}

function processYamlNameLine(line, prefix, twFlag) {
  const m = line.match(/^(\s*-\s*name\s*:\s*)(.*?)(\s*)$/);
  if (!m) return null;

  const head = m[1];
  let name = m[2];
  const tail = m[3] || "";

  if (
    (name.startsWith('"') && name.endsWith('"')) ||
    (name.startsWith("'") && name.endsWith("'"))
  ) {
    const q = name[0];
    const inner = name.slice(1, -1);
    return `${head}${q}${addPrefix(inner, prefix, twFlag)}${q}${tail}`;
  }

  return `${head}${addPrefix(name, prefix, twFlag)}${tail}`;
}

function processLine(line, prefix, twFlag) {
  if (!line || !line.trim()) return line;
  if (/^\s*[#;]/.test(line)) return line;

  const vmess = processVmessLine(line, prefix, twFlag);
  if (vmess) return vmess;

  const uri = processUriLine(line, prefix, twFlag);
  if (uri) return uri;

  const yaml = processYamlNameLine(line, prefix, twFlag);
  if (yaml) return yaml;

  return line;
}

function rewriteText(text, prefix, twFlag) {
  const lines = String(text).split(/\r?\n/);
  return lines.map((line) => processLine(line, prefix, twFlag)).join("\n");
}

export default async function (ctx) {
  try {
    const env = (ctx && ctx.env) || {};
    const req = (ctx && ctx.request) || {};
    const res = (ctx && ctx.response) || {};

    const prefix = env.PREFIX || "";
    const twFlag = env.TWFLAG || "0";
    const body = typeof res.body === "string" ? res.body : "";

    if (!body) {
      log("empty body, passthrough");
      return res;
    }

    const parsed = tryDecodeSubscriptionBody(body);
    const rewritten = rewriteText(parsed.text, prefix, twFlag);
    const output = parsed.isBase64 ? base64Encode(rewritten) : rewritten;

    log(`done, base64=${parsed.isBase64}, prefix=${prefix}, twflag=${twFlag}`);

    return {
      ...res,
      body: output
    };
  } catch (e) {
    log(`error: ${e && e.message ? e.message : e}`);
    return (ctx && ctx.response) || {};
  }
}
