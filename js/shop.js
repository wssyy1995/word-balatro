const { LETTER_SCORE, letterUpgrades, calcBaseTarget } = require('./data');
const { getSkillForLevel, getRewardName, formatItemDesc } = require('./witch_skills');
const { Easing } = require('./animation');
const { reportEvent } = require('./report');

// 自动换行绘制文本，返回占用的总高度
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const safeText = text == null ? '' : String(text);
  let line = '';
  const lines = [];
  for (let i = 0; i < safeText.length; i++) {
    const testLine = line + safeText[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      lines.push(line);
      line = safeText[i];
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
    {name:'元音强化', type:'witch', scope:'per_card', trigger:'has_vowel', value:3, upgrate_value:0.5,cost:8, min_level:1, desc:'元音字母分×value'},
    {name:'元音为首', type:'witch', scope:'per_card', trigger:'initial_vowel', operation:'add', value:100,upgrate_value:30, cost:6, min_level:1, desc:'单词首字母为元音时，该首字母分+value'},
    {name:'左右开弓', type:'witch', scope:'per_card', trigger:'left_right_open', operation:'add', value:30,upgrate_value:10,  cost:8, min_level:1, desc:'单词首尾字母各+value分'},
    // {name:'四字母连击', type:'witch', scope:'whole_word', trigger:'length_4', value:1.5, cost:4, min_level:1, desc:'单词字母>=4时，倍率×1.5'},
    {name:'五字母连击', type:'witch', scope:'whole_word', trigger:'length_5', operation:'multi_adds_value', value:2,upgrate_value:0.3,  cost:10, min_level:5, desc:'单词字母>=5时，单词倍率+value'},
    {name:'六字母连击', type:'witch', scope:'whole_word', trigger:'length_6', operation:'multi_adds_value', value:4,upgrate_value:0.4, cost:12, min_level:15, desc:'单词字母>=6时，单词倍率+value'},
    {name:'珍稀之力', type:'witch', scope:'whole_word', trigger:'has_face', operation:'multi_adds_value', value:4,upgrate_value:0.5, cost:12, min_level:1, desc:'单词字母含J/Q/X/Y/Z时，倍率+value'},
    {name:'容错咒文', type:'witch', trigger:'shield_illegal', cost:8, min_level:1, desc:'打出非法单词，不扣除出牌次数'},
    {name:'字母之神', type:'witch', scope:'limit', trigger:'letter_god', limit:3, cost:8, min_level:5, desc:'计分时，本单词所有字母按最高分字母算分（限3次）'},
    {name:'生命延续', type:'witch', scope:'limit', trigger:'life_extension', limit:1, cost:8, min_level:10, desc:'挽救1次游戏结束，将目标分差值×2,加到下一回合目标分'},
    {name:'勇敢试错', type:'witch', scope:'whole_word', trigger:'illegal_boost', value:0, cost:12, min_level:5, desc:'每次打出非法单词，倍率累计+1'},
    {name:'以小博大', type:'witch', scope:'whole_word', trigger:'last_chance', value:8, rate:40,upgrate_rate:5,max_level:5,cost:10, min_level:1, desc:'出牌<=3个字母,rate%概率倍率+value'},
    {name:'双子合影', type:'witch', scope:'whole_word', trigger:'double_same', operation:'multi_adds_value', value:5,upgrate_value:0.5, cost:12, min_level:10, desc:'相邻重复字母，倍率+value'},
    {name:'首尾呼应', type:'witch', scope:'whole_word', trigger:'firstend_same', operation:'multi_adds_value', value:6, upgrate_value:0.5,cost:10, min_level:15, desc:'单词首尾字母相同，倍率+value'},
    {name:'首字连击', type:'witch', scope:'whole_word', trigger:'initial_succession', operation:'multi_accumulation', value:3, cost:8, min_level:1, desc:'每次出牌若与上一手首字母相同，倍率累计+value；中断后重置'},
    {name:'回到过去', type:'witch', scope:'whole_word', trigger:'end_ed', operation:'multi_adds_value', value:4,upgrate_value:0.4, cost:12, min_level:5, desc:'打出的单词如果末尾加上\'ed\'也是合法单词,则倍率+value'},
    {name:'复制魔法', type:'witch', scope:'whole_word', trigger:'end_s', operation:'multi_adds_value', value:3,upgrate_value:0.4, cost:14, min_level:10, desc:'打出的单词如果末尾加上\'s\'也是合法单词,则倍率+value'},
    {name:'消元术', type:'witch', scope:'whole_word', trigger:'no_duplicate', operation:'multi_adds_value', value:2, upgrate_value:0.3,penalty:-1, cost:10, min_level:1, desc:'与上一手不含相同字母时,单词倍率+value，有则-1'},
    {name:'预言家', type:'witch', scope:'per_card', trigger:'predicted_letter', operation:'add', value:100, upgrate_value:50,cost:9, min_level:1, desc:'回合开始时随机预言一个字母，打出该字母时,字母分 +value'},
    {name:'混沌法球', type:'witch', scope:'whole_word', trigger:'chaos_orb', upgrate_value:0.2, min_value:0.5, max_value:1.2, value:1, cost:12, min_level:1, desc:'每次出牌，单词倍率随机+[min~max]'},
    {name:'温故知新', type:'witch', scope:'whole_word', trigger:'is_new_word', operation:'multi_adds_value', value:2, upgrate_value:0.2,penalty:-1, cost:12, min_level:15, desc:'首次打出新单词，倍率+value；若历史打出过，倍率-1'},
    {name:'出牌小能手', type:'witch', scope:'global', trigger:'zero_hands_bonus', value:2, cost:8, min_level:3, desc:'回合结算时，若剩余出牌次数=0，则金币额外+2'}
  ],
  crystal: [
    {name:'额外弃牌', type:'crystal', effect:'extra_discard', value:1, cost:3, desc:'下一回合弃牌次数+1'},
    {name:'额外出牌', type:'crystal', effect:'extra_hands', value:1, cost:3, desc:'下一回合出牌次数+1'},
    {name:'额外手牌', type:'crystal', effect:'extra_letter', value:1, cost:4, desc:'下一回合,增加一张字母手牌'}
    // {name:'金币祝福', type:'crystal', effect:'bonus_gold', value:3, cost:3, desc:'下一回合开始时获得3金币'}
    ,
    {name:'目标减免', type:'crystal', effect:'reduce_target', value:0.8, cost:3, desc:'下一回合目标分数×0.8'},
    {name:'技能重掷', type:'crystal', effect:'reroll_skill', cost:3, desc:'重掷下一回合的女巫技能'},
    {name:'争分夺秒', type:'crystal', effect:'haste_play', value:1, cost:4, desc:'下回合前20秒出牌不消耗次数'},
    {name:'迷之优惠', type:'crystal', effect:'mystery_discount', cost:8, desc:'购买优惠券，本回合商店商品随机打6~9折'}
  ],
  potion: [
    {name:'随机强化', type:'potion', effect:'random_upgrade', value:2, cost:6, desc:'随机强化1个字母，分数乘以1.2~3倍'},
    {name:'字母升级', type:'potion', effect:'upgrade_letter', value:10, cost:5, desc:'指定一张字母牌，分数 +10'},
    {name:'字母置换', type:'potion', effect:'change_letter',scope:'game', value:2, cost:6, desc:'游戏中,可选择一张字母牌切换字母'},
    {name:'危险复制', type:'potion', effect:'replicate_letter', cost:8, desc:'选择两个字母，70%概率低分变高分，30%概率相反'},
    {name:'平分秋色', type:'potion', effect:'equal_split', cost:8, desc:'选择两个字母，将分数相加后平分，永久生效'},
    {name:'吸星大法', type:'potion', effect:'absorb_stars', scope:'game', cost:8, desc:'游戏中，选择一张手牌，将其他手牌分数临时加给它'},
    {name:'星辉洗涤', type:'potion', effect:'starlight_wash', cost:5, desc:'选择一个字母，重置强化恢复基础分，获得差值分数1/3的金币'}
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
  const equippedWitchNames = new Set((game.jokers || []).filter(j => j).map(j => j.name));

  // 女巫牌：过滤已装备的 + 过滤当前回合未解锁的(min_level)，确保有2张可展示
  const isWitchAvailable = w => !equippedWitchNames.has(w.name) && game.round >= (w.min_level || 1);
  let witchPool = SHOP_POOL.witch.filter(isWitchAvailable);
  if (witchPool.length < 2) {
    // 过滤后不足2张，从满足 min_level 的池子补充（仍不违反 min_level 限制）
    witchPool = SHOP_POOL.witch.filter(w => game.round >= (w.min_level || 1));
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
    const equippedWitchNames = new Set((game.jokers || []).filter(j => j).map(j => j.name));
    pool = SHOP_POOL.witch.filter(w => !equippedWitchNames.has(w.name) && game.round >= (w.min_level || 1));
    if (pool.length < 2) pool = SHOP_POOL.witch.filter(w => game.round >= (w.min_level || 1));
  } else {
    pool = SHOP_POOL[type];
  }

  const shuffled = _shuffle(pool);
  const startIdx = modIdx * 2;
  game.shopItems[startIdx] = shuffled[0];
  game.shopItems[startIdx + 1] = shuffled[1];

  if (game.audioManager) game.audioManager.play('card_sell');
  if (game.storageManager) game.storageManager.saveProgress();
}

function buyItem(game, idx) {
  const item = game.shopItems[idx];
  const finalCost = game._shopDiscountActive ? Math.floor(item.cost * game._shopDiscountRate) : item.cost;
  if (!item || game.gold < finalCost) return false;

  // 上限检查（upgrade_letter 和 random_upgrade 药水不受药水槽位限制）
  if (item.type === 'witch' && (game.jokers || []).length >= game.maxJokerSlots) return false;
  const isAlwaysBuyablePotion = item.type === 'potion' && ['upgrade_letter', 'random_upgrade', 'replicate_letter', 'equal_split', 'starlight_wash'].includes(item.effect);
  if (item.type === 'potion' && (game.potions || []).length >= 2 && !isAlwaysBuyablePotion) return false;

  game.gold -= finalCost;

  if (game.audioManager) game.audioManager.play('buy_success');

  if (item.type === 'witch') {
    // 女巫牌：购买后不在此加入 jokers，成功弹窗点击"装备"后才加入
    game.shopItems[idx] = null;
    reportEvent("card_buy", {
      "card_type": item.type,
      "card_name": item.name || '',
      "userid": game.userid || ''
    });
    if (game.storageManager) game.storageManager.saveProgress();
    return true;
  } else if (item.type === 'crystal') {
    if (item.effect === 'mystery_discount') {
      // 迷之优惠：不加入 crystalEffects，进入待开奖状态
      game.shopItems[idx] = null;
      if (typeof wx !== 'undefined' && wx.reportEvent) {
        wx.reportEvent("card_buy", {
          "card_type": item.type,
          "card_name": item.name || item.effect || '',
          "userid": game.userid || ''
        });
      }
      if (game.storageManager) game.storageManager.saveProgress();
      return true;
    }
    if (item.effect !== 'reroll_skill') {
      game.crystalEffects.push({...item});
      if (item.effect === 'reduce_target') {
        game._reduceTargetAnim = { value: item.value, duration: 400 };
      }
    }
    game.shopItems[idx] = null;
    reportEvent("card_buy", {
      "card_type": item.type,
      "card_name": item.name || item.effect || '',
      "userid": game.userid || ''
    });
    if (game.storageManager) game.storageManager.saveProgress();
    return true;
  } else if (item.type === 'potion') {
    // 药水牌：购买后不在此加入 potions，成功弹窗点击"暂存"后才加入
    game.shopItems[idx] = null;
    reportEvent("card_buy", {
      "card_type": item.type,
      "card_name": item.name || item.effect || '',
      "userid": game.userid || ''
    });
    if (game.storageManager) game.storageManager.saveProgress();
    return true;
  }
  return false;
}

function upgradeLetter(game, letter) {
  if (!game.potionMode) return false;

  const potion = game.potionMode;
  let value = potion.value || (potion.effect === 'upgrade_letter' ? 10 : 2);

  // 随机强化：使用转盘生成的随机倍数，而不是药水定义中的固定 value
  if (potion.effect === 'random_upgrade' && game._randomUpgradePopup) {
    value = game._randomUpgradePopup.randomMult || value;
  }

  const existing = letterUpgrades.get(letter) || {};
  let totalMult = existing.mult || 1;
  let totalAdd = existing.add || 0;

  if (potion.effect === 'upgrade_letter') {
    // 字母强化：加法叠加（分数 + value）
    totalAdd += value;
  } else {
    // 随机强化：乘法叠加（分数 × value），之前的 add 也要乘
    totalMult *= value;
    totalAdd = Math.floor(totalAdd * value);
  }

  letterUpgrades.set(letter, { mult: totalMult, add: totalAdd });
  console.log('[upgradeLetter] letter:', letter, 'value:', value, 'totalMult:', totalMult, 'totalAdd:', totalAdd);

  // 同步更新当前手牌中该字母的所有卡牌分数
  const baseScore = LETTER_SCORE[letter];
  const newScore = Math.floor(baseScore * totalMult) + totalAdd;
  console.log('[upgradeLetter] baseScore:', baseScore, 'newScore:', newScore);
  game.hand.forEach(card => {
    if (card && card.letter === letter) {
      card.baseScore = baseScore;
      card.score = newScore;
      card.upgraded = true;
      card.upgradeMult = totalMult;
      card.upgradeAdd = totalAdd;
    }
  });

  // 动画中自己播放音效,避免在 300~600ms 显示旧分数阶段误触发
  // if (game.audioManager) game.audioManager.play('word_score');

  // 药水已从道具栏提前移除（道具栏使用时）或不在道具栏中（商店直接使用时）
  game.potionMode = null;
  if (game.storageManager) game.storageManager.saveProgress();
  return true;
}

function applyCrystalEffects(game) {
  game.crystalEffects.forEach(eff => {
    if (eff.effect === 'extra_discard') game.extraDiscards += eff.value;
    if (eff.effect === 'extra_safety') game.extraSafety += eff.value;
    if (eff.effect === 'extra_hands') game.extraHands += eff.value;
    if (eff.effect === 'extra_letter') game.extraLetters = (game.extraLetters || 0) + eff.value;
    if (eff.effect === 'bonus_gold') game.gold += eff.value;
    if (eff.effect === 'reduce_target') game.target = Math.floor(game.target * eff.value);
    if (eff.effect === 'haste_play') {
      game._hastePlayActive = true;
      game._hastePlayStartTime = Date.now();
    }
  });
  game.crystalEffects = [];
}

class ShopRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.shopSelectedOwned = null; // { type: 'jokers'|'potions', index: number } 或 null
    this.shopSellBtnRect = null;
    this.shopUseBtnRect = null;
    this.shopOwnedPropRects = [];
    this.sellBtnAnimStart = null;
    this.lastSelectedOwned = null;
    this.shopRefreshRects = [];
    this.shopPriceBtnRects = [];
    this.priceBtnPressed = null; // { index, pressTime }
    this.refreshBtnPressed = null; // { modIdx, pressTime }
    this.rerollBtnPressed = null; // { pressTime }
    this.challengeBtnPressed = false;
    this.challengeBtnPressTime = 0;
    this._buySuccessLeftStars = null;
    this._buySuccessRightStars = null;
  }

  draw(ctx, game, W, H, s) {
    const gold = '#c4a35a';
    const cream = '#f5f0e6';

    // 背景已由 renderer.js 统一绘制，这里只画商店内容
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

    // 按钮不再自动消失（点击其他地方或切换选中才关闭）

    const top = (this.parent.safeTop || 0) + 20;

    // === 已购买道具卡牌栏（6格：左4女巫 + 右2药水，样式复用游戏页）===
    const actualWitchSlots = game.maxJokerSlots || 4;
    const ownedY = top + 16 * s + 2 * s;
    const ownedH = 92 * s;
    this.parent.shopPropBarBottomY = ownedY + ownedH;

    // 栏目宽度固定，card_bar.png 宽度不可变
    const ownedW = W - 30 * s;
    const ownedX = (W - ownedW) / 2;

    // 已购买道具栏背景（优先使用 card_bar.png，按宽度等比例缩放 + 放大，未加载时 fallback 米白色）
    const cardBarData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['card_bar'];
    if (cardBarData && cardBarData.loaded && cardBarData.img) {
      const barAspect = (cardBarData.width > 0 && cardBarData.height > 0)
        ? cardBarData.width / cardBarData.height
        : ownedW / ownedH;
      const targetW = ownedW;
      const imageScale = 1.06;
      const drawW = targetW * imageScale + (actualWitchSlots >= 5 ? 6 : 0);
      const drawH = drawW / barAspect * 1.15;
      const drawX = ownedX + (ownedW - drawW) / 2;
      const drawY = ownedY + (ownedH - drawH) / 2;
      // card_bar 四角圆角裁切
      ctx.save();
      const cbr = 15 * s;
      ctx.beginPath();
      ctx.moveTo(drawX + cbr, drawY);
      ctx.lineTo(drawX + drawW - cbr, drawY);
      ctx.arcTo(drawX + drawW, drawY, drawX + drawW, drawY + drawH, cbr);
      ctx.lineTo(drawX + drawW, drawY + drawH - cbr);
      ctx.arcTo(drawX + drawW, drawY + drawH, drawX, drawY + drawH, cbr);
      ctx.lineTo(drawX + cbr, drawY + drawH);
      ctx.arcTo(drawX, drawY + drawH, drawX, drawY, cbr);
      ctx.lineTo(drawX, drawY + cbr);
      ctx.arcTo(drawX, drawY, drawX + drawW, drawY, cbr);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cardBarData.img, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      this.parent.roundRect(ownedX, ownedY, ownedW, ownedH, 10 * s, '#faf6ee', '#c4a35a');
    }

    // 道具栏布局：4 张时间距充足；5 张时保证最小 1px 间距，内容整体居中，允许左右溢出
    const oPadX = 10 * s;
    const oDividerW = 1.5 * s;
    const BASE_GAP = 6 * s;
    const oSlotTop = 9 * s;
    const rawSlotW = (W - 30 * s - oPadX * 2 - 5 * BASE_GAP - oDividerW) / 6;
    const actualTotalSlots = actualWitchSlots + 2;

    const rawGap = (ownedW - oPadX * 2 - oDividerW - actualTotalSlots * rawSlotW) / (actualTotalSlots - 1);
    const minGap = actualWitchSlots >= 5 ? 0.6 * s : -Infinity;
    const actualGap = Math.max(rawGap, minGap);
    const slotW = rawSlotW;
    const oSlotH = ownedH - oSlotTop - 9 * s;

    const oSlotY = ownedY + oSlotTop;
    const leftGroupW = actualWitchSlots * slotW + (actualWitchSlots - 1) * actualGap;
    const rightGroupW = 2 * slotW + actualGap;
    const ownedContentW = leftGroupW + rightGroupW + oDividerW + actualGap;
    // 内容整体居中：超出栏目时左右自然溢出，但不影响 card_bar 宽度
    const oBaseLeftStartX = ownedX + (ownedW - ownedContentW) / 2;
    const witchRightEdge = oBaseLeftStartX + leftGroupW;
    const oDividerX = witchRightEdge + actualGap / 2 + oDividerW / 2;
    const oBaseRightStartX = oDividerX + oDividerW / 2 + actualGap / 2;

    // 女巫牌左移、药水牌右移，分割线保持不动
    const oWitchShift = 1 * s;
    const oPotionShift = 1 * s;
    const oLeftStartX = oBaseLeftStartX - oWitchShift;
    const oRightStartX = oBaseRightStartX + oPotionShift;

    // 竖分割线（亮金棕色实线 + 菱形）
    ctx.beginPath();
    ctx.moveTo(oDividerX, oSlotY + 2 * s);
    ctx.lineTo(oDividerX, oSlotY + oSlotH - 2 * s);
    ctx.strokeStyle = '#e0c070';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();
    // 菱形装饰
    ctx.save();
    ctx.translate(oDividerX, oSlotY + oSlotH / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#e0c070';
    ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
    ctx.restore();

    const oJokers = game.jokers || [];
    const oPotions = game.potions || [];
    this.shopOwnedPropRects = [];
    this.shopSellBtnRect = null;

    // 左区4格：女巫牌
    // 延迟移除：在循环开始前统一 splice，避免循环中数组变动导致闪烁
    if (game._sellingProp && game._sellingProp.type === 'jokers' && game._sellingProp._shouldRemove) {
      // 记录空位入场动画（缩放弹出 + 果冻感）——空位在数组末尾（移除后的新空位）
      game._emptySlotAppearAnim = { type: 'jokers', index: game.jokers.length - 1, startTime: Date.now() };
      game.jokers.splice(game._sellingProp.index, 1);
      game._sellingProp = null;
    }
    // lerp 工具函数
    const lerp = (a, b, t) => a + (b - a) * t;

    for (let i = 0; i < actualWitchSlots; i++) {
      const sx = oLeftStartX + i * (slotW + actualGap);
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
          slideOffsetX = -(slotW + actualGap) * Easing.easeOutBack(t);
        }
      }

      // === 排序动画目标值计算 ===
      let targetOffsetX = 0;
      let targetOffsetY = 0;
      let targetScale = 1;
      let targetOpacity = 1;
      let targetGlow = 0;
      if (game._jokerSortState) {
        const { fromIndex, insertSlot } = game._jokerSortState;
        if (i === fromIndex) {
          // 被拖动的牌在原位：半透明空位占位
          targetOpacity = 0.25;
        } else {
          // 其他牌：根据 insertSlot 自动腾位置
          if (insertSlot < fromIndex) {
            if (i >= insertSlot && i < fromIndex) targetOffsetX = slotW + actualGap;
          } else if (insertSlot > fromIndex) {
            if (i > fromIndex && i <= insertSlot) targetOffsetX = -(slotW + actualGap);
          }
          targetScale = 1;
          targetOpacity = 0.85;
        }
      }

      // lerp 平滑过渡（持久化在 joker 对象上）
      const speed = (game._jokerSortState && i === game._jokerSortState.fromIndex) ? 0.45 : 0.22;
      if (joker) {
        joker._sortOffsetX = lerp(joker._sortOffsetX || 0, targetOffsetX, speed);
        joker._sortOffsetY = lerp(joker._sortOffsetY || 0, targetOffsetY, speed);
        joker._sortScale = lerp(joker._sortScale || 1, targetScale, speed);
        joker._sortOpacity = lerp(joker._sortOpacity || 1, targetOpacity, speed);
        joker._sortGlow = lerp(joker._sortGlow || 0, targetGlow, speed);
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
        const eased = Easing.easeOutCubic(sellProgress);
        const flyX = -eased * 400 * s;
        const flyY = eased * 30 * s;
        const rotation = -eased * 20;
        ctx.translate(sx + slotW / 2, oSlotY + oSlotH / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-(sx + slotW / 2), -(oSlotY + oSlotH / 2));
        ctx.translate(flyX, flyY);
        this.parent._drawPropCard(ctx, joker, sx, oSlotY, slotW, oSlotH, s, true, false);
        ctx.restore();
      } else if (joker) {
        const isSelected = !game._jokerSortState && this.shopSelectedOwned && this.shopSelectedOwned.type === 'jokers' && this.shopSelectedOwned.index === i;
        const selectedOffsetY = isSelected ? -3 * s : 0;
        const sortX = joker._sortOffsetX || 0;
        const sortY = joker._sortOffsetY || 0;
        const scale = joker._sortScale || 1;
        const opacity = joker._sortOpacity || 1;
        const glow = joker._sortGlow || 0;

        if (game._jokerSortState && game._jokerSortState.fromIndex === i) {
          // 被拖动的牌在原位：绘制半透明空位占位
          ctx.save();
          ctx.globalAlpha = opacity;
          this.parent._drawEmptySlot(ctx, sx + slideOffsetX + sortX, oSlotY + sortY, slotW * scale, oSlotH * scale, s, 'witch');
          ctx.restore();
        } else {
          // 正常牌（排序状态下带轻微抖动）
          ctx.save();
          ctx.globalAlpha = opacity;
          let shakeX = 0;
          let shakeY = 0;
          if (game._jokerSortState) {
            const t = Date.now();
            shakeX = Math.sin(t / 45 + i * 2.1) * 0.6 * s;
            shakeY = Math.cos(t / 45 + i * 1.6) * 0.6 * s;
          }
          // 装备第 2 张女巫牌时的提示抖动：2 张一起轻微抖动 3 秒
          let hintShakeX = 0;
          let hintShakeY = 0;
          if (game._jokerShakeHint) {
            const shakeElapsed = Date.now() - game._jokerShakeHint.startTime;
            if (shakeElapsed < game._jokerShakeHint.duration) {
              const t = Date.now();
              hintShakeX = Math.sin(t / 35 + i * 1.2) * 0.5 * s;
              hintShakeY = Math.cos(t / 40 + i * 0.9) * 0.35 * s;
            } else {
              game._jokerShakeHint = null;
            }
          }
          // 新购入卡牌：缩放弹入动画
          let appearScale = 1;
          if (game._newOwnedProp && game._newOwnedProp.type === 'jokers' && game._newOwnedProp.index === i) {
            const appearElapsed = Date.now() - game._newOwnedProp.startTime;
            const appearDuration = 350;
            if (appearElapsed < appearDuration) {
              appearScale = Math.max(Easing.easeOutBack(appearElapsed / appearDuration), 0.02);
            } else {
              game._newOwnedProp = null;
            }
          }
          const drawW = slotW * scale * appearScale;
          const drawH = oSlotH * scale * appearScale;
          const drawX = sx + slideOffsetX + sortX - (drawW - slotW) / 2 + shakeX + hintShakeX;
          const drawY = oSlotY + selectedOffsetY + sortY - (drawH - oSlotH) / 2 + shakeY + hintShakeY;
          if (glow > 0.01) {
            ctx.shadowColor = `rgba(162,155,254,${glow})`;
            ctx.shadowBlur = 22 * s;
          }
          this.parent._drawPropCard(ctx, joker, drawX, drawY, drawW, drawH, s, true, false);
          // 女巫牌紫色发光蒙层（圆形，覆盖在卡牌上方，中心透明边缘发光）
          ctx.save();
          const jCx = drawX + drawW / 2;
          const jCy = drawY + drawH / 2;
          const jBreath = 0.88 + 0.12 * Math.sin(Date.now() / 400 + i * 0.7);
          const jRadius = Math.max(drawW, drawH) * 0.52 * jBreath;
          const jGrad = ctx.createRadialGradient(jCx, jCy, 0, jCx, jCy, jRadius);
          jGrad.addColorStop(0, `rgba(162, 89, 255, ${0.34 * jBreath})`);
          jGrad.addColorStop(0.55, `rgba(162, 89, 255, ${0.15 * jBreath})`);
          jGrad.addColorStop(1, 'rgba(162, 89, 255, 0)');
          ctx.fillStyle = jGrad;
          ctx.beginPath();
          ctx.arc(jCx, jCy, jRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.restore();

          // 升级小按钮（纯装饰）：卡牌可升级且金币足够时，在右上角显示浮动向上箭头
          if (!game._jokerSortState) {
            const jokerLv = joker.level || 1;
            const upMaxLv = getWitchMaxLevel(joker);
            const canUpCard = (getWitchUpgradeStep(joker) !== undefined || getWitchUpgradeRateStep(joker) !== undefined)
              && (upMaxLv === undefined || jokerLv < upMaxLv);
            const upCost = (jokerLv + 1) * joker.cost;
            if (canUpCard && game.gold >= upCost) {
              const br = 7.5 * s;
              const bcx = drawX + drawW - 2 * s;
              const bcy = drawY + 2 * s;
              // 圆形金底 + 白色描边
              ctx.save();
              ctx.shadowColor = 'rgba(0,0,0,0.25)';
              ctx.shadowBlur = 3 * s;
              ctx.shadowOffsetY = 1 * s;
              ctx.fillStyle = '#c4a35a';
              ctx.beginPath();
              ctx.arc(bcx, bcy, br, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              ctx.save();
              ctx.strokeStyle = 'rgba(255,255,255,0.6)';
              ctx.lineWidth = 1 * s;
              ctx.beginPath();
              ctx.arc(bcx, bcy, br - 0.5 * s, 0, Math.PI * 2);
              ctx.stroke();
              // 白色向上箭头（上下轻微浮动，与详情弹窗升级按钮一致）
              const aw = 8 * s;
              const ah = 8 * s;
              const atop = bcy - ah / 2 + Math.sin(Date.now() / 280) * 1 * s;
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              const headH = ah * 0.55;
              ctx.moveTo(bcx, atop);
              ctx.lineTo(bcx + aw / 2, atop + headH);
              ctx.lineTo(bcx + aw * 0.22, atop + headH);
              ctx.lineTo(bcx + aw * 0.22, atop + ah);
              ctx.lineTo(bcx - aw * 0.22, atop + ah);
              ctx.lineTo(bcx - aw * 0.22, atop + headH);
              ctx.lineTo(bcx - aw / 2, atop + headH);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }

          // 排序状态下不响应点击
          if (!game._jokerSortState) {
            this.shopOwnedPropRects.push({ x: sx + slideOffsetX + sortX, y: oSlotY + selectedOffsetY + sortY, w: slotW, h: oSlotH, index: i, array: 'jokers' });
          }
        }

        // 售出按钮已移至女巫详情弹窗右上角
      } else {
        // 空位：售出后显示缩放弹出 + 果冻感动画
        let emptyScale = 1;
        let emptyAlpha = 1;
        if (game._emptySlotAppearAnim && game._emptySlotAppearAnim.type === 'jokers' && game._emptySlotAppearAnim.index === i) {
          const elapsed = Date.now() - game._emptySlotAppearAnim.startTime;
          const appearDuration = 400;
          if (elapsed < appearDuration) {
            const t = elapsed / appearDuration;
            emptyScale = Easing.easeOutBack(t);
            emptyAlpha = Math.min(t * 1.5, 1);
          }
          if (elapsed >= appearDuration) {
            game._emptySlotAppearAnim = null;
          }
        }
        ctx.save();
        ctx.globalAlpha = emptyAlpha;
        ctx.translate(sx + slotW / 2 + slideOffsetX, oSlotY + oSlotH / 2);
        ctx.scale(emptyScale, emptyScale);
        ctx.translate(-(sx + slotW / 2 + slideOffsetX), -(oSlotY + oSlotH / 2));
        this.parent._drawEmptySlot(ctx, sx + slideOffsetX, oSlotY, slotW, oSlotH, s, 'witch');
        ctx.restore();
        // 空槽位登记点击区（点击弹出「女巫牌」说明弹窗）
        this.shopOwnedPropRects.push({ x: sx + slideOffsetX, y: oSlotY, w: slotW, h: oSlotH, empty: true, kind: 'witch' });
      }
    }

    // 右区2格：药水牌
    // 延迟移除：在循环开始前统一 splice，避免循环中数组变动导致闪烁
    if (game._sellingProp && game._sellingProp.type === 'potions' && game._sellingProp._shouldRemove) {
      // 记录空位入场动画（缩放弹出 + 果冻感）——空位在数组末尾（移除后的新空位）
      game._emptySlotAppearAnim = { type: 'potions', index: game.potions.length - 1, startTime: Date.now() };
      game.potions.splice(game._sellingProp.index, 1);
      game._sellingProp = null;
    }
    for (let i = 0; i < 2; i++) {
      const sx = oRightStartX + i * (slotW + actualGap);
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
          slideOffsetX = -(slotW + actualGap) * Easing.easeOutBack(t);
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
        const eased = Easing.easeOutCubic(sellProgress);
        const flyX = eased * 400 * s;
        const flyY = eased * 30 * s;
        const rotation = eased * 20;
        ctx.translate(sx + slotW / 2, oSlotY + oSlotH / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-(sx + slotW / 2), -(oSlotY + oSlotH / 2));
        ctx.translate(flyX, flyY);
        // 商店已装备栏不显示回合禁用蒙层（disable_potion_card 仅限制回合内使用）
        this.parent._drawPropCard(ctx, potion, sx, oSlotY, slotW, oSlotH, s, false);
        ctx.restore();
      } else if (potion) {
        const isSelected = this.shopSelectedOwned && this.shopSelectedOwned.type === 'potions' && this.shopSelectedOwned.index === i;
        const selectedOffsetY = isSelected ? -3 * s : 0;
        const pDrawX = sx + slideOffsetX;
        const pDrawY = oSlotY + selectedOffsetY;
        // 新购入卡牌：缩放弹入动画
        let pAppearScale = 1;
        if (game._newOwnedProp && game._newOwnedProp.type === 'potions' && game._newOwnedProp.index === i) {
          const appearElapsed = Date.now() - game._newOwnedProp.startTime;
          const appearDuration = 350;
          if (appearElapsed < appearDuration) {
            pAppearScale = Math.max(Easing.easeOutBack(appearElapsed / appearDuration), 0.02);
          } else {
            game._newOwnedProp = null;
          }
        }
        const pDrawW = slotW * pAppearScale;
        const pDrawH = oSlotH * pAppearScale;
        const pDrawCX = pDrawX + slotW / 2;
        const pDrawCY = pDrawY + oSlotH / 2;
        this.parent._drawPropCard(ctx, potion, pDrawCX - pDrawW / 2, pDrawCY - pDrawH / 2, pDrawW, pDrawH, s, false);
        // 药水牌绿色发光蒙层（圆形，覆盖在卡牌上方，中心透明边缘发光）
        ctx.save();
        const pCx = pDrawX + slotW / 2;
        const pCy = pDrawY + oSlotH / 2;
        const pBreath = 0.88 + 0.12 * Math.sin(Date.now() / 400 + i * 0.7);
        const pRadius = Math.max(slotW, oSlotH) * 0.52 * pBreath;
        const pGrad = ctx.createRadialGradient(pCx, pCy, 0, pCx, pCy, pRadius);
        pGrad.addColorStop(0, `rgba(80, 220, 120, ${0.34 * pBreath})`);
        pGrad.addColorStop(0.55, `rgba(80, 220, 120, ${0.15 * pBreath})`);
        pGrad.addColorStop(1, 'rgba(80, 220, 120, 0)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(pCx, pCy, pRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this.shopOwnedPropRects.push({ x: sx + slideOffsetX, y: oSlotY + selectedOffsetY, w: slotW, h: oSlotH, index: i, array: 'potions' });
      } else {
        // 空位：售出后显示缩放弹出 + 果冻感动画
        let emptyScale = 1;
        let emptyAlpha = 1;
        if (game._emptySlotAppearAnim && game._emptySlotAppearAnim.type === 'potions' && game._emptySlotAppearAnim.index === i) {
          const elapsed = Date.now() - game._emptySlotAppearAnim.startTime;
          const appearDuration = 400;
          if (elapsed < appearDuration) {
            const t = elapsed / appearDuration;
            emptyScale = Easing.easeOutBack(t);
            emptyAlpha = Math.min(t * 1.5, 1);
          }
          if (elapsed >= appearDuration) {
            game._emptySlotAppearAnim = null;
          }
        }
        ctx.save();
        ctx.globalAlpha = emptyAlpha;
        ctx.translate(sx + slotW / 2 + slideOffsetX, oSlotY + oSlotH / 2);
        ctx.scale(emptyScale, emptyScale);
        ctx.translate(-(sx + slotW / 2 + slideOffsetX), -(oSlotY + oSlotH / 2));
        this.parent._drawEmptySlot(ctx, sx + slideOffsetX, oSlotY, slotW, oSlotH, s, 'potion');
        ctx.restore();
        // 空槽位登记点击区（点击弹出「魔法药水」说明弹窗）
        this.shopOwnedPropRects.push({ x: sx + slideOffsetX, y: oSlotY, w: slotW, h: oSlotH, empty: true, kind: 'potion' });
      }

      // 售出按钮 + 使用按钮（选中时，带回弹出现动画）
      if (this.shopSelectedOwned && this.shopSelectedOwned.type === 'potions' && this.shopSelectedOwned.index === i && potion && !isSelling) {
        const btnH = 20 * s;
        const selectedOffsetY = -3 * s;
        const btnY = oSlotY + oSlotH + 2 * s + selectedOffsetY;

        // 出现动画（easeOutBack：从卡牌底部向下弹出）
        let appearScale = 1;
        let appearOffsetY = 0;
        if (this.sellBtnAnimStart) {
          const ae = Date.now() - this.sellBtnAnimStart;
          const ap = Math.min(ae / 200, 1);
          const ease = Easing.easeOutBack(ap);
          appearScale = ease;
          appearOffsetY = -(1 - ease) * 8 * s;
        }

        const canUse = ['random_upgrade', 'upgrade_letter', 'replicate_letter', 'equal_split', 'starlight_wash'].includes(potion.effect);

        if (canUse) {
          // 两个按钮并排，宽度保持 slotW 不变，整体以卡牌中心为基准偏移
          const gap = 4 * s;
          const sellBtnW = slotW;
          const useBtnW = slotW;
          const totalW = sellBtnW + gap + useBtnW;
          let baseStartX = sx + slotW / 2 - totalW / 2;
          // 确保使用按钮右边缘不超出屏幕（至少留 2px 间距）
          const useRightEdge = baseStartX + totalW;
          if (useRightEdge > W - 2 * s) {
            baseStartX -= (useRightEdge - (W - 2 * s));
          }
          const startX = baseStartX + totalW * (1 - appearScale) / 2;

          // 售出按钮（红色）
          const sellFinalW = sellBtnW * appearScale;
          const sellFinalH = btnH * appearScale;
          const sellFinalX = startX;
          const sellFinalY = btnY + appearOffsetY + (btnH - sellFinalH) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s * appearScale;
          ctx.shadowOffsetY = 2 * s * appearScale;
          this.parent.roundRect(sellFinalX, sellFinalY, sellFinalW, sellFinalH, 5 * s * appearScale, '#c0392b');
          ctx.restore();

          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s * appearScale;
          ctx.beginPath();
          const sellHighlightY = sellFinalY + 2 * s * appearScale;
          ctx.moveTo(sellFinalX + 3 * s * appearScale, sellHighlightY);
          ctx.lineTo(sellFinalX + sellFinalW - 3 * s * appearScale, sellHighlightY);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(11 * s * Math.max(appearScale, 0.5))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const coinSize = 10 * s * appearScale;
          const sellText = String(Math.round(potion.cost / 2));
          const textW = ctx.measureText(sellText).width;
          const contentW = coinSize + 2 * s + textW;
          const coinStartX = sellFinalX + (sellFinalW - contentW) / 2;
          const midY = sellFinalY + sellFinalH / 2;
          if (this.parent.coinIcon && this.parent.coinIconLoaded) {
            ctx.drawImage(this.parent.coinIcon, coinStartX, midY - coinSize / 2, coinSize, coinSize);
          }
          ctx.fillText(sellText, coinStartX + coinSize + 2 * s + textW / 2, midY);
          ctx.restore();

          // 使用按钮（绿色）
          const useFinalW = useBtnW * appearScale;
          const useFinalH = btnH * appearScale;
          const useFinalX = startX + (sellBtnW + gap) * appearScale;
          const useFinalY = btnY + appearOffsetY + (btnH - useFinalH) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s * appearScale;
          ctx.shadowOffsetY = 2 * s * appearScale;
          this.parent.roundRect(useFinalX, useFinalY, useFinalW, useFinalH, 5 * s * appearScale, '#1e8449');
          ctx.restore();

          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s * appearScale;
          ctx.beginPath();
          const useHighlightY = useFinalY + 2 * s * appearScale;
          ctx.moveTo(useFinalX + 3 * s * appearScale, useHighlightY);
          ctx.lineTo(useFinalX + useFinalW - 3 * s * appearScale, useHighlightY);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(11 * s * Math.max(appearScale, 0.5))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('使用', useFinalX + useFinalW / 2, useFinalY + useFinalH / 2);
          ctx.restore();

          this.shopSellBtnRect = { x: sellFinalX, y: sellFinalY, w: sellFinalW, h: sellFinalH, index: i, array: 'potions' };
          this.shopUseBtnRect = { x: useFinalX, y: useFinalY, w: useFinalW, h: useFinalH, index: i, array: 'potions', effect: potion.effect };
        } else {
          // 仅售出按钮（不可使用的药水）
          const finalW = slotW * appearScale;
          const finalH = btnH * appearScale;
          const finalX = sx + (slotW - finalW) / 2;
          const finalY = btnY + appearOffsetY + (btnH - finalH) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s * appearScale;
          ctx.shadowOffsetY = 2 * s * appearScale;
          this.parent.roundRect(finalX, finalY, finalW, finalH, 5 * s * appearScale, '#c0392b');
          ctx.restore();

          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s * appearScale;
          ctx.beginPath();
          const singleHighlightY = finalY + 2 * s * appearScale;
          ctx.moveTo(finalX + 3 * s * appearScale, singleHighlightY);
          ctx.lineTo(finalX + finalW - 3 * s * appearScale, singleHighlightY);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(11 * s * Math.max(appearScale, 0.5))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const coinSize = 10 * s * appearScale;
          const sellText = String(Math.round(potion.cost / 2));
          const textW = ctx.measureText(sellText).width;
          const contentW = coinSize + 2 * s + textW;
          const startX = finalX + (finalW - contentW) / 2;
          const midY = finalY + finalH / 2;
          if (this.parent.coinIcon && this.parent.coinIconLoaded) {
            ctx.drawImage(this.parent.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
          }
          ctx.fillText(sellText, startX + coinSize + 2 * s + textW / 2, midY);
          ctx.restore();

          this.shopSellBtnRect = { x: sx, y: btnY, w: slotW, h: btnH, index: i, array: 'potions' };
          this.shopUseBtnRect = null;
        }
      }
    }

    // === 绘制被拖动的女巫牌（排序状态）===
    if (game._jokerSortState) {
      const state = game._jokerSortState;
      const joker = game.jokers[state.fromIndex];
      if (joker) {
        ctx.save();
        ctx.shadowColor = 'rgba(155,89,182,0.7)';
        ctx.shadowBlur = 24 * s;
        const LIFT_SCALE = 1.08;
        const LIFT_Y = -16 * s;
        const scaledW = slotW * LIFT_SCALE;
        const scaledH = oSlotH * LIFT_SCALE;
        const drawX = state.currentX - scaledW / 2;
        const drawY = state.currentY - scaledH / 2 + LIFT_Y;
        this.parent._drawPropCard(ctx, joker, drawX, drawY, scaledW, scaledH, s, true, false);
        ctx.restore();
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
    const rowGap = 30;                    // 行间距（像素）
    const containerPadTop = 20;           // 容器顶部内边距（像素），第一行上移 5px
    const containerPadBottom = 23;        // 容器底部内边距（像素），第三行到底部减 2px
    const titleH = 50 * s;
    const titleGap = 6 * s;

    const rowConfigs = [
      { title: '女巫牌', color: '#5c4574', rowBg: '#f0e8f5', type: 'witch', barKey: 'shop_card_bar_witch' },
      { title: '水晶球牌', color: '#354e6f', rowBg: '#e8eef5', type: 'crystal', barKey: 'shop_card_bar_crystal' },
      { title: '魔法药水牌', color: '#355c4e', rowBg: '#e8f5ee', type: 'potion', barKey: 'shop_card_bar_potion' },
    ];

    const containerH = rowConfigs.length * rowH + (rowConfigs.length - 1) * rowGap + containerPadTop + containerPadBottom;
    const containerY = ownedY + ownedH + 10 * s + titleH + titleGap - 15 * s + 5;

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
    const decoLineW = (60 * s - 10) * 2;
    const lineY = titleMidY - 0.7*s;
    ctx.lineWidth = 1 * s;

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

    // === 全局重掷按钮（卡牌商店标题右侧）===
    const rerollBtnH = 24 * s;
    const rerollCoinSize = 14 * s;
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    const rerollText = '重掷';
    const rerollTextW = ctx.measureText(rerollText).width;
    const costText = '3';
    const costTextW = ctx.measureText(costText).width;
    const rerollBtnPadX = 6 * s;
    const textToCoinGap = 4 * s;
    const coinToNumGap = 4 * s - 1;
    const contentW = rerollTextW + textToCoinGap + rerollCoinSize + coinToNumGap + costTextW;
    const rerollBtnW = rerollBtnPadX * 2 + contentW - 3;
    const rerollBtnX = modX + modW - rerollBtnW - 6 * s + 9;

    // 判断余额是否足够
    const canAfford = game.gold >= 3;

    // 按下偏移（仅余额充足时生效）
    let rerollPressOffset = 0;
    if (canAfford && this.rerollBtnPressed) {
      const pe = Date.now() - this.rerollBtnPressed.pressTime;
      if (pe < 150) rerollPressOffset = 1 * s;
    }

    const rerollBtnY = titleMidY - rerollBtnH / 2 - 1 + rerollPressOffset + 10 + 3 + 2 + 1 + 1 + 1;
    const btnColor = canAfford ? '#FFF1D4' : '#e0e0e0';
    const textColor = canAfford ? '#8b6914' : '#999';

    // 按钮背景（复用金币购买按钮 active 样式）
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4 * s;
    ctx.shadowOffsetY = 2 * s;
    this.parent.roundRect(rerollBtnX, rerollBtnY, rerollBtnW, rerollBtnH, 9 * s, btnColor);
    ctx.restore();

    // 顶部高光条
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(rerollBtnX + 4 * s, rerollBtnY + 2 * s);
    ctx.lineTo(rerollBtnX + rerollBtnW - 4 * s, rerollBtnY + 2 * s);
    ctx.stroke();
    ctx.restore();

    // 重掷 + 金币图标 + 3（整体居中）
    const contentStartX = rerollBtnX + (rerollBtnW - contentW) / 2;
    const midY = rerollBtnY + rerollBtnH / 2;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(rerollText, contentStartX, midY);
    let curX = contentStartX + rerollTextW + textToCoinGap;
    if (this.parent.coinIcon && this.parent.coinIconLoaded) {
      ctx.drawImage(this.parent.coinIcon, curX, midY - rerollCoinSize / 2, rerollCoinSize, rerollCoinSize);
    }
    curX += rerollCoinSize + coinToNumGap;
    ctx.fillText(costText, curX, midY);

    // 记录全局重掷按钮点击区域
    this.shopGlobalRerollBtnRect = { x: rerollBtnX - 2, y: rerollBtnY - 2, w: rerollBtnW + 4, h: rerollBtnH + 4 };

    ctx.restore();

    // 大容器（奶油色边框包裹三行，左右各外扩 3px）—— 暂时隐藏
    // this.parent.roundRect(modX - 3, containerY, modW + 6, containerH, 10 * s, cream, gold, 1.5 * s);

    rowConfigs.forEach((mod, modIdx) => {
      const rowY = containerY + containerPadTop + modIdx * (rowH + rowGap);

      // 行背景：优先使用 bg_icon 分类栏图片，未加载完成则回退到 canvas 绘制
      const barImgData = this.parent.shopCardBarImages && this.parent.shopCardBarImages[mod.barKey];
      const barImgLoaded = barImgData && barImgData.width > 0 && barImgData.height > 0;
      const rowX = modX + innerPad;
      const rowW = modW - innerPad * 2;
      if (barImgLoaded) {
        ctx.save();
        // 各分类栏图片绘制区域微调：女巫牌宽度+10s/高度+2s；魔法药水牌宽度-4s/高度+4s；水晶球不变
        let targetX = rowX;
        let targetY = rowY;
        let targetW = rowW;
        let targetH = rowH;
        if (mod.type === 'witch') {
          targetW = rowW + 24 * s;
          targetH = rowH + 28 * s;
          targetX = rowX - 12 * s;
          targetY = rowY - 16 * s;
        } else if (mod.type === 'crystal') {
          targetW = rowW + 24 * s;
          targetH = rowH + 28 * s;
          targetX = rowX - 12 * s;
          targetY = rowY - 15 * s;
        }else if (mod.type === 'potion') {
          targetW = rowW + 24 * s;
          targetH = rowH + 28 * s;
          targetX = rowX -12 * s;
          targetY = rowY - 15 * s;
        }
        const r = 6 * s;
        ctx.beginPath();
        ctx.moveTo(targetX + r, targetY);
        ctx.lineTo(targetX + targetW - r, targetY);
        ctx.quadraticCurveTo(targetX + targetW, targetY, targetX + targetW, targetY + r);
        ctx.lineTo(targetX + targetW, targetY + targetH - r);
        ctx.quadraticCurveTo(targetX + targetW, targetY + targetH, targetX + targetW - r, targetY + targetH);
        ctx.lineTo(targetX + r, targetY + targetH);
        ctx.quadraticCurveTo(targetX, targetY + targetH, targetX, targetY + targetH - r);
        ctx.lineTo(targetX, targetY + r);
        ctx.quadraticCurveTo(targetX, targetY, targetX + r, targetY);
        ctx.closePath();
        ctx.clip();
        // 直接拉伸填充到目标区域，不保持图片比例，确保 targetW/targetH 绝对生效
        ctx.drawImage(barImgData, targetX, targetY, targetW, targetH);
        ctx.restore();
      } else {
        const rowBorderColors = { witch: '#e0d0e8', crystal: '#d0d8e0', potion: '#d0e0d8' };
        this.parent.roundRect(rowX, rowY, rowW, rowH, 6 * s, mod.rowBg, rowBorderColors[mod.type], 1 * s);

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
      }

      // 2 个商品单元（左右各一）
      for (let i = 0; i < 2; i++) {
        const itemIdx = modIdx * 2 + i;
        const item = game.shopItems[itemIdx];
        if (!item) continue;

        const unitX = modX + modPad + i * (unitW + cardGap) + (i === 1 ? 2 : 0);
        const unitY = rowY + 3 * s + 2 * s + 1 * s;

        // 两个单元之间的分隔线
        if (i === 1) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(unitX - cardGap / 2, unitY + 10 * s);
          ctx.lineTo(unitX - cardGap / 2, unitY + unitH - 10 * s);
          ctx.strokeStyle = 'rgba(250, 245, 232, 0.55)';
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();
          ctx.restore();
        }

        // 竖向卡牌（cover 模式绘制图标，金色边框，无额外深色背景）
        const cardX = unitX + 1 * s;
        // 非常轻微的上下飘动（1px 幅度），相邻卡牌错开相位
        const floatY = Math.sin(Date.now() / 650 + itemIdx * 1.3) * 1 * s;
        const cardY = unitY + (unitH - cardH) / 2 + floatY;
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
        // 彩虹箔光：商店商品卡牌统一添加对角线彩虹渐变流光
        this.parent._drawRainbowFoil(ctx, cardX, cardY, cardW, cardH, cardR, s);
        ctx.restore();

        // 文字区域（卡牌右侧，淡色行背景上 → 深色文字）
        const textX = unitX + cardW + 8 * s;
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
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
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
        drawWrappedText(ctx, formatItemDesc(item), textX, descY, textMaxW, 13 * s);
        ctx.restore();

        // 价格按钮（暖米色，金币图标+价格）
        const btnH = 20 * s + 1;
        const btnY = unitY + unitH - btnH - 10 * s + 2 * s + 1 * s + 1; // 整体下移 4px
        const coinSize = 13 * s;
        const finalCost = game._shopDiscountActive ? Math.floor(item.cost * game._shopDiscountRate) : item.cost;
        const canAfford = game.gold >= finalCost;

        // 检查槽位上限（upgrade_letter 和 random_upgrade 药水不受药水槽位限制）
        const isWitch = item.type === 'witch';
        const isPotion = item.type === 'potion';
        const isAlwaysBuyablePotion = isPotion && ['upgrade_letter', 'random_upgrade', 'replicate_letter', 'equal_split', 'starlight_wash'].includes(item.effect);
        const witchFull = (game.jokers || []).length >= game.maxJokerSlots;
        const potionFull = (game.potions || []).length >= 2;
        const isWitchFull = isWitch && witchFull;
        const isPotionFull = isPotion && potionFull && !isAlwaysBuyablePotion;
        const atLimit = isWitchFull || isPotionFull;

        // 女巫牌满时仍显示正常价格（点击后进提示弹窗），药水满时显示"已达上限"
        let btnText, showCoin;
        if (!canAfford) {
          btnText = '余额不足';
          showCoin = true;
        } else if (isPotionFull) {
          btnText = '已达上限';
          showCoin = false;
        } else {
          btnText = String(finalCost);
          showCoin = true;
        }
        const isActive = canAfford && !isPotionFull;

        // 先计算按钮宽度
        ctx.save();
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        const priceTextW = ctx.measureText(btnText).width;
        ctx.restore();
        const contentW = showCoin ? coinSize + 4 * s + priceTextW : priceTextW;
        const btnExtraW = isActive ? 23 : 13; // 灰色状态左右各-5px
        // 可购买 / 余额不足：统一固定宽度（74*s 可容纳金币图标+"余额不足"）；已达上限保持动态宽度
        const ACTIVE_BTN_W = 74 * s;
        const useFixedWidth = isActive || !canAfford;
        const btnW = useFixedWidth ? ACTIVE_BTN_W : contentW + 16 * s + btnExtraW;
        const btnX = textX + 2;

        let pressOffset = 0;
        const isPressed = this.priceBtnPressed && this.priceBtnPressed.index === itemIdx;
        if (isPressed) {
          const pe = Date.now() - this.priceBtnPressed.pressTime;
          if (pe < 150) pressOffset = 2 * s;
        }

        // 按钮投影 + 背景（所有状态都有阴影）
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.parent.roundRect(btnX, btnY + pressOffset, btnW, btnH, 8 * s, isActive ? '#FFF1D4' : '#e0e0e0');
        ctx.restore();

        // 顶部高光条（所有状态都有）
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.moveTo(btnX + 4 * s, btnY + 2 * s + pressOffset);
        ctx.lineTo(btnX + btnW - 4 * s, btnY + 2 * s + pressOffset);
        ctx.stroke();
        ctx.restore();

        // 金币图标 + 文案（整体居中）
        const midY = btnY + btnH / 2 + pressOffset;
        // 统一按钮文字字号，避免 else 分支继承不确定的 ctx.font 状态
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        if (game._shopDiscountActive && isActive) {
          // 显示原价（灰色删除线）+ 折后价
          const originalText = String(item.cost);
          const discountText = String(finalCost);
          ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
          const originalW = ctx.measureText(originalText).width;
          ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
          const discountW = ctx.measureText(discountText).width;
          const innerGap = 4 * s;
          const totalTextW = originalW + innerGap + discountW;
          const totalContentW = showCoin ? coinSize + 4 * s + totalTextW : totalTextW;
          const contentStartX = btnX + (btnW - totalContentW) / 2;
          if (showCoin && this.parent.coinIcon && this.parent.coinIconLoaded) {
            ctx.drawImage(this.parent.coinIcon, contentStartX, midY - coinSize / 2, coinSize, coinSize);
          }
          const textStartX = showCoin ? contentStartX + coinSize + 4 * s : contentStartX;
          // 原价（灰色，删除线）
          ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
          ctx.fillStyle = '#aaa';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(originalText, textStartX, midY);
          ctx.strokeStyle = '#aaa';
          ctx.lineWidth = 1 * s;
          ctx.beginPath();
          ctx.moveTo(textStartX - 1 * s, midY);
          ctx.lineTo(textStartX + originalW + 1 * s, midY);
          ctx.stroke();
          // 折后价
          ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#8b6914';
          ctx.fillText(discountText, textStartX + originalW + innerGap, midY);
        } else {
          const contentStartX = btnX + (btnW - contentW) / 2;
          if (showCoin && this.parent.coinIcon && this.parent.coinIconLoaded) {
            ctx.drawImage(this.parent.coinIcon, contentStartX, midY - coinSize / 2, coinSize, coinSize);
          }
          ctx.fillStyle = isActive ? '#8b6914' : '#999';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const btnTextX = showCoin ? contentStartX + coinSize + 4 * s : contentStartX;
          ctx.fillText(btnText, btnTextX, midY);
        }

        // 折扣标签（右上角）：5折使用本地 discount.png，其他折扣使用雪碧图
        const discountRate = game._shopDiscountRate || 0.8;
        if (game._shopDiscountActive && Math.abs(discountRate - 0.5) < 0.01 && this.parent.discountIcon && this.parent.discountIconLoaded) {
          const tagSize = 22 * s;
          const tagX = btnX + btnW - tagSize * 0.55;
          const tagY = btnY - tagSize * 0.45 + pressOffset;
          ctx.save();
          ctx.drawImage(this.parent.discountIcon, tagX, tagY, tagSize, tagSize);
          ctx.restore();
        } else if (game._shopDiscountActive) {
          const sheet = this.parent.discountSpritesheet;
          if (sheet && this.parent.discountSpritesheetLoaded) {
            const tagW = 20 * s;
            const tagH = tagW;
            const tagX = btnX + btnW - tagW * 0.7;
            const tagY = btnY - tagH * 0.5 + pressOffset;
            const discountLevel = Math.max(6, Math.min(9, Math.round(discountRate * 10)));
            const frameIndex = discountLevel - 6;
            const frameW = 100;
            const frameH = 100;
            const sx = frameIndex * frameW;
            ctx.save();
            ctx.drawImage(sheet, sx, 0, frameW, frameH, tagX, tagY, tagW, tagH);
            ctx.restore();
          }
        }

        this.shopPriceBtnRects.push({ x: btnX - 2, y: btnY - 2, w: btnW + 4, h: btnH + 4, index: itemIdx });
      }

      // 两张卡牌都售罄时，在行中间显示灰色提示
      const itemIdx0 = modIdx * 2;
      const itemIdx1 = modIdx * 2 + 1;
      if (!game.shopItems[itemIdx0] && !game.shopItems[itemIdx1]) {
        ctx.save();
        ctx.fillStyle = 'rgba(120, 120, 120, 0.9)';
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已售罄，请重掷商店...', rowX + rowW / 2, rowY + rowH / 2);
        ctx.restore();
      }
    });

    // === 下一回合女巫技能模块 ===
    const nextRound = game.round + 1;
    const witchSkill = getSkillForLevel(nextRound, game._shuffledSkills);

    // === 下一回合模块（始终显示）===
    const moduleH = witchSkill ? 113 * s : 100 * s;
    const moduleY = containerY + containerH + 50 * s - 5 - 5;
    const moduleX = 15 * s;
    const moduleW = W - 30 * s;

    // —— 下一回合 —— 标题（参照卡牌商店样式）
    const nrPrefix = '下一回合：';
    const nrNumber = String(game.round + 1);
    ctx.save();
    ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textBaseline = 'middle';
    const nrTitleY = moduleY - 14 * s;
    const nrPrefixW = ctx.measureText(nrPrefix).width;
    const nrNumberW = ctx.measureText(nrNumber).width;
    const nrTitleW = nrPrefixW + nrNumberW;
    const nrTitleIconSize = 14 * s;
    const nrTitleIconGap = 6 * s;
    const nrTitleTotalW = nrTitleIconSize * 2 + nrTitleIconGap * 2 + nrTitleW;
    const nrTitleStartX = (W - nrTitleTotalW) / 2;
    const textBaseX = nrTitleStartX + nrTitleIconSize + nrTitleIconGap;

    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      ctx.drawImage(this.parent.shopIcon, nrTitleStartX, nrTitleY - nrTitleIconSize / 2 - 1 * s, nrTitleIconSize, nrTitleIconSize);
    }
    // 中文和冒号下移 2px，数字保持不动
    ctx.textAlign = 'left';
    ctx.fillText(nrPrefix, textBaseX, nrTitleY - 1);
    ctx.fillText(nrNumber, textBaseX + nrPrefixW, nrTitleY - 2);
    if (this.parent.shopIcon && this.parent.shopIconLoaded) {
      const nrRightIconX = nrTitleStartX + nrTitleIconSize + nrTitleIconGap + nrTitleW + nrTitleIconGap;
      ctx.save();
      ctx.translate(nrRightIconX + nrTitleIconSize, nrTitleY - nrTitleIconSize / 2 - 1 * s);
      ctx.scale(-1, 1);
      ctx.drawImage(this.parent.shopIcon, 0, 0, nrTitleIconSize, nrTitleIconSize);
      ctx.restore();
    }

    // 左右米色细线装饰（内浓外淡渐变）
    const nrDecoLineW = 60 * s - 10;
    const nrLineY = nrTitleY - 0.7*s;
    ctx.lineWidth = 0.9 * s;

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
    // 保存模块位置供商店引导聚光灯使用
    this.shopGuideSpotRect = { x: moduleX, y: moduleY, w: moduleW, h: moduleH };

    // 目标分数行
    const targetY = moduleY + 20 * s;
    ctx.save();
    const tsIconSize = 20 * s;
    if (this.parent.targetScoreIconLoaded && this.parent.targetScoreIcon) {
      ctx.drawImage(this.parent.targetScoreIcon, moduleX + 18 * s, targetY - tsIconSize / 2 - 1 * s, tsIconSize, tsIconSize);
    }
    ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('目标分数', moduleX + 18 * s + tsIconSize + 4 * s, targetY);
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const baseTarget = calcBaseTarget(game.round + 1);
    const targetTextX = moduleX + moduleW - 18 * s;

    // 目标分显示（支持目标减免 / 生命延续 脉冲动画）
    let displayTarget = baseTarget;
    let targetScale = 1;

    // 生命延续：放大缩小脉冲，中点切换数字（复用目标减免效果）
    if (game._lifeExtensionTargetAnim) {
      const pulse = this.parent._calcPulseScale(game._lifeExtensionTargetAnim, 0.2);
      targetScale = pulse.scale;
      const bonus = game._lifeExtensionBonus || 0;
      displayTarget = pulse.progress >= 0.5 ? (baseTarget + bonus) : baseTarget;
      if (pulse.progress >= 1) {
        game._lifeExtensionTargetAnim = null;
      }
    } else if (game._reduceTargetAnim) {
      // 目标减免：放大缩小过程中数字从旧值变为新值
      const reducedTarget = Math.floor(baseTarget * game._reduceTargetAnim.value);
      if (game._reduceTargetAnim.startTime) {
        const pulse = this.parent._calcPulseScale(game._reduceTargetAnim, 0.2);
        targetScale = pulse.scale;
        displayTarget = pulse.progress >= 0.5 ? reducedTarget : baseTarget;
      } else {
        displayTarget = baseTarget;
      }
    }
    // 生命延续加成（无动画时直接显示）
    if (game._lifeExtensionBonus && !game._lifeExtensionTargetAnim) {
      displayTarget += game._lifeExtensionBonus;
    }

    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.translate(targetTextX, targetY);
    ctx.scale(targetScale, targetScale);
    ctx.fillText(`${displayTarget} 分`, 0, 0);
    ctx.restore();

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

    // 挑战按钮（整体放大一点）
    const challengeBtnW = 100 * s;
    const challengeBtnH = 44 * s;
    let challengeBtnX, challengeBtnY;

    if (witchSkill) {
      // 女巫头像
      const avatarSize = 56 * s;
      const avatarX = moduleX + 18 * s;
      const avatarY = dividerY + 12 * s;
      const witchAvatar = this.parent.witchAvatars[`witch_${witchSkill.level}`];

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
      challengeBtnX = moduleX + moduleW - challengeBtnW - 18 * s + 2;
      const textMaxW = challengeBtnX - textX - 10 * s;

      let skillY = dividerY + 18 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#6a1b9a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const skillTitleText = '女巫试炼';
      const skillTitleWidth = ctx.measureText(skillTitleText).width;
      const hasWitchReward = witchSkill && witchSkill.has_reward !== false;
      const giftIconSize = 17 * s;
      const giftGap = 4 * s;
      const titleDrawX = hasWitchReward ? textX : textX;
      const titleDrawY = skillY + 2 * s;
      ctx.fillText(skillTitleText, titleDrawX, titleDrawY);

      // 下一回合有女巫奖励时，在"女巫试炼"文字右侧绘制礼物图标并做呼吸缩放动画
      if (hasWitchReward && this.parent.witchGiftIcon && this.parent.witchGiftIconLoaded) {
        const giftBaseScale = 1;
        const breathScale = 0.05;
        const breathProgress = (Date.now() % 1200) / 1200;
        const scale = giftBaseScale + Math.sin(breathProgress * Math.PI * 2) * breathScale;
        const giftDrawX = titleDrawX + skillTitleWidth + giftGap + giftIconSize / 2;
        const giftDrawY = titleDrawY;
        ctx.save();
        ctx.translate(giftDrawX, giftDrawY);
        ctx.scale(scale, scale);
        ctx.drawImage(this.parent.witchGiftIcon, -giftIconSize / 2, -giftIconSize / 2, giftIconSize, giftIconSize);
        ctx.restore();
      }
      ctx.restore();
      skillY += 16 * s;

      ctx.save();
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const descH = drawWrappedText(ctx, witchSkill.desc, textX, skillY + 5 * s, textMaxW, 13 * s);
      ctx.restore();
      skillY += descH + 4 * s;

      // 隐藏奖励内容（女巫礼盒改为3选1交互后不再提前展示）
      // if (witchSkill.reward_desc) {
      //   ctx.save();
      //   ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
      //   ctx.fillStyle = '#5a4a2a';
      //   ctx.textAlign = 'left';
      //   ctx.textBaseline = 'middle';
      //   ctx.fillText('奖励', textX, skillY);
      //   ctx.restore();
      //   skillY += 16 * s;
      //
      //   ctx.save();
      //   ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      //   ctx.fillStyle = '#8b7d5a';
      //   ctx.textAlign = 'left';
      //   ctx.textBaseline = 'middle';
      //   drawWrappedText(ctx, witchSkill.reward_desc, textX, skillY, textMaxW, 13 * s);
      //   ctx.restore();
      // }

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

    // === 二次确认气泡框（点击价格按钮后弹出）===
    if (game._buyConfirmPopup) {
      const popup = game._buyConfirmPopup;
      const elapsed = Date.now() - popup.startTime;
      const enterDuration = 250;
      const t = Math.min(elapsed / enterDuration, 1);
      const ease = Easing.easeOutBack(t);

      // 找到对应价格按钮的位置
      const priceBtnRect = this.shopPriceBtnRects.find(r => r.index === popup.itemIndex);
      if (priceBtnRect) {
        const bubbleW = 200 * s;
        const bubbleH = popup.witchFull ? 92 * s : 84 * s;
        const triangleH = 8 * s;
        const bubbleX = Math.max(10 * s, Math.min(W - bubbleW - 10 * s, priceBtnRect.x + priceBtnRect.w / 2 - bubbleW / 2));
        const bubbleY = priceBtnRect.y + priceBtnRect.h + triangleH + 2;

        // 入场动画：从下方弹出 + 淡入
        const offsetY = (1 - ease) * 15 * s;
        const finalBubbleY = bubbleY + offsetY;
        const alpha = t;

        ctx.save();
        ctx.globalAlpha = alpha;

        // 气泡背景 + 边框（带外部阴影）
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.14)';
        ctx.shadowBlur = 3 * s;
        ctx.shadowOffsetY = 5 * s;
        ctx.shadowOffsetX = 0;
        this.parent.roundRect(bubbleX, finalBubbleY, bubbleW, bubbleH, 10 * s, '#faf6ee', '#c4a35a', 2.0 * s);
        ctx.restore();

        // 顶部小三角（向上指向价格按钮）—— 实心三角形，颜色与边框一致
        ctx.save();
        const tx = priceBtnRect.x + priceBtnRect.w / 2;
        const ty = finalBubbleY;
        ctx.fillStyle = '#c4a35a';
        ctx.beginPath();
        ctx.moveTo(tx - 10 * s, ty);
        ctx.lineTo(tx + 10 * s, ty);
        ctx.lineTo(tx, ty - triangleH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (popup.witchFull) {
          // 女巫牌槽位已满提示
          const jokerCount = (game.jokers || []).length;
          const maxSlots = game.maxJokerSlots;
          const tipText = `女巫牌槽位已达上限（${jokerCount}/${maxSlots}），请先售出一张`;
          ctx.save();
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#8b4513';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const tipMaxW = bubbleW - 20 * s;
          const tipLineHeight = 16 * s;
          const tipY = finalBubbleY + 14 * s;
          drawWrappedText(ctx, tipText, bubbleX + bubbleW / 2, tipY, tipMaxW, tipLineHeight);
          ctx.restore();
        } else {
          // 标题文字
          const popupFinalCost = game._shopDiscountActive ? Math.floor(popup.item.cost * game._shopDiscountRate) : popup.item.cost;
          const isCrystalBall = popup.item.type === 'crystal';
          const confirmText = isCrystalBall
            ? `花费 ${popupFinalCost} 金币购买此卡牌，并立即生效？`
            : `花费 ${popupFinalCost} 金币购买此卡牌？`;
          ctx.save();
          const confirmFontSize = isCrystalBall ? 11 : 13;
          ctx.font = `bold ${Math.floor(confirmFontSize * s)}px sans-serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(confirmText, bubbleX + bubbleW / 2, finalBubbleY + 24 * s);
          ctx.restore();
        }

        // 按钮区域
        const btnW = 72 * s;
        const btnH = popup.witchFull ? 26 * s : 28 * s;
        const btnY = popup.witchFull ? finalBubbleY + 54 * s : finalBubbleY + 42 * s;

        if (!popup.witchFull) {
          // 确认按钮（金色，与"生效"按钮同色）
          const gap = 10 * s;
          const totalBtnW = btnW * 2 + gap;
          const cancelX = bubbleX + (bubbleW - totalBtnW) / 2;
          const confirmX = cancelX + btnW + gap;

          let confirmPressOffset = 0;
          if (game._buyConfirmBtnPressed) {
            const cpe = Date.now() - game._buyConfirmBtnPressTime;
            if (cpe < 150) confirmPressOffset = 2 * s;
          }
          const confirmBtnY = btnY + confirmPressOffset;

          // 投影
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.22)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.parent.roundRect(confirmX, confirmBtnY, btnW, btnH, 6 * s, '#c4a35a', '#a08030', 1 * s);
          ctx.restore();

          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          ctx.moveTo(confirmX + 4 * s, confirmBtnY + 2 * s);
          ctx.lineTo(confirmX + btnW - 4 * s, confirmBtnY + 2 * s);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('确认', confirmX + btnW / 2, confirmBtnY + btnH / 2);
          ctx.restore();

          // 取消按钮（米色）

          // 投影
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.22)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.parent.roundRect(cancelX, btnY, btnW, btnH, 6 * s, '#f5f0e6', '#d4b87a', 1 * s);
          ctx.restore();

          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          ctx.moveTo(cancelX + 4 * s, btnY + 2 * s);
          ctx.lineTo(cancelX + btnW - 4 * s, btnY + 2 * s);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('取消', cancelX + btnW / 2, btnY + btnH / 2);
          ctx.restore();

          // 记录按钮 hitTest 区域
          popup.confirmRect = { x: confirmX, y: btnY, w: btnW, h: btnH };
          popup.cancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
        } else {
          // 女巫牌已满：只有一个取消按钮，居中
          const cancelX = bubbleX + (bubbleW - btnW) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.22)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.parent.roundRect(cancelX, btnY, btnW, btnH, 6 * s, '#f5f0e6', '#d4b87a', 1 * s);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          ctx.moveTo(cancelX + 4 * s, btnY + 2 * s);
          ctx.lineTo(cancelX + btnW - 4 * s, btnY + 2 * s);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('取消', cancelX + btnW / 2, btnY + btnH / 2);
          ctx.restore();

          popup.confirmRect = null;
          popup.cancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
        }

        ctx.restore();
      }
    }
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
    const closeProgress = isClosing ? Math.min(closeElapsed / 200, 1) : 0;
    if (isClosing && closeProgress >= 1) {
      game.confirmBuyItem = null;
      game._closingConfirmBuy = false;
      game._confirmBuySuccess = false;
      game._confirmBuyItemData = null;
      this._successAnimStarted = false;
      if (game._reduceTargetAnim && !game._reduceTargetAnim.startTime) {
        game._reduceTargetAnim.startTime = Date.now();
      }
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
    const enterEase = Easing.easeOutBack(enterProgress);
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
    const contentFade = Easing.fadeIn(elapsed, contentDelay, 250, 10 * s);
    const contentAlpha = contentFade.alpha;
    const contentYShift = contentFade.yShift;

    const iconName = item.trigger || item.effect;
    const iconData = this.parent.shopCardImages[iconName];

    if (isSuccess) {
      this._drawSuccessPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha, elapsed);
    } else {
      this._drawConfirmPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha);
    }

    ctx.restore();
  }

  _drawSuccessPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha, elapsed) {
    const gold = '#c4a35a';
    const darkBlue = '#1a2f4a';

    // === 标题：购买成功 ===
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('购买成功', W / 2, py + 38 * s + contentYShift);
    ctx.restore();

    // === 标题下装饰线 ===
    const decoLineY = py + 56 * s + contentYShift;
    const decoLineW = pw * 0.5;
    const decoLineX = px + (pw - decoLineW) / 2;
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    this.parent._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: gold });
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

    // === 卡牌背后金色呼吸光晕（在卡牌图片之前绘制，只画光晕不画四角星）===
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    const glowBreathe = 1.1 + 0.5 * Math.sin(elapsed / 480);
    this.parent._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s, glowBreathe, { sparkles: false });
    ctx.restore();

    // === 卡牌图片（带金色边框 + 高光）===
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;

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

    // === 光彩夺目效果（金色脉动光晕 + 四角闪烁星）===
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    this.parent._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s, 0.45);
    ctx.restore();

    // === 卡牌左右闪烁星星 ===
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    const starW = 36 * s;
    const starH = cardH * 1.1;
    const leftCX = cardX - 22 * s;
    const rightCX = cardX + cardW + 22 * s;
    this._buySuccessLeftStars = this.parent._drawSparkleStars(
      ctx, leftCX, cardCY, starW, starH, s, elapsed, 6, this._buySuccessLeftStars, 1, 0.75
    );
    this._buySuccessRightStars = this.parent._drawSparkleStars(
      ctx, rightCX, cardCY, starW, starH, s, elapsed, 6, this._buySuccessRightStars, 1, 0.75
    );
    ctx.restore();

    // === 底部飘带图片 ===
    let bandH = 0;
    if (this.parent.buySuccessBandImg && this.parent.buySuccessBandLoaded) {
      ctx.save();
      ctx.globalAlpha = contentAlpha * closeAlpha;
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
    ctx.globalAlpha = contentAlpha * closeAlpha;
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, W / 2, nameY);
    ctx.restore();

    // === 卡牌描述 ===
    const descY = nameY + 24 * s;
    const descMaxW = pw - 40 * s; // 留出左右边距
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const descLineHeight = 15 * s;
    const descH = drawWrappedText(ctx, formatItemDesc(item), W / 2, descY, descMaxW, descLineHeight);
    ctx.restore();

    // === 按钮 ===
    const collectBtnH = 44 * s;
    const collectBtnY = py + ph - collectBtnH - 22 * s;

    // === 底部分隔线 ===
    const bottomLineY = collectBtnY - 5 * s;
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
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
    const cpe = game._successBtnPressed ? Date.now() - (game._successBtnPressTime || 0) : 0;

    const isPotion = item.type === 'potion';
    // 字母置换 / 吸星大法：只能在游戏中使用，购买时只提供"暂存"
    const isGameUsePotion = isPotion && ['change_letter', 'absorb_stars'].includes(item.effect);
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;

    if (isPotion && !isGameUsePotion) {
      // 普通药水牌：两个按钮（立即使用 + 暂存）
      const btnW = 120 * s;
      const btnGap = 12 * s;
      const totalW = btnW * 2 + btnGap;
      const startX = (W - totalW) / 2;

      // 判断暂存按钮是否禁用（upgrade_letter / random_upgrade / replicate_letter / equal_split / starlight_wash 且药水槽满）
      const potionFull = (game.potions || []).length >= 2;
      const isAlwaysBuyable = ['upgrade_letter', 'random_upgrade', 'replicate_letter', 'equal_split', 'starlight_wash'].includes(item.effect);
      const stashDisabled = isAlwaysBuyable && potionFull;

      // 独立按下缩放
      const btn1Scale = (game._successPressedBtn === 'usePotionNow' && cpe > 0 && cpe < 150) ? 0.95 : 1;
      const btn2Scale = (!stashDisabled && game._successPressedBtn === 'stashPotion' && cpe > 0 && cpe < 150) ? 0.95 : 1;

      // 按钮1：立即使用（金色背景 / 灰色禁用）
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

      // 按钮2：暂存（米色边框按钮 / 灰色禁用）
      const b2x = startX + btnW + btnGap;
      const b2w = btnW * btn2Scale;
      const b2h = collectBtnH * btn2Scale;
      const b2X = b2x + (btnW - b2w) / 2;
      const b2Y = collectBtnY + (collectBtnH - b2h) / 2 + contentYShift;
      const stashBtnColor = stashDisabled ? '#e0e0e0' : '#f5f0e6';
      const stashBorderColor = stashDisabled ? '#999' : '#c4a35a';
      const stashTextColor = stashDisabled ? '#999' : '#5a4a2a';
      this.parent.roundRect(b2X, b2Y, b2w, b2h, 8 * s, stashBtnColor, stashBorderColor);
      ctx.fillStyle = stashTextColor;
      if (stashDisabled) {
        ctx.fillText('暂存', b2x + btnW / 2, b2Y + b2h / 2 - 6 * s);
        ctx.fillText('(已达上限)', b2x + btnW / 2, b2Y + b2h / 2 + 8 * s);
      } else {
        ctx.fillText('暂存', b2x + btnW / 2, b2Y + b2h / 2);
      }

      ctx.restore();

      // 存储两个按钮点击区域（暂存禁用时不存储）
      const finalY = collectBtnY;
      this.successBtnRect = { x: b1x, y: finalY, w: btnW, h: collectBtnH, action: 'usePotionNow' };
      this.successBtn2Rect = stashDisabled ? null : { x: b2x, y: finalY, w: btnW, h: collectBtnH, action: 'stashPotion' };
    } else if (isGameUsePotion) {
      // 字母置换 / 吸星大法：只有暂存按钮（游戏中使用）
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
      // 非药水牌：单个按钮（宽度收窄至 140，整体下移 3px）
      const collectBtnW = 140 * s;
      const collectBtnX = (W - collectBtnW) / 2;
      const btnDownShift = 3 * s;
      const singleScale = (game._successPressedBtn && cpe > 0 && cpe < 150) ? 0.95 : 1;

      const finalBW = collectBtnW * singleScale;
      const finalBH = collectBtnH * singleScale;
      const finalBX = collectBtnX + (collectBtnW - finalBW) / 2;
      const finalBY = collectBtnY + (collectBtnH - finalBH) / 2 + contentYShift + btnDownShift;

      this.parent.roundRect(finalBX, finalBY, finalBW, finalBH, 8 * s, '#c4a35a');
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let btnLabel, btnAction;
      if (item.type === 'crystal' && item.effect === 'mystery_discount') {
        btnLabel = '开奖';
        btnAction = 'openMystery';
      } else {
        btnLabel = item.type === 'crystal' ? '生效' : '装备';
        btnAction = item.type === 'crystal' ? 'applyCrystal' : 'equipWitch';
      }
      ctx.fillText(btnLabel, W / 2, finalBY + finalBH / 2);
      ctx.restore();

      const finalCollectY = collectBtnY + btnDownShift;
      this.successBtnRect = { x: collectBtnX, y: finalCollectY, w: collectBtnW, h: collectBtnH, action: btnAction };
      this.successBtn2Rect = null;
    }
  }

  _drawConfirmPanel(ctx, game, W, H, s, px, py, pw, ph, item, iconData, contentAlpha, contentYShift, isClosing, closeAlpha) {
    const gold = '#c4a35a';

    // 标题
    ctx.save();
    ctx.globalAlpha = contentAlpha * closeAlpha;
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
    ctx.globalAlpha = contentAlpha * closeAlpha;
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
    ctx.fillText(formatItemDesc(item), W / 2, imgBottom + 45 * s + contentYShift);
    ctx.restore();

    // 检查是否达到上限
    const isWitch = item.type === 'witch';
    const isPotion = item.type === 'potion';
    const witchFull = (game.jokers || []).length >= game.maxJokerSlots;
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
      const popupFinalCost2 = game._shopDiscountActive ? Math.floor(item.cost * game._shopDiscountRate) : item.cost;
      const priceText = String(popupFinalCost2);
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

class MysteryDiscountRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.couponRects = [];
    this.scratchZoneRect = null;
    this.collectBtnRect = null;
  }

  draw(ctx, game, W, H, s) {
    const md = game._mysteryDiscountState;
    if (!md) return;

    const elapsed = Date.now() - (md.animStartTime || Date.now());
    const enterProgress = Math.min(elapsed / 400, 1);
    const enterEase = Easing.easeOutBack(enterProgress);

    ctx.save();
    ctx.globalAlpha = enterEase;

    const darkBlue = '#1a2f4a';
    const gold = '#c4a35a';

    // === 标题 ===
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = darkBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('迷之优惠', W / 2, 60 * s);

    // 标题下装饰线
    const decoLineY = 78 * s;
    const decoLineW = 120 * s;
    const decoLineX = (W - decoLineW) / 2;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5 * s;
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

    // === 副标题 ===
    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = '#666';
    ctx.fillText('选择一张优惠券，刮开看看有什么惊喜', W / 2, 102 * s);

    // === 3张优惠券 ===
    const couponW = 90 * s;
    const couponH = 130 * s;
    const gap = 24 * s;
    const baseScale = 1.2;
    const targetScale = 1.6;
    const totalW = couponW * 3 + gap * 2;
    const startX = (W - totalW) / 2;
    const baseCenterY = H * 0.5;
    const targetCenterX = W * 0.5;
    const targetCenterY = H * 0.5;

    // 选择动画进度
    const SELECT_ANIM_DURATION = 400;
    if (md.selectedIdx !== null && !md.selectStartTime) {
      md.selectStartTime = Date.now();
    }
    const selectElapsed = md.selectStartTime ? Date.now() - md.selectStartTime : 0;
    const selectProgress = Math.min(selectElapsed / SELECT_ANIM_DURATION, 1);
    const selectEase = Easing.easeOutBack(selectProgress);

    this.couponRects = [];

    let selectedSX, selectedSY, selectedSW, selectedSH;

    for (let i = 0; i < 3; i++) {
      const originalCenterX = startX + i * (couponW + gap) + couponW / 2;
      const originalCenterY = baseCenterY;
      const isSelected = md.selectedIdx === i;
      const isOther = md.selectedIdx !== null && md.selectedIdx !== i;

      let centerX, centerY, scale, alpha;

      // 呼吸缩放动画（复用女巫奖励礼盒效果）
      const breath = Math.sin(Date.now() / 600 + i * 0.5) * 0.02;
      const pulse = 1 + breath;

      if (md.selectedIdx === null) {
        centerX = originalCenterX;
        centerY = originalCenterY;
        scale = baseScale * pulse;
        alpha = 1;
      } else if (isSelected) {
        centerX = originalCenterX + (targetCenterX - originalCenterX) * selectEase;
        centerY = originalCenterY + (targetCenterY - originalCenterY) * selectEase;
        scale = baseScale + (targetScale - baseScale) * selectEase;
        alpha = 1;
      } else {
        const disappearEase = Easing.easeOutCubic(selectProgress);
        centerX = originalCenterX;
        centerY = originalCenterY;
        scale = baseScale * (1 - disappearEase);
        alpha = 1 - disappearEase;
      }

      const sw = couponW * scale;
      const sh = couponH * scale;
      const sx = centerX - sw / 2;
      const sy = centerY - sh / 2;

      if (isSelected) {
        selectedSX = sx;
        selectedSY = sy;
        selectedSW = sw;
        selectedSH = sh;
      }

      ctx.save();
      ctx.globalAlpha = alpha * enterEase;

      // 优惠券图片（优先使用云存储 cupon.png）
      const cuponData = this.parent.shopCardImages['cupon'];
      if (cuponData && cuponData.loaded && cuponData.img) {
        ctx.save();
        this.parent._roundedRectPath(ctx, sx, sy, sw, sh, 10 * s);
        ctx.clip();
        const aspect = (cuponData.width > 0 && cuponData.height > 0)
          ? cuponData.width / cuponData.height
          : sw / sh;
        let drawW, drawH, imgX, imgY;
        const cardAspect = sw / sh;
        if (aspect > cardAspect) {
          drawW = sw;
          drawH = drawW / aspect;
          imgX = sx;
          imgY = sy + (sh - drawH) / 2;
        } else {
          drawH = sh;
          drawW = drawH * aspect;
          imgX = sx + (sw - drawW) / 2;
          imgY = sy;
        }
        ctx.drawImage(cuponData.img, imgX, imgY, drawW, drawH);
        ctx.restore();
      } else {
        // fallback：简洁优惠券占位
        this.parent.roundRect(sx, sy, sw, sh, 10 * s, '#fff9f0', gold);
        ctx.font = `bold ${Math.floor(28 * s)}px sans-serif`;
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', sx + sw / 2, sy + sh * 0.42);
      }

      // 优惠券标题（金棕色，与游戏标题一致）
      // 标题随优惠券 base→target 缩放，但不跟随呼吸脉冲
      const titleScale = md.selectedIdx === null ? scale / pulse : scale;
      ctx.font = `bold ${Math.floor(12 * s * titleScale)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`优惠券 ${i + 1}`, sx + sw / 2, sy + 15 * s * titleScale);

      ctx.restore();

      // 存储点击区域（按当前缩放后的尺寸）
      if (md.selectedIdx === null) {
        const hitW = couponW * scale;
        const hitH = couponH * scale;
        this.couponRects.push({ x: centerX - hitW / 2, y: centerY - hitH / 2, w: hitW, h: hitH, index: i });
      }
    }

    // === 刮奖区（选中后显示，跟随被选中的优惠券位置）===
    if (md.selectedIdx !== null && md.scratched) {
      const scratchW = couponW * 1.08 - 2 * s;
      const scratchH = 58 * s;
      const scratchX = selectedSX + (selectedSW - scratchW) / 2;
      const scratchY = selectedSY + (selectedSH - scratchH) / 2 - 3 * s;

      // 刮奖区背景
      this.parent.roundRect(scratchX, scratchY, scratchW, scratchH, 8 * s, '#e8e0d4', '#c4a35a');

      const rate = (md.rates && md.rates[md.selectedIdx]) || 0.8;
      const discountText = `${Math.round(rate * 10)}折`;
      const revealElapsed = md.revealed ? Date.now() - (md.revealStartTime || Date.now()) : 0;
      const revealProgress = md.revealed ? Math.min(revealElapsed / 300, 1) : 0;
      const revealEase = md.revealed ? Easing.easeOutBack(revealProgress) : 0;

      // 折扣标签（优先使用精灵图 6~9折，每帧100x100）
      const sheet = this.parent.discountSpritesheet;
      const sheetLoaded = this.parent.discountSpritesheetLoaded;
      const frameIdx = Math.max(0, Math.min(3, Math.round(rate * 10) - 6));
      const iconSize = Math.min(scratchW, scratchH) * 0.85;
      const iconX = scratchX + (scratchW - iconSize) / 2;
      const iconY = scratchY + (scratchH - iconSize) / 2;

      ctx.save();
      ctx.globalAlpha = md.revealed ? revealEase : 1;
      if (md.revealed) {
        ctx.translate(scratchX + scratchW / 2, scratchY + scratchH / 2);
        ctx.scale(revealEase, revealEase);
        ctx.translate(-(scratchX + scratchW / 2), -(scratchY + scratchH / 2));
      }
      if (sheetLoaded && sheet) {
        ctx.drawImage(sheet, frameIdx * 100, 0, 100, 100, iconX, iconY, iconSize, iconSize);
      } else {
        ctx.font = `bold ${Math.floor(28 * s)}px sans-serif`;
        ctx.fillStyle = '#d9534f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(discountText, scratchX + scratchW / 2, scratchY + scratchH / 2);
      }
      ctx.restore();

      if (!md.revealed) {
        // 涂抹刮开覆盖层：按网格绘制未刮开单元格，刮开处直接露出底层折扣
        ctx.save();
        this.parent._roundedRectPath(ctx, scratchX, scratchY, scratchW, scratchH, 8 * s);
        ctx.clip();

        const cols = md.scratchCols || 24;
        const rows = md.scratchRows || 16;
        const grid = md.scratchGrid;
        const cellW = scratchW / cols;
        const cellH = scratchH / rows;
        ctx.fillStyle = '#c8c0b4';
        if (!grid) {
          // 尚未开始涂抹：完整覆盖
          ctx.fillRect(scratchX, scratchY, scratchW, scratchH);
        } else {
          for (let r = 0; r < rows; r++) {
            if (!grid[r]) continue;
            for (let c = 0; c < cols; c++) {
              if (!grid[r][c]) {
                ctx.fillRect(scratchX + c * cellW, scratchY + r * cellH, cellW + 1, cellH + 1);
              }
            }
          }
        }

        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (!md.scratchPoints || md.scratchPoints.length === 0) {
          ctx.fillText('涂抹刮开', scratchX + scratchW / 2, scratchY + scratchH / 2);
        }
        ctx.restore();

        // 存储刮奖区点击区域
        this.scratchZoneRect = { x: scratchX, y: scratchY, w: scratchW, h: scratchH };
        this.collectBtnRect = null;
      } else {
        // 已刮开：播放中奖音效（只播放一次）
        if (!md.winSoundPlayed) {
          md.winSoundPlayed = true;
          if (game.audioManager) game.audioManager.play('win_success');
        }

        this.scratchZoneRect = null;

        // === 收下优惠按钮 ===
        const collectBtnW = 160 * s;
        const collectBtnH = 44 * s;
        const collectBtnX = (W - collectBtnW) / 2;
        const collectBtnY = selectedSY + selectedSH + 40 * s;

        const btnScale = revealEase;
        const bw = collectBtnW * btnScale;
        const bh = collectBtnH * btnScale;
        const bx = collectBtnX + (collectBtnW - bw) / 2;
        const by = collectBtnY + (collectBtnH - bh) / 2;

        this.parent.roundRect(bx, by, bw, bh, 8 * s, '#c4a35a');
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('收下优惠', W / 2, by + bh / 2);

        this.collectBtnRect = { x: collectBtnX, y: collectBtnY, w: collectBtnW, h: collectBtnH };
      }
    }

    ctx.restore();
  }
}

// 取女巫牌的升级步进值（upgrate_value）：实例上没有则回退 SHOP_POOL 按名称查找（兼容旧存档）
function getWitchUpgradeStep(joker) {
  if (!joker) return undefined;
  if (joker.upgrate_value !== undefined && joker.upgrate_value !== null) return joker.upgrate_value;
  const poolItem = (SHOP_POOL.witch || []).find(w => w.name === joker.name);
  return poolItem ? poolItem.upgrate_value : undefined;
}

// 取女巫牌的 rate 升级步进值（upgrate_rate）：概率类卡牌升级提升概率而非数值（如以小博大 40%→45%）
function getWitchUpgradeRateStep(joker) {
  if (!joker) return undefined;
  if (joker.upgrate_rate !== undefined && joker.upgrate_rate !== null) return joker.upgrate_rate;
  const poolItem = (SHOP_POOL.witch || []).find(w => w.name === joker.name);
  return poolItem ? poolItem.upgrate_rate : undefined;
}

// 取女巫牌的升级上限等级（max_level）：实例上没有则回退 SHOP_POOL 按名称查找；undefined 表示无上限
function getWitchMaxLevel(joker) {
  if (!joker) return undefined;
  if (joker.max_level !== undefined && joker.max_level !== null) return joker.max_level;
  const poolItem = (SHOP_POOL.witch || []).find(w => w.name === joker.name);
  return poolItem ? poolItem.max_level : undefined;
}

module.exports = { ShopRenderer, ConfirmBuyRenderer, MysteryDiscountRenderer, SHOP_POOL, generateShopItems, refreshModule, buyItem, upgradeLetter, applyCrystalEffects, getWitchUpgradeStep, getWitchUpgradeRateStep, getWitchMaxLevel };
