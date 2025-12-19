/******************************************
 * @name BoxJS Bridge
 * @description 通用：跨 Surge/Egern/Loon/Stash/Shadowrocket/QX 写入 BoxJs 根 JSON（默认 ComponentService）
 * @author ByteValley
 * @version 2025-12-19R1
 *
 * URL（推荐 GET，payload 为 JSON 字符串）：
 * - https://api.boxjs-bridge.com/set?boxKey=ComponentService&payload=...
 * - https://api.boxjs-bridge.com/appendLog?boxKey=ComponentService&payload=...
 * - https://api.boxjs-bridge.com/get?boxKey=ComponentService&payload=...
 *
 * payload(JSON):
 * - set:
 *   { "path":"12123.Caches.cacheMeta", "value": {...}, "create": true }
 * - appendLog:
 *   { "path":"12123.Logs.log", "line":"hello", "maxLines":240 }
 * - get:
 *   { "path":"12123.Settings.token" }
 * - batch:
 *   { "ops":[ {op:"set", path:"...", value:...}, {op:"appendLog", path:"...", line:"..."} ] }
 ******************************************/

function getEnv() {
  if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge"
  if (typeof $environment !== "undefined" && $environment["egern-version"]) return "Egern"
  if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash"
  if (typeof $loon !== "undefined") return "Loon"
  if (typeof $task !== "undefined") return "Quantumult X"
  if (typeof $rocket !== "undefined") return "Shadowrocket"
  return "Unknown"
}

const ENV = getEnv()

function isObj(v) { return v && typeof v === "object" && !Array.isArray(v) }
function jparse(s, defVal) { try { return JSON.parse(s) } catch { return defVal } }
function jstr(v) { try { return JSON.stringify(v) } catch { return String(v) } }

function queryParams(url) {
  const out = {}
  const i = url.indexOf("?")
  if (i < 0) return out
  const seg = url.slice(i + 1).split("&")
  for (const kv of seg) {
    if (!kv) continue
    const p = kv.split("=")
    const k = decodeURIComponent(p[0] || "")
    const v = decodeURIComponent(p.slice(1).join("=") || "")
    if (k) out[k] = v
  }
  return out
}

const Storage = {
  read(key) {
    if (ENV === "Quantumult X") return $prefs.valueForKey(key)
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) return $persistentStore.read(key)
    return null
  },
  write(key, val) {
    if (ENV === "Quantumult X") return $prefs.setValueForKey(val, key)
    if (typeof $persistentStore !== "undefined" && $persistentStore.write) return $persistentStore.write(val, key)
    return false
  },
}

function respond(statusCode, obj) {
  const body = jstr(obj)
  const headers = { "Content-Type": "application/json;charset=utf-8" }

  if (ENV === "Quantumult X") {
    $done({ status: `HTTP/1.1 ${statusCode}`, headers, body })
    return
  }

  try {
    $done({ response: { status: statusCode, headers, body } })
  } catch {
    $done({ status: statusCode, headers, body })
  }
}

function readRoot(boxKey) {
  const raw = Storage.read(boxKey) || "{}"
  const root = jparse(raw, {})
  return isObj(root) ? root : {}
}

function writeRoot(boxKey, root) {
  return Storage.write(boxKey, jstr(root))
}

function splitPath(path) {
  return String(path || "").split(".").map((s) => s.trim()).filter(Boolean)
}

function getByPath(root, path) {
  const seg = splitPath(path)
  let cur = root
  for (const k of seg) {
    if (cur == null) return undefined
    cur = cur[k]
    if (cur === undefined) return undefined
  }
  return cur
}

function setByPath(root, path, value, create) {
  const seg = splitPath(path)
  if (!seg.length) return false

  let cur = root
  for (let i = 0; i < seg.length - 1; i++) {
    const k = seg[i]
    const next = cur[k]
    if (!isObj(next)) {
      if (create === false) return false
      cur[k] = {}
    }
    cur = cur[k]
  }
  cur[seg[seg.length - 1]] = value
  return true
}

function ensureArray(v) { return Array.isArray(v) ? v : [] }

function clampLines(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 120
  return Math.max(1, Math.min(500, Math.floor(x)))
}

function trimLogs(logs, maxLines) {
  const n = clampLines(maxLines)
  if (logs.length <= n) return logs
  return logs.slice(logs.length - n)
}

function appendLogAtPath(root, path, line, maxLines) {
  const s = String(line || "").trim()
  if (!s) return false

  const iso = new Date().toISOString()
  const msg = `[${iso}] ${s}`

  const prev = getByPath(root, path)
  const logs = ensureArray(prev)
  logs.push(msg)

  setByPath(root, path, trimLogs(logs, maxLines), true)
  return true
}

(function main() {
  const url = ($request && $request.url) ? $request.url : ""
  if (!url) return respond(400, { ok: false, env: ENV, error: "Missing $request.url" })

  const params = queryParams(url)
  const boxKey = (params.boxKey || "ComponentService").trim() || "ComponentService"

  const payloadRaw = (params.payload || "").trim()
  const payload = payloadRaw ? jparse(payloadRaw, null) : null

  const pathOnly = url.split("?")[0] || ""
  const action =
    /\/set$/.test(pathOnly) ? "set" :
    /\/appendLog$/.test(pathOnly) ? "appendLog" :
    /\/get$/.test(pathOnly) ? "get" :
    ""

  if (!action) return respond(404, { ok: false, env: ENV, error: "Unknown action", url: pathOnly })
  if (!payload || !isObj(payload)) return respond(400, { ok: false, env: ENV, error: "Missing/invalid payload(JSON)" })

  const root = readRoot(boxKey)

  // batch：payload.ops 存在就执行（不依赖 action）
  if (Array.isArray(payload.ops)) {
    const ops = payload.ops
    const limit = 220
    const safeOps = ops.length > limit ? ops.slice(0, limit) : ops

    const results = []
    for (const op of safeOps) {
      if (!isObj(op)) continue
      const t = String(op.op || "").trim()

      if (t === "set") {
        const ok = setByPath(root, op.path, op.value, op.create !== false)
        results.push({ op: "set", path: op.path, ok })
      } else if (t === "appendLog") {
        const ok = appendLogAtPath(root, op.path, op.line, op.maxLines)
        results.push({ op: "appendLog", path: op.path, ok })
      } else if (t === "get") {
        const val = getByPath(root, op.path)
        results.push({ op: "get", path: op.path, ok: val !== undefined, value: val })
      }
    }

    const wrote = writeRoot(boxKey, root)
    return respond(200, {
      ok: !!wrote,
      env: ENV,
      boxKey,
      action: "batch",
      wrote,
      count: safeOps.length,
      truncated: ops.length > limit,
      results,
    })
  }

  if (action === "set") {
    const ok = setByPath(root, payload.path, payload.value, payload.create !== false)
    const wrote = ok ? writeRoot(boxKey, root) : false
    return respond(200, { ok: !!wrote, env: ENV, boxKey, action, path: payload.path, wrote })
  }

  if (action === "appendLog") {
    const ok = appendLogAtPath(root, payload.path, payload.line, payload.maxLines)
    const wrote = ok ? writeRoot(boxKey, root) : false
    return respond(200, { ok: !!wrote, env: ENV, boxKey, action, path: payload.path, wrote })
  }

  if (action === "get") {
    const val = getByPath(root, payload.path)
    return respond(200, { ok: val !== undefined, env: ENV, boxKey, action, path: payload.path, value: val })
  }
})()
