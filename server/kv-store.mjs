/**
 * Cloudflare KV 适配：用于 Pages Functions / Workers 运行时持久化「应用状态」（自选股/规则/设置），
 * 实现跨设备同步。仅在 env.FM_STATE 绑定存在时使用；否则由 state-store 回退到 COS（Node/SCF 运行时）。
 *
 * KV 命名空间绑定名固定为 FM_STATE（在 Cloudflare Pages 项目 Settings → Functions → KV namespace bindings 中绑定）。
 */
export async function kvGetJson(env, key) {
  const ns = env && env.FM_STATE
  if (!ns) return null
  const raw = await ns.get(key, { type: 'text' })
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function kvPutJson(env, key, data) {
  const ns = env && env.FM_STATE
  if (!ns) throw new Error('KV 未绑定：FM_STATE')
  await ns.put(key, JSON.stringify(data))
  return true
}
