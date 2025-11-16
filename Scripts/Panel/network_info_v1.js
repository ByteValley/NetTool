/* =========================================================
 * 模块：网络信息 + 服务检测（BoxJS / Surge / Loon / QuanX / Egern 兼容）
 * 作者：ByteValley
 * 版本：2025-11-16R1
 *
 * 概述 · 功能边界
 *  · 展示本地 / 入口 / 落地网络信息（IPv4/IPv6），并并发检测常见服务解锁状态
 *  · 标题显示网络类型；正文首行显示 执行时间 与 代理策略（紧邻）
 *  · Netflix 区分“完整/自制剧”；其他服务统一“已解锁/不可达”
 *  · 台湾旗样式可切换：TW_FLAG_MODE = 0(🇨🇳) / 1(🇹🇼) / 2(🇼🇸)
 *
 * 运行环境 · 依赖接口
 *  · 兼容：Surge（Panel/Script）、Loon、Quantumult X、Egern、BoxJS
 *  · 依赖：$httpClient / $httpAPI / $persistentStore|$prefs / $notification / $network
 *
 * 渲染结构 · 版式控制
 *  · 分组子标题：本地 / 入口 / 落地 / 服务检测；组间留白由 GAP_LINES 控制（0~2）
 *  · IPv4/IPv6 分行显示，按 MASK_IP 可脱敏；位置按 MASK_POS 可脱敏（未显式设置时随 MASK_IP）
 *  · 子标题样式由 SUBTITLE_STYLE 控制；SUBTITLE_MINIMAL 可输出极简标题
 *
 * 数据源 · 抓取策略
 *  · 直连 IPv4：按优先级表驱动（cip | 163 | 126 | bilibili | pingan | ipip）
 *    - 命中“市级”定位即返回；否则继续下一个源；全失败时回落至 ipip
 *  · 直连 IPv6：ddnspod | neu6
 *  · 落地 IPv4：ipapi | ipwhois | ipsb（失败逐级回退）
 *  · 落地 IPv6：ipsb | ipify | ident（失败逐级回退）
 *
 * 入口 · 策略名获取（稳态）
 *  · 预触发一次落地端点（v4/v6），确保代理产生可被记录的外连请求
 *  · 扫描 /v1/requests/recent 捕获入口 IPv4/IPv6 与 policyName；必要时用任意代理请求兜底
 *  · 入口定位采用“双源并行 + 回退链”：平安接口 +（ipapi → ipwhois → ipsb）
 *  · 入口定位缓存 TTL 跟 Update 联动：TTL = max(30, min(Update, 3600)) 秒
 *
 * 服务检测 · 显示风格
 *  · 覆盖：YouTube / Netflix / Disney+ / Hulu(美) / Hulu(日) / Max(HBO) / ChatGPT Web / ChatGPT App(API)
 *  · 样式：SD_STYLE = icon|text；SD_REGION_MODE = full|abbr|flag；SD_ICON_THEME = check|lock|circle
 *  · ChatGPT App(API) 地区优先读 Cloudflare 头（CF-IPCountry），无则多源回退
 *  · 别名映射（示例）：
 *    - yt|youtube|油管 → youtube
 *    - nf|netflix|奈飞 → netflix
 *    - disney|disney+|迪士尼 → disney
 *    - chatgpt → chatgpt_app；chatgpt_web|chatgpt-web|chatgpt web → chatgpt_web
 *    - hulu|葫芦|huluus → hulu_us；hulujp → hulu_jp；hbo|max → hbo
 *
 * 服务清单 · 选择优先级
 *  · 模块参数「手动修改值」（SERVICES，与默认值不同）
 *  · BoxJS 勾选（NetworkInfo_SERVICES）
 *  · BoxJS 文本（NetworkInfo_SERVICES_TEXT）
 *  · 默认（全部）
 *
 * 参数 · 默认值（BoxJS 键 / #!arguments）
 *  · Update                 刷新间隔（秒）                 默认 10
 *  · Timeout                全局超时（秒）                 默认 25
 *  · IPv6                   启用 IPv6                      默认 0
 *  · MASK_IP                脱敏 IP                        默认 1
 *  · MASK_POS               脱敏位置                       默认 1（未设时随 MASK_IP）
 *  · DOMESTIC_IPv4          直连 IPv4 源                   默认 ipip
 *  · DOMESTIC_IPv6          直连 IPv6 源                   默认 ddnspod
 *  · LANDING_IPv4           落地 IPv4 源                   默认 ipapi
 *  · LANDING_IPv6           落地 IPv6 源                   默认 ipsb
 *  · TW_FLAG_MODE           台湾旗模式 0/1/2               默认 1
 *  · IconPreset             图标预设                       默认 globe（globe|wifi|dots|antenna|point）
 *  · Icon / IconColor       自定义图标/颜色                优先于 IconPreset
 *  · SUBTITLE_STYLE         子标题样式                     line|cnBracket|cnQuote|square|curly|angle|pipe|bullet|plain（默认 line）
 *  · SUBTITLE_MINIMAL       极简子标题                     默认 0
 *  · GAP_LINES              分组留白 0~2                   默认 1
 *  · SD_STYLE               服务显示样式                    icon|text（默认 icon）
 *  · SD_REGION_MODE         地区风格                        full|abbr|flag（默认 full）
 *  · SD_ICON_THEME          图标主题                        check|lock|circle（默认 check）
 *  · SD_ARROW               使用“➟”连接服务名与地区        默认 1
 *  · SD_SHOW_LAT            显示耗时(ms)                    默认 1
 *  · SD_SHOW_HTTP           显示 HTTP 状态码                默认 1
 *  · SD_LANG                语言包                          zh-Hans|zh-Hant（默认 zh-Hans）
 *  · SD_TIMEOUT_MS          单项检测超时(ms)                默认=0（0/空→跟随 Timeout*1000，脚本内最小 2000）
 *  · SERVICES               服务清单（数组/逗号分隔）       为空则默认全开
 *
 * 日志 · 调试
 *  · LOG                    开启日志                        默认 0
 *  · LOG_LEVEL              级别：debug|info|warn|error      默认 info
 *  · LOG_TO_PANEL           面板追加“调试”尾巴               默认 0
 *  · LOG_PUSH               异常系统通知推送                 默认 1
 *
 * 参数优先级 · 总则
 *  · 模块参数「手动修改值」（与 #!arguments 默认不同）
 *  · BoxJS 值（NetworkInfo_XXX）
 *  · 模块参数默认值（#!arguments 行）
 *  · 代码兜底值
 *
 * 常见问题 · 提示
 *  · 入口为空：需确保近期访问过 ip-api / ip.sb 等落地接口；脚本已内置“预触发”
 *  · Netflix 仅自制剧：地区可用但目录受限，属正常判定
 *  · 台湾旗样式：按 TW_FLAG_MODE 切换（合规/默认/彩蛋）
 *
 * 示例 · 组合参数
 *  · SERVICES=Netflix,YouTube,Disney,ChatGPT,ChatGPT_Web,Hulu_US,Hulu_JP,HBO
 *  · SD_STYLE=text&SD_REGION_MODE=abbr&SD_ARROW=0
 * ========================================================= */

// ====================== 常量 & 配置基线 ======================
const CONSTS = Object.freeze({
    MAX_RECENT_REQ: 150,
    PRETOUCH_TO_MS: 700,
    RETRY_DELAY_MS: 260,
    SD_MIN_TIMEOUT: 2000,
    LOG_RING_MAX: 120,
    DEBUG_TAIL_LINES: 18,
    ENT_MIN_REQ_TO: 2500,
    ENT_MIN_TTL: 30,
    ENT_MAX_TTL: 3600
});

// ===== 模块参数默认表（需与 #!arguments 一致）=====
const ARG_DEFAULTS = Object.freeze({
    Update: "10",
    Timeout: "25",
    MASK_IP: "1",
    MASK_POS: "1",
    IPv6: "0",
    DOMESTIC_IPv4: "ipip",
    DOMESTIC_IPv6: "ddnspod",
    LANDING_IPv4: "ipapi",
    LANDING_IPv6: "ipsb",
    TW_FLAG_MODE: "1",
    IconPreset: "globe",
    Icon: "globe.asia.australia",
    IconColor: "#1E90FF",
    SD_STYLE: "icon",
    SD_SHOW_LAT: "1",
    SD_SHOW_HTTP: "1",
    SD_LANG: "zh-Hans",
    SD_TIMEOUT_MS: "0",
    SD_REGION_MODE: "full",
    SD_ICON_THEME: "check",
    SD_ARROW: "1",
    SERVICES: "[]",
    LOG: "0",
    LOG_LEVEL: "info",
    LOG_TO_PANEL: "0",
    LOG_PUSH: "1",
    ST_SUBTITLE_STYLE: "line",
    ST_SUBTITLE_MINIMAL: "0",
    ST_GAP_LINES: "1"
});

/* ===== 语言字典（固定 UI 词收口）===== */
const SD_STR = {
    "zh-Hans": {
        panelTitle: "网络信息 𝕏",
        wifi: "Wi-Fi",
        cellular: "蜂窝网络",
        unknownNet: "网络 | 未知",
        gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
        policy: "代理策略",
        ip: "IP",
        entrance: "入口",
        landingIP: "落地 IP",
        location: "位置",
        isp: "运营商",
        runAt: "执行时间",
        region: "区域",
        unlocked: "已解锁",
        partialUnlocked: "部分解锁",
        notReachable: "不可达",
        timeout: "超时",
        fail: "检测失败",
        regionBlocked: "区域受限",
        nfFull: "已完整解锁",
        nfOriginals: "仅解锁自制剧",
        debug: "调试"
    },
    "zh-Hant": {
        panelTitle: "網路資訊 𝕏",
        wifi: "Wi-Fi",
        cellular: "行動服務",
        unknownNet: "網路 | 未知",
        gen: (g, r) => `${g ? `${g} - ${r}` : r}`,
        policy: "代理策略",
        ip: "IP",
        entrance: "入口",
        landingIP: "落地 IP",
        location: "位置",
        isp: "運營商",
        runAt: "執行時間",
        region: "區域",
        unlocked: "已解鎖",
        partialUnlocked: "部分解鎖",
        notReachable: "不可達",
        timeout: "逾時",
        fail: "檢測失敗",
        regionBlocked: "區域受限",
        nfFull: "已完整解鎖",
        nfOriginals: "僅解鎖自製劇",
        debug: "除錯"
    }
};

/** 取词工具 */
function t(key, ...args) {
    const lang = (typeof SD_LANG === "string" ? SD_LANG : "zh-Hans");
    const pack = SD_STR[lang] || SD_STR["zh-Hans"];
    const v = pack[key];
    if (typeof v === "function") return v(...args);
    return v != null ? v : key;
}

// ====================== 运行环境适配层 ======================
const readKV = (k) => {
    if (typeof $persistentStore !== 'undefined' && $persistentStore.read) {
        return $persistentStore.read(k);
    }
    if (typeof $prefs !== 'undefined' && $prefs.valueForKey) {
        return $prefs.valueForKey(k);
    }
    try {
        return (typeof localStorage !== 'undefined') ? localStorage.getItem(k) : null;
    } catch (_) {
        return null;
    }
};

/** 解析 $argument（支持字符串或对象） */
const parseArgs = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        return raw.split('&').reduce((acc, kv) => {
            if (!kv) return acc;
            const [k, v = ''] = kv.split('=');
            const key = decodeURIComponent(k || '');
            acc[key] = decodeURIComponent(String(v).replace(/\+/g, '%20'));
            return acc;
        }, {});
    }
    return {};
};
const $args = parseArgs(typeof $argument !== 'undefined' ? $argument : undefined);

/** 当 $args 对象无值时，从原始字符串兜底读取 */
function readArgRaw(name) {
    try {
        if (typeof $argument === 'string') {
            const re = new RegExp(`(?:^|&)${name}=([^&]*)`);
            const m = $argument.match(re);
            if (m) return decodeURIComponent(String(m[1]).replace(/\+/g, '%20'));
        }
    } catch (_) {
    }
    return undefined;
}

// ====================== 小工具（类型/拼接/格式） ======================
const toBool = (v, d = false) => {
    if (v == null || v === '') return d;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'y'].includes(s)) return true;
    if (['0', 'false', 'off', 'no', 'n'].includes(s)) return false;
    return d;
};

const toNum = (v, d) => {
    if (v == null || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

const K = (s) => `NetworkInfo_${s}`;

const joinNonEmpty = (arr, sep = ' ') => arr.filter(Boolean).join(sep);

/** 优先：本次模块参数 > BoxJS > 代码默认 */
function getArgRaw(name) {
    if (!$args) return undefined;
    if (Object.prototype.hasOwnProperty.call($args, name)) {
        const v = $args[name];
        // 空串视为“未填”，给 BoxJS / 默认机会
        if (v === '' || v == null) return undefined;
        return String(v);
    }
    return undefined;
}

function getKVRaw(name) {
    const v = readKV(K(name));
    if (v === undefined || v === null || v === '') return undefined;
    return String(v);
}

/**
 * names: 单个键名字符串 或 键名数组（支持新旧命名兼容）
 * fallback: 代码默认字符串（仅当两边都没值时使用）
 */
function pickRaw(names, fallback) {
    const keys = Array.isArray(names) ? names : [names];

    // 1) 模块参数（本次运行传进来的）
    for (const k of keys) {
        const v = getArgRaw(k);
        if (v !== undefined) return v;
    }
    // 2) BoxJS（NetworkInfo_*）
    for (const k of keys) {
        const v = getKVRaw(k);
        if (v !== undefined) return v;
    }
    // 3) 代码默认
    return fallback;
}

function pickStr(names, fallback) {
    const v = pickRaw(names, undefined);
    if (v === undefined) return fallback;
    return String(v);
}

function pickNum(names, fallback) {
    const v = pickRaw(names, undefined);
    if (v === undefined) return fallback;
    return toNum(v, fallback);
}

function pickBool(names, fallback) {
    const v = pickRaw(names, undefined);
    return toBool(v, fallback);
}

// ====================== 预读基础配置 ======================
const UPDATE = pickNum('Update', 10);   // 刷新间隔
const TIMEOUT = pickNum('Timeout', 8);  // 主脚本超时

// ====================== 日志系统 ======================
const LOG_ON = pickBool('LOG', false);
const LOG_TO_PANEL = pickBool('LOG_TO_PANEL', false);
const LOG_PUSH = pickBool('LOG_PUSH', true);
const LOG_LEVEL = pickStr('LOG_LEVEL', 'info').toString().toLowerCase();

const LOG_LEVELS = {debug: 10, info: 20, warn: 30, error: 40};
const LOG_THRESH = LOG_LEVELS[LOG_LEVEL] ?? 20;
const DEBUG_LINES = [];

function _maskMaybe(ip) {
    if (!ip) return '';
    if (!MASK_IP) return ip;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
        const p = ip.split('.');
        return `${p[0]}.${p[1]}.*.*`;
    }
    if (/:/.test(ip)) {
        const p = ip.split(':');
        return joinNonEmpty([...p.slice(0, 4), '*', '*', '*', '*'], ':');
    }
    return ip;
}

function log(level, ...args) {
    if (!LOG_ON) return;
    const L = LOG_LEVELS[level] ?? 20;
    if (L < LOG_THRESH) return;
    const msg = args.map((x) => typeof x === 'string' ? x : JSON.stringify(x));
    const line = `[NI][${level.toUpperCase()}] ${msg.join(' ')}`;
    try {
        console.log(line);
    } catch (_) {
    }
    DEBUG_LINES.push(line);
    if (DEBUG_LINES.length > CONSTS.LOG_RING_MAX) DEBUG_LINES.shift();
}

function logErrPush(title, body) {
    if (LOG_PUSH) $notification?.post?.(title, "", body);
    log('error', title, body);
}

// ====================== 子标题样式（新键） ======================
const SUBTITLE_STYLES = Object.freeze({
    line: (s) => `——${s}——`,
    cnBracket: (s) => `【${s}】`,
    cnQuote: (s) => `「${s}」`,
    square: (s) => `[${s}]`,
    curly: (s) => `{${s}}`,
    angle: (s) => `《${s}》`,
    pipe: (s) => `║${s}║`,
    bullet: (s) => `·${s} ·`,
    plain: (s) => `${s}`,
});

function normalizeSubStyle(v) {
    const k = String(v ?? 'line').trim();
    return SUBTITLE_STYLES[k] ? k : 'line';
}

function makeSubTitleRenderer(styleKey, minimal = false) {
    const key = normalizeSubStyle(styleKey);
    const fn = SUBTITLE_STYLES[key] || SUBTITLE_STYLES.line;
    return minimal ? (s) => String(s) : (s) => fn(String(s));
}

/** 分组标题：插入留白 + 应用样式/纯净模式 */
function pushGroupTitle(parts, title) {
    for (let i = 0; i < CFG.GAP_LINES; i++) parts.push('');
    const render = makeSubTitleRenderer(CFG.SUBTITLE_STYLE, CFG.SUBTITLE_MINIMAL);
    parts.push(render(title));
}

// ====================== 统一配置对象（CFG.*） ======================
const CFG = {
    Update: UPDATE,
    Timeout: TIMEOUT,

    MASK_IP: pickBool('MASK_IP', true),
    // MASK_POS 默认“跟随 MASK_IP”：未显式设置时，跟 MASK_IP 保持一致
    MASK_POS: (() => {
        const raw = pickRaw('MASK_POS', undefined);
        if (raw === undefined) return pickBool('MASK_IP', true);
        return toBool(raw, true);
    })(),
    IPv6: pickBool('IPv6', false),

    DOMESTIC_IPv4: pickStr('DOMESTIC_IPv4', 'ipip'),
    DOMESTIC_IPv6: pickStr('DOMESTIC_IPv6', 'ddnspod'),
    LANDING_IPv4: pickStr('LANDING_IPv4', 'ipapi'),
    LANDING_IPv6: pickStr('LANDING_IPv6', 'ipsb'),

    TW_FLAG_MODE: pickNum('TW_FLAG_MODE', 1),

    // 图标预设 / 自定义
    IconPreset: pickStr('IconPreset', 'globe'),
    Icon: pickStr('Icon', 'globe.asia.australia'),
    IconColor: pickStr('IconColor', '#1E90FF'),

    // 服务检测参数
    SD_STYLE: pickStr('SD_STYLE', 'icon'),
    SD_SHOW_LAT: pickBool('SD_SHOW_LAT', true),
    SD_SHOW_HTTP: pickBool('SD_SHOW_HTTP', true),
    SD_LANG: pickStr('SD_LANG', 'zh-Hans'),

    SD_TIMEOUT_MS: (() => {
        // 0 或未填 => 跟随 Timeout×1000，最小 2000ms 的兜底在后面算
        const raw = pickRaw('SD_TIMEOUT_MS', undefined);
        const fallback = TIMEOUT * 1000;
        if (raw === undefined || raw === '' || raw === '0') return fallback;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    })(),

    SD_REGION_MODE: pickStr('SD_REGION_MODE', 'full'),
    SD_ICON_THEME: pickStr('SD_ICON_THEME', 'check'),
    SD_ARROW: pickBool('SD_ARROW', true),

    // —— 服务清单数据源（BoxJS 勾选 / 文本 / 模块 arguments）——
    SERVICES_BOX_CHECKED_RAW: (() => {
        const v = readKV(K('SERVICES'));
        if (v == null) return null;
        const s = String(v).trim();
        if (!s || s === '[]' || /^null$/i.test(s)) return null;
        return s;
    })(),
    SERVICES_BOX_TEXT: (() => {
        const v = readKV(K('SERVICES_TEXT'));
        return v != null ? String(v).trim() : '';
    })(),
    SERVICES_ARG_TEXT: (() => {
        let v = $args.SERVICES;
        if (Array.isArray(v)) return JSON.stringify(v);
        if (v == null || v === '') v = readArgRaw('SERVICES');
        return v != null ? String(v).trim() : '';
    })(),

    // —— 子标题（兼容新旧命名：优先 ST_*，其次 SUBTITLE_* / GAP_LINES）——
    SUBTITLE_STYLE: normalizeSubStyle(
        pickStr(['ST_SUBTITLE_STYLE', 'SUBTITLE_STYLE'], 'line').trim()
    ),
    SUBTITLE_MINIMAL: pickBool(['ST_SUBTITLE_MINIMAL', 'SUBTITLE_MINIMAL'], false),
    GAP_LINES: (() => {
        const n = pickNum(['ST_GAP_LINES', 'GAP_LINES'], 1);
        return Math.max(0, Math.min(2, n));
    })()
};

// ====================== 图标 & 开关映射 ======================
const ICON_PRESET_MAP = Object.freeze({
    wifi: 'wifi.router',
    globe: 'globe.asia.australia',
    dots: 'dot.radiowaves.left.and.right',
    antenna: 'antenna.radiowaves.left.and.right',
    point: 'point.3.connected.trianglepath.dotted'
});
const ICON_NAME = (CFG.Icon || '').trim() ||
    ICON_PRESET_MAP[String(CFG.IconPreset).trim()] || 'globe.asia.australia';
const ICON_COLOR = CFG.IconColor;

// 用户是否开启 v6 的“意愿”
const WANT_V6 = !!CFG.IPv6;
// —— IPv6 智能开关（仅当配置开启且本机确有 v6 才执行）——
const HAS_V6 = !!($network?.v6?.primaryAddress);
// 智能开关：用户开 + 设备真有 v6
const IPV6_EFF = WANT_V6 && HAS_V6;
// —— v6 端点更短的单次超时（避免卡住整段流程）——
const V6_TO = Math.min(
    Math.max(
        CONSTS.SD_MIN_TIMEOUT,
        Number.isFinite(Number(CFG.SD_TIMEOUT_MS))
            ? Number(CFG.SD_TIMEOUT_MS)
            : (TIMEOUT * 1000)
    ),
    2500
);

const MASK_IP = !!CFG.MASK_IP;
const MASK_POS = typeof CFG.MASK_POS === 'boolean' ? CFG.MASK_POS : !!CFG.MASK_IP;
const TW_FLAG_MODE = Number(CFG.TW_FLAG_MODE) || 0;

const DOMESTIC_IPv4 = CFG.DOMESTIC_IPv4;
const DOMESTIC_IPv6 = CFG.DOMESTIC_IPv6;
const LANDING_IPv4 = CFG.LANDING_IPv4;
const LANDING_IPv6 = CFG.LANDING_IPv6;

// ====================== 服务检测参数（派生） ======================
const SD_STYLE = (String(CFG.SD_STYLE).toLowerCase() === 'text') ? 'text' : 'icon';
const SD_SHOW_LAT = !!CFG.SD_SHOW_LAT;
const SD_SHOW_HTTP = !!CFG.SD_SHOW_HTTP;
const SD_LANG = (String(CFG.SD_LANG).toLowerCase() === 'zh-hant') ? 'zh-Hant' : 'zh-Hans';

const SD_TIMEOUT_MS = (() => {
    const v = Number(CFG.SD_TIMEOUT_MS);
    const fallback = TIMEOUT * 1000;
    const ms = Number.isFinite(v) ? v : fallback;
    return Math.max(CONSTS.SD_MIN_TIMEOUT, ms);
})();

const SD_REGION_MODE = ['full', 'abbr', 'flag'].includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : 'full';
const SD_ICON_THEME = ['lock', 'circle', 'check'].includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : 'check';
const SD_ARROW = !!CFG.SD_ARROW;

const SD_ICONS = (() => {
    switch (SD_ICON_THEME) {
        case 'lock':
            return {full: '🔓', partial: '🔐', blocked: '🔒'};
        case 'circle':
            return {full: '⭕️', partial: '⛔️', blocked: '🚫'};
        default:
            return {full: '✅', partial: '❇️', blocked: '❎'};
    }
})();

// ====================== 源常量 & 解析器（抽离） ======================

// 统一 JSON 解析（不会抛异常）
function safeJSON(s, d = {}) {
    try {
        return JSON.parse(s || '');
    } catch {
        return d;
    }
}

// 统一“是否已细到市/区”判断（DirectV4 优先策略用）
function hasCityLevel(loc) {
    if (!loc) return false;
    try {
        const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim();
        if (/市|区|縣|县|州|市辖/.test(s)) return true;
        const parts = s.split(/\s+/).filter(Boolean);
        return parts.length >= 3;
    } catch {
        return false;
    }
}

// —— 直连 IPv4 源：key -> { url, parse(resp) -> {ip, loc, isp} } ——
const DIRECT_V4_SOURCES = Object.freeze({
    ipip: {
        url: 'https://myip.ipip.net/json',
        parse: (r) => {
            const j = safeJSON(r.body, {});
            const loc = j?.data?.location || [];
            const c0 = loc[0];
            const flag = flagOf(c0 === '中国' ? 'CN' : c0);
            return {
                ip: j?.data?.ip || '',
                loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], ' ').replace(/\s*中国\s*/, ''),
                isp: loc[4] || ''
            };
        }
    },
    cip: {
        url: 'http://cip.cc/',
        parse: (r) => {
            const b = String(r.body || '');
            const ip = (b.match(/IP.*?:\s*(\S+)/) || [])[1] || '';
            const addr = (b.match(/地址.*?:\s*(.+)/) || [])[1] || '';
            const isp = (b.match(/运营商.*?:\s*(.+)/) || [])[1] || '';
            const isCN = /中国/.test(addr);
            return {
                ip,
                loc: joinNonEmpty([flagOf(isCN ? 'CN' : ''), addr.replace(/中国\s*/, '')], ' '),
                isp: isp.replace(/中国\s*/, '')
            };
        }
    },
    '163': {
        url: 'https://dashi.163.com/fgw/mailsrv-ipdetail/detail',
        parse: (r) => {
            const d = safeJSON(r.body, {})?.result || {};
            return {
                ip: d.ip || '',
                loc: joinNonEmpty([flagOf(d.countryCode), d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                isp: d.isp || d.org || ''
            };
        }
    },
    bilibili: {
        url: 'https://api.bilibili.com/x/web-interface/zone',
        parse: (r) => {
            const d = safeJSON(r.body, {})?.data || {};
            const flag = flagOf(d.country === '中国' ? 'CN' : d.country);
            return {
                ip: d.addr || '',
                loc: joinNonEmpty([flag, d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                isp: d.isp || ''
            };
        }
    },
    '126': {
        url: 'https://ipservice.ws.126.net/locate/api/getLocByIp',
        parse: (r) => {
            const d = safeJSON(r.body, {})?.result || {};
            return {
                ip: d.ip || '',
                loc: joinNonEmpty([flagOf(d.countrySymbol), d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                isp: d.operator || ''
            };
        }
    },
    pingan: {
        url: 'https://rmb.pingan.com.cn/itam/mas/linden/ip/request',
        parse: (r) => {
            const d = safeJSON(r.body, {})?.data || {};
            return {
                ip: d.ip || '',
                loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], ' ').replace(/\s*中国\s*/, ''),
                isp: d.isp || ''
            };
        }
    }
});

// —— v4-only 兜底（直连 IPv4 偶发返回 v6 时使用）——
const DIRECT_V4_FALLBACK = {
    url: 'https://api-ipv4.ip.sb/geoip',
    parse: (r) => {
        const j = safeJSON(r.body, {});
        return {
            ip: j.ip || '',
            loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
            isp: j.isp || j.organization || ''
        };
    }
};

// —— 落地 IPv4 源 ——
const LANDING_V4_SOURCES = Object.freeze({
    ipapi: {
        url: 'http://ip-api.com/json?lang=zh-CN',
        parse: (r) => {
            const j = safeJSON(r.body, {});
            return {
                ip: j.query || '',
                loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ''), j.regionName?.split(/\s+or\s+/)[0], j.city], ' '),
                isp: j.isp || j.org || ''
            };
        }
    },
    ipwhois: {
        url: 'https://ipwhois.app/widget.php?lang=zh-CN',
        parse: (r) => {
            const j = safeJSON(r.body, {});
            return {
                ip: j.ip || '',
                loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ''), j.region, j.city], ' '),
                isp: (j?.connection?.isp) || ''
            };
        }
    },
    ipsb: {
        url: 'https://api-ipv4.ip.sb/geoip',
        parse: (r) => {
            const j = safeJSON(r.body, {});
            return {
                ip: j.ip || '',
                loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
                isp: j.isp || j.organization || ''
            };
        }
    }
});

// —— 仅取 IP 的 IPv6 端点（直连/落地复用）——
const IPV6_IP_ENDPOINTS = Object.freeze({
    ddnspod: 'https://ipv6.ddnspod.com',
    neu6: 'https://speed.neu6.edu.cn/getIP.php',
    ipsb: 'https://api-ipv6.ip.sb/ip',
    ident: 'https://v6.ident.me',
    ipify: 'https://api6.ipify.org'
});

// —— 默认尝试顺序（集中管理）——
const ORDER = Object.freeze({
    directV4: ['cip', '163', '126', 'bilibili', 'pingan', 'ipip'],
    landingV4: ['ipapi', 'ipwhois', 'ipsb'],
    directV6: ['ddnspod', 'neu6'],
    landingV6: ['ipsb', 'ident', 'ipify']
});

// 统一：首选 + 回退列表 生成（并去重）
function makeTryOrder(prefer, fallbackList) {
    return [prefer, ...fallbackList].filter((x, i, a) => x && a.indexOf(x) === i);
}

// ====================== 启动日志 ======================
log('info', 'Start', JSON.stringify({
    Update: CFG.Update,
    Timeout: CFG.Timeout,
    IPv6: IPV6_EFF,
    WANT_V6: WANT_V6,
    HAS_V6: HAS_V6,
    SD_TIMEOUT_MS,
    SD_STYLE,
    SD_REGION_MODE,
    TW_FLAG_MODE,
    SUBTITLE_STYLE: CFG.SUBTITLE_STYLE,
    SUBTITLE_MINIMAL: CFG.SUBTITLE_MINIMAL,
    GAP_LINES: CFG.GAP_LINES
}));

// ====================== 主流程（IIFE） ======================
;(async () => {
    const preTouch = touchLandingOnceQuick().catch(() => {
    });

    const t0 = Date.now();
    const [cn, cn6] = await Promise.all([
        getDirectV4(DOMESTIC_IPv4).catch((e) => {
            log('warn', 'DirectV4', String(e));
            return {};
        }),
        IPV6_EFF ? getDirectV6(DOMESTIC_IPv6).catch((e) => {
            log('warn', 'DirectV6', String(e));
            return {};
        }) : Promise.resolve({})
    ]);
    log('info', 'Direct fetched', (Date.now() - t0) + 'ms', {
        v4: _maskMaybe(cn.ip || ''),
        v6: _maskMaybe(cn6.ip || '')
    });

    await preTouch;

    const t1 = Date.now();
    const {policyName, entrance4, entrance6} = await getPolicyAndEntranceBoth();
    log('info', 'EntranceBoth', {
        policy: policyName || '-',
        v4: _maskMaybe(entrance4 || ''),
        v6: _maskMaybe(entrance6 || ''),
        cost: (Date.now() - t1) + 'ms'
    });

    const ent4 = isIP(entrance4 || '')
        ? await getEntranceBundle(entrance4).catch((e) => {
            log('warn', 'EntranceBundle v4', String(e));
            return {ip: entrance4};
        })
        : {};
    const ent6 = isIP(entrance6 || '')
        ? await getEntranceBundle(entrance6).catch((e) => {
            log('warn', 'EntranceBundle v6', String(e));
            return {ip: entrance6};
        })
        : {};

    const t2 = Date.now();
    const [px, px6] = await Promise.all([
        getLandingV4(LANDING_IPv4).catch((e) => {
            log('warn', 'LandingV4', String(e));
            return {};
        }),
        IPV6_EFF ? getLandingV6(LANDING_IPv6).catch((e) => {
            log('warn', 'LandingV6', String(e));
            return {};
        }) : Promise.resolve({})
    ]);
    log('info', 'Landing fetched', (Date.now() - t2) + 'ms', {
        v4: _maskMaybe(px.ip || ''),
        v6: _maskMaybe(px6.ip || '')
    });

    log('info', '$network peek', JSON.stringify({
        wifi: $network?.wifi,
        cellular: $network?.cellular || $network?.['cellular-data'],
        v4: $network?.v4,
        v6: $network?.v6,
    }));
    const trial = netTypeLine() || '';
    const title = /未知|unknown/i.test(trial) ? buildNetTitleHard() : trial;

    // 组装渲染
    const parts = [];
    parts.push(`${t('runAt')}: ${now()}`);
    parts.push(`${t('policy')}: ${policyName || '-'}`);

    // 本地（类型守卫）
    pushGroupTitle(parts, '本地');
    const directIPv4 = (cn.ip && isIPv4(cn.ip)) ? ipLine('IPv4', cn.ip) : null;
    const directIPv6 = (cn6.ip && isIPv6(cn6.ip)) ? ipLine('IPv6', cn6.ip) : null;
    if (directIPv4) parts.push(directIPv4);
    if (directIPv6) parts.push(directIPv6);
    const directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : '-';
    parts.push(`${t('location')}: ${directLoc}`);
    if (cn.isp) parts.push(`${t('isp')}: ${fmtISP(cn.isp, cn.loc)}`);

    // 入口（类型守卫）
    if ((ent4 && (ent4.ip || ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2)) || (ent6 && ent6.ip)) {
        pushGroupTitle(parts, '入口');
        const entIPv4 = (ent4.ip && isIPv4(ent4.ip)) ? ipLine('IPv4', ent4.ip) : null;
        const entIPv6 = (ent6.ip && isIPv6(ent6.ip)) ? ipLine('IPv6', ent6.ip) : null;
        if (entIPv4) parts.push(entIPv4);
        if (entIPv6) parts.push(entIPv6);
        if (ent4.loc1) parts.push(`${t('location')}¹: ${flagFirst(ent4.loc1)}`);
        if (ent4.isp1) parts.push(`${t('isp')}¹: ${fmtISP(ent4.isp1, ent4.loc1)}`);
        if (ent4.loc2) parts.push(`${t('location')}²: ${flagFirst(ent4.loc2)}`);
        if (ent4.isp2) parts.push(`${t('isp')}²: ${String(ent4.isp2).trim()}`);
    }

    // 落地（类型守卫）
    if (px.ip || px6.ip || px.loc || px.isp) {
        pushGroupTitle(parts, '落地');
        const landIPv4 = (px.ip && isIPv4(px.ip)) ? ipLine('IPv4', px.ip) : null;
        const landIPv6 = (px6.ip && isIPv6(px6.ip)) ? ipLine('IPv6', px6.ip) : null;
        if (landIPv4) parts.push(landIPv4);
        if (landIPv6) parts.push(landIPv6);
        if (px.loc) parts.push(`${t('location')}: ${flagFirst(px.loc)}`);
        if (px.isp) parts.push(`${t('isp')}: ${fmtISP(px.isp, px.loc)}`);
    }

    // 服务检测
    const sdLines = await runServiceChecks();
    if (sdLines.length) {
        pushGroupTitle(parts, '服务检测');
        parts.push(...sdLines);
    }

    // 调试尾巴（可选）
    if (LOG_TO_PANEL && DEBUG_LINES.length) {
        pushGroupTitle(parts, t('debug'));
        const tail = DEBUG_LINES.slice(-CONSTS.DEBUG_TAIL_LINES).join('\n');
        parts.push(tail);
    }

    const content = maybeTify(parts.join('\n'));
    $done({title: maybeTify(title), content, icon: ICON_NAME, 'icon-color': ICON_COLOR});

})().catch((err) => {
    const msg = String(err);
    logErrPush(t('panelTitle'), msg);
    const errTitle = t('panelTitle');
    const errBody = maybeTify(msg);
    $done({title: errTitle, content: errBody, icon: ICON_NAME, 'icon-color': ICON_COLOR});
});

// ====================== 工具 & 渲染 ======================
const IPV4_RE = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6_SRC = [
    '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|',
    '([0-9a-fA-F]{1,4}:){1,7}:|',
    '([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|',
    '([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|',
    '([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|',
    '([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|',
    '([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|',
    '[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|',
    ':((:[0-9a-fA-F]{1,4}){1,7}|:)|',
    '::(ffff(:0{1,4}){0,1}:){0,1}(',
    '(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}',
    '(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|',
    '([0-9a-fA-F]{1,4}:){1,4}:(',
    '(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}',
    '(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))'
].join('');
const IPV6_RE = new RegExp(`^${IPV6_SRC}$`);

function now() {
    return new Date().toTimeString().split(' ')[0];
}

function isIPv4(ip) {
    return IPV4_RE.test(ip || '');
}

function isIPv6(ip) {
    return IPV6_RE.test(ip || '');
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}

function maskIP(ip) {
    if (!ip || !MASK_IP) return ip || '';
    if (isIPv4(ip)) {
        const p = ip.split('.');
        return [p[0], p[1], '*', '*'].join('.');
    }
    if (isIPv6(ip)) {
        const p = ip.split(':');
        return [...p.slice(0, 4), '*', '*', '*', '*'].join(':');
    }
    return ip;
}

function ipLine(label, ip) {
    return ip ? `${label}: ${maskIP(ip)}` : null;
}

function splitFlagRaw(s) {
    const re = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;
    const m = String(s || '').match(re);
    let flag = m ? m[0] : '';
    const text = String(s || '').replace(re, '');
    if (flag.includes('🇹🇼')) {
        if (TW_FLAG_MODE === 0) flag = '🇨🇳';
        else if (TW_FLAG_MODE === 2) flag = '🇼🇸';
    }
    return {flag, text};
}

const onlyFlag = (loc) => splitFlagRaw(loc).flag || '-';
const flagFirst = (loc) => {
    const {flag, text} = splitFlagRaw(loc);
    return (flag || '') + (text || '');
};

function flagOf(code) {
    let cc = String(code || '').trim();
    if (!cc) return '';
    if (/^中国$|^CN$/i.test(cc)) cc = 'CN';
    if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return '';
    try {
        if (cc.toUpperCase() === 'TW') {
            if (TW_FLAG_MODE === 0) return '🇨🇳';
            if (TW_FLAG_MODE === 2) return '🇼🇸';
        }
        return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt()));
    } catch (_) {
        return '';
    }
}

function fmtISP(isp, locStr) {
    const raw = String(isp || '').trim();
    if (!raw) return '';
    const txt = String(locStr || '');
    const isMainland = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt);
    if (!isMainland) return raw;

    const norm = raw.replace(/\s*\(中国\)\s*/, '').replace(/\s+/g, ' ').trim();
    const s = norm.toLowerCase();
    if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return '中国移动';
    if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return '中国电信';
    if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return '中国联通';
    if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return '中国广电';
    if ((/cernet|china\s*education/).test(s) || /教育网/.test(norm)) return '中国教育网';
    if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
    return raw;
}

function radioToGen(r) {
    if (!r) return '';
    const x = String(r).toUpperCase().replace(/\s+/g, '');
    const alias = {'NR5G': 'NR', 'NRSA': 'NR', 'NRNSA': 'NRNSA', 'LTEA': 'LTE', 'LTE+': 'LTE', 'LTEPLUS': 'LTE'};
    const k = alias[x] || x;
    const MAP = {
        GPRS: '2.5G',
        EDGE: '2.75G',
        CDMA1X: '2.5G',
        WCDMA: '3G',
        HSDPA: '3.5G',
        HSUPA: '3.75G',
        CDMAEVD0REV0: '3.5G',
        CDMAEVD0REVA: '3.5G',
        CDMAEVD0REVB: '3.75G',
        EHRPD: '3.9G',
        LTE: '4G',
        NRNSA: '5G',
        NR: '5G'
    };
    return MAP[k] || '';
}

function netTypeLine() {
    try {
        const n = $network || {};
        const ssid = n.wifi?.ssid;
        const bssid = n.wifi?.bssid;

        if (ssid || bssid) return `${t('wifi')} | ${ssid || '-'}`;

        const radio = (n.cellular?.radio) || (n['cellular-data']?.radio);
        if (radio) return `${t('cellular')} | ${t('gen', radioToGen(radio), radio)}`;

        const iface = n.v4?.primaryInterface || n.v6?.primaryInterface || '';
        if (/^pdp/i.test(iface)) return `${t('cellular')} | -`;
        if (/^(en|eth|wlan)/i.test(iface)) return `${t('wifi')} | -`;
    } catch (_) {
    }
    log('info', 'netType detect', JSON.stringify({
        ssid: $network?.wifi?.ssid,
        radio: $network?.cellular?.radio || $network?.['cellular-data']?.radio,
        iface4: $network?.v4?.primaryInterface,
        iface6: $network?.v6?.primaryInterface
    }));
    return t('unknownNet');
}

function buildNetTitleHard() {
    const n = $network || {};
    const ssid = n.wifi && (n.wifi.ssid || n.wifi.bssid);
    const radio = (n.cellular && n.cellular.radio) || (n['cellular-data'] && n['cellular-data'].radio) || '';
    const iface = (n.v4 && n.v4.primaryInterface) || (n.v6 && n.v6.primaryInterface) || '';

    if (ssid) return `${t('wifi')} | ${n.wifi.ssid || '-'}`;
    if (radio) return `${t('cellular')} | ${t('gen', radioToGen(radio), radio)}`;
    if (/^pdp/i.test(iface)) return `${t('cellular')} | -`;
    if (/^(en|eth|wlan)/i.test(iface)) return `${t('wifi')} | -`;
    return t('unknownNet');
}

// ====================== HTTP 基础 ======================
function httpGet(url, headers = {}, timeoutMs = null, followRedirect = false) {
    return new Promise((resolve, reject) => {
        const req = {url, headers};
        if (timeoutMs != null) req.timeout = timeoutMs;
        if (followRedirect) req.followRedirect = true;
        const start = Date.now();
        $httpClient.get(req, (err, resp, body) => {
            const cost = Date.now() - start;
            if (err) {
                log('warn', 'HTTP GET fail', url, 'cost', cost + 'ms', String(err));
                return reject(err);
            }
            const status = resp?.status || resp?.statusCode;
            log('debug', 'HTTP GET', url, 'status', status, 'cost', cost + 'ms');
            resolve({status, headers: resp?.headers || {}, body});
        });
    });
}

function httpAPI(path = '/v1/requests/recent') {
    return new Promise((res) => {
        if (typeof $httpAPI === 'function') {
            $httpAPI('GET', path, null, (x) => {
                log('debug', 'httpAPI', path, 'ok');
                res(x);
            });
        } else {
            log('warn', 'httpAPI not available');
            res({});
        }
    });
}

// ====================== 统一抓取器（减少重复） ======================
async function trySources(order, sourceMap, {preferLogTag, needCityPrefer = false}) {
    log('info', `${preferLogTag} begin`, JSON.stringify(order));
    let firstOK = null;

    for (const key of order) {
        const def = sourceMap[key];
        if (!def) {
            log('warn', `${preferLogTag} missing def`, key);
            continue;
        }

        const t0 = Date.now();
        try {
            const r = await httpGet(def.url);
            const res = def.parse(r) || {};
            const ok = !!res.ip;
            const cityOK = ok && hasCityLevel(res.loc);
            const cost = Date.now() - t0;

            log('debug', `${preferLogTag} try`, JSON.stringify({
                key, ok, cityOK, ip: _maskMaybe(res.ip || ''), loc: res.loc || '', isp: res.isp || '', cost_ms: cost
            }));

            if (ok && !firstOK) firstOK = res;
            if (!needCityPrefer && ok) return res;
            if (needCityPrefer && ok && cityOK) {
                log('info', `${preferLogTag} HIT city-level at`, key, 'cost', cost + 'ms');
                return res;
            }
        } catch (e) {
            const cost = Date.now() - t0;
            log('warn', `${preferLogTag} fail`, key, 'cost', cost + 'ms', String(e));
        }
    }

    if (firstOK) {
        log('info', `${preferLogTag} fallback to firstOK (no city-level hit)`, JSON.stringify({
            ip: _maskMaybe(firstOK.ip || ''), loc: firstOK.loc || '', isp: firstOK.isp || ''
        }));
        return firstOK;
    }
    return {};
}

async function tryIPv6Ip(order) {
    for (const key of order) {
        const url = IPV6_IP_ENDPOINTS[key];
        if (!url) continue;
        try {
            const r = await httpGet(url, {}, V6_TO /* 短超时 */);
            const ip = String(r.body || '').trim();
            if (ip) return {ip};
        } catch (e) {
            log('warn', 'IPv6 endpoint fail', key, String(e));
        }
    }
    return {};
}

/* ===== 四个对外接口（签名保持一致） ===== */
async function getDirectV4(preferKey) {
    const order = makeTryOrder(preferKey, ORDER.directV4);
    let res = await trySources(order, DIRECT_V4_SOURCES, {
        preferLogTag: 'DirectV4', needCityPrefer: true
    });

    if (!res || !res.ip) {
        try {
            log('warn', 'DirectV4 all failed, final ipip fallback');
            const r = await httpGet(DIRECT_V4_SOURCES.ipip.url);
            res = DIRECT_V4_SOURCES.ipip.parse(r) || {};
        } catch (e2) {
            log('error', 'DirectV4 ipip final fail', String(e2));
            return {};
        }
    }

    // 纠偏：若不是 IPv4，再走一次 v4-only 端点
    if (res.ip && !isIPv4(res.ip)) {
        log('warn', 'DirectV4 returned non-IPv4, refetch via v4-only fallback', _maskMaybe(res.ip));
        try {
            const r = await httpGet(DIRECT_V4_FALLBACK.url);
            const fix = DIRECT_V4_FALLBACK.parse(r) || {};
            if (isIPv4(fix.ip)) {
                res = fix;
                log('info', 'DirectV4 corrected by v4-only fallback', _maskMaybe(res.ip));
            } else {
                log('warn', 'v4-only fallback did not return IPv4');
                res.ip = ''; // 交给渲染层类型守卫不渲染
            }
        } catch (e) {
            log('warn', 'DirectV4 v4-only fallback fail', String(e));
            res.ip = '';
        }
    }
    return res;
}

async function getDirectV6(preferKey) {
    const order = makeTryOrder(preferKey, ORDER.directV6);
    const res = await tryIPv6Ip(order);
    if (!res || !res.ip) log('warn', 'DirectV6 fail (all)');
    return res || {};
}

async function getLandingV4(preferKey) {
    const order = makeTryOrder(preferKey, ORDER.landingV4);
    const res = await trySources(order, LANDING_V4_SOURCES, {
        preferLogTag: 'LandingV4', needCityPrefer: false
    });
    if (res && res.ip) return res;

    // 兜底：按“非 prefer”的其余源再跑一轮（避免原地重复）
    const alt = ORDER.landingV4.filter(k => k !== preferKey);
    for (const k of alt) {
        try {
            const def = LANDING_V4_SOURCES[k];
            if (!def) continue;
            const r = await httpGet(def.url);
            const out = def.parse(r) || {};
            if (out.ip) {
                log('info', 'LandingV4 final fallback HIT', k);
                return out;
            }
        } catch (_) {
        }
    }
    log('error', 'LandingV4 all sources failed');
    return {};
}

async function getLandingV6(preferKey) {
    const order = makeTryOrder(preferKey, ORDER.landingV6);
    const res = await tryIPv6Ip(order);
    if (!res || !res.ip) log('warn', 'LandingV6 fail (all)');
    return res || {};
}

// ====================== 入口/策略（稳态获取） ======================
const ENT_SOURCES_RE = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org|ifconfig\.co)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractIP(str) {
    const s = String(str || '').replace(/\(Proxy\)/i, '').trim();
    let m = s.match(/\[([0-9a-fA-F:]+)]/);
    if (m && isIPv6(m[1])) return m[1];
    m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (m && isIPv4(m[1])) return m[1];
    m = s.match(/([0-9a-fA-F:]{2,})/);
    if (m && isIPv6(m[1])) return m[1];
    return '';
}

async function touchLandingOnceQuick() {
    try {
        await httpGet('http://ip-api.com/json?lang=zh-CN', {}, CONSTS.PRETOUCH_TO_MS, true);
    } catch (_) {
    }
    if (IPV6_EFF) {
        try {
            await httpGet('https://api-ipv6.ip.sb/ip', {}, Math.min(CONSTS.PRETOUCH_TO_MS, V6_TO), true);
        } catch (_) {
        }
    }
    log('debug', 'Pre-touch landing endpoints done');
}

async function getPolicyAndEntranceBoth() {
    const data = await httpAPI('/v1/requests/recent');
    const reqs = Array.isArray(data?.requests) ? data.requests : [];
    const hits = reqs.slice(0, CONSTS.MAX_RECENT_REQ).filter((i) => ENT_SOURCES_RE.test(i.URL || ''));

    let policy = '';
    let ip4 = '', ip6 = '';
    for (const i of hits) {
        if (!policy && i.policyName) policy = i.policyName;
        const ip = extractIP(i.remoteAddress || '');
        if (!ip) continue;
        if (isIPv6(ip)) {
            if (!ip6) ip6 = ip;
        } else if (isIPv4(ip)) {
            if (!ip4) ip4 = ip;
        }
        if (policy && ip4 && ip6) break;
    }

    if (!policy && !ip4 && !ip6) {
        const d = await httpAPI('/v1/requests/recent');
        const rs = Array.isArray(d?.requests) ? d.requests : [];
        const hit = rs.find((i) => /\(Proxy\)/.test(i.remoteAddress || '') && i.policyName);
        if (hit) {
            policy = hit.policyName;
            const eip = extractIP(hit.remoteAddress);
            if (eip) (isIPv6(eip) ? (ip6 = eip) : (ip4 = eip));
        }
    }
    log('debug', 'Policy/Entrance candidates', {policy, v4: _maskMaybe(ip4), v6: _maskMaybe(ip6), hits: hits.length});
    return {policyName: policy, entrance4: ip4, entrance6: ip6};
}

// —— 入口位置缓存（跟 Update 联动） ——
const ENT_REQ_TO = Math.max(CONSTS.ENT_MIN_REQ_TO, (Number(CFG.SD_TIMEOUT_MS) || (Number(CFG.Timeout) || 8) * 1000));
const ENT_TTL_SEC = Math.max(CONSTS.ENT_MIN_TTL, Math.min(Number(CFG.Update) || 10, CONSTS.ENT_MAX_TTL));
let ENT_CACHE = {ip: "", t: 0, data: null};

async function withRetry(fn, retry = 1, delay = CONSTS.RETRY_DELAY_MS) {
    try {
        return await fn();
    } catch (_) {
    }
    for (let i = 0; i < retry; i++) {
        await sleep(delay * (i + 1));
        try {
            return await fn();
        } catch (_) {
        }
    }
    throw 'retry-fail';
}

/* ===== 入口定位：表驱动链（平安 + 链） ===== */
const ENT_LOC_CHAIN = Object.freeze({
    pingan: async (ip) => {
        const r = await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=' + encodeURIComponent(ip), {}, ENT_REQ_TO);
        const d = safeJSON(r.body, {})?.data || {};
        if (!d || (!d.countryIsoCode && !d.country)) throw 'pingan-empty';
        return {
            loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], ' ').replace(/\s*中国\s*/, ''),
            isp: d.isp || ''
        };
    },
    ipapi: async (ip) => {
        const r = await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, ENT_REQ_TO);
        const j = safeJSON(r.body, {});
        if (j.status && j.status !== 'success') throw 'ipapi-fail';
        return {
            loc: joinNonEmpty([flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/, ''), j.regionName?.split(/\s+or\s+/)[0], j.city], ' '),
            isp: j.isp || j.org || j.as || ''
        };
    },
    ipwhois: async (ip) => {
        const r = await httpGet(`https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`, {}, ENT_REQ_TO);
        const j = safeJSON(r.body, {});
        if (j.success === false || (!j.country && !j.country_code)) throw 'ipwhois-fail';
        return {
            loc: joinNonEmpty([flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ''), j.region, j.city], ' '),
            isp: (j.connection && j.connection.isp) || j.org || ''
        };
    },
    ipsb: async (ip) => {
        const r = await httpGet(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {}, ENT_REQ_TO);
        const j = safeJSON(r.body, {});
        if (!j || (!j.country && !j.country_code)) throw 'ipsb-fail';
        return {
            loc: joinNonEmpty([flagOf(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
            isp: j.isp || j.organization || ''
        };
    }
});

// 先平安，再链（ipapi -> ipwhois -> ipsb）
async function loc_chain(ip) {
    try {
        return await withRetry(() => ENT_LOC_CHAIN.ipapi(ip), 1);
    } catch {
    }
    try {
        return await withRetry(() => ENT_LOC_CHAIN.ipwhois(ip), 1);
    } catch {
    }
    return await withRetry(() => ENT_LOC_CHAIN.ipsb(ip), 0);
}

async function getEntranceBundle(ip) {
    const nowT = Date.now();
    const fresh = (nowT - ENT_CACHE.t) < ENT_TTL_SEC * 1000;
    if (ENT_CACHE.ip === ip && fresh && ENT_CACHE.data) {
        const left = Math.max(0, ENT_TTL_SEC * 1000 - (nowT - ENT_CACHE.t));
        log('info', 'Entrance cache HIT', {ip: _maskMaybe(ip), ttl_ms_left: left});
        return ENT_CACHE.data;
    }
    if (ENT_CACHE.ip === ip && ENT_CACHE.data) {
        log('info', 'Entrance cache EXPIRED', {
            ip: _maskMaybe(ip),
            age_ms: (nowT - ENT_CACHE.t),
            ttl_ms: ENT_TTL_SEC * 1000
        });
    } else {
        log('info', 'Entrance cache MISS', {ip: _maskMaybe(ip)});
    }

    const t = Date.now();
    const [a, b] = await Promise.allSettled([withRetry(() => ENT_LOC_CHAIN.pingan(ip), 1), withRetry(() => loc_chain(ip), 1)]);
    log('debug', 'Entrance locate results', {pingan: a.status, chain: b.status, cost: (Date.now() - t) + 'ms'});

    const res = {
        ip,
        loc1: a.status === 'fulfilled' ? (a.value.loc || '') : '',
        isp1: a.status === 'fulfilled' ? (a.value.isp || '') : '',
        loc2: b.status === 'fulfilled' ? (b.value.loc || '') : '',
        isp2: b.status === 'fulfilled' ? (b.value.isp || '') : ''
    };
    ENT_CACHE = {ip, t: nowT, data: res};
    return res;
}

// ====================== 服务清单解析 & 检测 ======================
/** 服务名映射与测试函数注册（新增服务仅需添加别名与测试） */
const SD_I18N = ({
    "zh-Hans": {
        youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web",
        netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)",
        huluJP: "Hulu(日)", hbo: "Max(HBO)"
    },
    "zh-Hant": {
        youTube: "YouTube", chatgpt_app: "ChatGPT", chatgpt: "ChatGPT Web",
        netflix: "Netflix", disney: "Disney+", huluUS: "Hulu(美)",
        huluJP: "Hulu(日)", hbo: "Max(HBO)"
    }
})[SD_LANG];

const SD_TESTS_MAP = {
    youtube: () => sd_testYouTube(),
    netflix: () => sd_testNetflix(),
    disney: () => sd_testDisney(),
    chatgpt_web: () => sd_testChatGPTWeb(),
    chatgpt_app: () => sd_testChatGPTAppAPI(),
    hulu_us: () => sd_testHuluUS(),
    hulu_jp: () => sd_testHuluJP(),
    hbo: () => sd_testHBO()
};
const SD_DEFAULT_ORDER = Object.keys(SD_TESTS_MAP);

const SD_ALIAS = {
    yt: 'youtube', 'youtube': 'youtube', 'youtube premium': 'youtube', '油管': 'youtube',
    nf: 'netflix', 'netflix': 'netflix', '奈飞': 'netflix', '奈飛': 'netflix',
    'disney': 'disney', 'disney+': 'disney', '迪士尼': 'disney',
    'chatgpt': 'chatgpt_app', gpt: 'chatgpt_app', openai: 'chatgpt_app',
    'chatgpt_web': 'chatgpt_web', 'chatgpt-web': 'chatgpt_web', 'chatgpt web': 'chatgpt_web',
    hulu: 'hulu_us', '葫芦': 'hulu_us', '葫蘆': 'hulu_us', huluus: 'hulu_us', hulujp: 'hulu_jp',
    hbo: 'hbo', max: 'hbo'
};

function parseServices(raw) {
    if (raw == null) return [];
    let s = String(raw).trim();
    if (!s || s === '[]' || s === '{}' || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
    try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return normSvcList(arr);
    } catch {
    }
    const parts = s.split(/[,\uFF0C;|\/ \t\r\n]+/);
    return normSvcList(parts);
}

function normSvcList(list) {
    const out = [];
    for (let x of list) {
        let k = String(x ?? '').trim().toLowerCase();
        if (!k) continue;
        k = SD_ALIAS[k] || k;
        if (!SD_TESTS_MAP[k]) continue;
        if (!out.includes(k)) out.push(k);
    }
    return out;
}

function selectServices() {
    const defArg = ARG_DEFAULTS.SERVICES || "[]";
    const argRaw = CFG.SERVICES_ARG_TEXT;
    const hasArgOverride = argRaw && argRaw !== defArg && !/^(\[\s*]|null)$/i.test(argRaw);

    // ① 模块参数显式改过（且非“空数组 []”）
    if (hasArgOverride) {
        const list = parseServices(argRaw);
        if (list.length > 0) {
            log("info", "Services: arguments", list);
            return list;
        }
    }

    // ② BoxJS 勾选 / 文本
    const hasCheckboxKey = CFG.SERVICES_BOX_CHECKED_RAW !== null;
    const candidates = hasCheckboxKey
        ? [
            ["BoxJS checkbox", CFG.SERVICES_BOX_CHECKED_RAW],
            ["BoxJS text", CFG.SERVICES_BOX_TEXT]
        ]
        : [
            ["BoxJS text", CFG.SERVICES_BOX_TEXT]
        ];

    for (const [label, raw] of candidates) {
        const list = parseServices(raw);
        if (list.length > 0) {
            log("info", `Services: ${label}`, list);
            return list;
        }
    }

    // ③ 默认全部
    log("info", "Services: default(all)");
    return SD_DEFAULT_ORDER.slice();
}

// ====================== 服务检测 HTTP 工具 ======================
const sd_now = () => Date.now();
const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = {"User-Agent": SD_UA, "Accept-Language": "en"};

function sd_httpGet(url, headers = {}, followRedirect = true) {
    return new Promise((resolve) => {
        const start = sd_now();
        $httpClient.get({
            url, headers: {...SD_BASE_HEADERS, ...headers},
            timeout: SD_TIMEOUT_MS, followRedirect
        }, (err, resp, data) => {
            const cost = sd_now() - start;
            if (err || !resp) {
                log('warn', 'sd_httpGet FAIL', url, 'cost', cost + 'ms', String(err || ''));
                return resolve({ok: false, status: 0, cost, headers: {}, data: ""});
            }
            const status = resp.status || resp.statusCode || 0;
            log('debug', 'sd_httpGet OK', url, 'status', status, 'cost', cost + 'ms');
            resolve({ok: true, status, cost, headers: resp.headers || {}, data: data || ""});
        });
    });
}

function sd_httpPost(url, headers = {}, body = "") {
    return new Promise((resolve) => {
        const start = sd_now();
        $httpClient.post({
            url, headers: {...SD_BASE_HEADERS, ...headers},
            timeout: SD_TIMEOUT_MS, body
        }, (err, resp, data) => {
            const cost = sd_now() - start;
            if (err || !resp) {
                log('warn', 'sd_httpPost FAIL', url, 'cost', cost + 'ms', String(err || ''));
                return resolve({ok: false, status: 0, cost, headers: {}, data: ""});
            }
            const status = resp.status || resp.statusCode || 0;
            log('debug', 'sd_httpPost OK', url, 'status', status, 'cost', cost + 'ms');
            resolve({ok: true, status, cost, headers: resp.headers || {}, data: data || ""});
        });
    });
}

// ====================== 台湾旗模式（服务检测渲染） ======================
function sd_flagFromCC(cc) {
    cc = (cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    if (cc === 'TW') {
        if (TW_FLAG_MODE === 0) return '🇨🇳';
        if (TW_FLAG_MODE === 2) return '🇼🇸';
    }
    try {
        const cps = [...cc].map((c) => 0x1F1E6 + (c.charCodeAt(0) - 65));
        return String.fromCodePoint(...cps);
    } catch {
        return '';
    }
}

const SD_CC_NAME = ({
    "zh-Hans": {
        CN: "中国", TW: "台湾", HK: "中国香港", MO: "中国澳门", JP: "日本", KR: "韩国", US: "美国",
        SG: "新加坡", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚",
        IN: "印度", AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", DE: "德国", FR: "法国",
        NL: "荷兰", ES: "西班牙", IT: "意大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄罗斯"
    },
    "zh-Hant": {
        CN: "中國", TW: "台灣", HK: "中國香港", MO: "中國澳門", JP: "日本", KR: "南韓", US: "美國",
        SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南", PH: "菲律賓", ID: "印尼",
        IN: "印度", AU: "澳洲", NZ: "紐西蘭", CA: "加拿大", GB: "英國", DE: "德國", FR: "法國",
        NL: "荷蘭", ES: "西班牙", IT: "義大利", BR: "巴西", AR: "阿根廷", MX: "墨西哥", RU: "俄羅斯"
    }
})[SD_LANG];

function sd_ccPretty(cc) {
    cc = (cc || '').toUpperCase();
    const flag = sd_flagFromCC(cc);
    const name = SD_CC_NAME[cc];
    if (!cc) return '—';
    if (SD_REGION_MODE === 'flag') return flag || '—';
    if (SD_REGION_MODE === 'abbr') return (flag || '') + cc;
    if (flag && name) return `${flag} ${cc} | ${name}`;
    if (flag) return `${flag} ${cc}`;
    return cc;
}

const isPartial = (tag) => /自制|自製|original/i.test(String(tag || '')) || /部分/i.test(String(tag || ''));

// ====================== 各服务检测 ======================
function sd_renderLine({name, ok, cc, cost, status, tag, state}) {
    const st = state ? state : (ok ? (isPartial(tag) ? 'partial' : 'full') : 'blocked');
    const icon = SD_ICONS[st];
    const regionChunk = cc ? sd_ccPretty(cc) : '';
    const regionText = regionChunk || '-';

    const unlockedShort = t('unlocked');
    const blockedText = t('notReachable');

    const isNetflix = /netflix/i.test(String(name));
    const stateTextLong = (st === 'full') ? t('nfFull') : (st === 'partial') ? t('nfOriginals') : blockedText;
    const stateTextShort = (st === 'blocked') ? blockedText : unlockedShort;
    const showTag = (isNetflix && SD_STYLE === 'text' && !SD_ARROW) ? '' : (tag || '');

    if (SD_STYLE === 'text' && !SD_ARROW) {
        const left = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`;
        const head = `${left}，${t('region')}: ${regionText}`;
        const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '', (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : '']
            .filter(Boolean).join(' ｜ ');
        return tail ? `${head} ｜ ${tail}` : head;
    }
    if (SD_STYLE === 'text') {
        const left = `${name}: ${st === 'full' ? t('unlocked') : st === 'partial' ? t('partialUnlocked') : t('notReachable')}`;
        const head = SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`;
        const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '', (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : '']
            .filter(Boolean).join(' ｜ ');
        return tail ? `${head} ｜ ${tail}` : head;
    }

    const head = SD_ARROW ? `${icon} ${name} ➟ ${regionText}` : `${icon} ${name} ｜ ${regionText}`;
    const tail = [showTag, (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '', (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : '']
        .filter(Boolean).join(' ｜ ');
    return tail ? `${head} ｜ ${tail}` : head;
}

const SD_NF_ORIGINAL = '80018499';
const SD_NF_NONORIG = '81280792';
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);

async function sd_testYouTube() {
    log('debug', 'SD YouTube begin');
    const r = await sd_httpGet('https://www.youtube.com/premium?hl=en', {}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.youTube,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    let cc = 'US';
    try {
        let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
        if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
        if (!m) m = r.data.match(/["']GL["']\s*:\s*["']([A-Z]{2})["']/);
        if (m) cc = m[1];
    } catch (_) {
    }
    return sd_renderLine({name: SD_I18N.youTube, ok: true, cc, cost: r.cost, status: r.status, tag: ''});
}

async function sd_testChatGPTWeb() {
    log('debug', 'SD ChatGPT Web begin');
    const r = await sd_httpGet('https://chatgpt.com/cdn-cgi/trace', {}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.chatgpt,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    let cc = '';
    try {
        const m = r.data.match(/loc=([A-Z]{2})/);
        if (m) cc = m[1];
    } catch (_) {
    }
    return sd_renderLine({name: SD_I18N.chatgpt, ok: true, cc, cost: r.cost, status: r.status, tag: ''});
}

async function sd_testChatGPTAppAPI() {
    log('debug', 'SD ChatGPT App begin');
    const r = await sd_httpGet('https://api.openai.com/v1/models', {}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.chatgpt_app,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    let cc = '';
    try {
        const h = r.headers || {};
        cc = (h['cf-ipcountry'] || h['CF-IPCountry'] || h['Cf-IpCountry'] || '').toString().toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) cc = '';
    } catch (_) {
    }
    if (!cc) cc = await sd_queryLandingCCMulti();
    return sd_renderLine({name: SD_I18N.chatgpt_app, ok: true, cc, cost: r.cost, status: r.status, tag: ''});
}

async function sd_testNetflix() {
    log('debug', 'SD Netflix begin');
    try {
        const r1 = await sd_nfGet(SD_NF_NONORIG);
        if (!r1.ok) return sd_renderLine({
            name: SD_I18N.netflix,
            ok: false,
            cc: '',
            cost: r1.cost,
            status: r1.status,
            tag: t('fail')
        });
        if (r1.status === 403) return sd_renderLine({
            name: SD_I18N.netflix,
            ok: false,
            cc: '',
            cost: r1.cost,
            status: r1.status,
            tag: t('regionBlocked')
        });
        if (r1.status === 404) {
            const r2 = await sd_nfGet(SD_NF_ORIGINAL);
            if (!r2.ok) return sd_renderLine({
                name: SD_I18N.netflix,
                ok: false,
                cc: '',
                cost: r2.cost,
                status: r2.status,
                tag: t('fail')
            });
            if (r2.status === 404) return sd_renderLine({
                name: SD_I18N.netflix,
                ok: false,
                cc: '',
                cost: r2.cost,
                status: r2.status,
                tag: t('regionBlocked')
            });
            const cc = sd_parseNFRegion(r2) || '';
            return sd_renderLine({
                name: SD_I18N.netflix,
                ok: true,
                cc,
                cost: r2.cost,
                status: r2.status,
                tag: t('nfOriginals'),
                state: 'partial'
            });
        }
        if (r1.status === 200) {
            const cc = sd_parseNFRegion(r1) || '';
            return sd_renderLine({
                name: SD_I18N.netflix,
                ok: true,
                cc,
                cost: r1.cost,
                status: r1.status,
                tag: t('nfFull'),
                state: 'full'
            });
        }
        return sd_renderLine({
            name: SD_I18N.netflix,
            ok: false,
            cc: '',
            cost: r1.cost,
            status: r1.status,
            tag: `HTTP ${r1.status}`
        });
    } catch (e) {
        return sd_renderLine({name: SD_I18N.netflix, ok: false, cc: '', cost: null, status: 0, tag: t('fail')});
    }
}

function sd_parseNFRegion(resp) {
    try {
        const xo = resp?.headers?.['x-originating-url'] || resp?.headers?.['X-Origining-URL'] || resp?.headers?.['X-Originating-URL'];
        if (xo) {
            const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i);
            if (m) return m[1].toUpperCase();
        }
        const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
        if (m2) return m2[1].toUpperCase();
    } catch (_) {
    }
    return "";
}

async function sd_testDisney() {
    log('debug', 'SD Disney+ begin');

    async function home() {
        const r = await sd_httpGet('https://www.disneyplus.com/', {'Accept-Language': 'en'}, true);
        if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data || '')) {
            throw 'NA';
        }
        let cc = '';
        try {
            const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
            if (m) cc = m[1];
        } catch (_) {
        }
        return {cc, cost: r.cost, status: r.status};
    }

    async function bam() {
        const headers = {
            'Accept-Language': 'en',
            'Authorization': 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
            'Content-Type': 'application/json',
            'User-Agent': SD_UA
        };
        const body = JSON.stringify({
            query: 'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
            variables: {
                input: {
                    applicationRuntime: 'chrome',
                    attributes: {
                        browserName: 'chrome',
                        browserVersion: '120.0.0.0',
                        manufacturer: 'apple',
                        model: null,
                        operatingSystem: 'macintosh',
                        operatingSystemVersion: '10.15.7',
                        osDeviceIds: []
                    },
                    deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx'
                }
            }
        });
        const r = await sd_httpPost('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', headers, body);
        if (!r.ok || r.status !== 200) throw 'NA';
        const d = safeJSON(r.data, {});
        if (d?.errors) throw 'NA';
        const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
        const cc = d?.extensions?.sdk?.session?.location?.countryCode;
        return {inLoc, cc, cost: r.cost, status: r.status};
    }

    const timeout = (ms, code) => new Promise((_, rej) => setTimeout(() => rej(code), ms));

    try {
        const h = await Promise.race([home(), timeout(7000, 'TO')]);
        const b = await Promise.race([bam(), timeout(7000, 'TO')]).catch(() => ({}));
        const blocked = (b && b.inLoc === false);
        const cc = blocked ? '' : (b?.cc || h?.cc || (await sd_queryLandingCCMulti()) || '');
        return sd_renderLine({
            name: SD_I18N.disney,
            ok: !blocked,
            cc,
            cost: (b?.cost || h?.cost || 0),
            status: (b?.status || h?.status || 0),
            tag: blocked ? t('regionBlocked') : ''
        });
    } catch (e) {
        const tag = (e === 'TO') ? t('timeout') : t('fail');
        return sd_renderLine({name: SD_I18N.disney, ok: false, cc: '', cost: null, status: 0, tag});
    }
}

async function sd_testHuluUS() {
    log('debug', 'SD Hulu US begin');
    const r = await sd_httpGet('https://www.hulu.com/', {}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.huluUS,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || '');
    return sd_renderLine({
        name: SD_I18N.huluUS,
        ok: !blocked,
        cc: blocked ? '' : 'US',
        cost: r.cost,
        status: r.status,
        tag: blocked ? t('regionBlocked') : ''
    });
}

async function sd_testHuluJP() {
    log('debug', 'SD Hulu JP begin');
    const r = await sd_httpGet('https://www.hulu.jp/', {'Accept-Language': 'ja'}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.huluJP,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || '');
    return sd_renderLine({
        name: SD_I18N.huluJP,
        ok: !blocked,
        cc: blocked ? '' : 'JP',
        cost: r.cost,
        status: r.status,
        tag: blocked ? t('regionBlocked') : ''
    });
}

async function sd_testHBO() {
    log('debug', 'SD Max(HBO) begin');
    const r = await sd_httpGet('https://www.max.com/', {}, true);
    if (!r.ok) return sd_renderLine({
        name: SD_I18N.hbo,
        ok: false,
        cc: '',
        cost: r.cost,
        status: r.status,
        tag: t('notReachable')
    });
    const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || '');
    let cc = '';
    try {
        const m = String(r.data || '').match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
        if (m) cc = m[1].toUpperCase();
    } catch (_) {
    }
    if (!cc) cc = await sd_queryLandingCCMulti();
    return sd_renderLine({
        name: SD_I18N.hbo,
        ok: !blocked,
        cc: blocked ? '' : cc,
        cost: r.cost,
        status: r.status,
        tag: blocked ? t('regionBlocked') : ''
    });
}

async function sd_queryLandingCC() {
    const r = await sd_httpGet('http://ip-api.com/json', {}, true);
    if (r.ok && r.status === 200) {
        try {
            const j = safeJSON(r.data, {});
            return (j.countryCode || '').toUpperCase();
        } catch {
            return '';
        }
    }
    return '';
}

async function sd_queryLandingCCMulti() {
    let cc = await sd_queryLandingCC();
    if (cc) return cc;

    let r = await sd_httpGet('https://api.ip.sb/geoip', {}, true);
    if (r.ok && r.status === 200) try {
        const j = safeJSON(r.data, {});
        if (j.country_code) return j.country_code.toUpperCase();
    } catch {
    }

    r = await sd_httpGet('https://ipinfo.io/json', {}, true);
    if (r.ok && r.status === 200) try {
        const j = safeJSON(r.data, {});
        if (j.country) return j.country.toUpperCase();
    } catch {
    }

    r = await sd_httpGet('https://ifconfig.co/json', {'Accept-Language': 'en'}, true);
    if (r.ok && r.status === 200) try {
        const j = safeJSON(r.data, {});
        if (j.country_iso) return j.country_iso.toUpperCase();
    } catch {
    }

    return '';
}

async function runServiceChecks() {
    try {
        const order = selectServices();
        if (!order.length) return [];
        log('info', 'Service checks start', order);
        const tasks = order.map((k) => SD_TESTS_MAP[k] && SD_TESTS_MAP[k]());
        const lines = await Promise.all(tasks);
        log('info', 'Service checks done');
        return lines.filter(Boolean);
    } catch (e) {
        log('error', 'Service checks error', String(e));
        return [];
    }
}

// ====================== 简→繁（仅在 zh-Hant） ======================
function zhHansToHantOnce(s) {
    if (!s) return s;
    const phraseMap = [
        ['网络', '網路'], ['蜂窝网络', '行動服務'], ['代理策略', '代理策略'],
        ['执行时间', '執行時間'], ['落地 IP', '落地 IP'], ['入口', '入口'],
        ['位置', '位置'], ['运营商', '運營商'], ['区域', '區域'],
        ['不可达', '不可達'], ['检测失败', '檢測失敗'], ['超时', '逾時'],
        ['区域受限', '區域受限'], ['已解锁', '已解鎖'], ['部分解锁', '部分解鎖'],
        ['已完整解锁', '已完整解鎖'], ['仅解锁自制剧', '僅解鎖自製劇'],
        ['中国香港', '中國香港'], ['中国澳门', '中國澳門'],
        ['中国移动', '中國移動'], ['中国联通', '中國聯通'], ['中国电信', '中國電信'],
        ['中国广电', '中國廣電'], ['中国教育网', '中國教育網']
    ];
    for (const [hans, hant] of phraseMap) s = s.replace(new RegExp(hans, 'g'), hant);
    const charMap = {
        '网': '網',
        '络': '絡',
        '运': '運',
        '营': '營',
        '达': '達',
        '检': '檢',
        '测': '測',
        '时': '時',
        '区': '區',
        '术': '術',
        '产': '產',
        '广': '廣',
        '电': '電',
        '联': '聯',
        '动': '動',
        '数': '數',
        '汉': '漢',
        '气': '氣',
        '历': '曆',
        '宁': '寧'
    };
    return s.replace(/[\u4E00-\u9FFF]/g, (ch) => charMap[ch] || ch);
}

function maybeTify(content) {
    return SD_LANG === 'zh-Hant' ? zhHansToHantOnce(content) : content;
}