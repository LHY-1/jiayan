// pages/manage/manage.js
const { dishes: builtinDishes, categories } = require('../../utils/data');

Page({
  data: {
    dishes: [],
    filteredDishes: [],
    searchKeyword: '',
    showAdd: false,
    editId: null,
    activeCategory: 'all',
    filterCategories: [],
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
    this.setData({ filterCategories: allCats })
    this.refresh()
  },

  onShow() {
    this.refresh()
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

  // 图片上传
  onChooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        this.setData({ 'form.image': res.tempFiles[0].tempFilePath })
      }
    })
  },

  onPreviewImage() {
    if (!this.data.form.image) return
    wx.previewImage({ urls: [this.data.form.image], current: this.data.form.image })
  },

  removeImage() {
    this.setData({ 'form.image': '' })
  },

  previewImage(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(d => d.id === id)
    if (dish && dish.image) {
      wx.previewImage({ urls: [dish.image], current: dish.image })
    }
  },

  stopTap() {},

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }) },
  onPriceInput(e) { this.setData({ 'form.price': e.detail.value }) },
  onTagInput(e) { this.setData({ 'form.tag': e.detail.value }) },
  onDescInput(e) { this.setData({ 'form.desc': e.detail.value }) },

  onCategoryChange(e) {
    this.setData({ 'form.category': e.detail.value })
  },

  openAdd() {
    this.setData({
      showAdd: true, editId: null,
      form: { name: '', price: '', category: '热菜', tag: '', desc: '', image: '' }
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(d => d.id === id)
    if (!dish) return
    this.setData({
      showAdd: true, editId: id,
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
    }
  }
})