const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { Easing } = require('../animation');

module.exports = function extendCardbook(Renderer) {
    Renderer.prototype._drawCardBookIcon = function(game, titleX, titleY, titleW) {
      if (!game.cardBookUnlocked) return;
      const ctx = this.ctx;
      const s = this.scale;
      const baseH = 28 * s + 4;
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
      const iconY = titleY - iconH / 2 + pressOffset - 1 * s;
      ctx.save();
  
      // 新收集闪烁动画：缩放脉冲 + 金色外发光
      let flashScale = 1;
      let glowAlpha = 0;
      const isFlashing = (game._newWitchCardThisShop || game._forceCardBookFlash) && game._cardBookIconFlashStart;
      if (isFlashing) {
        const flashElapsed = Date.now() - game._cardBookIconFlashStart;
        if (flashElapsed < 2000) {
          const pulse = Math.abs(Math.sin(flashElapsed / 212));
          flashScale = 1 + 0.15 * pulse;
          glowAlpha = pulse;
        } else {
          game._cardBookIconFlashStart = null;
          game._forceCardBookFlash = false;
        }
      }
  
      const centerX = iconX + iconW / 2;
      const centerY = iconY + iconH / 2;
      const drawW = iconW * flashScale;
      const drawH = iconH * flashScale;
      const drawX = centerX - drawW / 2;
      const drawY = centerY - drawH / 2;
  
      // 闪烁时背后绘制紫色星星（通用方法 _drawGentleStars 复用）
      if (isFlashing && game._cardBookIconFlashStart) {
        const elapsed = Date.now() - game._cardBookIconFlashStart;
        const duration = 2000;
        if (elapsed < duration) {
          const fade = elapsed > 1000 ? 1 - (elapsed - 1000) / 1000 : 1;
          this._drawGentleStars(drawX + drawW / 2, drawY + drawH / 2, 40 * s, s, fade, 1.5);
        }
      }
  
      // 绘制图标（带缩放脉冲）
      if (this.cardBookIcon && this.cardBookIconLoaded) {
        ctx.drawImage(this.cardBookIcon, drawX, drawY, drawW, drawH);
      }
      ctx.restore();

      // NEW! 角标（闪烁结束后显示）
      if (game._cardBookNewBadge && this.newBadgeIcon && this.newBadgeIconLoaded) {
        const badgeW = 32 * s;
        const badgeH = this.newBadgeIcon.height
          ? badgeW * (this.newBadgeIcon.height / this.newBadgeIcon.width)
          : badgeW;
        const badgeX = iconX + iconW - badgeW * 0.6 + 2 * s;
        const badgeY = iconY - badgeH * 0.4 - 2 * s;
        ctx.save();
        ctx.translate(badgeX + badgeW / 2, badgeY + badgeH / 2);
        ctx.rotate(Math.PI / 6);
        ctx.drawImage(this.newBadgeIcon, -badgeW / 2, -badgeH / 2, badgeW, badgeH);
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
      const cardData = this.witchCardImages[cardName];
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
        ctx.fillText('卡牌技能', textX, textY);
        textY += 18 * s;
  
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#4a4a4a';
        const skillLines = this._wrapText(ctx, cardConfig.card_skill_desc, textW + btnW + 8 * s, 14 * s);
        skillLines.slice(0, 2).forEach((line, i) => {
          ctx.fillText(line, textX, textY + i * 18 * s);
        });
      }
  
      // 右上角装备按钮
      const isEquipped = game.equippedWitchCard === level;
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
        if (toastElapsed > 3000) {
          game._equipBlockToast = null;
        } else {
          const toastText = game._equipBlockToast.text;
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          const toastTextW = ctx.measureText(toastText).width;
          const toastPadX = 8 * s;
          const toastPadY = 4 * s;
          const toastW = toastTextW + toastPadX * 2;
          const toastH = 20 * s;
          const toastX = btnX + btnW / 2 - toastW / 2;
          const toastY = btnY - toastH - 6 * s;
          const toastFadeIn = Math.min(1, toastElapsed / 150);
          const toastFadeOut = toastElapsed > 2500 ? (3000 - toastElapsed) / 500 : 1;
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

};
