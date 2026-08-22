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
const PROGRESS_TEMPLATE_ID = 'R8v98WywhsIZo5HJb6w--TgWtZhYbTAKszM-0vCLOEU'
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

// 订单 KV 键名（所有订单列表）
const ALL_ORDERS_KV_KEY = 'all_orders'

async function sendSubscribeMessage(env, params) {
  const { openid, templateId, items, orderTime, page, orderer, status } = params
  const { access_token } = await getAccessToken(env)
  let data
  if (templateId === PROGRESS_TEMPLATE_ID) {
    data = buildProgressMessageData(items, status)
  } else if (templateId === FINISH_TEMPLATE_ID) {
    data = buildFinishMessageData(items, orderTime)
  } else {
    data = buildSubmitMessageData(items, orderTime, orderer)
  }
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

  const raw = await env.ORDERS_KV.get(ALL_ORDERS_KV_KEY)
  let orders = raw ? JSON.parse(raw) : []
  const idx = orders.findIndex(o => o.id === order.id)
  if (idx >= 0) { orders[idx] = order }
  else { orders.unshift(order) }
  if (orders.length > 100) orders = orders.slice(0, 100)
  await env.ORDERS_KV.put(ALL_ORDERS_KV_KEY, JSON.stringify(orders), { expirationTtl: 86400 * 7 })
  return jsonResponse({ code: 0 })
}

// 拉取所有订单
async function handleFetchOrders(env) {
  const raw = await env.ORDERS_KV.get(ALL_ORDERS_KV_KEY)
  const orders = raw ? JSON.parse(raw) : []
  return jsonResponse({ code: 0, orders })
}

// 删除订单
async function handleDeleteOrder(request, env) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('id')
  const dishId = url.searchParams.get('dishId')
  if (!orderId) return jsonResponse({ code: 400, msg: '缺少 order id' }, 400)

  const raw = await env.ORDERS_KV.get(ALL_ORDERS_KV_KEY)
  let orders = raw ? JSON.parse(raw) : []

  // 如果指定了 dishId，只删这道菜
  if (dishId) {
    const order = orders.find(o => o.id === Number(orderId))
    if (!order) return jsonResponse({ code: 404, msg: '订单不存在' }, 404)
    order.items = (order.items || []).filter(d => d.id !== Number(dishId))
    // 如果订单里没菜了，删整个订单
    if (order.items.length === 0) {
      orders = orders.filter(o => o.id !== Number(orderId))
    } else {
      order.status = deriveOrderStatus(order)
    }
  } else {
    // 没指定 dishId，删整个订单
    orders = orders.filter(o => o.id !== Number(orderId))
  }
  await env.ORDERS_KV.put(ALL_ORDERS_KV_KEY, JSON.stringify(orders), { expirationTtl: 86400 * 7 })
  return jsonResponse({ code: 0, msg: '删除成功' })
}

// 派生订单状态
function deriveOrderStatus(order) {
  const items = order.items || []
  if (items.length === 0) return '已下单'
  const allDone = items.every(i => (i.status || '已下单') === '已完成')
  if (allDone) return '已完成'
  const anyCooking = items.some(i => (i.status || '已下单') === '烹饪中')
  return anyCooking ? '烹饪中' : '已下单'
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
async function handlePush(request, env) {
  let body
  try { body = await request.json() } catch { return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400) }
  const { openid, templateId, action, items, orderTime, orderer, status } = body
  if (!openid) {
    return jsonResponse({ code: 400, msg: '缺少 openid' }, 400)
  }
  // 优先使用 templateId，其次根据 action 推断
  let tid = templateId
  if (!tid) {
    if (action === 'finish') tid = FINISH_TEMPLATE_ID
    else if (action === 'start') tid = PROGRESS_TEMPLATE_ID
    else tid = SUBMIT_TEMPLATE_ID
  }
  try {
    const result = await sendSubscribeMessage(env, {
      openid,
      templateId: tid,
      items: items || [],
      orderTime: orderTime || new Date().toISOString(),
      page: 'pages/history/history',
      orderer: orderer || '家人',
      status: action || status || ''
    })
    return jsonResponse(result)
  } catch (err) {
    return jsonResponse({ code: -1, msg: err.message }, 500)
  }
}

// 新订单通知（推给厨师）：菜品名称(thing5)、下单时间(time1)、下单用户(thing4)
function buildSubmitMessageData(items, orderTime, orderer) {
  items = items || []
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  const name = (orderer && orderer.trim()) || '家人'
  return { thing5: { value: itemStr }, time1: { value: formatTime(orderTime) }, thing4: { value: name } }
}

// 完成通知（推给下单者）：菜品名称(thing4)、完成时间(time1)、完成用户(thing3)
function buildFinishMessageData(items, orderTime) {
  items = items || []
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  return { thing4: { value: itemStr }, time1: { value: formatTime(orderTime || new Date().toISOString()) }, thing3: { value: '厨师' } }
}

// 订单进度通知：当前状态(phrase2)、商品名称(thing6)
function buildProgressMessageData(items, status) {
  items = items || []
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '菜品'
  const phraseMap = {
    'start': '开始制作',
    'finish': '已完成',
    'pending': '已接单'
  }
  const phrase = phraseMap[status] || status || '开始制作'
  return { phrase2: { value: phrase }, thing6: { value: itemStr } }
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
