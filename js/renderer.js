// ===== Canvas 渲染器 =====
const { formatMeaning, isValidWordOnline } = require('./game');
const { WORD_DATA, onlineWordCache, wordCheckState, LETTER_SCORE, letterUpgrades } = require('./data');
const { SettlementRenderer, WitchRewardRenderer } = require('./settlement');
const { ShopRenderer, ConfirmBuyRenderer, SHOP_POOL } = require('./shop');
const { getSkillForLevel, WITCH_SKILLS } = require('./witch_skills');
const { Easing } = require('./animation');

class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.W = width;
    this.H = height;
    
    // 响应式基准计算
    // 使用 min(width/375, height/667) 确保在任何屏幕上都适配
    const baseScale = Math.min(width / 375, height / 667);
    // 限制最大缩放，避免在 iPad 上元素过大
    this.scale = Math.min(baseScale, 1.4);
    // 限制最小缩放，避免在小屏幕上元素过小
    this.scale = Math.max(this.scale, 0.8);
    
    // 计算卡牌尺寸（支持最多4列）
    const maxCardW = Math.floor((width - 48) / 4); // 4列，左右边距24
    const maxCardH = Math.floor((height - 200) / 3); // 最多3行，预留上方HUD和下方按钮
    this.cardW = Math.min(Math.floor(74 * this.scale), maxCardW);
    this.cardH = Math.min(Math.floor(88 * this.scale), maxCardH);
    this.gap = Math.floor(8 * this.scale);
    
    // 安全区域（刘海屏适配）
    this.safeTop = 0;
    this.safeBottom = 0;
    try {
      const safeArea = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      if (safeArea) {
        this.safeTop = safeArea.top || 0;
      }
    } catch (e) {
      // 非刘海屏
    }
    
    this.animations = [];
    
    // 加载背景图
    this.bgImage = null;
    this.bgLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/bg.png';
      img.onload = () => { this.bgLoaded = true; };
      img.onerror = () => { this.bgLoaded = false; };
      this.bgImage = img;
    } catch (e) {
      this.bgLoaded = false;
    }
    
    // 加载 top bar 图标
    this.topIcon = null;
    this.topIconLoaded = false;
    try {
      const icon = wx.createImage();
      icon.src = 'images/top_icon.png';
      icon.onload = () => { this.topIconLoaded = true; };
      icon.onerror = () => { this.topIconLoaded = false; };
      this.topIcon = icon;
    } catch (e) {
      this.topIconLoaded = false;
    }
    
    // 加载按钮图片
    this.pressedBtn = null;
    this.btnImages = {};
    const btnNames = ['out_card', 'throw_card', 'reset_select', 'challenge_button'];
    btnNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.btnImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.btnImages[name] = { img, loaded: false }; };
        this.btnImages[name] = { img, loaded: false };
      } catch (e) {
        this.btnImages[name] = { img: null, loaded: false };
      }
    });
    
    // 加载分数方块背景图
    this.scoreBoxImages = {};
    const boxNames = ['letter_score', 'length'];
    boxNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => { this.scoreBoxImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.scoreBoxImages[name] = { img, loaded: false }; };
        this.scoreBoxImages[name] = { img, loaded: false };
      } catch (e) {
        this.scoreBoxImages[name] = { img: null, loaded: false };
      }
    });
    
    // 加载计分方块装饰线
    this.scoreLineImg = null;
    this.scoreLineLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/score_line.png';
      img.onload = () => { this.scoreLineLoaded = true; };
      img.onerror = () => { this.scoreLineLoaded = false; };
      this.scoreLineImg = img;
    } catch (e) {
      this.scoreLineLoaded = false;
    }
    
        // 加载错误图标
    this.errorIcon = null;
    this.errorIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/error.png';
      img.onload = () => { this.errorIconLoaded = true; };
      img.onerror = () => { this.errorIconLoaded = false; };
      this.errorIcon = img;
    } catch (e) {
      this.errorIconLoaded = false;
    }
    
    // 加载商店图标
    // 加载商店图标
    this.shopIcon = null;
    this.shopIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/shop_icon.png';
      img.onload = () => { this.shopIconLoaded = true; };
      img.onerror = () => { this.shopIconLoaded = false; };
      this.shopIcon = img;
    } catch (e) {
      this.shopIconLoaded = false;
    }
    
    // 加载女巫礼物图标
    this.witchGiftIcon = null;
    this.witchGiftIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/witch_gift.png';
      img.onload = () => { this.witchGiftIconLoaded = true; };
      img.onerror = () => { this.witchGiftIconLoaded = false; };
      this.witchGiftIcon = img;
    } catch (e) {
      this.witchGiftIconLoaded = false;
    }

    // 加载女巫帽子图标（用于女巫约束提示）
    this.witchHatIcon = null;
    this.witchHatIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/witch_hat.png';
      img.onload = () => { this.witchHatIconLoaded = true; };
      img.onerror = () => { this.witchHatIconLoaded = false; };
      this.witchHatIcon = img;
    } catch (e) {
      this.witchHatIconLoaded = false;
    }
    // 加载女巫头像（动态按 WITCH_SKILLS 中的 level，结构与 shopCardImages 一致）
    this.witchAvatars = {};
    const witchLevels = [...new Set(WITCH_SKILLS.map(s => s.level))];
    witchLevels.forEach(level => {
      const name = `witch_${level}`;
      try {
        const img = wx.createImage();
        img.src = `images/witch/${name}.png`;
        const data = { img, loaded: false, width: 0, height: 0 };
        img.onload = () => { data.loaded = true; data.width = img.width || 0; data.height = img.height || 0; };
        img.onerror = () => { data.loaded = false; };
        this.witchAvatars[name] = data;
      } catch (e) {
        this.witchAvatars[name] = { img: null, loaded: false, width: 0, height: 0 };
      }
    });
    
    // 加载金币图标
    this.coinIcon = null;
    this.coinIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/coin.png';
      img.onload = () => { this.coinIconLoaded = true; };
      img.onerror = () => { this.coinIconLoaded = false; };
      this.coinIcon = img;
    } catch (e) {
      this.coinIconLoaded = false;
    }
    
    // 加载卡牌背景图
    this.cardTemplate = null;
    this.cardTemplateLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_template.png';
      img.onload = () => { this.cardTemplateLoaded = true; };
      img.onerror = () => { this.cardTemplateLoaded = false; };
      this.cardTemplate = img;
    } catch (e) {
      this.cardTemplateLoaded = false;
    }
    
    // 加载卡牌选中态背景图
    this.cardTemplateSelected = null;
    this.cardTemplateSelectedLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/card_template_selected.png';
      img.onload = () => { this.cardTemplateSelectedLoaded = true; };
      img.onerror = () => { this.cardTemplateSelectedLoaded = false; };
      this.cardTemplateSelected = img;
    } catch (e) {
      this.cardTemplateSelectedLoaded = false;
    }
    // 加载游戏进度栏背景图
    this.gameProgressImage = null;
    this.gameProgressLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/game_progress.png';
      img.onload = () => { this.gameProgressLoaded = true; };
      img.onerror = () => { this.gameProgressLoaded = false; };
      this.gameProgressImage = img;
    } catch (e) {
      this.gameProgressLoaded = false;
    }

        // 加载购买成功弹窗底部飘带
    this.buySuccessBandImg = null;
    this.buySuccessBandLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/buy_succes_band.png';
      img.onload = () => { this.buySuccessBandLoaded = true; };
      img.onerror = () => { this.buySuccessBandLoaded = false; };
      this.buySuccessBandImg = img;
    } catch (e) {
      this.buySuccessBandLoaded = false;
    }
    
    // 道具卡牌图标（由 CloudStorageManager 从云端注入，此处只初始化占位）
    this.shopCardImages = {};
    const shopCardNames = new Set();
    Object.values(SHOP_POOL).forEach(pool => {
      pool.forEach(item => {
        const iconName = item.trigger || item.effect;
        if (iconName) shopCardNames.add(iconName);
      });
    });
    shopCardNames.forEach(name => {
      this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
    });
    
    // 加载空位替代图片
    ['empty_witch_card', 'empty_potion_card'].forEach((name) => {
      try {
        const img = wx.createImage();
        img.src = `images/${name}.png`;
        img.onload = () => {
          const data = this.shopCardImages[name];
          if (data) {
            data.loaded = true;
            data.width = img.width || 0;
            data.height = img.height || 0;
          }
        };
        img.onerror = () => { this.shopCardImages[name] = { img: null, loaded: false }; };
        try {
          wx.getImageInfo({
            src: `/images/${name}.png`,
            success: (res) => {
              const data = this.shopCardImages[name];
              if (data) {
                data.width = res.width;
                data.height = res.height;
              }
            }
          });
        } catch (e) {}
        this.shopCardImages[name] = { img, loaded: false, width: 0, height: 0 };
      } catch (e) {
        this.shopCardImages[name] = { img: null, loaded: false };
      }
    });
    
    // 动画粒子与飞行状态
    this.sparkles = [];
    this.flyingScore = null;
    this.scoreRoll = null;
    this.lastBoxScore = 0;
    this.lastScore = 0;
    this.scoreAnim = null;
    this.lastGold = 0;
    this.goldAnim = null;
    this.debugMenuOpen = false;
    this.witchPropRects = [];
    this.cloudLogScrollY = 0;
    this.cloudLogDragging = false;
    this.cloudLogDragStartY = 0;
    this.cloudLogDragStartScrollY = 0;
    this.cloudLogRect = null;
    this.cloudLogScrollBarRect = null;
    this.showCloudDebugLogs = false; // 调试日志开关，需要排查时设为 true
    
    // 子渲染器
    this.settlementRenderer = new SettlementRenderer(this);
    this.witchRewardRenderer = new WitchRewardRenderer(this);
    this.shopRenderer = new ShopRenderer(this);
    this.confirmBuyRenderer = new ConfirmBuyRenderer(this);
    this.gameOverRenderer = new GameOverRenderer(this);
  }

  // 绘制道具图标（商店/已购买卡牌左侧）
  drawShopCardIcon(x, y, size, name) {
    const ctx = this.ctx;
    const data = this.shopCardImages[name];
    if (data && data.loaded && data.img) {
      ctx.drawImage(data.img, x, y, size, size);
    } else {
      // fallback: 装饰圆
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1 * this.scale;
      ctx.stroke();
    }
  }

  // 获取女巫牌可作用字母
  _getWitchLetters(trigger) {
    switch (trigger) {
      case 'letter_a': return ['A'];
      case 'letter_e': return ['E'];
      case 'has_vowel': return ['A', 'E', 'I', 'O', 'U'];
      case 'has_face': return ['X', 'Y', 'Z'];
      default: return null;
    }
  }

  // 绘制女巫牌详情弹窗
  _drawWitchDetailPopup(ctx, game, s) {
    const popup = game._witchDetailPopup;
    if (!popup) return;

    const jokers = game.jokers || [];
    const joker = jokers[popup.jokerIndex];
    if (!joker) return;

    const rect = this.witchPropRects[popup.jokerIndex];
    if (!rect) return;

    const { x: cardX, y: cardY, w: cardW, h: cardH } = rect;

    const pad = 10 * s;
    const lineH = 16 * s;

    // 根据效果描述文字长度动态计算弹窗宽度
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    const descW = ctx.measureText(joker.desc).width;
    const minPopupW = cardW + 20 * s;
    const popupW = Math.max(minPopupW, descW + pad * 2 + 20 * s);
    let popupX = cardX + (cardW - popupW) / 2;
    // 确保弹窗不超出屏幕边缘
    const edgePad = 5 * s;
    popupX = Math.max(edgePad, Math.min(popupX, this.W - popupW - edgePad));

    // 计算内容高度
    const hasLimit = joker.limit !== undefined && joker.usesLeft !== undefined;
    let contentH = pad * 2 + lineH * 3 + 4 * s; // 名称 + 效果标签 + 描述
    if (hasLimit) contentH += lineH + 2 * s; // 剩余次数
    const letters = this._getWitchLetters(joker.trigger);
    const hasLetters = letters && letters.length > 0;
    if (hasLetters) contentH += lineH + 28 * s + 4 * s; // 可作用字母标签 + 圆
    const popupH = contentH;
    const popupY = cardY + cardH + 6 * s + 2;

    // 出现动画（easeOutBack：从卡牌底部向下弹出）
    let appearScale = 1;
    let appearOffsetY = 0;
    if (popup.animStartTime) {
      const ae = Date.now() - popup.animStartTime;
      const ap = Math.min(ae / 200, 1);
      const ease = Easing.easeOutBack(ap);
      appearScale = 0.5 + 0.5 * ease;
      appearOffsetY = (1 - ease) * 12 * s;
    }

    ctx.save();
    ctx.translate(popupX + popupW / 2, popupY + popupH / 2);
    ctx.scale(appearScale, appearScale);
    ctx.translate(-(popupX + popupW / 2), -(popupY + popupH / 2));
    ctx.translate(0, appearOffsetY);

    // 小三角
    const triW = 8 * s;
    const triH = 6 * s;
    const triX = cardX + cardW / 2;
    ctx.beginPath();
    ctx.moveTo(triX - triW, popupY);
    ctx.lineTo(triX, popupY - triH);
    ctx.lineTo(triX + triW, popupY);
    ctx.closePath();
    ctx.fillStyle = '#9b59b6';
    ctx.fill();

    // 弹窗面板
    const r = 8 * s;
    this.roundRect(popupX, popupY, popupW, popupH, r, '#faf6ee', '#9b59b6', 2 * s);

    let cy = popupY + pad + lineH / 2;
    const cx = popupX + popupW / 2;

    // 名称（带星星装饰）
    ctx.save();
    ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✦ ${joker.name} ✦`, cx, cy);
    ctx.restore();

    cy += lineH + 4 * s;

    // 效果标签
    ctx.save();
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('效果', popupX + pad, cy);
    ctx.restore();

    cy += lineH;

    // 效果描述
    ctx.save();
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(joker.desc, popupX + pad, cy);
    ctx.restore();

    // 剩余次数（limit 型女巫牌）
    if (joker.limit !== undefined && joker.usesLeft !== undefined) {
      cy += lineH + 2 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = joker.usesLeft > 0 ? '#e74c3c' : '#7f8c8d';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`剩余次数：${joker.usesLeft} / ${joker.limit}`, popupX + pad, cy);
      ctx.restore();
    }

    // 可作用字母
    if (hasLetters) {
      cy += lineH + 8 * s;

      ctx.save();
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('可作用字母', popupX + pad, cy);
      ctx.restore();

      cy += lineH + 4 * s;

      const circleR = 12 * s;
      const circleGap = 8 * s;
      const totalW = letters.length * (circleR * 2) + (letters.length - 1) * circleGap;
      let lx = popupX + (popupW - totalW) / 2 + circleR;

      letters.forEach(letter => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, cy, circleR, 0, Math.PI * 2);
        ctx.fillStyle = '#9b59b6';
        ctx.fill();
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, lx, cy);
        ctx.restore();
        lx += circleR * 2 + circleGap;
      });

      // 底部装饰线（仅在有可作用字母时显示）
      const decoY = popupY + popupH - 10 * s;
      ctx.save();
      ctx.strokeStyle = 'rgba(155,89,182,0.3)';
      ctx.lineWidth = 1 * s;
      const decoW = popupW * 0.5;
      const decoX = popupX + (popupW - decoW) / 2;
      ctx.beginPath();
      ctx.moveTo(decoX, decoY);
      ctx.lineTo(decoX + decoW, decoY);
      ctx.stroke();
      ctx.restore();
    }

    // 关闭弹窗整体变换
    ctx.restore();
  }

  // ===== 字母之神专属星星飞行动画 =====
  _drawLetterGodAnim(game) {
    const ctx = this.ctx;
    const s = this.scale;
    const anim = game._letterGodAnim;
    if (!anim) return;

    if (!anim.hitCardIds) anim.hitCardIds = {};
    const elapsed = Date.now() - anim.startTime;
    const flyDuration = 1000;
    const stayDuration = 350;
    const jumpDuration = 300;
    const maxCardId = anim.maxCardId;
    const orderedIds = anim.playedCardIds;
    const sequence = [maxCardId, ...orderedIds.filter(id => id !== maxCardId)];

    // 计算总时长
    let totalDuration = flyDuration + stayDuration;
    for (let i = 1; i < sequence.length; i++) {
      totalDuration += jumpDuration + stayDuration;
    }

    // 动画完成
    if (elapsed >= totalDuration) {
      game._letterGodAnim = null;
      if (game.pendingCheck && game.pendingCheck.state === 'valid') {
        // 字母之神完成后，重置时间基准并进入阶段1（字母跳跃）
        // resolveTime 设为当前时间减去 letterJumpStart(1000ms)，
        // 这样 jumpElapsed 从 0 开始，第一个字母立即开始跳跃，不会显示 0
        game.pendingCheck.resolveTime = Date.now() - 1000;
        game.pendingCheck.animPhase = 1;
      }
      const letterGodIdx = game.pendingCheck?.letterGodIndex ?? -1;
      if (letterGodIdx >= 0 && game.jokers[letterGodIdx]) {
        game.jokers[letterGodIdx]._triggered = false;
        game.jokers[letterGodIdx]._letterGodAnimStart = null;
      }
      return;
    }

    // 获取女巫牌位置
    const letterGodIdx = game.pendingCheck?.letterGodIndex ?? -1;
    const witchRect = this.witchPropRects?.find(r => r.jokerIndex === letterGodIdx);
    const cardRects = this.cardRects || [];
    const getCardRect = (cardId) => cardRects.find(r => r.cardId === cardId);

    // ===== 烟花等待期：只绘制呼吸光晕 =====
    if (elapsed < 0) {
      if (witchRect) {
        const breath = 0.5 + 0.5 * Math.sin((Date.now() - (anim.startTime - 1000)) / 250);
        ctx.save();
        ctx.shadowColor = 'rgba(155,89,182,0.6)';
        ctx.shadowBlur = (10 + 10 * breath) * s;
        const strokeColor = `rgba(155,89,182,${0.4 + 0.4 * breath})`;
        const lineW = (2 + 2 * breath) * s;
        this.roundRect(witchRect.x, witchRect.y, witchRect.w, witchRect.h, 4 * s, null, strokeColor, lineW);
        ctx.restore();
      }
      return;
    }

    // ===== 绘制女巫牌呼吸光晕 =====
    if (witchRect) {
      const breath = 0.5 + 0.5 * Math.sin(elapsed / 250);
      ctx.save();
      ctx.shadowColor = 'rgba(155,89,182,0.6)';
      ctx.shadowBlur = (10 + 10 * breath) * s;
      const strokeColor = `rgba(155,89,182,${0.4 + 0.4 * breath})`;
      const lineW = (2 + 2 * breath) * s;
      this.roundRect(witchRect.x, witchRect.y, witchRect.w, witchRect.h, 4 * s, null, strokeColor, lineW);
      ctx.restore();
    }

    // ===== 计算星星位置 =====
    let starX, starY;
    let currentCardId = null;

    if (elapsed < flyDuration) {
      const t = elapsed / flyDuration;
      const eased = Easing.easeOutCubic(t);
      const maxRect = getCardRect(maxCardId);
      if (witchRect && maxRect) {
        starX = witchRect.x + witchRect.w / 2 + (maxRect.x + maxRect.w / 2 - witchRect.x - witchRect.w / 2) * eased;
        starY = witchRect.y + witchRect.h / 2 + (maxRect.y + maxRect.h / 2 - witchRect.y - witchRect.h / 2) * eased;
      }
    } else {
      let t0 = flyDuration;
      if (elapsed < t0 + stayDuration) {
        const maxRect = getCardRect(maxCardId);
        if (maxRect) {
          starX = maxRect.x + maxRect.w / 2;
          starY = maxRect.y + maxRect.h / 2;
        }
        currentCardId = maxCardId;
        anim.hitCardIds[maxCardId] = true;
      } else {
        t0 += stayDuration;
        for (let i = 1; i < sequence.length; i++) {
          const fromId = sequence[i - 1];
          const toId = sequence[i];
          if (elapsed < t0 + jumpDuration) {
            const t = (elapsed - t0) / jumpDuration;
            const fromRect = getCardRect(fromId);
            const toRect = getCardRect(toId);
            if (fromRect && toRect) {
              const fromX = fromRect.x + fromRect.w / 2;
              const fromY = fromRect.y + fromRect.h / 2;
              const toX = toRect.x + toRect.w / 2;
              const toY = toRect.y + toRect.h / 2;
              starX = fromX + (toX - fromX) * t;
              const jumpHeight = 40 * s;
              starY = fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * jumpHeight;
            }
            currentCardId = toId;
            break;
          }
          t0 += jumpDuration;
          if (elapsed < t0 + stayDuration) {
            const toRect = getCardRect(toId);
            if (toRect) {
              starX = toRect.x + toRect.w / 2;
              starY = toRect.y + toRect.h / 2;
            }
            currentCardId = toId;
            anim.hitCardIds[toId] = true;
            break;
          }
          t0 += stayDuration;
        }
      }
    }

    // 设置当前停留卡牌的分数脉冲
    if (currentCardId) {
      let card = null;
      if (game.hand) card = game.hand.find(c => c && c.id === currentCardId);
      if (!card && game.pendingCheck && game.pendingCheck.cards) {
        card = game.pendingCheck.cards.find(c => c.id === currentCardId);
      }
      if (card && !card._scorePulseAnim) {
        card._scorePulseAnim = { startTime: Date.now(), duration: 500 };
      }
    }

    // ===== 绘制星星 =====
    if (starX !== undefined && starY !== undefined) {
      ctx.save();
      // 星星自转角度（飞行过程中缓慢旋转）
      const starRot = elapsed / 800;
      ctx.shadowColor = 'rgba(155,89,182,0.85)';
      ctx.shadowBlur = 14 * s;
      ctx.fillStyle = '#9b59b6';
      this._drawStar(ctx, starX, starY, 7 * s, 3 * s, 5, starRot);
      ctx.shadowBlur = 0;
      // 中心高光点
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(starX, starY, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ===== 绘制五角星 =====
  _drawStar(ctx, cx, cy, outerR, innerR, spikes = 5, rotation = 0) {
    let rot = Math.PI / 2 * 3 + rotation;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR;
      y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  // ===== HUD 女巫技能详情弹窗 =====
  _drawHudWitchPopup(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    const popup = game._hudWitchPopup;
    if (!popup) return;

    const witchSkill = getSkillForLevel(game.round);
    if (!witchSkill) return;

    const rect = this.hudWitchAvatarRect;
    if (!rect) return;

    const { x: avatarX, y: avatarY, w: avatarW, h: avatarH } = rect;

    const pad = 10 * s;
    const lineH = 16 * s;

    // 计算弹窗宽度
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    const descW = ctx.measureText(witchSkill.desc).width;
    const rewardW = ctx.measureText(witchSkill.reward_desc).width;
    const minPopupW = avatarW + 20 * s;
    const popupW = Math.max(minPopupW, Math.max(descW, rewardW) + pad * 2 + 20 * s);
    let popupX = avatarX + (avatarW - popupW) / 2;

    // 左边缘防溢出
    const edgePad = 5 * s;
    popupX = Math.max(edgePad, Math.min(popupX, W - popupW - edgePad));

    // 计算内容高度
    const popupH = pad * 2 + lineH * 4 + 8 * s;
    const popupY = avatarY + avatarH + 6 * s + 2;

    // 出现动画（easeOutBack：从头像下方弹出）
    let appearScale = 1;
    let appearOffsetY = 0;
    if (popup.animStartTime) {
      const ae = Date.now() - popup.animStartTime;
      const ap = Math.min(ae / 200, 1);
      const ease = Easing.easeOutBack(ap);
      appearScale = 0.5 + 0.5 * ease;
      appearOffsetY = (1 - ease) * 12 * s;
    }

    ctx.save();
    ctx.translate(popupX + popupW / 2, popupY + popupH / 2);
    ctx.scale(appearScale, appearScale);
    ctx.translate(-(popupX + popupW / 2), -(popupY + popupH / 2));
    ctx.translate(0, appearOffsetY);

    // 小三角
    const triW = 8 * s;
    const triH = 6 * s;
    const triX = avatarX + avatarW / 2;
    ctx.beginPath();
    ctx.moveTo(triX - triW, popupY);
    ctx.lineTo(triX, popupY - triH);
    ctx.lineTo(triX + triW, popupY);
    ctx.closePath();
    ctx.fillStyle = '#9b59b6';
    ctx.fill();

    // 弹窗面板
    const r = 8 * s;
    this.roundRect(popupX, popupY, popupW, popupH, r, '#faf6ee', '#9b59b6', 2 * s);

    let cy = popupY + pad + lineH / 2;
    const cx = popupX + popupW / 2;

    // 名称（带星星装饰）
    ctx.save();
    ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✦ ${witchSkill.name} ✦`, cx, cy);
    ctx.restore();

    cy += lineH + 4 * s;

    // 效果标签
    ctx.save();
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('效果', popupX + pad, cy);
    ctx.restore();

    cy += lineH;

    // 效果描述
    ctx.save();
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(witchSkill.desc, popupX + pad, cy);
    ctx.restore();

    cy += lineH + 4 * s;

    // 奖励标签
    ctx.save();
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('奖励', popupX + pad, cy);
    ctx.restore();

    cy += lineH;

    // 奖励描述
    ctx.save();
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(witchSkill.reward_desc, popupX + pad, cy);
    ctx.restore();

    // 底部装饰线
    const decoY = popupY + popupH - 10 * s;
    ctx.save();
    ctx.strokeStyle = 'rgba(155,89,182,0.3)';
    ctx.lineWidth = 1 * s;
    const decoW = popupW * 0.5;
    const decoX = popupX + (popupW - decoW) / 2;
    ctx.beginPath();
    ctx.moveTo(decoX, decoY);
    ctx.lineTo(decoX + decoW, decoY);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // 绘制虚线空位
  _drawEmptySlot(ctx, x, y, w, h, s, type = null) {
    // 如果有对应的空位图片，优先使用（cover 模式裁剪到圆角矩形）
    if (type) {
      const imgName = type === 'witch' ? 'empty_witch_card' : 'empty_potion_card';
      const data = this.shopCardImages[imgName];
      if (data && data.loaded && data.img) {
        const r = 4 * s;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.clip();

        const cardAspect = w / h;
        const aspect = (data.width > 0 && data.height > 0)
          ? data.width / data.height
          : cardAspect;
        let drawW, drawH, imgX, imgY;
        if (aspect > cardAspect) {
          drawW = w;
          drawH = drawW / aspect;
          imgX = x;
          imgY = y + (h - drawH) / 2;
        } else {
          drawH = h;
          drawW = drawH * aspect;
          imgX = x + (w - drawW) / 2;
          imgY = y;
        }
        ctx.drawImage(data.img, imgX, imgY, drawW, drawH);
        ctx.restore();
        return;
      }
    }

    // 兜底：虚线框
    ctx.save();
    ctx.strokeStyle = 'rgba(196,163,90,0.3)';
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.beginPath();
    const r = 4 * s;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 绘制已购买道具卡牌（cover模式裁剪到空位大小+底部蒙层+名字）
  _drawPropCard(ctx, prop, x, y, w, h, s) {
    const iconName = prop.trigger || prop.effect;
    const iconData = this.shopCardImages[iconName];
    let offsetY = prop._jumpOffsetY || 0;

    // shield_illegal 触发动画（非法单词时的跳跃+光晕，跳2次每次200ms）
    if (prop._shieldAnimStart && prop.trigger === 'shield_illegal') {
      const elapsed = Date.now() - prop._shieldAnimStart;
      const totalDuration = 400; // 2次 × 200ms
      if (elapsed < totalDuration) {
        const cycle = 200;
        const cycleProgress = (elapsed % cycle) / cycle;
        offsetY = Easing.jump(cycleProgress, 12 * s);
        prop._triggered = true;
      } else {
        prop._shieldAnimStart = null;
        prop._triggered = false;
        offsetY = 0;
      }
    }

    // letter_god 呼吸光晕（由 _drawLetterGodAnim 统一管理时长）
    if (prop._letterGodAnimStart && prop.trigger === 'letter_god') {
      prop._triggered = true;
    }

    const finalY = y + offsetY;
    const r = 4 * s;

    // === 自毁动画（撕裂效果）===
    let destroyProgress = 0;
    if (prop._destroying && prop._destroyStart) {
      const destroyElapsed = Date.now() - prop._destroyStart;
      const destroyDuration = 900;
      destroyProgress = Math.min(destroyElapsed / destroyDuration, 1);
    }

    // 如果有触发状态，先画紫色光晕 + 边框（在 clip 之外）
    if (prop._triggered) {
      ctx.save();

      // 紫色径向光晕（脉动）
      const glowCX = x + w / 2;
      const glowCY = finalY + h / 2;
      const glowR = Math.max(w, h) * 0.9;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
      const glowGrad = ctx.createRadialGradient(glowCX, glowCY, glowR * 0.1, glowCX, glowCY, glowR);
      glowGrad.addColorStop(0, `rgba(155,89,182,${0.3 * pulse})`);
      glowGrad.addColorStop(0.5, `rgba(155,89,182,${0.15 * pulse})`);
      glowGrad.addColorStop(1, 'rgba(155,89,182,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(glowCX, glowCY, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 外层扩散光晕（轮廓向外冒光）
      ctx.strokeStyle = 'rgba(155,89,182,0.15)';
      ctx.lineWidth = 6 * s;
      ctx.shadowColor = 'rgba(155,89,182,0.5)';
      ctx.shadowBlur = 14 * s;
      ctx.beginPath();
      ctx.moveTo(x + r, finalY);
      ctx.lineTo(x + w - r, finalY);
      ctx.quadraticCurveTo(x + w, finalY, x + w, finalY + r);
      ctx.lineTo(x + w, finalY + h - r);
      ctx.quadraticCurveTo(x + w, finalY + h, x + w - r, finalY + h);
      ctx.lineTo(x + r, finalY + h);
      ctx.quadraticCurveTo(x, finalY + h, x, finalY + h - r);
      ctx.lineTo(x, finalY + r);
      ctx.quadraticCurveTo(x, finalY, x + r, finalY);
      ctx.closePath();
      ctx.stroke();

      // 紫色粗边框
      ctx.strokeStyle = '#9b59b6';
      ctx.lineWidth = 2.5 * s;
      ctx.shadowColor = 'rgba(155,89,182,0.6)';
      ctx.shadowBlur = 8 * s;
      ctx.beginPath();
      ctx.moveTo(x + r, finalY);
      ctx.lineTo(x + w - r, finalY);
      ctx.quadraticCurveTo(x + w, finalY, x + w, finalY + r);
      ctx.lineTo(x + w, finalY + h - r);
      ctx.quadraticCurveTo(x + w, finalY + h, x + w - r, finalY + h);
      ctx.lineTo(x + r, finalY + h);
      ctx.quadraticCurveTo(x, finalY + h, x, finalY + h - r);
      ctx.lineTo(x, finalY + r);
      ctx.quadraticCurveTo(x, finalY, x + r, finalY);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 自毁动画变换
    if (destroyProgress > 0) {
      ctx.save();
      const centerX = x + w / 2;
      const centerY = finalY + h / 2;
      const eased = Easing.easeOutCubic(destroyProgress);
      ctx.translate(centerX, centerY);
      ctx.rotate(eased * 0.3);
      ctx.scale(1 - eased * 0.5, 1 - eased * 0.5);
      ctx.translate(-centerX, -centerY);
      ctx.globalAlpha = 1 - eased;
    }

    // 圆角裁剪（与空位形状一致）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, finalY);
    ctx.lineTo(x + w - r, finalY);
    ctx.quadraticCurveTo(x + w, finalY, x + w, finalY + r);
    ctx.lineTo(x + w, finalY + h - r);
    ctx.quadraticCurveTo(x + w, finalY + h, x + w - r, finalY + h);
    ctx.lineTo(x + r, finalY + h);
    ctx.quadraticCurveTo(x, finalY + h, x, finalY + h - r);
    ctx.lineTo(x, finalY + r);
    ctx.quadraticCurveTo(x, finalY, x + r, finalY);
    ctx.closePath();
    ctx.clip();

    if (iconData && iconData.loaded && iconData.img) {
      const cardAspect = w / h;
      const aspect = (iconData.width > 0 && iconData.height > 0)
        ? iconData.width / iconData.height
        : cardAspect;
      let drawW, drawH, imgX, imgY;
      if (aspect > cardAspect) {
        drawW = w;
        drawH = drawW / aspect;
        imgX = x;
        imgY = finalY + (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = drawH * aspect;
        imgX = x + (w - drawW) / 2;
        imgY = finalY;
      }
      ctx.drawImage(iconData.img, imgX, imgY, drawW, drawH);
    } else {
      this.roundRect(x, finalY, w, h, 4 * s, '#2d2d3a');
      this.drawShopCardIcon(x + (w - 24 * s) / 2, finalY + (h - 24 * s) / 2, 24 * s, iconName);
    }
    ctx.restore();

    // 底部蒙层（跟随偏移）
    const maskH = h * 0.35;
    const maskY = finalY + h - maskH;
    const maskR = Math.min(r, maskH / 2);
    this.roundRect(x + 3, maskY, w - 6, maskH, maskR, 'rgba(0,0,0,0.55)');

    // 名字（自适应字号）
    ctx.save();
    const fontSize = Math.min(Math.floor(10 * s), Math.floor(w / 6));
    ctx.font = `bold ${Math.max(7, fontSize)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prop.name, x + w / 2, maskY + maskH / 2);
    ctx.restore();

    // 剩余次数标签（limit 型女巫牌，右上角）
    if (prop.limit !== undefined && prop.usesLeft !== undefined) {
      ctx.save();
      const badgeSize = 14 * s;
      const badgeX = x + w - badgeSize - 2 * s;
      const badgeY = finalY + 2 * s;
      const badgeColor = prop.usesLeft > 0 ? '#e74c3c' : '#7f8c8d';
      ctx.beginPath();
      ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = badgeColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      ctx.font = `bold ${Math.max(7, Math.floor(8 * s))}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${prop.usesLeft}`, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 0.5 * s);
      ctx.restore();
    }

    // 撕裂线条效果（自毁动画期间）
    if (destroyProgress > 0) {
      ctx.save();
      const tearAlpha = Math.min(destroyProgress * 2, 1);
      ctx.strokeStyle = `rgba(0,0,0,${tearAlpha})`;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      // 左下到右上的斜线
      ctx.moveTo(x + w * 0.1, finalY + h * 0.9);
      ctx.lineTo(x + w * 0.3, finalY + h * 0.7);
      ctx.moveTo(x + w * 0.7, finalY + h * 0.3);
      ctx.lineTo(x + w * 0.9, finalY + h * 0.1);
      // 横向裂缝
      ctx.moveTo(x + w * 0.2, finalY + h * 0.5);
      ctx.lineTo(x + w * 0.5, finalY + h * 0.45);
      ctx.moveTo(x + w * 0.5, finalY + h * 0.55);
      ctx.lineTo(x + w * 0.8, finalY + h * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // 恢复自毁动画变换
    if (destroyProgress > 0) {
      ctx.restore();
    }
  }

  // 绘制圆角矩形
  roundRect(x, y, w, h, r, fill, stroke, lineWidth = 2) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  // 绘制文字
  text(str, x, y, size, color, align = 'center') {
    const ctx = this.ctx;
    ctx.font = `${Math.floor(size * this.scale)}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  // 绘制按钮
  button(label, x, y, w, h, color, textColor = '#fff') {
    this.roundRect(x, y, w, h, 8 * this.scale, color);
    this.text(label, x + w / 2, y + h / 2, 16, textColor);
    return { x, y, w, h };
  }

  // 绘制图片按钮
  drawBtnImage(name, x, y, w, h) {
    const ctx = this.ctx;
    const btn = this.btnImages[name];
    if (btn && btn.loaded && btn.img) {
      ctx.drawImage(btn.img, x, y, w, h);
    } else {
      // 图片未加载时显示占位色块
      this.roundRect(x, y, w, h, 8 * this.scale, '#555');
    }
  }

  // 绘制卡牌（使用 card_template.png 背景图 + 文字叠加）
  drawCard(card, x, y, isNew = false, displayScoreOverride = null) {
    const ctx = this.ctx;
    const w = this.cardW;
    const h = this.cardH;
    const s = this.scale;

    // 应用动画偏移
    let drawX = x;
    let drawY = y;
    let rotation = 0;
    let scale = 1;
    let opacity = 1;

    if (card.animOffset) {
      drawX += card.animOffset.x || 0;
      drawY += card.animOffset.y || 0;
      rotation = card.animOffset.rotation || 0;
      opacity = card.animOffset.opacity !== undefined ? card.animOffset.opacity : 1;
      scale = card.animOffset.scale || 1;
    }

    if (card.selectOffset) {
      drawY += card.selectOffset;
    }
    if (card.jumpOffsetY) {
      drawY += card.jumpOffsetY;
    }

    ctx.globalAlpha = opacity;
    ctx.save();
    ctx.translate(drawX + w / 2, drawY + h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);

    const hw = w / 2;
    const hh = h / 2;
    const darkBlue = '#1a2f4a';
    const warmGold = '#9a7b3d';

    // === 1. 背景图（普通 / 选中态） ===
    if (card.selected && this.cardTemplateSelected && this.cardTemplateSelectedLoaded) {
      ctx.drawImage(this.cardTemplateSelected, -hw, -hh, w, h);
    } else if (this.cardTemplate && this.cardTemplateLoaded) {
      ctx.drawImage(this.cardTemplate, -hw, -hh, w, h);
    } else {
      // 兜底：暖白色圆角矩形
      this.roundRect(-hw, -hh, w, h, 10 * s, '#faf6ee', '#c4a35a');
    }

    // === 2. 大写字母 ===
    ctx.font = `bold ${Math.floor(32 * s)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.letter, 0, -hh + h * 0.33 - 2 * s + 1 * s);

    // === 3. 分数（支持过渡动画 + 脉冲强调）===
    ctx.save();
    const scoreX = 0;
    const scoreY = -hh + h * 0.74;
    ctx.translate(scoreX, scoreY);

    // 字母之神分数脉冲动画（放大→回弹，与 HUD 分数更新一致）
    let scoreScale = 1;
    if (card._scorePulseAnim) {
      const pulse = this._calcPulseScale(card._scorePulseAnim, 0.35);
      scoreScale = pulse.scale;
      if (pulse.progress >= 1) {
        delete card._scorePulseAnim;
      }
    }
    if (card._scoreScale) {
      scoreScale = card._scoreScale;
    }
    ctx.scale(scoreScale, scoreScale);

    let displayScore = displayScoreOverride !== null ? displayScoreOverride : card.score;

    ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${displayScore}分`, 0, 0);
    ctx.restore();

    // === 6. 新牌标记 ===
    if (isNew) {
      ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#2ecc71';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEW', -hw + 16 * s, -hh + 14 * s);
    }

    // === 7. Face 牌标记（JQK） ===
    if (card.isFace) {
      ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = warmGold;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', hw - 10 * s, hh - 10 * s);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 主渲染入口
  render(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 绘制背景
    ctx.clearRect(0, 0, W, H);
    if (this.bgImage && this.bgLoaded) {
      ctx.drawImage(this.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }

    // 根据状态绘制不同界面
    if (game.state === 'playing') {
      this.drawHUD(game);
      this.drawPlaying(game);
      // 字母之神专属星星飞行动画（在其他女巫牌动画之前）
      if (game._letterGodAnim) {
        this._drawLetterGodAnim(game);
      }
      // HUD 女巫技能详情弹窗
      if (game._hudWitchPopup) {
        this._drawHudWitchPopup(game);
      }
      // 字母置换弹窗（覆盖在游戏页面上方）
      if (game._changeLetterPopup) {
        this.drawChangeLetterPopup(game);
      }
      // hintToast 提示
      this._drawHintToast(game);
    } else if (game.state === 'settlement') {
      // 金币结算弹窗（保留 HUD 背景）
      this.drawHUD(game);
      this.drawCoinCapsule(game);
      this.settlementRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'witch_reward') {
      // 女巫奖励弹窗
      this.drawHUD(game);
      this.drawCoinCapsule(game);
      this.witchRewardRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'shop') {
      // 商店页面（显示标题+金币胶囊，不显示目标分 bar）
      this.drawTopHeader();

      // 游戏标题
      const top = (this.safeTop || 0) + 20;
      ctx.save();
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Words Witch Game', W / 2, top - 12 * s);
      ctx.restore();

      this.drawCoinCapsule(game);
      this.shopRenderer.draw(ctx, game, W, H, s);
      // 确认购买弹窗（覆盖在商店上方）
      if (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) {
        this.confirmBuyRenderer.draw(ctx, game, W, H, s);
      }
    } else if (game.state === 'potion') {
      this.drawPotion(game);
    } else if (game.state === 'gameover') {
      // 结束报告弹窗（保留游戏页面背景）
      this.drawHUD(game);
      this.drawCoinCapsule(game);
      this.drawPlaying(game);
      this.gameOverRenderer.draw(ctx, game, W, H, s);
    }

    // 绘制动画
    this.updateAnimations();
    
    // 绘制烟花粒子
    this._updateAndDrawSparkles(ctx, s);
    
    // 绘制飞行中的总分
    this._updateAndDrawFlyingScore(ctx, s, game);
    
    // 商店 → 游戏 页面过渡遮罩
    if (game._shopToGameTransition) {
      const elapsed = Date.now() - game._shopToGameTransition.startTime;
      const duration = 800;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        let alpha = 0;
        if (progress < 0.5) {
          // 前半段：商店淡出（遮罩淡入）
          alpha = progress * 2 * 0.2;
        } else {
          // 后半段：游戏淡入（遮罩淡出）
          alpha = (1 - progress) * 2 * 0.2;
        }
        ctx.fillStyle = `rgba(10, 22, 40, ${alpha})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        game._shopToGameTransition = null;
        game._challengeBtnPressed = false;
        if (this.shopRenderer) this.shopRenderer.challengeBtnPressed = false;
      }
    }

    // 云存储调试日志（真机排查用）
    this._drawCloudDebugLogs(ctx, game, s);

    // 调试菜单（最后绘制，确保在最上层）
    if (this.debugMenuOpen && this.topIconRect) {
      this._drawDebugMenu(ctx, game, this.topIconRect.x, this.topIconRect.y + this.topIconRect.h + 4 * s, s);
    }
  }

  // 绘制顶部图标 + 标题（商店/游戏共用）
  drawTopHeader() {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    const top = (this.safeTop || 0) + 20;

    // 左上角图标（压在 topbar 上方）
    const iconSize = 40 * s;
    const iconX = 15 * s;
    const iconY = top - iconSize - 5;
    if (this.topIcon && this.topIconLoaded) {
      ctx.drawImage(this.topIcon, iconX, iconY, iconSize, iconSize);
    }
    // 记录点击区域
    this.topIconRect = { x: iconX, y: iconY, w: iconSize, h: iconSize };
  }

  drawHUD(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    const top = (this.safeTop || 0) + 20;
    const h = 72 * s;

    this.drawTopHeader();

    // 游戏标题
    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Words Witch Game', W / 2, top - 12 * s);
    ctx.restore();

    // === 目标分 / 当前 卡片式 top bar ===
    const barW = W - 20 * s;
    const barH = h;
    const barX = 10 * s;
    const barY = top + 9;
    const r = 10 * s;
    const gold = '#c4a35a';
    const darkBlue = '#1a2f4a';

    const witchSkill = getSkillForLevel(game.round);
    const bg = '#f0e0c8';
    const outerStroke = '#c5a059';

    // === 背景图（game_progress.png）===
    if (this.gameProgressImage && this.gameProgressLoaded) {
      ctx.drawImage(this.gameProgressImage, barX, barY, barW, barH);
    } else {
      this.roundRect(barX, barY, barW, barH, r, bg);
    }

    // 分隔线 + 列绘制
    const lineTop = barY + 14 * s;
    const lineBot = barY + barH - 14 * s;
    ctx.strokeStyle = outerStroke;
    ctx.lineWidth = 0.8 * s;

    if (witchSkill) {
      // === 四列布局（女巫技能 32%+10px + 后三列等分剩余）===
      const col1W = barW * 0.32 + 10 * s;
      const line1Offset = 20 * s;  // 第一根分割线额外右移
      const colOtherW = (barW - col1W - line1Offset) / 3;
      const linePositions = [
        barX + col1W + line1Offset,
        barX + col1W + line1Offset + colOtherW,
        barX + col1W + line1Offset + colOtherW * 2,
      ];

      // 绘制三条分隔线
      linePositions.forEach((lx) => {
        ctx.beginPath();
        ctx.moveTo(lx, lineTop);
        ctx.lineTo(lx, lineBot);
        ctx.stroke();
        // 菱形
        ctx.save();
        ctx.translate(lx, barY + barH / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = outerStroke;
        ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
        ctx.restore();
      });

      // 列中心（各自在分割线之间居中）
      const c1 = barX + (col1W + line1Offset) * 0.5;
      const c2 = barX + col1W + line1Offset + colOtherW * 0.5;
      const c3 = barX + col1W + line1Offset + colOtherW * 1.5;
      const c4 = barX + col1W + line1Offset + colOtherW * 2.5;

      // === 列1：女巫头像（大图直接显示，不裁剪 + 呼吸摇摆） ===
      const avatarH = barH + 5*s;
      const avatarW = Math.min(avatarH, col1W);
      const baseX = barX + 25* s;
      const baseY = barY + (barH - avatarH) / 2-5*s;
      const witchAvatar = this.witchAvatars[`witch_${witchSkill.level}`];

      // 女巫呼吸 + 不倒翁式旋转摇摆
      const now = Date.now();
      const breath = Math.sin(now / 1500) * 0.03;
      const tilt = Math.sin(now / 1200) * 0.06;  // 倾斜角度 ±0.06 rad（约 ±3.4°）
      const scale = 1 + breath;
      const drawW = avatarW * scale;
      const drawH = avatarH * scale;

      ctx.save();
      // 移动到旋转中心（头像底部中心）
      ctx.translate(baseX + avatarW / 2, baseY + avatarH);
      // 不倒翁式左右摇摆
      ctx.rotate(tilt);
      // 绘制头像（以底部中心为原点）
      if (witchAvatar && witchAvatar.loaded && witchAvatar.img) {
        ctx.drawImage(witchAvatar.img, -drawW / 2, -drawH, drawW, drawH);
      } else {
        ctx.save();
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(-drawW / 2, -drawH, drawW, drawH);
        ctx.restore();
      }
      ctx.restore();

      // 保存头像点击区域（用基础位置，不随动画变）
      this.hudWitchAvatarRect = { x: baseX, y: baseY, w: avatarW, h: avatarH };

      // === 女巫技能描述标签（头像右侧，标题下方）===
      const tagH = 22 * s;
      const tagPaddingX = 10 * s;
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      const tagText = witchSkill.desc;
      const textMetrics = ctx.measureText(tagText);
      const tagW = textMetrics.width + tagPaddingX * 2;
      const tagX = baseX + avatarW + 6 * s;
      const tagY = barY - 18 * s;
      const tagR = 6 * s;

      // 标签背景（深紫色圆角 + 金色边框 + 左右尖角）
      const tipSize = 5 * s;
      ctx.save();
      ctx.fillStyle = '#5a3a6e';
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      // 左上圆角开始
      ctx.moveTo(tagX + tagR, tagY);
      // 上边缘到左尖角前
      ctx.lineTo(tagX - tipSize, tagY);
      // 左尖角
      ctx.lineTo(tagX, tagY + tagH / 2);
      // 左下
      ctx.lineTo(tagX - tipSize, tagY + tagH);
      // 下边缘
      ctx.lineTo(tagX + tagR, tagY + tagH);
      ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tagR);
      ctx.lineTo(tagX, tagY + tagR);
      ctx.quadraticCurveTo(tagX, tagY, tagX + tagR, tagY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 右侧主体圆角 + 右尖角
      ctx.save();
      ctx.fillStyle = '#5a3a6e';
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      // 右上圆角
      ctx.moveTo(tagX + tagW - tagR, tagY);
      ctx.lineTo(tagX + tagW + tipSize, tagY);
      // 右尖角
      ctx.lineTo(tagX + tagW, tagY + tagH / 2);
      // 右下
      ctx.lineTo(tagX + tagW + tipSize, tagY + tagH);
      // 下边缘到左下圆角
      ctx.lineTo(tagX + tagW - tagR, tagY + tagH);
      ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW, tagY + tagH - tagR);
      ctx.lineTo(tagX + tagW, tagY + tagR);
      ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW - tagR, tagY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 中间矩形主体
      ctx.save();
      ctx.fillStyle = '#5a3a6e';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.restore();

      // 标签文字（白色）
      ctx.save();
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);
      ctx.restore();

      // === 列2：回合 ===
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('回合', c2, barY + barH * 0.32);

      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.fillText(String(game.round), c2, barY + barH * 0.68 - 2 * s);

      // === 列3：目标分 ===
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('目标分', c3, barY + barH * 0.32);

      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.fillText(String(game.target), c3, barY + barH * 0.68 - 2 * s);

      // === 列4：当前 ===
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('当前', c4, barY + barH * 0.32);

      // 当前分数（带变化动画）
      if (!this._scoreUpdateLocked && this.lastScore !== game.score) {
        this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
        this.lastScore = game.score;
      }
      const scorePulse = this._calcPulseScale(this.scoreAnim, 0.2);
      let scoreScale = scorePulse.scale;
      if (scorePulse.progress >= 1) this.scoreAnim = null;
      ctx.save();
      ctx.translate(c4, barY + barH * 0.68 - 2 * s);
      ctx.scale(scoreScale, scoreScale);
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(game.score), 0, 0);
      ctx.restore();

    } else {
      // === 无女巫技能：保持原有3列布局 ===
      const line1X = barX + barW / 3;
      const line2X = barX + barW * 2 / 3;
      [line1X, line2X].forEach((lx) => {
        ctx.beginPath();
        ctx.moveTo(lx, lineTop);
        ctx.lineTo(lx, lineBot);
        ctx.stroke();
        ctx.save();
        ctx.translate(lx, barY + barH / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = outerStroke;
        ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
        ctx.restore();
      });

      const roundCX = barX + barW / 6;
      const targetCX = barX + barW / 2;
      const scoreCX = barX + barW * 5 / 6;

      // 左侧：回合
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('回合', roundCX, barY + barH * 0.32);

      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.fillText(String(game.round), roundCX, barY + barH * 0.68 - 2 * s);

      // 中间：目标分
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('目标分', targetCX, barY + barH * 0.32);

      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.fillText(String(game.target), targetCX, barY + barH * 0.68 - 2 * s);

      // 右侧：当前
      ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('当前', scoreCX, barY + barH * 0.32);

      if (!this._scoreUpdateLocked && this.lastScore !== game.score) {
        this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
        this.lastScore = game.score;
      }
      const scorePulse = this._calcPulseScale(this.scoreAnim, 0.2);
      let scoreScale = scorePulse.scale;
      if (scorePulse.progress >= 1) this.scoreAnim = null;
      ctx.save();
      ctx.translate(scoreCX, barY + barH * 0.68 - 2 * s);
      ctx.scale(scoreScale, scoreScale);
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(game.score), 0, 0);
      ctx.restore();
    }

  }

  drawPlaying(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 计算手牌布局（≤9张用3列，≥10张用4列）
    const cols = game.hand.length <= 9 ? 3 : 4;
    const rows = Math.ceil(game.hand.length / cols);
    const totalW = cols * this.cardW + (cols - 1) * this.gap;
    const startX = (W - totalW) / 2;

    // === 从底部按钮倒推布局 ===
    // 顺序：道具栏 → 分数方块 → 单词预览区 → 卡牌区
    // 改卡牌底部和按钮的间距时，上方区域自动跟随
    const boxSize = 56 * s;
    const top = (this.safeTop || 0) + 20;
    const h = 70 * s;  // 与 drawHUD 中的 h 保持一致
    const hudBottom = top + 9 + h;
    const maxRows = 3;
    const cardGridH = maxRows * this.cardH + (maxRows - 1) * this.gap;
    const maskHalfH = 19 * s; // 预览蒙层半高（maskH = 38*s）
    const propBarH = 84 * s;

    const btnTop = H - 90 * s;
    const cardGap = 50 * s;                                    // 卡牌底部到按钮间距（约原来的一半）
    const cardBottom = btnTop - cardGap + 3;                  // 卡牌底部
    const cardAreaY = cardBottom - cardGridH;                 // 卡牌顶部
    const wordAreaY = cardAreaY - 35 * s - maskHalfH + 2;         // 预览区中心（卡牌上方 20px）
    const scoreAreaY = wordAreaY - maskHalfH - 20 * s - boxSize; // 分数方块顶部（预览上方 20px）
    const propY = hudBottom + 6 * s;                         // 道具栏顶部（固定距 HUD 15px）

    this.cardRects = []; // 存储卡牌点击区域

    // ===== 道具卡牌栏（6格：左4女巫 + 右2药水，竖分割线）=====
    const propW = W - 20 * s;
    const propX = 10 * s;
    const padX = 10 * s;
    const dividerW = 1.5 * s;
    const gap = 6 * s;
    const slotTopPad = 6 * s;

    const slotW = (propW - padX * 2 - 5 * gap - dividerW) / 6;
    const slotH = propBarH - slotTopPad - 6 * s;

    const slotY = propY + slotTopPad;
    const leftStartX = propX + padX;
    const dividerX = leftStartX + 4 * slotW + 3.5 * gap + dividerW / 2;
    const rightStartX = dividerX + dividerW / 2 + gap / 2;

    // 背景
    this.roundRect(propX, propY, propW, propBarH, 10 * s, '#f0e0c8', '#c4a35a');

    // 竖分割线（金色实线 + 菱形，参考 HUD 分隔线）
    ctx.beginPath();
    ctx.moveTo(dividerX, slotY + 2 * s);
    ctx.lineTo(dividerX, slotY + slotH - 2 * s);
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();
    // 菱形装饰
    ctx.save();
    ctx.translate(dividerX, slotY + slotH / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c4a35a';
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();

    const jokers = game.jokers || [];
    const potions = game.potions || [];
    this.potionPropRects = [];
    this.witchPropRects = [];

    // 左区4格：女巫牌
    for (let i = 0; i < 4; i++) {
      const sx = leftStartX + i * (slotW + gap);
      const joker = jokers[i];
      if (joker) {
        this._drawPropCard(ctx, joker, sx, slotY, slotW, slotH, s);
        // 自毁动画期间不响应点击
        if (!joker._destroying) {
          this.witchPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, jokerIndex: i });
        }
      } else {
        this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'witch');
      }
    }

    // 右区2格：药水牌
    this.changeLetterHintRect = null;
    for (let i = 0; i < 2; i++) {
      const sx = rightStartX + i * (slotW + gap);
      const potion = potions[i];
      if (potion) {
        this._drawPropCard(ctx, potion, sx, slotY, slotW, slotH, s);
        this.potionPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, potionIndex: i });
      } else {
        this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'potion');
      }

      // 字母置换提示按钮（未选中1张牌时，在对应药水卡牌下方弹出）
      if (game._changeLetterHint && game._changeLetterHint.potionIndex === i && potion && potion.effect === 'change_letter') {
        const hintBtnH = 16 * s;
        const hintBtnW = slotW + 5;
        const hintBtnY = slotY + slotH + 2 * s;
        const hintElapsed = Date.now() - game._changeLetterHint.startTime;
        const hintProgress = Math.min(hintElapsed / 200, 1);
        const hintEase = Easing.easeOutBack(hintProgress);
        const hintScale = hintEase;
        const hintOffsetY = -(1 - hintEase) * 6 * s;

        const finalW = hintBtnW * hintScale;
        const finalH = hintBtnH * hintScale;
        const finalX = sx + (slotW - finalW) / 2;
        const finalY = hintBtnY + hintOffsetY + (hintBtnH - finalH) / 2;

        ctx.save();
        this.roundRect(finalX, finalY, finalW, finalH, 3 * s * Math.max(hintScale, 0.5), '#c0392b');
        ctx.font = `bold ${Math.floor(8 * s * Math.max(hintScale, 0.5))}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('选择一张字母牌', sx + slotW / 2, finalY + finalH / 2);
        ctx.restore();

        this.changeLetterHintRect = { x: sx, y: hintBtnY, w: hintBtnW, h: hintBtnH, potionIndex: i };
      }
    }

    // 单词预览区白色蒙层（常驻，固定6个字母宽度）
    const maskW = 180 * s;
    const maskH = 38 * s;
    const maskX = W / 2 - maskW / 2;
    const maskY = wordAreaY - maskH / 2;
    this.roundRect(maskX, maskY, maskW, maskH, 10 * s, 'rgba(255,255,255,0.35)', 'rgba(196,163,90,0.5)', 1 * s);

    // 预览区域（在卡牌上方）
    const selected = game.getSelectedCards();
    let valid = false;
    let invalid = false;
    let baseScore = 0;
    let showFirstBox = false;
    let showSecondBox = false;
    let pendingBaseScore = 0;
    let pendingLength = 0;
    let meaningText = null;

    // 方块区域变量（提前定义，pendingCheck 动画需要）
    const centerX = W / 2;
    const boxY = scoreAreaY;
    const leftBoxX = centerX - boxSize - 10 * s - 5;
    const rightBoxX = centerX + 10 * s + 5;

    // === pendingCheck 状态优先 ===
    let pc = null;
    if (game.pendingCheck) {
      pc = game.pendingCheck;
      const word = pc.word;

      if (pc.state === 'checking') {
        // 检测中：橙色单词 + loading图标 + 动态点号
        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();

        // 动态点号 ....（加粗变大）
        const dotCount = (Math.floor(Date.now() / 400) % 4) + 1;
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('.'.repeat(dotCount), W / 2, wordAreaY + 24 * s + 3 * s);

      } else if (pc.state === 'valid') {
        // === 公共部分：深绿色单词（支持波浪）和释义 ===
        const phase = pc.animPhase || 0;
        const elapsed = Date.now() - (pc.resolveTime || 0);

        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#2d7d32';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const letters = word.split('');
        let totalLetterW = 0;
        const letterWidths = letters.map(l => {
          const lw = ctx.measureText(l).width;
          totalLetterW += lw;
          return lw;
        });
        const startLX = W / 2 - totalLetterW / 2;
        let curX = startLX;
        letters.forEach((letter, i) => {
          const lw = letterWidths[i];
          const waveY = (pc._waveOffsetYs && pc._waveOffsetYs[i]) || 0;
          ctx.fillText(letter, curX + lw / 2, wordAreaY + waveY);
          curX += lw;
        });
        ctx.restore();

        if (pc.meaning) {
          const mText = require('./game').formatMeaning(pc.meaning);
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#777';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(mText, W / 2, wordAreaY + 33 * s);
        }

        // === 阶段0: 烟花（始终触发）===
        if (phase === 0 && !pc._sparklesSpawned) {
          pc._sparklesSpawned = true;
          this._spawnSparkles(W / 2 - 60 * s, wordAreaY, 12);
          this._spawnSparkles(W / 2 + 60 * s, wordAreaY, 12);
        }

        // === 阶段0→1 过渡（无字母之神时自动推进）===
        if (phase === 0 && !game._letterGodAnim) {
          if (!pc._phase0StartTime) pc._phase0StartTime = Date.now();
          if (Date.now() - pc._phase0StartTime >= 1000) {
            pc.animPhase = 1;
          }
        }

        if (game._letterGodAnim) {
          // 字母之神动画期间：跳过计分方块、倍率、总分飞行
          valid = true;
          pendingBaseScore = 0;
          pendingLength = (pc.cardsInOrder || []).length;
          showFirstBox = false;
          showSecondBox = false;
        } else {
          // === 正常计分动画（事件驱动）===
          const letterInterval = 350;
          const letterJumpStart = 1000;
          const cardsInOrder = pc.cardsInOrder || [];
          let accumulatedScore = 0;
          let currentJumpIdx = -1;
          let isAllJumped = false;

          // === 阶段1: 字母跳跃 ===
          if (phase >= 1) {
            const jumpElapsed = elapsed - letterJumpStart;
            currentJumpIdx = Math.floor(jumpElapsed / letterInterval);
            isAllJumped = currentJumpIdx >= cardsInOrder.length;
            if (isAllJumped) currentJumpIdx = cardsInOrder.length - 1;
            const jokers = game.jokers || [];

            // per_card 倍率提示
            pc._perCardMultText = null;
            if (!isAllJumped && currentJumpIdx >= 0 && currentJumpIdx < cardsInOrder.length) {
              const triggered = pc.jokerTriggers?.[currentJumpIdx] || [];
              if (triggered.length > 0) {
                const totalMult = triggered.reduce((prod, jIdx) => {
                  const joker = jokers[jIdx];
                  return joker && joker.value ? prod * joker.value : prod;
                }, 1);
                if (totalMult > 1) pc._perCardMultText = `x${totalMult}`;
              }
            }

            // 计算累加分数
            for (let i = 0; i <= currentJumpIdx && i < cardsInOrder.length; i++) {
              let score = cardsInOrder[i].score;
              const triggered = pc.jokerTriggers?.[i] || [];
              triggered.forEach(jIdx => {
                const joker = jokers[jIdx];
                if (joker && joker.value) score *= joker.value;
              });
              accumulatedScore += score;
            }

            // 清除女巫牌状态
            jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });

            // 波浪跳跃
            const totalJumpTime = cardsInOrder.length * letterInterval;
            const waveStartDelay = 100;
            const waveInterval2 = 80;
            if (jumpElapsed >= totalJumpTime) {
              const waveElapsed = jumpElapsed - totalJumpTime;
              if (!pc._waveOffsetYs) pc._waveOffsetYs = [];
              cardsInOrder.forEach((_, i) => {
                const waveProgress = (waveElapsed - waveStartDelay - i * waveInterval2) / 200;
                if (waveProgress >= 0 && waveProgress <= 1) {
                  const waveH = 5 * s * Math.sin(waveProgress * Math.PI);
                  pc._waveOffsetYs[i] = -waveH;
                } else {
                  pc._waveOffsetYs[i] = 0;
                }
              });
            }

            // 卡牌跳跃偏移
            cardsInOrder.forEach((card, i) => {
              if (isAllJumped) {
                card.jumpOffsetY = 0;
              } else if (i === currentJumpIdx && jumpElapsed >= 0) {
                const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                card.jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                const triggered = pc.jokerTriggers?.[i] || [];
                triggered.forEach(jIdx => {
                  const joker = jokers[jIdx];
                  if (joker) {
                    joker._triggered = true;
                    joker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                  }
                });
              } else if (i < currentJumpIdx) {
                card.jumpOffsetY = 0;
              }
            });

            // flat_bonus 女巫牌
            const globalTriggered = pc.globalTriggered || [];
            globalTriggered.forEach(jIdx => {
              const joker = jokers[jIdx];
              if (joker) {
                joker._triggered = true;
                if (!isAllJumped && currentJumpIdx >= 0) {
                  const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                  joker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                }
              }
            });

            // 清除女巫牌状态
            if (isAllJumped) {
              jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });
            }

            // 检测阶段1完成 → 进入阶段2
            if (isAllJumped && phase < 2) {
              const totalJumpTime = cardsInOrder.length * letterInterval;
              const waveDuration = 200 + cardsInOrder.length * 100;
              const waveElapsed = jumpElapsed - totalJumpTime;
              if (waveElapsed >= waveDuration + 100) {
                pc.animPhase = 2;
              }
            }
          }

          // === 阶段2: 基础倍率弹出 + whole_word 依次触发 ===
          showSecondBox = phase >= 2;

          if (phase >= 2) {
            const wjList = pc.wholeWordJokers || [];

            // 基础倍率显示等待期
            if (!pc._phase2StartTime) pc._phase2StartTime = Date.now();
            const elapsedSincePhase2 = Date.now() - pc._phase2StartTime;
            const baseMultDelay = 500;

            // 依次触发 whole_word 女巫牌（事件驱动：前一个完成后触发下一个）
            if (elapsedSincePhase2 >= baseMultDelay) {
              for (let i = 0; i < wjList.length; i++) {
                const { idx } = wjList[i];
                const joker = game.jokers?.[idx];
                if (!joker) continue;

                if (!joker._wwJumpDone) {
                  if (!joker._wwJumpStart) {
                    // 检查前面的是否都完成了
                    const prevAllDone = wjList.slice(0, i).every(({ idx: pIdx }) => {
                      const prevJoker = game.jokers?.[pIdx];
                      return !prevJoker || prevJoker._wwJumpDone;
                    });
                    if (prevAllDone) {
                      joker._wwJumpStart = Date.now();
                      joker._triggered = true;
                    }
                  }
                  break; // 一次只处理一个
                }
              }
            }

            // 处理跳跃动画
            wjList.forEach(({ idx }) => {
              const joker = game.jokers?.[idx];
              if (!joker) return;
              if (joker._wwJumpStart) {
                const jumpElapsed = Date.now() - joker._wwJumpStart;
                const jumpDuration = 400;
                const jumpProgress = Math.min(jumpElapsed / jumpDuration, 1);
                const jumpH = 12 * s * Math.sin(jumpProgress * Math.PI);
                joker._jumpOffsetY = -Math.max(0, jumpH);
                if (jumpProgress >= 1) {
                  joker._wwJumpStart = null;
                  joker._wwJumpDone = true;
                  joker._jumpOffsetY = 0;
                  joker._triggered = false;
                }
              }
            });

            // 检测阶段2完成 → 进入阶段3
            if (phase < 3) {
              const allDone = wjList.every(({ idx }) => {
                const joker = game.jokers?.[idx];
                return !joker || joker._wwJumpDone;
              });
              if (allDone && elapsedSincePhase2 >= baseMultDelay + 200) {
                pc.animPhase = 3;
              }
            }
          }

          // === 阶段3: 总分飞行 ===
          if (phase >= 3 && !pc._flyingScoreStarted) {
            pc._flyingScoreStarted = true;
            const totalScore = pc.result.score;
            this._startFlyingScore(totalScore, maskX + maskW + 10 * s, wordAreaY);
          }

          // 检测全部动画完成，调用 game.completePlayHand()
          if (phase >= 3 && pc._flyingScoreStarted && !this.flyingScore && !game._playHandAnimCompleted) {
            game._playHandAnimCompleted = true;
            if (game.completePlayHand) game.completePlayHand();
          }

          // 渲染方块数字
          valid = true;
          pendingBaseScore = accumulatedScore;
          pendingLength = cardsInOrder.length;
          showFirstBox = phase >= 1;
        }

      } else if (pc.state === 'invalid') {
        // 非法：橙色单词 + error图标 + 单词不存在
        invalid = true;
        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#f1c40f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();

        const errText = '单词不存在';
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const errTextWidth = ctx.measureText(errText).width;
        const errIconSize = 14 * s;
        const errTotalWidth = errIconSize + 4 * s + errTextWidth;
        const errBaseX = W / 2 - errTotalWidth / 2;
        const errY = wordAreaY + 22 * s + 3 * s + 5 * s + 2 * s;
        // 画 error 图标
        if (this.errorIcon && this.errorIconLoaded) {
          ctx.drawImage(this.errorIcon, errBaseX, errY - errIconSize / 2, errIconSize, errIconSize);
        }
        // 画文字
        ctx.fillText(errText, errBaseX + errIconSize + 4 * s + errTextWidth / 2, errY);
      } else if (pc.state === 'witch_failed') {
        // 女巫约束失败：橙色单词 + 紫色提示
        invalid = true;
        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#f1c40f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();

        const failText = pc.witchFailText || '女巫约束未满足';
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        const failTextWidth = ctx.measureText(failText).width;
        const hatSize = 14 * s;
        const totalW = hatSize + 4 * s + failTextWidth;
        const baseX = W / 2 - totalW / 2;
        const baseY = wordAreaY + 32 * s;

        // 出现动画（easeOutBack：从单词预览区下方弹出）
        let appearScale = 1;
        let appearOffsetY = 0;
        if (pc._witchFailAnimStart) {
          const ae = Date.now() - pc._witchFailAnimStart;
          const ap = Math.min(ae / 300, 1);
          const ease = Easing.easeOutBack(ap);
          appearScale = ease;
          appearOffsetY = -(1 - ease) * 10 * s;
        }

        ctx.save();
        ctx.translate(baseX + totalW / 2, baseY);
        ctx.scale(appearScale, appearScale);
        ctx.translate(-(baseX + totalW / 2), -baseY);
        ctx.translate(0, appearOffsetY);

        // 女巫帽子图标
        if (this.witchHatIcon && this.witchHatIconLoaded) {
          ctx.drawImage(this.witchHatIcon, baseX, baseY - hatSize / 2, hatSize, hatSize);
        }

        // 文字
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(failText, baseX + hatSize + 4 * s, baseY);
        ctx.restore();
      }

    } else if (selected.length >= 1) {
      // 普通预览：只显示单词（橙色），不检测
      const word = selected.map(c => c.letter.toLowerCase()).join('');
      ctx.save();
      ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word, W / 2, wordAreaY);
      ctx.restore();
    } else {
      // 未选择任何字母牌：显示提示文字
      ctx.save();
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(90,74,42,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择字母牌组成单词', W / 2, wordAreaY);
      ctx.restore();
    }

    // 分数预览（两个方块）—— 始终显示背景图
    const scoreColor = valid ? '#3498db' : (invalid ? '#e74c3c' : '#888');
    const multColor = valid ? '#2ecc71' : (invalid ? '#e74c3c' : '#888');

    // 计分方块两侧装饰线（score_line.png）
    if (this.scoreLineImg && this.scoreLineLoaded) {
      const lineImgW = this.scoreLineImg.width || 20;
      const lineImgH = this.scoreLineImg.height || 80;
      const lineAspect = lineImgW / lineImgH;
      const lineH = boxSize * 0.4;
      const lineW = lineH * lineAspect;
      const lineGap = 4 * s;
      const lineY = boxY + (boxSize - lineH) / 2;

      // 左侧：第一个方块左边
      ctx.drawImage(this.scoreLineImg, leftBoxX - lineW - lineGap, lineY, lineW, lineH);

      // 右侧：第二个方块右边（水平镜像）
      ctx.save();
      ctx.translate(rightBoxX + boxSize + lineGap + lineW, lineY);
      ctx.scale(-1, 1);
      ctx.drawImage(this.scoreLineImg, 0, 0, lineW, lineH);
      ctx.restore();
    }

    // 左：字母分（背景图）
    const letterScoreImg = this.scoreBoxImages['letter_score'];
    if (letterScoreImg && letterScoreImg.loaded && letterScoreImg.img) {
      ctx.drawImage(letterScoreImg.img, leftBoxX, boxY, boxSize, boxSize);
    } else {
      this.roundRect(leftBoxX, boxY, boxSize, boxSize, 4 * s, null, scoreColor);
    }
    if (valid && showFirstBox) {
      const targetScore = pendingBaseScore;
      // 检查是否需要滚动动画
      if (this.lastBoxScore !== targetScore) {
        this.scoreRoll = {
          from: this.lastBoxScore,
          to: targetScore,
          startTime: Date.now(),
          duration: 300,
        };
        this.lastBoxScore = targetScore;
      }
      // 绘制滚动数字或静止数字
      if (this.scoreRoll) {
        const rollElapsed = Date.now() - this.scoreRoll.startTime;
        const rollProgress = Math.min(rollElapsed / this.scoreRoll.duration, 1);
        const ease = rollProgress * (2 - rollProgress); // easeOutQuad
        const cx = leftBoxX + boxSize / 2;
        const cy = boxY + boxSize / 2;
        const offset = boxSize * 0.5;

        // 旧数字向上淡出
        ctx.save();
        ctx.globalAlpha = 1 - ease;
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#f5f0e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.scoreRoll.from), cx, cy - ease * offset);
        ctx.restore();

        // 新数字从下方进入
        ctx.save();
        ctx.globalAlpha = ease;
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#f5f0e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.scoreRoll.to), cx, cy + (1 - ease) * offset);
        ctx.restore();

        if (rollProgress >= 1) {
          this.scoreRoll = null;
        }
      } else {
        this.text(String(targetScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 20, '#f5f0e8');
      }
      // per_card 倍率提示（左方块上方紫色大字 + 白色底色）
      if (pc._perCardMultText) {
        ctx.save();
        const multFontSize = Math.floor(22 * s);
        ctx.font = `900 ${multFontSize}px sans-serif`;
        const textW = ctx.measureText(pc._perCardMultText).width;
        const padX = 6 * s;
        const padY = 3 * s;
        const bgW = textW + padX * 2;
        const bgH = multFontSize + padY * 2;
        const bgX = leftBoxX + boxSize / 2 - bgW / 2;
        const bgY = boxY - bgH - 2 * s;

        // 白色圆角底色（更淡、更大圆角）
        this.roundRect(bgX, bgY, bgW, bgH, 8 * s, 'rgba(255,255,255,0.72)');

        // 紫色大字（居中）
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pc._perCardMultText, leftBoxX + boxSize / 2, bgY + bgH / 2);
        ctx.restore();
      }
    } else if (!game.pendingCheck) {
      // 没有 pendingCheck 时重置
      this.lastBoxScore = 0;
      this.scoreRoll = null;
      this.lastMultValue = null;
      this.multAnim = null;
    }

    // 中：乘号（金棕色，加粗变大）
    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
    ctx.fillStyle = '#b87333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', centerX, boxY + boxSize / 2);
    ctx.restore();

    // 右：长度倍率（背景图）
    const lengthImg = this.scoreBoxImages['length'];
    if (lengthImg && lengthImg.loaded && lengthImg.img) {
      ctx.drawImage(lengthImg.img, rightBoxX, boxY, boxSize, boxSize);
    } else {
      this.roundRect(rightBoxX, boxY, boxSize, boxSize, 4 * s, null, multColor);
    }
    if (valid && showSecondBox) {
      // 基础倍率 + whole_word 依次触发（变大缩小脉冲动效）
      let displayValue = null;
      let labelText = null;
      const wjList = pc.wholeWordJokers || [];

      // 计算 phase 2 已进行的时间
      const _cards = pc.cardsInOrder || [];
      const waveDuration = 200 + _cards.length * 100;
      const phase2Start = 1000 + _cards.length * 350 + waveDuration;
      const phase2Elapsed = (Date.now() - (pc.resolveTime || 0)) - phase2Start;

      // 500ms 延迟后才开始显示
      const baseMultDelay = 500;
      const stepDuration = 700;

      if (phase2Elapsed >= baseMultDelay) {
        const afterBase = phase2Elapsed - baseMultDelay;
        // displayStep = 0: 基础倍率弹出
        // displayStep = 1: 第一张 whole_word 触发
        // displayStep = 2: 第二张 whole_word 触发
        const displayStep = Math.floor(afterBase / stepDuration);

        // 计算当前倍率
        let curMult = pendingLength;
        for (let i = 0; i < Math.min(displayStep, wjList.length); i++) {
          curMult = Math.ceil(curMult * wjList[i].joker.value);
        }
        displayValue = curMult;

        // 标签：displayStep = 1 时显示第1张的 xValue
        const labelIdx = displayStep - 1;
        if (labelIdx >= 0 && labelIdx < wjList.length) {
          const stepProgress = (afterBase % stepDuration) / stepDuration;
          if (stepProgress < 0.75) {
            labelText = `x${wjList[labelIdx].joker.value}`;
          }
        }

        // 数字变化时触发一次脉冲（类似金币动画）
        if (this.lastMultValue !== displayValue) {
          this.lastMultValue = displayValue;
          this.multAnim = { startTime: Date.now(), duration: 400 };
        }
      }

      // 绘制数字（带一次变大缩小脉冲）
      const multPulse = this._calcPulseScale(this.multAnim, 0.28);
      let pulseScale = multPulse.scale;
      if (multPulse.progress >= 1) this.multAnim = null;

      if (displayValue !== null) {
        ctx.save();
        ctx.translate(rightBoxX + boxSize / 2, boxY + boxSize / 2);
        ctx.scale(pulseScale, pulseScale);
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillStyle = '#f5f0e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(displayValue)), 0, 0);
        ctx.restore();
      }

      // 绘制 "xN" 标签（右方块上方，样式与 per_card 一致：白底紫字）
      if (labelText) {
        ctx.save();
        const multFontSize = Math.floor(22 * s);
        ctx.font = `900 ${multFontSize}px sans-serif`;
        const textW = ctx.measureText(labelText).width;
        const padX = 6 * s;
        const padY = 3 * s;
        const bgW = textW + padX * 2;
        const bgH = multFontSize + padY * 2;
        const bgX = rightBoxX + boxSize / 2 - bgW / 2;
        const bgY = boxY - bgH - 2 * s;

        // 白色圆角底色
        this.roundRect(bgX, bgY, bgW, bgH, 8 * s, 'rgba(255,255,255,0.72)');

        // 紫色大字
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, rightBoxX + boxSize / 2, bgY + bgH / 2);
        ctx.restore();
      }
    }

    // 绘制卡牌（跳过 null 占位符，其他牌位置完全不动）
    game.hand.forEach((card, i) => {
      if (!card) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      // 最后一行不满时，该行单独居中
      const cardsInRow = (row === rows - 1 && game.hand.length % cols !== 0)
        ? game.hand.length % cols
        : cols;
      const rowTotalW = cardsInRow * this.cardW + (cardsInRow - 1) * this.gap;
      const rowStartX = (W - rowTotalW) / 2;
      const x = rowStartX + col * (this.cardW + this.gap);
      const y = cardAreaY + row * (this.cardH + this.gap);
      // 字母之神动画期间，未击中的卡牌显示旧分数
      let displayScore = null;
      if (game._letterGodAnim && card._originalScore !== undefined && !game._letterGodAnim.hitCardIds?.[card.id]) {
        displayScore = card._originalScore;
      }
      this.drawCard(card, x, y, card.newCard, displayScore);
      this.cardRects.push({ x, y, w: this.cardW, h: this.cardH, cardId: card.id });

      // 清除 newCard 标记（下一帧不再显示 NEW）
      card.newCard = false;
    });

    // 绘制正在飞出的旧牌（基于原始索引位置 + animOffset）
    for (const card of game.flyingCards) {
      if (card._flyIndex !== undefined) {
        const fCol = card._flyIndex % cols;
        const fRow = Math.floor(card._flyIndex / cols);
        const fCardsInRow = (fRow === rows - 1 && game.hand.length % cols !== 0)
          ? game.hand.length % cols
          : cols;
        const fRowTotalW = fCardsInRow * this.cardW + (fCardsInRow - 1) * this.gap;
        const fRowStartX = (W - fRowTotalW) / 2;
        const fx = fRowStartX + fCol * (this.cardW + this.gap);
        const fy = cardAreaY + fRow * (this.cardH + this.gap);
        this.drawCard(card, fx, fy);
      }
    }

    // 底部图片按钮区域
    const btnY = H - 90 * s;
    const btnW = 90 * s;
    const btnH = 56 * s;
    const btnGap = 20 * s;
    const totalBtnW = btnW * 3 + btnGap * 2;
    const btnStartX = (W - totalBtnW) / 2;

    // 出牌按钮（图片 + 阴影 + 按下偏移）
    const playX = btnStartX;
    const playY = btnY + (this.pressedBtn === 'play' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.drawBtnImage('out_card', playX, playY, btnW, btnH);
    ctx.restore();
    // 出牌文字 + 剩余次数
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const btnTextY = playY + btnH / 2 - 1 * s;
    const playText = `出牌 (${game.handsLeft})`;
    const playTx = playX + btnW / 2;
    const selectedCount = game.getSelectedCards ? game.getSelectedCards().length : 0;
    const isInvalid = game.pendingCheck && game.pendingCheck.state === 'invalid';
    if (isInvalid || selectedCount < 2) {
      // 非法状态或牌数不足：深灰色文字
      ctx.fillStyle = '#666';
      ctx.fillText(playText, playTx, btnTextY);
    } else {
      // 深色外描边
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#2a1f0d';
      ctx.strokeText(playText, playTx, btnTextY);
      // 金色渐变填充
      const grad = ctx.createLinearGradient(playTx, btnTextY - 7 * s, playTx, btnTextY + 7 * s);
      grad.addColorStop(0, '#dfc06e');
      grad.addColorStop(0.5, '#c9a84c');
      grad.addColorStop(1, '#b5973e');
      ctx.fillStyle = grad;
      ctx.fillText(playText, playTx, btnTextY);
    }
    ctx.restore();
    this.playBtnRect = { x: playX, y: btnY, w: btnW, h: btnH, action: 'play' };

    // 弃牌按钮（图片 + 阴影 + 按下偏移）
    const discardX = btnStartX + btnW + btnGap;
    const discardY = btnY + (this.pressedBtn === 'discard' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.drawBtnImage('throw_card', discardX, discardY, btnW, btnH);
    ctx.restore();
    // 弃牌文字 + 剩余次数（金色渐变字）
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const discardTextY = discardY + btnH / 2 - 1 * s;
    const discardText = `弃牌 (${game.discardsLeft})`;
    const discardTx = discardX + btnW / 2;
    // 深色外描边
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#2a1f0d';
    ctx.strokeText(discardText, discardTx, discardTextY);
    // 金色渐变填充（上亮下暗，自然光照）
    const dgrad = ctx.createLinearGradient(discardTx, discardTextY - 7 * s, discardTx, discardTextY + 7 * s);
    dgrad.addColorStop(0, '#dfc06e');
    dgrad.addColorStop(0.5, '#c9a84c');
    dgrad.addColorStop(1, '#b5973e');
    ctx.fillStyle = dgrad;
    ctx.fillText(discardText, discardTx, discardTextY);
    ctx.restore();
    this.discardBtnRect = { x: discardX, y: btnY, w: btnW, h: btnH, action: 'discard' };

    // 清空选择按钮（图片 + 阴影 + 按下偏移）
    const resetX = btnStartX + (btnW + btnGap) * 2;
    const resetY = btnY + (this.pressedBtn === 'reset' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.drawBtnImage('reset_select', resetX, resetY, btnW, btnH);
    ctx.restore();
    // 清空选择文字
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const resetTextY = resetY + btnH / 2 - 1 * s;
    const resetText = '清空选择';
    const resetTx = resetX + btnW / 2;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#5a4a2a';
    ctx.strokeText(resetText, resetTx, resetTextY);
    ctx.fillStyle = '#fff';
    ctx.fillText(resetText, resetTx, resetTextY);
    ctx.restore();
    this.resetBtnRect = { x: resetX, y: btnY, w: btnW, h: btnH, action: 'reset' };

    this.drawCoinCapsule(game);

    // 女巫牌详情弹窗
    this._drawWitchDetailPopup(ctx, game, s);
  }

  drawCoinCapsule(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;

    const coinCapsuleH = 34 * s;
    const coinIconSize = 22 * s;
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    const goldText = String(game.gold);
    const goldTextW = ctx.measureText(goldText).width;
    const coinCapsuleW = coinIconSize + 6 * s + goldTextW + 18 * s;
    const coinCapsuleX = W - coinCapsuleW - 16 * s;
    const coinCapsuleY = 15 * s;
    // 半透明白色胶囊背景
    this.roundRect(coinCapsuleX, coinCapsuleY, coinCapsuleW + 6 * s, coinCapsuleH, coinCapsuleH / 2, 'rgba(255,255,255,0.35)');
    // coin.png 图标
    if (this.coinIcon && this.coinIconLoaded) {
      ctx.drawImage(this.coinIcon, coinCapsuleX + 8 * s, coinCapsuleY + (coinCapsuleH - coinIconSize) / 2, coinIconSize, coinIconSize);
    }

    // 金币变化动画
    if (this.lastGold !== game.gold) {
      this.goldAnim = { startTime: Date.now(), duration: 400 };
      this.lastGold = game.gold;
    }
    const goldPulse = this._calcPulseScale(this.goldAnim, 0.3);
    let goldScale = goldPulse.scale;
    if (goldPulse.progress >= 1) this.goldAnim = null;

    // 金币数量（带动画缩放）
    ctx.save();
    const goldTextX = coinCapsuleX + 8 * s + coinIconSize + 6 * s;
    const goldTextY = coinCapsuleY + coinCapsuleH / 2;
    ctx.translate(goldTextX + goldTextW / 2, goldTextY);
    ctx.scale(goldScale, goldScale);
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(goldText, 0, 0);
    ctx.restore();
  }

  _drawHintToast(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    if (!game.hintToast || !game.hintToast.text) return;
    const toastH = 36 * s;
    const toastY = this.H - 120 * s;
    const padding = 16 * s;
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    const textW = ctx.measureText(game.hintToast.text).width;
    const toastW = textW + padding * 2;
    const toastX = (W - toastW) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this.roundRect(toastX, toastY, toastW, toastH, 18 * s, null, null, 0);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.hintToast.text, W / 2, toastY + toastH / 2);
    ctx.restore();
  }

  drawChangeLetterPopup(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const popup = game._changeLetterPopup;
    if (!popup) return;

    const { LETTER_SCORE } = require('./data');

    const elapsed = Date.now() - (popup.startTime || Date.now());
    const panel = this._drawModalPanel(ctx, W, H, s, {
      isClosing: game._closingChangeLetter,
      closeStartTime: game._closeChangeLetterStartTime,
      width: 300, height: 410,
      borderRadius: 12, borderWidth: 2,
      overlayAlpha: 0.5, overlayFadeInDuration: 200,
      enterOffset: 30,
      elapsed,
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, enterProgress, closeAlpha } = panel;

    const baseAlpha = enterProgress;
    const gold = '#c4a35a';

    // 标题：字母置换
    ctx.save();
    ctx.globalAlpha = baseAlpha * closeAlpha;
    ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('字母置换', W / 2, py + 30 * s);
    ctx.restore();

    // 标题分隔线
    ctx.save();
    ctx.globalAlpha = baseAlpha * closeAlpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, py + 48 * s);
    ctx.lineTo(px + pw - 30 * s, py + 48 * s);
    ctx.stroke();
    ctx.restore();

    // 选中的字母卡牌（放大到 0.7，保留选中态以显示 selected.png）
    const selectedCard = game.hand.find(c => c && c.id === popup.cardId);
    if (selectedCard) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      ctx.translate(W / 2, py + 96 * s);
      ctx.scale(0.8, 0.8);
      this.drawCard(selectedCard, -this.cardW / 2, -this.cardH / 2);
      ctx.restore();
    }

    // 字母块区域
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const lCols = 7;
    const lBtnSize = 30 * s;
    const lGap = 6 * s;
    const lTotalW = lCols * lBtnSize + (lCols - 1) * lGap;
    const lStartX = (W - lTotalW) / 2;
    const lStartY = py + 160 * s;

    this.changeLetterRects = [];
    letters.forEach((letter, i) => {
      const col = i % lCols;
      const row = Math.floor(i / lCols);
      const lx = lStartX + col * (lBtnSize + lGap);
      const ly = lStartY + row * (lBtnSize + lGap);
      const isOriginal = letter === popup.originalLetter;
      const isSelected = popup.targetLetter === letter;

      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      if (isOriginal) {
        // 置灰禁用
        this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#e8e4dc');
        ctx.fillStyle = '#b0a898';
      } else if (isSelected) {
        // 选中态：金色背景
        this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#fdf5e0', '#c4a35a', 2 * s);
        ctx.fillStyle = '#8b6914';
      } else {
        // 普通态
        this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#f5f0e6', '#d4c9a8', 1 * s);
        ctx.fillStyle = '#5a4a2a';
      }
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, lx + lBtnSize / 2, ly + lBtnSize / 2);
      ctx.restore();

      if (!isOriginal) {
        this.changeLetterRects.push({ x: lx, y: ly, w: lBtnSize, h: lBtnSize, letter });
      }
    });

    // 选中的转换提示 "A → B"（金棕色）
    if (popup.targetLetter) {
      const arrowY = lStartY + Math.ceil(letters.length / lCols) * (lBtnSize + lGap) + 12 * s;
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${popup.originalLetter} → ${popup.targetLetter}`, W / 2, arrowY);
      ctx.restore();
    }

    // 置换按钮
    const btnW = 130 * s;
    const btnH = 42 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 20 * s;
    const canSwap = !!popup.targetLetter;
    ctx.save();
    ctx.globalAlpha = baseAlpha * closeAlpha;
    this.roundRect(btnX, btnY, btnW, btnH, 8 * s,
      canSwap ? '#c4a35a' : '#d4c9a8',
      canSwap ? null : '#bbb', canSwap ? 0 : 1.5 * s);
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('置换', W / 2, btnY + btnH / 2);
    ctx.restore();
    this.changeLetterSwapBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH, enabled: canSwap };

    // 关闭按钮（右上角 X）
    const closeSize = 28 * s;
    const closeX = px + pw - closeSize - 8 * s;
    const closeY = py + 8 * s;
    ctx.save();
    ctx.globalAlpha = baseAlpha * closeAlpha;
    ctx.beginPath();
    ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 1 * s);
    ctx.restore();
    this.changeLetterCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };
  }

  // 绘制药水升级动画（复用于 upgrade_letter / random_upgrade）
  _drawPotionUpgradeAnim(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const anim = game._potionUpgrading;
    const now = Date.now();
    const elapsed = now - anim.startTime;

    if (elapsed < 2100) {
      const popDuration = 400;
      const holdOldDuration = 400;
      const scoreChangeDuration = 400;
      const holdNewDuration = 700;
      const fadeOutDuration = 200;

      let cardScale = 1;
      let alpha = 1;
      let showNewScore = false;
      let scoreScale = 1;

      if (elapsed < popDuration) {
        const t = elapsed / popDuration;
        cardScale = Easing.easeOutBack(t);
      } else if (elapsed < popDuration + holdOldDuration) {
        cardScale = 1;
      } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
        showNewScore = true;
        const pulseState = {
          startTime: anim.startTime + popDuration + holdOldDuration,
          duration: scoreChangeDuration
        };
        scoreScale = this._calcPulseScale(pulseState, 0.2).scale;
      } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration + holdNewDuration) {
        showNewScore = true;
        cardScale = 1;
      } else {
        const t = (elapsed - popDuration - holdOldDuration - scoreChangeDuration - holdNewDuration) / fadeOutDuration;
        cardScale = 1 - t * 0.5;
        alpha = 1 - t;
        showNewScore = true;
      }

      // 遮罩保留，但让背景转盘依然可见
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(2, 2);

      const tempCard = {
        letter: anim.letter,
        score: showNewScore ? anim.newScore : anim.oldScore,
        baseScore: LETTER_SCORE[anim.letter],
        upgraded: showNewScore,
        upgradeMult: showNewScore ? (anim.upgradeMult || 1) : 1,
        animOffset: { scale: Math.max(0, cardScale), opacity: Math.max(0, alpha) }
      };

      if (elapsed >= popDuration + holdOldDuration && elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
        tempCard._scoreScale = scoreScale;
      }

      this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2);
      ctx.restore();
    } else {
      game._potionUpgrading = null;
      game._randomUpgradePopup = null;
      game.potionMode = null; // 动画结束后才真正清除药水
      game.state = game._prePotionState || 'shop';
      game._prePotionState = null;
    }
  }

  drawPotion(game) {
    // 随机强化药水：先画转盘背景，再叠加升级动画
    if (game.potionMode && game.potionMode.effect === 'random_upgrade') {
      this.drawRandomUpgradePopup(game);
      if (game._potionUpgrading) {
        this._drawPotionUpgradeAnim(game);
      }
      return;
    }

    // 其他药水：如果 potionMode 已清除，只剩动画，直接处理
    if (game._potionUpgrading && !game.potionMode) {
      this._drawPotionUpgradeAnim(game);
      return;
    }

    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const top = (this.safeTop || 0) + 20;
    // LETTER_SCORE 和 letterUpgrades 已在顶部导入

    // 背景由 render() 统一绘制 bgImage，不覆盖

    // === 顶部栏（参考商店页样式）===
    this.drawTopHeader();
    this.drawCoinCapsule(game);

    // 标题区域 Y 坐标（与商店页"商店"标题位置一致）
    const titleY = top - 10 * s;

    // 标题：shop_icon.png 装饰 + "选择字母" + shop_icon.png 水平镜像
    ctx.save();
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleText = '字母升级';
    const titleTextW = ctx.measureText(titleText).width;
    ctx.fillText(titleText, W / 2, titleY);
    ctx.restore();

    // 左右装饰图标
    const decoIconW = 20 * s + 2;
    const decoIconH = 20 * s;
    const decoGap = 10 * s - 2;
    const decoIconY = titleY - decoIconH / 2;
    if (this.shopIcon && this.shopIconLoaded) {
      const leftIconX = W / 2 - titleTextW / 2 - decoGap - decoIconW;
      ctx.drawImage(this.shopIcon, leftIconX, decoIconY, decoIconW, decoIconH);

      const rightIconX = W / 2 + titleTextW / 2 + decoGap;
      ctx.save();
      ctx.translate(rightIconX + decoIconW, decoIconY);
      ctx.scale(-1, 1);
      ctx.drawImage(this.shopIcon, 0, 0, decoIconW, decoIconH);
      ctx.restore();
    }

    // === 副标题 ===
    const subTitleY = titleY + 52 * s;
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择一张字母牌升级，本赛局内有效', W / 2, subTitleY);
    ctx.restore();

    // === 分隔线（两条线 + 中间菱形）===
    const dividerY = subTitleY + 22 * s;
    const lineW = 80 * s;
    const lineGap = 8 * s;
    const lineColor = '#c4a35a';
    const centerX = W / 2;
    // 左线
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(centerX - lineGap - lineW, dividerY);
    ctx.lineTo(centerX - lineGap, dividerY);
    ctx.stroke();
    // 右线
    ctx.beginPath();
    ctx.moveTo(centerX + lineGap, dividerY);
    ctx.lineTo(centerX + lineGap + lineW, dividerY);
    ctx.stroke();
    // 中间菱形
    const diamondSize = 5 * s;
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(centerX, dividerY - diamondSize);
    ctx.lineTo(centerX + diamondSize, dividerY);
    ctx.lineTo(centerX, dividerY + diamondSize);
    ctx.lineTo(centerX - diamondSize, dividerY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // === A-Z 字母网格 ===
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const cols = 4;
    const btnSize = 52 * s;
    const btnGap = 13 * s;
    const totalGridW = cols * btnSize + (cols - 1) * btnGap;
    const gridStartX = (W - totalGridW) / 2;
    const gridStartY = dividerY + 30 * s;

    // 王牌强化（upgrade_face）只允许选择 X/Y/Z
    const isFaceOnly = game.potionMode && game.potionMode.effect === 'upgrade_face';
    // 如果当前选中了不允许的字母，自动清除
    if (isFaceOnly && game._potionSelectedLetter && !['X', 'Y', 'Z'].includes(game._potionSelectedLetter)) {
      game._potionSelectedLetter = null;
    }
    const selectedLetter = game._potionSelectedLetter || null;

    this.potionLetterRects = [];
    letters.forEach((letter, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * (btnSize + btnGap);
      const y = gridStartY + row * (btnSize + btnGap);

      const isSelected = selectedLetter === letter;
      const isAllowed = !isFaceOnly || ['X', 'Y', 'Z'].includes(letter);

      // 背景圆角矩形（带底部阴影，微微立体感）
      const br = 8 * s;
      ctx.save();
      if (isSelected && isAllowed) {
        // 选中状态：金色背景+阴影
        ctx.shadowColor = 'rgba(196,163,90,0.35)';
        ctx.shadowBlur = 6 * s;
        ctx.shadowOffsetY = 3 * s;
        this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
      } else if (!isAllowed) {
        // 禁用状态：浅灰背景 + 淡阴影
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(x, y, btnSize, btnSize, br, '#e8e4dc', null, 0);
      } else {
        // 普通状态：米色背景 + 底部阴影
        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(x, y, btnSize, btnSize, br, '#f5f0e6', '#d4c9a8', 1.5 * s);
      }
      ctx.restore();

      // 字母
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      if (isSelected && isAllowed) {
        ctx.fillStyle = '#8b6914';
      } else if (!isAllowed) {
        ctx.fillStyle = '#b0a898';
      } else {
        ctx.fillStyle = '#5a4a2a';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x + btnSize / 2, y + btnSize / 2);
      ctx.restore();

      if (isAllowed) {
        this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
      }
    });

    const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

    // === 当前字母分提示 ===
    if (selectedLetter) {
      const scoreTipY = gridBottomY + 18 * s;
      const baseScore = LETTER_SCORE[selectedLetter];
      const upgrade = letterUpgrades.get(selectedLetter);
      const currentScore = upgrade ? Math.floor(baseScore * upgrade.mult) : baseScore;
      ctx.save();
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`当前字母分：${currentScore}`, W / 2, scoreTipY);
      ctx.restore();
    }

    // === 底部按钮区域（升级 + 暂存）===
    const btnAreaY = H - 75 * s;
    const potionBtnW = 130 * s;
    const potionBtnH = 46 * s;
    const potionBtnGap = 16 * s;
    const totalBtnW = potionBtnW * 2 + potionBtnGap;
    const btnStartX = (W - totalBtnW) / 2;

    // 升级按钮（需要选中字母）
    const upgradeBtnX = btnStartX;
    const upgradeBtnY = btnAreaY;
    const upgradeEnabled = !!selectedLetter && !game._potionUpgrading;
    this.roundRect(upgradeBtnX, upgradeBtnY, potionBtnW, potionBtnH, 10 * s,
      upgradeEnabled ? '#c4a35a' : '#d4c9a8',
      upgradeEnabled ? null : '#bbb', upgradeEnabled ? 0 : 1.5 * s);
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('升级', upgradeBtnX + potionBtnW / 2, upgradeBtnY + potionBtnH / 2);
    ctx.restore();
    this.potionUpgradeBtnRect = { x: upgradeBtnX, y: upgradeBtnY, w: potionBtnW, h: potionBtnH, enabled: upgradeEnabled };

    // 暂存按钮（始终可点，除非正在动画中）
    const stashBtnX = btnStartX + potionBtnW + potionBtnGap;
    const stashBtnY = btnAreaY;
    const stashEnabled = !game._potionUpgrading;
    this.roundRect(stashBtnX, stashBtnY, potionBtnW, potionBtnH, 10 * s,
      stashEnabled ? '#f5f0e6' : '#e8e4dc',
      stashEnabled ? '#c4a35a' : '#bbb', 1.5 * s);
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = stashEnabled ? '#8b6914' : '#b0a898';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂存', stashBtnX + potionBtnW / 2, stashBtnY + potionBtnH / 2);
    ctx.restore();
    this.potionStashBtnRect = { x: stashBtnX, y: stashBtnY, w: potionBtnW, h: potionBtnH, enabled: stashEnabled };

    // 如果正在播放升级动画，叠加在字母选择页面上方
    if (game._potionUpgrading) {
      this._drawPotionUpgradeAnim(game);
    }
  }

  // ===== 随机强化药水：老虎机弹窗 =====
  drawRandomUpgradePopup(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const top = (this.safeTop || 0) + 20;
    const popup = game._randomUpgradePopup;

    // 顶部栏
    this.drawTopHeader();
    this.drawCoinCapsule(game);

    const titleY = top - 10 * s;

    // 标题：shop_icon.png 装饰 + "随机强化" + shop_icon.png 水平镜像
    ctx.save();
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleText = '随机强化';
    const titleTextW = ctx.measureText(titleText).width;
    ctx.fillText(titleText, W / 2, titleY);
    ctx.restore();

    // 左右装饰图标
    const decoIconW = 20 * s + 2;
    const decoIconH = 20 * s;
    const decoGap = 10 * s - 2;
    const decoIconY = titleY - decoIconH / 2;
    if (this.shopIcon && this.shopIconLoaded) {
      const leftIconX = W / 2 - titleTextW / 2 - decoGap - decoIconW;
      ctx.drawImage(this.shopIcon, leftIconX, decoIconY, decoIconW, decoIconH);

      const rightIconX = W / 2 + titleTextW / 2 + decoGap;
      ctx.save();
      ctx.translate(rightIconX + decoIconW, decoIconY);
      ctx.scale(-1, 1);
      ctx.drawImage(this.shopIcon, 0, 0, decoIconW, decoIconH);
      ctx.restore();
    }

    // 副标题
    const subTitleY = titleY + 52 * s;
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('点击抽选，随机强化1个字母', W / 2, subTitleY);
    ctx.restore();

    // 分隔线
    const dividerY = subTitleY + 22 * s;
    const lineW = 80 * s;
    const lineGap = 8 * s;
    const lineColor = '#c4a35a';
    const centerX = W / 2;
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(centerX - lineGap - lineW, dividerY);
    ctx.lineTo(centerX - lineGap, dividerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + lineGap, dividerY);
    ctx.lineTo(centerX + lineGap + lineW, dividerY);
    ctx.stroke();
    const diamondSize = 5 * s;
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(centerX, dividerY - diamondSize);
    ctx.lineTo(centerX + diamondSize, dividerY);
    ctx.lineTo(centerX, dividerY + diamondSize);
    ctx.lineTo(centerX - diamondSize, dividerY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // === 圆形转盘 ===
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const isSpinning = popup && popup.phase === 'spinning';
    const isPaused = popup && (popup.phase === 'paused' || popup.phase === 'done');
    const targetLetter = popup ? popup.targetLetter : null;

    const wheelRadius = 160 * s;
    const wheelCenterY = dividerY + 30 * s + wheelRadius + 50;
    const anglePerSector = 360 / 26;

    // 计算当前旋转角度和高亮字母
    let currentAngle = 0;
    let highlightIdx = -1;

    if (isSpinning || isPaused) {
      const targetIdx = letters.indexOf(targetLetter);
      const targetCenterAngle = targetIdx * anglePerSector + anglePerSector / 2;
      const rotations = 3;
      const finalAngle = 360 * rotations + (360 - targetCenterAngle);

      if (isSpinning) {
        const elapsed = Date.now() - popup.spinStartTime;
        const progress = Math.min(elapsed / 3000, 1);
        const ease = Easing.easeOutCubic(progress);
        currentAngle = finalAngle * ease;
      } else {
        currentAngle = finalAngle;
      }

      const normalized = ((-currentAngle) % 360 + 360) % 360;
      highlightIdx = Math.floor(normalized / anglePerSector) % 26;
    }

    // paused 阶段：扇形闪烁2次（浅金色 ↔ 金色，周期1000ms）
    let pausedPulse = 1;
    let currentHighlightColor = '#ffe8a0';
    if (isPaused && popup.pauseStartTime && !game._potionUpgrading) {
      const pauseElapsed = Date.now() - popup.pauseStartTime;
      pausedPulse = 1 + 0.08 * Math.sin(Date.now() / 200);
      const flash = Math.sin(pauseElapsed / 400 * Math.PI); // 周期800ms，2秒内闪烁2.5次
      currentHighlightColor = flash > 0 ? '#f5c542' : '#ffe8a0';
    }

    // 绘制转盘外圈圆环
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, wheelCenterY, wheelRadius + 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#c4a35a';
    ctx.fill();
    ctx.restore();

    // 绘制转盘扇形（随转盘旋转）
    ctx.save();
    ctx.translate(centerX, wheelCenterY);
    ctx.rotate(currentAngle * Math.PI / 180);

    const sectorColors = ['#f5f0e6', '#fdf5e0'];
    const anglePerSectorRad = (Math.PI * 2) / 26;
    const startOffset = -Math.PI / 2; // A 从 12 点钟开始

    for (let i = 0; i < 26; i++) {
      const startAngle = startOffset + i * anglePerSectorRad;
      const endAngle = startOffset + (i + 1) * anglePerSectorRad;
      const isHighlighted = i === highlightIdx;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, wheelRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? currentHighlightColor : sectorColors[i % 2];
      ctx.fill();
      ctx.lineWidth = 0.8 * s;
      ctx.strokeStyle = '#d4c9a8';
      ctx.stroke();

      // 高亮扇形加金色边框
      if (isHighlighted) {
        ctx.save();
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 2.5 * s * pausedPulse;
        ctx.shadowColor = 'rgba(196,163,90,0.5)';
        ctx.shadowBlur = 10 * s * pausedPulse;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 绘制字母（径向排列，从外向内）
    for (let i = 0; i < 26; i++) {
      const midAngle = startOffset + i * anglePerSectorRad + anglePerSectorRad / 2;
      const textRadius = wheelRadius * 0.72;
      const tx = Math.cos(midAngle) * textRadius;
      const ty = Math.sin(midAngle) * textRadius;
      const isHighlighted = i === highlightIdx;

      ctx.save();
      ctx.translate(tx, ty);
      // 文字沿半径方向，底部朝向中心 → 旋转 midAngle + PI/2
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = isHighlighted ? '#8b6914' : '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letters[i], 0, 0);
      ctx.restore();
    }

    // 外圈装饰圆点
    const dotCount = 26;
    const dotRadius = 2.5 * s;
    const dotR = wheelRadius + 8 * s;
    for (let i = 0; i < dotCount; i++) {
      const angle = i * (Math.PI * 2 / dotCount) - Math.PI / 2;
      const dx = Math.cos(angle) * dotR;
      const dy = Math.sin(angle) * dotR;
      ctx.beginPath();
      ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c542';
      ctx.fill();
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 0.5 * s;
      ctx.stroke();
    }

    ctx.restore(); // 结束转盘旋转

    // === 中心"抽选"按钮（不旋转）===
    const btnRadius = 36 * s;
    const isIdle = !popup || popup.phase === 'idle';
    const spinEnabled = isIdle;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, wheelCenterY, btnRadius, 0, Math.PI * 2);
    ctx.fillStyle = spinEnabled ? '#c0392b' : '#d4c9a8';
    ctx.fill();
    ctx.strokeStyle = spinEnabled ? '#a93226' : '#bbb';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // 按钮内阴影
    ctx.beginPath();
    ctx.arc(centerX, wheelCenterY, btnRadius - 2 * s, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('抽选', centerX, wheelCenterY);
    ctx.restore();

    // 中心按钮点击区域（圆形）
    this.randomSpinBtnRect = {
      x: centerX - btnRadius,
      y: wheelCenterY - btnRadius,
      w: btnRadius * 2,
      h: btnRadius * 2,
      enabled: spinEnabled,
      isCircle: true,
      cx: centerX,
      cy: wheelCenterY,
      r: btnRadius
    };

    // === 顶部指针（不旋转）===
    const ptrY = wheelCenterY - wheelRadius - 18 * s;
    const ptrW = 18 * s;
    const ptrH = 22 * s;
    ctx.save();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(centerX, ptrY + ptrH); // 顶点指向转盘
    ctx.lineTo(centerX - ptrW / 2, ptrY);
    ctx.lineTo(centerX + ptrW / 2, ptrY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    // 指针底部小圆点
    ctx.beginPath();
    ctx.arc(centerX, ptrY, 3 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.restore();

    // === 当前高亮字母提示 ===
    if ((isSpinning || isPaused) && highlightIdx >= 0) {
      const hintY = wheelCenterY + wheelRadius + 28 * s;
      const hlLetter = letters[highlightIdx];
      ctx.save();
      ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
      ctx.fillStyle = isPaused ? '#c0392b' : '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`当前：${hlLetter}`, centerX, hintY);
      ctx.restore();
    }

    // 关闭按钮（右上角 X）
    const closeSize = 28 * s;
    const closeX = W - closeSize - 16 * s;
    const closeY = titleY - closeSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 1 * s);
    ctx.restore();
    this.randomUpgradeCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };
  }



  updateAnimations() {
    // 动画更新（后续实现）
  }

  // ===== 烟花粒子系统 =====
  _spawnSparkles(cx, cy, count = 20) {
    const s = this.scale;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      this.sparkles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed * s,
        vy: Math.sin(angle) * speed * s - 1.5 * s,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: (1.5 + Math.random() * 2.5) * s,
        color: Math.random() > 0.4 ? '#ffd700' : '#ffffff',
      });
    }
  }

  _updateAndDrawSparkles(ctx, s) {
    if (this.sparkles.length === 0) return;
    ctx.save();
    this.sparkles = this.sparkles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08 * s; // 重力
      p.life -= p.decay;
      if (p.life > 0) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }
      return false;
    });
    ctx.restore();
  }

  // ===== 绘制卡牌金色光晕 + 四角闪烁星 =====
  _drawCardGlow(ctx, cardX, cardY, cardW, cardH, s) {
    const t = Date.now();
    const cardCX = cardX + cardW / 2;
    const cardCY = cardY + cardH / 2;
    const haloR = Math.max(cardW, cardH) * 0.85;
    const pulse = 0.5 + 0.5 * Math.sin(t / 400);
    const haloGrad = ctx.createRadialGradient(cardCX, cardCY, haloR * 0.25, cardCX, cardCY, haloR);
    haloGrad.addColorStop(0, `rgba(255,215,0,${0.15 * pulse})`);
    haloGrad.addColorStop(0.5, `rgba(255,200,60,${0.08 * pulse})`);
    haloGrad.addColorStop(1, 'rgba(255,180,0,0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cardCX, cardCY, haloR, 0, Math.PI * 2);
    ctx.fill();

    const sparkles = [
      { x: cardX - 10*s, y: cardY - 6*s, r: 5, ph: 0.0 },
      { x: cardX + cardW + 8*s, y: cardY + 4*s, r: 4, ph: 2.0 },
      { x: cardX + cardW + 6*s, y: cardY + cardH, r: 5, ph: 4.0 },
      { x: cardX - 4*s, y: cardY + cardH + 6*s, r: 4, ph: 1.0 },
    ];
    sparkles.forEach((sp, i) => {
      const blink = Math.abs(Math.sin(t / 350 + sp.ph));
      const alpha = 0.3 + 0.7 * blink;
      const r = sp.r * (0.6 + 0.4 * blink) * s;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#ffffff';
      this._drawSparkleShape(ctx, sp.x, sp.y, r);
      ctx.restore();
    });
  }

  _drawSparkleShape(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.35, y - r * 0.35);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.35, y + r * 0.35);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.35, y + r * 0.35);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.35, y - r * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  // ===== 计算脉冲缩放值（数字强调动画：放大→缩小回弹）=====
  _calcPulseScale(animState, maxScale = 0.3) {
    if (!animState || !animState.startTime) return { scale: 1, progress: 1 };
    const elapsed = Date.now() - animState.startTime;
    const progress = Math.min(elapsed / animState.duration, 1);
    const scale = 1 + maxScale * Math.sin(progress * Math.PI);
    return { scale, progress };
  }

  // ===== 绘制带按压缩放的按钮（pressed 时整体缩小到 0.95）=====
  _drawScaledButton(ctx, label, x, y, w, h, s, pressed, options = {}) {
    const { color = '#c4a35a', textColor = '#fff', radius = 8, stroke = null, lineWidth = 1.5 } = options;
    const scale = pressed ? 0.95 : 1;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    this.roundRect(-w / 2, -h / 2, w, h, radius * s, color, stroke, stroke ? lineWidth * s : null);
    this.text(label, 0, 0, 16, textColor);
    ctx.restore();
  }

  // ===== 绘制弹窗面板（遮罩 + 入场 + 背景 + 关闭动画）=====
  _drawModalPanel(ctx, W, H, s, config) {
    const {
      isClosing, closeStartTime, closeDuration = 200, closeOffset = 40,
      width = 300, height = 340, enterOffset = 25, enterDuration = 350,
      overlayAlpha = 0.65, overlayFadeInDuration = 200,
      bgColor = '#faf6ee', borderColor = '#c4a35a', borderRadius = 14, borderWidth = 1.5,
      onCloseComplete, elapsed
    } = config;

    const closeElapsed = isClosing ? Date.now() - (closeStartTime || Date.now()) : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / closeDuration, 1) : 0;

    if (isClosing && closeProgress >= 1) {
      onCloseComplete?.();
      return null;
    }

    const closeSlideY = isClosing ? -closeProgress * closeOffset * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;

    ctx.save();

    // 遮罩
    const overlayA = isClosing
      ? overlayAlpha * (1 - closeProgress)
      : overlayAlpha * Math.min(elapsed / overlayFadeInDuration, 1);
    ctx.fillStyle = `rgba(0,0,0,${overlayA})`;
    ctx.fillRect(0, 0, W, H);

    // 面板入场
    const enterProgress = Math.min(elapsed / enterDuration, 1);
    const enterEase = Easing.easeOutBack(enterProgress);
    const pw = width * s;
    const ph = height * s;
    const px = (W - pw) / 2;
    const basePy = (H - ph) / 2;
    const py = basePy + (1 - enterEase) * enterOffset * s + closeSlideY;

    ctx.globalAlpha = closeAlpha;
    this.roundRect(px, py, pw, ph, borderRadius * s, bgColor, borderColor, borderWidth * s);
    ctx.restore();

    return { px, py, pw, ph, elapsed, enterProgress, closeProgress, closeAlpha };
  }

  // ===== 飞行总分动画（果冻弹出 + 停留 + 淡出） =====
  _startFlyingScore(value, startX, startY) {
    this.flyingScore = {
      value,
      startX, startY,
      startTime: Date.now(),
    };
    // 锁定 HUD 分数动画，等飞行结束后再更新
    this._scoreUpdateLocked = true;
  }

  _updateAndDrawFlyingScore(ctx, s, game) {
    if (!this.flyingScore) return;
    const fs = this.flyingScore;
    const elapsed = Date.now() - fs.startTime;

    const appearDuration = 300;
    const holdDuration = 600;
    const fadeDuration = 150;
    const totalDuration = appearDuration + holdDuration + fadeDuration;

    ctx.save();
    ctx.font = `bold ${Math.floor(26 * s)}px Georgia, serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,215,0,0.25)';
    ctx.shadowBlur = 20 * s;

    if (elapsed < appearDuration) {
      // 阶段1: 果冻弹出（easeOutBackStrong）
      const progress = elapsed / appearDuration;
      const ease = Easing.easeOutBackStrong(progress);
      const scale = ease;
      const offsetY = (1 - ease) * 15 * s;

      ctx.translate(fs.startX, fs.startY + offsetY);
      ctx.scale(scale, scale);
      ctx.fillText(`+${fs.value}`, 0, 0);
    } else if (elapsed < appearDuration + holdDuration) {
      // 阶段2: 停留（弹出结束时解锁 HUD）
      this._scoreUpdateLocked = false;
      ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
    } else if (elapsed < totalDuration) {
      // 阶段3: 淡出
      this._scoreUpdateLocked = false;
      const fadeProgress = (elapsed - appearDuration - holdDuration) / fadeDuration;
      ctx.globalAlpha = 1 - fadeProgress;
      ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
    } else {
      // 动画结束
      this.flyingScore = null;
      this._scoreUpdateLocked = false;
      if (this.lastScore !== game.score) {
        this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
        this.lastScore = game.score;
      }
    }
    ctx.restore();
  }

  // ===== 云存储调试日志（真机排查用） =====
  _drawCloudDebugLogs(ctx, game, s) {
    if (!this.showCloudDebugLogs) return;
    const logs = game.cloudStorage && game.cloudStorage.debugLogs;
    if (!logs || logs.length === 0) return;

    const lineH = 13 * s;
    const visibleLines = 10;
    const pad = 6 * s;
    const boxW = 280 * s;
    const viewportH = visibleLines * lineH + pad * 2;
    const contentH = logs.length * lineH + pad * 2;
    const boxX = this.W - boxW - 8 * s;
    const boxY = this.H - viewportH - 8 * s;

    const maxScrollY = Math.max(0, contentH - viewportH);
    this.cloudLogScrollY = Math.max(0, Math.min(this.cloudLogScrollY, maxScrollY));
    const startLine = Math.floor(this.cloudLogScrollY / lineH);

    ctx.save();
    // 日志框背景（限制在视口内）
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(boxX, boxY, boxW, viewportH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, viewportH);

    // 裁剪到内容区域
    ctx.beginPath();
    ctx.rect(boxX + 1, boxY + 1, boxW - 2, viewportH - 2);
    ctx.clip();

    ctx.font = `${Math.floor(10 * s)}px monospace`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const offsetY = this.cloudLogScrollY % lineH;
    for (let i = 0; i < visibleLines + 1; i++) {
      const lineIdx = startLine + i;
      if (lineIdx >= logs.length) break;
      ctx.fillText(logs[lineIdx], boxX + pad, boxY + pad + i * lineH - offsetY);
    }
    ctx.restore();

    // 滚动条
    if (contentH > viewportH) {
      const scrollBarW = 6 * s;
      const scrollBarX = boxX + boxW - scrollBarW - 2 * s;
      const trackY = boxY + 2 * s;
      const trackH = viewportH - 4 * s;
      const thumbH = Math.max(trackH * viewportH / contentH, 16 * s);
      const thumbY = trackY + (this.cloudLogScrollY / maxScrollY) * (trackH - thumbH);

      ctx.save();
      // 轨道
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(scrollBarX, trackY, scrollBarW, trackH);
      ctx.restore();
      // thumb（使用项目内的 roundRect，只填充不描边）
      const thumbColor = this.cloudLogDragging ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
      this.roundRect(scrollBarX, thumbY, scrollBarW, thumbH, scrollBarW / 2, thumbColor, null);

      this.cloudLogScrollBarRect = { x: scrollBarX, y: thumbY, w: scrollBarW, h: thumbH };
    } else {
      this.cloudLogScrollBarRect = null;
    }

    this.cloudLogRect = { x: boxX, y: boxY, w: boxW, h: viewportH };
  }

  // ===== 调试菜单 =====
  _drawDebugMenu(ctx, game, x, y, s) {
    const items = [
      { label: '重置出牌次数', action: 'debug_resetHands' },
      { label: '当前分+100', action: 'debug_addScore' },
      { label: '增加10金币', action: 'debug_addGold' },
      { label: '直接通关', action: 'debug_winRound' },
      { label: '刷新商店', action: 'debug_refreshShop' },
      { label: '上传shop_card', action: 'debug_upload_shop_card' },
      { label: '上传witch', action: 'debug_upload_witch' },
      { label: '结束游戏', action: 'debug_endGame' },
    ];
    const itemW = 130 * s;
    const itemH = 34 * s;
    const menuW = itemW + 8 * s;
    const menuH = items.length * itemH + 8 * s;
    const menuX = x;
    const menuY = y;
    
    // 背景
    ctx.save();
    ctx.fillStyle = 'rgba(30,30,40,0.92)';
    this.roundRect(menuX, menuY, menuW, menuH, 6 * s, 'rgba(30,30,40,0.92)');
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.restore();
    
    this.debugMenuRects = [];
    items.forEach((item, i) => {
      const iy = menuY + 4 * s + i * itemH;
      const ix = menuX + 4 * s;
      // 按钮背景
      this.roundRect(ix, iy, itemW, itemH - 4 * s, 4 * s, '#2d2d3a');
      // 文字
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#e0e0e0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, ix + itemW / 2, iy + (itemH - 4 * s) / 2);
      this.debugMenuRects.push({ x: ix, y: iy, w: itemW, h: itemH - 4 * s, action: item.action });
    });
  }

  // 检测点击位置
  hitTest(x, y, rects) {
    if (!rects) return null;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r;
      }
    }
    return null;
  }
}

// ===== 游戏结束弹窗渲染 =====
class GameOverRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastGameOverReason = null;
  }

  draw(ctx, game, W, H, s) {
    const isClosing = game._closingGameOver;
    if (!isClosing && this.lastGameOverReason !== game.gameOverReason) {
      this.animStartTime = Date.now();
      this.lastGameOverReason = game.gameOverReason;
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;
    const panel = this.parent._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeStartTime,
      width: 300, height: 290, enterOffset: 25, closeOffset: 40,
      elapsed,
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, elapsed: panelElapsed } = panel;

    // 标题
    const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
    ctx.save();
    ctx.globalAlpha = titleAnim.alpha;
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleText = '游戏结束';
    ctx.fillText(titleText, W / 2, py + 40 * s + titleAnim.yShift);
    ctx.restore();

    // 分隔线
    const line1Anim = Easing.fadeIn(elapsed, 140, 250, 6 * s);
    ctx.save();
    ctx.globalAlpha = line1Anim.alpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const line1Y = py + 62 * s + line1Anim.yShift;
    ctx.moveTo(px + 30 * s, line1Y);
    ctx.lineTo(px + pw - 30 * s, line1Y);
    ctx.stroke();
    ctx.restore();

    // 数据行
    const lineY = py + 92 * s;
    const lineH = 38 * s;

    const items = [
      { label: '到达关卡', value: `第 ${game.round} 关` },
      { label: '最终得分', value: `${game.totalScore}` },
    ];

    items.forEach((item, i) => {
      const itemAnim = Easing.fadeIn(elapsed, 180 + i * 60, 250, 8 * s);
      const y = lineY + i * lineH + itemAnim.yShift;
      ctx.save();
      ctx.globalAlpha = itemAnim.alpha;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, px + 35 * s, y);

      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(item.value, px + pw - 35 * s, y);
      ctx.restore();
    });

    // 分隔线 + 提示文字
    const hintAnim = Easing.fadeIn(elapsed, 400, 250, 6 * s);
    const hintY = lineY + items.length * lineH + 12 * s + hintAnim.yShift;
    ctx.save();
    ctx.globalAlpha = hintAnim.alpha;
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, hintY);
    ctx.lineTo(px + pw - 30 * s, hintY);
    ctx.stroke();

    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('再试一次吧，巫师学徒！', W / 2, hintY + 22 * s);
    ctx.restore();

    // 重新开始按钮
    const btnAnim = Easing.fadeIn(elapsed, 480, 250, 10 * s);
    const btnW = 160 * s;
    const btnH = 46 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 28 * s + btnAnim.yShift;
    ctx.save();
    ctx.globalAlpha = btnAnim.alpha;

    // 重新开始按钮
    this.parent._drawScaledButton(ctx, '重新开始', btnX, btnY, btnW, btnH, s, game._restartBtnPressed, { color: '#c4a35a', radius: 8 });

    // 闭合 closing 动画的 globalAlpha
    ctx.restore();

    // 存储点击区域（动画完成后固定位置）
    const finalBtnY = py + ph - btnH - 28 * s;
    this.restartBtnRect = { x: btnX, y: finalBtnY, w: btnW, h: btnH };
  }
}

module.exports = { Renderer };
