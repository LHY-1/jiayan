// pages/notifications/notifications.js
Page({
  data: {
    notifications: [],
    isEmpty: true,
    unreadCount: 0
  },

  onShow() {
    this.loadNotifs();
  },

  loadNotifs() {
    const list = wx.getStorageSync('notifications') || [];
    const enriched = list.map(n => ({
      ...n,
      timeStr: this._formatTime(n.time)
    }));
    const unread = enriched.filter(n => !n.read).length;
    this.setData({
      notifications: enriched,
      isEmpty: enriched.length === 0,
      unreadCount: unread
    });
  },

  _formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  markRead(e) {
    const id = e.currentTarget.dataset.id;
    let list = wx.getStorageSync('notifications') || [];
    list = list.map(n => {
      if (n.id === id) n.read = true;
      return n;
    });
    wx.setStorageSync('notifications', list);
    this.loadNotifs();

    // 如果通知关联了订单，直接跳到订单记录页
    const notif = list.find(n => n.id === id);
    if (notif && notif.orderId) {
      wx.navigateTo({ url: '/pages/history/history' });
    }
  },

  markAllRead() {
    let list = wx.getStorageSync('notifications') || [];
    list = list.map(n => ({ ...n, read: true }));
    wx.setStorageSync('notifications', list);
    this.loadNotifs();
    wx.showToast({ title: '已全部标为已读', icon: 'none' });
  },

  clearAll() {
    wx.showModal({
      title: '清空通知',
      content: '确定清空所有通知？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('notifications', []);
          this.loadNotifs();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
})