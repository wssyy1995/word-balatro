// ===== Canvas 渲染器 =====
const { formatMeaning, isValidWordOnline } = require('./game');
const { WORD_DATA, SHOP_POOL, onlineWordCache, wordCheckState } = require('./data');

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
    this.cardH = Math.min(Math.floor(112 * this.scale), maxCardH);
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
  }

  // 绘制圆角矩形
  roundRect(x, y, w, h, r, fill, stroke) {
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
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
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

    // 绘制 HUD
    this.drawHUD(game);

    // 根据状态绘制不同界面
    if (game.state === 'playing') {
      this.drawPlaying(game);
    } else if (game.state === 'shop') {
      this.drawShop(game);
    } else if (game.state === 'potion') {
      this.drawPotion(game);
    } else if (game.state === 'gameover') {
      this.drawGameOver(game);
    }

    // 绘制动画
    this.updateAnimations();
  }

  drawHUD(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    const top = (this.safeTop || 0) + 20;
    const h = 56 * s;

    // 左上角图标（压在 topbar 上方）
    const iconSize = 40 * s;
    const iconX = 15 * s;
    const iconY = top - iconSize - 5;
    if (this.topIcon && this.topIconLoaded) {
      ctx.drawImage(this.topIcon, iconX, iconY, iconSize, iconSize);
    }

    // 游戏标题
    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Words Witch Game', W / 2, top - 12 * s);
    ctx.restore();

    // === 目标分 / 当前 卡片式 top bar ===
    const barW = Math.min(320 * s, W - 40 * s);
    const barH = 56 * s;
    const barX = (W - barW) / 2;
    const barY = top;
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

    // 中间竖线 + 菱形
    const midX = W / 2;
    const lineTop = barY + 14 * s;
    const lineBot = barY + barH - 14 * s;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(midX, lineTop);
    ctx.lineTo(midX, lineBot);
    ctx.stroke();
    // 菱形
    ctx.save();
    ctx.translate(midX, barY + barH / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold;
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();

    // 左侧：目标分
    const leftCX = barX + barW * 0.25;
    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('目标分', leftCX, barY + barH * 0.32);

    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.fillText(String(game.target), leftCX, barY + barH * 0.68);

    // 右侧：当前
    const rightCX = barX + barW * 0.75;
    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = darkBlue;
    ctx.fillText('当前', rightCX, barY + barH * 0.32);

    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.fillText(String(game.score), rightCX, barY + barH * 0.68);

    // 女巫牌/水晶球效果指示器
    if (game.jokers.length > 0 || game.crystalEffects.length > 0) {
      let badges = [];
      game.jokers.forEach(j => badges.push({ text: `🔮 ${j.name}`, color: '#6b2d8e' }));
      game.crystalEffects.forEach(c => badges.push({ text: `🔮 ${c.name}`, color: '#2d5a8e' }));

      let bx = 10 * s;
      let by = top + h + 6 * s;
      badges.forEach(b => {
        const bw = ctx.measureText(b.text).width + 16 * s;
        const bh = 20 * s;
        this.roundRect(bx, by, bw, bh, 4 * s, b.color);
        ctx.font = `${Math.floor(9 * s)}px sans-serif`;
        ctx.fillStyle = '#e0e0e0';
        ctx.textAlign = 'left';
        ctx.fillText(b.text, bx + 6 * s, by + bh / 2 + 3 * s);
        bx += bw + 4 * s;
        if (bx > W - 60 * s) { bx = 10 * s; by += bh + 4 * s; }
      });
    }
  }

  drawPlaying(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // === 三个独立可调区域 ===
    const wordAreaY  = 120 * s + 30;   // ① 单词拼写+中文释义 整体中心基准
    const scoreAreaY = 175 * s + 30;   // ② 分数计算区（方块）顶部基准
    const cardAreaY  = 230 * s + 30 + 20 + 20 * s;   // ③ 卡牌区域顶部基准

    // 计算手牌布局（3x3 网格）
    const cols = 3;
    const rows = Math.ceil(game.hand.length / cols);
    const totalW = cols * this.cardW + (cols - 1) * this.gap;
    const startX = (W - totalW) / 2;

    this.cardRects = []; // 存储卡牌点击区域

    // 单词预览区白色蒙层（常驻，固定6个字母宽度）
    const maskW = 180 * s;
    const maskH = 38 * s;
    const maskX = W / 2 - maskW / 2;
    const maskY = wordAreaY - maskH / 2;
    this.roundRect(maskX, maskY, maskW, maskH, 8 * s, 'rgba(255,255,255,0.35)');

    // 蒙层左右装饰图（保持原图宽高比，不压缩变形）
    if (this.previewMark && this.previewMarkLoaded) {
      const imgW = this.previewMark.width || 200;
      const imgH = this.previewMark.height || 104;
      const markH = maskH * 0.6;
      const markW = markH * (imgW / imgH);
      const gap = 4 * s;
      // 左边：正常
      ctx.drawImage(this.previewMark, maskX - markW - gap, maskY + 5 * s, markW, markH);
      // 右边：水平镜像
      ctx.save();
      ctx.translate(maskX + maskW + gap + markW, maskY + 5 * s);
      ctx.scale(-1, 1);
      ctx.drawImage(this.previewMark, 0, 0, markW, markH);
      ctx.restore();
    }

    // 预览区域（在卡牌上方）
    const selected = game.getSelectedCards();
    let valid = false;
    let invalid = false;
    let baseScore = 0;

    if (selected.length >= 1) {
      const word = selected.map(c => c.letter.toLowerCase()).join('');
      const inLocal = WORD_DATA.has(word) || onlineWordCache.has(word);

      // 只有 >= 3 张才发起在线检测
      if (selected.length >= 3) {
        if (!inLocal && !wordCheckState.has(word)) {
          wordCheckState.set(word, 'checking');
          isValidWordOnline(word);
        }
      }

      const state = wordCheckState.get(word);
      valid = inLocal || state === 'valid';
      invalid = state === 'invalid';
      baseScore = selected.reduce((sum, c) => sum + c.score, 0);

      // 颜色：<3 张或检测中 = 橙色，合法 = 绿，非法 = 红
      let color = '#f1c40f'; // 橙色（<3 张或检测中）
      if (valid) color = '#2ecc71';
      else if (invalid) color = '#e74c3c';

      ctx.save();
      ctx.font = `bold ${Math.floor(26 * s)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word, W / 2, wordAreaY);
      ctx.restore();

      // 中文释义 —— 只在确认合法时显示
      if (valid) {
        const meaningObj = require('./game').getWordMeaning(word);
        if (meaningObj) {
          const meaningText = require('./game').formatMeaning(meaningObj);
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#777';
          ctx.textAlign = 'center';
          ctx.fillText(meaningText, W / 2, wordAreaY + 20 * s + 2 + 3 * s + 2 * s);
        }
      }
    }

    // 分数预览（两个方块）—— 始终显示
    const boxSize = 48 * s;
    const centerX = W / 2;
    const boxY = scoreAreaY;
    const scoreColor = valid ? '#3498db' : (invalid ? '#e74c3c' : '#888');
    const multColor = valid ? '#2ecc71' : (invalid ? '#e74c3c' : '#888');

    // 左：字母分（背景图）
    const leftBoxX = centerX - boxSize - 10 * s - 5;
    const letterScoreImg = this.scoreBoxImages['letter_score'];
    if (letterScoreImg && letterScoreImg.loaded && letterScoreImg.img) {
      ctx.drawImage(letterScoreImg.img, leftBoxX, boxY, boxSize, boxSize);
    } else {
      this.roundRect(leftBoxX, boxY, boxSize, boxSize, 4 * s, null, scoreColor);
    }
    if (valid) {
      this.text(String(baseScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 18, '#f5f0e8');
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
    const rightBoxX = centerX + 10 * s + 5;
    const lengthImg = this.scoreBoxImages['length'];
    if (lengthImg && lengthImg.loaded && lengthImg.img) {
      ctx.drawImage(lengthImg.img, rightBoxX, boxY, boxSize, boxSize);
    } else {
      this.roundRect(rightBoxX, boxY, boxSize, boxSize, 4 * s, null, multColor);
    }
    if (valid) {
      this.text(String(selected.length), rightBoxX + boxSize / 2, boxY + boxSize / 2, 18, '#f5f0e8');
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
    // 出牌文字 + 剩余次数（金色渐变字）
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const btnTextY = playY + btnH / 2 - 1 * s;
    const playText = `出牌 (${game.handsLeft})`;
    const playTx = playX + btnW / 2;
    // 深色外描边
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#2a1f0d';
    ctx.strokeText(playText, playTx, btnTextY);
    // 金色渐变填充（上亮下暗，自然光照）
    const grad = ctx.createLinearGradient(playTx, btnTextY - 7 * s, playTx, btnTextY + 7 * s);
    grad.addColorStop(0, '#dfc06e');
    grad.addColorStop(0.5, '#c9a84c');
    grad.addColorStop(1, '#b5973e');
    ctx.fillStyle = grad;
    ctx.fillText(playText, playTx, btnTextY);
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

    // 提示按钮（右上角 emoji）
    const hintBtnSize = 44 * s;
    const hintX = W - hintBtnSize - 10 * s;
    const hintY = 20 * s;
    this.roundRect(hintX, hintY, hintBtnSize, hintBtnSize, 10 * s, '#f1c40f');
    this.text('💡', hintX + hintBtnSize / 2, hintY + hintBtnSize / 2, 24, '#333');
    this.hintBtnRect = { x: hintX, y: hintY, w: hintBtnSize, h: hintBtnSize, action: 'hint' };

    // 提示 Toast（白色，显示在右上角提示按钮下方）
    if (game.hintToast) {
      const toastW = 220 * s;
      const lineH = 18 * s;
      const lines = game.hintToast.text.split('\n');
      const toastH = lines.length * lineH + 16 * s;
      const toastX = W - toastW - 10 * s;
      const toastY = hintY + hintBtnSize + 8 * s;

      ctx.save();
      // 白色圆角背景
      this.roundRect(toastX, toastY, toastW, toastH, 8 * s, '#fff', null);
      // 文字
      ctx.fillStyle = '#333';
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.textAlign = 'left';
      lines.forEach((line, i) => {
        ctx.fillText(line, toastX + 12 * s, toastY + 14 * s + i * lineH);
      });
      ctx.restore();
    }
  }

  drawShop(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 标题
    this.text(`第 ${game.round} 关 - 商店`, W / 2, 70 * s, 20, '#fff');
    this.text(`金币: $${game.gold}`, W / 2, 95 * s, 14, '#f1c40f');

    // 生成商店商品（如果还没生成）
    if (!game.shopItems) {
      game.shopItems = [];
      ['witch', 'crystal', 'potion'].forEach(type => {
        const pool = SHOP_POOL[type];
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        game.shopItems.push(shuffled[0], shuffled[1]);
      });
    }

    // 绘制商品（3行 x 2列）
    const cols = 2;
    const itemW = (W - 48 * s) / cols;
    const itemH = 70 * s;
    const startX = 16 * s;
    const startY = 120 * s;

    this.shopRects = [];
    game.shopItems.forEach((item, i) => {
      if (!item) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (itemW + 16 * s);
      const y = startY + row * (itemH + 12 * s);

      // 背景
      let bg = '#1a2a4a';
      if (item.type === 'witch') bg = '#6b2d8e';
      if (item.type === 'crystal') bg = '#2d5a8e';
      if (item.type === 'potion') bg = '#2d6b4e';

      this.roundRect(x, y, itemW, itemH, 8 * s, bg);

      // 名称
      this.text(item.name, x + itemW / 2, y + 18 * s, 12, '#fff');
      // 描述
      ctx.font = `${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText(item.desc, x + itemW / 2, y + 36 * s);
      // 价格
      this.text(`$${item.cost}`, x + itemW / 2, y + 56 * s, 14, '#f1c40f');

      this.shopRects.push({ x, y, w: itemW, h: itemH, index: i });
    });

    // 下一关按钮
    const btnY = H - 60 * s;
    this.button('下一关', W / 2 - 60 * s, btnY, 120 * s, 40 * s, '#2ecc71');
    this.nextRoundBtnRect = { x: W / 2 - 60 * s, y: btnY, w: 120 * s, h: 40 * s, action: 'nextRound' };
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

  drawGameOver(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // 弹窗尺寸
    const panelW = 300 * s;
    const panelH = 260 * s;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // 弹窗背景（深色带金色边框）
    this.roundRect(panelX, panelY, panelW, panelH, 16 * s, '#1a2a4a', '#d4a843');

    // 标题：结束报告
    ctx.save();
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#f1c40f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('结束报告', W / 2, panelY + 40 * s);
    ctx.restore();

    // 失败原因
    const reason = game.gameOverReason === 'out_of_hands'
      ? '出牌次数耗尽，未达目标分数'
      : '主动选择投降';
    ctx.save();
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#e74c3c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reason, W / 2, panelY + 75 * s);
    ctx.restore();

    // 分隔线
    ctx.strokeStyle = 'rgba(212,168,67,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 30 * s, panelY + 95 * s);
    ctx.lineTo(panelX + panelW - 30 * s, panelY + 95 * s);
    ctx.stroke();

    // 结束关卡
    this.text('结束关卡', panelX + 40 * s, panelY + 125 * s, 13, '#888', 'left');
    this.text(`第 ${game.round} 关`, panelX + panelW - 40 * s, panelY + 125 * s, 15, '#fff', 'right');

    // 总分（大字突出）
    this.text('总分', panelX + 40 * s, panelY + 165 * s, 13, '#888', 'left');
    ctx.save();
    ctx.font = `bold ${Math.floor(28 * s)}px Georgia, serif`;
    ctx.fillStyle = '#2ecc71';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(game.totalScore), panelX + panelW - 40 * s, panelY + 165 * s);
    ctx.restore();

    // 重新开始按钮
    const btnW = 160 * s;
    const btnH = 48 * s;
    const btnX = (W - btnW) / 2;
    const btnY = panelY + panelH - btnH - 24 * s;
    this.button('重新开始', btnX, btnY, btnW, btnH, '#e74c3c', '#fff');
    this.restartBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH, action: 'restart' };

    // 点击遮罩区域也可以关闭（全屏关闭区域，但按钮优先）
    this.gameOverCloseRect = { x: panelX, y: panelY, w: panelW, h: panelH, action: 'gameOverClose' };
  }

  updateAnimations() {
    // 动画更新（后续实现）
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

module.exports = { Renderer };
