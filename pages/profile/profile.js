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

  // 订阅消息授权（微信订阅是一次性的，需要定期重新授权才能持续收到通知）
  subscribeNotify() {
    const SUBMIT_TEMPLATE_ID = 'Q5yDGEZM1o23liVkmMLZ4sltKDSop3tukazyfy21yBc';
    const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc';
    if (typeof wx.requestSubscribeMessage !== 'function') {
      wx.showToast({ title: '当前版本不支持订阅消息', icon: 'none' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [SUBMIT_TEMPLATE_ID, FINISH_TEMPLATE_ID],
      success: (res) => {
        let granted = 0;
        if (res[SUBMIT_TEMPLATE_ID] === 'accept') granted++;
        if (res[FINISH_TEMPLATE_ID] === 'accept') granted++;
        if (granted > 0) {
          wx.showToast({ title: `已授权 ${granted} 个通知`, icon: 'success' });
        } else {
          wx.showToast({ title: '未授权任何通知', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[订阅] 失败', err);
        wx.showToast({ title: '授权失败，请重试', icon: 'none' });
      }
    });
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