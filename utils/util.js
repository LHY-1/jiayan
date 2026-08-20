// 随机工具函数
function randomCombo(dishes, { people, tastes, meatPref }) {
  let pool = [...dishes];

  // 口味筛选
  if (tastes && tastes.length > 0) {
    const tasteMap = {
      '辣': dishes.filter(d => d.tag === '麻辣' || d.tag === '微辣'),
      '清淡': dishes.filter(d => d.tag === '清淡' || d.tag === '爽口' || d.tag === '素食'),
      '酸甜': dishes.filter(d => d.tag === '经典' || d.name.includes('酸') || d.name.includes('番茄')),
      '咸鲜': dishes.filter(d => d.tag !== '麻辣' && d.tag !== '清淡' && d.tag !== '爽口'),
      '浓郁': dishes.filter(d => d.tag === '经典' || d.tag === '滋补' || d.tag === '麻辣'),
    };
    let tastePool = [];
    tastes.forEach(t => {
      if (tasteMap[t]) tastePool = tastePool.concat(tasteMap[t]);
    });
    if (tastePool.length > 0) {
      pool = [...new Set(tastePool)];
    }
  }

  // 荤素筛选
  if (meatPref === 'more-veg') {
    pool = pool.filter(d => ['素食', '清淡', '爽口'].includes(d.tag) || ['凉菜', '汤品', '饮品', '主食'].includes(d.category));
  } else if (meatPref === 'more-meat') {
    pool = pool.filter(d => ['经典', '麻辣', '微辣', '滋补'].includes(d.tag) || d.name.includes('肉') || d.name.includes('鸡') || d.name.includes('鱼'));
  } else if (meatPref === 'half-half') {
    const meaty = pool.filter(d => ['经典', '麻辣', '微辣', '滋补'].includes(d.tag) || d.name.includes('肉') || d.name.includes('鸡') || d.name.includes('鱼'));
    const veggy = pool.filter(d => ['素食', '清淡', '爽口'].includes(d.tag) || ['凉菜', '汤品', '饮品', '主食'].includes(d.category));
    const halfCount = Math.ceil(people / 2);
    const shuffledMeat = [...meaty].sort(() => Math.random() - 0.5).slice(0, halfCount);
    const shuffledVeg = [...veggy].sort(() => Math.random() - 0.5).slice(0, halfCount);
    return [...shuffledMeat, ...shuffledVeg].sort(() => Math.random() - 0.5);
  }

  // 随机选取
  const dishCount = Math.min(people + 1, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, dishCount);
}

// 格式化时间
function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = { randomCombo, formatTime };