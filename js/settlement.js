// ===== 金币结算弹窗渲染 =====
class SettlementRenderer {
  constructor(renderer) {
    this.parent = renderer;
  }

  draw(ctx, game, W, H, s) {
    const settlement = game.settlementData;
    if (!settlement) return;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    // 弹窗尺寸
    const pw = 300 * s;
    const ph = 340 * s;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    // 背景 + 边框
    this.parent.roundRect(px, py, pw, ph, r, '#faf6ee', gold);

    // 标题（带金币图标）
    const titleText = `第 ${settlement.round} 关结算`;
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    const titleW = ctx.measureText(titleText).width;
    const coinSize = 22 * s;
    const titleTotalW = titleW + coinSize + 6 * s;
    const titleStartX = W / 2 - titleTotalW / 2;
    const titleY = py + 35 * s;
    // 金币图标
    if (this.parent.coinIcon && this.parent.coinIconLoaded) {
      ctx.drawImage(this.parent.coinIcon, titleStartX, titleY - coinSize / 2, coinSize, coinSize);
    }
    // 标题文字
    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, titleStartX + coinSize + 6 * s, titleY);
    ctx.restore();

    // 分隔线
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, py + 55 * s);
    ctx.lineTo(px + pw - 30 * s, py + 55 * s);
    ctx.stroke();

    // 金币明细
    const lineY = py + 85 * s;
    const lineH = 36 * s;
    const items = [
      { label: '基础金币', value: `+${settlement.baseGold}` },
      { label: '剩余出牌次数 ×1', value: `+${settlement.extraHands}` },
      { label: '剩余弃牌次数 ×1', value: `+${settlement.extraDiscards}` },
    ];

    items.forEach((item, i) => {
      const y = lineY + i * lineH;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, px + 35 * s, y);

      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(item.value, px + pw - 35 * s, y);
    });

    // 总分隔线
    const totalY = lineY + items.length * lineH + 10 * s;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, totalY);
    ctx.lineTo(px + pw - 30 * s, totalY);
    ctx.stroke();

    // 总计
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('总计', px + 35 * s, totalY + 25 * s);

    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'right';
    ctx.fillText(`+${settlement.totalGold}`, px + pw - 35 * s, totalY + 25 * s);

    // 领取按钮
    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + ph - btnH - 28 * s;
    this.parent.roundRect(btnX, btnY, btnW, btnH, 8 * s, '#c4a35a');
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('领取', W / 2, btnY + btnH / 2);

    // 存储点击区域
    this.claimBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }
}

module.exports = { SettlementRenderer };
