// custom-tab-bar/index.js
const pagePaths = [
  '/pages/index/index',
  '/pages/random/random',
  '/pages/favorites/favorites',
  '/pages/profile/profile'
];

Component({
  data: {
    idx: 0
  },

  pageLifetimes: {
    show() {
      this._sync();
    }
  },

  methods: {
    _sync() {
      // 尝试从页面参数中获取
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      if (cur && cur.route) {
        const map = {
          'pages/index/index': 0,
          'pages/random/random': 1,
          'pages/favorites/favorites': 2,
          'pages/profile/profile': 3
        };
        this.setData({ idx: map[cur.route] || 0 });
      }
    },

    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const cur = this.data.idx;
      if (idx === cur) {
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        return;
      }
      // 先更新，再跳转
      this.setData({ idx });
      wx.switchTab({ url: pagePaths[idx] });
    }
  }
})