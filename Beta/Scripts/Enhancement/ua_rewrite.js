/* =========================================================
 * 模块分类 · 请求头改写 / User-Agent / Egern 原生版
 * 作者 · ByteValley
 * 版本 · 2026-04-04R1
 *
 * 模块分类 · 说明
 * · 运行方式：Egern http_request 脚本
 * · 用途：在请求发出前修改 User-Agent
 * · 环境变量：
 *   UA      = 要写入的 User-Agent
 *   REMOVE  = 是否先删除原 User-Agent，1=先删后写，0=直接覆盖
 * ========================================================= */

export default async function (ctx) {
  try {
    const env = ctx.env || {};
    const ua = String(env.UA || "").trim();
    const removeFirst = String(env.REMOVE || "0") === "1";

    if (!ctx?.request?.headers) {
      console.log("[UARewrite] 当前请求对象不支持 headers，跳过");
      return;
    }

    if (!ua) {
      console.log("[UARewrite] 未提供 UA，跳过");
      return;
    }

    const headers = ctx.request.headers;
    const oldUA = headers.get("User-Agent") || "";

    if (removeFirst && headers.has("User-Agent")) {
      headers.delete("User-Agent");
    }

    headers.set("User-Agent", ua);

    console.log(
      `[UARewrite] 修改完成, old=${oldUA || "(empty)"}, new=${ua}, url=${ctx.request.url}`
    );

    return {
      headers
    };
  } catch (e) {
    console.log(`[UARewrite] 改写失败: ${String(e)}`);
  }
}
