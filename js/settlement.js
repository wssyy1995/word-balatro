const { Easing } = require('./animation');

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

    // 金币明细
    const lineY = py + 85 * s;
    const lineH = 36 * s;
    const items = [
      { label: '基础金币', value: `+${settlement.baseGold}` },
      { label: '剩余出牌次数 ×2', value: `+${settlement.extraHands}` },
      { label: '剩余弃牌次数 ×1', value: `+${settlement.extraDiscards}` },
    ];
    if (settlement.zeroHandsBonus > 0) {
      items.push({ label: '出牌小能手', value: `+${settlement.zeroHandsBonus}`, color: '#4b0082' });
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

      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(item.value, px + pw - 35 * s, y);
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

    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'right';
    ctx.fillText(`+${settlement.totalGold}`, px + pw - 35 * s, totalY + 25 * s);
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
      const titleY = H / 2 - 120 * s;
      this.parent._drawWitchRewardTitle(ctx, titleText, W, titleY, s, { alpha: contentAlpha });

      const iconCY = H / 2 + panelOffsetY;
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
          const iconSize = 70 * s;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          if (this.parent.discountIcon && this.parent.discountIconLoaded) {
            ctx.drawImage(this.parent.discountIcon, W / 2 - iconSize / 2, iconCY - iconSize / 2, iconSize, iconSize);
          } else {
            const iconR = 35 * s;
            ctx.beginPath();
            ctx.arc(W / 2, iconCY, iconR, 0, Math.PI * 2);
            ctx.fillStyle = '#e74c3c';
            ctx.fill();
            ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('5折', W / 2, iconCY);
          }
          ctx.restore();

          const descY = iconCY + 60 * s;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rewardItem.desc, W / 2, descY);
          ctx.restore();
        } else {
          const iconR = 35 * s;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.beginPath();
          ctx.arc(W / 2, iconCY, iconR, 0, Math.PI * 2);
          ctx.fillStyle = '#f5f0e6';
          ctx.fill();
          ctx.lineWidth = 2 * s;
          ctx.strokeStyle = '#c4a35a';
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(28 * s)}px sans-serif`;
          ctx.fillStyle = '#c4a35a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+1', W / 2, iconCY);
          ctx.restore();

          const descY = iconCY + 60 * s;
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rewardItem.desc, W / 2, descY);
          ctx.restore();
        }

        const btnW = 130 * s;
        const btnH = 44 * s;
        const btnX = (W - btnW) / 2;
        const btnY = H - btnH - 80 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
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
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.name, W / 2, nameY);
        ctx.restore();

        const descY = nameY + 24 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.desc, W / 2, descY);
        ctx.restore();

        const collectBtnH = 44 * s;
        const btnW = 120 * s;
        const btnGap = 12 * s;
        const btnY = H - collectBtnH - 80 * s;

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

        const btnW = 130 * s;
        const btnH = 44 * s;
        const btnX = (W - btnW) / 2;
        const btnY = H - btnH - 80 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
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

        const btnW = 120 * s;
        const btnH = 40 * s;
        const btnX = (W - btnW) / 2;
        const btnY = H - btnH - 80 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
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
