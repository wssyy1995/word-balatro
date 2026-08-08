const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { LETTER_SCORE, FACE_CARDS } = require('../data');
const { Easing } = require('../animation');

module.exports = function extendCardbook(Renderer) {
    Renderer.prototype._drawCardBookIcon = function(game, titleX, titleY, titleW) {
      if (!game.cardBookUnlocked) return;
      const ctx = this.ctx;
      const s = this.scale;
      const baseH = 34 * s + 4;
      let iconW = baseH;
      // 保持原始宽高比（card_book_icon.png 为 150x198）
      if (this.cardBookIcon && this.cardBookIcon.width && this.cardBookIcon.height) {
        iconW = baseH * (this.cardBookIcon.width / this.cardBookIcon.height);
      }
      // 宽度再 +3px*s（比等比例宽 3px），高度保持固定
      iconW += 3 * s;
      const iconH = baseH;
      const iconX = titleX + titleW / 2 + 7 * s;
      const pressOffset = game._cardBookIconPressed ? 1 : 0;
      const iconY = titleY - iconH / 2 + pressOffset - 3 * s;
      // 商店页面常驻上下轻微浮动
      let floatOffsetY = 0;
      const isInShop = game.state === 'shop';
      if (isInShop) {
        floatOffsetY = Math.sin(Date.now() / 500) * 1 * s;
      }

      ctx.save();
      const drawX = iconX;
      const drawY = iconY + floatOffsetY;

      // 常驻绘制金色星星光晕
      if (isInShop) {
        this._drawGentleStars(drawX + iconW / 2, drawY + iconH / 2, 28 * s, s, 1, 1.2, 'gold');
      }

      // 绘制图标（上下浮动）
      if (this.cardBookIcon && this.cardBookIconLoaded) {
        ctx.drawImage(this.cardBookIcon, drawX, drawY, iconW, iconH);
      }
      ctx.restore();

      // NEW! 角标（有新收集时显示）
      if (game._cardBookNewBadge && this.newBadgeIcon && this.newBadgeIconLoaded) {
        const badgeW = 28 * s;
        const badgeH = this.newBadgeIcon.height
          ? badgeW * (this.newBadgeIcon.height / this.newBadgeIcon.width)
          : badgeW;
        const badgeX = iconX + iconW - badgeW * 0.6 + 2 * s;
        const badgeY = iconY - badgeH * 0.4 - 2 * s + floatOffsetY;
        ctx.save();
        // 微弱呼吸效果：±4%，周期约 2 秒
        const pulse = 1 + 0.04 * Math.sin(Date.now() / 318);
        const drawW = badgeW * pulse;
        const drawH = badgeH * pulse;
        const drawX = badgeX - (drawW - badgeW) / 2;
        const drawY = badgeY - (drawH - badgeH) / 2;
        // 白色半透明背景蒙层
        const maskW = drawW * 0.85;
        const maskH = drawH * 0.85;
        const maskX = drawX + (drawW - maskW) / 2;
        const maskY = drawY + (drawH - maskH) / 2;
        this.roundRect(maskX, maskY, maskW, maskH, 3 * s, 'rgba(255,255,255,0.8)');
        ctx.drawImage(this.newBadgeIcon, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      this.cardBookIconRect = { x: iconX, y: iconY, w: iconW, h: iconH };
    }

    Renderer.prototype._drawCardBookDetail = function(ctx, game, W, H, s) {
      const level = game._cardBookDetailLevel;
      if (!level) return;
  
      const cardConfig = WITCH_CARDS.find(c => c.card_id === `witch_card_${level}`);
      if (!cardConfig) return;
  
      const panelRect = this.cardBookPanelRect;
      if (!panelRect) return;
  
      const elapsed = game._closingCardBookDetail ? 99999 : Date.now() - (game._cardBookDetailStartTime || Date.now());
      const closeElapsed = game._closingCardBookDetail ? Date.now() - (game._closeCardBookDetailStartTime || Date.now()) : 0;
      const closeProgress = game._closingCardBookDetail ? Math.min(closeElapsed / 100, 1) : 0;
  
      // 关闭完成后清理状态
      if (game._closingCardBookDetail && closeProgress >= 1) {
        game._cardBookDetailLevel = null;
        game._closingCardBookDetail = false;
        game._cardBookDetailStartTime = null;
        return;
      }
  
      const enterProgress = Math.min(elapsed / 200, 1);
      const enterEase = Easing.easeOutBack(enterProgress);
      const alpha = game._closingCardBookDetail ? (1 - closeProgress) : enterEase;
      if (alpha <= 0) return;
  
      // ===== 大图模式：覆盖图鉴内容区，显示词牌大图 + 底部关闭按钮 =====
      ctx.save();
      ctx.globalAlpha = alpha;

      // 覆盖区域从标题/Tab 下方开始（保留顶部标题与右上角 X 可用）
      const coverX = panelRect.x + 6 * s;
      const coverY = panelRect.y + 48 * s;
      const coverW = panelRect.w - 12 * s;
      const coverH = panelRect.y + panelRect.h - 6 * s - coverY;
      this.roundRect(coverX, coverY, coverW, coverH, 12 * s, '#faf6ee', '#c4a35a', 1.5 * s);
      this.cardBookDetailPanelRect = { x: coverX, y: coverY, w: coverW, h: coverH };

      // 大图（保持原图比例，高度优先；入场随 easeOutBack 上移）
      const bigBtnH = 40 * s;
      const imgMaxH = coverH - 30 * s - bigBtnH - 20 * s;
      const imgMaxW = coverW - 48 * s;
      const cardName = `witch_card_${level}`;
      const cardData = this.witchCardImages[cardName];
      const enterShift = (1 - enterEase) * 15 * s;
      if (cardData && cardData.loaded && cardData.img) {
        const imgAspect = cardData.width / cardData.height;
        let dw = imgMaxH * imgAspect;
        let dh = imgMaxH;
        if (dw > imgMaxW) {
          dw = imgMaxW;
          dh = dw / imgAspect;
        }
        const dx = coverX + (coverW - dw) / 2;
        const dy = coverY + 16 * s + (imgMaxH - dh) / 2 + enterShift;
        ctx.save();
        const imgR = 8 * s;
        ctx.beginPath();
        ctx.moveTo(dx + imgR, dy);
        ctx.lineTo(dx + dw - imgR, dy);
        ctx.quadraticCurveTo(dx + dw, dy, dx + dw, dy + imgR);
        ctx.lineTo(dx + dw, dy + dh - imgR);
        ctx.quadraticCurveTo(dx + dw, dy + dh, dx + dw - imgR, dy + dh);
        ctx.lineTo(dx + imgR, dy + dh);
        ctx.quadraticCurveTo(dx, dy + dh, dx, dy + dh - imgR);
        ctx.lineTo(dx, dy + imgR);
        ctx.quadraticCurveTo(dx, dy, dx + imgR, dy);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(cardData.img, dx, dy, dw, dh);
        ctx.restore();
      }
  
      // 底部关闭按钮（复用领取按钮金色样式），点击回到图鉴
      const btnW = 120 * s;
      const btnH = 40 * s;
      const btnX = coverX + (coverW - btnW) / 2;
      const btnY = coverY + coverH - btnH - 16 * s;
      this._drawScaledButton(ctx, '关闭', btnX, btnY, btnW, btnH, s, false, { color: '#c4a35a', radius: 8 });
      this.cardBookBigCloseRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      this.cardBookEquipBtnRect = null;
  
      ctx.restore();
    }

    Renderer.prototype._wrapText = function(ctx, text, maxWidth, fontSize) {
      const chars = text.split('');
      const lines = [];
      let line = '';
      for (let i = 0; i < chars.length; i++) {
        const testLine = line + chars[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
          lines.push(line);
          line = chars[i];
        } else {
          line = testLine;
        }
      }
      lines.push(line);
      return lines;
    }

    // 装备 witch_card 后的字母牌升级动画
    // 0~500ms: 显示 card_template
    // 500~800ms: card_template 横向缩成线后切换 card_template_upgrade 横向展开（翻牌效果）
    // 800~1800ms: 显示 card_template_upgrade
    Renderer.prototype._drawCardBookEquipAnim = function(ctx, game, W, H, s) {
      const anim = game._cardBookEquipAnim;
      if (!anim) return;

      const elapsed = Date.now() - (anim.startTime || Date.now());
      const normalDuration = 500;
      const crossFadeDuration = 300;
      const upgradeDuration = 1000;
      const popInDuration = 300;
      const totalDuration = normalDuration + crossFadeDuration + upgradeDuration;

      if (elapsed >= totalDuration) {
        game._cardBookEquipAnim = null;
        return;
      }

      const letter = anim.letter;
      if (!letter) return;

      // 构造临时字母牌对象
      const baseScore = LETTER_SCORE[letter] || 0;
      const animCard = {
        letter,
        baseScore,
        score: baseScore,
        isFace: FACE_CARDS.has(letter),
        selected: false,
        newCard: false,
        upgraded: false,
        upgradeMult: 1,
        upgradeAdd: 0,
        animOffset: null,
        selectOffset: 0,
        jumpOffsetY: 0,
      };

      // 卡牌居中，尺寸比手牌略大
      const targetCardW = Math.min(this.cardW * 1.4, W * 0.5);
      const targetCardH = targetCardW * (this.cardH / this.cardW);
      const cardX = (W - targetCardW) / 2;
      const cardY = (H - targetCardH) / 2;
      const baseScale = targetCardW / this.cardW;

      // 弹出缩放：前 300ms 从 0.7 → 1
      let popScale = 1;
      if (elapsed < popInDuration) {
        popScale = 0.7 + 0.3 * Easing.easeOutBack(elapsed / popInDuration);
      }

      // 翻牌转换参数
      const halfCross = crossFadeDuration / 2;
      const normalShrinkStart = normalDuration;
      const normalShrinkEnd = normalDuration + halfCross;
      const upgradeGrowStart = normalShrinkEnd;
      const upgradeGrowEnd = upgradeGrowStart + halfCross;

      ctx.save();
      ctx.translate(cardX + targetCardW / 2, cardY + targetCardH / 2);
      ctx.scale(popScale * baseScale, popScale * baseScale);

      // 翻牌开始时播放 word_score 音效（只播一次）
      if (elapsed >= normalDuration && !anim._flipSoundPlayed) {
        anim._flipSoundPlayed = true;
        if (game.audioManager) game.audioManager.play('word_score');
      }

      // 卡牌背后白色光晕（跟随翻牌缩放）
      ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowBlur = 28 * s;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 保存当前已装备字母集合，临时修改以强制渲染指定模板
      const originalEquipped = this._equippedLetters;

      if (elapsed < upgradeGrowStart) {
        // 普通模板阶段（前 500ms 全宽，后 150ms 横向缩成线）
        let normalScaleX = 1;
        if (elapsed > normalShrinkStart) {
          normalScaleX = Math.max(0, 1 - (elapsed - normalShrinkStart) / halfCross);
        }
        if (normalScaleX > 0) {
          const withoutLetter = new Set(originalEquipped);
          withoutLetter.delete(letter);
          this._equippedLetters = withoutLetter;
          ctx.save();
          ctx.scale(normalScaleX, 1);
          this.drawCard(animCard, -this.cardW / 2, -this.cardH / 2);
          ctx.restore();
        }
      } else {
        // 升级模板阶段（前 150ms 横向从线展开，后 1000ms 全宽）
        let upgradeScaleX = 1;
        if (elapsed < upgradeGrowEnd) {
          upgradeScaleX = Math.max(0, (elapsed - upgradeGrowStart) / halfCross);
        }
        if (upgradeScaleX > 0) {
          const withLetter = new Set(originalEquipped);
          withLetter.add(letter);
          this._equippedLetters = withLetter;
          ctx.save();
          ctx.scale(upgradeScaleX, 1);
          this.drawCard(animCard, -this.cardW / 2, -this.cardH / 2);
          ctx.restore();
        }
      }

      this._equippedLetters = originalEquipped;
      ctx.restore();
    }

};
