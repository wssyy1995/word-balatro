const { LETTER_SCORE, letterUpgrades } = require('./data');
const { getSkillForLevel, getRewardName } = require('./witch_skills');

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
    {name:'A之强化', type:'witch', scope:'per_card', trigger:'letter_a', value:2, cost:5, desc:'字母A分数×2'},
    {name:'E之强化', type:'witch', scope:'per_card', trigger:'letter_e', value:2, cost:5, desc:'字母E分数×2'},
    {name:'元音强化', type:'witch', scope:'per_card', trigger:'has_vowel', value:2, cost:6, desc:'含元音时分数×2'},
    {name:'三字母强化', type:'witch', scope:'whole_word', trigger:'length_3', value:1.2, cost:4, desc:'单词字母>=3时，倍率×1.2'},
    {name:'五字母强化', type:'witch', scope:'whole_word', trigger:'length_5', value:2, cost:7, desc:'单词字母>=5时，倍率×2'},
    {name:'六字母强化', type:'witch', scope:'whole_word', trigger:'length_6', value:3, cost:8, desc:'单词字母>=6时，倍率×3'},
    {name:'XYZ强化', type:'witch', scope:'whole_word', trigger:'has_face', value:3, cost:6, desc:'单词字母含X/Y/Z时，倍率×3'}
  ],
  crystal: [
    {name:'额外弃牌', type:'crystal', effect:'extra_discard', value:1, cost:3, desc:'下一回合弃牌次数+1'},
    {name:'额外出牌', type:'crystal', effect:'extra_hands', value:1, cost:5, desc:'下一回合出牌次数+1'},
    {name:'金币祝福', type:'crystal', effect:'bonus_gold', value:3, cost:3, desc:'下一回合开始时获得3金币'}
    // ,
    // {name:'目标减免', type:'crystal', effect:'reduce_target', value:0.8, cost:5, desc:'下一回合目标分数×0.8'}
  ],
  potion: [
    {name:'字母强化', type:'potion', effect:'upgrade_letter', value:2, cost:4, desc:'选择一张字母牌，分数翻倍'},
    {name:'王牌强化', type:'potion', effect:'upgrade_face', value:3, cost:5, desc:'选择XYZ任意一张，分数×3'},
    {name:'字母置换', type:'potion', effect:'change_letter',scope:'game', value:2, cost:6, desc:'游戏中,可选择一张字母牌切换字母'}
  ]
};

function _shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateShopItems(game) {
  const items = [];
  const equippedWitchNames = new Set((game.jokers || []).map(j => j.name));

  // 女巫牌：过滤已装备的，确保有2张可展示
  let witchPool = SHOP_POOL.witch.filter(w => !equippedWitchNames.has(w.name));
  if (witchPool.length < 2) {
    // 过滤后不足2张，从全部池子补充（避免空位）
    witchPool = SHOP_POOL.witch;
  }
  const witchShuffled = _shuffle(witchPool);
  items.push(witchShuffled[0], witchShuffled[1]);

  // 水晶球和药水（不过滤）
  ['crystal', 'potion'].forEach(type => {
    const pool = SHOP_POOL[type];
    const shuffled = _shuffle(pool);
    items.push(shuffled[0], shuffled[1]);
  });

  return items;
}

function refreshModule(game, modIdx) {
  const typeMap = ['witch', 'crystal', 'potion'];
  const type = typeMap[modIdx];
  let pool;

  if (type === 'witch') {
    const equippedWitchNames = new Set((game.jokers || []).map(j => j.name));
    pool = SHOP_POOL.witch.filter(w => !equippedWitchNames.has(w.name));
    if (pool.length < 2) pool = SHOP_POOL.witch;
  } else {
    pool = SHOP_POOL[type];
  }

  const shuffled = _shuffle(pool);
  const startIdx = modIdx * 2;
  game.shopItems[startIdx] = shuffled[0];
  game.shopItems[startIdx + 1] = shuffled[1];

  if (game.audioManager) game.audioManager.play('select');
  if (game.storageManager) game.storageManager.saveProgress(game);
}

function buyItem(game, idx) {
  const item = game.shopItems[idx];
  if (!item || game.gold < item.cost) return false;

  // 上限检查
  if (item.type === 'witch' && (game.jokers || []).length >= 4) return false;
  if (item.type === 'potion' && (game.potions || []).length >= 2) return false;

  game.gold -= item.cost;

  if (game.audioManager) game.audioManager.play('buy');

  if (item.type === 'witch') {
    // 女巫牌：购买后不在此加入 jokers，成功弹窗点击"装备"后才加入
    game.shopItems[idx] = null;
    if (game.storageManager) game.storageManager.saveProgress(game);
    return true;
  } else if (item.type === 'crystal') {
    game.crystalEffects.push({...item});
    game.shopItems[idx] = null;
    if (game.storageManager) game.storageManager.saveProgress(game);
    return true;
  } else if (item.type === 'potion') {
    // 药水牌：购买后不在此加入 potions，成功弹窗点击"暂存"后才加入
    game.shopItems[idx] = null;
    if (game.storageManager) game.storageManager.saveProgress(game);
    return true;
  }
  return false;
}

function upgradeLetter(game, letter) {
  if (!game.potionMode) return false;

  const potion = game.potionMode;
  const mult = potion.value || 2;

  // 更新字母升级乘数（乘法叠加）
  const existing = letterUpgrades.get(letter);
  const totalMult = existing ? existing.mult * mult : mult;
  letterUpgrades.set(letter, { mult: totalMult });

  // 同步更新当前手牌中该字母的所有卡牌分数
  const baseScore = LETTER_SCORE[letter];
  const newScore = Math.floor(baseScore * totalMult);
  game.hand.forEach(card => {
    if (card && card.letter === letter) {
      card.baseScore = baseScore;
      card.score = newScore;
      card.upgraded = true;
      card.upgradeMult = totalMult;
    }
  });

  if (game.audioManager) game.audioManager.play('upgrade');

  // 从暂存列表中移除已使用的药水
  if (game.potions && game.potionMode) {
    const usedIdx = game.potions.findIndex(p => p.effect === game.potionMode.effect);
    if (usedIdx >= 0) game.potions.splice(usedIdx, 1);
  }
  game.potionMode = null;
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
    this.shopSelectedOwned = null; // { type: 'jokers'|'potions', index: number } 或 null
    this.shopSellBtnRect = null;
    this.shopOwnedPropRects = [];
    this.sellBtnAnimStart = null;
    this.lastSelectedOwned = null;
    this.shopRefreshRects = [];
    this.shopPriceBtnRects = [];
    this.priceBtnPressed = null; // { index, pressTime }
    this.challengeBtnPressed = false;
    this.challengeBtnPressTime = 0;
  }

  _easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  draw(ctx, game, W, H, s) {
    const gold = '#c4a35a';
    const cream = '#f5f0e6';

    // 背景已由 renderer.js 统一绘制，这里只画商店内容
    // 生成商品
    if (!game.shopItems) {
      game.shopItems = generateShopItems(game);
    }

    // 售出按钮出现动画触发（选中变化时重置）
    const currentSelected = this.shopSelectedOwned;
    if (currentSelected && (!this.lastSelectedOwned ||
        this.lastSelectedOwned.type !== currentSelected.type ||
        this.lastSelectedOwned.index !== currentSelected.index)) {
      this.sellBtnAnimStart = Date.now();
    }
    this.lastSelectedOwned = currentSelected ? {...currentSelected} : null;

    const top = (this.parent.safeTop || 0) + 20;

    // === 已购买道具卡牌栏（6格：左4女巫 + 右2药水，样式复用游戏页）===
    const ownedY = top + 16 * s;
    const ownedH = 92 * s;
    const ownedW = W - 30 * s;
    const ownedX = 15 * s;

    this.parent.roundRect(ownedX, ownedY, ownedW, ownedH, 10 * s, '#f0e0c8', '#c4a35a');

    // 6格布局（参数与游戏页 drawPlaying 完全一致）
    const oPadX = 10 * s;
    const oDividerW = 1.5 * s;
    const oGap = 6 * s;
    const oSlotTop = 10 * s;

    const oSlotW = (ownedW - oPadX * 2 - 5 * oGap - oDividerW) / 6;
    const oSlotH = ownedH - oSlotTop - 10 * s;

    const oSlotY = ownedY + oSlotTop;
    const oLeftStartX = ownedX + oPadX;
    const oDividerX = oLeftStartX + 4 * oSlotW + 3.5 * oGap + oDividerW / 2;
    const oRightStartX = oDividerX + oDividerW / 2 + oGap / 2;

    // 竖分割线（金色实线 + 菱形，参考 HUD 分隔线）
    ctx.beginPath();
    ctx.moveTo(oDividerX, oSlotY + 2 * s);
    ctx.lineTo(oDividerX, oSlotY + oSlotH - 2 * s);
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();
    // 菱形装饰
    ctx.save();
    ctx.translate(oDividerX, oSlotY + oSlotH / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c4a35a';
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();

    const oJokers = game.jokers || [];
    const oPotions = game.potions || [];
    this.shopOwnedPropRects = [];
    this.shopSellBtnRect = null;

    // 左区4格：女巫牌
    // 延迟移除：在循环开始前统一 splice，避免循环中数组变动导致闪烁
    if (game._sellingProp && game._sellingProp.type === 'jokers' && game._sellingProp._shouldRemove) {
      game.jokers.splice(game._sellingProp.index, 1);
      game._sellingProp = null;
    }
    for (let i = 0; i < 4; i++) {
      const sx = oLeftStartX + i * (oSlotW + oGap);
      const joker = oJokers[i];

      // 售出消失动画
      const isSelling = game._sellingProp && game._sellingProp.type === 'jokers' && game._sellingProp.index === i;

      // 补位滑动偏移（右侧卡牌依次左移，带果冻感 easeOutBack）
      let slideOffsetX = 0;
      if (game._sellingProp && game._sellingProp.type === 'jokers' && game._sellingProp.index < i && joker) {
        const sellElapsed = Date.now() - game._sellingProp.startTime;
        const shiftStart = 200;
        const shiftDuration = 500;
        const stagger = (i - game._sellingProp.index - 1) * 80;
        const tRaw = (sellElapsed - shiftStart - stagger) / shiftDuration;
        if (tRaw > 0) {
          const t = Math.min(tRaw, 1);
          const c1 = 1.70158;
          const c3 = c1 + 1;
          const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          slideOffsetX = -(oSlotW + oGap) * ease;
        }
      }

      if (isSelling && joker) {
        const sellElapsed = Date.now() - game._sellingProp.startTime;
        const flyDuration = 700;
        const totalDuration = 900;
        const sellProgress = Math.min(sellElapsed / flyDuration, 1);

        if (sellElapsed >= totalDuration) {
          game._sellingProp._shouldRemove = true;
          continue;
        }

        if (sellProgress >= 1) continue;

        ctx.save();
        // 女巫牌：从屏幕左侧飞出（easeOutCubic，x:-400, y:30, rotation:-20）
        const eased = 1 - Math.pow(1 - sellProgress, 3);
        const flyX = -eased * 400 * s;
        const flyY = eased * 30 * s;
        const rotation = -eased * 20;
        ctx.translate(sx + oSlotW / 2, oSlotY + oSlotH / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-(sx + oSlotW / 2), -(oSlotY + oSlotH / 2));
        ctx.translate(flyX, flyY);
        this.parent._drawPropCard(ctx, joker, sx, oSlotY, oSlotW, oSlotH, s);
        ctx.restore();
      } else if (joker) {
        this.parent._drawPropCard(ctx, joker, sx + slideOffsetX, oSlotY, oSlotW, oSlotH, s);
        this.shopOwnedPropRects.push({ x: sx + slideOffsetX, y: oSlotY, w: oSlotW, h: oSlotH, index: i, array: 'jokers' });
      } else {
        this.parent._drawEmptySlot(ctx, sx + slideOffsetX, oSlotY, oSlotW, oSlotH, s, 'witch');
      }

      // 售出按钮（选中时，带回弹出现动画）
      if (this.shopSelectedOwned && this.shopSelectedOwned.type === 'jokers' && this.shopSelectedOwned.index === i && joker && !isSelling) {
        const sellBtnH = 16 * s;
        const sellBtnY = oSlotY + oSlotH + 2 * s;

        // 出现动画（easeOutBack：从卡牌底部向下弹出）
        let appearScale = 1;
        let appearOffsetY = 0;
        if (this.sellBtnAnimStart) {
          const ae = Date.now() - this.sellBtnAnimStart;
          const ap = Math.min(ae / 200, 1);
          const ease = this._easeOutBack(ap);
          appearScale = ease;
          appearOffsetY = -(1 - ease) * 8 * s;
        }

        const finalW = oSlotW * appearScale;
        const finalH = sellBtnH * appearScale;
        const finalX = sx + (oSlotW - finalW) / 2;
        const finalY = sellBtnY + appearOffsetY + (sellBtnH - finalH) / 2;

        ctx.save();
        this.parent.roundRect(finalX, finalY, finalW, finalH, 3 * s * appearScale, '#c0392b');
        ctx.font = `bold ${Math.floor(8 * s * Math.max(appearScale, 0.5))}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const coinSize = 10 * s * appearScale;
        const sellText = String(joker.cost);
        const textW = ctx.measureText(sellText).width;
        const contentW = coinSize + 2 * s + textW;
        const startX = finalX + (finalW - contentW) / 2;
        const midY = finalY + finalH / 2;
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillText(sellText, startX + coinSize + 2 * s + textW / 2, midY);
        ctx.restore();

        this.shopSellBtnRect = { x: sx, y: sellBtnY, w: oSlotW, h: sellBtnH, index: i, array: 'jokers' };
      }
    }

    // 右区2格：药水牌
    // 延迟移除：在循环开始前统一 splice，避免循环中数组变动导致闪烁
    if (game._sellingProp && game._sellingProp.type === 'potions' && game._sellingProp._shouldRemove) {
      game.potions.splice(game._sellingProp.index, 1);
      game._sellingProp = null;
    }
    for (let i = 0; i < 2; i++) {
      const sx = oRightStartX + i * (oSlotW + oGap);
      const potion = oPotions[i];

      // 售出消失动画
      const isSelling = game._sellingProp && game._sellingProp.type === 'potions' && game._sellingProp.index === i;

      // 补位滑动偏移（右侧卡牌依次左移，带果冻感 easeOutBack）
      let slideOffsetX = 0;
      if (game._sellingProp && game._sellingProp.type === 'potions' && game._sellingProp.index < i && potion) {
        const sellElapsed = Date.now() - game._sellingProp.startTime;
        const shiftStart = 200;
        const shiftDuration = 500;
        const stagger = (i - game._sellingProp.index - 1) * 80;
        const tRaw = (sellElapsed - shiftStart - stagger) / shiftDuration;
        if (tRaw > 0) {
          const t = Math.min(tRaw, 1);
          const c1 = 1.70158;
          const c3 = c1 + 1;
          const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          slideOffsetX = -(oSlotW + oGap) * ease;
        }
      }

      if (isSelling && potion) {
        const sellElapsed = Date.now() - game._sellingProp.startTime;
        const flyDuration = 700;
        const totalDuration = 900;
        const sellProgress = Math.min(sellElapsed / flyDuration, 1);

        if (sellElapsed >= totalDuration) {
          game._sellingProp._shouldRemove = true;
          continue;
        }

        if (sellProgress >= 1) continue;

        ctx.save();
        // 药水牌：从屏幕右侧飞出（easeOutCubic，x:400, y:30, rotation:20）
        const eased = 1 - Math.pow(1 - sellProgress, 3);
        const flyX = eased * 400 * s;
        const flyY = eased * 30 * s;
        const rotation = eased * 20;
        ctx.translate(sx + oSlotW / 2, oSlotY + oSlotH / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-(sx + oSlotW / 2), -(oSlotY + oSlotH / 2));
        ctx.translate(flyX, flyY);
        this.parent._drawPropCard(ctx, potion, sx, oSlotY, oSlotW, oSlotH, s);
        ctx.restore();
      } else if (potion) {
        this.parent._drawPropCard(ctx, potion, sx + slideOffsetX, oSlotY, oSlotW, oSlotH, s);
        this.shopOwnedPropRects.push({ x: sx + slideOffsetX, y: oSlotY, w: oSlotW, h: oSlotH, index: i, array: 'potions' });
      } else {
        this.parent._drawEmptySlot(ctx, sx + slideOffsetX, oSlotY, oSlotW, oSlotH, s, 'potion');
      }

      // 售出按钮（选中时，带回弹出现动画）
      if (this.shopSelectedOwned && this.shopSelectedOwned.type === 'potions' && this.shopSelectedOwned.index === i && potion && !isSelling) {
        const sellBtnH = 16 * s;
        const sellBtnY = oSlotY + oSlotH + 2 * s;

        // 出现动画（easeOutBack：从卡牌底部向下弹出）
        let appearScale = 1;
        let appearOffsetY = 0;
        if (this.sellBtnAnimStart) {
          const ae = Date.now() - this.sellBtnAnimStart;
          const ap = Math.min(ae / 200, 1);
          const ease = this._easeOutBack(ap);
          appearScale = ease;
          appearOffsetY = -(1 - ease) * 8 * s;
        }

        const finalW = oSlotW * appearScale;
        const finalH = sellBtnH * appearScale;
        const finalX = sx + (oSlotW - finalW) / 2;
        const finalY = sellBtnY + appearOffsetY + (sellBtnH - finalH) / 2;

        ctx.save();
        this.parent.roundRect(finalX, finalY, finalW, finalH, 3 * s * appearScale, '#c0392b');
        ctx.font = `bold ${Math.floor(8 * s * Math.max(appearScale, 0.5))}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const coinSize = 10 * s * appearScale;
        const sellText = String(potion.cost);
        const textW = ctx.measureText(sellText).width;
        const contentW = coinSize + 2 * s + textW;
        const startX = finalX + (finalW - contentW) / 2;
        const midY = finalY + finalH / 2;
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillText(sellText, startX + coinSize + 2 * s + textW / 2, midY);
        ctx.restore();

        this.shopSellBtnRect = { x: sx, y: sellBtnY, w: oSlotW, h: sellBtnH, index: i, array: 'potions' };
      }
    }

    const modPad = 10 * s;
    const modW = W - 30 * s;
    const modX = 15 * s;
    const unitH = 100 * s;
    const rowH = unitH + 8 * s;
    const cardGap = 8 * s;
    const unitW = (modW - modPad * 2 - cardGap) / 2;
    const cardW = Math.floor(unitW * 0.35);
    const cardH = unitH - 20 * s;

    const innerPad = 6 * s;
    const rowGap = 20;
    const containerPad = rowGap;
    const titleH = 50 * s;
    const titleGap = 6 * s;

    const rowConfigs = [
      { title: '女巫牌', color: '#5c4574', rowBg: '#f0e8f5', type: 'witch' },
      { title: '水晶球牌', color: '#354e6f', rowBg: '#e8eef5', type: 'crystal' },
      { title: '魔法药水牌', color: '#355c4e', rowBg: '#e8f5ee', type: 'potion' },
    ];

    const containerH = rowConfigs.length * rowH + (rowConfigs.length - 1) * rowGap + containerPad * 2;
    const containerY = ownedY + ownedH + 10 * s + titleH + titleGap - 15 * s;

    this.shopRefreshRects = [];
    this.shopPriceBtnRects = [];

    // 标题：shop_icon.png + 卡牌商店 + 水平镜像 shop_icon.png
    const shopTitleText = '卡牌商店';
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleTextW = ctx.measureText(shopTitleText).width;
    const titleIconSize = 18 * s;
    const titleIconGap = 8 * s;
    const titleTotalW = titleIconSize * 2 + titleIconGap * 2 + titleTextW;
    const titleStartX = (W - titleTotalW) / 2;
    const titleMidY = ownedY + ownedH + 10 * s + titleH / 2;

    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      ctx.drawImage(this.parent.shopIcon, titleStartX, titleMidY - titleIconSize / 2 - 1 * s, titleIconSize, titleIconSize);
    }
    ctx.fillText(shopTitleText, titleStartX + titleIconSize + titleIconGap + titleTextW / 2, titleMidY);
    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      const rightIconX = titleStartX + titleIconSize + titleIconGap + titleTextW + titleIconGap;
      ctx.save();
      ctx.translate(rightIconX + titleIconSize, titleMidY - titleIconSize / 2 - 1 * s);
      ctx.scale(-1, 1);
      ctx.drawImage(this.parent.shopIcon, 0, 0, titleIconSize, titleIconSize);
      ctx.restore();
    }

    // 左右米色细线装饰（内浓外淡渐变）
    const decoLineW = 100 * s;
    const lineY = titleMidY - 1 * s;
    ctx.lineWidth = 0.8 * s;

    // 左侧横线：外端淡 → 内端浓
    const leftGrad = ctx.createLinearGradient(titleStartX - decoLineW, lineY, titleStartX + titleIconSize * 0.6, lineY);
    leftGrad.addColorStop(0, 'rgba(184,160,120,0.5)');
    leftGrad.addColorStop(1, 'rgba(184,160,120,1)');
    ctx.strokeStyle = leftGrad;
    ctx.beginPath();
    ctx.moveTo(titleStartX - decoLineW, lineY);
    ctx.lineTo(titleStartX + titleIconSize * 0.6, lineY);
    ctx.stroke();

    // 右侧横线：内端浓 → 外端淡
    const rightIconX = titleStartX + titleIconSize + titleIconGap + titleTextW + titleIconGap;
    const rightGrad = ctx.createLinearGradient(rightIconX + titleIconSize * 0.4, lineY, rightIconX + titleIconSize + decoLineW, lineY);
    rightGrad.addColorStop(0, 'rgba(184,160,120,1)');
    rightGrad.addColorStop(1, 'rgba(184,160,120,0.5)');
    ctx.strokeStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(rightIconX + titleIconSize * 0.4, lineY);
    ctx.lineTo(rightIconX + titleIconSize + decoLineW, lineY);
    ctx.stroke();

    ctx.restore();

    // 大容器（奶油色边框包裹三行，左右各外扩 3px）
    this.parent.roundRect(modX - 3, containerY, modW + 6, containerH, 10 * s, cream, gold, 1.5 * s);

    rowConfigs.forEach((mod, modIdx) => {
      const rowY = containerY + containerPad + modIdx * (rowH + rowGap);

      // 行背景（淡色 + 加深同色边框）
      const rowBorderColors = { witch: '#e0d0e8', crystal: '#d0d8e0', potion: '#d0e0d8' };
      this.parent.roundRect(modX + innerPad, rowY, modW - innerPad * 2, rowH, 6 * s, mod.rowBg, rowBorderColors[mod.type], 1 * s);

      // 顶部装饰标题（半遮在行背景上方）
      const capsuleH = 24 * s;
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      const capsuleTitleW = ctx.measureText(mod.title).width;
      const badgeW = capsuleTitleW + 32 * s;
      const capsuleY = rowY - capsuleH / 2;

      // 深色带尖角面板
      const badgeH = capsuleH * 0.78;
      const badgeCX = modX + modW / 2;
      const badgeCY = capsuleY + capsuleH / 2;
      const tipW = Math.min(7 * s, badgeH * 0.35);

      ctx.save();
      ctx.beginPath();
      const bh2 = badgeH / 2;
      const bw2 = badgeW / 2;
      ctx.moveTo(badgeCX - bw2 + tipW, badgeCY - bh2);
      ctx.lineTo(badgeCX + bw2 - tipW, badgeCY - bh2);
      ctx.lineTo(badgeCX + bw2, badgeCY);
      ctx.lineTo(badgeCX + bw2 - tipW, badgeCY + bh2);
      ctx.lineTo(badgeCX - bw2 + tipW, badgeCY + bh2);
      ctx.lineTo(badgeCX - bw2, badgeCY);
      ctx.closePath();
      ctx.fillStyle = mod.color;
      ctx.fill();
      ctx.lineWidth = 1 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.restore();

      // 3. 小星星装饰（四角星）
      const drawStar = (cx, cy, sz, innerScale = 0.5) => {
        const starPath = (x, y, r) => {
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.25, y - r * 0.25);
          ctx.lineTo(x + r, y);
          ctx.lineTo(x + r * 0.25, y + r * 0.25);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r * 0.25, y + r * 0.25);
          ctx.lineTo(x - r, y);
          ctx.lineTo(x - r * 0.25, y - r * 0.25);
          ctx.closePath();
        };
        ctx.save();
        // 外层：胶囊颜色边缘
        ctx.fillStyle = mod.color;
        ctx.beginPath();
        starPath(cx, cy, sz);
        ctx.fill();
        // 内层：米白色中心
        ctx.fillStyle = '#faf5e8';
        ctx.beginPath();
        starPath(cx, cy, sz * innerScale);
        ctx.fill();
        ctx.restore();
      };

      drawStar(badgeCX - bw2, badgeCY, 4 * s, 0.35);
      drawStar(badgeCX + bw2, badgeCY, 4 * s, 0.35);
      // 面板上再点缀两颗小星
      drawStar(badgeCX - bw2 * 0.55, badgeCY, 1.2 * s, 0.4);
      drawStar(badgeCX + bw2 * 0.55, badgeCY, 1.2 * s, 0.4);

      // 5. 文字
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mod.title, badgeCX, badgeCY + 0.5 * s);

      // 2 个商品单元（左右各一）
      for (let i = 0; i < 2; i++) {
        const itemIdx = modIdx * 2 + i;
        const item = game.shopItems[itemIdx];
        if (!item) continue;

        const unitX = modX + modPad + i * (unitW + cardGap) + (i === 1 ? 2 : 0);
        const unitY = rowY + 3;

        // 两个单元之间的分隔线
        if (i === 1) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(unitX - cardGap / 2, unitY + 10 * s);
          ctx.lineTo(unitX - cardGap / 2, unitY + unitH - 10 * s);
          ctx.strokeStyle = 'rgba(196,163,90,0.2)';
          ctx.lineWidth = 1 * s;
          ctx.stroke();
          ctx.restore();
        }

        // 竖向卡牌（cover 模式绘制图标，金色边框，无额外深色背景）
        const cardX = unitX;
        const cardY = unitY + (unitH - cardH) / 2;
        const cardR = 6 * s;

        // 圆角 clip 后 cover 绘制图标
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cardX + cardR, cardY);
        ctx.lineTo(cardX + cardW - cardR, cardY);
        ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cardR);
        ctx.lineTo(cardX + cardW, cardY + cardH - cardR);
        ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cardR, cardY + cardH);
        ctx.lineTo(cardX + cardR, cardY + cardH);
        ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cardR);
        ctx.lineTo(cardX, cardY + cardR);
        ctx.quadraticCurveTo(cardX, cardY, cardX + cardR, cardY);
        ctx.closePath();
        ctx.clip();

        const iconName = item.trigger || item.effect;
        const iconData = this.parent.shopCardImages[iconName];
        if (iconData && iconData.loaded && iconData.img) {
          const cardAspect = cardW / cardH;
          const aspect = (iconData.width > 0 && iconData.height > 0)
            ? iconData.width / iconData.height
            : cardAspect;
          let drawW, drawH, imgX, imgY;
          if (aspect > cardAspect) {
            drawW = cardW;
            drawH = drawW / aspect;
            imgX = cardX;
            imgY = cardY + (cardH - drawH) / 2;
          } else {
            drawH = cardH;
            drawW = drawH * aspect;
            imgX = cardX + (cardW - drawW) / 2;
            imgY = cardY;
          }
          ctx.drawImage(iconData.img, imgX, imgY, drawW, drawH);
        } else {
          // fallback: 简单装饰圆
          ctx.beginPath();
          ctx.arc(cardX + cardW / 2, cardY + cardH / 2, Math.min(cardW, cardH) * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 1 * s;
          ctx.stroke();
        }
        ctx.restore();

        // 文字区域（卡牌右侧，淡色行背景上 → 深色文字）
        const textX = cardX + cardW + 8 * s;
        const textMaxW = unitW - cardW - 8 * s;

        let nameColor, descColor;
        if (mod.type === 'witch') {
          nameColor = '#4a3065';
          descColor = '#6a5a7a';
        } else if (mod.type === 'crystal') {
          nameColor = '#1e3a5f';
          descColor = '#4a6a8a';
        } else {
          nameColor = '#1e4a3a';
          descColor = '#4a7a5a';
        }

        // 名称（左对齐）
        const nameY = unitY + 18 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = nameColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, textX, nameY);
        ctx.restore();

        // 描述（自动换行，左对齐）
        const descY = nameY + 18 * s;
        ctx.save();
        ctx.font = `${Math.floor(10 * s)}px sans-serif`;
        ctx.fillStyle = descColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        drawWrappedText(ctx, item.desc, textX, descY, textMaxW, 13 * s);
        ctx.restore();

        // 价格按钮（暖米色，金币图标+价格）
        const btnH = 22 * s;
        const btnY = unitY + unitH - btnH - 10 * s;
        const coinSize = 14 * s;
        const priceText = String(item.cost);

        // 先计算按钮宽度
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        const priceTextW = ctx.measureText(priceText).width;
        ctx.restore();
        const btnW = coinSize + 4 * s + priceTextW + 16 * s + 20;
        const btnX = textX + 2;

        let pressOffset = 0;
        const isPressed = this.priceBtnPressed && this.priceBtnPressed.index === itemIdx;
        if (isPressed) {
          const pe = Date.now() - this.priceBtnPressed.pressTime;
          if (pe < 150) pressOffset = 2 * s;
        }

        // 按钮投影
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.parent.roundRect(btnX, btnY + pressOffset, btnW, btnH, 7 * s, '#FFF1D4');
        ctx.restore();

        // 顶部高光条
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.moveTo(btnX + 4 * s, btnY + 2 * s + pressOffset);
        ctx.lineTo(btnX + btnW - 4 * s, btnY + 2 * s + pressOffset);
        ctx.stroke();
        ctx.restore();

        // 金币图标 + 价格（整体居中）
        const contentW = coinSize + 4 * s + priceTextW;
        const contentStartX = btnX + (btnW - contentW) / 2;
        const midY = btnY + btnH / 2 + pressOffset;
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, contentStartX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, contentStartX + coinSize + 4 * s, midY);

        this.shopPriceBtnRects.push({ x: btnX, y: btnY, w: btnW, h: btnH, index: itemIdx });
      }

      // 两张卡牌都售罄时，显示刷新按钮（金币 5 + 刷新）
      const itemIdx0 = modIdx * 2;
      const itemIdx1 = modIdx * 2 + 1;
      const allSold = !game.shopItems[itemIdx0] && !game.shopItems[itemIdx1];
      if (allSold) {
        const refreshBtnH = 26 * s;
        const refreshBtnY = rowY + (rowH - refreshBtnH) / 2;

        const refreshText = '刷新';
        const costText = '5';
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        const refreshTextW = ctx.measureText(refreshText).width;
        const costTextW = ctx.measureText(costText).width;
        const coinSize = 14 * s;
        const contentW = coinSize + 4 * s + costTextW + 8 * s + refreshTextW;
        const refreshBtnW = contentW + 16 * s;

        const refreshBtnX = modX + (modW - refreshBtnW) / 2;

        this.parent.roundRect(refreshBtnX, refreshBtnY, refreshBtnW, refreshBtnH, 6 * s, '#e8dcc8');

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.moveTo(refreshBtnX + 5 * s, refreshBtnY + 2 * s);
        ctx.lineTo(refreshBtnX + refreshBtnW - 5 * s, refreshBtnY + 2 * s);
        ctx.stroke();
        ctx.restore();

        const contentStartX = refreshBtnX + 8 * s;
        const midY = refreshBtnY + refreshBtnH / 2;
        if (this.parent.coinIcon && this.parent.coinIconLoaded) {
          ctx.drawImage(this.parent.coinIcon, contentStartX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(costText, contentStartX + coinSize + 4 * s, midY);
        ctx.fillText(refreshText, contentStartX + coinSize + 4 * s + costTextW + 8 * s, midY);

        this.shopRefreshRects.push({ x: refreshBtnX, y: refreshBtnY, w: refreshBtnW, h: refreshBtnH, modIdx });
      }
    });

    // === 下一回合女巫技能模块 ===
    const nextRound = game.round + 1;
    const witchSkill = getSkillForLevel(nextRound);

    // === 下一回合模块（始终显示）===
    const moduleH = witchSkill ? 120 * s : 100 * s;
    const moduleY = containerY + containerH + 50 * s;
    const moduleX = 15 * s;
    const moduleW = W - 30 * s;

    // —— 下一回合 —— 标题（参照卡牌商店样式）
    const nrTitleText = '下一回合';
    ctx.save();
    ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b7d5a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nrTitleY = moduleY - 14 * s;
    const nrTitleW = ctx.measureText(nrTitleText).width;
    const nrTitleIconSize = 14 * s;
    const nrTitleIconGap = 6 * s;
    const nrTitleTotalW = nrTitleIconSize * 2 + nrTitleIconGap * 2 + nrTitleW;
    const nrTitleStartX = (W - nrTitleTotalW) / 2;

    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      ctx.drawImage(this.parent.shopIcon, nrTitleStartX, nrTitleY - nrTitleIconSize / 2 - 1 * s, nrTitleIconSize, nrTitleIconSize);
    }
    ctx.fillText(nrTitleText, nrTitleStartX + nrTitleIconSize + nrTitleIconGap + nrTitleW / 2, nrTitleY);
    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      const nrRightIconX = nrTitleStartX + nrTitleIconSize + nrTitleIconGap + nrTitleW + nrTitleIconGap;
      ctx.save();
      ctx.translate(nrRightIconX + nrTitleIconSize, nrTitleY - nrTitleIconSize / 2 - 1 * s);
      ctx.scale(-1, 1);
      ctx.drawImage(this.parent.shopIcon, 0, 0, nrTitleIconSize, nrTitleIconSize);
      ctx.restore();
    }

    // 左右米色细线装饰（内浓外淡渐变）
    const nrDecoLineW = 80 * s;
    const nrLineY = nrTitleY - 1 * s;
    ctx.lineWidth = 0.8 * s;

    // 左侧横线：外端淡 → 内端浓
    const nrLeftGrad = ctx.createLinearGradient(nrTitleStartX - nrDecoLineW, nrLineY, nrTitleStartX + nrTitleIconSize * 0.6, nrLineY);
    nrLeftGrad.addColorStop(0, 'rgba(184,160,120,0.5)');
    nrLeftGrad.addColorStop(1, 'rgba(184,160,120,1)');
    ctx.strokeStyle = nrLeftGrad;
    ctx.beginPath();
    ctx.moveTo(nrTitleStartX - nrDecoLineW, nrLineY);
    ctx.lineTo(nrTitleStartX + nrTitleIconSize * 0.6, nrLineY);
    ctx.stroke();

    // 右侧横线：内端浓 → 外端淡
    const nrRightIconX = nrTitleStartX + nrTitleIconSize + nrTitleIconGap + nrTitleW + nrTitleIconGap;
    const nrRightGrad = ctx.createLinearGradient(nrRightIconX + nrTitleIconSize * 0.4, nrLineY, nrRightIconX + nrTitleIconSize + nrDecoLineW, nrLineY);
    nrRightGrad.addColorStop(0, 'rgba(184,160,120,1)');
    nrRightGrad.addColorStop(1, 'rgba(184,160,120,0.5)');
    ctx.strokeStyle = nrRightGrad;
    ctx.beginPath();
    ctx.moveTo(nrRightIconX + nrTitleIconSize * 0.4, nrLineY);
    ctx.lineTo(nrRightIconX + nrTitleIconSize + nrDecoLineW, nrLineY);
    ctx.stroke();
    ctx.restore();

    // 容器背景
    this.parent.roundRect(moduleX, moduleY, moduleW, moduleH, 10 * s, '#f5f0e6', '#c4a35a', 1.5 * s);

    // 目标分数行
    const targetY = moduleY + 20 * s;
    ctx.save();
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯 目标分数', moduleX + 18 * s, targetY);
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const nextTarget = Math.floor(150 + 50 * (game.round + 1) * game.round);
    ctx.fillText(`${nextTarget} 分`, moduleX + moduleW - 18 * s, targetY);
    ctx.restore();

    // 虚线分隔
    const dividerY = targetY + 14 * s;
    ctx.save();
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([4 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(moduleX + 15 * s, dividerY);
    ctx.lineTo(moduleX + moduleW - 15 * s, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 挑战按钮
    const challengeBtnW = 92 * s;
    const challengeBtnH = 40 * s;
    let challengeBtnX, challengeBtnY;

    if (witchSkill) {
      // 女巫头像
      const avatarSize = 56 * s;
      const avatarX = moduleX + 18 * s;
      const avatarY = dividerY + 12 * s;
      const witchAvatar = this.parent.witchAvatars[witchSkill.level];

      // 圆形裁剪绘制头像
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      if (witchAvatar && witchAvatar.loaded && witchAvatar.img) {
        ctx.drawImage(witchAvatar.img, avatarX, avatarY, avatarSize, avatarSize);
      } else {
        ctx.fillStyle = '#9b59b6';
        ctx.fill();
      }
      ctx.restore();

      // 头像边框
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.restore();

      // 文字区域
      const textX = avatarX + avatarSize + 12 * s;
      challengeBtnX = moduleX + moduleW - challengeBtnW - 18 * s;
      const textMaxW = challengeBtnX - textX - 10 * s;

      let skillY = dividerY + 18 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('女巫技能', textX, skillY);
      ctx.restore();
      skillY += 16 * s;

      ctx.save();
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const descH = drawWrappedText(ctx, witchSkill.desc, textX, skillY, textMaxW, 13 * s);
      ctx.restore();
      skillY += descH + 4 * s;

      if (witchSkill.reward_desc) {
        ctx.save();
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('奖励', textX, skillY);
        ctx.restore();
        skillY += 16 * s;

        ctx.save();
        ctx.font = `${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#8b7d5a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        drawWrappedText(ctx, witchSkill.reward_desc, textX, skillY, textMaxW, 13 * s);
        ctx.restore();
      }

      challengeBtnY = moduleY + (moduleH - challengeBtnH) / 2 + 15 * s;
    } else {
      // 无技能：挑战按钮居中
      challengeBtnX = moduleX + (moduleW - challengeBtnW) / 2;
      challengeBtnY = dividerY + (moduleH - (dividerY - moduleY) - challengeBtnH) / 2;
    }

    // 绘制挑战按钮
    let pressOffset = 0;
    if (this.challengeBtnPressed) {
      const pe = Date.now() - this.challengeBtnPressTime;
      if (pe < 200) pressOffset = 2 * s;
    }

    const challengeBtnData = this.parent.btnImages['challenge_button'];
    if (challengeBtnData && challengeBtnData.loaded && challengeBtnData.img) {
      ctx.drawImage(challengeBtnData.img, challengeBtnX, challengeBtnY + pressOffset, challengeBtnW, challengeBtnH);
    } else {
      this.parent.roundRect(challengeBtnX, challengeBtnY + pressOffset, challengeBtnW, challengeBtnH, 8 * s, '#6b3a7d');
    }
    ctx.save();
    ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('挑战', challengeBtnX + challengeBtnW / 2, challengeBtnY + challengeBtnH / 2 + pressOffset);
    ctx.restore();
    this.nextRoundBtnRect = { x: challengeBtnX, y: challengeBtnY, w: challengeBtnW, h: challengeBtnH };
  }
}

class ConfirmBuyRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastItemIndex = null;
    this._successAnimStarted = false;
  }

  draw(ctx, game, W, H, s) {
    const itemIndex = game.confirmBuyItem;
    if (itemIndex === undefined || itemIndex === null) return;

    const isSuccess = game._confirmBuySuccess;
    const item = isSuccess ? game._confirmBuyItemData : game.shopItems[itemIndex];
    if (!item) {
      game.confirmBuyItem = null;
      game._closingConfirmBuy = false;
      return;
    }

    const isClosing = game._closingConfirmBuy;
    const closeElapsed = isClosing ? Date.now() - (game._closeConfirmBuyStartTime || Date.now()) : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / 150, 1) : 0;
    if (isClosing && closeProgress >= 1) {
      game.confirmBuyItem = null;
      game._closingConfirmBuy = false;
      game._confirmBuySuccess = false;
      game._confirmBuyItemData = null;
      this._successAnimStarted = false;
      return;
    }

    if (!isClosing && !isSuccess && this.lastItemIndex !== itemIndex) {
      this.animStartTime = Date.now();
      this.lastItemIndex = itemIndex;
    }
    if (isSuccess && !this._successAnimStarted) {
      this._successAnimStarted = true;
    }

    const animStart = isSuccess ? (game._confirmBuySuccessTime || Date.now()) : (this.animStartTime || Date.now());
    const elapsed = isClosing ? 99999 : Date.now() - animStart;

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    const closeSlideY = isClosing ? -closeProgress * 25 * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;
    ctx.save();
    ctx.globalAlpha = closeAlpha;

    // 遮罩（成功弹窗切换时保持满 opacity，避免闪烁）
    const overlayAlpha = isClosing
      ? 0.65 * (1 - closeProgress)
      : (isSuccess ? 0.65 : Math.min(elapsed / 200, 0.65));
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

    // 背景 + 金棕色边框
    this.parent.roundRect(px, py, pw, ph, r, '#faf6ee', gold);
    // 内层细边框（更精致的金棕色）
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    const inset = 4 * s;
    const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = r - inset;
    ctx.moveTo(ix + ir, iy);
    ctx.lineTo(ix + iw - ir, iy);
    ctx.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
    ctx.lineTo(ix + iw, iy + ih - ir);
    ctx.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
    ctx.lineTo(ix + ir, iy + ih);
    ctx.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
    ctx.lineTo(ix, iy + ir);
    ctx.quadraticCurveTo(ix, iy, ix + ir, iy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 内容统一淡入（成功弹窗立即开始，无延迟）
    const contentDelay = isSuccess ? 0 : 80;
    const contentT = Math.max(0, Math.min((elapsed - contentDelay) / 250, 1));
    const contentEase = contentT * (2 - contentT);
    const contentAlpha = contentEase;
    const contentYShift = (1 - contentEase) * 10 * s;

    const iconName = item.trigger || item.effect;
    const iconData = this.parent.shopCardImages[iconName];

    if (isSuccess) {
      this._drawSuccessPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha);
    } else {
      this._drawConfirmPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha);
    }

    ctx.restore();
  }

  _drawSuccessPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha) {
    const gold = '#c4a35a';
    const darkBlue = '#1a2f4a';

    // === 标题：购买成功 ===
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('购买成功', W / 2, py + 38 * s + contentYShift);
    ctx.restore();

    // === 标题下装饰线 ===
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.strokeStyle = 'rgba(196,163,90,0.5)';
    ctx.lineWidth = 1 * s;
    const decoLineY = py + 56 * s + contentYShift;
    const decoLineW = pw * 0.5;
    const decoLineX = px + (pw - decoLineW) / 2;
    ctx.beginPath();
    ctx.moveTo(decoLineX, decoLineY);
    ctx.lineTo(decoLineX + decoLineW, decoLineY);
    ctx.stroke();
    // 中间小菱形
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
    if (iconData && iconData.loaded && iconData.img) {
      const containerAspect = cardMaxW / cardMaxH;
      const aspect = (iconData.width > 0 && iconData.height > 0)
        ? iconData.width / iconData.height
        : containerAspect;
      if (containerAspect > aspect) {
        cardH = cardMaxH;
        cardW = cardH * aspect;
      } else {
        cardW = cardMaxW;
        cardH = cardW / aspect;
      }
    }
    const cardCX = W / 2;
    const cardCY = py + 72 * s + cardH / 2 + contentYShift;
    const cardX = cardCX - cardW / 2;
    const cardY = cardCY - cardH / 2;

    // === 卡牌图片（带金色边框 + 高光）===
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;

    // 卡牌无背景，直接展示图片

    // 圆角裁剪 + 图片 + 高光
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

    ctx.restore(); // 恢复裁剪
    ctx.restore();

    // === 光彩夺目效果（金色脉动光晕 + 旋转十字光芒）===
    if (!isClosing) {
      ctx.save();
      ctx.globalAlpha = contentAlpha;

      const t = Date.now();
      const cardCX = cardX + cardW / 2;
      const cardCY = cardY + cardH / 2;

      // 1. 金色脉动光晕（卡牌背后的径向渐变光环）
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

      // 2. 四角闪烁星（围绕卡牌，尺寸更大）
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

      ctx.restore();
    }

    // === 底部飘带图片 ===
    let bandH = 0;
    if (this.parent.buySuccessBandImg && this.parent.buySuccessBandLoaded) {
      ctx.save();
      if (!isClosing) ctx.globalAlpha = contentAlpha;
      const bandW = 160 * s;
      bandH = bandW * (this.parent.buySuccessBandImg.height || 60) / (this.parent.buySuccessBandImg.width || 400);
      const bandX = (W - bandW) / 2;
      const bandY = cardY + cardH/2 + 2 * s + contentYShift;
      ctx.drawImage(this.parent.buySuccessBandImg, bandX, bandY, bandW, bandH);
      ctx.restore();
    }

    // === 卡牌名称 ===
    const nameY = cardY + cardH/2 + 8 * s + bandH + contentYShift;
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, W / 2, nameY);
    ctx.restore();

    // === 卡牌描述 ===
    const descY = nameY + 24 * s;
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.desc, W / 2, descY);
    ctx.restore();

    // === 底部分隔线 ===
    const bottomLineY = descY + 28 * s;
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
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
    const collectBtnY = py + ph - collectBtnH - 22 * s;
    const cpe = game._successBtnPressed ? Date.now() - (game._successBtnPressTime || 0) : 0;

    const isPotion = item.type === 'potion';
    const isChangeLetter = isPotion && item.effect === 'change_letter';
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;

    if (isPotion && !isChangeLetter) {
      // 普通药水牌：两个按钮（立即使用 + 暂存）
      const btnW = 120 * s;
      const btnGap = 12 * s;
      const totalW = btnW * 2 + btnGap;
      const startX = (W - totalW) / 2;

      // 独立按下缩放
      const btn1Scale = (game._successPressedBtn === 'usePotionNow' && cpe > 0 && cpe < 150) ? 0.95 : 1;
      const btn2Scale = (game._successPressedBtn === 'stashPotion' && cpe > 0 && cpe < 150) ? 0.95 : 1;

      // 按钮1：立即使用（金色背景）
      const b1x = startX;
      const b1w = btnW * btn1Scale;
      const b1h = collectBtnH * btn1Scale;
      const b1X = b1x + (btnW - b1w) / 2;
      const b1Y = collectBtnY + (collectBtnH - b1h) / 2 + contentYShift;
      this.parent.roundRect(b1X, b1Y, b1w, b1h, 8 * s, '#c4a35a');
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('立即使用', b1x + btnW / 2, b1Y + b1h / 2);

      // 按钮2：暂存（米色边框按钮）
      const b2x = startX + btnW + btnGap;
      const b2w = btnW * btn2Scale;
      const b2h = collectBtnH * btn2Scale;
      const b2X = b2x + (btnW - b2w) / 2;
      const b2Y = collectBtnY + (collectBtnH - b2h) / 2 + contentYShift;
      this.parent.roundRect(b2X, b2Y, b2w, b2h, 8 * s, '#f5f0e6', '#c4a35a');
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('暂存', b2x + btnW / 2, b2Y + b2h / 2);

      ctx.restore();

      // 存储两个按钮点击区域
      const finalY = collectBtnY;
      this.successBtnRect = { x: b1x, y: finalY, w: btnW, h: collectBtnH, action: 'usePotionNow' };
      this.successBtn2Rect = { x: b2x, y: finalY, w: btnW, h: collectBtnH, action: 'stashPotion' };
    } else if (isChangeLetter) {
      // 字母置换药水：只有暂存按钮（游戏中使用）
      const collectBtnW = 160 * s;
      const collectBtnX = (W - collectBtnW) / 2;
      const singleScale = (game._successPressedBtn === 'stashPotion' && cpe > 0 && cpe < 150) ? 0.95 : 1;

      const finalBW = collectBtnW * singleScale;
      const finalBH = collectBtnH * singleScale;
      const finalBX = collectBtnX + (collectBtnW - finalBW) / 2;
      const finalBY = collectBtnY + (collectBtnH - finalBH) / 2 + contentYShift;

      this.parent.roundRect(finalBX, finalBY, finalBW, finalBH, 8 * s, '#c4a35a');
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂存', W / 2, finalBY + finalBH / 2);
      ctx.restore();

      const finalCollectY = collectBtnY;
      this.successBtnRect = { x: collectBtnX, y: finalCollectY, w: collectBtnW, h: collectBtnH, action: 'stashPotion' };
      this.successBtn2Rect = null;
    } else {
      // 非药水牌：单个按钮
      const collectBtnW = 160 * s;
      const collectBtnX = (W - collectBtnW) / 2;
      const singleScale = (game._successPressedBtn && cpe > 0 && cpe < 150) ? 0.95 : 1;

      const finalBW = collectBtnW * singleScale;
      const finalBH = collectBtnH * singleScale;
      const finalBX = collectBtnX + (collectBtnW - finalBW) / 2;
      const finalBY = collectBtnY + (collectBtnH - finalBH) / 2 + contentYShift;

      this.parent.roundRect(finalBX, finalBY, finalBW, finalBH, 8 * s, '#c4a35a');
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const btnLabel = item.type === 'crystal' ? '生效' : '装备';
      ctx.fillText(btnLabel, W / 2, finalBY + finalBH / 2);
      ctx.restore();

      const finalCollectY = collectBtnY;
      const btnAction = item.type === 'crystal' ? 'applyCrystal' : 'equipWitch';
      this.successBtnRect = { x: collectBtnX, y: finalCollectY, w: collectBtnW, h: collectBtnH, action: btnAction };
      this.successBtn2Rect = null;
    }
  }

  _drawConfirmPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha) {
    const gold = '#c4a35a';

    // 标题
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('确认购买', W / 2, py + 35 * s + contentYShift);
    ctx.restore();

    // 分隔线
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
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
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    let imgBottom = py + 70 * s + contentYShift;
    if (iconData && iconData.loaded && iconData.img) {
      const containerAspect = (pw * 0.65) / (130 * s);
      const aspect = (iconData.width > 0 && iconData.height > 0)
        ? iconData.width / iconData.height
        : containerAspect;
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

    // 卡牌名称
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, W / 2, imgBottom + 20 * s + contentYShift);
    ctx.restore();

    // 卡牌描述
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.desc, W / 2, imgBottom + 45 * s + contentYShift);
    ctx.restore();

    // 检查是否达到上限
    const isWitch = item.type === 'witch';
    const isPotion = item.type === 'potion';
    const witchFull = (game.jokers || []).length >= 4;
    const potionFull = (game.potions || []).length >= 2;
    const atLimit = (isWitch && witchFull) || (isPotion && potionFull);

    // 购买按钮（下压动效，无飘出）
    const btnW = 160 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const pe = game._confirmBuyPressed ? Date.now() - (game._confirmBuyPressTime || 0) : 0;
    let btnPressY = 0;
    if (pe > 0 && pe < 150) {
      btnPressY = 3 * s;
    }
    const btnY = py + ph - btnH - 28 * s + contentYShift + btnPressY;
    ctx.save();
    if (!isClosing) ctx.globalAlpha = contentAlpha;

    if (atLimit) {
      // 已达上限：灰色禁用按钮
      this.parent.roundRect(btnX, btnY, btnW, btnH, 8 * s, '#a09890');
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('已达上限', W / 2, btnY + btnH / 2);
    } else {
      // 正常购买按钮
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
    }
    ctx.restore();

    // 存储点击区域（固定位置，不含动画偏移）
    const finalBtnY = py + ph - btnH - 28 * s;
    this.confirmBtnRect = atLimit ? null : { x: btnX, y: finalBtnY, w: btnW, h: btnH };
  }
}

module.exports = { ShopRenderer, ConfirmBuyRenderer, SHOP_POOL, generateShopItems, refreshModule, buyItem, upgradeLetter, applyCrystalEffects };
