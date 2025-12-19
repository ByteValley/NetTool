// boxjs_bridge.js
// 通用写入 BoxJS 根 JSON（Surge $persistentStore）
// - 默认 rootKey=ComponentService，可通过 boxKey 指定
// - set：写 value 到 path（如 12123.Caches.cacheMeta）
// - appendLog：追加 line 到 logPath（如 12123.Logs.log），自动裁剪
// - get：读取 paths（可选）

function qs(url) {
  const out = {};
  const i = url.indexOf("?");
  if (i < 0) return out;
  const s = url.slice(i + 1).split("&");
  for (const kv of s) {
    if (!kv) continue;
    const p = kv.split("=");
    const k = decodeURIComponent(p[0] || "");
    const v = decodeURIComponent(p.slice(1).join("=") || "");
    if (k) out[k] = v;
  }
  return out;
}
function jparse(s, def) { try { return JSON.parse(s); } catch { return def; } }
function jstr(v) { try { return JSON.stringify(v); } catch { return String(v); } }
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

function ensureRoot(root) {
  if (!isObj(root)) root = {};
  return root;
}
function splitPath(path) {
  return String(path || "").split(".").map(s => s.trim()).filter(Boolean);
}
function setByPath(root, path, value) {
  const seg = splitPath(path);
  if (!seg.length) return;
  let cur = root;
  for (let i = 0; i < seg.length - 1; i++) {
    const k = seg[i];
    if (!isObj(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[seg[seg.length - 1]] = value;
}
function getByPath(root, path) {
  const seg = splitPath(path);
  if (!seg.length) return undefined;
  let cur = root;
  for (const k of seg) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = cur[k];
    if (cur === undefined) return undefined;
  }
  return cur;
}
function ensureArrAtPath(root, path) {
  const seg = splitPath(path);
  if (!seg.length) return [];
  let cur = root;
  for (let i = 0; i < seg.length - 1; i++) {
    const k = seg[i];
    if (!isObj(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  const last = seg[seg.length - 1];
  if (!Array.isArray(cur[last])) cur[last] = [];
  return cur[last];
}
function trimLogs(logs, maxLines, maxBytes) {
  if (!Array.isArray(logs)) logs = [];
  let out = logs.length > maxLines ? logs.slice(logs.length - maxLines) : logs.slice();
  const bytesApprox = (s) => String(s || "").length * 2; // 粗略估算
  let total = out.reduce((a, s) => a + bytesApprox(s), 0);
  while (out.length > 1 && total > maxBytes) {
    const shifted = out.shift();
    total -= bytesApprox(shifted);
  }
  return out;
}
function ok(body) {
  $done({ status: 200, headers: { "Content-Type": "application/json;charset=utf-8" }, body: jstr(body) });
}
function bad(status, body) {
  $done({ status: status || 500, headers: { "Content-Type": "application/json;charset=utf-8" }, body: jstr(body) });
}

(function main() {
  const url = $request.url || "";
  const p = qs(url);

  const boxKey = (p.boxKey || "ComponentService").trim();
  const payload = jparse(p.payload || "", null);

  if (!payload || !isObj(payload)) return bad(400, { ok: false, error: "bad payload" });

  const action =
    /\/boxjs\/set\b/.test(url) ? "set" :
    /\/boxjs\/appendLog\b/.test(url) ? "appendLog" :
    /\/boxjs\/get\b/.test(url) ? "get" :
    "";

  if (!action) return bad(404, { ok: false, error: "unknown action" });

  const raw = $persistentStore.read(boxKey) || "{}";
  const root = ensureRoot(jparse(raw, {}));

  const now = Date.now();
  const stamp = `${now}|family=${String((globalThis.Widget && Widget.family) || "")}`;

  if (action === "set") {
    const path = String(payload.path || "").trim();
    if (!path) return bad(400, { ok: false, error: "missing path" });

    setByPath(root, path, payload.value);

    // 可选：顺手写 updatedAt/stamp 到 service 节点（例如 servicePath="12123"）
    if (payload.servicePath) {
      const sp = String(payload.servicePath).trim();
      if (sp) {
        setByPath(root, `${sp}.updatedAt`, now);
        setByPath(root, `${sp}.stamp`, stamp);
      }
    }

    $persistentStore.write(jstr(root), boxKey);
    return ok({ ok: true, action, boxKey, path, stamp });
  }

  if (action === "appendLog") {
    const logPath = String(payload.logPath || "").trim();
    const line = String(payload.line || "").trim();
    if (!logPath || !line) return bad(400, { ok: false, error: "missing logPath/line" });

    const maxLines = Math.max(20, Math.min(500, Number(payload.maxLines || 120) || 120));
    const maxBytes = Math.max(2048, Math.min(128 * 1024, Number(payload.maxBytes || 12 * 1024) || 12 * 1024));

    const arr = ensureArrAtPath(root, logPath);
    arr.push(`[${new Date().toISOString()}] ${line}`);

    const trimmed = trimLogs(arr, maxLines, maxBytes);
    setByPath(root, logPath, trimmed);

    if (payload.servicePath) {
      const sp = String(payload.servicePath).trim();
      if (sp) {
        setByPath(root, `${sp}.updatedAt`, now);
        setByPath(root, `${sp}.stamp`, stamp);
      }
    }

    $persistentStore.write(jstr(root), boxKey);
    return ok({ ok: true, action, boxKey, logPath, stamp, maxLines });
  }

  if (action === "get") {
    const paths = Array.isArray(payload.paths) ? payload.paths : [];
    const out = {};
    for (const path of paths) {
      const k = String(path || "").trim();
      if (!k) continue;
      out[k] = getByPath(root, k);
    }
    return ok({ ok: true, action, boxKey, data: out });
  }
})();
