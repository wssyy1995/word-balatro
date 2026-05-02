// 自动换行绘制文本，返回占用的总高度
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  const lines = [];
  for (let i = 0; i < text.length; i++) {
    const testLine = line + text[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      lines.push(line);
      line = text[i];
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, x, y + i * lineHeight);
  });
  return lines.length * lineHeight;
}

// ===== 商店页面渲染 =====
const SHOP_POOL = {
  witch: [
    {name:'A之强化', type:'witch', trigger:'letter_a', value:2, cost:5, desc:'字母A分数×2'},
    {name:'E之强化', type:'witch', trigger:'letter_e', value:2, cost:5, desc:'字母E分数×2'},
    {name:'元音强化', type:'witch', trigger:'has_vowel', value:2, cost:6, desc:'含元音时分数×2'}
    // {name:'五字母强化', type:'witch', trigger:'length_5', value:2, cost:7, desc:'5+字母单词×2'},
    // {name:'六字母强化', type:'witch', trigger:'length_6', value:3, cost:8, desc:'6+字母单词×3'},
    // {name:'XYZ强化', type:'witch', trigger:'has_face', value:3, cost:6, desc:'含J/Q/Z时×3'}
  ],
  crystal: [
    {name:'额外弃牌', type:'crystal', effect:'extra_discard', value:1, cost:3, desc:'下一回合弃牌次数+1'},
    {name:'额外出牌', type:'crystal', effect:'extra_hands', value:1, cost:5, desc:'下一回合出牌次数+1'},
    {name:'金币祝福', type:'crystal', effect:'bonus_gold', value:3, cost:3, desc:'下一回合开始时获得3金币'}
    // ,
    // {name:'目标减免', type:'crystal', effect:'reduce_target', value:0.8, cost:5, desc:'下一回合目标分数×0.8'}
  ],
  potion: [
    {name:'字母强化', type:'potion', effect:'upgrade_letter', cost:4, desc:'选择一张字母牌，分数翻倍'},
    {name:'王牌强化', type:'potion', effect:'upgrade_face', cost:5, desc:'选择XYZ任意一张，分数×3'},
    {name:'通用强化', type:'potion', effect:'upgrade_any', cost:6, desc:'选择任意牌，分数翻倍'}
  ]
};

function generateShopItems() {
  const items = [];
  ['witch', 'crystal', 'potion'].forEach(type => {
    const pool = SHOP_POOL[type];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    items.push(shuffled[0], shuffled[1]);
  });
  return items;
}

function buyItem(game, idx) {
  const item = game.shopItems[idx];
  if (!item || game.gold < item.cost) return false;
  game.gold -= item.cost;

  if (game.audioManager) game.audioManager.play('buy');

  if (item.type === 'witch') {
    if (game.jokers.length >= 5) return false;
    game.jokers.push({...item});
    game.shopItems[idx] = null;
    return true;
  } else if (item.type === 'crystal') {
    game.crystalEffects.push({...item});
    game.shopItems[idx] = null;
    if (game.storageManager) game.storageManager.saveProgress(game);
    return true;
  } else if (item.type === 'potion') {
    game.potionMode = {...item};
    game.shopItems[idx] = null;
    game.state = 'potion';
    if (game.storageManager) game.storageManager.saveProgress(game);
    return true;
  }
  return false;
}

function upgradeCard(game, cardId) {
  if (!game.potionMode) return false;
  const card = game.hand.find(c => c && c.id === cardId);
  if (!card) return false;

  const effect = game.potionMode.effect;
  let mult = 2;
  if (effect === 'upgrade_face') {
    mult = card.isFace ? 3 : 2;
  }

  card.upgraded = true;
  const newMult = (card.upgradeMult || 1) * mult;
  card.upgradeMult = newMult;
  card.score = Math.floor(card.baseScore * newMult);

  if (game.audioManager) game.audioManager.play('upgrade');

  const existing = letterUpgrades.get(card.letter);
  const totalMult = existing ? existing.mult * mult : mult;
  letterUpgrades.set(card.letter, { mult: totalMult });

  game.potionMode = null;
  game.state = 'shop';
  if (game.storageManager) game.storageManager.saveProgress(game);
  return true;
}

function applyCrystalEffects(game) {
  game.crystalEffects.forEach(eff => {
    if (eff.effect === 'extra_discard') game.extraDiscards += eff.value;
    if (eff.effect === 'extra_safety') game.extraSafety += eff.value;
    if (eff.effect === 'extra_hands') game.extraHands += eff.value;
    if (eff.effect === 'bonus_gold') game.gold += eff.value;
    if (eff.effect === 'reduce_target') game.target = Math.floor(game.target * eff.value);
  });
  game.crystalEffects = [];
}

class ShopRenderer {
  constructor(renderer) {
    this.parent = renderer;
  }

  draw(ctx, game, W, H, s) {
    const gold = '#c4a35a';
    const cream = '#f5f0e6';

    // 背景已由 renderer.js 统一绘制，这里只画商店内容
    // 生成商品
    if (!game.shopItems) {
      game.shopItems = generateShopItems();
    }

    // 副标题：商店（在顶部标题下方 20px）
    const top = (this.parent.safeTop || 0) + 20;
    const subtitleY = top + 28 * s;
    const hudBottom = top + 56 * s;

    // 商店标题背景图
    if (this.parent.shopLabel && this.parent.shopLabelLoaded) {
      const labelImg = this.parent.shopLabel;
      const labelW = 160 * s;
      const labelH = labelW * ((labelImg.height || 61) / (labelImg.width || 200));
      ctx.drawImage(labelImg, (W - labelW) / 2, subtitleY - labelH / 2, labelW, labelH);
    }

    ctx.save();
    ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('商店', W / 2, subtitleY);
    ctx.restore();

    const modPad = 12 * s;
    const modW = W - 30 * s;
    const modX = 15 * s;
    const cardW = (modW - modPad * 2 - 16 * s) / 2;
    const cardH = 125 * s;

    // 模块内部布局（动态计算模块高度）
    const cardOffsetY = 38 * s;        // 卡牌距模块顶部的偏移（标题↔描述+2px，描述↔卡牌+2px）
    const modBottomPad = 10 * s;       // 模块底部到卡牌底部的 padding
    const modHeight = cardOffsetY + cardH + modBottomPad;
    const modGap = 11 * s;             // 模块之间间距+5px

    // 三个模块配置（基于 HUD 底部动态计算）
    const modStartY = hudBottom + 40 * s;
    const modules = [
      {
        title: '女巫牌',
        subtitle: '神秘的女巫牌，带来强大的魔法加成。',
        color: '#4a3065',
        y: modStartY,
      },
      {
        title: '水晶球牌',
        subtitle: '水晶球的力量，洞察未来的线索。',
        color: '#1e3a5f',
        y: modStartY + modHeight + modGap,
      },
      {
        title: '魔法药水牌',
        subtitle: '神奇的药水，助你一臂之力。',
        color: '#1e4a3a',
        y: modStartY + 2 * (modHeight + modGap),
      },
    ];

    this.shopItemRects = [];

    modules.forEach((mod, modIdx) => {
      const modY = mod.y;

      // 模块暖白背景卡片（高度动态：卡牌起始 + 卡牌高 + 底部padding）
      this.parent.roundRect(modX, modY, modW, modHeight, 10 * s, cream, gold);

      // 标题栏装饰
      const titleY = modY + 14 * s;
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
      ctx.fillText(mod.subtitle, W / 2, titleY + 14 * s);
      ctx.restore();

      // 2 张道具牌
      for (let i = 0; i < 2; i++) {
        const itemIdx = modIdx * 2 + i;
        const item = game.shopItems[itemIdx];
        if (!item) continue;

        const cx = modX + modPad + i * (cardW + 16 * s);
        const cy = modY + cardOffsetY;

        // 卡牌深色背景
        this.parent.roundRect(cx, cy, cardW, cardH, 8 * s, mod.color);

        const leftW = cardW / 2;

        // 左侧道具图标（占据左半边，保持原始比例）
        const iconName = item.trigger || item.effect;
        const iconData = this.parent.shopCardImages[iconName];
        if (iconData && iconData.loaded && iconData.img) {
          const imgW = iconData.img.width || 200;
          const imgH = iconData.img.height || 300;
          const aspect = imgW / imgH;
          const maxW = leftW - 10 * s;
          const maxH = cardH - 24 * s - 16 * s; // 去掉按钮区域和上下边距
          let drawW, drawH;
          if (maxW / maxH > aspect) {
            drawH = maxH;
            drawW = drawH * aspect;
          } else {
            drawW = maxW;
            drawH = drawW / aspect;
          }
          const imgX = cx + 5 * s + (maxW - drawW) / 2;
          const imgY = cy + 8 * s + (maxH - drawH) / 2;
          ctx.drawImage(iconData.img, imgX, imgY, drawW, drawH);
        } else {
          // fallback: 装饰圆
          const fallbackSize = leftW - 10 * s;
          const fbX = cx + 5 * s;
          const fbY = cy + 10 * s;
          ctx.beginPath();
          ctx.arc(fbX + fallbackSize / 2, fbY + fallbackSize / 2, fallbackSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1 * s;
          ctx.stroke();
        }

        // 右半边中心（再左移 3px，累计左移 6px）
        const rightCX = cx + leftW + leftW / 2 - 6 * s;

        // 根据模块类型设置文字颜色
        let nameColor, descColor;
        if (mod.color === '#4a3065' || mod.color === '#4a306d') {
          nameColor = '#d4b8f0';
          descColor = 'rgba(212,184,240,0.75)';
        } else if (mod.color === '#1e3a5f') {
          nameColor = '#a8c8e8';
          descColor = 'rgba(168,200,232,0.75)';
        } else {
          nameColor = '#a8e8c0';
          descColor = 'rgba(168,232,192,0.75)';
        }

        // 名称（右半边居中）
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = nameColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, rightCX, cy + 24 * s);

        // 描述（标题下方，自动换行）
        ctx.font = `${Math.floor(9 * s)}px sans-serif`;
        ctx.fillStyle = descColor;
        ctx.textAlign = 'center';
        const descMaxW = leftW - 12 * s;
        drawWrappedText(ctx, item.desc, rightCX, cy + 42 * s, descMaxW, 12 * s);

        // 价格按钮（暖米色，宽度减 2px）
        const priceW = cardW - 16 * s - 2;
        const priceH = 24 * s;
        const priceX = cx + (cardW - priceW) / 2;
        const priceY = cy + cardH - priceH - 6 * s;
        this.parent.roundRect(priceX, priceY, priceW, priceH, 6 * s, '#e8dcc8');

        // coin 图标 + 价格
        const coinSize = 16 * s;
        const priceText = String(item.cost);
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        const textW = ctx.measureText(priceText).width;
        const contentW = coinSize + 4 * s + textW;
        const startX = priceX + (priceW - contentW) / 2;
        const midY = priceY + priceH / 2;
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, startX + coinSize + 4 * s, midY);

        this.shopItemRects.push({ x: cx, y: cy, w: cardW, h: cardH, index: itemIdx });
      }
    });

    // 下一关按钮
    const btnW = 130 * s;
    const btnH = 42 * s;
    const btnX = (W - btnW) / 2;
    const btnY = H - 48 * s;
    this.parent.roundRect(btnX, btnY, btnW, btnH, 10 * s, '#c0392b');
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('下一关', W / 2, btnY + btnH / 2);
    this.nextRoundBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }
}

class ConfirmBuyRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastItemIndex = null;
  }

  draw(ctx, game, W, H, s) {
    const itemIndex = game.confirmBuyItem;
    if (itemIndex === undefined || itemIndex === null) return;

    const item = game.shopItems[itemIndex];
    if (!item) {
      // 商品已不存在，直接关闭
      game.confirmBuyItem = null;
      game._closingConfirmBuy = false;
      return;
    }

    const isClosing = game._closingConfirmBuy;
    const closeElapsed = isClosing ? Date.now() - (game._closeConfirmBuyStartTime || Date.now()) : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / 300, 1) : 0;
    if (isClosing && closeProgress >= 1) {
      game.confirmBuyItem = null;
      game._closingConfirmBuy = false;
      return;
    }

    if (!isClosing && this.lastItemIndex !== itemIndex) {
      this.animStartTime = Date.now();
      this.lastItemIndex = itemIndex;
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    const closeSlideY = isClosing ? -closeProgress * 40 * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;
    ctx.save();
    ctx.globalAlpha = closeAlpha;

    // 遮罩
    const overlayAlpha = isClosing ? 0.65 * (1 - closeProgress) : Math.min(elapsed / 200, 0.65);
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    ctx.fillRect(0, 0, W, H);

    // 弹窗尺寸
    const pw = 280 * s;
    const ph = 340 * s;
    const px = (W - pw) / 2;
    const basePy = (H - ph) / 2;
    const r = 14 * s;
    const gold = '#c4a35a';

    const enterProgress = Math.min(elapsed / 350, 1);
    const enterEase = easeOutBack(enterProgress);
    const py = basePy + (1 - enterEase) * 25 * s + closeSlideY;

    // 背景 + 边框
    this.parent.roundRect(px, py, pw, ph, r, '#faf6ee', gold);

    // 内容统一淡入（一起出现，不逐行）
    const contentDelay = 80;
    const contentT = Math.max(0, Math.min((elapsed - contentDelay) / 250, 1));
    const contentEase = contentT * (2 - contentT);
    const contentAlpha = contentEase;
    const contentYShift = (1 - contentEase) * 10 * s;

    const iconName = item.trigger || item.effect;
    const iconData = this.parent.shopCardImages[iconName];

    // 标题
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('确认购买', W / 2, py + 35 * s + contentYShift);
    ctx.restore();

    // 分隔线
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const lineY = py + 55 * s + contentYShift;
    ctx.moveTo(px + 30 * s, lineY);
    ctx.lineTo(px + pw - 30 * s, lineY);
    ctx.stroke();
    ctx.restore();

    // 卡牌图片（居中，变大）
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    let imgBottom = py + 70 * s + contentYShift;
    if (iconData && iconData.loaded && iconData.img) {
      const imgW = iconData.img.width || 200;
      const imgH = iconData.img.height || 300;
      const aspect = imgW / imgH;
      const maxImgW = pw * 0.65;
      const maxImgH = 130 * s;
      let drawW, drawH;
      if (maxImgW / maxImgH > aspect) {
        drawH = maxImgH;
        drawW = drawH * aspect;
      } else {
        drawW = maxImgW;
        drawH = drawW / aspect;
      }
      const imgX = px + (pw - drawW) / 2;
      const imgY = py + 70 * s + contentYShift;
      imgBottom = imgY + drawH;
      ctx.drawImage(iconData.img, imgX, imgY, drawW, drawH);
    }
    ctx.restore();

    // 卡牌名称（距离图片底部 +20px）
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, W / 2, imgBottom + 20 * s + contentYShift);
    ctx.restore();

    // 卡牌描述
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.desc, W / 2, imgBottom + 45 * s + contentYShift);
    ctx.restore();

    // 购买按钮（按下时偏移 3px）
    const btnW = 160 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const isPressed = game._confirmBuyPressed && (Date.now() - (game._confirmBuyPressTime || 0) < 300);
    const pressOffsetY = isPressed ? 3 * s : 0;
    const btnY = py + ph - btnH - 28 * s + contentYShift + pressOffsetY;
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    this.parent.roundRect(btnX, btnY, btnW, btnH, 8 * s, '#c4a35a');

    // coin 图标 + 金额
    const coinSize = 20 * s;
    const priceText = String(item.cost);
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    const textW = ctx.measureText(priceText).width;
    const contentW = coinSize + 6 * s + textW;
    const startX = btnX + (btnW - contentW) / 2;
    const midY = btnY + btnH / 2;
    if (this.parent.coinIcon && this.parent.coinIconLoaded) {
      ctx.drawImage(this.parent.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, startX + coinSize + 6 * s, midY);
    ctx.restore();

    ctx.restore();

    // 存储点击区域（动画完成后固定位置，含按下偏移）
    const finalBtnY = py + ph - btnH - 28 * s + pressOffsetY;
    this.confirmBtnRect = { x: btnX, y: finalBtnY, w: btnW, h: btnH };
  }
}

module.exports = { ShopRenderer, ConfirmBuyRenderer, SHOP_POOL, generateShopItems, buyItem, upgradeCard, applyCrystalEffects };
