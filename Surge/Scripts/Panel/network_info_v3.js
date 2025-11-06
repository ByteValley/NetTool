/* =========================================================
 * 网络信息 + 服务检测（合并面板）
 * by ByteValley
 * - 直连/入口/落地 IP 与位置（直连位置可脱敏为仅旗帜）
 * - 中国境内运营商规范化
 * - 网络类型行（Wi-Fi | SSID / 蜂窝数据 | 5G - NR / 网络 | 未知）
 * - 执行时间后空一行拼接“服务检测”结果
 * - 台湾旗模式：TW_FLAG_MODE=0(🇨🇳)/1(🇹🇼)/2(🇼🇸)，全局生效
 * - 脚本接管图标 Icon / IconColor
 * =======================================================*/

/* ===================== 参数解析 ===================== */
function parseArgs() {
  try {
    if (typeof $argument === 'string' && $argument) {
      const map = Object.fromEntries($argument.split('&').map(s => {
        const [k, ...rest] = s.split('=');
        return [decodeURIComponent(k), decodeURIComponent(rest.join('='))];
      }));
      return map;
    }
  } catch (_) {}
  return {};
}
const ARG = parseArgs();
const GET = (k, d='') => (ARG[k] ?? d);

/* —— 图标 —— */
const ICON_NAME  = GET('icon', 'globe.asia.australia');
const ICON_COLOR = GET('icon-color', '#1E90FF');

/* —— 行为参数 —— */
const IPv6_ON   = GET('IPv6','0') === '1';
const MASK_IP   = GET('MASK_IP','1') === '1';
// 直连“位置”脱敏：未显式传入 MASK_POS 时，默认跟随 MASK_IP
const MASK_POS  = Object.prototype.hasOwnProperty.call(ARG,'MASK_POS')
  ? (GET('MASK_POS','1') === '1')
  : (GET('MASK_IP','1') === '1');

// 台湾旗：0=🇨🇳(默认) / 1=🇹🇼 / 2=🇼🇸
const TW_FLAG_MODE  = ['0','1','2'].includes(GET('TW_FLAG_MODE','0')) ? GET('TW_FLAG_MODE','0') : '0';

const DOMESTIC_IPv4 = GET('DOMESTIC_IPv4','ipip');     // ipip|cip|163|bilibili|126|pingan
const DOMESTIC_IPv6 = GET('DOMESTIC_IPv6','ddnspod');  // ddnspod|neu6
const LANDING_IPv4  = GET('LANDING_IPv4','ipapi');     // ipapi|ipwhois|ipsb
const LANDING_IPv6  = GET('LANDING_IPv6','ipsb');      // ipsb|ident|ipify

/* —— 服务检测参数 —— */
const SD_STYLE      = (GET('SD_STYLE','icon')||'').toLowerCase()==='text' ? 'text' : 'icon';
const SD_SHOW_LAT   = /^true$/i.test(GET('SD_SHOW_LAT','true'));
const SD_SHOW_HTTP  = /^true$/i.test(GET('SD_SHOW_HTTP','true'));
const SD_LANG       = (/^zh-hant$/i.test(GET('SD_LANG','zh-Hans')) ? 'zh-Hant' : 'zh-Hans');
const SD_TIMEOUT_MS = (()=>{
  const ms = GET('SD_TIMEOUT_MS','');
  if (ms && /^\d+$/.test(ms)) return parseInt(ms,10);
  const sec = parseInt(GET('Timeout','8'),10);
  return isFinite(sec) ? Math.max(2000, sec*1000) : 5000;
})();

/* ===================== 主流程 ===================== */
;(async () => {
  // —— 直连
  const cn  = await getDirectV4(DOMESTIC_IPv4).catch(()=>({}));
  const cn6 = IPv6_ON ? await getDirectV6(DOMESTIC_IPv6).catch(()=>({})) : {};

  // —— 最近请求：策略名 & 入口 IP
  const { policyName, entranceIP } = await getPolicyAndEntrance().catch(()=>({}));

  // —— 入口：国内/国际双源
  const ent = isIP(entranceIP||'') ? await getEntranceBundle(entranceIP).catch(()=>({ ip: entranceIP })) : {};

  // —— 落地
  const px  = await getLandingV4(LANDING_IPv4).catch(()=>({}));
  const px6 = IPv6_ON ? await getLandingV6(LANDING_IPv6).catch(()=>({})) : {};

  /* ===== 组装上半部分 ===== */
  const title = policyName ? `代理策略: ${policyName}` : `网络信息 𝕏`;

  const directLines = [];
  const nt = netTypeLine();                 // 顶部网络类型行
  if (nt) directLines.push(nt);
  directLines.push(lineIP('IP', cn.ip, cn6.ip));

  // 直连位置：脱敏仅旗帜 or 完整
  const directLoc = cn.loc ? (MASK_POS ? onlyFlag(cn.loc) : flagFirst(cn.loc)) : '-';
  directLines.push(`位置: ${directLoc}`);
  if (cn.isp) directLines.push(`运营商: ${fmtISP(cn.isp, cn.loc)}`);

  const entranceLines = [];
  if (ent && (ent.ip || ent.loc1 || ent.loc2)) {
    entranceLines.push(lineIP('入口', ent.ip, ''));
    if (ent.loc1) entranceLines.push(`位置¹: ${flagFirst(ent.loc1)}`);
    if (ent.isp1) entranceLines.push(`运营商¹: ${fmtISP(ent.isp1, ent.loc1)}`);
    if (ent.loc2) entranceLines.push(`位置²: ${flagFirst(ent.loc2)}`);
    if (ent.isp2) entranceLines.push(`运营商²: ${fmtISP(ent.isp2, ent.loc2)}`);
  }

  const landingLines = [
    lineIP('落地 IP', px.ip, px6.ip),
    px.loc ? `位置: ${flagFirst(px.loc)}` : undefined,
    px.isp ? `运营商: ${fmtISP(px.isp, px.loc)}` : undefined
  ].filter(Boolean);

  const parts = [];
  parts.push(...directLines);
  if (entranceLines.length) parts.push('', ...entranceLines);
  if (landingLines.length)  parts.push('', ...landingLines);
  parts.push(`执行时间: ${now()}`);

  /* ===== 服务检测（并发） ===== */
  const sdLines = await runServiceChecks();
  if (sdLines.length) parts.push('', ...sdLines);  // 执行时间后留一空行

  const content = parts.join('\n');
  $done({ title, content, icon: ICON_NAME, 'icon-color': ICON_COLOR });
})().catch(err => {
  $notification.post('网络信息 𝕏', '脚本错误', String(err));
  $done({ title: '网络信息 𝕏', content: String(err), icon: ICON_NAME, 'icon-color': ICON_COLOR });
});

/* ===================== 工具 & 渲染 ===================== */
function now(){ return new Date().toTimeString().split(' ')[0]; }
function isIPv4(ip){ return /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/.test(ip||''); }
function isIPv6(ip){ return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0-1}[0-9]){0,1}[0-9]))$/.test(ip||''); }
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
  // 统一处理台湾旗显示方案：0=🇨🇳, 1=🇹🇼, 2=🇼🇸（仅当原始是 🇹🇼 时替换）
  if (flag.includes('🇹🇼')) {
    if (TW_FLAG_MODE==='0') flag='🇨🇳';
    else if (TW_FLAG_MODE==='2') flag='🇼🇸';
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
    const raw = String.fromCodePoint(...[...cc.toUpperCase()].map(ch => 127397 + ch.charCodeAt()));
    // 对 TW 应用模式
    if (cc.toUpperCase()==='TW') {
      if (TW_FLAG_MODE==='0') return '🇨🇳';
      if (TW_FLAG_MODE==='2') return '🇼🇸';
    }
    return raw;
  } catch(_) { return ''; }
}

/* —— 规范中国境内运营商名称 —— */
function fmtISP(isp, locStr){
  const s0 = String(isp || '').trim();
  if (!s0) return '';
  const isCN = /^🇨🇳/.test(String(locStr||'')) || /(^|\s)中国/.test(String(locStr||''));
  if (!isCN) return s0;

  let s = s0.replace(/^中国\s*/,'').replace(/\s*\(中国\)\s*/,'').replace(/\s+/g,' ');
  if (/^(移动|CMCC|China Mobile.*)$/i.test(s)) return '中国移动';
  if (/^(联通|China Unicom.*)$/i.test(s))     return '中国联通';
  if (/^(电信|China Telecom.*)$/i.test(s))    return '中国电信';
  if (/^(广电|CBN|China Broadcasting.*)$/i.test(s)) return '中国广电';

  if (/^China\s*Mobile.*communications.*$/i.test(s)) return '中国移动';
  if (/^China\s*Telecom.*$/i.test(s)) return '中国电信';
  if (/^China\s*Unicom.*$/i.test(s))  return '中国联通';
  return '中国' + s;
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
    if (ssid) return `Wi-Fi | ${ssid}`;
    if (radio){
      const g = radioToGen(radio);
      return `蜂窝数据 | ${g ? `${g} - ${radio}` : radio}`;
    }
  }catch(_){}
  return '网络 | 未知';
}

/* ===================== HTTP 基础 ===================== */
function httpGet(url, headers={}){
  return new Promise((resolve,reject)=>{
    $httpClient.get({url,headers},(err,resp,body)=>{
      if (err) return reject(err);
      resolve({ status: resp?.status || resp?.statusCode, body });
    });
  });
}
function httpAPI(path='/v1/requests/recent'){
  return new Promise(res=>{ $httpAPI('GET', path, null, res); });
}

/* ===================== 数据源：直连/落地/入口 ===================== */
// —— 直连 v4
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

// —— 直连 v6
async function getDirectV6(p){
  try{
    if (p==='neu6'){ const r=await httpGet('https://speed.neu6.edu.cn/getIP.php'); return { ip:String(r.body||'').trim() }; }
    const r=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r.body||'').trim() };
  }catch(_){ return {}; }
}

// —— 落地 v4
async function getLandingV4(p){
  try{
    if (p==='ipwhois') return await l_whois();
    if (p==='ipsb')    return await l_ipsb();
    return await l_ipapi();
  }catch(_){ try{return await l_ipapi()}catch(e){} return {}; }
}
async function l_ipapi(){ const r=await httpGet('http://ip-api.com/json?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.query||'', loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }; }
async function l_whois(){ const r=await httpGet('https://ipwhois.app/widget.php?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',    loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' }; }
async function l_ipsb(){  const r=await httpGet('https://api-ipv4.ip.sb/geoip');            const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',     loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' }; }

// —— 落地 v6
async function getLandingV6(p){
  try{
    if (p==='ident'){ const r=await httpGet('https://v6.ident.me'); return { ip:String(r.body||'').trim() }; }
    if (p==='ipify'){ const r=await httpGet('https://api6.ipify.org'); return { ip:String(r.body||'').trim() }; }
    const r=await httpGet('https://api-ipv6.ip.sb/ip'); return { ip:String(r.body||'').trim() };
  }catch(_){ return {}; }
}

// —— 最近请求（Surge 内置）
async function getPolicyAndEntrance(){
  const data = await httpAPI('/v1/requests/recent');
  const reqs = Array.isArray(data?.requests) ? data.requests : [];
  const hit  = reqs.slice(0, 20).find(i => /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io)/.test(i.URL));
  if (!hit) return {};
  return {
    policyName: hit.policyName || '',
    entranceIP: /\(Proxy\)/.test(hit.remoteAddress) ? hit.remoteAddress.replace(/\s*\(Proxy\)\s*/,'') : ''
  };
}

// —— 入口位置（国内/国际）
async function getEntranceBundle(ip){
  const a = await loc_pingan(ip).catch(()=>({}));
  const b = await loc_ipapi(ip).catch(()=>({}));
  return { ip, loc1: a.loc || '', isp1: a.isp || '', loc2: b.loc || '', isp2: b.isp || '' };
}
async function loc_pingan(ip){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' }; }
async function loc_ipapi(ip){ const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' }; }

/* ===================== 服务检测（并发） ===================== */
// —— 工具
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

// —— 台湾旗模式（服务检测用）
function sd_flagFromCC(cc){
  cc = (cc||'').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  if (cc==='TW') {
    if (TW_FLAG_MODE==='0') return '🇨🇳';
    if (TW_FLAG_MODE==='2') return '🇼🇸';
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
  if (!cc) return "—";
  const flag = sd_flagFromCC(cc);
  const name = SD_CC_NAME[cc];
  if (flag && name) return `${flag} ${cc} | ${name}`;
  if (flag) return `${flag} ${cc}`;
  return cc;
}
function sd_renderLine({name, ok, cc, cost, status, tag}) {
  const regionChunk = cc ? sd_ccPretty(cc) : "—";
  const stateChunk  = ok ? (SD_LANG==='zh-Hant'?'已解鎖':'已解锁') : (tag || (SD_LANG==='zh-Hant'?'不可達':'不可达'));
  const tagChunk    = tag ? ` ｜ ${tag}` : "";

  if (SD_STYLE === "text") {
    return `${name}: ${stateChunk} ｜ ${regionChunk}${tagChunk}`;
  }
  const parts = [];
  parts.push(`${ok ? "✅" : "⛔️"} ${name}`);
  if (cc) parts.push(regionChunk);
  if (tag) parts.push(tag);
  if (SD_SHOW_LAT && cost != null) parts.push(`${cost}ms`);
  if (SD_SHOW_HTTP && status > 0)  parts.push(`HTTP ${status}`);
  return parts.join(" ｜ ");
}
async function sd_queryLandingCC() {
  const r = await sd_httpGet("http://ip-api.com/json", {}, true);
  if (r.ok && r.status === 200) {
    try { const j = JSON.parse(r.data || "{}"); return (j.countryCode || "").toUpperCase(); }
    catch(_){ return ""; }
  }
  return "";
}

/* —— 各服务 —— */
const SD_I18N = {
  "zh-Hans": {
    youTube:"YouTube", chatgpt:"ChatGPT", chatgpt_app:"ChatGPT App(API)",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)",
    unreachable:"不可达", timeout:"超时", fail:"检测失败", regionBlocked:"区域受限", originals:"自制", full:"完整"
  },
  "zh-Hant": {
    youTube:"YouTube", chatgpt:"ChatGPT", chatgpt_app:"ChatGPT App(API)",
    netflix:"Netflix", disney:"Disney+", huluUS:"Hulu(美)", huluJP:"Hulu(日)", hbo:"Max(HBO)",
    unreachable:"不可達", timeout:"逾時", fail:"檢測失敗", regionBlocked:"區域受限", originals:"自製", full:"完整"
  }
}[SD_LANG];

function sd_parseNFRegion(resp) {
  try {
    const x = resp.headers?.["x-originating-url"] || resp.headers?.["X-Origining-URL"] || resp.headers?.["X-Originating-URL"];
    if (x) {
      const seg = String(x).split("/");
      if (seg.length >= 4) {
        const cc = seg[3].split("-")[0];
        if (/^[A-Z]{2}$/i.test(cc)) return cc.toUpperCase();
      }
    }
    const m = String(resp.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i);
    if (m) return m[1].toUpperCase();
  } catch(_){}
  return "";
}

async function sd_testYouTube() {
  const r = await sd_httpGet("https://www.youtube.com/premium?hl=en", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.youTube, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
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
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  let cc = ""; try { const m = r.data.match(/loc=([A-Z]{2})/); if (m) cc = m[1]; } catch(_){}
  return sd_renderLine({name:SD_I18N.chatgpt, ok:true, cc, cost:r.cost, status:r.status, tag:""});
}
async function sd_testChatGPTAppAPI() {
  const r = await sd_httpGet("https://api.openai.com/v1/models", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.chatgpt_app, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  const cc = await sd_queryLandingCC();
  return sd_renderLine({name:SD_I18N.chatgpt_app, ok:true, cc, cost:r.cost, status:r.status, tag:""});
}

const SD_NF_ORIGINAL = "80018499";
const SD_NF_NONORIG  = "81280792";
async function sd_nfGet(id){ return await sd_httpGet(`https://www.netflix.com/title/${id}`, {}, true); }
async function sd_testNetflix() {
  try {
    const r1 = await sd_nfGet(SD_NF_NONORIG);
    if (!r1.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:SD_I18N.fail});
    if (r1.status === 403) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:SD_I18N.regionBlocked});
    if (r1.status === 404) {
      const r2 = await sd_nfGet(SD_NF_ORIGINAL);
      if (!r2.ok) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r2.cost, status:r2.status, tag:SD_I18N.fail});
      if (r2.status === 404) return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r2.cost, status:r2.status, tag:SD_I18N.regionBlocked});
      const cc = sd_parseNFRegion(r2) || "";
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc, cost:r2.cost, status:r2.status, tag:SD_I18N.originals});
    }
    if (r1.status === 200) {
      const cc = sd_parseNFRegion(r1) || "";
      return sd_renderLine({name:SD_I18N.netflix, ok:true, cc, cost:r1.cost, status:r1.status, tag:SD_I18N.full});
    }
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:r1.cost, status:r1.status, tag:`HTTP ${r1.status}`});
  } catch(_){
    return sd_renderLine({name:SD_I18N.netflix, ok:false, cc:"", cost:null, status:0, tag:SD_I18N.fail});
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
    const cc = blocked ? "" : (b?.cc || h?.cc || (await sd_queryLandingCC()) || "");
    return sd_renderLine({name:SD_I18N.disney, ok:!blocked, cc, cost:(b?.cost||h?.cost||0), status:(b?.status||h?.status||0), tag: blocked ? SD_I18N.regionBlocked : ""});
  } catch(e){
    const tag = (e==="TO") ? SD_I18N.timeout : SD_I18N.fail;
    return sd_renderLine({name:SD_I18N.disney, ok:false, cc:"", cost:null, status:0, tag});
  }
}

async function sd_testHuluUS() {
  const r = await sd_httpGet("https://www.hulu.com/", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluUS, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  const blocked = /not\s+available\s+in\s+your\s+region/i.test(r.data || "");
  return sd_renderLine({name:SD_I18N.huluUS, ok:!blocked, cc: blocked?"": "US", cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ""});
}
async function sd_testHuluJP() {
  const r = await sd_httpGet("https://www.hulu.jp/", { "Accept-Language":"ja" }, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.huluJP, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  const blocked = /ご利用いただけません|サービスをご利用いただけません|not available/i.test(r.data || "");
  return sd_renderLine({name:SD_I18N.huluJP, ok:!blocked, cc: blocked?"": "JP", cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ""});
}
async function sd_testHBO() {
  const r = await sd_httpGet("https://www.max.com/", {}, true);
  if (!r.ok) return sd_renderLine({name:SD_I18N.hbo, ok:false, cc:"", cost:r.cost, status:r.status, tag:SD_I18N.unreachable});
  const blocked = /not\s+available\s+in\s+your\s+region|country\s+not\s+supported/i.test(r.data || "");
  let cc=""; try { const m = String(r.data||"").match(/"countryCode"\s*:\s*"([A-Z]{2})"/i); if (m) cc = m[1].toUpperCase(); } catch(_){}
  if (!cc) cc = await sd_queryLandingCC();
  return sd_renderLine({name:SD_I18N.hbo, ok:!blocked, cc: blocked?"": cc, cost:r.cost, status:r.status, tag: blocked ? SD_I18N.regionBlocked : ""});
}

async function runServiceChecks(){
  try{
    const [yt, nf, d, cgptW, cgptA, hu, hj, hb] = await Promise.all([
      sd_testYouTube(),
      sd_testNetflix(),
      sd_testDisney(),
      sd_testChatGPTWeb(),
      sd_testChatGPTAppAPI(),
      sd_testHuluUS(),
      sd_testHuluJP(),
      sd_testHBO()
    ]);
    return [yt, nf, d, cgptW, cgptA, hu, hj, hb];
  }catch(_){
    return [];
  }
}
