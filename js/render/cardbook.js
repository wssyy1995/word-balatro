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
  
      const detailW = panelRect.w;
      const detailH = 132 * s;
      const detailX = panelRect.x;
      const detailY = panelRect.y + panelRect.h + 6 * s + (1 - enterEase) * 15 * s;
  
      this.cardBookDetailPanelRect = { x: detailX, y: detailY, w: detailW, h: detailH };
  
      ctx.save();
      ctx.globalAlpha = alpha;
  
      // 绘制详情条背景
      this.roundRect(detailX, detailY, detailW, detailH, 12 * s, '#faf6ee', '#c4a35a', 1.5 * s);
  
      const pad = 14 * s;
      const innerX = detailX + pad;
      const innerY = detailY + pad;
      const innerW = detailW - pad * 2;
      const innerH = detailH - pad * 2;
  
      // 左侧图片区域
      const imgMaxH = innerH;
      const cardName = `witch_card_${level}`;
      const cardData = this.cloudStorage ? this.cloudStorage.getWitchCardImage(cardName) : null;
      let imgDrawW = 0;
      let imgDrawH = 0;
      let imgDrawX = innerX;
      let imgDrawY = innerY;
      if (cardData && cardData.loaded && cardData.img) {
        const imgAspect = cardData.width / cardData.height;
        imgDrawH = imgMaxH;
        imgDrawW = imgDrawH * imgAspect;
        if (imgDrawW > innerW * 0.32) {
          imgDrawW = innerW * 0.32;
          imgDrawH = imgDrawW / imgAspect;
        }
        imgDrawY = innerY + (innerH - imgDrawH) / 2;
        const imgR = 5 * s;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(imgDrawX + imgR, imgDrawY);
        ctx.lineTo(imgDrawX + imgDrawW - imgR, imgDrawY);
        ctx.quadraticCurveTo(imgDrawX + imgDrawW, imgDrawY, imgDrawX + imgDrawW, imgDrawY + imgR);
        ctx.lineTo(imgDrawX + imgDrawW, imgDrawY + imgDrawH - imgR);
        ctx.quadraticCurveTo(imgDrawX + imgDrawW, imgDrawY + imgDrawH, imgDrawX + imgDrawW - imgR, imgDrawY + imgDrawH);
        ctx.lineTo(imgDrawX + imgR, imgDrawY + imgDrawH);
        ctx.quadraticCurveTo(imgDrawX, imgDrawY + imgDrawH, imgDrawX, imgDrawY + imgDrawH - imgR);
        ctx.lineTo(imgDrawX, imgDrawY + imgR);
        ctx.quadraticCurveTo(imgDrawX, imgDrawY, imgDrawX + imgR, imgDrawY);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(cardData.img, imgDrawX, imgDrawY, imgDrawW, imgDrawH);
        ctx.restore();
      }
  
      // 文字区域布局：名称和按钮在上方同一行，下方是横线+描述+技能
      const textX = imgDrawX + imgDrawW + 10 * s;
      const btnW = 60 * s;
      const btnH = 22 * s;
      const btnX = detailX + detailW - pad - btnW;
      const btnY = innerY - 3 * s;
      const textW = btnX - textX - 8 * s; // 文字宽度到按钮左侧
      let textY = innerY + 2 * s;
  
      // 女巫名称
      ctx.font = `bold ${Math.floor(19 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(cardConfig.witch_name, textX, textY);
  
      // 名称下方的横线
      const lineY = textY + 24 * s;
      ctx.strokeStyle = 'rgba(196,163,90,0.5)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(textX, lineY);
      ctx.lineTo(btnX + btnW, lineY);
      ctx.stroke();
  
      textY = lineY + 8 * s;
  
      // 女巫描述
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#4a4a4a';
      const descLines = this._wrapText(ctx, cardConfig.witch_desc, textW + btnW + 8 * s, 14 * s);
      descLines.slice(0, 2).forEach((line, i) => {
        ctx.fillText(line, textX, textY + i * 18 * s);
      });
      textY += Math.min(descLines.length, 2) * 18 * s + 10 * s;
  
      // 技能描述
      if (cardConfig.card_skill_desc) {
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6fae';
        ctx.fillText('词牌技能', textX, textY);
        textY += 18 * s;
  
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#4a4a4a';
        const skillLines = this._wrapText(ctx, cardConfig.card_skill_desc, textW + btnW + 8 * s, 14 * s);
        skillLines.slice(0, 2).forEach((line, i) => {
          ctx.fillText(line, textX, textY + i * 18 * s);
        });
      }
  
      // 右上角装备按钮
      const isEquipped = game.equippedWitchCards.includes(level);
      const btnPressOffset = game._cardBookEquipBtnPressed ? 1 * s : 0;
      const drawBtnY = btnY + btnPressOffset;
  
      // 按钮背景
      ctx.save();
      ctx.beginPath();
      const br = 5 * s;
      ctx.moveTo(btnX + br, drawBtnY);
      ctx.lineTo(btnX + btnW - br, drawBtnY);
      ctx.quadraticCurveTo(btnX + btnW, drawBtnY, btnX + btnW, drawBtnY + br);
      ctx.lineTo(btnX + btnW, drawBtnY + btnH - br);
      ctx.quadraticCurveTo(btnX + btnW, drawBtnY + btnH, btnX + btnW - br, drawBtnY + btnH);
      ctx.lineTo(btnX + br, drawBtnY + btnH);
      ctx.quadraticCurveTo(btnX, drawBtnY + btnH, btnX, drawBtnY + btnH - br);
      ctx.lineTo(btnX, drawBtnY + br);
      ctx.quadraticCurveTo(btnX, drawBtnY, btnX + br, drawBtnY);
      ctx.closePath();
      if (isEquipped) {
        ctx.fillStyle = '#5a3d7a';
      } else {
        ctx.fillStyle = '#c4a35a';
      }
      ctx.fill();
      if (!isEquipped) {
        // ── 呼吸光边波纹 ──
        this._drawButtonRipple(ctx, btnX, drawBtnY, btnW, btnH, s, { stateKey: 'equip', radius: 5 });
      }
      ctx.restore();
  
      // 按钮文字
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isEquipped ? '已装备' : '装备', btnX + btnW / 2, drawBtnY + btnH / 2);
  
      // 回合中禁止切换提示
      if (game._equipBlockToast) {
        const toastElapsed = Date.now() - game._equipBlockToast.startTime;
        if (toastElapsed > 3500) {
          game._equipBlockToast = null;
        } else {
          const toastText = game._equipBlockToast.text;
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          const toastTextW = ctx.measureText(toastText).width;
          const toastPadX = 8 * s;
          const toastPadY = 4 * s;
          const toastW = toastTextW + toastPadX * 2;
          const toastH = 20 * s;
          let toastX = btnX + btnW / 2 - toastW / 2;
          // 右边界限制：toast 右边距屏幕右侧至少 2px
          if (toastX + toastW > W - 2) {
            toastX = W - 2 - toastW;
          }
          // 左边界限制：toast 左边距屏幕左侧至少 2px
          if (toastX < 2) {
            toastX = 2;
          }
          const toastY = btnY - toastH - 6 * s;
          const toastFadeIn = Math.min(1, toastElapsed / 150);
          const toastFadeOut = toastElapsed > 3000 ? (3500 - toastElapsed) / 500 : 1;
          const toastAlpha = toastFadeIn * toastFadeOut;
  
          ctx.save();
          ctx.globalAlpha = toastAlpha * alpha;
          ctx.fillStyle = 'rgba(200, 60, 60, 0.92)';
          const tr = 4 * s;
          ctx.beginPath();
          ctx.moveTo(toastX + tr, toastY);
          ctx.lineTo(toastX + toastW - tr, toastY);
          ctx.quadraticCurveTo(toastX + toastW, toastY, toastX + toastW, toastY + tr);
          ctx.lineTo(toastX + toastW, toastY + toastH - tr);
          ctx.quadraticCurveTo(toastX + toastW, toastY + toastH, toastX + toastW - tr, toastY + toastH);
          ctx.lineTo(toastX + tr, toastY + toastH);
          ctx.quadraticCurveTo(toastX, toastY + toastH, toastX, toastY + toastH - tr);
          ctx.lineTo(toastX, toastY + tr);
          ctx.quadraticCurveTo(toastX, toastY, toastX + tr, toastY);
          ctx.closePath();
          ctx.fill();
  
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(toastText, toastX + toastW / 2, toastY + toastH / 2);
          ctx.restore();
        }
      }
  
      // 装备已满3张提示
      if (game._equipFullToast) {
        const toastElapsed = Date.now() - game._equipFullToast.startTime;
        if (toastElapsed > 3500) {
          game._equipFullToast = null;
        } else {
          const toastText = game._equipFullToast.text;
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          const toastTextW = ctx.measureText(toastText).width;
          const toastPadX = 8 * s;
          const toastPadY = 4 * s;
          const toastW = toastTextW + toastPadX * 2;
          const toastH = 20 * s;
          let toastX = btnX + btnW / 2 - toastW / 2;
          // 右边界限制：toast 右边距屏幕右侧至少 2px
          if (toastX + toastW > W - 2) {
            toastX = W - 2 - toastW;
          }
          // 左边界限制：toast 左边距屏幕左侧至少 2px
          if (toastX < 2) {
            toastX = 2;
          }
          const toastY = btnY - toastH - 6 * s;
          const toastFadeIn = Math.min(1, toastElapsed / 150);
          const toastFadeOut = toastElapsed > 3000 ? (3500 - toastElapsed) / 500 : 1;
          const toastAlpha = toastFadeIn * toastFadeOut;

          ctx.save();
          ctx.globalAlpha = toastAlpha * alpha;
          ctx.fillStyle = 'rgba(200, 60, 60, 0.92)';
          const tr = 4 * s;
          ctx.beginPath();
          ctx.moveTo(toastX + tr, toastY);
          ctx.lineTo(toastX + toastW - tr, toastY);
          ctx.quadraticCurveTo(toastX + toastW, toastY, toastX + toastW, toastY + tr);
          ctx.lineTo(toastX + toastW, toastY + toastH - tr);
          ctx.quadraticCurveTo(toastX + toastW, toastY + toastH, toastX + toastW - tr, toastY + toastH);
          ctx.lineTo(toastX + tr, toastY + toastH);
          ctx.quadraticCurveTo(toastX, toastY + toastH, toastX, toastY + toastH - tr);
          ctx.lineTo(toastX, toastY + tr);
          ctx.quadraticCurveTo(toastX, toastY, toastX + tr, toastY);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(toastText, toastX + toastW / 2, toastY + toastH / 2);
          ctx.restore();
        }
      }

      // 记录按钮点击区域
      this.cardBookEquipBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  
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
