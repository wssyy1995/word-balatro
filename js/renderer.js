// ===== Canvas 渲染器 =====
const { formatMeaning, isValidWordOnline } = require('./game');
const { WORD_DATA, onlineWordCache, wordCheckState } = require('./data');
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
    const btnNames = ['out_card', 'throw_card', 'reset_select'];
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
    
    // 加载预览区装饰图
    this.previewMark = null;
    this.previewMarkLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/preview_mark.png';
      img.onload = () => { this.previewMarkLoaded = true; };
      img.onerror = () => { this.previewMarkLoaded = false; };
      this.previewMark = img;
    } catch (e) {
      this.previewMarkLoaded = false;
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

    this.witchHatImg = null;
    this.witchHatLoaded = false;
    try {
      const img = wx.createImage();
      img.src = 'images/witch_hat.png';
      img.onload = () => { this.witchHatLoaded = true; };
      img.onerror = () => { this.witchHatLoaded = false; };
      this.witchHatImg = img;
    } catch (e) {
      this.witchHatLoaded = false;
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

    // 如果有触发状态，先画紫色边框（在 clip 之外）
    if (prop._triggered) {
      ctx.save();
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
    this.roundRect(x + 1, maskY, w - 2, maskH, maskR, 'rgba(0,0,0,0.55)');

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

    // === 3. 分数 ===
    let scoreText = card.upgraded ? `${card.baseScore}分` : `${card.score}分`;
    ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scoreText, 0, -hh + h * 0.74);

    // === 5. 升级标记 ===
    if (card.upgraded) {
      ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#e74c3c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`x${card.upgradeMult}`, hw - 10 * s, -hh + 14 * s);
    }

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
    } else if (game.state === 'settlement') {
      // 金币结算弹窗（保留 HUD 背景）
      this.drawHUD(game);
      this.drawCoinCapsule(game);
      this.settlementRenderer.draw(ctx, game, W, H, s);
    } else if (game.state === 'shop') {
      // 商店页面（显示标题+金币胶囊，不显示目标分 bar）
      this.drawTopHeader();
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

    // 游戏标题（仅在非商店状态显示）
    if (game.state !== 'shop') {
      ctx.save();
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Words Witch Game', W / 2, top - 12 * s);
      ctx.restore();
    }

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
    for (let i = 0; i < 2; i++) {
      const sx = rightStartX + i * (slotW + gap);
      const potion = potions[i];
      if (potion) {
        this._drawPropCard(ctx, potion, sx, slotY, slotW, slotH, s);
        this.potionPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, potionIndex: i });
      } else {
        this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s);
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
    if (game.pendingCheck) {
      const pc = game.pendingCheck;
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

        // 深绿色单词
        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#2d7d32';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
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

          // 全局触发的女巫牌保持紫色边框激活（不跳跃）
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

        // === 阶段2: 显示长度 ===
        const lengthShowTime = letterJumpStart + cardsInOrder.length * letterInterval;
        const showLength = phase >= 2 || (phase === 1 && elapsed >= lengthShowTime);

        // === 阶段3: 总分飞行 ===
        const totalShowTime = lengthShowTime + 200;
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
        showSecondBox = showLength;

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
        ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
        ctx.fillStyle = '#f5f0e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.scoreRoll.from), cx, cy - ease * offset);
        ctx.restore();

        // 新数字从下方进入
        ctx.save();
        ctx.globalAlpha = ease;
        ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
        ctx.fillStyle = '#f5f0e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.scoreRoll.to), cx, cy + (1 - ease) * offset);
        ctx.restore();

        if (rollProgress >= 1) {
          this.scoreRoll = null;
        }
      } else {
        this.text(String(targetScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 18, '#f5f0e8');
      }
    } else if (!game.pendingCheck) {
      // 没有 pendingCheck 时重置
      this.lastBoxScore = 0;
      this.scoreRoll = null;
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
      this.text(String(pendingLength), rightBoxX + boxSize / 2, boxY + boxSize / 2, 18, '#f5f0e8');
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

  drawPotion(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 标题
    this.text('选择一张牌进行强化', W / 2, 70 * s, 18, '#fff');

    // 手牌布局（缩小版）
    const cols = 3;
    const rows = Math.ceil(game.hand.length / cols);
    const cardW = 60 * s;
    const cardH = 80 * s;
    const gap = 8 * s;
    const totalW = cols * cardW + (cols - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = 100 * s;

    this.potionCardRects = [];
    game.hand.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      this.roundRect(x, y, cardW, cardH, 6 * s, '#1e3a5f', '#2c5a8e');
      this.text(card.letter, x + cardW / 2, y + cardH * 0.35, 22, '#fff');
      this.text(`${card.baseScore}分`, x + cardW / 2, y + cardH * 0.7, 10, '#bdc3c7');

      this.potionCardRects.push({ x, y, w: cardW, h: cardH, cardId: card.id });
    });

    // 取消按钮
    const btnY = H - 60 * s;
    this.button('取消', W / 2 - 50 * s, btnY, 100 * s, 36 * s, '#7f8c8d');
    this.cancelBtnRect = { x: W / 2 - 50 * s, y: btnY, w: 100 * s, h: 36 * s, action: 'cancelPotion' };
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
