/* =========================================================
 * 模块分类 · 通用订阅改名 / Surge Script Filter 版
 * 作者 · ByteValley
 * 版本 · 2026-04-02R1
 *
 * 模块分类 · 说明
 * · 运行方式：Surge http-response Script Filter
 * · 用途：直接改写订阅响应内容（托管配置 / 普通订阅均可）
 * · 参数（在模块 argument 字段配置）：
 *   PREFIX = 自定义前缀，如 "【ByteEden】 "
 *   TWFLAG = 台湾旗帜修正开关，1=启用，0=关闭
 *
 * 模块分类 · 设计原则
 * · 旗帜优先于英文国家名
 * · 城市优先于国家
 * · 先替换，再清理重复
 * · 不重组复杂节点结构
 * · 尽量保留原有旗帜、倍率、标签、机场前缀
 *
 * 模块分类 · Surge 配置示例
 * [Script]
 * sub-rename = type=http-response,pattern=^https?://your\.sub\.url,requires-body=1,max-size=0,script-path=sub-rename-surge.js,argument=PREFIX=【ByteEden】 &TWFLAG=0
 * ========================================================= */

var _args = parseArgument(typeof $argument !== “undefined” ? $argument : “”);
var _prefix = String(_args.PREFIX || “”);
var _twFlagMode = String(_args.TWFLAG || “0”);
var _rawBody = (typeof $response !== “undefined”) ? $response.body : null;

if (!_rawBody || typeof _rawBody !== “string”) {
console.log(”[SubRename] 响应体为空或非字符串，直接透传”);
$done({});
} else {
var _content = _rawBody.trim();
if (!_content) {
console.log(”[SubRename] 响应体为空，跳过处理”);
$done({});
} else {
try {
var _isBase64Wrapped = false;
if (looksLikeBase64(_content)) {
var _decoded = tryDecodeBase64ToText(_content);
if (_decoded && looksLikeUsefulDecodedText(_decoded)) {
_isBase64Wrapped = true;
_content = _decoded.trim();
}
}
var _isClash = looksLikeClashYaml(_content);
var _outText = _isClash
? rewriteClashYamlProxyNames(_content, _prefix, _twFlagMode)
: rewriteSubscriptionLines(_content, _prefix, _twFlagMode);
var _finalBody = _isBase64Wrapped ? encodeTextToBase64(_outText) : _outText;
console.log(”[SubRename] 处理完成，base64=” + _isBase64Wrapped + “, clash=” + _isClash);
$done({ body: _finalBody });
} catch (e) {
console.log(”[SubRename] 改写失败: “ + String(e));
$done({});
}
}
}

function parseArgument(argStr) {
var result = {};
if (!argStr) return result;
var pairs = argStr.split(”&”);
for (var i = 0; i < pairs.length; i++) {
var eqIdx = pairs[i].indexOf(”=”);
if (eqIdx === -1) continue;
var k = pairs[i].slice(0, eqIdx).trim();
var v = pairs[i].slice(eqIdx + 1);
try { result[k] = decodeURIComponent(v); } catch (e) { result[k] = v; }
}
return result;
}

var SKIP_RENAME_PATTERNS = [
/套餐到期/i, /官网/i, /频道/i, /更新订阅/i, /节点不通/i,
/流量/i, /到期/i, /\bTG\b/i, /Telegram/i, /通知/i,
/客服/i, /订阅说明/i, /官方群/i, /备用网址/i, /剩余流量/i,
/距离下次重置/i, /官方导航/i, /超时请/i, /订阅超时/i, /剩余/i
];

var FLAG_TO_ZH = {
“\uD83C\uDDF0\uD83C\uDDFD”: “香港”, “\uD83C\uDDF9\uD83C\uDDFC”: “台湾”,
“\uD83C\uDDEF\uD83C\uDDF5”: “日本”, “\uD83C\uDDF0\uD83C\uDDF7”: “韩国”,
“\uD83C\uDDF8\uD83C\uDDEC”: “新加坡”, “\uD83C\uDDFA\uD83C\uDDF8”: “美国”,
“\uD83C\uDDEC\uD83C\uDDE7”: “英国”, “\uD83C\uDDE9\uD83C\uDDEA”: “德国”,
“\uD83C\uDDEB\uD83C\uDDF7”: “法国”, “\uD83C\uDDF3\uD83C\uDDF1”: “荷兰”,
“\uD83C\uDDEE\uD83C\uDDF9”: “意大利”, “\uD83C\uDDEA\uD83C\uDDF8”: “西班牙”,
“\uD83C\uDDE8\uD83C\uDDED”: “瑞士”, “\uD83C\uDDE6\uD83C\uDDF9”: “奥地利”,
“\uD83C\uDDE7\uD83C\uDDEA”: “比利时”, “\uD83C\uDDE8\uD83C\uDDE6”: “加拿大”,
“\uD83C\uDDF2\uD83C\uDDFD”: “墨西哥”, “\uD83C\uDDEE\uD83C\uDDF1”: “以色列”,
“\uD83C\uDDF9\uD83C\uDDF7”: “土耳其”, “\uD83C\uDDF8\uD83C\uDDE6”: “沙特”,
“\uD83C\uDDFF\uD83C\uDDE6”: “南非”, “\uD83C\uDDEE\uD83C\uDDF8”: “冰岛”,
“\uD83C\uDDE9\uD83C\uDDF0”: “丹麦”, “\uD83C\uDDF8\uD83C\uDDEA”: “瑞典”,
“\uD83C\uDDF3\uD83C\uDDF4”: “挪威”, “\uD83C\uDDEA\uD83C\uDDEC”: “埃及”,
“\uD83C\uDDF1\uD83C\uDDF9”: “立陶宛”, “\uD83C\uDDF2\uD83C\uDDF0”: “北马其顿”,
“\uD83C\uDDE8\uD83C\uDDFF”: “捷克”, “\uD83C\uDDED\uD83C\uDDFA”: “匈牙利”,
“\uD83C\uDDE8\uD83C\uDDF1”: “智利”, “\uD83C\uDDF3\uD83C\uDDEC”: “尼日利亚”,
“\uD83C\uDDF2\uD83C\uDDE6”: “摩洛哥”, “\uD83C\uDDE6\uD83C\uDDFF”: “阿塞拜疆”,
“\uD83C\uDDF7\uD83C\uDDF4”: “罗马尼亚”, “\uD83C\uDDE8\uD83C\uDDF4”: “哥伦比亚”,
“\uD83C\uDDF0\uD83C\uDDFF”: “哈萨克斯坦”, “\uD83C\uDDF0\uD83C\uDDEC”: “吉尔吉斯斯坦”,
“\uD83C\uDDF5\uD83C\uDDF9”: “葡萄牙”, “\uD83C\uDDE6\uD83C\uDDFA”: “澳洲”,
“\uD83C\uDDF3\uD83C\uDDFF”: “新西兰”
};

var CITY_RULES = [
{ zh: “香港”, alias: [“Hong Kong”, “HongKong”] },
{ zh: “澳门”, alias: [“Macau”, “Macao”] },
{ zh: “台北”, alias: [“Taipei”, “Taibei”] },
{ zh: “东京”, alias: [“Tokyo”] },
{ zh: “大阪”, alias: [“Osaka”] },
{ zh: “名古屋”, alias: [“Nagoya”] },
{ zh: “札幌”, alias: [“Sapporo”] },
{ zh: “福冈”, alias: [“Fukuoka”] },
{ zh: “冲绳”, alias: [“Okinawa”] },
{ zh: “首尔”, alias: [“Seoul”] },
{ zh: “釜山”, alias: [“Busan”] },
{ zh: “仁川”, alias: [“Incheon”] },
{ zh: “春川”, alias: [“Chuncheon”] },
{ zh: “洛杉矶”, alias: [“Los Angeles”, “LosAngeles”] },
{ zh: “圣何塞”, alias: [“San Jose”, “SanJose”] },
{ zh: “硅谷”, alias: [“Silicon Valley”, “SiliconValley”] },
{ zh: “纽约”, alias: [“New York”, “NewYork”] },
{ zh: “西雅图”, alias: [“Seattle”] },
{ zh: “芝加哥”, alias: [“Chicago”] },
{ zh: “凤凰城”, alias: [“Phoenix”] },
{ zh: “达拉斯”, alias: [“Dallas”] },
{ zh: “迈阿密”, alias: [“Miami”] },
{ zh: “丹佛”, alias: [“Denver”] },
{ zh: “波特兰”, alias: [“Portland”] },
{ zh: “亚特兰大”, alias: [“Atlanta”] },
{ zh: “拉斯维加斯”, alias: [“Las Vegas”, “LasVegas”] },
{ zh: “多伦多”, alias: [“Toronto”] },
{ zh: “温哥华”, alias: [“Vancouver”] },
{ zh: “蒙特利尔”, alias: [“Montreal”] },
{ zh: “渥太华”, alias: [“Ottawa”] },
{ zh: “墨西哥城”, alias: [“Mexico City”, “MexicoCity”] },
{ zh: “伦敦”, alias: [“London”] },
{ zh: “曼彻斯特”, alias: [“Manchester”] },
{ zh: “伯明翰”, alias: [“Birmingham”] },
{ zh: “法兰克福”, alias: [“Frankfurt”] },
{ zh: “柏林”, alias: [“Berlin”] },
{ zh: “慕尼黑”, alias: [“Munich”] },
{ zh: “杜塞尔多夫”, alias: [“Dusseldorf”] },
{ zh: “巴黎”, alias: [“Paris”] },
{ zh: “马赛”, alias: [“Marseille”] },
{ zh: “里昂”, alias: [“Lyon”] },
{ zh: “阿姆斯特丹”, alias: [“Amsterdam”] },
{ zh: “鹿特丹”, alias: [“Rotterdam”] },
{ zh: “米兰”, alias: [“Milan”] },
{ zh: “罗马”, alias: [“Rome”] },
{ zh: “那不勒斯”, alias: [“Naples”] },
{ zh: “马德里”, alias: [“Madrid”] },
{ zh: “巴塞罗那”, alias: [“Barcelona”] },
{ zh: “瓦伦西亚”, alias: [“Valencia”] },
{ zh: “悉尼”, alias: [“Sydney”] },
{ zh: “墨尔本”, alias: [“Melbourne”] },
{ zh: “布里斯班”, alias: [“Brisbane”] },
{ zh: “珀斯”, alias: [“Perth”] },
{ zh: “阿德莱德”, alias: [“Adelaide”] },
{ zh: “迪拜”, alias: [“Dubai”] },
{ zh: “阿布扎比”, alias: [“Abu Dhabi”, “AbuDhabi”] },
{ zh: “多哈”, alias: [“Doha”] },
{ zh: “利雅得”, alias: [“Riyadh”] },
{ zh: “吉达”, alias: [“Jeddah”] },
{ zh: “麦纳麦”, alias: [“Manama”] },
{ zh: “马斯喀特”, alias: [“Muscat”] },
{ zh: “特拉维夫”, alias: [“Tel Aviv”, “TelAviv”] },
{ zh: “耶路撒冷”, alias: [“Jerusalem”] },
{ zh: “卡萨布兰卡”, alias: [“Casablanca”] },
{ zh: “约翰内斯堡”, alias: [“Johannesburg”] },
{ zh: “开普敦”, alias: [“Cape Town”, “CapeTown”] },
{ zh: “开罗”, alias: [“Cairo”] },
{ zh: “拉各斯”, alias: [“Lagos”] },
{ zh: “马其顿”, alias: [“Macedonia”] },
{ zh: “卡拉奇”, alias: [“Karachi”] },
{ zh: “拉合尔”, alias: [“Lahore”] },
{ zh: “达卡”, alias: [“Dhaka”] },
{ zh: “金边”, alias: [“Phnom Penh”, “PhnomPenh”] },
{ zh: “科伦坡”, alias: [“Colombo”] },
{ zh: “加德满都”, alias: [“Kathmandu”] },
{ zh: “巴库”, alias: [“Baku”] },
{ zh: “阿拉木图”, alias: [“Almaty”] },
{ zh: “阿斯塔纳”, alias: [“Astana”] },
{ zh: “比什凯克”, alias: [“Bishkek”] }
];

var COUNTRY_RULES = [
{ zh: “香港”, alias: [“HKG”, “HK”] },
{ zh: “台湾”, alias: [“Tai Wan”, “Taiwan”, “TPE”, “TW”] },
{ zh: “日本”, alias: [“Japan”, “JP”] },
{ zh: “韩国”, alias: [“South Korea”, “SouthKorea”, “Korea”, “KR”, “KOR”] },
{ zh: “新加坡”, alias: [“Singapore”, “SGP”, “SG”] },
{ zh: “美国”, alias: [“United States”, “UnitedStates”, “America”, “USA”, “US”] },
{ zh: “英国”, alias: [“United Kingdom”, “UnitedKingdom”, “Britain”, “England”, “GBR”, “GB”, “UK”] },
{ zh: “德国”, alias: [“Deutschland”, “Germany”, “DEU”, “DE”] },
{ zh: “法国”, alias: [“France”, “FRA”, “FR”] },
{ zh: “荷兰”, alias: [“Nederland”, “Netherlands”, “Holland”, “NLD”, “NL”] },
{ zh: “意大利”, alias: [“Italia”, “Italy”, “ITA”, “IT”] },
{ zh: “西班牙”, alias: [“Espana”, “Spain”, “ESP”, “ES”] },
{ zh: “葡萄牙”, alias: [“Portugal”, “PRT”, “PT”] },
{ zh: “瑞士”, alias: [“Schweiz”, “Suisse”, “Switzerland”, “CHE”, “CH”] },
{ zh: “奥地利”, alias: [“Osterreich”, “Austria”, “AUT”, “AT”] },
{ zh: “比利时”, alias: [“Belgique”, “Belgium”, “BEL”, “BE”] },
{ zh: “爱尔兰”, alias: [“Ireland”, “IRL”, “IE”] },
{ zh: “丹麦”, alias: [“Danmark”, “Denmark”, “DNK”, “DK”] },
{ zh: “瑞典”, alias: [“Sverige”, “Sweden”, “SWE”, “SE”] },
{ zh: “挪威”, alias: [“Norge”, “Norway”, “NOR”, “NO”] },
{ zh: “芬兰”, alias: [“Suomi”, “Finland”, “FIN”, “FI”] },
{ zh: “冰岛”, alias: [“Iceland”, “ISL”, “IS”] },
{ zh: “波兰”, alias: [“Polska”, “Poland”, “POL”, “PL”] },
{ zh: “捷克”, alias: [“Cesko”, “Czechia”, “Czech”, “CZ”] },
{ zh: “匈牙利”, alias: [“Magyarorszag”, “Hungary”, “HU”] },
{ zh: “罗马尼亚”, alias: [“Romania”, “RO”] },
{ zh: “保加利亚”, alias: [“Bulgaria”, “BG”] },
{ zh: “希腊”, alias: [“Greece”, “GR”] },
{ zh: “土耳其”, alias: [“Turkiye”, “Turkey”, “TR”] },
{ zh: “俄罗斯”, alias: [“Russia”, “RUS”, “RU”] },
{ zh: “乌克兰”, alias: [“Ukraine”, “UA”] },
{ zh: “加拿大”, alias: [“Canada”, “CAN”, “CA”] },
{ zh: “墨西哥”, alias: [“Mexico”, “MX”] },
{ zh: “巴西”, alias: [“Brasil”, “Brazil”, “BRA”, “BR”] },
{ zh: “阿根廷”, alias: [“Argentina”, “ARG”, “AR”] },
{ zh: “智利”, alias: [“Chile”, “CL”] },
{ zh: “哥伦比亚”, alias: [“Colombia”, “CO”] },
{ zh: “秘鲁”, alias: [“Peru”, “PE”] },
{ zh: “澳洲”, alias: [“Australia”, “AUS”, “AU”] },
{ zh: “新西兰”, alias: [“New Zealand”, “NewZealand”, “NZL”, “NZ”] },
{ zh: “马来西亚”, alias: [“Malaysia”, “MYS”, “MY”] },
{ zh: “泰国”, alias: [“Thailand”, “THA”, “TH”] },
{ zh: “越南”, alias: [“Vietnam”, “VNM”, “VN”] },
{ zh: “菲律宾”, alias: [“Philippines”, “PHL”, “PH”] },
{ zh: “印尼”, alias: [“Indonesia”, “IDN”, “ID”] },
{ zh: “印度”, alias: [“India”, “IND”, “IN”] },
{ zh: “孟加拉”, alias: [“Bangladesh”, “BD”] },
{ zh: “柬埔寨”, alias: [“Cambodia”, “KH”] },
{ zh: “阿联酋”, alias: [“United Arab Emirates”, “UnitedArabEmirates”, “UAE”, “AE”] },
{ zh: “沙特”, alias: [“Saudi Arabia”, “SaudiArabia”, “Saudi”, “SA”] },
{ zh: “卡塔尔”, alias: [“Qatar”, “QA”] },
{ zh: “科威特”, alias: [“Kuwait”, “KW”] },
{ zh: “巴林”, alias: [“Bahrain”, “BH”] },
{ zh: “阿曼”, alias: [“Oman”, “OM”] },
{ zh: “以色列”, alias: [“Israel”, “IL”] },
{ zh: “澳门”, alias: [“Macau”, “Macao”, “MO”] },
{ zh: “南非”, alias: [“South Africa”, “SouthAfrica”, “ZA”] },
{ zh: “埃及”, alias: [“Egypt”, “EG”] },
{ zh: “尼日利亚”, alias: [“Nigeria”, “NG”] },
{ zh: “北马其顿”, alias: [“North Macedonia”, “NorthMacedonia”, “MK”] },
{ zh: “立陶宛”, alias: [“Lietuva”, “Lithuania”, “LT”] },
{ zh: “拉脱维亚”, alias: [“Latvija”, “Latvia”, “LV”] },
{ zh: “爱沙尼亚”, alias: [“Eesti”, “Estonia”, “EE”] },
{ zh: “阿塞拜疆”, alias: [“Azerbaijan”, “AZ”] },
{ zh: “摩洛哥”, alias: [“Maroc”, “Morocco”, “MA”] },
{ zh: “多哥”, alias: [“Togo”, “TG”] },
{ zh: “哈萨克斯坦”, alias: [“Kazakhstan”, “KZ”] },
{ zh: “吉尔吉斯斯坦”, alias: [“Kyrgyzstan”, “KG”] }
];

var KEEP_TAG_WORDS = [
“ISP”, “Hinet”, “Amazon”, “Telecom”, “IEPL”, “IPLC”, “BGP”,
“CN2”, “AWS”, “Oracle”, “Azure”, “Google”, “Premium”, “Pro”, “Lite”
];

var CITY_PREFERRED_DISPLAY = {
“悉尼”: “澳洲”, “墨尔本”: “澳洲”, “布里斯班”: “澳洲”,
“珀斯”: “澳洲”, “阿德莱德”: “澳洲”,
“多伦多”: “加拿大”, “温哥华”: “加拿大”,
“蒙特利尔”: “加拿大”, “渥太华”: “加拿大”,
“迪拜”: “阿联酋”, “阿布扎比”: “阿联酋”,
“卡萨布兰卡”: “摩洛哥”, “马其顿”: “北马其顿”
};

function applySmartRewrite(name, pfx, twMode) {
if (!name) return “”;
var n = normalizeSeparators(String(name));
if (shouldSkipRename(n)) return compactName(pfx + n);
n = injectZhFromFlag(n);
n = replaceByRules(n, CITY_RULES);
n = replaceByRules(n, COUNTRY_RULES);
n = cleanupAfterReplace(n);
n = cleanupPreferredCityDisplay(n);
if (twMode === “1” && hasTaiwanKeyword(n)) n = fixTaiwanFlag(n);
n = cleanupNodeName(n);
return compactName(pfx + n);
}

function shouldSkipRename(name) {
for (var i = 0; i < SKIP_RENAME_PATTERNS.length; i++) {
if (SKIP_RENAME_PATTERNS[i].test(String(name))) return true;
}
return false;
}

function injectZhFromFlag(name) {
var s = normalizePipes(String(name));
var keys = Object.keys(FLAG_TO_ZH);
for (var i = 0; i < keys.length; i++) {
var flag = keys[i];
var zh = FLAG_TO_ZH[flag];
var reg = new RegExp(escapeRegExp(flag) + “(?!\s*” + escapeRegExp(zh) + “)”, “g”);
s = s.replace(reg, flag + zh + “ “);
}
return s;
}

function replaceByRules(name, rules) {
var result = normalizePipes(String(name));
for (var i = 0; i < rules.length; i++) {
for (var j = 0; j < rules[i].alias.length; j++) {
result = replaceAliasSafely(result, rules[i].alias[j], rules[i].zh);
}
}
return result;
}

function replaceAliasSafely(text, alias, replacement) {
var source = normalizePipes(String(text));
var parts = alias.trim().split(/\s+/);
var escaped = [];
for (var i = 0; i < parts.length; i++) escaped.push(escapeRegExp(parts[i]));
var pattern = escaped.join(”[\s_\-+]+”);
var reg = new RegExp(
“(^|[\s|\u3010\u3011()\uff08\uff09_\-+])” + pattern + “(?=($|[\s|\u3010\u3011()\uff08\uff09_\-+]))”,
“ig”
);
return source.replace(reg, function(m, left) {
if (!replacement) return left;
return left + replacement;
});
}

function cleanupAfterReplace(name) {
var s = normalizePipes(String(name));
var zhNames = getAllZhNamesSorted();
var aliasList = getAllAliasesSorted();
var keepAlt = KEEP_TAG_WORDS.join(”|”);
for (var a = 0; a < aliasList.length; a++) {
s = replaceAliasSafely(s, aliasList[a], “”);
}
for (var z = 0; z < zhNames.length; z++) {
var ezh = escapeRegExp(zhNames[z]);
s = s.replace(new RegExp(”(” + ezh + “)\s+(” + ezh + “)\s*(\d{1,4})”, “g”), “$1 $3”);
s = s.replace(new RegExp(”(” + ezh + “)\s*(\d{1,4})\s+(” + ezh + “)”, “g”), “$1 $2”);
s = s.replace(new RegExp(”(” + ezh + “)\s+(” + ezh + “)(\s+(?:” + keepAlt + “)\b.*)?”, “gi”), “$1$3”);
s = s.replace(new RegExp(”(” + ezh + “)\s*\|\s*(” + ezh + “)\s*(\d{1,4})”, “g”), “$1 $3”);
s = s.replace(new RegExp(”(” + ezh + “)\s*\|\s*(” + ezh + “)(\s+(?:” + keepAlt + “)\b.*)?”, “gi”), “$1$3”);
s = s.replace(new RegExp(”(” + ezh + “)\s*\|\s*(” + ezh + “)”, “g”), “$1”);
}
return s;
}

function cleanupPreferredCityDisplay(name) {
var s = normalizePipes(String(name));
var keepAlt = KEEP_TAG_WORDS.join(”|”);
var cities = Object.keys(CITY_PREFERRED_DISPLAY);
for (var i = 0; i < cities.length; i++) {
var city = cities[i];
var country = CITY_PREFERRED_DISPLAY[city];
var ecity = escapeRegExp(city);
var ecountry = escapeRegExp(country);
s = s.replace(new RegExp(”(?:” + ecountry + “\s+)?(” + ecity + “)\s*\|\s*” + ecity + “(\s+(?:” + keepAlt + “)\b.*|\s*\d{1,4})?”, “gi”), “$1$2”);
s = s.replace(new RegExp(”(?:” + ecountry + “\s+)?(” + ecity + “)\s*\|\s*” + ecountry + “(\s+(?:” + keepAlt + “)\b.*|\s*\d{1,4})?”, “gi”), “$1$2”);
s = s.replace(new RegExp(ecountry + “\s+(” + ecity + “)(\s+(?:” + keepAlt + “)\b.*|\s*\d{1,4})?”, “gi”), “$1$2”);
}
return s;
}

function hasTaiwanKeyword(name) {
return /\u53f0\u6e7e/.test(String(name));
}

function fixTaiwanFlag(name) {
var s = String(name);
s = s.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, “”);
s = s.replace(/\u53f0\u6e7e/g, “\uD83C\uDDF9\uD83C\uDDFC \u53f0\u6e7e”);
s = s.replace(/(\uD83C\uDDF9\uD83C\uDDFC\s*){2,}/g, “\uD83C\uDDF9\uD83C\uDDFC “);
return s;
}

function rewriteSubscriptionLines(text, pfx, twMode) {
var lines = text.split(/\r?\n/);
var result = [];
for (var i = 0; i < lines.length; i++) {
var line = lines[i];
var trimLine = line.trim();
if (!trimLine) { result.push(line); continue; }
if (/^vmess:///i.test(trimLine)) {
try {
var raw = trimLine.slice(8);
var dec = tryDecodeBase64ToText(raw);
if (!dec) { result.push(line); continue; }
var obj = JSON.parse(dec);
obj.ps = applySmartRewrite(obj.ps || “”, pfx, twMode);
result.push(“vmess://” + encodeTextToBase64(JSON.stringify(obj)));
} catch (e) { result.push(line); }
continue;
}
var hashIdx = line.indexOf(”#”);
if (hashIdx !== -1) {
var before = line.slice(0, hashIdx + 1);
var after = line.slice(hashIdx + 1);
var nodeName = after;
try { nodeName = decodeURIComponent(after); } catch (e) {}
nodeName = applySmartRewrite(nodeName, pfx, twMode);
result.push(before + encodeURIComponent(nodeName));
continue;
}
result.push(line);
}
return result.join(”\n”);
}

function rewriteClashYamlProxyNames(text, pfx, twMode) {
var lines = text.split(/\r?\n/);
var result = [];
for (var i = 0; i < lines.length; i++) {
var line = lines[i];
var match = line.match(/^(\s*-\s*name\s*:\s*)(.*)$/i);
if (!match) { result.push(line); continue; }
var head = match[1];
var oldName = match[2].trim();
if (
(oldName.charAt(0) === ‘”’ && oldName.charAt(oldName.length - 1) === ‘”’) ||
(oldName.charAt(0) === “’” && oldName.charAt(oldName.length - 1) === “’”)
) {
oldName = oldName.slice(1, -1);
}
var newName = applySmartRewrite(oldName, pfx, twMode);
result.push(head + ‘”’ + newName + ‘”’);
}
return result.join(”\n”);
}

function normalizePipes(s) {
return String(s || “”).replace(/[\uff5c\u4e28\u00a6]/g, “|”);
}

function normalizeSeparators(s) {
return normalizePipes(String(s || “”)).replace(/[+]/g, “ “).replace(/\s+/g, “ “);
}

function getAllAliasesSorted() {
var seen = {};
var all = [];
var i, j, alias;
for (i = 0; i < CITY_RULES.length; i++) {
for (j = 0; j < CITY_RULES[i].alias.length; j++) {
alias = CITY_RULES[i].alias[j];
if (!seen[alias]) { seen[alias] = true; all.push(alias); }
}
}
for (i = 0; i < COUNTRY_RULES.length; i++) {
for (j = 0; j < COUNTRY_RULES[i].alias.length; j++) {
alias = COUNTRY_RULES[i].alias[j];
if (!seen[alias]) { seen[alias] = true; all.push(alias); }
}
}
return all.sort(function(a, b) { return b.length - a.length; });
}

function getAllZhNamesSorted() {
var seen = {};
var all = [];
var i, v;
for (i = 0; i < CITY_RULES.length; i++) {
v = CITY_RULES[i].zh;
if (!seen[v]) { seen[v] = true; all.push(v); }
}
for (i = 0; i < COUNTRY_RULES.length; i++) {
v = COUNTRY_RULES[i].zh;
if (!seen[v]) { seen[v] = true; all.push(v); }
}
var flagKeys = Object.keys(FLAG_TO_ZH);
for (i = 0; i < flagKeys.length; i++) {
v = FLAG_TO_ZH[flagKeys[i]];
if (!seen[v]) { seen[v] = true; all.push(v); }
}
return all.sort(function(a, b) { return b.length - a.length; });
}

function cleanupNodeName(name) {
var s = normalizePipes(String(name || “”));
s = s.replace(/[+]/g, “ “);
s = s.replace(/\s*|\s*/g, “ | “);
s = s.replace(/\s+/g, “ “);
s = s.replace(/\s+]/g, “]”);
s = s.replace(/[\s+/g, “[”);
return s.trim();
}

function compactName(s) {
return String(s || “”).replace(/\s+/g, “ “).trim();
}

function encodeTextToBase64(text) {
var bytes = utf8ToBytes(String(text || “”));
var bin = “”;
for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
return btoa(bin);
}

function tryDecodeBase64ToText(b64) {
try {
var bin = atob(String(b64 || “”).replace(/\s+/g, “”));
var bytes = new Uint8Array(bin.length);
for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
return bytesToUtf8(bytes);
} catch (e) { return null; }
}

function utf8ToBytes(str) {
var out = [];
var i = 0;
while (i < str.length) {
var cp = str.charCodeAt(i++);
if (cp >= 0xD800 && cp <= 0xDBFF && i < str.length) {
var trail = str.charCodeAt(i);
if (trail >= 0xDC00 && trail <= 0xDFFF) {
cp = ((cp - 0xD800) << 10) + (trail - 0xDC00) + 0x10000;
i++;
}
}
if (cp < 0x80) { out.push(cp); }
else if (cp < 0x800) { out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); }
else if (cp < 0x10000) { out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); }
else { out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); }
}
return out;
}

function bytesToUtf8(bytes) {
var str = “”;
var i = 0;
while (i < bytes.length) {
var b = bytes[i];
var cp;
if (b < 0x80)      { cp = b; i += 1; }
else if (b < 0xE0) { cp = ((b & 0x1F) << 6)  |  (bytes[i+1] & 0x3F); i += 2; }
else if (b < 0xF0) { cp = ((b & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F); i += 3; }
else               { cp = ((b & 0x07) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F); i += 4; }
if (cp < 0x10000) { str += String.fromCharCode(cp); }
else { cp -= 0x10000; str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
}
return str;
}

function looksLikeBase64(s) {
var t = String(s || “”).replace(/\s+/g, “”);
return t.length >= 16 && t.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(t);
}

function looksLikeClashYaml(s) {
return /proxies\s*:/i.test(s) && /-\s*name\s*:/i.test(s);
}

function looksLikeUsefulDecodedText(s) {
return /(vmess|vless|trojan|ss|ssr|hy2|hysteria|tuic):///i.test(s) || looksLikeClashYaml(s);
}

function escapeRegExp(s) {
return String(s).replace(/[.*+?^${}()|[]\]/g, “\$&”);
}
