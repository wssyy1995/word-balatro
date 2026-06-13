const { Easing } = require('../animation');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { SHOP_POOL } = require('../shop');
const { LETTER_SCORE, letterUpgrades } = require('../data');

module.exports = function extendPopup(Renderer) {
    Renderer.prototype._drawWitchDetailPopup = function(ctx, game, s) {
      const popup = game._witchDetailPopup;
      if (!popup) return;
  
      const jokers = game.jokers || [];
      const joker = jokers[popup.jokerIndex];
      if (!joker) return;
  
      // 支持传入 rect（商店模式），否则回退到 witchPropRects
      const rect = popup.rect || this.witchPropRects[popup.jokerIndex];
      if (!rect) return;
  
      const { x: cardX, y: cardY, w: cardW, h: cardH } = rect;
  
      const pad = 10 * s;
      const lineH = 16 * s;
  
      // 先计算可作用字母宽度（如果有），用于动态调整弹窗宽度
      const letters = this._getWitchLetters(joker.trigger);
      const hasLetters = letters && letters.length > 0;
      let lettersTotalW = 0;
      if (hasLetters) {
        const circleR = 12 * s;
        const circleGap = 8 * s;
        lettersTotalW = letters.length * (circleR * 2) + (letters.length - 1) * circleGap;
      }
  
      // 根据效果描述文字长度动态计算弹窗宽度
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      const descW = ctx.measureText(joker.desc).width;
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
      let contentH = pad * 2 + lineH * 3 + 4 * s; // 名称 + 效果标签 + 描述
      if (hasLastWord && !popup.isShop) contentH += lineH + 2 * s; // 上一手单词（仅限游戏页）
      if (hasAccumulation) contentH += lineH + 2 * s; // 倍率增值
      if (hasLimit) contentH += lineH + 2 * s; // 剩余次数
      if (hasPredicted && !popup.isShop) contentH += lineH + 2 * s; // 预言字母（仅限游戏页）
      if (hasLetters) contentH += lineH + 28 * s + 4 * s; // 可作用字母标签 + 圆
      const popupH = contentH;
      const popupY = cardY + cardH + 6 * s + 2 * s;
  
      // 出现动画（easeOutBack：从卡牌底部向下弹出）
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

      // ===== 商店模式：右上角售出按钮 =====
      this._shopWitchDetailSellBtnRect = null;
      if (popup.isShop) {
        const btnPadX = 14 * s;
        const btnH = 20 * s;
        const sellText = String(Math.round(joker.cost / 2));
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        const textW = ctx.measureText(sellText).width;
        const coinSize = 10 * s;
        const contentW = coinSize + 2 * s + textW;
        const btnW = contentW + btnPadX * 2;

        const btnX = popupX + popupW - pad - btnW;
        const btnY = popupY + pad;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 2 * s;
        this.roundRect(btnX, btnY, btnW, btnH, 5 * s, '#c0392b');
        ctx.restore();

        // 顶部高光条
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        const sellHighlightY = btnY + 2 * s;
        ctx.moveTo(btnX + 3 * s, sellHighlightY);
        ctx.lineTo(btnX + btnW - 3 * s, sellHighlightY);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const midY = btnY + btnH / 2;
        const startX = btnX + (btnW - contentW) / 2;
        if (this.coinIcon && this.coinIconLoaded) {
          ctx.drawImage(this.coinIcon, startX, midY - coinSize / 2, coinSize, coinSize);
        }
        ctx.fillText(sellText, startX + coinSize + 2 * s + textW / 2, midY);
        ctx.restore();

        this._shopWitchDetailSellBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH, index: popup.jokerIndex };
      }
      // ===== 售出按钮结束 =====

      let cy = popupY + pad + lineH / 2;
      const cx = popupX + popupW / 2;
  
      // 名称（带星星装饰）
      ctx.save();
      ctx.font = `bold ${Math.floor(14 * s)}px Georgia, serif`;
      ctx.fillStyle = '#1a2f4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✦ ${joker.name} ✦`, cx, cy);
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
      ctx.fillText(joker.desc, popupX + pad, cy);
      ctx.restore();
  
      // 上一手单词（消元术 / 首字连击）
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
        ctx.fillText(`上一手单词：${lastWordText}`, popupX + pad, cy);
        ctx.restore();
      }
  
      // 倍率增值（错误即经验 / 首字连击：显示当前累加值）
      if (joker.trigger === 'illegal_boost' || joker.operation === 'multi_accumulation') {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`倍率累计：+${joker.value}`, popupX + pad, cy);
        ctx.restore();
      }
  
      // 剩余次数（limit 型女巫牌）
      if (joker.limit !== undefined && joker.usesLeft !== undefined) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = joker.usesLeft > 0 ? '#e74c3c' : '#7f8c8d';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`剩余次数：${joker.usesLeft} / ${joker.limit}`, popupX + pad, cy);
        ctx.restore();
      }
  
      // 预言字母（预言家牌）—— 游戏页显示，商店页隐藏
      if (hasPredicted && !popup.isShop) {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`预言字母：${joker._predictedLetter}`, popupX + pad, cy);
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
  
        // 底部装饰线（仅在有可作用字母时显示）
        const decoY = popupY + popupH - 10 * s;
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
  
      // 关闭弹窗整体变换
      ctx.restore();
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
  
      // 标题：字母置换
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
  
      // 选中的字母卡牌（放大到 0.7，保留选中态以显示 selected.png）
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
          // 选中态：金色背景
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
  
      // 选中的转换提示 "A → B"（金棕色）
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
  
      // 关闭按钮（右上角 X）
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

    Renderer.prototype.drawPotion = function(game) {
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
  
      // 背景由 render() 统一绘制 bgImage，不覆盖
  
      // === 顶部栏（参考商店页样式）===
      // 字母升级页面不显示设置和金币胶囊
      // this.drawTopHeader(game);
  
      // 标题区域 Y 坐标（与商店页"商店"标题位置一致）
      const titleY = top - 10 * s;
  
      // 标题：shop_icon.png 装饰 + "选择字母" + shop_icon.png 水平镜像
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleText = '字母升级';
      const titleTextW = ctx.measureText(titleText).width;
      ctx.fillText(titleText, W / 2, titleY);
      ctx.restore();
  
      // 左右装饰图标
      const decoIconW = 20 * s + 2 * s;
      const decoIconH = 20 * s;
      const decoGap = 10 * s - 2 * s;
      const decoIconY = titleY - decoIconH / 2;
      if (this.shopIcon && this.shopIconLoaded) {
        const leftIconX = W / 2 - titleTextW / 2 - decoGap - decoIconW;
        ctx.drawImage(this.shopIcon, leftIconX, decoIconY, decoIconW, decoIconH);
  
        const rightIconX = W / 2 + titleTextW / 2 + decoGap;
        ctx.save();
        ctx.translate(rightIconX + decoIconW, decoIconY);
        ctx.scale(-1, 1);
        ctx.drawImage(this.shopIcon, 0, 0, decoIconW, decoIconH);
        ctx.restore();
      }
  
      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择一张字母牌，分数+10，本赛局内有效', W / 2, subTitleY);
      ctx.restore();
  
      // === 分隔线（两条线 + 中间菱形）===
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
      const btnSize = 52 * s;
      const btnGap = 13 * s;
      const totalGridW = cols * btnSize + (cols - 1) * btnGap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = dividerY + 30 * s;
  
      // 王牌强化（upgrade_face）只允许选择 X/Y/Z
      const isFaceOnly = game.potionMode && game.potionMode.effect === 'upgrade_face';
      // 如果当前选中了不允许的字母，自动清除
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
  
        // 背景圆角矩形（带底部阴影，微微立体感）
        const br = 8 * s;
        ctx.save();
        if (isSelected && isAllowed) {
          // 选中状态：金色背景+阴影
          ctx.shadowColor = 'rgba(196,163,90,0.35)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 3 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
        } else if (!isAllowed) {
          // 禁用状态：浅灰背景 + 淡阴影
          ctx.shadowColor = 'rgba(0,0,0,0.06)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#e8e4dc', null, 0);
        } else {
          // 普通状态：米色背景 + 底部阴影
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#f5f0e6', '#d4c9a8', 1.5 * s);
        }
        ctx.restore();
  
        // 字母
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
        ctx.fillText(letter, x + btnSize / 2, y + btnSize / 2);
        ctx.restore();
  
        if (isAllowed) {
          this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
        }
      });
  
      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);
  
      // === 当前字母分提示 ===
      if (selectedLetter) {
        const scoreTipY = gridBottomY + 18 * s;
        const baseScore = LETTER_SCORE[selectedLetter];
        const upgrade = letterUpgrades.get(selectedLetter);
        const currentScore = upgrade
          ? Math.floor(baseScore * (upgrade.mult || 1)) + (upgrade.add || 0)
          : baseScore;
        ctx.save();
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`当前字母分：${currentScore}`, W / 2, scoreTipY);
        ctx.restore();
      }
  
      // === 底部按钮区域（升级 + 暂存）===
      const btnAreaY = H - 75 * s;
      const potionBtnW = 130 * s;
      const potionBtnH = 46 * s;
      const potionBtnGap = 16 * s;
      const totalBtnW = potionBtnW * 2 + potionBtnGap;
      const btnStartX = (W - totalBtnW) / 2;
  
      // 升级按钮（需要选中字母）
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
  
      // 暂存按钮（始终可点，除非正在动画中）
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
  
      // 如果正在播放升级动画，叠加在字母选择页面上方
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
  
      // 标题：shop_icon.png 装饰 + "随机强化" + shop_icon.png 水平镜像
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleText = '随机强化';
      const titleTextW = ctx.measureText(titleText).width;
      ctx.fillText(titleText, W / 2, titleY);
      ctx.restore();
  
      // 左右装饰图标
      const decoIconW = 20 * s + 2 * s;
      const decoIconH = 20 * s;
      const decoGap = 10 * s - 2 * s;
      const decoIconY = titleY - decoIconH / 2;
      if (this.shopIcon && this.shopIconLoaded) {
        const leftIconX = W / 2 - titleTextW / 2 - decoGap - decoIconW;
        ctx.drawImage(this.shopIcon, leftIconX, decoIconY, decoIconW, decoIconH);
  
        const rightIconX = W / 2 + titleTextW / 2 + decoGap;
        ctx.save();
        ctx.translate(rightIconX + decoIconW, decoIconY);
        ctx.scale(-1, 1);
        ctx.drawImage(this.shopIcon, 0, 0, decoIconW, decoIconH);
        ctx.restore();
      }
  
      // 副标题
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('点击抽选字母，分数乘以1.5~4倍，本赛局有效', W / 2, subTitleY);
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
  
      // paused 阶段：扇形闪烁约1.5次（浅金色 ↔ 金色，周期750ms）
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
  
      // 绘制转盘扇形（随转盘旋转）
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
  
      // 绘制字母（径向排列，从外向内）
      for (let i = 0; i < 26; i++) {
        const midAngle = startOffset + i * anglePerSectorRad + anglePerSectorRad / 2;
        const textRadius = wheelRadius * 0.72;
        const tx = Math.cos(midAngle) * textRadius;
        const ty = Math.sin(midAngle) * textRadius;
        const isHighlighted = i === highlightIdx;
  
        ctx.save();
        ctx.translate(tx, ty);
        // 文字沿半径方向，底部朝向中心 → 旋转 midAngle + PI/2
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
  
      // === 中心圆形（抽选按钮 / 倍数显示）===
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
        // paused / done：金色背景，与扇形高亮颜色一致
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
  
      // 文字：idle 显示"抽选"，spinning 快速切换倍数，paused/done 定格最终倍数
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
  
      // done 阶段且倍率 > 3：中心圆内部放烟花（复用单词验证合法烟花）
      if (popup && popup.phase === 'done' && game._potionUpgrading && game._potionUpgrading.randomMult > 3) {
        if (!game._potionUpgrading._fireworkSpawned) {
          game._potionUpgrading._fireworkSpawned = true;
          this._spawnSparkles(centerX, wheelCenterY, 20);
        }
      }
  
      // 中心按钮点击区域（圆形）
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
  
      // === 顶部指针（不旋转）===
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
        ctx.fillText(`当前：${hlLetter}`, centerX, hintY);
        ctx.restore();
      }
  
      // 关闭按钮已移除（随机强化页面无需手动关闭）
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
      // 前1秒只显示闪烁动画（由 drawHUD 绘制），不显示弹窗
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

      // 标题：学习模式
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
      ctx.fillText('每日10个新词，随机添加到每回合游戏中', px + 14 * s + barPad, barY + barH / 2);
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
        // 入场动画（从下往上弹 150ms）
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

      // 返回按钮（参考问题反馈弹窗样式）
      const backY = py + 26 * s;
      const backLabel = '‹';
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const backW = ctx.measureText(backLabel).width;
      ctx.fillText(backLabel, px + 14 * s, backY);
      ctx.restore();
      // 记录返回点击区域（加大）
      this.dailyWordsBackRect = { x: px + 14 * s - 14 * s, y: backY - 18 * s, w: backW + 28 * s, h: 36 * s };

      // 关闭按钮（棕色圆圈）
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
      // 仅在非拖动/动画状态下限制滚动范围（rubber band 效果需要允许临时超出）
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

        // 状态标签（右侧）
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

        // 单词（序号右侧）
        const wordX = numX + numR + 8 * s;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(wObj.word, wordX, cy + 18 * s);

        // 音标（单词右侧）
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

        // 英文例句（目标词加粗）
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
      const isAllCollected = collectedCount >= 10 && words.length > 0;
      // 全部完成时：底部文案周期性小幅度上下跳跃
      const sloganBounceY = isAllCollected ? Math.sin(Date.now() / 350) * 2.5 * s : 0;
      ctx.save();
      ctx.globalAlpha = sloganAnim.alpha * ca;
      ctx.font = `${isAllCollected ? 'bold ' : ''}${Math.floor(11 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let sloganText = '✦  每日10个新词，积累从现在开始！  ✦';
      if (isAllCollected) {
        sloganText = '✦  你太棒了！今日新词学习完成,跟朋友分享下吧！  ✦';
      } else if (collectedCount >= 1) {
        sloganText = `✦  每日10个新词，积累从现在开始！(${collectedCount}/10)   ✦`;
      }
      ctx.fillStyle = isAllCollected ? '#2d7d32' : '#a09070';
      ctx.fillText(sloganText, W / 2, sloganY + sloganBounceY);
      ctx.restore();

      // 全部学习完成：在顶部「学习模式」标题左右播放两次放慢的金色烟花（首次延迟 500ms，之后间隔 600ms）
      if (isAllCollected) {
        const now = Date.now();
        if (!game._dailyWordsSparkleState) {
          game._dailyWordsSparkleState = { count: 0, lastTime: 0 };
        }
        const state = game._dailyWordsSparkleState;
        const interval = state.count === 0 ? 500 : 600;
        if (state.count < 2 && now - state.lastTime >= interval) {
          state.count++;
          state.lastTime = now;
          const leftX = W / 2 - titleWidth / 2 - 30 * s;
          const rightX = W / 2 + titleWidth / 2 + 30 * s;
          this._spawnSparkles(leftX, titleY, 12, null, 0.5);
          this._spawnSparkles(rightX, titleY, 12, null, 0.5);
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

      // 在弹窗最上层绘制烟花粒子（避免被弹窗背景遮挡）
      this._updateAndDrawSparkles(ctx, s);

      // 记录内容区域（用于滚动检测）
      this.dailyWordsContentRect = { x: px + 10 * s, y: contentTop, w: pw - 20 * s, h: contentH };
      // 记录面板区域（用于点击外部关闭检测）
      this.dailyWordsPanelRect = { x: px, y: py, w: pw, h: ph };
    }

    // 辅助：绘制例句，目标词加粗高亮
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

      const panelW = 280;
      const panelH = 340;
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
      this.settingsRankRect = null;
      this.settingsFeedbackRect = null;
      this.feedbackBackRect = null;
      this.feedbackInputRect = null;
      this.feedbackSubmitRect = null;
      this.settingsPanelRect = { x: px, y: py, w: pw, h: ph };
      this.settingsCloseRect = { x: 0, y: 0, w: W, h: H };

      const contentAlpha = closeAlpha;

      // === 内层细边框（参考购买成功弹窗） ===
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      const inset = 4 * s;
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

      // === 右上角关闭按钮（在所有边框之后绘制，确保在最上层） ===
      const closeSize = 32 * s;
      const closeX = px + pw - closeSize - 10 * s + 3;
      const closeY = py + 10 * s - 3;
      const pressOffset = game._settingsCloseBtnPressed ? 2 * s : 0;
      ctx.save();
      ctx.globalAlpha = contentAlpha;
      if (this.popCloseLoaded && this.popCloseImage) {
        ctx.drawImage(this.popCloseImage, closeX, closeY + pressOffset, closeSize, closeSize);
      } else {
        // 兜底：绘制 X
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

    // === 内部函数：绘制设置主页 ===
    function drawMainPage(offsetX) {
        ctx.save();
        ctx.translate(offsetX, 0);

        // === 标题：设置 ===
        const titleY = py + 32 * s;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(26 * s)}px Georgia, serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('设置', W / 2, titleY);
        ctx.restore();

        // === 标题下装饰线（参考购买成功弹窗） ===
        const decoLineY = py + 52 * s;
        const decoLineW = pw * 0.5;
        const decoLineX = px + (pw - decoLineW) / 2;
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
        ctx.restore();

        // === 设置项列表 ===
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
            key: 'dailyChallenge',
            iconKey: 'study',
            title: '学习模式',
            subtitle: '每天10个新词挑战',
            type: 'arrow'
          },
          {
            key: 'rank',
            iconKey: 'rank',
            title: '排行榜',
            subtitle: '查看好友排行',
            type: 'arrow'
          },
          {
            key: 'feedback',
            iconKey: 'feedback',
            title: '问题反馈',
            subtitle: '告诉我们你的建议与问题',
            type: 'arrow'
          }
        ];

        const itemH = 58 * s;
        const itemStartY = titleY + 28 * s;
        const iconSize = 50 * s;

        items.forEach((item, i) => {
          const itemY = itemStartY + i * itemH;
          const centerY = itemY + itemH / 2;

          // 图标图片
          const iconX = px + 22 * s;
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

          // 标题
          ctx.save();
          ctx.globalAlpha = contentAlpha;
          ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
          ctx.fillStyle = '#3a2e1e';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.title, iconX + iconSize + 11 * s, centerY - 7 * s);
          ctx.restore();

          // 副标题
          ctx.save();
          ctx.globalAlpha = contentAlpha * 0.7;
          ctx.font = `${Math.floor(12 * s)}px sans-serif`;
          ctx.fillStyle = '#8a7a6a';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.subtitle, iconX + iconSize + 11 * s, centerY + 11 * s);
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

            // 记录点击区域
            this.settingsSoundRect = { x: swX, y: swY, w: swW, h: swH };
          } else if (item.type === 'arrow') {
            // 学习模式：在箭头左侧显示开关状态标签
            if (item.key === 'dailyChallenge') {
              const isOn = game.settings && game.settings.dailyWordChallengeEnabled === true;
              ctx.save();
              ctx.globalAlpha = contentAlpha;
              ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
              const statusText = isOn ? '已开启' : '已关闭';
              ctx.fillStyle = isOn ? '#8b6914' : '#b0a898';
              ctx.fillText(statusText, ctrlRightX - 18 * s, centerY);
              ctx.restore();
            }

            ctx.save();
            ctx.globalAlpha = contentAlpha * 0.6;
            ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
            ctx.fillStyle = '#8a7a6a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('›', ctrlRightX - 4 * s, centerY);
            ctx.restore();

            // 记录整行点击区域
            const rect = { x: px + 10 * s, y: itemY, w: pw - 20 * s, h: itemH };
            if (item.key === 'rank') this.settingsRankRect = rect;
            if (item.key === 'feedback') this.settingsFeedbackRect = rect;
            if (item.key === 'dailyChallenge') this.settingsDailyChallengeRect = rect;
          }

          // 分隔线（非最后一项）
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

      // === 内部函数：绘制问题反馈页 ===
      function drawFeedbackPage(offsetX) {
        ctx.save();
        ctx.translate(offsetX, 0);

        // 返回按钮
        const backY = py + 26 * s;
        const backLabel = '‹';
        ctx.save();
        ctx.globalAlpha = contentAlpha;
        ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const backW = ctx.measureText(backLabel).width;
        ctx.fillText(backLabel, px + 14 * s, backY);
        ctx.restore();

        // 记录返回点击区域（加大）
        this.feedbackBackRect = { x: px + 14 * s - 14 * s, y: backY - 18 * s, w: backW + 28 * s, h: 36 * s };

        // 标题：问题反馈
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
        const placeholder = '请描述你遇到的问题或建议\n（你的每个建议对我都很宝贵！）';
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

};
