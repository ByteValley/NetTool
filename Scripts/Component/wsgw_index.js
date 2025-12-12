/******************************************
 * @name        网上国网 bill/all（稳定版）
 * @author      ByteEden（基于社区脚本思路重写增强）
 * @desc        重写 api.wsgw-rewrite.com/electricity/bill/all，返回聚合电费/电量/阶梯数据
 *
 * BoxJs 订阅地址：
 * https://raw.githubusercontent.com/Yuheng0101/X/main/Tasks/boxjs.json
 *
 * BoxJs 参数：
 *  - 95598_username   网上国网账号
 *  - 95598_password   网上国网密码
 *  - 95598_log_debug  true/false（可选）
 *
 * Surge 示例：
 * [Script]
 * wsgw = type=http-request,pattern=^https?:\/\/api\.wsgw-rewrite\.com\/electricity\/bill\/all,requires-body=0,max-size=-1,timeout=60,script-path=你的脚本地址
 *
 * [MITM]
 * hostname = %APPEND% api.wsgw-rewrite.com
 ******************************************/

/** ============ 工具：URL 参数解析 ============ */
function getUrlParams(url) {
  const qs = (url.split("?")[1] || "").trim();
  if (!qs) return {};
  return qs.split("&").reduce((acc, pair) => {
    const [k, v = ""] = pair.split("=");
    if (!k) return acc;
    acc[decodeURIComponent(k)] = decodeURIComponent(v);
    return acc;
  }, {});
}

/** ============ 环境识别 & 适配 ============ */
const getEnv = () =>
  typeof $environment !== "undefined" && $environment["surge-version"]
    ? "Surge"
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

const isQuanX = () => getEnv() === "Quantumult X";
const isNode = () => getEnv() === "Node.js";

/** ============ Logger ============ */
class Logger {
  constructor(prefix = "WSGW", level = "info") {
    this.prefix = prefix;
    this.levels = ["trace", "debug", "info", "warn", "error"];
    this.setLevel(level);
  }
  setLevel(level) {
    this.currentLevelIndex = this.levels.indexOf(level);
    if (this.currentLevelIndex < 0) this.currentLevelIndex = 2;
  }
  log(level, ...args) {
    if (this.levels.indexOf(level) < this.currentLevelIndex) return;
    console.log(`${this.prefix ? `[${this.prefix}] ` : ""}[${level.toUpperCase()}]\n${args.join("\n")}`);
  }
  trace(...a) { this.log("trace", ...a); }
  debug(...a) { this.log("debug", ...a); }
  info(...a)  { this.log("info", ...a); }
  warn(...a)  { this.log("warn", ...a); }
  error(...a) { this.log("error", ...a); }
}

/** ============ HTTP 请求封装（多端兼容） ============ */
const requestRaw = async (req = {} || "", opt = {}) => {
  if (typeof req === "string") req = { url: req, ...opt };
  else req = { ...req, ...opt };

  req.method || ((req.method = "GET"), (req.body ?? req.bodyBytes) && (req.method = "POST"));
  delete req.headers?.["Content-Length"];
  delete req.headers?.["content-length"];

  const method = req.method.toLowerCase();

  if (getEnv() === "Quantumult X") {
    // QuanX
    delete req.bodyBytes; // 本脚本不走 protobuf
    return $task.fetch(req).then(
      (r) => ((r.ok = /^2\d\d$/.test(r.statusCode)), (r.status = r.statusCode), r),
      (e) => Promise.reject(e.error || e)
    );
  }

  // Surge/Loon/Stash/Shadowrocket
  return new Promise((resolve, reject) => {
    // binary-mode: 本脚本不需要
    $httpClient[method](req, (err, resp, body) => {
      if (err) return reject(err);
      resp.ok = /^2\d\d$/.test(resp.status);
      resp.statusCode = resp.status;
      resp.body = body;
      resolve(resp);
    });
  });
};

/** ============ Store（跨端持久化） ============ */
class Store {
  constructor(namespace = "WSGW") {
    this.ns = namespace;
  }
  k(key) { return `${this.ns}_${key}`; }
  get(key) {
    const kk = this.k(key);
    if (getEnv() === "Quantumult X") return $prefs.valueForKey(kk);
    return $persistentStore.read(kk);
  }
  set(key, val) {
    const kk = this.k(key);
    const s = typeof val === "string" ? val : JSON.stringify(val);
    if (getEnv() === "Quantumult X") return $prefs.setValueForKey(s, kk);
    return $persistentStore.write(s, kk);
  }
  del(key) {
    const kk = this.k(key);
    if (getEnv() === "Quantumult X") return $prefs.removeValueForKey(kk);
    return $persistentStore.write(null, kk);
  }
}

/** ============ 通知 & done ============ */
const notify = (title = "", sub = "", body = "", opts = {}) => {
  try {
    if (getEnv() === "Quantumult X") $notify(title, sub, body, opts);
    else $notification.post(title, sub, body, opts);
  } catch {}
  console.log([title, sub, body].filter(Boolean).join("\n"));
};

const done = (resp = {}) => {
  if (isQuanX()) return $done(resp);
  return $done(resp);
};

/** ============ 核心配置 ============ */
const SCRIPTNAME = "网上国网";
const store = new Store("ONZ3V");

// 中转站（你原脚本依赖的）
const SERVER_HOST = "https://api.120399.xyz";
// 95598 主站（中转返回的 url 会拼这个）
const BASE_URL = "https://www.95598.cn";

// TTL（可按需调整）
const TTL_KEYCODE_MS = 12 * 60 * 60 * 1000;   // keyCode/publicKey：12小时
const TTL_BIZRT_MS   = 12 * 60 * 60 * 1000;   // bizrt：12小时
const TTL_ACCT_MS    = 12 * 60 * 60 * 1000;   // accessToken：12小时
const TTL_DATA_MS    = 4  * 60 * 60 * 1000;   // 数据缓存：4小时

const USERNAME = store.get("95598_username") || "";
const PASSWORD = store.get("95598_password") || "";
const DEBUG = (store.get("95598_log_debug") || "false") === "true";
const log = new Logger(SCRIPTNAME, DEBUG ? "debug" : "info");

/** ============ 显式全局状态（别靠飘全局） ============ */
const Global =
  typeof globalThis !== "undefined" ? globalThis :
  typeof window !== "undefined" ? window :
  typeof global !== "undefined" ? global :
  typeof self !== "undefined" ? self : {};

let requestKey = {};
let bizrt = {};
let authorizecode = "";
let accessToken = "";
let bindInfo = null;

function jsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
function jsonStr(o) {
  try { return JSON.stringify(o); } catch { return String(o); }
}
function now() { return Date.now(); }

function syncGlobal() {
  requestKey = Global.requestKey || requestKey || {};
  bizrt = Global.bizrt || bizrt || {};
  authorizecode = Global.authorizecode || authorizecode || "";
  accessToken = Global.accessToken || accessToken || "";
  bindInfo = Global.bindInfo || bindInfo || null;
}

/** ============ 中转加解密封装 ============ */
async function Encrypt(cfg) {
  const r = await requestRaw({
    url: `${SERVER_HOST}/wsgw/encrypt`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yuheng: cfg }),
  });
  let body = r.body;
  let obj = jsonParse(body, null);
  if (!obj?.data) throw new Error("encrypt 返回异常");
  // 拼 95598 域名 + body 格式
  obj.data.url = BASE_URL + obj.data.url;
  obj.data.body = JSON.stringify(obj.data.data || {});
  delete obj.data.data;
  return obj.data;
}

async function Decrypt(payload) {
  const r = await requestRaw({
    url: `${SERVER_HOST}/wsgw/decrypt`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yuheng: payload }),
  });
  let obj = jsonParse(r.body, null);
  if (!obj?.data) throw new Error("decrypt 返回异常");

  const { code, message, data } = obj.data;
  // code === "1" 表示成功（沿用你原脚本逻辑）
  if (String(code) === "1") return data;

  // 常见需要自愈的错误
  if (/无效|失效|过期|重新获取|Token|请求异常|010011/.test(String(message || ""))) {
    throw new Error(`NEED_RELOGIN:${message}`);
  }
  throw new Error(message || "请求失败");
}

async function request(cfg) {
  const enc = await Encrypt(cfg);
  // authorize 接口在中转侧可能返回带引号字符串，这里兼容一下
  if (cfg.url === "/api/oauth2/oauth/authorize" && typeof enc.body === "string") {
    enc.body = enc.body.replace(/^\"|\"$/g, "");
  }

  const resp = await requestRaw(enc);
  let raw = resp.body;
  let data = jsonParse(raw, raw);

  // 组装 decrypt payload
  const payload = { config: { ...cfg }, data };

  // 有些接口需要回传 encryptKey
  if (cfg.url === "/api/oauth2/outer/c02/f02") {
    payload.config.headers = { encryptKey: enc.encryptKey };
  }

  return await Decrypt(payload);
}

/** ============ 验证码识别（中转） ============ */
async function recognize(canvasSrc) {
  const r = await requestRaw({
    url: `${SERVER_HOST}/wsgw/get_x`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yuheng: canvasSrc }),
  });
  return jsonParse(r.body, {});
}

/** ============ 缓存读取/写入 ============ */
function getCached(key) {
  const s = store.get(key);
  if (!s) return null;
  const obj = jsonParse(s, null);
  if (!obj || typeof obj !== "object") return null;
  return obj;
}
function setCached(key, value) {
  store.set(key, value);
}

/** ============ API 路径（只保留本脚本实际用到的） ============ */
const API = {
  getKeyCode: "/oauth2/outer/c02/f02",
  loginVerifyCodeNew: "/osg-web0004/open/c44/f05",
  loginTestCodeNew:   "/osg-web0004/open/c44/f06",
  getAuth:     "/oauth2/oauth/authorize",
  getWebToken: "/oauth2/outer/getWebToken",
  searchUser:  "/osg-open-uc0001/member/c9/f02",
  accapi:      "/osg-open-bc0001/member/c05/f01",
  busInfoApi:  "/osg-web0004/member/c24/f01",
  electBill:   "/osg-open-bc0001/member/c04/f03",
  segmentDate: "/osg-open-bc0001/member/arg/020070013",
};

/** ============ 固定业务配置（沿用关键字段） ============ */
const CFG = {
  source: "SGAPP",
  target: "32101",
  uscInfo: { member: "0902", devciceIp: "", devciceId: "", tenant: "state_grid" },
  userInformServiceCode: "0101183",
  account: { channelCode: "0902", funcCode: "WEBA1007200" },
  getday:  { channelCode: "0902", funcCode: "WEBALIPAY_01", clearCache: "11", promotCode: "1", promotType: "1", serviceCode: "BCP_000026", source: "app" },
  mouthOut:{ channelCode: "0902", funcCode: "WEBALIPAY_01", clearCache: "11", promotCode: "1", promotType: "1", serviceCode: "BCP_000026", source: "app" },
  stepelect:{ channelCode: "0902", funcCode: "WEBALIPAY_01", promotType: "1", clearCache: "09", serviceCode: "BCP_000026", source: "app" },
};

/** ============ 登录链路（带自愈） ============ */
async function getKeyCode(force = false) {
  const cache = getCached("requestKey");
  if (!force && cache?.ts && cache?.data && now() - cache.ts < TTL_KEYCODE_MS) {
    Global.requestKey = cache.data;
    syncGlobal();
    log.debug("🔁 使用缓存 requestKey");
    return;
  }

  log.info("⏳ 获取 keyCode/publicKey ...");
  const cfg = { url: `/api${API.getKeyCode}`, method: "POST", headers: {} };
  const data = await request(cfg);
  Global.requestKey = data;
  syncGlobal();
  setCached("requestKey", { ts: now(), data });
  log.info("✅ keyCode/publicKey OK");
}

async function getVerifyCode() {
  log.info("⏳ 获取验证码凭证 ...");
  const cfg = {
    url: `/api${API.loginVerifyCodeNew}`,
    method: "POST",
    headers: { ...requestKey },
    data: { password: PASSWORD, account: USERNAME, canvasHeight: 200, canvasWidth: 310 },
  };
  const r = await request(cfg);
  if (!r?.ticket || !r?.canvasSrc) throw new Error("验证码凭证为空");
  const recog = await recognize(r.canvasSrc);
  const code = recog?.data;
  if (!code) throw new Error("验证码识别失败");
  return { ticket: r.ticket, code };
}

async function login(force = false) {
  const cache = getCached("bizrt");
  if (!force && cache?.ts && cache?.data && now() - cache.ts < TTL_BIZRT_MS) {
    Global.bizrt = cache.data;
    syncGlobal();
    if (bizrt?.token && bizrt?.userInfo?.length) {
      log.debug("🔁 使用缓存 bizrt");
      return;
    }
  }

  log.info("⏳ 登录中 ...");
  const { ticket, code } = await getVerifyCode();

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
          account: USERNAME,
          password: PASSWORD,
        },
      },
      Channels: "web",
    },
  };

  const r = await request(cfg);
  const s = r?.bizrt;
  if (!s?.token || !s?.userInfo?.length) throw new Error("登录失败：账号/密码/验证码可能不正确");
  Global.bizrt = s;
  syncGlobal();
  setCached("bizrt", { ts: now(), data: s });
  log.info("✅ 登录成功");
}

async function getAuthcode(retry = 0) {
  log.info("⏳ 获取授权码 ...");
  try {
    const cfg = {
      url: `/api${API.getAuth}`,
      method: "POST",
      headers: { ...requestKey, token: bizrt.token },
    };
    const r = await request(cfg);
    const ru = r?.redirect_url || r?.redirectUrl || "";
    const code = ru.includes("code=") ? ru.split("code=")[1].split("&")[0] : "";
    if (!code) throw new Error("授权码为空：redirect_url 无 code 字段");

    Global.authorizecode = code;
    syncGlobal();
    setCached("authorizecode", { ts: now(), data: code });
    log.info("✅ 授权码 OK");
  } catch (e) {
    const msg = String(e?.message || e || "");
    // 自愈：授权码失败通常就是 token/key 失效
    if (retry < 1 && /NEED_RELOGIN|010011|Token|无效|失效|过期|重新获取|请求异常/.test(msg)) {
      log.warn(`⚠️ 授权码失败，触发自愈重登：${msg}`);
      store.del("bizrt");
      store.del("authorizecode");
      store.del("accessToken");
      Global.bizrt = {};
      Global.authorizecode = "";
      Global.accessToken = "";
      syncGlobal();

      await getKeyCode(true);
      await login(true);
      return await getAuthcode(retry + 1);
    }
    throw new Error(`获取授权码失败: ${msg}`);
  }
}

async function getAccessToken(force = false) {
  const cache = getCached("accessToken");
  if (!force && cache?.ts && cache?.data && now() - cache.ts < TTL_ACCT_MS) {
    Global.accessToken = cache.data;
    syncGlobal();
    if (accessToken) {
      log.debug("🔁 使用缓存 accessToken");
      return;
    }
  }

  log.info("⏳ 获取 accessToken ...");
  const cfg = {
    url: `/api${API.getWebToken}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, authorizecode },
  };
  const token = await request(cfg).then((x) => x?.access_token);
  if (!token) throw new Error("accessToken 为空");
  Global.accessToken = token;
  syncGlobal();
  setCached("accessToken", { ts: now(), data: token });
  log.info("✅ accessToken OK");
}

async function getBindInfo() {
  log.info("⏳ 查询绑定户号 ...");
  const cfg = {
    url: `/api${API.searchUser}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      serviceCode: CFG.userInformServiceCode,
      source: CFG.source,
      target: CFG.target,
      uscInfo: { ...CFG.uscInfo },
      quInfo: { userId: bizrt.userInfo[0].userId },
      token: bizrt.token,
      Channels: "web",
    },
  };
  const r = await request(cfg);
  const bi = r?.bizrt;
  if (!bi?.powerUserList?.length) throw new Error("绑定信息为空：未找到户号/未绑定");
  Global.bindInfo = bi;
  syncGlobal();
  setCached("bindInfo", { ts: now(), data: bi });
  log.info("✅ 绑定户号 OK");
}

/** ============ 业务数据获取（与组件字段对齐） ============ */
function getBeforeDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// 电费（余额/欠费等）
async function getElcFee(i) {
  const u = bindInfo.powerUserList[i];
  const user = bizrt.userInfo[0];

  const cfg = {
    url: `/api${API.accapi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      data: {
        srvCode: "",
        serialNo: "",
        channelCode: CFG.account.channelCode,
        funcCode: CFG.account.funcCode,
        acctId: user.userId,
        userName: user.loginAccount || user.nickname,
        promotType: "1",
        promotCode: "1",
        userAccountId: user.userId,
        list: [{
          consNoSrc: u.consNo_dst,
          proCode: u.proNo,
          sceneType: u.constType,
          consNo: u.consNo,
          orgNo: u.orgNo,
        }],
      },
      serviceCode: "0101143",
      source: CFG.source,
      target: u.proNo || u.provinceId,
    },
  };

  const r = await request(cfg);
  return r?.list?.[0] || {};
}

// 7日用电
async function getDayElecQuantity(i) {
  const u = bindInfo.powerUserList[i];
  const user = bizrt.userInfo[0];
  const startTime = getBeforeDate(6);
  const endTime = getBeforeDate(1);

  const cfg = {
    url: `/api${API.busInfoApi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      params1: {
        serviceCode: "",
        source: CFG.source,
        target: CFG.target,
        uscInfo: { ...CFG.uscInfo },
        quInfo: { userId: user.userId },
        token: bizrt.token,
      },
      params3: {
        data: {
          acctId: user.userId,
          consNo: u.consNo_dst,
          consType: u.constType === "02" ? "02" : "01",
          endTime,
          orgNo: u.orgNo,
          queryYear: String(new Date().getFullYear()),
          proCode: u.proNo || u.provinceId,
          serialNo: "",
          srvCode: "",
          startTime,
          userName: user.nickname || user.loginAccount,
          funcCode: CFG.getday.funcCode,
          channelCode: CFG.getday.channelCode,
          clearCache: CFG.getday.clearCache,
          promotCode: CFG.getday.promotCode,
          promotType: CFG.getday.promotType,
        },
        serviceCode: CFG.getday.serviceCode,
        source: CFG.getday.source,
        target: u.proNo || u.provinceId,
      },
      params4: "010103",
    },
  };

  return await request(cfg);
}

// 32日用电（组件日度图表常用）
async function getDay31ElecQuantity(i) {
  const u = bindInfo.powerUserList[i];
  const user = bizrt.userInfo[0];
  const startTime = getBeforeDate(32);
  const endTime = getBeforeDate(1);

  const cfg = {
    url: `/api${API.busInfoApi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      params1: {
        serviceCode: "",
        source: CFG.source,
        target: CFG.target,
        uscInfo: { ...CFG.uscInfo },
        quInfo: { userId: user.userId },
        token: bizrt.token,
      },
      params3: {
        data: {
          acctId: user.userId,
          consNo: u.consNo_dst,
          consType: u.constType === "02" ? "02" : "01",
          endTime,
          orgNo: u.orgNo,
          queryYear: String(new Date().getFullYear()),
          proCode: u.proNo || u.provinceId,
          serialNo: "",
          srvCode: "",
          startTime,
          userName: user.nickname || user.loginAccount,
          funcCode: CFG.getday.funcCode,
          channelCode: CFG.getday.channelCode,
          clearCache: CFG.getday.clearCache,
          promotCode: CFG.getday.promotCode,
          promotType: CFG.getday.promotType,
        },
        serviceCode: CFG.getday.serviceCode,
        source: CFG.getday.source,
        target: u.proNo || u.provinceId,
      },
      params4: "010103",
    },
  };

  return await request(cfg);
}

// 月用电（今年）
async function getMonthElecQuantity(i, year = new Date().getFullYear()) {
  const u = bindInfo.powerUserList[i];
  const user = bizrt.userInfo[0];

  const cfg = {
    url: `/api${API.busInfoApi}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      params1: {
        serviceCode: "",
        source: CFG.source,
        target: CFG.target,
        uscInfo: { ...CFG.uscInfo },
        quInfo: { userId: user.userId },
        token: bizrt.token,
      },
      params3: {
        data: {
          acctId: user.userId,
          consNo: u.consNo_dst,
          consType: u.constType === "02" ? "02" : "01",
          orgNo: u.orgNo,
          proCode: u.proNo || u.provinceId,
          provinceCode: u.proNo || u.provinceId,
          queryYear: String(year),
          serialNo: "",
          srvCode: "",
          userName: user.nickname || user.loginAccount,
          funcCode: CFG.mouthOut.funcCode,
          channelCode: CFG.mouthOut.channelCode,
          clearCache: CFG.mouthOut.clearCache,
          promotCode: CFG.mouthOut.promotCode,
          promotType: CFG.mouthOut.promotType,
        },
        serviceCode: CFG.mouthOut.serviceCode,
        source: CFG.mouthOut.source,
        target: u.proNo || u.provinceId,
      },
      params4: "010102",
    },
  };

  return await request(cfg);
}

// 江苏 segmentDate（仅江苏需要）
async function getSegmentDate(u, year, month) {
  const cfg = {
    url: `/api${API.segmentDate}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      data: {
        acctId: "acctid01",
        channelCode: "SGAPP",
        consNo: u.consNo_dst,
        funcCode: "A10079078",
        promotCode: "1",
        promotType: "1",
        provinceCode: "32101",
        serialNo: "",
        srvCode: "123",
        userName: "acctid01",
        year,
      },
      serviceCode: "0101798",
      source: "app",
      target: u.proNo,
    },
  };
  const r = await request(cfg);
  const list = r?.billList || [];
  return list[list.length - 1] || null;
}

// 阶梯用电
async function getStepElecQuantity(i, months) {
  const u = bindInfo.powerUserList[i];
  const user = bizrt.userInfo[0];

  const d = new Date();
  const year = d.getFullYear();
  const m = typeof months === "number" ? months : d.getMonth(); // 0-11
  const mm = String(m + 1).padStart(2, "0");
  const queryDate = `${year}-${mm}`;

  let calcId = undefined;
  // 江苏需要 calcId
  if (String(u.proNo) === "32101") {
    const seg = await getSegmentDate(u, year, m + 1);
    calcId = seg?.calcId;
  }

  const cfg = {
    url: `/api${API.electBill}`,
    method: "POST",
    headers: { ...requestKey, token: bizrt.token, acctoken: accessToken },
    data: {
      data: {
        channelCode: CFG.stepelect.channelCode,
        funcCode: CFG.stepelect.funcCode,
        promotType: CFG.stepelect.promotType,
        clearCache: CFG.stepelect.clearCache,
        consNo: u.consNo_dst,
        promotCode: u.proNo || u.provinceId,
        orgNo: u.orgNo || "",
        queryDate,
        provinceCode: u.proNo || u.provinceId,
        consType: u.constType || u.consSortCode,
        userAccountId: user.userId,
        serialNo: "",
        srvCode: "",
        calcId,
        userName: user.nickname || user.loginAccount,
        acctId: user.userId,
      },
      serviceCode: CFG.stepelect.serviceCode,
      source: CFG.stepelect.source,
      target: u.proNo || u.provinceId,
    },
  };

  const r = await request(cfg);
  // 部分地区 r.rtnCode === "1" 才算有效
  if (r && r.rtnCode && String(r.rtnCode) !== "1") {
    throw new Error(r.rtnMsg || "阶梯用电返回异常");
  }
  return r?.list || r || {};
}

/** ============ 数据聚合：支持 query 参数按需取 ============ */
async function fetchAllForAccount(i, params) {
  // params 为空：全量
  const needAll = !params || Object.keys(params).length === 0;

  const tasks = [];
  const out = {};

  const pick = (key, fn) => {
    if (needAll || params[key]) {
      tasks.push(
        fn().then((v) => (out[key] = v)).catch((e) => (out[key] = null, log.warn(`${key} 失败：${e}`)))
      );
    }
  };

  pick("eleBill",           () => getElcFee(i));
  pick("dayElecQuantity",   () => getDayElecQuantity(i));
  pick("dayElecQuantity31", () => getDay31ElecQuantity(i));
  pick("monthElecQuantity", () => getMonthElecQuantity(i, new Date().getFullYear()));
  pick("lastYearElecQuantity", () => getMonthElecQuantity(i, new Date().getFullYear() - 1));
  pick("stepElecQuantity",  () => getStepElecQuantity(i));

  await Promise.all(tasks);

  // arrearsOfFees（欠费标记）：简单判定
  const eb = out.eleBill || {};
  const arrears =
    Number(eb?.historyOwe || "0") > 0 ||
    Number(eb?.sumMoney || "0") < 0;

  return { out, arrears };
}

/** ============ 主流程：缓存 -> 登录链路 -> 拉数据 -> 输出 ============ */
async function main() {
  // 只处理 rewrite 环境（无 $request 就退出）
  if (typeof $request === "undefined" || !$request.url) {
    return done({});
  }

  const params = getUrlParams($request.url);

  // 数据缓存（4h）
  const cacheData = getCached("dataCache");
  if (cacheData?.ts && cacheData?.data && now() - cacheData.ts < TTL_DATA_MS) {
    log.info("🔁 直接返回 4小时缓存数据");
    return output(cacheData.data);
  }

  if (!USERNAME || !PASSWORD) {
    notify(SCRIPTNAME, "请先配置账号密码", "BoxJs：95598_username / 95598_password", {
      "open-url": "http://boxjs.com/#/sub/add/https%3A%2F%2Fraw.githubusercontent.com%2FYuheng0101%2FX%2Fmain%2FTasks%2Fboxjs.json",
    });
    return output([]);
  }

  // 先尝试读取缓存的 bindInfo（减少登录链路触发频率）
  const biCache = getCached("bindInfo");
  if (biCache?.ts && biCache?.data && now() - biCache.ts < TTL_BIZRT_MS) {
    Global.bindInfo = biCache.data;
    syncGlobal();
  }

  // 登录链路（带自愈）
  try {
    await getKeyCode(false);
    await login(false);
    await getAuthcode(0);
    await getAccessToken(false);
    if (!bindInfo?.powerUserList?.length) await getBindInfo();
  } catch (e) {
    const msg = String(e?.message || e || "");
    log.error(`登录链路失败：${msg}`);
    // 自愈一次：清缓存重来
    if (/NEED_RELOGIN|010011|Token|无效|失效|过期|重新获取|请求异常/.test(msg)) {
      log.warn("触发全量自愈：清凭证缓存后重试一次");
      store.del("requestKey");
      store.del("bizrt");
      store.del("authorizecode");
      store.del("accessToken");
      store.del("bindInfo");

      Global.requestKey = {};
      Global.bizrt = {};
      Global.authorizecode = "";
      Global.accessToken = "";
      Global.bindInfo = null;
      syncGlobal();

      await getKeyCode(true);
      await login(true);
      await getAuthcode(0);
      await getAccessToken(true);
      await getBindInfo();
    } else {
      throw e;
    }
  }

  // 拉数据：每个户号都做一份
  const list = bindInfo.powerUserList || [];
  const result = [];
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    const { out, arrears } = await fetchAllForAccount(i, params);

    result.push({
      eleBill: out.eleBill || {},
      userInfo: u,
      dayElecQuantity: out.dayElecQuantity || {},
      dayElecQuantity31: out.dayElecQuantity31 || {},
      monthElecQuantity: out.monthElecQuantity || {},
      lastYearElecQuantity: out.lastYearElecQuantity || {},
      stepElecQuantity: out.stepElecQuantity || {},
      arrearsOfFees: arrears,
    });
  }

  // 写入数据缓存
  setCached("dataCache", { ts: now(), data: result });

  return output(result);
}

function output(data) {
  const body = jsonStr(data);
  const resp = {
    status: isQuanX() ? "HTTP/1.1 200" : 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };

  // QuanX 用 $done(resp)，Surge/Loon 用 $done({response: resp})
  if (isQuanX()) return done(resp);
  return done({ response: resp });
}

/** ============ 启动 ============ */
main()
  .catch((e) => {
    const msg = String(e?.message || e || "");
    log.error(msg);

    // 出错也尽量回空数组，避免客户端死循环
    try {
      if (isQuanX()) done({ status: "HTTP/1.1 200", headers: { "content-type": "application/json; charset=utf-8" }, body: "[]" });
      else done({ response: { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: "[]" } });
    } catch {
      done({});
    }
  });
