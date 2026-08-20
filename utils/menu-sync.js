// utils/menu-sync.js
// 菜单云端同步：编辑一次，全家人同步最新菜单
const WORKER_URL = 'https://cook.071601.xyz'

// 从云端拉取菜单（返回 null 表示失败或没有云端数据）
function fetchCloudMenu() {
  return new Promise((resolve) => {
    wx.request({
      url: WORKER_URL + '/menu',
      method: 'GET',
      timeout: 6000,
      success: (res) => {
        const data = res.data
        if (data && data.code === 0 && Array.isArray(data.dishes)) {
          resolve(data.dishes)
        } else {
          resolve(null)
        }
      },
      fail: () => resolve(null)
    })
  })
}

// 推送菜单到云端（全量覆盖）
function pushCloudMenu(dishes) {
  return new Promise((resolve) => {
    wx.request({
      url: WORKER_URL + '/menu',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { dishes: dishes },
      timeout: 6000,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

module.exports = { fetchCloudMenu, pushCloudMenu, WORKER_URL }