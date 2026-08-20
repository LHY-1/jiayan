# Cloudflare Worker 部署说明

## 需要填入的参数

| 参数 | 在哪获取 | 格式示例 |
|---|---|---|
| **APPID** | 微信公众平台 → 开发 → 基本配置 | `wx1234567890abcdef` |
| **APPSECRET** | 同上 | `xxxxxxxxxxxxxxxxxxxxxxxx` |

---

## 第一步：部署 Cloudflare Worker

1. 打开 https://dash.cloudflare.com → **Workers & Pages**
2. 找到 `jiayan-notify`，点进去
3. 点 **Edit code**，把下面完整的 worker.js 代码粘贴进去
4. 点 **Save and deploy**

---

## 第二步：设置环境变量

在 Worker 页面点 **Settings** → **Variables**

添加两个变量：

```
APPID      = wx你的appID
APPSECRET  = ***
```

点 **Save** → **Deploy**

---

## 第三步：修改小程序代码

打开 `pages/order/order.js`，找到 2 处：

```javascript
url: 'TODO_WORKER_DOMAIN/push',
```

替换为你的 Worker 域名：

```javascript
url: 'https://jiayan-notify.1435127904.workers.dev/push',
```

---

## 第四步：获取用户 openid

在 `app.js` 的 `onLaunch` 里加：

```javascript
if (wx.cloud) {
  wx.cloud.init({ env: wx.cloud.DYNAMIC_CURRENT_ENV })
  wx.cloud.callFunction({ name: 'getOpenId' })
    .then(res => wx.setStorageSync('user_openid', res.result.openid))
    .catch(() => {})
}
```

---

## 第五步：模板字段名（已完成 ✅）

| 模板 | 菜品名称 | 时间 | 用户 |
|---|---|---|---|
| 下单通知 | `thing5` | `time1` | `thing4` |
| 完成通知 | `thing4` | `time1` | `thing3` |

worker.js 里已按上述字段名写好了，无需再改。

---

## 完整 worker.js 代码

```javascript
/**
 * Cloudflare Worker：微信订阅消息推送
 *
 * 环境变量（在 Cloudflare Dashboard → Settings → Variables 设置）：
 *   APPID      - 小程序 appID
 *   APPSECRET  - 小程序 appSecret
 *
 * 调用方式：
 *   POST https://jiayan-notify.1435127904.workers.dev/push
 *   Body: { openid, templateId, items, total, orderTime }
 */

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/push') {
      return jsonResponse({ code: 404, msg: 'Not Found' }, 404)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400)
    }

    const { openid, templateId, items, total, orderTime } = body

    if (!openid || !templateId) {
      return jsonResponse({ code: 400, msg: '缺少 openid 或 templateId' }, 400)
    }

    try {
      const result = await sendSubscribeMessage(env, {
        openid,
        templateId,
        items: items || [],
        total: total || 0,
        orderTime: orderTime || new Date().toISOString(),
        page: 'pages/order/order'
      })
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ code: -1, msg: err.message }, 500)
    }
  }
}

// ==================== 核心逻辑 ====================

const SUBMIT_TEMPLATE_ID = 'Q5yDGEZM1o23liVkmMLZ4sltKDSop3tukazyfy21yBc'
const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc'

async function sendSubscribeMessage(env, params) {
  const { openid, templateId, items, total, orderTime, page } = params

  // 1. 获取 access_token
  const { access_token } = await getAccessToken(env)

  // 2. 组装消息内容（根据模板类型选择不同的字段名）
  const data = templateId === FINISH_TEMPLATE_ID
    ? buildFinishMessageData(items, total, orderTime)
    : buildSubmitMessageData(items, total, orderTime)

  // 3. 调用微信订阅消息 API
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=***}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: openid,
        template_id: templateId,
        page: page || 'pages/order/order',
        data
      })
    }
  )

  const result = await res.json()
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`微信API错误: ${result.errmsg} (code=${result.errcode})`)
  }
  return { code: 0, msg: 'success' }
}

// ========== 下单通知模板字段 ==========
// 模板：家庭点餐下单完成通知
// 字段：菜品名称(thing5)、下单时间(time1)、下单用户(thing4)
function buildSubmitMessageData(items, total, orderTime) {
  const itemStr = items.length > 0
    ? items.map(i => `${i.name || i}×${i.qty || 1}`).join('、')
    : '已下单'

  return {
    thing5: { value: itemStr },    // 菜品名称
    time1:  { value: formatTime(orderTime) },  // 下单时间
    thing4: { value: '原' }        // 下单用户
  }
}

// ========== 完成通知模板字段 ==========
// 模板：家庭点餐订单完成通知
// 字段：菜品名称(thing4)、完成时间(time1)、完成用户(thing3)
function buildFinishMessageData(items, total, orderTime) {
  const itemStr = items.length > 0
    ? items.map(i => `${i.name || i}×${i.qty || 1}`).join('、')
    : '已下单'

  return {
    thing4: { value: itemStr },    // 菜品名称
    time1:  { value: formatTime(orderTime) },  // 完成时间
    thing3: { value: '厨师' }      // 完成用户
  }
}

async function getAccessToken(env) {
  const appid = env.APPID
  const secret = env.APPSECRET

  if (!appid || !secret) {
    throw new Error('请设置环境变量 APPID 和 APPSECRET')
  }

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=***}`
  )
  const data = await res.json()

  if (data.errcode) {
    throw new Error(`获取token失败: ${data.errmsg}`)
  }
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
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}
```

---

## 消息流转说明

```
用户下单
  ↓ 弹出订阅授权（同时请求两个模板）
  ↓ 用户点击"允许"
  ↓ _pushWechatNotify() → POST 到 Cloudflare Worker
  ↓ Worker 调微信 API 推送「下单通知」到用户微信
  ↓
厨师接单 → 点击"完成做菜"
  ↓ _pushFinishNotify() → POST 到 Cloudflare Worker
  ↓ Worker 调微信 API 推送「完成通知」到用户微信
```
