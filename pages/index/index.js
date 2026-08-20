// pages/index/index.js
const { dishes: builtinDishes, categories } = require('../../utils/data');
const { fetchCloudMenu } = require('../../utils/menu-sync');

// 合并所有菜品（内置 + 自定义），和 manage 页一致
function getAllDishes() {
  const cached = wx.getStorageSync('dishes_manage') || []
  const defaults = builtinDishes.map(d => ({ ...d, isUser: false }))
  const merged = defaults.map(d => {
    const override = cached.find(c => c.id === d.id)
    return override ? { ...d, ...override, _override: true } : d
  })
  const customIds = new Set(defaults.map(d => d.id))
  const custom = cached.filter(c => !customIds.has(c.id) && !c._hidden).map(c => ({ ...c, isUser: true, emoji: c.emoji || '🍽️' }))
  return [...merged, ...custom].filter(d => !d._hidden)
}

Page({
  data: {
    dishes: [],
    categories: [],
    activeCategory: 'all',
    filteredDishes: [],
    count: 0,
    cartCount: 0,
    favorites: []
  },

  onLoad() {
    this.setData({ categories })
    this.loadDishes()
  },

  onShow() {
    this.loadDishes()
    this._updateCartCount()
    // 从云端拉取最新菜单（家人编辑后自动同步）
    fetchCloudMenu().then(cloudDishes => {
      if (cloudDishes && cloudDishes.length > 0) {
        wx.setStorageSync('dishes_manage', cloudDishes)
        this.loadDishes()
      }
    })
  },

  loadDishes() {
    const allDishes = getAllDishes()
    const favs = wx.getStorageSync('favorites') || []
    const favIds = favs.map(f => f.id)
    allDishes.forEach(d => { d.favorite = favIds.includes(d.id) })
    this.setData({ dishes: allDishes })
    this.selectCategory(this.data.activeCategory)
  },

  selectCategory(e) {
    let key = 'all'
    if (typeof e === 'string') key = e
    else if (e && e.currentTarget && e.currentTarget.dataset) key = e.currentTarget.dataset.key

    const filtered = key === 'all'
      ? this.data.dishes
      : this.data.dishes.filter(d => d.category === key)
    this.setData({ activeCategory: key, filteredDishes: filtered, count: filtered.length })
  },

  toggleFav(e) {
    const id = Number(e.currentTarget.dataset.id)
    const dish = this.data.dishes.find(d => d.id === id)
    if (!dish) return

    let favs = wx.getStorageSync('favorites') || []
    const idx = favs.findIndex(f => f.id === id)
    if (idx > -1) {
      favs.splice(idx, 1)
      dish.favorite = false
      wx.showToast({ title: '已取消收藏', icon: 'none' })
    } else {
      favs.push({ id: dish.id, name: dish.name, price: dish.price, emoji: dish.emoji || '🍽️', image: dish.image, tag: dish.tag, category: dish.category })
      dish.favorite = true
      wx.showToast({ title: '已收藏 ❤️', icon: 'success' })
    }
    wx.setStorageSync('favorites', favs)
    this.selectCategory(this.data.activeCategory)
  },

  addToCart(e) {
    const id = Number(e.currentTarget.dataset.id)
    const dish = this.data.dishes.find(d => d.id === id)
    if (!dish) return

    let cart = wx.getStorageSync('cart') || []
    const existing = cart.find(d => d.id === id)
    if (existing) {
      existing.qty += 1
    } else {
      cart.push({ id: dish.id, name: dish.name, price: dish.price, emoji: dish.emoji || '🍽️', image: dish.image, qty: 1 })
    }
    wx.setStorageSync('cart', cart)
    this._updateCartCount()
    wx.showToast({ title: `已加入：${dish.name}`, icon: 'none' })
  },

  _updateCartCount() {
    const cart = wx.getStorageSync('cart') || []
    const count = cart.reduce((s, i) => s + (i.qty || 1), 0)
    this.setData({ cartCount: count })
  },

  goToRandom() {
    wx.switchTab({ url: '/pages/random/random' })
  }
})