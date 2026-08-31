/**
 * 腾讯云 API v3（TC3-HMAC-SHA256）签名客户端。
 * 仅用于云函数"修改自身环境变量"（UpdateFunctionConfiguration）。
 * 环境变量：COS_SECRET_ID / COS_SECRET_KEY（与账号主密钥一致）。
 */

import { createHmac, createHash } from 'node:crypto'

function hmacSha256(key, msg) {
  return createHmac('sha256', key).update(msg).digest()
}
function sha256Hex(msg) {
  return createHash('sha256').update(msg).digest('hex')
}

/**
 * 调用腾讯云 API v3。
 * @param {object} opts { service, host, action, version, region, payload }
 */
export async function tc3Call({ service, host, action, version, region, payload = {} }) {
  const secretId = process.env.COS_SECRET_ID
  const secretKey = process.env.COS_SECRET_KEY
  if (!secretId || !secretKey) throw new Error('腾讯云密钥缺失')

  const now = new Date()
  const timestamp = Math.floor(now.getTime() / 1000)
  const date = now.toISOString().slice(0, 10)

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedPayload = sha256Hex(JSON.stringify(payload))
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`

  const secretDate = hmacSha256('TC3' + secretKey, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
      Authorization: authorization,
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}
