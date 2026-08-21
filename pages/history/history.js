// pages/history/history.js
const WORKER_URL = 'https://cook.071601.xyz'

Page({
  data: {
    orders: [],
    isEmpty: true
  },

  onShow() {
    this.loadOrders()
  },

  loadOrders() {
    wx.showLoading({ title: '加载中' })
    wx.request({
      url: WORKER_URL + '/orders',
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        wx.hideLoading()
        const orders = (res.data && res.data.orders) || []
        const enriched = orders.map(order => ({
          ...order,
          showDetail: false,
          timeStr: this._formatTime(order.time),
          itemsStr: order.items.map(i => `${i.name} ×${i.qty}`).join('、')
        })).sort((a, b) => b.id - a.id)
        this.setData({ orders: enriched, isEmpty: enriched.length === 0 })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  _formatTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  toggleDetail(e) {
    const id = e.currentTarget.dataset.id
    const orders = this.data.orders.map(o => {
      if (o.id === id) o.showDetail = !o.showDetail
      return o
    })
    this.setData({ orders })
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id
    const order = this.data.orders.find(o => o.id === id)
    if (!order) return
    wx.showModal({
      title: '删除订单',
      content: `删除 ${order.timeStr} 的订单？`,
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: WORKER_URL + '/order?id=' + id,
            method: 'DELETE',
            success: () => {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadOrders()
            },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  clearAll() {
    wx.showModal({
      title: '清空全部',
      content: '确定清空所有订单记录？',
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: WORKER_URL + '/orders',
            method: 'GET',
            success: (res) => {
              const orders = (res.data && res.data.orders) || []
              let remaining = [...orders]
              const doDelete = () => {
                if (remaining.length === 0) {
                  this.loadOrders()
                  wx.showToast({ title: '已清空', icon: 'success' })
                  return
                }
                const order = remaining.pop()
                wx.request({
                  url: WORKER_URL + '/order?id=' + order.id,
                  method: 'DELETE',
                  success: () => doDelete(),
                  fail: () => { this.loadOrders(); wx.showToast({ title: '已清空', icon: 'success' }) }
                })
              }
              doDelete()
            }
          })
        }
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
