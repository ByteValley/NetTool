// Spotify Web API: PKCE OAuth, current playback and player controls.
// Tokens and the temporary PKCE verifier are kept in the Scripting Keychain.

declare const fetch: (input: string, init?: any) => Promise<any>
declare const btoa: (input: string) => string

// Spotify now requires secure HTTPS redirect URIs for Web API OAuth apps.
// This GitHub Pages route is intercepted by shouldAllowRequest before it loads.
export const SPOTIFY_REDIRECT_URI = "https://bytevalley.github.io/NetTool/spotify-lyrics/callback/"
export const SPOTIFY_SCOPES = "user-read-playback-state user-modify-playback-state"

const TOKEN_KEY = "spotify.oauth.tokens"
const VERIFIER_KEY = "spotify.oauth.verifier"
const STATE_KEY = "spotify.oauth.state"
const API_ROOT = "https://api.spotify.com/v1"
const ACCOUNTS_ROOT = "https://accounts.spotify.com"

export type SpotifyTrack = {
  id: string
  name: string
  artists: Array<{ name: string }>
  album?: {
    name?: string
    images?: Array<{ url: string; width?: number; height?: number }>
  }
  duration_ms: number
  type?: string
}

export type SpotifyPlayback = {
  item: SpotifyTrack | null
  progress_ms: number
  is_playing: boolean
  sampledAt: number
}

type SpotifyTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  authorizedAt: number
  clientId: string
}

function readTokens(): SpotifyTokens | null {
  const raw = Keychain.get(TOKEN_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (
      typeof value?.accessToken === "string" &&
      typeof value?.refreshToken === "string" &&
      typeof value?.expiresAt === "number" &&
      typeof value?.clientId === "string"
    ) return value as SpotifyTokens
  } catch {
    // Treat a damaged credential record as disconnected.
  }
  Keychain.remove(TOKEN_KEY)
  return null
}

export function isSpotifyConnected(): boolean {
  return !!readTokens()
}

export function disconnectSpotify(): void {
  Keychain.remove(TOKEN_KEY)
  Keychain.remove(VERIFIER_KEY)
  Keychain.remove(STATE_KEY)
}

function randomHex(bytes = 32): string {
  // CryptoKit-backed random key generation; hex is valid PKCE verifier material.
  return Crypto.generateSymmetricKey().toHexString().slice(0, bytes * 2)
}

function base64UrlFromHex(hex: string): string {
  let binary = ""
  for (let i = 0; i + 1 < hex.length; i += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function formEncode(values: Record<string, string>): string {
  return Object.keys(values)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key])}`)
    .join("&")
}

function parseQuery(url: string): Record<string, string> {
  const query = url.split("?")[1]?.split("#")[0] ?? ""
  const result: Record<string, string> = {}
  for (const pair of query.split("&")) {
    if (!pair) continue
    const splitAt = pair.indexOf("=")
    const key = splitAt < 0 ? pair : pair.slice(0, splitAt)
    const value = splitAt < 0 ? "" : pair.slice(splitAt + 1)
    try {
      result[decodeURIComponent(key.replace(/\+/g, " "))] = decodeURIComponent(value.replace(/\+/g, " "))
    } catch {
      result[key] = value
    }
  }
  return result
}

async function readResponse(response: any): Promise<any> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Spotify 返回了无效 JSON（HTTP ${response.status}）`)
  }
}

function responseError(data: any, status: number): string {
  const detail = data?.error?.message || data?.error_description || data?.error || `HTTP ${status}`
  return `Spotify API 请求失败：${detail}（HTTP ${status}）`
}

async function exchangeAuthorizationCode(code: string, clientId: string, verifier: string): Promise<void> {
  const response = await fetch(`${ACCOUNTS_ROOT}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  const data = await readResponse(response)
  if (!response.ok || !data?.access_token || !data?.refresh_token) {
    throw new Error(responseError(data, response.status))
  }
  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    authorizedAt: Date.now(),
    clientId,
  }
  if (!Keychain.set(TOKEN_KEY, JSON.stringify(tokens))) {
    throw new Error("无法将 Spotify 授权安全保存到钥匙串")
  }
}

/** Open Spotify sign-in in an isolated WebView and intercept the custom-scheme callback. */
export async function authorizeSpotify(clientIdInput: string): Promise<void> {
  const clientId = clientIdInput.trim()
  if (!clientId) throw new Error("请先填写 Spotify Client ID")

  const verifier = randomHex(32)
  const state = randomHex(16)
  if (!Keychain.set(VERIFIER_KEY, verifier) || !Keychain.set(STATE_KEY, state)) {
    throw new Error("无法安全保存 Spotify 授权临时数据")
  }

  const challenge = base64UrlFromHex(Crypto.sha256(Data.fromString(verifier)!).toHexString())
  const params = formEncode({
    client_id: clientId,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  })
  const authorizationUrl = `${ACCOUNTS_ROOT}/authorize?${params}`
  const webView = new WebViewController({ ephemeral: true })
  let callbackReceived = false
  let resolveCallback: (value: string) => void = () => undefined
  let rejectCallback: (error: Error) => void = () => undefined
  let rejectCancelled: (error: Error) => void = () => undefined
  const callback = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })
  const cancelled = new Promise<string>((_resolve, reject) => {
    rejectCancelled = reject
  })

  webView.shouldAllowRequest = async (request: { url: string }) => {
    const requestUrl = String(request?.url ?? "")
    const callbackPrefix = SPOTIFY_REDIRECT_URI.toLowerCase()
    const normalizedUrl = requestUrl.toLowerCase()
    if (
      normalizedUrl !== callbackPrefix &&
      !normalizedUrl.startsWith(`${callbackPrefix}?`) &&
      !normalizedUrl.startsWith(`${callbackPrefix}#`)
    ) return true
    callbackReceived = true
    const values = parseQuery(requestUrl)
    if (values.state !== state) {
      rejectCallback(new Error("Spotify 授权 state 校验失败，请重新连接"))
    } else if (values.error) {
      rejectCallback(new Error(`Spotify 授权未完成：${values.error}`))
    } else if (!values.code) {
      rejectCallback(new Error("Spotify 没有返回授权码"))
    } else {
      resolveCallback(values.code)
    }
    webView.dismiss()
    return false
  }

  try {
    const loaded = await webView.loadURL(authorizationUrl)
    if (!loaded) throw new Error("无法打开 Spotify 授权页面")
    void webView.present({ navigationTitle: "连接 Spotify" })
      .then(() => {
        if (!callbackReceived) rejectCancelled(new Error("Spotify 授权已取消"))
      })
      .catch((error: any) => rejectCancelled(new Error(String(error?.message ?? error))))
    const code = await Promise.race([callback, cancelled])
    const savedVerifier = Keychain.get(VERIFIER_KEY)
    if (!savedVerifier) throw new Error("Spotify PKCE 校验信息已丢失，请重新连接")
    await exchangeAuthorizationCode(code, clientId, savedVerifier)
  } finally {
    webView.dispose()
    Keychain.remove(VERIFIER_KEY)
    Keychain.remove(STATE_KEY)
  }
}

async function getAccessToken(clientIdInput: string, forceRefresh = false): Promise<string> {
  const clientId = clientIdInput.trim()
  const tokens = readTokens()
  if (!tokens) throw new Error("请先在设置中连接 Spotify")
  if (tokens.clientId !== clientId) {
    disconnectSpotify()
    throw new Error("Spotify Client ID 已更改，请重新连接 Spotify")
  }
  if (!forceRefresh && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken

  const response = await fetch(`${ACCOUNTS_ROOT}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  })
  const data = await readResponse(response)
  if (!response.ok || !data?.access_token) {
    if (data?.error === "invalid_grant") {
      disconnectSpotify()
      throw new Error("Spotify 授权已过期，请重新连接（刷新令牌已失效）")
    }
    throw new Error(responseError(data, response.status))
  }
  const updated: SpotifyTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  }
  if (!Keychain.set(TOKEN_KEY, JSON.stringify(updated))) {
    throw new Error("无法更新 Spotify 授权钥匙串")
  }
  return updated.accessToken
}

async function spotifyRequest(
  path: string,
  clientId: string,
  init: Record<string, unknown> = {},
  retryUnauthorized = true,
): Promise<any> {
  const accessToken = await getAccessToken(clientId)
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers as Record<string, string> | undefined) },
  })
  if (response.status === 401 && retryUnauthorized) {
    const renewed = await getAccessToken(clientId, true)
    return await spotifyRequestWithToken(path, renewed, init)
  }
  if (response.status === 204) return null
  const data = await readResponse(response)
  if (!response.ok) {
    const retryAfter = response.headers?.get?.("Retry-After")
    throw new Error(`${responseError(data, response.status)}${retryAfter ? `；请 ${retryAfter} 秒后重试` : ""}`)
  }
  return data
}

async function spotifyRequestWithToken(path: string, accessToken: string, init: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers as Record<string, string> | undefined) },
  })
  if (response.status === 204) return null
  const data = await readResponse(response)
  if (!response.ok) throw new Error(responseError(data, response.status))
  return data
}

export async function getSpotifyPlayback(clientId: string): Promise<SpotifyPlayback | null> {
  const data = await spotifyRequest("/me/player", clientId)
  if (!data || !data.item || data.item.type !== "track") return null
  const item = data.item as SpotifyTrack
  if (!item.name || !Array.isArray(item.artists) || item.artists.length === 0) return null
  return {
    item,
    progress_ms: Math.max(0, Number(data.progress_ms) || 0),
    is_playing: !!data.is_playing,
    sampledAt: Date.now(),
  }
}

export type SpotifyControl = "play" | "pause" | "next" | "previous"

export async function controlSpotify(clientId: string, action: SpotifyControl): Promise<void> {
  const method = action === "next" || action === "previous" ? "POST" : "PUT"
  const endpoint: Record<SpotifyControl, string> = {
    play: "/me/player/play",
    pause: "/me/player/pause",
    next: "/me/player/next",
    previous: "/me/player/previous",
  }
  await spotifyRequest(endpoint[action], clientId, { method })
}
