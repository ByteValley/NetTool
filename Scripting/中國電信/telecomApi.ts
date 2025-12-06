import { fetch } from "scripting"
import JSEncrypt from "./module/jsencrypt"

// 全局对象声明（Scriptable / Scripting 宿主提供）
declare const Storage: any

// 设置结构（与设置页 / 小组件共享）
export type ChinaTelecomSettings = {
  mobile: string
  password: string

  // 新增：可选刷新间隔（分钟）
  refreshInterval?: number

  // 可选：后续如果想配置时间颜色，可以复用
  refreshTimeDayColor?: string
  refreshTimeNightColor?: string
}

const SETTINGS_KEY = "chinaTelecomSettings"

type StorageProps = {
  phonenum: string
  password: string
  token: string
  provinceCode: string
  cityCode: string
}

class Telecom {
  private KEY = "telecom"

  phonenum = ""
  password = ""
  private cityCode = ""
  private provinceCode = ""
  private token = ""

  private client_type = "#12.2.0#channel50#iPhone 14 Pro#"
  private headers = { "Content-Type": "application/json; charset=UTF-8" }

  constructor() {
    // 这里不能用 Storage.get<ChinaTelecomSettings>，改成先 get 再 as
    const settings = Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null
    if (settings) {
      this.phonenum = settings.mobile || ""
      this.password = settings.password || ""
    }

    const stored = Storage.get(this.KEY) as StorageProps
    if (stored) {
      Object.assign(this, stored)
    }
  }

  // --- Endpoint --- //

  private async login() {
    const uuid = String(Math.floor(Math.random() * 9e15 + 1e15))
    const ts = this.getBeijingTimestamp()

    const loginBody = {
      content: {
        fieldData: {
          accountType: "",
          authentication: this.transNumber(this.password),
          deviceUid: uuid.slice(0, 16),
          isChinatelecom: "",
          loginAuthCipherAsymmertric: this.encrypt(
            `iPhone 15 13.2.${uuid.slice(0, 12)}${this.phonenum}${ts}${this.password}0$$$0.`,
          ),
          loginType: "4",
          phoneNum: this.transNumber(this.phonenum),
          systemVersion: "13.2.3",
        },
        attach: "test",
      },
      headerInfos: {
        code: "userLoginNormal",
        clientType: "#12.2.0#channel50#iPhone 14 Pro#",
        timestamp: ts,
        shopId: "20002",
        source: "110003",
        sourcePassword: "Sid98s",
        token: "",
        userLoginName: this.transNumber(this.phonenum),
      },
    }

    try {
      const response = await fetch(
        "https://appgologin.189.cn:9031/login/client/userLoginNormal",
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(loginBody),
        },
      )

      const responseText = await response.text()
      const data = JSON.parse(responseText)

      if (data.responseData?.resultCode !== "0000") {
        const errMsg = data.responseData?.resultDesc || "登录失败"
        console.error("登录失败:", errMsg)
        throw new Error(errMsg)
      }

      return data
    } catch (error) {
      console.error("登录异常:", error)
      throw error
    }
  }

  private async fetch_important_data() {
    const ts = this.getBeijingTimestamp()

    const queryBody = {
      content: {
        fieldData: {
          provinceCode: this.provinceCode,
          cityCode: this.cityCode,
          shopId: "20002",
          isChinatelecom: "0",
          account: this.transNumber(this.phonenum),
        },
        attach: "test",
      },
      headerInfos: {
        code: "userFluxPackage",
        clientType: this.client_type,
        timestamp: ts,
        shopId: "20002",
        source: "110003",
        sourcePassword: "Sid98s",
        userLoginName: this.transNumber(this.phonenum),
        token: this.token,
      },
    }

    try {
      const response = await fetch(
        "https://appfuwu.189.cn:9021/query/qryImportantData",
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(queryBody),
        },
      )

      const responseText = await response.text()
      const data = JSON.parse(responseText)
      return data
    } catch (error) {
      console.error("查询异常:", error)
      throw error
    }
  }

  // --- util --- //

  async fetch_data() {
    const body = await this.fetch_important_data()
    if (body.responseData) {
      this.formatAndLogData(body)
      return body
    }

    // 刷新 Token
    const data = await this.login()
    if (data.responseData.resultCode !== "0000") {
      throw new Error(data.responseData.resultDesc)
    }
    ; ({
      token: this.token,
      cityCode: this.cityCode,
      provinceCode: this.provinceCode,
    } = data.responseData.data.loginSuccessResult)
    this.save()

    // 重新查询
    const newBody = await this.fetch_important_data()
    if (!newBody.responseData) {
      console.error("查询失败:", JSON.stringify(newBody))
      throw new Error(JSON.stringify(newBody))
    }
    this.formatAndLogData(newBody)
    return newBody
  }

  private formatAndLogData(data: any) {
    const responseData = data.responseData?.data
    if (!responseData) return

    // 余额信息
    const balanceInfo = responseData.balanceInfo
    const indexBalanceDataInfo = balanceInfo?.indexBalanceDataInfo
    let balance = parseFloat(indexBalanceDataInfo?.balance || "0")
    const arrear = parseFloat(indexBalanceDataInfo?.arrear || "0")
    if (arrear > 0) {
      balance = balance - arrear
    }

    // 语音信息
    const voiceInfo = responseData.voiceInfo
    const voiceDataInfo = voiceInfo?.voiceDataInfo
    const voiceBalance = parseFloat(voiceDataInfo?.balance || "0")
    const voiceUsed = parseFloat(voiceDataInfo?.used || "0")
    const voiceTotal =
      parseFloat(voiceDataInfo?.total || "0") || voiceUsed + voiceBalance

    // 流量信息
    const flowInfo = responseData.flowInfo
    const commonFlow = flowInfo?.commonFlow
    const commonBalanceBytes = parseFloat(commonFlow?.balance || "0")
    const commonUsedBytes = parseFloat(commonFlow?.used || "0")
    const commonBalanceMB = commonBalanceBytes / 1024
    const commonUsedMB = commonUsedBytes / 1024
    const commonTotalMB = commonBalanceMB + commonUsedMB

    const specialAmount = flowInfo?.specialAmount
    const specialBalanceBytes = parseFloat(specialAmount?.balance || "0")
    const specialUsedBytes = parseFloat(specialAmount?.used || "0")
    const specialBalanceMB = specialBalanceBytes / 1024
    const specialUsedMB = specialUsedBytes / 1024
    const specialTotalMB = specialBalanceMB + specialUsedMB

    const totalFlowMB = commonTotalMB + specialTotalMB
    const totalFlowUsedMB = commonUsedMB + specialUsedMB
    const totalFlowBalanceMB = commonBalanceMB + specialBalanceMB

    // 控制台输出（调试）
    console.log("=".repeat(50))
    console.log("余额信息:")
    console.log("  账户余额:", balance.toFixed(2), "元")
    if (arrear > 0) {
      console.log("  欠费金额:", arrear.toFixed(2), "元")
    }
    console.log("")
    console.log("语音信息:")
    console.log("  剩余:", voiceBalance.toFixed(0), "分钟")
    console.log("  已用:", voiceUsed.toFixed(0), "分钟")
    console.log("  总计:", voiceTotal.toFixed(0), "分钟")
    console.log("")
    console.log("流量信息:")
    if (commonTotalMB > 0) {
      console.log("  通用流量:")
      console.log(
        "    剩余:",
        commonBalanceMB > 1024
          ? (commonBalanceMB / 1024).toFixed(2) + " GB"
          : commonBalanceMB.toFixed(2) + " MB",
      )
      console.log(
        "    已用:",
        commonUsedMB > 1024
          ? (commonUsedMB / 1024).toFixed(2) + " GB"
          : commonUsedMB.toFixed(2) + " MB",
      )
      console.log(
        "    总计:",
        commonTotalMB > 1024
          ? (commonTotalMB / 1024).toFixed(2) + " GB"
          : commonTotalMB.toFixed(2) + " MB",
      )
    }
    if (specialTotalMB > 0) {
      console.log("  其他流量:")
      console.log(
        "    剩余:",
        specialBalanceMB > 1024
          ? (specialBalanceMB / 1024).toFixed(2) + " GB"
          : specialBalanceMB.toFixed(2) + " MB",
      )
      console.log(
        "    已用:",
        specialUsedMB > 1024
          ? (specialUsedMB / 1024).toFixed(2) + " GB"
          : specialUsedMB.toFixed(2) + " MB",
      )
      console.log(
        "    总计:",
        specialTotalMB > 1024
          ? (specialTotalMB / 1024).toFixed(2) + " GB"
          : specialTotalMB.toFixed(2) + " MB",
      )
    }
    console.log("  总流量:")
    console.log(
      "    剩余:",
      totalFlowBalanceMB > 1024
        ? (totalFlowBalanceMB / 1024).toFixed(2) + " GB"
        : totalFlowBalanceMB.toFixed(2) + " MB",
    )
    console.log(
      "    已用:",
      totalFlowUsedMB > 1024
        ? (totalFlowUsedMB / 1024).toFixed(2) + " GB"
        : totalFlowUsedMB.toFixed(2) + " MB",
    )
    console.log(
      "    总计:",
      totalFlowMB > 1024
        ? (totalFlowMB / 1024).toFixed(2) + " GB"
        : totalFlowMB.toFixed(2) + " MB",
    )
    console.log("=".repeat(50))
  }

  save() {
    Storage.set(this.KEY, {
      phonenum: this.phonenum,
      password: this.password,
      token: this.token,
      provinceCode: this.provinceCode,
      cityCode: this.cityCode,
    } as StorageProps)
  }

  private getBeijingTimestamp() {
    // 北京时间（按原逻辑）
    const bjDate = new Date(Date.now() + 8 * 3600 * 1000)
    const yyyy = String(bjDate.getFullYear())
    const MM = String(bjDate.getMonth() + 1).padStart(2, "0")
    const dd = String(bjDate.getDate()).padStart(2, "0")
    const HH = String(bjDate.getHours()).padStart(2, "0")
    const mm = String(bjDate.getMinutes()).padStart(2, "0")
    const ss = String(bjDate.getSeconds()).padStart(2, "0")
    return `${yyyy}${MM}${dd}${HH}${mm}${ss}`
  }

  private transNumber(str: string, encode = true) {
    return [...str]
      .map((c) =>
        String.fromCharCode(
          (c.charCodeAt(0) + (encode ? 2 : -2)) & 0xffff,
        ),
      )
      .join("")
  }

  private encrypt(str: string) {
    const encryptor = new JSEncrypt()
    encryptor.setPublicKey(
      `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofd
WzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18
qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMi
PMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----`,
    )
    return encryptor.encrypt(str)
  }
}

// 从 Storage 读取设置
export function getSettings(): ChinaTelecomSettings | null {
  // 同理，这里也不要用泛型调用
  return Storage.get(SETTINGS_KEY) as ChinaTelecomSettings | null
}

// 查询重要数据接口（使用官方接口）
export async function queryImportantData(): Promise<any> {
  const settings = getSettings()
  if (!settings) {
    throw new Error("未找到配置，请在设置中配置手机号和密码")
  }

  if (!settings.mobile) {
    throw new Error("未配置手机号(mobile)，请在设置中配置")
  }

  if (!settings.password) {
    throw new Error("未配置密码(password)，请在设置中配置")
  }

  const telecom = new Telecom()
  return await telecom.fetch_data()
}