/******************************************
 * @name 网上国网（95598）组件服务 - 登录态抓取（新域名广域版）
 * @description 命中 map.sgcc.com.cn / csc-*.sgcc.com.cn 响应就尝试从 JSON 中提取 token/acctoken/userId
 *
 * 写入 Keys（全带 @｜Settings 风格）:
 * - @ComponentService.SGCC.Settings.token
 * - @ComponentService.SGCC.Settings.acctoken
 * - @ComponentService.SGCC.Settings.userId
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

function done(x = {}) { $done(x) }
function safeJsonParse(s, fallback = null) { try { return JSON.parse(s) } catch { return fallback } }
function safeJsonStringify(o) { try { return JSON.stringify(o) } catch { return String(o) } }

function nowISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function readRootJSON() {
  const raw = store.get("ComponentService")
  const j = safeJsonParse(raw, null)
  return j && typeof j === "object" ? j : {}
}
function writeRootJSON(j) {
  store.set("ComponentService", safeJsonStringify(j))
}

function setSetting(key, value) {
  // 直读 Key（脚本读取）
  store.set(`@ComponentService.SGCC.Settings.${key}`, value)

  // root JSON（BoxJs UI 展示）
  const root = readRootJSON()
  root.SGCC = root.SGCC || {}
  root.SGCC.Settings = root.SGCC.Settings || {}
  root.SGCC.Settings[key] = String(value)
  writeRootJSON(root)
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k])
  }
  return ""
}

// 递归扫 JSON：把可能的 token 字段都捞出来
function scan(obj, out) {
  if (!obj || typeof obj !== "object") return
  const cand = [
    // token 类
    ["token", ["token", "Token", "x-token", "X-Token"]],
    ["acctoken", ["acctoken", "accToken", "access_token", "accessToken", "AccessToken", "acctokenValue"]],
    ["userId", ["userId", "userid", "UserId", "user_id", "userID", "uid", "memberId", "acctId"]]
  ]

  for (const [name, keys] of cand) {
    if (!out[name]) {
      const v = pickFirst(obj, keys)
      if (v) out[name] = v
    }
  }

  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v && typeof v === "object") scan(v, out)
  }
}

;(function main() {
  const url = ($request && $request.url) ? String($request.url) : ""
  const body = ($response && $response.body) ? String($response.body) : ""

  // 只处理 JSON（不是 JSON 直接退出，避免噪声）
  const j = safeJsonParse(body, null)
  if (!j) return done({})

  const out = { token: "", acctoken: "", userId: "" }

  // 1) 先从 headers 捞（有些接口把 token 放 header）
  const h = ($response && $response.headers) ? $response.headers : {}
  out.token = pickFirst(h, ["token", "Token", "x-token", "X-Token"]) || out.token
  out.userId = pickFirst(h, ["userId", "UserId", "x-userid", "X-UserId"]) || out.userId

  // 2) 再递归扫 body
  scan(j, out)

  // 3) 写入（只写非空）
  if (out.token) setSetting("token", out.token)
  if (out.acctoken) setSetting("acctoken", out.acctoken)
  if (out.userId) setSetting("userId", out.userId)
  setSetting("lastUpdate", nowISO())

  // 打一条关键日志（你说“没反应”，我们就让它必然可见）
  console.log(`[网上国网] 捕获命中：${url}`)
  console.log(`[网上国网] token=${out.token ? "[SET]" : "[EMPTY]"} acctoken=${out.acctoken ? "[SET]" : "[EMPTY]"} userId=${out.userId ? "[SET]" : "[EMPTY]"}`)

  done({})
})()
