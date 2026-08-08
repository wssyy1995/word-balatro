// ===== 每日金词模式渲染 =====
// 页面布局复用单人回合页：HUD（剩余次数）→ 问号占位卡 → 预览区（命中反馈）→ 手牌区 → [出牌][历史][清空]
const { Easing } = require('../animation');

module.exports = function extendGolden(Renderer) {

  // 顶部 HUD：top_icon 返回 + 标题 + 「词长 / 剩余次数」栏
  Renderer.prototype.drawGoldenHUD = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;
    // 与 drawHUD 保持一致的顶部计算
    const extraHeight = this.H - Math.floor(740 * s);
    const topOffset = extraHeight * 0.05;
    const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
    const h = 72 * s;

    this.drawTopHeader(game, false);

    // 标题（字体与双人对战页面标题一致）
    ctx.save();
    const goldenTitleFont = '"Source Han Serif SC", "Noto Serif SC", "SimSun", serif';
    ctx.font = `bold ${Math.floor(22 * s)}px ${goldenTitleFont}`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleY = top - 12 * s + (this.hasDynamicIsland ? 3 * s : 0);
    ctx.fillText('✦ 今日金词 ✦', W / 2, titleY);
    ctx.restore();

    // 信息栏（词长 / 剩余次数）
    const barW = W - 20 * s;
    const barH = h;
    const barX = 10 * s;
    const barY = top + 9 * s;
    const gw = game.goldenWord;

    if (this.gameProgressImage && this.gameProgressLoaded) {
      ctx.drawImage(this.gameProgressImage, barX, barY, barW, barH);
    } else {
      this.roundRect(barX, barY, barW, barH, 10 * s, '#f0e0c8', '#c5a059', 1 * s);
    }

    const cols = [
      { label: '词长', value: gw ? String(gw.word.length) : '-' },
      { label: '剩余次数', value: gw ? String(gw.attemptsLeft) : '-' },
      { label: '已猜', value: gw ? String(gw.guesses.length) : '0' },
    ];
    const colW = barW / cols.length;
    cols.forEach((col, i) => {
      const cx = barX + colW * i + colW / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = '#8a7a5a';
      ctx.fillText(col.label, cx, barY + 22 * s);
      ctx.font = `bold ${Math.floor(20 * s)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText(col.value, cx, barY + 48 * s);
      ctx.restore();
      // 分隔线
      if (i > 0) {
        ctx.save();
        ctx.strokeStyle = '#c5a059';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(barX + colW * i, barY + 14 * s);
        ctx.lineTo(barX + colW * i, barY + barH - 14 * s);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // 主页面：问号占位卡 + 预览区 + 手牌 + 底部按钮
  Renderer.prototype.drawGoldenPlaying = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const gw = game.goldenWord;

    const hand = game.goldenHand || [];
    const cols = hand.length <= 9 ? 3 : 4;
    const rows = Math.ceil(hand.length / cols) || 1;

    // === 布局链（与 drawPlaying 保持一致，去掉分数方块）===
    const extraHeight = H - Math.floor(740 * s);
    const topOffset = extraHeight * 0.05;
    const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
    const h = 72 * s;
    const hudBottom = top + 9 * s + h;
    const maxRows = 3;
    const cardGridH = maxRows * this.cardH + (maxRows - 1) * this.gap;
    const maskHalfH = 22 * s; // 预览蒙层半高（maskH = 44*s）
    const propBarH = 84 * s;

    const btnTop = H - 90 * s;
    // 卡牌底部到按钮间距加大，预览区与卡牌区整体上移
    const cardGap = Math.max(4 * s, 62 * s + extraHeight * 0.25 - 10);
    const cardBottom = btnTop - cardGap + 3 * s + 5;
    const cardAreaY = cardBottom - cardGridH + 10;
    const wordAreaY = cardAreaY - 35 * s - maskHalfH + 2 * s + 2 * s + 3 * s;
    const propY = hudBottom + 6 * s - 3 + 5;

    this.cardRects = [];

    // ===== 问号占位卡（原道具栏位置）=====
    const propW = W - 20 * s;
    const propX = (W - propW) / 2;
    this.roundRect(propX + 2 * s, propY + 2 * s, propW, propBarH, 10 * s, 'rgba(0,0,0,0.10)', null);
    this.roundRect(propX, propY, propW, propBarH, 10 * s, 'rgba(250,246,238,0.85)', '#c4a35a', 1.5 * s);

    if (gw) {
      const letters = gw.word.toUpperCase().split('');
      const n = letters.length;
      const gap = 6 * s;
      // 占位卡：宽度略放大，高度纵向拉伸
      const tileW = Math.min(48 * s, (propW - 24 * s - (n - 1) * gap) / n);
      const tileH = Math.min(tileW * 1.2, propBarH - 10 * s);
      const totalW = n * tileW + (n - 1) * gap;
      let tileX = propX + (propW - totalW) / 2;
      const tileY = propY + (propBarH - tileH) / 2;

      // 模板与双人对战一致：占位 battle_me_place，揭示 battle_me_word_bg
      const placeImg = this.battle_me_placeLoaded ? this.battle_me_place : null;
      const wordImg = this.battle_me_word_bgLoaded ? this.battle_me_word_bg : null;

      const feedbackAnim = game._goldenFlipAnim;
      const resultPopup = game._goldenResultPopup;
      const now = Date.now();

      const drawTileFace = (x, y, revealedFace, ch) => {
        if (revealedFace) {
          if (wordImg) {
            ctx.drawImage(wordImg, x, y, tileW, tileH);
          } else {
            this.roundRect(x, y, tileW, tileH, 6 * s, '#f5d78e', '#b5973e', 1.5 * s);
          }
          ctx.font = `bold ${Math.floor(tileH * 0.5)}px Georgia, serif`;
          ctx.fillStyle = '#5a4a2a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch, x + tileW / 2, y + tileH / 2 + 1 * s);
        } else {
          if (placeImg) {
            ctx.drawImage(placeImg, x, y, tileW, tileH);
          } else {
            this.roundRect(x, y, tileW, tileH, 6 * s, '#fdfaf3', '#c4a35a', 1.5 * s);
            ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
            ctx.fillStyle = '#c4a35a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('？', x + tileW / 2, y + tileH / 2 + 1 * s);
          }
        }
      };

      letters.forEach((ch, i) => {
        // 位置命中揭示：positions[i] 为 true 表示该格已揭示
        const revealed = !!(gw.positions && gw.positions[i]);

        // 翻牌进度：出牌命中翻牌（_goldenFlipAnim）或猜中翻牌（结果弹窗 flipIndices）
        let flipP = revealed ? 1 : 0;
        let playedSet = null;
        let flipStart = null;
        if (revealed && feedbackAnim && feedbackAnim.indices.indexOf(i) !== -1) {
          flipStart = feedbackAnim.startTime + feedbackAnim.indices.indexOf(i) * 180;
          playedSet = feedbackAnim.played;
        } else if (revealed && resultPopup && resultPopup.flipIndices && resultPopup.flipIndices.indexOf(i) !== -1) {
          flipStart = resultPopup.revealStartTime + resultPopup.flipIndices.indexOf(i) * 180;
          playedSet = resultPopup.flipPlayed;
        }
        if (flipStart !== null) {
          const flipDuration = 300;
          if (now >= flipStart + flipDuration) flipP = 1;
          else if (now >= flipStart) flipP = (now - flipStart) / flipDuration;
          else flipP = 0;
          // 翻开音效（每格只在开始翻时播一次）
          if (flipP > 0 && flipP < 1 && playedSet && !playedSet[i]) {
            playedSet[i] = true;
            if (game.audioManager) game.audioManager.play('card_jump');
          }
        }

        const showLetter = revealed && flipP >= 0.5;
        const scaleX = flipP > 0 && flipP < 1 ? Math.abs(Math.cos(flipP * Math.PI)) : 1;

        // 进入缩放动画：逐格 easeOutBack 弹出（进入金词页时触发一次）
        let enterScale = 1;
        let enterOffsetY = 0;
        if (game._goldenTilesEnterStart) {
          const enterP = Math.min(1, Math.max(0, (now - game._goldenTilesEnterStart - i * 70) / 320));
          if (enterP < 1) {
            const ease = Easing.easeOutBack(enterP);
            enterScale = Math.max(ease, 0.02);
            enterOffsetY = (1 - ease) * 12 * s;
          }
        }

        ctx.save();
        ctx.translate(tileX + tileW / 2, tileY + tileH / 2 + enterOffsetY);
        ctx.scale(Math.max(scaleX * enterScale, 0.02), enterScale);
        drawTileFace(-tileW / 2, -tileH / 2, showLetter, ch);
        ctx.restore();
        tileX += tileW + gap;
      });
    }

    // ===== 预览区（拼词预览 + 命中反馈）=====
    const maskW = 200 * s;
    const maskH = 44 * s;
    const maskX = W / 2 - maskW / 2;
    const maskY = wordAreaY - maskH / 2;
    const maskGrad = ctx.createLinearGradient(0, maskY, 0, maskY + maskH);
    maskGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
    maskGrad.addColorStop(1, 'rgba(240,235,224,0.35)');
    this.roundRect(maskX, maskY, maskW, maskH, 10 * s, maskGrad, 'rgba(196,163,90,0.5)', 1 * s);

    const selected = game.getGoldenSelectedCards ? game.getGoldenSelectedCards() : [];
    const feedback = game._goldenFeedback;
    const feedbackAge = feedback ? Date.now() - feedback.startTime : Infinity;
    const feedbackVisible = feedback && feedbackAge < 3000;

    // 命中反馈：显示在预览区上方（占位卡栏与预览区之间，3s 渐隐）
    if (feedbackVisible) {
      const fade = feedbackAge > 2200 ? 1 - (feedbackAge - 2200) / 800 : 1;
      const feedbackY = (propY + propBarH + maskY) / 2;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const wordText = `「${feedback.word}」`;
      const hitText = ` 命中 ${feedback.hits} 个位置`;
      ctx.font = `bold ${Math.floor(16 * s)}px Georgia, 'Times New Roman', serif`;
      const wordW = ctx.measureText(wordText).width;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      const hitW = ctx.measureText(hitText).width;
      let cursorX = W / 2 - (wordW + hitW) / 2;
      ctx.font = `bold ${Math.floor(16 * s)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.fillText(wordText, cursorX + wordW / 2, feedbackY);
      cursorX += wordW;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = feedback.hits > 0 ? '#2d7d32' : '#999';
      ctx.fillText(hitText, cursorX + hitW / 2, feedbackY);
      ctx.restore();
    }

    // 非法单词提示：同样显示在预览区上方（红色，3s 渐隐）
    const invalid = game._goldenInvalid;
    const invalidAge = invalid ? Date.now() - invalid.startTime : Infinity;
    if (invalid && invalidAge < 3000) {
      const fade = invalidAge > 2200 ? 1 - (invalidAge - 2200) / 800 : 1;
      const invalidY = (propY + propBarH + maskY) / 2;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c0392b';
      ctx.fillText(`「${invalid.word}」不是有效单词`, W / 2, invalidY);
      ctx.restore();
    }

    if (game._goldenChecking) {
      ctx.save();
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(90,74,42,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('校验中…', W / 2, wordAreaY);
      ctx.restore();
    } else if (selected.length >= 1) {
      const word = selected.map(c => c.letter.toLowerCase()).join('');
      ctx.save();
      ctx.font = `bold ${Math.floor(23 * s)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word, W / 2, wordAreaY);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(90,74,42,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('金词就藏在字母牌中，猜猜看吧', W / 2, wordAreaY);
      ctx.restore();
    }

    // ===== 手牌网格（与 drawPlaying 相同的坐标计算）=====
    hand.forEach((card, i) => {
      if (!card) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardsInRow = (row === rows - 1 && hand.length % cols !== 0)
        ? hand.length % cols
        : cols;
      const rowTotalW = cardsInRow * this.cardW + (cardsInRow - 1) * this.gap;
      const rowStartX = (W - rowTotalW) / 2;
      const x = rowStartX + col * (this.cardW + this.gap);
      const y = cardAreaY + row * (this.cardH + this.gap);
      this.drawCard(card, x, y, card.newCard);
      this.cardRects.push({ x, y, w: this.cardW, h: this.cardH, cardId: card.id });
      card.newCard = false;
    });

    // ===== 底部三按钮：[出牌] [历史] [清空] =====
    const btnY = H - 90 * s - 5;
    const btnW = 90 * s;
    const btnH = 56 * s;
    const btnGap = 20 * s;
    const totalBtnW = btnW * 3 + btnGap * 2;
    const btnStartX = (W - totalBtnW) / 2;

    // 出牌
    const playX = btnStartX;
    const playY = btnY + (this.pressedBtn === 'golden_play' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.drawBtnImage('out_card', playX, playY, btnW, btnH);
    ctx.restore();
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const playText = gw ? `出牌 (${gw.attemptsLeft})` : '出牌';
    const playTx = playX + btnW / 2;
    const playTextY = playY + btnH / 2 - 1 * s;
    ctx.lineWidth = 2 * s;
    if (selected.length < 2 || !gw || gw.finished) {
      ctx.strokeStyle = '#3a2e1d';
      ctx.strokeText(playText, playTx, playTextY);
      ctx.fillStyle = '#9a8f7d';
      ctx.fillText(playText, playTx, playTextY);
    } else {
      ctx.strokeStyle = '#2a1f0d';
      ctx.strokeText(playText, playTx, playTextY);
      const grad = ctx.createLinearGradient(playTx, playTextY - 7 * s, playTx, playTextY + 7 * s);
      grad.addColorStop(0, '#dfc06e');
      grad.addColorStop(0.5, '#c9a84c');
      grad.addColorStop(1, '#b5973e');
      ctx.fillStyle = grad;
      ctx.fillText(playText, playTx, playTextY);
    }
    ctx.restore();
    this.goldenPlayBtnRect = { x: playX, y: btnY, w: btnW, h: btnH, action: 'golden_play' };

    // 历史（无现成按钮图，canvas 绘制同风格按钮）
    const histX = btnStartX + btnW + btnGap;
    const histY = btnY + (this.pressedBtn === 'golden_history' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    const histGrad = ctx.createLinearGradient(0, histY, 0, histY + btnH);
    histGrad.addColorStop(0, '#fdf6e3');
    histGrad.addColorStop(1, '#e8dcc0');
    this.roundRect(histX, histY, btnW, btnH, 10 * s, histGrad, '#c4a35a', 1.5 * s);
    ctx.restore();
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const histTx = histX + btnW / 2;
    const histTextY = histY + btnH / 2 - 1 * s;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#2a1f0d';
    ctx.strokeText('历史', histTx, histTextY);
    const htGrad = ctx.createLinearGradient(histTx, histTextY - 7 * s, histTx, histTextY + 7 * s);
    htGrad.addColorStop(0, '#dfc06e');
    htGrad.addColorStop(0.5, '#c9a84c');
    htGrad.addColorStop(1, '#b5973e');
    ctx.fillStyle = htGrad;
    ctx.fillText('历史', histTx, histTextY);
    ctx.restore();
    this.goldenHistoryBtnRect = { x: histX, y: btnY, w: btnW, h: btnH, action: 'golden_history' };

    // 清空选择
    const resetX = btnStartX + (btnW + btnGap) * 2;
    const resetY = btnY + (this.pressedBtn === 'golden_reset' ? 2 * s : 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 3 * s;
    this.drawBtnImage('reset_select', resetX, resetY, btnW, btnH);
    ctx.restore();
    ctx.save();
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const resetTx = resetX + btnW / 2;
    const resetTextY = resetY + btnH / 2 - 1 * s;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#5a4a2a';
    ctx.strokeText('清空选择', resetTx, resetTextY);
    ctx.fillStyle = '#fff';
    ctx.fillText('清空选择', resetTx, resetTextY);
    ctx.restore();
    this.goldenResetBtnRect = { x: resetX, y: btnY, w: btnW, h: btnH, action: 'golden_reset' };
  }

  // ===== 本月点亮日历（入口弹窗与历史面板共用）；x/y 为内容左上角，w 为内容宽；返回占用高度 =====
  Renderer.prototype._drawGoldenMonthCalendar = function(ctx, x, y, w, s, game) {
    const bjNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const year = bjNow.getUTCFullYear();
    const month = bjNow.getUTCMonth(); // 0-based
    const todayDay = bjNow.getUTCDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const cal = game.storageManager ? game.storageManager.getGoldenWordCalendar() : {};
    const litDays = cal[monthKey] || [];
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=周日

    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // 「本月点亮（N 天）」加粗，天数用深橙色
    const calPre = '本月点亮（';
    const calNum = String(litDays.length);
    const calPost = ' 天）';
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText(calPre, x, y);
    const calPreW = ctx.measureText(calPre).width;
    ctx.fillStyle = '#d97706';
    ctx.fillText(calNum, x + calPreW, y);
    const calNumW = ctx.measureText(calNum).width;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText(calPost, x + calPreW + calNumW, y);
    let curY = y + 14 * s;

    const cellGap = 4 * s;
    const cellW = (w - cellGap * 6) / 7;
    const cellH = 26 * s;
    const calRows = Math.ceil((firstWeekday + daysInMonth) / 7);
    for (let day = 1; day <= daysInMonth; day++) {
      const idx = firstWeekday + day - 1;
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const cellX = x + col * (cellW + cellGap);
      const cellY = curY + row * (cellH + cellGap);
      const lit = litDays.includes(day);
      const isToday = day === todayDay;

      if (lit) {
        // 已点亮：金色渐变底 + 白色加粗数字 + 四角星芒点缀
        ctx.save();
        ctx.shadowColor = 'rgba(196,163,90,0.45)';
        ctx.shadowBlur = 4 * s;
        ctx.shadowOffsetY = 1 * s;
        const litGrad = ctx.createLinearGradient(0, cellY, 0, cellY + cellH);
        litGrad.addColorStop(0, '#f7d977');
        litGrad.addColorStop(1, '#e2a93a');
        this.roundRect(cellX, cellY, cellW, cellH, 5 * s, litGrad, '#c9a84c', 1 * s);
        ctx.restore();
        ctx.save();
        ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(String(day), cellX + cellW / 2, cellY + cellH / 2);
        // 星芒点缀（右上、左下）
        ctx.font = `${Math.floor(7 * s)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText('✦', cellX + cellW - 5 * s, cellY + 5 * s);
        ctx.fillText('✦', cellX + 5 * s, cellY + cellH - 5 * s);
        ctx.restore();
      } else if (isToday) {
        // 今日未点亮：米白底 + 金色描边 + 淡金光晕 + 深金数字
        ctx.save();
        ctx.shadowColor = 'rgba(222,184,92,0.55)';
        ctx.shadowBlur = 6 * s;
        this.roundRect(cellX, cellY, cellW, cellH, 5 * s, '#faf5ea', '#c4a35a', 1.5 * s);
        ctx.restore();
        ctx.save();
        ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
        ctx.fillStyle = '#8b6914';
        ctx.textAlign = 'center';
        ctx.fillText(String(day), cellX + cellW / 2, cellY + cellH / 2);
        ctx.restore();
      } else {
        // 非今日未点亮：浅米底、无描边、灰棕数字
        this.roundRect(cellX, cellY, cellW, cellH, 5 * s, 'rgba(196,163,90,0.10)', null);
        ctx.save();
        ctx.font = `${Math.floor(10 * s)}px sans-serif`;
        ctx.fillStyle = '#b0a48c';
        ctx.textAlign = 'center';
        ctx.fillText(String(day), cellX + cellW / 2, cellY + cellH / 2);
        ctx.restore();
      }
    }
    curY += calRows * (cellH + cellGap);
    return curY - y;
  }

  // ===== 历史记录面板（本月点亮日历 + 本次挑战记录）=====
  Renderer.prototype.drawGoldenHistoryPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const popup = game._goldenHistoryPopup;
    if (!popup) return;

    const elapsed = Date.now() - popup.startTime;
    const panel = this._drawModalPanel(ctx, W, H, s, {
      width: 320, height: 520, elapsed,
      isClosing: popup.closing,
      closeStartTime: popup.closeStartTime,
      onCloseComplete: () => { game._goldenHistoryPopup = null; }
    });
    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    ctx.save();
    ctx.globalAlpha = closeAlpha;

    // 标题
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ 挑战记录 ✦', px + pw / 2, py + 26 * s);

    // ---- 本月点亮日历 ----
    let curY = py + 44 * s;
    curY += this._drawGoldenMonthCalendar(ctx, px + 20 * s, curY, pw - 40 * s, s, game) + 12 * s;

    // ---- 本次挑战记录 ----
    const gw = game.goldenWord;
    const guesses = gw ? gw.guesses : [];
    ctx.font = `${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = '#8a7a5a';
    ctx.textAlign = 'left';
    ctx.fillText(`本次挑战（已猜 ${guesses.length} 次）`, px + 20 * s, curY);
    curY += 16 * s;

    if (guesses.length === 0) {
      ctx.font = `${Math.floor(12 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(90,74,42,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('还没有出牌记录', px + pw / 2, curY + 14 * s);
    } else {
      const rowH = 24 * s;
      guesses.forEach((g, i) => {
        const rowY = curY + i * rowH;
        this.roundRect(px + 20 * s, rowY, pw - 40 * s, rowH - 4 * s, 5 * s, 'rgba(196,163,90,0.10)', null);
        ctx.font = `bold ${Math.floor(13 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'left';
        ctx.fillText(g.word, px + 30 * s, rowY + (rowH - 4 * s) / 2);
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.textAlign = 'right';
        if (g.invalid) {
          ctx.fillStyle = '#c0392b';
          ctx.fillText('无效', px + pw - 30 * s, rowY + (rowH - 4 * s) / 2);
        } else {
          ctx.fillStyle = g.hits > 0 ? '#2d7d32' : '#b0a48c';
          ctx.fillText(`命中 ${g.hits}`, px + pw - 30 * s, rowY + (rowH - 4 * s) / 2);
        }
      });
    }

    ctx.restore();

    // 关闭按钮（右上角 X）
    const closeSize = 26 * s;
    const closeX = px + pw - closeSize - 8 * s;
    const closeY = py + 8 * s;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    const cx0 = closeX + 7 * s;
    const cy0 = closeY + 7 * s;
    const cx1 = closeX + closeSize - 7 * s;
    const cy1 = closeY + closeSize - 7 * s;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.lineTo(cx1, cy1);
    ctx.moveTo(cx1, cy0);
    ctx.lineTo(cx0, cy1);
    ctx.stroke();
    ctx.restore();

    this.goldenHistoryCloseRect = { x: closeX - 4 * s, y: closeY - 4 * s, w: closeSize + 8 * s, h: closeSize + 8 * s };
    this.goldenHistoryPanelRect = { x: px, y: py, w: pw, h: ph };
  }

  // ===== 结果面板（猜中 / 失败）=====
  Renderer.prototype.drawGoldenResultPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const popup = game._goldenResultPopup;
    if (!popup) return;
    const gw = game.goldenWord;
    if (!gw) return;
    // 猜中时弹窗延迟到占位卡翻开动画完成后再显示
    if (Date.now() < popup.startTime) return;
    // 胜利音效：弹窗首次弹出时播放（再次进入查看不重复播放）
    if (popup.won && !popup.reentry && !popup._soundPlayed) {
      popup._soundPlayed = true;
      if (game.audioManager) game.audioManager.play('battle_pop_success');
    }

    const elapsed = Date.now() - popup.startTime;
    const panel = this._drawModalPanel(ctx, W, H, s, {
      width: 300, height: popup.won ? 340 : 300, elapsed,
      isClosing: popup.closing,
      closeStartTime: popup.closeStartTime,
      onCloseComplete: () => { game._goldenResultPopup = null; }
    });
    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    // 弹窗上方光芒 + 闪烁星星动画（参考双人对战挑战成功弹窗，绘制在文字内容之下）
    if (popup.won) {
      const effectCX = px + pw / 2;
      const effectCY = py;
      this._drawLightRays(ctx, effectCX, effectCY, pw * 0.9, s, elapsed, closeAlpha);
      this._goldenWinStars = this._drawSparkleStars(
        ctx, effectCX, effectCY, pw * 1.1, 90 * s, s, elapsed, 12, this._goldenWinStars, closeAlpha
      );
    }

    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (popup.won) {
      // 标题（参考单词本：Georgia 加粗 + 标题下分割装饰线）
      const winTitleY = py + 32 * s;
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('恭喜猜中', px + pw / 2, winTitleY);
      const winDecoY = winTitleY + 18 * s;
      const winDecoW = pw * 0.45;
      this._drawTitleDivider(ctx, px + (pw - winDecoW) / 2, winDecoY, winDecoW, s, { diamondColor: '#c4a35a' });

      // 金词大字
      ctx.font = `bold ${Math.floor(34 * s)}px Georgia, 'Times New Roman', serif`;
      const wordGrad = ctx.createLinearGradient(0, py + 84 * s, 0, py + 116 * s);
      wordGrad.addColorStop(0, '#dfc06e');
      wordGrad.addColorStop(1, '#b5973e');
      ctx.fillStyle = wordGrad;
      ctx.fillText(gw.word.toUpperCase(), px + pw / 2, py + 100 * s);

      if (gw.phonetic) {
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#8a7a5a';
        ctx.fillText(gw.phonetic, px + pw / 2, py + 128 * s);
      }
      if (gw.meaning) {
        ctx.font = `${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(gw.meaning, px + pw / 2, py + 151 * s);
      }

      ctx.font = `${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = '#8a7a5a';
      ctx.fillText(`用了 ${gw.winTries || gw.guesses.length} 次猜中 · 本月日历已点亮`, px + pw / 2, py + 180 * s);
    } else {
      // 标题（参考单词本：Georgia 加粗 + 标题下分割装饰线）
      const failTitleY = py + 32 * s;
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.fillText('挑战失败', px + pw / 2, failTitleY);
      const failDecoY = failTitleY + 18 * s;
      const failDecoW = pw * 0.45;
      this._drawTitleDivider(ctx, px + (pw - failDecoW) / 2, failDecoY, failDecoW, s, { diamondColor: '#c4a35a' });

      // 中间文案：下移并放大
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#8a7a5a';
      ctx.fillText('10 次机会已用完', px + pw / 2, py + 110 * s);
      ctx.fillText('明天再来挑战新金词！', px + pw / 2, py + 136 * s);
    }

    ctx.restore();

    // 按钮区：分享（猜中=分享战绩 / 失败=分享好友）+ 返回主页
    const btnH = 44 * s;
    const btnY = py + ph - btnH - 20 * s;
    ctx.save();
    ctx.globalAlpha = closeAlpha;

    const btnGap = 14 * s;
    const btnW = (pw - 40 * s - btnGap) / 2;
    const shareX = px + 20 * s;
    const homeX = shareX + btnW + btnGap;

    const sharePress = game._goldenSharePressed ? 2 * s : 0;
    if (this.battle_room_shareLoaded && this.battle_room_share) {
      // 分享按钮：使用 battle_room_share 图片（按宽高比适配按钮区域）
      const shareImg = this.battle_room_share;
      const aspect = (shareImg.width > 0 && shareImg.height > 0) ? shareImg.width / shareImg.height : btnW / btnH;
      let drawH = btnH;
      let drawW = drawH * aspect;
      if (drawW > btnW) {
        drawW = btnW;
        drawH = drawW / aspect;
      }
      const shareDx = shareX + (btnW - drawW) / 2;
      const shareDy = btnY + sharePress + (btnH - drawH) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 5 * s;
      ctx.shadowOffsetY = 2 * s;
      ctx.drawImage(shareImg, shareDx, shareDy, drawW, drawH);
      ctx.restore();
    } else {
      const sg = ctx.createLinearGradient(0, btnY + sharePress, 0, btnY + sharePress + btnH);
      sg.addColorStop(0, '#f5d78e');
      sg.addColorStop(1, '#c9a84c');
      this.roundRect(shareX, btnY + sharePress, btnW, btnH, 8 * s, sg, '#b5973e', 1.5 * s);
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(popup.won ? '分享战绩' : '分享好友', shareX + btnW / 2, btnY + sharePress + btnH / 2);
    }
    this.goldenShareBtnRect = { x: shareX, y: btnY, w: btnW, h: btnH };

    const homePress = game._goldenHomePressed ? 2 * s : 0;
    this.roundRect(homeX, btnY + homePress, btnW, btnH, 8 * s, '#f0e8d8', '#c4a35a', 1.5 * s);
    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#8b6914';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('返回主页', homeX + btnW / 2, btnY + homePress + btnH / 2);
    this.goldenHomeBtnRect = { x: homeX, y: btnY, w: btnW, h: btnH };
    ctx.restore();

    this.goldenResultPanelRect = { x: px, y: py, w: pw, h: ph };
  }

  // ===== 入口弹窗（主页金词按钮：月度日历 + 今日词长 + 挑战按钮）=====
  Renderer.prototype.drawGoldenEntryPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;
    const popup = game._goldenEntryPopup;
    if (!popup) return;

    const elapsed = Date.now() - popup.startTime;
    const panel = this._drawModalPanel(ctx, W, H, s, {
      width: 320, height: 480, elapsed,
      isClosing: popup.closing,
      closeStartTime: popup.closeStartTime,
      onCloseComplete: () => { game._goldenEntryPopup = null; }
    });
    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 标题（参考单词本：Georgia 加粗 + 标题下分割装饰线）
    const titleY = py + 32 * s;
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText('每日金词', px + pw / 2, titleY);

    const decoLineY = titleY + 18 * s;
    const decoLineW = pw * 0.45;
    const decoLineX = px + (pw - decoLineW) / 2;
    this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });

    ctx.font = `${Math.floor(11 * s)}px sans-serif`;
    ctx.fillStyle = '#a09070';
    ctx.fillText('每日1个神秘金词，和全服玩家一起竞猜', px + pw / 2, decoLineY + 18 * s);

    // 本月点亮日历
    let curY = py + 91 * s;
    curY += this._drawGoldenMonthCalendar(ctx, px + 20 * s, curY, pw - 40 * s, s, game);

    // 今日金词信息
    const info = game.getGoldenDailyWordInfo ? game.getGoldenDailyWordInfo() : null;
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const gwSave = game.storageManager ? game.storageManager.getGoldenWord() : null;
    const todayDone = !!(gwSave && gwSave.date === today && gwSave.finished);
    const todayWon = todayDone && gwSave.won;

    curY += 14 * s;
    // 词长横幅：GoldenLength 图片作底，文字在图内居中；未加载时回退纯文字
    // 已猜中时文案变为「今日金词 · 已猜中 GLOW」
    const lenData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['GoldenLength'];
    const lenText = todayWon
      ? `今日金词 · 已猜中 ${(gwSave.word || '').toUpperCase()}`
      : (todayDone ? '今日金词 · 挑战失败' : (info ? `今日金词 · 词长 ${info.word.length} 个字母` : '今日金词加载中…'));
    if (lenData && lenData.loaded && lenData.img) {
      const aspect = (lenData.width > 0 && lenData.height > 0) ? lenData.width / lenData.height : 6;
      // 宽度与日历一致（内容区宽 pw - 40*s），高度按图片原始宽高比等比缩放
      const bannerW = pw - 40 * s;
      const bannerH = bannerW / aspect;
      const bannerX = px + (pw - bannerW) / 2;
      ctx.drawImage(lenData.img, bannerX, curY, bannerW, bannerH);
      // 文字在横幅内加粗；词长数字/猜中单词用深橙色
      // 所有状态统一左对齐：以「今日金词 · 词长 X 个字母」的左边缘为锚点，保证前缀位置一致
      const textCY = curY + bannerH / 2 - 8 * s;
      const shiftX = -18 * s;
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      const refLen = info ? info.word.length : (gwSave && gwSave.word ? gwSave.word.length : 0);
      const refPreW = ctx.measureText('今日金词 · 词长 ').width;
      const refNumW = ctx.measureText(String(refLen)).width;
      const refPostW = ctx.measureText(' 个字母').width;
      const textLeftX = px + pw / 2 - (refPreW + refNumW + refPostW) / 2 - shiftX;
      ctx.textAlign = 'left';
      if (todayWon) {
        const pre = '今日金词 · 已猜中 ';
        const wordText = (gwSave.word || '').toUpperCase();
        let cursorX = textLeftX;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(pre, cursorX, textCY);
        cursorX += ctx.measureText(pre).width;
        ctx.fillStyle = '#d97706';
        ctx.fillText(wordText, cursorX, textCY);
      } else if (todayDone) {
        // 挑战失败：今日金词 · 挑战失败
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('今日金词 · 挑战失败', textLeftX, textCY);
      } else if (info) {
        let cursorX = textLeftX;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('今日金词 · 词长 ', cursorX, textCY);
        cursorX += refPreW;
        ctx.fillStyle = '#d97706';
        ctx.fillText(String(info.word.length), cursorX, textCY);
        cursorX += refNumW;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(' 个字母', cursorX, textCY);
      } else {
        ctx.fillStyle = '#a09070';
        ctx.fillText(lenText, textLeftX, textCY);
      }
      curY += bannerH;
    } else {
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      ctx.fillStyle = (info || todayDone) ? '#5a4a2a' : '#a09070';
      ctx.fillText(lenText, px + pw / 2, curY);
      curY += 16 * s;
    }
    ctx.restore();

    // 按钮：今日挑战已结束（猜中/失败）→ battle_room_share 分享按钮；否则 GoldenStart 开始挑战；均未加载回退 canvas
    const shareImg = (todayDone && this.battle_room_shareLoaded && this.battle_room_share) ? this.battle_room_share : null;
    const startData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['GoldenStart'];
    const startImg = (!todayDone && startData && startData.loaded && startData.img) ? startData.img : null;
    const btnImg = shareImg || startImg;
    let btnW = pw - 80 * s;
    let btnH = 44 * s;
    if (btnImg) {
      const aspect = (btnImg.width > 0 && btnImg.height > 0) ? btnImg.width / btnImg.height : btnW / btnH;
      btnH = Math.min(56 * s, btnW / aspect);
      btnW = btnH * aspect;
    }
    const btnX = px + (pw - btnW) / 2;
    const btnY = py + ph - btnH - 20 * s;
    const press = game._goldenEntryBtnPressed ? 2 * s : 0;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    if (btnImg) {
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 5 * s;
      ctx.shadowOffsetY = 2 * s;
      ctx.drawImage(btnImg, btnX, btnY + press, btnW, btnH);
    } else {
      const g = ctx.createLinearGradient(0, btnY + press, 0, btnY + press + btnH);
      g.addColorStop(0, '#f5d78e');
      g.addColorStop(1, '#c9a84c');
      this.roundRect(btnX, btnY + press, btnW, btnH, 8 * s, g, '#b5973e', 1.5 * s);
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fallbackText = todayWon ? '分享战绩' : (todayDone ? '分享好友' : '开始挑战');
      ctx.fillText(fallbackText, btnX + btnW / 2, btnY + press + btnH / 2);
    }
    ctx.restore();
    this.goldenEntryChallengeRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    // 关闭按钮（复用单词本弹窗：pop_close.png + 按下偏移，兜底圆形 X）
    const closeSize = 32 * s;
    const closeX = px + pw - closeSize - 10 * s + 3;
    const closeY = py + 10 * s - 3;
    const closePressOffset = game._goldenEntryClosePressed ? 2 * s : 0;
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
    this.goldenEntryCloseRect = { x: closeX - 3, y: closeY - 3, w: closeSize + 6, h: closeSize + 6 };
    this.goldenEntryPanelRect = { x: px, y: py, w: pw, h: ph };
  }
};
