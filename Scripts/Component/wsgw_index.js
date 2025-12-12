/******************************************
 * @name 网上国网（95598）组件服务 - 数据接口
 * @description 通过网上国网账号密码登录，聚合电费/电量/阶梯等数据，供小组件读取
 *
 * BoxJs Keys:
 * - @ComponentService.SGCC.phoneNum
 * - @ComponentService.SGCC.password
 * - @ComponentService.SGCC.logDebug
 *
 * Rewrite:
 * ^https?:\/\/api\.wsgw-rewrite\.com\/electricity\/bill\/all
 *
 ******************************************/

/* ===========================
 *  环境 & 工具
 * =========================== */

const ENV = (() => {
  if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge"
  if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash"
  if (typeof $loon !== "undefined") return "Loon"
  if (typeof $task !== "undefined") return "QuantumultX"
  if (typeof $rocket !== "undefined") return "Shadowrocket"
  if (typeof process !== "undefined" && process.release && process.release.name === "node") return "Node"
  return "Unknown"
})()

const isQX = ENV === "QuantumultX"
const isNode = ENV === "Node"

class Store {
  constructor(namespace = "ComponentService") {
    this.namespace = namespace
    this.env = ENV
    if (this.env === "Node") {
      const { LocalStorage } = require("node-localstorage")
      this.localStorage = new LocalStorage(`./store/${namespace}`)
    }
  }
  get(key) {
    switch (this.env) {
      case "Surge":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.read(key)
      case "QuantumultX":
        return $prefs.valueForKey(key)
      case "Node":
        return this.localStorage.getItem(key)
      default:
        return null
    }
  }
  set(key, val) {
    const v = val == null ? "" : String(val)
    switch (this.env) {
      case "Surge":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(v, key)
      case "QuantumultX":
        return $prefs.setValueForKey(v, key)
      case "Node":
        this.localStorage.setItem(key, v)
        return true
      default:
        return false
    }
  }
  clear(key) {
    switch (this.env) {
      case "Surge":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(null, key)
      case "QuantumultX":
        return $prefs.removeValueForKey(key)
      case "Node":
        this.localStorage.removeItem(key)
        return true
      default:
        return false
    }
  }
}

class Logger {
  constructor(prefix, debug = false) {
    this.prefix = prefix
    this.debugEnabled = !!debug
  }
  info(...a) { console.log(`[${this.prefix}] ${a.join(" ")}`) }
  warn(...a) { console.log(`[${this.prefix}] [WARN] ${a.join(" ")}`) }
  error(...a) { console.log(`[${this.prefix}] [ERROR] ${a.join(" ")}`) }
  debug(...a) { if (this.debugEnabled) console.log(`[${this.prefix}] [DEBUG] ${a.join(" ")}`) }
}

function notify(title = "", sub = "", body = "", opts = {}) {
  const build = (o) => {
    const open = o.openUrl || o.url || o["open-url"]
    if (!open) return o
    if (ENV === "QuantumultX") return { "open-url": open }
    if (ENV === "Loon") return { openUrl: open }
    return { url: open }
  }
  try {
    if (ENV === "QuantumultX") $notify(title, sub, body, build(opts))
    else $notification.post(title, sub, body, build(opts))
  } catch {}
  console.log(`\n==============📣系统通知📣==============\n${title}\n${sub}\n${body}\n`)
}

function done(payload = {}) {
  if (ENV === "Node") process.exit(0)
  $done(payload)
}

async function http(request) {
  const method = (request.method || "GET").toUpperCase()
  const lower = method.toLowerCase()

  // 统一清理 content-length，避免部分环境报错
  if (request.headers) {
    delete request.headers["Content-Length"]
    delete request.headers["content-length"]
  }

  if (ENV === "QuantumultX") {
    return $task.fetch(request).then(
      (r) => {
        r.status = r.statusCode
        r.ok = /^2\d\d$/.test(String(r.statusCode))
        return r
      },
      (e) => Promise.reject(e.error || e)
    )
  }

  if (ENV === "Node") {
    const got = require("got")
    const { url, ...opt } = request
    return got[lower](url, opt).then(
      (r) => ({ status: r.statusCode, ok: /^2\d\d$/.test(String(r.statusCode)), body: r.body }),
      (e) => Promise.reject(e.message || e)
    )
  }

  return new Promise((resolve, reject) => {
    $httpClient[lower](request, (err, resp, data) => {
      if (err) return reject(err)
      resp.status = resp.statusCode || resp.status
      resp.ok = /^2\d\d$/.test(String(resp.status))
      resp.body = data
      resolve(resp)
    })
  })
}

function safeJsonParse(s, fallback = null) {
  try { return JSON.parse(s) } catch { return fallback }
}
function safeJsonStringify(o) {
  try { return JSON.stringify(o) } catch { return String(o) }
}

function getUrlParams(url) {
  const q = (url.split("?")[1] || "").trim()
  if (!q) return {}
  const out = {}
  q.split("&").forEach((kv) => {
    const [k, v = ""] = kv.split("=")
    if (!k) return
    out[decodeURIComponent(k)] = decodeURIComponent(v)
  })
  return out
}

/* ===========================
 *  业务配置
 * =========================== */

const SCRIPTNAME = "网上国网"
const store = new Store("ComponentService")

const KEY_PHONE = "@ComponentService.SGCC.phoneNum"
const KEY_PASS  = "@ComponentService.SGCC.password"
const KEY_DEBUG = "@ComponentService.SGCC.logDebug"

const DEBUG = store.get(KEY_DEBUG) === "true" || store.get(KEY_DEBUG) === "1"
const log = new Logger(SCRIPTNAME, DEBUG)

const USERNAME = (store.get(KEY_PHONE) || "").trim()
const PASSWORD = (store.get(KEY_PASS) || "").trim()

// 这套加解密/识别码服务来自原脚本思路（第三方服务不可控）
const SERVER_HOST = "https://api.120399.xyz"
const BASE_URL = "https://www.95598.cn"

// 仅保留当前脚本实际会用到的接口路径（精简版）
const API = {
  getKeyCode: "/oauth2/outer/c02/f02",
  loginVerifyCodeNew: "/osg-web0004/open/c44/f05",
  loginTestCodeNew: "/osg-web0004/open/c44/f06",
  getAuth: "/oauth2/oauth/authorize",
  getWebToken: "/oauth2/outer/getWebToken",
  searchUser: "/osg-open-uc0001/member/c9/f02",
  accapi: "/osg-open-bc0001/member/c05/f01",
  busInfoApi: "/osg-web0004/member/c24/f01",
  electBill: "/osg-open-bc0001/member/c04/f03",
  LowelectBill: "/osg-open-bc0001/member/c04/f01",
  HideelectBill: "/osg-open-bc0001/member/c04/f02",
  mouthOutFunc: { funcCode: "WEBALIPAY_01", channelCode: "0902", clearCache: "11", promotCode: "1", promotType: "1", serviceCode: "BCP_000026", source: "app" },
  getdayFunc: { funcCode: "WEBALIPAY_01", channelCode: "0902", clearCache: "11", promotCode: "1", promotType: "1", serviceCode: "BCP_000026", source: "app" },
  accountFunc: { channelCode: "0902", funcCode: "WEBA1007200" }
}

// 配置（精简必要项）
const CFG = {
  source: "SGAPP",
  target: "32101",
  uscInfo: { member: "0902", devciceIp: "", devciceId: "", tenant: "state_grid" },
  userInformServiceCode: "0101183",
  stepelect: { channelCode: "0902", funcCode: "WEBALIPAY_01", promotType: "1", clearCache: "09", serviceCode: "BCP_000026", source: "app" },
}

/* ===========================
 *  加解密请求封装（与原脚本一致）
 * =========================== */

async function Encrypt(config) {
  const r = await http(config)
  const j = safeJsonParse(r.body, null)
  if (!j || !j.data || !j.data.url) throw new Error("Encrypt: invalid response")
  j.data.url = BASE_URL + j.data.url
  j.data.body = safeJsonStringify(j.data.data)
  delete j.data.data
  return j.data
}

async function Decrypt(config) {
  const r = await http(config)
  const j = safeJsonParse(r.body, null)
  if (!j || !j.data) throw new Error("Decrypt: invalid response")
  const { code, message, data } = j.data
  if (String(code) === "1") return data
  throw new Error(message || "Decrypt failed")
}

async function request95598(reqCfg) {
  // 1) encrypt
  const encCfg = {
    url: `${SERVER_HOST}/wsgw/encrypt`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: safeJsonStringify({ yuheng: reqCfg })
  }
  const enc = await Encrypt(encCfg)

  // 特殊：authorize 返回是字符串包裹
  const res = await http(enc)
  let body = res.body
  let parsed = safeJsonParse(body, null)
  if (!parsed) parsed = body

  // 2) decrypt
  const payload = { config: { ...reqCfg }, data: parsed }
  if (reqCfg.url === "/api" + API.getKeyCode) {
    // keyCode 接口需要带 encryptKey 回来用于后续 headers
    payload.config.headers = { encryptKey: enc.encryptKey }
  }

  const decCfg = {
    url: `${SERVER_HOST}/wsgw/decrypt`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: safeJsonStringify({ yuheng: payload })
  }
  return Decrypt(decCfg)
}

async function recognizeCaptcha(canvasSrc) {
  const cfg = {
    url: `${SERVER_HOST}/wsgw/get_x`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: safeJsonStringify({ yuheng: canvasSrc })
  }
  const r = await http(cfg)
  const j = safeJsonParse(r.body, null)
  if (!j || !j.data) throw new Error("验证码识别失败")
  return j.data
}

function getBeforeDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/* ===========================
 *  登录链路
 * =========================== */

let requestKey = null
let bizrt = null
let authorizecode = ""
let accessToken = ""
let bindInfo = null

async function getKeyCode() {
  log.info("⏳ 获取 keyCode/publicKey ...")
  const cfg = { url: `/api${API.getKeyCode}`, method: "POST", headers: {} }
  requestKey = await request95598(cfg)
  log.debug("key:", safeJsonStringify(requestKey))
}

async function getVerifyCode() {
  log.info("⏳ 获取验证码凭证 ...")
  const cfg = {
    url: `/api${API.loginVerifyCodeNew}`,
    method: "POST",
    headers: { ...requestKey },
    data: { password: PASSWORD, account: USERNAME, canvasHeight: 200, canvasWidth: 310 }
  }
  const r = await request95598(cfg)
  if (!r || !r.ticket || !r.canvasSrc) throw new Error("验证码凭证为空")
  const code = await recognizeCaptcha(r.canvasSrc)
  return { ticket: r.ticket, code }
}

async function login(ticket, code) {
  log.info("⏳ 登录中 ...")
  const cfg = {
    url: `/api${API.loginTestCodeNew}`,
    method: "POST",
    headers: { ...requestKey },
    data: {
      loginKey: ticket,
      code,
      params: {
        uscInfo: { devciceIp: "", tenant: "state_grid", member: "0902", devciceId: "" },
        quInfo: {
          optSys: "android",
          pushId: "000000",
          addressProvince: "110100",
          addressRegion: "110101",
          addressCity: "330100",
          password: PASSWORD,
          account: USERNAME
        }
      },
      Channels: "web"
    }
  }
  const r = await request95598(cfg)
  if (!r || !r.bizrt || !(r.bizrt.userInfo && r.bizrt.userInfo.length)) throw new Error("登录失败：账号/密码/验证码可能不正确")
  bizrt = r.bizrt
  log.debug("token:", bizrt.token)
}

async function getAuthcode() {
  log.info("⏳ 获取授权码 ...")
  const cfg = { url: `/api${API.getAuth}`, method: "POST", headers: { ...requestKey, token: bizrt.token } }
  const r = await request95598(cfg)
  const redirect = r && r.redirect_url
  if (!redirect || redirect.indexOf("code=") === -1) throw new Error("授权码获取失败：redirect_url 异常")
  authorizecode = redirect.split("code=")[1]
  log.debug("authorizecode:", authorizecode)
}

async function getAccessToken() {
  log.info("⏳ 获取 accessToken ...")
  const cfg = {
    url: `/api${API.getWebToken}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, authorizecode }
  }
  const r = await request95598(cfg)
  accessToken = r && r.access_token
  if (!accessToken) throw new Error("accessToken 为空")
  log.debug("accessToken:", accessToken)
}

async function getBindInfo() {
  log.info("⏳ 查询绑定户号 ...")
  const [u] = bizrt.userInfo
  const cfg = {
    url: `/api${API.searchUser}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      serviceCode: CFG.userInformServiceCode,
      source: CFG.source,
      target: CFG.target,
      uscInfo: CFG.uscInfo,
      quInfo: { userId: u.userId },
      token: bizrt.token,
      Channels: "web"
    }
  }
  const r = await request95598(cfg)
  bindInfo = r && r.bizrt
  if (!bindInfo || !bindInfo.powerUserList || !bindInfo.powerUserList.length) throw new Error("未获取到绑定户号")
}

/* ===========================
 *  数据查询（按户号聚合）
 * =========================== */

async function getElcFee(index) {
  const o = bindInfo.powerUserList[index]
  const [u] = bizrt.userInfo
  const cfg = {
    url: `/api${API.accapi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      data: {
        srvCode: "",
        serialNo: "",
        channelCode: API.accountFunc.channelCode,
        funcCode: API.accountFunc.funcCode,
        acctId: u.userId,
        userName: u.loginAccount || u.nickname,
        promotType: "1",
        promotCode: "1",
        userAccountId: u.userId,
        list: [{
          consNoSrc: o.consNo_dst,
          proCode: o.proNo,
          sceneType: o.constType,
          consNo: o.consNo,
          orgNo: o.orgNo
        }]
      },
      serviceCode: "0101143",
      source: CFG.source,
      target: o.proNo || o.provinceId
    }
  }
  const r = await request95598(cfg)
  return (r && r.list && r.list[0]) || {}
}

async function getDayElecQuantity(index, days = 6) {
  const o = bindInfo.powerUserList[index]
  const [u] = bizrt.userInfo
  const startTime = getBeforeDate(days)
  const endTime = getBeforeDate(1)

  const cfg = {
    url: `/api${API.busInfoApi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      params1: { serviceCode: "", source: CFG.source, target: CFG.target, uscInfo: CFG.uscInfo, quInfo: { userId: u.userId }, token: bizrt.token },
      params3: {
        data: {
          acctId: u.userId,
          consNo: o.consNo_dst,
          consType: (o.constType === "02" ? "02" : "01"),
          endTime,
          orgNo: o.orgNo,
          queryYear: String(new Date().getFullYear()),
          proCode: o.proNo || o.provinceId,
          serialNo: "",
          srvCode: "",
          startTime,
          userName: u.nickname || u.loginAccount,
          funcCode: API.getdayFunc.funcCode,
          channelCode: API.getdayFunc.channelCode,
          clearCache: API.getdayFunc.clearCache,
          promotCode: API.getdayFunc.promotCode,
          promotType: API.getdayFunc.promotType
        },
        serviceCode: API.getdayFunc.serviceCode,
        source: API.getdayFunc.source,
        target: o.proNo || o.provinceId
      },
      params4: "010103"
    }
  }
  return request95598(cfg)
}

async function getMonthElecQuantity(index, yearOffset = 0) {
  const o = bindInfo.powerUserList[index]
  const [u] = bizrt.userInfo
  const queryYear = String(new Date().getFullYear() + yearOffset)

  const cfg = {
    url: `/api${API.busInfoApi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      params1: { serviceCode: "", source: CFG.source, target: CFG.target, uscInfo: CFG.uscInfo, quInfo: { userId: u.userId }, token: bizrt.token },
      params3: {
        data: {
          acctId: u.userId,
          consNo: o.consNo_dst,
          consType: (o.constType === "02" ? "02" : "01"),
          orgNo: o.orgNo,
          proCode: o.proNo || o.provinceId,
          provinceCode: o.proNo || o.provinceId,
          queryYear,
          serialNo: "",
          srvCode: "",
          userName: u.nickname || u.loginAccount,
          funcCode: API.mouthOutFunc.funcCode,
          channelCode: API.mouthOutFunc.channelCode,
          clearCache: API.mouthOutFunc.clearCache,
          promotCode: API.mouthOutFunc.promotCode,
          promotType: API.mouthOutFunc.promotType
        },
        serviceCode: API.mouthOutFunc.serviceCode,
        source: API.mouthOutFunc.source,
        target: o.proNo || o.provinceId
      },
      params4: "010102"
    }
  }
  return request95598(cfg)
}

async function getStepElecQuantity(index, monthOverride) {
  const o = bindInfo.powerUserList[index]
  const [u] = bizrt.userInfo

  const now = new Date()
  const year = now.getFullYear()
  let month = (typeof monthOverride === "number" ? monthOverride : now.getMonth()) // 0-11
  // 原脚本是拼 yyyy-MM（month 从 1 开始），这里保持：用 (month) 作为 1-12
  const m = Math.max(1, Math.min(12, month === 0 ? 1 : month)) // 防呆
  const mm = String(m).padStart(2, "0")
  const queryDate = `${year}-${mm}`

  const apiPath =
    (String(o.orgNo || o.provinceId) === "33101")
      ? (String(o.constType) === "01" ? API.HideelectBill : API.LowelectBill)
      : API.electBill

  const cfg = {
    url: `/api${apiPath}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      data: {
        channelCode: CFG.stepelect.channelCode,
        funcCode: CFG.stepelect.funcCode,
        promotType: CFG.stepelect.promotType,
        clearCache: CFG.stepelect.clearCache,
        consNo: o.consNo_dst,
        promotCode: o.proNo || o.provinceId,
        orgNo: o.orgNo || "",
        queryDate,
        provinceCode: o.proNo || o.provinceId,
        consType: o.constType || o.consSortCode,
        userAccountId: u.userId,
        serialNo: "",
        srvCode: "",
        userName: u.nickname || u.loginAccount,
        acctId: u.userId
      },
      serviceCode: CFG.stepelect.serviceCode,
      source: CFG.stepelect.source,
      target: o.proNo || o.provinceId
    }
  }

  const r = await request95598(cfg)
  // 原接口返回有 rtnCode/rtnMsg 的情况，这里兜底一下
  if (r && r.rtnCode && String(r.rtnCode) !== "1") throw new Error(r.rtnMsg || "阶梯用电查询失败")
  return r
}

async function getDataSourceByParams(index) {
  const params = getUrlParams($request && $request.url ? $request.url : "")
  // 没带参数：全量
  if (!params || !Object.keys(params).length) {
    const [eleBill, dayElecQuantity, dayElecQuantity31, monthElecQuantity, lastYearElecQuantity, stepElecQuantity] = await Promise.all([
      getElcFee(index),
      getDayElecQuantity(index, 6),
      getDayElecQuantity(index, 32),
      getMonthElecQuantity(index, 0),
      getMonthElecQuantity(index, -1),
      getStepElecQuantity(index)
    ])
    return { eleBill, dayElecQuantity, dayElecQuantity31, monthElecQuantity, lastYearElecQuantity, stepElecQuantity }
  }

  // 按需
  const tasks = []
  const out = {}
  if (params.eleBill) tasks.push(getElcFee(index).then(v => out.eleBill = v))
  if (params.dayElecQuantity) tasks.push(getDayElecQuantity(index, 6).then(v => out.dayElecQuantity = v))
  if (params.dayElecQuantity31) tasks.push(getDayElecQuantity(index, 32).then(v => out.dayElecQuantity31 = v))
  if (params.monthElecQuantity) tasks.push(getMonthElecQuantity(index, 0).then(v => out.monthElecQuantity = v))
  if (params.lastYearElecQuantity) tasks.push(getMonthElecQuantity(index, -1).then(v => out.lastYearElecQuantity = v))
  if (params.stepElecQuantity) tasks.push(getStepElecQuantity(index).then(v => out.stepElecQuantity = v))

  await Promise.all(tasks)
  return out
}

/* ===========================
 *  主流程
 * =========================== */

;(async () => {
  if (!USERNAME || !PASSWORD) {
    notify(
      SCRIPTNAME,
      "请先在 BoxJs 配置账号密码",
      "需要：ComponentService.SGCC.phoneNum / ComponentService.SGCC.password",
      { url: "http://boxjs.com/#/app" }
    )
    throw new Error("账号密码未配置")
  }

  await getKeyCode()
  const { ticket, code } = await getVerifyCode()
  await login(ticket, code)
  await getAuthcode()
  await getAccessToken()
  await getBindInfo()

  const list = bindInfo.powerUserList || []
  const result = new Array(list.length)

  for (let i = 0; i < list.length; i++) {
    let data
    try {
      data = await getDataSourceByParams(i)
    } catch (e) {
      // 兜底：阶梯用电某些月份报错时尝试上个月
      log.warn(`户号[${i}] 部分数据失败，尝试回退阶梯月份：`, String(e))
      let m = new Date().getMonth() - 1
      if (m < 0) m = 11
      const step = await getStepElecQuantity(i, m)
      data = data || {}
      data.stepElecQuantity = step
    }

    const userInfo = list[i]
    const eleBill = data.eleBill || {}
    const arrears = Number(eleBill.historyOwe || "0") > 0 || Number(eleBill.sumMoney || "0") < 0

    result[i] = {
      eleBill,
      userInfo,
      dayElecQuantity: data.dayElecQuantity || {},
      dayElecQuantity31: data.dayElecQuantity31 || {},
      monthElecQuantity: data.monthElecQuantity || {},
      lastYearElecQuantity: data.lastYearElecQuantity || {},
      stepElecQuantity: data.stepElecQuantity || {},
      arrearsOfFees: arrears
    }
  }

  const resp = {
    status: isQX ? "HTTP/1.1 200" : 200,
    headers: { "content-type": "application/json;charset=utf-8" },
    body: safeJsonStringify(result)
  }

  done(isQX ? resp : { response: resp })
})().catch((e) => {
  log.error(String(e))
  // 直接返回空数组，避免组件端炸 UI
  const resp = {
    status: isQX ? "HTTP/1.1 200" : 200,
    headers: { "content-type": "application/json;charset=utf-8" },
    body: "[]"
  }
  done(isQX ? resp : { response: resp })
})
