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

module.exports = { SettlementRenderer };
