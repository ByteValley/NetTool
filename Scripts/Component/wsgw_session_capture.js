/******************************************
 * @name 网上国网（95598）组件服务 - 登录态抓取
 * @description 从官方 App 抓取登录态，写入 BoxJs（ComponentService.SGCC.Settings）
 *
 * 触发接口（默认）:
 * - https://www.95598.cn/oauth2/outer/getWebToken   (http-response)
 *
 * 写入 Keys（全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.acctoken
 * - @ComponentService.SGCC.Settings.token        (尽力获取；也可从其它接口补抓)
 * - @ComponentService.SGCC.Settings.userId       (尽力获取；也可从其它接口补抓)
 * - @ComponentService.SGCC.Settings.lastUpdate
 ******************************************/

const ENV = (() => {
  if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge"
  if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash"
  if (typeof $loon !== "undefined") return "Loon"
  if (typeof $task !== "undefined") return "QuantumultX"
  if (typeof $rocket !== "undefined") return "Shadowrocket"
  return "Unknown"
})()

class Store {
  get(key) {
    switch (ENV) {
      case "Surge":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.read(key)
      case "QuantumultX":
        return $prefs.valueForKey(key)
      default:
        return null
    }
  }
  set(key, val) {
    const v = val == null ? "" : String(val)
    switch (ENV) {
      case "Surge":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(v, key)
      case "QuantumultX":
        return $prefs.setValueForKey(v, key)
      default:
        return false
    }
  }
}
const store = new Store()

function notify(title = "", sub = "", body = "", opts = {}) {
  const open = opts.openUrl || opts.url || opts["open-url"]
  const payload =
    ENV === "QuantumultX" ? (open ? { "open-url": open } : {}) :
    ENV === "Loon" ? (open ? { openUrl: open } : {}) :
    (open ? { url: open } : {})
  try {
    if (ENV === "QuantumultX") $notify(title, sub, body, payload)
    else $notification.post(title, sub, body, payload)
  } catch {}
  console.log(`\n==============📣系统通知📣==============\n${title}\n${sub}\n${body}\n`)
}

function done(x = {}) { $done(x) }

function safeJsonParse(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }
function safeJsonStringify(o) { try { return JSON.stringify(o) } catch { return String(o) } }

function nowISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * BoxJs 的真实存储常见是写在 root key：ComponentService（不带 @）
 * 结构示例：
 * ComponentService {"SGCC":{"Settings":{"phoneNum":"...","password":"..."}}}
 */
function readRootJSON() {
  const raw = store.get("ComponentService")
  const j = safeJsonParse(raw, null)
  return j && typeof j === "object" ? j : {}
}
function writeRootJSON(j) {
  store.set("ComponentService", safeJsonStringify(j))
}

function setSetting(pathKey, value) {
  // 1) 写直读 key（给脚本直接读）
  store.set(`@ComponentService.SGCC.Settings.${pathKey}`, value)

  // 2) 同步写 root JSON（给 BoxJs UI 展示）
  const root = readRootJSON()
  root.SGCC = root.SGCC || {}
  root.SGCC.Settings = root.SGCC.Settings || {}
  root.SGCC.Settings[pathKey] = String(value)
  writeRootJSON(root)
}

function getSetting(pathKey) {
  // 直读优先
  const flat = store.get(`@ComponentService.SGCC.Settings.${pathKey}`)
  if (flat != null && String(flat).trim() !== "") return String(flat)

  const root = readRootJSON()
  const v = root?.SGCC?.Settings?.[pathKey]
  return v == null ? "" : String(v)
}

/* ===========================
 *  抓取逻辑
 * =========================== */

;(function main() {
  const body = ($response && $response.body) ? String($response.body) : ""
  const j = safeJsonParse(body, null)

  // getWebToken 常见字段：access_token
  const acctoken =
    (j && (j.access_token || j?.data?.access_token || j?.bizrt?.access_token)) ? (j.access_token || j?.data?.access_token || j?.bizrt?.access_token) : ""

  // token / userId 可能不在这个响应里：尽力从 headers 或现有缓存拿
  const h = ($response && $response.headers) ? $response.headers : {}
  const tokenFromHeader = h.token || h.Token || h["x-token"] || h["X-Token"] || ""
  const token = tokenFromHeader || getSetting("token") || ""

  const userIdFromHeader = h.userId || h.UserId || h["x-userid"] || h["X-UserId"] || ""
  const userId = userIdFromHeader || getSetting("userId") || ""

  if (acctoken) setSetting("acctoken", acctoken)
  if (token) setSetting("token", token)
  if (userId) setSetting("userId", userId)

  setSetting("lastUpdate", nowISO())

  const miss = []
  if (!acctoken) miss.push("acctoken")
  if (!token) miss.push("token")
  if (!userId) miss.push("userId")

  if (miss.length === 0) {
    notify("网上国网", "登录态抓取成功 ✅", `token/acctoken/userId 已写入 BoxJs\n更新时间：${nowISO()}`, { url: "http://boxjs.com/#/app" })
  } else {
    notify("网上国网", "登录态部分抓取 ✅", `已写入：${acctoken ? "acctoken " : ""}${token ? "token " : ""}${userId ? "userId " : ""}\n缺少：${miss.join(", ")}\n建议：打开 App 多点几下（首页/我的/户号等）触发更多接口`, { url: "http://boxjs.com/#/app" })
  }

  done({})
})()

/**
 * ✅ 如果你发现 token/userId 一直缺
 * 我建议你再加一个抓取点（同样写入上述 Keys）：
 * - /osg-open-uc0001/member/c9/f02   （查询绑定户号的接口，响应里往往带 userId / 相关信息）
 * - /osg-web0004/open/c44/f06        （登录校验接口，响应里往往带 token/userInfo）
 *
 * 做法：复制本脚本一份，改 pattern 到对应接口即可。
 */
