// pages/order/order.js
const SUBMIT_TEMPLATE_ID = 'Q5yDGEZM1o23liVkmMLZ4sltKDSop3tukazyfy21yBc'
const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc'
const WORKER_URL = 'https://cook.071601.xyz'

let _refreshTimer = null

Page({
  data: {
    cart: [], total: 0, totalQty: 0,
    cart: [], total: 0, totalQty: 0,
    role: 'orderer', pendingOrders: [], chefOpenid: '', chefConfirmed: false,
    cloudSyncStatus: '', cloudStatus: ''
  },

  onLoad() {
    this.loadCart()
    this.loadPendingOrders()
  },

  onShow() {
    const role = wx.getStorageSync('user_role') || 'orderer'
    const currentOpenid = getApp().globalData.openid || ''
    // 从云端获取当前厨师身份
    const fetchChefOpenid = () => {
      return new Promise((resolve) => {
        wx.request({
          url: WORKER_URL + '/chef',
          method: 'GET',
          timeout: 5000,
          success: (res) => {
            resolve(res.data && res.data.chefOpenid || '')
          },
          fail: () => resolve('')
        })
      })
    }
    fetchChefOpenid().then(cloudChefOpenid => {
      let localChefOpenid = wx.getStorageSync('chef_openid') || ''
      let chefConfirmed = wx.getStorageSync('chef_confirmed') || false
      // 检查云端厨师身份是否一致
      if (role === 'chef' && localChefOpenid && cloudChefOpenid && localChefOpenid !== cloudChefOpenid) {
        // 其他人是厨师，取消当前用户的厨师身份
        wx.removeStorageSync('chef_openid')
        wx.removeStorageSync('chef_confirmed')
        localChefOpenid = ''
        chefConfirmed = false
        wx.showToast({ title: '其他设备已确认厨师身份', icon: 'none', duration: 2000 })
      }
      this.setData({ role, chefOpenid: localChefOpenid, chefConfirmed })
      this.loadCart()
      this.loadPendingOrders()
      // 厨师视角每30秒自动刷新
      if (_refreshTimer) clearInterval(_refreshTimer)
      if (role === 'chef') {
        _refreshTimer = setInterval(() => this.loadPendingOrders(), 30000)
      }
    })
  },

  onUnload() {
    if (_refreshTimer) clearInterval(_refreshTimer)
  },

  // 取消厨师身份
  cancelChef() {
    wx.removeStorageSync('chef_openid')
    wx.removeStorageSync('chef_confirmed')
    // 同步到云端
    wx.request({
      url: WORKER_URL + '/chef',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { action: 'cancel', openid: '' },
      success: () => {},
      fail: () => {}
    })
    this.setData({ chefOpenid: '', chefConfirmed: false })
    wx.showToast({ title: '已取消厨师身份', icon: 'none' })
  },

  // 确认厨师身份 - 清除旧id，保存当前openid
  confirmChef() {
    const app = getApp()
    const openid = app.globalData.openid
    if (!openid) {
      wx.showToast({ title: '未获取到用户信息', icon: 'none' })
      return
    }
    wx.setStorageSync('chef_openid', openid)
    wx.setStorageSync('chef_confirmed', true)
    this.setData({ chefOpenid: openid, chefConfirmed: true })
    // 请求订阅授权：厨师授权「新订单通知」模板，才能收到下单推送
    if (typeof wx.requestSubscribeMessage === 'function') {
      wx.requestSubscribeMessage({
        tmplIds: [SUBMIT_TEMPLATE_ID],
        success: (res) => {
          if (res[SUBMIT_TEMPLATE_ID] === 'accept') {
            wx.setStorageSync('_chef_subscribed', true)
            console.log('[推送] 厨师已授权新订单通知')
          } else {
            console.log('[推送] 厨师未授权新订单通知')
          }
        },
        fail: (err) => console.error('[推送] 订阅失败', err)
      })
    }
    // 同步到云端，清除其他人的厨师身份
    wx.request({
      url: WORKER_URL + '/chef',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { action: 'set', openid: openid },
      success: () => {
        wx.showToast({ title: '已确认是厨师', icon: 'success' })
      },
      fail: () => {
        wx.showToast({ title: '已确认是厨师', icon: 'success' })
      }
    })
    console.log('[推送] 厨师openid已更新:', openid)
  },

  // 从云端获取当前厨师 openid（下单者设备也能拿到）
  _fetchChefOpenid() {
    return new Promise((resolve) => {
      wx.request({
        url: WORKER_URL + '/chef',
        method: 'GET',
        timeout: 5000,
        success: (res) => {
          resolve((res.data && res.data.chefOpenid) || '')
        },
        fail: () => resolve('')
      })
    })
  },

  // 角色切换
  switchRole() {
    const next = (wx.getStorageSync('user_role') || 'orderer') === 'orderer' ? 'chef' : 'orderer'
    wx.setStorageSync('user_role', next)
    if (next === 'chef') {
      // 切换到厨师时，保存厨师openid
      const app = getApp()
      if (app.globalData.openid) {
        wx.setStorageSync('chef_openid', app.globalData.openid)
      }
      this.loadPendingOrders()
      wx.showToast({ title: '已进入厨师视角', icon: 'none', duration: 1500 })
    } else {
      wx.showToast({ title: '已切回下单视角', icon: 'none', duration: 1500 })
    }
    this.setData({ role: next, chefOpenid: wx.getStorageSync('chef_openid') || '' })
  },

  loadCart() {
    const cart = (wx.getStorageSync('cart') || []).map(i => ({ ...i, subtotal: i.price * i.qty }))
    this.setData({ cart, total: cart.reduce((s, i) => s + i.subtotal, 0), totalQty: cart.reduce((s, i) => s + i.qty, 0) })
  },

  _updateQty(id, delta) {
    let cart = wx.getStorageSync('cart') || []
    const item = cart.find(d => d.id === id)
    if (!item) return
    const newQty = item.qty + delta
    if (newQty <= 0) { wx.setStorageSync('cart', cart.filter(d => d.id !== id)); this.loadCart(); return }
    item.qty = newQty; wx.setStorageSync('cart', cart); this.loadCart()
  },

  increase(e) { this._updateQty(e.currentTarget.dataset.id, 1) },
  decrease(e) { this._updateQty(e.currentTarget.dataset.id, -1) },

  remove(e) {
    const id = Number(e.currentTarget.dataset.id)
    const cart = wx.getStorageSync('cart') || []
    wx.showModal({
      title: '确认移除',
      content: '移除这道菜？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('cart', cart.filter(d => d.id !== id))
          this.loadCart()
        }
      }
    })
  },

  clearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定清空？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('cart', [])
          this.loadCart()
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  // 下单
  submitting: false,
  submitOrder() {
    if (this.submitting) return
    if (!this.data.cart.length) { wx.showToast({ title: '购物车为空', icon: 'none' }); return }
    this.submitting = true

    const app = getApp()
    const ensureOpenId = () => {
      return new Promise((resolve) => {
        if (app.globalData.openidReady && app.globalData.openid) {
          resolve(app.globalData.openid)
          return
        }
        wx.showLoading({ title: '初始化中...' })
        app._ensureOpenId().then(openid => {
          wx.hideLoading()
          resolve(openid)
        }).catch(() => {
          wx.hideLoading()
          resolve('')
        })
      })
    }
    ensureOpenId().then(openid => {
      if (!openid) {
        this.submitting = false
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        return
      }
      this._doSubmitOrder(app, openid)
    })
  },

  _doSubmitOrder(app, openid) {
    if (typeof wx.requestSubscribeMessage !== 'function') {
      this._completeOrder(app, openid)
      return
    }

    // 先保存 pendingItems，以便在回调中使用
    const pendingItems = this.data.cart.map(i => ({ name: i.name, qty: i.qty }))
    wx.requestSubscribeMessage({
      tmplIds: [SUBMIT_TEMPLATE_ID, FINISH_TEMPLATE_ID],
      success: (res) => {
        this.submitting = false
        this._completeOrder(app, openid)
        if (res[SUBMIT_TEMPLATE_ID] === 'accept') {
          // 从云端获取厨师 openid（下单者设备本地没有这个值）
          this._fetchChefOpenid().then(chefOpenid => {
            if (chefOpenid) {
              const chefPayload = {
                openid: chefOpenid,
                templateId: SUBMIT_TEMPLATE_ID,
                items: pendingItems.map(i => ({ name: i.name, qty: i.qty })),
                total: this.data.total,
                orderTime: new Date().toISOString()
              }
              wx.request({
                url: WORKER_URL + '/push',
                method: 'POST',
                header: { 'Content-Type': 'application/json' },
                data: chefPayload,
                success: (res) => console.log('[推送] 厨师', res.data),
                fail: (err) => console.error('[推送] 失败', err)
              })
            } else {
              wx.showToast({ title: '厨师未确认身份', icon: 'none', duration: 2000 })
            }
          })
          // 推给下单的人自己
          this._pushWechatNotify(app, openid, SUBMIT_TEMPLATE_ID)
        }
        if (res[FINISH_TEMPLATE_ID] === 'accept') wx.setStorageSync('_finish_subscribed', true)
      },
      fail: (err) => {
        this.submitting = false
        console.error('[推送] 订阅失败', err)
        this._completeOrder(app, openid)
      }
    })
  },

  _completeOrder(app, openid) {
    const pendingItems = this.data.cart.map(i => ({ name: i.name, qty: i.qty }))
    wx.setStorageSync('_pending_notify', {
      items: pendingItems,
      total: this.data.total,
      orderTime: new Date().toISOString()
    })
    const order = {
      id: Date.now(),
      time: new Date().toISOString(),
      items: this.data.cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, subtotal: i.subtotal })),
      total: this.data.total,
      totalQty: this.data.totalQty,
      status: '已下单',
      ordererOpenid: openid
    }
    this._syncOrderToCloud(order)
    wx.setStorageSync('cart', [])
    this.loadCart()
    this.loadPendingOrders()
    this._addNotification('厨师', '📋 新订单来了',
      `需要做：${pendingItems.map(i => `${i.name}×${i.qty}`).join('、')}，合计 ¥${pendingItems.reduce((s, i) => s + i.qty, 0)}道`, order.id, 'order_notify')
    this._addNotification('下单者', '✅ 订单已提交', `共 ${order.totalQty} 道菜，合计 ¥${order.total}`, order.id)
    wx.showModal({
      title: '✅ 下单成功',
      content: `共 ${order.totalQty} 道菜，合计 ¥${order.total}`,
      showCancel: false,
      success: () => { wx.switchTab({ url: '/pages/index/index' }) }
    })
  },

  _syncOrderToCloud(order) {
    wx.request({
      url: WORKER_URL + '/order',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { order },
      timeout: 10000,
      success: () => {},
      fail: () => {}
    })
  },

  _fetchOrdersFromCloud() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), 8000)
      wx.request({
        url: WORKER_URL + '/orders',
        method: 'GET',
        timeout: 8000,
        success: (res) => {
          clearTimeout(timer)
          resolve(res.data && res.data.orders ? res.data.orders : [])
        },
        fail: () => {
          clearTimeout(timer)
          resolve([])
        }
      })
    })
  },

  _pushWechatNotify(app, openid, templateId) {
    console.log('[推送] openid:', openid, 'templateId:', templateId)
    if (!openid) {
      console.log('[推送] openid 不存在，跳过')
      return
    }
    const pending = wx.getStorageSync('_pending_notify') || {}
    const payload = {
      openid: openid,
      templateId: templateId,
      items: pending.items || [],
      total: pending.total || 0,
      orderTime: pending.orderTime || new Date().toISOString()
    }
    wx.request({
      url: WORKER_URL + '/push',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        console.log('[推送] 结果', res.data)
        if (res.data && res.data.code !== 0) {
          wx.showToast({ title: res.data.msg || '推送失败', icon: 'none' })
        }
      },
      fail: (err) => console.error('[推送] 失败', err)
    })
  },

  // 保存厨师 openid（点击"开始做"时保存，这样完成后能推给下单的人）
  saveChefOpenid() {
    const app = getApp()
    const openid = app.globalData.openid
    if (openid) {
      wx.setStorageSync('chef_openid', openid)
      this.setData({ chefOpenid: openid })
      console.log('[推送] 厨师 openid 已保存:', openid)
    }
  },

  // 厨师操作
  loadPendingOrders() {
    this._fetchOrdersFromCloud().then(cloudOrders => {
      const localCache = {}
      ;(wx.getStorageSync('orderHistory') || []).forEach(o => { localCache[o.id] = o })
      const merged = {}
      cloudOrders.forEach(o => merged[o.id] = o)
      Object.values(localCache).forEach(o => { if (!merged[o.id]) merged[o.id] = o })
      const allOrders = Object.values(merged).sort((a, b) => b.id - a.id)
      const pending = allOrders.filter(o => o.status === '已下单' || o.status === '烹饪中')
      this.setData({ pendingOrders: pending.map(o => ({ ...o, timeStr: this._fmtTime(o.time) })) })
    }).catch(() => {
      const localHistory = wx.getStorageSync('orderHistory') || []
      const pending = localHistory.filter(o => o.status === '已下单' || o.status === '烹饪中')
      this.setData({ pendingOrders: pending.map(o => ({ ...o, timeStr: this._fmtTime(o.time) })) })
    })
  },

  refreshCloudOrders() {
    this.loadPendingOrders()
  },

  deleteOrder(e) {
    const orderId = Number(e.currentTarget.dataset.id)
    wx.showModal({
      title: '删除订单',
      content: '确定删除这条订单？',
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: WORKER_URL + '/order?id=' + orderId,
            method: 'DELETE',
            success: () => {
              const history = wx.getStorageSync('orderHistory') || []
              const idx = history.findIndex(o => o.id === orderId)
              if (idx >= 0) history.splice(idx, 1)
              wx.setStorageSync('orderHistory', history)
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadPendingOrders()
            },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' })
              this.loadPendingOrders()
            }
          })
        }
      }
    })
  },

  startCooking(e) {
    const orderId = Number(e.currentTarget.dataset.id)
    this.saveChefOpenid()
    // 乐观更新：立即改UI，再后台同步云端
    const pending = [...this.data.pendingOrders]
    const order = pending.find(o => o.id === orderId)
    if (order) {
      order.status = '烹饪中'
      this.setData({ pendingOrders: pending })
    }
    this._syncOrderToCloud({ ...order, status: '烹饪中' })
    this._addNotification('下单者', '👨‍🍳 开始做菜', '', orderId, 'status_update')
    wx.showToast({ title: '已开始制作', icon: 'success' })
    // 给下单者推送每道菜的开始通知
    this._pushDishNotifications(order, '开始制作', SUBMIT_TEMPLATE_ID)
  },

  finishCooking(e) {
    const orderId = Number(e.currentTarget.dataset.id)
    const pending = [...this.data.pendingOrders]
    const order = pending.find(o => o.id === orderId)
    if (order) {
      order.status = '已完成'
      this.setData({ pendingOrders: pending })
    }
    this._syncOrderToCloud({ ...order, status: '已完成' })
    this._addNotification('下单者', '🍽️ 菜做好了', '', orderId, 'status_update')
    wx.showToast({ title: '已完成', icon: 'success' })
    // 给下单者推送每道菜的完成通知
    this._pushDishNotifications(order, '完成', FINISH_TEMPLATE_ID)
  },

  // 给下单者推送每道菜的单独通知
  _pushDishNotifications(order, action, templateId) {
    const app = getApp()
    const ordererOpenid = order && order.ordererOpenid || app.globalData.openid
    if (!ordererOpenid) return
    // 每道菜推送一次
    ;(order.items || []).forEach(dish => {
      const payload = {
        openid: ordererOpenid,
        templateId: templateId,
        items: [{ name: dish.name, qty: dish.qty }],
        total: dish.subtotal || dish.price * dish.qty,
        orderTime: new Date().toISOString()
      }
      wx.request({
        url: WORKER_URL + '/push',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: payload,
        success: (res) => {
          console.log('[推送] 菜品通知', dish.name, res.data)
        },
        fail: (err) => console.error('[推送] 失败', err)
      })
    })
  },

  _updateOrderStatus(orderId, newStatus, notifTitle, notifContent) {
    return new Promise((resolve) => {
      wx.request({
        url: WORKER_URL + '/orders',
        method: 'GET',
        timeout: 5000,
        success: (res) => {
          const cloudOrders = (res.data && res.data.orders) || []
          const cloudOrder = cloudOrders.find(o => o.id === orderId)
          if (!cloudOrder) {
            wx.showToast({ title: '订单不存在', icon: 'none' })
            resolve(false)
            return
          }
          cloudOrder.status = newStatus
          wx.setStorageSync('orderHistory', cloudOrders)
          wx.request({
            url: WORKER_URL + '/order',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: { order: cloudOrder },
            success: () => {},
            fail: () => {}
          })
          this._addNotification('下单者', notifTitle, notifContent, orderId, 'status_update')
          wx.showToast({ title: `已标记为「${newStatus}」`, icon: 'success' })
          resolve(true)
        },
        fail: () => {
          const history = wx.getStorageSync('orderHistory') || []
          const order = history.find(o => o.id === orderId)
          if (!order) { wx.showToast({ title: '订单不存在', icon: 'none' }); resolve(false); return }
          order.status = newStatus
          wx.setStorageSync('orderHistory', history)
          wx.showToast({ title: `已标记为「${newStatus}」`, icon: 'success' })
          resolve(true)
        }
      })
    })
  },

  // 测试云端同步
  testCloudSync() {
    wx.showLoading({ title: '测试中...' })
    this.setData({ cloudSyncStatus: '测试中...' })
    this._fetchOrdersFromCloud().then(orders => {
      wx.hideLoading()
      if (orders.length > 0) {
        this.setData({ cloudSyncStatus: `✅ 成功，云端 ${orders.length} 条订单` })
        wx.showToast({ title: `云端 ${orders.length} 条订单`, icon: 'success' })
      } else {
        this.setData({ cloudSyncStatus: '✅ 连接成功，云端暂无订单' })
        wx.showToast({ title: '连接成功，暂无订单', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      this.setData({ cloudSyncStatus: '❌ 连接失败，请检查 Worker 地址' })
      wx.showToast({ title: '连接失败', icon: 'none' })
    })
  },

  _fmtTime(s) {
    const d = new Date(s)
    if (isNaN(d.getTime())) return ''
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },
  goToMenu() { wx.switchTab({ url: '/pages/index/index' }) },
  viewHistory() { wx.navigateTo({ url: '/pages/history/history' }) },

  _addNotification(targetRole, title, content, orderId, type) {
    const list = wx.getStorageSync('notifications') || []
    list.unshift({ id: Date.now(), time: new Date().toISOString(), title, content, orderId, targetRole, type: type || 'general', read: false })
    if (list.length > 50) list.length = 50
    wx.setStorageSync('notifications', list)
  }
})
