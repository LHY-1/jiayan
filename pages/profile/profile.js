// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    _subscribing: false,
    role: 'orderer',
    nickname: '',
    avatarUrl: '',
    noSpicy: false,
    noSeafood: false,
    vegetarian: false
  },

  onLoad() {
    const settings = app.globalData.settings;
    const nickname = app.globalData.nickname || wx.getStorageSync('user_nickname') || '';
    const avatarUrl = wx.getStorageSync('user_avatar') || '';
    this.setData({
      ...settings,
      role: wx.getStorageSync('user_role') || 'orderer',
      nickname,
      avatarUrl
    });
  },

  onShow() {
    this.setData({ 
      role: wx.getStorageSync('user_role') || 'orderer',
      nickname: app.globalData.nickname || wx.getStorageSync('user_nickname') || '',
      avatarUrl: wx.getStorageSync('user_avatar') || ''
    });
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

  // 订阅消息授权（勾选「总是保持以上选择」后，授权一次长期有效，每次下单自动续额）
  _subscribing: false,
  subscribeNotify() {
    if (this.data._subscribing) {
      console.log('[订阅] 已有请求进行中，忽略重复点击');
      return;
    }
    const SUBMIT_TEMPLATE_ID = 'Q5yDGEZM1o23liVkmMLZ4sltKDSop3tukazyfy21yBc';
    const FINISH_TEMPLATE_ID = 'vzYrBd5EMjAXZzLkTSOA5Mznly5Mwd05Djvj91tu0sc';
    if (typeof wx.requestSubscribeMessage !== 'function') {
      wx.showToast({ title: '当前版本不支持订阅消息', icon: 'none' });
      return;
    }
    this.setData({ _subscribing: true });
    wx.requestSubscribeMessage({
      tmplIds: [SUBMIT_TEMPLATE_ID, FINISH_TEMPLATE_ID],
      success: (res) => {
        this.setData({ _subscribing: false });
        let granted = 0;
        if (res[SUBMIT_TEMPLATE_ID] === 'accept') granted++;
        if (res[FINISH_TEMPLATE_ID] === 'accept') granted++;
        if (granted > 0) {
          wx.setStorageSync('_notify_subscribed', true);
          wx.showModal({
            title: '✅ 通知已开启',
            content: '已授权做菜进度通知。\n\n💡 提示：授权弹窗里勾选「总是保持以上选择，不再询问」后，以后每次下单都会自动授权，长期有效，不用重复操作。',
            showCancel: false
          });
        } else {
          wx.showToast({ title: '未授权任何通知', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ _subscribing: false });
        console.error('[订阅] 失败详情:', err);
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

  // 设置昵称和头像
  async onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    const nickname = e.detail.nickname || this.data.nickname;
    
    // 保存到 storage
    wx.setStorageSync('user_avatar', avatarUrl);
    wx.setStorageSync('user_nickname', nickname);
    
    // 更新 globalData
    app.globalData.nickname = nickname;
    app.globalData.userInfo = { avatarUrl, nickname };
    
    this.setData({ nickname, avatarUrl });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({ nickname });
    wx.setStorageSync('user_nickname', nickname);
    app.globalData.nickname = nickname;
  },

  goTab(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const pages = ['pages/index/index', 'pages/random/random', 'pages/favorites/favorites', 'pages/order/order', 'pages/profile/profile'];
    wx.switchTab({ url: '/' + pages[idx] });
  }
});