/*
 * @author: 2Ya&脑瓜&ByteValley
 * @feedback https://t.me/Scriptable_CN
 * telegram: @anker1209
 * version: 2.3.1
 * update: 2024/12/06
 * 原创UI，修改套用请注明来源
 * 电信cookie重写：https://raw.githubusercontent.com/dompling/Script/master/10000/index.js
*/

if (typeof require === 'undefined') require = importModule;
const { DmYY, Runing } = require('./DmYY');

class Widget extends DmYY {
  constructor(arg) {
    super(arg);
    this.name = "中国电信";
    this.en = "ChinaTelecom_2024";
    this.logo = "https://raw.githubusercontent.com/anker1209/icon/main/zgdx-big.png";
    this.smallLogo = "https://raw.githubusercontent.com/anker1209/icon/main/zgdx.png";
    this.Run();
  }

  version = '2.3.1';

  // ====== 调试日志相关 ======
  debug = false;
  dts() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  dlog(...args) {
    if (!this.debug) return;
    try {
      const safe = args.map((a) => {
        if (typeof a === 'object') return JSON.stringify(a, null, 2);
        return String(a);
      }).join(' ');
      console.log(`[CT DEBUG ${this.dts()}] ${safe}`);
    } catch (e) {
      console.log(`[CT DEBUG ${this.dts()}] <log error> ${e}`);
    }
  }
  // ====== /调试日志相关 ======

  gradient = false;

  flowColorHex = "#FF6620";
  voiceColorHex = "#78C100";

  ringStackSize = 65;
  ringTextSize = 14;
  feeTextSize = 21;
  textSize = 13;
  smallPadding = 12;
  padding = 10;
  logoScale = 0.24;
  SCALE = 1;

  canvSize = 178;
  canvWidth = 18;
  canvRadius = 80;

  widgetStyle = '1';

  format = (str) => {
    return parseInt(str) >= 10 ? str : `0${str}`;
  };

  date = new Date();
  arrUpdateTime = [
    this.format(this.date.getMonth() + 1),
    this.format(this.date.getDate()),
    this.format(this.date.getHours()),
    this.format(this.date.getMinutes()),
  ];

  fee = {
    title: "剩余话费",
    icon: 'antenna.radiowaves.left.and.right',
    number: '0',
    iconColor: new Color('#0C54D9'),
    unit: "元",
    en: "¥",
  };

  flow = {
    percent: 0,
    max: 40,
    title: "剩余流量",
    number: '0',
    unit: "MB",
    en: "MB",
    icon: "antenna.radiowaves.left.and.right",
    iconColor: new Color("#FF6620"),
    FGColor: new Color(this.flowColorHex),
    BGColor: new Color(this.flowColorHex, 0.2),
    colors: [],
  };

  voice = {
    percent: 0,
    title: "剩余语音",
    number: '0',
    unit: "分钟",
    en: "MIN",
    icon: 'phone.badge.waveform.fill',
    iconColor: new Color("#78C100"),
    FGColor: new Color(this.voiceColorHex),
    BGColor: new Color(this.voiceColorHex, 0.2),
    colors: [],
  };

  point = {
    title: "更新时间",
    number: `${this.arrUpdateTime[2]}:${this.arrUpdateTime[3]}`,
    unit: "",
    icon: "arrow.2.circlepath",
    iconColor: new Color("fc6d6d"),
  };

  fetchUrl = {
    login: "https://e.dlife.cn/index.do",
    detail: "https://e.dlife.cn/user/package_detail.do",
    balance: "https://e.dlife.cn/user/balance.do",
    bill: "https://e.dlife.cn/user/bill.do",
  };

  init = async () => {
    try {
      // 读取日志开关
      this.debug = this.settings.debug === 'true';

      const scale = this.getWidgetScaleFactor();
      this.SCALE = this.settings.SCALE || scale;

      const {
        step1,
        step2,
        logoColor,
        flowIconColor,
        voiceIconColor,
        gradient,
        widgetStyle,
        builtInColor,
      } = this.settings;

      this.gradient = gradient === 'true';

      // 设置图标颜色
      if (builtInColor === 'true') {
        const [feeColor, flowColor, voiceColor] = this.getIconColorSet();
        this.fee.iconColor = new Color(feeColor);
        this.flow.iconColor = new Color(flowColor);
        this.voice.iconColor = new Color(voiceColor);
      } else {
        this.fee.iconColor = logoColor ? new Color(logoColor) : this.fee.iconColor;
        this.flow.iconColor = flowIconColor ? new Color(flowIconColor) : this.flow.iconColor;
        this.voice.iconColor = voiceIconColor ? new Color(voiceIconColor) : this.voice.iconColor;
      }

      // 设置流量与语音圆环的颜色
      this.flowColorHex = step1 || this.flowColorHex;
      this.voiceColorHex = step2 || this.voiceColorHex;
      this.flow.BGColor = new Color(this.flowColorHex, 0.2);
      this.voice.BGColor = new Color(this.voiceColorHex, 0.2);
      this.flow.FGColor = new Color(this.flowColorHex);
      this.voice.FGColor = new Color(this.voiceColorHex);

      // 设置小组件的样式
      this.widgetStyle = widgetStyle || this.widgetStyle;

      // 尺寸与缩放
      const sizeSettings = [
        'ringStackSize',
        'ringTextSize',
        'feeTextSize',
        'textSize',
        'smallPadding',
        'padding',
      ];

      for (const key of sizeSettings) {
        this[key] = this.settings[key] ? parseFloat(this.settings[key]) : this[key];
        this[key] = this[key] * this.SCALE;
      }

      // 圆环渐变效果颜色属性
      if (this.gradient) {
        this.flow.colors = this.arrColor();
        this.voice.colors = this.arrColor();
        this.flow.BGColor = new Color(this.flow.colors[1], 0.2);
        this.voice.BGColor = new Color(this.voice.colors[1], 0.2);
        this.flow.FGColor = this.gradientColor(this.flow.colors, 360);
        this.voice.FGColor = this.gradientColor(this.voice.colors, 360);
        this.flowColorHex = this.flow.colors[1];
        this.voiceColorHex = this.voice.colors[1];
      }

      this.dlog('Init settings:', this.settings);
      this.dlog('Device SCALE:', { SCALE: this.SCALE, widgetStyle: this.widgetStyle, gradient: this.gradient });
    } catch (e) {
      console.error(e);
      this.dlog('Init error:', e);
    }

    if (!this.settings.dataSource) {
      await this.getData();
    } else {
      Object.keys(this.settings.dataSource).forEach((key) => {
        this[key] = { ...this[key], ...this.settings.dataSource[key] };
      });
      this.getData();
    }
  };

  formatFlow = (flow) => {
    const remain = flow / 1024;
    if (remain < 1024) {
      return { amount: remain.toFixed(2), unit: 'MB' };
    }
    return { amount: (remain / 1024).toFixed(2), unit: 'GB' };
  };

  // 改良版 Cookie 获取，带详细日志
  updateCookie = async (loginUrl) => {
    try {
      if (!loginUrl) {
        this.dlog('[updateCookie] loginUrl is empty');
        return;
      }
      const q = decodeURIComponent(loginUrl);
      const qMatch = q.match(/[?&]loginUrl=([^&]+)/);
      const url = qMatch?.[1] ? decodeURIComponent(qMatch[1]) : (q.match(/(https?:\/\/.+?)&sign=/)?.[1] || loginUrl);

      this.dlog('[updateCookie] parsed login url =', url);

      const req = new Request(url);
      // 允许跳转以拿到最终 Set-Cookie
      req.allowInsecureRequest = false;
      req.redirect = 'follow';
      await req.load();
      const headers = (req.response && req.response.headers) || {};
      const status = (req.response && req.response.statusCode) || 'N/A';
      const cookie = headers['Set-Cookie'] || headers['set-cookie'];

      this.dlog('[updateCookie] status =', status);
      this.dlog('[updateCookie] response headers keys =', Object.keys(headers || {}));
      this.dlog('[updateCookie] Set-Cookie =', cookie || '<empty>');

      if (cookie) {
        this.settings.cookie = cookie;
        this.saveSettings(false);
        this.dlog('[updateCookie] cookie saved');
      } else {
        this.dlog('[updateCookie] no cookie found in response headers');
      }
    } catch (e) {
      console.log('[updateCookie] ' + e);
      this.dlog('[updateCookie] error:', e);
    }
  };

  getData = async () => {
    try {
      if (!this.settings.china_telecom_url) {
        this.dlog('[getData] china_telecom_url not configured');
        return this.notify(this.name, "请配置登录地址");
      }

      this.dlog('[getData] start, china_telecom_url =', this.settings.china_telecom_url);
      await this.updateCookie(this.settings.china_telecom_url);
      this.dlog('[getData] cookie used =', (this.settings.cookie || '').split(';')[0] || '<empty>');

      // 明细接口
      const response = await this.http({
        url: this.fetchUrl.detail,
        headers: {
          Cookie: this.settings.cookie,
        },
      });

      this.dlog('[detail] raw response =', response);

      const { filterOrientateFlow, showUsedFlow } = this.settings;

      // 总流量
      let totalFlowAmount = 0;
      // 剩余流量
      let totalBalanceFlowAmount = 0;
      // 已用流量
      let totalUsedFlowAmount = 0;
      // 总语音
      let totalVoiceAmount = 0;
      // 剩余语音
      let totalBalanceVoiceAmount = 0;

      // 语音（部分省份直接在根上给 voiceAmount/voiceBalance）
      if (response?.voiceAmount && response?.voiceBalance) {
        totalVoiceAmount = Number(response.voiceAmount) || 0;
        totalBalanceVoiceAmount = Number(response.voiceBalance) || 0;
      }

      let isUnlimitedFlow = false;

      response?.items?.forEach((data) => {
        if (data.offerType !== 19) {
          data.items?.forEach((item) => {
            if (item.unitTypeId == 3) {
              // 流量
              if (!(item.usageAmount == 0 && item.balanceAmount == 0)) {
                let ratableResourcename = item.ratableResourcename;
                let ratableAmount = Number(item.ratableAmount) || 0;
                let balanceAmount = Number(item.balanceAmount) || 0;

                // 过滤定向/无上限占位
                if ((filterOrientateFlow === 'true' && String(ratableResourcename).includes('定向')) || balanceAmount == 999999999999) {
                  ratableAmount = 0;
                  balanceAmount = 0;
                }

                totalFlowAmount += ratableAmount;
                totalBalanceFlowAmount += balanceAmount;
              }
              totalUsedFlowAmount += Number(item.usageAmount) || 0;

              if (showUsedFlow === 'true') {
                this.flow.title = '已用流量';
              }

              if (data.offerType == 21 && Number(item.ratableAmount) == 0) {
                // 无限流量用户
                isUnlimitedFlow = true;
              }
            } else if (!response.voiceBalance && item.unitTypeId == 1) {
              // 语音
              totalVoiceAmount += parseInt(item.ratableAmount) || 0;
              totalBalanceVoiceAmount += parseInt(item.balanceAmount) || 0;
            }
          });
        }
      });

      const totalFlowObj = this.formatFlow(totalFlowAmount);
      const totalBalanceFlowObj = this.formatFlow(totalBalanceFlowAmount);
      const totalUsedFlowObj = this.formatFlow(totalUsedFlowAmount);
      const finalBalanceFlowObj = (this.settings.showUsedFlow === 'true') ? totalUsedFlowObj : totalBalanceFlowObj;
      this.flow.title = (this.settings.showUsedFlow === 'true') ? '已用流量' : '剩余流量';

      // 设置流量
      this.flow.percent = ((totalBalanceFlowAmount / (totalFlowAmount || 1)) * 100).toFixed(2);
      this.flow.number = finalBalanceFlowObj.amount;
      this.flow.unit = finalBalanceFlowObj.unit;
      this.flow.en = finalBalanceFlowObj.unit;

      if (isUnlimitedFlow) {
        const usageAmountObj = this.formatFlow(totalUsedFlowAmount);
        this.flow.title = '已用流量';
        this.flow.number = usageAmountObj.amount;
        this.flow.unit = usageAmountObj.unit;
        this.flow.en = usageAmountObj.unit;
      }

      // 设置语音
      this.voice.percent = ((totalBalanceVoiceAmount / (totalVoiceAmount || 1)) * 100).toFixed(2);
      this.voice.number = totalBalanceVoiceAmount;

      this.dlog('[calc] flow(total/balance/used)=', { totalFlowAmount, totalBalanceFlowAmount, totalUsedFlowAmount, percent: this.flow.percent, showUsed: this.settings.showUsedFlow });
      this.dlog('[calc] voice(total/balance)=', { totalVoiceAmount, totalBalanceVoiceAmount, percent: this.voice.percent });
      this.dlog('[calc] display flow=', { title: this.flow.title, number: this.flow.number, unit: this.flow.unit });

      // 余额接口
      const balance = await this.http({
        url: this.fetchUrl.balance,
        headers: {
          Cookie: this.settings.cookie,
        },
      });

      this.dlog('[balance] raw response =', balance);

      // 有些接口返回 { data: { totalBalanceAvailable } } / 也可能直接 { totalBalanceAvailable }
      const totalBalance = (balance && (balance.totalBalanceAvailable ?? (balance.data && balance.data.totalBalanceAvailable))) ?? 0;

      // 分转元
      this.fee.number = (Number(totalBalance) || 0) / 100;

      this.dlog('[balance] parsed =', { totalBalance, feeYuan: this.fee.number });

      // 写入数据源缓存
      this.settings.dataSource = {
        fee: { number: this.fee.number },
        voice: { number: this.voice.number, percent: this.voice.percent },
        flow: {
          en: this.flow.en,
          number: this.flow.number,
          unit: this.flow.unit,
          percent: this.flow.percent,
          title: this.flow.title,
        },
      };
      this.saveSettings(false);
      this.dlog('[getData] dataSource saved');
    } catch (e) {
      console.error(e);
      this.dlog('[getData] error:', e);
      await this.notify(this.name, `获取数据失败：${e && e.message ? e.message : e}`);
    }
  };

  async header(stack) {
    const headerStack = stack.addStack();
    headerStack.addSpacer();
    const logo = headerStack.addImage(await this.$request.get(this.logo, 'IMG'));
    logo.imageSize = new Size(415 * this.logoScale * this.SCALE, 125 * this.logoScale * this.SCALE);
    headerStack.addSpacer();
    stack.addSpacer();

    const feeStack = stack.addStack();
    feeStack.centerAlignContent();
    feeStack.addSpacer();
    const feeValue = feeStack.addText(`${this.fee.number}`);
    this.unit(feeStack, '元', 5 * this.SCALE, this.widgetColor);
    feeValue.font = Font.mediumRoundedSystemFont(this.feeTextSize);
    feeValue.textColor = this.widgetColor;
    feeStack.addSpacer();
    stack.addSpacer();
  };

  textLayout(stack, data) {
    const rowStack = stack.addStack();
    rowStack.centerAlignContent();
    const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill');
    icon.applyHeavyWeight();
    let iconElement = rowStack.addImage(icon.image);
    iconElement.imageSize = new Size(this.textSize, this.textSize);
    iconElement.tintColor = data.iconColor;
    rowStack.addSpacer(4 * this.SCALE);
    let title = rowStack.addText(data.title);
    rowStack.addSpacer();
    let number = rowStack.addText(data.number + data.unit);
    [title, number].map(t => t.textColor = this.widgetColor);
    [title, number].map(t => t.font = Font.systemFont(this.textSize * this.SCALE));
  };

  async setThirdWidget(widget) {
    const amountStack = widget.addStack();
    amountStack.centerAlignContent();

    const icon = await this.$request.get(this.smallLogo, 'IMG');

    if (this.settings.builtInColor === 'true') {
      const iconStack = amountStack.addStack();
      iconStack.setPadding(4 * this.SCALE, 4 * this.SCALE, 4 * this.SCALE, 4 * this.SCALE);
      iconStack.backgroundColor = this.fee.iconColor;
      iconStack.cornerRadius = 12 * this.SCALE;
      const iconImage = iconStack.addImage(icon);
      iconImage.imageSize = new Size(16 * this.SCALE, 16 * this.SCALE);
      iconImage.tintColor = Color.white();
    } else {
      const iconImage = amountStack.addImage(icon);
      iconImage.imageSize = new Size(24 * this.SCALE, 24 * this.SCALE);
    }

    amountStack.addSpacer();

    const amountText = amountStack.addText(`${this.fee.number}`);
    amountText.font = Font.boldRoundedSystemFont(24 * this.SCALE);
    amountText.minimumScaleFactor = 0.5;
    amountText.textColor = this.widgetColor;
    this.unit(amountStack, '元', 7 * this.SCALE);

    widget.addSpacer();

    const mainStack = widget.addStack();
    this.setRow(mainStack, this.flow, this.flowColorHex);
    mainStack.addSpacer();
    this.setRow(mainStack, this.voice, this.voiceColorHex);
  };

  async setForthWidget(widget) {
    const bodyStack = widget.addStack();
    bodyStack.cornerRadius = 14 * this.SCALE;
    bodyStack.layoutVertically();
    const headerStack = bodyStack.addStack();
    headerStack.setPadding(8 * this.SCALE, 12 * this.SCALE, 0, 12 * this.SCALE);
    headerStack.layoutVertically();
    const title = headerStack.addText(this.fee.title);
    title.font = Font.systemFont(12 * this.SCALE);
    title.textColor = this.widgetColor
    title.textOpacity = 0.7;
    const balanceStack = headerStack.addStack();
    const balanceText = balanceStack.addText(`${this.fee.number}`);
    balanceText.minimumScaleFactor = 0.5;
    balanceText.font = Font.boldRoundedSystemFont(22 * this.SCALE);
    const color = this.widgetColor;
    balanceText.textColor = color;
    this.unit(balanceStack, '元', 5 * this.SCALE, color);
    balanceStack.addSpacer();
    balanceStack.centerAlignContent();

    const icon = await this.$request.get(this.smallLogo, 'IMG');

    if (this.settings.builtInColor === 'true') {
      const iconStack = balanceStack.addStack();
      iconStack.setPadding(4 * this.SCALE, 4 * this.SCALE, 4 * this.SCALE, 4 * this.SCALE);
      iconStack.backgroundColor = this.fee.iconColor;
      iconStack.cornerRadius = 12 * this.SCALE;
      const iconImage = iconStack.addImage(icon);
      iconImage.imageSize = new Size(16 * this.SCALE, 16 * this.SCALE);
      iconImage.tintColor = Color.white();
    } else {
      const iconImage = balanceStack.addImage(icon);
      iconImage.imageSize = new Size(24 * this.SCALE, 24 * this.SCALE);
    }

    bodyStack.addSpacer();
    const mainStack = bodyStack.addStack();
    mainStack.setPadding(8 * this.SCALE, 12 * this.SCALE, 8 * this.SCALE, 12 * this.SCALE);
    mainStack.cornerRadius = 14 * this.SCALE;
    mainStack.backgroundColor = Color.dynamic(new Color("#E2E2E7", 0.3), new Color("#2C2C2F", 1));
    mainStack.layoutVertically();

    this.setList(mainStack, this.flow);
    mainStack.addSpacer();
    this.setList(mainStack, this.voice);
  };

  setList(stack, data) {
    const rowStack = stack.addStack();
    rowStack.centerAlignContent();
    const lineStack = rowStack.addStack();
    lineStack.size = new Size(8 * this.SCALE, 30 * this.SCALE);
    lineStack.cornerRadius = 4 * this.SCALE;

    lineStack.backgroundColor = data.iconColor;

    rowStack.addSpacer(10 * this.SCALE);

    const leftStack = rowStack.addStack();
    leftStack.layoutVertically();
    leftStack.addSpacer(2 * this.SCALE);

    const titleStack = leftStack.addStack();
    const title = titleStack.addText(data.title);
    title.font = Font.systemFont(10 * this.SCALE);
    title.textColor = this.widgetColor;
    title.textOpacity = 0.5;

    const valueStack = leftStack.addStack();
    valueStack.centerAlignContent();
    const value = valueStack.addText(`${data.number}`);
    value.font = Font.semiboldRoundedSystemFont(16 * this.SCALE);
    value.textColor = this.widgetColor;
    valueStack.addSpacer();

    const unitStack = valueStack.addStack();
    unitStack.cornerRadius = 4 * this.SCALE;
    unitStack.borderWidth = 1;
    unitStack.borderColor = data.iconColor;
    unitStack.setPadding(1, 3 * this.SCALE, 1, 3 * this.SCALE);
    unitStack.size = new Size(30 * this.SCALE, 0)
    unitStack.backgroundColor = Color.dynamic(data.iconColor, new Color(data.iconColor.hex, 0.3));
    const unit = unitStack.addText(data.en);
    unit.font = Font.mediumRoundedSystemFont(10 * this.SCALE);
    unit.textColor = Color.dynamic(Color.white(), data.iconColor);
  };

  setRow(stack, data, color) {
    const stackWidth = 68 * this.SCALE;
    const rowStack = stack.addStack();
    rowStack.layoutVertically();
    rowStack.size = new Size(stackWidth, 0);
    const image = this.gaugeChart(data, color);
    const imageStack = rowStack.addStack();
    imageStack.layoutVertically();
    imageStack.size = new Size(stackWidth, stackWidth);
    imageStack.backgroundImage = image;
    imageStack.addSpacer();
    const iconStack = imageStack.addStack();
    iconStack.addSpacer();
    const sfs = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill');
    sfs.applyHeavyWeight();
    const icon = iconStack.addImage(sfs.image);
    icon.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE);
    icon.tintColor = new Color(color);
    iconStack.addSpacer();
    imageStack.addSpacer(8 * this.SCALE);
    const unitStack = imageStack.addStack();
    unitStack.addSpacer();
    const innerStack = unitStack.addStack();
    innerStack.size = new Size(32 * this.SCALE, 0);
    innerStack.setPadding(1, 1, 1, 1);
    innerStack.backgroundColor = new Color(color);
    innerStack.cornerRadius = 4 * this.SCALE;
    const unit = innerStack.addText(data.en);
    unit.font = Font.semiboldRoundedSystemFont(10 * this.SCALE);
    unit.textColor = Color.white();
    unitStack.addSpacer();
    imageStack.addSpacer(4 * this.SCALE);

    const infoStack = rowStack.addStack();
    infoStack.cornerRadius = 12 * this.SCALE;
    infoStack.layoutVertically();
    let gradient = new LinearGradient();
    gradient.colors = [new Color(color, 0.1), new Color(color, 0.01)];
    gradient.locations = [0, 1];
    gradient.startPoint = new Point(0, 0);
    gradient.endPoint = new Point(0, 1);
    infoStack.backgroundGradient = gradient;

    const valueStack = infoStack.addStack();
    valueStack.size = new Size(stackWidth, 0);
    valueStack.setPadding(3 * this.SCALE, 0, 2 * this.SCALE, 0)
    const value = valueStack.addText(`${data.number}`);
    value.textColor = this.widgetColor;
    value.font = Font.semiboldRoundedSystemFont(18 * this.SCALE);
    value.centerAlignText();

    const titleStack = infoStack.addStack();
    titleStack.addSpacer();
    const title = titleStack.addText(data.title);
    title.font = Font.regularRoundedSystemFont(9 * this.SCALE);
    title.textOpacity = 0.5;
    titleStack.addSpacer();
  };

  async small(stack, data, logo = false, en = false) {
    const bg = new LinearGradient();
    bg.locations = [0, 1];
    bg.endPoint = new Point(1, 0)
    bg.colors = [
      new Color(data.iconColor.hex, 0.1),
      new Color(data.iconColor.hex, 0.03)
    ];
    const rowStack = stack.addStack();
    rowStack.centerAlignContent();
    rowStack.setPadding(5, 8, 5, 8)
    rowStack.backgroundGradient = bg;
    rowStack.cornerRadius = 12;
    const leftStack = rowStack.addStack();
    leftStack.layoutVertically();
    const titleStack = leftStack.addStack();
    const title = titleStack.addText(data.title);
    const balanceStack = leftStack.addStack();
    balanceStack.centerAlignContent();
    const balanceUnit = en ? data.en : ''
    const balance = balanceStack.addText(`${data.number} ${balanceUnit}`);
    if (!en) this.addChineseUnit(balanceStack, data.unit, data.iconColor, 13 * this.SCALE);
    balance.font = Font.semiboldRoundedSystemFont(16 * this.SCALE);
    title.textOpacity = 0.5;
    title.font = Font.mediumSystemFont(11 * this.SCALE);
    [title, balance].map(t => t.textColor = data.iconColor);
    rowStack.addSpacer();
    let iconImage;
    if (logo) {
      const icon = await this.$request.get(this.smallLogo, 'IMG');
      iconImage = rowStack.addImage(icon);
    } else {
      const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill');
      icon.applyHeavyWeight();
      iconImage = rowStack.addImage(icon.image);
    };
    iconImage.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE);
    iconImage.tintColor = data.iconColor;
  };

  async smallCell(stack, data, logo = false, en = false) {
    const bg = new LinearGradient();
    const padding = 6 * this.SCALE;
    bg.locations = [0, 1];
    bg.endPoint = new Point(1, 0)
    bg.colors = [
      new Color(data.iconColor.hex, 0.03),
      new Color(data.iconColor.hex, 0.1)
    ];
    const rowStack = stack.addStack();
    rowStack.setPadding(4, 4, 4, 4)
    rowStack.backgroundGradient = bg;
    rowStack.cornerRadius = 12;
    const iconStack = rowStack.addStack();
    iconStack.backgroundColor = data.iconColor;
    iconStack.setPadding(padding, padding, padding, padding);
    iconStack.cornerRadius = 17 * this.SCALE;
    let iconImage;
    if (logo) {
      const icon = await this.$request.get(this.smallLogo, 'IMG');
      iconImage = iconStack.addImage(icon);
    } else {
      const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill');
      icon.applyHeavyWeight();
      iconImage = iconStack.addImage(icon.image);
    };
    iconImage.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE);
    iconImage.tintColor = new Color('FFFFFF');
    rowStack.addSpacer(15);
    const rightStack = rowStack.addStack();
    rightStack.layoutVertically();
    const balanceStack = rightStack.addStack();
    balanceStack.centerAlignContent();
    const balanceUnit = en ? data.en : ''
    const balance = balanceStack.addText(`${data.number} ${balanceUnit}`);
    if (!en) this.addChineseUnit(balanceStack, data.unit, data.iconColor, 13 * this.SCALE);
    balance.font = Font.semiboldRoundedSystemFont(16 * this.SCALE);
    const titleStack = rightStack.addStack();
    const title = titleStack.addText(data.title);
    title.centerAlignText();
    rowStack.addSpacer();
    title.textOpacity = 0.5;
    title.font = Font.mediumSystemFont(11 * this.SCALE);
    [title, balance].map(t => t.textColor = data.iconColor);
  };

  async mediumCell(canvas, stack, data, color, fee = false, percent) {
    const bg = new LinearGradient();
    bg.locations = [0, 1];
    bg.colors = [
      new Color(color, 0.03),
      new Color(color, 0.1)
    ];
    const dataStack = stack.addStack();
    dataStack.backgroundGradient = bg;
    dataStack.cornerRadius = 15;
    dataStack.layoutVertically();
    dataStack.addSpacer();

    const topStack = dataStack.addStack();
    topStack.addSpacer();
    await this.imageCell(canvas, topStack, data, fee, percent);
    topStack.addSpacer();

    if (fee) {
      dataStack.addSpacer(5);
      const updateStack = dataStack.addStack();
      updateStack.addSpacer();
      updateStack.centerAlignContent();
      const updataIcon = SFSymbol.named('arrow.2.circlepath');
      updataIcon.applyHeavyWeight();
      const updateImg = updateStack.addImage(updataIcon.image);
      updateImg.tintColor = new Color(color, 0.6);
      updateImg.imageSize = new Size(10, 10);
      updateStack.addSpacer(3);
      const updateText = updateStack.addText(`${this.arrUpdateTime[2]}:${this.arrUpdateTime[3]}`)
      updateText.font = Font.mediumSystemFont(10);
      updateText.textColor = new Color(color, 0.6);
      updateStack.addSpacer();
    }

    dataStack.addSpacer();

    const numberStack = dataStack.addStack();
    numberStack.addSpacer();
    const number = numberStack.addText(`${data.number} ${data.en}`);
    number.font = Font.semiboldSystemFont(15);
    numberStack.addSpacer();

    dataStack.addSpacer(3);

    const titleStack = dataStack.addStack();
    titleStack.addSpacer();
    const title = titleStack.addText(data.title);
    title.font = Font.mediumSystemFont(11);
    title.textOpacity = 0.7;
    titleStack.addSpacer();

    dataStack.addSpacer(15);
    [title, number].map(t => t.textColor = new Color(color));
  }

  async imageCell(canvas, stack, data, fee, percent) {
    const canvaStack = stack.addStack();
    canvaStack.layoutVertically();
    if (!fee) {
      this.drawArc(canvas, data.percent * 3.6, data.FGColor, data.BGColor);
      canvaStack.size = new Size(this.ringStackSize, this.ringStackSize);
      canvaStack.backgroundImage = canvas.getImage();
      this.ringContent(canvaStack, data, percent);
    } else {
      canvaStack.addSpacer(10);
      const smallLogo = await this.$request.get(this.smallLogo, 'IMG');
      const logoStack = canvaStack.addStack();
      logoStack.size = new Size(40, 40);
      logoStack.backgroundImage = smallLogo;
    }
  }

  ringContent(stack, data, percent = false) {
    const rowIcon = stack.addStack();
    rowIcon.addSpacer();
    const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill');
    icon.applyHeavyWeight();
    const iconElement = rowIcon.addImage(icon.image);
    iconElement.tintColor = this.gradient ? new Color(data.colors[1]) : data.FGColor;
    iconElement.imageSize = new Size(12, 12);
    iconElement.imageOpacity = 0.7;
    rowIcon.addSpacer();

    stack.addSpacer(1);

    const rowNumber = stack.addStack();
    rowNumber.addSpacer();
    const number = rowNumber.addText(percent ? `${data.percent}` : `${data.number}`);
    number.font = percent ? Font.systemFont(this.ringTextSize - 2) : Font.mediumSystemFont(this.ringTextSize);
    rowNumber.addSpacer();

    const rowUnit = stack.addStack();
    rowUnit.addSpacer();
    const unit = rowUnit.addText(percent ? '%' : data.unit);
    unit.font = Font.boldSystemFont(8);
    unit.textOpacity = 0.5;
    rowUnit.addSpacer();

    if (percent) {
      if (this.gradient) {
        [unit, number].map(t => t.textColor = new Color(data.colors[1]));
      } else {
        [unit, number].map(t => t.textColor = data.FGColor);
      }
    } else {
      [unit, number].map(t => t.textColor = this.widgetColor);
    }
  }

  makeCanvas() {
    const canvas = new DrawContext();
    canvas.opaque = false;
    canvas.respectScreenScale = true;
    canvas.size = new Size(this.canvSize, this.canvSize);
    return canvas;
  }

  sinDeg(deg) {
    return Math.sin((deg * Math.PI) / 180);
  }

  cosDeg(deg) {
    return Math.cos((deg * Math.PI) / 180);
  }

  drawArc(canvas, deg, fillColor, strokeColor) {
    let ctr = new Point(this.canvSize / 2, this.canvSize / 2);
    let bgx = ctr.x - this.canvRadius;
    let bgy = ctr.y - this.canvRadius;
    let bgd = 2 * this.canvRadius;
    let bgr = new Rect(bgx, bgy, bgd, bgd)

    canvas.setStrokeColor(strokeColor);
    canvas.setLineWidth(this.canvWidth);
    canvas.strokeEllipse(bgr);

    for (let t = 0; t < deg; t++) {
      let rect_x = ctr.x + this.canvRadius * this.sinDeg(t) - this.canvWidth / 2;
      let rect_y = ctr.y - this.canvRadius * this.cosDeg(t) - this.canvWidth / 2;
      let rect_r = new Rect(rect_x, rect_y, this.canvWidth, this.canvWidth);
      canvas.setFillColor(this.gradient ? new Color(fillColor[t]) : fillColor);
      canvas.setStrokeColor(strokeColor)
      canvas.fillEllipse(rect_r);
    }
  }

  fillRect(drawing, x, y, width, height, cornerradio, color) {
    let path = new Path();
    let rect = new Rect(x, y, width, height);
    path.addRoundedRect(rect, cornerradio, cornerradio);
    drawing.addPath(path);
    drawing.setFillColor(color);
    drawing.fillPath();
  };

  progressBar(data) {
    const W = 60, H = 9, r = 4.5, h = 3;
    const drawing = this.makeCanvas(W, H);
    const progress = data.percent / 100 * W;
    const circle = progress - 2 * r;
    const fgColor = data.iconColor;
    const bgColor = new Color(data.iconColor.hex, 0.3);
    const pointerColor = data.iconColor;
    this.fillRect(drawing, 0, (H - h) / 2, W, h, h / 2, bgColor);
    this.fillRect(drawing, 0, (H - h) / 2, progress > W ? W : progress < r * 2 ? r * 2 : progress, h, h / 2, fgColor);
    this.fillRect(drawing, circle > W - r * 2 ? W - r * 2 : circle < 0 ? 0 : circle, H / 2 - r, r * 2, r * 2, r, pointerColor);
    return drawing.getImage();
  };

  gaugeChart(data, color) {
    const drawing = this.makeCanvas();
    const center = new Point(this.canvSize / 2, this.canvSize / 2);
    const radius = this.canvSize / 2 - 10;
    const circleRadius = 8;
    const startBgAngle = (10 * Math.PI) / 12;
    const endBgAngle = (26 * Math.PI) / 12;
    const totalBgAngle = endBgAngle - startBgAngle;
    const fillColor = data.BGColor;
    const lineWidth = circleRadius * 2;
    let progress = data.percent / 100;

    this.drawLineArc(drawing, center, radius, startBgAngle, endBgAngle, 1, fillColor, lineWidth);

    this.drawHalfCircle(center.x + radius * Math.cos(startBgAngle), center.y + radius * Math.sin(startBgAngle), startBgAngle, circleRadius, drawing, fillColor, -1);
    this.drawHalfCircle(center.x + radius * Math.cos(endBgAngle), center.y + radius * Math.sin(endBgAngle), endBgAngle, circleRadius, drawing, fillColor, 1);

    for (let i = 0; i < 240 * progress; i++) {
      const t = i / 240;
      const angle = startBgAngle + totalBgAngle * t;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);

      const circleRect = new Rect(x - circleRadius, y - circleRadius, circleRadius * 2, circleRadius * 2);
      drawing.setFillColor(this.gradient ? new Color(data.FGColor[i]) : data.FGColor);
      drawing.fillEllipse(circleRect);
    }
    return drawing.getImage();
  };

  drawHalfCircle(centerX, centerY, startAngle, circleRadius, context, fillColor, direction = 1) {
    const halfCirclePath = new Path();
    const startX = centerX + circleRadius * Math.cos(startAngle);
    const startY = centerY + circleRadius * Math.sin(startAngle);
    halfCirclePath.move(new Point(startX, startY));

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = startAngle + direction * Math.PI * t;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      halfCirclePath.addLine(new Point(x, y));
    }

    context.setFillColor(fillColor);
    context.addPath(halfCirclePath);
    context.fillPath();
  };

  drawLineArc(context, center, radius, startAngle, endAngle, segments, fillColor, lineWidth, dir = 1) {
    const path = new Path();
    const startX = center.x + radius * Math.cos(startAngle);
    const startY = center.y + radius * Math.sin(startAngle);
    path.move(new Point(startX, startY));

    const steps = 100;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + (endAngle - startAngle) * t;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      path.addLine(new Point(x, y));
    }

    context.setStrokeColor(fillColor);
    context.setLineWidth(lineWidth);
    context.addPath(path);
    context.strokePath();
  };

  addChineseUnit(stack, text, color, size) {
    let textElement = stack.addText(text);
    textElement.textColor = color;
    textElement.font = Font.semiboldSystemFont(size);
    return textElement;
  };

  unit(stack, text, spacer, color = this.widgetColor) {
    stack.addSpacer(1);
    const unitStack = stack.addStack();
    unitStack.layoutVertically();
    unitStack.addSpacer(spacer);
    const unitTitle = unitStack.addText(text);
    unitTitle.font = Font.semiboldRoundedSystemFont(10);
    unitTitle.textColor = color;
  };

  arrColor() {
    let colorArr = [
      ["#FFF000", "#E62490"],
      ["#ABDCFF", "#0396FF"],
      ["#FEB692", "#EA5455"],
      ["#FEB692", "#EA5455"],
      ["#CE9FFC", "#7367F0"],
      ["#90F7EC", "#32CCBC"],
      ["#FFF6B7", "#F6416C"],
      ["#E2B0FF", "#9F44D3"],
      ["#F97794", "#F072B6"],
      ["#FCCF31", "#F55555"],
      ["#5EFCE8", "#736EFE"],
      ["#FAD7A1", "#E96D71"],
      ["#FFFF1C", "#00C3FF"],
      ["#FEC163", "#DE4313"],
      ["#F6CEEC", "#D939CD"],
      ["#FDD819", "#E80505"],
      ["#FFF3B0", "#CA26FF"],
      ["#EECDA3", "#EF629F"],
      ["#C2E59C", "#64B3F4"],
      ["#FFF886", "#F072B6"],
      ["#F5CBFF", "#C346C2"],
      ["#FFF720", "#3CD500"],
      ["#FFC371", "#FF5F6D"],
      ["#FFD3A5", "#FD6585"],
      ["#C2FFD8", "#465EFB"],
      ["#FFC600", "#FD6E6A"],
      ["#FFC600", "#FD6E6A"],
      ["#92FE9D", "#00C9FF"],
      ["#FFDDE1", "#EE9CA7"],
      ["#F0FF00", "#58CFFB"],
      ["#FFE985", "#FA742B"],
      ["#72EDF2", "#5151E5"],
      ["#F6D242", "#FF52E5"],
      ["#F9D423", "#FF4E50"],
      ["#00EAFF", "#3C8CE7"],
      ["#FCFF00", "#FFA8A8"],
      ["#FF96F9", "#C32BAC"],
      ["#FFDD94", "#FA897B"],
      ["#FFCC4B", "#FF7D58"],
      ["#D0E6A5", "#86E3CE"],
      ["#F0D5B6", "#F16238"],
      ["#C4E86B", "#00BCB4"],
      ["#FFC446", "#FA0874"],
      ["#E1EE32", "#FFB547"],
      ["#E9A6D2", "#E9037B"],
      ["#F8EC70", "#49E2F6"],
      ["#A2F8CD", "#00C3FF"],
      ["#FDEFE2", "#FE214F"],
      ["#FFB7D1", "#E4B7FF"],
      ["#D0E6A5", "#86E3CE"],
      ["#E8E965", "#64C5C7"]
    ];
    let colors = colorArr[Math.floor(Math.random() * colorArr.length)];
    return colors;
  }

  getIconColorSet() {
    const colors = [
      ["#1E81B0", "#FF5714", "#FF6347"],
      ["#FF6347", "#32CD32", "#3CB371"],
      ["#FF8C00", "#4682B4", "#20B2AA"],
      ["#FF4500", "#00CED1", "#00BFFF"],
      ["#DB7093", "#3CB371", "#FFA07A"],
      ["#FF8C00", "#4682B4", "#20B2AA"],
      ["#FF7F50", "#4CAF50", "#1E90FF"],
      ["#FF4500", "#00CED1", "#1E90FF"],
      ["#FF4500", "#3CB371", "#FFA07A"],
      ["#FF7F50", "#00A9A5", "#C41E3A"],
      ["#2E8B57", "#FF6347", "#00BFFF"],
      ["#FF4500", "#008B8B", "#3CB371"],
      ["#DC143C", "#00BFFF", "#F08080"],
      ["#20B2AA", "#FF8C00", "#32CD32"],
      ["#FF4500", "#66E579", "#00CED1"],
      ["#DA70D6", "#5DB8E8", "#FF6347"],
      ["#32CD32", "#F86527", "#00CED1"],
      ["#FF6347", "#00FA9A", "#20B2AA"],
      ["#FA8072", "#4682B4", "#3CB371"],
      ["#5856CF", "#FF4500", "#00BFFF"],
      ["#FF8C00", "#20B2AA", "#5856CF"],
      ["#704CE4", "#20B2AA", "#FF8F8F"],
      ["#73DE00", "#48D1CC", "#FF6347"],
      ["#DB7093", "#6495ED", "#FA8072"],
      ["#FFA07A", "#32CD32", "#1E90FF"],
      ["#00A9A5", "#FF4500", "#4682B4"],
      ["#13C07E", "#00BCD4", "#FF6347"],
      ["#8BC34A", "#FF5722", "#3F51B5"],
      ["#4CAF50", "#00BCD4", "#F44336"],
      ["#3F51B5", "#009688", "#FF5722"],
      ["#B170FF", "#03A9F4", "#3CB371"],
      ["#009688", "#8BC34A", "#FF6347"],
      ["#F44336", "#00BCD4", "#3CB371"],
      ["#FF4500", "#32CD32", "#3CB371"],
      ["#3CB371", "#FF9800", "#009688"],
      ["#4CAF50", "#00BCD4", "#F44336"],
      ["#FF5722", "#8BC34A", "#38B1B7"],
      ["#03A9F4", "#3CB371", "#FF788B"],
      ["#FF5722", "#03A9F4", "#DB7093"],
      ["#1E90FF", "#38B1B7", "#CD5C5C"],
      ["#FF6347", "#48D1CC", "#32CD32"],
      ["#FF4500", "#73DE00", "#4682B4"],
      ["#FF5722", "#8BC34A", "#00CED1"],
      ["#FF4500", "#32CD32", "#4682B4"],
      ["#8BC34A", "#F08080", "#00BFFF"],
      ["#FF6F61", "#40E0D0", "#1E90FF"],
      ["#00CED1", "#FF6347", "#4682B4"],
      ["#E57373", "#4DD0E1", "#81C784"],
      ["#FF5722", "#8BC34A", "#FFD700"],
      ["#F08080", "#48D1CC", "#32CD32"],
    ];
    const randomIndex = Math.floor(Math.random() * colors.length);
    return colors[randomIndex];
  }

  gradientColor(colors, step) {
    var startRGB = this.colorToRgb(colors[0]),
      startR = startRGB[0],
      startG = startRGB[1],
      startB = startRGB[2];

    var endRGB = this.colorToRgb(colors[1]),
      endR = endRGB[0],
      endG = endRGB[1],
      endB = endRGB[2];

    var sR = (endR - startR) / step,
      sG = (endG - startG) / step,
      sB = (endB - startB) / step;

    var colorArr = [];
    for (var i = 0; i < step; i++) {
      var hex = this.colorToHex('rgb(' + parseInt((sR * i + startR)) + ',' + parseInt((sG * i + startG)) + ',' + parseInt((sB * i + startB)) + ')');
      colorArr.push(hex);
    }
    return colorArr;
  }

  colorToRgb(sColor) {
    var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
    var sColor = sColor.toLowerCase();
    if (sColor && reg.test(sColor)) {
      if (sColor.length === 4) {
        var sColorNew = "#";
        for (var i = 1; i < 4; i += 1) {
          sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1));
        }
        sColor = sColorNew;
      }
      var sColorChange = [];
      for (var i = 1; i < 7; i += 2) {
        sColorChange.push(parseInt("0x" + sColor.slice(i, i + 2)));
      }
      return sColorChange;
    } else {
      return sColor;
    }
  };

  colorToHex(rgb) {
    var _this = rgb;
    var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
    if (/^(rgb|RGB)/.test(_this)) {
      var aColor = _this.replace(/(?:\(|\)|rgb|RGB)*/g, "").split(",");
      var strHex = "#";
      for (var i = 0; i < aColor.length; i++) {
        var hex = Number(aColor[i]).toString(16);
        hex = hex.length < 2 ? 0 + '' + hex : hex;
        if (hex === "0") {
          hex += hex;
        }
        strHex += hex;
      }
      if (strHex.length !== 7) {
        strHex = _this;
      }
      return strHex;
    } else if (reg.test(_this)) {
      var aNum = _this.replace(/#/, "").split("");
      if (aNum.length === 6) {
        return _this;
      } else if (aNum.length === 3) {
        var numHex = "#";
        for (var i = 0; i < aNum.length; i += 1) {
          numHex += (aNum[i] + aNum[i]);
        }
        return numHex;
      }
    } else {
      return _this;
    }
  }

  getWidgetScaleFactor() {
    const referenceScreenSize = { width: 430, height: 932, widgetSize: 170 };
    const screenData = [
      { width: 440, height: 956, widgetSize: 170 },
      { width: 430, height: 932, widgetSize: 170 },
      { width: 428, height: 926, widgetSize: 170 },
      { width: 414, height: 896, widgetSize: 169 },
      { width: 414, height: 736, widgetSize: 159 },
      { width: 393, height: 852, widgetSize: 158 },
      { width: 390, height: 844, widgetSize: 158 },
      { width: 375, height: 812, widgetSize: 155 },
      { width: 375, height: 667, widgetSize: 148 },
      { width: 360, height: 780, widgetSize: 155 },
      { width: 320, height: 568, widgetSize: 141 }
    ];

    const deviceScreenWidth = Device.screenSize().width;
    const deviceScreenHeight = Device.screenSize().height;

    const matchingScreen = screenData.find(screen =>
      (screen.width === deviceScreenWidth && screen.height === deviceScreenHeight) ||
      (screen.width === deviceScreenHeight && screen.height === deviceScreenWidth)
    );

    if (!matchingScreen) {
      return 1;
    };

    const scaleFactor = matchingScreen.widgetSize / referenceScreenSize.widgetSize;

    return Math.floor(scaleFactor * 100) / 100;
  };

  async checkAndUpdateScript() {
    const updateUrl = "https://raw.githubusercontent.com/anker1209/Scriptable/main/upcoming.json";
    const scriptName = Script.name() + '.js'

    const request = new Request(updateUrl);
    const response = await request.loadJSON();
    const latestVersion = response.find(i => i.name === "ChinaTelecom_2024").version;
    const downloadUrl = response.find(i => i.name === "ChinaTelecom_2024").downloadUrl;
    const isUpdateAvailable = this.version !== latestVersion;

    if (isUpdateAvailable) {
      const alert = new Alert();
      alert.title = "检测到新版本";
      alert.message = `新版本：${latestVersion}，是否更新？`;
      alert.addAction("更新");
      alert.addCancelAction("取消");

      const resp = await alert.presentAlert();
      if (resp === 0) {
        const updateRequest = new Request(downloadUrl);
        const newScriptContent = await updateRequest.loadString();

        const fm = FileManager[
          module.filename.includes('Documents/iCloud~') ? 'iCloud' : 'local'
        ]();
        const scriptPath = fm.documentsDirectory() + `/${scriptName}`;
        fm.writeString(scriptPath, newScriptContent);

        const successAlert = new Alert();
        successAlert.title = "更新成功";
        successAlert.message = "脚本已更新，请关闭本脚本后重新打开!";
        successAlert.addAction("确定");
        await successAlert.present();
        this.reopenScript();
      }
    } else {
      const noUpdateAlert = new Alert();
      noUpdateAlert.title = "无需更新";
      noUpdateAlert.message = "当前已是最新版本。";
      noUpdateAlert.addAction("确定");
      await noUpdateAlert.present();
    }
  };

  renderSmall = async (w) => {
    w.setPadding(this.smallPadding, this.smallPadding, this.smallPadding, this.smallPadding);
    if (this.widgetStyle == "1") {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.small(bodyStack, this.fee, true);
      bodyStack.addSpacer();
      await this.small(bodyStack, this.flow, false, true);
      bodyStack.addSpacer();
      await this.small(bodyStack, this.voice);
    } else if (this.widgetStyle == "2") {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.smallCell(bodyStack, this.fee, true);
      bodyStack.addSpacer();
      await this.smallCell(bodyStack, this.flow, false, true);
      bodyStack.addSpacer();
      await this.smallCell(bodyStack, this.voice);
    } else if (this.widgetStyle == "3") {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.setThirdWidget(bodyStack);
    } else if (this.widgetStyle == "4") {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.setForthWidget(bodyStack);
    } else if (this.widgetStyle == "5") {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.header(bodyStack);
      const canvas = this.makeCanvas();
      const ringStack = bodyStack.addStack();
      this.imageCell(canvas, ringStack, this.flow);
      ringStack.addSpacer();
      this.imageCell(canvas, ringStack, this.voice);
    } else {
      const bodyStack = w.addStack();
      bodyStack.layoutVertically();
      await this.header(bodyStack);
      this.textLayout(bodyStack, this.flow);
      bodyStack.addSpacer(7);
      this.textLayout(bodyStack, this.voice);
      bodyStack.addSpacer(7);
      this.textLayout(bodyStack, this.point);
    }
    return w;
  };

  renderMedium = async (w) => {
    w.setPadding(this.padding, this.padding, this.padding, this.padding);
    const canvas = this.makeCanvas();
    const bodyStack = w.addStack();
    await this.mediumCell(canvas, bodyStack, this.fee, '0A4B9D', true);
    bodyStack.addSpacer(this.padding);
    await this.mediumCell(canvas, bodyStack, this.flow, this.flowColorHex, false, true);
    bodyStack.addSpacer(this.padding);
    await this.mediumCell(canvas, bodyStack, this.voice, this.voiceColorHex, false, true);
    return w;
  };

  renderWebView = async () => {
    const webView = new WebView();
    const url = this.fetchUrl.login;
    await webView.loadURL(url);
    await webView.present(false);
  };

  setColorConfig = async () => {
    return this.renderAppView([
      {
        title: '颜色设置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/gradient.png',
            type: 'switch',
            title: '渐变进度条',
            desc: '',
            val: 'gradient',
          },
        ],
      },
      {
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step1.png',
            type: 'color',
            title: '流量进度条',
            defaultValue: '#FF6620',
            desc: '',
            val: 'step1',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step2.png',
            type: 'color',
            title: '语音进度条',
            defaultValue: '#78C100',
            desc: '',
            val: 'step2',
          },
        ],
      },
      {
        title: '颜色设置',
        menu: [
          {
            url: 'https://pic1.imgdb.cn/item/63315c1e16f2c2beb1a27363.png',
            type: 'switch',
            title: '内置图标颜色',
            desc: '',
            val: 'builtInColor',
          },
        ],
      },
      {
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/logoColor.png',
            type: 'color',
            title: 'LOGO图标颜色',
            defaultValue: '#0C54D9',
            desc: '',
            val: 'logoColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png',
            type: 'color',
            title: '流量图标颜色',
            defaultValue: '#FF6620',
            desc: '',
            val: 'flowIconColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/voiceIconColor.png',
            type: 'color',
            title: '语音图标颜色',
            defaultValue: '#78C100',
            desc: '',
            val: 'voiceIconColor',
          },
        ],
      },
      {
        title: '重置颜色',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/clear.png',
            title: '重置颜色',
            desc: '重置当前颜色配置',
            name: 'reset',
            val: 'reset',
            onClick: () => {
              const propertiesToDelete = ['gradient', 'step1', 'step2', 'inner1', 'inner2', 'logoColor', 'flowIconColor', 'voiceIconColor'];
              propertiesToDelete.forEach(prop => {
                delete this.settings[prop];
              });
              this.saveSettings();
              this.reopenScript();
            },
          },
        ],
      },
    ]).catch((e) => {
      console.log(e);
    });
  };

  setSizeConfig = async () => {
    return this.renderAppView([
      {
        title: '尺寸设置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/SCALE.png',
            type: 'input',
            title: '小组件缩放比例',
            desc: '',
            placeholder: '1',
            val: 'SCALE',
          },
        ],
      },
      {
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/ringStackSize.png',
            type: 'input',
            title: '圆环大小',
            placeholder: '65',
            desc: '',
            val: 'ringStackSize',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/ringTextSize.png',
            type: 'input',
            title: '圆环中心文字大小',
            placeholder: '14',
            desc: '',
            val: 'ringTextSize',
          },
        ],
      },
      {
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/feeTextSize.png',
            type: 'input',
            title: '话费文字大小',
            placeholder: '21',
            desc: '',
            val: 'feeTextSize',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/textSize.png',
            type: 'input',
            title: '文字模式下文字大小',
            placeholder: '13',
            desc: '',
            val: 'textSize',
          },
        ],
      },
      {
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/smallPadding.png',
            type: 'input',
            title: '小尺寸组件边距',
            placeholder: '13',
            desc: '',
            val: 'smallPadding',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/padding.png',
            type: 'input',
            title: '中尺寸组件边距',
            placeholder: '10',
            desc: '',
            val: 'padding',
          },
        ],
      },
      {
        title: '重置尺寸',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/clear.png',
            title: '重置尺寸',
            desc: '重置当前尺寸配置',
            name: 'reset',
            val: 'reset',
            onClick: () => {
              const propertiesToDelete = ['SCALE', 'ringStackSize', 'ringTextSize', 'feeTextSize', 'textSize', 'smallPadding', 'padding',];
              propertiesToDelete.forEach(prop => {
                delete this.settings[prop];
              });
              this.saveSettings();
              this.reopenScript();
            },
          },
        ],
      },
    ]).catch((e) => {
      console.log(e);
    });
  };

  Run() {
    if (config.runsInApp) {
      const widgetInitConfig = {
        china_telecom_url: "@yy_10000.china_telecom_loginUrl",
      };
      this.registerAction({
        title: '组件配置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/update.png',
            type: 'input',
            title: '脚本更新',
            name: 'update',
            onClick: async () => {
              await this.checkAndUpdateScript();
            },
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/widgetStyle.png',
            type: 'select',
            title: '组件样式',
            options: ['1', '2', '3', '4', '5', '6'],
            val: 'widgetStyle',
          },
          // 新增：运行日志开关
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/log.png',
            type: 'switch',
            title: '运行日志',
            desc: '调试用，问题排查时开启',
            val: 'debug',
          },
        ],
      });
      this.registerAction({
        title: '流量设置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/filterOrientateFlow.png',
            type: 'switch',
            title: '过滤定向',
            val: 'filterOrientateFlow',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/showUsedFlow.png',
            type: 'switch',
            title: '显示已用',
            val: 'showUsedFlow',
          },
        ],
      });
      this.registerAction({
        title: '',
        menu: [
          {
            name: 'color',
            url: 'https://pic1.imgdb.cn/item/63315c1e16f2c2beb1a27363.png',
            title: '颜色配置',
            type: 'input',
            onClick: () => {
              return this.setColorConfig();
            },
          },
          {
            name: 'size',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/size.png',
            title: '尺寸设置',
            type: 'input',
            onClick: () => {
              return this.setSizeConfig();
            },
          },
        ],
      });
      this.registerAction({
        title: '',
        menu: [
          {
            name: 'login',
            icon: { name: 'link.badge.plus', color: '#6CCA16' },
            title: '网站登录',
            type: 'input',
            onClick: async () => {
              return this.renderWebView();
            },
          },
          {
            name: 'boxjs',
            url: 'https://raw.githubusercontent.com/githubdulong/Script/master/Images/boxjs.png',
            title: '登录地址',
            type: 'input',
            onClick: async () => {
              const index = await this.generateAlert("设置账号信息", [
                "BoxJS",
                "手动输入",
              ]);
              if (index === 0) {
                await this.setCacheBoxJSData(widgetInitConfig);
              } else {
                await this.setAlertInput("登录地址", "中国电信", widgetInitConfig);
              }
            },
          },
        ],
      });
      this.registerAction({
        title: '',
        menu: [
          {
            name: 'basic',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/basic.png',
            title: '基础设置',
            type: 'input',
            onClick: () => {
              return this.setWidgetConfig();
            },
          },
          {
            name: 'reload',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/reload.png',
            title: '重载组件',
            type: 'input',
            onClick: () => {
              this.reopenScript();
            },
          },
        ],
      });
    }
  }

  async render() {
    await this.init();
    const widget = new ListWidget();
    await this.getWidgetBackgroundImage(widget);
    if (this.widgetFamily === 'medium') {
      return await this.renderMedium(widget);
    } else if (this.widgetFamily === 'large') {
      return await this.renderLarge(widget);
    } else {
      return await this.renderSmall(widget);
    }
  }
}

await Runing(Widget, args.widgetParameter, false);
