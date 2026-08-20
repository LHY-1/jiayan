// pages/manage/manage.js
const { dishes: builtinDishes, categories } = require('../../utils/data');
const { fetchCloudMenu, pushCloudMenu } = require('../../utils/menu-sync');

Page({
  data: {
    dishes: [],
    filteredDishes: [],
    searchKeyword: '',
    showAdd: false,
    editId: null,
    activeCategory: 'all',
    filterCategories: [],
    categoryOptions: [],
    catIndex: 0,
    filteredCount: 0,
    form: {
      name: '', price: '', category: '热菜', tag: '', desc: '', image: ''
    }
  },

  // 合并所有菜品（内置 + 自定义）
  _mergeAllDishes() {
    const cached = wx.getStorageSync('dishes_manage') || []
    // 内置菜带默认值
    const defaults = builtinDishes.map(d => ({ ...d, isUser: false, _hidden: false }))
    // 用缓存的覆盖/扩展内置菜
    const merged = defaults.map(d => {
      const override = cached.find(c => c.id === d.id)
      return override ? { ...d, ...override, _override: true } : d
    })
    // 追加纯自定义菜（不在内置列表中的）
    const customIds = new Set(defaults.map(d => d.id))
    const custom = cached.filter(c => !customIds.has(c.id)).map(c => ({ ...c, isUser: true }))
    return [...merged, ...custom]
  },

  _saveMerged(merged) {
    wx.setStorageSync('dishes_manage', merged)
  },

  onLoad() {
    const allCats = [{ name: '全部', key: 'all' }, ...categories]
    this.setData({ filterCategories: allCats, categoryOptions: categories })
    this.refresh()
  },

  onShow() {
    this.refresh()
    // 从云端拉取最新菜单，有云端数据则用云端覆盖本地
    fetchCloudMenu().then(cloudDishes => {
      if (cloudDishes && cloudDishes.length > 0) {
        wx.setStorageSync('dishes_manage', cloudDishes)
        this.refresh()
        wx.showToast({ title: '已同步云端菜单', icon: 'none' })
      }
    })
  },

  refresh() {
    const merged = this._mergeAllDishes()
    // 过滤掉标记为隐藏的
    const visible = merged.filter(d => !d._hidden)
    this.setData({ dishes: visible })
    this.applyFilter()
  },

  // 搜索
  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.applyFilter()
  },

  onCategoryTap(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.key })
    this.applyFilter()
  },

  applyFilter() {
    const { dishes, searchKeyword, activeCategory } = this.data
    let filtered = dishes
    if (searchKeyword) {
      filtered = filtered.filter(d => d.name.includes(searchKeyword))
    }
    if (activeCategory && activeCategory !== 'all') {
      filtered = filtered.filter(d => d.category === activeCategory)
    }
    this.setData({ filteredDishes: filtered, filteredCount: filtered.length })
  },

  // 图片上传：自动缩放 + 压缩转 base64，大照片也能直接传，无需手动编辑
  // 策略：先缩到 1080px 宽，超限自动降到 720→540，保证清晰且体积可控
  onChooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '处理图片...' })
        this._processImage(tempPath, 0)
      }
    })
  },

  // 逐级缩放直到体积达标（含 EXIF 方向修正，避免横竖颠倒）
  _processImage(src, attempt) {
    const sizes = [1080, 720, 540]
    const maxW = sizes[attempt] !== undefined ? sizes[attempt] : 540
    const done = (dataUrl) => {
      wx.hideLoading()
      if (dataUrl) {
        this.setData({ 'form.image': dataUrl })
        wx.showToast({ title: '图片已就绪', icon: 'success' })
      } else {
        this._fallbackCompress(src)
      }
    }
    wx.getImageInfo({
      src,
      success: (info) => {
        const { width, height, orientation } = info
        if (!width || !height) { done(''); return }
        // EXIF 方向修正：left/right 表示照片需要旋转 90°，宽高互换
        const needRotate = orientation === 'left' || orientation === 'right'
        const baseW = needRotate ? height : width
        const baseH = needRotate ? width : height
        let targetW = baseW
        let targetH = baseH
        if (baseW > maxW) {
          targetW = maxW
          targetH = Math.max(1, Math.round(maxW * baseH / baseW))
        }
        // 用离屏 canvas 缩放
        try {
          const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetW, height: targetH })
          const ctx = canvas.getContext('2d')
          const img = canvas.createImage()
          img.onload = () => {
            try {
              if (needRotate) {
                // 旋转绘制：以中心为原点，旋转后填满画布
                ctx.translate(targetW / 2, targetH / 2)
                ctx.rotate(orientation === 'right' ? Math.PI / 2 : -Math.PI / 2)
                const scale = targetW / height
                ctx.drawImage(img, -width * scale / 2, -height * scale / 2, width * scale, height * scale)
              } else {
                ctx.drawImage(img, 0, 0, targetW, targetH)
              }
              let dataUrl = ''
              try {
                dataUrl = canvas.toDataURL('image/jpeg', 0.78)
              } catch (e) {
                dataUrl = ''
              }
              if (dataUrl && dataUrl.length > 400 * 1024 && attempt < sizes.length - 1) {
                // 还大，继续缩小一档
                this._processImage(src, attempt + 1)
                return
              }
              done(dataUrl || '')
            } catch (err) {
              done('')
            }
          }
          img.onerror = () => done('')
          img.src = src
        } catch (err) {
          done('')
        }
      },
      fail: () => done('')
    })
  },

  // 降级方案：不支持 canvas 时用纯质量压缩
  _fallbackCompress(src) {
    wx.compressImage({
      src,
      quality: 60,
      success: (cr) => {
        const compressedPath = cr.tempFilePath || src
        wx.getFileSystemManager().readFile({
          filePath: compressedPath,
          encoding: 'base64',
          success: (fr) => {
            wx.hideLoading()
            const b64 = fr.data
            if (b64.length > 400 * 1024) {
              wx.showToast({ title: '照片较大，可先在相册里裁剪一下', icon: 'none', duration: 2500 })
              return
            }
            this.setData({ 'form.image': 'data:image/jpeg;base64,' + b64 })
            wx.showToast({ title: '图片已就绪', icon: 'success' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '图片处理失败', icon: 'none' })
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '图片压缩失败', icon: 'none' })
      }
    })
  },

  // 统计当前所有菜品 base64 图片总大小（字节），超限会存不进本地
  _totalImageBytes() {
    const merged = this._mergeAllDishes()
    let total = 0
    merged.forEach(d => {
      if (d.image && d.image.indexOf('data:') === 0) {
        total += d.image.length
      }
    })
    return total
  },

  onPreviewImage() {
    if (!this.data.form.image) return
    const img = this.data.form.image
    // base64 图不支持 previewImage，直接提示
    if (img.indexOf('data:') === 0) {
      wx.showToast({ title: '图片已就绪，保存后全家人可见', icon: 'none' })
      return
    }
    wx.previewImage({ urls: [img], current: img })
  },

  removeImage() {
    this.setData({ 'form.image': '' })
  },

  previewImage(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(d => d.id === id)
    if (dish && dish.image) {
      const img = dish.image
      if (img.indexOf('data:') === 0) return
      wx.previewImage({ urls: [img], current: img })
    }
  },

  stopTap() {},

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }) },
  onPriceInput(e) { this.setData({ 'form.price': e.detail.value }) },
  onTagInput(e) { this.setData({ 'form.tag': e.detail.value }) },
  onDescInput(e) { this.setData({ 'form.desc': e.detail.value }) },

  onCategoryChange(e) {
    const idx = Number(e.detail.value)
    const cat = this.data.categoryOptions[idx]
    if (cat) {
      this.setData({ catIndex: idx, 'form.category': cat.name })
    }
  },

  openAdd() {
    this.setData({
      showAdd: true, editId: null, catIndex: 0,
      form: { name: '', price: '', category: '热菜', tag: '', desc: '', image: '' }
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(d => d.id === id)
    if (!dish) return
    const catIdx = this.data.categoryOptions.findIndex(c => c.name === dish.category)
    this.setData({
      showAdd: true, editId: id, catIndex: catIdx >= 0 ? catIdx : 0,
      form: {
        name: dish.name, price: String(dish.price),
        category: dish.category, tag: dish.tag || '',
        desc: dish.desc || '', image: dish.image || ''
      }
    })
  },

  closeAdd() {
    this.setData({ showAdd: false, editId: null })
  },

  saveDish() {
    const { form, editId } = this.data
    if (!form.name || !form.price) {
      wx.showToast({ title: '请填写名称和价格', icon: 'none' })
      return
    }

    // 总量保护：图片 base64 总和超 900KB 会存不进本地（单 key 上限 1MB）
    const totalBytes = this._totalImageBytes() + (form.image && form.image.indexOf('data:') === 0 ? form.image.length : 0)
    if (totalBytes > 900 * 1024) {
      wx.showToast({ title: '菜品图片总体积过大，建议删除部分菜品图片', icon: 'none', duration: 2500 })
      return
    }

    // 从缓存读取完整合并列表
    let cached = wx.getStorageSync('dishes_manage') || []

    if (editId) {
      // 编辑：覆盖缓存中的对应条目
      const idx = cached.findIndex(d => d.id === editId)
      const override = {
        id: editId,
        name: form.name,
        price: parseFloat(form.price),
        category: form.category,
        tag: form.tag || '经典',
        desc: form.desc,
        image: form.image,
        isUser: true
      }
      if (idx > -1) {
        cached[idx] = { ...cached[idx], ...override }
      } else {
        cached.push(override)
      }
    } else {
      // 新增
      cached.unshift({
        id: Date.now(),
        name: form.name,
        price: parseFloat(form.price),
        category: form.category,
        tag: form.tag || '经典',
        desc: form.desc,
        image: form.image,
        isUser: true
      })
    }

    wx.setStorageSync('dishes_manage', cached)
    this.refresh()
    this.closeAdd()
    // 推送到云端，全家人同步
    pushCloudMenu(this._mergeAllDishes())
    wx.showToast({ title: editId ? '已更新' : '已添加', icon: 'success' })
  },

  deleteDish(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(d => d.id === id)
    if (!dish) return

    wx.showModal({
      title: '确认删除',
      content: `确定删除「${dish.name}」吗？${dish.isUser ? '' : '\n（内置菜将隐藏，不会再次出现）'}`,
      success: (res) => {
        if (!res.confirm) return

        // 从缓存中确实删除
        let cached = wx.getStorageSync('dishes_manage') || []
        cached = cached.filter(d => d.id !== id)
        // 加入隐藏标记，防止内置菜重新出现
        cached.push({ id, _hidden: true })
        wx.setStorageSync('dishes_manage', cached)
        this.refresh()
        // 推送到云端
        pushCloudMenu(this._mergeAllDishes())
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  // 排序
  moveUp(e) {
    const id = e.currentTarget.dataset.id
    const merged = this._mergeAllDishes()
    const idx = merged.findIndex(d => d.id === id)
    if (idx > 0) {
      [merged[idx - 1], merged[idx]] = [merged[idx], merged[idx - 1]]
      this._saveMerged(merged)
      this.refresh()
      pushCloudMenu(merged)
    }
  },

  moveDown(e) {
    const id = e.currentTarget.dataset.id
    const merged = this._mergeAllDishes()
    const idx = merged.findIndex(d => d.id === id)
    if (idx < merged.length - 1) {
      [merged[idx], merged[idx + 1]] = [merged[idx + 1], merged[idx]]
      this._saveMerged(merged)
      this.refresh()
      pushCloudMenu(merged)
    }
  }
})