// == Network Info Panel (Surge) ==
// 直连位置只显示国旗；入口/落地位置与运营商不脱敏；台湾旗可用则显示 🇹🇼，仅在 FLAG_TWFALLBACK=1 时改用 🇼🇸。
;(async () => {
  const A = parseArg()
  const SHOW_IPV6 = on(A.IPv6, 0)
  const MASK_IP   = on(A.MASK_IP, 1)          // 仅用于 IP；位置不再脱敏（除了直连仅旗帜）
  const DOMESTIC  = (A.DOMESTIC_IPv4 || 'ipip').toLowerCase()
  const LANDING   = (A.LANDING_IPv4  || 'ipapi').toLowerCase()
  const TWFALL    = on(A.FLAG_TWFALLBACK, 0)

  // 直连
  const cn  = await getDirectV4(DOMESTIC)
  const cn6 = SHOW_IPV6 ? await getDirectV6() : {}

  // 落地
  const px  = await getLandingV4(LANDING)
  const px6 = SHOW_IPV6 ? await getLandingV6() : {}

  // 最近请求中推断策略与入口
  const { policyName, entranceIP } = await getPolicyAndEntrance()

  // 入口信息（两套源：国内/国外）
  let ent = {}
  if (isIP(entranceIP)) {
    const e1 = await queryLocByIP_Direct(entranceIP, DOMESTIC) // 位置¹/运营商¹
    const e2 = await queryLocByIP_Landing(entranceIP, LANDING) // 位置²/运营商²
    ent = { ip: entranceIP, loc1: e1.loc, isp1: e1.isp, loc2: e2.loc, isp2: e2.isp }
  }

  // ===== 标题 =====
  const title = policyName ? `代理策略: ${policyName}` : '网络信息 𝕏'

  // ===== 直连（位置只保留国旗）=====
  const cnIP = lineIP('IP', cn.ip, cn6.ip, MASK_IP)
  const cnLoc = `位置: ${onlyFlag(cn.loc, TWFALL) || '-'}` // 只旗帜
  const cnISP = cn.isp ? `运营商: ${cn.isp}` : ''

  // ===== 入口（不脱敏，完整显示）=====
  const entLines = []
  if (ent.ip)   entLines.push(lineIP('入口', ent.ip, '', MASK_IP))
  if (ent.loc1) entLines.push(`位置¹: ${flagFirst(ent.loc1, TWFALL)}`)   // 不脱敏
  if (ent.isp1) entLines.push(`运营商¹: ${ent.isp1}`)
  if (ent.loc2) entLines.push(`位置²: ${flagFirst(ent.loc2, TWFALL)}`)   // 不脱敏
  if (ent.isp2) entLines.push(`运营商²: ${ent.isp2}`)

  // ===== 落地（不脱敏，完整显示）=====
  const pxIP  = lineIP('落地 IP', px.ip, px6.ip, MASK_IP)
  const pxLoc = px.loc ? `位置: ${flagFirst(px.loc, TWFALL)}` : ''
  const pxISP = px.isp ? `运营商: ${px.isp}` : ''

  const content = [
    cnIP, cnLoc, cnISP,
    '',                                  // 留白①
    ...entLines,
    entLines.length ? '' : null,         // 留白②（有入口时）
    pxIP, pxLoc, pxISP,
    '',                                  // 留白③
    `执行时间: ${now()}`
  ].filter(v => v !== null).join('\n')

  $done({ title, content })
})().catch(err => {
  $notification.post('网络信息 𝕏', '脚本错误', String(err))
  $done({ title: '网络信息 𝕏', content: String(err) })
})

/* ------------- 基础工具 ------------- */
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

// —— 旗帜控制：默认保留 🇹🇼；仅在 FLAG_TWFALLBACK=1 时用 🇼🇸 替代
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

const IPV4=/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/; const IPV6=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const isIPv4 = ip => IPV4.test(ip||''); const isIPv6 = ip => IPV6.test(ip||''); const isIP = ip => isIPv4(ip)||isIPv6(ip)

function httpGet(url, headers={}){
  return new Promise((resolve,reject)=>$httpClient.get({url,headers},(e,r,b)=>e?reject(e):resolve({status:r?.status||r?.statusCode,body:b})))
}

/* ---------- 直连 v4/v6 ---------- */
async function getDirectV4(p='ipip'){
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

/* ---------- 落地 v4/v6 ---------- */
async function getLandingV4(p='ipapi'){
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

/* ---------- 策略/入口 ---------- */
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

/* ---------- 指定 IP 查询 ---------- */
async function queryLocByIP_Direct(ip, p='ipip'){ try{ if (p==='cip') return await loc_cip(ip); if (p==='163') return await loc_163(ip); if (p==='bilibili') return await loc_ipapi(ip); if (p==='126') return await loc_ipapi(ip); if (p==='pingan') return await loc_pingan(ip); return await loc_ipwhois(ip) }catch(_){ return {} } }
async function queryLocByIP_Landing(ip, p='ipapi'){ try{ if (p==='ipwhois') return await loc_ipwhois(ip); if (p==='ipsb') return await loc_ipsb(ip); return await loc_ipapi(ip) }catch(_){ return {} } }

async function loc_cip(ip){ const r=await httpGet('http://cip.cc/'+encodeURIComponent(ip)); const b=String(r.body||''); const addr=(b.match(/地址.*?:\s*(.+)/)||[])[1]||''; const isp=(b.match(/运营商.*?:\s*(.+)/)||[])[1]||''; const isCN=/中国/.test(addr); return { loc:[flagOf(isCN?'CN':''), addr.replace(/中国\s*/,'')].filter(Boolean).join(' '), isp:isp.replace(/中国\s*/,'') } }
async function loc_163(ip){ const r=await httpGet('https://dashi.163.com/fgw/mailsrv-ipdetail/detail'); const d=(JSON.parse(r.body||'{}')||{}).result||{}; return { loc:[flagOf(d.countryCode), d.country,d.province,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||d.org||'' } }
async function loc_pingan(ip){ const r=await httpGet('https://rmb.pingan.com.cn/itam/mas/linden/ip/request?ip='+encodeURIComponent(ip)); const d=(JSON.parse(r.body||'{}')||{}).data||{}; return { loc:[flagOf(d.countryIsoCode), d.country,d.region,d.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:d.isp||'' } }
async function loc_ipapi(ip){ const r=await httpGet(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.countryCode), j.country?.replace(/\s*中国\s*/,''), j.regionName?.split(/\s+or\s+/)[0], j.city].filter(Boolean).join(' '), isp:j.isp||j.org||j.as||'' } }
async function loc_ipwhois(ip){ const r=await httpGet(`https://ipwhois.app/widget.php?lang=zh-CN&ip=${encodeURIComponent(ip)}`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.country_code), j.country?.replace(/\s*中国\s*/,''), j.region, j.city].filter(Boolean).join(' '), isp:j?.connection?.isp||'' } }
async function loc_ipsb(ip){ const r=await httpGet(`https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`); const j=JSON.parse(r.body||'{}'); return { loc:[flagOf(j.country_code), j.country, j.region, j.city].filter(Boolean).join(' ').replace(/\s*中国\s*/,''), isp:j.isp||j.organization||'' } }

function flagOf(codeOrName){
  let code = String(codeOrName || '').trim()
  if (!code) return ''
  if (/^中国$|^CN$/i.test(code)) code = 'CN'
  if (code.length !== 2 && !/^[A-Z]{2}$/i.test(code)) return ''
  try { return String.fromCodePoint(...[...code.toUpperCase()].map(ch => 127397 + ch.charCodeAt())) } catch(_) { return '' }
}
