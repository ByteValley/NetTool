/* =========================================================
 * 网络信息 + 服务检测（BoxJS/Surge/Loon/QuanX/Egern 兼容）
 * by ByteValley
 * Version: 2025-11-08R6
 *
 * 选择优先级（统一，BoxJS 最高）：
 *   BoxJS 勾选(NetworkInfo_SERVICES) > BoxJS 文本(NetworkInfo_SERVICES_TEXT)
 *   > 模块 #!arguments（SERVICES=...）> 代码默认（全部）
 *
 * - 标题显示网络类型；顶部显示 执行时间 → 代理策略（紧邻）
 * - 分组子标题：本地 / 入口 / 落地 / 服务检测（留白由 ST_GAP_LINES 控制）
 * - IPv4/IPv6 分行显示（仅渲染存在的那个；IP 可按 MASK_IP 脱敏）
 * - 直连/入口/落地 位置展示支持台湾旗模式：TW_FLAG_MODE=0(🇨🇳)/1(🇹🇼)/2(🇼🇸)
 * - 中国境内运营商规范化
 * - 服务检测并发执行；Netflix区分“完整/自制剧”，其它统一“已解锁/不可达”
 * - 入口/策略获取：预触发落地(v4/v6) → 扫描最近请求抓入口IPv4+IPv6 → 任意代理请求兜底
 * - 入口定位缓存 TTL 跟 Update 联动：TTL = max(30, min(Update, 3600)) 秒
 * - 可调：
 *   · SD_ICON_THEME: lock|circle|check（三态图标主题）
 *   · SD_REGION_MODE: full|abbr|flag（地区显示样式）
 *   · SD_ARROW: 是否使用“➟”连接服务名与地区（icon/text 共用）
 *   · ChatGPT App(API) 地区多源回退，优先 Cloudflare 头
 * - 日志相关（可在 BoxJS 或 #!arguments 配置）：
 *   - LOG=1            开启日志（默认 0）
 *   - LOG_LEVEL=info   级别：debug|info|warn|error
 *   - LOG_TO_PANEL=0   是否把末尾附加“—— 调试 ——”区块（默认 0）
 *   - LOG_PUSH=1       运行异常推送系统通知（默认 1）
 * =======================================================*/

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

/* ===== 语言字典（固定 UI 词收口）===== */
const SD_STR = {
    "zh-Hans": {
        panelTitle: "网络信息 𝕏",
        wifi: "Wi-Fi",
        cellular: "蜂窝数据",
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
        cellular: "行動數據",
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

// ====================== 预读基础配置 ======================
const UPDATE = toNum(readKV(K('Update')) ?? $args.Update ?? 10, 10);
const TIMEOUT = toNum(readKV(K('Timeout')) ?? $args.Timeout ?? 8, 8);

// ====================== 日志系统 ======================
const LOG_ON = toBool(readKV(K('LOG')) ?? $args.LOG, false);
const LOG_TO_PANEL = toBool(readKV(K('LOG_TO_PANEL')) ?? $args.LOG_TO_PANEL, false);
const LOG_PUSH = toBool(readKV(K('LOG_PUSH')) ?? $args.LOG_PUSH, true);
const LOG_LEVEL = (readKV(K('LOG_LEVEL')) ?? $args.LOG_LEVEL ?? 'info')
    .toString().toLowerCase();

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

// ====================== 统一配置对象（CFG.*） ======================
const CFG = {
    Update: UPDATE,
    Timeout: TIMEOUT,

    MASK_IP: toBool(readKV(K('MASK_IP')) ?? $args.MASK_IP, true),
    MASK_POS: toBool(readKV(K('MASK_POS')) ?? $args.MASK_POS, true),
    IPv6: toBool(readKV(K('IPv6')) ?? $args.IPv6, false),

    DOMESTIC_IPv4: readKV(K('DOMESTIC_IPv4')) ?? $args.DOMESTIC_IPv4
        ?? $args.DOMIC_IPv4 ?? 'ipip',
    DOMESTIC_IPv6: readKV(K('DOMESTIC_IPv6')) ?? $args.DOMESTIC_IPv6
        ?? $args.DOMIC_IPv6 ?? 'ddnspod',
    LANDING_IPv4: readKV(K('LANDING_IPv4')) ?? $args.LANDING_IPv4 ?? 'ipapi',
    LANDING_IPv6: readKV(K('LANDING_IPv6')) ?? $args.LANDING_IPv6 ?? 'ipsb',

    TW_FLAG_MODE: toNum(readKV(K('TW_FLAG_MODE')) ?? $args.TW_FLAG_MODE ?? 1, 1),

    // 图标预设 / 自定义
    IconPreset: readKV(K('IconPreset')) ?? $args.IconPreset ?? 'globe.asia.australia',
    Icon: readKV(K('Icon')) ?? $args.Icon ?? '',
    IconColor: readKV(K('IconColor')) ?? $args.IconColor ?? '#1E90FF',

    SD_STYLE: readKV(K('SD_STYLE')) ?? $args.SD_STYLE ?? 'icon',
    SD_SHOW_LAT: toBool(readKV(K('SD_SHOW_LAT')) ?? $args.SD_SHOW_LAT, true),
    SD_SHOW_HTTP: toBool(readKV(K('SD_SHOW_HTTP')) ?? $args.SD_SHOW_HTTP, true),
    SD_LANG: readKV(K('SD_LANG')) ?? $args.SD_LANG ?? 'zh-Hans',

    SD_TIMEOUT_MS: (() => {
        const raw = readKV(K('SD_TIMEOUT_MS')) ?? $args.SD_TIMEOUT_MS;
        const fallback = TIMEOUT * 1000;
        if (raw == null || raw === '') return fallback;
        return toNum(raw, fallback);
    })(),

    SD_REGION_MODE: readKV(K('SD_REGION_MODE')) ?? $args.SD_REGION_MODE ?? 'full',
    SD_ICON_THEME: readKV(K('SD_ICON_THEME')) ?? $args.SD_ICON_THEME ?? 'check',
    SD_ARROW: toBool(readKV(K('SD_ARROW')) ?? $args.SD_ARROW, true),

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

    /* ===== 新增：分组子标题样式 ===== */
    ST_SUBTITLE_STYLE: (readKV(K('ST_SUBTITLE_STYLE')) ?? $args.ST_SUBTITLE_STYLE ?? 'line').toString().trim(),
    ST_SUBTITLE_MINIMAL: toBool(readKV(K('ST_SUBTITLE_MINIMAL')) ?? $args.ST_SUBTITLE_MINIMAL, false),
    ST_GAP_LINES: Math.max(0, Math.min(2, toNum(readKV(K('ST_GAP_LINES')) ?? $args.ST_GAP_LINES, 1)))
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
    ICON_PRESET_MAP[CFG.IconPreset] || 'globe.asia.australia';
const ICON_COLOR = CFG.IconColor;

const IPv6_ON = !!CFG.IPv6;
const MASK_IP = !!CFG.MASK_IP;
const MASK_POS = typeof CFG.MASK_POS === 'boolean' ? CFG.MASK_POS : !!CFG.MASK_IP;
const TW_FLAG_MODE = Number(CFG.TW_FLAG_MODE) || 0;

const DOMESTIC_IPv4 = CFG.DOMESTIC_IPv4;
const DOMESTIC_IPv6 = CFG.DOMESTIC_IPv6;
const LANDING_IPv4 = CFG.LANDING_IPv4;
const LANDING_IPv6 = CFG.LANDING_IPv6;

// ====================== 服务检测参数 ======================
const SD_STYLE = (String(CFG.SD_STYLE).toLowerCase() === 'text') ? 'text' : 'icon';
const SD_SHOW_LAT = !!CFG.SD_SHOW_LAT;
const SD_SHOW_HTTP = !!CFG.SD_SHOW_HTTP;
const SD_LANG = (String(CFG.SD_LANG).toLowerCase() === 'zh-hant') ? 'zh-Hant' : 'zh-Hans';

const SD_TIMEOUT_MS = (() => {
    const v = Number(CFG.SD_TIMEOUT_MS);
    const fallback = (Number(CFG.Timeout) || 8) * 1000;
    const ms = Number.isFinite(v) ? v : fallback;
    return Math.max(CONSTS.SD_MIN_TIMEOUT, ms);
})();

const SD_REGION_MODE = ['full', 'abbr', 'flag']
    .includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : 'full';
const SD_ICON_THEME = ['lock', 'circle', 'check']
    .includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : 'check';
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

// ====================== 子标题样式（全新命名，无旧别名） ======================
const SUBTITLE_STYLES = Object.freeze({
    // 装饰类：留空格，提升可读性
    line: (s) => `—— ${s} ——`,    // 连线：左右各留一格
    pipe: (s) => `║ ${s} ║`,      // 竖线框：左右各留一格
    bullet: (s) => `· ${s} ·`,      // 居中圆点：左右各留一格

    // 括号/引号类：不留空格，更符合中文标点习惯
    cnBracket: (s) => `【${s}】`,    // 中文方头括
    cnQuote: (s) => `「${s}」`,    // 中文引号
    square: (s) => `[${s}]`,      // 方括号
    curly: (s) => `{${s}}`,      // 花括号
    angle: (s) => `《${s}》`,    // 书名号

    // 纯文本
    plain: (s) => `${s}`
});


function makeSubTitleRenderer(styleKey, minimal = false) {
    const fn = SUBTITLE_STYLES[styleKey] || SUBTITLE_STYLES.line;
    if (minimal) return (s) => String(s);
    return (s) => fn(String(s));
}

/** 统一推入分组标题：自动插入留白 + 应用样式/纯净模式 */
function pushGroupTitle(parts, title) {
    for (let i = 0; i < CFG.ST_GAP_LINES; i++) parts.push('');
    const render = makeSubTitleRenderer(CFG.ST_SUBTITLE_STYLE, CFG.ST_SUBTITLE_MINIMAL);
    parts.push(render(title));
}

// ====================== 启动日志 ======================
log('info', 'Start', JSON.stringify({
    Update: CFG.Update,
    Timeout: CFG.Timeout,
    IPv6: IPv6_ON,
    SD_TIMEOUT_MS,
    SD_STYLE,
    SD_REGION_MODE,
    TW_FLAG_MODE,
    ST_SUBTITLE_STYLE: CFG.ST_SUBTITLE_STYLE,
    ST_SUBTITLE_MINIMAL: CFG.ST_SUBTITLE_MINIMAL,
    ST_GAP_LINES: CFG.ST_GAP_LINES
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
        IPv6_ON ? getDirectV6(DOMESTIC_IPv6).catch((e) => {
                log('warn', 'DirectV6', String(e));
                return {};
            })
            : Promise.resolve({})
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
        IPv6_ON ? getLandingV6(LANDING_IPv6).catch((e) => {
                log('warn', 'LandingV6', String(e));
                return {};
            })
            : Promise.resolve({})
    ]);
    log('info', 'Landing fetched', (Date.now() - t2) + 'ms', {
        v4: _maskMaybe(px.ip || ''),
        v6: _maskMaybe(px6.ip || '')
    });

    const title = netTypeLine() || t('panelTitle');

    // 组装渲染
    const parts = [];
    parts.push(`${t('runAt')}: ${now()}`);
    parts.push(`${t('policy')}: ${policyName || '-'}`);

    // 本地
    pushGroupTitle(parts, '本地');
    const directIPv4 = ipLine('IPv4', cn.ip);
    const directIPv6 = ipLine('IPv6', cn6.ip);
    if (directIPv4) parts.push(directIPv4);
    if (directIPv6) parts.push(directIPv6);
    const directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : '-';
    parts.push(`${t('location')}: ${directLoc}`);
    if (cn.isp) parts.push(`${t('isp')}: ${fmtISP(cn.isp, cn.loc)}`);

    // 入口
    if ((ent4 && (ent4.ip || ent4.loc1 || ent4.loc2 || ent4.isp1 || ent4.isp2))
        || (ent6 && ent6.ip)) {
        pushGroupTitle(parts, '入口');
        const entIPv4 = ipLine('IPv4', ent4.ip && isIPv4(ent4.ip) ? ent4.ip : '');
        const entIPv6 = ipLine('IPv6', ent6.ip && isIPv6(ent6.ip) ? ent6.ip : '');
        if (entIPv4) parts.push(entIPv4);
        if (entIPv6) parts.push(entIPv6);
        if (ent4.loc1) parts.push(`${t('location')}¹: ${flagFirst(ent4.loc1)}`);
        if (ent4.isp1) parts.push(`${t('isp')}¹: ${fmtISP(ent4.isp1, ent4.loc1)}`);
        if (ent4.loc2) parts.push(`${t('location')}²: ${flagFirst(ent4.loc2)}`);
        if (ent4.isp2) parts.push(`${t('isp')}²: ${String(ent4.isp2).trim()}`);
    }

    // 落地
    if (px.ip || px6.ip || px.loc || px.isp) {
        pushGroupTitle(parts, '落地');
        const landIPv4 = ipLine('IPv4', px.ip);
        const landIPv6 = ipLine('IPv6', px6.ip);
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
// IPv6 正则过长，使用分段字符串拼接便于维护（语义不变）
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
        return String.fromCodePoint(...[...cc.toUpperCase()]
            .map((ch) => 127397 + ch.charCodeAt()));
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
    if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm))
        return '中国移动';
    if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm))
        return '中国电信';
    if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm))
        return '中国联通';
    if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm))
        return '中国广电';
    if ((/cernet|china\s*education/).test(s) || /教育网/.test(norm))
        return '中国教育网';
    if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
    return raw;
}

function radioToGen(r) {
    const MAP = {
        GPRS: '2.5G', EDGE: '2.75G', CDMA1x: '2.5G', WCDMA: '3G',
        HSDPA: '3.5G', HSUPA: '3.75G', CDMAEVDORev0: '3.5G',
        CDMAEVDORevA: '3.5G', CDMAEVDORevB: '3.75G', eHRPD: '3.9G',
        LTE: '4G', NRNSA: '5G', NR: '5G'
    };
    return MAP[r] || '';
}

function netTypeLine() {
    try {
        const ssid = $network?.wifi?.ssid;
        const radio = $network?.['cellular-data']?.radio;
        if (ssid) return `${t('wifi')} | ${ssid}`;
        if (radio) return `${t('cellular')} | ${t('gen')(radioToGen(radio), radio)}`;
    } catch (_) {
    }
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

// ====================== 数据源：直连/落地/入口 ======================
async function getDirectV4(p) {
    try {
        log('info', 'DirectV4 source', p);
        if (p === 'cip') return await d_cip();
        if (p === '163') return await d_163();
        if (p === 'bilibili') return await d_bili();
        if (p === '126') return await d_126();
        if (p === 'pingan') return await d_pingan();
        return await d_ipip();
    } catch (e) {
        log('warn', 'DirectV4 fallback ipip', String(e));
        try {
            return await d_ipip();
        } catch (e2) {
            log('error', 'DirectV4 ipip fail', String(e2));
        }
        return {};
    }
}

async function d_ipip() {
    const r = await httpGet('https://myip.ipip.net/json');
    const j = JSON.parse(r.body || '{}');
    const loc = j?.data?.location || [];
    const c0 = loc[0];
    const flag = flagOf(c0 === '中国' ? 'CN' : c0);
    return {
        ip: j?.data?.ip || '',
        loc: joinNonEmpty([flag, loc[0], loc[1], loc[2]], ' ')
            .replace(/\s*中国\s*/, ''),
        isp: loc[4] || ''
    };
}

async function d_cip() {
    const r = await httpGet('http://cip.cc/');
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

async function d_163() {
    const r = await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail');
    const d = (JSON.parse(r.body || '{}') || {}).result || {};
    return {
        ip: d.ip || '',
        loc: joinNonEmpty([flagOf(d.countryCode), d.country, d.province, d.city], ' ')
            .replace(/\s*中国\s*/, ''),
        isp: d.isp || d.org || ''
    };
}

async function d_bili() {
    const r = await httpGet('https://api.bilibili.com/x/web-interface/zone');
    const d = (JSON.parse(r.body || '{}') || {}).data || {};
    const flag = flagOf(d.country === '中国' ? 'CN' : d.country);
    return {
        ip: d.addr || '',
        loc: joinNonEmpty([flag, d.country, d.province, d.city], ' ')
            .replace(/\s*中国\s*/, ''),
        isp: d.isp || ''
    };
}

async function d_126() {
    const r = await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp');
    const d = (JSON.parse(r.body || '{}') || {}).result || {};
    return {
        ip: d.ip || '',
        loc: joinNonEmpty([flagOf(d.countrySymbol), d.country, d.province, d.city], ' ')
            .replace(/\s*中国\s*/, ''),
        isp: d.operator || ''
    };
}

async function d_pingan() {
    const r = await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request');
    const d = (JSON.parse(r.body || '{}') || {}).data || {};
    return {
        ip: d.ip || '',
        loc: joinNonEmpty([flagOf(d.countryIsoCode), d.country, d.region, d.city], ' ')
            .replace(/\s*中国\s*/, ''),
        isp: d.isp || ''
    };
}

async function getDirectV6(p) {
    try {
        log('info', 'DirectV6 source', p);
        if (p === 'neu6') {
            const r = await httpGet('https://speed.neu6.edu.cn/getIP.php');
            return {ip: String(r.body || '').trim()};
        }
        const r = await httpGet('https://ipv6.ddnspod.com');
        return {ip: String(r.body || '').trim()};
    } catch (e) {
        log('warn', 'DirectV6 fail', String(e));
        return {};
    }
}

async function getLandingV4(p) {
    try {
        log('info', 'LandingV4 source', p);
        if (p === 'ipwhois') return await l_whois();
        if (p === 'ipsb') return await l_ipsb();
        return await l_ipapi();
    } catch (e) {
        log('warn', 'LandingV4 fallback ipapi', String(e));
        try {
            return await l_ipapi();
        } catch (e2) {
            log('error', 'LandingV4 ipapi fail', String(e2));
        }
        return {};
    }
}

async function l_ipapi() {
    const r = await httpGet('http://ip-api.com/json?lang=zh-CN');
    const j = JSON.parse(r.body || '{}');
    return {
        ip: j.query || '',
        loc: joinNonEmpty([
            flagOf(j.countryCode),
            j.country?.replace(/\s*中国\s*/, ''),
            j.regionName?.split(/\s+or\s+/)[0],
            j.city
        ], ' '),
        isp: j.isp || j.org || ''
    };
}

async function l_whois() {
    const r = await httpGet('https://ipwhois.app/widget.php?lang=zh-CN');
    const j = JSON.parse(r.body || '{}');
    return {
        ip: j.ip || '',
        loc: joinNonEmpty([
            flagOf(j.country_code),
            j.country?.replace(/\s*中国\s*/, ''),
            j.region,
            j.city
        ], ' '),
        isp: (j?.connection?.isp) || ''
    };
}

async function l_ipsb() {
    const r = await httpGet('https://api-ipv4.ip.sb/geoip');
    const j = JSON.parse(r.body || '{}');
    return {
        ip: j.ip || '',
        loc: joinNonEmpty([
            flagOf(j.country_code), j.country, j.region, j.city
        ], ' ').replace(/\s*中国\s*/, ''),
        isp: j.isp || j.organization || ''
    };
}

async function getLandingV6(p) {
    try {
        log('info', 'LandingV6 source', p);
        if (p === 'ident') {
            const r = await httpGet('https://v6.ident.me');
            return {ip: String(r.body || '').trim()};
        }
        if (p === 'ipify') {
            const r = await httpGet('https://api6.ipify.org');
            return {ip: String(r.body || '').trim()};
        }
        const r = await httpGet('https://api-ipv6.ip.sb/ip');
        return {ip: String(r.body || '').trim()};
    } catch (e) {
        log('warn', 'LandingV6 fail', String(e));
        return {};
    }
}

// ====================== 入口/策略（稳态获取） ======================
const ENT_SOURCES_RE = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org)/i;
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
    try {
        await httpGet('https://api-ipv6.ip.sb/ip', {}, CONSTS.PRETOUCH_TO_MS, true);
    } catch (_) {
    }
    log('debug', 'Pre-touch landing endpoints done');
}

async function getPolicyAndEntranceBoth() {
    const data = await httpAPI('/v1/requests/recent');
    const reqs = Array.isArray(data?.requests) ? data.requests : [];
    const hits = reqs.slice(0, CONSTS.MAX_RECENT_REQ)
        .filter((i) => ENT_SOURCES_RE.test(i.URL || ''));

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
    log('debug', 'Policy/Entrance candidates', {
        policy, v4: _maskMaybe(ip4), v6: _maskMaybe(ip6), hits: hits.length
    });
    return {policyName: policy, entrance4: ip4, entrance6: ip6};
}

// —— 入口位置缓存（跟 Update 联动） ——
const ENT_REQ_TO = Math.max(
    CONSTS.ENT_MIN_REQ_TO,
    (Number(CFG.SD_TIMEOUT_MS) || (Number(CFG.Timeout) || 8) * 1000)
);
const ENT_TTL_SEC = Math.max(
    CONSTS.ENT_MIN_TTL,
    Math.min(Number(CFG.Update) || 10, CONSTS.ENT_MAX_TTL)
);
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

async function loc_pingan(ip) {
    const r = await httpGet(
        'https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=' +
        encodeURIComponent(ip),
        {},
        ENT_REQ_TO
    );
    const d = (JSON.parse(r.body || '{}') || {}).data || {};
    if (!d || (!d.countryIsoCode && !d.country)) throw 'pingan-empty';
    return {
        loc: joinNonEmpty([
            flagOf(d.countryIsoCode), d.country, d.region, d.city
        ], ' ').replace(/\s*中国\s*/, ''),
        isp: d.isp || ''
    };
}

async function loc_ipapi(ip) {
    const r = await httpGet(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`,
        {},
        ENT_REQ_TO
    );
    const j = JSON.parse(r.body || '{}');
    if (j.status && j.status !== 'success') throw 'ipapi-fail';
    return {
        loc: joinNonEmpty([
            flagOf(j.countryCode),
            j.country?.replace(/\s*中国\s*/, ''),
            j.regionName?.split(/\s+or\s+/)[0],
            j.city
        ], ' '),
        isp: j.isp || j.org || j.as || ''
    };
}

async function loc_ipwhois(ip) {
    const r = await httpGet(
        `https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`,
        {},
        ENT_REQ_TO
    );
    const j = JSON.parse(r.body || '{}');
    if (j.success === false || (!j.country && !j.country_code)) throw 'ipwhois-fail';
    return {
        loc: joinNonEmpty([
            flagOf(j.country_code), j.country?.replace(/\s*中国\s*/, ''), j.region, j.city
        ], ' '),
        isp: (j.connection && j.connection.isp) || j.org || ''
    };
}

async function loc_ipsb(ip) {
    const r = await httpGet(
        `https://api.ip.sb/geoip/${encodeURIComponent(ip)}`,
        {},
        ENT_REQ_TO
    );
    const j = JSON.parse(r.body || '{}');
    if (!j || (!j.country && !j.country_code)) throw 'ipsb-fail';
    return {
        loc: joinNonEmpty([
            flagOf(j.country_code), j.country, j.region, j.city
        ], ' ').replace(/\s*中国\s*/, ''),
        isp: j.isp || j.organization || ''
    };
}

async function loc_chain(ip) {
    try {
        return await withRetry(() => loc_ipapi(ip), 1);
    } catch (_) {
    }
    try {
        return await withRetry(() => loc_ipwhois(ip), 1);
    } catch (_) {
    }
    return await withRetry(() => loc_ipsb(ip), 0);
}

async function getEntranceBundle(ip) {
    const now = Date.now();
    const fresh = (now - ENT_CACHE.t) < ENT_TTL_SEC * 1000;
    if (ENT_CACHE.ip === ip && fresh && ENT_CACHE.data) {
        const left = Math.max(0, ENT_TTL_SEC * 1000 - (now - ENT_CACHE.t));
        log('info', 'Entrance cache HIT', {ip: _maskMaybe(ip), ttl_ms_left: left});
        return ENT_CACHE.data;
    }
    if (ENT_CACHE.ip === ip && ENT_CACHE.data) {
        log('info', 'Entrance cache EXPIRED', {
            ip: _maskMaybe(ip), age_ms: (now - ENT_CACHE.t), ttl_ms: ENT_TTL_SEC * 1000
        });
    } else {
        log('info', 'Entrance cache MISS', {ip: _maskMaybe(ip)});
    }

    const t = Date.now();
    const [a, b] = await Promise.allSettled([
        withRetry(() => loc_pingan(ip), 1),
        withRetry(() => loc_chain(ip), 1)
    ]);
    log('debug', 'Entrance locate results', {
        pingan: a.status, chain: b.status, cost: (Date.now() - t) + 'ms'
    });

    const res = {
        ip,
        loc1: a.status === 'fulfilled' ? (a.value.loc || '') : '',
        isp1: a.status === 'fulfilled' ? (a.value.isp || '') : '',
        loc2: b.status === 'fulfilled' ? (b.value.loc || '') : '',
        isp2: b.status === 'fulfilled' ? (b.value.isp || '') : ''
    };
    ENT_CACHE = {ip, t: now, data: res};
    return res;
}

// ====================== 服务清单解析 & 检测 ======================
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
    nf: 'netflix', 'netflix': 'netflix', '奈飞': 'netflix',
    'disney': 'disney', 'disney+': 'disney', '迪士尼': 'disney',
    'chatgpt': 'chatgpt_app', gpt: 'chatgpt_app', openai: 'chatgpt_app',
    'chatgpt_web': 'chatgpt_web', 'chatgpt-web': 'chatgpt_web', 'chatgpt web': 'chatgpt_web',
    hulu: 'hulu_us', '葫芦': 'hulu_us', huluus: 'hulu_us', hulujp: 'hulu_jp',
    hbo: 'hbo', max: 'hbo'
};

function parseServices(raw) {
    if (raw == null) return [];
    let s = String(raw).trim();
    if (!s || s === '[]' || s === '{}' || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];
    try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return normSvcList(arr);
    } catch (_) {
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
    const hasCheckboxKey = CFG.SERVICES_BOX_CHECKED_RAW !== null;
    const candidates = hasCheckboxKey
        ? [
            ["BoxJS checkbox", CFG.SERVICES_BOX_CHECKED_RAW],
            ["BoxJS text", CFG.SERVICES_BOX_TEXT],
            ["arguments", CFG.SERVICES_ARG_TEXT]
        ]
        : [
            ["BoxJS text", CFG.SERVICES_BOX_TEXT],
            ["arguments", CFG.SERVICES_ARG_TEXT]
        ];
    for (const [label, raw] of candidates) {
        const list = parseServices(raw);
        if (list.length > 0) {
            log("info", `Services: ${label}`, list);
            return list;
        }
    }
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
            url,
            headers: {...SD_BASE_HEADERS, ...headers},
            timeout: SD_TIMEOUT_MS,
            followRedirect
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
            url,
            headers: {...SD_BASE_HEADERS, ...headers},
            timeout: SD_TIMEOUT_MS,
            body
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

function sd_parseNFRegion(resp) {
    try {
        const xo = resp?.headers?.['x-originating-url'] ||
            resp?.headers?.['X-Origining-URL'] ||
            resp?.headers?.['X-Originating-URL'];
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
        cc = (h['cf-ipcountry'] || h['CF-IPCountry'] || h['Cf-IpCountry'] || '')
            .toString().toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) cc = '';
    } catch (_) {
    }
    if (!cc) cc = await sd_queryLandingCCMulti();
    return sd_renderLine({name: SD_I18N.chatgpt_app, ok: true, cc, cost: r.cost, status: r.status, tag: ''});
}

const SD_NF_ORIGINAL = '80018499';
const SD_NF_NONORIG = '81280792';
const sd_nfGet = (id) => sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true);

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

async function sd_testDisney() {
    log('debug', 'SD Disney+ begin');

    async function home() {
        const r = await sd_httpGet('https://www.disneyplus.com/', {'Accept-Language': 'en'}, true);
        if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data || '')) {
            throw 'NA';
        }
        let cc = '';
        try {
            const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) ||
                r.data.match(/data-country=["']([A-Z]{2})["']/i);
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
                        browserName: 'chrome', browserVersion: '120.0.0.0', manufacturer: 'apple',
                        model: null, operatingSystem: 'macintosh', operatingSystemVersion: '10.15.7',
                        osDeviceIds: []
                    },
                    deviceFamily: 'browser', deviceLanguage: 'en', deviceProfile: 'macosx'
                }
            }
        });
        const r = await sd_httpPost('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', headers, body);
        if (!r.ok || r.status !== 200) throw 'NA';
        const d = JSON.parse(r.data || '{}');
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
            const j = JSON.parse(r.data || '{}');
            return (j.countryCode || '').toUpperCase();
        } catch (_) {
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
        const j = JSON.parse(r.data || '{}');
        if (j.country_code) return j.country_code.toUpperCase();
    } catch (_) {
    }

    r = await sd_httpGet('https://ipinfo.io/json', {}, true);
    if (r.ok && r.status === 200) try {
        const j = JSON.parse(r.data || '{}');
        if (j.country) return j.country.toUpperCase();
    } catch (_) {
    }

    r = await sd_httpGet('https://ifconfig.co/json', {'Accept-Language': 'en'}, true);
    if (r.ok && r.status === 200) try {
        const j = JSON.parse(r.data || '{}');
        if (j.country_iso) return j.country_iso.toUpperCase();
    } catch (_) {
    }

    return '';
}

function sd_renderLine({name, ok, cc, cost, status, tag, state}) {
    const st = state ? state : (ok ? (isPartial(tag) ? 'partial' : 'full') : 'blocked');
    const icon = SD_ICONS[st];
    const regionChunk = cc ? sd_ccPretty(cc) : '';
    const regionText = regionChunk || '-';

    const unlockedShort = t('unlocked');
    const blockedText = t('notReachable');

    const isNetflix = /netflix/i.test(String(name));
    const stateTextLong = (st === 'full') ? t('nfFull') :
        (st === 'partial') ? t('nfOriginals') : blockedText;
    const stateTextShort = (st === 'blocked') ? blockedText : unlockedShort;
    const showTag = (isNetflix && SD_STYLE === 'text' && !SD_ARROW) ? '' : (tag || '');

    if (SD_STYLE === 'text' && !SD_ARROW) {
        const left = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`;
        const head = `${left}，${t('region')}: ${regionText}`;
        const tail = [showTag,
            (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '',
            (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ''
        ].filter(Boolean).join(' ｜ ');
        return tail ? `${head} ｜ ${tail}` : head;
    }

    if (SD_STYLE === 'text') {
        const left = `${name}: ${st === 'full' ? t('unlocked') : st === 'partial' ? t('partialUnlocked') : t('notReachable')}`;
        const head = SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`;
        const tail = [showTag,
            (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '',
            (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ''
        ].filter(Boolean).join(' ｜ ');
        return tail ? `${head} ｜ ${tail}` : head;
    }

    const head = SD_ARROW ? `${icon} ${name} ➟ ${regionText}`
        : `${icon} ${name} ｜ ${regionText}`;
    const tail = [showTag,
        (SD_SHOW_LAT && cost != null) ? `${cost}ms` : '',
        (SD_SHOW_HTTP && status > 0) ? `HTTP ${status}` : ''
    ].filter(Boolean).join(' ｜ ');
    return tail ? `${head} ｜ ${tail}` : head;
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
        ['网络', '網路'], ['蜂窝数据', '行動數據'], ['代理策略', '代理策略'],
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