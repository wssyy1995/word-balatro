const { Easing } = require('../animation');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS, formatItemDesc, getChaosRange } = require('../witch_skills');
const { SHOP_POOL, getWitchUpgradeStep, getWitchUpgradeRateStep } = require('../shop');
const { LETTER_SCORE, letterUpgrades } = require('../data');
const { DailyAchievements } = require('../daily_achievements');
const { GAME_VERSION, getJokerValue } = require('../game');

module.exports = function extendPopup(Renderer) {
    Renderer.prototype._drawWitchDetailPopup = function(ctx, game, s) {
      const popup = game._witchDetailPopup;
      if (!popup) return;

      const jokers = game.jokers || [];
      const joker = jokers[popup.jokerIndex];
      if (!joker) return;

      // 支持传入 rect(商店模式),否则回退到 witchPropRects
      const rect = popup.rect || this.witchPropRects[popup.jokerIndex];
      if (!rect) return;

      const { x: cardX, y: cardY, w: cardW, h: cardH } = rect;

      const pad = 10 * s;
      const lineH = 16 * s;

      // 先计算可作用字母宽度(如果有),用于动态调整弹窗宽度
      const letters = this._getWitchLetters(joker.trigger);
      const hasLetters = letters && letters.length > 0;
      let lettersTotalW = 0;
      if (hasLetters) {
        const circleR = 12 * s;
        const circleGap = 8 * s;
        lettersTotalW = letters.length * (circleR * 2) + (letters.length - 1) * circleGap;
      }

      // 根据效果描述文字长度动态计算弹窗宽度（desc 中 value 占位符替换为实际值）
      const jokerDesc = formatItemDesc(joker);
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      const descW = ctx.measureText(jokerDesc).width;
      const minPopupW = Math.max(cardW + 20 * s, this.W * 0.6);
      let popupW = Math.max(minPopupW, descW + pad * 2);
      if (hasLetters) {
        popupW = Math.max(popupW, lettersTotalW + pad * 2);
      }
      let popupX = cardX + (cardW - popupW) / 2;
      // 确保弹窗不超出屏幕边缘
      const edgePad = 5 * s;
      popupX = Math.max(edgePad, Math.min(popupX, this.W - popupW - edgePad));

      // 计算内容高度
      const hasLimit = joker.limit !== undefined && joker.usesLeft !== undefined;
      const hasAccumulation = joker.trigger === 'illegal_boost' || joker.operation === 'multi_accumulation';
      const hasPredicted = joker.trigger === 'predicted_letter' && joker._predictedLetter;
      const hasLastWord = joker.trigger === 'no_duplicate' || joker.trigger === 'initial_succession';
      const hasValueHalfConstraint = !popup.isShop && game._witchCardValueHalfActive && joker.scope === 'whole_word' && joker.value !== undefined && joker.value !== null;
      let contentH = pad * 2 + lineH * 3 + 4 * s; // 名称 + 效果标签 + 描述
      if (hasValueHalfConstraint) contentH += lineH + 2 * s; // 女巫试炼:当前倍率
      if (hasLastWord && !popup.isShop) contentH += lineH + 2 * s; // 上一手单词(仅限游戏页)
      if (hasAccumulation) contentH += lineH + 2 * s; // 倍率增值
      if (hasLimit) contentH += lineH + 2 * s; // 剩余次数
      if (hasPredicted && !popup.isShop) contentH += lineH + 2 * s; // 预言字母(仅限游戏页)
      if (hasLetters) contentH += lineH + 28 * s + 4 * s; // 可作用字母标签 + 圆
      if (popup.isShop) contentH += 26 * s + pad; // 底部按钮行（售出/升级，仅商店页显示）
      const popupH = contentH;
      const popupY = cardY + cardH + 6 * s + 2 * s;

      // 出现动画(easeOutBack:从卡牌底部向下弹出)
      let appearScale = 1;
      let appearOffsetY = 0;
      if (popup.animStartTime) {
        const ae = Date.now() - popup.animStartTime;
        const ap = Math.min(ae / 200, 1);
        const ease = Easing.easeOutBack(ap);
        appearScale = 0.5 + 0.5 * ease;
        appearOffsetY = (1 - ease) * 12 * s;
      }

      ctx.save();
      ctx.translate(popupX + popupW / 2, popupY + popupH / 2);
      ctx.scale(appearScale, appearScale);
      ctx.translate(-(popupX + popupW / 2), -(popupY + popupH / 2));
      ctx.translate(0, appearOffsetY);

      // 小三角
      const triW = 8 * s;
      const triH = 6 * s;
      const triX = cardX + cardW / 2;
      ctx.beginPath();
      ctx.moveTo(triX - triW, popupY);
      ctx.lineTo(triX, popupY - triH);
      ctx.lineTo(triX + triW, popupY);
      ctx.closePath();
      ctx.fillStyle = '#9b59b6';
      ctx.fill();

      // 弹窗面板
      const r = 8 * s;
      this.roundRect(popupX, popupY, popupW, popupH, r, '#faf6ee', '#9b59b6', 2 * s);

      // ===== 底部按钮点击区（在内容后绘制） =====
      this._shopWitchDetailSellBtnRect = null;
      this._witchDetailUpgradeBtnRect = null;

      let cy = popupY + pad + lineH / 2;
      const cx = popupX + popupW / 2;

      // 名称(带星星装饰；升级后带 Lv.x 标识)
      const jokerLvText = (joker.level || 1) > 1 ? ` Lv.${joker.level}` : '';
      ctx.save();
      ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✦ ${joker.name}${jokerLvText} ✦`, cx, cy);
      ctx.restore();

      cy += lineH + 4 * s;

      // 效果标签
      ctx.save();
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('效果', popupX + pad, cy);
      ctx.restore();

      cy += lineH;

      // 效果描述
      ctx.save();
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(jokerDesc, popupX + pad, cy);
      ctx.restore();

      // 女巫试炼:witch_card_value_half 时显示当前实际倍率
      if (hasValueHalfConstraint) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let constraintText;
        if (joker.trigger === 'chaos_orb') {
          // 混沌法球:value 为随机倍率加成,女巫试炼下加成范围减半
          constraintText = '女巫试炼:倍率加成随机 +[0.25~0.6]';
        } else {
          const isMultiplier = joker.operation !== 'add' && joker.operation !== 'multi_adds_value' && joker.trigger !== 'illegal_boost' && joker.trigger !== 'last_chance';
          const jokerVal = getJokerValue(joker);
          const valueText = Number.isInteger(jokerVal) ? String(jokerVal) : jokerVal.toFixed(1);
          constraintText = isMultiplier ? `女巫试炼:当前倍率为 x${valueText}` : `女巫试炼:当前倍率为 +${valueText}`;
        }
        ctx.fillText(constraintText, popupX + pad, cy);
        ctx.restore();
      }

      // 上一手单词(消元术 / 首字连击)
      if ((joker.trigger === 'no_duplicate' || joker.trigger === 'initial_succession') && !popup.isShop) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let lastWordText = '无';
        if (joker.trigger === 'initial_succession' || joker.trigger === 'no_duplicate') {
          lastWordText = game._lastPlayedLetters ? Array.from(game._lastPlayedLetters).join('') : '无';
        }
        ctx.fillText(`上一手单词:${lastWordText}`, popupX + pad, cy);
        ctx.restore();
      }

      // 倍率增值(错误即经验 / 首字连击:显示当前累加值)
      if (joker.trigger === 'illegal_boost' || joker.operation === 'multi_accumulation') {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`倍率累计:+${getJokerValue(joker)}`, popupX + pad, cy);
        ctx.restore();
      }

      // 剩余次数(limit 型女巫牌)
      if (joker.limit !== undefined && joker.usesLeft !== undefined) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = joker.usesLeft > 0 ? '#e74c3c' : '#7f8c8d';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`剩余次数:${joker.usesLeft} / ${joker.limit}`, popupX + pad, cy);
        ctx.restore();
      }

      // 预言字母(预言家牌)-- 游戏页显示,商店页隐藏
      if (hasPredicted && !popup.isShop) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`预言字母:${joker._predictedLetter}`, popupX + pad, cy);
        ctx.restore();
      }

      // 可作用字母
      if (hasLetters) {
        cy += lineH + 8 * s;

        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('可作用字母', popupX + pad, cy);
        ctx.restore();

        cy += lineH + 4 * s;

        const circleR = 12 * s;
        const circleGap = 8 * s;
        const totalW = letters.length * (circleR * 2) + (letters.length - 1) * circleGap;
        let lx = popupX + (popupW - totalW) / 2 + circleR;

        letters.forEach(letter => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(lx, cy, circleR, 0, Math.PI * 2);
          ctx.fillStyle = '#9b59b6';
          ctx.fill();
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(letter, lx, cy);
          ctx.restore();
          lx += circleR * 2 + circleGap;
        });

        // 分隔装饰线(仅在有可作用字母时显示；紧跟圆形字母下方)
        const decoY = cy + circleR + 8 * s;
        ctx.save();
        ctx.strokeStyle = 'rgba(155,89,182,0.3)';
        ctx.lineWidth = 1 * s;
        const decoW = popupW * 0.5;
        const decoX = popupX + (popupW - decoW) / 2;
        ctx.beginPath();
        ctx.moveTo(decoX, decoY);
        ctx.lineTo(decoX + decoW, decoY);
        ctx.stroke();
        ctx.restore();
      }

      // ===== 底部按钮：售出（红色）+ 升级（紫色，占位），仅商店页显示 =====
      if (popup.isShop) {
        const btnH = 26 * s;
        const btnGap = 10 * s;
        const btnY = popupY + popupH - btnH - pad + 2 * s;
        // 无 upgrate_value / upgrate_rate 的女巫牌不可升级：只显示售出按钮
        const canUpgrade = getWitchUpgradeStep(joker) !== undefined || getWitchUpgradeRateStep(joker) !== undefined;
        const btnCount = canUpgrade ? 2 : 1;
        // 按钮固定宽度，整体居中（不随弹窗宽度变化）
        const btnW = 84 * s;
        let bx = popupX + (popupW - (btnW * btnCount + btnGap * (btnCount - 1))) / 2;
        if (popup.isShop) {
          // 售出按钮（红色，内容：售出 + 金币图标 + 数字；售价 = 基础售出价 × 等级）
          const sellText = '售出';
          const priceText = String(Math.round(joker.cost / 2) * (joker.level || 1));
          ctx.save();
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          const sellTextW = ctx.measureText(sellText).width;
          const priceTextW = ctx.measureText(priceText).width;
          const coinSize = 14 * s;
          const contentW = sellTextW + 3 * s + coinSize + 2 * s + priceTextW;
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(bx, btnY, btnW, btnH, 8 * s, '#c0392b');
          ctx.restore();
          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          const hlY = btnY + 2 * s;
          ctx.moveTo(bx + 3 * s, hlY);
          ctx.lineTo(bx + btnW - 3 * s, hlY);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          ctx.textBaseline = 'middle';
          const midY = btnY + btnH / 2;
          const startX = bx + (btnW - contentW) / 2;
          ctx.textAlign = 'left';
          ctx.fillText(sellText, startX, midY);
          if (this.coinIcon && this.coinIconLoaded) {
            ctx.drawImage(this.coinIcon, startX + sellTextW + 3 * s, midY - coinSize / 2, coinSize, coinSize);
          }
          ctx.fillText(priceText, startX + sellTextW + 3 * s + coinSize + 2 * s, midY);
          ctx.restore();
          this._shopWitchDetailSellBtnRect = { x: bx, y: btnY, w: btnW, h: btnH, index: popup.jokerIndex };
          bx += btnW + btnGap;
        }

        // 升级按钮（金色，仅可升级的女巫牌显示）
        if (canUpgrade) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(bx, btnY, btnW, btnH, 8 * s, '#c4a35a');
          ctx.restore();
          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          const upHlY = btnY + 2 * s;
          ctx.moveTo(bx + 3 * s, upHlY);
          ctx.lineTo(bx + btnW - 3 * s, upHlY);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          const upTextW = ctx.measureText('升级').width;
          const arrowW = 13 * s;
          const arrowH = 13 * s;
          const upGap = 3 * s;
          const upGroupW = arrowW + upGap + upTextW;
          const upGroupX = bx + (btnW - upGroupW) / 2;
          const midY = btnY + btnH / 2;
          // 金棕色向上箭头（三角头 + 矩形杆），带上下轻微浮动
          const acx = upGroupX + arrowW / 2;
          const arrowFloatY = Math.sin(Date.now() / 280) * 1.2 * s;
          const atop = midY - arrowH / 2 + arrowFloatY;
          ctx.fillStyle = '#9a7209';
          ctx.beginPath();
          const headH = arrowH * 0.55;
          ctx.moveTo(acx, atop);
          ctx.lineTo(acx + arrowW / 2, atop + headH);
          ctx.lineTo(acx + arrowW * 0.22, atop + headH);
          ctx.lineTo(acx + arrowW * 0.22, atop + arrowH);
          ctx.lineTo(acx - arrowW * 0.22, atop + arrowH);
          ctx.lineTo(acx - arrowW * 0.22, atop + headH);
          ctx.lineTo(acx - arrowW / 2, atop + headH);
          ctx.closePath();
          ctx.fill();
          // 「升级」文字
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('升级', upGroupX + arrowW + upGap, midY);
          ctx.restore();
          this._witchDetailUpgradeBtnRect = { x: bx, y: btnY, w: btnW, h: btnH };
        }
      }

      // 关闭弹窗整体变换
      ctx.restore();
    }

    // ===== 空槽位说明弹窗（一句话介绍，锚定在槽位下方；女巫牌紫色 / 魔法药水绿色） =====
    Renderer.prototype._drawWitchEmptyPopup = function(ctx, game, s) {
      const popup = game._witchEmptyPopup;
      if (!popup || !popup.rect) return;

      const isPotion = popup.kind === 'potion';
      const title = isPotion ? '✦ 魔法药水 ✦' : '✦ 女巫牌 ✦';
      const desc = isPotion ? '通关后，可在商店购买魔法药水。' : '通关后，可在商店购买更多女巫牌。';
      const themeColor = isPotion ? '#1e8449' : '#9b59b6';

      const { x: cardX, y: cardY, w: cardW, h: cardH } = popup.rect;
      const pad = 10 * s;
      const lineH = 16 * s;

      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      const descW = ctx.measureText(desc).width;
      const popupW = Math.max(cardW + 20 * s, this.W * 0.6, descW + pad * 2);
      let popupX = cardX + (cardW - popupW) / 2;
      const edgePad = 5 * s;
      popupX = Math.max(edgePad, Math.min(popupX, this.W - popupW - edgePad));
      const popupH = pad * 2 + lineH * 2 + 6 * s;
      const popupY = cardY + cardH + 6 * s + 2 * s;

      // 出现动画（与女巫牌详情一致：easeOutBack 从槽位底部弹出）
      let appearScale = 1;
      let appearOffsetY = 0;
      if (popup.animStartTime) {
        const ap = Math.min((Date.now() - popup.animStartTime) / 200, 1);
        const ease = Easing.easeOutBack(ap);
        appearScale = 0.5 + 0.5 * ease;
        appearOffsetY = (1 - ease) * 12 * s;
      }

      ctx.save();
      ctx.translate(popupX + popupW / 2, popupY + popupH / 2);
      ctx.scale(appearScale, appearScale);
      ctx.translate(-(popupX + popupW / 2), -(popupY + popupH / 2));
      ctx.translate(0, appearOffsetY);

      // 小三角
      const triW = 8 * s;
      const triH = 6 * s;
      const triX = cardX + cardW / 2;
      ctx.beginPath();
      ctx.moveTo(triX - triW, popupY);
      ctx.lineTo(triX, popupY - triH);
      ctx.lineTo(triX + triW, popupY);
      ctx.closePath();
      ctx.fillStyle = themeColor;
      ctx.fill();

      // 面板
      this.roundRect(popupX, popupY, popupW, popupH, 8 * s, '#faf6ee', themeColor, 2 * s);

      const cx = popupX + popupW / 2;
      // 标题
      ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, cx, popupY + pad + lineH / 2);

      // 一句话说明
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#333';
      ctx.fillText(desc, cx, popupY + pad + lineH + 6 * s + lineH / 2);

      ctx.restore();
    }

    // ===== 魔法药水详情弹窗（效果说明 + 底部按钮：售出[商店] / 使用） =====
    Renderer.prototype._drawPotionDetailPopup = function(ctx, game, s) {
      const popup = game._potionDetailPopup;
      if (!popup) return;
      const potion = (game.potions || [])[popup.potionIndex];
      if (!potion) return;
      const rect = popup.rect;
      if (!rect) return;

      const { x: cardX, y: cardY, w: cardW, h: cardH } = rect;
      const pad = 10 * s;
      const lineH = 16 * s;
      const themeColor = '#1e8449';

      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      const descW = ctx.measureText(potion.desc || '').width;
      const popupW = Math.max(cardW + 20 * s, this.W * 0.6, descW + pad * 2);
      let popupX = cardX + (cardW - popupW) / 2;
      const edgePad = 5 * s;
      popupX = Math.max(edgePad, Math.min(popupX, this.W - popupW - edgePad));
      const btnH = 26 * s;
      const popupH = pad * 2 + lineH * 3 + 4 * s + btnH + pad - 2 * s;
      const popupY = cardY + cardH + 6 * s + 2 * s;

      // 出现动画（与女巫牌详情一致）
      let appearScale = 1;
      let appearOffsetY = 0;
      if (popup.animStartTime) {
        const ap = Math.min((Date.now() - popup.animStartTime) / 200, 1);
        const ease = Easing.easeOutBack(ap);
        appearScale = 0.5 + 0.5 * ease;
        appearOffsetY = (1 - ease) * 12 * s;
      }

      ctx.save();
      ctx.translate(popupX + popupW / 2, popupY + popupH / 2);
      ctx.scale(appearScale, appearScale);
      ctx.translate(-(popupX + popupW / 2), -(popupY + popupH / 2));
      ctx.translate(0, appearOffsetY);

      // 小三角
      const triW = 8 * s;
      const triH = 6 * s;
      const triX = cardX + cardW / 2;
      ctx.beginPath();
      ctx.moveTo(triX - triW, popupY);
      ctx.lineTo(triX, popupY - triH);
      ctx.lineTo(triX + triW, popupY);
      ctx.closePath();
      ctx.fillStyle = themeColor;
      ctx.fill();

      // 面板
      this.roundRect(popupX, popupY, popupW, popupH, 8 * s, '#faf6ee', themeColor, 2 * s);

      const cx = popupX + popupW / 2;
      let cy = popupY + pad + lineH / 2;

      // 名称
      ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✦ ${potion.name} ✦`, cx, cy);

      // 效果标签
      cy += lineH + 4 * s;
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText('效果', popupX + pad, cy);

      // 效果描述
      cy += lineH;
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#333';
      ctx.fillText(potion.desc || '', popupX + pad, cy);

      // ===== 底部按钮：售出（仅商店，红色）+ 使用（绿色） =====
      this._potionDetailSellBtnRect = null;
      this._potionDetailUseBtnRect = null;
      {
        const btnGap = 10 * s;
        const btnY = popupY + popupH - btnH - pad + 2 * s;
        const btnCount = popup.isShop ? 2 : 1;
        // 按钮固定宽度，整体居中（不随弹窗宽度变化）
        const btnW = 84 * s;
        let bx = popupX + (popupW - (btnW * btnCount + btnGap * (btnCount - 1))) / 2;

        if (popup.isShop) {
          // 售出按钮（红色，内容：售出 + 金币图标 + 数字）
          const sellText = '售出';
          const priceText = String(Math.round(potion.cost / 2));
          ctx.save();
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          const sellTextW = ctx.measureText(sellText).width;
          const priceTextW = ctx.measureText(priceText).width;
          const coinSize = 14 * s;
          const contentW = sellTextW + 3 * s + coinSize + 2 * s + priceTextW;
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(bx, btnY, btnW, btnH, 8 * s, '#c0392b');
          ctx.restore();
          // 顶部高光条
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 * s;
          ctx.beginPath();
          const hlY = btnY + 2 * s;
          ctx.moveTo(bx + 3 * s, hlY);
          ctx.lineTo(bx + btnW - 3 * s, hlY);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          ctx.textBaseline = 'middle';
          const midY = btnY + btnH / 2;
          const startX = bx + (btnW - contentW) / 2;
          ctx.textAlign = 'left';
          ctx.fillText(sellText, startX, midY);
          if (this.coinIcon && this.coinIconLoaded) {
            ctx.drawImage(this.coinIcon, startX + sellTextW + 3 * s, midY - coinSize / 2, coinSize, coinSize);
          }
          ctx.fillText(priceText, startX + sellTextW + 3 * s + coinSize + 2 * s, midY);
          ctx.restore();
          this._potionDetailSellBtnRect = { x: bx, y: btnY, w: btnW, h: btnH, index: popup.potionIndex };
          bx += btnW + btnGap;
        }

        // 使用按钮（绿色）
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(bx, btnY, btnW, btnH, 8 * s, '#1e8449');
        ctx.restore();
        // 顶部高光条
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        const useHlY = btnY + 2 * s;
        ctx.moveTo(bx + 3 * s, useHlY);
        ctx.lineTo(bx + btnW - 3 * s, useHlY);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('使用', bx + btnW / 2, btnY + btnH / 2);
        ctx.restore();
        this._potionDetailUseBtnRect = { x: bx, y: btnY, w: btnW, h: btnH, index: popup.potionIndex };
      }

      ctx.restore();
    }

    // ===== 女巫牌升级弹窗（卡牌升级：等级对比 + 选择已有卡牌 + 确认升级） =====
    Renderer.prototype._drawWitchUpgradePopup = function(ctx, game, s) {
      const popup = game._witchUpgradePopup;
      if (!popup) return;
      const W = this.W;
      const H = this.H;

      const elapsed = Date.now() - popup.startTime;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        width: 340, height: 525, elapsed,
        isClosing: popup.closing,
        closeStartTime: popup.closeStartTime,
        onCloseComplete: () => { game._witchUpgradePopup = null; }
      });
      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;

      const jokers = game.jokers || [];
      // 可升级判定：带 upgrate_value / upgrate_rate 的女巫牌（实例没有则回退 SHOP_POOL 按名称查找，兼容旧存档）
      const upgradeable = (j) => getWitchUpgradeStep(j) !== undefined || getWitchUpgradeRateStep(j) !== undefined;
      // 选中卡牌（无效时回退到第一张可升级牌）
      let selIndex = popup.jokerIndex;
      if (!upgradeable(jokers[selIndex])) {
        selIndex = jokers.findIndex(upgradeable);
      }
      const joker = selIndex >= 0 ? jokers[selIndex] : null;

      // 重置点击区域
      this._witchUpgradeCardRects = [];
      this._witchUpgradeConfirmRect = null;
      this._witchUpgradeCloseRect = null;

      ctx.save();
      ctx.globalAlpha = closeAlpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 标题（参考单词本：Georgia 加粗 + 分割线）
      const titleY = py + 32 * s;
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('卡牌升级', px + pw / 2, titleY);
      const decoLineY = titleY + 18 * s;
      const decoLineW = pw * 0.45;
      this._drawTitleDivider(ctx, px + (pw - decoLineW) / 2, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });

      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#a09070';
      ctx.fillText('选择要升级的卡牌', px + pw / 2, decoLineY + 16 * s);

      // 效果文字自动换行工具（对比视图/结果视图共用；fontSize 单位 px，乘 s 缩放）
      const wrapDesc = (text, maxW, fontSize = 12) => {
        ctx.font = `${Math.floor(fontSize * s)}px sans-serif`;
        const lines = [];
        let line = '';
        for (const ch of String(text)) {
          if (line && ctx.measureText(line + ch).width > maxW) {
            lines.push(line);
            line = ch;
          } else {
            line += ch;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      // 带 value 高亮的效果文字绘制：value 部分加粗紫色，其余保持原样；逐字换行、整行居中
      const drawStyledDesc = (text, valueStr, cx, bY, bH, maxW, fontSize, lineH) => {
        const normalFont = `${Math.floor(fontSize * s)}px sans-serif`;
        const boldFont = `bold ${Math.floor(fontSize * s)}px sans-serif`;
        // value 字符区间（formatItemDesc 已将 desc 中 value 占位符替换为实际值）
        const valStart = valueStr ? String(text).indexOf(valueStr) : -1;
        const valEnd = valStart >= 0 ? valStart + String(valueStr).length : -1;
        ctx.font = normalFont;
        const lines = [];
        let segs = [];
        let lineW = 0;
        for (let i = 0; i < String(text).length; i++) {
          const ch = String(text)[i];
          const w = ctx.measureText(ch).width;
          if (segs.length && lineW + w > maxW) {
            lines.push(segs);
            segs = [];
            lineW = 0;
          }
          const hl = i >= valStart && i < valEnd;
          const last = segs[segs.length - 1];
          if (last && last.hl === hl) last.text += ch; else segs.push({ text: ch, hl });
          lineW += w;
        }
        if (segs.length) lines.push(segs);
        const firstY = bY + bH / 2 - ((lines.length - 1) * lineH) / 2;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        lines.forEach((lineSegs, li) => {
          let totalW = 0;
          lineSegs.forEach(seg => {
            ctx.font = seg.hl ? boldFont : normalFont;
            totalW += ctx.measureText(seg.text).width;
          });
          let sx = cx - totalW / 2;
          lineSegs.forEach(seg => {
            ctx.font = seg.hl ? boldFont : normalFont;
            ctx.fillStyle = seg.hl ? '#9b59b6' : '#5a4a2a';
            ctx.fillText(seg.text, sx, firstY + li * lineH);
            sx += ctx.measureText(seg.text).width;
          });
        });
        ctx.restore();
      };

      if (joker && popup.upgraded) {
        // ===== 升级成功视图：卡牌从右侧对比位移动到中间并放大，背后紫色光芒+闪烁星星 =====
        const curLv = joker.level || 1;
        const curVal = (joker.real_value !== undefined && joker.real_value !== null) ? joker.real_value : joker.value;

        // 动画：起点 = 对比视图右侧卡位，终点 = 中间大卡
        const animElapsed = popup.upgradeAnimStart ? Date.now() - popup.upgradeAnimStart : 10000;
        const animP = Math.min(animElapsed / 450, 1);
        const ease = Easing.easeOutCubic(animP);
        const fromCX = px + pw / 2 + 64 * s;
        const fromCY = py + 86 * s + 42 * s;
        const fromW = 80 * s;
        const fromH = 96 * s;
        const toW = 124 * s;
        const toH = 148 * s;
        const toCX = px + pw / 2;
        const toCY = py + 110 * s + toH / 2;
        const curCX = fromCX + (toCX - fromCX) * ease;
        const curCY = fromCY + (toCY - fromCY) * ease;
        const curW = fromW + (toW - fromW) * ease;
        const curH = fromH + (toH - fromH) * ease;

        // 背后紫色光芒 + 闪烁星星（参考恭喜猜中弹窗上方特效）
        this._drawLightRays(ctx, toCX, toCY, toW * 1.5, s, animElapsed, closeAlpha, 'purple');
        this._witchUpgradeStars = this._drawSparkleStars(
          ctx, toCX, toCY, toW * 2.0, toH * 1.5, s, animElapsed, 18, this._witchUpgradeStars, closeAlpha, 1, 'purple'
        );

        // 移动到位后：缩放弹跳（1 → 1.15 → 1）
        let popScale = 1;
        if (animP >= 1) {
          const popT = Math.min((animElapsed - 450) / 350, 1);
          popScale = 1 + 0.15 * Math.sin(popT * Math.PI);
        }
        const popW = curW * popScale;
        const popH = curH * popScale;

        // 卡牌：移动 + 放大 + 到位弹跳，保留紫色斜光（名字蒙层收窄、字号放大 1.3 倍）
        this._drawPropCard(ctx, joker, curCX - popW / 2, curCY - popH / 2, popW, popH, s, true, false, { maskInset: 9 * s, maskHShrink: 4 * s, nameFontScale: 1.3 });
        this._drawRectSweep(ctx, curCX - popW / 2, curCY - popH / 2, popW, popH, s, 'purple', 0);

        // 卡牌就位后，Lv / 效果 / 确认按钮淡入
        const contentA = Math.min(Math.max((animP - 0.65) / 0.35, 0), 1);
        ctx.save();
        ctx.globalAlpha = closeAlpha * contentA;

        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'center';
        ctx.fillText(`Lv.${curLv}`, toCX, toCY + toH / 2 + 18 * s);

        // 升级后效果（自动换行，框内居中；升级项加粗紫色——value 方向高亮数值，rate 方向高亮新概率，混沌法球高亮区间上限）
        const desc = formatItemDesc({ ...joker, real_value: curVal });
        const isRateUpgrade = getWitchUpgradeStep(joker) === undefined && getWitchUpgradeRateStep(joker) !== undefined;
        const successHl = isRateUpgrade ? String(joker.rate)
          : (joker.trigger === 'chaos_orb' ? String(getChaosRange(joker).max) : String(curVal));
        const boxW = 245 * s;
        const boxH = 88 * s;
        const boxY = toCY + toH / 2 + 36 * s;
        this.roundRect(toCX - boxW / 2, boxY, boxW, boxH, 6 * s, '#f0e8d8', '#e0d4b8', 1 * s);
        drawStyledDesc(desc, successHl, toCX, boxY, boxH, boxW - 16 * s, 14, 17 * s);

        // 确认按钮（关闭弹窗）：复用购买成功/结算「领取」按钮样式
        const cfmW = 200 * s;
        const cfmH = 44 * s;
        const cfmX = px + (pw - cfmW) / 2;
        const cfmY = py + ph - cfmH - 20 * s;
        this._drawScaledButton(ctx, '确认', cfmX, cfmY, cfmW, cfmH, s, !!popup._confirmPressed, { color: '#c4a35a', radius: 8 });
        ctx.restore();
        this._witchUpgradeConfirmRect = { x: cfmX, y: cfmY, w: cfmW, h: cfmH, enabled: true };
      } else if (joker) {
        const curLv = joker.level || 1;
        const curVal = (joker.real_value !== undefined && joker.real_value !== null) ? joker.real_value : joker.value;
        const step = getWitchUpgradeStep(joker);
        const rateStep = getWitchUpgradeRateStep(joker);
        // 升级预览：value 方向（默认加 real_value）或 rate 方向（概率类卡牌加 rate，如以小博大 40%→45%）
        // level 同步 +1：混沌法球的随机区间按等级计算，预览才能显示上移后的新区间
        const nextPreview = step !== undefined
          ? { ...joker, real_value: Math.round((curVal + step) * 10) / 10, level: curLv + 1 }
          : { ...joker, rate: (joker.rate || 0) + rateStep };
        // 升级后框内高亮字符串：value 方向高亮新数值，rate 方向高亮新概率，混沌法球高亮新区间上限
        const nextHl = step !== undefined
          ? (joker.trigger === 'chaos_orb' ? String(getChaosRange(nextPreview).max) : String(nextPreview.real_value))
          : String(nextPreview.rate);
        const cost = (curLv + 1) * joker.cost;

        // ===== 等级对比预览：当前 → 下一级 =====
        const cardW = 70 * s;
        const cardH = 84 * s;
        const cardY = py + 86 * s;
        // 升级后的卡牌更大（右侧）
        const nextCardW = 80 * s;
        const nextCardH = 96 * s;
        const leftCX = px + pw / 2 - 64 * s;
        const rightCX = px + pw / 2 + 64 * s;
        const centerY = cardY + cardH / 2;
        this._drawPropCard(ctx, joker, leftCX - cardW / 2, cardY, cardW, cardH, s, true, false, { maskInset: 4 * s });
        const nextCardX = rightCX - nextCardW / 2;
        const nextCardY = centerY - nextCardH / 2;
        this._drawPropCard(ctx, joker, nextCardX, nextCardY, nextCardW, nextCardH, s, true, false, { maskInset: 4 * s });
        // 升级后卡牌：紫色斜光扫过（参考主页大按钮）
        this._drawRectSweep(ctx, nextCardX, nextCardY, nextCardW, nextCardH, s, 'purple', 0);
        // 中间箭头
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#c9a84c';
        ctx.fillText('》', px + pw / 2, centerY);

        // 等级标签（加粗；两卡高度不同但标签水平对齐，统一按左卡底部取齐）
        const lvLabelY = cardY + cardH + 14 * s;
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#8a7a5a';
        ctx.fillText(`Lv.${curLv}`, leftCX, lvLabelY);
        ctx.fillStyle = '#9b59b6';
        ctx.fillText(`Lv.${curLv + 1}`, rightCX, lvLabelY);

        // 效果对比框（两个框之间留间距；内容文字自动换行不超出框；升级后框内 value 加粗紫色）
        const boxW = 112 * s;
        const boxH = 64 * s;
        const boxY = cardY + cardH + 26 * s;
        const curDesc = formatItemDesc({ ...joker, real_value: curVal });
        const nextDesc = formatItemDesc(nextPreview);
        [[leftCX, curDesc, null], [rightCX, nextDesc, nextHl]].forEach(([bcx, desc, hlVal]) => {
          this.roundRect(bcx - boxW / 2, boxY, boxW, boxH, 6 * s, '#f0e8d8', '#e0d4b8', 1 * s);
          if (hlVal) {
            drawStyledDesc(desc, hlVal, bcx, boxY, boxH, boxW - 14 * s, 12, 14 * s);
            return;
          }
          const lines = wrapDesc(desc, boxW - 14 * s);
          ctx.font = `${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          // 内容在框内垂直居中
          const firstY = boxY + boxH / 2 - ((lines.length - 1) * 14 * s) / 2;
          lines.forEach((ln, li) => {
            ctx.fillText(ln, bcx, firstY + li * 14 * s);
          });
        });

        // ===== 选择已有卡牌（仅列出可升级的女巫牌） =====
        const pickY = boxY + boxH + 26 * s;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        const pickText = '选择已有卡牌';
        ctx.fillText(pickText, px + pw / 2, pickY);
        // 文字左右装饰线（score_line.png，右侧水平镜像，参考计分方块两侧装饰）
        if (this.scoreLineImg && this.scoreLineLoaded) {
          const pickTextW = ctx.measureText(pickText).width;
          const lineAspect = (this.scoreLineImg.width || 20) / (this.scoreLineImg.height || 80);
          const lineH = 15 * s;
          const lineW = lineH * lineAspect;
          const lineGap = 8 * s;
          const lineY = pickY - lineH / 2;
          ctx.drawImage(this.scoreLineImg, px + pw / 2 - pickTextW / 2 - lineGap - lineW, lineY, lineW, lineH);
          ctx.save();
          ctx.translate(px + pw / 2 + pickTextW / 2 + lineGap + lineW, lineY);
          ctx.scale(-1, 1);
          ctx.drawImage(this.scoreLineImg, 0, 0, lineW, lineH);
          ctx.restore();
        }

        const upList = jokers.map((j, i) => ({ j, i })).filter(e => upgradeable(e.j));
        const n = upList.length;
        const gap2 = 8 * s;
        const cw = Math.min(56 * s, (pw - 40 * s - (n - 1) * gap2) / Math.max(n, 1));
        const ch = cw * 1.2;
        const rowY = pickY + 20 * s;
        const totalW = n * cw + (n - 1) * gap2;
        let rowX = px + (pw - totalW) / 2;
        upList.forEach(({ j, i }) => {
          this._drawPropCard(ctx, j, rowX, rowY, cw, ch, s, true, false);
          // 选中：金色描边 + 右上角勾选
          if (i === selIndex) {
            this.roundRect(rowX - 2 * s, rowY - 2 * s, cw + 4 * s, ch + 4 * s, 6 * s, null, '#c9a84c', 2 * s);
            const ckR = 8 * s;
            const ckX = rowX + cw - 2 * s;
            const ckY = rowY + 2 * s;
            ctx.save();
            ctx.fillStyle = '#c9a84c';
            ctx.beginPath();
            ctx.arc(ckX, ckY, ckR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', ckX, ckY);
            ctx.restore();
          }
          // 等级标签
          ctx.save();
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`Lv.${(j && j.level) || 1}`, rowX + cw / 2, rowY + ch + 11 * s);
          ctx.restore();
          this._witchUpgradeCardRects.push({ x: rowX, y: rowY, w: cw, h: ch, index: i });
          rowX += cw + gap2;
        });

        // ===== 升级消耗 + 确认升级 =====
        const canAfford = game.gold >= cost;
        const costY = py + ph - 96 * s + 7 * s; // 整体下移 7px

        // 升级消耗上方分割线（弹窗宽度 90%，浅棕色）
        const costLineW = pw * 0.9;
        ctx.save();
        ctx.strokeStyle = '#d4c9a8';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(px + (pw - costLineW) / 2, costY - 16 * s);
        ctx.lineTo(px + (pw + costLineW) / 2, costY - 16 * s);
        ctx.stroke();
        ctx.restore();

        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        const costLabel = '升级消耗';
        const costNum = String(cost);
        const costLabelW = ctx.measureText(costLabel).width;
        const costNumW = ctx.measureText(costNum).width;
        const costCoinSize = 16 * s;
        const costTotalW = costLabelW + 6 * s + costCoinSize + 3 * s + costNumW;
        let costX = px + pw / 2 - costTotalW / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8a7a5a';
        ctx.fillText(costLabel, costX, costY);
        costX += costLabelW + 6 * s;
        if (this.coinIcon && this.coinIconLoaded) {
          ctx.drawImage(this.coinIcon, costX, costY - costCoinSize / 2, costCoinSize, costCoinSize);
        }
        costX += costCoinSize + 3 * s;
        ctx.fillStyle = canAfford ? '#8b6914' : '#c0392b';
        ctx.fillText(costNum, costX, costY);
        ctx.textAlign = 'center';

        // 确认升级按钮（金币不足置灰）：复用购买成功/结算「领取」按钮样式 + 水波纹
        const cfmW = 200 * s;
        const cfmH = 44 * s;
        const cfmX = px + (pw - cfmW) / 2;
        const cfmY = py + ph - cfmH - 20 * s;
        if (canAfford) {
          // 水波纹（参考女巫奖励/获得女巫牌「领取」按钮，金币不足置灰时不显示）
          this._drawButtonRipple(ctx, cfmX, cfmY, cfmW, cfmH, s, {
            stateKey: 'witch_upgrade_confirm',
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
        }
        this._drawScaledButton(ctx, '确认升级', cfmX, cfmY, cfmW, cfmH, s, !!popup._confirmPressed,
          { color: canAfford ? '#c4a35a' : '#b8b0a0', radius: 8 });
        this._witchUpgradeConfirmRect = { x: cfmX, y: cfmY, w: cfmW, h: cfmH, enabled: canAfford };
      } else {
        // 无可升级女巫牌
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#a09070';
        ctx.fillText('暂无可升级的女巫牌', px + pw / 2, py + ph / 2);
      }

      ctx.restore();

      // 关闭按钮（复用单词本样式）
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const closePressOffset = popup._closePressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + closePressOffset, closeSize, closeSize);
      } else {
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.beginPath();
        ctx.arc(closeX + closeSize / 2, closeY + closePressOffset + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        const xPad = 8 * s;
        ctx.beginPath();
        ctx.moveTo(closeX + xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + closeSize - xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.moveTo(closeX + closeSize - xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this._witchUpgradeCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };
      this._witchUpgradePanelRect = { x: px, y: py, w: pw, h: ph };
    }


    Renderer.prototype.drawChangeLetterPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._changeLetterPopup;
      if (!popup) return;

      const { LETTER_SCORE } = require('../data');

      const elapsed = Date.now() - (popup.startTime || Date.now());
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: game._closingChangeLetter,
        closeStartTime: game._closeChangeLetterStartTime,
        width: 300, height: 410,
        borderRadius: 12, borderWidth: 2,
        overlayAlpha: 0.5, overlayFadeInDuration: 200,
        enterOffset: 30,
        closeDuration: 300,
        elapsed,
        onCloseComplete: () => {}
      });
      if (!panel) return;
      const { px, py, pw, ph, enterProgress, closeAlpha } = panel;

      const baseAlpha = enterProgress;
      const gold = '#c4a35a';

      // 标题:字母置换
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('字母置换', W / 2, py + 30 * s);
      ctx.restore();

      // 标题分隔线
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      ctx.strokeStyle = 'rgba(196,163,90,0.4)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(px + 30 * s, py + 48 * s);
      ctx.lineTo(px + pw - 30 * s, py + 48 * s);
      ctx.stroke();
      ctx.restore();

      // 选中的字母卡牌(放大到 0.7,保留选中态以显示 selected.png)
      const selectedCard = game.hand.find(c => c && c.id === popup.cardId);
      if (selectedCard) {
        ctx.save();
        ctx.globalAlpha = baseAlpha * closeAlpha;
        ctx.translate(W / 2, py + 96 * s);
        ctx.scale(0.8, 0.8);
        this.drawCard(selectedCard, -this.cardW / 2, -this.cardH / 2);
        ctx.restore();
      }

      // 字母块区域
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const lCols = 7;
      const lBtnSize = 30 * s;
      const lGap = 6 * s;
      const lTotalW = lCols * lBtnSize + (lCols - 1) * lGap;
      const lStartX = (W - lTotalW) / 2;
      const lStartY = py + 160 * s;

      this.changeLetterRects = [];
      letters.forEach((letter, i) => {
        const col = i % lCols;
        const row = Math.floor(i / lCols);
        const lx = lStartX + col * (lBtnSize + lGap);
        const ly = lStartY + row * (lBtnSize + lGap);
        const isOriginal = letter === popup.originalLetter;
        const isSelected = popup.targetLetter === letter;

        ctx.save();
        ctx.globalAlpha = baseAlpha * closeAlpha;
        if (isOriginal) {
          // 置灰禁用
          this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#e8e4dc');
          ctx.fillStyle = '#b0a898';
        } else if (isSelected) {
          // 选中态:金色背景
          this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#fdf5e0', '#c4a35a', 2 * s);
          ctx.fillStyle = '#8b6914';
        } else {
          // 普通态
          this.roundRect(lx, ly, lBtnSize, lBtnSize, 6 * s, '#f5f0e6', '#d4c9a8', 1 * s);
          ctx.fillStyle = '#5a4a2a';
        }
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, lx + lBtnSize / 2, ly + lBtnSize / 2);
        ctx.restore();

        if (!isOriginal) {
          this.changeLetterRects.push({ x: lx, y: ly, w: lBtnSize, h: lBtnSize, letter });
        }
      });

      // 选中的转换提示 "A → B"(金棕色)
      if (popup.targetLetter) {
        const arrowY = lStartY + Math.ceil(letters.length / lCols) * (lBtnSize + lGap) + 12 * s;
        ctx.save();
        ctx.globalAlpha = baseAlpha * closeAlpha;
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${popup.originalLetter} → ${popup.targetLetter}`, W / 2, arrowY);
        ctx.restore();
      }

      // 置换按钮
      const btnW = 130 * s;
      const btnH = 42 * s;
      const btnX = (W - btnW) / 2;
      const btnY = py + ph - btnH - 20 * s;
      const canSwap = !!popup.targetLetter;
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      this.roundRect(btnX, btnY, btnW, btnH, 8 * s,
        canSwap ? '#c4a35a' : '#d4c9a8',
        canSwap ? null : '#bbb', canSwap ? 0 : 1.5 * s);
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('置换', W / 2, btnY + btnH / 2);
      ctx.restore();
      this.changeLetterSwapBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH, enabled: canSwap };

      // 关闭按钮(右上角 X)
      const closeSize = 28 * s;
      const closeX = px + pw - closeSize - 8 * s;
      const closeY = py + 8 * s;
      ctx.save();
      ctx.globalAlpha = baseAlpha * closeAlpha;
      ctx.beginPath();
      ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fill();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 1 * s);
      ctx.restore();
      this.changeLetterCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };
    }

    // 药水页面通用左上角返回按钮（返回商店，并将药水暂存/丢弃）
    Renderer.prototype._drawPotionBackButton = function(game) {
      const ctx = this.ctx;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const titleY = top - 10 * s;
      const backIconSize = 16 * s;
      const backIconX = 14 * s;
      const rightIcon = this.settingIcons && this.settingIcons.right;

      ctx.save();
      if (rightIcon && rightIcon.loaded && rightIcon.img) {
        ctx.translate(backIconX + backIconSize / 2, titleY);
        ctx.scale(-1, 1);
        ctx.drawImage(rightIcon.img, -backIconSize / 2, -backIconSize / 2, backIconSize, backIconSize);
      } else {
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('‹', backIconX, titleY);
      }
      ctx.restore();

      this.potionBackRect = { x: backIconX - 14 * s, y: titleY - 18 * s, w: backIconSize + 28 * s, h: 36 * s };
    };

    // 药水页面返回商店确认弹窗（药水槽位满时提示丢弃）
    Renderer.prototype._drawPotionBackConfirmPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const pw = 260 * s;
      const ph = 230 * s;
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      const r = 14 * s;
      const gold = '#c4a35a';

      if (!game._potionBackConfirmAnimStart) {
        game._potionBackConfirmAnimStart = Date.now();
      }
      const elapsed = Date.now() - game._potionBackConfirmAnimStart;
      const enterProgress = Math.min(elapsed / 300, 1);
      const enterEase = Easing.easeOutBack(enterProgress);
      const drawPy = py + (1 - enterEase) * 25 * s;

      // 遮罩
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.65 * enterEase})`;
      ctx.fillRect(0, 0, W, H);

      // 背景 + 金色边框
      this.roundRect(px, drawPy, pw, ph, r, '#faf6ee', gold);

      // 内层细边框
      ctx.save();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const inset = 4 * s;
      const ix = px + inset, iy = drawPy + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = r - inset;
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

      // 标题
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('返回商店', W / 2, drawPy + 42 * s);
      ctx.restore();

      // 标题下装饰线
      const decoLineY = drawPy + 58 * s;
      ctx.save();
      ctx.strokeStyle = 'rgba(196,163,90,0.4)';
      ctx.lineWidth = 1 * s;
      const dlW = pw * 0.45;
      const dlX = px + (pw - dlW) / 2;
      ctx.beginPath();
      ctx.moveTo(dlX, decoLineY);
      ctx.lineTo(dlX + dlW, decoLineY);
      ctx.stroke();
      ctx.save();
      ctx.translate(W / 2, decoLineY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gold;
      ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
      ctx.restore();
      ctx.restore();

      // 中间文字
      const text = '药水卡牌槽位已满，返回商店等于自动丢弃该卡牌';
      ctx.save();
      ctx.font = `${Math.floor(14 * s)}px ${this.titleFontFamily || 'sans-serif'}`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const maxW = pw - 48 * s;
      const lineHeight = 20 * s;
      const lines = [];
      let line = '';
      for (let i = 0; i < text.length; i++) {
        const testLine = line + text[i];
        if (ctx.measureText(testLine).width > maxW && line !== '') {
          lines.push(line);
          line = text[i];
        } else {
          line = testLine;
        }
      }
      lines.push(line);
      const startY = drawPy + 100 * s - (lines.length - 1) * lineHeight / 2;
      lines.forEach((l, i) => {
        ctx.fillText(l, W / 2, startY + i * lineHeight);
      });
      ctx.restore();

      // 底部两个按钮：取消 / 确定
      const btnW = 108 * s;
      const btnH = 42 * s;
      const btnGap = 18 * s;
      const totalW = btnW * 2 + btnGap;
      const btnY = drawPy + ph - btnH - 30 * s;
      const cancelX = (W - totalW) / 2;
      const confirmX = cancelX + btnW + btnGap;

      // 取消按钮（灰色）
      const cancelPressed = game._potionBackConfirmCancelPressed || false;
      const cancelOffset = cancelPressed ? 2 * s : 0;
      this.roundRect(cancelX, btnY + cancelOffset, btnW, btnH, 8 * s, '#9e9e9e', '#7a7a7a', 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('取消', cancelX + btnW / 2, btnY + cancelOffset + btnH / 2);
      ctx.restore();

      // 确定按钮
      const confirmPressed = game._potionBackConfirmOkPressed || false;
      const confirmOffset = confirmPressed ? 2 * s : 0;
      this.roundRect(confirmX, btnY + confirmOffset, btnW, btnH, 8 * s, '#c4a35a');
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('确定', confirmX + btnW / 2, btnY + confirmOffset + btnH / 2);
      ctx.restore();

      this.potionBackConfirmCancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
      this.potionBackConfirmOkRect = { x: confirmX, y: btnY, w: btnW, h: btnH };
      ctx.restore();
    };

    Renderer.prototype.drawPotion = function(game) {
      // 吸星大法：选择阶段
      if (game.potionMode && game.potionMode.effect === 'absorb_stars') {
        this._drawAbsorbStarsSelect(game);
        return;
      }

      // 星辉洗涤：动画/结果阶段优先
      if (game._starlightWashAnim) {
        this._drawStarlightWashAnim(game);
        return;
      }

      // 星辉洗涤：选择阶段
      if (game.potionMode && game.potionMode.effect === 'starlight_wash') {
        this._drawStarlightWashSelect(game);
        return;
      }

      // 危险复制：动画/结果阶段优先
      if (game._replicateAnim) {
        this._drawReplicateAnim(game);
        return;
      }

      // 平分秋色：动画/结果阶段优先
      if (game._equalSplitAnim) {
        this._drawEqualSplitAnim(game);
        return;
      }

      // 平分秋色：选择阶段
      if (game.potionMode && game.potionMode.effect === 'equal_split') {
        this._drawEqualSplitSelect(game);
        return;
      }

      // 危险复制：选择阶段
      if (game.potionMode && game.potionMode.effect === 'replicate_letter') {
        this._drawReplicateSelect(game);
        return;
      }

      // 随机强化药水：先画转盘背景，再叠加升级动画
      if (game.potionMode && game.potionMode.effect === 'random_upgrade') {
        this.drawRandomUpgradePopup(game);
        if (game._potionUpgrading) {
          this._drawPotionUpgradeAnim(game);
        }
        return;
      }

      // 其他药水：如果 potionMode 已清除，只剩动画，直接处理
      if (game._potionUpgrading && !game.potionMode) {
        this._drawPotionUpgradeAnim(game);
        return;
      }

      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      // LETTER_SCORE 和 letterUpgrades 已在顶部导入

      // 背景由 render() 统一绘制 bgImage,不覆盖

      // === 顶部栏(参考商店页样式)===
      // 字母升级页面不显示设置和金币胶囊
      // this.drawTopHeader(game);

      // 标题区域 Y 坐标(与商店页"商店"标题位置一致)
      const titleY = top - 10 * s;

      // 左上角返回按钮
      this._drawPotionBackButton(game);

      // 标题
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('字母升级', W / 2, titleY);
      ctx.restore();

      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择一张字母牌,分数+10,本赛局内有效', W / 2, subTitleY);
      ctx.restore();

      // === 分隔线(两条线 + 中间菱形)===
      const dividerY = subTitleY + 22 * s;
      const lineW = 80 * s;
      const lineGap = 8 * s;
      const lineColor = '#c4a35a';
      const centerX = W / 2;
      // 左线
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(centerX - lineGap - lineW, dividerY);
      ctx.lineTo(centerX - lineGap, dividerY);
      ctx.stroke();
      // 右线
      ctx.beginPath();
      ctx.moveTo(centerX + lineGap, dividerY);
      ctx.lineTo(centerX + lineGap + lineW, dividerY);
      ctx.stroke();
      // 中间菱形
      const diamondSize = 5 * s;
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(centerX, dividerY - diamondSize);
      ctx.lineTo(centerX + diamondSize, dividerY);
      ctx.lineTo(centerX, dividerY + diamondSize);
      ctx.lineTo(centerX - diamondSize, dividerY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // === A-Z 字母网格 ===
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const cols = 4;
      const btnSize = 54 * s;
      const btnGap = 13 * s;
      const totalGridW = cols * btnSize + (cols - 1) * btnGap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = dividerY + 30 * s;

      // 王牌强化(upgrade_face)只允许选择 X/Y/Z
      const isFaceOnly = game.potionMode && game.potionMode.effect === 'upgrade_face';
      // 如果当前选中了不允许的字母,自动清除
      if (isFaceOnly && game._potionSelectedLetter && !['X', 'Y', 'Z'].includes(game._potionSelectedLetter)) {
        game._potionSelectedLetter = null;
      }
      const selectedLetter = game._potionSelectedLetter || null;

      this.potionLetterRects = [];
      letters.forEach((letter, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridStartX + col * (btnSize + btnGap);
        const y = gridStartY + row * (btnSize + btnGap);

        const isSelected = selectedLetter === letter;
        const isAllowed = !isFaceOnly || ['X', 'Y', 'Z'].includes(letter);

        // 背景圆角矩形(带底部阴影,微微立体感)
        const br = 8 * s;
        ctx.save();
        if (isSelected && isAllowed) {
          // 选中状态:金色背景+阴影
          ctx.shadowColor = 'rgba(196,163,90,0.35)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 3 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
        } else if (!isAllowed) {
          // 禁用状态:浅灰背景 + 淡阴影
          ctx.shadowColor = 'rgba(0,0,0,0.06)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#e8e4dc', null, 0);
        } else {
          // 普通状态:米色背景 + 底部阴影
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#f5f0e6', '#d4c9a8', 1.5 * s);
        }
        ctx.restore();

        // 字母与分数
        const up = letterUpgrades.get(letter) || {};
        const letterScore = Math.floor(LETTER_SCORE[letter] * (up.mult || 1)) + (up.add || 0);
        const centerX = x + btnSize / 2;
        const centerY = y + btnSize / 2;

        ctx.save();
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        if (isSelected && isAllowed) {
          ctx.fillStyle = '#8b6914';
        } else if (!isAllowed) {
          ctx.fillStyle = '#b0a898';
        } else {
          ctx.fillStyle = '#5a4a2a';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, centerX, centerY - 7 * s);
        ctx.restore();

        ctx.save();
        ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
        if (isSelected && isAllowed) {
          ctx.fillStyle = '#c4a35a';
        } else if (!isAllowed) {
          ctx.fillStyle = '#c0b8a8';
        } else {
          ctx.fillStyle = '#9a7b3d';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letterScore, centerX, centerY + 11 * s);
        ctx.restore();

        if (isAllowed) {
          this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
        }
      });

      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

      // === 升级后字母分提示 ===
      if (selectedLetter) {
        const scoreTipY = gridBottomY + 18 * s;
        const baseScore = LETTER_SCORE[selectedLetter];
        const upgrade = letterUpgrades.get(selectedLetter);
        const currentScore = upgrade
          ? Math.floor(baseScore * (upgrade.mult || 1)) + (upgrade.add || 0)
          : baseScore;
        const afterScore = currentScore + 10;
        ctx.save();
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`升级后: ${currentScore} → ${afterScore}`, W / 2, scoreTipY);
        ctx.restore();
      }

      // === 底部按钮区域(升级 + 暂存)===
      const btnAreaY = H - 75 * s;
      const potionBtnW = 130 * s;
      const potionBtnH = 46 * s;
      const potionBtnGap = 16 * s;
      const totalBtnW = potionBtnW * 2 + potionBtnGap;
      const btnStartX = (W - totalBtnW) / 2;

      // 升级按钮(需要选中字母)
      const upgradeBtnX = btnStartX;
      const upgradeBtnY = btnAreaY;
      const upgradeEnabled = !!selectedLetter && !game._potionUpgrading && !!game.potionMode;
      this.roundRect(upgradeBtnX, upgradeBtnY, potionBtnW, potionBtnH, 10 * s,
        upgradeEnabled ? '#c4a35a' : '#d4c9a8',
        upgradeEnabled ? null : '#bbb', upgradeEnabled ? 0 : 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('升级', upgradeBtnX + potionBtnW / 2, upgradeBtnY + potionBtnH / 2);
      ctx.restore();
      this.potionUpgradeBtnRect = { x: upgradeBtnX, y: upgradeBtnY, w: potionBtnW, h: potionBtnH, enabled: upgradeEnabled };

      // 暂存按钮(始终可点,除非正在动画中)
      const stashBtnX = btnStartX + potionBtnW + potionBtnGap;
      const stashBtnY = btnAreaY;
      const stashEnabled = !game._potionUpgrading;
      this.roundRect(stashBtnX, stashBtnY, potionBtnW, potionBtnH, 10 * s,
        stashEnabled ? '#f5f0e6' : '#e8e4dc',
        stashEnabled ? '#c4a35a' : '#bbb', 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = stashEnabled ? '#8b6914' : '#b0a898';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂存', stashBtnX + potionBtnW / 2, stashBtnY + potionBtnH / 2);
      ctx.restore();
      this.potionStashBtnRect = { x: stashBtnX, y: stashBtnY, w: potionBtnW, h: potionBtnH, enabled: stashEnabled };

      // 如果正在播放升级动画,叠加在字母选择页面上方
      if (game._potionUpgrading) {
        this._drawPotionUpgradeAnim(game);
      }
    }

    Renderer.prototype.drawRandomUpgradePopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const popup = game._randomUpgradePopup;

      // 顶部栏
      // 随机强化页面不显示设置和金币胶囊
      // this.drawTopHeader(game);

      const titleY = top - 10 * s;

      // 左上角返回按钮
      this._drawPotionBackButton(game);

      // 标题
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('随机强化', W / 2, titleY);
      ctx.restore();

      // 副标题
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('点击抽选字母,分数乘以1.2~3倍,本赛局有效', W / 2, subTitleY);
      ctx.restore();

      // 分隔线
      const dividerY = subTitleY + 22 * s;
      const lineW = 80 * s;
      const lineGap = 8 * s;
      const lineColor = '#c4a35a';
      const centerX = W / 2;
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(centerX - lineGap - lineW, dividerY);
      ctx.lineTo(centerX - lineGap, dividerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX + lineGap, dividerY);
      ctx.lineTo(centerX + lineGap + lineW, dividerY);
      ctx.stroke();
      const diamondSize = 5 * s;
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(centerX, dividerY - diamondSize);
      ctx.lineTo(centerX + diamondSize, dividerY);
      ctx.lineTo(centerX, dividerY + diamondSize);
      ctx.lineTo(centerX - diamondSize, dividerY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // === 圆形转盘 ===
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const isSpinning = popup && popup.phase === 'spinning';
      const isPaused = popup && (popup.phase === 'paused' || popup.phase === 'done');
      const targetLetter = popup ? popup.targetLetter : null;

      const wheelRadius = 160 * s;
      const wheelCenterY = dividerY + 30 * s + wheelRadius + 50 * s;
      const anglePerSector = 360 / 26;

      // 计算当前旋转角度和高亮字母
      let currentAngle = 0;
      let highlightIdx = -1;

      if (isSpinning || isPaused) {
        const targetIdx = letters.indexOf(targetLetter);
        const targetCenterAngle = targetIdx * anglePerSector + anglePerSector / 2;
        const rotations = 3;
        const finalAngle = 360 * rotations + (360 - targetCenterAngle);

        if (isSpinning) {
          const elapsed = Date.now() - popup.spinStartTime;
          const progress = Math.min(elapsed / 3000, 1);
          const ease = Easing.easeOutCubic(progress);
          currentAngle = finalAngle * ease;
        } else {
          currentAngle = finalAngle;
        }

        const normalized = ((-currentAngle) % 360 + 360) % 360;
        highlightIdx = Math.floor(normalized / anglePerSector) % 26;
      }

      // paused 阶段:扇形闪烁约1.5次(浅金色 ↔ 金色,周期750ms)
      let pausedPulse = 1;
      let currentHighlightColor = '#ffe8a0';
      if (isPaused && popup.pauseStartTime && !game._potionUpgrading) {
        const pauseElapsed = Date.now() - popup.pauseStartTime;
        pausedPulse = 1 + 0.08 * Math.sin(Date.now() / 200);
        const cycle = 750; // 单个周期 750ms
        const maxFlashTime = cycle * 1.5; // 只闪 1.5 个周期
        if (pauseElapsed < maxFlashTime) {
          const flash = Math.sin(pauseElapsed / (cycle / 2) * Math.PI);
          currentHighlightColor = flash > 0 ? '#f5c542' : '#ffe8a0';
        } else {
          currentHighlightColor = '#f5c542'; // 之后固定金色
        }
      }

      // 绘制转盘外圈圆环
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, wheelCenterY, wheelRadius + 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#c4a35a';
      ctx.fill();
      ctx.restore();

      // 绘制转盘扇形(随转盘旋转)
      ctx.save();
      ctx.translate(centerX, wheelCenterY);
      ctx.rotate(currentAngle * Math.PI / 180);

      const sectorColors = ['#f5f0e6', '#fdf5e0'];
      const anglePerSectorRad = (Math.PI * 2) / 26;
      const startOffset = -Math.PI / 2; // A 从 12 点钟开始

      for (let i = 0; i < 26; i++) {
        const startAngle = startOffset + i * anglePerSectorRad;
        const endAngle = startOffset + (i + 1) * anglePerSectorRad;
        const isHighlighted = i === highlightIdx;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, wheelRadius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = isHighlighted ? currentHighlightColor : sectorColors[i % 2];
        ctx.fill();
        ctx.lineWidth = 0.8 * s;
        ctx.strokeStyle = '#d4c9a8';
        ctx.stroke();

        // 高亮扇形加金色边框
        if (isHighlighted) {
          ctx.save();
          ctx.strokeStyle = '#c4a35a';
          ctx.lineWidth = 2.5 * s * pausedPulse;
          ctx.shadowColor = 'rgba(196,163,90,0.5)';
          ctx.shadowBlur = 10 * s * pausedPulse;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 绘制字母(径向排列,从外向内)
      for (let i = 0; i < 26; i++) {
        const midAngle = startOffset + i * anglePerSectorRad + anglePerSectorRad / 2;
        const textRadius = wheelRadius * 0.72;
        const tx = Math.cos(midAngle) * textRadius;
        const ty = Math.sin(midAngle) * textRadius;
        const isHighlighted = i === highlightIdx;

        ctx.save();
        ctx.translate(tx, ty);
        // 文字沿半径方向,底部朝向中心 → 旋转 midAngle + PI/2
        ctx.rotate(midAngle + Math.PI / 2);
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = isHighlighted ? '#8b6914' : '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letters[i], 0, 0);
        ctx.restore();
      }

      // 外圈装饰圆点
      const dotCount = 26;
      const dotRadius = 2.5 * s;
      const dotR = wheelRadius + 8 * s;
      for (let i = 0; i < dotCount; i++) {
        const angle = i * (Math.PI * 2 / dotCount) - Math.PI / 2;
        const dx = Math.cos(angle) * dotR;
        const dy = Math.sin(angle) * dotR;
        ctx.beginPath();
        ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#f5c542';
        ctx.fill();
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 0.5 * s;
        ctx.stroke();
      }

      ctx.restore(); // 结束转盘旋转

      // === 中心圆形(抽选按钮 / 倍数显示)===
      const btnRadius = 36 * s;
      const isIdle = !popup || popup.phase === 'idle';
      const isPausedOrDone = popup && (popup.phase === 'paused' || popup.phase === 'done');
      const spinEnabled = isIdle;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, wheelCenterY, btnRadius, 0, Math.PI * 2);
      if (isIdle) {
        ctx.fillStyle = '#c0392b';
        ctx.strokeStyle = '#a93226';
      } else if (isSpinning) {
        ctx.fillStyle = '#fdf5e0';
        ctx.strokeStyle = '#c4a35a';
      } else {
        // paused / done:金色背景,与扇形高亮颜色一致
        ctx.fillStyle = '#f5c542';
        ctx.strokeStyle = '#c4a35a';
      }
      ctx.lineWidth = 2 * s;
      ctx.fill();
      ctx.stroke();

      // 按钮内阴影
      ctx.beginPath();
      ctx.arc(centerX, wheelCenterY, btnRadius - 2 * s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1 * s;
      ctx.stroke();

      // 文字:idle 显示"抽选",spinning 快速切换倍数,paused/done 定格最终倍数
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isIdle) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillText('抽选', centerX, wheelCenterY);
      } else if (isSpinning && popup.multSequence) {
        const elapsed = Date.now() - popup.spinStartTime;
        const idx = Math.min(Math.floor(elapsed / 100), popup.multSequence.length - 1);
        const displayMult = popup.multSequence[idx];
        ctx.fillStyle = '#5a4a2a';
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.fillText('×' + displayMult, centerX, wheelCenterY);
      } else if (isPausedOrDone) {
        // done 阶段触发一次放大缩小脉冲
        let scale = 1;
        if (popup.phase === 'done' && game._potionUpgrading) {
          const pulseState = { startTime: game._potionUpgrading.startTime, duration: 400 };
          scale = this._calcPulseScale(pulseState, 0.25).scale;
        }
        ctx.fillStyle = '#5a4a2a';
        ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
        ctx.save();
        ctx.translate(centerX, wheelCenterY);
        ctx.scale(scale, scale);
        ctx.fillText('×' + popup.randomMult, 0, 0);
        ctx.restore();
      }
      ctx.restore();

      // done 阶段且倍率 > 3:中心圆内部放烟花(复用单词验证合法烟花)
      if (popup && popup.phase === 'done' && game._potionUpgrading && game._potionUpgrading.randomMult > 3) {
        if (!game._potionUpgrading._fireworkSpawned) {
          game._potionUpgrading._fireworkSpawned = true;
          this._spawnSparkles(centerX, wheelCenterY, 20);
        }
      }

      // 中心按钮点击区域(圆形)
      this.randomSpinBtnRect = {
        x: centerX - btnRadius,
        y: wheelCenterY - btnRadius,
        w: btnRadius * 2,
        h: btnRadius * 2,
        enabled: spinEnabled,
        isCircle: true,
        cx: centerX,
        cy: wheelCenterY,
        r: btnRadius
      };

      // === 顶部指针(不旋转)===
      const ptrY = wheelCenterY - wheelRadius - 18 * s;
      const ptrW = 18 * s;
      const ptrH = 22 * s;
      ctx.save();
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(centerX, ptrY + ptrH); // 顶点指向转盘
      ctx.lineTo(centerX - ptrW / 2, ptrY);
      ctx.lineTo(centerX + ptrW / 2, ptrY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();

      // 指针底部小圆点
      ctx.beginPath();
      ctx.arc(centerX, ptrY, 3 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
      ctx.restore();

      // === 当前高亮字母提示 ===
      if ((isSpinning || isPaused) && highlightIdx >= 0) {
        const hintY = wheelCenterY + wheelRadius + 28 * s;
        const hlLetter = letters[highlightIdx];
        ctx.save();
        ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
        ctx.fillStyle = isPaused ? '#c0392b' : '#8b6914';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`当前:${hlLetter}`, centerX, hintY);
        ctx.restore();
      }

      // 关闭按钮已移除(随机强化页面无需手动关闭)
      this.randomUpgradeCloseRect = null;
    }

    Renderer.prototype._drawLifeExtensionPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const anim = game._lifeExtensionAnim;
      if (!anim) return;

      const elapsed = Date.now() - anim.startTime;
      // 前1秒只显示闪烁动画(由 drawHUD 绘制),不显示弹窗
      if (elapsed < 1000) return;

      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: false,
        width: 300, height: 260, enterOffset: 25, closeOffset: 40,
        elapsed: elapsed - 1000,
        onCloseComplete: () => {}
      });
      if (!panel) return;
      const { px, py, pw, ph, elapsed: panelElapsed } = panel;

      // 标题
      const titleAnim = Easing.fadeIn(elapsed - 1000, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha;
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('游戏顺延', W / 2, py + 40 * s + titleAnim.yShift);
      ctx.restore();

      // 分隔线
      const line1Anim = Easing.fadeIn(elapsed - 1000, 140, 250, 6 * s);
      ctx.save();
      ctx.globalAlpha = line1Anim.alpha;
      ctx.strokeStyle = 'rgba(196,163,90,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const line1Y = py + 62 * s + line1Anim.yShift;
      ctx.moveTo(px + 30 * s, line1Y);
      ctx.lineTo(px + pw - 30 * s, line1Y);
      ctx.stroke();
      ctx.restore();

      // 提示文案
      const hintAnim = Easing.fadeIn(elapsed - 1000, 200, 250, 8 * s);
      const hintY = py + 100 * s + hintAnim.yShift;
      ctx.save();
      ctx.globalAlpha = hintAnim.alpha;
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('女巫续命', W / 2, hintY);
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.fillText(`下一关目标分 + ${anim.diff} × 2`, W / 2, hintY + 28 * s);
      ctx.restore();

      // 确定按钮
      const btnAnim = Easing.fadeIn(elapsed - 1000, 350, 250, 10 * s);
      const btnW = 160 * s;
      const btnH = 46 * s;
      const btnX = (W - btnW) / 2;
      const btnY = py + ph - btnH - 28 * s + btnAnim.yShift;
      ctx.save();
      ctx.globalAlpha = btnAnim.alpha;
      this._drawScaledButton(ctx, '确定', btnX, btnY, btnW, btnH, s, game._lifeExtensionBtnPressed, { color: '#c4a35a', radius: 8 });
      ctx.restore();

      // 存储点击区域
      const finalBtnY = py + ph - btnH - 28 * s;
      this.lifeExtensionBtnRect = { x: btnX, y: finalBtnY, w: btnW, h: btnH };
    }

    // ===== 重新闯关二次确认弹窗 =====
    Renderer.prototype._drawRestartRoundConfirmPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._restartRoundConfirmPopup;
      if (!popup) return;

      const elapsed = Date.now() - popup.startTime;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: popup.closing || false,
        closeStartTime: popup.closeStartTime,
        width: 300, height: 200, enterOffset: 25, closeOffset: 40,
        elapsed,
        overlayAlpha: 0.6,
        onCloseComplete: () => { game._restartRoundConfirmPopup = null; }
      });
      if (!panel) return;
      const { px, py, pw, ph, elapsed: panelElapsed, closeAlpha } = panel;
      const ca = closeAlpha;

      // 标题
      const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('重新闯关', W / 2, py + 36 * s + titleAnim.yShift);
      ctx.restore();

      // 提示文案
      const hintAnim = Easing.fadeIn(elapsed, 160, 250, 6 * s);
      ctx.save();
      ctx.globalAlpha = hintAnim.alpha * ca;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#6a5a4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('确认重置闯关进度?', W / 2, py + 84 * s + hintAnim.yShift);
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = '#9a8a7a';
      ctx.fillText('重置后将从第 1 关开始', W / 2, py + 108 * s + hintAnim.yShift);
      ctx.restore();

      // 按钮
      const btnW = 110 * s;
      const btnH = 40 * s;
      const btnY = py + ph - btnH - 28 * s;
      const gap = 16 * s;
      const totalW = btnW * 2 + gap;
      const firstBtnX = (W - totalW) / 2;

      const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);

      // 取消按钮
      ctx.save();
      ctx.globalAlpha = btnAnim.alpha * ca;
      this._drawScaledButton(ctx, '取消', firstBtnX, btnY + btnAnim.yShift, btnW, btnH, s, popup.noPressed, { color: '#b0a898', textColor: '#fff', radius: 8 });
      ctx.restore();

      // 确认按钮
      ctx.save();
      ctx.globalAlpha = btnAnim.alpha * ca;
      this._drawScaledButton(ctx, '确认', firstBtnX + btnW + gap, btnY + btnAnim.yShift, btnW, btnH, s, popup.yesPressed, { color: '#c4a35a', textColor: '#fff', radius: 8 });
      ctx.restore();

      // 记录点击区域（使用最终位置，不含 yShift）
      this.restartRoundConfirmNoRect = { x: firstBtnX, y: btnY, w: btnW, h: btnH };
      this.restartRoundConfirmYesRect = { x: firstBtnX + btnW + gap, y: btnY, w: btnW, h: btnH };
    };

    // ===== 对战模式选择弹窗 =====
    Renderer.prototype._drawBattleModeSelectPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._battleModeSelectPopup;
      if (!popup) return;

      const mode = popup.mode || 'select';
      const elapsed = Date.now() - popup.startTime;
      let panelHeight = 240;
      if (mode === 'select') {
        panelHeight = 280;
      } else if (mode === 'friend_join_ready' || mode === 'friend_join_wait') {
        panelHeight = 220;
      }

      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: popup.closing || false,
        closeStartTime: popup.closeStartTime,
        width: 280, height: panelHeight, enterOffset: 25, closeOffset: 40,
        elapsed,
        overlayAlpha: 0.6,
        onCloseComplete: () => { game._battleModeSelectPopup = null; }
      });
      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;
      const ca = closeAlpha;

      const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(popup.title || '对战模式', W / 2, py + 38 * s + titleAnim.yShift);
      ctx.restore();

      // === 标题下装饰线(参考设置弹窗) ===
      const decoLineY = py + 54 * s + titleAnim.yShift;
      const decoLineW = pw * 0.5;
      const decoLineX = px + (pw - decoLineW) / 2;
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
      ctx.restore();

      this.battleModeFriendRect = null;
      this.battleModeOnlineRect = null;
      this.battleModeShareRect = null;
      this.battleModeCancelRect = null;
      this.battleModeStartRect = null;
      this.battleModeCloseRect = null;

      const contentAnim = Easing.fadeIn(elapsed, 180, 250, 6 * s);
      const cx = W / 2;
      const contentY = py + 110 * s;

      // === 右上角关闭按钮(与设置弹窗样式一致) ===
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const closePressOffset = popup.closeBtnPressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = contentAnim.alpha * ca;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + closePressOffset, closeSize, closeSize);
      } else {
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.beginPath();
        ctx.arc(closeX + closeSize / 2, closeY + closePressOffset + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        const xPad = 8 * s;
        ctx.beginPath();
        ctx.moveTo(closeX + xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + closeSize - xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.moveTo(closeX + closeSize - xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this.battleModeCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };

      if (mode === 'friend_loading') {
        // loading 图标：旋转的圆弧
        ctx.save();
        ctx.globalAlpha = contentAnim.alpha * ca;
        ctx.translate(cx, contentY);
        const rotation = (Date.now() % 1000) / 1000 * Math.PI * 2;
        ctx.rotate(rotation);
        const r = 18 * s;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 1.5);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = '#8b6914';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = contentAnim.alpha * ca;
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('正在创建对战房间...', cx, contentY + 34 * s);
        ctx.restore();
        return;
      }

      if (mode === 'friend_room') {
        const hintAnim = contentAnim;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9a8a7a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('房间号', cx, contentY - 16 * s);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(popup.roomId || '', cx, contentY + 10 * s);
        ctx.restore();

        // 按钮：仅分享图片按钮，居中显示
        const shareImg = this.battle_room_share;
        const shareLoaded = this.battle_room_shareLoaded;
        const btnH = 44 * s;
        const btnW = 120 * s;
        const btnY = py + ph - btnH - 26 * s;
        const btnX = (W - btnW) / 2;
        const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);
        const offset = popup.sharePressed ? 2 * s : 0;

        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        if (shareLoaded && shareImg) {
          const imgW = btnW;
          const aspect = shareImg.width / shareImg.height;
          const imgH = imgW / aspect;
          const drawY = btnY + btnAnim.yShift + offset + (btnH - imgH) / 2;
          ctx.save();
          ctx.beginPath();
          const r = 10 * s;
          ctx.moveTo(btnX + r, btnY + btnAnim.yShift + offset);
          ctx.lineTo(btnX + imgW - r, btnY + btnAnim.yShift + offset);
          ctx.quadraticCurveTo(btnX + imgW, btnY + btnAnim.yShift + offset, btnX + imgW, btnY + btnAnim.yShift + offset + r);
          ctx.lineTo(btnX + imgW, btnY + btnAnim.yShift + offset + btnH - r);
          ctx.quadraticCurveTo(btnX + imgW, btnY + btnAnim.yShift + offset + btnH, btnX + imgW - r, btnY + btnAnim.yShift + offset + btnH);
          ctx.lineTo(btnX + r, btnY + btnAnim.yShift + offset + btnH);
          ctx.quadraticCurveTo(btnX, btnY + btnAnim.yShift + offset + btnH, btnX, btnY + btnAnim.yShift + offset + btnH - r);
          ctx.lineTo(btnX, btnY + btnAnim.yShift + offset + r);
          ctx.quadraticCurveTo(btnX, btnY + btnAnim.yShift + offset, btnX + r, btnY + btnAnim.yShift + offset);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(shareImg, btnX, drawY, imgW, imgH);
          ctx.restore();
        } else {
          this._drawScaledButton(ctx, '分享', btnX, btnY + btnAnim.yShift + offset, btnW, btnH, s, popup.sharePressed, { color: '#c4a35a', textColor: '#fff', radius: 8 });
        }
        this.battleModeShareRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        ctx.restore();

        // 不再显示取消按钮
        this.battleModeCancelRect = null;
        return;
      }

      if (mode === 'friend_waiting') {
        // 等待好友加入：保留显示房间号 + 取消按钮
        const hintAnim = contentAnim;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9a8a7a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('房间号', cx, contentY - 16 * s);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(popup.roomId || '', cx, contentY + 10 * s);
        ctx.restore();

        // 等待提示（字体再加大，位置继续下移，深金色）
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        const dots = ['', '.', '..', '...'];
        const idx = Math.floor(Date.now() / 500) % 4;
        ctx.font = `${Math.floor(17 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('等待好友加入' + dots[idx], cx, contentY + 54 * s);
        ctx.restore();

        // 不显示取消按钮
        this.battleModeCancelRect = null;
        return;
      }

      // 房主：好友已加入并准备，双方即将开始倒计时
      if (mode === 'friend_ready') {
        // 这个状态会在极短时间内被轮询切换到 friend_countdown，
        // 兜底显示与 friend_waiting 一致，避免弹窗空白
        const hintAnim = contentAnim;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9a8a7a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('房间号', cx, contentY - 16 * s);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(popup.roomId || '', cx, contentY + 10 * s);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(17 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('好友已准备，即将开始', cx, contentY + 54 * s);
        ctx.restore();
        return;
      }

      // 好友：已加入房间，点击开始对战通知房主
      if (mode === 'friend_join_ready') {
        const hintAnim = contentAnim;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已加入好友房间', cx, contentY - 22 * s);
        ctx.fillText('准备开始对战了吗？', cx, contentY - 4 * s);
        ctx.restore();

        const btnH = 40 * s;
        const btnW = 110 * s;
        const btnY = py + ph - btnH - 28 * s;
        const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);

        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '开始对战', (W - btnW) / 2, btnY + btnAnim.yShift, btnW, btnH, s, popup.startPressed, { color: '#c4a35a', textColor: '#fff', radius: 8 });
        this.battleModeStartRect = { x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH };
        ctx.restore();
        return;
      }

      // 好友：已准备，等待房主开始对战
      if (mode === 'friend_join_wait') {
        const hintAnim = contentAnim;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已准备', cx, contentY - 22 * s);
        ctx.fillText('房主即将开始对战...', cx, contentY - 4 * s);
        ctx.restore();

        // loading 图标
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.translate(cx, contentY + 26 * s);
        const rotation = (Date.now() % 1000) / 1000 * Math.PI * 2;
        ctx.rotate(rotation);
        const r = 14 * s;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 1.5);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = '#8b6914';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // 取消按钮
        const btnH = 36 * s;
        const btnW = 100 * s;
        const btnY = py + ph - btnH - 24 * s;
        const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);

        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '取消', (W - btnW) / 2, btnY + btnAnim.yShift, btnW, btnH, s, popup.cancelPressed, { color: '#b0a898', textColor: '#fff', radius: 8 });
        this.battleModeCancelRect = { x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH };
        ctx.restore();
        return;
      }

      // 好友对战：重开邀请中
      if (mode === 'friend_restart_inviting') {
        const hintAnim = contentAnim;
        const offsetY = 11 * s;
        const loadingR = 22 * s;
        // loading 图标
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.translate(cx, contentY - 8 * s + offsetY);
        const rotation = (Date.now() % 1000) / 1000 * Math.PI * 2;
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.arc(0, 0, loadingR, 0, Math.PI * 1.5);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = '#8b6914';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('正在邀请好友重开一局', cx, contentY + 30 * s + offsetY + (loadingR - 18 * s));
        ctx.restore();
        return;
      }

      // 好友对战：收到重开邀请
      if (mode === 'friend_restart_invited') {
        const hintAnim = contentAnim;
        const offsetY = 11 * s;
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('好友邀请您，再来一战！', cx, contentY - 22 * s + offsetY);
        ctx.restore();

        const btnH = 40 * s;
        const btnW = 110 * s;
        const btnY = py + ph - btnH - 28 * s;
        const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);

        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '开始对战', (W - btnW) / 2, btnY + btnAnim.yShift, btnW, btnH, s, popup.startPressed, { color: '#c4a35a', textColor: '#fff', radius: 8 });
        this.battleModeStartRect = { x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH };
        ctx.restore();
        return;
      }

      // 好友对战：双方同步 10 秒倒计时
      if (mode === 'friend_countdown') {
        const cdOffsetY = 10 * s;
        const hintAnim = contentAnim;
        const cd = game._friendBattleCountdown;
        const cdElapsed = cd ? Math.max(0, Date.now() - cd.startTime) : 0;
        const secondsTotal = cd ? Math.ceil(cd.duration / 1000) : 10;
        const secondsLeft = Math.max(0, secondsTotal - Math.floor(cdElapsed / 1000));
        const finished = !cd || cd.finished;

        // 倒计时数字背景圆环（参考匹配弹窗金光之环）
        const ringR = 42 * s;
        const ringY = contentY - 6 * s + cdOffsetY;
        const breath = 1 + 0.06 * Math.sin(Date.now() / 400);
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.beginPath();
        ctx.arc(cx, ringY, ringR * breath, 0, Math.PI * 2);
        const ringGrad = ctx.createRadialGradient(cx, ringY, ringR * 0.6, cx, ringY, ringR * 1.2);
        ringGrad.addColorStop(0, 'rgba(196, 163, 90, 0.25)');
        ringGrad.addColorStop(0.5, 'rgba(196, 163, 90, 0.55)');
        ringGrad.addColorStop(1, 'rgba(196, 163, 90, 0.15)');
        ctx.strokeStyle = ringGrad;
        ctx.lineWidth = 4 * s;
        ctx.stroke();
        ctx.restore();

        // 倒计时数字
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `bold ${Math.floor(42 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(secondsLeft), cx, ringY);
        ctx.restore();

        // 副标题
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#6a5a4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const subtitle = finished
          ? '正在开始对战...'
          : '请做好对战准备';
        ctx.fillText(subtitle, cx, ringY + ringR + 18 * s);
        ctx.restore();
        return;
      }

      // 兜底：上面的分支都已经 return，如果 mode 没匹配到也要重置按钮热区，避免旧热区残留
      this.battleModeStartRect = null;
      this.battleModeCancelRect = null;

      const friendImg = this.battle_friends;
      const randomImg = this.battle_random;
      const friendLoaded = this.battle_friendsLoaded;
      const randomLoaded = this.battle_randomLoaded;

      const itemW = pw - 48 * s;
      const itemGap = 10 * s;
      const itemStartY = py + 72 * s;
      const items = [
        { key: 'friend', img: friendImg, loaded: friendLoaded },
        { key: 'online', img: randomImg, loaded: randomLoaded }
      ];
      // 按原图比例计算每张图片的实际高度，确保间距精确可控
      const itemHeights = items.map(item => {
        if (item.loaded && item.img && item.img.height > 0) {
          const aspect = item.img.width / item.img.height;
          return itemW / aspect;
        }
        return 80 * s;
      });

      const verticalOffsets = [10 * s, 15 * s];

      const btnAnim = Easing.fadeIn(elapsed, 200, 250, 6 * s);
      let currentY = itemStartY;
      items.forEach((item, i) => {
        const itemH = itemHeights[i];
        const extraY = verticalOffsets[i] || 0;
        const itemY = currentY + extraY;
        currentY += itemH + itemGap + extraY;
        const pressed = item.key === 'friend' ? popup.friendPressed : popup.onlinePressed;
        const offset = pressed ? 2 * s : 0;
        const rect = { x: px + 24 * s, y: itemY, w: itemW, h: itemH };

        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;

        // 绘制图片按钮：优先使用云存储图片，未加载时用圆角矩形兜底
        if (item.loaded && item.img) {
          const imgW = rect.w;
          // 按原图比例计算高度
          const aspect = item.img.width / item.img.height;
          const imgH = imgW / aspect;
          const drawY = rect.y + btnAnim.yShift + offset + (rect.h - imgH) / 2;
          // 保持圆角裁剪
          ctx.save();
          ctx.beginPath();
          const r = 10 * s;
          ctx.moveTo(rect.x + r, rect.y + btnAnim.yShift + offset);
          ctx.lineTo(rect.x + imgW - r, rect.y + btnAnim.yShift + offset);
          ctx.quadraticCurveTo(rect.x + imgW, rect.y + btnAnim.yShift + offset, rect.x + imgW, rect.y + btnAnim.yShift + offset + r);
          ctx.lineTo(rect.x + imgW, rect.y + btnAnim.yShift + offset + rect.h - r);
          ctx.quadraticCurveTo(rect.x + imgW, rect.y + btnAnim.yShift + offset + rect.h, rect.x + imgW - r, rect.y + btnAnim.yShift + offset + rect.h);
          ctx.lineTo(rect.x + r, rect.y + btnAnim.yShift + offset + rect.h);
          ctx.quadraticCurveTo(rect.x, rect.y + btnAnim.yShift + offset + rect.h, rect.x, rect.y + btnAnim.yShift + offset + rect.h - r);
          ctx.lineTo(rect.x, rect.y + btnAnim.yShift + offset + r);
          ctx.quadraticCurveTo(rect.x, rect.y + btnAnim.yShift + offset, rect.x + r, rect.y + btnAnim.yShift + offset);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(item.img, rect.x, drawY, imgW, imgH);
          ctx.restore();
        } else {
          this._drawScaledButton(ctx, '', rect.x, rect.y + btnAnim.yShift + offset, rect.w, rect.h, s, pressed, { color: item.key === 'friend' ? '#c4a35a' : '#8b6914', textColor: '#fff', radius: 10 });
          ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const title = item.key === 'friend' ? '好友对战' : '在线匹配';
          ctx.fillText(title, W / 2, rect.y + rect.h / 2 + btnAnim.yShift + offset);
        }

        ctx.restore();

        if (item.key === 'friend') this.battleModeFriendRect = rect;
        else this.battleModeOnlineRect = rect;
      });
    };

    // ===== 对战房间弹窗（创建成功 / 等待加入 / 加入确认） =====
    Renderer.prototype._drawBattleRoomPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popupKey = game._battleJoinConfirmPopup ? '_battleJoinConfirmPopup' : '_battleRoomPopup';
      const popup = game[popupKey];
      if (!popup) return;

      const elapsed = Date.now() - popup.startTime;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: popup.closing || false,
        closeStartTime: popup.closeStartTime,
        width: 280, height: 240, enterOffset: 25, closeOffset: 40,
        elapsed,
        overlayAlpha: 0.6,
        onCloseComplete: () => {
          game[popupKey] = null;
          if (popupKey === '_battleJoinConfirmPopup') {
            game._pendingBattleRoomId = null;
          }
        }
      });
      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;
      const ca = closeAlpha;

      const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(popup.title || '好友对战', W / 2, py + 38 * s + titleAnim.yShift);
      ctx.restore();

      const hintAnim = Easing.fadeIn(elapsed, 180, 250, 6 * s);
      ctx.save();
      ctx.globalAlpha = hintAnim.alpha * ca;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#6a5a4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (popup.roomId) {
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(popup.roomId, W / 2, py + 86 * s + hintAnim.yShift);
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#9a8a7a';
        ctx.fillText('房间号', W / 2, py + 62 * s + hintAnim.yShift);
      } else {
        ctx.fillText(popup.hint || '', W / 2, py + 80 * s + hintAnim.yShift);
      }
      ctx.restore();

      // 按钮
      const btnW = popup.showShare ? 120 * s : 110 * s;
      const btnH = 40 * s;
      const btnY = py + ph - btnH - 28 * s;
      const gap = popup.showShare ? 16 * s : 0;
      const totalW = popup.showShare ? btnW * 2 + gap : btnW;
      const firstBtnX = (W - totalW) / 2;

      const btnAnim = Easing.fadeIn(elapsed, 260, 250, 10 * s);

      if (popup.showStart) {
        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '开始', firstBtnX, btnY + btnAnim.yShift, btnW, btnH, s, popup.startPressed, { color: '#c4a35a', textColor: '#fff', radius: 8 });
        ctx.restore();
        this.battleRoomStartRect = { x: firstBtnX, y: btnY, w: btnW, h: btnH };
      }
      if (popup.showShare) {
        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '分享', firstBtnX, btnY + btnAnim.yShift, btnW, btnH, s, popup.sharePressed, { color: '#8b6914', textColor: '#fff', radius: 8 });
        ctx.restore();
        this.battleRoomShareRect = { x: firstBtnX, y: btnY, w: btnW, h: btnH };
      }
      if (popup.showCancel) {
        ctx.save();
        ctx.globalAlpha = btnAnim.alpha * ca;
        this._drawScaledButton(ctx, '取消', firstBtnX + gap + (popup.showShare ? btnW : 0), btnY + btnAnim.yShift, btnW, btnH, s, popup.cancelPressed, { color: '#b0a898', textColor: '#fff', radius: 8 });
        ctx.restore();
        this.battleRoomCancelRect = { x: firstBtnX + gap + (popup.showShare ? btnW : 0), y: btnY, w: btnW, h: btnH };
      }
      if (popup.showWaiting) {
        ctx.save();
        ctx.globalAlpha = hintAnim.alpha * ca;
        const dots = ['', '.', '..', '...'];
        const idx = Math.floor(Date.now() / 500) % 4;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#9a8a7a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('等待好友加入' + dots[idx], W / 2, btnY + btnH / 2);
        ctx.restore();
      }
    };

    // ===== 今日新词弹窗 =====
    Renderer.prototype._drawDailyWordsPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._dailyWordsPopup;
      if (!popup) return;

      const elapsed = Date.now() - popup.startTime;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: popup.closing || false,
        closeStartTime: popup.closeStartTime,
        width: 340, height: 580, enterOffset: 25, closeOffset: 40,
        elapsed,
        onCloseComplete: () => { game._dailyWordsPopup = null; }
      });
      if (!panel) return;
      const { px, py, pw, ph, elapsed: panelElapsed, closeAlpha } = panel;
      const ca = closeAlpha;

      // 标题:学习模式
      const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleY = py + 30 * s + titleAnim.yShift;
      ctx.fillText('学习模式', W / 2, titleY);
      // 标题左右小菱形装饰
      const titleWidth = ctx.measureText('学习模式').width;
      const diamondFontSize = Math.floor(10 * s);
      ctx.font = `${diamondFontSize}px sans-serif`;
      ctx.fillStyle = '#a09070';
      const dw = ctx.measureText('✦').width;
      const diamondGap = 15 * s;
      const leftBase = W / 2 - titleWidth / 2;
      const rightBase = W / 2 + titleWidth / 2;
      ctx.fillText('✦', leftBase - diamondGap - dw / 2, titleY);
      ctx.fillText('✦', rightBase + diamondGap + dw / 2, titleY);
      ctx.restore();

      // 副标题条形色块 + switch 开关
      const barY = py + 50 * s;
      const barH = 44 * s;
      const barPad = 14 * s;
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      this.roundRect(px + 14 * s, barY, pw - 28 * s, barH, 10 * s, '#f5f0e6', '#e8e0d0', 1 * s);
      // 左侧文字
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('每日1个新词,随机添加到每回合游戏中', px + 14 * s + barPad, barY + barH / 2);
      // 右侧 switch
      const swW = 50 * s;
      const swH = 26 * s;
      const swX = px + pw - 14 * s - barPad - swW + 2;
      const swY = barY + (barH - swH) / 2;
      const isOn = game.settings && game.settings.dailyWordChallengeEnabled === true;
      const pressOffset = game._dailyWordsSwitchPressed ? 1 * s : 0;
      // switch 背景
      this.roundRect(swX, swY + pressOffset, swW, swH, swH / 2, isOn ? '#8b6914' : '#c8c0b0');
      // 圆点
      const dotR = 10 * s;
      const dotX = isOn ? swX + swW - dotR - 3 * s : swX + dotR + 3 * s;
      const dotY = swY + pressOffset + swH / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      // 记录 switch 点击区域
      this.dailyWordsSwitchRect = { x: swX - 4 * s, y: swY - 4 * s, w: swW + 8 * s, h: swH + 8 * s };

      // switch 打开提示 toast
      if (game._dailyWordsSwitchHint && Date.now() < game._dailyWordsSwitchHint.expireAt) {
        const hint = game._dailyWordsSwitchHint;
        const hintElapsed = Date.now() - hint.startTime;
        const hintH = 24 * s;
        const hintPad = 10 * s;
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        const hintTextW = ctx.measureText(hint.text).width;
        const hintW = hintTextW + hintPad * 2;
        const hintX = swX + swW / 2 - hintW / 2 - 10 * s;
        const hintBaseY = swY - hintH - 6 * s;
        // 入场动画(从下往上弹 150ms)
        let hintOffsetY = 0;
        let hintAlpha = 1;
        if (hintElapsed < 150) {
          const t = hintElapsed / 150;
          const eased = Easing.easeOutBack(t);
          hintOffsetY = (1 - eased) * 10 * s;
          hintAlpha = t;
        } else if (hintElapsed > 1600) {
          const fadeT = (hintElapsed - 1600) / 400;
          hintAlpha = Math.max(0, 1 - fadeT);
        }
        const hintDrawY = hintBaseY + hintOffsetY;
        ctx.save();
        ctx.globalAlpha = hintAlpha * ca;
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 6 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(hintX, hintDrawY, hintW, hintH, hintH / 2, '#fff', 'rgba(196,163,90,0.3)', 1 * s);
        ctx.shadowColor = 'transparent';
        // 小箭头指向 switch
        const arrowSize = 4 * s;
        const arrowX = hintX + hintW / 2;
        const arrowTopY = hintDrawY + hintH - 1 * s;
        ctx.beginPath();
        ctx.moveTo(arrowX - arrowSize, arrowTopY);
        ctx.lineTo(arrowX + arrowSize, arrowTopY);
        ctx.lineTo(arrowX, arrowTopY + arrowSize + 2 * s);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,163,90,0.3)';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        // 文字
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint.text, hintX + hintW / 2, hintDrawY + hintH / 2);
        ctx.restore();
      }

      // 返回按钮(使用 setting_right.png 水平镜像)
      const backY = py + 26 * s;
      const backIconSize = 16 * s;
      const backIconX = px + 14 * s;
      const backW = backIconSize;
      const rightIcon = this.settingIcons && this.settingIcons.right;
      ctx.save();
      ctx.globalAlpha = ca;
      if (rightIcon && rightIcon.loaded && rightIcon.img) {
        ctx.translate(backIconX + backIconSize / 2, backY);
        ctx.scale(-1, 1);
        ctx.drawImage(rightIcon.img, -backIconSize / 2, -backIconSize / 2, backIconSize, backIconSize);
      } else {
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('‹', backIconX, backY);
      }
      ctx.restore();
      // 记录返回点击区域(加大)
      this.dailyWordsBackRect = { x: px + 14 * s - 14 * s, y: backY - 18 * s, w: backW + 28 * s, h: 36 * s };

      // 关闭按钮(棕色圆圈)
      const closeSize = 26 * s;
      const closeX = px + pw - closeSize - 12 * s;
      const closeY = py + 12 * s;
      const closePressOffset = game._dailyWordsClosePressed ? 1 * s : 0;
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.fillStyle = '#8b6914';
      ctx.beginPath();
      ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2 + closePressOffset, closeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(closeSize * 0.55)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2 - 1 * s + closePressOffset);
      ctx.restore();
      this.dailyWordsCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };

      // 内容区域参数
      const contentTop = py + 102 * s;
      const contentBottom = py + ph - 44 * s;
      const contentH = contentBottom - contentTop;
      const scrollY = game._dailyWordsScrollY || 0;

      const words = (game.dailyChallenge && game.dailyChallenge.words) || [];
      const collected = (game.dailyChallenge && game.dailyChallenge.collected) || [];
      const cardGap = 8 * s;
      const cardPad = 10 * s;
      const cardH = 100 * s;
      const totalContentH = words.length * (cardH + cardGap) + cardGap;
      const maxScroll = Math.max(0, totalContentH - contentH);
      this.dailyWordsMaxScroll = maxScroll;
      this.dailyWordsContentH = contentH;
      game._dailyWordsMaxScroll = maxScroll;
      game._dailyWordsContentH = contentH;
      // 仅在非拖动/动画状态下限制滚动范围(rubber band 效果需要允许临时超出)
      const scrollState = game._dailyWordsScrollState;
      if (scrollState !== 'dragging' && scrollState !== 'inertia' && scrollState !== 'bounce') {
        if (game._dailyWordsScrollY > maxScroll) game._dailyWordsScrollY = maxScroll;
        if (game._dailyWordsScrollY < 0) game._dailyWordsScrollY = 0;
      }

      ctx.save();
      ctx.globalAlpha = ca;
      ctx.beginPath();
      ctx.rect(px + 10 * s, contentTop, pw - 20 * s, contentH);
      ctx.clip();

      for (let i = 0; i < words.length; i++) {
        const item = words[i];
        const wObj = typeof item === 'string' ? { word: item, meaning: '', phonetic: '', example: '', example_meaning: '' } : item;
        const cy = contentTop + cardGap + i * (cardH + cardGap) - scrollY;
        if (cy + cardH < contentTop || cy > contentBottom) continue;

        const isCollected = collected.includes(wObj.word.toLowerCase());
        const itemAnim = Easing.fadeIn(elapsed, 200 + i * 35, 250, 6 * s);
        ctx.save();
        ctx.globalAlpha = itemAnim.alpha * ca;

        // 卡片背景
        this.roundRect(px + 14 * s, cy, pw - 28 * s, cardH, 8 * s, '#fff', 'rgba(196,163,90,0.25)', 0.8 * s);

        // 序号圆圈
        const numR = 10 * s;
        const numX = px + 28 * s;
        const numY = cy + 18 * s;
        ctx.fillStyle = '#8b6914';
        ctx.beginPath();
        ctx.arc(numX, numY, numR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), numX, numY);

        // 状态标签(右侧)
        const statusX = px + pw - 28 * s;
        const statusY = cy + 18 * s;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        if (isCollected) {
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#5a8f3c';
          ctx.fillText('✓ 已学习', statusX, statusY);
        } else {
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#b0a898';
          ctx.fillText('○ 未学习', statusX, statusY);
        }

        // 单词(序号右侧)
        const wordX = numX + numR + 8 * s;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(wObj.word, wordX, cy + 18 * s);

        // 音标(单词右侧)
        if (wObj.phonetic) {
          const wordW = ctx.measureText(wObj.word).width;
          ctx.font = `${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#999';
          ctx.fillText(wObj.phonetic, wordX + wordW + 6 * s, cy + 18 * s);
        }

        // 中文释义
        if (wObj.meaning) {
          ctx.font = `${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#666';
          ctx.fillText(wObj.meaning, wordX, cy + 36 * s);
        }

        // 例句标签
        const tagY = cy + 56 * s;
        const tagW = 28 * s;
        const tagH = 14 * s;
        this.roundRect(wordX, tagY - tagH / 2, tagW, tagH, 3 * s, 'rgba(196,163,90,0.15)');
        ctx.font = `bold ${Math.floor(9 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('例句', wordX + tagW / 2, tagY);

        // 英文例句(目标词加粗)
        if (wObj.example) {
          const exX = wordX + tagW + 6 * s;
          const exY = tagY;
          this._drawExampleWithHighlight(ctx, wObj.example, wObj.word, exX, exY, 11 * s, '#555', '#8b6914');
        }

        // 例句中文
        if (wObj.example_meaning) {
          ctx.font = `${Math.floor(11 * s)}px sans-serif`;
          ctx.fillStyle = '#888';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(wObj.example_meaning, wordX, cy + 78 * s);
        }

        ctx.restore();
      }

      ctx.restore(); // 恢复裁剪

      // 底部标语
      const sloganAnim = Easing.fadeIn(elapsed, 500, 250, 6 * s);
      const sloganY = py + ph - 24 * s + sloganAnim.yShift;
      const collectedCount = collected.length;
      const isAllCollected = words.length > 0 && collectedCount >= words.length;
      // 全部完成时:底部文案周期性小幅度上下跳跃(连续跳2次,暂停2秒)
      let sloganBounceY = 0;
      if (isAllCollected) {
        const cycle = 2500; // 2次跳跃 500ms + 暂停 2000ms
        const t = Date.now() % cycle;
        if (t < 500) {
          const phase = (t % 250) / 250;
          sloganBounceY = -Math.sin(phase * Math.PI) * 1.5 * s;
        }
      }
      ctx.save();
      ctx.globalAlpha = sloganAnim.alpha * ca;
      ctx.font = `${isAllCollected ? 'bold ' : ''}${Math.floor(11 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let sloganText = '✦  每日1个新词,积累从现在开始!  ✦';
      if (isAllCollected) {
        sloganText = '✦  你太棒了!今日新词学习完成,跟朋友分享下吧!  ✦';
      } else if (collectedCount >= 1) {
        sloganText = `✦  每日1个新词,积累从现在开始!(${collectedCount}/${words.length})   ✦`;
      }
      ctx.fillStyle = isAllCollected ? '#2d7d32' : '#a09070';
      ctx.fillText(sloganText, W / 2, sloganY + sloganBounceY);

      // 全部学习完成:在底部文案末尾绘制转发按钮(不跟随文案跳动)
      this.dailyWordsShareRect = null;
      if (isAllCollected && this.shareIconLoaded && this.shareIcon) {
        const textWidth = ctx.measureText(sloganText).width;
        const iconSize = 22 * s;
        const gap = 8 * s;
        const iconX = W / 2 + textWidth / 2 + gap;
        const iconY = sloganY - iconSize / 2;
        ctx.drawImage(this.shareIcon, iconX, iconY, iconSize, iconSize);
        this.dailyWordsShareRect = {
          x: iconX - 4 * s,
          y: iconY - 4 * s,
          w: iconSize + 8 * s,
          h: iconSize + 8 * s
        };
      }

      ctx.restore();

      // 全部学习完成:在顶部「学习模式」标题左右播放两次放慢的金色烟花(首次延迟 500ms,之后间隔 600ms)
      if (isAllCollected) {
        const now = Date.now();
        if (!game._dailyWordsSparkleState) {
          game._dailyWordsSparkleState = { count: 0, lastTime: now };
        }
        const state = game._dailyWordsSparkleState;
        const interval = state.count === 0 ? 800 : 600;
        if (state.count < 2 && now - state.lastTime >= interval) {
          state.count++;
          state.lastTime = now;
          const leftX = W / 2 - titleWidth / 2 - 30 * s;
          const rightX = W / 2 + titleWidth / 2 + 30 * s;
          const completePalette = ['#2ecc71', '#27ae60', '#ffd700', '#ffffff'];
          this._spawnSparkles(leftX, titleY, 12, completePalette, 0.5);
          this._spawnSparkles(rightX, titleY, 12, completePalette, 0.5);
        }
      } else {
        game._dailyWordsSparkleState = null;
      }

      // 滚动条
      if (totalContentH > contentH) {
        const scrollbarH = Math.max(30 * s, (contentH / totalContentH) * contentH);
        const scrollbarY = contentTop + (scrollY / maxScroll) * (contentH - scrollbarH);
        const scrollbarX = px + pw - 12 * s;
        ctx.save();
        ctx.globalAlpha = ca * 0.25;
        ctx.fillStyle = '#8b6914';
        this.roundRect(scrollbarX, scrollbarY, 3 * s, scrollbarH, 1.5 * s, '#8b6914');
        ctx.restore();
      }

      // 在弹窗最上层绘制烟花粒子(避免被弹窗背景遮挡)
      this._updateAndDrawSparkles(ctx, s);

      // 记录内容区域(用于滚动检测)
      this.dailyWordsContentRect = { x: px + 10 * s, y: contentTop, w: pw - 20 * s, h: contentH };
      // 记录面板区域(用于点击外部关闭检测)
      this.dailyWordsPanelRect = { x: px, y: py, w: pw, h: ph };
    }

    // 辅助:绘制例句,目标词加粗高亮
    Renderer.prototype._drawExampleWithHighlight = function(ctx, sentence, word, x, y, fontSize, normalColor, highlightColor) {
      const lowerWord = word.toLowerCase();
      const lowerSentence = sentence.toLowerCase();
      const idx = lowerSentence.indexOf(lowerWord);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      if (idx < 0) {
        ctx.font = `${Math.floor(fontSize)}px sans-serif`;
        ctx.fillStyle = normalColor;
        ctx.fillText(sentence, x, y);
        return;
      }

      const before = sentence.substring(0, idx);
      const match = sentence.substring(idx, idx + word.length);
      const after = sentence.substring(idx + word.length);

      let cx = x;
      if (before) {
        ctx.font = `${Math.floor(fontSize)}px sans-serif`;
        ctx.fillStyle = normalColor;
        ctx.fillText(before, cx, y);
        cx += ctx.measureText(before).width;
      }
      ctx.font = `bold ${Math.floor(fontSize)}px sans-serif`;
      ctx.fillStyle = highlightColor;
      ctx.fillText(match, cx, y);
      cx += ctx.measureText(match).width;
      if (after) {
        ctx.font = `${Math.floor(fontSize)}px sans-serif`;
        ctx.fillStyle = normalColor;
        ctx.fillText(after, cx, y);
      }
    };

    // ===== 设置弹窗 =====
    Renderer.prototype.drawSettingsPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._settingsPopup;
      if (!popup) return;

      const isClosing = game._closingSettings;
      const elapsed = isClosing ? 99999 : Date.now() - popup.startTime;

      const panelW = 282;
      const panelH = 343;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing,
        closeStartTime: game._closeSettingsStartTime,
        width: panelW,
        height: panelH,
        borderRadius: 16,
        borderWidth: 1.5,
        bgColor: '#f5f0e6',
        borderColor: '#c4a35a',
        overlayAlpha: 0.55,
        overlayFadeInDuration: 200,
        enterOffset: 20,
        closeOffset: 30,
        elapsed,
        onCloseComplete: () => {
          game._settingsPopup = null;
          game._closingSettings = false;
          game._closeSettingsStartTime = null;
          game._feedbackPage = 'main';
          game._feedbackTransition = null;
        }
      });

      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;

      // 重置点击区域
      this.settingsSoundRect = null;
      this.settingsDailyChallengeRect = null;
      this.settingsFeedbackRect = null;
      this.settingsRestartRoundRect = null;
      this.restartRoundConfirmYesRect = null;
      this.restartRoundConfirmNoRect = null;
      this.battleModeFriendRect = null;
      this.battleModeOnlineRect = null;
      this.battleModeShareRect = null;
      this.battleModeStartRect = null;
      this.battleModeCancelRect = null;
      this.battleModeCloseRect = null;
      this.battleRoomStartRect = null;
      this.battleRoomShareRect = null;
      this.battleRoomCancelRect = null;
      this.feedbackBackRect = null;
      this.feedbackInputRect = null;
      this.feedbackSubmitRect = null;
      this.settingsPanelRect = { x: px, y: py, w: pw, h: ph };
      this.settingsCloseRect = { x: 0, y: 0, w: W, h: H };

      const contentAlpha = closeAlpha;

      // === 内层细边框(参考购买成功弹窗) ===
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const inset = 3 * s;
      const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = 16 * s - inset;
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

      // === 右上角关闭按钮(在所有边框之后绘制,确保在最上层) ===
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const pressOffset = game._settingsCloseBtnPressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + pressOffset, closeSize, closeSize);
      } else {
        // 兜底:绘制 X
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.beginPath();
        ctx.arc(closeX + closeSize / 2, closeY + pressOffset + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        const xPad = 8 * s;
        ctx.beginPath();
        ctx.moveTo(closeX + xPad, closeY + pressOffset + xPad);
        ctx.lineTo(closeX + closeSize - xPad, closeY + pressOffset + closeSize - xPad);
        ctx.moveTo(closeX + closeSize - xPad, closeY + pressOffset + xPad);
        ctx.lineTo(closeX + xPad, closeY + pressOffset + closeSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this.settingsCloseBtnRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };

      function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      // 计算页面切换状态
      let fromPage = game._feedbackPage || 'main';
      let toPage = null;
      let fromX = 0;
      let toX = pw;

      if (game._feedbackTransition) {
        const trans = game._feedbackTransition;
        let t = (Date.now() - trans.startTime) / trans.duration;
        t = Math.max(0, Math.min(1, t));
        const ease = easeInOutQuad(t);

        if (t >= 1) {
          game._feedbackPage = trans.to;
          game._feedbackTransition = null;
          fromPage = game._feedbackPage || 'main';
          fromX = 0;
        } else {
          fromPage = trans.from;
          toPage = trans.to;
          fromX = -pw * ease;
          toX = pw * (1 - ease);
        }
      }

      // 使用 clip 限制绘制在弹窗内部
      ctx.save();
      const clipR = 16 * s;
      ctx.beginPath();
      ctx.moveTo(px + clipR, py);
      ctx.lineTo(px + pw - clipR, py);
      ctx.arcTo(px + pw, py, px + pw, py + ph, clipR);
      ctx.lineTo(px + pw, py + ph - clipR);
      ctx.arcTo(px + pw, py + ph, px, py + ph, clipR);
      ctx.lineTo(px + clipR, py + ph);
      ctx.arcTo(px, py + ph, px, py, clipR);
      ctx.lineTo(px, py + clipR);
      ctx.arcTo(px, py, px + pw, py, clipR);
      ctx.closePath();
      ctx.clip();

      // 绘制各页面
      if (fromPage === 'main') {
        drawMainPage.call(this, fromX);
      } else if (fromPage === 'feedback') {
        drawFeedbackPage.call(this, fromX);
      }

      if (toPage) {
        if (toPage === 'main') {
          drawMainPage.call(this, toX);
        } else if (toPage === 'feedback') {
          drawFeedbackPage.call(this, toX);
        }
      }

      ctx.restore();

      // 重新闯关二次确认弹窗
      if (game._restartRoundConfirmPopup) {
        this._drawRestartRoundConfirmPopup(game);
      }

      // Toast 提示
      if (game._feedbackSubmitToast) {
        if (Date.now() > game._feedbackSubmitToast.expireAt) {
          game._feedbackSubmitToast = null;
        } else {
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          const toastText = game._feedbackSubmitToast.text;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        const toastTextW = ctx.measureText(toastText).width;
        const toastW = Math.min(pw - 40 * s, toastTextW + 24 * s);
        const toastH = 34 * s;
        const toastX = W / 2 - toastW / 2;
        const toastY = py + ph - 50 * s;
        this.roundRect(toastX, toastY, toastW, toastH, 17 * s, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(toastText, W / 2, toastY + toastH / 2);
        ctx.restore();
      }
    }

    // === 内部函数:绘制设置主页 ===
    function drawMainPage(offsetX) {
        ctx.save();
        ctx.translate(offsetX, 0);

        // === 标题:设置 ===
        const titleY = py + 32 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(26 * s)}px Georgia, serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('设置', W / 2, titleY);
        ctx.restore();

        // === 标题下装饰线(参考购买成功弹窗) ===
        const decoLineY = py + 52 * s;
        const decoLineW = pw * 0.5;
        const decoLineX = px + (pw - decoLineW) / 2;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
        ctx.restore();

        // === 设置项列表 ===
        // 版本号：正式版读线上真实版本号，开发版/体验版该字段为空则兜底硬编码常量
        let versionText = GAME_VERSION;
        try {
          const onlineVersion = wx.getAccountInfoSync && wx.getAccountInfoSync().miniProgram.version;
          if (onlineVersion) versionText = onlineVersion;
        } catch (e) { /* 读取失败时使用硬编码版本 */ }

        const items = [
          {
            key: 'sound',
            iconKey: 'sound',
            title: '音效',
            subtitle: '开启或关闭游戏音效',
            type: 'switch',
            value: game.settings && game.settings.soundEnabled !== false
          },
          {
            key: 'restartRound',
            iconKey: 'reset',
            title: '重新闯关',
            subtitle: '重置当前闯关进度，从第 1 关开始',
            type: 'arrow'
          },
          {
            key: 'feedback',
            iconKey: 'feedback',
            title: '问题反馈',
            subtitle: '告诉我们你的建议与问题',
            type: 'arrow'
          },
          {
            key: 'version',
            iconKey: 'version',
            title: '版本信息',
            subtitle: `当前版本: ${versionText}`,
            type: 'none'
          }
        ];

        const itemH = 59 * s;
        const itemStartY = titleY + 31 * s;
        const iconSize = 52 * s;

        items.forEach((item, i) => {
          const itemY = itemStartY + i * itemH;
          const centerY = itemY + itemH / 2;

          // 图标图片
          const iconX = px + 22 * s - 4;
          const iconY = centerY;
          const iconData = item.iconKey && this.settingIcons && this.settingIcons[item.iconKey];
          if (iconData && iconData.loaded && iconData.img) {
            ctx.save();
            ctx.globalAlpha = contentAlpha;
            const drawSize = iconSize * 0.8;
            const aspect = iconData.width / iconData.height;
            let dw = drawSize, dh = drawSize;
            if (aspect > 1) {
              dh = drawSize / aspect;
            } else if (aspect < 1) {
              dw = drawSize * aspect;
            }
            const dx = iconX + iconSize / 2 - dw / 2;
            const dy = iconY - dh / 2;
            ctx.drawImage(iconData.img, dx, dy, dw, dh);
            ctx.restore();
          }

          // 标题和副标题位置
          const textX = iconX + iconSize + 4 * s ;

          // 标题
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#3a2e1e';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.title, textX, centerY - 7 * s);
          ctx.restore();

          // 副标题
          ctx.save();
          ctx.globalAlpha = contentAlpha * 0.7;
          ctx.font = `${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#8a7a6a';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.subtitle, textX, centerY + 11 * s);
          ctx.restore();

          // 右侧控件
          const ctrlRightX = px + pw - 22 * s;
          if (item.type === 'switch') {
            const swW = 50 * s;
            const swH = 26 * s;
            const swX = ctrlRightX - swW;
            const swY = centerY - swH / 2;
            const isOn = item.value;
            const isPressed = game._settingsSoundPressed;
            const pressOffset = isPressed ? 1 * s : 0;

            // 开关背景
            ctx.save();
            ctx.globalAlpha = contentAlpha;
            this.roundRect(swX, swY + pressOffset, swW, swH, swH / 2, isOn ? '#8b6914' : '#c8c0b0');
            ctx.restore();

            // "开"/"关" 文字
            ctx.save();
            ctx.globalAlpha = contentAlpha;
            ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelText = isOn ? '开' : '关';
            ctx.fillText(labelText, swX + swH / 2 + 2 * s, swY + pressOffset + swH / 2);
            ctx.restore();

            // 圆点
            const dotR = 10 * s;
            const dotX = isOn ? swX + swW - dotR - 3 * s : swX + dotR + 3 * s;
            const dotY = swY + pressOffset + swH / 2;
            ctx.save();
            ctx.globalAlpha = contentAlpha;
            ctx.beginPath();
            ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.restore();

            // 记录点击区域（整行可点，与下方箭头行一致——用户习惯点按整行而非仅开关）
            this.settingsSoundRect = { x: px + 10 * s, y: itemY, w: pw - 20 * s, h: itemH };
          } else if (item.type === 'arrow') {
            const rightIcon = this.settingIcons && this.settingIcons.right;
            if (rightIcon && rightIcon.loaded && rightIcon.img) {
              const iconSize = 10 * s;
              ctx.save();
              ctx.globalAlpha = contentAlpha * 0.8;
              ctx.drawImage(rightIcon.img, ctrlRightX - 4 * s - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
              ctx.restore();
            } else {
              ctx.save();
              ctx.globalAlpha = contentAlpha * 0.6;
              ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
              ctx.fillStyle = '#8a7a6a';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('›', ctrlRightX - 4 * s, centerY);
              ctx.restore();
            }

            // 记录整行点击区域
            const rect = { x: px + 10 * s, y: itemY, w: pw - 20 * s, h: itemH };
            if (item.key === 'feedback') this.settingsFeedbackRect = rect;
            if (item.key === 'restartRound') this.settingsRestartRoundRect = rect;
          }

          // 分隔线(非最后一项)
          if (i < items.length - 1) {
            const lineY = itemY + itemH;
            const linePad = 18 * s;
            ctx.save();
            ctx.globalAlpha = contentAlpha * 0.35;
            ctx.strokeStyle = '#c4a35a';
            ctx.lineWidth = 0.8 * s;
            ctx.beginPath();
            ctx.moveTo(px + linePad, lineY);
            ctx.lineTo(px + pw - linePad, lineY);
            ctx.stroke();

            // 小菱形装饰
            ctx.fillStyle = '#c4a35a';
            ctx.globalAlpha = contentAlpha * 0.5;
            ctx.beginPath();
            ctx.moveTo(W / 2, lineY - 3 * s);
            ctx.lineTo(W / 2 + 3 * s, lineY);
            ctx.lineTo(W / 2, lineY + 3 * s);
            ctx.lineTo(W / 2 - 3 * s, lineY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        });

        ctx.restore();
      }

      // === 内部函数:绘制问题反馈页 ===
      function drawFeedbackPage(offsetX) {
        ctx.save();
        ctx.translate(offsetX, 0);

        // 返回按钮(使用 setting_right.png 水平镜像)
        const backY = py + 26 * s;
        const backIconSize = 16 * s;
        const backIconX = px + 14 * s;
        const backW = backIconSize;
        const rightIcon = this.settingIcons && this.settingIcons.right;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        if (rightIcon && rightIcon.loaded && rightIcon.img) {
          ctx.translate(backIconX + backIconSize / 2, backY);
          ctx.scale(-1, 1);
          ctx.drawImage(rightIcon.img, -backIconSize / 2, -backIconSize / 2, backIconSize, backIconSize);
        } else {
          ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
          ctx.fillStyle = '#8b6914';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('‹', backIconX, backY);
        }
        ctx.restore();

        // 记录返回点击区域(加大)
        this.feedbackBackRect = { x: px + 14 * s - 14 * s, y: backY - 18 * s, w: backW + 28 * s, h: 36 * s };

        // 标题:问题反馈
        const titleY = py + 32 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('问题反馈', W / 2, titleY);
        ctx.restore();

        // 输入框区域
        const inputX = px + 20 * s;
        const inputW = pw - 40 * s;
        const inputH = 120 * s;
        const inputY = titleY + 40 * s;

        // 输入框背景
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.roundRect(inputX, inputY, inputW, inputH, 8 * s, '#faf6ee', '#c4a35a', 1.5 * s);
        ctx.restore();

        // 输入框文字
        const feedbackText = game._feedbackText || '';
        const placeholder = '请描述你遇到的问题或建议\n(你的每个建议对我都很宝贵!)';
        const textX = inputX + 12 * s;
        const textY = inputY + 14 * s;

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (feedbackText) {
          ctx.fillStyle = '#3a2e1e';
          const maxTextW = inputW - 24 * s;
          const lines = this._wrapText(ctx, feedbackText, maxTextW, 14 * s);
          const lineHeight = 20 * s;
          lines.forEach((line, i) => {
            if (i * lineHeight < inputH - 35 * s) {
              ctx.fillText(line, textX, textY + i * lineHeight);
            }
          });
        } else {
          ctx.fillStyle = '#b0a898';
          // 按 \n 分割逐行绘制 placeholder
          const placeholderLines = placeholder.split('\n');
          const phLineHeight = 20 * s;
          placeholderLines.forEach((line, i) => {
            ctx.fillText(line, textX, textY + i * phLineHeight);
          });
        }

        // 字数统计
        const countText = `${feedbackText.length} / 100`;
        ctx.font = `${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#b0a898';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(countText, inputX + inputW - 10 * s, inputY + inputH - 8 * s);
        ctx.restore();

        // 记录输入框点击区域
        this.feedbackInputRect = { x: inputX, y: inputY, w: inputW, h: inputH };

        // 提交按钮
        const btnW = 140 * s;
        const btnH = 42 * s;
        const btnX = W / 2 - btnW / 2;
        const btnY = py + ph - btnH - 28 * s;
        const isSubmitting = game._feedbackSubmitting;
        const isPressed = game._feedbackSubmitPressed;
        const pressOffset = isPressed ? 2 * s : 0;

        ctx.save();
        ctx.globalAlpha = contentAlpha;
        const btnBg = isSubmitting ? 'rgba(196,163,90,0.5)' : '#c4a35a';
        this.roundRect(btnX, btnY + pressOffset, btnW, btnH, 8 * s, btnBg);
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const btnLabel = isSubmitting ? '提交中...' : '提交';
        ctx.fillText(btnLabel, W / 2, btnY + pressOffset + btnH / 2);
        ctx.restore();

        // 记录提交按钮点击区域
        this.feedbackSubmitRect = { x: btnX, y: btnY, w: btnW, h: btnH };

        ctx.restore();
      }
    }

    // ===== 单词本弹窗 =====
    Renderer.prototype.drawWordBookPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const popup = game._wordBookPopup;
      if (!popup) return;

      const isClosing = game._closingWordBook;
      const elapsed = isClosing ? 99999 : Date.now() - popup.startTime;

      const panelW = 300;
      const panelH = 420;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing,
        closeStartTime: game._closeWordBookStartTime,
        width: panelW,
        height: panelH,
        borderRadius: 16,
        borderWidth: 1.5,
        bgColor: '#f5f0e6',
        borderColor: '#c4a35a',
        overlayAlpha: 0.55,
        overlayFadeInDuration: 200,
        enterOffset: 20,
        closeOffset: 30,
        elapsed,
        onCloseComplete: () => {
          game._wordBookPopup = null;
          game._closingWordBook = false;
          game._closeWordBookStartTime = null;
          game._wordBookScrollY = 0;
          game._wordBookScrollState = null;
        }
      });

      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;

      // 重置点击区域
      this.wordBookBackRect = null;
      this.wordBookCloseRect = null;
      this.wordBookWordHeaderRect = null;
      this.wordBookCountHeaderRect = null;
      this.wordBookPanelRect = { x: px, y: py, w: pw, h: ph };
      this.wordBookContentRect = null;

      const contentAlpha = closeAlpha;
      const belowTitleOffset = 2 * s; // 标题下方分割线及内容整体下移

      // 内层细边框
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const inset = 3 * s;
      const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = 16 * s - inset;
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

      // 关闭按钮(使用 pop_close.png,与设置弹窗一致)
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const closePressOffset = game._wordBookClosePressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + closePressOffset, closeSize, closeSize);
      } else {
        // 兜底:绘制 X
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.beginPath();
        ctx.arc(closeX + closeSize / 2, closeY + closePressOffset + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        const xPad = 8 * s;
        ctx.beginPath();
        ctx.moveTo(closeX + xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + closeSize - xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.moveTo(closeX + closeSize - xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this.wordBookCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };

      // 标题
      const titleY = py + 32 * s;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('单词本', W / 2, titleY);
      ctx.restore();

      // 标题下装饰线
      const decoLineY = titleY + 16 * s + belowTitleOffset;
      const decoLineW = pw * 0.45;
      const decoLineX = px + (pw - decoLineW) / 2;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
      ctx.restore();

      // 读取单词本数据
      const book = (game.storageManager && game.storageManager.getWordBook) ? game.storageManager.getWordBook() : { words: {} };
      const words = book && book.words ? book.words : {};
      const sortBy = game._wordBookSortBy || 'word';
      const sortOrder = game._wordBookSortOrder || 'asc';
      const wordEntries = Object.entries(words)
        .sort((a, b) => {
          if (sortBy === 'count') {
            // 按次数排序
            if (a[1] !== b[1]) return sortOrder === 'asc' ? a[1] - b[1] : b[1] - a[1];
            return sortOrder === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
          } else {
            // 按单词排序
            if (a[0] !== b[0]) return sortOrder === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
            return sortOrder === 'asc' ? a[1] - b[1] : b[1] - a[1];
          }
        });
      const totalUnique = wordEntries.length;

      // 统计文本
      const statY = decoLineY + 20 * s;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`累计打出 ${totalUnique} 个不同单词`, W / 2, statY);
      ctx.restore();

      // 列表区域
      const headerH = 34 * s;
      const contentTop = statY + 22 * s;
      const contentBottom = py + ph - 18 * s + belowTitleOffset;
      const contentH = contentBottom - contentTop - headerH;
      const rowH = 38 * s;
      const listW = pw - 32 * s;
      const listX = px + 16 * s;
      const headerY = contentTop;

      // 表头背景
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      this.roundRect(listX, headerY, listW, headerH, 8 * s, 'rgba(196,163,90,0.25)', 'rgba(196,163,90,0.5)');
      ctx.restore();

      // 表头文字与点击区域
      const headerTextY = headerY + headerH / 2;
      const headerPadX = 14 * s;
      const wordHeaderX = listX + headerPadX;
      const countHeaderX = listX + listW - headerPadX;

      // 单词表头
      const isWordSort = sortBy === 'word';
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = isWordSort ? '#5a4a2a' : '#8a7a6a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('单词' + (isWordSort ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''), wordHeaderX, headerTextY);
      ctx.restore();

      // 次数表头
      const isCountSort = sortBy === 'count';
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = isCountSort ? '#5a4a2a' : '#8a7a6a';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText((isCountSort ? (sortOrder === 'asc' ? '▲ ' : '▼ ') : '') + '次数', countHeaderX, headerTextY);
      ctx.restore();

      // 记录表头点击区域
      this.wordBookWordHeaderRect = { x: listX, y: headerY, w: listW * 0.5, h: headerH };
      this.wordBookCountHeaderRect = { x: listX + listW * 0.5, y: headerY, w: listW * 0.5, h: headerH };

      // 表头与列表分隔线
      ctx.save();
      ctx.globalAlpha = contentAlpha * 0.5;
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(listX + 6 * s, headerY + headerH);
      ctx.lineTo(listX + listW - 6 * s, headerY + headerH);
      ctx.stroke();
      ctx.restore();

      const listTop = contentTop + headerH;

      // 列表背景
      ctx.save();
      ctx.globalAlpha = contentAlpha * 0.5;
      this.roundRect(listX, listTop, listW, contentH, 10 * s, 'rgba(255,255,255,0.35)');
      ctx.restore();

      // 可滚动内容
      const maxScroll = Math.max(0, wordEntries.length * rowH - contentH + 10 * s);
      const scrollY = Math.max(0, Math.min(game._wordBookScrollY || 0, maxScroll));
      game._wordBookMaxScroll = maxScroll;
      game._wordBookContentH = wordEntries.length * rowH + 10 * s;

      ctx.save();
      ctx.beginPath();
      ctx.rect(listX, listTop, listW, contentH);
      ctx.clip();

      const startY = listTop + 5 * s - scrollY;
      for (let i = 0; i < wordEntries.length; i++) {
        const [word, count] = wordEntries[i];
        const y = startY + i * rowH;
        if (y + rowH < listTop || y > listTop + contentH) continue;

        // 隔行背景
        if (i % 2 === 1) {
          ctx.save();
          ctx.globalAlpha = contentAlpha * 0.25;
          ctx.fillStyle = 'rgba(196,163,90,0.12)';
          ctx.fillRect(listX + 2 * s, y, listW - 4 * s, rowH);
          ctx.restore();
        }

        // 单词
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(15 * s)}px Georgia, serif`;
        ctx.fillStyle = '#3a2e1e';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(word.toLowerCase(), listX + 12 * s, y + rowH / 2);
        ctx.restore();

        // 次数标签
        const tagH = 18 * s;
        const tagW = 44 * s;
        const tagX = listX + listW - tagW - 10 * s;
        const tagY = y + (rowH - tagH) / 2;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this.roundRect(tagX, tagY, tagW, tagH, tagH / 2, '#8b6914');
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const countStr = String(count);
        const countW = ctx.measureText(countStr).width;
        const unitW = ctx.measureText('次').width;
        const gap = 1 * s;
        const totalW = countW + gap + unitW;
        const textX = tagX + tagW / 2 - totalW / 2;
        const textY = tagY + tagH / 2;
        ctx.fillText(countStr, textX, textY);
        ctx.fillText('次', textX + countW + gap, textY);
        ctx.restore();
      }

      // 空状态
      if (wordEntries.length === 0) {
        ctx.save();
        ctx.globalAlpha = contentAlpha * 0.7;
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#8a7a6a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('还没有打出过单词哦~', listX + listW / 2, listTop + contentH / 2);
        ctx.restore();
      }

      ctx.restore();

      // 记录内容区域用于滚动
      this.wordBookContentRect = { x: listX, y: listTop, w: listW, h: contentH };

      // 滚动指示器(当内容可滚动时)
      if (maxScroll > 0) {
        const barH = Math.max(20 * s, contentH * contentH / (contentH + maxScroll));
        const barY = listTop + (contentH - barH) * (scrollY / maxScroll);
        const barX = listX + listW - 4 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha * 0.4;
        ctx.fillStyle = '#8b6914';
        ctx.beginPath();
        ctx.arc(barX, barY + 2 * s, 2 * s, 0, Math.PI * 2);
        ctx.arc(barX, barY + barH - 2 * s, 2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(barX - 2 * s, barY + 2 * s, 4 * s, barH - 4 * s);
        ctx.restore();
      }
    };

    // ===== 每日成就大弹窗 =====
    Renderer.prototype._drawDailyAchievementPopup = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      // 每日成就弹窗整体等比缩小一点（面板与内部内容共用同一缩小后的 s）
      const s = this.scale * 0.92;
      const popup = game._dailyAchievementPopup;
      if (!popup) return;

      const elapsed = Date.now() - popup.startTime;
      const panel = this._drawModalPanel(ctx, W, H, s, {
        isClosing: popup.closing || false,
        closeStartTime: popup.closeStartTime,
        width: 340, height: 560, enterOffset: 25, closeOffset: 40,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#c4a35a',
        elapsed,
        onCloseComplete: () => { game._dailyAchievementPopup = null; }
      });
      if (!panel) return;
      const { px, py, pw, ph, closeAlpha } = panel;
      const ca = closeAlpha;

      // 内层细边框（双层边框，参考单词本）
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const inset = 3 * s;
      const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = 16 * s - inset;
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

      // 标题
      const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
      ctx.save();
      ctx.globalAlpha = titleAnim.alpha * ca;
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleY = py + 30 * s + titleAnim.yShift;
      ctx.fillText('每日成就', W / 2, titleY);
      // 标题左右小菱形装饰
      const titleWidth = ctx.measureText('每日成就').width;
      ctx.font = `${Math.floor(10 * s)}px sans-serif`;
      ctx.fillStyle = '#a09070';
      const dw = ctx.measureText('✦').width;
      const diamondGap = 15 * s;
      ctx.fillText('✦', W / 2 - titleWidth / 2 - diamondGap - dw / 2, titleY);
      ctx.fillText('✦', W / 2 + titleWidth / 2 + diamondGap + dw / 2, titleY);
      ctx.restore();

      // 成就任务数据
      const dailyAchievements = new DailyAchievements(game);
      const tasks = dailyAchievements.getTasks();

      // 内容区域
      const contentTop = py + 62 * s;
      const contentBottom = py + ph - 24 * s;
      const contentH = contentBottom - contentTop;
      const rowH = 76 * s;
      const rowGap = 10 * s;
      const totalRowsH = tasks.length * rowH + (tasks.length - 1) * rowGap;

      // 滚动
      let scrollY = game._dailyAchievementScrollY || 0;
      const maxScroll = Math.max(0, totalRowsH - contentH);
      scrollY = Math.max(0, Math.min(scrollY, maxScroll));
      game._dailyAchievementScrollY = scrollY;

      ctx.save();
      ctx.globalAlpha = ca;
      ctx.beginPath();
      ctx.rect(px + 10 * s, contentTop, pw - 20 * s, contentH);
      ctx.clip();

      const rowW = pw - 32 * s;
      const rowX = px + 16 * s;

      this.dailyAchievementGiftRects = [];

      // 领取按钮弹出动画
      const claimAnim = game._dailyAchievementClaimAnim;
      let claimAnimScale = 1;
      if (claimAnim) {
        const claimElapsed = Date.now() - claimAnim.startTime;
        if (claimElapsed >= 350) {
          game._dailyAchievementClaimAnim = null;
        } else {
          claimAnimScale = Easing.easeOutBack(Math.min(claimElapsed / 300, 1));
        }
      }

      tasks.forEach((task, i) => {
        const rowY = contentTop + i * (rowH + rowGap) - scrollY;
        if (rowY + rowH < contentTop || rowY > contentBottom) return;

        // 行背景（切角八角形，参考对战面板）
        const corner = 8 * s;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rowX + corner, rowY);
        ctx.lineTo(rowX + rowW - corner, rowY);
        ctx.lineTo(rowX + rowW, rowY + corner);
        ctx.lineTo(rowX + rowW, rowY + rowH - corner);
        ctx.lineTo(rowX + rowW - corner, rowY + rowH);
        ctx.lineTo(rowX + corner, rowY + rowH);
        ctx.lineTo(rowX, rowY + rowH - corner);
        ctx.lineTo(rowX, rowY + corner);
        ctx.closePath();
        ctx.fillStyle = '#f5f0e6';
        ctx.fill();
        ctx.strokeStyle = '#e8e0d0';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        ctx.restore();

        // 左侧图标
        let iconSize = 40 * s;
        if (task.imgKey === 'battle_hornor_trophy') {
          iconSize = 34 * s;
        }
        const iconX = rowX + 30 * s - iconSize / 2;
        const iconY = rowY + rowH / 2 - iconSize / 2;
        ctx.save();
        let iconImg = null;
        if (task.imgKey === 'battle_hornor_trophy' && this.battleHonorTrophyIcon && this.battleHonorTrophyIconLoaded) {
          iconImg = this.battleHonorTrophyIcon;
        } else if (task.imgKey === 'battle_vs' && this.battleVS && this.battleVSLoaded) {
          iconImg = this.battleVS;
        } else if (task.imgKey === 'study_toast_star' && this.toastStarIcon && this.toastStarIcon.loaded) {
          iconImg = this.toastStarIcon.img;
        } else if (task.imgKey === 'share' && this.shareIcon && this.shareIconLoaded) {
          iconImg = this.shareIcon;
        } else if (task.imgKey === 'potion' && this.potionIcon && this.potionIconLoaded) {
          iconImg = this.potionIcon;
        }
        if (iconImg && iconImg.width > 0) {
          // 按原图比例 contain 进 iconSize 框并居中，不压缩长宽比
          const aspect = iconImg.width / iconImg.height;
          let dw = iconSize, dh = iconSize;
          if (aspect > 1) dh = iconSize / aspect;
          else if (aspect < 1) dw = iconSize * aspect;
          ctx.drawImage(iconImg, iconX + (iconSize - dw) / 2, iconY + (iconSize - dh) / 2, dw, dh);
        } else {
          ctx.font = `${Math.floor(28 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(task.icon, rowX + 30 * s, rowY + rowH / 2);
        }
        ctx.restore();

        // 任务名称
        ctx.save();
        ctx.font = `bold ${Math.floor(15 * s)}px ${this.titleFontFamily}`;
        ctx.fillStyle = '#4a3420';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(task.name, rowX + 60 * s, rowY + 24 * s);
        ctx.restore();

        // 进度条
        const barW = rowW - 170 * s;
        const barH = 12 * s;
        const barX = rowX + 60 * s;
        const barY = rowY + 46 * s;
        const ratio = Math.min(task.current / task.target, 1);
        this.roundRect(barX, barY, barW, barH, barH / 2, '#a89978', '#8b6914', 1 * s);
        if (ratio > 0) {
          const filledW = barW * ratio;
          this.roundRect(barX, barY, filledW, barH, barH / 2, '#6cc21a', null, 0);

          // 顶部高光，营造凸起立体感
          ctx.save();
          const highlightH = barH * 0.5;
          const grad = ctx.createLinearGradient(barX, barY, barX, barY + highlightH);
          grad.addColorStop(0, 'rgba(255,255,255,0.5)');
          grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(barX, barY + barH / 2);
          ctx.arcTo(barX, barY, barX + filledW, barY, barH / 2);
          ctx.arcTo(barX + filledW, barY, barX + filledW, barY + barH, barH / 2);
          ctx.lineTo(barX + filledW, barY + highlightH);
          ctx.lineTo(barX, barY + highlightH);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // 进度文字
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${task.current}/${task.target}`, barX + barW / 2, barY + barH / 2);
        ctx.restore();

        // 金币奖励 / 礼盒 / 已领取
        const isCompleted = task.isCompleted;
        const isClaimed = task.isClaimed;
        const rewardRight = rowX + rowW - 14 * s;

        if (isCompleted && !isClaimed) {
          // 已完成未领取：显示居中大礼盒（呼吸缩放）
          const giftSize = 36 * s;
          const giftX = rewardRight - giftSize;
          const giftY = rowY + rowH / 2 - giftSize / 2;
          const breath = 1 + 0.08 * Math.sin(Date.now() / 400);
          ctx.save();
          ctx.globalAlpha = ca;
          ctx.translate(giftX + giftSize / 2, giftY + giftSize / 2);
          ctx.scale(breath, breath);
          if (this.witchGiftIcon && this.witchGiftIconLoaded && this.witchGiftIcon.width > 0) {
            ctx.drawImage(this.witchGiftIcon, -giftSize / 2, -giftSize / 2, giftSize, giftSize);
          } else {
            ctx.fillStyle = '#c4a35a';
            ctx.fillRect(-giftSize / 2, -giftSize / 2, giftSize, giftSize);
          }
          ctx.restore();
          this.dailyAchievementGiftRects.push({ x: giftX, y: giftY, w: giftSize, h: giftSize, index: i, reward: task.reward });
        } else if (isCompleted && isClaimed) {
          // 已领取：显示灰色按钮（带弹出缩放动画）
          const btnW = 66 * s;
          const btnH = 28 * s;
          const btnX = rewardRight - btnW;
          const btnY = rowY + rowH / 2 - btnH / 2;
          const btnScale = (claimAnim && claimAnim.index === i) ? claimAnimScale : 1;
          ctx.save();
          ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
          ctx.scale(btnScale, btnScale);
          this.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * s, '#b8b0a0', '#a09888', 1 * s);
          ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('已领取', 0, 0);
          ctx.restore();
        } else {
          // 未完成：显示 coin + 数量
          const coinSize = 20 * s;
          const coinX = rewardRight - coinSize - 38 * s;
          const coinY = rowY + rowH / 2 - coinSize / 2;
          if (this.coinIcon && this.coinIconLoaded && this.coinIcon.width > 0) {
            ctx.drawImage(this.coinIcon, coinX, coinY, coinSize, coinSize);
          } else {
            ctx.fillStyle = '#d4a017';
            ctx.beginPath();
            ctx.arc(coinX + coinSize / 2, coinY + coinSize / 2, coinSize / 2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.save();
          ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
          ctx.fillStyle = '#8a6d3b';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`×${task.reward}`, coinX + coinSize + 6 * s, coinY + coinSize / 2);
          ctx.restore();
        }
      });

      ctx.restore();

      game._dailyAchievementMaxScroll = maxScroll;

      // 滚动条
      if (maxScroll > 0) {
        const barH = Math.max(20 * s, contentH * contentH / (contentH + maxScroll));
        const barY = contentTop + (contentH - barH) * (scrollY / maxScroll);
        const barX = px + pw - 12 * s;
        ctx.save();
        ctx.globalAlpha = 0.5 * ca;
        ctx.fillStyle = '#a88b5c';
        this.roundRect(barX - 2 * s, barY, 4 * s, barH, 2 * s, '#a88b5c');
        ctx.restore();
      }

      // 右上角关闭按钮（完全参考设置弹窗：close 图标 + 兜底圆圈X）
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const closePressOffset = game._dailyAchievementClosePressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = ca;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + closePressOffset, closeSize, closeSize);
      } else {
        // 兜底：绘制 X
        ctx.fillStyle = 'rgba(48, 35, 22, 0.7)';
        ctx.beginPath();
        ctx.arc(closeX + closeSize / 2, closeY + closePressOffset + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 230, 0.9)';
        ctx.lineWidth = 1.5 * s;
        ctx.lineCap = 'round';
        const xPad = 8 * s;
        ctx.beginPath();
        ctx.moveTo(closeX + xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + closeSize - xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.moveTo(closeX + closeSize - xPad, closeY + closePressOffset + xPad);
        ctx.lineTo(closeX + xPad, closeY + closePressOffset + closeSize - xPad);
        ctx.stroke();
      }
      ctx.restore();
      this.dailyAchievementCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };
      this.dailyAchievementContentRect = { x: px + 10 * s, y: contentTop, w: pw - 20 * s, h: contentH };

      // 底部提示文字
      ctx.save();
      ctx.globalAlpha = 0.7 * ca;
      ctx.font = `${Math.floor(12 * s)}px ${this.titleFontFamily}`;
      ctx.fillStyle = '#8a8070';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tipText = '完成任务，每天积累成长！';
      const tipY = py + ph - 16 * s;
      ctx.fillText(tipText, W / 2, tipY);
      // 左右小菱形装饰
      const tipWidth = ctx.measureText(tipText).width;
      ctx.font = `${Math.floor(9 * s)}px sans-serif`;
      ctx.fillStyle = '#a09070';
      const dotGap = 10 * s;
      const dotW = ctx.measureText('✦').width;
      ctx.fillText('✦', W / 2 - tipWidth / 2 - dotGap - dotW / 2, tipY);
      ctx.fillText('✦', W / 2 + tipWidth / 2 + dotGap + dotW / 2, tipY);
      ctx.restore();
    };

};
