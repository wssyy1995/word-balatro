// 动画工具函数
const Easing = {
  // easeOutCubic: 平滑减速
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  
  // easeOutBack: 弹性回弹（轻微过冲后回落）
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  
  // easeOutBackStrong: 强力弹性回弹（果冻感）
  easeOutBackStrong: (t) => {
    const c1 = 2.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  
  // easeOutBounce: 弹跳效果
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  
  // linear: 线性
  linear: (t) => t,
  
  // easeInOutQuad: 缓入缓出
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};

// 动画类
class Animation {
  constructor(config) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.type = config.type; // 'flyOut', 'flyIn', 'scorePop', 'shake', 'scale', 'fade'
    this.target = config.target; // 目标对象（卡牌/分数/DOM元素）
    this.startTime = config.startTime || Date.now();
    this.duration = config.duration || 600;
    this.easing = config.easing || Easing.easeOutCubic;
    this.onComplete = config.onComplete || null;
    this.onUpdate = config.onUpdate || null;
    
    // 属性动画
    this.from = config.from || {};
    this.to = config.to || {};
    
    // 状态
    this.finished = false;
    this.delay = config.delay || 0;
  }
  
  update(now) {
    const elapsed = now - this.startTime - this.delay;
    if (elapsed < 0) return false; // 还在延迟期
    
    let progress = Math.min(elapsed / this.duration, 1);
    const eased = this.easing(progress);
    
    // 计算当前值
    const current = {};
    for (const key of Object.keys(this.from)) {
      current[key] = this.from[key] + (this.to[key] - this.from[key]) * eased;
    }
    
    // 执行更新回调
    if (this.onUpdate) {
      this.onUpdate(current, progress);
    }
    
    // 检查是否完成
    if (progress >= 1) {
      this.finished = true;
      if (this.onComplete) {
        this.onComplete();
      }
      return true;
    }
    return false;
  }
}

// 动画管理器
class AnimationManager {
  constructor() {
    this.animations = [];
    this.nextId = 0;
  }
  
  add(config) {
    const anim = new Animation(config);
    this.animations.push(anim);
    return anim.id;
  }
  
  update(now) {
    const completed = [];
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      const done = anim.update(now);
      if (done) {
        completed.push(anim);
        this.animations.splice(i, 1);
      }
    }
    return completed;
  }
  
  remove(id) {
    const idx = this.animations.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.animations.splice(idx, 1);
    }
  }
  
  clear() {
    this.animations = [];
  }
  
  // 快捷方法：卡牌飞出（像发扑克牌一样向左滑出，不淡出）
  flyOut(card, direction, onComplete, delay = 0) {
    return this.add({
      type: 'flyOut',
      target: card,
      from: { x: 0, y: 0, rotation: 0, opacity: 1 },
      to: { x: -400, y: 30, rotation: -20, opacity: 1 },
      duration: 400,
      delay,
      easing: Easing.easeOutCubic,
      onUpdate: (curr) => {
        card.animOffset = { x: curr.x, y: curr.y, rotation: curr.rotation, opacity: curr.opacity };
      },
      onComplete: () => {
        card.animOffset = null;
        if (onComplete) onComplete();
      }
    });
  }
  
  // 快捷方法：卡牌飞入（强力果冻回弹）
  flyIn(card, direction, onComplete, delay = 0) {
    const fromX = direction === 'left' ? -200 : 200;
    
    return this.add({
      type: 'flyIn',
      target: card,
      from: { x: fromX, y: -20, rotation: direction === 'left' ? -20 : 20, opacity: 0.4, scale: 0.6 },
      to: { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1 },
      duration: 550,
      delay,
      easing: Easing.easeOutBackStrong,
      onUpdate: (curr) => {
        card.animOffset = { 
          x: curr.x, y: curr.y, rotation: curr.rotation, 
          opacity: curr.opacity, scale: curr.scale 
        };
      },
      onComplete: () => {
        card.animOffset = null;
        if (onComplete) onComplete();
      }
    });
  }
  
  // 快捷方法：分数弹出
  scorePop(text, x, y, color = '#2ecc71') {
    return this.add({
      type: 'scorePop',
      from: { x, y, opacity: 1, scale: 0.5 },
      to: { x, y: y - 60, opacity: 0, scale: 1.5 },
      duration: 800,
      easing: Easing.easeOutCubic,
      onUpdate: (curr) => {
        // 分数弹出动画数据存储在全局，renderer 中读取
        this.floatingTexts = this.floatingTexts || [];
        this.floatingTexts.push({
          text, x: curr.x, y: curr.y, opacity: curr.opacity, 
          scale: curr.scale, color, id: this.nextId++
        });
      }
    });
  }
  
  // 快捷方法：按钮点击反馈
  buttonPress(target) {
    return this.add({
      type: 'scale',
      target,
      from: { scale: 1 },
      to: { scale: 0.92 },
      duration: 100,
      easing: Easing.easeOutCubic,
      onComplete: () => {
        this.add({
          type: 'scale',
          target,
          from: { scale: 0.92 },
          to: { scale: 1 },
          duration: 150,
          easing: Easing.easeOutBack
        });
      }
    });
  }
  
  // 快捷方法：卡牌选中微动
  cardSelect(card) {
    return this.add({
      type: 'shake',
      target: card,
      from: { y: 0 },
      to: { y: -8 },
      duration: 150,
      easing: Easing.easeOutBack,
      onUpdate: (curr) => {
        card.selectOffset = curr.y;
      },
      onComplete: () => {
        card.selectOffset = -8; // 保持上移状态
      }
    });
  }
  
  // 快捷方法：卡牌取消选中回落
  cardDeselect(card) {
    return this.add({
      type: 'shake',
      target: card,
      from: { y: card.selectOffset || -8 },
      to: { y: 0 },
      duration: 200,
      easing: Easing.easeOutCubic,
      onUpdate: (curr) => {
        card.selectOffset = curr.y;
      },
      onComplete: () => {
        card.selectOffset = 0;
      }
    });
  }
}

module.exports = { AnimationManager, Easing, Animation };
