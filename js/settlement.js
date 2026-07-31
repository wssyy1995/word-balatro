const { Easing } = require('./animation');

// 金色块状向右箭头（结算翻倍揭晓用）：矩形箭杆 + 三角箭头，纯 Canvas 绘制
function _drawBlockArrow(ctx, cx, cy, w, h, color) {
  const headW = w * 0.45;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 4);
  ctx.lineTo(cx + w / 2 - headW, cy - h / 4);
  ctx.lineTo(cx + w / 2 - headW, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx + w / 2 - headW, cy + h / 2);
  ctx.lineTo(cx + w / 2 - headW, cy + h / 4);
  ctx.lineTo(cx - w / 2, cy + h / 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ===== 金币结算弹窗渲染 =====
class SettlementRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastSettlementData = null;
    this.claimBtnPressed = false;
  }

  draw(ctx, game, W, H, s) {
    const settlement = game.settlementData;
    if (!settlement) return;

    // 新的弹窗出现时重置动画
    const isClosing = game._closingSettlement;
    if (!isClosing && this.lastSettlementData !== settlement) {
      this.animStartTime = Date.now();
      this.lastSettlementData = settlement;
      this._bonusStampImpacted = false;
      this._bonusStampStars = null;
      this._bonusStampSoundPlayed = false;
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;
    const panel = this.parent._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeStartTime,
      width: 300, height: 340, enterOffset: 25, closeOffset: 40,
      elapsed,
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, elapsed: panelElapsed, closeAlpha } = panel;

    // 标题（带金币图标）
    const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
    ctx.save();
    ctx.globalAlpha = titleAnim.alpha * closeAlpha;
    const titleText = `第 ${settlement.round} 关结算`;
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    const titleW = ctx.measureText(titleText).width;
    const coinSize = 22 * s;
    const titleTotalW = titleW + coinSize + 6 * s;
    const titleStartX = W / 2 - titleTotalW / 2;
    const titleY = py + 35 * s + titleAnim.yShift;
    // 金币图标
    if (this.parent.coinIcon && this.parent.coinIconLoaded) {
      ctx.drawImage(this.parent.coinIcon, titleStartX, titleY - coinSize / 2, coinSize, coinSize);
    }
    // 标题文字
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, titleStartX + coinSize + 6 * s, titleY);
    ctx.restore();

    // 分隔线
    const line1Anim = Easing.fadeIn(elapsed, 140, 250, 6 * s);
    const line1Y = py + 55 * s + line1Anim.yShift;
    const line1W = pw - 60 * s;
    ctx.save();
    ctx.globalAlpha = line1Anim.alpha * closeAlpha;
    this.parent._drawTitleDivider(ctx, px + 30 * s, line1Y, line1W, s);
    ctx.restore();

    // ===== 单手通关翻倍：敲章时间线（统一基于弹窗 elapsed，无独立计时器）=====
    const bonusDouble = !!settlement.bonusDouble;
    const STAMP_START = 800;  // 弹窗入场(~300ms)后再延迟500ms 敲章
    const STAMP_SLAM = 160;   // 砸下时长
    const NUM_FLIP_AT = STAMP_START + STAMP_SLAM + 200; // 敲章落下完成后延迟200ms 数字翻倍弹出
    const stampElapsed = elapsed - STAMP_START;
    const stampDone = stampElapsed >= STAMP_SLAM;
    const doubled = bonusDouble && elapsed >= NUM_FLIP_AT;

    // 金币明细
    const lineY = py + 85 * s;
    const lineH = 36 * s;
    const items = [
      { label: '基础金币', value: `+${settlement.baseGold}`, num: settlement.baseGold },
      { label: '剩余出牌次数 ×2', value: `+${settlement.extraHands}`, num: settlement.extraHands },
      { label: '剩余弃牌次数 ×1', value: `+${settlement.extraDiscards}`, num: settlement.extraDiscards },
    ];
    if (settlement.zeroHandsBonus > 0) {
      items.push({ label: '出牌小能手', value: `+${settlement.zeroHandsBonus}`, color: '#4b0082', num: settlement.zeroHandsBonus });
    }

    items.forEach((item, i) => {
      const itemAnim = Easing.fadeIn(elapsed, 180 + i * 60, 250, 8 * s);
      const y = lineY + i * lineH + itemAnim.yShift;
      ctx.save();
      ctx.globalAlpha = itemAnim.alpha * closeAlpha;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = item.color || '#555';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, px + 35 * s, y);

      if (doubled) {
        // 翻倍揭晓："+2" 静态让位 + Canvas 金色箭头，"+4" 翻倍值 easeOutBack 缩放弹出（锚定右缘）
        const flipP = Math.min(1, (elapsed - NUM_FLIP_AT) / 450);
        const popScale = Easing.easeOutBack(flipP);
        const doubledText = `+${item.num * 2}`;
        const arrowW = 13 * s;
        const arrowGap = 5 * s;
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        const doubledW = ctx.measureText(doubledText).width;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'right';
        ctx.fillText(`+${item.num}`, px + pw - 35 * s - doubledW - arrowW - arrowGap * 2, y);
        _drawBlockArrow(ctx, px + pw - 35 * s - doubledW - arrowGap - arrowW / 2, y, arrowW, 9 * s, '#c4a35a');
        ctx.save();
        ctx.translate(px + pw - 35 * s, y);
        ctx.scale(popScale, popScale);
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#b87333';
        ctx.textAlign = 'right';
        ctx.fillText(doubledText, 0, 0);
        ctx.restore();
      } else {
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'right';
        ctx.fillText(item.value, px + pw - 35 * s, y);
      }
      ctx.restore();
    });

    // 总分隔线 + 总计
    const totalAnim = Easing.fadeIn(elapsed, 400, 250, 6 * s);
    const totalY = lineY + items.length * lineH + 10 * s + totalAnim.yShift;
    ctx.save();
    ctx.globalAlpha = totalAnim.alpha * closeAlpha;
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, totalY);
    ctx.lineTo(px + pw - 30 * s, totalY);
    ctx.stroke();

    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('总计', px + 35 * s, totalY + 25 * s);

    if (doubled) {
      // 翻倍揭晓："+11" 静态让位 + Canvas 金色箭头，"+22" 翻倍值 easeOutBack 缩放弹出（锚定右缘）
      const flipP = Math.min(1, (elapsed - NUM_FLIP_AT) / 450);
      const popScale = Easing.easeOutBack(flipP);
      const doubledTotal = `+${settlement.totalGold * 2}`;
      const arrowW = 15 * s;
      const arrowGap = 6 * s;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      const doubledTotalW = ctx.measureText(doubledTotal).width;
      ctx.font = `${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(`+${settlement.totalGold}`, px + pw - 35 * s - doubledTotalW - arrowW - arrowGap * 2, totalY + 25 * s);
      _drawBlockArrow(ctx, px + pw - 35 * s - doubledTotalW - arrowGap - arrowW / 2, totalY + 25 * s, arrowW, 11 * s, '#c4a35a');
      ctx.save();
      ctx.translate(px + pw - 35 * s, totalY + 25 * s);
      ctx.scale(popScale, popScale);
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#b87333';
      ctx.textAlign = 'right';
      ctx.fillText(doubledTotal, 0, 0);
      ctx.restore();
    } else {
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(`+${settlement.totalGold}`, px + pw - 35 * s, totalY + 25 * s);
    }
    ctx.restore();

    // 领取按钮
    const btnAnim = Easing.fadeIn(elapsed, 480, 250, 10 * s);
    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 28 * s + btnAnim.yShift;
    ctx.save();
    ctx.globalAlpha = btnAnim.alpha * closeAlpha;
    this.parent._drawScaledButton(ctx, '领取', btnX, btnY, btnW, btnH, s, this.claimBtnPressed, { color: '#c4a35a', radius: 8 });
    ctx.restore();

    // ===== 单手通关翻倍敲章（一击入魂横幅：重敲砸下 + 落点震动 + 粒子迸发）=====
    if (bonusDouble && this.parent.bonusDoubleLoaded && stampElapsed >= 0) {
      // 敲章开始下落时播放音效（仅一次）
      if (!this._bonusStampSoundPlayed) {
        this._bonusStampSoundPlayed = true;
        if (game.audioManager) game.audioManager.play('battle_pop_success');
      }
      const bdImg = this.parent.bonusDoubleImg;
      const bdW = 210 * s;
      const bdH = bdW * (bdImg.height / bdImg.width || 191 / 400);
      const bdCX = px + pw / 2;
      const bdCY = py - 22 * s; // 骑在弹窗顶边偏上

      let stampScale;
      let stampAlpha = 1;
      let shakeX = 0;
      let shakeY = 0;
      if (!stampDone) {
        // 砸下阶段：2.6倍 → 1倍，easeInCubic 加速（重敲感），透明度快速到位
        const slamP = Math.max(0, Math.min(stampElapsed / STAMP_SLAM, 1));
        stampScale = 2.6 - 1.6 * Easing.easeInCubic(slamP);
        stampAlpha = Math.min(1, slamP * 2.5);
      } else {
        // 落点：轻微回弹 + 震动快速衰减（约 260ms）
        const impactT = stampElapsed - STAMP_SLAM;
        const decay = Math.max(0, 1 - impactT / 260);
        stampScale = 1 + 0.07 * Math.sin(Math.PI * Math.min(impactT / 180, 1));
        shakeX = Math.sin(impactT * 0.11) * 3 * s * decay;
        shakeY = Math.cos(impactT * 0.13) * 2 * s * decay;
        // 落点瞬间：金色粒子迸发 + 重震动（仅触发一次）
        if (!this._bonusStampImpacted) {
          this._bonusStampImpacted = true;
          this.parent._spawnSparkles(bdCX - 40 * s, bdCY, 8);
          this.parent._spawnSparkles(bdCX + 40 * s, bdCY, 8);
          let isDevTools = false;
          try {
            if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
              isDevTools = wx.getSystemInfoSync().platform === 'devtools';
            }
          } catch (e) {}
          if (!isDevTools && typeof wx !== 'undefined' && wx.vibrateShort) {
            try { wx.vibrateShort({ type: 'heavy' }); } catch (e) {}
          }
        }
      }

      // 落点完成后：图片背后光芒射线 + 闪烁星星（300ms 淡入，复用对战胜利同款效果）
      if (stampDone) {
        const glowAlpha = Math.min(1, (stampElapsed - STAMP_SLAM) / 300) * closeAlpha;
        this.parent._drawLightRays(ctx, bdCX, bdCY, Math.max(bdW, bdH) * 1.15, s, elapsed, glowAlpha);
        this._bonusStampStars = this.parent._drawSparkleStars(
          ctx, bdCX, bdCY, bdW * 1.3, bdH * 1.7, s, elapsed, 12, this._bonusStampStars, glowAlpha
        );
      }

      ctx.save();
      ctx.globalAlpha = stampAlpha * closeAlpha;
      ctx.translate(bdCX + shakeX, bdCY + shakeY);
      ctx.scale(stampScale, stampScale);
      // 投影增强"砸下去"的份量感
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8 * s;
      ctx.shadowOffsetY = 3 * s;
      ctx.drawImage(bdImg, -bdW / 2, -bdH / 2, bdW, bdH);
      ctx.restore();
    }

    // 闭合 closing 动画的 globalAlpha
    ctx.restore();

    // 存储点击区域（动画完成后固定位置）
    const finalBtnY = py + ph - btnH - 28 * s;
    this.claimBtnRect = { x: btnX, y: finalBtnY, w: btnW, h: btnH };
  }
}

// ===== 女巫奖励弹窗渲染 =====
class WitchRewardRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.stashBtnRect = null;
    this.useBtnRect = null;
    this.okBtnRect = null;
    this.skipRect = null;
    this.okBtnPressed = false;
    this.stashBtnPressed = false;
    this.useBtnPressed = false;
    this.coinFlipStartTime = null;
    this.giftRects = [];
    this._lastPhase = null;
  }

  draw(ctx, game, W, H, s) {
    const data = game.witchRewardData;
    if (!data) return;

    // 弹出动效（easeOutBack）
    const elapsed = Date.now() - (data.startTime || Date.now());
    const enterDuration = 350;
    const enterProgress = Math.min(elapsed / enterDuration, 1);
    const enterEase = Easing.easeOutBack(enterProgress);
    const panelOffsetY = (1 - enterEase) * 30 * s;
    const contentAlpha = enterProgress;

    // 画遮罩（带淡入）— gift 阶段深黑，result 阶段保持深黑
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.82 * Math.min(elapsed / 200, 1)})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = contentAlpha;

    if (data.phase === 'gift') {
      // === 3个礼盒横排 ===
      const giftSize = 80 * s;
      const giftGap = 30 * s;
      const totalWidth = giftSize * 3 + giftGap * 2;
      const startX = (W - totalWidth) / 2;
      const giftY = H / 2 + panelOffsetY - giftSize / 2;

      // === 标题：女巫奖励 ===
      const titleText = '女巫奖励';
      const titleY = giftY - 40 * s;
      this.parent._drawWitchRewardTitle(ctx, titleText, W, titleY, s);

      this.giftRects = [];

      for (let i = 0; i < 3; i++) {
        const gx = startX + i * (giftSize + giftGap);
        const gy = giftY;
        const cx = gx + giftSize / 2;
        const cy = gy + giftSize / 2;

        if (data._selectedGiftIndex === undefined || i === data._selectedGiftIndex) {
          this._drawStarburst(ctx, cx, cy, giftSize, s);
        }

        if (data._selectedGiftIndex !== undefined) {
          if (i === data._selectedGiftIndex) {
            let pulse = 1;
            let alpha = 1;
            if (data._opening) {
              const openElapsed = Date.now() - data._openingStartTime;
              if (openElapsed < 800) {
                pulse = Math.sin(openElapsed / 80) * 0.2 + 1.1;
                alpha = 0.6 + Math.sin(openElapsed / 60) * 0.4;
              } else if (!data._resolved) {
                data._resolved = true;
                game.resolveWitchReward();
              }
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(alpha, 1));
            ctx.translate(cx, cy);
            ctx.scale(pulse, pulse);
            if (this.parent.witchGiftIcon && this.parent.witchGiftIconLoaded) {
              ctx.drawImage(this.parent.witchGiftIcon, -giftSize / 2, -giftSize / 2, giftSize, giftSize);
            } else {
              this._drawGiftBox(ctx, 0, 0, 70 * s, s);
            }
            ctx.restore();
          } else {
            const disappearElapsed = Date.now() - (data._disappearStartTime || Date.now());
            const disappearDuration = 200;
            const disappearProgress = Math.min(disappearElapsed / disappearDuration, 1);
            const scale = 1 - Easing.easeOutCubic(disappearProgress);
            const fadeAlpha = 1 - disappearProgress;

            if (fadeAlpha > 0) {
              ctx.save();
              ctx.globalAlpha = fadeAlpha;
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              if (this.parent.witchGiftIcon && this.parent.witchGiftIconLoaded) {
                ctx.drawImage(this.parent.witchGiftIcon, -giftSize / 2, -giftSize / 2, giftSize, giftSize);
              } else {
                this._drawGiftBox(ctx, 0, 0, 70 * s, s);
              }
              ctx.restore();
            }
          }
        } else {
          const breath = Math.sin(Date.now() / 800 + i * 0.5) * 0.05;
          const pulse = 1 + breath;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(pulse, pulse);
          if (this.parent.witchGiftIcon && this.parent.witchGiftIconLoaded) {
            ctx.drawImage(this.parent.witchGiftIcon, -giftSize / 2, -giftSize / 2, giftSize, giftSize);
          } else {
            this._drawGiftBox(ctx, 0, 0, 70 * s, s);
          }
          ctx.restore();

          this.giftRects.push({ x: gx, y: gy, w: giftSize, h: giftSize, index: i });
        }
      }

      if (data._selectedGiftIndex === undefined) {
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('选择一个礼盒', W / 2, giftY + giftSize + 25 * s);
      }

      this.skipRect = null;
      this.stashBtnRect = null;
      this.useBtnRect = null;
      this.okBtnRect = null;
    } else if (data.phase === 'result') {
      // 首次进入 result 阶段时重置金币翻转时间基准
      if (this._lastPhase !== 'result') {
        this.coinFlipStartTime = null;
      }
      this._lastPhase = data.phase;

      // result 阶段复用女巫奖励弹窗风格：标题 + 中间内容 + 底部领取按钮，无窗口边框/背景
      const titleText = data.result ? '获得奖励' : (data.consolationGold ? '获得奖励' : '');
      const titleY = H / 2 - 130 * s;
      this.parent._drawWitchRewardTitle(ctx, titleText, W, titleY, s, { alpha: contentAlpha });

      const iconCY = H / 2 - 20 * s + panelOffsetY;
      const rewardItem = data.rewardItem;

      if (data.result && rewardItem && rewardItem.type === 'buff') {
        if (rewardItem.effect === 'double_coin') {
          if (!this.coinFlipStartTime) this.coinFlipStartTime = Date.now();
          const flipElapsed = Date.now() - this.coinFlipStartTime;
          const flipDuration = 2500;
          const flipProgress = Math.min(flipElapsed / flipDuration, 1);
          const rotations = 2;
          const angle = rotations * Math.PI * 2 * Easing.easeOutCubic(flipProgress);
          const scaleX = Math.cos(angle);
          const coinSize = 80 * s;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.translate(W / 2, iconCY);
          ctx.scale(scaleX, 1);
          if (this.parent.coinIcon && this.parent.coinIconLoaded) {
            ctx.drawImage(this.parent.coinIcon, -coinSize / 2, -coinSize / 2, coinSize, coinSize);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, coinSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = '#f5c542';
            ctx.fill();
            ctx.strokeStyle = '#c4a35a';
            ctx.lineWidth = 3 * s;
            ctx.stroke();
          }
          ctx.restore();

          if (flipProgress < 1) {
            const shineAlpha = (1 - flipProgress) * 0.4;
            ctx.save();
            ctx.globalAlpha = shineAlpha * contentAlpha;
            ctx.beginPath();
            ctx.arc(W / 2, iconCY, coinSize * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.restore();
          }

          const descY = iconCY + 65 * s;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rewardItem.desc, W / 2, descY);
          ctx.restore();
        } else if (rewardItem.effect === 'shop_discount_5') {
          const iconSize = 90 * s;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          if (this.parent.discountIcon && this.parent.discountIconLoaded) {
            ctx.drawImage(this.parent.discountIcon, W / 2 - iconSize / 2, iconCY - iconSize / 2, iconSize, iconSize);
          } else {
            const iconR = 45 * s;
            ctx.beginPath();
            ctx.arc(W / 2, iconCY, iconR, 0, Math.PI * 2);
            ctx.fillStyle = '#e74c3c';
            ctx.fill();
            ctx.font = `bold ${Math.floor(28 * s)}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('5折', W / 2, iconCY);
          }
          ctx.restore();

          const descY = iconCY + 70 * s;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rewardItem.desc, W / 2, descY);
          ctx.restore();
        } else {
          const iconSize = 100 * s;
          const effectToImageMap = {
            'extra_hand': 'global_hand_1',
            'extra_letter': 'global_letter_1',
            'extra_witch_slot': 'global_witch_card_1'
          };
          const imageName = effectToImageMap[rewardItem.effect];
          const iconData = imageName && this.parent.rewardBuffImages ? this.parent.rewardBuffImages[imageName] : null;
          // 兼容 cloudStorage 注入的 img 对象和统一格式 { img, loaded, width, height }
          const iconImg = iconData ? (iconData.img || iconData) : null;
          const iconLoaded = iconData ? (iconData.loaded !== undefined ? iconData.loaded : !!iconImg) : false;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          if (iconLoaded && iconImg) {
            ctx.drawImage(iconImg, W / 2 - iconSize / 2, iconCY - iconSize / 2, iconSize, iconSize);
          } else {
            // 兜底：圆形 +1
            const iconR = 35 * s;
            ctx.beginPath();
            ctx.arc(W / 2, iconCY, iconR, 0, Math.PI * 2);
            ctx.fillStyle = '#f5f0e6';
            ctx.fill();
            ctx.lineWidth = 2 * s;
            ctx.strokeStyle = '#c4a35a';
            ctx.stroke();

            ctx.font = `bold ${Math.floor(28 * s)}px sans-serif`;
            ctx.fillStyle = '#c4a35a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+1', W / 2, iconCY);
          }
          ctx.restore();

          const descY = iconCY + 62 * s;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rewardItem.desc, W / 2, descY);
          ctx.restore();
        }

        let descY = iconCY + 62 * s;
        if (rewardItem.effect === 'double_coin') {
          descY = iconCY + 67 * s;
        } else if (rewardItem.effect === 'shop_discount_5') {
          descY = iconCY + 62 * s;
        }

        const btnW = 126 * s;
        const btnH = 40 * s;
        const btnX = (W - btnW) / 2;
        const btnY = descY + 22 * s + btnH / 2;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.parent._drawButtonRipple(ctx, btnX, btnY, btnW, btnH, s, {
          stateKey: 'witch_reward_ok',
          radius: 8,
          interval: 900,
          duration: 1800,
          alphaScale: 0.55,
          lineWidthScale: 0.8,
          fillAlpha: 0.22,
          strokeAlpha: 0.45,
          color: { r: 255, g: 195, b: 70 },
          strokeColor: { r: 188, g: 140, b: 40 }
        });
        this.parent._drawScaledButton(ctx, '领取', btnX, btnY, btnW, btnH, s, this.okBtnPressed, { color: '#c4a35a', radius: 8 });
        ctx.restore();
        this.okBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        this.stashBtnRect = null;
        this.useBtnRect = null;
        this.skipRect = null;
      } else if (data.result && rewardItem) {
        // 卡牌奖励
        const cardMaxW = 120 * s;
        const cardMaxH = 150 * s;
        let cardW = cardMaxW, cardH = cardMaxH;
        const iconName = data.rewardItem.effect;
        const iconData = this.parent.shopCardImages[iconName];
        if (iconData && iconData.loaded && iconData.img && iconData.width > 0 && iconData.height > 0) {
          const containerAspect = cardMaxW / cardMaxH;
          const aspect = iconData.width / iconData.height;
          if (containerAspect > aspect) {
            cardH = cardMaxH;
            cardW = cardH * aspect;
          } else {
            cardW = cardMaxW;
            cardH = cardW / aspect;
          }
        }
        const cardCX = W / 2;
        const cardCY = iconCY;
        const cardX = cardCX - cardW / 2;
        const cardY = cardCY - cardH / 2;

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.beginPath();
        const cr = 4 * s;
        ctx.moveTo(cardX + cr, cardY);
        ctx.lineTo(cardX + cardW - cr, cardY);
        ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cr);
        ctx.lineTo(cardX + cardW, cardY + cardH - cr);
        ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cr, cardY + cardH);
        ctx.lineTo(cardX + cr, cardY + cardH);
        ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cr);
        ctx.lineTo(cardX, cardY + cr);
        ctx.quadraticCurveTo(cardX, cardY, cardX + cr, cardY);
        ctx.closePath();
        ctx.clip();
        if (iconData && iconData.loaded && iconData.img) {
          ctx.drawImage(iconData.img, cardX, cardY, cardW, cardH);
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.parent._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s);
        ctx.restore();

        const nameY = cardY + cardH + 25 * s;
        const descY = nameY + 24 * s;

        // 卡牌名称和描述背后的金色蒙层
        const descPanelPadding = 16 * s;
        const descPanelH = (descY - nameY) + 40 * s;
        const descPanelY = nameY - 20 * s;
        ctx.save();
        ctx.globalAlpha = 0.18 * contentAlpha;
        ctx.fillStyle = '#c4a35a';
        this.parent.roundRect(W / 2 - (cardW / 2 + descPanelPadding), descPanelY, cardW + descPanelPadding * 2, descPanelH, 10 * s, '#c4a35a');
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.name, W / 2, nameY);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.desc, W / 2, descY);
        ctx.restore();

        const collectBtnH = 44 * s;
        const btnW = 120 * s;
        const btnGap = 12 * s;
        const btnY = descY + 50 * s;

        const isGameScope = data.rewardItem.scope === 'game';
        if (isGameScope) {
          const stashX = (W - btnW) / 2;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          this.parent._drawScaledButton(ctx, '暂存', stashX, btnY, btnW, collectBtnH, s, this.stashBtnPressed, { color: '#f5f0e6', textColor: '#5a4a2a', radius: 8, stroke: '#c4a35a' });
          ctx.restore();
          this.stashBtnRect = { x: stashX, y: btnY, w: btnW, h: collectBtnH };
          this.useBtnRect = null;
        } else {
          const totalW = btnW * 2 + btnGap;
          const startX = (W - totalW) / 2;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          this.parent._drawScaledButton(ctx, '立即使用', startX, btnY, btnW, collectBtnH, s, this.useBtnPressed, { color: '#c4a35a', radius: 8 });
          ctx.restore();

          const stashX = startX + btnW + btnGap;
          const rewardEffect = data.rewardItem.effect;
          const isStashablePotion = rewardEffect === 'upgrade_letter' || rewardEffect === 'random_upgrade';
          const potionFull = (game.potions || []).length >= 2;
          const stashDisabled = isStashablePotion && potionFull;

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          if (stashDisabled) {
            this.parent.roundRect(stashX, btnY, btnW, collectBtnH, 8 * s, '#e0e0e0', '#999');
            ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
            ctx.fillStyle = '#999';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂存', stashX + btnW / 2, btnY + collectBtnH / 2 - 6 * s);
            ctx.font = `${Math.floor(10 * s)}px sans-serif`;
            ctx.fillText('(已达上限)', stashX + btnW / 2, btnY + collectBtnH / 2 + 8 * s);
          } else {
            this.parent._drawScaledButton(ctx, '暂存', stashX, btnY, btnW, collectBtnH, s, this.stashBtnPressed, { color: '#f5f0e6', textColor: '#5a4a2a', radius: 8, stroke: '#c4a35a' });
          }
          ctx.restore();

          this.stashBtnRect = stashDisabled ? null : { x: stashX, y: btnY, w: btnW, h: collectBtnH };
          this.useBtnRect = { x: startX, y: btnY, w: btnW, h: collectBtnH };
        }
        this.okBtnRect = null;
        this.skipRect = null;
      } else if (data.consolationGold) {
        if (!this.coinFlipStartTime) this.coinFlipStartTime = Date.now();
        const flipElapsed = Date.now() - this.coinFlipStartTime;
        const flipDuration = 2500;
        const flipProgress = Math.min(flipElapsed / flipDuration, 1);
        const rotations = 2;
        const angle = rotations * Math.PI * 2 * Easing.easeOutCubic(flipProgress);
        const scaleX = Math.cos(angle);
        const coinSize = 80 * s;

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.translate(W / 2, iconCY);
        ctx.scale(scaleX, 1);
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, -coinSize / 2, -coinSize / 2, coinSize, coinSize);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, coinSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = '#f5c542';
          ctx.fill();
          ctx.strokeStyle = '#c4a35a';
          ctx.lineWidth = 3 * s;
          ctx.stroke();
        }
        ctx.restore();

        if (flipProgress < 1) {
          const shineAlpha = (1 - flipProgress) * 0.4;
          ctx.save();
          ctx.globalAlpha = shineAlpha * contentAlpha;
          ctx.beginPath();
          ctx.arc(W / 2, iconCY, coinSize * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.restore();
        }

        const descY = iconCY + 65 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${data.consolationGold} 金币`, W / 2, descY);
        ctx.restore();

        const btnW = 126 * s;
        const btnH = 40 * s;
        const btnX = (W - btnW) / 2;
        const btnY = descY + 20 * s + btnH / 2;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.parent._drawButtonRipple(ctx, btnX, btnY, btnW, btnH, s, {
          stateKey: 'witch_reward_consolation',
          radius: 8,
          interval: 900,
          duration: 1800,
          alphaScale: 0.55,
          lineWidthScale: 0.8,
          fillAlpha: 0.22,
          strokeAlpha: 0.45,
          color: { r: 255, g: 195, b: 70 },
          strokeColor: { r: 188, g: 140, b: 40 }
        });
        this.parent._drawScaledButton(ctx, '领取', btnX, btnY, btnW, btnH, s, this.okBtnPressed, { color: '#c4a35a', radius: 8 });
        ctx.restore();
        this.okBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        this.stashBtnRect = null;
        this.useBtnRect = null;
        this.skipRect = null;
      } else {
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('什么都没有', W / 2, H / 2);
        ctx.restore();

        const btnW = 126 * s;
        const btnH = 40 * s;
        const btnX = (W - btnW) / 2;
        const btnY = H / 2 + 70 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.parent._drawButtonRipple(ctx, btnX, btnY, btnW, btnH, s, {
          stateKey: 'witch_reward_empty',
          radius: 8,
          interval: 900,
          duration: 1800,
          alphaScale: 0.55,
          lineWidthScale: 0.8,
          fillAlpha: 0.22,
          strokeAlpha: 0.45,
          color: { r: 255, g: 195, b: 70 },
          strokeColor: { r: 188, g: 140, b: 40 }
        });
        this.parent._drawScaledButton(ctx, '确定', btnX, btnY, btnW, btnH, s, this.okBtnPressed, { color: '#c4a35a', radius: 8 });
        ctx.restore();
        this.okBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        this.stashBtnRect = null;
        this.useBtnRect = null;
        this.skipRect = null;
      }

      return;
    }

    ctx.restore();
  }

  _drawStarburst(ctx, cx, cy, size, s) {
    const now = Date.now();
    const breath = 0.5 + 0.5 * Math.sin(now / 800);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowBlur = 0;

    const glowR = size * 0.6;
    const glowAlpha = 0.15 * breath;
    const glowGrad = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, glowR);
    glowGrad.addColorStop(0, `rgba(255,215,100,${glowAlpha})`);
    glowGrad.addColorStop(0.4, `rgba(196,163,90,${glowAlpha * 0.6})`);
    glowGrad.addColorStop(1, 'rgba(196,163,90,0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    const starCount = 14;
    for (let i = 0; i < starCount; i++) {
      const seed = i * 137.5;
      const dist = size * (0.3 + 0.45 * Math.abs(Math.sin(seed)));
      const angle = seed + now / 1500;
      const twinkle = 0.5 + 0.5 * Math.sin(now / 350 + i * 2.5);
      const starSize = (1 + 0.6 * Math.sin(i * 3)) * s;

      ctx.fillStyle = `rgba(255,230,150,${0.9 * twinkle})`;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, starSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawGiftBox(ctx, cx, cy, size, s) {
    const boxW = size;
    const boxH = size * 0.75;
    const x = cx - boxW / 2;
    const y = cy - boxH / 2;
    const r = Math.max(2, 4 * s);

    this.parent.roundRect(x, y, boxW, boxH, r, '#c4a35a');

    ctx.fillStyle = '#d4af37';
    const ribbonW = Math.max(2, size * 0.12);
    ctx.fillRect(x + boxW / 2 - ribbonW / 2, y, ribbonW, boxH);
    ctx.fillRect(x, y + boxH / 2 - ribbonW / 2, boxW, ribbonW);

    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(cx - size * 0.1, y - size * 0.02, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + size * 0.1, y - size * 0.02, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

module.exports = { SettlementRenderer, WitchRewardRenderer };
