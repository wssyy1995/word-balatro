// ===== Canvas 渲染器 =====
const { formatMeaning, isValidWordOnline } = require('./game');
const { WORD_DATA, onlineWordCache, wordCheckState, LETTER_SCORE, letterUpgrades } = require('./data');
const { SettlementRenderer } = require('./settlement');
const { ShopRenderer, ConfirmBuyRenderer } = require('./shop');

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
    
    // 计算卡牌尺寸（确保9张牌能放下）
    const maxCardW = Math.floor((width - 48) / 3); // 3列，左右边距24
    const maxCardH = Math.floor((height - 200) / 3); // 3行，预留上方HUD和下方按钮
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
    
    // 加载搜索图标
    this.searchIcon = null;
    this.searchIconLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/search.png';
      img.onload = () => { this.searchIconLoaded = true; };
      img.onerror = () => { this.searchIconLoaded = false; };
      this.searchIcon = img;
    } catch (e) {
      this.searchIconLoaded = false;
    }
    
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
    
    // 加载商店标题背景图
    this.shopLabel = null;
    this.shopLabelLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/shop_label.png';
      img.onload = () => { this.shopLabelLoaded = true; };
      img.onerror = () => { this.shopLabelLoaded = false; };
      this.shopLabel = img;
    } catch (e) {
      this.shopLabelLoaded = false;
    }

    // 加载购买成功弹窗装饰图
    this.buySuccessImg = null;
    this.buySuccessLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/buy_success.png';
      img.onload = () => { this.buySuccessLoaded = true; };
      img.onerror = () => { this.buySuccessLoaded = false; };
      this.buySuccessImg = img;
    } catch (e) {
      this.buySuccessLoaded = false;
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
    
    // 加载道具卡牌图标
    this.shopCardImages = {};
    const shopCardNames = ['bonus_gold', 'extra_discard', 'extra_hands', 'has_vowel', 'letter_a', 'letter_e', 'upgrade_any', 'upgrade_face', 'upgrade_letter'];
    shopCardNames.forEach(name => {
      try {
        const img = wx.createImage();
        img.src = `images/shop_card/${name}.png`;
        img.onload = () => { this.shopCardImages[name] = { img, loaded: true }; };
        img.onerror = () => { this.shopCardImages[name] = { img, loaded: false }; };
        this.shopCardImages[name] = { img, loaded: false };
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
    
    // 子渲染器
    this.settlementRenderer = new SettlementRenderer(this);
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

  // 绘制虚线空位
  _drawEmptySlot(ctx, x, y, w, h, s) {
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
    const offsetY = prop._jumpOffsetY || 0;
    const finalY = y + offsetY;
    const r = 4 * s;

    // 如果有触发状态，先画紫色光晕 + 边框（在 clip 之外）
    if (prop._triggered) {
      ctx.save();

      // 紫色径向光晕（脉动）
      const glowCX = x + w / 2;
      const glowCY = finalY + h / 2;
      const glowR = Math.max(w, h) * 0.75;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
      const glowGrad = ctx.createRadialGradient(glowCX, glowCY, glowR * 0.15, glowCX, glowCY, glowR);
      glowGrad.addColorStop(0, `rgba(155,89,182,${0.22 * pulse})`);
      glowGrad.addColorStop(0.4, `rgba(155,89,182,${0.12 * pulse})`);
      glowGrad.addColorStop(1, 'rgba(155,89,182,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(glowCX, glowCY, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 紫色边框
      ctx.strokeStyle = '#9b59b6';
      ctx.lineWidth = 2.5 * s;
      ctx.shadowColor = 'rgba(155,89,182,0.6)';
      ctx.shadowBlur = 10 * s;
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
      const origW = iconData.img.width || 200;
      const origH = iconData.img.height || 300;
      const aspect = origW / origH;
      const cardAspect = w / h;
      let drawW, drawH, imgX, imgY;
      if (aspect > cardAspect) {
        drawH = h;
        drawW = drawH * aspect;
        imgX = x + (w - drawW) / 2;
        imgY = finalY;
      } else {
        drawW = w;
        drawH = drawW / aspect;
        imgX = x;
        imgY = finalY + (h - drawH) / 2;
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
    this.roundRect(x + 2, maskY, w - 4, maskH, maskR, 'rgba(0,0,0,0.55)');

    // 名字（自适应字号）
    ctx.save();
    const fontSize = Math.min(Math.floor(10 * s), Math.floor(w / 6));
    ctx.font = `bold ${Math.max(7, fontSize)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prop.name, x + w / 2, maskY + maskH / 2);
    ctx.restore();
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
  drawCard(card, x, y, isNew = false) {
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

    // === 3. 分数（始终显示当前实际分数）===
    ctx.save();
    const scoreX = 0;
    const scoreY = -hh + h * 0.74;
    ctx.translate(scoreX, scoreY);
    if (card._scoreScale && card._scoreScale !== 1) {
      ctx.scale(card._scoreScale, card._scoreScale);
    }
    ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${card.score}分`, 0, 0);
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
    const h = 56 * s;

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
    const barH = 56 * s;
    const barX = 10 * s;
    const barY = top + 8;
    const r = 10 * s;
    const gold = '#c4a35a';
    const darkBlue = '#1a2f4a';

    const bg = '#faf6ee';
    // === 背景填充 ===
    this.roundRect(barX, barY, barW, barH, r, bg);

    // === 外层粗边框（金色，圆角矩形） ===
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = gold;
    ctx.beginPath();
    ctx.moveTo(barX + r, barY);
    ctx.lineTo(barX + barW - r, barY);
    ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
    ctx.lineTo(barX + barW, barY + barH - r);
    ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - r, barY + barH);
    ctx.lineTo(barX + r, barY + barH);
    ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - r);
    ctx.lineTo(barX, barY + r);
    ctx.quadraticCurveTo(barX, barY, barX + r, barY);
    ctx.closePath();
    ctx.stroke();

    // === 内层细边框（浅金色，内缩） ===
    const inset = 3 * s;
    const ix = barX + inset;
    const iy = barY + inset;
    const iw = barW - inset * 2;
    const ih = barH - inset * 2;
    const ir = Math.max(0, r - inset);

    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = 'rgba(196,163,90,0.6)';
    ctx.beginPath();
    ctx.moveTo(ix + ir, iy);
    ctx.lineTo(ix + iw - ir, iy);
    ctx.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
    ctx.lineTo(ix + iw, iy + ih - ir);
    ctx.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
    ctx.lineTo(ix + ir, iy + ih);
    ctx.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
    ctx.lineTo(ix, iy + ir);
    ctx.quadraticCurveTo(ix, iy, ix + ir, iy);
    ctx.closePath();
    ctx.stroke();

    // === 四角精致装饰（八角星） ===
    const decorOff = 3.5 * s;
    const decorSize = 4 * s;
    [
      [barX + decorOff, barY + decorOff],
      [barX + barW - decorOff, barY + decorOff],
      [barX + barW - decorOff, barY + barH - decorOff],
      [barX + decorOff, barY + barH - decorOff],
    ].forEach(([cx, cy]) => {
      ctx.save();
      ctx.translate(cx, cy);
      // 外层八角星
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? decorSize : decorSize * 0.35;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = gold;
      ctx.fill();
      // 内层小圆点
      ctx.beginPath();
      ctx.arc(0, 0, decorSize * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#faf6ee';
      ctx.fill();
      ctx.restore();
    });

    // 两条竖线 + 菱形（三列分隔）
    const lineTop = barY + 14 * s;
    const lineBot = barY + barH - 14 * s;
    const line1X = barX + barW / 3;
    const line2X = barX + barW * 2 / 3;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8 * s;
    [line1X, line2X].forEach((lx) => {
      ctx.beginPath();
      ctx.moveTo(lx, lineTop);
      ctx.lineTo(lx, lineBot);
      ctx.stroke();
      // 菱形
      ctx.save();
      ctx.translate(lx, barY + barH / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gold;
      ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
      ctx.restore();
    });

    // 三列文字
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
    ctx.fillText(String(game.round), roundCX, barY + barH * 0.68);

    // 中间：目标分
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText('目标分', targetCX, barY + barH * 0.32);

    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.fillText(String(game.target), targetCX, barY + barH * 0.68);

    // 右侧：当前
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText('当前', scoreCX, barY + barH * 0.32);

    // 当前分数（带变化动画，飞行分数期间锁定）
    if (!this._scoreUpdateLocked && this.lastScore !== game.score) {
      this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
      this.lastScore = game.score;
    }
    let scoreScale = 1;
    if (this.scoreAnim) {
      const saElapsed = Date.now() - this.scoreAnim.startTime;
      const saProgress = Math.min(saElapsed / this.scoreAnim.duration, 1);
      scoreScale = 1 + 0.2 * Math.sin(saProgress * Math.PI);
      if (saProgress >= 1) this.scoreAnim = null;
    }
    ctx.save();
    ctx.translate(scoreCX, barY + barH * 0.68);
    ctx.scale(scoreScale, scoreScale);
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(game.score), 0, 0);
    ctx.restore();

  }

  drawPlaying(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 计算手牌布局（3x3 网格）
    const cols = 3;
    const rows = Math.ceil(game.hand.length / cols);
    const totalW = cols * this.cardW + (cols - 1) * this.gap;
    const startX = (W - totalW) / 2;

    // === 从底部按钮倒推布局 ===
    // 顺序：道具栏 → 分数方块 → 单词预览区 → 卡牌区
    // 改卡牌底部和按钮的间距时，上方区域自动跟随
    const boxSize = 56 * s;
    const top = (this.safeTop || 0) + 20;
    const hudBottom = top + 56 * s;
    const maxRows = 3;
    const cardGridH = maxRows * this.cardH + (maxRows - 1) * this.gap;
    const maskHalfH = 19 * s; // 预览蒙层半高（maskH = 38*s）
    const propBarH = 92 * s;

    const btnTop = H - 90 * s;
    const cardGap = 50 * s;                                    // 卡牌底部到按钮间距（约原来的一半）
    const cardBottom = btnTop - cardGap;                      // 卡牌底部
    const cardAreaY = cardBottom - cardGridH;                 // 卡牌顶部
    const wordAreaY = cardAreaY - 35 * s - maskHalfH;         // 预览区中心（卡牌上方 20px）
    const scoreAreaY = wordAreaY - maskHalfH - 20 * s - boxSize; // 分数方块顶部（预览上方 20px）
    const propY = hudBottom + 15 * s;                         // 道具栏顶部（固定距 HUD 15px）

    this.cardRects = []; // 存储卡牌点击区域

    // ===== 道具卡牌栏（6格：左4女巫 + 右2药水，竖分割线）=====
    const propW = W - 20 * s;
    const propX = 10 * s;
    const padX = 10 * s;
    const dividerW = 1.5 * s;
    const gap = 6 * s;
    const slotTopPad = 28 * s;

    const slotW = (propW - padX * 2 - 5 * gap - dividerW) / 6;
    const slotH = propBarH - slotTopPad - 6 * s;

    const slotY = propY + slotTopPad;
    const leftStartX = propX + padX;
    const dividerX = leftStartX + 4 * slotW + 3.5 * gap + dividerW / 2;
    const rightStartX = dividerX + dividerW / 2 + gap / 2;

    // 背景
    this.roundRect(propX, propY, propW, propBarH, 10 * s, '#faf6ee', '#c4a35a');

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

    // 分区小标签
    ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4a3065';
    ctx.fillText('女巫牌', leftStartX + 2 * slotW + 1.5 * gap, slotY - 6 * s - 4);
    ctx.fillStyle = '#1e4a3a';
    ctx.fillText('魔法药水牌', rightStartX + slotW + 0.5 * gap, slotY - 6 * s - 4);

    const jokers = game.jokers || [];
    const potions = game.potions || [];
    this.potionPropRects = [];

    // 左区4格：女巫牌
    for (let i = 0; i < 4; i++) {
      const sx = leftStartX + i * (slotW + gap);
      const joker = jokers[i];
      if (joker) {
        this._drawPropCard(ctx, joker, sx, slotY, slotW, slotH, s);
      } else {
        this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s);
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
        this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s);
      }

      // 字母置换提示按钮（未选中1张牌时，在对应药水卡牌下方弹出）
      if (game._changeLetterHint && game._changeLetterHint.potionIndex === i && potion && potion.effect === 'change_letter') {
        const hintBtnH = 16 * s;
        const hintBtnW = slotW + 5;
        const hintBtnY = slotY + slotH + 2 * s;
        const hintElapsed = Date.now() - game._changeLetterHint.startTime;
        const hintProgress = Math.min(hintElapsed / 200, 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const hintEase = 1 + c3 * Math.pow(hintProgress - 1, 3) + c1 * Math.pow(hintProgress - 1, 2);
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
        // 合法：深绿色单词 + 中文释义 + 动画阶段
        const elapsed = Date.now() - pc.resolveTime;
        const phase = pc.animPhase || 0;

        // 深绿色单词（逐个字母绘制，支持波浪偏移）
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

        // 中文释义
        if (pc.meaning) {
          const mText = require('./game').formatMeaning(pc.meaning);
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#777';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(mText, W / 2, wordAreaY + 33 * s );
        }

        // === 阶段0: 刚检测完成，触发烟花 ===
        if (phase === 0 && !pc._sparklesSpawned) {
          pc._sparklesSpawned = true;
          this._spawnSparkles(W / 2 - 60 * s, wordAreaY, 12);
          this._spawnSparkles(W / 2 + 60 * s, wordAreaY, 12);
        }

        // === 阶段1: 字母跳跃 + 第一个方块累加 ===
        const letterInterval = 350;
        const letterJumpStart = 1000;
        const cardsInOrder = pc.cardsInOrder || [];
        let accumulatedScore = 0;
        let currentJumpIdx = -1;

        if (phase >= 1) {
          const jumpElapsed = elapsed - letterJumpStart;
          currentJumpIdx = Math.floor(jumpElapsed / letterInterval);
          const isAllJumped = currentJumpIdx >= cardsInOrder.length;
          if (isAllJumped) currentJumpIdx = cardsInOrder.length - 1;
          const jokers = game.jokers || [];

          // === per_card 倍率提示（左方块上方 "xN"）===
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

          // 计算累加分数（考虑女巫牌对单个字母的加成）
          for (let i = 0; i <= currentJumpIdx && i < cardsInOrder.length; i++) {
            let score = cardsInOrder[i].score;
            const triggered = pc.jokerTriggers?.[i] || [];
            triggered.forEach(jIdx => {
              const joker = jokers[jIdx];
              if (joker && joker.value) score *= joker.value;
            });
            accumulatedScore += score;
          }

          // 先清除所有女巫牌跳跃偏移
          jokers.forEach(j => { if (j) j._jumpOffsetY = 0; });

          // === phase 1.5: 波浪跳跃（所有字母跳完后，不论有无 whole_word 都走）===
          const totalJumpTime = cardsInOrder.length * letterInterval;
          const waveStartDelay = 150;
          const waveInterval2 = 100;
          if (jumpElapsed >= totalJumpTime) {
            const waveElapsed = jumpElapsed - totalJumpTime;
            if (!pc._waveOffsetYs) pc._waveOffsetYs = [];
            cardsInOrder.forEach((_, i) => {
              const waveProgress = (waveElapsed - waveStartDelay - i * waveInterval2) / 250;
              if (waveProgress >= 0 && waveProgress <= 1) {
                const waveH = 5 * s * Math.sin(waveProgress * Math.PI);
                pc._waveOffsetYs[i] = -waveH;
              } else {
                pc._waveOffsetYs[i] = 0;
              }
            });
            // whole_word 女巫牌紫色边框在阶段2依次触发，不在此处理
          }

          // 给跳跃中的卡牌设置偏移（所有字母跳完后不再跳跃）
          cardsInOrder.forEach((card, i) => {
            if (isAllJumped) {
              card.jumpOffsetY = 0;
            } else if (i === currentJumpIdx && jumpElapsed >= 0) {
              const jumpProgress = ((jumpElapsed % letterInterval) / 200);
              const jumpH = 12 * s * Math.sin(Math.min(jumpProgress, 1) * Math.PI);
              card.jumpOffsetY = -Math.max(0, jumpH);

              // 同步触发对应的女巫牌（紫色边框 + 同步跳跃）
              const triggered = pc.jokerTriggers?.[i] || [];
              triggered.forEach(jIdx => {
                const joker = jokers[jIdx];
                if (joker) {
                  joker._triggered = true;
                  joker._jumpOffsetY = -Math.max(0, jumpH);
                }
              });
            } else if (i < currentJumpIdx) {
              card.jumpOffsetY = 0;
            }
          });

          // flat_bonus 女巫牌始终显示紫色边框（不跳跃）
          const globalTriggered = pc.globalTriggered || [];
          globalTriggered.forEach(jIdx => {
            const joker = jokers[jIdx];
            if (joker) joker._triggered = true;
          });

          // 所有字母跳完后，清除女巫牌跳跃偏移
          if (isAllJumped) {
            jokers.forEach(j => { if (j) j._jumpOffsetY = 0; });
          }
        }

        // === 阶段2: 基础倍率弹出 + whole_word 依次触发 ===
        showSecondBox = phase >= 2;

        // 依次触发 whole_word 女巫牌：跳跃+紫色边框，完成后边框消失
        if (phase >= 2) {
          const _cards2 = pc.cardsInOrder || [];
          const waveDuration2 = 200 + _cards2.length * 100;
          const phase2Start2 = 1000 + _cards2.length * 350 + waveDuration2;
          const phase2Elapsed2 = (Date.now() - (pc.resolveTime || 0)) - phase2Start2;
          const baseMultDelay2 = 500;
          const stepDuration2 = 700;
          const wjList2 = pc.wholeWordJokers || [];
          if (phase2Elapsed2 >= baseMultDelay2) {
            const afterBase2 = phase2Elapsed2 - baseMultDelay2;
            const displayStep2 = Math.floor(afterBase2 / stepDuration2);
            wjList2.forEach(({ idx }, i) => {
              const joker = game.jokers?.[idx];
              if (!joker) return;

              // 步骤到达该女巫牌且未跳跃过：开始跳跃
              if (displayStep2 > i && !joker._wwJumpStart && !joker._wwJumpDone) {
                joker._wwJumpStart = Date.now();
                joker._triggered = true;
              }

              // 处理跳跃动画
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
          } else {
            // 延迟期间重置全部 whole_word 状态
            wjList2.forEach(({ idx }) => {
              const joker = game.jokers?.[idx];
              if (!joker) return;
              joker._wwJumpStart = null;
              joker._wwJumpDone = false;
              joker._jumpOffsetY = 0;
              joker._triggered = false;
            });
          }
        }

        // === 阶段3: 总分飞行 ===
        if (phase >= 3 && !pc._flyingScoreStarted) {
          pc._flyingScoreStarted = true;
          // 启动飞行总分
          const totalScore = pc.result.score;
          const top = (this.safeTop || 0) + 20;
          const barH = 56 * s;
          this._startFlyingScore(totalScore, maskX + maskW + 10 * s, wordAreaY);
        }

        // 渲染方块数字
        valid = true;
        pendingBaseScore = accumulatedScore;
        pendingLength = cardsInOrder.length;
        showFirstBox = phase >= 1;

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
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
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
        ctx.save();
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(failText, W / 2, wordAreaY + 32 * s);
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
      // per_card 倍率提示（左方块上方紫色小字）
      if (pc._perCardMultText) {
        ctx.save();
        ctx.font = `900 ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pc._perCardMultText, leftBoxX + boxSize / 2, boxY - 4 * s);
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
      let pulseScale = 1;
      if (this.multAnim) {
        const maProgress = Math.min((Date.now() - this.multAnim.startTime) / this.multAnim.duration, 1);
        pulseScale = 1 + 0.28 * Math.sin(maProgress * Math.PI);
        if (maProgress >= 1) this.multAnim = null;
      }

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

      // 绘制 "xN" 标签（右方块上方紫色小字）
      if (labelText) {
        ctx.save();
        ctx.font = `900 ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(labelText, rightBoxX + boxSize / 2, boxY - 4 * s);
        ctx.restore();
      }
    }

    // 绘制卡牌（跳过 null 占位符，其他牌位置完全不动）
    game.hand.forEach((card, i) => {
      if (!card) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (this.cardW + this.gap);
      const y = cardAreaY + row * (this.cardH + this.gap);
      this.drawCard(card, x, y, card.newCard);
      this.cardRects.push({ x, y, w: this.cardW, h: this.cardH, cardId: card.id });

      // 清除 newCard 标记（下一帧不再显示 NEW）
      card.newCard = false;
    });

    // 绘制正在飞出的旧牌（基于原始索引位置 + animOffset）
    for (const card of game.flyingCards) {
      if (card._flyIndex !== undefined) {
        const fCol = card._flyIndex % cols;
        const fRow = Math.floor(card._flyIndex / cols);
        const fx = startX + fCol * (this.cardW + this.gap);
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
    const isInvalid = game.pendingCheck && game.pendingCheck.state === 'invalid';
    if (isInvalid) {
      // 非法状态：深灰色文字
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
    let goldScale = 1;
    if (this.goldAnim) {
      const gaElapsed = Date.now() - this.goldAnim.startTime;
      const gaProgress = Math.min(gaElapsed / this.goldAnim.duration, 1);
      goldScale = 1 + 0.3 * Math.sin(gaProgress * Math.PI);
      if (gaProgress >= 1) this.goldAnim = null;
    }

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

    // 弹出动效（easeOutBack）
    const elapsed = Date.now() - (popup.startTime || Date.now());
    const enterDuration = 350;
    const enterProgress = Math.min(elapsed / enterDuration, 1);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const enterEase = 1 + c3 * Math.pow(enterProgress - 1, 3) + c1 * Math.pow(enterProgress - 1, 2);
    const panelOffsetY = (1 - enterEase) * 30 * s;
    const contentAlpha = enterProgress;

    // 遮罩（带淡入）
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.5 * Math.min(elapsed / 200, 1)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 弹窗尺寸
    const pw = 300 * s;
    const ph = 460 * s;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2 + panelOffsetY;
    const r = 12 * s;
    const gold = '#c4a35a';

    // 弹窗背景
    this.roundRect(px, py, pw, ph, r, '#faf6ee', gold, 2 * s);

    // 标题：字母置换
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('字母置换', W / 2, py + 30 * s);
    ctx.restore();

    // 标题分隔线
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, py + 48 * s);
    ctx.lineTo(px + pw - 30 * s, py + 48 * s);
    ctx.stroke();
    ctx.restore();

    // 选中的字母卡牌（游戏页面卡牌大小的一半，强制不使用 selected.png）
    const selectedCard = game.hand.find(c => c && c.id === popup.cardId);
    if (selectedCard) {
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.translate(W / 2, py + 100 * s);
      ctx.scale(0.5, 0.5);
      const tempCard = { ...selectedCard, selected: false };
      this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2);
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
      ctx.globalAlpha = contentAlpha;
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
      ctx.globalAlpha = contentAlpha;
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
    ctx.globalAlpha = contentAlpha;
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
    ctx.globalAlpha = contentAlpha;
    ctx.beginPath();
    ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 + 1 * s);
    ctx.restore();
    this.changeLetterCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };
  }

  drawPotion(game) {
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
    const titleText = '选择字母';
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
    ctx.fillText('选择一张字母牌，分数翻倍', W / 2, subTitleY);
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

    // === 升级动画：卡牌弹出 ===
    if (game._potionUpgrading) {
      const anim = game._potionUpgrading;
      const now = Date.now();
      const elapsed = now - anim.startTime;

      if (elapsed < 2600) {
        // 时间线：
        // 0-500ms:    卡牌弹出（旧分数）
        // 500-1000ms:  保持（旧分数）
        // 1000-1300ms: 分数变大缩小，更新为新分数
        // 1300-2300ms: 保持（新分数）
        // 2300-2600ms: 卡牌缩小淡出
        const popDuration = 500;
        const holdOldDuration = 500;
        const scoreChangeDuration = 300;
        const holdNewDuration = 1000;
        const fadeOutDuration = 300;

        function easeOutBack(t) {
          const c1 = 1.70158;
          const c3 = c1 + 1;
          return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }

        let cardScale = 1;
        let alpha = 1;
        let showNewScore = false;
        let scoreScale = 1;

        if (elapsed < popDuration) {
          // 阶段1：弹出
          const t = elapsed / popDuration;
          cardScale = easeOutBack(t);
        } else if (elapsed < popDuration + holdOldDuration) {
          // 阶段2：保持旧分数
          cardScale = 1;
        } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
          // 阶段3：分数变化动画（变大缩小）
          const t = (elapsed - popDuration - holdOldDuration) / scoreChangeDuration;
          showNewScore = true;
          scoreScale = 1 + 0.2 * Math.sin(t * Math.PI);
        } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration + holdNewDuration) {
          // 阶段4：保持新分数
          showNewScore = true;
          cardScale = 1;
        } else {
          // 阶段5：缩小淡出
          const t = (elapsed - popDuration - holdOldDuration - scoreChangeDuration - holdNewDuration) / fadeOutDuration;
          cardScale = 1 - t * 0.5;
          alpha = 1 - t;
          showNewScore = true;
        }

        // 背后页面变暗遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 使用 drawCard 绘制
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

        // 分数变化阶段的额外缩放
        if (elapsed >= popDuration + holdOldDuration && elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
          tempCard._scoreScale = scoreScale;
        }

        this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2);

        ctx.restore();
      } else {
        // 动画结束，清理动画状态并返回原页面
        game._potionUpgrading = null;
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
      }
    }
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

  _easeOutBackStrong(t) {
    const c1 = 2.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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

    const appearDuration = 400;
    const holdDuration = 800;
    const fadeDuration = 300;
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
      const ease = this._easeOutBackStrong(progress);
      const scale = ease;
      const offsetY = (1 - ease) * 15 * s;

      ctx.translate(fs.startX, fs.startY + offsetY);
      ctx.scale(scale, scale);
      ctx.fillText(`+${fs.value}`, 0, 0);
    } else if (elapsed < appearDuration + holdDuration) {
      // 阶段2: 停留
      ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
    } else if (elapsed < totalDuration) {
      // 阶段3: 淡出
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

  // ===== 调试菜单 =====
  _drawDebugMenu(ctx, game, x, y, s) {
    const items = [
      { label: '重置出牌次数', action: 'debug_resetHands' },
      { label: '当前分+100', action: 'debug_addScore' },
      { label: '直接通关', action: 'debug_winRound' },
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
    const closeElapsed = isClosing ? Date.now() - (game._closeStartTime || Date.now()) : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / 300, 1) : 0;
    if (isClosing && closeProgress >= 1) return;

    if (!isClosing && this.lastGameOverReason !== game.gameOverReason) {
      this.animStartTime = Date.now();
      this.lastGameOverReason = game.gameOverReason;
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    const closeSlideY = isClosing ? -closeProgress * 40 * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;
    ctx.save();
    ctx.globalAlpha = closeAlpha;

    // 半透明遮罩
    const overlayAlpha = isClosing ? 0.65 * (1 - closeProgress) : Math.min(elapsed / 200, 0.65);
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    ctx.fillRect(0, 0, W, H);

    // 弹窗尺寸
    const pw = 300 * s;
    const ph = 290 * s;
    const px = (W - pw) / 2;
    const basePy = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    // 弹窗入场：easeOutBack 从下方 25px 滑入
    const enterProgress = Math.min(elapsed / 350, 1);
    const enterEase = easeOutBack(enterProgress);
    const py = basePy + (1 - enterEase) * 25 * s + closeSlideY;

    // 背景 + 边框
    this.parent.roundRect(px, py, pw, ph, r, '#faf6ee', gold);

    // 内容渐入工具函数
    function fadeIn(el, delay, offsetY = 8 * s) {
      const t = Math.max(0, Math.min((el - delay) / 250, 1));
      const ease = t * (2 - t); // easeOutQuad
      return { alpha: ease, yShift: (1 - ease) * offsetY };
    }

    // 标题
    const titleAnim = fadeIn(elapsed, 80);
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
    const line1Anim = fadeIn(elapsed, 140, 6 * s);
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
      const itemAnim = fadeIn(elapsed, 180 + i * 60);
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
    const hintAnim = fadeIn(elapsed, 400, 6 * s);
    const hintY = lineY + items.length * lineH + 12 * s + hintAnim.yShift;
    ctx.save();
    ctx.globalAlpha = hintAnim.alpha;
    ctx.strokeStyle = gold;
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
    const btnAnim = fadeIn(elapsed, 480, 10 * s);
    const btnW = 160 * s;
    const btnH = 46 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 28 * s + btnAnim.yShift;
    ctx.save();
    ctx.globalAlpha = btnAnim.alpha;

    // 按钮按下效果
    const btnPressed = game._restartBtnPressed;
    const btnScale = btnPressed ? 0.95 : 1;
    const btnDrawX = btnX + btnW * (1 - btnScale) / 2;
    const btnDrawY = btnY + btnH * (1 - btnScale) / 2;
    const btnDrawW = btnW * btnScale;
    const btnDrawH = btnH * btnScale;

    this.parent.roundRect(btnDrawX, btnDrawY, btnDrawW, btnDrawH, 8 * s, '#c4a35a');
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('重新开始', W / 2, btnDrawY + btnDrawH / 2);
    ctx.restore();

    // 闭合 closing 动画的 globalAlpha
    ctx.restore();

    // 存储点击区域（动画完成后固定位置）
    const finalBtnY = py + ph - btnH - 28 * s;
    this.restartBtnRect = { x: btnX, y: finalBtnY, w: btnW, h: btnH };
  }
}

module.exports = { Renderer };
