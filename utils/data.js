// 菜品数据
const dishes = [
  { id: 1, name: '红烧肉', category: '热菜', price: 48, tag: '经典', emoji: '🥩', desc: '肥瘦相间，入口即化' },
  { id: 2, name: '宫保鸡丁', category: '热菜', price: 38, tag: '微辣', emoji: '🍗', desc: '鸡肉嫩滑，花生香脆' },
  { id: 3, name: '清蒸鲈鱼', category: '热菜', price: 68, tag: '清淡', emoji: '🐟', desc: '鲜嫩爽滑，原汁原味' },
  { id: 4, name: '麻婆豆腐', category: '热菜', price: 28, tag: '麻辣', emoji: '🌶️', desc: '麻辣鲜香，下饭神器' },
  { id: 5, name: '蒜蓉西兰花', category: '热菜', price: 26, tag: '素食', emoji: '🥦', desc: '清爽脆嫩，蒜香浓郁' },
  { id: 6, name: '凉拌黄瓜', category: '凉菜', price: 16, tag: '爽口', emoji: '🥒', desc: '脆爽开胃，夏日必备' },
  { id: 7, name: '口水鸡', category: '凉菜', price: 32, tag: '麻辣', emoji: '🍗', desc: '红油鲜亮，麻辣过瘾' },
  { id: 8, name: '皮蛋豆腐', category: '凉菜', price: 18, tag: '经典', emoji: '🥚', desc: '嫩滑爽口，简单美味' },
  { id: 9, name: '番茄蛋汤', category: '汤品', price: 18, tag: '清淡', emoji: '🍅', desc: '酸甜开胃，家常必备' },
  { id: 10, name: '排骨冬瓜汤', category: '汤品', price: 38, tag: '滋补', emoji: '🥩', desc: '汤鲜味美，清热解暑' },
  { id: 11, name: '白米饭', category: '主食', price: 3, tag: '主食', emoji: '🍚', desc: '粒粒饱满，软糯适中' },
  { id: 12, name: '酸梅汤', category: '饮品', price: 12, tag: '解暑', emoji: '🥤', desc: '冰镇酸爽，生津解渴' },
];

// 分类列表
const categories = [
  { name: '全部', key: 'all' },
  { name: '热菜', key: '热菜' },
  { name: '凉菜', key: '凉菜' },
  { name: '汤品', key: '汤品' },
  { name: '主食', key: '主食' },
  { name: '饮品', key: '饮品' },
];

// 口味标签
const tasteTags = ['辣', '清淡', '酸甜', '咸鲜', '浓郁'];

// 人数选项
const peopleOptions = [
  { label: '1人', value: 1 },
  { label: '2人', value: 2 },
  { label: '3人', value: 3 },
  { label: '4人', value: 4 },
  { label: '5人+', value: 5 },
];

// 荤素选项
const meatOptions = [
  { label: '都可以', value: 'all' },
  { label: '偏素', value: 'more-veg' },
  { label: '偏荤', value: 'more-meat' },
  { label: '荤素各半', value: 'half-half' },
];

module.exports = { dishes, categories, tasteTags, peopleOptions, meatOptions };