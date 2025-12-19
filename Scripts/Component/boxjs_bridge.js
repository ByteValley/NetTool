/******************************************
 * @name BoxJS Bridge
 * @description 通用：跨 Surge/Egern/Loon/Stash/Shadowrocket/QX 写入持久化 JSON（默认 ComponentService）
 * @author ByteValley
 * @version 2025-12-19R1
 *
 * Endpoint:
 * - https://api.boxjs-bridge.com/set
 * - https://api.boxjs-bridge.com/get
 * - https://api.boxjs-bridge.com/appendLog
 *
 * Query（GET）:
 * - ?boxKey=ComponentService&payload=<urlencoded json>
 *
 * Body（POST JSON）:
 * - {"boxKey":"ComponentService","payload":{...}}
 *
 * payload:
 * - set:       { "path":"12123.Caches.cacheMeta", "value": {...}, "create": true }
 * - appendLog: { "path":"12123.Logs.log", "line":"hello", "maxLines":80 }
 * - get:       { "path":"12123.Caches.cacheMeta" }
 * - batch:     { "ops":[ {op:"set", ...}, {op:"appendLog", ...}, {op:"get", ...} ] }
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
function jparse(s, defVal) { try { return JSON.parse(s); } catch { return defVal; } }
function jstr(v) { try { return JSON.stringify(v); } catch { return String(v); } }

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
  try {
    $done({ response: { status: statusCode, headers, body } });
  } catch {
    $done({ status: statusCode, headers, body });
  }
}

function readRoot(boxKey) {
  const raw = Storage.read(boxKey) || "{}";
  const root = jparse(raw, {});
  return isObj(root) ? root : {};
}
function writeRoot(boxKey, root) {
  return Storage.write(boxKey, jstr(root));
}

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

function parseInput() {
  const url = ($request && $request.url) ? $request.url : "";
  if (!url) return { ok: false, code: 400, err: "Missing $request.url" };

  const method = String(($request && $request.method) || "GET").toUpperCase();
  const params = queryParams(url);

  // 支持 POST JSON：{"boxKey":"...","payload":{...}}
  let bodyJson = null;
  if (method === "POST" && $request && typeof $request.body === "string" && $request.body.trim()) {
    bodyJson = jparse($request.body.trim(), null);
  }

  const boxKey =
    (isObj(bodyJson) && typeof bodyJson.boxKey === "string" && bodyJson.boxKey.trim())
      ? bodyJson.boxKey.trim()
      : ((params.boxKey || "ComponentService").trim() || "ComponentService");

  let payload = null;
  if (isObj(bodyJson) && bodyJson.payload) {
    payload = bodyJson.payload;
  } else {
    const payloadRaw = (params.payload || "").trim();
    payload = payloadRaw ? jparse(payloadRaw, null) : null;
  }

  const pathOnly = url.split("?")[0] || "";
  const action =
    /\/set$/.test(pathOnly) ? "set" :
    /\/appendLog$/.test(pathOnly) ? "appendLog" :
    /\/get$/.test(pathOnly) ? "get" :
    "";

  return { ok: true, method, url, pathOnly, action, boxKey, payload };
}

(function main() {
  const inp = parseInput();
  if (!inp.ok) return respond(inp.code, { ok: false, env: ENV, error: inp.err });

  const { action, boxKey, payload, pathOnly } = inp;

  if (!action) return respond(404, { ok: false, env: ENV, error: "Unknown action", url: pathOnly });
  if (!payload || !isObj(payload)) return respond(400, { ok: false, env: ENV, error: "Missing/invalid payload(JSON)" });

  const root = readRoot(boxKey);

  // batch：payload.ops 存在就执行（不依赖 action）
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
