# 厨师唯一身份功能部署指南

## 修改内容

### 1. 小程序代码
- ✅ 增加"取消厨师身份"按钮
- ✅ 点击确认后同步到云端
- ✅ 点击取消后清除云端身份
- ✅ onShow 时检查云端厨师身份是否一致
- ✅ 其他人确认厨师身份时，自动取消当前用户的厨师身份
- ✅ 每道菜分开推送（开始做/完成）

### 2. Worker 代码
- ✅ 新增 `/chef` 接口（POST 管理、GET 获取）
- ✅ 使用 CHEF_KV 存储当前厨师 openid

---

## 部署步骤

### 第一步：在 Cloudflare Dashboard 创建 CHEF_KV 命名空间

1. 打开 https://dash.cloudflare.com
2. 进入 **Workers & Pages**
3. 找到 `jiayan-notify`，点进去
4. 点 **Settings** → **Variables**
5. 找到 **KV Namespace** 部分
6. 点击 **Add Binding**
7. 填写：
   - Variable name: `CHEF_KV`
   - Namespace ID: 需要先创建
8. 点击 **Create a new namespace**:
   - Title: `jiayan-chef`
   - Click **Create**
   - 复制生成的 Namespace ID

### 第二步：复制完整 worker.js 代码

在 Cloudflare Dashboard → Workers & Pages → `jiayan-notify` → **Edit code**

粘贴以下完整代码：

```javascript
/**
 * Cloudflare Worker：微信订阅消息推送
 *
 * 环境变量（Settings → Variables）：
 *   APPID      = wxbc65e40b13a9de88
 *   APPSECRET  = ***
 *
 * KV 命名空间绑定：
 *   ORDERS_KV  = d41d8cd98f00b204e9800998ecf8427e
 *   CHEF_KV    = （新建的 namespace ID）
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
    // POST /chef — 管理厨师身份
    if (request.method === 'POST' && url.pathname === '/chef') {
      return handleChef(request, env)
    }
    // GET /chef — 获取当前厨师openid
    if (request.method === 'GET' && url.pathname === '/chef') {
      return handleGetChef(env)
    }
    if (request.method !== 'POST' || url.pathname !== '/push') {
      return jsonResponse({ code: 404, msg: 'Not Found' }, 404)
    }
    let body
    try { body = await request.json() } catch {
      return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400)
    }
    const { openid, templateId, items, total, orderTime } = body
    if (!openid || !templateId) {
      return jsonResponse({ code: 400, msg: '缺少 openid 或 templateId' }, 400)
    }
    try {
      const result = await sendSubscribeMessage(env, { openid, templateId, items, total, orderTime, page: 'pages/order/order' })
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
// 厨师 KV 键名（当前唯一厨师openid）
const CHEF_KV_KEY = 'current_chef'

async function sendSubscribeMessage(env, params) {
  const { openid, templateId, items, total, orderTime, page } = params
  const { access_token } = await getAccessToken(env)
  const data = templateId === FINISH_TEMPLATE_ID
    ? buildFinishMessageData(items)
    : buildSubmitMessageData(items, orderTime)
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

// 管理厨师身份（唯一厨师）
async function handleChef(request, env) {
  let body
  try { body = await request.json() } catch {
    return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400)
  }
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

// 获取当前云端厨师openid
async function handleGetChef(env) {
  const openid = await env.CHEF_KV.get(CHEF_KV_KEY)
  return jsonResponse({ code: 0, chefOpenid: openid || '' })
}

function buildSubmitMessageData(items, orderTime) {
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  return { thing5: { value: itemStr }, time1: { value: formatTime(orderTime) }, thing4: { value: '原' } }
}

function buildFinishMessageData(items) {
  const itemStr = items.length > 0 ? items.map(i => `${i.name||i}×${i.qty||1}`).join('、') : '已下单'
  return { thing4: { value: itemStr }, time1: { value: formatTime(new Date().toISOString()) }, thing3: { value: '厨师' } }
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
```

### 第三步：保存并部署

1. 点击 **Save and deploy**
2. 等待部署完成

---

## 测试步骤

### 测试一：唯一厨师身份
1. 设备A 切到厨师视角
2. 点击「👨‍🍳 我是厨师，确认身份」
3. 按钮显示「✅ 已确认（唯一厨师）」
4. 设备B 切到厨师视角
5. 应该显示「其他设备已确认厨师身份」
6. 设备B 没有订单列表

### 测试二：取消厨师身份
1. 设备A 点击「❌ 取消厨师身份」
2. 按钮消失，显示「点击确认成为唯一厨师」
3. 设备B 切到厨师视角
4. 可以正常点击确认成为厨师

### 测试三：推送流程
1. 设备A 确认厨师身份
2. 设备B 下单
3. 设备A 收到推送（如果订阅了）
4. 设备A 点击「👨‍🍳 开始做」
5. 设备B 收到推送（如果订阅了）
6. 设备A 点击「✅ 完成」
7. 设备B 收到推送（如果订阅了）

---

## 推送流程图

```
下单者下单
    ↓
┌──────────────────────┐
│ 推送给厨师（汇总）     │
│ 红烧肉×1 番茄蛋×1     │
└──────────────────────┘
    ↓
┌──────────────────────┐
│ 推送给下单者（汇总）   │
│ 红烧肉×1 番茄蛋×1     │
└──────────────────────┘

厨师开始做菜
    ↓
┌──────────────────────┐
│ 推送给下单者（每道菜）  │
│ 红烧肉 → 开始制作      │
│ 番茄蛋 → 开始制作      │
└──────────────────────┘

厨师完成做菜
    ↓
┌──────────────────────┐
│ 推送给下单者（每道菜）  │
│ 红烧肉 → 完成          │
│ 番茄蛋 → 完成          │
└──────────────────────┘
```
