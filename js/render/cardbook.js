const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
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

      // 常驻绘制紫色星星光晕
      if (isInShop) {
        this._drawGentleStars(drawX + iconW / 2, drawY + iconH / 2, 28 * s, s, 1, 1.2);
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
        if (!this._equipBtnRings) this._equipBtnRings = [];
        const now = Date.now();
        const RING_INTERVAL = 1700;
        const RING_DURATION = 2200;

        if (this._equipBtnRings.length === 0 || now - this._equipBtnRings[this._equipBtnRings.length - 1].start > RING_INTERVAL) {
          this._equipBtnRings.push({ start: now });
        }
        while (this._equipBtnRings.length > 0 && now - this._equipBtnRings[0].start > RING_DURATION) {
          this._equipBtnRings.shift();
        }

        for (const ring of this._equipBtnRings) {
          const elapsed = now - ring.start;
          const progress = elapsed / RING_DURATION;
          const expand = progress * 10 * s;
          const alpha = 0.55 * (1 - progress) * (1 - progress);

          ctx.save();
          ctx.beginPath();
          const er = 5 * s + expand;
          const ex = btnX - expand;
          const ey = drawBtnY - expand;
          const ew = btnW + 2 * expand;
          const eh = btnH + 2 * expand;
          ctx.moveTo(ex + er, ey);
          ctx.lineTo(ex + ew - er, ey);
          ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + er);
          ctx.lineTo(ex + ew, ey + eh - er);
          ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - er, ey + eh);
          ctx.lineTo(ex + er, ey + eh);
          ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - er);
          ctx.lineTo(ex, ey + er);
          ctx.quadraticCurveTo(ex, ey, ex + er, ey);
          ctx.closePath();

          ctx.fillStyle = `rgba(255, 215, 120, ${alpha * 0.35})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(212, 169, 78, ${alpha})`;
          ctx.lineWidth = 2.2 * s;
          ctx.stroke();
          ctx.restore();
        }
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
  
      // 装备已满3张提示
      if (game._equipFullToast) {
        const toastElapsed = Date.now() - game._equipFullToast.startTime;
        if (toastElapsed > 2500) {
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
          const toastFadeOut = toastElapsed > 2000 ? (2500 - toastElapsed) / 500 : 1;
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
