// pages/random/random.js
const app = getApp()
const { dishes: builtinDishes, tasteTags, peopleOptions, meatOptions } = require('../../utils/data')
const { randomCombo } = require('../../utils/util')

function getAllDishes() {
  const cached = wx.getStorageSync('dishes_manage') || []
  const defaults = builtinDishes.map(d => ({ ...d, isUser: false }))
  const merged = defaults.map(d => {
    const override = cached.find(c => c.id === d.id)
    return override ? { ...d, ...override } : d
  })
  const customIds = new Set(defaults.map(d => d.id))
  const custom = cached.filter(c => !customIds.has(c.id) && !c._hidden).map(c => ({ ...c, isUser: true, emoji: c.emoji || '🍽️' }))
  return [...merged, ...custom].filter(d => !d._hidden)
}

Page({
  data: {
    peopleOptions, tasteTags, meatOptions,
    allDishes: [],
    selectedPeople: 1, selectedTastes: ['咸鲜'], selectedMeat: 'all',
    showResult: false, comboResult: [], totalPrice: 0, loading: false
  },

  onLoad() {
    this.loadDishes()
    const gd = app.globalData
    this.setData({
      selectedPeople: gd.selectedPeople || 1,
      selectedTastes: gd.tastePrefs || ['咸鲜'],
      selectedMeat: gd.meatPref || 'all'
    })
  },

  onShow() { this.loadDishes() },

  loadDishes() {
    this.setData({ allDishes: getAllDishes() })
  },

  selectPeople(e) {
    const val = e.currentTarget.dataset.value
    this.setData({ selectedPeople: val })
    app.globalData.selectedPeople = val
  },

  selectMeat(e) {
    const val = e.currentTarget.dataset.value
    this.setData({ selectedMeat: val })
    app.globalData.meatPref = val
  },

  toggleTaste(e) {
    const val = e.currentTarget.dataset.value
    let tastes = [...this.data.selectedTastes]
    const idx = tastes.indexOf(val)
    if (idx === -1) tastes.push(val)
    else tastes.splice(idx, 1)
    this.setData({ selectedTastes: tastes })
    app.globalData.tastePrefs = tastes
  },

  randomCombo() {
    this.setData({ loading: true, showResult: false })
    setTimeout(() => {
      const result = randomCombo(this.data.allDishes, {
        people: this.data.selectedPeople,
        tastes: this.data.selectedTastes,
        meatPref: this.data.selectedMeat
      })
      const total = result.reduce((sum, d) => sum + d.price, 0)
      this.setData({ comboResult: result, totalPrice: total, showResult: true, loading: false })
    }, 600)
  },

  comboAddToCart() {
    const combo = this.data.comboResult
    if (!combo || combo.length === 0) return
    let cart = wx.getStorageSync('cart') || []
    combo.forEach(dish => {
      const existing = cart.find(d => d.id === dish.id)
      if (existing) existing.qty += 1
      else cart.push({ id: dish.id, name: dish.name, price: dish.price, emoji: dish.emoji || '🍽️', image: dish.image || '', qty: 1 })
    })
    wx.setStorageSync('cart', cart)
    wx.showToast({ title: `已加入${combo.length}道菜`, icon: 'success' })
  },

  goTab(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const pages = ['pages/index/index', 'pages/random/random', 'pages/favorites/favorites', 'pages/order/order', 'pages/profile/profile']
    wx.switchTab({ url: '/' + pages[idx] })
  }
})