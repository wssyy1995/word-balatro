// ===== 对战模式渲染 =====
const { LETTER_SCORE } = require('../data');

module.exports = function extendBattle(Renderer) {
  // 主渲染入口：对战状态
  Renderer.prototype.drawBattle = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 背景
    ctx.clearRect(0, 0, W, H);
    if (this.bgImage && this.bgLoaded) {
      ctx.drawImage(this.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }

    // 顶部安全区域
    const safeTop = this.safeTop || 0;
    const topOffset = this.hasDynamicIsland ? 10 * s : 0;

    // === 顶部进度条 ===
    const progressBarY = safeTop + 16 * s + topOffset;
    const progressBarW = W - 40 * s;
    const progressBarH = 6 * s;
    const progressBarX = (W - progressBarW) / 2;
    const progress = game.battleRound / game.battleTotalRounds;

    // 背景条
    this.roundRect(progressBarX, progressBarY, progressBarW, progressBarH, progressBarH / 2, 'rgba(255,255,255,0.15)', null, 0);

    // 进度条
    this.roundRect(progressBarX, progressBarY, progressBarW * progress, progressBarH, progressBarH / 2, '#c4a35a', null, 0);

    // 轮次文字
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`第 ${game.battleRound} / ${game.battleTotalRounds} 轮`, W / 2, progressBarY + progressBarH + 6 * s);

    // === Bot 信息区 ===
    const botAreaY = progressBarY + progressBarH + 30 * s;
    const avatarSize = 36 * s;
    const avatarX = 20 * s;
    const avatarY = botAreaY;

    // Bot头像（圆形背景）
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2a3a5a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,163,90,0.5)';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.restore();

    // Bot名称
    ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
    ctx.fillStyle = '#f5f0e6';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('单词小助手', avatarX + avatarSize + 10 * s, avatarY + 2 * s);

    // Bot总分
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${game.battleBotScore}分`, avatarX + avatarSize + 10 * s, avatarY + 20 * s);

    // === 单词展示区 ===
    const wordAreaY = botAreaY + avatarSize + 20 * s;
    const wordBoxH = 44 * s;
    const wordBoxGap = 10 * s;
    const wordBoxW = W - 40 * s;
    const wordBoxX = 20 * s;

    // 对手单词行
    this._drawBattleWordRow(ctx, wordBoxX, wordAreaY, wordBoxW, wordBoxH, s,
      '对手', game.battleBotWord, game.battleBotReady, game.battlePhase, true);

    // 我的单词行
    this._drawBattleWordRow(ctx, wordBoxX, wordAreaY + wordBoxH + wordBoxGap, wordBoxW, wordBoxH, s,
      '我', game.battlePlayerWord, true, game.battlePhase, false);

    // === 手牌区域 ===
    const handAreaY = wordAreaY + wordBoxH * 2 + wordBoxGap + 20 * s;
    this._drawBattleHand(game, handAreaY);

    // === 底部按钮 ===
    const btnH = 44 * s;
    const btnW = 120 * s;
    const btnGap = 16 * s;
    const btnY = H - btnH - 20 * s - (this.safeBottom || 0);
    const totalBtnW = btnW * 2 + btnGap;
    const playBtnX = (W - totalBtnW) / 2;
    const clearBtnX = playBtnX + btnW + btnGap;

    // 出牌按钮
    const hasSelection = game.battleHand && game.battleHand.some(c => c && c.selected);
    const playBtnColor = hasSelection ? '#c4a35a' : 'rgba(196,163,90,0.35)';
    this._drawBattleBtn(ctx, '出牌', playBtnX, btnY, btnW, btnH, s, game._battlePlayBtnPressed || false, playBtnColor);

    // 清空按钮
    this._drawBattleBtn(ctx, '清空', clearBtnX, btnY, btnW, btnH, s, game._battleClearBtnPressed || false, 'rgba(255,255,255,0.2)');

    // 保存按钮区域
    this.battlePlayBtnRect = { x: playBtnX, y: btnY, w: btnW, h: btnH };
    this.battleClearBtnRect = { x: clearBtnX, y: btnY, w: btnW, h: btnH };

    // === 对战结束弹窗 ===
    if (game.battlePhase === 'battle_end') {
      this._drawBattleEndPopup(game);
    }

    // === 轮次结果弹窗（揭晓阶段）===
    if (game.battlePhase === 'revealing' || game.battlePhase === 'round_end') {
      this._drawBattleRoundResult(game);
    }
  };

  // 绘制单词行
  Renderer.prototype._drawBattleWordRow = function(ctx, x, y, w, h, s, label, word, isReady, phase, isBot) {
    // 背景框
    ctx.save();
    this.roundRect(x, y, w, h, 6 * s, 'rgba(10, 22, 40, 0.6)', 'rgba(196,163,90,0.3)', 1 * s);
    ctx.restore();

    // 标签
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 10 * s, y + h / 2);

    // 单词内容
    ctx.textAlign = 'center';
    if (phase === 'selecting' && isBot) {
      // Bot选择中
      if (!isReady) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('对手选择中...', x + w / 2, y + h / 2);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('对手已选择', x + w / 2, y + h / 2);
      }
    } else if (word) {
      // 显示单词（大写）
      ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
      ctx.fillStyle = '#f5f0e6';
      const displayWord = word.toUpperCase();
      ctx.fillText(displayWord, x + w / 2, y + h / 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('等待出牌...', x + w / 2, y + h / 2);
    }
  };

  // 绘制对战手牌
  Renderer.prototype._drawBattleHand = function(game, startY) {
    const ctx = this.ctx;
    const W = this.W;
    const s = this.scale;

    if (!game.battleHand) return;

    const hand = game.battleHand;
    const cols = hand.length <= 9 ? 3 : 4;
    const rows = Math.ceil(hand.length / cols);
    const totalW = cols * this.cardW + (cols - 1) * this.gap;
    const startX = (W - totalW) / 2;

    this.battleCardRects = [];

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (!card) continue;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * (this.cardW + this.gap);
      const y = startY + row * (this.cardH + this.gap);

      const isSelected = card.selected;
      const offsetY = isSelected ? -8 * s : 0;

      // 绘制卡牌
      this.drawCard(card, x, y + offsetY, false, null);

      // 保存点击区域
      this.battleCardRects.push({
        index: i,
        x, y: y + offsetY,
        w: this.cardW,
        h: this.cardH,
        card
      });
    }
  };

  // 绘制对战按钮
  Renderer.prototype._drawBattleBtn = function(ctx, text, x, y, w, h, s, pressed, color) {
    const offset = pressed ? 2 * s : 0;
    ctx.save();
    this.roundRect(x, y + offset, w, h, 8 * s, color, null, 0);

    ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + offset);
    ctx.restore();
  };

  // 轮次结果弹窗
  Renderer.prototype._drawBattleRoundResult = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 半透明遮罩
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const panelW = 280 * s;
    const panelH = 240 * s;
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    // 面板背景
    ctx.save();
    this.roundRect(px, py, panelW, panelH, 12 * s, '#1a2f4a', '#c4a35a', 2 * s);
    ctx.restore();

    // 标题
    ctx.font = `bold ${Math.floor(18 * s)}px Georgia, serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`第 ${game.battleRound} 轮 结果`, W / 2, py + 16 * s);

    // 对手结果
    const botWord = game.battleBotWord ? game.battleBotWord.toUpperCase() : '无';
    ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`对手: ${botWord} (+${game.battleBotRoundScore || 0})`, W / 2, py + 56 * s);

    // 我的结果
    const myWord = game.battlePlayerWord ? game.battlePlayerWord.toUpperCase() : '无';
    ctx.fillStyle = '#f5f0e6';
    ctx.fillText(`我: ${myWord} (+${game.battlePlayerRoundScore || 0})`, W / 2, py + 86 * s);

    // 分割线
    ctx.strokeStyle = 'rgba(196,163,90,0.3)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, py + 118 * s);
    ctx.lineTo(px + panelW - 30 * s, py + 118 * s);
    ctx.stroke();

    // 总分
    ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
    ctx.fillStyle = '#c4a35a';
    ctx.fillText(`当前总分`, W / 2, py + 136 * s);

    ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
    ctx.fillStyle = '#f5f0e6';
    ctx.fillText(`我: ${game.battlePlayerScore} | 对手: ${game.battleBotScore}`, W / 2, py + 164 * s);

    // 按钮
    const btnW = 140 * s;
    const btnH = 40 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + panelH - btnH - 20 * s;
    const isLastRound = game.battleRound >= game.battleTotalRounds;
    const btnText = isLastRound ? '查看结果' : '下一轮';

    this._drawBattleBtn(ctx, btnText, btnX, btnY, btnW, btnH, s, game._battleNextBtnPressed || false, '#c4a35a');
    this.battleNextBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  };

  // 对战结束弹窗
  Renderer.prototype._drawBattleEndPopup = function(game) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    // 半透明遮罩
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const panelW = 300 * s;
    const panelH = 320 * s;
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    // 面板背景
    ctx.save();
    this.roundRect(px, py, panelW, panelH, 12 * s, '#1a2f4a', '#c4a35a', 2 * s);
    ctx.restore();

    const playerScore = game.battlePlayerScore || 0;
    const botScore = game.battleBotScore || 0;
    const isWin = playerScore > botScore;
    const isDraw = playerScore === botScore;
    const resultText = isWin ? '胜利!' : (isDraw ? '平局!' : '失败!');
    const resultColor = isWin ? '#4ade80' : (isDraw ? '#c4a35a' : '#f87171');

    // 标题
    ctx.font = `bold ${Math.floor(24 * s)}px Georgia, serif`;
    ctx.fillStyle = resultColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(resultText, W / 2, py + 24 * s);

    // 最终比分
    ctx.font = `bold ${Math.floor(32 * s)}px sans-serif`;
    ctx.fillStyle = '#f5f0e6';
    ctx.fillText(`${playerScore} : ${botScore}`, W / 2, py + 70 * s);

    // 各轮得分明细
    ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('各轮得分', W / 2, py + 120 * s);

    let detailY = py + 144 * s;
    for (let i = 0; i < game.battleTotalRounds; i++) {
      const pScore = game.battlePlayerRoundScores[i] || 0;
      const bScore = game.battleBotRoundScores[i] || 0;
      ctx.font = `bold ${Math.floor(11 * s)}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`第${i + 1}轮: 我${pScore} - 对手${bScore}`, W / 2, detailY);
      detailY += 18 * s;
    }

    // 返回按钮
    const btnW = 140 * s;
    const btnH = 44 * s;
    const btnX = (W - btnW) / 2;
    const btnY = py + panelH - btnH - 24 * s;
    this._drawBattleBtn(ctx, '返回菜单', btnX, btnY, btnW, btnH, s, game._battleMenuBtnPressed || false, '#c4a35a');
    this.battleMenuBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  };
};
