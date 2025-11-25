/* 
 * 2025-11-25 完整版京东比价脚本（Loon 兼容）
 * 来源整合：wf021325/qx/master/js/jd_price.js + mw418/Loon/main/script/jd_price.js + yichahucha/surge/master/jd_price.js
 * 支持：Token 获取、API V1/V2、多模式注入（表格/弹窗/原始/折线）
 * 使用：参数 mode=表格版 等切换；version=V1/V2 接口
 * Env.js 内嵌，确保无依赖
 */

const $ = new Env("京东比价");

if ($.isNode()) {
    // Node 测试模式
    global.$request = {
        url: 'https://in.m.jd.com/product/graphext/100142754310.html',
        method: 'GET',
        headers: {},
        body: ''
    };
    global.$response = {
        headers: {},
        body: '<html><body><div id="price-container"></div></body></html>'
    };
    global.$done = (obj) => {
        console.log('测试输出:', obj.body.substring(0, 500) + '...');
    };
}

// 路径匹配
const path1 = '/product/graphext/';
const path2 = '/baoliao/center/menu';
const manmanbuy_key = 'manmanbuy_val';
const url = $request ? $request.url : '';

// 参数解析（支持 argument）
const argStr = typeof $argument !== 'undefined' ? $argument : '';
const args = argStr.split(',').reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    acc[key.trim()] = value ? value.trim() : true;
    return acc;
}, {});
const mode = args.mode || '表格版';  // 弹窗版|表格版|原始版|折线版
const hideTable = args.hideTable === 'true';
const version = args.version || 'V1';  // V1 或 V2 接口

$.version = version;
$.mode = mode;
$.hideTable = hideTable;

// Env.js 完整实现（Loon 兼容）
function Env(name = "Node.js") {
    return new class {
        constructor(name) {
            this.env = name;
            this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
            this.logLevel = "info";
            this.name = name;
            this.http = new class {
                constructor(env) {
                    this.env = env;
                }
                send(method, options) {
                    const { url: baseUrl, ...opts } = options || {};
                    const url = baseUrl.replace('//', '/').split('/').reduce((acc, part, i, arr) => {
                        if (i === 0) return 'https://' + part;
                        return acc + '/' + part;
                    }, '');
                    const req = {
                        url,
                        method: method.toUpperCase(),
                        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15' },
                        ...opts
                    };
                    return new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error('请求超时')), 15000);
                        $httpClient[method.toLowerCase()](req, (err, resp, data) => {
                            clearTimeout(timeout);
                            if (err) reject(err);
                            else resolve({ status: resp.status, body: data });
                        });
                    });
                }
                get(options) { return this.send('GET', options); }
                post(options) { return this.send('POST', options); }
            }(this);
            this.data = null;
            this.dataFile = "box.dat";
            this.logs = [];
            this.startTime = new Date().getTime();
            Object.prototype.log = (...logs) => this.log('', ...logs);
            Object.prototype.logErr = (...logs) => this.log('HTTPC', ...logs);
        }
        platform() { return this.env; }
        isNode() { return "undefined" !== typeof module && !!module.exports; }
        isQuanX() { return "undefined" !== typeof $task; }
        isSurge() { return "undefined" !== typeof $httpClient && "undefined" === typeof $loon; }
        isLoon() { return "undefined" !== typeof $loon; }
        toObj(str, defaultValue = null) { try { return JSON.parse(str); } catch { return defaultValue; } }
        toStr(obj, defaultValue = null) { try { return JSON.stringify(obj); } catch { return defaultValue; } }
        getjson(obj, path) { let body = obj && this.toObj(obj); return path ? this.getValue(path, body) : body; }
        setjson(obj, path) { let body = this.getjson(null, path) || {}; return path && Object.assign(body, obj), this.setdata(JSON.stringify(body), path); }
        getScript(url) { return new Promise(resolve => { this.get({ url }, (err, resp, body) => resolve(body)); }); }
        runScript(script, runOpts) { return new Promise((resolve) => { let httpapi = this.getdata('@chavy_boxjs_userCfgs.httpapi'); httpapi = httpapi ? httpapi.replace(/\n/g, '').trim() : httpapi; const url = this.isNode() ? runOpts.url : 'http://127.0.0.1' + (httpapi || ':8090') + '/run'; this.isNode() && runOpts && runOpts.headers && (runOpts.headers['Content-Type'] = 'application/json'); this.get({ url, method: 'POST', headers: this.isNode() ? { 'Content-Type': 'application/json' } : {}, body: this.toStr(script) }, (err, resp, body) => resolve(body)); }); }
        loaddata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require('fs'); this.path = this.path ? this.path : require('path'); const curPath = this.path.resolve(this.dataFile); const exists = this.fs.existsSync(curPath); if (!exists) return; const databuf = this.fs.readFileSync(curPath); let data = databuf.toString(); data = JSON.parse(data || '{}'); return data; } else return $persistentStore ? $persistentStore.read() : $prefs ? $prefs.value(null, this.dataFile) : null; }
        writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require('Node.js'); this.path = this.path ? this.path : require('path'); const curPath = this.path.resolve(this.dataFile); const obj = this.getdata(null); if (null === obj) { this.deldata(); return; } const data = JSON.stringify(obj); this.fs.writeFileSync(curPath, data); return data; } else return $persistentStore ? $persistentStore.write(null, this.dataFile) : $prefs ? $prefs.setValueForKey(null, this.dataFile) : void 0; }
        getdata(key) { let val = this.getval(key); if (/^@/.test(key)) { const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key); const obj = objkey ? this.getval(objkey) : ''; if (obj) try { const objdata = JSON.parse(obj); val = objdata ? this.getval(paths) : null; } catch (e) { val = null; } } return val; }
        setdata(val, key) { let issuccess = false; if (/^@/.test(key)) { const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key); const obj = this.getval(objkey); const objdata = obj ? JSON.parse(obj) : null; if (!objdata) { issuccess = this.setval(objdata, objkey); } else { paths.split('.').forEach(path => { if (objdata[path]) { objdata[path] = this.getval(key); } else { objdata[path] = this.getval(key); } }); issuccess = this.setval(JSON.stringify(objdata), objkey); } } else { issuccess = this.setval(val, key); } return issuccess; }
        getval(key) { if (this.isSurge() || this.isLoon()) { return $persistentStore.read(key); } else if (this.isQuanX()) { return $prefs.valueForKey(key); } else return this.isNode() ? (this.data = this.loaddata(), this.data[key]) : (this.data && this.data[key]) || null; }
        setval(val, key) { if (this.isSurge() || this.isLoon()) { return $persistentStore.write(val, key); } else if (this.isQuanX()) { return $prefs.setValueForKey(val, key); } else return this.isNode() ? (this.data = this.loaddata(), this.data[key] = val, this.writedata(), true) : (this.data && this.data[key] === val ? true : false); }
        initGotEnv(obj) { this.got = this.got ? this.got : require("got"); this.cktough = this.cktough ? this.cktough : require("tough-cookie"); this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar(); if (obj) { obj.headers = obj.headers ? obj.headers : {}; if (Object.keys(obj.cookies).length > 0) { obj.cookie = Object.keys(obj.cookies).map(key => key + '=' + obj.cookies[key]).join('; '); } this.got.replase('tough-cookie', () => this.cktough); } }
        get(options, callback) { options.headers && (delete options.headers['Content-Type'], delete options.headers['Content-Length']); this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (options.headers = options.headers || {}, Object.assign(options.headers, { 'X-Surge-Skip-Scripting': false })), $httpClient.get(options, (err, response, body) => { if (err) this.logErr(err); else { response.body && (response.body = this.toObj(response.body)); callback(err, response, body); } })) : this.isQuanX() ? (this.isNeedRewrite && (options.opts = options.opts || {}, Object.assign(options.opts, { hints: false })), $task.fetch(options).then(response => { response.status = response.statusCode; response.body = this.toObj(response.body); callback(null, response, response.body); }, err => this.logErr(err))) : this.isNode() && (this.initGotEnv(options), this.got(options).on('redirect', (resp, nextOpts) => { try { if (resp.statusCode === 302 && resp.headers && !resp.headers['set-cookie'] && resp['set-cookie']) { const ck = resp['set-cookie'].map(this.cktough.Cookie.parse).toString(); ck && this.ckjar.setCookieSync(ck, resp.url); nextOpts.headers = { ...resp.headers, Cookie: ck.split(';')[0] }; } nextOpts.redirect = false; } catch (e) { this.logErr(e); } }).then(response => { response.status = response.statusCode; response.body = response.body ? this.toObj(response.body) : null; callback(null, response, response.body); }, err => { this.logErr(err); callback(err); })); }
        post(options, callback) { if (options.body && options.headers && !options.headers['Content-Type']) { options.headers['Content-Type'] = 'application/x-www-form-urlencoded'; } this.isSurge() || this.isLoon() ? $httpClient.post(options, (err, response, body) => { if (err) this.logErr(err); else { response.body && (response.body = this.toObj(response.body)); callback(err, response, body); } }) : this.isQuanX() ? $task.fetch(options).then(response => { response.status = response.statusCode; response.body = this.toObj(response.body); callback(null, response, response.body); }, err => this.logErr(err)) : this.isNode() && (this.initGotEnv(options), this.got(options).on('redirect', (resp, nextOpts) => { try { if (resp.statusCode === 302 && resp.headers && !resp.headers['set-cookie'] && resp['set-cookie']) { const ck = resp['set-cookie'].map(this.cktough.Cookie.parse).toString(); ck && this.ckjar.setCookieSync(ck, resp.url); nextOpts.headers = { ...resp.headers, Cookie: ck.split(';')[0] }; } nextOpts.redirect = false; } catch (e) { this.logErr(e); } }).then(response => { response.status = response.statusCode; response.body = this.toObj(response.body); callback(null, response, response.body); }, err => { this.logErr(err); callback(err); })); }
        time(parse) { const t = parse; let e = this.logLevels[t] || this.logLevels.info; return "object" == typeof e && (e = e[this.logLevel]), "function" == typeof e ? e() : Date.now() - this.startTime; }
        msg(e = t, s = "", i = "", o) { const h = o ? this.getdata('@chavy_boxjs_userCfgs.httpapi') : this.getdata('Config.httpapi'); if (h) { const [a, T] = h.split('@'), url = { url: `http://${T}/v1/scripting/evaluate`, body: { script_text: e, mock_type: "cron", timeout: 4e3, headers: { 'X-Key': a, Accept: '*/*' } }, headers: { 'X-Key': a, Accept: '*/*' } }; this.post(url, (t, e, s) => { !t && e && (e.status === 200 ? this.log(`🔔${Array(15).join("—").trim()} \n| ${s.spend_time}s | \n| ${e.status} | \n| ${typeof e._body == "object" ? e._body.msg : e._body || "NULL"} |\n${Array(15).join("—").trim()} \n`) : this.log(`❌ ${e.status} | ${typeof e._body == "object" ? e._body.msg : e._body || "NULL"} `)); }); } else this.isSurge() || this.isLoon() ? $notification.post(e, s, i) : this.isQuanX() && $notify(e, s, i); }
        log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]); console.log(t.join(this.logSeparator)); }
        logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❌${this.name}, 错误! ${this.toStr(t)}`) : this.log("", `❌${this.name}, 错误! ${t}`); }
        wait(t) { return new Promise(e => setTimeout(e, t)); }
        done(t = {}) { const e = new Date().getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s}秒`); this.log(); if (this.isSurge() || this.isQuanX() || this.isLoon()) { $done(t); } else if (this.isNode()) { process.exit(1); } }
    }(name);
}

// CryptoJS 简化版（用于 MD5）
function intCryptoJS() {
    const CryptoJS = CryptoJS || {};
    CryptoJS.lib = CryptoJS.lib || {};
    CryptoJS.lib.WordArray = CryptoJS.lib.WordArray || function (words, sigBytes) {
        this.words = words || [];
        this.sigBytes = sigBytes || 0;
    };
    CryptoJS.MD5 = function (message, options) {
        const msg = message || '';
        let hash = 0, i, chr;
        if (msg.length === 0) return '';
        for (i = 0, chr = msg.charCodeAt(0); i < msg.length; i++, chr = msg.charCodeAt(i)) {
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString(16).toUpperCase();
    };
    return CryptoJS;
}

// 主入口
if (url.includes(path2)) {
    // Token 获取
    const reqbody = $request.body;
    $.setdata(reqbody, manmanbuy_key);
    $.msg($.name, '✅ 获取 CK 成功', '慢慢买 Token 已保存');
    $done({});
} else if (url.includes(path1)) {
    // 比价主逻辑
    const responseBody = $response.body;
    main().then(res => $done(res || { body: responseBody })).catch(err => {
        $.msg($.name, '❌ 错误', err.message);
        $done({ body: responseBody });
    });
} else {
    $done({});
}

async function main() {
    intCryptoJS();
    const match = url.match(/product\/graphext\/(\d+)\.html/);
    if (!match) throw new Error("京东 URL 匹配失败");
    const wareId = match[1];
    const JD_Url = `https://item.jd.com/${wareId}.html`;
    $.manmanbuy_url = encodeURIComponent(JD_Url);

    let link = JD_Url, stteId;
    if ($.version === "V2") {
        const parse = checkRes(await get_stteId(JD_Url), '获取 stteId [V2]');
        link = parse?.result?.link;
        stteId = parse?.result?.stteId;
    }

    const basic = checkRes(await get_spbh(link, stteId, $.version), '获取 spbh');
    const jiagequshi = checkRes(await get_jiagequshi(basic?.result?.url, basic?.result?.spbh), '获取价格趋势');
    const trend = checkRes(await get_priceRemark(jiagequshi?.result?.trend), '价格备注');

    const ListPriceDetail = trend?.remark?.ListPriceDetail || [];
    const exclude = new Set(['当前到手价', '历史最低价', '618价格', '双11价格', '30天最低价', '60天最低价', '180天最低价']);
    const list = ListPriceDetail.filter(i => !exclude.has(i.Name));

    let html = '';
    switch ($.mode) {
        case '弹窗版':
            showPopup(list, wareId);
            return { body: $response.body };  // 不修改 HTML，直接通知
        case '原始版':
            html = injectOriginal($response.body, list);
            break;
        case '表格版':
            html = injectTable($response.body, list);
            break;
        case '折线版':
            html = injectChart($response.body, list, $.hideTable);
            break;
        default:
            html = injectTable($response.body, list);
    }

    return { body: html };
}

function checkRes(res, desc = '') {
    if (res.ok !== 1) {
        throw new Error(`${desc}失败: ${res.msg || JSON.stringify(res)}`);
    }
    return res;
}

function showPopup(list, wareId) {
    let msg = `商品 ID: ${wareId}\n\n`;
    list.forEach(item => {
        msg += `${item.Name}: ${item.Price} (${item.Date})\n差价: ${item.Difference || 'N/A'}\n`;
    });
    if (list.length === 0) msg += '暂无历史价格数据';
    $.msg('京东历史价格', '', msg);
}

// 原始版注入（简单 DIV）
function injectOriginal(body, list) {
    const rows = list.map(item => `<p>${item.Name}: ${item.Price} (${item.Date}) - ${item.Difference}</p>`).join('');
    const html = `<div style="padding:10px; background:#f0f0f0; margin:10px;"><h3>历史价格</h3>${rows}</div>`;
    return body.replace('</body>', `${html}</body>`);
}

// 表格版注入（完整 CSS + HTML 表格）
function injectTable(body, list) {
    const tableRows = list.map(item => `<tr><td>${item.Name}</td><td>${item.Date || '-'}</td><td>${item.Price}</td><td class="${item.Difference?.startsWith('↓') ? 'down' : item.Difference?.startsWith('↑') ? 'up' : ''}">${item.Difference || '-'}</td></tr>`).join('');
    const css = `
    <style>
    #price-table { width:100%; border-collapse:collapse; margin:10px 0; font-size:14px; }
    #price-table th, #price-table td { border:1px solid #ddd; padding:8px; text-align:left; }
    #price-table th { background:#f2f2f2; }
    .down { color:green; }
    .up { color:red; }
    </style>
    `;
    const html = `
    ${css}
    <table id="price-table">
    <thead><tr><th>类型</th><th>日期</th><th>价格</th><th>差价</th></tr></thead>
    <tbody>${tableRows}</tbody>
    </table>
    `;
    return body.replace('<div id="product-detail">', `<div id="product-detail">${html}`);
}

// 折线版注入（内嵌 ECharts 简化版，支持 hideTable）
function injectChart(body, list, hideTable) {
    // 简化 ECharts（完整版可替换为 CDN: https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js）
    const echartsScript = `
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    `;
    const data = list.map(item => ({ name: item.Name, value: parseFloat(item.Price.replace(/[^0-9.]/g, '')) }));
    const chartId = 'price-chart';
    const tableHtml = hideTable ? '' : injectTable('', list);  // 如果不隐藏，包含表格
    const html = `
    ${echartsScript}
    <div id="${chartId}" style="width:100%; height:300px; margin:10px 0;"></div>
    ${tableHtml}
    <script>
    var chart = echarts.init(document.getElementById('${chartId}'));
    var option = {
        title: { text: '价格趋势' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ${JSON.stringify(data.map(d => d.name))} },
        yAxis: { type: 'value' },
        series: [{ data: ${JSON.stringify(data.map(d => d.value))}, type: 'line' }]
    };
    chart.setOption(option);
    </script>
    `;
    return body.replace('</body>', `${html}</body>`);
}

// API 请求函数
async function mmbRequest(Params, url) {
    if (!$.manmanbuy) $.manmanbuy = getck();
    let payloadStr;
    if (typeof Params === 'string') {
        payloadStr = Params;
    } else {
        const SECRET_KEY = '3E41D1331F5DDAFCD0A38FE2D52FF66F';
        const requestBody = { ...$.manmanbuy, ...Params, t: Date.now().toString() };
        requestBody.token = CryptoJS.MD5(encodeURIComponent(SECRET_KEY + jsonToCustomString(requestBody) + SECRET_KEY)).toUpperCase();
        payloadStr = jsonToQueryString(requestBody);
    }
    const opt = {
        url,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"
        },
        body: payloadStr
    };
    return await $.http.post(opt).then(res => $.toObj(res.body));
}

// 辅助函数
function get_stteId(searchKey) {
    const url = 'https://apapia-common.manmanbuy.com/SiteCommand/parse';
    const payload = { methodName: "commonMethod", searchKey, scene: "TrendHomeUnInput", c_ctrl: "Tabs" };
    return mmbRequest(payload, url);
}

function get_spbh(link, stteId, version) {
    const base = 'https://apapia-history-weblogic.manmanbuy.com/basic';
    const url = version === "V2" ? `${base}/v2/getItemBasicInfo` : `${base}/getItemBasicInfo`;
    const payload = { methodName: "getHistoryInfoJava", searchKey: link, c_ctrl: "Tabs", ...(version === "V2" && { stteId }) };
    return mmbRequest(payload, url);
}

function get_jiagequshi(link, spbh) {
    const url = "https://apapia-history-weblogic.manmanbuy.com/history/v2/getHistoryTrend";
    const payload = {
        methodName: "getHistoryTrend2021",
        url: link,
        spbh: spbh,
        c_ctrl: "TrendDetailScene",
        callPos: "trend_detail",
        currentScene: "TrendDetailRecent",
        eventName: "查询商品历史价格",
        pagecFrom: "TrendHomeUnInput",
        chartStyleTest: "testA"
    };
    return mmbRequest(payload, url);
}

function get_priceRemark(jiagequshiyh) {
    const url = "https://apapia-history-weblogic.manmanbuy.com/history/priceRemark";
    const payload = { methodName: "priceRemarkJava", jiagequshiyh, c_ctrl: "TrendDetailScene" };
    return mmbRequest(payload, url);
}

function getck() {
    const ck = $.getdata(manmanbuy_key);
    if (!ck) throw new Error('请先打开慢慢买 App → 我的，获取 CK');
    const Params = parseQueryString(ck);
    if (!Params || !Params.c_mmbDevId) throw new Error('CK 格式异常');
    return int_ck(Params);
}

function int_ck(Params) {
    const keysToDelete = ["c_ctrl", "methodName", "level", "t", "token"];
    const newParams = { ...Params };
    keysToDelete.forEach(key => delete newParams[key]);
    return newParams;
}

function parseQueryString(queryString) {
    const jsonObject = {};
    const pairs = queryString.split('&');
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value !== undefined) jsonObject[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    return jsonObject;
}

function jsonToQueryString(obj) {
    return Object.keys(obj).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`).join('&');
}

function jsonToCustomString(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
}

// 结束
$.done();
