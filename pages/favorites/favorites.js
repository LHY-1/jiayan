// pages/favorites/favorites.js
const { fetchCloudMenu } = require('../../utils/menu-sync');

Page({
  data: {
    favorites: [],
    isEmpty: true,
    previewImg: ''
  },

  onShow() {
    this.loadFavs();
    // 从云端拉取最新菜单
    fetchCloudMenu().then(cloudDishes => {
      if (cloudDishes && cloudDishes.length > 0) {
        wx.setStorageSync('dishes_manage', cloudDishes);
        this.loadFavs();
      }
    });
  },

  loadFavs() {
    const favs = wx.getStorageSync('favorites') || [];
    // 从最新的菜品数据中同步更新收藏信息
    const allDishes = this._getAllDishes();
    const enriched = favs.map(f => {
      const match = allDishes.find(d => d.id === f.id);
      return match || f;
    });
    this.setData({
      favorites: enriched,
      isEmpty: enriched.length === 0
    });
  },

  _getAllDishes() {
    const { dishes } = require('../../utils/data');
    const cached = wx.getStorageSync('dishes_manage') || [];
    const userDishes = cached.map(d => ({ ...d, isUser: true, emoji: d.emoji || '🍽️' }));
    return [...userDishes, ...dishes];
  },

  addToCart(e) {
    const id = Number(e.currentTarget.dataset.id);
    const dish = this.data.favorites.find(d => d.id === id);
    if (!dish) return;
    let cart = wx.getStorageSync('cart') || [];
    const existing = cart.find(d => d.id === id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ id: dish.id, name: dish.name, price: dish.price, emoji: dish.emoji, image: dish.image, qty: 1 });
    }
    wx.setStorageSync('cart', cart);
    wx.showToast({ title: `已加入：${dish.name}`, icon: 'none' });
  },

  // 点击看大图
  previewImage(e) {
    const img = e.currentTarget.dataset.image;
    if (img) this.setData({ previewImg: img });
  },
  closePreview() {
    this.setData({ previewImg: '' });
  },

  removeFav(e) {
    const id = Number(e.currentTarget.dataset.id);
    const dish = this.data.favorites.find(d => d.id === id);
    if (!dish) return;
    wx.showModal({
      title: '取消收藏',
      content: `取消收藏「${dish.name}」？`,
      success: (res) => {
        if (res.confirm) {
          let favs = wx.getStorageSync('favorites') || [];
          favs = favs.filter(f => f.id !== id);
          wx.setStorageSync('favorites', favs);
          this.loadFavs();
          wx.showToast({ title: '已取消收藏', icon: 'none' });
        }
      }
    });
  },

  goTab(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const pages = ['pages/index/index', 'pages/random/random', 'pages/favorites/favorites', 'pages/order/order', 'pages/profile/profile'];
    wx.switchTab({ url: '/' + pages[idx] });
  }
})