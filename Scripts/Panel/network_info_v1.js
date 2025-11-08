/* =========================================================
 * 网络信息 + 服务检测（BoxJS/Surge/Loon/QuanX/Egern 兼容）
 * by ByteValley (merged & patched by ChatGPT)
 * Version: 2025-11-08 (t() 工程化 + S2T 兜底)
 *
 * 选择优先级（统一）：
 *   BoxJS 勾选(NetworkInfo_SERVICES) > BoxJS 文本(NetworkInfo_SERVICES_TEXT)
 *   > 模块 #!arguments（SERVICES=...）> 代码默认（全部）
 *
 * - 标题显示网络类型；第一行显示代理策略
 * - 直连/入口/落地 IP 与位置（直连位置可脱敏为仅旗帜；默认跟随 MASK_IP）
 * - 中国境内运营商规范化
 * - 服务检测并发执行，Netflix“完整/自制剧”，其它服务“已解锁/不可达”
 * - 台湾旗模式：TW_FLAG_MODE=0(🇨🇳)/1(🇹🇼)/2(🇼🇸)
 * - 入口/策略获取：预触发落地请求→重试(指数退避)→任意代理请求兜底
 * - 可调：
 *   · SD_ICON_THEME: lock|circle|check（三态图标主题）
 *   · SD_REGION_MODE: full|abbr|flag（地区显示样式）
 *   · SD_ARROW: 是否使用“➟”连接服务名与地区（icon/text 共用）
 *   · ChatGPT App(API) 地区多源回退，优先 CF 头
 * =======================================================*/

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
    // 状态/检测
    unlocked: "已解锁",
    partialUnlocked: "部分解锁",
    notReachable: "不可达",
    timeout: "超时",
    fail: "检测失败",
    regionBlocked: "区域受限",
    nfFull: "已完整解锁",
    nfOriginals: "仅解锁自制剧"
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
    // 狀態/檢測
    unlocked: "已解鎖",
    partialUnlocked: "部分解鎖",
    notReachable: "不可達",
    timeout: "逾時",
    fail: "檢測失敗",
    regionBlocked: "區域受限",
    nfFull: "已完整解鎖",
    nfOriginals: "僅解鎖自製劇"
  }
};
/* t() 取词工具 */
function t(key, ...args){
  const lang = (typeof SD_LANG==="string" ? SD_LANG : "zh-Hans");
  const pack = SD_STR[lang] || SD_STR["zh-Hans"];
  const val = pack[key];
  if (typeof val === "function") return val(...args);
  return (val != null) ? val : key;
}

/* ===== Compat shim: Surge / Loon / QuanX / BoxJS ===== */
const readKV = k => {
  if (typeof $persistentStore !== 'undefined' && $persistentStore.read) return $persistentStore.read(k);
  if (typeof $prefs !== 'undefined' && $prefs.valueForKey) return $prefs.valueForKey(k);
  try { return (typeof localStorage !== 'undefined') ? localStorage.getItem(k) : null; } catch (_) { return null; }
};

// 解析 $argument（支持字符串/对象）
const parseArgs = raw => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    return raw.split('&').reduce((acc, kv) => {
      if (!kv) return acc;
      const [k, v = ''] = kv.split('=');
      const key = decodeURIComponent(k || '');
      const val = decodeURIComponent(String(v).replace(/\+/g, '%20'));
      acc[key] = val;
      return acc;
    }, {});
  }
  return {};
};
const $args = parseArgs(typeof $argument !== 'undefined' ? $argument : undefined);

// 兜底从原始 $argument 字符串读取指定参数（仅在对象无值时用）
function readArgRaw(name){
  try{
    if (typeof $argument === 'string') {
      const re = new RegExp(`(?:^|&)${name}=([^&]*)`);
      const m = $argument.match(re);
      if (m) return decodeURIComponent(String(m[1]).replace(/\+/g, '%20'));
    }
  }catch(_){}
  return undefined;
}

// 辅助转换
const toBool = (v, d=false) => {
  if (v === undefined || v === null || v === '') return d;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1','true','on','yes','y'].includes(s)) return true;
  if (['0','false','off','no','n'].includes(s)) return false;
  return d;
};
const toNum = (v, d) => {
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const K = s => `NetworkInfo_${s}`;

// 先预计算，避免对象字面量里自引用
const UPDATE  = toNum(readKV(K('Update'))  ?? $args.Update  ?? 10, 10);
const TIMEOUT = toNum(readKV(K('Timeout')) ?? $args.Timeout ?? 8,  8);

// ===== 统一配置对象（后续直接用 CFG.*）=====
const CFG = {
  Update:  UPDATE,
  Timeout: TIMEOUT,

  MASK_IP:  toBool(readKV(K('MASK_IP'))  ?? $args.MASK_IP,  true),
  MASK_POS: toBool(readKV(K('MASK_POS')) ?? $args.MASK_POS, true),
  IPv6:     toBool(readKV(K('IPv6'))     ?? $args.IPv6,     false),

  // 修正 DOMESTIC_* 读取笔误，兼容旧的 DOMIC_* 键
  DOMESTIC_IPv4: readKV(K('DOMESTIC_IPv4')) ?? $args.DOMESTIC_IPv4 ?? $args.DOMIC_IPv4 ?? 'ipip',
  DOMESTIC_IPv6: readKV(K('DOMESTIC_IPv6')) ?? $args.DOMESTIC_IPv6 ?? $args.DOMIC_IPv6 ?? 'ddnspod',
  LANDING_IPv4:  readKV(K('LANDING_IPv4'))  ?? $args.LANDING_IPv4  ?? 'ipapi',
  LANDING_IPv6:  readKV(K('LANDING_IPv6'))  ?? $args.LANDING_IPv6  ?? 'ipsb',

  TW_FLAG_MODE:  toNum(readKV(K('TW_FLAG_MODE')) ?? $args.TW_FLAG_MODE ?? 1, 1),

  // ✅ 新增：图标预设；支持 BoxJS/#!arguments 覆盖
  IconPreset: readKV(K('IconPreset')) ?? $args.IconPreset ?? 'globe.asia.australia',
  // ✅ 修改：Icon 默认给空串，让预设能生效（有值仍优先）
  Icon:      readKV(K('Icon'))      ?? $args.Icon      ?? '',
  // 保留颜色（仍可 BoxJS/#!arguments 覆盖）
  IconColor: readKV(K('IconColor')) ?? $args.IconColor ?? '#1E90FF',
  
  SD_STYLE:     readKV(K('SD_STYLE'))     ?? $args.SD_STYLE     ?? 'icon',
  SD_SHOW_LAT:  toBool(readKV(K('SD_SHOW_LAT'))  ?? $args.SD_SHOW_LAT,  true),
  SD_SHOW_HTTP: toBool(readKV(K('SD_SHOW_HTTP')) ?? $args.SD_SHOW_HTTP, true),
  SD_LANG:      readKV(K('SD_LANG'))      ?? $args.SD_LANG      ?? 'zh-Hans',

  SD_TIMEOUT_MS: (() => {
    const raw = readKV(K('SD_TIMEOUT_MS')) ?? $args.SD_TIMEOUT_MS;
    const fallback = TIMEOUT * 1000;
    if (raw === '' || raw === undefined || raw === null) return fallback;
    return toNum(raw, fallback);
  })(),

  SD_REGION_MODE: readKV(K('SD_REGION_MODE')) ?? $args.SD_REGION_MODE ?? 'full',
  SD_ICON_THEME:  readKV(K('SD_ICON_THEME'))  ?? $args.SD_ICON_THEME  ?? 'check',
  SD_ARROW:       toBool(readKV(K('SD_ARROW')) ?? $args.SD_ARROW, true),

  // BoxJS 勾选（JSON 字符串). 若为空串/[]/null => 视为“无此键”，不阻塞回退
  SERVICES_BOX_CHECKED_RAW: (() => {
    const v = readKV(K('SERVICES'));    // 例如：["youtube","netflix"]
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (!s || s === '[]' || /^null$/i.test(s)) return null;
    return s;
  })(),

  // BoxJS 文本：NetworkInfo_SERVICES_TEXT（JSON 数组或逗号字符串）
  SERVICES_BOX_TEXT: (() => {
    const v = readKV(K('SERVICES_TEXT'));
    const s = (v != null) ? String(v).trim() : '';
    return s;
  })(),

  // 模块参数文本：SERVICES=...（支持数组/JSON/逗号）
  SERVICES_ARG_TEXT: (() => {
    let v = $args.SERVICES;
    if (Array.isArray(v)) return JSON.stringify(v);
    if (v == null || v === '') v = readArgRaw('SERVICES');
    return (v != null) ? String(v).trim() : '';
  })()
};

// —— 运行时映射（图标支持预设 + 自定义）——
const ICON_PRESET = CFG.IconPreset;  // ← 直接用 CFG
const ICON_PRESET_MAP = {
  antenna: 'antenna.radiowaves.left.and.right',
  wifi:    'wifi.router',
  globe:   'globe.asia.australia',
  dots:    'dot.radiowaves.left.and.right',
  point:   'point.3.connected.trianglepath.dotted'
};

// 有自定义 Icon 就用自定义；否则用预设；最后兜底到 antenna
const ICON_NAME  = (CFG.Icon || '').trim()
                || ICON_PRESET_MAP[ICON_PRESET]
                || 'antenna.radiowaves.left.and.right';
const ICON_COLOR = CFG.IconColor;

const IPv6_ON  = !!CFG.IPv6;
const MASK_IP  = !!CFG.MASK_IP;
const MASK_POS = (typeof CFG.MASK_POS === 'boolean') ? CFG.MASK_POS : !!CFG.MASK_IP;

const TW_FLAG_MODE = Number(CFG.TW_FLAG_MODE) || 0;

const DOMESTIC_IPv4 = CFG.DOMESTIC_IPv4;
const DOMESTIC_IPv6 = CFG.DOMESTIC_IPv6;
const LANDING_IPv4  = CFG.LANDING_IPv4;
const LANDING_IPv6  = CFG.LANDING_IPv6;

/* —— 服务检测参数 —— */
const SD_STYLE       = (String(CFG.SD_STYLE).toLowerCase()==='text') ? 'text' : 'icon';
const SD_SHOW_LAT    = !!CFG.SD_SHOW_LAT;
const SD_SHOW_HTTP   = !!CFG.SD_SHOW_HTTP;
const SD_LANG        = (String(CFG.SD_LANG).toLowerCase()==='zh-hant') ? 'zh-Hant' : 'zh-Hans';

const SD_TIMEOUT_MS  = (() => {
  const v = Number(CFG.SD_TIMEOUT_MS);
  const fallback = (Number(CFG.Timeout) || 8) * 1000;
  return Math.max(2000, Number.isFinite(v) ? v : fallback);
})();

const SD_REGION_MODE = ['full','abbr','flag'].includes(String(CFG.SD_REGION_MODE)) ? CFG.SD_REGION_MODE : 'full';
const SD_ICON_THEME  = ['lock','circle','check'].includes(String(CFG.SD_ICON_THEME)) ? CFG.SD_ICON_THEME : 'check';
const SD_ARROW       = !!CFG.SD_ARROW;

/* ===================== 主流程 ===================== */
;(async () => {
  const preTouch = touchLandingOnceQuick().catch(()=>{});

  const [cn, cn6] = await Promise.all([
    getDirectV4(DOMESTIC_IPv4).catch(()=>({})),
    IPv6_ON ? getDirectV6(DOMESTIC_IPv6).catch(()=>({})) : Promise.resolve({})
  ]);

  await preTouch;
  const { policyName, entranceIP } = await getPolicyAndEntranceRetry(4, 220);

  const ent = isIP(entranceIP||'') ? await getEntranceBundle(entranceIP).catch(()=>({ ip: entranceIP })) : {};

  const [px, px6] = await Promise.all([
    getLandingV4(LANDING_IPv4).catch(()=>({})),
    IPv6_ON ? getLandingV6(LANDING_IPv6).catch(()=>({})) : Promise.resolve({})
  ]);

  const nt = netTypeLine();
  const title = nt || t('panelTitle');

  const directLines = [];
  directLines.push(`${t('policy')}: ${policyName || '-'}`);
  directLines.push(lineIP(t('ip'), cn.ip, cn6.ip));

  const directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : '-';
  directLines.push(`${t('location')}: ${directLoc}`);
  if (cn.isp) directLines.push(`${t('isp')}: ${fmtISP(cn.isp, cn.loc)}`);

  const entranceLines = [];
  if (ent && (ent.ip || ent.loc1 || ent.loc2)) {
    entranceLines.push(lineIP(t('entrance'), ent.ip, ''));
    if (ent.loc1) entranceLines.push(`${t('location')}¹: ${flagFirst(ent.loc1)}`);
    if (ent.isp1) entranceLines.push(`${t('isp')}¹: ${fmtISP(ent.isp1, ent.loc1)}`);
    if (ent.loc2) entranceLines.push(`${t('location')}²: ${flagFirst(ent.loc2)}`);
    if (ent.isp2) entranceLines.push(`${t('isp')}²: ${String(ent.isp2).trim()}`);
  }

  const landingLines = [
    lineIP(t('landingIP'), px.ip, px6.ip),
    px.loc ? `${t('location')}: ${flagFirst(px.loc)}` : undefined,
    px.isp ? `${t('isp')}: ${fmtISP(px.isp, px.loc)}` : undefined
  ].filter(Boolean);

  const parts = [];
  parts.push(...directLines);
  if (entranceLines.length) parts.push('', ...entranceLines);
  if (landingLines.length)  parts.push('', ...landingLines);
  parts.push(`${t('runAt')}: ${now()}`);

  const sdLines = await runServiceChecks();
  if (sdLines.length) parts.push('', ...sdLines);

  const content = maybeTify(parts.join('\n'));
  $done({ title: maybeTify(title), content, icon: ICON_NAME, 'icon-color': ICON_COLOR });
})().catch(err => {
  $notification?.post?.(t('panelTitle'), '脚本错误', String(err));
  const errTitle = t('panelTitle');
  const errBody  = maybeTify(String(err));
  $done({ title: errTitle, content: errBody, icon: ICON_NAME, 'icon-color': ICON_COLOR });
});

/* ===================== 工具 & 渲染 ===================== */
function now(){ return new Date().toTimeString().split(' ')[0]; }
function isIPv4(ip){ return /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/.test(ip||''); }
function isIPv6(ip){ return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,6}:[0-9a-fA-F]{1,4}){1}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9]))$/.test(ip||''); }
function isIP(ip){ return isIPv4(ip) || isIPv6(ip); }

function maskIP(ip){
  if (!ip || !MASK_IP) return ip || '';
  if (isIPv4(ip)) {
    const p = ip.split('.'); return [p[0], p[1], '*', '*'].join('.');
  } else if (isIPv6(ip)) {
    const p = ip.split(':'); return [...p.slice(0,4), '*','*','*','*'].join(':');
  }
  return ip;
}

function splitFlagRaw(s) {
  const re=/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;
  const m=String(s||'').match(re);
  let flag=m?m[0]:'';
  let text=String(s||'').replace(re,'');
  if (flag.includes('🇹🇼')) {
    if (TW_FLAG_MODE===0) flag='🇨🇳';
    else if (TW_FLAG_MODE===2) flag='🇼🇸';
  }
  return { flag, text };
}
function onlyFlag(loc){ return splitFlagRaw(loc).flag || '-'; }
function flagFirst(loc){ const {flag,text}=splitFlagRaw(loc); return (flag||'') + (text||''); }

function lineIP(label, ip4, ip6){
  const a = `${label}: ${maskIP(ip4) || '-'}`;
  const b = ip6 ? `\n${maskIP(ip6)}` : '';
  return a + b;
}

function flagOf(code){
  let cc = String(code || '').trim();
  if (!cc) return '';
  if (/^中国$|^CN$/i.test(cc)) cc = 'CN';
  if (cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return '';
  try {
    if (cc.toUpperCase()==='TW') {
      if (TW_FLAG_MODE===0) return '🇨🇳';
      if (TW_FLAG_MODE===2) return '🇼🇸';
    }
    const raw = String.fromCodePoint(...[...cc.toUpperCase()].map(ch => 127397 + ch.charCodeAt()));
    return raw;
  } catch(_) { return ''; }
}

/* —— 规范中国境内运营商名称 —— */
function fmtISP(isp, locStr){
  const raw = String(isp || '').trim();
  if (!raw) return '';

  const txt = String(locStr || '');
  const isMainland = /^🇨🇳/.test(txt) || /(^|\s)中国(?!香港|澳门|台湾)/.test(txt);
  if (!isMainland) return raw;

  const norm = raw.replace(/\s*\(中国\)\s*/,'').replace(/\s+/g,' ').trim();
  const s = norm.toLowerCase();

  if (/(^|[\s-])(cmcc|cmnet|cmi)\b/.test(s) || /china\s*mobile/.test(s) || /移动/.test(norm))
    return '中国移动';
  if (/(^|[\s-])(chinanet|china\s*telecom|ctcc|ct)\b/.test(s) || /电信/.test(norm))
    return '中国电信';
  if (/(^|[\s-])(china\s*unicom|cncgroup|netcom)\b/.test(s) || /联通/.test(norm))
    return '中国联通';
  if (/(^|[\s-])(cbn|china\s*broadcast)/.test(s) || /广电/.test(norm))
    return '中国广电';
  if (/(cernet|china\s*education)/.test(s) || /教育网/.test(norm))
    return '中国教育网';

  if (/^中国(移动|联通|电信|广电)$/.test(norm)) return norm;
  return raw;
}

/* —— 网络类型行（Wi-Fi / 蜂窝数据） —— */
function radioToGen(r){
  const MAP = {
    GPRS:'2.5G', EDGE:'2.75G', CDMA1x:'2.5G', WCDMA:'3G', HSDPA:'3.5G', HSUPA:'3.75G',
    CDMAEVDORev0:'3.5G', CDMAEVDORevA:'3.5G', CDMAEVDORevB:'3.75G',
    eHRPD:'3.9G', LTE:'4G', NRNSA:'5G', NR:'5G'
  };
  return MAP[r] || '';
}
function netTypeLine(){
  try{
    const ssid  = $network?.wifi?.ssid;
    const radio = $network?.['cellular-data']?.radio;
    if (ssid) return `${t('wifi')} | ${ssid}`;
    if (radio){
      const g = radioToGen(radio);
      return `${t('cellular')} | ${t('gen')(g, radio)}`;
    }
  }catch(_){}
  return t('unknownNet');
}

/* ===================== HTTP 基础 ===================== */
function httpGet(url, headers={}, timeoutMs=null, followRedirect=false){
  return new Promise((resolve,reject)=>{
    const req = { url, headers };
    if (timeoutMs != null) req.timeout = timeoutMs;
    if (followRedirect) req.followRedirect = true;
    $httpClient.get(req,(err,resp,body)=>{
      if (err) return reject(err);
      resolve({ status: resp?.status || resp?.statusCode, headers: resp?.headers||{}, body });
    });
  });
}
function httpAPI(path='/v1/requests/recent'){
  return new Promise(res=>{
    if (typeof $httpAPI === 'function') $httpAPI('GET', path, null, res);
    else res({});
  });
}

/* ===================== 数据源：直连/落地/入口 ===================== */
async function getDirectV4(p){
  try{
    if (p==='cip')      return await d_cip();
    if (p==='163')      return await d_163();
    if (p==='bilibili') return await d_bili();
    if (p==='126')      return await d_126();
    if (p==='pingan')   return await d_pingan();
    return await d_ipip();
  }catch(_){ try{return await d_ipip()}catch(e){} return {}; }
}
async function d_ipip(){ const r=await httpGet('https://myip.ipip.net/json'); const j=JSON.parse(r.body||'{}'); const c0=j?.data?.location?.[0]; const flag=flagOf(c0==='中国'?'CN':c0); return { ip:j?.data?.ip||'', loc:[flag, j?.data?.location?.[0], j?.data?.location?.[1], j?.data?.location?.[2]].filter(Boolean).join(' ').replace(/\s*中国\s*/,'') , isp:j?.data?.location?.[4]||'' }; }
async function d_cip(){ const r=await httpGet('http://cip.cc/'); const b=String(r.body||''); const ip=(b.match(/IP.*?:\s*(\S+)/)||[])[1]||''; const addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; const isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''; const isCN=/中国/.test(addr); return { ip, loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') }; }
async function d_163(){ const r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countryCode), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' }; }
async function d_bili(){ const r=await httpGet('https://api.bilibili.com/x/web-interface/zone'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; const flag=flagOf(d.country==='中国'?'CN':d.country); return { ip:d.addr||'', loc:[flag,d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }
async function d_126(){ const r=await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countrySymbol), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.operator||'' }; }
async function d_pingan(){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { ip:d.ip||'', loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }

async function getDirectV6(p){
  try{
    if (p==='neu6'){ const r=await httpGet('https://speed.neu6.edu.cn/getIP.php'); return { ip:String(r.body||'').trim() }; }
    const r=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r.body||'').trim() };
  }catch(_){ return {}; }
}

async function getLandingV4(p){
  try{
    if (p==='ipwhois') return await l_whois();
    if (p==='ipsb')    return await l_ipsb();
    return await l_ipapi();
  }catch(_){ try{return await l_ipapi()}catch(e){} return {}; }
}
async function l_ipapi(){ const r=await httpGet('http://ip-api.com/json?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.query||'', loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||'' }; }
async function l_whois(){ const r=await httpGet('https://ipwhois.app/widget.php?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',    loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' }; }
async function l_ipsb(){  const r=await httpGet('https://api-ipv4.ip.sb/geoip');            const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',     loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' }; }

async function getLandingV6(p){
  try{
    if (p==='ident'){ const r=await httpGet('https://v6.ident.me'); return { ip:String(r.body||'').trim() }; }
    if (p==='ipify'){ const r=await httpGet('https://api6.ipify.org'); return { ip:String(r.body||'').trim() }; }
    const r=await httpGet('https://api-ipv6.ip.sb/ip'); return { ip:String(r.body||'').trim() };
  }catch(_){ return {}; }
}

/* ===================== 入口/策略（稳态获取） ===================== */
const ENT_SOURCES_RE = /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io|ident\.me|ipify\.org)/i;
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function extractIP(str){
  const s = String(str||'').replace(/\(Proxy\)/i,'').trim();
  let m = s.match(/\[([0-9a-fA-F:]+)\]/);
  if (m && isIPv6(m[1])) return m[1];
  m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (m && isIPv4(m[1])) return m[1];
  m = s.match(/([0-9a-fA-F:]{2,})/);
  if (m && isIPv6(m[1])) return m[1];
  return '';
}

async function touchLandingOnceQuick(){
  try { await httpGet('http://ip-api.com/json?lang=zh-CN', {}, 700, true); } catch(_) {}
}

async function getPolicyAndEntranceOnce(){
  const data = await httpAPI('/v1/requests/recent');
  const reqs = Array.isArray(data?.requests) ? data.requests : [];
  const hit  = reqs.slice(0, 120).find(i => ENT_SOURCES_RE.test(i.URL || ''));
  if (!hit) return {};
  const ip = extractIP(hit.remoteAddress || '');
  return { policyName: hit.policyName || '', entranceIP: ip || '' };
}

async function getAnyProxyPolicyFromRecent(){
  const data = await httpAPI('/v1/requests/recent');
  const reqs = Array.isArray(data?.requests) ? data.requests : [];
  const hit  = reqs.find(i => /\(Proxy\)/.test(i.remoteAddress||'') && i.policyName);
  if (!hit) return {};
  return { policyName: hit.policyName, entranceIP: extractIP(hit.remoteAddress) };
}

async function getPolicyAndEntranceRetry(times=4, baseDelay=200){
  for (let i=0; i<times; i++){
    const r = await getPolicyAndEntranceOnce().catch(()=>({}));
    if ((r?.entranceIP && isIP(r.entranceIP)) || r?.policyName) return r;
    if (i === Math.floor(times/2)) await touchLandingOnceQuick();
    if (i < times - 1) await sleep(baseDelay * Math.pow(1.6, i));
  }
  const any = await getAnyProxyPolicyFromRecent().catch(()=>({}));
  return any || {};
}

/* —— 入口位置（国内/国际） —— */
async function getEntranceBundle(ip){
  const a = await loc_pingan(ip).catch(()=>({}));
  const b = await loc_ipapi(ip).catch(()=>({}));
  return { ip, loc1: a.loc || '', isp1: a.isp || '', loc2: b.loc || '', isp2: b.isp || '' };
}
async function loc_pingan(ip){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }
async function loc_ipapi(ip){ const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }; }

/* ===================== 服务清单解析 & 检测 ===================== */
const SD_TESTS_MAP = {
  youtube:      () => sd_testYouTube(),
  netflix:      () => sd_testNetflix(),
  disney:       () => sd_testDisney(),
  chatgpt_web:  () => sd_testChatGPTWeb(),
  chatgpt_app:  () => sd_testChatGPTAppAPI(),
  hulu_us:      () => sd_testHuluUS(),
  hulu_jp:      () => sd_testHuluJP(),
  hbo:          () => sd_testHBO()
};
const SD_DEFAULT_ORDER = Object.keys(SD_TESTS_MAP);

// —— 允许更多分隔符 & 别名归一 —— //
const SD_ALIAS = {
  'yt':'youtube',
  'youtube':'youtube',
  'youTube':'youtube',
  'youtube premium':'youtube',
  '油管':'youtube',

  'nf':'netflix',
  'netflix':'netflix',
  '奈飞':'netflix',

  'disney':'disney',
  'disney+':'disney',
  '迪士尼':'disney',
  
  'chatgpt':'chatgpt_app',
  'gpt':'chatgpt_app',
  'openai':'chatgpt_app',

  'chatgpt_web':'chatgpt_web',
  'chatgpt-web':'chatgpt_web',
  'chatgptweb':'chatgpt_web',
  'chatgpt web':'chatgpt_web',

  'hulu':'hulu_us',
  'huluus':'hulu_us',
  'hulujp':'hulu_jp',

  'hbo':'hbo',
  'max':'hbo',
  '最大':'hbo'
};

// 解析文本：优先 JSON 数组；否则按多种分隔符切分（含中文逗号）
function parseServices(raw){
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s || s === '[]' || s === '{}' || /^null$/i.test(s) || /^undefined$/i.test(s)) return [];

  // 1) 先尝试 JSON 数组
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return normSvcList(arr);
  } catch(_) {}

  // 2) 退化为“分隔符”解析：英文/中文逗号、分号、竖线、斜杠、空白、换行
  const parts = s.split(/[,\uFF0C;\|/ \t\r\n]+/);
  return normSvcList(parts);
}

// 把原始列表做：去空白→小写→别名归一→去重→仅保留支持项
function normSvcList(list){
  const out = [];
  for (let x of list){
    let k = String(x ?? '').trim().toLowerCase();
    if (!k) continue;
    k = SD_ALIAS[k] || k;                // 别名归一
    if (!SD_TESTS_MAP[k]) continue;      // 只接受有实现的键
    if (!out.includes(k)) out.push(k);   // 按输入顺序去重
  }
  return out;
}

// 统一选择逻辑（优先级：BoxJS 勾选 > BoxJS 文本 > arguments 文本 > 全部）
function selectServices(){
  // 1) BoxJS 勾选（checkboxes 数组字符串）
  const hasCheckboxKey = CFG.SERVICES_BOX_CHECKED_RAW !== null;
  const boxChecked = parseServices(CFG.SERVICES_BOX_CHECKED_RAW);

  if (hasCheckboxKey) {
    if (boxChecked.length > 0) return boxChecked;

    // 继续看 BoxJS 文本
    const boxTextList = parseServices(CFG.SERVICES_BOX_TEXT);
    if (boxTextList.length > 0) return boxTextList;

    // 再看 arguments 文本
    const argList = parseServices(CFG.SERVICES_ARG_TEXT);
    if (argList.length > 0) return argList;

    // 都空 → 默认全开
    return SD_DEFAULT_ORDER.slice();
  }

  // 2) 没有“勾选键”时：BoxJS 文本
  const boxTextList = parseServices(CFG.SERVICES_BOX_TEXT);
  if (boxTextList.length > 0) return boxTextList;

  // 3) arguments 文本
  const argList = parseServices(CFG.SERVICES_ARG_TEXT);
  if (argList.length > 0) return argList;

  // 4) 全部
  return SD_DEFAULT_ORDER.slice();
}

/* —— HTTP 请求工具（服务检测） —— */
function sd_now(){ return Date.now(); }
const SD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SD_BASE_HEADERS = { "User-Agent": SD_UA, "Accept-Language": "en" };

function sd_httpGet(url, headers={}, followRedirect=true) {
  return new Promise((resolve) => {
    const start = sd_now();
    $httpClient.get(
      { url, headers: { ...SD_BASE_HEADERS, ...headers }, timeout: SD_TIMEOUT_MS, followRedirect },
      (err, resp, data) => {
        const cost = sd_now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"" });
        resolve({ ok:true, status: resp.status || resp.statusCode || 0, cost,
                  headers: resp.headers || {}, data: data || "" });
      }
    );
  });
}
function sd_httpPost(url, headers={}, body="") {
  return new Promise((resolve) => {
    const start = sd_now();
    $httpClient.post(
      { url, headers: { ...SD_BASE_HEADERS, ...headers }, timeout: SD_TIMEOUT_MS, body },
      (err, resp, data) => {
        const cost = sd_now() - start;
        if (err || !resp) return resolve({ ok:false, status:0, cost, headers:{}, data:"" });
        resolve({ ok:true, status: resp.status || resp.statusCode || 0, cost,
                  headers: resp.headers || {}, data: data || "" });
      }
    );
  });
}

/* —— 台湾旗模式（服务检测渲染用）—— */
function sd_flagFromCC(cc){
  cc = (cc||'').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  if (cc==='TW') {
    if (TW_FLAG_MODE===0) return '🇨🇳';
    if (TW_FLAG_MODE===2) return '🇼🇸';
  }
  try {
    const cps = [...cc].map(c => 0x1F1E6 + (c.charCodeAt(0)-65));
    return String.fromCodePoint(...cps);
  } catch { return ''; }
}

const SD_CC_NAME = {
  "zh-Hans": { CN:"中国", TW:"台湾", HK:"中国香港", MO:"中国澳门", JP:"日本", KR:"韩国", US:"美国",
    SG:"新加坡", MY:"马来西亚", TH:"泰国", VN:"越南", PH:"菲律宾", ID:"印度尼西亚",
    IN:"印度", AU:"澳大利亚", NZ:"新西兰", CA:"加拿大", GB:"英国", DE:"德国", FR:"法国",
    NL:"荷兰", ES:"西班牙", IT:"意大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄罗斯" },
  "zh-Hant": { CN:"中國", TW:"台灣", HK:"中國香港", MO:"中國澳門", JP:"日本", KR:"南韓", US:"美國",
    SG:"新加坡", MY:"馬來西亞", TH:"泰國", VN:"越南", PH:"菲律賓", ID:"印尼",
    IN:"印度", AU:"澳洲", NZ:"紐西蘭", CA:"加拿大", GB:"英國", DE:"德國", FR:"法國",
    NL:"荷蘭", ES:"西班牙", IT:"義大利", BR:"巴西", AR:"阿根廷", MX:"墨西哥", RU:"俄羅斯" }
}[SD_LANG];

function sd_ccPretty(cc){
  cc = (cc||'').toUpperCase();
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[cc];
  if (!cc) return "—";
  if (SD_REGION_MODE==='flag') return flag || "—";
  if (SD_REGION_MODE==='abbr') return (flag||'') + cc;
  if (flag && name) return `${flag} ${cc} | ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}

// —— 三态图标主题 —— //
function sd_pickIcons(theme){
  switch(theme){
    case 'lock':   return { full:'🔓', partial:'🔐', blocked:'🔒' };
    case 'circle': return { full:'⭕️', partial:'⛔️', blocked:'🚫' };
    default:       return { full:'✅', partial:'❇️', blocked:'❎' };
  }
}
const SD_ICONS = sd_pickIcons(SD_ICON_THEME);
function sd_isPartial(tag){ return /自制|自製|original/i.test(String(tag||'')) || /部分/i.test(String(tag||'')); }

/* —— 服务名（仍单独维护，避免误替） —— */
const SD_I18N = {
  "zh-Hans": {
    youTube:"YouTube", chatgpt_app:"ChatGPT", chatgpt:"ChatGPT Web",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)"
  },
  "zh-Hant": {
    youTube:"YouTube", chatgpt_app:"ChatGPT", chatgpt:"ChatGPT Web",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)"
  }
}[SD_LANG];

/* —— 各服务 —— */
function sd_parseNFRegion(resp) {
  try {
    const xo = resp?.headers?.['x-originating-url']
            || resp?.headers?.['X-Origining-URL']
            || resp?.headers?.['X-Originating-URL'];
    if (xo) {
      const m = String(xo).match(/\/([A-Z]{2})(?:[-/]|$)/i);
      if (m) return m[1].toUpperCase();
    }
    const m2 = String(resp?.data || "").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m2) return m2[1].toUpperCase();
  } catch (_) {}
  return "";
}

async function sd_testYouTube() {
  const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.youTube, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  let cc = "US";
  try {
    let m = r.data.match(/"countryCode":"([A-Z]{2})"/);
    if (!m) m = r.data.match(/["']INNERTUBE_CONTEXT_GL["']\s*:\s*["']([A-Z]{2})["']/);
    if (m) cc = m[1];
  } catch(_){}
  return sd_renderLine({name:SD_I18N.youTube, ok:true, cc, cost:r.cost, status:r.status, tag:""});
}
async function sd_testChatGPTWeb() {
  const r = await sd_httpGet("https://chatgpt.com/cdn-cgi/trace", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch(_){}
  return sd_renderLine({name:SD_I18N.chatgpt, ok:true, cc, cost:r.cost, status:r.status, tag:""});
}
async function sd_testChatGPTAppAPI() {
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt_app, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  let cc = "";
  try {
    const h = r.headers || {};
    cc = (h['cf-ipcountry'] || h['CF-IPCountry'] || h['Cf-IpCountry'] || "").toString().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) cc = "";
  } catch(_){}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({name:SD_I18N.chatgpt_app, ok:true, cc, cost:r.cost, status:r.status, tag:""});
}

const SD_NF_ORIGINAL = "80018499";
const SD_NF_NONORIG  = "81280792";
async function sd_nfGet(id){ return await sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true); }
async function sd_testNetflix() {
  try {
    const r1 = await sd_nfGet(SD_NF_NONORIG);
    if (!r1.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:t('fail')});
    if (r1.status === 403) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:t('regionBlocked')});
    if (r1.status === 404) {
      const r2 = await sd_nfGet(SD_NF_ORIGINAL);
      if (!r2.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r2.cost, status:r2.status, tag:t('fail')});
      if (r2.status === 404) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r2.cost, status:r2.status, tag:t('regionBlocked')});
      const cc = sd_parseNFRegion(r2) || "";
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc, cost:r2.cost, status:r2.status, tag:t('nfOriginals'), state:'partial'});
    }
    if (r1.status === 200) {
      const cc = sd_parseNFRegion(r1) || "";
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc, cost:r1.cost, status:r1.status, tag:t('nfFull'), state:'full'});
    }
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:`HTTP ${r1.status}`});
  } catch(_){
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:null, status:0, tag:t('fail')});
  }
}

async function sd_testDisney() {
  async function home() {
    const r = await sd_httpGet("https://www.disneyplus.com/", { "Accept-Language":"en" }, true);
    if (!r.ok || r.status !== 200 || /Sorry,\s*Disney\+\s*is\s*not\s*available/i.test(r.data||"")) throw "NA";
    let cc=""; try {
      const m = r.data.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || r.data.match(/data-country=["']([A-Z]{2})["']/i);
      if (m) cc = m[1];
    } catch(_){}
    return { cc, cost:r.cost, status:r.status };
  }
  async function bam() {
    const headers = {
      "Accept-Language":"en",
      "Authorization":"ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84",
      "Content-Type":"application/json",
      "User-Agent": SD_UA
    };
    const body = JSON.stringify({
      query:'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
      variables:{ input:{ applicationRuntime:'chrome', attributes:{ browserName:'chrome', browserVersion:'120.0.0.0', manufacturer:'apple', model:null, operatingSystem:'macintosh', operatingSystemVersion:'10.15.7', osDeviceIds:[] }, deviceFamily:'browser', deviceLanguage:'en', deviceProfile:'macosx' } }
    });
    const r = await sd_httpPost("https://disney.api.edge.bamgrid.com/graph/v1/device/graphql", headers, body);
    if (!r.ok || r.status !== 200) throw "NA";
    const d = JSON.parse(r.data || "{}");
    if (d?.errors) throw "NA";
    const inLoc = d?.extensions?.sdk?.session?.inSupportedLocation;
    const cc    = d?.extensions?.sdk?.session?.location?.countryCode;
    return { inLoc, cc, cost:r.cost, status:r.status };
  }
  function timeout(ms, code){ return new Promise((_,rej)=>setTimeout(()=>rej(code),ms)); }

  try {
    const h = await Promise.race([home(), timeout(7000,"TO")]);
    const b = await Promise.race([bam(),  timeout(7000,"TO")]).catch(()=>({}));
    const blocked = (b && b.inLoc === false);
    const cc = blocked ? "" : (b?.cc || h?.cc || (await sd_queryLandingCCMulti()) || "");
    return sd_renderLine({name:SD_I18N.disney, ok:!blocked, cc, cost:(b?.cost||h?.cost||0), status:(b?.status||h?.status||0), tag: blocked ? t('regionBlocked') : ""});
  } catch(e){
    const tag = (e==="TO") ? t('timeout') : t('fail');
    return sd_renderLine({name:SD_I18N.disney, ok:false, cc:"", cost:null, status:0, tag});
  }
}

async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluUS, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_renderLine({name:SD_I18N.huluUS, ok:!blocked, cc: blocked?"": "US", cost:r.cost, status:r.status, tag: blocked ? t('regionBlocked') : ""});
}
async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language":"ja" }, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluJP, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_renderLine({name:SD_I18N.huluJP, ok:!blocked, cc: blocked?"": "JP", cost:r.cost, status:r.status, tag: blocked ? t('regionBlocked') : ""});
}
async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.hbo, ok:false, cc:"", cost:r.cost, status:r.status, tag:t('notReachable')});
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc=""; try { const m = String(r.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch(_){}
  if (!cc) cc = await sd_queryLandingCCMulti();
  return sd_renderLine({name:SD_I18N.hbo, ok:!blocked, cc: blocked?"": cc, cost:r.cost, status:r.status, tag: blocked ? t('regionBlocked') : ""});
}

// 多源回退（更稳）
async function sd_queryLandingCC() {
  const r = await sd_httpGet("http://ip-api.com/json", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = JSON.parse(r.data || "{}"); return (j.countryCode || "").toUpperCase(); }
    catch(_){ return ""; }
  }
  return "";
}
async function sd_queryLandingCCMulti(){
  let cc = await sd_queryLandingCC();
  if (cc) return cc;

  let r = await sd_httpGet("https://api.ip.sb/geoip", {}, true);
  if (r.ok && r.status===200) try{ const j=JSON.parse(r.data||"{}"); if(j.country_code) return j.country_code.toUpperCase(); }catch(_){}

  r = await sd_httpGet("https://ipinfo.io/json", {}, true);
  if (r.ok && r.status===200) try{ const j=JSON.parse(r.data||"{}"); if(j.country) return j.country.toUpperCase(); }catch(_){}

  r = await sd_httpGet("https://ifconfig.co/json", {"Accept-Language":"en"}, true);
  if (r.ok && r.status===200) try{ const j=JSON.parse(r.data||"{}"); if(j.country_iso) return j.country_iso.toUpperCase(); }catch(_){}

  return "";
}

/* —— 渲染（仅 Netflix 区分“完整/自制剧”，其它服务统一“已解锁/不可达”）——
 * text+无箭头：Netflix 用长文案，其它服务用“已解锁/不可达”；句式为“区域: …”
 * text+箭头：保持“已解锁/部分解锁/不可达”短文案
 * icon：沿用原逻辑
 */
function sd_renderLine({name, ok, cc, cost, status, tag, state}) {
  // 归一化：full / partial / blocked
  const st = state ? state : (ok ? (sd_isPartial(tag) ? 'partial' : 'full') : 'blocked');

  const icon = sd_pickIcons(SD_ICON_THEME)[st];
  const regionChunk = cc ? sd_ccPretty(cc) : "";
  const regionText  = regionChunk || "-";

  const unlockedShort = t('unlocked');
  const blockedText   = t('notReachable');

  // Netflix 专用长文案
  const stateTextLong = (()=>{
    if (st==='full')    return t('nfFull');
    if (st==='partial') return t('nfOriginals');
    return blockedText;
  })();

  // 其它服务短文案（full/partial → 已解锁）
  const stateTextShort = (st==='blocked') ? blockedText : unlockedShort;

  const isNetflix = /netflix/i.test(String(name));

  // 关键：text + 无箭头 + Netflix 时隐藏尾部 tag（避免与左侧长文案重复）
  const showTag = (isNetflix && SD_STYLE === "text" && !SD_ARROW) ? "" : (tag || "");

  // ① text + 无箭头
  if (SD_STYLE === "text" && !SD_ARROW) {
    const left  = `${name}: ${isNetflix ? stateTextLong : stateTextShort}`;
    const head  = `${left}，${t('region')}: ${regionText}`;
    const tail = [
      showTag,
      (SD_SHOW_LAT && cost!=null) ? `${cost}ms` : "",
      (SD_SHOW_HTTP && status>0) ? `HTTP ${status}` : ""
    ].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }

  // ② text + 箭头：标准短文案
  const stateTextStd = (()=>{
    if (st==='full') return t('unlocked');
    if (st==='partial') return t('partialUnlocked');
    return t('notReachable');
  })();

  if (SD_STYLE === "text") {
    const left  = `${name}: ${stateTextStd}`;
    const head  = SD_ARROW ? `${left} ➟ ${regionText}` : `${left} ｜ ${regionText}`;
    const tail = [
      showTag,
      (SD_SHOW_LAT && cost!=null) ? `${cost}ms` : "",
      (SD_SHOW_HTTP && status>0) ? `HTTP ${status}` : ""
    ].filter(Boolean).join(" ｜ ");
    return tail ? `${head} ｜ ${tail}` : head;
  }

  // ③ icon 样式
  const head = SD_ARROW
    ? `${icon} ${name} ➟ ${regionText}`
    : `${icon} ${name} ｜ ${regionText}`;

  const tail = [
    showTag,
    (SD_SHOW_LAT && cost!=null) ? `${cost}ms` : "",
    (SD_SHOW_HTTP && status>0) ? `HTTP ${status}` : ""
  ].filter(Boolean).join(" ｜ ");

  return tail ? `${head} ｜ ${tail}` : head;
}

/* —— 运行队列 —— */
async function runServiceChecks(){
  try{
    const order = selectServices();
    if (!order.length) return [];
    const tasks = order.map(k => SD_TESTS_MAP[k] && SD_TESTS_MAP[k]());
    const lines = await Promise.all(tasks);
    return lines.filter(Boolean);
  }catch(_){
    return [];
  }
}

/* —— 简→繁（仅在 zh-Hant 开启）：短语优先 + 字符兜底 —— */
function zhHansToHantOnce(s){
  if (!s) return s;
  // 1) 常用短语优先（避免被单字替换拆散）
  const phraseMap = [
    // 面板 UI
    ['网络', '網路'], ['蜂窝数据', '行動數據'], ['代理策略', '代理策略'],
    ['执行时间', '執行時間'], ['落地 IP', '落地 IP'], ['入口', '入口'],
    ['位置', '位置'], ['运营商', '運營商'], ['区域', '區域'],
    ['不可达', '不可達'], ['检测失败', '檢測失敗'], ['超时', '逾時'],
    ['区域受限', '區域受限'], ['已解锁', '已解鎖'], ['部分解锁', '部分解鎖'],
    ['已完整解锁', '已完整解鎖'], ['仅解锁自制剧', '僅解鎖自製劇'],

    // 直连位置里常见地名（按需增补）
    ['中国香港', '中國香港'], ['中国澳门', '中國澳門'],

    // 运营商（fmtISP 的结果如果是简体，这里转为繁体）
    ['中国移动', '中國移動'], ['中国联通', '中國聯通'], ['中国电信', '中國電信'],
    ['中国广电', '中國廣電'], ['中国教育网', '中國教育網']
  ];
  for (const [hans, hant] of phraseMap) {
    s = s.replace(new RegExp(hans, 'g'), hant);
  }

  // 2) 字符兜底（只放面板常见字，避免过度替换）
  const charMap = {
    '网':'網', '络':'絡', '运':'運', '营':'營', '达':'達', '检':'檢', '测':'測',
    '时':'時', '区':'區', '术':'術', '产':'產', '广':'廣', '电':'電', '联':'聯',
    '动':'動', '数':'數', '汉':'漢', '气':'氣', '历':'曆', '宁':'寧'
  };
  s = s.replace(/[\u4E00-\u9FFF]/g, ch => charMap[ch] || ch);
  return s;
}

// 最终输出前做一次繁体转换（只在 zh-Hant 时）
function maybeTify(content){
  if (SD_LANG === 'zh-Hant') return zhHansToHantOnce(content);
  return content;
}
