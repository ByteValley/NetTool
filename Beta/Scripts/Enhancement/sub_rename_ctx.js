/* =========================================================
 * 模块分类 · 订阅重写 / Egern 版
 * 作者 · ByteValley
 * 版本 · 2026-03-15R1
 *
 * 模块分类 · 说明
 * · 读取参数：ctx.env
 * · 支持 PREFIX / TWFLAG
 * · 支持订阅格式：
 *   - Base64 订阅
 *   - URI 订阅（ss/ssr/vmess/vless/trojan/hysteria/hy2/tuic）
 *   - Clash YAML 中的 name:
 * · VMess 优先改 ps 字段
 * · 其他 URI 优先改 # 后锚点名称
 * ========================================================= */

function log(msg) {
  try { console.log(`[sub_rename] ${msg}`); } catch (_) {}
}

function safeDecodeURIComponent(str) {
  try { return decodeURIComponent(str); } catch (_) { return str; }
}

function safeEncodeURIComponent(str) {
  try { return encodeURIComponent(str); } catch (_) { return str; }
}

function utf8ToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      i++;
      if (i >= str.length) break;
      const low = str.charCodeAt(i);
      const cp = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      bytes.push(0xf0 | (cp >> 18));
      bytes.push(0x80 | ((cp >> 12) & 0x3f));
      bytes.push(0x80 | ((cp >> 6) & 0x3f));
      bytes.push(0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++];

    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0) {
      const b1 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | b1);
    } else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | (b1 << 6) | b2);
    } else {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      let cp = ((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3;
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10));
      out += String.fromCharCode(0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(str) {
  const bytes = utf8ToBytes(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : NaN;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : NaN;

    const n = (b0 << 16) | ((b1 || 0) << 8) | (b2 || 0);
    out += B64_CHARS[(n >> 18) & 63];
    out += B64_CHARS[(n >> 12) & 63];
    out += Number.isNaN(b1) ? "=" : B64_CHARS[(n >> 6) & 63];
    out += Number.isNaN(b2) ? "=" : B64_CHARS[n & 63];
  }
  return out;
}

function base64Decode(str) {
  const clean = String(str).replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length % 4 === 1) {
    throw new Error("invalid base64");
  }

  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean[i];
    const c1 = clean[i + 1];
    const c2 = clean[i + 2];
    const c3 = clean[i + 3];

    const n0 = B64_CHARS.indexOf(c0);
    const n1 = B64_CHARS.indexOf(c1);
    const n2 = c2 === "=" ? 0 : B64_CHARS.indexOf(c2);
    const n3 = c3 === "=" ? 0 : B64_CHARS.indexOf(c3);

    if (n0 < 0 || n1 < 0 || (c2 !== "=" && n2 < 0) || (c3 !== "=" && n3 < 0)) {
      throw new Error("invalid base64 chars");
    }

    const num = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3;
    bytes.push((num >> 16) & 0xff);
    if (c2 !== "=") bytes.push((num >> 8) & 0xff);
    if (c3 !== "=") bytes.push(num & 0xff);
  }

  return bytesToUtf8(bytes);
}

function looksLikeSubscriptionText(text) {
  if (!text) return false;
  return (
    /(?:^|\n)\s*(ss|ssr|vmess|vless|trojan|hysteria|hy2|tuic):\/\//i.test(text) ||
    /(?:^|\n)\s*proxies:\s*$/im.test(text) ||
    /(?:^|\n)\s*-\s*name\s*:/im.test(text)
  );
}

function tryDecodeSubscriptionBody(body) {
  const raw = String(body || "");
  const trimmed = raw.trim();

  if (!trimmed) {
    return { text: raw, isBase64: false };
  }

  if (looksLikeSubscriptionText(trimmed)) {
    return { text: raw, isBase64: false };
  }

  try {
    const decoded = base64Decode(trimmed);
    if (looksLikeSubscriptionText(decoded) || decoded.includes("\n")) {
      return { text: decoded, isBase64: true };
    }
  } catch (_) {}

  return { text: raw, isBase64: false };
}

function hasAnyFlagEmoji(str) {
  return /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/.test(str);
}

function normalizeTaiwanFlag(name, twFlag) {
  if (String(twFlag) !== "1") return name;
  if (!/(台灣|台湾|taiwan|\bTW\b)/i.test(name)) return name;
  if (name.includes("🇹🇼")) return name;

  if (hasAnyFlagEmoji(name)) {
    return name.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/, "🇹🇼");
  }
  return `🇹🇼 ${name}`;
}

function addPrefix(name, prefix, twFlag) {
  let out = String(name || "").trim();
  if (!out) out = "未命名节点";

  if (prefix && !out.startsWith(prefix)) {
    out = prefix + out;
  }

  out = normalizeTaiwanFlag(out, twFlag);
  return out;
}

function processVmessLine(line, prefix, twFlag) {
  const m = line.match(/^\s*(vmess:\/\/)([A-Za-z0-9+/=_-]+)\s*$/i);
  if (!m) return null;

  const head = m[1];
  const payload = m[2];

  try {
    const jsonText = base64Decode(payload);
    const obj = JSON.parse(jsonText);
    obj.ps = addPrefix(obj.ps || obj.name || "VMess", prefix, twFlag);
    return head + base64Encode(JSON.stringify(obj));
  } catch (_) {
    return null;
  }
}

function processUriLine(line, prefix, twFlag) {
  const trimmed = line.trim();
  if (!/^(ss|ssr|vless|trojan|hysteria|hy2|tuic):\/\//i.test(trimmed)) return null;

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    const before = trimmed.slice(0, hashIndex);
    const oldName = safeDecodeURIComponent(trimmed.slice(hashIndex + 1));
    const newName = addPrefix(oldName || "节点", prefix, twFlag);
    return before + "#" + safeEncodeURIComponent(newName);
  }

  const fallbackName = addPrefix("节点", prefix, twFlag);
  return trimmed + "#" + safeEncodeURIComponent(fallbackName);
}

function processYamlNameLine(line, prefix, twFlag) {
  const m = line.match(/^(\s*-\s*name\s*:\s*)(.*?)(\s*)$/);
  if (!m) return null;

  const head = m[1];
  let name = m[2];
  const tail = m[3] || "";

  if (
    (name.startsWith('"') && name.endsWith('"')) ||
    (name.startsWith("'") && name.endsWith("'"))
  ) {
    const q = name[0];
    const inner = name.slice(1, -1);
    return `${head}${q}${addPrefix(inner, prefix, twFlag)}${q}${tail}`;
  }

  return `${head}${addPrefix(name, prefix, twFlag)}${tail}`;
}

function processLine(line, prefix, twFlag) {
  if (!line || !line.trim()) return line;
  if (/^\s*[#;]/.test(line)) return line;

  const vmess = processVmessLine(line, prefix, twFlag);
  if (vmess) return vmess;

  const uri = processUriLine(line, prefix, twFlag);
  if (uri) return uri;

  const yaml = processYamlNameLine(line, prefix, twFlag);
  if (yaml) return yaml;

  return line;
}

function rewriteText(text, prefix, twFlag) {
  const lines = String(text).split(/\r?\n/);
  return lines.map((line) => processLine(line, prefix, twFlag)).join("\n");
}

export default async function (ctx) {
  try {
    const env = (ctx && ctx.env) || {};
    const req = (ctx && ctx.request) || {};
    const res = (ctx && ctx.response) || {};

    const prefix = env.PREFIX || "";
    const twFlag = env.TWFLAG || "0";
    const body = typeof res.body === "string" ? res.body : "";

    if (!body) {
      log("empty body, passthrough");
      return res;
    }

    const parsed = tryDecodeSubscriptionBody(body);
    const rewritten = rewriteText(parsed.text, prefix, twFlag);
    const output = parsed.isBase64 ? base64Encode(rewritten) : rewritten;

    log(`done, base64=${parsed.isBase64}, prefix=${prefix}, twflag=${twFlag}`);

    return {
      ...res,
      body: output
    };
  } catch (e) {
    log(`error: ${e && e.message ? e.message : e}`);
    return (ctx && ctx.response) || {};
  }
}
