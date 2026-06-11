const { Easing } = require('../animation');

class GameOverRenderer {
  constructor(renderer) {
    this.parent = renderer;
    this.animStartTime = null;
    this.lastGameOverReason = null;
  }

  draw(ctx, game, W, H, s) {
    const isClosing = game._closingGameOver;
    if (!isClosing && this.lastGameOverReason !== game.gameOverReason) {
      this.animStartTime = Date.now();
      this.lastGameOverReason = game.gameOverReason;
      // 上报：游戏结束（弹窗首次显示）
      if (typeof wx !== 'undefined' && wx.reportEvent) {
        wx.reportEvent("gameover", {
          "round": game.round,
          "current_coin": game.gold,
          "userid": game.userid || ''
        });
      }
    }

    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;
    const panel = this.parent._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeStartTime,
      width: 300, height: 310, enterOffset: 25, closeOffset: 40,
      overlayAlpha: 0.75,
      elapsed,
      onCloseComplete: () => {}
    });
    if (!panel) return;
    const { px, py, pw, ph, elapsed: panelElapsed, closeAlpha } = panel;
    const ca = closeAlpha;

    // 小女巫（趴在弹窗顶部，底部重叠 10px）
    if (this.parent.failWitchImg && this.parent.failWitchLoaded) {
      const witchW = 180 * s;
      const witchH = witchW * 0.97;
      const witchY = py + 25 * s - witchH;
      const witchX = W / 2 - witchW / 2;
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 8 * s;
      ctx.shadowOffsetY = 4 * s;
      ctx.drawImage(this.parent.failWitchImg, witchX, witchY, witchW, witchH);
      ctx.restore();

      // 失落竖线（小女巫右上角，4道紫色竖线，起始点交错）
      const lineBaseX = witchX + witchW - 41 * s;
      const lineBaseY = witchY + 27 * s;
      const lineData = [
        { offsetX: 0, top: 0, len: 18 },    // 第1道：顶部最高，最长
        { offsetX: 5, top: 2, len: 13 },      // 第2道：顶部稍低，次长
        { offsetX: 10, top: 5, len: 13 },     // 第3道：顶部更低，中等
        { offsetX: 15, top: 10, len: 9 },     // 第4道
      ];
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.fillStyle = '#6b5b95';
      lineData.forEach((d) => {
        const lx = lineBaseX + d.offsetX * s;
        const ly = lineBaseY + d.top * s;
        ctx.fillRect(lx, ly, 2 * s, d.len * s);
      });
      ctx.restore();

      // 小女巫左右点缀星星（Canvas 绘制，圆角）
      const drawStar = (cx, cy, outerR, innerR, color) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.8 * s;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      };
      ctx.save();
      ctx.globalAlpha = ca;
      // 右边三颗
      drawStar(witchX + witchW + 8 * s, witchY + 105 * s, 5.5 * s, 2.75 * s, '#6b5b95');  // 紫色大星
      drawStar(witchX + witchW + 20 * s, witchY + 128 * s, 4 * s, 2 * s, '#c4a35a');      // 金色中星
      drawStar(witchX + witchW + 2 * s, witchY + 145 * s, 2.5 * s, 1.25 * s, '#c4a35a');  // 金色小星
      // 左边两颗
      drawStar(witchX - 8 * s, witchY + 95 * s, 4 * s, 2 * s, '#6b5b95');                 // 紫色
      drawStar(witchX - 2 * s, witchY + 118 * s, 3 * s, 1.5 * s, '#c4a35a');              // 金色
      ctx.restore();
    }

    // 标题
    const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
    ctx.save();
    ctx.globalAlpha = titleAnim.alpha * ca;
    ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
    ctx.fillStyle = '#1a2f4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleText = '游戏结束';
    ctx.fillText(titleText, W / 2, py + 40 * s + titleAnim.yShift);
    ctx.restore();

    // 分隔线
    const line1Anim = Easing.fadeIn(elapsed, 140, 250, 6 * s);
    const line1Y = py + 62 * s + line1Anim.yShift;
    const line1W = pw - 60 * s;
    ctx.save();
    ctx.globalAlpha = line1Anim.alpha * ca;
    this.parent._drawTitleDivider(ctx, px + 30 * s, line1Y, line1W, s);
    ctx.restore();

    // 数据行
    const lineY = py + 92 * s;
    const lineH = 38 * s;

    const highScore = game.storageManager ? game.storageManager.getHighScore() : 0;
    const items = [
      { label: '到达回合', value: `${game.round}` },
      { label: '本局总分', value: `${game.totalScore}` },
      { label: '历史最高', value: `${highScore}` },
    ];

    items.forEach((item, i) => {
      const itemAnim = Easing.fadeIn(elapsed, 180 + i * 60, 250, 8 * s);
      const y = lineY + i * lineH + itemAnim.yShift;
      ctx.save();
      ctx.globalAlpha = itemAnim.alpha * ca;
      ctx.font = `${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, px + 35 * s, y);

      ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'right';
      ctx.fillText(item.value, px + pw - 35 * s, y);
      ctx.restore();
    });

    // 按钮基础位置（先定义，供提示文字引用）
    const btnH = 56 * s;
    const btnBaseY = py + ph - btnH - 12 * s;

    // 分隔线 + 提示文字（紧贴按钮上方）
    const hintAnim = Easing.fadeIn(elapsed, 400, 250, 6 * s);
    const hintTextY = btnBaseY - 23 * s + hintAnim.yShift;  // 提示文字在按钮上方 23px
    const hintLineY = hintTextY - 14 * s;                   // 分隔线在提示文字上方 14px
    ctx.save();
    ctx.globalAlpha = hintAnim.alpha * ca;
    ctx.strokeStyle = 'rgba(196,163,90,0.5)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(px + 30 * s, hintLineY);
    ctx.lineTo(px + pw - 30 * s, hintLineY);
    ctx.stroke();

    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('还差一点，再多收集几张词牌吧！', W / 2, hintTextY);
    ctx.restore();

    // 三个按钮横排：复活 | 重新开始 | 排行榜
    const btnAnim = Easing.fadeIn(elapsed, 480, 250, 10 * s);
    const btnGap = 5 * s;
    const sidePad = 8 * s;
    const btnW = (pw - sidePad * 2 - btnGap * 2) / 3;
    const btnY = btnBaseY + btnAnim.yShift;
    const btnStartX = px + sidePad;

    ctx.save();
    ctx.globalAlpha = btnAnim.alpha * ca;

    const drawImgBtn = (name, x, y, w, h, pressed) => {
      const data = this.parent.gameOverBtnImages[name];
      const offsetY = pressed ? 2 * s : 0;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2 + offsetY);
      if (data && data.loaded && data.img) {
        const img = data.img;
        const imgRatio = img.width / img.height;
        const btnRatio = w / h;
        let drawW, drawH;
        if (imgRatio > btnRatio) {
          drawW = w;
          drawH = w / imgRatio;
        } else {
          drawH = h;
          drawW = h * imgRatio;
        }
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
        // fallback：圆角矩形底色 + 文字
        const fallbackColor = name === 'relive_button' || name === 'relive_limit_button' ? '#5cb85c' : name === 'restart_button' ? '#c4a35a' : '#6a9fd4';
        this.parent.roundRect(-w / 2, -h / 2, w, h, 8 * s, fallbackColor);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = name === 'relive_button' || name === 'relive_limit_button' ? '复活' : name === 'restart_button' ? '重新开始' : '排行榜';
        ctx.fillText(label, 0, 0);
      }
      ctx.restore();
    };

    // 复活按钮（左）
    const reviveX = btnStartX;
    const canRevive = !game.storageManager || !game.storageManager.isDailyReviveUsed();
    const reviveBtnName = canRevive ? 'relive_button' : 'relive_limit_button';
    drawImgBtn(reviveBtnName, reviveX, btnY, btnW, btnH, game._reviveBtnPressed);

    // 重新开始按钮（中）
    const restartX = btnStartX + btnW + btnGap;
    drawImgBtn('restart_button', restartX, btnY, btnW, btnH, game._restartBtnPressed);

    // 排行榜按钮（右）
    const rankX = btnStartX + (btnW + btnGap) * 2;
    drawImgBtn('rank_button', rankX, btnY, btnW, btnH, game._rankBtnPressed);

    ctx.restore();

    // 存储点击区域（动画完成后固定位置）
    this.restartBtnRect = { x: restartX, y: btnBaseY, w: btnW, h: btnH };
    this.rankBtnRect = { x: rankX, y: btnBaseY, w: btnW, h: btnH };
    this.reviveBtnRect = { x: reviveX, y: btnBaseY, w: btnW, h: btnH };
  }

}

module.exports = { GameOverRenderer };
