/* =========================================================
 * 模块：网络信息 + 服务检测（BoxJS / Surge / Loon / QuanX / Egern 兼容）
 * 作者：ByteValley
 * 版本：2025-11-11R3
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
 *  · 直连 IPv6：ddnspod | neu6（并行竞速）
 *  · 落地 IPv4：ipapi | ipwhois | ipsb（失败逐级回退；ip-api 强化重试）
 *  · 落地 IPv6：ipsb | ident | ipify（并行竞速 + http 降级）
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
 *
 * 变更记录 · 摘要
 *  · IPv6 fail-fast：1200ms 单次，无重试，失败进入 10 分钟冷却
 *  · 运行预算：默认 22s，阶段性降级/跳过以保证 $done
 *  · 预触发轻量化：300ms fire-and-forget
 *  · 入口定位与服务检测均做预算感知与硬超时裁剪
 * ========================================================= */

// ====================== 常量 & 版本标识 ======================
const VER = "2025-11-11 R3";
const C = Object.freeze({
    BUDGET_MS: 22000,
    V6_ONE_SHOT_MS: 1200,
    V6_COOL_MS: 10 * 60 * 1000,
    HTTP_MIN_TO: 2000,
    ENT_REQ_MIN_TO: 2500,
    ENT_TTL_MIN: 30,
    ENT_TTL_MAX: 3600,
    PRETOUCH_TO: 300,
    LOG_RING: 120,
    DEBUG_TAIL: 18
});

// ====================== 读取参数/存取封装 ======================
const KV = {
    read(k) {
        try {
            if ($persistentStore?.read) return $persistentStore.read(k);
            if ($prefs?.valueForKey) return $prefs.valueForKey(k);
            if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
        } catch {
        }
        return null;
    },
    write(k, v) {
        try {
            $persistentStore?.write?.(v, k);
            $prefs?.setValueForKey?.(v, k);
            if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
        } catch {
        }
    }
};
const argStr = (typeof $argument === 'string') ? $argument : '';

function parseArgs(s) {
    if (!s) return {};
    return s.split('&').reduce((m, p) => {
        if (!p) return m;
        const [k, v = ''] = p.split('=');
        try {
            m[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, '%20'));
        } catch {
        }
        return m;
    }, {});
}

const ARGS = (typeof $argument === 'object' && $argument) ? $argument : parseArgs(argStr);

function b(v, d = false) {
    if (v == null || v === '') return d;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    return ['1', 'true', 'on', 'yes', 'y'].includes(s) ? true : ['0', 'false', 'off', 'no', 'n'].includes(s) ? false : d;
}

function n(v, d) {
    if (v == null || v === '') return d;
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
}

function pick(...xs) {
    for (const x of xs) {
        if (x != null && x !== '') return x;
    }
    return undefined;
}

const K = (s) => `NetworkInfo_${s}`;

// ===== 全局配置（与 R3 对齐） =====
const CFG = {
    Update: n(pick(KV.read(K('Update')), ARGS.Update), 10),
    Timeout: n(pick(KV.read(K('Timeout')), ARGS.Timeout), 8),
    IPv6: b(pick(KV.read(K('IPv6')), ARGS.IPv6), false),
    DOMESTIC_IPv4: pick(KV.read(K('DOMESTIC_IPv4')), ARGS.DOMESTIC_IPv4, 'ipip'),
    DOMESTIC_IPv6: pick(KV.read(K('DOMESTIC_IPv6')), ARGS.DOMESTIC_IPv6, 'ddnspod'),
    LANDING_IPv4: pick(KV.read(K('LANDING_IPv4')), ARGS.LANDING_IPv4, 'ipapi'),
    LANDING_IPv6: pick(KV.read(K('LANDING_IPv6')), ARGS.LANDING_IPv6, 'ipsb'),
    MASK_IP: b(pick(KV.read(K('MASK_IP')), ARGS.MASK_IP), true),
    MASK_POS: b(pick(KV.read(K('MASK_POS')), ARGS.MASK_POS), true),
    TW_FLAG_MODE: n(pick(KV.read(K('TW_FLAG_MODE')), ARGS.TW_FLAG_MODE), 1),
    IconPreset: pick(KV.read(K('IconPreset')), ARGS.IconPreset, 'globe'),
    Icon: pick(KV.read(K('Icon')), ARGS.Icon, ''),
    IconColor: pick(KV.read(K('IconColor')), ARGS.IconColor, '#1E90FF'),
    SD_STYLE: (pick(KV.read(K('SD_STYLE')), ARGS.SD_STYLE, 'icon') + "").toLowerCase(),
    SD_SHOW_LAT: b(pick(KV.read(K('SD_SHOW_LAT')), ARGS.SD_SHOW_LAT), true),
    SD_SHOW_HTTP: b(pick(KV.read(K('SD_SHOW_HTTP')), ARGS.SD_SHOW_HTTP), true),
    SD_LANG: (pick(KV.read(K('SD_LANG')), ARGS.SD_LANG, 'zh-Hans') + "").toLowerCase(),
    SD_TIMEOUT_MS: (() => {
        const raw = pick(KV.read(K('SD_TIMEOUT_MS')), ARGS.SD_TIMEOUT_MS);
        const fb = n(ARGS.Timeout, 8) * 1000;
        return raw == null ? fb : n(raw, fb);
    })(),
    SD_REGION_MODE: pick(KV.read(K('SD_REGION_MODE')), ARGS.SD_REGION_MODE, 'full'),
    SD_ICON_THEME: pick(KV.read(K('SD_ICON_THEME')), ARGS.SD_ICON_THEME, 'check'),
    SD_ARROW: b(pick(KV.read(K('SD_ARROW')), ARGS.SD_ARROW), true),
    SERVICES_BOX: KV.read(K('SERVICES')),
    SERVICES_TEXT: KV.read(K('SERVICES_TEXT')) || '',
    SERVICES_ARG: pick(ARGS.SERVICES, (typeof $argument === 'string' && (argStr.match(/(?:^|&)SERVICES=([^&]*)/) || [])[1])) || '',
    SUBTITLE_STYLE: pick(KV.read(K('SUBTITLE_STYLE')), ARGS.SUBTITLE_STYLE, 'line'),
    SUBTITLE_MINIMAL: b(pick(KV.read(K('SUBTITLE_MINIMAL')), ARGS.SUBTITLE_MINIMAL), false),
    GAP_LINES: Math.max(0, Math.min(2, n(pick(KV.read(K('GAP_LINES')), ARGS.GAP_LINES), 1)))
};

// ====================== 日志 ======================
const LOG_ON = b(pick(KV.read(K('LOG')), ARGS.LOG), false);
const LOG_TO_PANEL = b(pick(KV.read(K('LOG_TO_PANEL')), ARGS.LOG_TO_PANEL), false);
const LOG_PUSH = b(pick(KV.read(K('LOG_PUSH')), ARGS.LOG_PUSH), true);
const LV = {debug: 10, info: 20, warn: 30, error: 40};
const LOG_LEVEL = (pick(KV.read(K('LOG_LEVEL')), ARGS.LOG_LEVEL, 'info') + "").toLowerCase();
const TH = LV[LOG_LEVEL] ?? 20;
const RING = [];

function log(level, ...xs) {
    if (!LOG_ON) return;
    const l = LV[level] ?? 20;
    if (l < TH) return;
    const s = `[NI][${level.toUpperCase()}] ${xs.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ')}`;
    try {
        console.log(s);
    } catch {
    }
    RING.push(s);
    if (RING.length > C.LOG_RING) RING.shift();
}

function pushErr(t, b) {
    if (LOG_PUSH) $notification?.post?.(t, '', b);
    log('error', t, b);
}

// ====================== 通用工具 ======================
const ICONS = {
    wifi: 'wifi.router',
    globe: 'globe.asia.australia',
    dots: 'dot.radiowaves.left.and.right',
    antenna: 'antenna.radiowaves.left.and.right',
    point: 'point.3.connected.trianglepath.dotted'
};
const ICON_NAME = (CFG.Icon || '').trim() || ICONS[CFG.IconPreset] || ICONS.globe;
const ICON_COLOR = CFG.IconColor;

const isStr = (x) => typeof x === 'string';
const nowTime = () => new Date().toTimeString().split(' ')[0];
const join = (arr, sep = ' ') => arr.filter(Boolean).join(sep);

function maskIP(ip) {
    if (!ip || !CFG.MASK_IP) return ip || '';
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
        const p = ip.split('.');
        return `${p[0]}.${p[1]}.*.*`;
    }
    if (ip.includes(':')) {
        const p = ip.split(':');
        return [...p.slice(0, 4), '*', '*', '*', '*'].join(':');
    }
    return ip;
}

// 标志/区域渲染（TW 三态）
function flagOfCC(cc) {
    cc = (cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    if (cc === 'TW') {
        if (CFG.TW_FLAG_MODE === 0) return '🇨🇳';
        if (CFG.TW_FLAG_MODE === 2) return '🇼🇸';
    }
    try {
        return String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt()));
    } catch {
        return ''
    }
}

function renderRegion(cc) {
    cc = (cc || '').toUpperCase();
    const flag = flagOfCC(cc);
    if (!cc) return '—';
    const mode = (CFG.SD_REGION_MODE || 'full').toLowerCase();
    if (mode === 'flag') return flag || '—';
    if (mode === 'abbr') return (flag ? flag + ' ' : '') + cc;
    const N = {
        'zh-hans': {
            CN: '中国',
            TW: '台湾',
            HK: '中国香港',
            MO: '中国澳门',
            US: '美国',
            JP: '日本',
            SG: '新加坡'
        }, 'zh-hant': {CN: '中國', TW: '台灣', HK: '中國香港', MO: '中國澳門', US: '美國', JP: '日本', SG: '新加坡'}
    }[(CFG.SD_LANG || 'zh-Hans').toLowerCase()] || {};
    const name = N[cc];
    return (flag ? flag + ' ' : '') + (name ? `${cc} | ${name}` : cc);
}

function splitFlagText(s) {
    const m = String(s || '').match(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u);
    let flag = m ? m[0] : '';
    const text = String(s || '').replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '');
    if (flag.includes('🇹🇼')) {
        if (CFG.TW_FLAG_MODE === 0) flag = '🇨🇳'; else if (CFG.TW_FLAG_MODE === 2) flag = '🇼🇸';
    }
    return {flag, text};
}

const onlyFlag = (s) => splitFlagText(s).flag || '-';
const flagFirst = (s) => {
    const {flag, text} = splitFlagText(s);
    return (flag || '') + (text || '');
};

// 子标题样式
const SUBSTYLES = {
    line: (s) => `——${s}——`,
    cnBracket: (s) => `【${s}】`,
    cnQuote: (s) => `「${s}」`,
    square: (s) => `[${s}]`,
    curly: (s) => `{${s}}`,
    angle: (s) => `《${s}》`,
    pipe: (s) => `║${s}║`,
    bullet: (s) => `·${s} ·`,
    plain: (s) => `${s}`
};

function renderSub(s) {
    const k = (CFG.SUBTITLE_STYLE || 'line');
    const fn = SUBSTYLES[k] || SUBSTYLES.line;
    return CFG.SUBTITLE_MINIMAL ? String(s) : fn(String(s));
}

// 预算守护
const T0 = Date.now();
const BUDGET = Math.min(C.BUDGET_MS, Math.max(8000, (CFG.Timeout + 14) * 1000));
const leftBudget = () => Math.max(0, BUDGET - (Date.now() - T0));

function budgetGuard(tag, need) {
    const left = leftBudget();
    const ok = left >= (need || 0);
    log(ok ? 'debug' : 'warn', 'budget', tag, 'need', `${need || 0}ms`, 'left', `${left}ms`, ok ? 'OK' : 'CUT');
    return ok;
}

// ====================== HTTP 统一层 ======================
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function req(method, url, {headers = {}, body = null, timeout = null, followRedirect = true} = {}) {
    return new Promise((resolve) => {
        const start = Date.now();
        const opt = {
            url,
            headers: {'User-Agent': UA, 'Accept-Language': 'en', ...headers},
            timeout: timeout ?? CFG.SD_TIMEOUT_MS
        };
        if (body != null) opt.body = body;
        if (followRedirect != null) opt.followRedirect = followRedirect;
        const cb = (err, resp, data) => {
            const cost = Date.now() - start;
            if (err || !resp) {
                log('warn', method, 'FAIL', url, 'cost', cost + 'ms', String(err || ''));
                return resolve({ok: false, status: 0, headers: {}, data: "", cost});
            }
            const st = resp.status || resp.statusCode || 0;
            log('debug', method, 'OK', url, 'status', st, 'cost', cost + 'ms');
            resolve({ok: true, status: st, headers: resp.headers || {}, data: data || "", cost});
        };
        if (method === 'GET') $httpClient.get(opt, cb); else $httpClient.post(opt, cb);
    });
}

const get = (url, o) => req('GET', url, o);
const post = (url, o) => req('POST', url, o);

function httpAPI(path = '/v1/requests/recent', to = 900) {
    return Promise.race([new Promise(res => {
        if (typeof $httpAPI === 'function') $httpAPI('GET', path, null, (x) => res(x || {})); else res({});
    }), new Promise((_, rej) => setTimeout(() => rej('httpAPI-timeout'), to))]);
}

// ====================== IP/正则 ======================
const IPV4_RE = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6_RE = new RegExp('^' + [
    '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|', '([0-9a-fA-F]{1,4}:){1,7}:|', '([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|', '([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|', '([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|', '([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|', '([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|', '[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|', ':((:[0-9a-fA-F]{1,4}){1,7}|:)|', '::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|', '([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))'
].join('') + '$');
const isIPv4 = (ip) => IPV4_RE.test(ip || '');
const isIPv6 = (ip) => IPV6_RE.test(ip || '');
const isIP = (ip) => isIPv4(ip) || isIPv6(ip);

// ====================== 直连/落地源（统一 trySources） ======================
function json(s, d = {}) {
    try {
        return JSON.parse(s || '');
    } catch {
        return d;
    }
}

function hasCity(loc) {
    if (!loc) return false;
    const s = String(loc).replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim();
    if (/市|区|縣|县|州|市辖/.test(s)) return true;
    return s.split(/\s+/).filter(Boolean).length >= 3;
}

const SRC = {
    DIRECT_V4: {
        ipip: {
            url: 'https://myip.ipip.net/json', parse: (r) => {
                const j = json(r.data, {});
                const loc = j?.data?.location || [];
                const flag = flagOfCC(loc[0] === '中国' ? 'CN' : loc[0]);
                return {
                    ip: j?.data?.ip || '',
                    loc: join([flag, loc[0], loc[1], loc[2]], ' ').replace(/\s*中国\s*/, ''),
                    isp: loc[4] || ''
                };
            }
        },
        cip: {
            url: 'http://cip.cc/', parse: (r) => {
                const b = String(r.data || '');
                const ip = (b.match(/IP.*?:\s*(\S+)/) || [])[1] || '';
                const addr = (b.match(/地址.*?:\s*(.+)/) || [])[1] || '';
                const isp = (b.match(/运营商.*?:\s*(.+)/) || [])[1] || '';
                const isCN = /中国/.test(addr);
                return {
                    ip,
                    loc: join([flagOfCC(isCN ? 'CN' : ''), addr.replace(/中国\s*/, '')], ' '),
                    isp: isp.replace(/中国\s*/, '')
                };
            }
        },
        '163': {
            url: 'https://dashi.163.com/fgw/mailsrv-ipdetail/detail', parse: (r) => {
                const d = json(r.data, {})?.result || {};
                return {
                    ip: d.ip || '',
                    loc: join([flagOfCC(d.countryCode), d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                    isp: d.isp || d.org || ''
                };
            }
        },
        bilibili: {
            url: 'https://api.bilibili.com/x/web-interface/zone', parse: (r) => {
                const d = json(r.data, {})?.data || {};
                const flag = flagOfCC(d.country === '中国' ? 'CN' : d.country);
                return {
                    ip: d.addr || '',
                    loc: join([flag, d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                    isp: d.isp || ''
                };
            }
        },
        '126': {
            url: 'https://ipservice.ws.126.net/locate/api/getLocByIp', parse: (r) => {
                const d = json(r.data, {})?.result || {};
                return {
                    ip: d.ip || '',
                    loc: join([flagOfCC(d.countrySymbol), d.country, d.province, d.city], ' ').replace(/\s*中国\s*/, ''),
                    isp: d.operator || ''
                };
            }
        },
        pingan: {
            url: 'https://rmb.pingan.com.cn/itam/mas/linden/ip/request', parse: (r) => {
                const d = json(r.data, {})?.data || {};
                return {
                    ip: d.ip || '',
                    loc: join([flagOfCC(d.countryIsoCode), d.country, d.region, d.city], ' ').replace(/\s*中国\s*/, ''),
                    isp: d.isp || ''
                };
            }
        }
    },
    DIRECT_V4_FALLBACK: {
        url: 'https://api-ipv4.ip.sb/geoip', parse: (r) => {
            const j = json(r.data, {});
            return {
                ip: j.ip || '',
                loc: join([flagOfCC(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
                isp: j.isp || j.organization || ''
            };
        }
    },
    LANDING_V4: {
        ipwhois: {
            url: 'https://ipwhois.app/widget.php?lang=zh-CN', parse: (r) => {
                const j = json(r.data, {});
                return {
                    ip: j.ip || '',
                    loc: join([flagOfCC(j.country_code), j.country?.replace(/\s*中国\s*/, ''), j.region, j.city], ' '),
                    isp: (j?.connection?.isp) || ''
                };
            }
        },
        ipsb: {
            url: 'https://api-ipv4.ip.sb/geoip', parse: (r) => {
                const j = json(r.data, {});
                return {
                    ip: j.ip || '',
                    loc: join([flagOfCC(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
                    isp: j.isp || j.organization || ''
                };
            }
        },
        ipapi: {
            url: 'http://ip-api.com/json?lang=zh-CN', parse: (r) => {
                const j = json(r.data, {});
                return {
                    ip: j.query || '',
                    loc: join([flagOfCC(j.countryCode), j.country?.replace(/\s*中国\s*/, ''), (j.regionName || '').split(/\s+or\s+/)[0], j.city], ' '),
                    isp: j.isp || j.org || ''
                };
            }
        }
    },
    DIRECT_V6: {
        ddnspod: 'https://ipv6.ddnspod.com',
        neu6: 'https://speed.neu6.edu.cn/getIP.php',
        ident: 'https://v6.ident.me',
        ipify: 'https://api6.ipify.org',
        ipsb: 'https://api-ipv6.ip.sb/ip'
    },
    LANDING_V6: {ident: 'https://v6.ident.me', ipify: 'https://api6.ipify.org', ipsb: 'https://api-ipv6.ip.sb/ip'}
};

const ORDER = {
    directV4: ['cip', '163', '126', 'bilibili', 'pingan', 'ipip'],
    landingV4: ['ipwhois', 'ipsb', 'ipapi'],
    directV6: ['ddnspod', 'neu6', 'ident', 'ipify', 'ipsb'],
    landingV6: ['ident', 'ipify', 'ipsb']
};

function orderWithPrefer(pref, list) {
    return [pref, ...list].filter((x, i, a) => x && a.indexOf(x) === i);
}

async function trySources(order, map, {tag, needCity = false, perTo = 1800}) {
    log('info', tag, 'begin', JSON.stringify(order));
    let firstOK = null;
    for (const k of order) {
        if (!budgetGuard(tag + ':' + k, 350)) break;
        const def = map[k];
        if (!def) continue;
        const t = Date.now();
        try {
            const r = await get(def.url, {timeout: perTo});
            const out = def.parse(r) || {};
            const ok = !!out.ip;
            const city = ok && hasCity(out.loc);
            log('debug', tag, 'try', JSON.stringify({
                k,
                ok,
                city,
                ip: maskIP(out.ip || ''),
                loc: out.loc || '',
                isp: out.isp || '',
                cost: Date.now() - t
            }));
            if (ok && !firstOK) firstOK = out;
            if (!needCity && ok) return out;
            if (needCity && ok && city) return out;
        } catch (e) {
            log('warn', tag, 'fail', k, String(e));
        }
    }
    if (firstOK) {
        log('info', tag, 'fallback firstOK', JSON.stringify({ip: maskIP(firstOK.ip || ''), loc: firstOK.loc || ''}));
        return firstOK;
    }
    return {};
}

// IPv6 一次性竞速（无重试）
const V6_COOL_KEY = K('V6_COOL_UNTIL');

function v6Cooling() {
    return Date.now() < n(KV.read(V6_COOL_KEY), 0);
}

async function oneShotV6(order) {
    const to = Math.min(Math.max(C.HTTP_MIN_TO, CFG.SD_TIMEOUT_MS), C.V6_ONE_SHOT_MS);
    for (const k of order) {
        const u = SRC.DIRECT_V6[k];
        if (!u) continue;
        const r = await Promise.race([get(u, {timeout: to}).then(x => ({
            ok: true,
            body: String(x.data || '').trim()
        })).catch(() => ({ok: false})), new Promise(res => setTimeout(() => res({ok: false}), to))]);
        if (r.ok && r.body) return {ip: r.body};
    }
    const until = Date.now() + C.V6_COOL_MS;
    KV.write(V6_COOL_KEY, String(until));
    log('warn', 'v6 all fail, cool until', new Date(until).toISOString());
    return {};
}

// 直连/落地取数
async function getDirectV4(pref) {
    let res = await trySources(orderWithPrefer(pref, ORDER.directV4), SRC.DIRECT_V4, {
        tag: 'DirectV4',
        needCity: true,
        perTo: 1800
    });
    if (!res || !res.ip) {
        try {
            const r = await get(SRC.DIRECT_V4_FALLBACK.url, {timeout: 1500});
            res = SRC.DIRECT_V4_FALLBACK.parse(r) || {};
        } catch {
            res = {};
        }
    }
    if (res.ip && !isIPv4(res.ip)) {
        try {
            const r = await get(SRC.DIRECT_V4_FALLBACK.url, {timeout: 1500});
            const fix = SRC.DIRECT_V4_FALLBACK.parse(r) || {};
            if (isIPv4(fix.ip)) res = fix; else res.ip = '';
        } catch {
        }
    }
    return res;
}

async function getDirectV6(pref) {
    if (!(CFG.IPv6 && ($network?.v6?.primaryAddress) && !v6Cooling())) return {};
    return oneShotV6(orderWithPrefer(pref, ORDER.directV6));
}

async function getLandingV4(pref) {
    const r = await trySources(orderWithPrefer(pref, ORDER.landingV4), SRC.LANDING_V4, {
        tag: 'LandingV4',
        needCity: false,
        perTo: 1800
    });
    if (r && r.ip) return r;
    for (const k of ORDER.landingV4.filter(x => x !== pref)) {
        if (!budgetGuard('LandingV4:' + k, 500)) break;
        try {
            const out = SRC.LANDING_V4[k].parse(await get(SRC.LANDING_V4[k].url, {timeout: 1500})) || {};
            if (out.ip) return out;
        } catch {
        }
    }
    return {};
}

async function getLandingV6(pref) {
    if (!(CFG.IPv6 && ($network?.v6?.primaryAddress) && !v6Cooling())) return {};
    return oneShotV6(orderWithPrefer(pref, ORDER.landingV6));
}

// ====================== 入口/策略解析 ======================
const ENT_RE = /(ipwhois\.app|ip\.sb|ip-api\.com|ipinfo\.io|ident\.me|ipify\.org|ifconfig\.co)/i;

function grabIP(s) {
    s = String(s || '').replace(/\(Proxy\)/i, '');
    let m = s.match(/\[([0-9a-fA-F:]+)]/);
    if (m && isIPv6(m[1])) return m[1];
    m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (m && isIPv4(m[1])) return m[1];
    m = s.match(/([0-9a-fA-F:]{2,})/);
    if (m && isIPv6(m[1])) return m[1];
    return '';
}

async function getPolicyAndEntrance(to = 900) {
    const d = await httpAPI('/v1/requests/recent', to).catch(() => ({}));
    const reqs = Array.isArray(d?.requests) ? d.requests : [];
    const hits = reqs.slice(0, 150).filter(i => ENT_RE.test(i.URL || ''));
    let policy = '', ip4 = '', ip6 = '';
    for (const i of hits) {
        if (!policy && i.policyName) policy = i.policyName;
        const ip = grabIP(i.remoteAddress || '');
        if (isIPv6(ip) && !ip6) ip6 = ip; else if (isIPv4(ip) && !ip4) ip4 = ip;
        if (policy && ip4 && ip6) break;
    }
    if (!policy && !ip4 && !ip6) {
        try {
            const d2 = await httpAPI('/v1/requests/recent', Math.min(700, to));
            const rs = Array.isArray(d2?.requests) ? d2.requests : [];
            const hit = rs.find(i => /\(Proxy\)/.test(i.remoteAddress || '') && i.policyName);
            if (hit) {
                policy = hit.policyName;
                const eip = grabIP(hit.remoteAddress);
                if (eip) (isIPv6(eip) ? (ip6 = eip) : (ip4 = eip));
            }
        } catch {
        }
    }
    return {policy, ip4, ip6};
}

const ENT_TTL = Math.max(C.ENT_TTL_MIN, Math.min(CFG.Update || 10, C.ENT_TTL_MAX));
let ENT_CACHE = {ip: '', t: 0, data: null};
const LOC_PROVIDERS = {
    pingan: async (ip) => {
        const r = await get('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip=' + encodeURIComponent(ip), {timeout: Math.min(CFG.SD_TIMEOUT_MS, 1800)});
        const d = json(r.data, {})?.data || {};
        if (!d || (!d.countryIsoCode && !d.country)) throw 'pingan-empty';
        return {
            loc: join([flagOfCC(d.countryIsoCode), d.country, d.region, d.city], ' ').replace(/\s*中国\s*/, ''),
            isp: d.isp || ''
        };
    },
    ipapi: async (ip) => {
        const r = await get(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {timeout: Math.min(CFG.SD_TIMEOUT_MS, 1600)});
        const j = json(r.data, {});
        if (j.status !== 'success') throw 'ipapi-fail';
        return {
            loc: join([flagOfCC(j.countryCode), j.country?.replace(/\s*中国\s*/, ''), (j.regionName || '').split(/\s+or\s+/)[0], j.city], ' '),
            isp: j.isp || j.org || j.as || ''
        };
    },
    ipwhois: async (ip) => {
        const r = await get(`https://ipwhois.app/json/${encodeURIComponent(ip)}?lang=zh-CN`, {timeout: Math.min(CFG.SD_TIMEOUT_MS, 1800)});
        const j = json(r.data, {});
        if (j.success === false || (!j.country && !j.country_code)) throw 'ipwhois-fail';
        return {
            loc: join([flagOfCC(j.country_code), j.country?.replace(/\s*中国\s*/, ''), j.region, j.city], ' '),
            isp: (j.connection && j.connection.isp) || j.org || ''
        };
    },
    ipsb: async (ip) => {
        const r = await get(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {timeout: Math.min(CFG.SD_TIMEOUT_MS, 1800)});
        const j = json(r.data, {});
        if (!j || (!j.country && !j.country_code)) throw 'ipsb-fail';
        return {
            loc: join([flagOfCC(j.country_code), j.country, j.region, j.city], ' ').replace(/\s*中国\s*/, ''),
            isp: j.isp || j.organization || ''
        };
    }
};

async function locateEntrance(ip) {
    const now = Date.now();
    const fresh = (ENT_CACHE.ip === ip) && ((now - ENT_CACHE.t) < ENT_TTL * 1000) && ENT_CACHE.data;
    if (fresh) {
        log('info', 'Entrance cache HIT', {ip: maskIP(ip)});
        return ENT_CACHE.data;
    }
    if (!budgetGuard('Entrance locate', 1000)) return {ip};
    const p1 = LOC_PROVIDERS.pingan(ip).catch(() => null);
    const p2 = (async () => {
        try {
            return await LOC_PROVIDERS.ipapi(ip);
        } catch {
        }
        try {
            return await LOC_PROVIDERS.ipwhois(ip);
        } catch {
        }
        try {
            return await LOC_PROVIDERS.ipsb(ip);
        } catch {
        }
        return null;
    })();
    const [a, b] = await Promise.all([p1, p2]);
    const res = {ip, loc1: a?.loc || '', isp1: a?.isp || '', loc2: b?.loc || '', isp2: b?.isp || ''};
    ENT_CACHE = {ip, t: now, data: res};
    return res;
}

// ====================== 网络标题 ======================
function radioGen(r) {
    if (!r) return '';
    const x = String(r).toUpperCase().replace(/\s+/g, '');
    const alias = {NR5G: 'NR', NRSA: 'NR', NRNSA: 'NRNSA', LTEA: 'LTE', 'LTE+': 'LTE', LTEPLUS: 'LTE'};
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

function netTitle() {
    try {
        const n = $network || {};
        const ssid = n.wifi?.ssid;
        if (ssid) return `Wi-Fi | ${ssid}`;
        const r = (n.cellular?.radio) || (n['cellular-data']?.radio);
        if (r) return `蜂窝网络 | ${radioGen(r) ? `${radioGen(r)} - ${r}` : r}`;
        const iface = n.v4?.primaryInterface || n.v6?.primaryInterface || '';
        if (/^pdp/i.test(iface)) return '蜂窝网络 | -';
        if (/^(en|eth|wlan)/i.test(iface)) return 'Wi-Fi | -';
    } catch {
    }
    return '网络 | 未知';
}

// ====================== 服务检测（表驱动） ======================
const ICON_THEME = ((CFG.SD_ICON_THEME || 'check') === 'lock') ? {
    full: '🔓',
    partial: '🔐',
    blocked: '🔒'
} : ((CFG.SD_ICON_THEME || 'check') === 'circle') ? {full: '⭕️', partial: '⛔️', blocked: '🚫'} : {
    full: '✅',
    partial: '❇️',
    blocked: '❎'
};

function renderLine({name, ok, cc, cost, status, tag, state}) {
    const st = state || (ok ? ((/自制|自製|original/i.test(tag) || /部分/.test(tag)) ? 'partial' : 'full') : 'blocked');
    const head = (CFG.SD_STYLE === 'text') ? `${name}: ${st === 'full' ? '已解锁' : st === 'partial' ? '部分解锁' : '不可达'}` : `${ICON_THEME[st]} ${name}`;
    const region = cc ? renderRegion(cc) : '-';
    const left = (CFG.SD_STYLE === 'text' && !CFG.SD_ARROW) ? `${head} ｜ 区域: ${region}` : `${head} ${CFG.SD_STYLE === 'text' ? '➟' : '➟'} ${region}`;
    const tail = [tag || '', CFG.SD_SHOW_LAT && cost != null ? `${cost}ms` : '', CFG.SD_SHOW_HTTP && status > 0 ? `HTTP ${status}` : ''].filter(Boolean).join(' ｜ ');
    return tail ? `${left} ｜ ${tail}` : left;
}

async function qLandingCC() { // 多源兜底
    let r = await get('https://api.ip.sb/geoip');
    if (r.ok && r.status === 200) {
        try {
            const j = json(r.data, {});
            if (j.country_code) return j.country_code.toUpperCase();
        } catch {
        }
    }
    r = await get('https://ipinfo.io/json');
    if (r.ok && r.status === 200) {
        try {
            const j = json(r.data, {});
            if (j.country) return j.country.toUpperCase();
        } catch {
        }
    }
    r = await get('https://ifconfig.co/json', {headers: {'Accept-Language': 'en'}});
    if (r.ok && r.status === 200) {
        try {
            const j = json(r.data, {});
            if (j.country_iso) return j.country_iso.toUpperCase();
        } catch {
        }
    }
    r = await get('http://ip-api.com/json');
    if (r.ok && r.status === 200) {
        try {
            const j = json(r.data, {});
            if (j.countryCode) return j.countryCode.toUpperCase();
        } catch {
        }
    }
    return '';
}

const T = (CFG.SD_LANG === 'zh-hant') ? {
    yt: 'YouTube',
    gpt_app: 'ChatGPT',
    gpt_web: 'ChatGPT Web',
    nf: 'Netflix',
    dis: 'Disney+',
    hu_us: 'Hulu(美)',
    hu_jp: 'Hulu(日)',
    hbo: 'Max(HBO)'
} : {
    yt: 'YouTube',
    gpt_app: 'ChatGPT',
    gpt_web: 'ChatGPT Web',
    nf: 'Netflix',
    dis: 'Disney+',
    hu_us: 'Hulu(美)',
    hu_jp: 'Hulu(日)',
    hbo: 'Max(HBO)'
};

const Tests = {
    yt: async () => {
        if (!budgetGuard('SD YT', 400)) return `${T.yt}: 已降级（预算不足）`;
        const r = await get('https://www.youtube.com/premium?hl=en');
        if (!r.ok) return renderLine({name: T.yt, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        let cc = 'US';
        try {
            let m = r.data.match(/"countryCode":"([A-Z]{2})"/) || r.data.match(/INNERTUBE_CONTEXT_GL"\s*:\s*"([A-Z]{2})"/) || r.data.match(/"GL"\s*:\s*"([A-Z]{2})"/);
            if (m) cc = m[1];
        } catch {
        }
        return renderLine({name: T.yt, ok: true, cc, cost: r.cost, status: r.status});
    },
    gpt_web: async () => {
        if (!budgetGuard('SD GPT_WEB', 400)) return `${T.gpt_web}: 已降级（预算不足）`;
        const r = await get('https://chatgpt.com/cdn-cgi/trace');
        if (!r.ok) return renderLine({name: T.gpt_web, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        let cc = '';
        try {
            const m = r.data.match(/loc=([A-Z]{2})/);
            if (m) cc = m[1];
        } catch {
        }
        return renderLine({name: T.gpt_web, ok: true, cc, cost: r.cost, status: r.status});
    },
    gpt_app: async () => {
        if (!budgetGuard('SD GPT_APP', 400)) return `${T.gpt_app}: 已降级（预算不足）`;
        const r = await get('https://api.openai.com/v1/models');
        if (!r.ok) return renderLine({name: T.gpt_app, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        let cc = (r.headers['cf-ipcountry'] || r.headers['CF-IPCountry'] || '').toString().toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) cc = await qLandingCC();
        return renderLine({name: T.gpt_app, ok: true, cc, cost: r.cost, status: r.status});
    },
    nf: async () => {
        if (!budgetGuard('SD NF', 800)) return `${T.nf}: 已降级（预算不足）`;
        const getNF = (id) => get(`https://www.netflix.com/title/${id}`);
        const ORIG = '80018499', NON = '81280792';
        const r1 = await getNF(NON);
        if (!r1.ok) return renderLine({name: T.nf, ok: false, cost: r1.cost, status: r1.status, tag: '检测失败'});
        if (r1.status === 403) return renderLine({
            name: T.nf,
            ok: false,
            cost: r1.cost,
            status: r1.status,
            tag: '区域受限'
        });
        if (r1.status === 404) {
            const r2 = await getNF(ORIG);
            if (!r2.ok) return renderLine({name: T.nf, ok: false, cost: r2.cost, status: r2.status, tag: '检测失败'});
            if (r2.status === 404) return renderLine({
                name: T.nf,
                ok: false,
                cost: r2.cost,
                status: r2.status,
                tag: '区域受限'
            });
            const cc = (((r2.headers['x-originating-url'] || '') + '').match(/\/([A-Z]{2})(?:[-/]|$)/i) || [])[1]?.toUpperCase() || ((r2.data || '').match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || [])[1] || '';
            return renderLine({
                name: T.nf,
                ok: true,
                cc,
                cost: r2.cost,
                status: r2.status,
                tag: '仅解锁自制剧',
                state: 'partial'
            });
        }
        if (r1.status === 200) {
            const cc = (((r1.headers['x-originating-url'] || '') + '').match(/\/([A-Z]{2})(?:[-/]|$)/i) || [])[1]?.toUpperCase() || ((r1.data || '').match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || [])[1] || '';
            return renderLine({
                name: T.nf,
                ok: true,
                cc,
                cost: r1.cost,
                status: r1.status,
                tag: '已完整解锁',
                state: 'full'
            });
        }
        return renderLine({name: T.nf, ok: false, cost: r1.cost, status: r1.status, tag: `HTTP ${r1.status}`});
    },
    dis: async () => {
        if (!budgetGuard('SD DIS', 700)) return `${T.dis}: 已降级（预算不足）`;
        const home = async () => {
            const r = await get('https://www.disneyplus.com/', {headers: {'Accept-Language': 'en'}});
            if (!r.ok || r.status !== 200 || /not\s*available/i.test(r.data || '')) throw 'NA';
            let cc = '';
            try {
                const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
                if (m) cc = m[1];
            } catch {
            }
            return {cc, cost: r.cost, status: r.status};
        };
        const bam = async () => {
            const headers = {
                'Accept-Language': 'en',
                'Authorization': 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
                'Content-Type': 'application/json'
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
                        deviceFamily: 'browser',
                        deviceLanguage: 'en',
                        deviceProfile: 'macosx'
                    }
                }
            });
            const r = await post('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', {headers, body});
            if (!r.ok || r.status !== 200) throw 'NA';
            const d = json(r.data, {});
            if (d?.errors) throw 'NA';
            const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
            const cc = d?.extensions?.sdk?.session?.location?.countryCode;
            return {inLoc, cc, cost: r.cost, status: r.status};
        };
        try {
            const h = await Promise.race([home(), new Promise((_, rej) => setTimeout(() => rej('TO'), 6500))]);
            const b = await Promise.race([bam(), new Promise((_, rej) => setTimeout(() => rej('TO'), 6500))]).catch(() => ({}));
            const blocked = (b && b.inLoc === false);
            const cc = blocked ? '' : (b?.cc || h?.cc || (await qLandingCC()) || '');
            return renderLine({
                name: T.dis,
                ok: !blocked,
                cc,
                cost: (b?.cost || h?.cost || 0),
                status: (b?.status || h?.status || 0),
                tag: blocked ? '区域受限' : ''
            });
        } catch (e) {
            return renderLine({
                name: T.dis,
                ok: false,
                cc: '',
                cost: null,
                status: 0,
                tag: e === 'TO' ? '超时' : '检测失败'
            });
        }
    },
    hu_us: async () => {
        if (!budgetGuard('SD HuluUS', 400)) return `${T.hu_us}: 已降级（预算不足）`;
        const r = await get('https://www.hulu.com/');
        if (!r.ok) return renderLine({name: T.hu_us, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || '');
        return renderLine({
            name: T.hu_us,
            ok: !blocked,
            cc: blocked ? '' : 'US',
            cost: r.cost,
            status: r.status,
            tag: blocked ? '区域受限' : ''
        });
    },
    hu_jp: async () => {
        if (!budgetGuard('SD HuluJP', 400)) return `${T.hu_jp}: 已降级（预算不足）`;
        const r = await get('https://www.hulu.jp/', {headers: {'Accept-Language': 'ja'}});
        if (!r.ok) return renderLine({name: T.hu_jp, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || '');
        return renderLine({
            name: T.hu_jp,
            ok: !blocked,
            cc: blocked ? '' : 'JP',
            cost: r.cost,
            status: r.status,
            tag: blocked ? '区域受限' : ''
        });
    },
    hbo: async () => {
        if (!budgetGuard('SD HBO', 400)) return `${T.hbo}: 已降级（预算不足）`;
        const r = await get('https://www.max.com/');
        if (!r.ok) return renderLine({name: T.hbo, ok: false, cost: r.cost, status: r.status, tag: '不可达'});
        const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || '');
        let cc = '';
        try {
            const m = String(r.data || '').match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
            if (m) cc = m[1].toUpperCase();
        } catch {
        }
        if (!cc) cc = await qLandingCC();
        return renderLine({
            name: T.hbo,
            ok: !blocked,
            cc: blocked ? '' : cc,
            cost: r.cost,
            status: r.status,
            tag: blocked ? '区域受限' : ''
        });
    }
};

function parseServices(raw) {
    if (raw == null) return [];
    try {
        const arr = JSON.parse(String(raw).trim());
        if (Array.isArray(arr)) return arr;
    } catch {
    }
    return String(raw || '').split(/[，,;|\/\s]+/).filter(Boolean);
}

function mapSvcName(x) {
    x = String(x || '').toLowerCase();
    const a = {
        yt: 'yt',
        youtube: 'yt',
        'youtube premium': 'yt',
        '油管': 'yt',
        nf: 'nf',
        netflix: 'nf',
        '奈飞': 'nf',
        '奈飛': 'nf',
        disney: 'dis',
        'disney+': 'dis',
        '迪士尼': 'dis',
        chatgpt: 'gpt_app',
        gpt: 'gpt_app',
        openai: 'gpt_app',
        'chatgpt web': 'gpt_web',
        chatgpt_web: 'gpt_web',
        hulu: 'hu_us',
        hulujp: 'hu_jp',
        huluus: 'hu_us',
        '葫芦': 'hu_us',
        '葫蘆': 'hu_us',
        hbo: 'hbo',
        max: 'hbo'
    };
    return a[x] || x;
}

function pickServices() {
    const hasBox = CFG.SERVICES_BOX != null;
    const cands = hasBox ? [[CFG.SERVICES_BOX, 'box'], [CFG.SERVICES_TEXT, 'text'], [CFG.SERVICES_ARG, 'arg']] : [[CFG.SERVICES_TEXT, 'text'], [CFG.SERVICES_ARG, 'arg']];
    for (const [raw, _] of cands) {
        const arr = parseServices(raw).map(mapSvcName).filter(k => Tests[k]);
        if (arr.length) return arr.filter((v, i, a) => a.indexOf(v) === i);
    }
    return ['yt', 'nf', 'dis', 'gpt_app', 'gpt_web', 'hu_us', 'hu_jp', 'hbo'];
}

// ====================== 预触发 ======================
function preTouch() {
    get('https://api.ip.sb/geoip', {timeout: C.PRETOUCH_TO, followRedirect: false}).catch(() => {
    });
    if (CFG.IPv6 && ($network?.v6?.primaryAddress) && !v6Cooling()) get('https://v6.ident.me', {
        timeout: Math.min(C.PRETOUCH_TO, C.V6_ONE_SHOT_MS),
        followRedirect: false
    }).catch(() => {
    });
}

// ====================== 渲染 & 完成 ======================
function pushTitle(buf, title) {
    for (let i = 0; i < CFG.GAP_LINES; i++) buf.push('');
    buf.push(renderSub(title));
}

function ispNormalize(isp, locStr) {
    const raw = String(isp || '').trim();
    if (!raw) return '';
    const txt = String(locStr || '');
    const isCN = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt);
    if (!isCN) return raw;
    const norm = raw.replace(/\s*\(中国\)\s*/, '').replace(/\s+/g, ' ').trim();
    const s = norm.toLowerCase();
    if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm)) return '中国移动';
    if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm)) return '中国电信';
    if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm)) return '中国联通';
    if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm)) return '中国广电';
    if (/cernet|china\s*education/.test(s) || /教育网/.test(norm)) return '中国教育网';
    return norm;
}

function zhHans2Hant(s) {
    // 这里用正确的大小写：前面归一化成了 'zh-Hant'
    if (CFG.SD_LANG !== 'zh-Hant') return s;

    // 长词优先：避免与短词重叠导致二次替换
    const phrasePairs = [
        ["蜂窝网络", "行動服務"],
        ["执行时间", "執行時間"],
        ["落地 IP", "落地 IP"],
        ["中国香港", "中國香港"],
        ["中国澳门", "中國澳門"],
        ["中国移动", "中國移動"],
        ["中国联通", "中國聯通"],
        ["中国电信", "中國電信"],
        ["中国广电", "中國廣電"],
        ["中国教育网", "中國教育網"],
        ["部分解锁", "部分解鎖"],
        ["已完整解锁", "已完整解鎖"],
        ["仅解锁自制剧", "僅解鎖自製劇"],
        ["检测失败", "檢測失敗"],
        ["区域受限", "區域受限"],
        ["不可达", "不可達"],
        ["已解锁", "已解鎖"],
        ["区域", "區域"],
        ["入口", "入口"],
        ["位置", "位置"],
        ["运营商", "運營商"],
        ["网络", "網路"]
    ];
    // 如需稳妥，可再按长度降序排一遍（上面已手动调序）
    // phrasePairs.sort((a,b) => b[0].length - a[0].length);

    for (const [a, b] of phrasePairs) {
        s = s.replace(new RegExp(a, 'g'), b);
    }

    // 避免与回调参数同名
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
        '广': '廣',
        '电': '電',
        '联': '聯',
        '动': '動',
        '数': '數',
        '宁': '寧'
    };

    // 回调参数改个名字，比如 c
    return s.replace(/[\u4E00-\u9FFF]/g, c => charMap[c] || c);
}

// ====================== 主流程 ======================
(async () => {
    log('info', 'Start', JSON.stringify({
        VER,
        Update: CFG.Update,
        Timeout: CFG.Timeout,
        IPv6: CFG.IPv6,
        LANG: CFG.SD_LANG,
        STYLE: CFG.SD_STYLE
    }));
    preTouch();

    const [d4, d6] = await Promise.all([
        getDirectV4(CFG.DOMESTIC_IPv4).catch(() => ({})),
        (CFG.IPv6 && ($network?.v6?.primaryAddress) && !v6Cooling() && budgetGuard('DirectV6', 600)) ? getDirectV6(CFG.DOMESTIC_IPv6).catch(() => ({})) : Promise.resolve({})
    ]);
    log('info', 'Direct fetched', {v4: maskIP(d4.ip || ''), v6: maskIP(d6.ip || '')});

    let policy = '', e4 = '', e6 = '';
    if (budgetGuard('Entrance both', 800)) {
        const ent = await getPolicyAndEntrance(900).catch(() => ({}));
        policy = ent.policy || '';
        e4 = ent.ip4 || '';
        e6 = ent.ip6 || '';
        log('info', 'EntranceBoth', {policy: policy || '-', v4: maskIP(e4 || ''), v6: maskIP(e6 || '')});
    }

    const ent4 = (e4 && isIPv4(e4) && budgetGuard('Entrance v4 bundle', 900)) ? await locateEntrance(e4).catch(() => ({ip: e4})) : {};
    const ent6 = (e6 && isIPv6(e6) && budgetGuard('Entrance v6 bundle', 900)) ? await locateEntrance(e6).catch(() => ({ip: e6})) : {};

    const [px4, px6] = await Promise.all([
        budgetGuard('Landing v4', 900) ? getLandingV4(CFG.LANDING_IPv4).catch(() => ({})) : Promise.resolve({}),
        (CFG.IPv6 && ($network?.v6?.primaryAddress) && !v6Cooling() && budgetGuard('Landing v6', 600)) ? getLandingV6(CFG.LANDING_IPv6).catch(() => ({})) : Promise.resolve({})
    ]);

    const parts = [];
    const title = netTitle();
    parts.push(`执行时间: ${nowTime()}`);
    parts.push(`代理策略: ${policy || '-'}`);
    if (v6Cooling()) parts.push('调试: IPv6 冷却中');

    // 本地
    pushTitle(parts, '本地');
    if (d4.ip) parts.push(`IPv4: ${maskIP(d4.ip)}`);
    if (d6.ip) parts.push(`IPv6: ${maskIP(d6.ip)}`);
    const dloc = d4.loc ? (CFG.MASK_POS ? onlyFlag(d4.loc) : flagFirst(d4.loc)) : '-';
    parts.push(`位置: ${dloc}`);
    if (d4.isp) parts.push(`运营商: ${ispNormalize(d4.isp, d4.loc)}`);

    // 入口
    if (ent4.ip || ent6.ip || ent4.loc1 || ent4.loc2) {
        pushTitle(parts, '入口');
        if (ent4.ip) parts.push(`IPv4: ${maskIP(ent4.ip)}`);
        if (ent6.ip) parts.push(`IPv6: ${maskIP(ent6.ip)}`);
        if (ent4.loc1) parts.push(`位置¹: ${flagFirst(ent4.loc1)}`);
        if (ent4.isp1) parts.push(`运营商¹: ${ispNormalize(ent4.isp1, ent4.loc1)}`);
        if (ent4.loc2) parts.push(`位置²: ${flagFirst(ent4.loc2)}`);
        if (ent4.isp2) parts.push(`运营商²: ${ent4.isp2}`);
    }

    // 落地
    if (px4.ip || px6.ip || px4.loc || px4.isp) {
        pushTitle(parts, '落地');
        if (px4.ip) parts.push(`IPv4: ${maskIP(px4.ip)}`);
        if (px6.ip) parts.push(`IPv6: ${maskIP(px6.ip)}`);
        if (px4.loc) parts.push(`位置: ${flagFirst(px4.loc)}`);
        if (px4.isp) parts.push(`运营商: ${ispNormalize(px4.isp, px4.loc)}`);
    }

    // 服务检测（预算感知）
    const lines = await (async () =>
            budgetGuard('ServiceChecks', 2000)
                ? (async () => {
                    let order = pickServices();
                    if (leftBudget() < 5000) order = order.filter(x => ['yt', 'nf', 'gpt_app', 'gpt_web'].includes(x));
                    return Promise.all(order.map(k => Tests[k]()));
                })()
                : ['调试: 已降级（预算不足）']
    )();
    if (lines.length) {
        pushTitle(parts, '服务检测');
        parts.push(...lines.filter(Boolean));
    }

    // 调试尾巴
    if (LOG_TO_PANEL && RING.length) {
        pushTitle(parts, '调试');
        parts.push(RING.slice(-C.DEBUG_TAIL).join('\n'));
    }

    const content = zhHans2Hant(parts.join('\n'));
    $done({title: zhHans2Hant(title), content, icon: ICON_NAME, 'icon-color': ICON_COLOR});

})().catch(err => {
    const msg = String(err);
    pushErr('网络信息 𝕏', msg);
    $done({title: '网络信息 𝕏', content: zhHans2Hant(msg), icon: ICON_NAME, 'icon-color': ICON_COLOR});
});