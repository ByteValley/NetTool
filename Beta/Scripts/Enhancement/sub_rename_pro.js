/* =========================================================
 * 模块分类 · 通用订阅改名 / Surge 原生版
 * 作者 · ByteValley
 * 版本 · 2026-04-02R1
 *
 * 模块分类 · 说明
 * · 运行方式：Surge http-response 脚本
 * · 用途：直接改写命中 URL 的订阅响应内容
 * · 参数来源：argument=PREFIX=...&TWFLAG=...
 * · PREFIX = 自定义前缀，如 "【ByteEden】 "
 * · TWFLAG = 台湾旗帜修正开关，1=启用，0=关闭
 *
 * 模块分类 · 设计原则
 * · 旗帜优先于英文国家名
 * · 城市优先于国家
 * · 先替换，再清理重复
 * · 不重组复杂节点结构
 * · 尽量保留原有旗帜、倍率、标签、机场前缀
 * · 无旗帜节点自动在前缀后补充旗帜
 * ========================================================= */

var ENV = parseArgument(typeof $argument !== "undefined" ? $argument : "")
var PREFIX = String(ENV.PREFIX || "")
var TWFLAG = String(ENV.TWFLAG || "0")

;(function main() {
  try {
    var rawBody = typeof $response !== "undefined" && typeof $response.body === "string"
      ? $response.body
      : ""

    var content = String(rawBody || "").trim()
    if (!content) {
      console.log("[SubRename] 响应体为空，跳过处理")
      return $done({})
    }

    var isBase64Wrapped = false

    if (looksLikeBase64(content)) {
      var decoded = tryDecodeBase64ToText(content)
      if (decoded && looksLikeUsefulDecodedText(decoded)) {
        isBase64Wrapped = true
        content = decoded.trim()
      }
    }

    var isClash = looksLikeClashYaml(content)
    var outText = isClash
      ? rewriteClashYamlProxyNames(content, PREFIX, TWFLAG)
      : rewriteSubscriptionLines(content, PREFIX, TWFLAG)

    var finalBody = isBase64Wrapped ? encodeTextToBase64(outText) : outText
    var headers = cloneHeaders($response && $response.headers ? $response.headers : {})

    delete headers["content-length"]
    delete headers["Content-Length"]
    headers["cache-control"] = "no-store"

    if (!headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = "text/plain; charset=utf-8"
    }

    console.log(
      "[SubRename] 处理完成, base64=" +
        isBase64Wrapped +
        ", clash=" +
        isClash +
        ", url=" +
        (($request && $request.url) || "")
    )

    return $done({
      body: finalBody,
      headers: headers
    })
  } catch (e) {
    console.log("[SubRename] 改写失败: " + String(e))
    return $done({})
  }
})()

/* =========================================================
 * 参数解析
 * ========================================================= */

function parseArgument(str) {
  var out = {}
  if (!str) return out

  String(str)
    .split("&")
    .forEach(function(part) {
      if (!part) return
      var idx = part.indexOf("=")
      var key = idx === -1 ? part : part.slice(0, idx)
      var val = idx === -1 ? "" : part.slice(idx + 1)

      try { key = decodeURIComponent(key) } catch (e) {}
      try { val = decodeURIComponent(val) } catch (e) {}

      out[key] = val
    })

  return out
}

/* =========================================================
 * 公告型伪节点
 * ========================================================= */

var SKIP_RENAME_PATTERNS = [
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
]

/* =========================================================
 * 旗帜到中文地区
 * ========================================================= */

var FLAG_TO_ZH = {
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
}

/* =========================================================
 * 中文地区名 → 旗帜
 * ========================================================= */

var ZH_TO_FLAG = buildZhToFlagMap(FLAG_TO_ZH)

function buildZhToFlagMap(map) {
  var out = {}
  for (var flag in map) {
    if (Object.prototype.hasOwnProperty.call(map, flag)) {
      out[map[flag]] = flag
    }
  }
  return out
}

var CITY_ZH_TO_FLAG = {
  "香港": "🇭🇰",
  "澳门": "🇲🇴",
  "台北": "🇹🇼",
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
}

/* =========================================================
 * 城市规则（优先）
 * ========================================================= */

var CITY_RULES = [
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
]

/* =========================================================
 * 国家规则
 * ========================================================= */

var COUNTRY_RULES = [
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
]

/* =========================================================
 * 需要保留的线路标签
 * ========================================================= */

var KEEP_TAG_WORDS = [
  "ISP", "Hinet", "Amazon", "Telecom", "IEPL", "IPLC", "BGP",
  "CN2", "AWS", "Oracle", "Azure", "Google", "Premium", "Pro", "Lite"
]

var CITY_PREFERRED_DISPLAY = {
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
}

/* =========================================================
 * 核心逻辑
 * ========================================================= */

function applySmartRewrite(name, prefix, twFlagMode) {
  if (!name) return ""

  var n = normalizeSeparators(String(name || ""))

  if (shouldSkipRename(n)) {
    return compactName(prefix + n)
  }

  n = injectZhFromFlag(n)
  n = replaceByRules(n, CITY_RULES)
  n = replaceByRules(n, COUNTRY_RULES)
  n = cleanupAfterReplace(n)
  n = cleanupPreferredCityDisplay(n)

  if (twFlagMode === "1" && hasTaiwanKeyword(n)) {
    n = fixTaiwanFlag(n)
  }

  n = cleanupNodeName(n)
  n = injectFlagIfMissing(n)

  return compactName(prefix + n)
}

function shouldSkipRename(name) {
  return SKIP_RENAME_PATTERNS.some(function(reg) {
    return reg.test(String(name || ""))
  })
}

function injectZhFromFlag(name) {
  var s = normalizePipes(String(name || ""))

  for (var flag in FLAG_TO_ZH) {
    if (!Object.prototype.hasOwnProperty.call(FLAG_TO_ZH, flag)) continue
    var zh = FLAG_TO_ZH[flag]
    var reg = new RegExp(escapeRegExp(flag) + "(?!\\s*" + escapeRegExp(zh) + ")", "g")
    s = s.replace(reg, flag + zh + " ")
  }

  return s
}

function hasEmojiFlag(name) {
  return /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(String(name || ""))
}

function inferFlagFromZhName(name) {
  var s = String(name || "")
  var cityKeys = sortKeysByLengthDesc(CITY_ZH_TO_FLAG)
  for (var i = 0; i < cityKeys.length; i++) {
    if (s.indexOf(cityKeys[i]) !== -1) return CITY_ZH_TO_FLAG[cityKeys[i]]
  }

  var countryKeys = sortKeysByLengthDesc(ZH_TO_FLAG)
  for (var j = 0; j < countryKeys.length; j++) {
    if (s.indexOf(countryKeys[j]) !== -1) return ZH_TO_FLAG[countryKeys[j]]
  }

  return ""
}

function sortKeysByLengthDesc(obj) {
  return Object.keys(obj).sort(function(a, b) {
    return b.length - a.length
  })
}

function injectFlagIfMissing(name) {
  var s = String(name || "")
  if (hasEmojiFlag(s)) return s

  var flag = inferFlagFromZhName(s)
  if (!flag) return s

  return flag + " " + s
}

function replaceByRules(name, rules) {
  var result = normalizePipes(String(name || ""))
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i]
    for (var j = 0; j < rule.alias.length; j++) {
      result = replaceAliasSafely(result, rule.alias[j], rule.zh)
    }
  }
  return result
}

function replaceAliasSafely(text, alias, replacement) {
  var source = normalizePipes(String(text || ""))

  var pattern = alias
    .trim()
    .split(/\s+/)
    .map(function(part) { return escapeRegExp(part) })
    .join("[\\s_\\-+]+")

  var reg = new RegExp(
    "(^|[\\s|【】()（）_\\-+])" + pattern + "(?=($|[\\s|【】()（）_\\-+]))",
    "ig"
  )

  return source.replace(reg, function(_, left) {
    if (!replacement) return left
    return left + replacement
  })
}

function cleanupAfterReplace(name) {
  var s = normalizePipes(String(name || ""))
  var zhNames = getAllZhNamesSorted()
  var aliasList = getAllAliasesSorted()
  var keepWordsPattern = KEEP_TAG_WORDS.join("|")

  for (var i = 0; i < aliasList.length; i++) {
    s = replaceAliasSafely(s, aliasList[i], "")
  }

  for (var j = 0; j < zhNames.length; j++) {
    var zh = zhNames[j]
    var ezh = escapeRegExp(zh)

    s = s.replace(new RegExp("(" + ezh + ")\\s+(" + ezh + ")\\s*(\\d{1,4})", "g"), "$1 $3")
    s = s.replace(new RegExp("(" + ezh + ")\\s*(\\d{1,4})\\s+(" + ezh + ")", "g"), "$1 $2")

    s = s.replace(
      new RegExp("(" + ezh + ")\\s+(" + ezh + ")(\\s+(?:" + keepWordsPattern + ")\\b.*)?", "gi"),
      "$1$3"
    )

    s = s.replace(new RegExp("(" + ezh + ")\\s*\\|\\s*(" + ezh + ")\\s*(\\d{1,4})", "g"), "$1 $3")

    s = s.replace(
      new RegExp("(" + ezh + ")\\s*\\|\\s*(" + ezh + ")(\\s+(?:" + keepWordsPattern + ")\\b.*)?", "gi"),
      "$1$3"
    )

    s = s.replace(new RegExp("(" + ezh + ")\\s*\\|\\s*(" + ezh + ")", "g"), "$1")
  }

  return s
}

function cleanupPreferredCityDisplay(name) {
  var s = normalizePipes(String(name || ""))
  var keepWordsPattern = KEEP_TAG_WORDS.join("|")

  for (var city in CITY_PREFERRED_DISPLAY) {
    if (!Object.prototype.hasOwnProperty.call(CITY_PREFERRED_DISPLAY, city)) continue
    var country = CITY_PREFERRED_DISPLAY[city]
    var ecity = escapeRegExp(city)
    var ecountry = escapeRegExp(country)

    s = s.replace(
      new RegExp("(?:"
        + ecountry
        + "\\s+)?("
        + ecity
        + ")\\s*\\|\\s*"
        + ecity
        + "(\\s+(?:"
        + keepWordsPattern
        + ")\\b.*|\\s*\\d{1,4})?", "gi"),
      "$1$2"
    )

    s = s.replace(
      new RegExp("(?:"
        + ecountry
        + "\\s+)?("
        + ecity
        + ")\\s*\\|\\s*"
        + ecountry
        + "(\\s+(?:"
        + keepWordsPattern
        + ")\\b.*|\\s*\\d{1,4})?", "gi"),
      "$1$2"
    )

    s = s.replace(
      new RegExp(
        ecountry + "\\s+(" + ecity + ")(\\s+(?:" + keepWordsPattern + ")\\b.*|\\s*\\d{1,4})?",
        "gi"
      ),
      "$1$2"
    )
  }

  return s
}

function hasTaiwanKeyword(name) {
  return /台湾/.test(String(name || ""))
}

function fixTaiwanFlag(name) {
  var s = String(name || "")
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, "")
  s = s.replace(/台湾/g, "🇹🇼 台湾")
  s = s.replace(/(🇹🇼\s*){2,}/g, "🇹🇼 ")
  return s
}

/* =========================================================
 * 工具函数
 * ========================================================= */

function normalizePipes(s) {
  return String(s || "").replace(/[｜丨¦]/g, "|")
}

function normalizeSeparators(s) {
  return normalizePipes(String(s || ""))
    .replace(/[+]/g, " ")
    .replace(/\s+/g, " ")
}

function getAllAliasesSorted() {
  var map = {}
  var i, j

  for (i = 0; i < CITY_RULES.length; i++) {
    for (j = 0; j < CITY_RULES[i].alias.length; j++) {
      map[CITY_RULES[i].alias[j]] = true
    }
  }

  for (i = 0; i < COUNTRY_RULES.length; i++) {
    for (j = 0; j < COUNTRY_RULES[i].alias.length; j++) {
      map[COUNTRY_RULES[i].alias[j]] = true
    }
  }

  return Object.keys(map).sort(function(a, b) {
    return b.length - a.length
  })
}

function getAllZhNamesSorted() {
  var map = {}
  var i

  for (i = 0; i < CITY_RULES.length; i++) map[CITY_RULES[i].zh] = true
  for (i = 0; i < COUNTRY_RULES.length; i++) map[COUNTRY_RULES[i].zh] = true

  for (var flag in FLAG_TO_ZH) {
    if (Object.prototype.hasOwnProperty.call(FLAG_TO_ZH, flag)) {
      map[FLAG_TO_ZH[flag]] = true
    }
  }

  return Object.keys(map).sort(function(a, b) {
    return b.length - a.length
  })
}

function cleanupNodeName(name) {
  var s = normalizePipes(String(name || ""))

  s = s.replace(/[+]/g, " ")
  s = s.replace(/\s*\|\s*/g, " | ")
  s = s.replace(/\s+/g, " ")
  s = s.replace(/\s+\]/g, "]")
  s = s.replace(/\[\s+/g, "[")
  s = s.trim()

  return s
}

function compactName(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
}

/* =========================================================
 * 订阅改写
 * ========================================================= */

function rewriteSubscriptionLines(text, prefix, twFlagMode) {
  return text.split(/\r?\n/).map(function(line) {
    var trimLine = line.trim()
    if (!trimLine) return line

    if (/^vmess:\/\//i.test(trimLine)) {
      try {
        var raw = trimLine.slice(8)
        var decoded = tryDecodeBase64ToText(raw)
        if (!decoded) return line

        var obj = JSON.parse(decoded)
        obj.ps = applySmartRewrite(obj.ps || "", prefix, twFlagMode)
        return "vmess://" + encodeTextToBase64(JSON.stringify(obj))
      } catch (e) {
        return line
      }
    }

    var hashIdx = line.indexOf("#")
    if (hashIdx !== -1) {
      var before = line.slice(0, hashIdx + 1)
      var after = line.slice(hashIdx + 1)

      var name = after
      try { name = decodeURIComponent(after) } catch (e) {}

      name = applySmartRewrite(name, prefix, twFlagMode)
      return before + encodeURIComponent(name)
    }

    return line
  }).join("\n")
}

/* =========================================================
 * Clash YAML 改写
 * ========================================================= */

function rewriteClashYamlProxyNames(text, prefix, twFlagMode) {
  return text.split(/\r?\n/).map(function(line) {
    var match = line.match(/^(\s*-\s*name\s*:\s*)(.*)$/i)
    if (!match) return line

    var head = match[1]
    var oldName = match[2].trim()

    if (
      (oldName.charAt(0) === '"' && oldName.charAt(oldName.length - 1) === '"') ||
      (oldName.charAt(0) === "'" && oldName.charAt(oldName.length - 1) === "'")
    ) {
      oldName = oldName.slice(1, -1)
    }

    var newName = applySmartRewrite(oldName, prefix, twFlagMode)
    return head + '"' + escapeYamlDoubleQuoted(newName) + '"'
  }).join("\n")
}

function escapeYamlDoubleQuoted(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
}

/* =========================================================
 * 文本 / 编码工具
 * ========================================================= */

function cloneHeaders(headers) {
  var out = {}
  if (!headers) return out

  for (var key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      out[key] = String(headers[key])
    }
  }

  return out
}

function encodeTextToBase64(text) {
  return base64EncodeBinary(utf8Encode(String(text || "")))
}

function tryDecodeBase64ToText(b64) {
  try {
    var bin = base64DecodeBinary(String(b64 || "").replace(/\s+/g, ""))
    return utf8Decode(bin)
  } catch (e) {
    return null
  }
}

function utf8Encode(str) {
  return unescape(encodeURIComponent(str))
}

function utf8Decode(bin) {
  return decodeURIComponent(escape(bin))
}

var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

function base64EncodeBinary(input) {
  var out = ""
  var i = 0

  while (i < input.length) {
    var c1 = input.charCodeAt(i++) & 0xff
    var c2 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN
    var c3 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN

    var e1 = c1 >> 2
    var e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : (c2 >> 4))
    var e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : (c3 >> 6)))
    var e4 = isNaN(c3) ? 64 : (c3 & 63)

    out +=
      BASE64_CHARS.charAt(e1) +
      BASE64_CHARS.charAt(e2) +
      BASE64_CHARS.charAt(e3) +
      BASE64_CHARS.charAt(e4)
  }

  return out
}

function base64DecodeBinary(input) {
  var str = String(input || "").replace(/[^A-Za-z0-9+/=]/g, "")
  var out = ""
  var i = 0

  while (i < str.length) {
    var e1 = BASE64_CHARS.indexOf(str.charAt(i++))
    var e2 = BASE64_CHARS.indexOf(str.charAt(i++))
    var e3 = BASE64_CHARS.indexOf(str.charAt(i++))
    var e4 = BASE64_CHARS.indexOf(str.charAt(i++))

    if (e1 < 0 || e2 < 0) break

    var c1 = (e1 << 2) | (e2 >> 4)
    out += String.fromCharCode(c1)

    if (e3 !== 64 && e3 >= 0) {
      var c2 = ((e2 & 15) << 4) | (e3 >> 2)
      out += String.fromCharCode(c2)
    }

    if (e4 !== 64 && e4 >= 0) {
      var c3 = ((e3 & 3) << 6) | e4
      out += String.fromCharCode(c3)
    }
  }

  return out
}

function looksLikeBase64(s) {
  var t = String(s || "").replace(/\s+/g, "")
  return t.length >= 16 && t.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(t)
}

function looksLikeClashYaml(s) {
  return /proxies\s*:/i.test(s) && /-\s*name\s*:/i.test(s)
}

function looksLikeUsefulDecodedText(s) {
  return /(vmess|vless|trojan|ss|ssr|hy2|hysteria|tuic):\/\//i.test(s) || looksLikeClashYaml(s)
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
