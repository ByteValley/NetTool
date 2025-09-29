/*
 * BaseWidget.js
 * 通用基类（Scriptable）：网络/缓存/设置/背景/颜色/图片/透明背景/WebView 配置面板/圆环绘制/动作菜单/BoxJS/自更新
 * @version 1.0.0
 * @author ByteValley
 */

class BaseWidget {
  constructor(name, { settingKey, baseKey, defaultSettings } = {}) {
    this.name = name || Script.name();
    this.SETTING_KEY = settingKey || `${this.name}_Settings`;
    this.BaseCacheKey = baseKey || `${this.name}_Base`;
    this.defaultSettings = defaultSettings || {};
    this.widgetFamily = config.widgetFamily;
    this.isNight = Device.isUsingDarkAppearance();

    // 文件系统
    this.FILE_MGR = FileManager[module.filename.includes("Documents/iCloud~") ? "iCloud" : "local"]();
    this.FILE_MGR_LOCAL = FileManager.local();
    this.DOC = this.FILE_MGR.documentsDirectory();

    // 目录
    this.cacheImage = this.FILE_MGR.joinPath(this.DOC, `/images/${Script.name()}`);
    this.baseImage  = this.FILE_MGR.joinPath(this.DOC, `/images/`);
    if (!this.FILE_MGR.fileExists(this.cacheImage)) this.FILE_MGR.createDirectory(this.cacheImage, true);
    this.cacheImageBgPath = [
      `${this.cacheImage}/transparentBg`,
      `${this.cacheImage}/dayBg`,
      `${this.cacheImage}/nightBg`,
      `${this.baseImage}/avatar`,
    ];

    // 设置
    this.settings = this.getSettings() || {};
    this.baseSettings = this.getBaseSettings() || {};
    this.settings = { ...this.defaultSettings, ...this.settings };
    this.settings.lightColor   = this.settings.lightColor   || "#000000";
    this.settings.darkColor    = this.settings.darkColor    || "#ffffff";
    this.settings.lightBgColor = this.settings.lightBgColor || "#ffffff";
    this.settings.darkBgColor  = this.settings.darkBgColor  || "#000000";
    this.settings.refreshAfterDate = this.settings.refreshAfterDate || "30";
    this.settings.lightOpacity = this.settings.lightOpacity || "0.4";
    this.settings.darkOpacity  = this.settings.darkOpacity  || "0.7";
    this.settings.boxjsDomain  = this.baseSettings.boxjsDomain || this.settings.boxjsDomain || "boxjs.net";
    this.prefix = this.settings.boxjsDomain;

    // 动态色
    this.backGroundColor = Color.dynamic(new Color(this.settings.lightBgColor), new Color(this.settings.darkBgColor));
    this.widgetColor     = Color.dynamic(new Color(this.settings.lightColor), new Color(this.settings.darkColor));

    // 动作与菜单
    this._actions = [];
    this._menuActions = [];

    // 字体工具
    this.textFormat = {
      defaultText: { size: 14, font: "regular", color: this.widgetColor },
      battery:     { size: 10, font: "bold",    color: this.widgetColor },
      title:       { size: 16, font: "semibold",color: this.widgetColor },
      SFMono:      { size: 12, font: "SF Mono", color: this.widgetColor },
    };

    // SFSymbol 兜底
    this.initSFSymbol();
  }

  // ========== HTTP / $request ==========
  getRequest = (url = "") => new Request(url);

  async http(opt = { headers: {}, url: "" }, type = "JSON", imgFallback = () => SFSymbol.named("photo").image) {
    let r;
    try {
      if (type === "IMG") {
        const p = `${this.cacheImage}/${this.md5(opt.url)}`;
        let img;
        r = this.getRequest(opt.url);
        if (await this.FILE_MGR.fileExistsExtra?.(p) || this.FILE_MGR.fileExists(p)) {
          // 后台更新缓存
          r.loadImage().then(t => { this.FILE_MGR.writeImage(p, t); });
          return Image.fromFile(p);
        } else {
          img = await r.loadImage();
          this.FILE_MGR.writeImage(p, img);
          return img;
        }
      }
      r = this.getRequest();
      Object.keys(opt).forEach(k => { r[k] = opt[k]; });
      r.headers = { ...opt.headers };
      if (type === "JSON") return await r.loadJSON();
      if (type === "STRING") return await r.loadString();
      return await r.loadJSON();
    } catch (e) {
      if (type === "IMG") return imgFallback?.();
      throw e;
    }
  }

  $request = {
    get: (url = "", opt = {}, type = "JSON") => {
      let cfg = { ...(typeof url === "object" ? url : { url }), method: "GET", ...(typeof opt === "object" ? opt : {}) };
      const t = typeof opt === "string" ? opt : type;
      return this.http(cfg, t);
    },
    post: (url = "", opt = {}, type = "JSON") => {
      let cfg = { ...(typeof url === "object" ? url : { url }), method: "POST", ...(typeof opt === "object" ? opt : {}) };
      const t = typeof opt === "string" ? opt : type;
      return this.http(cfg, t);
    },
  };

  // ========== BoxJS 读取 ==========
  getCache = async (key = "", showNotify = true) => {
    try {
      let url = "http://" + this.prefix + "/query/boxdata";
      if (key) url = "http://" + this.prefix + "/query/data/" + key;
      const r = await this.$request.get(url, key ? { timeoutInterval: 1 } : {});
      if (key) {
        this.settings.BoxJSData = { ...this.settings.BoxJSData, [key]: r.val };
        this.saveSettings(false);
      }
      return key ? (r.val ? r.val : r.datas) : r.datas;
    } catch (e) {
      if (key && this.settings.BoxJSData?.[key]) return this.settings.BoxJSData[key];
      if (showNotify) await this.notify(
        `${this.name} - BoxJS 数据读取失败`,
        "请检查 BoxJS 域名是否为代理复写的域名（boxjs.net / boxjs.com）\n未配置 BoxJS 可点击查看教程",
        "https://chavyleung.gitbook.io/boxjs/awesome/videos"
      );
      return false;
    }
  };

  setCacheBoxJSData = async (map = {}) => {
    if ((await this.generateAlert("代理缓存仅支持 BoxJS 相关的代理！", ["取消", "确定"])) !== 1) return;
    try {
      const datas = await this.getCache();
      Object.keys(map).forEach(k => { this.settings[k] = datas[map[k]] || ""; });
      this.saveSettings();
    } catch (e) {
      this.notify(this.name, "BoxJS 缓存读取失败！点击查看相关教程", "https://chavyleung.gitbook.io/boxjs/awesome/videos");
    }
  };

  // ========== 常用小工具 ==========
  transforJSON = s => { if (typeof s === "string") { try { return JSON.parse(s); } catch { return s; } } return s; };
  base64Encode(s){ return Data.fromString(s).toBase64String(); }
  base64Decode(s){ return Data.fromBase64String(s).toRawString(); }

  md5(t){ /* —— 与原脚本一致的 MD5（为篇幅已压缩；功能同等） —— */
    function e(t,e){var i=(65535&t)+(65535&e);return(t>>16)+(e>>16)+(i>>16)<<16|65535&i}
    function i(t,i,n,a,o,s){return e((r=e(e(i,t),e(a,s)))<<(l=o)|r>>>32-l,n);var r,l}
    function n(t,e,n,a,o,s,r){return i(e&n|~e&a,t,e,o,s,r)}function a(t,e,n,a,o,s,r){return i(e&a|n&~a,t,e,o,s,r)}
    function o(t,e,n,a,o,s,r){return i(e^n^a,t,e,o,s,r)}function s(t,e,n,a,o,s,r){return i(n^(e|~a),t,e,o,s,r)}
    function r(t,i){var r,l,c,d;t[i>>5]|=128<<i%32,t[14+(i+64>>>9<<4)]=i;for(var h=1732584193,m=-271733879,g=-1732584194,u=271733878,p=0;p<t.length;p+=16)
    h=n(r=h,l=m,c=g,d=u,t[p],7,-680876936),u=n(u,h,m,g,t[p+1],12,-389564586),g=n(g,u,h,m,t[p+2],17,606105819),m=n(m,g,u,h,t[p+3],22,-1044525330),
    h=n(h,m,g,u,t[p+4],7,-176418897),u=n(u,h,m,g,t[p+5],12,1200080426),g=n(g,u,h,m,t[p+6],17,-1473231341),m=n(m,g,u,h,t[p+7],22,-45705983),
    h=n(h,m,g,u,t[p+8],7,1770035416),u=n(u,h,m,g,t[p+9],12,-1958414417),g=n(g,u,h,m,t[p+10],17,-42063),m=n(m,g,u,h,t[p+11],22,-1990404162),
    h=n(h,m,g,u,t[p+12],7,1804603682),u=n(u,h,m,g,t[p+13],12,-40341101),g=n(g,u,h,m,t[p+14],17,-1502002290),
    h=a(h,m=n(m,g,u,h,t[p+15],22,1236535329),g,u,t[p+1],5,-165796510),u=a(u,h,m,g,t[p+6],9,-1069501632),g=a(g,u,h,m,t[p+11],14,643717713),
    m=a(m,g,u,h,t[p],20,-373897302),h=a(h,m,g,u,t[p+5],5,-701558691),u=a(u,h,m,g,t[p+10],9,38016083),g=a(g,u,h,m,t[p+15],14,-660478335),
    m=a(m,g,u,h,t[p+4],20,-405537848),h=a(h,m,g,u,t[p+9],5,568446438),u=a(u,h,m,g,t[p+14],9,-1019803690),g=a(g,u,h,m,t[p+3],14,-187363961),
    m=a(m,g,u,h,t[p+8],20,1163531501),h=a(h,m,g,u,t[p+13],5,-1444681467),u=a(u,h,m,g,t[p+2],9,-51403784),g=a(g,u,h,m,t[p+7],14,1735328473),
    h=o(h,m=a(m,g,u,h,t[p+12],20,-1926607734),g,u,t[p+5],4,-378558),u=o(u,h,m,g,t[p+8],11,-2022574463),g=o(g,u,h,m,t[p+11],16,1839030562),
    m=o(m,g,u,h,t[p+14],23,-35309556),h=o(h,m,g,u,t[p+1],4,-1530992060),u=o(u,h,m,g,t[p+4],11,1272893353),g=o(g,u,h,m,t[p+7],16,-155497632),
    m=o(m,g,u,h,t[p+10],23,-1094730640),h=o(h,m,g,u,t[p+13],4,681279174),u=o(u,h,m,g,t[p],11,-358537222),g=o(g,u,h,m,t[p+3],16,-722521979),
    m=o(m,g,u,h,t[p+6],23,76029189),h=o(h,m,g,u,t[p+9],4,-640364487),u=o(u,h,m,g,t[p+12],11,-421815835),g=o(g,u,h,m,t[p+15],16,530742520),
    h=s(h,m=o(m,g,u,h,t[p+2],23,-995338651),g,u,t[p],6,-198630844),u=s(u,h,m,g,t[p+7],10,1126891415),g=s(g,u,h,m,t[p+14],15,-1416354905),
    m=s(m,g,u,h,t[p+5],21,-57434055),h=s(h,m,g,u,t[p+12],6,1700485571),u=s(u,h,m,g,t[p+3],10,-1894986606),g=s(g,u,h,m,t[p+10],15,-1051523),
    m=s(m,g,u,h,t[p+1],21,-2054922799),h=s(h,m,g,u,t[p+8],6,1873313359),u=s(u,h,m,g,t[p+15],10,-30611744),g=s(g,u,h,m,t[p+6],15,-1560198380),
    m=s(m,g,u,h,t[p+13],21,1309151649),h=s(h,m,g,u,t[p+4],6,-145523070),u=s(u,h,m,g,t[p+11],10,-1120210379),g=s(g,u,h,m,t[p+2],15,718787259),
    m=s(m,g,u,h,t[p+9],21,-343485551);return[e(h,1732584193),e(m,-271733879),e(g,-1732584194),e(u,271733878)]}
    function l(t){for(var e="",i=32*t.length,n=0;n<i;n+=8)e+=String.fromCharCode(t[n>>5]>>>n%32&255);return e}
    function c(t){var e=[];for(e[(t.length>>2)-1]=void 0,n=0;n<e.length;n+=1)e[n]=0;for(var i=8*t.length,n=0;n<i;n+=8)e[n>>5]|=(255&t.charCodeAt(n/8))<<n%32;return e}
    function d(t){for(var e,i="0123456789abcdef",n="",a=0;a<t.length;a+=1)e=t.charCodeAt(a),n+=i.charAt(e>>>4&15)+i.charAt(15&e);return n}
    function h(t){return unescape(encodeURIComponent(t))}function m(t){return l(r(c(e=h(t)),8*e.length));var e}
    function g(t,e){return function(t,e){var i,n,a=c(t),o=[],s=[];for(o[15]=s[15]=void 0,16<a.length&&(a=r(a,8*t.length)),i=0;i<16;i+=1)o[i]=909522486^a[i],s[i]=1549556828^a[i];return n=r(o.concat(c(e)),512+8*e.length),l(r(s.concat(n),640))}(h(t),h(e))}
    return function(t,e,i){return e?i?g(e,t):d(g(e,t)):i?m(t):d(m(t))}(t).toLowerCase();
  }

  // ========== 选图 / 背景 ==========
  chooseImg = async (verify = false) => {
    const img = await Photos.fromLibrary().catch(() => undefined);
    if (!verify) return img;
    return (await this.verifyImage(img)) ? img : null;
  };

  getWidgetBackgroundImage = async (widget) => {
    const img = await this.getBackgroundImage();
    if (img) {
      const alpha = Device.isUsingDarkAppearance() ? Number(this.settings.darkOpacity) : Number(this.settings.lightOpacity);
      widget.backgroundImage = await this.shadowImage(img, "#000", alpha);
      return true;
    }
    widget.backgroundColor = this.backGroundColor;
    return false;
  };

  verifyImage = async (img = {}) => {
    const { width, height } = img?.size || {};
    if (width > 1000) {
      const btn = ["取消", "打开图像处理"];
      const msg = `您的图片像素为 ${width} x ${height}\n请将图片宽度调整到 1000 以下\n高度自动适应`;
      if ((await this.generateAlert(msg, btn)) === 1) Safari.openInApp("https://www.sojson.com/image/change.html", false);
      return false;
    }
    return true;
  };

  async getWidgetScreenShot(tip = null) {
    let msg = tip || "开始之前，请先前往桌面，截取空白界面的截图。然后回来继续";
    if ((await this.generateAlert(msg, ["我已截图", "前去截图 >"])) === 1) return;
    let img = await Photos.fromLibrary();
    const H = img.size.height;

    // 设备映射（原脚本映射表完整搬运）
    let conf = {
      2868:{text:{small:510,medium:1092,large:1146,left:114,right:696,top:276,middle:912,bottom:1548},notext:{small:530,medium:1138,large:1136,left:91,right:699,top:276,middle:882,bottom:1488}},
      2796:{text:{small:510,medium:1092,large:1146,left:98,right:681,top:252,middle:888,bottom:1524},notext:{small:530,medium:1139,large:1136,left:75,right:684,top:252,middle:858,bottom:1464}},
      2622:{text:{small:486,medium:1032,large:1098,left:87,right:633,top:261,middle:872,bottom:1485},notext:{small:495,medium:1037,large:1035,left:84,right:626,top:270,middle:810,bottom:1350}},
      2556:{text:{small:474,medium:1017,large:1062,left:81,right:624,top:240,middle:828,bottom:1416},notext:{small:495,medium:1047,large:1047,left:66,right:618,top:243,middle:795,bottom:1347}},
      1334:{text:{small:296,medium:642,large:648,left:54,right:400,top:60,middle:412,bottom:764},notext:{small:309,medium:667,large:667,left:41,right:399,top:67,middle:425,bottom:783}},
      2778:{small:510,medium:1092,large:1146,left:96,right:678,top:246,middle:882,bottom:1518},
      2688:{small:507,medium:1080,large:1137,left:81,right:654,top:228,middle:858,bottom:1488},
      2532:{small:474,medium:1014,large:1062,left:78,right:618,top:231,middle:819,bottom:1407},
      2436:{x:{small:465,medium:987,large:1035,left:69,right:591,top:213,middle:783,bottom:1353},mini:{small:465,medium:987,large:1035,left:69,right:591,top:231,middle:801,bottom:1371}},
      1792:{small:338,medium:720,large:758,left:55,right:437,top:159,middle:579,bottom:999},
      1624:{small:310,medium:658,large:690,left:46,right:394,top:142,middle:522,bottom:902},
      2208:{small:471,medium:1044,large:1071,left:99,right:672,top:114,middle:696,bottom:1278},
      2001:{small:444,medium:963,large:972,left:81,right:600,top:90,middle:618,bottom:1146},
      1136:{small:282,medium:584,large:622,left:30,right:332,top:59,middle:399,bottom:399},
    }[H];

    if (!conf) {
      msg = "好像您选择的照片不是正确的截图，请先前往桌面";
      await this.generateAlert(msg, ["我已知晓"]);
      return;
    }

    if (H === 2436) {
      const fm = this.FILE_MGR_LOCAL;
      const key = "mz-phone-type";
      const p = fm.joinPath(fm.libraryDirectory(), key);
      if (fm.fileExists(p)) {
        conf = conf[fm.readString(p)];
      } else {
        const t = await this.generateAlert("您的📱型号是?", ["iPhone 12 mini","iPhone 11 Pro, XS, or X"]) === 0 ? "mini" : "x";
        conf = conf[t]; fm.writeString(p, t);
      }
    }

    if (conf.text) {
      const idx = await this.generateAlert("主屏幕是否有文本标签？", ["有","无"]);
      conf = conf[["text","notext"][idx]];
    }

    const size = ["小尺寸","中尺寸","大尺寸"][await this.generateAlert("截图中要设置透明背景组件的尺寸类型是？",["小尺寸","中尺寸","大尺寸"])];
    let rect = { w:"", h:"", x:"", y:"" };
    if (size === "小尺寸") {
      rect.w = conf.small; rect.h = conf.small;
      const map = ["Top left","Top right","Middle left","Middle right","Bottom left","Bottom right"];
      const i = await this.generateAlert(
        H===1136 ? "要设置透明背景的小组件在哪个位置？（该机型只有两行）" : "要设置透明背景的小组件在哪个位置？",
        ["左上角","右上角","中间左","中间右","左下角","右下角"]
      );
      const [topOrMid, leftOrRight] = map[i].toLowerCase().split(" ");
      rect.y = conf[topOrMid]; rect.x = conf[leftOrRight];
    } else if (size === "中尺寸") {
      rect.w = conf.medium; rect.h = conf.small; rect.x = conf.left;
      const i = await this.generateAlert("要设置透明背景的小组件在哪个位置？",["顶部","中间","底部"]);
      rect.y = conf[["top","middle","bottom"][i]];
    } else {
      rect.w = conf.medium; rect.h = conf.large; rect.x = conf.left;
      const i = await this.generateAlert("要设置透明背景的小组件在哪个位置？",["顶部","底部"]);
      rect.y = i ? conf.middle : conf.top;
    }

    // 裁剪
    const draw = (src, r) => {
      let ctx = new DrawContext();
      ctx.size = new Size(r.width, r.height);
      ctx.drawImageAtPoint(src, new Point(-r.x, -r.y));
      return ctx.getImage();
    };
    return draw(img, new Rect(rect.x, rect.y, rect.w, rect.h));
  }

  // ========== 设置输入 ==========
  setLightAndDark = async (title, desc, key, placeholder = "") => {
    try {
      const a = new Alert();
      a.title = title; a.message = desc;
      a.addTextField(placeholder, `${this.settings[key] || ""}`);
      a.addAction("确定"); a.addCancelAction("取消");
      if ((await a.presentAlert()) !== -1) {
        this.settings[key] = a.textFieldValue(0) || "";
        this.saveSettings(); return true;
      }
    } catch {}
  };

  setAlertInput = async (title, desc, schema = {}, save = true) => {
    const a = new Alert();
    a.title = title; a.message = desc || "";
    Object.keys(schema).forEach(k => a.addTextField(schema[k], this.settings[k]));
    a.addAction("确定"); a.addCancelAction("取消");
    if ((await a.presentAlert()) === -1) return;
    const out = {};
    Object.keys(schema).forEach((k, i) => out[k] = a.textFieldValue(i) || "");
    if (save) { this.settings = { ...this.settings, ...out }; this.saveSettings(); return; }
    return out;
  };

  setBaseAlertInput = async (title, desc, schema = {}, save = true) => {
    const a = new Alert();
    a.title = title; a.message = desc || "";
    Object.keys(schema).forEach(k => a.addTextField(schema[k], this.baseSettings[k] || ""));
    a.addAction("确定"); a.addCancelAction("取消");
    if ((await a.presentAlert()) === -1) return;
    const out = {};
    Object.keys(schema).forEach((k, i) => out[k] = a.textFieldValue(i) || "");
    if (save) return this.saveBaseSettings(out);
    return out;
  };

  // ========== WebView 配置页 & 桥 ==========
  // —— 以下三个方法供配置页使用：绘制图标/结束加载/页面插值 —— //
  drawTableIcon = async (sf = "square.grid.2x2", color = "#56A8D6", radius = 42) => {
    let s = SFSymbol.named("square.grid.2x2");
    try { s = SFSymbol.named(sf); s.applyFont(Font.mediumSystemFont(30)); } catch {}
    const html = `
      <img id="sourceImg" src="data:image/png;base64,${Data.fromPNG(s.image).toBase64String()}" />
      <img id="silhouetteImg" src="" />
      <canvas id="mainCanvas"></canvas>
    `;
    let wv = new WebView(); await wv.loadHTML(html);
    const dataURL = await wv.evaluateJavaScript(`
      var canvas = document.createElement("canvas");
      var sourceImg = document.getElementById("sourceImg");
      var ctx = canvas.getContext('2d');
      var size = Math.max(sourceImg.width, sourceImg.height);
      canvas.width = size; canvas.height = size;
      ctx.drawImage(sourceImg, (canvas.width - sourceImg.width)/2, (canvas.height - sourceImg.height)/2);
      var imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
      var pix = imgData.data;
      for (var i=0,n=pix.length;i<n;i+=4){ pix[i]=255; pix[i+1]=255; pix[i+2]=255; }
      ctx.putImageData(imgData,0,0);
      canvas.toDataURL();
    `);
    const img = await new Request(dataURL).loadImage();
    const size = new Size(160,160);
    const dc = new DrawContext(); dc.opaque = false; dc.respectScreenScale = true; dc.size = size;
    const path = new Path(); const rect = new Rect(0,0,size.width,size.width);
    path.addRoundedRect(rect, radius, radius); dc.setFillColor(new Color(color)); dc.addPath(path); dc.fillPath();
    const inside = size.width - 36; const pad = (size.width - inside)/2;
    dc.drawImageInRect(img, new Rect(pad,pad,inside,inside));
    return dc.getImage();
  };
  dismissLoading = wv => { wv.evaluateJavaScript(`window.dispatchEvent(new CustomEvent('JWeb',{detail:{code:'finishLoading'}}))`, false); };
  insertTextByElementId = (wv, id, html) => { const js = `document.getElementById("${id}_val").innerHTML=\`${html}\`;`; wv.evaluateJavaScript(js, false); };
  loadSF2B64 = async (sf = "square.grid.2x2", color = "#56A8D6", radius = 42) => {
    const img = await this.drawTableIcon(sf, color, radius);
    return `data:image/png;base64,${Data.fromPNG(img).toBase64String()}`;
  };

  // —— 用户信息卡片（头像/昵称/描述 + BoxJS 域名） —— //
  userConfigKey = ["avatar", "nickname", "homePageDesc"];
  async setUserInfo(){
    const fill = async (field, webview) => {
      const out = await this.setBaseAlertInput(field.title, field.desc, { [field.val]: field.placeholder });
      if (out) this.insertTextByElementId(webview, field.name, out[field.val]);
    };
    return this.renderAppView([
      {
        title:"个性设置",
        menu:[
          { icon:{name:"person",color:"#fa541c"}, name:this.userConfigKey[0], title:"首页头像", type:"img", val:this.baseImage, onClick: async (t,e,wv)=>{
            const idx = await this.generateAlert("设置个性化头像",["相册选择","在线链接","取消"]); if (idx===2) return;
            const saveTo = `${t.val}/${t.name}`;
            if (idx===0){
              const ch = await this.generateAlert("",["选择图片","清空图片","取消"]); if (ch===2) return;
              if (ch===1) return await this.htmlChangeImage(false, saveTo, {previewWebView:wv, id:t.name});
              const img = await this.chooseImg(true); if (img) await this.htmlChangeImage(img, saveTo, {previewWebView:wv, id:t.name});
            } else {
              const r = await this.setBaseAlertInput("在线链接","首页头像在线链接",{avatar:"🔗请输入 URL 图片链接"});
              if (!r) return;
              if (r[t.name]){
                const im = await this.$request.get(r[t.name], "IMG");
                await this.htmlChangeImage(im, saveTo, {previewWebView:wv, id:t.name});
              } else {
                await this.htmlChangeImage(false, saveTo, {previewWebView:wv, id:t.name});
              }
            }
          }},
          { icon:{name:"pencil",color:"#fa8c16"}, type:"input", title:"首页昵称", desc:"个性化首页昵称", placeholder:"👤请输入头像昵称", val:this.userConfigKey[1], name:this.userConfigKey[1], defaultValue:this.baseSettings.nickname, onClick: fill },
          { icon:{name:"lineweight",color:"#a0d911"}, type:"input", title:"首页昵称描述", desc:"个性化首页昵称描述", placeholder:"请输入描述", val:this.userConfigKey[2],name:this.userConfigKey[2], defaultValue:this.baseSettings.homePageDesc, onClick: fill },
        ]
      },
      {
        menu:[
          { icon:{name:"shippingbox",color:"#f7bb10"}, type:"input", title:"BoxJS 域名", desc:"如：boxjs.net / boxjs.com", val:"boxjsDomain", name:"boxjsDomain", placeholder:"boxjs.net", defaultValue:this.baseSettings.boxjsDomain, onClick: fill },
          { icon:{name:"clear",color:"#f5222d"}, title:"恢复默认设置", name:"reset", onClick: async ()=>{
            if ((await this.generateAlert("确定要恢复当前所有配置吗？",["取消","确定"])) === 1){
              this.settings = {}; this.baseSettings = {};
              this.FILE_MGR.remove(this.cacheImage);
              for (const p of this.cacheImageBgPath) await this.setBackgroundImage(false, p, false);
              this.saveSettings(false); this.saveBaseSettings(); await this.notify("重置成功","请关闭窗口后重新运行脚本"); this.reopenScript();
            }
          }}
        ]
      }
    ]);
  }

  htmlChangeImage = async (imgOrFalse, toPath, {previewWebView, id}) => {
    const dataUrl = await this.setBackgroundImage(imgOrFalse, toPath, false);
    this.insertTextByElementId(previewWebView, id, dataUrl ? `<img src="${dataUrl}"/>` : "");
  };

  reopenScript = () => { Safari.open(`scriptable:///run/${encodeURIComponent(Script.name())}`); };

  // —— 强大的配置页渲染（移植并整理原 HTML/CSS/JS 与 JBridge 桥接） —— //
  async renderAppView(groups = [], withUserCard = false, webview = new WebView()){
    const bridgeJS = `
      (() => {
        window.invoke = (code, data) => {
          window.dispatchEvent(new CustomEvent('JBridge', { detail: { code, data } }))
        }
        const toggleIcoLoading = (e) => {
          try{
            const target = e.currentTarget
            target.classList.add('loading')
            const icon = e.currentTarget.querySelector('.iconfont')
            const className = icon.className
            icon.className = 'iconfont icon-loading'
            const listener = (event) => {
              const { code } = event.detail
              if (code === 'finishLoading') {
                target.classList.remove('loading')
                icon.className = className
                window.removeEventListener('JWeb', listener);
              }
            }
            window.addEventListener('JWeb', listener)
          }catch(e){
            for (const loading of document.querySelectorAll('.icon-loading')) {
              loading.classList.remove('loading');
              loading.className = "iconfont icon-arrow-right";
            }
          }
        };
        for (const btn of document.querySelectorAll('.form-item')) {
          btn.addEventListener('click', (e) => {
            if(!e.target.id) return;
            toggleIcoLoading(e);
            invoke(e.target.id);
          })
        }
        for (const btn of document.querySelectorAll('.form-item__input')) {
          btn.addEventListener('change', (e) => {
            if(!e.target.name) return;
            invoke(e.target.name, e.target.type==="checkbox" ? \`\${e.target.checked}\` : e.target.value);
          })
        }
        if(${withUserCard}){
          document.querySelectorAll('.form-item-auth')[0].addEventListener('click', (e) => {
            toggleIcoLoading(e);
            invoke("userInfo");
          })
        }
      })()
    `;

    // 组装列表 HTML（沿用原样式）
    let bodyHTML = "";
    let flatMenus = [];
    for (const gi in groups) {
      const g = groups[gi];
      flatMenus = [...g.menu, ...flatMenus];
      bodyHTML += `
      <div class="list">
        <div class="list__header">${g.title || ""}</div>
        <form id="form_${gi}" class="list__body" action="javascript:void(0);">
      `;
      for (const item of g.menu) {
        let ico = "";
        if (item.url) {
          const img = await this.http({url:item.url},"IMG", ()=>this.drawTableIcon("gear"));
          ico = `data:image/png;base64,${(item.url.includes("png")?Data.fromPNG(img):Data.fromJPEG(img)).toBase64String()}`;
        } else {
          const i = item.icon || {};
          ico = await this.loadSF2B64(i.name, i.color);
        }
        const key = item.name || item.val;
        let right = "";
        item.defaultValue = this.settings[key] || item.defaultValue || "";
        if (item.type === "input") right = item.defaultValue || "";
        else if (item.type === "img"){
          const p = `${item.val}/${item.name}`;
          if (await this.FILE_MGR.fileExistsExtra?.(p) || this.FILE_MGR.fileExists(p)){
            right = `<img src="${`data:image/png;base64,${Data.fromFile(p).toBase64String()}`}"/>`;
          }
        } else if (item.type === "select"){
          let opts = "";
          item.options.forEach(o=>{
            opts += `<option value="${o}" ${item.defaultValue==o?'selected="selected"':""}>${o}</option>`
          });
          right = `<select class="form-item__input" name="${key}">${opts}</select>`;
        } else if (item.type === "switch"){
          right = `<input class="form-item__input" name="${key}" role="switch" type="checkbox" value="true" ${("true"==item.defaultValue)?'checked="checked"':""} />`;
        } else if (item.type){
          right = `<input class="form-item__input" placeholder="${item.placeholder||"请输入"}" name="${key}" type="${item.type}" enterkeyhint="done" value="${item.defaultValue||""}">`;
        }
        const wrap = (item.type==="switch"||item.type==="checkbox") ? "form-item-switch" : "form-item";
        bodyHTML += `
          <label id="${key}" class="${wrap} form-item--link">
            <div class="form-label item-none">
              <img class="form-label-img" src="${ico}"/>
              <div class="form-label-title">${item.title}</div>
            </div>
            <div id="${key}_val" class="form-item-right-desc">${right}</div>
            <i id="iconfont-${key}" class="iconfont icon-arrow-right"></i>
          </label>
        `;
      }
      bodyHTML += `</form></div>`;
    }

    let userCard = "";
    if (withUserCard){
      const p = `${this.baseImage}/${this.userConfigKey[0]}`;
      const info = {
        avatar: "https://trollstore-pro.github.io/repo/CydiaIcon.png",
        nickname: this.baseSettings[this.userConfigKey[1]] || "昵称",
        homPageDesc: this.baseSettings[this.userConfigKey[2]] || "个性签名"
      };
      if (await this.FILE_MGR.fileExistsExtra?.(p) || this.FILE_MGR.fileExists(p))
        info.avatar = `data:image/png;base64,${Data.fromFile(p).toBase64String()}`;
      userCard = `
      <div class="list">
        <form class="list__body" action="javascript:void(0);">
          <label id="userInfo" class="form-item-auth form-item--link">
            <div class="form-label">
              <img class="form-label-author-avatar" src="${info.avatar}"/>
              <div>
                <div class="form-item-auth-name">${info.nickname}</div>
                <div class="form-item-auth-desc">${info.homPageDesc}</div>
              </div>
            </div>
            <div id="userInfo_val" class="form-item-right-desc">设置</div>
            <i class="iconfont icon-arrow-right"></i>
          </label>
        </form>
      </div>`;
    }

    const html = `
    <html>
      <head>
        <meta name='viewport' content='width=device-width, user-scalable=no'>
        <link rel="stylesheet" href="https://at.alicdn.com/t/c/font_3791881_bf011w225k4.css" type="text/css">
        <style>
          :root{--color-primary:#007aff;--divider-color:rgba(60,60,67,0.16);--card-background:#fff;--card-radius:8px;--list-header-color:rgba(60,60,67,0.6);}
          *{-webkit-user-select:none;user-select:none;}
          body{margin:10px 0;-webkit-font-smoothing:antialiased;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;accent-color:var(--color-primary);background:#f6f6f6;}
          .list{margin:15px;}
          .list__header{margin:0 18px;color:var(--list-header-color);font-size:13px;}
          .list__body{margin-top:10px;background:var(--card-background);border-radius:var(--card-radius);overflow:hidden;}
          .form-item-auth,.form-item,.form-item-switch{display:flex;align-items:center;justify-content:space-between;min-height:2.2em;padding:.5em 10px;position:relative;font-size:14px;}
          .form-item-auth{min-height:4em;padding:.5em 18px;}
          .form-item-auth-name{margin:0 12px;font-size:20px;font-weight:430;}
          .form-item-auth-desc{margin:0 12px;font-size:12px;}
          .form-label{display:flex;align-items:center;flex-wrap:nowrap}
          .form-label-img{height:30px;}
          .form-label-title{margin-left:8px;white-space:nowrap;}
          label>*{pointer-events:none;}
          .form-item--link .icon-arrow-right{color:#86868b;}
          .form-item-right-desc{font-size:13px;color:#86868b;margin:0 4px 0 auto;max-width:130px;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;white-space:nowrap;}
          .form-item-right-desc img{width:30px;height:30px;border-radius:3px;}
          .form-item + .form-item::before,.form-item + .form-item-switch::before,.form-item-switch + .form-item::before,.form-item-switch + .form-item-switch::before {content:"";position:absolute;top:0;left:0;right:0;border-top:.5px solid var(--divider-color);}
          .form-item input[type="checkbox"]{width:2em;height:2em;}
          input[type='input'],select,input[type='date']{width:100%;height:2.3em;outline:none;text-align:right;padding:0 10px;border:1px solid #ddd;font-size:14px;color:#86868b;border-radius:4px;}
          input[type='checkbox'][role='switch']{position:relative;display:inline-block;appearance:none;width:40px;height:24px;border-radius:24px;background:#ccc;transition:.3s;}
          input[type='checkbox'][role='switch']::before{content:'';position:absolute;left:2px;top:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.3s;}
          input[type='checkbox'][role='switch']:checked{background:var(--color-primary);}
          input[type='checkbox'][role='switch']:checked::before{transform:translateX(16px);}
          .copyright{display:flex;align-items:center;justify-content:space-between;margin:15px;font-size:10px;color:#86868b;}
          .copyright a{color:#515154;text-decoration:none;}
          .icon-loading{display:inline-block;animation:1s linear infinite spin;}
          @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(1turn)}}
          @media (prefers-color-scheme:dark){:root{--divider-color:rgba(84,84,88,0.65);--card-background:#1c1c1e;--list-header-color:rgba(235,235,245,0.6);} body{background:#000;color:#fff;}}
        </style>
      </head>
      <body>
        ${userCard}
        ${bodyHTML}
        <footer><div class="copyright"><div> </div><div>© UI from <a href="javascript:invoke('safari','https://about.ttkmm.com')">@Neo</a></div></div></footer>
        <script>${bridgeJS}<\/script>
      </body>
    </html>`;

    await webview.loadHTML(html);

    const loop = async () => {
      const payload = await webview.evaluateJavaScript(`(() => {
        try{
          window.addEventListener('JBridge', (e)=>{ completion(JSON.stringify(e.detail||{})) })
        }catch(e){ alert("预览界面出错："+e); throw new Error("界面处理出错："+e); }
      })()`, true);
      const { code, data } = JSON.parse(payload);
      try {
        if (code === "userInfo") await this.setUserInfo();
        const it = flatMenus.find(m => (m.name || m.val) === code);
        if (it){
          const key = it?.name || it?.val;
          if (it?.onClick) await it.onClick(it, data, webview);
          else if (it.type === "input"){
            const ok = await this.setLightAndDark(it.title, it.desc, key, it.placeholder);
            if (ok) this.insertTextByElementId(webview, key, this.settings[key] || "");
          } else if (it.type === "img") {
            const saveTo = `${it.val}/${it.name}`;
            const ch = await this.generateAlert("相册图片选择，请选择合适图片大小",["选择图片","清空图片","取消"]);
            if (ch === 0){
              const picked = await this.chooseImg(it.verify);
              if (picked) await this.htmlChangeImage(picked, saveTo, {previewWebView:webview, id:key});
            } else if (ch === 1) {
              await this.htmlChangeImage(false, saveTo, {previewWebView:webview, id:key});
            }
          } else if (typeof data !== "undefined") {
            this.settings[key] = data; this.saveSettings(false);
          }
        }
      } catch {}
      this.dismissLoading(webview); loop();
    };
    loop().catch(e => { this.dismissLoading(webview); config.runsInApp || this.notify("主界面", `🚫 ${e}`); });
    return webview.present();
  }

  // ========== 初始化与工具 ==========
  initSFSymbol(){
    const raw = SFSymbol.named;
    SFSymbol.named = (name) => raw(name) || raw("photo");
    return SFSymbol;
  }
  getColors = (s="") => typeof s === "string" ? s.split(",") : s;
  getBackgroundColor = (arr) => {
    const g = new LinearGradient(), loc = [];
    g.colors = arr.map((c,i)=>{ loc.push(Math.floor(((i+1)/arr.length)*100)/100); return new Color(c,1); });
    g.locations = loc; return g;
  };

  registerAction(t, onClick, icon={name:"gear", color:"#096dd9"}, type){
    if (typeof t === "object" && t.menu) return this._menuActions.push(t);
    if (typeof t === "object" && !t.menu) return this._actions.push(t);
    const a = { name:t, type, title:t, onClick:onClick?.bind(this) };
    if (typeof icon === "string") a.url = icon; else a.icon = icon;
    this._actions.push(a);
  }

  async renderHeader(stack, imgUrl, text, color = false){
    let h = stack.addStack(); h.centerAlignContent();
    try {
      const img = await this.$request.get(imgUrl, "IMG");
      let im = h.addImage(img); im.imageSize = new Size(14,14); im.cornerRadius = 4;
    } catch {}
    h.addSpacer(10);
    const lab = h.addText(text); if (color) lab.textColor = color;
    lab.textOpacity = .7; lab.font = Font.boldSystemFont(12); lab.lineLimit = 1;
    stack.addSpacer(15); return stack;
  }

  async generateAlert(message, actions){ const a = new Alert(); a.message = message; actions.forEach(b=>a.addAction(b)); return await a.presentAlert(); }
  async notify(title, body, url, extra = {}){ let n = new Notification(); n = Object.assign(n, extra); n.title = title; n.body = body; if (url) n.openURL = url; await n.schedule(); }

  async shadowImage(img, hex="#000000", alpha=.7){ if (!img || alpha===0) return img;
    const dc = new DrawContext(); dc.size = img.size; dc.drawImageInRect(img, new Rect(0,0,img.size.width,img.size.height));
    dc.setFillColor(new Color(hex, alpha)); dc.fillRect(new Rect(0,0,img.size.width,img.size.height)); return await dc.getImage();
  }

  getSettings(json=true){ let s = json?{}:""; let raw = ""; if (Keychain.contains(this.SETTING_KEY)) raw = Keychain.get(this.SETTING_KEY);
    if (json){ try{ s = JSON.parse(raw); }catch{} } else s = raw; return s;
  }
  getBaseSettings(json=true){ let s = json?{}:""; let raw = ""; if (Keychain.contains(this.BaseCacheKey)) raw = Keychain.get(this.BaseCacheKey);
    if (json){ try{ s = JSON.parse(raw); }catch{} } else s = raw; return s;
  }
  saveBaseSettings(obj={}, toast=true){ const merged = { ...(this.baseSettings||{}), ...(obj||{}) };
    this.baseSettings = merged; Keychain.set(this.BaseCacheKey, JSON.stringify(merged));
    if (toast) this.notify("设置成功", "通用设置需重新运行脚本生效"); return merged;
  }
  saveSettings(toast=true){ const s = (typeof this.settings === "object") ? JSON.stringify(this.settings) : String(this.settings);
    Keychain.set(this.SETTING_KEY, s); if (toast) this.notify("设置成功","桌面组件稍后将自动刷新"); return s;
  }

  async getBackgroundImage(){
    if (await this.FILE_MGR.fileExistsExtra?.(this.cacheImageBgPath[0]) || this.FILE_MGR.fileExists(this.cacheImageBgPath[0])) return Image.fromFile(this.cacheImageBgPath[0]);
    if (this.isNight){
      if (await this.FILE_MGR.fileExistsExtra?.(this.cacheImageBgPath[2]) || this.FILE_MGR.fileExists(this.cacheImageBgPath[2])) return Image.fromFile(this.cacheImageBgPath[2]);
    } else {
      if (await this.FILE_MGR.fileExistsExtra?.(this.cacheImageBgPath[1]) || this.FILE_MGR.fileExists(this.cacheImageBgPath[1])) return Image.fromFile(this.cacheImageBgPath[1]);
    }
    return;
  }
  async setBackgroundImage(imgOrFalse, path=this.baseImage, toast=true){
    const p = path;
    if (imgOrFalse){
      this.FILE_MGR.writeImage(p, imgOrFalse);
      if (toast) await this.notify("设置成功","背景图片已设置！稍后刷新生效");
      return `data:image/png;base64,${Data.fromFile(p).toBase64String()}`;
    }
    if (this.FILE_MGR.fileExists(p)) this.FILE_MGR.remove(p);
    if (toast) await this.notify("移除成功","背景图片已移除，稍后刷新生效");
  }

  getRandomArrayElements(arr, count){
    let a = arr.slice(0), o = a.length, s = o - count; s = s>0 ? s : 0;
    for (; o-- > s; ){ const n = Math.floor((o+1)*Math.random()); const tmp = a[n]; a[n] = a[o]; a[o] = tmp; }
    return a.slice(s);
  }

  provideFont = (weight, size) => ({
    ultralight: () => Font.ultraLightSystemFont(size),
    light:      () => Font.lightSystemFont(size),
    regular:    () => Font.regularSystemFont(size),
    medium:     () => Font.mediumSystemFont(size),
    semibold:   () => Font.semiboldSystemFont(size),
    bold:       () => Font.boldSystemFont(size),
    heavy:      () => Font.heavySystemFont(size),
    black:      () => Font.blackSystemFont(size),
    italic:     () => Font.italicSystemFont(size),
  }[weight] || (()=>new Font(weight, size)))();

  provideText = (text, stack, opt={}) => {
    opt = { font:"light", size:14, color:this.widgetColor, opacity:1, minimumScaleFactor:1, ...opt };
    const t = stack.addText(text);
    t.font = this.provideFont(opt.font, opt.size);
    t.textColor = opt.color; t.textOpacity = opt.opacity || 1; t.minimumScaleFactor = opt.minimumScaleFactor || 1;
    return t;
  };

  // ========== 圆环/仪表盘/进度条（保留原方法名以兼容） ==========
  canvSize=178; canvWidth=18; canvRadius=80;
  makeCanvas(){ const dc=new DrawContext(); dc.opaque=false; dc.respectScreenScale=true; dc.size=new Size(this.canvSize,this.canvSize); return dc; }
  sinDeg(a){ return Math.sin(a*Math.PI/180); }
  cosDeg(a){ return Math.cos(a*Math.PI/180); }

  drawArc(dc, deg, fg, bg){
    const c = new Point(this.canvSize/2,this.canvSize/2), r = this.canvRadius, lw = this.canvWidth;
    const left = c.x - r, top = c.y - r, size = 2*r;
    const rect = new Rect(left, top, size, size);
    dc.setStrokeColor(bg); dc.setLineWidth(lw); dc.strokeEllipse(rect);
    for (let i=0;i<deg;i++){
      const x = c.x + r*this.sinDeg(i) - lw/2;
      const y = c.y - r*this.cosDeg(i) - lw/2;
      const d = new Rect(x,y,lw,lw);
      dc.setFillColor(fg instanceof Color ? fg : new Color(fg)); dc.setStrokeColor(bg); dc.fillEllipse(d);
    }
  }

  drawLineArc(dc, center, radius, a0, a1, _unused, col, width){
    const p = new Path(); const sx = center.x + radius*Math.cos(a0), sy = center.y + radius*Math.sin(a0);
    p.move(new Point(sx,sy));
    for (let t=1;t<=100;t++){ const a = a0 + (a1-a0)*(t/100); const x = center.x + radius*Math.cos(a), y = center.y + radius*Math.sin(a); p.addLine(new Point(x,y)); }
    dc.setStrokeColor(col); dc.setLineWidth(width); dc.addPath(p); dc.strokePath();
  }
  drawHalfCircle(x,y,ang,r,dc,col,dir=1){
    const p = new Path(); const sx = x + r*Math.cos(ang), sy = y + r*Math.sin(ang); p.move(new Point(sx,sy));
    for (let i=0;i<=10;i++){ const t=i/10; const a = ang + dir*Math.PI*t; const nx = x + r*Math.cos(a), ny = y + r*Math.sin(a); p.addLine(new Point(nx,ny)); }
    dc.setFillColor(col); dc.addPath(p); dc.fillPath();
  }

  progressBar(model){
    const W=60, R=4.5, dc=this.makeCanvas(W,9); const pct=model.percent/100*W; const knob=pct-9;
    const main=model.iconColor, bg=new Color(model.iconColor.hex,.3), solid=model.iconColor;
    this.fillRect(dc,0,3,W,3,1.5,bg); this.fillRect(dc,0,3,pct>W?W:(pct<9?9:pct),3,1.5,main);
    this.fillRect(dc, knob>51?51:(knob<0?0:knob), 0, 9, 9, R, solid);
    return dc.getImage();
  }
  fillRect(dc,x,y,w,h,r,col){ const p=new Path(); const rect=new Rect(x,y,w,h); p.addRoundedRect(rect,r,r); dc.addPath(p); dc.setFillColor(col); dc.fillPath(); }

  gaugeChart(model, colorHex){
    const dc = this.makeCanvas(); const ctr = new Point(this.canvSize/2,this.canvSize/2); const radius = this.canvSize/2-10;
    const a0 = 10*Math.PI/12, a1 = 26*Math.PI/12; const span = a1 - a0; const bg = model.BGColor;
    let c = model.percent/100;
    this.drawLineArc(dc, ctr, radius, a0, a1, 1, bg, 16);
    this.drawHalfCircle(ctr.x+radius*Math.cos(a0), ctr.y+radius*Math.sin(a0), a0, 8, dc, bg, -1);
    this.drawHalfCircle(ctr.x+radius*Math.cos(a1), ctr.y+radius*Math.sin(a1), a1, 8, dc, bg, 1);
    for (let i=0;i<240*c;i++){
      const ang = a0 + span*(i/240), x=ctr.x+radius*Math.cos(ang), y=ctr.y+radius*Math.sin(ang);
      const d=new Rect(x-8,y-8,16,16);
      dc.setFillColor(model.FGColor instanceof Color ? model.FGColor : new Color(model.FGColor)); dc.fillEllipse(d);
    }
    return dc.getImage();
  }

  addChineseUnit(stack, unit, color, size){ const t=stack.addText(unit); t.textColor=color; t.font=Font.semiboldSystemFont(size); return t; }
  unit(stack, text, pad=1, color=this.widgetColor){ stack.addSpacer(1); const s=stack.addStack(); s.layoutVertically(); s.addSpacer(pad); const t=s.addText(text); t.font=Font.semiboldRoundedSystemFont(10); t.textColor=color; }

  arrColor(){ /* 随机渐变色对（原表） */ return this.getRandomArrayElements([
    ["#FFF000","#E62490"],["#ABDCFF","#0396FF"],["#FEB692","#EA5455"],["#CE9FFC","#7367F0"],["#90F7EC","#32CCBC"],["#FFF6B7","#F6416C"],
    ["#E2B0FF","#9F44D3"],["#F97794","#F072B6"],["#FCCF31","#F55555"],["#5EFCE8","#736EFE"],["#FAD7A1","#E96D71"],["#FFFF1C","#00C3FF"],
    ["#FEC163","#DE4313"],["#F6CEEC","#D939CD"],["#FDD819","#E80505"],["#FFF3B0","#CA26FF"],["#EECDA3","#EF629F"],["#C2E59C","#64B3F4"],
    ["#FFF886","#F072B6"],["#F5CBFF","#C346C2"],["#FFF720","#3CD500"],["#FFC371","#FF5F6D"],["#FFD3A5","#FD6585"],["#C2FFD8","#465EFB"],
    ["#FFC600","#FD6E6A"],["#92FE9D","#00C9FF"],["#FFDDE1","#EE9CA7"],["#F0FF00","#58CFFB"],["#FFE985","#FA742B"],["#72EDF2","#5151E5"],
    ["#F6D242","#FF52E5"],["#F9D423","#FF4E50"],["#00EAFF","#3C8CE7"],["#FCFF00","#FFA8A8"],["#FF96F9","#C32BAC"],["#FFDD94","#FA897B"],
    ["#FFCC4B","#FF7D58"],["#D0E6A5","#86E3CE"],["#F0D5B6","#F16238"],["#C4E86B","#00BCB4"],["#FFC446","#FA0874"],["#E1EE32","#FFB547"],
    ["#E9A6D2","#E9037B"],["#F8EC70","#49E2F6"],["#A2F8CD","#00C3FF"],["#FDEFE2","#FE214F"],["#FFB7D1","#E4B7FF"],["#E8E965","#64C5C7"]
  ], 1)[0]; }
  getIconColorSet(){ return this.getRandomArrayElements([
    ["#1E81B0","#FF5714","#FF6347"],["#FF6347","#32CD32","#3CB371"],["#FF8C00","#4682B4","#20B2AA"],["#FF4500","#00CED1","#00BFFF"],
    ["#DB7093","#3CB371","#FFA07A"],["#FF7F50","#4CAF50","#1E90FF"],["#FF4500","#3CB371","#FFA07A"],["#FF7F50","#00A9A5","#C41E3A"],
    ["#2E8B57","#FF6347","#00BFFF"],["#FF4500","#008B8B","#3CB371"],["#DC143C","#00BFFF","#F08080"],["#20B2AA","#FF8C00","#32CD32"],
    ["#FF4500","#66E579","#00CED1"],["#DA70D6","#5DB8E8","#FF6347"],["#32CD32","#F86527","#00CED1"],["#FF6347","#00FA9A","#20B2AA"],
    ["#FA8072","#4682B4","#3CB371"],["#5856CF","#FF4500","#00BFFF"],["#FF8C00","#20B2AA","#5856CF"],["#704CE4","#20B2AA","#FF8F8F"],
    ["#73DE00","#48D1CC","#FF6347"],["#DB7093","#6495ED","#FA8072"],["#FFA07A","#32CD32","#1E90FF"],["#00A9A5","#FF4500","#4682B4"],
    ["#13C07E","#00BCD4","#FF6347"],["#8BC34A","#FF5722","#3F51B5"],["#4CAF50","#00BCD4","#F44336"],["#3F51B5","#009688","#FF5722"],
    ["#B170FF","#03A9F4","#3CB371"],["#009688","#8BC34A","#FF6347"],["#F44336","#00BCD4","#3CB371"],["#FF4500","#32CD32","#3CB371"],
    ["#3CB371","#FF9800","#009688"],["#FF5722","#8BC34A","#38B1B7"],["#03A9F4","#3CB371","#FF788B"],["#FF5722","#03A9F4","#DB7093"],
    ["#1E90FF","#38B1B7","#CD5C5C"],["#FF6347","#48D1CC","#32CD32"],["#FF4500","#73DE00","#4682B4"],["#FF5722","#8BC34A","#00CED1"],
    ["#FF4500","#32CD32","#4682B4"],["#8BC34A","#F08080","#00BFFF"],["#FF6F61","#40E0D0","#1E90FF"],["#00CED1","#FF6347","#4682B4"],
    ["#E57373","#4DD0E1","#81C784"],["#FF5722","#8BC34A","#FFD700"],["#F08080","#48D1CC","#32CD32"]
  ], 1)[0]; }

  gradientColor(pair, steps){
    const a = this.colorToRgb(pair[0]); const b = this.colorToRgb(pair[1]);
    const dr=(b[0]-a[0])/steps, dg=(b[1]-a[1])/steps, db=(b[2]-a[2])/steps;
    const out=[]; for(let i=0;i<steps;i++){ out.push(this.colorToHex(`rgb(${parseInt(dr*i+a[0])},${parseInt(dg*i+a[1])},${parseInt(db*i+a[2])})`)); }
    return out;
  }
  colorToRgb(hex){
    let t = hex.toLowerCase();
    if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)){
      if (t.length===4){ t = "#"+[1,2,3].map(i=>t.slice(i,i+1)+t.slice(i,i+1)).join(""); }
      const arr=[]; for(let i=1;i<7;i+=2) arr.push(parseInt("0x"+t.slice(i,i+2)));
      return arr;
    }
    return t;
  }
  colorToHex(rgb){
    let e = rgb;
    if (/^(rgb|RGB)/.test(e)){
      const a = e.replace(/(?:\(|\)|rgb|RGB)*/g,"").split(",");
      let n="#"; for (let i=0;i<a.length;i++){ let h = Number(a[i]).toString(16); if (h.length<2) h="0"+h; n+=h; }
      return n.length===7 ? n : e;
    }
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(e)) return e;
    const s = e.replace(/#/,"").split("");
    if (s.length===6) return e;
    if (s.length===3){ return "#"+s.map(x=>x+x).join(""); }
  }

  getWidgetScaleFactor(){
    const t = Device.screenSize().width, e = Device.screenSize().height;
    const table=[{width:440,height:956,widgetSize:170},{width:430,height:932,widgetSize:170},{width:428,height:926,widgetSize:170},{width:414,height:896,widgetSize:169},{width:414,height:736,widgetSize:159},{width:393,height:852,widgetSize:158},{width:390,height:844,widgetSize:158},{width:375,height:812,widgetSize:155},{width:375,height:667,widgetSize:148},{width:360,height:780,widgetSize:155},{width:320,height:568,widgetSize:141}];
    const hit = table.find(i => (i.width===t && i.height===e) || (i.width===e && i.height===t));
    if (!hit) return 1;
    const n = hit.widgetSize/170; return Math.floor(100*n)/100;
  }

  // ========== 颜色/尺寸配置页（通用） ==========
  setColorConfig = async () => this.renderAppView([
    { title:"颜色设置", menu: [{ url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/gradient.png", type:"switch", title:"渐变进度条", val:"gradient" }]},
    { menu: [
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step1.png", type:"color", title:"流量进度条", defaultValue:"#FF6620", val:"step1" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step2.png", type:"color", title:"语音进度条", defaultValue:"#78C100", val:"step2" },
    ]},
    { title:"颜色设置", menu:[ { url:"https://pic1.imgdb.cn/item/63315c1e16f2c2beb1a27363.png", type:"switch", title:"内置图标颜色", val:"builtInColor" } ] },
    { menu: [
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/logoColor.png", type:"color", title:"LOGO图标颜色", defaultValue:"#0C54D9", val:"logoColor" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png", type:"color", title:"流量图标颜色", defaultValue:"#FF6620", val:"flowIconColor" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/voiceIconColor.png", type:"color", title:"语音图标颜色", defaultValue:"#78C100", val:"voiceIconColor" },
    ]},
    { title:"重置颜色", menu:[
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/clear.png", title:"重置颜色", name:"reset", onClick:()=>{
        ["gradient","step1","step2","logoColor","flowIconColor","voiceIconColor","builtInColor"].forEach(k=>{ delete this.settings[k]; });
        this.saveSettings(); this.reopenScript();
      }}
    ]}
  ]);

  setSizeConfig = async () => this.renderAppView([
    { title:"尺寸设置", menu:[{ url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/SCALE.png", type:"input", title:"小组件缩放比例", placeholder:"1", val:"SCALE" }]},
    { menu:[
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/ringStackSize.png", type:"input", title:"圆环大小", placeholder:"65", val:"ringStackSize" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/ringTextSize.png", type:"input", title:"圆环中心文字大小", placeholder:"14", val:"ringTextSize" },
    ]},
    { menu:[
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/feeTextSize.png", type:"input", title:"话费文字大小", placeholder:"21", val:"feeTextSize" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/textSize.png", type:"input", title:"文字模式下文字大小", placeholder:"13", val:"textSize" },
    ]},
    { menu:[
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/smallPadding.png", type:"input", title:"小尺寸组件边距", placeholder:"12", val:"smallPadding" },
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/padding.png", type:"input", title:"中尺寸组件边距", placeholder:"10", val:"padding" },
    ]},
    { title:"重置尺寸", menu:[
      { url:"https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/clear.png", title:"重置尺寸", name:"reset", onClick:()=>{
        ["SCALE","ringStackSize","ringTextSize","feeTextSize","textSize","smallPadding","padding"].forEach(k=>{ delete this.settings[k]; });
        this.saveSettings(); this.reopenScript();
      }}
    ]}
  ]);

  // ========== 组件基础背景 ==========
  async applyWidgetBackground(widget){
    const ok = await this.getWidgetBackgroundImage(widget);
    if (!ok) widget.backgroundColor = this.backGroundColor;
    return ok;
  }

  // ========== 自更新（可被子类调用） ==========
  async checkAndUpdateScript({ scriptName, manifestUrl, matchName, downloadUrl }){
    const file = `${scriptName}.js`;
    const req = new Request(manifestUrl);
    const list = await req.loadJSON();
    const item = list.find(x => x.name === matchName);
    const latest = item?.version; const url = item?.downloadUrl || downloadUrl;
    if (!latest) return;
    if (this.version !== latest){
      const a=new Alert(); a.title="检测到新版本"; a.message=`新版本：${latest}，是否更新？`; a.addAction("更新"); a.addCancelAction("取消");
      if (0 === await a.presentAlert()){
        const code = await new Request(url).loadString();
        const fm = this.FILE_MGR; const p = fm.documentsDirectory()+`/${file}`;
        fm.writeString(p, code);
        const ok=new Alert(); ok.title="更新成功"; ok.message="脚本已更新，请关闭后重新打开！"; ok.addAction("确定"); await ok.present(); this.reopenScript();
      }
    } else {
      const ok=new Alert(); ok.title="无需更新"; ok.message="当前已是最新版本。"; ok.addAction("确定"); await ok.present();
    }
  }
}

// —— 小扩展：iCloud 文件存在性确保 —— //
BaseWidget.prototype.FILE_MGR.fileExistsExtra = async function(path){
  const exists = this.fileExists(path); if (exists) await this.downloadFileFromiCloud(path); return exists;
};

module.exports = { BaseWidget };
