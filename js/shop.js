// ===== 商店页面渲染 =====
class ShopRenderer {
  constructor(renderer) {
    this.parent = renderer;
  }

  draw(ctx, game, W, H, s) {
    const gold = '#c4a35a';
    const cream = '#f5f0e6';

    // 背景图
    if (this.parent.bgImage && this.parent.bgLoaded) {
      ctx.drawImage(this.parent.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }

    // 左上角 top_icon
    const top = (this.parent.safeTop || 0) + 20;
    const iconSize = 40 * s;
    const iconX = 15 * s;
    const iconY = top - iconSize - 5;
    if (this.parent.topIcon && this.parent.topIconLoaded) {
      ctx.drawImage(this.parent.topIcon, iconX, iconY, iconSize, iconSize);
    }
    this.parent.topIconRect = { x: iconX, y: iconY, w: iconSize, h: iconSize };

    // 生成商品
    if (!game.shopItems) {
      game._generateShopItems();
    }

    // 标题：商店 + coin.png + 金币数量（居中）
    const safeTop = this.parent.safeTop || 0;
    const topBarTop = safeTop + 20;
    const titleText = '商店';
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    const titleW = ctx.measureText(titleText).width;
    const coinSize = 20 * s;
    ctx.font = `bold ${Math.floor(16 * s)}px Georgia, serif`;
    const goldW = ctx.measureText(String(game.gold)).width;
    const totalW = titleW + 20 * s + coinSize + 6 * s + goldW;
    const startCX = W / 2 - totalW / 2;
    const titleY = topBarTop - 12 * s;

    // 文字"商店"
    ctx.save();
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, startCX, titleY);
    ctx.restore();

    // coin.png 图标
    const coinX = startCX + titleW + 20 * s;
    if (this.parent.coinIcon && this.parent.coinIconLoaded) {
      ctx.drawImage(this.parent.coinIcon, coinX, titleY - coinSize / 2, coinSize, coinSize);
    }

    // 金币数量
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(game.gold), coinX + coinSize + 6 * s, titleY);
    ctx.restore();

    // 三个模块配置
    const modules = [
      {
        title: '女巫牌',
        subtitle: '神秘的女巫牌，带来强大的魔法加成。',
        color: '#4a3065',
        y: 95 * s + 30 * s,
      },
      {
        title: '水晶球牌',
        subtitle: '水晶球的力量，洞察未来的线索。',
        color: '#1e3a5f',
        y: 95 * s + 155 * s + 30 * s,
      },
      {
        title: '魔法药水牌',
        subtitle: '神奇的药水，助你一臂之力。',
        color: '#1e4a3a',
        y: 95 * s + 310 * s + 30 * s,
      },
    ];

    const modPad = 12 * s;
    const modW = W - 30 * s;
    const modX = 15 * s;
    const cardW = (modW - modPad * 2 - 16 * s) / 3;
    const cardH = 105 * s;

    this.shopItemRects = [];

    modules.forEach((mod, modIdx) => {
      const modY = mod.y;

      // 模块暖白背景卡片
      this.parent.roundRect(modX, modY, modW, 145 * s, 10 * s, cream, gold);

      // 标题栏装饰
      const titleY = modY + 18 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px Georgia, serif`;
      ctx.fillStyle = '#2a1f15';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`→  ${mod.title}  ←`, W / 2, titleY);
      ctx.restore();

      // 副标题
      ctx.save();
      ctx.font = `${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#8a7b6b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mod.subtitle, W / 2, titleY + 16 * s);
      ctx.restore();

      // 3 张道具牌
      for (let i = 0; i < 3; i++) {
        const itemIdx = modIdx * 3 + i;
        const item = game.shopItems[itemIdx];
        if (!item) continue;

        const cx = modX + modPad + i * (cardW + 8 * s);
        const cy = modY + 42 * s;

        // 卡牌深色背景
        this.parent.roundRect(cx, cy, cardW, cardH, 8 * s, mod.color);

        // 左侧装饰圆（模拟图标区域）
        ctx.beginPath();
        ctx.arc(cx + 18 * s, cy + cardH / 2 - 6 * s, 14 * s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1 * s;
        ctx.stroke();

        // 名称
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, cx + 38 * s, cy + 22 * s);

        // 描述
        ctx.font = `${Math.floor(9 * s)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText(item.desc, cx + 38 * s, cy + 42 * s);

        // 价格按钮（暖米色）
        const priceW = cardW - 16 * s;
        const priceH = 24 * s;
        const priceX = cx + 8 * s;
        const priceY = cy + cardH - priceH - 10 * s;
        this.parent.roundRect(priceX, priceY, priceW, priceH, 6 * s, '#e8dcc8');
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`$${item.cost}`, priceX + priceW / 2, priceY + priceH / 2);

        this.shopItemRects.push({ x: cx, y: cy, w: cardW, h: cardH, index: itemIdx });
      }
    });

    // 下一关按钮
    const btnW = 130 * s;
    const btnH = 42 * s;
    const btnX = (W - btnW) / 2;
    const btnY = H - 55 * s;
    this.parent.roundRect(btnX, btnY, btnW, btnH, 10 * s, '#c0392b');
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('下一关', W / 2, btnY + btnH / 2);
    this.nextRoundBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }
}

module.exports = { ShopRenderer };
