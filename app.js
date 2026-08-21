// app.js
App({
  globalData: {
    userInfo: null,
    nickname: '',
    role: 'orderer',
    selectedPeople: 1,
    tastePrefs: ['咸鲜'],
    meatPref: 'all',
    settings: { noSpicy: false, noSeafood: false, vegetarian: false },
    openid: null,
    openidReady: false
  },

  onLaunch() {
    this._ensureOpenId()
  },

  _ensureOpenId() {
    const app = this
    const cached = wx.getStorageSync('user_openid')
    console.log('[openid] cache:', cached)
    if (cached) {
      app.globalData.openid = cached
      app.globalData.openidReady = true
      // 同时恢复昵称
      const nickname = wx.getStorageSync('user_nickname') || ''
      if (nickname) {
        app.globalData.nickname = nickname
      }
      return Promise.resolve(cached)
    }
    return wx.login().then(code => {
      // wx.login 可能返回 { code: "xxx" } 或纯字符串
      const codeStr = (code && (code.code || String(code))) ? String(code.code || code) : ''
      console.log('[openid] login code:', codeStr ? codeStr.substring(0, 10) + '...' : 'EMPTY/NULL')
      if (!codeStr) {
        app.globalData.openid = ''
        app.globalData.openidReady = true
        return ''
      }
      return new Promise((resolve) => {
        wx.request({
          url: 'https://cook.071601.xyz/decode',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: codeStr },
          success(res) {
            console.log('[openid] decode result:', res.data)
            const openid = res.data && res.data.openid || ''
            if (openid) {
              wx.setStorageSync('user_openid', openid)
              app.globalData.openid = openid
            }
            app.globalData.openidReady = true
            resolve(openid)
          },
          fail(err) {
            console.log('[openid] request fail:', err)
            app.globalData.openidReady = true
            resolve('')
          }
        })
      })
    }).catch(err => {
      console.log('[openid] catch:', err)
      app.globalData.openidReady = true
      return ''
    })
  }
})
