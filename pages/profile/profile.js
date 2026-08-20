// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    role: 'orderer',
    noSpicy: false,
    noSeafood: false,
    vegetarian: false
  },

  onLoad() {
    const settings = app.globalData.settings;
    this.setData({
      ...settings,
      role: wx.getStorageSync('user_role') || 'orderer'
    });
  },

  onShow() {
    this.setData({ role: wx.getStorageSync('user_role') || 'orderer' });
  },

  switchRole() {
    const current = wx.getStorageSync('user_role') || 'orderer';
    const next = current === 'orderer' ? 'chef' : 'orderer';
    wx.showModal({
      title: '切换身份',
      content: `切换到「${next === 'chef' ? '👨‍🍳 厨师' : '🛒 下单者'}」模式？`,
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('user_role', next);
          this.setData({ role: next });
          wx.showToast({ title: next === 'chef' ? '已切换为厨师' : '已切换为下单者', icon: 'success' });
        }
      }
    });
  },

  toggleSetting(e) {
    const key = e.currentTarget.dataset.key;
    const val = !this.data[key];
    this.setData({ [key]: val });
    app.globalData.settings[key] = val;
  },

  goToManage() {
    wx.navigateTo({ url: '/pages/manage/manage' });
  },

  goToNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },

  goToHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  goToAbout() {
    wx.showModal({
      title: '关于家宴',
      content: '家宴 V1.0\n家庭专属菜单与随机组菜工具\n\n用心做好每一道菜，\n让家人吃得开心。',
      showCancel: false
    });
  },

  goTab(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const pages = ['pages/index/index', 'pages/random/random', 'pages/favorites/favorites', 'pages/order/order', 'pages/profile/profile'];
    wx.switchTab({ url: '/' + pages[idx] });
  }
});