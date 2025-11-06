// == Network Info Panel (Surge) ==
// 直连位置仅旗帜；入口/落地完整显示（不脱敏）；仅 IP 按需脱敏；执行时间前不留空行。
// 台湾旗可正常显示 🇹🇼；仅当 FLAG_TWFALLBACK=1 时以 🇼🇸 代替。
;(async () => {
  const A = parseArg()
  const SHOW_IPV6 = on(A.IPv6, 0)
  const MASK_IP   = on(A.MASK_IP, 1)
  const TWFALL    = on(A.FLAG_TWFALLBACK, 0)

  // —— 直连（分流）
  const cn  = await getDirectV4(A.DOMESTIC_IPv4 || 'ipip')
  const cn6 = SHOW_IPV6 ? await getDirectV6() : {}

  // —— 最近请求：策略名 & 入口 IP
  const { policyName, entranceIP } = await getPolicyAndEntrance()

  // —— 入口信息（强制给出 位置¹/运营商¹ 与 位置²/运营商²）
  const ent = await getEntranceBundle(entranceIP)

  // —— 落地（代理出口）
  const px  = await getLandingV4(A.LANDING_IPv4 || 'ipapi')
  const px6 = SHOW_IPV6 ? await getLandingV6() : {}

  // ===== 组装输出 =====
  const title = policyName ? `代理策略: ${policyName}` : '网络信息 𝕏'

  // 直连：IP(可脱敏) + 位置(仅旗帜) + 运营商
  const cnLines = [
    lineIP('IP', cn.ip, cn6.ip, MASK_IP),
    `位置: ${onlyFlag(cn.loc, TWFALL) || '-'}`,
    cn.isp ? `运营商: ${cn.isp}` : ''
  ].filter(Boolean)

  // 入口：完整显示位置¹/运营商¹（国内源），位置²/运营商²（国际源）
  const entLines = ent.ip ? [
    lineIP('入口', ent.ip, '', MASK_IP),
    ent.loc1 ? `位置¹: ${flagFirst(ent.loc1, TWFALL)}` : '位置¹: -',
    ent.isp1 ? `运营商¹: ${ent.isp1}` : '',
    ent.loc2 ? `位置²: ${flagFirst(ent.loc2, TWFALL)}` : '',
    ent.isp2 ? `运营商²: ${ent.isp2}` : ''
  ].filter(Boolean) : []

  // 落地：完整显示
  const pxLines = [
    lineIP('落地 IP', px.ip, px6.ip, MASK_IP),
    px.loc ? `位置: ${flagFirst(px.loc, TWFALL)}` : '',
    px.isp ? `运营商: ${px.isp}` : ''
  ].filter(Boolean)

  const content = [
    ...cnLines,
    '',                // 直连 → 入口 之间空行
    ...entLines,
    entLines.length ? '' : null, // 有入口则加分隔空行
    ...pxLines,
    `执行时间: ${now()}`
  ].filter(v => v !== null).join('\n')

  $done({ title, content })
})().catch(err => {
  $notification.post('网络信息 𝕏', '脚本错误', String(err))
  $done({ title: '网络信息 𝕏', content: String(err) })
})

/* ================== 工具函数 ================== */
function parseArg(){ try{ if (typeof $argument==='string'&&$argument) return Object.fromEntries($argument.split('&').map(s=>s.split('='))) }catch(_){} return {} }
function on(v,d=0){ return String(v??d)==='1' }
function now(){ return new Date().toTimeString().split(' ')[0] }

function lineIP(label, ip4, ip6, mask){
  const a = `${label}: ${maskIP(ip4, mask) || '-'}`
  const b = ip6 ? `\n${maskIP(ip6, mask)}` : ''
  return a + b
}
function maskIP(ip, mask){
  if (!ip) return ''
  if (!mask) return ip
  return isIPv4(ip) ? ip.split('.').slice(0,2).concat(['*','*']).join('.') :
                      ip.split(':').slice(0,4).concat(['*','*','*','*']).join(':')
}

// —— 旗帜处理：默认保留 🇹🇼；FLAG_TWFALLBACK=1 时改为 🇼🇸
function splitFlag(s, twFallback=false){
  const flagRe=/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u
  const m=(s||'').match(flagRe)
  let flag=m?m[0]:''
  let text=(s||'').replace(flagRe,'')
  if (twFallback && flag.includes('🇹🇼')) flag=flag.replace('🇹🇼','🇼🇸')
  return {flag,text}
}
function onlyFlag(loc, twFallback=false){ return splitFlag(loc, twFallback).flag }
function flagFirst(loc, twFallback=false){ const {flag,text}=splitFlag(loc, twFallback); return flag+text }

const IPV4=/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;
const IPV6=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const isIPv4 = ip => IPV4.test(ip||''); const isIPv6 = ip => IPV6.test(ip||''); const isIP = ip => isIPv4(ip)||isIPv6(ip)

function httpGet(url, headers={}){
  return new Promise((resolve,reject)=>$httpClient.get({url,headers},(e,r,b)=>e?reject(e):resolve({status:r?.status||r?.statusCode,body:b})))
}

/* ============ 数据源：直连/落地/入口 ============ */
// —— 直连 v4
async function getDirectV4(p){
  try{
    if (p==='cip') return await d_cip()
    if (p==='163') return await d_163()
    if (p==='bilibili') return await d_bili()
    if (p==='126') return await d_126()
    if (p==='pingan') return await d_pingan()
    return await d_ipip()
  }catch(_){ try{return await d_ipip()}catch(e){} return {} }
}
async function d_ipip(){ const r=await httpGet('https://myip.ipip.net/json'); const j=JSON.parse(r.body||'{}'); const c0=j?.data?.location?.[0]; const flag=flagOf(c0==='中国'?'CN':c0); return { ip:j?.data?.ip||'', loc:[flag,c0,j?.data?.location?.[1],j?.data?.location?.[2]].filter(Boolean).join(' ').replace(/\s*中国\s*/,'') , isp:j?.data?.location?.[4]||'' } }
async function d_cip(){ const r=await httpGet('http://cip.cc/'); const b=String(r.body||''); const ip=(b.match(/IP.*?:\s*(\S+)/)||[])[1]||''; const addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; const isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''; const isCN=/中国/.test(addr); return { ip, loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') } }
async function d_163(){ const r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countryCode), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' } }
async function d_bili(){ const r=await httpGet('https://api.bilibili.com/x/web-interface/zone'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; const flag=flagOf(d.country==='中国'?'CN':d.country); return { ip:d.addr||'', loc:[flag,d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function d_126(){ const r=await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { ip:d.ip||'', loc:[flagOf(d.countrySymbol), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.operator||'' } }
async function d_pingan(){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request'); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { ip:d.ip||'', loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function getDirectV6(){ try{ const r=await httpGet('https://ipv6.ddnspod.com'); return { ip:String(r.body||'').trim() } }catch(_){ return {} } }

// —— 落地 v4
async function getLandingV4(p){
  try{
    if (p==='ipwhois') return await l_whois()
    if (p==='ipsb')    return await l_ipsb()
    return await l_ipapi()
  }catch(_){ try{return await l_ipapi()}catch(e){} return {} }
}
async function l_ipapi(){ const r=await httpGet('http://ip-api.com/json?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.query||'', loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' } }
async function l_whois(){ const r=await httpGet('https://ipwhois.app/widget.php?lang=zh-CN'); const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',    loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' } }
async function l_ipsb(){  const r=await httpGet('https://api-ipv4.ip.sb/geoip');            const j=JSON.parse(r.body||'{}'); return { ip:j.ip||'',     loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' } }
async function getLandingV6(){ try{ const r=await httpGet('https://api-ipv6.ip.sb/ip'); return { ip:String(r.body||'').trim() } }catch(_){ return {} } }

// —— 入口打包：总能给出 位置¹/运营商¹ 与 位置²/运营商²
async function getEntranceBundle(ip){
  if (!isIP(ip||'')) return {}
  const e1 = await loc_pingan(ip).catch(()=>({}))
  const e2 = await loc_ipapi(ip).catch(()=>({}))
  return {
    ip,
    loc1: e1.loc || '',
    isp1: e1.isp || '',
    loc2: e2.loc || '',
    isp2: e2.isp || ''
  }
}

// 最近请求抓策略与入口 IP（Surge）
function httpAPI(p='/v1/requests/recent'){ return new Promise(res=>{ $httpAPI('GET', p, null, res) }) }
async function getPolicyAndEntrance(){
  try{
    const data = await httpAPI('/v1/requests/recent')
    const reqs = Array.isArray(data?.requests) ? data.requests : []
    const hit  = reqs.slice(0,15).find(i => /(ip-api\.com|ipwhois\.app|ip\.sb|ipinfo\.io)/.test(i.URL))
    if (!hit) return {}
    return {
      policyName: hit.policyName || '',
      entranceIP: /\(Proxy\)/.test(hit.remoteAddress) ? hit.remoteAddress.replace(/\s*\(Proxy\)\s*/,'') : ''
    }
  }catch(_){ return {} }
}

/* —— 指定 IP 查询（供入口使用） —— */
async function loc_pingan(ip){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function loc_ipapi(ip){ const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' } }

/* —— 国旗生成 —— */
function flagOf(cc){
  let code = String(cc || '').trim()
  if (!code) return ''
  if (/^中国$|^CN$/i.test(code)) code = 'CN'
  if (code.length !== 2 && !/^[A-Z]{2}$/i.test(code)) return ''
  try { return String.fromCodePoint(...[...code.toUpperCase()].map(ch => 127397 + ch.charCodeAt())) } catch(_) { return '' }
}
