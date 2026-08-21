/**
 * Cloudflare Worker：微信订阅消息推送
 *
 * 环境变量（Settings → Variables）：
 *   APPID      = wxbc65e40b13a9de88
 *   APPSECRET  = 0b7770…52ca
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }
    const url = new URL(request.url)
    // POST /decode — 用 code 换 openid
    if (request.method === 'POST' && url.pathname === '/decode') {
      return handleDecode(request, env)
    }
    // POST /order — 上传订单
    if (request.method === 'POST' && url.pathname === '/order') {
      return handleUploadOrder(request, env)
    }
    // DELETE /order — 删除订单
    if (request.method === 'DELETE' && url.pathname === '/order') {
      return handleDeleteOrder(request, env)
    }
    // GET /orders — 拉取所有订单
    if (request.method === 'GET' && url.pathname === '/orders') {
      return handleFetchOrders(env)
    }
    if (request.method !== 'POST' || url.pathname !== '/push') {
      return jsonResponse({ code: 404, msg: 'Not Found' }, 404)
    }
    let body
    try { body = await request.json() } catch {
      return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400)
    }
    const { openid, templateId, items, total, orderTime, page, orderer } = body
    if (!openid || !templateId) {
      return jsonResponse({ code: 400, msg: '缺少 openid 或 templateId' }, 400)
    }
    try {
      const result = await sendSubscribeMessage(env, { openid, templateId, items, total, orderTime, page, orderer })
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ code: -1, msg: err.message }, 500)
    }
  }
}

async function handleDecode(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { code } = body
  if (!code) return jsonResponse({ code: 400, msg: '缺少 code' }, 400)
  try {
    const res = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${env.APPID}&secret=${env.APPSECRET}&js_code=${code}&grant_type=authorization_code`
    )
    const data = await res.json()
    if (data.errcode) return jsonResponse({ code: -1, msg: data.errmsg }, 400)
    return jsonResponse({ openid: data.openid })
  } catch (err) {
    return jsonResponse({ code: -1, msg: err.message }, 500)
  }
}

const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc'

// 订单 KV 键名（所有订单列表）
const ORDERS_KV_KEY = 'all_orders'

async function sendSubscribeMessage(env, params) {
  const { openid, templateId, items, total, orderTime, page, orderer } = params
  const { access_token } = await getAccessToken(env)
  const data = templateId === FINISH_TEMPLATE_ID
    ? buildFinishMessageData(items)
    : buildSubmitMessageData(items, orderTime, orderer)
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${access_token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ touser: openid, template_id: templateId, page, data }) }
  )
  const result = await res.json()
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`微信API错误: ${result.errmsg} (code=${result.errcode})`)
  }
  return { code: 0, msg: 'success' }
}

// 上传订单到云端
async function handleUploadOrder(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { order } = body
  if (!order || !order.id) return jsonResponse({ code: 400, msg: '缺少 order 或 order.id' }, 400)

  const raw = await env.ORDERS_KV.get(ORDERS_KV_KEY)
  let orders = raw ? JSON.parse(raw) : []
  // 更新或插入
  const idx = orders.findIndex(o => o.id === order.id)
  if (idx >= 0) { orders[idx] = order }
  else { orders.unshift(order) }
  // 保留最近100条
  if (orders.length > 100) orders = orders.slice(0, 100)
  await env.ORDERS_KV.put(ORDERS_KV_KEY, JSON.stringify(orders), { expirationTtl: 86400 * 7 })
  return jsonResponse({ code: 0 })
}

// 拉取云端订单
async function handleFetchOrders(env) {
  const raw = await env.ORDERS_KV.get(ORDERS_KV_KEY)
  const orders = raw ? JSON.parse(raw) : []
  return jsonResponse({ code: 0, orders })
}

// 删除云端订单
async function handleDeleteOrder(request, env) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('id')
  if (!orderId) return jsonResponse({ code: 400, msg: '缺少 order id' }, 400)

  const raw = await env.ORDERS_KV.get(ORDERS_KV_KEY)
  let orders = raw ? JSON.parse(raw) : []
  orders = orders.filter(o => o.id !== Number(orderId))
  await env.ORDERS_KV.put(ORDERS_KV_KEY, JSON.stringify(orders), { expirationTtl: 86400 * 7 })
  return jsonResponse({ code: 0, msg: '删除成功' })
}

function buildSubmitMessageData(items, orderTime, orderer) {
  items = items || []
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  const name = (orderer && orderer.trim()) || '家人'
  return { thing5: { value: itemStr }, time1: { value: formatTime(orderTime) }, thing4: { value: name } }
}

function buildFinishMessageData(items, orderTime) {
  items = items || []
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  return { thing4: { value: itemStr }, time1: { value: formatTime(orderTime || new Date().toISOString()) }, thing3: { value: '厨师' } }
}

async function getAccessToken(env) {
  if (!env.APPID || !env.APPSECRET) throw new Error('请设置环境变量 APPID 和 APPSECRET')
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.APPID}&secret=${env.APPSECRET}`)
  const data = await res.json()
  if (data.errcode) throw new Error(`获取token失败: ${data.errmsg}`)
  return { access_token: data.access_token }
}

function formatTime(isoStr) {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
}
