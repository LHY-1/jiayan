/**
 * Cloudflare Worker：微信订阅消息推送 + 订单云端同步 + 厨师身份管理
 * 
 * 自动部署到 jiayan-notify
 * 环境变量（Settings → Variables）：
 *   APPID      = wxbc65e40b13a9de88
 *   APPSECRET  = 你的小程序 appSecret
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
    // POST /order — 上传/更新订单
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
    // POST /chef — 管理厨师身份
    if (request.method === 'POST' && url.pathname === '/chef') {
      return handleChef(request, env)
    }
    // GET /chef — 获取当前厨师openid
    if (request.method === 'GET' && url.pathname === '/chef') {
      return handleGetChef(env)
    }
    // GET /menu — 拉取云端菜单
    if (request.method === 'GET' && url.pathname === '/menu') {
      return handleFetchMenu(env)
    }
    // POST /menu — 保存云端菜单
    if (request.method === 'POST' && url.pathname === '/menu') {
      return handleSaveMenu(request, env)
    }
    // POST /push — 推送订阅消息
    if (request.method === 'POST' && url.pathname === '/push') {
      return handlePush(request, env)
    }
    return jsonResponse({ code: 404, msg: 'Not Found' }, 404)
  }
}

// ==================== 常量 ====================

const SUBMIT_TEMPLATE_ID = 'Q5yDGEZM1o23liVkmMLZ4sltKDSop3tukazyfy21yBc'
const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc'
const ORDERS_KV_KEY = 'orders'
const CHEF_KV_KEY = 'chef_openid'

// 菜单 KV 键名
const MENU_KV_KEY = 'jiayan_menu'

// ==================== 路由处理 ====================

// 用 code 换 openid
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

// 上传/更新订单
async function handleUploadOrder(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { order } = body
  if (!order || !order.id) return jsonResponse({ code: 400, msg: '缺少 order 或 order.id' }, 400)

  const raw = await env.ORDERS_KV.get(ORDERS_KV_KEY)
  let orders = raw ? JSON.parse(raw) : []
  const idx = orders.findIndex(o => o.id === order.id)
  if (idx >= 0) { orders[idx] = order }
  else { orders.unshift(order) }
  if (orders.length > 100) orders = orders.slice(0, 100)
  await env.ORDERS_KV.put(ORDERS_KV_KEY, JSON.stringify(orders), { expirationTtl: 86400 * 7 })
  return jsonResponse({ code: 0 })
}

// 拉取所有订单
async function handleFetchOrders(env) {
  const raw = await env.ORDERS_KV.get(ORDERS_KV_KEY)
  const orders = raw ? JSON.parse(raw) : []
  return jsonResponse({ code: 0, orders })
}

// 删除订单
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

// 管理厨师身份（唯一厨师）
async function handleChef(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { action, openid } = body
  if (action === 'set' && openid) {
    await env.CHEF_KV.put(CHEF_KV_KEY, openid, { expirationTtl: 86400 * 7 })
    return jsonResponse({ code: 0, msg: '厨师身份已更新' })
  }
  if (action === 'cancel') {
    await env.CHEF_KV.delete(CHEF_KV_KEY)
    return jsonResponse({ code: 0, msg: '厨师身份已清除' })
  }
  return jsonResponse({ code: 400, msg: 'Invalid action' }, 400)
}

// 获取当前厨师 openid
async function handleGetChef(env) {
  const openid = await env.CHEF_KV.get(CHEF_KV_KEY)
  return jsonResponse({ code: 0, chefOpenid: openid || '' })
}

// 拉取云端菜单
async function handleFetchMenu(env) {
  const raw = await env.ORDERS_KV.get(MENU_KV_KEY)
  const dishes = raw ? JSON.parse(raw) : null
  return jsonResponse({ code: 0, dishes })
}

// 保存云端菜单
async function handleSaveMenu(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { dishes } = body
  if (!dishes || !Array.isArray(dishes)) {
    return jsonResponse({ code: 400, msg: '缺少 dishes 数组' }, 400)
  }
  await env.ORDERS_KV.put(MENU_KV_KEY, JSON.stringify(dishes), { expirationTtl: 86400 * 30 })
  return jsonResponse({ code: 0, msg: '菜单已保存' })
}

// 推送订阅消息
// body: { openid, action: 'submit'|'start'|'finish', items, total, orderTime }
async function handlePush(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { openid, action, items, total, orderTime } = body
  if (!openid) {
    return jsonResponse({ code: 400, msg: '缺少 openid' }, 400)
  }
  try {
    const result = await sendSubscribeMessage(env, {
      openid,
      action: action || 'submit',
      items: items || [], total: total || 0,
      orderTime: orderTime || new Date().toISOString(),
      page: 'pages/order/order'
    })
    return jsonResponse(result)
  } catch (err) {
    return jsonResponse({ code: -1, msg: err.message }, 500)
  }
}

// ==================== 核心逻辑 ====================

async function sendSubscribeMessage(env, params) {
  const { openid, action, items, total, orderTime, page } = params
  const { access_token } = await getAccessToken(env)
  // 按消息类型选模板和字段
  let templateId = SUBMIT_TEMPLATE_ID
  let data
  if (action === 'finish') {
    templateId = FINISH_TEMPLATE_ID
    data = buildFinishMessageData(items, total, orderTime)
  } else if (action === 'start') {
    // 开始做：复用下单通知模板，语义是「厨师开始做这道菜」
    templateId = SUBMIT_TEMPLATE_ID
    data = buildStartMessageData(items, total, orderTime)
  } else {
    // submit：新订单通知（推给厨师）
    templateId = SUBMIT_TEMPLATE_ID
    data = buildSubmitMessageData(items, total, orderTime)
  }
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${access_token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, template_id: templateId, page, data }) }
  )
  const result = await res.json()
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`微信API错误: ${result.errmsg} (code=${result.errcode})`)
  }
  return { code: 0, msg: 'success' }
}

// 新订单通知（推给厨师）：菜品名称(thing5)、下单时间(time1)、下单用户(thing4)
function buildSubmitMessageData(items, total, orderTime) {
  const itemStr = items.length > 0
    ? items.map(i => `${i.name || i}×${i.qty || 1}`).join('、')
    : '已下单'
  return {
    thing5: { value: itemStr.slice(0, 20) },
    time1:  { value: formatTime(orderTime) },
    thing4: { value: '原' }
  }
}

// 开始做通知（推给下单者）：菜品名称(thing5)、开始时间(time1)、制作人(thing4)
function buildStartMessageData(items, total, orderTime) {
  const itemStr = items.length > 0
    ? items.map(i => `${i.name || i}×${i.qty || 1}`).join('、')
    : '已开始'
  return {
    thing5: { value: itemStr.slice(0, 20) },
    time1:  { value: formatTime(orderTime || new Date().toISOString()) },
    thing4: { value: '厨师' }
  }
}

// 完成通知（推给下单者）：菜品名称(thing4)、完成时间(time1)、完成用户(thing3)
function buildFinishMessageData(items, total, orderTime) {
  const itemStr = items.length > 0
    ? items.map(i => `${i.name || i}×${i.qty || 1}`).join('、')
    : '已下单'
  return {
    thing4: { value: itemStr.slice(0, 20) },
    time1:  { value: formatTime(orderTime || new Date().toISOString()) },
    thing3: { value: '厨师' }
  }
}

async function getAccessToken(env) {
  if (!env.APPID || !env.APPSECRET) throw new Error('请设置环境变量 APPID 和 APPSECRET')
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.APPID}&secret=${env.APPSECRET}`
  )
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

// ==================== 工具函数 ====================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}