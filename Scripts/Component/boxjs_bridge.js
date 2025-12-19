/******************************************
 * @name BoxJS Bridge
 * @description 通用：跨 Surge/Egern/Loon/Stash/Shadowrocket/QX 写入 BoxJs 根 JSON（默认 ComponentService）
 * @author ByteValley
 * @version 2025-12-19R2
 *
 * URL:
 * - https://api.boxjs-bridge.com/set?boxKey=ComponentService&payload=...
 * - https://api.boxjs-bridge.com/appendLog?boxKey=ComponentService&payload=...
 * - https://api.boxjs-bridge.com/get?boxKey=ComponentService&payload=...
 *
 * payload(JSON):
 * - set:
 *   { "path":"12123.Caches.cacheM", "value": {...}, "create": true }
 * - appendLog:
 *   { "path":"12123.Logs.log", "line":"hello", "maxLines":80 }
 * - get:
 *   { "path":"12123.Caches.cacheM" }
 * - batch:
 *   { "ops":[ {op:"set", path:"...", value:...}, {op:"appendLog", path:"...", line:"..."} ] }
 ******************************************/

function getEnv() {
  if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge";
  if (typeof $environment !== "undefined" && $environment["egern-version"]) return "Egern";
  if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash";
  if (typeof $loon !== "undefined") return "Loon";
  if (typeof $task !== "undefined") return "Quantumult X";
  if (typeof $rocket !== "undefined") return "Shadowrocket";
  return "Unknown";
}

const ENV = getEnv();

function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

function jparse(s, defVal) {
  try { return JSON.parse(s); } catch { return defVal; }
}
function jstr(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function queryParams(url) {
  const out = {};
  const i = url.indexOf("?");
  if (i < 0) return out;
  const seg = url.slice(i + 1).split("&");
  for (const kv of seg) {
    if (!kv) continue;
    const p = kv.split("=");
    const k = decodeURIComponent(p[0] || "");
    const v = decodeURIComponent(p.slice(1).join("=") || "");
    if (k) out[k] = v;
  }
  return out;
}

/* =======================
 * Storage：跨内核统一
 * ======================= */
const Storage = {
  read(key) {
    if (ENV === "Quantumult X") return $prefs.valueForKey(key);
    if (typeof $persistentStore !== "undefined" && $persistentStore.read) return $persistentStore.read(key);
    return null;
  },
  write(key, val) {
    if (ENV === "Quantumult X") return $prefs.setValueForKey(val, key);
    if (typeof $persistentStore !== "undefined" && $persistentStore.write) return $persistentStore.write(val, key);
    return false;
  }
};

function respond(statusCode, obj) {
  const body = jstr(obj);
  const headers = { "Content-Type": "application/json;charset=utf-8" };

  if (ENV === "Quantumult X") {
    $done({ status: `HTTP/1.1 ${statusCode}`, headers, body });
    return;
  }

  // Surge/Egern/Loon/Stash/Shadowrocket：两种形态都试一下
  try {
    $done({ response: { status: statusCode, headers, body } });
  } catch {
    $done({ status: statusCode, headers, body });
  }
}

/* =======================
 * Root JSON：读写
 * ======================= */
function readRoot(boxKey) {
  const raw = Storage.read(boxKey) || "{}";
  const root = jparse(raw, {});
  return isObj(root) ? root : {};
}

function writeRoot(boxKey, root) {
  return Storage.write(boxKey, jstr(root));
}

/* =======================
 * Path：get/set（点路径）
 * ======================= */
function splitPath(path) {
  return String(path || "").split(".").map(s => s.trim()).filter(Boolean);
}

function getByPath(root, path) {
  const seg = splitPath(path);
  let cur = root;
  for (const k of seg) {
    if (cur == null) return undefined;
    cur = cur[k];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function setByPath(root, path, value, create) {
  const seg = splitPath(path);
  if (!seg.length) return false;

  let cur = root;
  for (let i = 0; i < seg.length - 1; i++) {
    const k = seg[i];
    const next = cur[k];
    if (!isObj(next)) {
      if (create === false) return false;
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[seg[seg.length - 1]] = value;
  return true;
}

/* =======================
 * Logs：append（目标路径必须是数组或不存在）
 * ======================= */
function ensureArray(v) { return Array.isArray(v) ? v : []; }

function trimLogs(logs, maxLines) {
  const n = Math.max(1, Math.min(500, Number(maxLines || 80) || 80));
  if (logs.length <= n) return logs;
  return logs.slice(logs.length - n);
}

function appendLogAtPath(root, path, line, maxLines) {
  const s = String(line || "").trim();
  if (!s) return false;

  const iso = new Date().toISOString();
  const msg = `[${iso}] ${s}`;

  const prev = getByPath(root, path);
  const logs = ensureArray(prev);
  logs.push(msg);

  setByPath(root, path, trimLogs(logs, maxLines), true);
  return true;
}

/* =======================
 * Router：/set /appendLog /get
 * ======================= */
(function main() {
  const url = ($request && $request.url) ? $request.url : "";
  if (!url) return respond(400, { ok: false, env: ENV, error: "Missing $request.url" });

  const params = queryParams(url);
  const boxKey = (params.boxKey || "ComponentService").trim() || "ComponentService";

  const payloadRaw = (params.payload || "").trim();
  const payload = payloadRaw ? jparse(payloadRaw, null) : null;

  // action 只看 pathname（不再依赖 /boxjs/ 前缀）
  const pathOnly = url.split("?")[0] || "";
  const action =
    /\/set$/.test(pathOnly) ? "set" :
    /\/appendLog$/.test(pathOnly) ? "appendLog" :
    /\/get$/.test(pathOnly) ? "get" :
    "";

  if (!action) return respond(404, { ok: false, env: ENV, error: "Unknown action", url: pathOnly });
  if (!payload || !isObj(payload)) return respond(400, { ok: false, env: ENV, error: "Missing/invalid payload(JSON)" });

  const root = readRoot(boxKey);

  // batch（注意：batch 不靠 action，payload.ops 有就执行）
  if (Array.isArray(payload.ops)) {
    const results = [];
    for (const op of payload.ops) {
      if (!isObj(op)) continue;
      const t = String(op.op || "").trim();

      if (t === "set") {
        const ok = setByPath(root, op.path, op.value, op.create !== false);
        results.push({ op: "set", path: op.path, ok });
      } else if (t === "appendLog") {
        const ok = appendLogAtPath(root, op.path, op.line, op.maxLines);
        results.push({ op: "appendLog", path: op.path, ok });
      } else if (t === "get") {
        const val = getByPath(root, op.path);
        results.push({ op: "get", path: op.path, ok: val !== undefined, value: val });
      }
    }

    const wrote = writeRoot(boxKey, root);
    return respond(200, { ok: !!wrote, env: ENV, boxKey, action: "batch", wrote, results });
  }

  if (action === "set") {
    const ok = setByPath(root, payload.path, payload.value, payload.create !== false);
    const wrote = ok ? writeRoot(boxKey, root) : false;
    return respond(200, { ok: !!wrote, env: ENV, boxKey, action, path: payload.path, wrote });
  }

  if (action === "appendLog") {
    const ok = appendLogAtPath(root, payload.path, payload.line, payload.maxLines);
    const wrote = ok ? writeRoot(boxKey, root) : false;
    return respond(200, { ok: !!wrote, env: ENV, boxKey, action, path: payload.path, wrote });
  }

  if (action === "get") {
    const val = getByPath(root, payload.path);
    return respond(200, { ok: val !== undefined, env: ENV, boxKey, action, path: payload.path, value: val });
  }
})();
