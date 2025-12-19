// boxjs_writer.js
// 写入 Surge $persistentStore 的 ComponentService.Root（BoxJS 展示用）
// 调用：https://boxjs.write/probe?tag=12123&line=hello&data={"a":1}

function q(url) {
  const out = {};
  const i = url.indexOf("?");
  if (i < 0) return out;
  const s = url.slice(i + 1).split("&");
  for (const kv of s) {
    if (!kv) continue;
    const [k, v = ""] = kv.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

function jparse(s, def) {
  try { return JSON.parse(s); } catch { return def; }
}
function jstr(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

function ensure(root) {
  if (!isObj(root)) root = {};
  if (!isObj(root.Probe)) root.Probe = {};
  return root;
}

function trimLogs(logs, maxLines) {
  if (!Array.isArray(logs)) logs = [];
  if (logs.length <= maxLines) return logs;
  return logs.slice(logs.length - maxLines);
}

(function main() {
  const ROOT_KEY = "ComponentService";
  const params = q($request.url);

  const tag = (params.tag || "default").trim();
  const line = (params.line || "").trim();
  const dataRaw = (params.data || "").trim(); // 可选：JSON string

  const maxLines = Math.max(20, Math.min(200, Number(params.maxLines || 80) || 80));

  // 读根
  const raw = $persistentStore.read(ROOT_KEY) || "{}";
  const root = ensure(jparse(raw, {}));

  // 写入 Probe 节点
  if (!isObj(root.Probe[tag])) root.Probe[tag] = {};
  const node = root.Probe[tag];

  const stamp = `${Date.now()}|tag=${tag}|family=${String((globalThis.Widget && Widget.family) || "")}`;
  node.stamp = stamp;
  node.updatedAt = Date.now();

  if (line) {
    const logs = Array.isArray(node.logs) ? node.logs : [];
    logs.push(`[${new Date().toISOString()}] ${line}`);
    node.logs = trimLogs(logs, maxLines);
  }

  if (dataRaw) {
    // 你想看“缓存清理日志 + 当前缓存数据”，就把数据也塞这里
    node.data = jparse(dataRaw, dataRaw);
  }

  // 写回根
  $persistentStore.write(jstr(root), ROOT_KEY);

  const body = jstr({ ok: true, tag, stamp, maxLines, hasLine: !!line, hasData: !!dataRaw });
  $done({ status: 200, headers: { "Content-Type": "application/json;charset=utf-8" }, body });
})();