/**
 * 腾讯云 COS 对象存储客户端（基于官方 cos-nodejs-sdk-v5）。
 * 用于云函数持久化"应用状态"（自选股/规则/设置），实现跨设备同步。
 * 环境变量：COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION（可选，默认 ap-guangzhou）。
 */

import COS from 'cos-nodejs-sdk-v5'

let client = null
function cosClient() {
  if (client) return client
  const id = process.env.COS_SECRET_ID
  const key = process.env.COS_SECRET_KEY
  const bucket = process.env.COS_BUCKET
  const region = process.env.COS_REGION || 'ap-guangzhou'
  if (!id || !key || !bucket) {
    throw new Error('COS 配置缺失：COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET')
  }
  client = new COS({ SecretId: id, SecretKey: key })
  return client
}

function bucketInfo() {
  return { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION || 'ap-guangzhou' }
}

/** 读取对象内容并解析 JSON；不存在（404）或解析失败返回 null */
export function cosGetJson(key) {
  return new Promise((resolve, reject) => {
    cosClient().getObject({ ...bucketInfo(), Key: key }, (err, data) => {
      if (err) {
        if (err.statusCode === 404) return resolve(null)
        return reject(new Error(`COS GET 失败: ${err.message || err.code || err.statusCode}`))
      }
      try {
        resolve(JSON.parse(data.Body.toString('utf-8')))
      } catch {
        resolve(null)
      }
    })
  })
}

/** 写入对象（JSON，私有 ACL） */
export function cosPutJson(key, data) {
  return new Promise((resolve, reject) => {
    cosClient().putObject(
      {
        ...bucketInfo(),
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json; charset=utf-8',
        ACL: 'private',
      },
      (err) => {
        if (err) return reject(new Error(`COS PUT 失败: ${err.message || err.code || err.statusCode}`))
        resolve(true)
      },
    )
  })
}
