// ===== 金币结算弹窗渲染 =====
class SettlementRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastSettlementData = null;
  }

  draw(ctx, game, W, H, s) {
    const settlement = game.settlementData;
    if (!settlement) return;

    const isClosing = game._closingSettlement;
    const closeElapsed = isClosing ? Date.now() - (game._closeStartTime || Date.now()) : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / 300, 1) : 0;
    if (isClosing && closeProgress >= 1) return;

    // 新的弹窗出现时重置动画
    if (!isClosing && this.lastSettlementData !== settlement) {
      this.animStartTime = Date.now();
      this.lastSettlementData = settlement;
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;

    // easeOutBack 缓动（轻微回弹）
    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    // closing 时整体向上滑出 + 淡出
    const closeSlideY = isClosing ? -closeProgress * 40 * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;
    ctx.save();
    ctx.globalAlpha = closeAlpha;

    // 遮罩
    const overlayAlpha = isClosing ? 0.65 * (1 - closeProgress) : Math.min(elapsed / 200, 0.65);
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    ctx.fillRect(0, 0, W, H);

    // 弹窗尺寸
    const pw = 300 * s;
    const ph = 340 * s;
    const px = (W - pw) / 2;
    const basePy = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    // 弹窗入场：从下方 25px 滑入 + easeOutBack
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

    // 标题（带金币图标）
    const titleAnim = fadeIn(elapsed, 80);
    ctx.save();
    ctx.globalAlpha = titleAnim.alpha;
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
    const line1Anim = fadeIn(elapsed, 140, 6 * s);
    ctx.save();
    ctx.globalAlpha = line1Anim.alpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const line1Y = py + 55 * s + line1Anim.yShift;
    ctx.moveTo(px + 30 * s, line1Y);
    ctx.lineTo(px + pw - 30 * s, line1Y);
    ctx.stroke();
    ctx.restore();

    // 金币明细
    const lineY = py + 85 * s;
    const lineH = 36 * s;
    const items = [
      { label: '基础金币', value: `+${settlement.baseGold}` },
      { label: '剩余出牌次数 ×1', value: `+${settlement.extraHands}` },
      { label: '剩余弃牌次数 ×1', value: `+${settlement.extraDiscards}` },
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

    // 总分隔线 + 总计
    const totalAnim = fadeIn(elapsed, 400, 6 * s);
    const totalY = lineY + items.length * lineH + 10 * s + totalAnim.yShift;
    ctx.save();
    ctx.globalAlpha = totalAnim.alpha;
    ctx.strokeStyle = gold;
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
    const btnAnim = fadeIn(elapsed, 480, 10 * s);
    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 28 * s + btnAnim.yShift;
    ctx.save();
    ctx.globalAlpha = btnAnim.alpha;
    this.parent.roundRect(btnX, btnY, btnW, btnH, 8 * s, '#c4a35a');
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('领取', W / 2, btnY + btnH / 2);
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
  }

  draw(ctx, game, W, H, s) {
    const data = game.witchRewardData;
    if (!data) return;

    // 自动从 gift 切换到 result（1.5秒后）
    if (data.phase === 'gift') {
      const elapsed = Date.now() - data.giftStartTime;
      if (elapsed > 1500) {
        game.resolveWitchReward();
      }
    }

    // 画遮罩
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // 弹窗背景
    const pw = 300 * s;
    const ph = data.phase === 'gift' ? 220 * s : 340 * s;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const gold = '#c4a35a';
    const darkBlue = '#1a2f4a';

    this.parent.roundRect(px, py, pw, ph, 14 * s, '#faf6ee', gold, 1.5 * s);

    if (data.phase === 'gift') {
      // 标题
      ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
      ctx.fillStyle = darkBlue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('女巫奖励', W / 2, py + 45 * s);

      // 礼物图标闪烁动画
      const elapsed = Date.now() - data.giftStartTime;
      const pulse = Math.sin(elapsed / 150) * 0.15 + 1;
      const alpha = 0.7 + Math.sin(elapsed / 100) * 0.3;

      const giftSize = 55 * s;
      const giftX = W / 2;
      const giftY = py + ph / 2 + 5 * s;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(alpha, 1));
      ctx.translate(giftX, giftY);
      ctx.scale(pulse, pulse);
      this._drawGiftBox(ctx, 0, 0, giftSize, s);
      ctx.restore();

      // 点击跳过提示
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('点击屏幕揭晓', W / 2, py + ph - 30 * s);

      // 整屏可点击跳过
      this.skipRect = { x: 0, y: 0, w: W, h: H };
      this.stashBtnRect = null;
      this.useBtnRect = null;
      this.okBtnRect = null;
    } else if (data.phase === 'result') {
      if (data.result) {
        // === 标题：获得奖励 ===
        ctx.save();
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('获得奖励', W / 2, py + 38 * s);
        ctx.restore();

        // === 标题下装饰线 ===
        ctx.save();
        ctx.strokeStyle = 'rgba(196,163,90,0.5)';
        ctx.lineWidth = 1 * s;
        const decoLineY = py + 56 * s;
        const decoLineW = pw * 0.5;
        const decoLineX = px + (pw - decoLineW) / 2;
        ctx.beginPath();
        ctx.moveTo(decoLineX, decoLineY);
        ctx.lineTo(decoLineX + decoLineW, decoLineY);
        ctx.stroke();
        ctx.save();
        ctx.translate(W / 2, decoLineY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = gold;
        ctx.fillRect(-3 * s, -3 * s, 6 * s, 6 * s);
        ctx.restore();
        ctx.restore();

        // === 卡牌尺寸计算 ===
        const cardMaxW = pw * 0.4;
        const cardMaxH = 110 * s;
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
        const cardCY = py + 72 * s + cardH / 2;
        const cardX = cardCX - cardW / 2;
        const cardY = cardCY - cardH / 2;

        // === 卡牌图片（圆角裁剪）===
        ctx.save();
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

        // === 光彩效果（金色脉动光晕 + 闪烁星）===
        const t = Date.now();
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
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y - r);
          ctx.lineTo(sp.x + r * 0.35, sp.y - r * 0.35);
          ctx.lineTo(sp.x + r, sp.y);
          ctx.lineTo(sp.x + r * 0.35, sp.y + r * 0.35);
          ctx.lineTo(sp.x, sp.y + r);
          ctx.lineTo(sp.x - r * 0.35, sp.y + r * 0.35);
          ctx.lineTo(sp.x - r, sp.y);
          ctx.lineTo(sp.x - r * 0.35, sp.y - r * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });

        // === 卡牌名称 ===
        const nameY = cardY + cardH + 20 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.name, W / 2, nameY);
        ctx.restore();

        // === 卡牌描述 ===
        const descY = nameY + 24 * s;
        ctx.save();
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.rewardItem.desc, W / 2, descY);
        ctx.restore();

        // === 底部分隔线 ===
        const bottomLineY = descY + 28 * s;
        ctx.save();
        ctx.strokeStyle = 'rgba(196,163,90,0.4)';
        ctx.lineWidth = 1 * s;
        const blW = pw * 0.55;
        const blX = px + (pw - blW) / 2;
        ctx.beginPath();
        ctx.moveTo(blX, bottomLineY);
        ctx.lineTo(blX + blW, bottomLineY);
        ctx.stroke();
        ctx.save();
        ctx.translate(W / 2, bottomLineY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = gold;
        ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
        ctx.restore();
        ctx.restore();

        // === 按钮 ===
        const collectBtnH = 44 * s;
        const btnW = 120 * s;
        const btnGap = 12 * s;
        const totalW = btnW * 2 + btnGap;
        const startX = (W - totalW) / 2;
        const btnY = py + ph - collectBtnH - 22 * s;

        // 立即使用（金色背景）
        this.parent.roundRect(startX, btnY, btnW, collectBtnH, 8 * s, '#c4a35a');
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('立即使用', startX + btnW / 2, btnY + collectBtnH / 2);

        // 暂存（米色边框按钮）
        const stashX = startX + btnW + btnGap;
        this.parent.roundRect(stashX, btnY, btnW, collectBtnH, 8 * s, '#f5f0e6', '#c4a35a');
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('暂存', stashX + btnW / 2, btnY + collectBtnH / 2);

        this.stashBtnRect = { x: stashX, y: btnY, w: btnW, h: collectBtnH };
        this.useBtnRect = { x: startX, y: btnY, w: btnW, h: collectBtnH };
        this.okBtnRect = null;
        this.skipRect = null;
      } else {
        // 没中
        ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('什么都没有', W / 2, py + ph / 2 - 15 * s);

        // 确定按钮
        const btnW = 120 * s;
        const btnH = 40 * s;
        const btnX = (W - btnW) / 2;
        const btnY = py + ph - btnH - 40 * s;
        this.parent.roundRect(btnX, btnY, btnW, btnH, 6 * s, '#8a8a8a');
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        ctx.fillText('确定', W / 2, btnY + btnH / 2);

        this.okBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        this.stashBtnRect = null;
        this.useBtnRect = null;
        this.skipRect = null;
      }
    }

    ctx.restore();
  }

  _drawGiftBox(ctx, cx, cy, size, s) {
    const boxW = size;
    const boxH = size * 0.75;
    const x = cx - boxW / 2;
    const y = cy - boxH / 2;
    const r = Math.max(2, 4 * s);

    // 盒身
    this.parent.roundRect(x, y, boxW, boxH, r, '#c4a35a');

    // 十字丝带
    ctx.fillStyle = '#d4af37';
    const ribbonW = Math.max(2, size * 0.12);
    ctx.fillRect(x + boxW / 2 - ribbonW / 2, y, ribbonW, boxH);
    ctx.fillRect(x, y + boxH / 2 - ribbonW / 2, boxW, ribbonW);

    // 蝴蝶结
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
