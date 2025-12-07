/*
 * @author: 脑瓜 (Modified for Text Colors)
 * @feedback https://t.me/Scriptable_CN
 * telegram: @anker1209
 * version: 2.1.6 (Add Text Color Settings)
 * update: 2024/12/07
 * 原创UI，修改套用请注明来源
 * 使用该脚本需DmYY依赖及添加重写，参数获取及重写作者@Yuheng0101
 * 参数获取及boxjs订阅(打开链接查看): https://github.com/ChinaTelecomOperators/ChinaMobile/releases/tag/Prerelease-Alpha
 * 重写: https://raw.githubusercontent.com/Yuheng0101/X/main/Scripts/ChinaMobile/scripable.qx.conf
 * 依赖: https://raw.githubusercontent.com/dompling/Scriptable/master/Scripts/DmYY.js
 * boxjs填写手机号码
 * 打开移动app获取参数（手机验证码登录，人脸登录无效）
*/

if (typeof require === 'undefined') require = importModule
const { DmYY, Runing } = require('./DmYY')

class Widget extends DmYY {
  constructor(arg) {
    super(arg)
    this.name = '中国移动'
    this.en = 'China Mobile'
    this.logo = 'https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png'
    this.smallLogo = 'https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png'
    this.Run()
  }

  version = '2.1.2';

  fm = FileManager.local();
  CACHE_FOLDER = Script.name();
  cachePath = null;

  gradient = false;

  flowColorHex = '#32CD32';
  voiceColorHex = '#F86527';
  flowDirColorHex = '#8A6EFF';

  // 文字默认颜色
  feeTextColor = '#0080CB';
  flowTextColor = '#32CD32';
  flowDirTextColor = '#8A6EFF';
  voiceTextColor = '#F86527';

  ringStackSize = 65;
  ringTextSize = 14;
  feeTextSize = 21;
  textSize = 13;
  smallPadding = 13;
  padding = 10;
  logoScale = 0.24;
  SCALE = 1;
  interval = 360;
  data = {};

  canvSize = 178;
  canvWidth = 18;
  canvRadius = 80;

  widgetStyle = '1';

  fee = {
    title: '话费剩余',
    icon: 'logo',
    number: '0',
    iconColor: new Color('#0080CB'),
    unit: '元',
    en: '¥',
  };

  flow = {
    percent: 0,
    title: '通用流量',
    number: '0',
    unit: 'MB',
    en: 'MB',
    icon: 'antenna.radiowaves.left.and.right',
    iconColor: new Color('#32CD32'),
    FGColor: new Color(this.flowColorHex),
    BGColor: new Color(this.flowColorHex, 0.2),
    colors: [],
  };

  flowDir = {
    percent: 0,
    title: '定向流量',
    number: '0',
    unit: 'MB',
    en: 'MB',
    icon: 'arrow.triangle.2.circlepath',
    iconColor: new Color('#8A6EFF'),
    FGColor: new Color(this.flowDirColorHex),
    BGColor: new Color(this.flowDirColorHex, 0.2),
    colors: [],
  };

  voice = {
    percent: 0,
    title: '语音剩余',
    number: '0',
    unit: '分钟',
    en: 'MIN',
    icon: 'phone.badge.waveform.fill',
    iconColor: new Color('#F86527'),
    FGColor: new Color(this.voiceColorHex),
    BGColor: new Color(this.voiceColorHex, 0.2),
    colors: [],
  };

  point = {
    title: '更新时间',
    number: '',
    unit: '',
    icon: 'arrow.2.circlepath',
    iconColor: new Color('fc6d6d'),
  };

  init = async () => {
    try {
      if (this.settings.useICloud === 'true') this.fm = FileManager.iCloud()
      this.cachePath = this.fm.joinPath(this.fm.documentsDirectory(), this.CACHE_FOLDER)
      const scale = this.getWidgetScaleFactor()
      this.SCALE = this.settings.SCALE || scale

      const {
        step1,
        step2,
        step3,
        logoColor,
        flowIconColor,
        voiceIconColor,
        flowDirIconColor,
        gradient,
        widgetStyle,
        builtInColor,
        feeTextColor,
        flowTextColor,
        flowDirTextColor,
        voiceTextColor
      } = this.settings

      this.gradient = gradient === 'true'

      // 设置图标颜色
      if (builtInColor === 'true') {
        const [feeColor, flowColor, voiceColor] = this.getIconColorSet()
        this.fee.iconColor = new Color(feeColor)
        this.flow.iconColor = new Color(flowColor)
        this.voice.iconColor = new Color(voiceColor)
        this.flowDir.iconColor = new Color(this.flowDirColorHex)
      } else {
        this.fee.iconColor = logoColor ? new Color(logoColor) : this.fee.iconColor
        this.flow.iconColor = flowIconColor ? new Color(flowIconColor) : this.flow.iconColor
        this.voice.iconColor = voiceIconColor ? new Color(voiceIconColor) : this.voice.iconColor
        this.flowDir.iconColor = flowDirIconColor ? new Color(flowDirIconColor) : this.flowDir.iconColor
      }

      // 设置流量与语音圆环的颜色
      this.flowColorHex = step1 || this.flowColorHex
      this.voiceColorHex = step2 || this.voiceColorHex
      this.flowDirColorHex = step3 || this.flowDirColorHex

      // 设置文字颜色
      this.feeTextColor = feeTextColor || '#0080CB'
      this.flowTextColor = flowTextColor || this.flowColorHex
      this.flowDirTextColor = flowDirTextColor || this.flowDirColorHex
      this.voiceTextColor = voiceTextColor || this.voiceColorHex

      this.flow.BGColor = new Color(this.flowColorHex, 0.2)
      this.flowDir.BGColor = new Color(this.flowDirColorHex, 0.2)
      this.voice.BGColor = new Color(this.voiceColorHex, 0.2)

      this.flow.FGColor = new Color(this.flowColorHex)
      this.flowDir.FGColor = new Color(this.flowDirColorHex)
      this.voice.FGColor = new Color(this.voiceColorHex)

      // 设置小组件的样式与刷新时间
      this.widgetStyle = widgetStyle || this.widgetStyle
      this.interval = this.settings.interval || this.interval

      // 尺寸与缩放
      const sizeSettings = [
        'ringStackSize',
        'ringTextSize',
        'feeTextSize',
        'textSize',
        'smallPadding',
        'padding',
      ]

      for (const key of sizeSettings) {
        this[key] = this.settings[key] ? parseFloat(this.settings[key]) : this[key]
        this[key] = this[key] * this.SCALE
      }

      // 圆环渐变效果颜色属性
      if (this.gradient) {
        this.flow.colors = this.arrColor()
        this.voice.colors = this.arrColor()
        this.flowDir.colors = this.arrColor()

        this.flow.BGColor = new Color(this.flow.colors[1], 0.2)
        this.voice.BGColor = new Color(this.voice.colors[1], 0.2)
        this.flowDir.BGColor = new Color(this.flowDir.colors[1], 0.2)

        this.flow.FGColor = this.gradientColor(this.flow.colors, 360)
        this.voice.FGColor = this.gradientColor(this.voice.colors, 360)
        this.flowDir.FGColor = this.gradientColor(this.flowDir.colors, 360)

        this.flowColorHex = this.flow.colors[1]
        this.voiceColorHex = this.voice.colors[1]
      }

      console.log(this.settings)
    } catch (e) {
      console.error(e)
    }
    await this.getData()
    this.point.number = this.getUpdataTime('balanceData.json')
  };

  async getData() {
    const dataName = '移动数据'
    const url = 'https://api.example.com/10086/query'

    try {
      this.data = await this.httpRequest(dataName, url, true, {}, 'balanceData.json')
      if (!this.data) throw new Error("请求失败,请安装模块,检查boxjs配置")

      this.fee.number = this.data.fee.curFee
      // 分别处理通用流量和定向流量
      const flowGen = this.handleFlow(this.data.plan.planRemianFlowListRes, '0') // 0: 通用
      const flowDir = this.handleFlow(this.data.plan.planRemianFlowListRes, '1') // 1: 定向
      const voice = this.handleVoice(this.data.plan.planRemianVoiceListRes)

      // 通用流量
      this.flow.number = flowGen.remain
      this.flow.unit = flowGen.unit
      this.flow.en = flowGen.unit
      this.flow.percent = flowGen.percent
      this.flow.title = "通用流量"

      // 定向流量
      this.flowDir.number = flowDir.remain
      this.flowDir.unit = flowDir.unit
      this.flowDir.en = flowDir.unit
      this.flowDir.percent = flowDir.percent
      this.flowDir.title = "定向流量"

      this.voice.number = voice.number
      this.voice.percent = voice.percent
      this.voice.title = voice.title

    } catch (e) {
      console.log(`接口数据异常：请检查 BoxJS 重写`)
      console.log(e)
    }
  };

  handleVoice(inputData = {}) {
    let result = {
      voiceData: [
        {
          title: '通话剩余',
          number: '--',
          voiceSumNum: '',
          unit: '分钟',
          percent: 0,
        }
      ]
    }

    const remainingVoiceInfo = inputData['planRemianVoiceInfoRes']

    const filteredVoiceInfo = remainingVoiceInfo
      ? remainingVoiceInfo.filter(item => item['voicetype'] === '0')
      : []

    let number = result.voiceData[0].number
    let voiceSumNum = ''
    let percent = 0
    let title = result.voiceData[0].title
    const unit = result.voiceData[0].unit

    if (filteredVoiceInfo.length > 0) {
      if (Number(filteredVoiceInfo[0]['voiceRemainNum']) === 0 && inputData['outPlanInfoRes']) {
        if (inputData['outPlanInfoRes'].length > 0 && Number(inputData['outPlanInfoRes'][0]['usageAmount']) > 0) {
          number = inputData['outPlanInfoRes'][0]['usageAmount']
        } else {
          number = 0
        }
        title = '套外已用'
      } else if (Number(filteredVoiceInfo[0]['voiceRemainNum']) >= 9999 || filteredVoiceInfo[0]['voiceRemainNum'] === 'N') {
        title = '通话已用'
        number = filteredVoiceInfo[0]['voiceUsdNum']
        percent = 100
      } else {
        number = filteredVoiceInfo[0]['voiceRemainNum']
        voiceSumNum = filteredVoiceInfo[0]['voiceSumNum']
        percent = ((Number(number) / Number(voiceSumNum)) * 100).toFixed(2)
      }
    } else {
      number = 0
    }

    result.voiceData[0].number = String(number)
    result.voiceData[0].title = title
    result.voiceData[0].voiceSumNum = String(voiceSumNum)
    result.voiceData[0].percent = percent

    return result.voiceData[0]
  };

  /**
   * 处理流量信息
   * @param {*} inputData API返回的流量数据
   * @param {string} flowType '0'通用, '1'定向
   */
  handleFlow(inputData = {}, flowType = '0') {
    let result = {
      title: flowType === '0' ? '通用流量' : '定向流量',
      color: 'black',
      remain: '0',
      total: '',
      unit: 'MB',
      percent: 0
    }

    // 筛选对应类型的流量包
    const flowList = inputData['planRemianFlowRes']
      ? inputData['planRemianFlowRes'].filter(item => item['flowtype'] === flowType)
      : []

    if (flowList.length === 0) {
      return result
    }

    // 汇总该类型所有套餐的数据
    let totalSum = 0
    let totalRemain = 0
    let totalUsed = 0

    flowList.forEach(item => {
      // 统一转为 MB 计算
      let unitMult = 1
      if (item.unit === '04') unitMult = 1024 // 04是GB

      let sum = parseFloat(item.flowSumNum || 0) * unitMult
      let remain = parseFloat(item.flowRemainNum || 0) * unitMult
      let used = parseFloat(item.flowUsdNum || 0) * unitMult

      // 数据清洗
      if (item.flowRemainNum === 'N' || parseFloat(item.flowRemainNum) > 999999) {
        // 无限量套餐处理
        totalSum += 999999
        totalRemain += 999999
      } else {
        totalSum += sum
        totalRemain += remain
        totalUsed += used
      }
    })

    // 计算百分比
    let percent = 0
    if (totalSum > 0) {
      percent = ((totalRemain / totalSum) * 100).toFixed(2)
    }

    // 格式化输出
    let formatRes = this.formatFlow(totalRemain)

    result.remain = formatRes.amount
    result.unit = formatRes.unit
    result.percent = percent
    result.total = (totalSum / (formatRes.unit === 'GB' ? 1024 : 1)).toFixed(2)

    return result
  };

  formatFlow(flowMB) {
    if (flowMB >= 1024) {
      return { amount: (flowMB / 1024).toFixed(2), unit: 'GB' }
    }
    return { amount: parseFloat(flowMB).toFixed(2), unit: 'MB' }
  }

  formatItemUnit(value, unit) {
    let flowNum = ''
    let flowUnit = ''

    if (unit === '03') { // MB
      if (value >= 1024) {
        flowNum = Number((parseFloat(value) / 1024).toFixed(2))
        flowUnit = 'GB'
      } else {
        flowNum = Number(value).toFixed(2)
        flowUnit = 'MB'
      }
    } else if (unit === '04') { // GB
      flowNum = Number(value)
      flowUnit = 'GB'
    }

    return { flowNum, flowUnit }
  };

  httpRequest = async (dataName, url, json = true, options, key, method = 'GET') => {
    let cacheKey = key
    let localCache = this.loadStringCache(cacheKey)
    const lastCacheTime = this.getCacheModificationDate(cacheKey)
    const timeInterval = Math.floor((this.getCurrentTimeStamp() - lastCacheTime) / 60000)

    console.log(`${dataName}：缓存${timeInterval}分钟前，有效期${this.interval}分钟，${localCache.length}`)

    if (timeInterval < this.interval && localCache != null && localCache.length > 0) {
      console.log(`${dataName}：读取缓存`)
      return json ? JSON.parse(localCache) : localCache
    }

    let data = null
    try {
      console.log(`${dataName}：在线请求`)
      let req = new Request(url)
      req.method = method
      Object.keys(options).forEach((key) => {
        req[key] = options[key]
      })
      data = await (json ? req.loadJSON() : req.loadString())
      this.saveStringCache(cacheKey, json ? JSON.stringify(data) : data)
    } catch (e) {
      console.error(`${dataName}：请求失败：${e}`)
    }

    localCache = this.loadStringCache(cacheKey)

    if (!data && localCache != null && localCache.length > 0) {
      console.log(`${dataName}：获取失败，读取缓存`)
      return json ? JSON.parse(localCache) : localCache
    }

    console.log(`${dataName}：在线请求响应数据：${JSON.stringify(data)}`)

    return data
  };

  loadStringCache(cacheKey) {
    const cacheFile = this.fm.joinPath(this.cachePath, cacheKey)
    const fileExists = this.fm.fileExists(cacheFile)
    let cacheString = ''
    if (fileExists) {
      cacheString = this.fm.readString(cacheFile)
    }
    return cacheString
  };

  saveStringCache(cacheKey, content) {
    if (!this.fm.fileExists(this.cachePath)) {
      this.fm.createDirectory(this.cachePath, true)
    };
    const cacheFile = this.fm.joinPath(this.cachePath, cacheKey)
    this.fm.writeString(cacheFile, content)
  };

  getCacheModificationDate(cacheKey) {
    const cacheFile = this.fm.joinPath(this.cachePath, cacheKey)
    const fileExists = this.fm.fileExists(cacheFile)
    if (fileExists) {
      return this.fm.modificationDate(cacheFile).getTime()
    } else {
      return 0
    }
  };

  getCurrentTimeStamp() {
    return new Date().getTime()
  };

  getUpdataTime(cacheKey) {
    const modificationDate = this.getCacheModificationDate(cacheKey)
    let date = new Date(modificationDate)
    if (modificationDate == 0) date = new Date()

    let hours = date.getHours()
    let minutes = date.getMinutes()

    hours = hours < 10 ? '0' + hours : hours
    minutes = minutes < 10 ? '0' + minutes : minutes

    return `${hours}:${minutes}`
  };

  async header(stack) {
    const headerStack = stack.addStack()
    headerStack.addSpacer()
    const logo = headerStack.addImage(await this.$request.get(this.logo, 'IMG'))
    logo.imageSize = new Size(415 * this.logoScale * this.SCALE, 125 * this.logoScale * this.SCALE)
    headerStack.addSpacer()
    stack.addSpacer()

    const feeStack = stack.addStack()
    feeStack.centerAlignContent()
    feeStack.addSpacer()
    const feeValue = feeStack.addText(`${this.fee.number}`)
    this.unit(feeStack, '元', 5 * this.SCALE, this.widgetColor)
    feeValue.font = Font.boldRoundedSystemFont(this.feeTextSize)
    feeValue.textColor = this.widgetColor
    feeStack.addSpacer()
    stack.addSpacer()
  };

  textLayout(stack, data) {
    const rowStack = stack.addStack()
    rowStack.centerAlignContent()
    const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill')
    icon.applyHeavyWeight()
    let iconElement = rowStack.addImage(icon.image)
    iconElement.imageSize = new Size(this.textSize, this.textSize)
    iconElement.tintColor = data.iconColor
    rowStack.addSpacer(4 * this.SCALE)
    let title = rowStack.addText(data.title)
    rowStack.addSpacer()
    let number = rowStack.addText(data.number + data.unit);
    [title, number].map(t => t.textColor = this.widgetColor);
    [title, number].map(t => t.font = Font.systemFont(this.textSize * this.SCALE))
  };

  async setThirdWidget(widget) {
    const amountStack = widget.addStack()
    amountStack.centerAlignContent()

    const logo = await this.$request.get(this.smallLogo, 'IMG')
    let iconImage
    if (this.settings.builtInColor === 'true') {
      const iconStack = amountStack.addStack()
      iconStack.setPadding(3 * this.SCALE, 3 * this.SCALE, 3 * this.SCALE, 3 * this.SCALE)
      iconStack.backgroundColor = this.fee.iconColor
      iconStack.cornerRadius = 12 * this.SCALE
      iconImage = iconStack.addImage(logo)
      iconImage.imageSize = new Size(18 * this.SCALE, 18 * this.SCALE)
    } else {
      iconImage = amountStack.addImage(logo)
      iconImage.imageSize = new Size(24 * this.SCALE, 24 * this.SCALE)
    }

    amountStack.addSpacer()

    const amountText = amountStack.addText(`${this.fee.number}`)
    amountText.font = Font.boldRoundedSystemFont(24 * this.SCALE)
    amountText.minimumScaleFactor = 0.5
    amountText.textColor = this.widgetColor
    this.unit(amountStack, '元', 7 * this.SCALE)

    widget.addSpacer()

    const mainStack = widget.addStack()
    this.setRow(mainStack, this.flow, this.flowColorHex)
    mainStack.addSpacer()
    this.setRow(mainStack, this.flowDir, this.flowDirColorHex)
    mainStack.addSpacer()
    this.setRow(mainStack, this.voice, this.voiceColorHex)
  };

  async setForthWidget(widget) {
    const bodyStack = widget.addStack()
    bodyStack.cornerRadius = 14 * this.SCALE
    bodyStack.layoutVertically()

    const headerStack = bodyStack.addStack()
    headerStack.setPadding(8 * this.SCALE, 12 * this.SCALE, 0, 12 * this.SCALE)
    headerStack.layoutVertically()

    const title = headerStack.addText(this.fee.title)
    title.font = Font.systemFont(12 * this.SCALE)
    title.textColor = this.widgetColor
    title.textOpacity = 0.7

    const balanceStack = headerStack.addStack()
    const balanceText = balanceStack.addText(`${this.fee.number}`)
    balanceText.minimumScaleFactor = 0.5
    balanceText.font = Font.boldRoundedSystemFont(22 * this.SCALE)
    const color = this.widgetColor
    balanceText.textColor = color
    this.unit(balanceStack, '元', 5 * this.SCALE, color)

    balanceStack.addSpacer()
    balanceStack.centerAlignContent()

    const logo = await this.$request.get(this.smallLogo, 'IMG')
    let iconImage
    if (this.settings.builtInColor === 'true') {
      const iconStack = balanceStack.addStack()
      iconStack.setPadding(3 * this.SCALE, 3 * this.SCALE, 3 * this.SCALE, 3 * this.SCALE)
      iconStack.backgroundColor = this.fee.iconColor
      iconStack.cornerRadius = 12 * this.SCALE
      iconImage = iconStack.addImage(logo)
      iconImage.imageSize = new Size(18 * this.SCALE, 18 * this.SCALE)
    } else {
      iconImage = balanceStack.addImage(logo)
      iconImage.imageSize = new Size(24 * this.SCALE, 24 * this.SCALE)
    }

    bodyStack.addSpacer()

    // 列表区域
    const mainStack = bodyStack.addStack()
    mainStack.setPadding(8 * this.SCALE, 12 * this.SCALE, 8 * this.SCALE, 12 * this.SCALE)
    mainStack.cornerRadius = 14 * this.SCALE
    mainStack.backgroundColor = Color.dynamic(new Color("#E2E2E7", 0.3), new Color("#2C2C2F", 1))
    mainStack.layoutVertically()

    this.setList(mainStack, this.flow)
    mainStack.addSpacer()
    this.setList(mainStack, this.flowDir)
    mainStack.addSpacer()
    this.setList(mainStack, this.voice)
  };

  setList(stack, data) {
    const rowStack = stack.addStack()
    rowStack.centerAlignContent()
    const lineStack = rowStack.addStack()
    lineStack.size = new Size(8 * this.SCALE, 30 * this.SCALE)
    lineStack.cornerRadius = 4 * this.SCALE

    lineStack.backgroundColor = data.iconColor

    rowStack.addSpacer(10 * this.SCALE)

    const leftStack = rowStack.addStack()
    leftStack.layoutVertically()
    leftStack.addSpacer(2 * this.SCALE)

    const titleStack = leftStack.addStack()
    const title = titleStack.addText(data.title)
    title.font = Font.systemFont(10 * this.SCALE)
    title.textColor = this.widgetColor
    title.textOpacity = 0.5

    const valueStack = leftStack.addStack()
    valueStack.centerAlignContent()
    const value = valueStack.addText(`${data.number}`)
    value.font = Font.semiboldRoundedSystemFont(16 * this.SCALE)
    value.textColor = this.widgetColor
    valueStack.addSpacer()

    const unitStack = valueStack.addStack()
    unitStack.cornerRadius = 4 * this.SCALE
    unitStack.borderWidth = 1
    unitStack.borderColor = data.iconColor
    unitStack.setPadding(1, 3 * this.SCALE, 1, 3 * this.SCALE)
    unitStack.size = new Size(30 * this.SCALE, 0)
    unitStack.backgroundColor = Color.dynamic(data.iconColor, new Color(data.iconColor.hex, 0.3))
    const unit = unitStack.addText(data.en)
    unit.font = Font.mediumRoundedSystemFont(10 * this.SCALE)
    unit.textColor = Color.dynamic(Color.white(), data.iconColor)
  };

  setRow(stack, data, color) {
    const stackWidth = 68 * this.SCALE
    const rowStack = stack.addStack()
    rowStack.layoutVertically()
    rowStack.size = new Size(stackWidth, 0)
    const image = this.gaugeChart(data, color)
    const imageStack = rowStack.addStack()
    imageStack.layoutVertically()
    imageStack.size = new Size(stackWidth, stackWidth)
    imageStack.backgroundImage = image
    imageStack.addSpacer()
    const iconStack = imageStack.addStack()
    iconStack.addSpacer()
    const sfs = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill')
    sfs.applyHeavyWeight()
    const icon = iconStack.addImage(sfs.image)
    icon.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE)
    icon.tintColor = new Color(color)
    iconStack.addSpacer()
    imageStack.addSpacer(8 * this.SCALE)
    const unitStack = imageStack.addStack()
    unitStack.addSpacer()
    const innerStack = unitStack.addStack()
    innerStack.size = new Size(32 * this.SCALE, 0)
    innerStack.setPadding(1, 1, 1, 1)
    innerStack.backgroundColor = new Color(color)
    innerStack.cornerRadius = 4 * this.SCALE
    const unit = innerStack.addText(data.en)
    unit.font = Font.semiboldRoundedSystemFont(10 * this.SCALE)
    unit.textColor = Color.white()
    unitStack.addSpacer()
    imageStack.addSpacer(4 * this.SCALE)

    const infoStack = rowStack.addStack()
    infoStack.cornerRadius = 12 * this.SCALE
    infoStack.layoutVertically()
    let gradient = new LinearGradient()
    gradient.colors = [new Color(color, 0.1), new Color(color, 0.01)]
    gradient.locations = [0, 1]
    gradient.startPoint = new Point(0, 0)
    gradient.endPoint = new Point(0, 1)
    infoStack.backgroundGradient = gradient

    const valueStack = infoStack.addStack()
    valueStack.size = new Size(stackWidth, 0)
    valueStack.setPadding(3 * this.SCALE, 0, 2 * this.SCALE, 0)
    const value = valueStack.addText(`${data.number}`)
    value.textColor = this.widgetColor
    value.font = Font.semiboldRoundedSystemFont(18 * this.SCALE)
    value.centerAlignText()

    const titleStack = infoStack.addStack()
    titleStack.addSpacer()
    const title = titleStack.addText(data.title)
    title.font = Font.regularRoundedSystemFont(9 * this.SCALE)
    title.textOpacity = 0.5
    titleStack.addSpacer()
  };

  async small(stack, data, logo = false, en = false) {
    const bg = new LinearGradient()
    bg.locations = [0, 1]
    bg.endPoint = new Point(1, 0)
    bg.colors = [
      new Color(data.iconColor.hex, 0.1),
      new Color(data.iconColor.hex, 0.03)
    ]
    const rowStack = stack.addStack()
    rowStack.centerAlignContent()
    rowStack.setPadding(5, 8, 5, 8)
    rowStack.backgroundGradient = bg
    rowStack.cornerRadius = 12
    const leftStack = rowStack.addStack()
    leftStack.layoutVertically()
    const titleStack = leftStack.addStack()
    const title = titleStack.addText(data.title)
    const balanceStack = leftStack.addStack()
    balanceStack.centerAlignContent()
    const balanceUnit = en ? data.en : ''
    const balance = balanceStack.addText(`${data.number} ${balanceUnit}`)
    if (!en) this.addChineseUnit(balanceStack, data.unit, data.iconColor, 13 * this.SCALE)
    balance.font = Font.semiboldRoundedSystemFont(16 * this.SCALE)
    title.textOpacity = 0.5
    title.font = Font.mediumSystemFont(11 * this.SCALE);
    [title, balance].map(t => t.textColor = data.iconColor)
    rowStack.addSpacer()

    let iconImage
    if (logo) {
      const img = await this.$request.get(this.smallLogo, 'IMG')
      iconImage = rowStack.addImage(img)
    } else {
      const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill')
      icon.applyHeavyWeight()
      iconImage = rowStack.addImage(icon.image)
      iconImage.tintColor = data.iconColor
    };
    iconImage.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE)
  };

  async smallCell(stack, data, logo = false, en = false) {
    const bg = new LinearGradient()
    const padding = 6 * this.SCALE
    bg.locations = [0, 1]
    bg.endPoint = new Point(1, 0)
    bg.colors = [
      new Color(data.iconColor.hex, 0.03),
      new Color(data.iconColor.hex, 0.1)
    ]
    const rowStack = stack.addStack()
    rowStack.setPadding(4, 4, 4, 4)
    rowStack.backgroundGradient = bg
    rowStack.cornerRadius = 12
    const iconStack = rowStack.addStack()
    iconStack.backgroundColor = data.iconColor
    iconStack.setPadding(padding, padding, padding, padding)
    iconStack.cornerRadius = 17 * this.SCALE
    let iconImage
    if (logo) {
      const img = await this.$request.get(this.smallLogo, 'IMG')
      iconImage = iconStack.addImage(img)
    } else {
      const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill')
      icon.applyHeavyWeight()
      iconImage = iconStack.addImage(icon.image)
      iconImage.tintColor = new Color('FFFFFF')
    };
    iconImage.imageSize = new Size(22 * this.SCALE, 22 * this.SCALE)
    rowStack.addSpacer(15)
    const rightStack = rowStack.addStack()
    rightStack.layoutVertically()
    const balanceStack = rightStack.addStack()
    balanceStack.centerAlignContent()
    const balanceUnit = en ? data.en : ''
    const balance = balanceStack.addText(`${data.number} ${balanceUnit}`)
    if (!en) this.addChineseUnit(balanceStack, data.unit, data.iconColor, 13 * this.SCALE)
    balance.font = Font.semiboldRoundedSystemFont(16 * this.SCALE)
    const titleStack = rightStack.addStack()
    const title = titleStack.addText(data.title)
    title.centerAlignText()
    rowStack.addSpacer()
    title.textOpacity = 0.5
    title.font = Font.mediumSystemFont(11 * this.SCALE);
    [title, balance].map(t => t.textColor = data.iconColor)
  };

  // 中号组件布局
  async mediumCell(canvas, stack, data, color, textColor, fee = false, percent) {
    const bg = new LinearGradient()
    bg.locations = [0, 1]
    bg.colors = [
      new Color(color, 0.03),
      new Color(color, 0.1)
    ]
    const dataStack = stack.addStack()
    dataStack.backgroundGradient = bg
    dataStack.cornerRadius = 15
    dataStack.layoutVertically()
    dataStack.addSpacer()

    const topStack = dataStack.addStack()
    topStack.addSpacer()
    await this.imageCell(canvas, topStack, data, fee, percent, textColor)
    topStack.addSpacer()

    if (fee) {
      dataStack.addSpacer(5 * this.SCALE)
      const updateStack = dataStack.addStack()
      updateStack.addSpacer()
      updateStack.centerAlignContent()
      const updataIcon = SFSymbol.named('arrow.2.circlepath')
      updataIcon.applyHeavyWeight()
      const updateImg = updateStack.addImage(updataIcon.image)
      updateImg.tintColor = new Color(textColor || color, 0.6)
      updateImg.imageSize = new Size(10 * this.SCALE, 10 * this.SCALE)
      updateStack.addSpacer(3)
      const updateText = updateStack.addText(this.getUpdataTime('balanceData.json'))
      updateText.font = Font.mediumSystemFont(10 * this.SCALE)
      updateText.textColor = new Color(textColor || color, 0.6)
      updateStack.addSpacer()
    }

    dataStack.addSpacer()

    const numberStack = dataStack.addStack()
    numberStack.addSpacer()
    const number = numberStack.addText(`${data.number} ${data.en}`)
    number.font = Font.semiboldSystemFont(15 * this.SCALE)
    number.lineLimit = 1
    number.minimumScaleFactor = 0.5
    numberStack.addSpacer()

    dataStack.addSpacer(3)

    const titleStack = dataStack.addStack()
    titleStack.addSpacer()
    const title = titleStack.addText(data.title)
    title.font = Font.mediumSystemFont(11 * this.SCALE)
    title.textOpacity = 0.7
    titleStack.addSpacer()

    dataStack.addSpacer(15 * this.SCALE);
    [title, number].map(t => t.textColor = new Color(textColor || color))
  };

  async imageCell(canvas, stack, data, fee, percent, textColor) {
    const canvaStack = stack.addStack()
    canvaStack.layoutVertically()
    if (!fee) {
      this.drawArc(canvas, data.percent * 3.6, data.FGColor, data.BGColor)
      canvaStack.size = new Size(this.ringStackSize, this.ringStackSize)
      canvaStack.backgroundImage = canvas.getImage()
      this.ringContent(canvaStack, data, percent, textColor)
    } else {
      canvaStack.addSpacer(10 * this.SCALE)
      const logoStack = canvaStack.addStack()
      logoStack.size = new Size(40 * this.SCALE, 40 * this.SCALE)

      const url = 'https://raw.githubusercontent.com/anker1209/icon/main/zgyd.png'
      try {
        const req = new Request(url)
        const img = await req.loadImage()
        logoStack.backgroundImage = img
      } catch (e) {
        console.error("Logo load failed: " + e)
      }
    }
  };

  ringContent(stack, data, percent = false, textColor) {
    const rowIcon = stack.addStack()
    rowIcon.addSpacer()
    const icon = SFSymbol.named(data.icon) || SFSymbol.named('phone.fill')
    icon.applyHeavyWeight()
    const iconElement = rowIcon.addImage(icon.image)
    iconElement.tintColor = this.gradient ? new Color(data.colors[1]) : data.FGColor
    iconElement.imageSize = new Size(12 * this.SCALE, 12 * this.SCALE)
    iconElement.imageOpacity = 0.7
    rowIcon.addSpacer()

    stack.addSpacer(1)

    const rowNumber = stack.addStack()
    rowNumber.addSpacer()
    const number = rowNumber.addText(percent ? `${data.percent}` : `${data.number}`)
    number.font = percent ? Font.systemFont(this.ringTextSize - 2) : Font.mediumSystemFont(this.ringTextSize)
    number.lineLimit = 1
    number.minimumScaleFactor = 0.5
    rowNumber.addSpacer()

    const rowUnit = stack.addStack()
    rowUnit.addSpacer()
    const unit = rowUnit.addText(percent ? '%' : data.unit)
    unit.font = Font.boldSystemFont(8 * this.SCALE)
    unit.textOpacity = 0.5
    rowUnit.addSpacer()

    if (percent) {
      if (this.gradient) {
        [unit, number].map(t => t.textColor = new Color(data.colors[1]))
      } else {
        [unit, number].map(t => t.textColor = data.FGColor)
      }
    } else {
      [unit, number].map(t => t.textColor = this.widgetColor)
    }
  };

  makeCanvas() {
    const canvas = new DrawContext()
    canvas.opaque = false
    canvas.respectScreenScale = true
    canvas.size = new Size(this.canvSize, this.canvSize)
    return canvas
  };

  sinDeg(deg) {
    return Math.sin((deg * Math.PI) / 180)
  };

  cosDeg(deg) {
    return Math.cos((deg * Math.PI) / 180)
  };

  drawArc(canvas, deg, fillColor, strokeColor) {
    let ctr = new Point(this.canvSize / 2, this.canvSize / 2)
    let bgx = ctr.x - this.canvRadius
    let bgy = ctr.y - this.canvRadius
    let bgd = 2 * this.canvRadius
    let bgr = new Rect(bgx, bgy, bgd, bgd)

    canvas.setStrokeColor(strokeColor)
    canvas.setLineWidth(this.canvWidth)
    canvas.strokeEllipse(bgr)

    for (let t = 0; t < deg; t++) {
      let rect_x = ctr.x + this.canvRadius * this.sinDeg(t) - this.canvWidth / 2
      let rect_y = ctr.y - this.canvRadius * this.cosDeg(t) - this.canvWidth / 2
      let rect_r = new Rect(rect_x, rect_y, this.canvWidth, this.canvWidth)
      canvas.setFillColor(this.gradient ? new Color(fillColor[t]) : fillColor)
      canvas.setStrokeColor(strokeColor)
      canvas.fillEllipse(rect_r)
    }
  };

  fillRect(drawing, x, y, width, height, cornerradio, color) {
    let path = new Path()
    let rect = new Rect(x, y, width, height)
    path.addRoundedRect(rect, cornerradio, cornerradio)
    drawing.addPath(path)
    drawing.setFillColor(color)
    drawing.fillPath()
  };

  progressBar(data) {
    const W = 60, H = 9, r = 4.5, h = 3
    const drawing = this.makeCanvas(W, H)
    const progress = data.percent / 100 * W
    const circle = progress - 2 * r
    const fgColor = data.iconColor
    const bgColor = new Color(data.iconColor.hex, 0.3)
    const pointerColor = data.iconColor
    this.fillRect(drawing, 0, (H - h) / 2, W, h, h / 2, bgColor)
    this.fillRect(drawing, 0, (H - h) / 2, progress > W ? W : progress < r * 2 ? r * 2 : progress, h, h / 2, fgColor)
    this.fillRect(drawing, circle > W - r * 2 ? W - r * 2 : circle < 0 ? 0 : circle, H / 2 - r, r * 2, r * 2, r, pointerColor)
    return drawing.getImage()
  };

  gaugeChart(data, color) {
    const drawing = this.makeCanvas()
    const center = new Point(this.canvSize / 2, this.canvSize / 2)
    const radius = this.canvSize / 2 - 10
    const circleRadius = 8
    const startBgAngle = (10 * Math.PI) / 12
    const endBgAngle = (26 * Math.PI) / 12
    const totalBgAngle = endBgAngle - startBgAngle
    const gapAngle = Math.PI / 80
    const fillColor = data.BGColor
    const lineWidth = circleRadius * 2
    let progress = data.percent / 100

    this.drawLineArc(drawing, center, radius, startBgAngle, endBgAngle, 1, fillColor, lineWidth)

    this.drawHalfCircle(center.x + radius * Math.cos(startBgAngle), center.y + radius * Math.sin(startBgAngle), startBgAngle, circleRadius, drawing, fillColor, -1)
    this.drawHalfCircle(center.x + radius * Math.cos(endBgAngle), center.y + radius * Math.sin(endBgAngle), endBgAngle, circleRadius, drawing, fillColor, 1)

    let totalProgressAngle = totalBgAngle * progress
    for (let i = 0; i < 240 * progress; i++) {
      const t = i / 240
      const angle = startBgAngle + totalBgAngle * t
      const x = center.x + radius * Math.cos(angle)
      const y = center.y + radius * Math.sin(angle)

      const circleRect = new Rect(x - circleRadius, y - circleRadius, circleRadius * 2, circleRadius * 2)
      drawing.setFillColor(this.gradient ? new Color(data.FGColor[i]) : data.FGColor)
      drawing.fillEllipse(circleRect)
    }
    return drawing.getImage()
  };

  drawHalfCircle(centerX, centerY, startAngle, circleRadius, context, fillColor, direction = 1) {
    const halfCirclePath = new Path()
    const startX = centerX + circleRadius * Math.cos(startAngle)
    const startY = centerY + circleRadius * Math.sin(startAngle)
    halfCirclePath.move(new Point(startX, startY))

    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const angle = startAngle + direction * Math.PI * t
      const x = centerX + circleRadius * Math.cos(angle)
      const y = centerY + circleRadius * Math.sin(angle)
      halfCirclePath.addLine(new Point(x, y))
    }

    context.setFillColor(fillColor)
    context.addPath(halfCirclePath)
    context.fillPath()
  };

  drawLineArc(context, center, radius, startAngle, endAngle, segments, fillColor, lineWidth, dir = 1) {
    const path = new Path()
    const startX = center.x + radius * Math.cos(startAngle)
    const startY = center.y + radius * Math.sin(startAngle)
    path.move(new Point(startX, startY))

    const steps = 100
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const angle = startAngle + (endAngle - startAngle) * t
      const x = center.x + radius * Math.cos(angle)
      const y = center.y + radius * Math.sin(angle)
      path.addLine(new Point(x, y))
    }

    context.setStrokeColor(fillColor)
    context.setLineWidth(lineWidth)
    context.addPath(path)
    context.strokePath()
  };

  addChineseUnit(stack, text, color, size) {
    let textElement = stack.addText(text)
    textElement.textColor = color
    textElement.font = Font.semiboldSystemFont(size)
    return textElement
  };

  unit(stack, text, spacer, color = this.widgetColor) {
    stack.addSpacer(1)
    const unitStack = stack.addStack()
    unitStack.layoutVertically()
    unitStack.addSpacer(spacer)
    const unitTitle = unitStack.addText(text)
    unitTitle.font = Font.semiboldRoundedSystemFont(10)
    unitTitle.textColor = color
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
    ]
    let colors = colorArr[Math.floor(Math.random() * colorArr.length)]
    return colors
  };

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
    ]
    const randomIndex = Math.floor(Math.random() * colors.length)
    return colors[randomIndex]
  };

  gradientColor(colors, step) {
    var startRGB = this.colorToRgb(colors[0]),
      startR = startRGB[0],
      startG = startRGB[1],
      startB = startRGB[2]

    var endRGB = this.colorToRgb(colors[1]),
      endR = endRGB[0],
      endG = endRGB[1],
      endB = endRGB[2]

    var sR = (endR - startR) / step,
      sG = (endG - startG) / step,
      sB = (endB - startB) / step

    var colorArr = []
    for (var i = 0; i < step; i++) {
      var hex = this.colorToHex('rgb(' + parseInt((sR * i + startR)) + ',' + parseInt((sG * i + startG)) + ',' + parseInt((sB * i + startB)) + ')')
      colorArr.push(hex)
    }
    return colorArr
  };

  colorToRgb(sColor) {
    var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/
    var sColor = sColor.toLowerCase()
    if (sColor && reg.test(sColor)) {
      if (sColor.length === 4) {
        var sColorNew = "#"
        for (var i = 1; i < 4; i += 1) {
          sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1))
        }
        sColor = sColorNew
      }
      var sColorChange = []
      for (var i = 1; i < 7; i += 2) {
        sColorChange.push(parseInt("0x" + sColor.slice(i, i + 2)))
      }
      return sColorChange
    } else {
      return sColor
    }
  };

  colorToHex(rgb) {
    var _this = rgb
    var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/
    if (/^(rgb|RGB)/.test(_this)) {
      var aColor = _this.replace(/(?:\(|\)|rgb|RGB)*/g, "").split(",")
      var strHex = "#"
      for (var i = 0; i < aColor.length; i++) {
        var hex = Number(aColor[i]).toString(16)
        hex = hex.length < 2 ? 0 + '' + hex : hex
        if (hex === "0") {
          hex += hex
        }
        strHex += hex
      }
      if (strHex.length !== 7) {
        strHex = _this
      }
      return strHex
    } else if (reg.test(_this)) {
      var aNum = _this.replace(/#/, "").split("")
      if (aNum.length === 6) {
        return _this
      } else if (aNum.length === 3) {
        var numHex = "#"
        for (var i = 0; i < aNum.length; i += 1) {
          numHex += (aNum[i] + aNum[i])
        }
        return numHex
      }
    } else {
      return _this
    }
  };

  getWidgetScaleFactor() {
    const referenceScreenSize = { width: 430, height: 932, widgetSize: 170 }
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
    ]

    const deviceScreenWidth = Device.screenSize().width
    const deviceScreenHeight = Device.screenSize().height

    const matchingScreen = screenData.find(screen =>
      (screen.width === deviceScreenWidth && screen.height === deviceScreenHeight) ||
      (screen.width === deviceScreenHeight && screen.height === deviceScreenWidth)
    )

    if (!matchingScreen) {
      return 1
    };

    const scaleFactor = matchingScreen.widgetSize / referenceScreenSize.widgetSize

    return Math.floor(scaleFactor * 100) / 100
  };

  async checkAndUpdateScript() {
    const updateUrl = "https://raw.githubusercontent.com/anker1209/Scriptable/main/upcoming.json"
    const scriptName = Script.name() + '.js'

    const request = new Request(updateUrl)
    const response = await request.loadJSON()
    const latestVersion = response.find(i => i.name === "ChinaMobile_2024").version
    const downloadUrl = response.find(i => i.name === "ChinaMobile_2024").downloadUrl
    const isUpdateAvailable = this.version !== latestVersion

    if (isUpdateAvailable) {
      const alert = new Alert()
      alert.title = "检测到新版本"
      alert.message = `新版本：${latestVersion}，是否更新？`
      alert.addAction("更新")
      alert.addCancelAction("取消")

      const response = await alert.presentAlert()
      if (response === 0) {
        const updateRequest = new Request(downloadUrl)
        const newScriptContent = await updateRequest.loadString()

        const fm = FileManager[
          module.filename.includes('Documents/iCloud~') ? 'iCloud' : 'local'
        ]()
        const scriptPath = fm.documentsDirectory() + `/${scriptName}`
        fm.writeString(scriptPath, newScriptContent)

        const successAlert = new Alert()
        successAlert.title = "更新成功"
        successAlert.message = "脚本已更新，请关闭本脚本后重新打开!"
        successAlert.addAction("确定")
        await successAlert.present()
        this.reopenScript()
      }
    } else {
      const noUpdateAlert = new Alert()
      noUpdateAlert.title = "无需更新"
      noUpdateAlert.message = "当前已是最新版本。"
      noUpdateAlert.addAction("确定")
      await noUpdateAlert.present()
    }
  };

  renderSmall = async (w) => {
    w.setPadding(this.smallPadding, this.smallPadding, this.smallPadding, this.smallPadding)
    if (this.widgetStyle == "1") {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.small(bodyStack, this.fee, true)
      bodyStack.addSpacer()
      await this.small(bodyStack, this.flow, false, true)
      bodyStack.addSpacer()
      await this.small(bodyStack, this.voice)
    } else if (this.widgetStyle == "2") {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.smallCell(bodyStack, this.fee, true)
      bodyStack.addSpacer()
      await this.smallCell(bodyStack, this.flow, false, true)
      bodyStack.addSpacer()
      await this.smallCell(bodyStack, this.voice)
    } else if (this.widgetStyle == "3") {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.setThirdWidget(bodyStack)
    } else if (this.widgetStyle == "4") {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.setForthWidget(bodyStack)
    } else if (this.widgetStyle == "5") {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.header(bodyStack)
      const canvas = this.makeCanvas()
      const ringStack = bodyStack.addStack()
      this.imageCell(canvas, ringStack, this.flow)
      ringStack.addSpacer()
      this.imageCell(canvas, ringStack, this.voice)
    } else {
      const bodyStack = w.addStack()
      bodyStack.layoutVertically()
      await this.header(bodyStack)
      this.textLayout(bodyStack, this.flow)
      bodyStack.addSpacer(7)
      this.textLayout(bodyStack, this.voice)
      bodyStack.addSpacer(7)
      this.textLayout(bodyStack, this.point)
    }
    return w
  };

  renderMedium = async (w) => {
    w.setPadding(this.padding, this.padding, this.padding, this.padding)
    const canvas = this.makeCanvas()
    const bodyStack = w.addStack()

    await this.mediumCell(canvas, bodyStack, this.fee, '0080CB', this.feeTextColor, true)
    bodyStack.addSpacer(this.padding)
    await this.mediumCell(canvas, bodyStack, this.flow, this.flowColorHex, this.flowTextColor, false, true)
    bodyStack.addSpacer(this.padding)
    await this.mediumCell(canvas, bodyStack, this.flowDir, this.flowDirColorHex, this.flowDirTextColor, false, true)
    bodyStack.addSpacer(this.padding)
    await this.mediumCell(canvas, bodyStack, this.voice, this.voiceColorHex, this.voiceTextColor, false, true)
    return w
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
            defaultValue: '#32CD32',
            desc: '',
            val: 'step1',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step1.png',
            type: 'color',
            title: '定向流量进度条',
            defaultValue: '#8A6EFF',
            desc: '',
            val: 'step3',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/step2.png',
            type: 'color',
            title: '语音进度条',
            defaultValue: '#F86527',
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
            defaultValue: '#0080CB',
            desc: '',
            val: 'logoColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png',
            type: 'color',
            title: '流量图标颜色',
            defaultValue: '#32CD32',
            desc: '',
            val: 'flowIconColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png',
            type: 'color',
            title: '定向流量图标颜色',
            defaultValue: '#8A6EFF',
            desc: '',
            val: 'flowDirIconColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/voiceIconColor.png',
            type: 'color',
            title: '语音图标颜色',
            defaultValue: '#F86527',
            desc: '',
            val: 'voiceIconColor',
          },
        ],
      },
      {
        title: '文字颜色设置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/logoColor.png',
            type: 'color',
            title: '话费文字颜色',
            defaultValue: '#0080CB',
            desc: '设置话费部分文字颜色',
            val: 'feeTextColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png',
            type: 'color',
            title: '流量文字颜色',
            defaultValue: '#32CD32',
            desc: '设置通用流量部分文字颜色',
            val: 'flowTextColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/flowIconColor.png',
            type: 'color',
            title: '定向流量文字颜色',
            defaultValue: '#8A6EFF',
            desc: '设置定向流量部分文字颜色',
            val: 'flowDirTextColor',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/voiceIconColor.png',
            type: 'color',
            title: '语音文字颜色',
            defaultValue: '#F86527',
            desc: '设置语音部分文字颜色',
            val: 'voiceTextColor',
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
              const propertiesToDelete = [
                'gradient',
                'step1',
                'step2',
                'step3',
                'logoColor',
                'flowIconColor',
                'voiceIconColor',
                'flowDirIconColor',
                'feeTextColor',
                'flowTextColor',
                'flowDirTextColor',
                'voiceTextColor'
              ]
              propertiesToDelete.forEach(prop => {
                delete this.settings[prop]
              })
              this.saveSettings()
              this.reopenScript()
            },
          },
        ],
      },
    ]).catch((e) => {
      console.log(e)
    })
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
            placeholder: '61',
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
            placeholder: '15',
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
              const propertiesToDelete = ['SCALE', 'ringStackSize', 'ringTextSize', 'feeTextSize', 'textSize', 'smallPadding', 'padding',]
              propertiesToDelete.forEach(prop => {
                delete this.settings[prop]
              })
              this.saveSettings()
              this.reopenScript()
            },
          },
        ],
      },
    ]).catch((e) => {
      console.log(e)
    })
  };

  Run() {
    if (config.runsInApp) {
      this.registerAction({
        title: '组件配置',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/useICloud.png',
            type: 'switch',
            title: 'iCloud',
            val: 'useICloud',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/update.png',
            type: 'input',
            title: '脚本更新',
            name: 'update',
            onClick: async () => {
              await this.checkAndUpdateScript()
            },
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/interval.png',
            type: 'input',
            placeholder: '360',
            title: '刷新时间',
            desc: '数据刷新时间，单位：分钟，默认360分钟\n⚠谨慎设置刷新时间，以免被风控',
            val: 'interval',
          },
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/reset.png',
            title: '清除缓存',
            desc: '',
            val: 'reset',
            onClick: async () => {
              const options = ['取消', '确认清除']
              const message = '所有在线请求的数据缓存将会被清空'
              const index = await this.generateAlert(message, options)
              if (index === 0) return
              this.fm.remove(this.cachePath)
            },
          },
        ],
      })
      this.registerAction({
        title: '',
        menu: [
          {
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/widgetStyle.png',
            type: 'select',
            title: '组件样式',
            options: ['1', '2', '3', '4', '5', '6'],
            val: 'widgetStyle',
          },
        ],
      })

      this.registerAction({
        title: '',
        menu: [
          {
            name: 'color',
            url: 'https://pic1.imgdb.cn/item/63315c1e16f2c2beb1a27363.png',
            title: '颜色配置',
            type: 'input',
            onClick: () => {
              return this.setColorConfig()
            },
          },
          {
            name: 'size',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/size.png',
            title: '尺寸设置',
            type: 'input',
            onClick: () => {
              return this.setSizeConfig()
            },
          },
        ],
      })
      this.registerAction({
        title: '',
        menu: [
          {
            name: 'basic',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/basic.png',
            title: '基础设置',
            type: 'input',
            onClick: () => {
              return this.setWidgetConfig()
            },
          },
          {
            name: 'reload',
            url: 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/reload.png',
            title: '重载组件',
            type: 'input',
            onClick: () => {
              this.reopenScript()
            },
          },
        ],
      })
    }
  };

  async render() {
    await this.init()
    const widget = new ListWidget()
    await this.getWidgetBackgroundImage(widget)
    if (this.widgetFamily === 'medium') {
      return await this.renderMedium(widget)
    } else if (this.widgetFamily === 'large') {
      return await this.renderLarge(widget)
    } else {
      return await this.renderSmall(widget)
    }
  };
}

await Runing(Widget, args.widgetParameter, false)
0