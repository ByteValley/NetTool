/******************************************
 * @name 网上国网小组件数据更新接口
 * @description 网上国网电费查询（组件服务桥接版）
 * @channel https://t.me/yqc_123/
 * @feedback https://t.me/NobyDa_Chat
 * @author 小白脸｜𝐎𝐍𝐙𝟑𝐕｜ByteValley
 *
 * 修复说明：
 * - 参考 dompling/Script/wsgw 数据接口脚本
 * - 组件入口仍保持 api.wsgw-rewrite.com/electricity/bill/all
 * - 返回结构继续兼容 dompling/Scriptable 小组件
 * - 自动兼容 ByteValley ComponentService 配置与旧版 95598_* BoxJs Key
 ******************************************/

const SCRIPT_NAME = "网上国网";
const NAMESPACE = "ONZ3V";
const ROOT_KEY = "ComponentService";
const UPSTREAM_SCRIPT = "https://raw.githubusercontent.com/dompling/Script/master/wsgw/index.js";
const BOXJS_SUB_URL = "http://boxjs.com/#/sub/add/https%3A%2F%2Fraw.githubusercontent.com%2FByteValley%2FNetTool%2Fmain%2FBoxJs%2FComponentService.boxjs.json";

const getEnv = () =>
  typeof $environment !== "undefined" && $environment["surge-version"]
    ? "Surge"
    : typeof $environment !== "undefined" && $environment["egern-version"]
    ? "Egern"
    : typeof $environment !== "undefined" && $environment["stash-version"]
    ? "Stash"
    : typeof $task !== "undefined"
    ? "Quantumult X"
    : typeof $loon !== "undefined"
    ? "Loon"
    : typeof $rocket !== "undefined"
    ? "Shadowrocket"
    : typeof process !== "undefined"
    ? "Node.js"
    : "Unknown";

const ENV = getEnv();
const isQuanX = () => ENV === "Quantumult X";
const isNode = () => ENV === "Node.js";

class Store {
  constructor(namespace = "") {
    this.namespace = namespace;
    if (isNode()) {
      const { LocalStorage } = require("node-localstorage");
      this.localStorage = new LocalStorage(namespace ? `./store/${namespace}` : "./store");
    }
  }

  get(key) {
    switch (ENV) {
      case "Surge":
      case "Egern":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.read(key);
      case "Quantumult X":
        return $prefs.valueForKey(key);
      case "Node.js":
        return this.localStorage.getItem(key);
      default:
        return null;
    }
  }

  set(key, value) {
    const val = value === undefined || value === null ? "" : String(value);
    switch (ENV) {
      case "Surge":
      case "Egern":
      case "Loon":
      case "Stash":
      case "Shadowrocket":
        return $persistentStore.write(val, key);
      case "Quantumult X":
        return $prefs.setValueForKey(val, key);
      case "Node.js":
        this.localStorage.setItem(key, val);
        return true;
      default:
        return false;
    }
  }
}

const store = new Store(NAMESPACE);

const safeJsonParse = (value, fallback = {}) => {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
};

const done = (payload = {}) => {
  if (isNode()) process.exit(0);
  $done(payload);
};

const notify = (title, subtitle, body, openUrl) => {
  if (isNode()) {
    console.log(`${title}\n${subtitle}\n${body}`);
    return;
  }

  switch (ENV) {
    case "Quantumult X":
      $notify(title, subtitle, body, openUrl ? { "open-url": openUrl } : undefined);
      break;
    case "Loon":
    case "Shadowrocket":
      $notification.post(title, subtitle, body, openUrl || undefined);
      break;
    default:
      $notification.post(title, subtitle, body, openUrl ? { url: openUrl } : undefined);
      break;
  }
};

function truncateForLog(text, max = 1200) {
  text = String(text || "");
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

const httpGet = async (url) => {
  if (isQuanX()) {
    const resp = await $task.fetch({ url, method: "GET" });
    if (!/^2\d\d$/.test(String(resp.statusCode || resp.status || ""))) {
      throw new Error(`GET ${url} failed: status=${resp.statusCode || resp.status || "unknown"} body=${truncateForLog(resp.body)}`);
    }
    return resp.body;
  }

  if (isNode()) {
    const got = require("got");
    return await got(url).text();
  }

  return await new Promise((resolve, reject) => {
    $httpClient.get({ url }, (err, resp, body) => {
      if (err) reject(err);
      else if (!/^2\d\d$/.test(String(resp?.status || resp?.statusCode || ""))) {
        reject(new Error(`GET ${url} failed: status=${resp?.status || resp?.statusCode || "unknown"} body=${truncateForLog(body)}`));
      } else resolve(body);
    });
  });
};

function requestHeader(name) {
  const headers = typeof $request !== "undefined" && $request.headers ? $request.headers : {};
  const lower = name.toLowerCase();
  const raw = headers[name] ?? headers[lower] ?? headers[name.toUpperCase()];
  if (raw === undefined || raw === null) return "";
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

function migrateComponentServiceToLegacyBoxJs() {
  const root = safeJsonParse(store.get(ROOT_KEY), {});
  const sgcc = root && root.SGCC ? root.SGCC : {};
  const settings = sgcc.Settings || {};
  const caches = sgcc.Caches || {};

  const headerPhoneNum = requestHeader("X-WSGW-Username");
  const headerPassword = requestHeader("X-WSGW-Password");
  const phoneNum = headerPhoneNum || settings.phoneNum || settings.username || settings.account || "";
  const password = headerPassword || settings.password || "";
  const logDebug = settings.logDebug ?? settings.debug ?? "false";
  const notifyType = settings.notifyType || "all";
  const recentElcFee = settings.recentElcFee ?? settings.showRecentUsage ?? "0";

  console.log(`🔐 ${SCRIPT_NAME} 凭据来源: ${headerPhoneNum && headerPassword ? "组件设置页请求头" : "BoxJs/旧 Key"}`);

  // 上游脚本沿用旧版 BoxJs Key，这里把组件配置同步过去。
  const mappings = {
    "95598_username": phoneNum,
    "95598_password": password,
    "95598_log_debug": logDebug,
    "95598_notify_type": notifyType,
    "95598_recent_elc_fee": recentElcFee,
    "SGCC_USERNAME": phoneNum,
    "SGCC_PASSWORD": password,
    "SGCC_DEBUG": logDebug,
    "SGCC_NOTIFY_ALL_ACCOUNTS": notifyType === "all" ? "true" : "false",
    "SGCC_SHOW_RECENT_USAGE": Number(recentElcFee) > 0 ? "true" : "false",
    "SGCC_SERVICE": "true",
  };

  Object.entries(mappings).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") store.set(key, value);
  });

  if (caches.bizrt) store.set("95598_bizrt", typeof caches.bizrt === "string" ? caches.bizrt : JSON.stringify(caches.bizrt));
  if (caches.bindInfo) store.set("95598_bindInfo", typeof caches.bindInfo === "string" ? caches.bindInfo : JSON.stringify(caches.bindInfo));

  return { phoneNum, password };
}

(async () => {
  console.log(`✅ ${SCRIPT_NAME} 组件服务桥接已触发 | ENV=${ENV}`);

  const { phoneNum, password } = migrateComponentServiceToLegacyBoxJs();

  if (!phoneNum || !password) {
    notify(SCRIPT_NAME, "请先配置账号密码", "请在组件设置页填写账号密码；或在 BoxJs 的 ComponentService / SGCC 中填写 phoneNum/password。", BOXJS_SUB_URL);
    const resp = {
      status: isQuanX() ? "HTTP/1.1 200" : 200,
      headers: { "content-type": "application/json;charset=utf8" },
      body: JSON.stringify({ ok: false, error: "Missing phoneNum/password" }),
    };
    return done(isQuanX() ? resp : { response: resp });
  }

  console.log(`🌐 ${SCRIPT_NAME} 正在加载上游脚本: ${UPSTREAM_SCRIPT}`);
  const code = await httpGet(UPSTREAM_SCRIPT);
  console.log(`✅ ${SCRIPT_NAME} 上游脚本加载完成: ${String(code || "").length} bytes`);
  if (!code || code.length < 1024) throw new Error("上游脚本加载失败");

  // 直接执行上游服务模式脚本，由其接管登录校验、验证码、数据查询与 $done 返回。
  (0, eval)(code);
})().catch((error) => {
  const err = String(error && (error.message || error));
  console.log(`❌ ${SCRIPT_NAME} 组件服务桥接失败: ${err}`);
  const resp = {
    status: isQuanX() ? "HTTP/1.1 500" : 500,
    headers: { "content-type": "application/json;charset=utf8" },
    body: JSON.stringify({ ok: false, error: err }),
  };
  done(isQuanX() ? resp : { response: resp });
});
