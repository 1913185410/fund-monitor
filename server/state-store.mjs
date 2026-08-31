/**
 * 应用状态存储抽象：跨设备同步的「云端」落地点。
 * - 在 Cloudflare Workers / Pages Functions 运行时：使用 KV（env.FM_STATE），原生支持、无额外 SDK。
 * - 在 Node / 腾讯云 SCF 运行时：回退到腾讯云 COS（cos-nodejs-sdk-v5）。
 *
 * 关键点：cos-store 依赖 Node-only 的 cos-nodejs-sdk-v5，绝不能在 Workers 里被静态加载，
 * 因此 COS 分支用动态 import，仅在确属 Node 运行时（无 FM_STATE 绑定）时才加载。
 */
const KEY = 'state/profile.json'

export async function loadState(env) {
  if (env && env.FM_STATE) {
    return kvGet(env, KEY)
  }
  const { cosGetJson } = await import('./cos-store.mjs')
  return cosGetJson(KEY)
}

export async function saveState(env, data) {
  if (env && env.FM_STATE) {
    return kvPut(env, KEY, data)
  }
  const { cosPutJson } = await import('./cos-store.mjs')
  return cosPutJson(KEY, data)
}

// 延迟引入 KV 适配，避免在未绑定时也加载无关模块
async function kvGet(env, key) {
  const { kvGetJson } = await import('./kv-store.mjs')
  return kvGetJson(env, key)
}
async function kvPut(env, key, data) {
  const { kvPutJson } = await import('./kv-store.mjs')
  return kvPutJson(env, KEY, data)
}
