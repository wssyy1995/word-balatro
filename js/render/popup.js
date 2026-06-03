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
  
      const rect = this.witchPropRects[popup.jokerIndex];
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
      const minPopupW = cardW + 20 * s;
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
      let contentH = pad * 2 + lineH * 3 + 4 * s; // 名称 + 效果标签 + 描述
      if (hasAccumulation) contentH += lineH + 2 * s; // 倍率增值
      if (hasLimit) contentH += lineH + 2 * s; // 剩余次数
      if (hasPredicted) contentH += lineH + 2 * s; // 预言字母
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
  
      // 倍率增值（错误即经验 / 首字连击：显示当前累加值）
      if (joker.trigger === 'illegal_boost' || joker.operation === 'multi_accumulation') {
        cy += lineH + 2 * s;
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#9b59b6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`倍率增值：+${joker.value}`, popupX + pad, cy);
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
  
      // 预言字母（预言家牌）
      if (hasPredicted) {
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
  
      const { LETTER_SCORE } = require('./data');
  
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

};
