const { Easing } = require('../animation');
const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { SHOP_POOL } = require('../shop');
const { formatMeaning } = require('../game');

module.exports = function extendPlaying(Renderer) {
    Renderer.prototype.drawPlaying = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
  
      // 计算手牌布局（≤9张用3列，≥10张用4列）
      const cols = game.hand.length <= 9 ? 3 : 4;
      const rows = Math.ceil(game.hand.length / cols);
      const totalW = cols * this.cardW + (cols - 1) * this.gap;
      const startX = (W - totalW) / 2;
  
      // === 从底部按钮倒推布局 ===
      // 顺序：道具栏 → 分数方块 → 单词预览区 → 卡牌区
      // 改卡牌底部和按钮的间距时，上方区域自动跟随
      const boxSize = 56 * s;
      const extraHeight = s < 1.0 ? Math.max(0, H - Math.floor(740 * s)) : 0;
      const topOffset = extraHeight * 0.05;
      const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
      const h = 70 * s;  // 与 drawHUD 中的 h 保持一致
      const hudBottom = top + 9 * s + h;
      const maxRows = 3;
      const cardGridH = maxRows * this.cardH + (maxRows - 1) * this.gap;
      const maskHalfH = 20 * s; // 预览蒙层半高（maskH = 40*s）
      const propBarH = 84 * s;
  
      const btnTop = H - 90 * s;
      // tall/narrow 且元素被缩小的屏幕（s<1）自适应：把多余高度分配给底部间距和道具栏下移
      const cardGap = 50 * s + extraHeight * 0.25 - 10;         // 卡牌底部到按钮间距
      const cardBottom = btnTop - cardGap + 3 * s;              // 卡牌底部
      const cardAreaY = cardBottom - cardGridH;                 // 卡牌顶部
      const wordAreaY = cardAreaY - 35 * s - maskHalfH + 2 * s + 2 * s + 3 * s; // 预览区中心
      this.wordAreaY = wordAreaY;
      const scoreAreaY = wordAreaY - maskHalfH - 20 * s - boxSize + 2 * s; // 分数方块顶部
      const propY = hudBottom + 6 * s;                         // 道具栏顶部（固定间距，跟随 HUD 整体下移）
  
      this.cardRects = []; // 存储卡牌点击区域
  
      const actualWitchSlots = game.maxJokerSlots || 4;
      // ===== 道具卡牌栏（支持动态女巫槽位，单卡宽度不变，通过调整 gap 实现重叠）=====
      // 栏目宽度固定，card_bar.png 宽度不可变
      const propW = W - 20 * s;
      const propX = (W - propW) / 2;
      const padX = 10 * s;
      const dividerW = 1.5 * s;
      const BASE_GAP = 6 * s;
      const slotTopPad = 6 * s;

      // 基准单卡宽度（固定按 4 张时的 propW 计算，避免宽度变化被卡牌尺寸吸收）
      const rawSlotW = (W - 20 * s - padX * 2 - 5 * BASE_GAP - dividerW) / 6;

      // 实际女巫槽位
      const actualTotalSlots = actualWitchSlots + 2;

      // 动态 gap：4 张时间距充足；5 张时保证最小 1px 间距，内容整体居中，允许左右溢出
      const rawGap = (propW - padX * 2 - dividerW - actualTotalSlots * rawSlotW) / (actualTotalSlots - 1);
      const minGap = actualWitchSlots >= 5 ? 0.6 * s : -Infinity;
      const actualGap = Math.max(rawGap, minGap);
      const slotW = rawSlotW;
      const slotH = propBarH - slotTopPad - 6 * s;

      const slotY = propY + slotTopPad;
      const leftGroupW = actualWitchSlots * slotW + (actualWitchSlots - 1) * actualGap;
      const rightGroupW = 2 * slotW + actualGap;
      const contentW = leftGroupW + rightGroupW + dividerW + actualGap;
      // 内容整体居中：超出栏目时左右自然溢出，但不影响 card_bar 宽度
      const baseLeftStartX = propX + (propW - contentW) / 2;
      const witchRightEdge = baseLeftStartX + leftGroupW;
      const dividerX = witchRightEdge + actualGap / 2 + dividerW / 2;
      const baseRightStartX = dividerX + dividerW / 2 + actualGap / 2;

      // 女巫牌左移、药水牌右移，分割线保持不动
      const witchShift = 1 * s;
      const potionShift = 1 * s;
      const leftStartX = baseLeftStartX - witchShift;
      const rightStartX = baseRightStartX + potionShift;
  
      // 道具栏阴影（右下偏移，营造立体感）
      this.roundRect(propX + 2 * s, propY + 2 * s, propW, propBarH, 10 * s, 'rgba(0,0,0,0.10)', null);
      // 道具栏背景（优先使用 card_bar.png，按宽度等比例缩放 + 放大 5%，未加载时 fallback 米白色）
      const cardBarData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['card_bar'];
      if (cardBarData && cardBarData.loaded && cardBarData.img) {
        const barAspect = (cardBarData.width > 0 && cardBarData.height > 0)
          ? cardBarData.width / cardBarData.height
          : propW / propBarH;
        const targetW = propW ;
        const imageScale = 1.05;
        const drawW = targetW * imageScale;
        const drawH = drawW / barAspect;
        const drawX = propX + (propW - drawW) / 2;
        const drawY = propY + (propBarH - drawH) / 2;
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
        this.roundRect(propX, propY, propW, propBarH, 10 * s, '#faf6ee', '#c4a35a');
      }
  
      // 竖分割线（金色实线 + 菱形，参考 HUD 分隔线）
      ctx.beginPath();
      ctx.moveTo(dividerX, slotY + 2 * s);
      ctx.lineTo(dividerX, slotY + slotH - 2 * s);
      ctx.strokeStyle = '#c4a35a';
      ctx.lineWidth = 0.8 * s;
      ctx.stroke();
      // 菱形装饰
      ctx.save();
      ctx.translate(dividerX, slotY + slotH / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
      ctx.restore();
  
      const jokers = game.jokers || [];
      const potions = game.potions || [];
      this.potionPropRects = [];
      this.witchPropRects = [];
  
      // 左区女巫牌
      for (let i = 0; i < actualWitchSlots; i++) {
        const sx = leftStartX + i * (slotW + actualGap);
        const joker = jokers[i];
        if (joker) {
          // 生命延续触发：跳跃2次（每次500ms）
          if (game._lifeExtensionAnim && game._lifeExtensionAnim.jokerIndex === i) {
            const elapsed = Date.now() - game._lifeExtensionAnim.startTime;
            const totalDuration = 1000; // 2次 × 500ms
            if (elapsed < totalDuration) {
              const cycle = 500;
              const cycleProgress = (elapsed % cycle) / cycle;
              joker._jumpOffsetY = Easing.jump(cycleProgress, 12 * s);
            } else {
              joker._jumpOffsetY = 0;
            }
          }
          this._drawPropCard(ctx, joker, sx, slotY, slotW, slotH, s, false);
          // 女巫牌紫色呼吸发光蒙层（圆形，覆盖在卡牌上方）
          ctx.save();
          const jCx = sx + slotW / 2;
          const jCy = slotY + slotH / 2;
          const jBreath = 0.88 + 0.12 * Math.sin(Date.now() / 500 + i * 0.7);
          const jRadius = Math.max(slotW, slotH) * 0.52 * jBreath;
          const jGrad = ctx.createRadialGradient(jCx, jCy, 0, jCx, jCy, jRadius);
          jGrad.addColorStop(0, `rgba(162, 89, 255, ${0.34 * jBreath})`);
          jGrad.addColorStop(0.55, `rgba(162, 89, 255, ${0.15 * jBreath})`);
          jGrad.addColorStop(1, 'rgba(162, 89, 255, 0)');
          ctx.fillStyle = jGrad;
          ctx.beginPath();
          ctx.arc(jCx, jCy, jRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // disable_one_witch_card 禁用动画：1000ms 边框光晕 + 锁图标 easeOutBack 弹出
          if (joker._disabled) {
            const elapsed = game._disableWitchAnim ? Date.now() - game._disableWitchAnim.startTime : Infinity;
            const isAnimating = game._disableWitchAnim && game._disableWitchAnim.jokerIndex === i && elapsed >= 0 && elapsed < 1000;
            if (isAnimating) {
              this._drawLashBorder(ctx, sx, slotY, slotW, slotH, 4 * s, s, elapsed / 1000, 1.0);
            }
            if (!isAnimating) {
              ctx.save();
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, 'rgba(60, 60, 60, 0.5)');
  
              // 锁图标 easeOutBack 弹出动画（边框结束后开始，持续400ms）
              const iconElapsed = game._disableWitchAnim && game._disableWitchAnim.jokerIndex === i
                ? Math.max(0, elapsed - 1000)
                : Infinity;
              const iconDuration = 400;
              const iconProgress = iconElapsed < iconDuration
                ? Easing.easeOutBack(Math.min(iconElapsed / iconDuration, 1))
                : 1;
              const iconSize = 20 * s * iconProgress;
              const iconX = sx + (slotW - iconSize) / 2;
              const iconY = slotY + (slotH - iconSize) / 2;
  
              if (this.cardDisableIconLoaded && this.cardDisableIcon) {
                ctx.drawImage(this.cardDisableIcon, iconX, iconY, iconSize, iconSize);
              } else {
                ctx.font = `bold ${Math.floor(iconSize)}px sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔒', sx + slotW / 2, slotY + slotH / 2);
              }
  
              ctx.restore();
            }
          }
  
          // 生命延续触发：紫色边框光晕闪烁
          if (game._lifeExtensionAnim && game._lifeExtensionAnim.jokerIndex === i) {
            const elapsed = Date.now() - game._lifeExtensionAnim.startTime;
            if (elapsed < 1000) {
              const breath = 0.5 + 0.5 * Math.sin(Date.now() / 250);
              ctx.save();
              ctx.shadowColor = `rgba(155,89,182,${0.3 + 0.4 * breath})`;
              ctx.shadowBlur = (6 + 10 * breath) * s;
              const lineW = (2 + 2 * breath) * s;
              const strokeColor = `rgba(155,89,182,${0.6 + 0.4 * breath})`;
              this.roundRect(sx, slotY, slotW, slotH, 4 * s, null, strokeColor, lineW);
              ctx.restore();
            }
          }
  
          // 自毁动画期间不响应点击
          if (!joker._destroying) {
            this.witchPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, jokerIndex: i });
          }
        } else {
          this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'witch');
        }
      }
  
      // 右区2格：药水牌
      this.changeLetterHintRect = null;
      for (let i = 0; i < 2; i++) {
        const sx = rightStartX + i * (slotW + actualGap);
        const potion = potions[i];
        if (potion) {
          this._drawPropCard(ctx, potion, sx, slotY, slotW, slotH, s);
          // 药水牌绿色呼吸发光蒙层（圆形，覆盖在卡牌上方）
          ctx.save();
          const pCx = sx + slotW / 2;
          const pCy = slotY + slotH / 2;
          const pBreath = 0.88 + 0.12 * Math.sin(Date.now() / 500 + i * 0.7);
          const pRadius = Math.max(slotW, slotH) * 0.52 * pBreath;
          const pGrad = ctx.createRadialGradient(pCx, pCy, 0, pCx, pCy, pRadius);
          pGrad.addColorStop(0, `rgba(80, 220, 120, ${0.34 * pBreath})`);
          pGrad.addColorStop(0.55, `rgba(80, 220, 120, ${0.15 * pBreath})`);
          pGrad.addColorStop(1, 'rgba(80, 220, 120, 0)');
          ctx.fillStyle = pGrad;
          ctx.beginPath();
          ctx.arc(pCx, pCy, pRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          this.potionPropRects.push({ x: sx, y: slotY, w: slotW, h: slotH, potionIndex: i });
        } else {
          this._drawEmptySlot(ctx, sx, slotY, slotW, slotH, s, 'potion');
        }
  
        // 字母置换提示按钮（未选中1张牌时，在对应药水卡牌下方弹出）
        if (game._changeLetterHint && game._changeLetterHint.potionIndex === i && potion && potion.effect === 'change_letter') {
          const hintBtnH = 16 * s;
          const hintBtnW = slotW + 5 * s;
          const hintBtnY = slotY + slotH + 2 * s;
          const hintElapsed = Date.now() - game._changeLetterHint.startTime;
          const hintProgress = Math.min(hintElapsed / 200, 1);
          const hintEase = Easing.easeOutBack(hintProgress);
          const hintScale = hintEase;
          const hintOffsetY = -(1 - hintEase) * 6 * s;
  
          const finalW = hintBtnW * hintScale;
          const finalH = hintBtnH * hintScale;
          const finalX = sx + (slotW - finalW) / 2;
          const finalY = hintBtnY + hintOffsetY + (hintBtnH - finalH) / 2;
  
          ctx.save();
          this.roundRect(finalX, finalY, finalW, finalH, 3 * s * Math.max(hintScale, 0.5), '#c0392b');
          ctx.font = `bold ${Math.floor(8 * s * Math.max(hintScale, 0.5))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('选择一张字母牌', sx + slotW / 2, finalY + finalH / 2);
          ctx.restore();
  
          this.changeLetterHintRect = { x: sx, y: hintBtnY, w: hintBtnW, h: hintBtnH, potionIndex: i };
        }
      }
  
      // 单词预览区白色蒙层（常驻，固定6个字母宽度）
      const maskW = 180 * s;
      const maskH = 40 * s;
      const maskX = W / 2 - maskW / 2;
      const maskY = wordAreaY - maskH / 2;
      // 单词预览区：渐变背景增强立体感
      const maskGrad = ctx.createLinearGradient(0, maskY, 0, maskY + maskH);
      maskGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
      maskGrad.addColorStop(1, 'rgba(240,235,224,0.35)');
      this.roundRect(maskX, maskY, maskW, maskH, 10 * s, maskGrad, 'rgba(196,163,90,0.5)', 1 * s);

      // 提示按钮（预览区左侧）
      const hasSeedCards = game.hand.some(c => c && c._seedWord);
      if (hasSeedCards) {
        // === help 按钮空闲上下跳跃动画（25秒未出牌触发，持续2秒） ===
        let helpJumpY = 0;
        if (game._lastPlayTime && Date.now() - game._lastPlayTime > 25000) {
          if (!game._helpIdleAnim) {
            game._helpIdleAnim = { startTime: Date.now() };
          }
          game._lastPlayTime = Date.now(); // 重置25秒定时器
        }
        if (game._helpIdleAnim) {
          const animElapsed = Date.now() - game._helpIdleAnim.startTime;
          const animDuration = 2000;
          if (animElapsed < animDuration) {
            const jumpCycle = 400;
            const jumpProgress = (animElapsed % jumpCycle) / jumpCycle;
            helpJumpY = Easing.jump(jumpProgress, 3 * s);
          } else {
            game._helpIdleAnim = null;
          }
        }

        const hintBtnSize = 30 * s;
        const hintBtnX = maskX - hintBtnSize - 8 * s - 1;
        const hintBtnY = wordAreaY - hintBtnSize / 2;
        ctx.save();
        // 底部轻微阴影增强立体感
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 5 * s;
        ctx.shadowOffsetY = 2 * s;
        if (helpJumpY !== 0) {
          ctx.translate(0, helpJumpY);
        }
        if (this.helpIconLoaded && this.helpIcon) {
          // 保持 help.png 原始宽高比绘制
          const img = this.helpIcon;
          const imgW = img.width || hintBtnSize;
          const imgH = img.height || hintBtnSize;
          const aspect = imgW / imgH;
          let drawW, drawH;
          if (aspect >= 1) {
            drawW = hintBtnSize;
            drawH = hintBtnSize / aspect;
          } else {
            drawH = hintBtnSize;
            drawW = hintBtnSize * aspect;
          }
          const drawX = hintBtnX + (hintBtnSize - drawW) / 2;
          const drawY = hintBtnY + (hintBtnSize - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } else {
          // fallback：圆形 ? 按钮
          ctx.beginPath();
          ctx.arc(hintBtnX + hintBtnSize / 2, hintBtnY + hintBtnSize / 2, hintBtnSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(196,163,90,0.8)';
          ctx.lineWidth = 1.5 * s;
          ctx.stroke();
          ctx.fillStyle = '#c4a35a';
          ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', hintBtnX + hintBtnSize / 2, hintBtnY + hintBtnSize / 2);
        }
        ctx.restore();
        this.hintBtnRect = { x: hintBtnX, y: hintBtnY, w: hintBtnSize, h: hintBtnSize };
      } else {
        this.hintBtnRect = null;
      }
  
      // 预览区域（在卡牌上方）
      const selected = game.getSelectedCards();
      let valid = false;
      let invalid = false;
      let baseScore = 0;
      let showFirstBox = false;
      let showSecondBox = false;
      let pendingBaseScore = 0;
      let pendingLength = 0;
      let meaningText = null;
  
      // 方块区域变量（提前定义，pendingCheck 动画需要）
      const centerX = W / 2;
      const boxY = scoreAreaY + 3 * s;
      const leftBoxX = centerX - boxSize - 10 * s - 5 * s;
      const rightBoxX = centerX + 10 * s + 5 * s;
  
      // 存储第一个方块点击区域（调试用）
      this.firstBoxRect = { x: leftBoxX, y: boxY, w: boxSize, h: boxSize };
  
      // === 预览区流光边框（有无输入都有动效，线宽不同） ===
      const hasInput = selected.length > 0;
      const flowLineWidth = hasInput ? 2.2 * s : 2.0 * s;
      const t = (Date.now() % 3000) / 3000; // 0~1，3秒一周期
      const isValidWord = game.pendingCheck && game.pendingCheck.state === 'valid';
      const flowColor = isValidWord ? '45,125,50' : '240,195,20';
      const grad = ctx.createLinearGradient(
        maskX - maskW * 0.2 + maskW * t * 1.4, maskY,
        maskX + maskW * 0.2 + maskW * t * 1.4, maskY + maskH
      );
      grad.addColorStop(0, `rgba(${flowColor},0)`);
      grad.addColorStop(0.5, `rgba(${flowColor},0.8)`);
      grad.addColorStop(1, `rgba(${flowColor},0)`);
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = flowLineWidth;
      this._roundedRectPath(ctx, maskX, maskY, maskW, maskH, 10 * s);
      ctx.stroke();
      ctx.restore();

      // === pendingCheck 状态优先 ===
      let pc = null;
      if (game.pendingCheck) {
        pc = game.pendingCheck;
        const word = pc.word;
  
        if (pc.state === 'checking') {
          // 检测中：橙色单词 + loading图标 + 动态点号
          ctx.save();
          ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#c4a35a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          // 动态点号 ....（加粗变大）
          const dotCount = (Math.floor(Date.now() / 400) % 4) + 1;
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#c4a35a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('.'.repeat(dotCount), W / 2, wordAreaY + 24 * s + 3 * s);
  
        } else if (pc.state === 'valid') {
          // === 公共部分：深绿色单词（支持波浪）和释义 ===
          const phase = pc.animPhase || 0;
          const elapsed = Date.now() - (pc.resolveTime || 0);
  
          ctx.save();
          ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#2d7d32';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
  
          const letters = word.split('');
          let totalLetterW = 0;
          const letterWidths = letters.map(l => {
            const lw = ctx.measureText(l).width;
            totalLetterW += lw;
            return lw;
          });
          const startLX = W / 2 - totalLetterW / 2;
          let curX = startLX;
          letters.forEach((letter, i) => {
            const lw = letterWidths[i];
            const waveY = (pc._waveOffsetYs && pc._waveOffsetYs[i]) || 0;
            ctx.fillText(letter, curX + lw / 2, wordAreaY + waveY);
            curX += lw;
          });
          ctx.restore();
  
          if (pc.meaning) {
            const mText = formatMeaning(pc.meaning);
            ctx.font = `${Math.floor(11 * s)}px sans-serif`;
            ctx.fillStyle = '#777';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mText, W / 2, wordAreaY + 33 * s);
          }
  
          // === 阶段0: 烟花（始终触发）===
          if (phase === 0 && !pc._sparklesSpawned) {
            pc._sparklesSpawned = true;
            this._spawnSparkles(W / 2 - 60 * s, wordAreaY, 12);
            this._spawnSparkles(W / 2 + 60 * s, wordAreaY, 12);
          }
  
          // === 阶段0→1 过渡（无字母之神时自动推进）===
          if (phase === 0 && !game._letterGodAnim) {
            if (!pc._phase0StartTime) pc._phase0StartTime = Date.now();
            if (Date.now() - pc._phase0StartTime >= 1000) {
              pc.animPhase = 1;
            }
          }
  
          if (game._letterGodAnim) {
            // 字母之神动画期间：跳过计分方块、倍率、总分飞行
            valid = true;
            pendingBaseScore = 0;
            pendingLength = (pc.cardsInOrder || []).length;
            showFirstBox = false;
            showSecondBox = false;
          } else {
            // === 正常计分动画（事件驱动）===
            const letterInterval = 350;
            const letterJumpStart = 1000;
            const cardsInOrder = pc.cardsInOrder || [];
            let accumulatedScore = 0;
            let isAllJumped = false;
  
            // === 阶段1: 字母跳跃 ===
            // 每张 per_card 对应一次独立的字母跳跃步骤；无 per_card 的字母基础跳一次
            if (phase >= 1) {
              const jumpElapsed = elapsed - letterJumpStart;
              const steps = pc.perCardSteps || [];
              const stepIdx = Math.floor(jumpElapsed / letterInterval);
              // 每张字母牌开始跳跃时播放音效（触发女巫牌用 answer_tone，否则用 card_jump）
              if (jumpElapsed >= 0 && stepIdx >= 0 && stepIdx < steps.length) {
                if (pc._lastJumpStepIdx !== stepIdx) {
                  pc._lastJumpStepIdx = stepIdx;
                  const stepInfo = steps[stepIdx];
                  const jumpSound = (stepInfo && stepInfo.jokerIdx !== null) ? 'answer_tone' : 'card_jump';
                  if (game.audioManager) game.audioManager.play(jumpSound);
                }
              } else {
                pc._lastJumpStepIdx = -1;
              }
              isAllJumped = stepIdx >= steps.length;
              const stepInfo = isAllJumped ? null : steps[stepIdx];
              const cardIdx = isAllJumped
                ? cardsInOrder.length - 1
                : (stepInfo ? stepInfo.cardIdx : -1);
              const jokers = game.jokers || [];
  
              // per_card 倍率/加分提示 — 当前步骤对应的 per_card
              pc._perCardMultText = null;
              if (!isAllJumped && cardIdx >= 0 && stepInfo && stepInfo.jokerIdx !== null) {
                const activeJoker = jokers[stepInfo.jokerIdx];
                if (activeJoker && activeJoker.value) {
                  if (activeJoker.operation === 'add') {
                    pc._perCardMultText = `+${activeJoker.value}`;
                  } else {
                    pc._perCardMultText = `x${activeJoker.value}`;
                  }
                }
              }
  
              // 计算累加分数（按字母索引累计，同字母多步骤不重复加分）
              for (let i = 0; i <= cardIdx && i < cardsInOrder.length; i++) {
                let score = cardsInOrder[i].score;
                const triggered = pc.jokerTriggers?.[i] || [];
                triggered.forEach(jIdx => {
                  const joker = jokers[jIdx];
                  if (joker && joker.value) {
                    if (joker.operation === 'add') {
                      score += joker.value;
                    } else {
                      score *= joker.value;
                    }
                  }
                });
                accumulatedScore += score;
              }
              // 装备卡牌：德莱薇尔 - 最后一个字母分数算两次
              if (pc.result && pc.result._lastLetterDouble > 0) {
                if (stepInfo && stepInfo.isDouble) {
                  accumulatedScore += pc.result._lastLetterDouble;
                } else if (isAllJumped) {
                  accumulatedScore += pc.result._lastLetterDouble;
                }
              }
  
              // 清除女巫牌状态
              jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });
  
              // 波浪跳跃
              const totalJumpTime = steps.length * letterInterval;
              const waveStartDelay = 90;
              const waveInterval2 = 70;
              if (jumpElapsed >= totalJumpTime) {
                const waveElapsed = jumpElapsed - totalJumpTime;
                if (!pc._waveOffsetYs) pc._waveOffsetYs = [];
                cardsInOrder.forEach((_, i) => {
                  const waveProgress = (waveElapsed - waveStartDelay - i * waveInterval2) / 180;
                  if (waveProgress >= 0 && waveProgress <= 1) {
                    const waveH = 5 * s * Math.sin(waveProgress * Math.PI);
                    pc._waveOffsetYs[i] = -waveH;
                  } else {
                    pc._waveOffsetYs[i] = 0;
                  }
                });
              }
  
              // 卡牌跳跃偏移
              cardsInOrder.forEach((card, i) => {
                if (isAllJumped) {
                  card.jumpOffsetY = 0;
                } else if (i === cardIdx && jumpElapsed >= 0) {
                  const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                  card.jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                  // 当前步骤对应的 per_card 女巫牌同步跳跃
                  if (stepInfo && stepInfo.jokerIdx !== null) {
                    const activeJoker = jokers[stepInfo.jokerIdx];
                    if (activeJoker) {
                      activeJoker._triggered = true;
                      activeJoker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                    }
                  }
                } else if (i < cardIdx) {
                  card.jumpOffsetY = 0;
                }
              });
  
              // flat_bonus 女巫牌
              const globalTriggered = pc.globalTriggered || [];
              globalTriggered.forEach(jIdx => {
                const joker = jokers[jIdx];
                if (joker) {
                  joker._triggered = true;
                  if (!isAllJumped && cardIdx >= 0) {
                    const jumpProgress = ((jumpElapsed % letterInterval) / 200);
                    joker._jumpOffsetY = Easing.jump(jumpProgress, 12 * s);
                  }
                }
              });
  
              // 清除女巫牌状态
              if (isAllJumped) {
                jokers.forEach(j => { if (j) { j._jumpOffsetY = 0; j._triggered = false; } });
              }
  
              // 检测阶段1完成 → 进入阶段2
              if (isAllJumped && phase < 2) {
                const totalJumpTime = steps.length * letterInterval;
                const waveDuration = 180 + cardsInOrder.length * 90;
                const waveElapsed = jumpElapsed - totalJumpTime;
                if (waveElapsed >= waveDuration + 100) {
                  pc.animPhase = 2;
                }
              }
            }
  
            // === 阶段2: 基础倍率弹出 + whole_word 依次触发 ===
            showSecondBox = phase >= 2;
  
            if (phase >= 2) {
              const wjList = pc.wholeWordJokers || [];
              const STEP_DURATION = 350; // 每一步固定 350ms
  
              // 阶段2时间基准
              if (!pc._phase2StartTime) pc._phase2StartTime = Date.now();
              const elapsedSincePhase2 = Date.now() - pc._phase2StartTime;
              const baseMultDelay = 500;
  
              // 计算当前步（事件驱动）
              let afterBase = 0;
              let currentStep = -1;
              if (elapsedSincePhase2 >= baseMultDelay) {
                afterBase = elapsedSincePhase2 - baseMultDelay;
                currentStep = Math.floor(afterBase / STEP_DURATION);
              }
  
              // 固定 400ms 一步，触发 whole_word 女巫牌（跳跃+标签+倍率同时发生）
              wjList.forEach(({ idx }, i) => {
                const joker = game.jokers?.[idx];
                if (!joker) return;
                // currentStep = 0: 基础倍率弹出；currentStep = 1~N: whole_word 依次触发
                if (currentStep === i + 1 && !joker._wwJumpStart && !joker._wwJumpDone) {
                  joker._wwJumpStart = Date.now();
                  joker._triggered = true;
                }
              });
  
              // 处理跳跃动画（保持原 400ms 时长，在 500ms 步内完成）
              wjList.forEach(({ idx }) => {
                const joker = game.jokers?.[idx];
                if (!joker) return;
                if (joker._wwJumpStart) {
                  const jumpElapsed = Date.now() - joker._wwJumpStart;
                  const jumpDuration = 400;
                  const jumpProgress = Math.min(jumpElapsed / jumpDuration, 1);
                  const jumpH = 12 * s * Math.sin(jumpProgress * Math.PI);
                  joker._jumpOffsetY = -Math.max(0, jumpH);
                  if (jumpProgress >= 1) {
                    joker._wwJumpStart = null;
                    joker._wwJumpDone = true;
                    joker._jumpOffsetY = 0;
                    joker._triggered = false;
                  }
                }
              });
  
              // 检测阶段2完成 → 进入阶段3（或 letter_a_mult_half 惩罚动画）
              if (phase < 3) {
                // totalSteps = 1(基础倍率) + N(whole_word) + 1(强制等待 300ms)
                const totalSteps = 1 + wjList.length;
                const postWait = 200; // 全部完成后强制等待 200ms
                const readyTime = totalSteps * STEP_DURATION + postWait;
  
                // letter_a_mult_half 惩罚动画：提前 100ms 开始，总时长 700ms，结束延迟 100ms
                const PENALTY_START_OFFSET = -100; // 提前 100ms
                const PENALTY_DURATION = 700;      // 动画总时长 700ms
                const POST_PENALTY_WAIT = 300;     // 惩罚后等待 300ms
  
                if (afterBase >= readyTime + PENALTY_START_OFFSET) {
                  if (pc.multHalfResult?.triggered && !pc._multHalfAnimDone) {
                    const penaltyElapsed = afterBase - (readyTime + PENALTY_START_OFFSET);
  
                    // 惩罚动画：紫色光晕 + 女巫星星 + angry_tip（在 PENALTY_DURATION 内触发一次）
                    if (penaltyElapsed >= 0 && penaltyElapsed < PENALTY_DURATION) {
                      if (!pc._multHalfPulseTriggered) {
                        pc._multHalfPulseTriggered = true;
                        this.multAnim = { startTime: Date.now(), duration: 600 };
                        this.lastMultValue = pc.multHalfResult.halvedMult;
                      }
                      if (!pc._multHalfStarTriggered) {
                        pc._multHalfStarTriggered = true;
                        if (this.hudWitchAvatarRect) {
                          game._witchStarBurst = {
                            startTime: Date.now(),
                            cx: this.hudWitchAvatarRect.x + this.hudWitchAvatarRect.w / 2,
                            cy: this.hudWitchAvatarRect.y + this.hudWitchAvatarRect.h / 2,
                          };
                        }
                        if (pc.multHalfResult?.angryTip) {
                          game._witchAngryTip = { text: pc.multHalfResult.angryTip, expireAt: Date.now() + 3000 };
                        }
                      }
                    }
  
                    if (penaltyElapsed >= PENALTY_DURATION + POST_PENALTY_WAIT) {
                      pc._multHalfAnimDone = true;
                      pc.animPhase = 3;
                    }
                  } else {
                    pc.animPhase = 3;
                  }
                }
              }
            }
  
            // === 阶段3: 总分飞行 ===
            if (phase >= 3 && !pc._flyingScoreStarted) {
              pc._flyingScoreStarted = true;
              const totalScore = pc.multHalfResult?.halvedScore ?? pc.result.score;
              this._startFlyingScore(totalScore, maskX + maskW + 10 * s, wordAreaY, game);
            }
  
            // 检测全部动画完成，调用 game.completePlayHand()
            if (phase >= 3 && pc._flyingScoreStarted && !this.flyingScore && !game._playHandAnimCompleted) {
              game._playHandAnimCompleted = true;
              if (game.completePlayHand) game.completePlayHand();
            }
  
            // 渲染方块数字
            valid = true;
            pendingBaseScore = accumulatedScore;
            pendingLength = cardsInOrder.length;
            showFirstBox = phase >= 1;
          }
  
        } else if (pc.state === 'invalid') {
          // 非法：橙色单词 + error图标 + 单词不存在
          invalid = true;
          ctx.save();
          ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#f1c40f';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          const errText = '单词不存在';
          ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
          ctx.fillStyle = '#c0392b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const errTextWidth = ctx.measureText(errText).width;
          const errIconSize = 18 * s;
          const errTotalWidth = errIconSize + 4 * s + errTextWidth;
          const errBaseX = W / 2 - errTotalWidth / 2;
          const errY = wordAreaY + 22 * s + 3 * s + 5 * s + 2 * s;
          // 画 error 图标
          if (this.errorIcon && this.errorIconLoaded) {
            ctx.drawImage(this.errorIcon, errBaseX, errY - errIconSize / 2, errIconSize, errIconSize);
          }
          // 画文字
          ctx.fillText(errText, errBaseX + errIconSize + 4 * s + errTextWidth / 2, errY);
        } else if (pc.state === 'witch_failed') {
          // 女巫约束失败：橙色单词 + 紫色提示
          invalid = true;
  
          ctx.save();
          ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
          ctx.fillStyle = '#f1c40f';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(word, W / 2, wordAreaY);
          ctx.restore();
  
          const failText = pc.witchFailText || '女巫约束未满足';
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          const failTextWidth = ctx.measureText(failText).width;
          const hatSize = 14 * s;
          const totalW = hatSize + 4 * s + failTextWidth;
          const baseX = W / 2 - totalW / 2;
          const baseY = wordAreaY + 32 * s;
  
          // 出现动画（easeOutBack：从单词预览区下方弹出）
          let appearScale = 1;
          let appearOffsetY = 0;
          if (pc._witchFailAnimStart) {
            const ae = Date.now() - pc._witchFailAnimStart;
            const ap = Math.min(ae / 300, 1);
            const ease = Easing.easeOutBack(ap);
            appearScale = ease;
            appearOffsetY = -(1 - ease) * 10 * s;
          }
  
          ctx.save();
          ctx.translate(baseX + totalW / 2, baseY);
          ctx.scale(appearScale, appearScale);
          ctx.translate(-(baseX + totalW / 2), -baseY);
          ctx.translate(0, appearOffsetY);
  
          // 女巫帽子图标
          if (this.witchHatIcon && this.witchHatIconLoaded) {
            ctx.drawImage(this.witchHatIcon, baseX, baseY - hatSize / 2, hatSize, hatSize);
          }
  
          // 文字
          ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
          ctx.fillStyle = '#9b59b6';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(failText, baseX + hatSize + 4 * s, baseY);
          ctx.restore();
        }
  
      } else if (selected.length >= 1) {
        // 普通预览：只显示单词（橙色），不检测
        const word = selected.map(c => c.letter.toLowerCase()).join('');
        ctx.save();
        ctx.font = `bold ${Math.floor(28 * s)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, W / 2, wordAreaY);
        ctx.restore();
      } else {
        // 未选择任何字母牌：显示提示文字
        ctx.save();
        ctx.font = `${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = 'rgba(90,74,42,0.55)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('选择字母牌组成单词', W / 2, wordAreaY);
        ctx.restore();
      }
  
      // 分数预览（两个方块）—— 始终显示背景图
      const scoreColor = valid ? '#3498db' : (invalid ? '#e74c3c' : '#888');
      const multColor = valid ? '#2ecc71' : (invalid ? '#e74c3c' : '#888');
  
      // 计分方块两侧装饰线（score_line.png）
      if (this.scoreLineImg && this.scoreLineLoaded) {
        const lineImgW = this.scoreLineImg.width || 20;
        const lineImgH = this.scoreLineImg.height || 80;
        const lineAspect = lineImgW / lineImgH;
        const lineH = boxSize * 0.4;
        const lineW = lineH * lineAspect;
        const lineGap = 4 * s;
        const lineY = boxY + (boxSize - lineH) / 2;
  
        // 左侧：第一个方块左边
        ctx.drawImage(this.scoreLineImg, leftBoxX - lineW - lineGap, lineY, lineW, lineH);
  
        // 右侧：第二个方块右边（水平镜像）
        ctx.save();
        ctx.translate(rightBoxX + boxSize + lineGap + lineW, lineY);
        ctx.scale(-1, 1);
        ctx.drawImage(this.scoreLineImg, 0, 0, lineW, lineH);
        ctx.restore();
      }
  
      // 左：字母分（背景图）
      const letterScoreImg = this.scoreBoxImages['letter_score'];
      if (letterScoreImg && letterScoreImg.loaded && letterScoreImg.img) {
        ctx.drawImage(letterScoreImg.img, leftBoxX, boxY, boxSize, boxSize);
      } else {
        this.roundRect(leftBoxX, boxY, boxSize, boxSize, 4 * s, null, scoreColor);
      }
      if (valid && showFirstBox) {
        const targetScore = pendingBaseScore;
        // 检查是否需要滚动动画
        if (this.lastBoxScore !== targetScore) {
          this.scoreRoll = {
            from: this.lastBoxScore,
            to: targetScore,
            startTime: Date.now(),
            duration: 300,
          };
          this.lastBoxScore = targetScore;
        }
        // 绘制滚动数字或静止数字
        if (this.scoreRoll) {
          const rollElapsed = Date.now() - this.scoreRoll.startTime;
          const rollProgress = Math.min(rollElapsed / this.scoreRoll.duration, 1);
          const ease = rollProgress * (2 - rollProgress); // easeOutQuad
          const cx = leftBoxX + boxSize / 2;
          const cy = boxY + boxSize / 2;
          const offset = boxSize * 0.5;
  
          // 旧数字向上淡出
          ctx.save();
          ctx.globalAlpha = 1 - ease;
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#f5f0e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(this.scoreRoll.from), cx, cy - ease * offset);
          ctx.restore();
  
          // 新数字从下方进入
          ctx.save();
          ctx.globalAlpha = ease;
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#f5f0e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(this.scoreRoll.to), cx, cy + (1 - ease) * offset);
          ctx.restore();
  
          if (rollProgress >= 1) {
            this.scoreRoll = null;
          }
        } else {
          this.text(String(targetScore), leftBoxX + boxSize / 2, boxY + boxSize / 2, 20, '#f5f0e8');
        }
        // 左方块标签（方案B光晕呼吸风格）
        if (pc._perCardMultText) {
          if (this.lastLeftLabelText !== pc._perCardMultText) {
            this.lastLeftLabelText = pc._perCardMultText;
            this.leftLabelTagAnim = { startTime: Date.now(), duration: 350 };
          }
          const tagPulse = this._calcPulseScale(this.leftLabelTagAnim, 0.03);
          const tagScale = tagPulse.scale;
          if (tagPulse.progress >= 1) this.leftLabelTagAnim = null;
  
          const tagCX = leftBoxX + boxSize / 2;
          const tagCY = boxY - 14 * s;
          const elapsed = Date.now() - (this.leftLabelTagAnim ? this.leftLabelTagAnim.startTime : Date.now() - 350);
  
          this._drawFancyLabel(ctx, tagCX, tagCY, s, pc._perCardMultText, tagScale, elapsed);
        } else {
          this.lastLeftLabelText = null;
        }
      } else if (!game.pendingCheck) {
        // 没有 pendingCheck 时重置
        this.lastBoxScore = 0;
        this.scoreRoll = null;
        this.lastMultValue = null;
        this.multAnim = null;
      }
  
      // 中：乘号（金棕色，加粗变大）
      ctx.save();
      ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
      ctx.fillStyle = '#b87333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', centerX, boxY + boxSize / 2);
      ctx.restore();
  
      // letter_a_mult_half 惩罚动画：妖雾弥散边框（提前 100ms 开始，总时长 700ms）
      if (valid && showSecondBox && pc.multHalfResult?.triggered) {
        const phase2Elapsed = Date.now() - (pc._phase2StartTime || Date.now());
        const baseMultDelay = 500;
        const STEP_DURATION = 350;
        const totalSteps = 1 + (pc.wholeWordJokers || []).length;
        const postWait = 200;
        const readyTime = totalSteps * STEP_DURATION + postWait;
        const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
        const penaltyElapsed = afterBase - (readyTime - 100); // 提前 100ms
  
        if (penaltyElapsed >= 0 && penaltyElapsed < 700) {
          this._drawLashBorder(ctx, rightBoxX, boxY, boxSize, boxSize, 4 * s, s, penaltyElapsed / 1000);
        }
      }
  
      // 右：长度倍率（背景图）
      const lengthImg = this.scoreBoxImages['length'];
      if (lengthImg && lengthImg.loaded && lengthImg.img) {
        ctx.drawImage(lengthImg.img, rightBoxX, boxY, boxSize, boxSize);
      } else {
        this.roundRect(rightBoxX, boxY, boxSize, boxSize, 4 * s, null, multColor);
      }
      if (valid && showSecondBox) {
        // 基础倍率 + whole_word 依次触发（固定 400ms 一步，跳跃+标签+倍率同时发生）
        let displayValue = null;
        let labelText = null;
        const wjList = pc.wholeWordJokers || [];
  
        // 计算 phase 2 已进行的时间
        const phase2Elapsed = Date.now() - (pc._phase2StartTime || Date.now());
  
        const baseMultDelay = 500;
        const STEP_DURATION = 350;
  
        // 计算当前步
        let currentStep = -1;
        if (phase2Elapsed >= baseMultDelay) {
          const afterBase = phase2Elapsed - baseMultDelay;
          currentStep = Math.floor(afterBase / STEP_DURATION);
        }
  
        // 计算当前倍率：currentStep = 0 为基础倍率弹出；currentStep >= 1 依次加 whole_word
        let curMult = pendingLength;
        for (let i = 0; i < Math.min(Math.max(0, currentStep), wjList.length); i++) {
          const item = wjList[i];
          const joker = item.joker;
          if (item.isPenalty) {
            curMult += joker.penalty;
          } else if (joker.trigger === 'illegal_boost' || joker.trigger === 'last_chance' || joker.operation === 'multi_adds_value' || joker.operation === 'multi_accumulation') {
            curMult += joker.value;
          } else {
            curMult = Math.ceil(curMult * joker.value);
          }
        }
        displayValue = curMult;
  
        // 标签：currentStep = 1 时显示第1张的 xValue / +Value
        const labelIdx = currentStep - 1;
        if (labelIdx >= 0 && labelIdx < wjList.length) {
          const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
          const stepProgress = (afterBase % STEP_DURATION) / STEP_DURATION;
          if (stepProgress < 1.0) {
            const item = wjList[labelIdx];
            const joker = item.joker;
            if (item.isPenalty) {
              labelText = `${joker.penalty}`;
            } else if (joker.trigger === 'illegal_boost' || joker.trigger === 'last_chance' || joker.operation === 'multi_adds_value' || joker.operation === 'multi_accumulation') {
              labelText = `+${joker.value}`;
            } else {
              labelText = `x${joker.value}`;
            }
          }
        }
  
        // 数字变化时触发一次脉冲（类似金币动画），首次出现也播放
        const isFirstMultShow = this.lastMultValue === null && displayValue !== null;
        if (isFirstMultShow || this.lastMultValue !== displayValue) {
          this.lastMultValue = displayValue;
          this.multAnim = { startTime: Date.now(), duration: 400 };
          // currentStep >= 1 表示触发了 whole_word 女巫牌，用 answer_tone；否则（首次基础倍率）用 card_jump
          const multSound = currentStep >= 1 ? 'answer_tone' : 'card_jump';
          if (game && game.audioManager) game.audioManager.play(multSound);
        }
  
        // letter_a_mult_half 惩罚动画：进入惩罚阶段后数字减半（提前 100ms）
        if (pc.multHalfResult?.triggered) {
          const totalSteps = 1 + wjList.length;
          const postWait = 200;
          const readyTime = totalSteps * STEP_DURATION + postWait;
          const afterBase = Math.max(0, phase2Elapsed - baseMultDelay);
          const penaltyElapsed = afterBase - (readyTime - 100); // 提前 100ms
          if (penaltyElapsed >= 0) {
            displayValue = pc.multHalfResult.halvedMult;
          }
        }
  
        // 绘制数字（带一次变大缩小脉冲）
        const multPulse = this._calcPulseScale(this.multAnim, 0.28);
        let pulseScale = multPulse.scale;
        if (multPulse.progress >= 1) this.multAnim = null;
  
        if (displayValue !== null) {
          ctx.save();
          ctx.translate(rightBoxX + boxSize / 2, boxY + boxSize / 2);
          ctx.scale(pulseScale, pulseScale);
          ctx.font = `bold ${Math.floor(20 * s)}px sans-serif`;
          ctx.fillStyle = '#f5f0e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // 有小数时保留1位，整数时正常显示（总分飞行仍用四舍五入的整数）
          const displayText = Number.isInteger(displayValue) ? String(Math.round(displayValue)) : displayValue.toFixed(1);
          ctx.fillText(displayText, 0, 0);
          ctx.restore();
        }
  
        // 绘制 "xN" 标签（右方块上方，方案B粒子环流风格）
        if (labelText) {
          // 标签首次出现时触发弹出动画（350ms）
          if (this.lastLabelText !== labelText) {
            this.lastLabelText = labelText;
            this.labelTagAnim = { startTime: Date.now(), duration: 350 };
          }
  
          const tagPulse = this._calcPulseScale(this.labelTagAnim, 0.03);
          const tagScale = tagPulse.scale;
          if (tagPulse.progress >= 1) this.labelTagAnim = null;
  
          const tagCX = rightBoxX + boxSize / 2;
          const tagCY = boxY - 14 * s;
          const elapsed = Date.now() - (this.labelTagAnim ? this.labelTagAnim.startTime : Date.now() - 350);
  
          this._drawFancyLabel(ctx, tagCX, tagCY, s, labelText, tagScale, elapsed);
        } else {
          this.lastLabelText = null;
        }
      }
  
      // 绘制卡牌（跳过 null 占位符，其他牌位置完全不动）
      game.hand.forEach((card, i) => {
        if (!card) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        // 最后一行不满时，该行单独居中
        const cardsInRow = (row === rows - 1 && game.hand.length % cols !== 0)
          ? game.hand.length % cols
          : cols;
        const rowTotalW = cardsInRow * this.cardW + (cardsInRow - 1) * this.gap;
        const rowStartX = (W - rowTotalW) / 2;
        const x = rowStartX + col * (this.cardW + this.gap);
        const y = cardAreaY + row * (this.cardH + this.gap);
        // 字母之神动画期间，未击中的卡牌显示旧分数
        let displayScore = null;
        if (game._letterGodAnim && card._originalScore !== undefined && !game._letterGodAnim.hitCardIds?.[card.id]) {
          displayScore = card._originalScore;
        }
        this.drawCard(card, x, y, card.newCard, displayScore);
        this.cardRects.push({ x, y, w: this.cardW, h: this.cardH, cardId: card.id });
  
        // 清除 newCard 标记（下一帧不再显示 NEW）
        card.newCard = false;
      });
  
      // 绘制正在飞出的旧牌（基于原始索引位置 + animOffset）
      for (const card of game.flyingCards) {
        if (card._flyIndex !== undefined) {
          const fCol = card._flyIndex % cols;
          const fRow = Math.floor(card._flyIndex / cols);
          const fCardsInRow = (fRow === rows - 1 && game.hand.length % cols !== 0)
            ? game.hand.length % cols
            : cols;
          const fRowTotalW = fCardsInRow * this.cardW + (fCardsInRow - 1) * this.gap;
          const fRowStartX = (W - fRowTotalW) / 2;
          const fx = fRowStartX + fCol * (this.cardW + this.gap);
          const fy = cardAreaY + fRow * (this.cardH + this.gap);
          this.drawCard(card, fx, fy);
        }
      }
  
      // 底部图片按钮区域
      const btnY = H - 90 * s;
      const btnW = 90 * s;
      const btnH = 56 * s;
      const btnGap = 20 * s;
      const totalBtnW = btnW * 3 + btnGap * 2;
      const btnStartX = (W - totalBtnW) / 2;
  
      // === 争分夺秒倒计时条（在出牌按钮上方）===
      if (game._hastePlayActive && game._hastePlayStartTime) {
        const elapsed = Date.now() - game._hastePlayStartTime;
        const total = 20000;
        const remaining = Math.max(0, total - elapsed);
        const progress = remaining / total;
        if (progress > 0) {
          const timerH = 6 * s;
          const timerY = btnY - timerH - 8 * s;
          const timerW = W * 0.5;
          const timerX = W / 2 - timerW / 2;
          // 背景
          this.roundRect(timerX, timerY, timerW, timerH, timerH / 2, 'rgba(0,0,0,0.3)');
          // 进度
          const barColor = progress > 0.5 ? '#2ecc71' : progress > 0.2 ? '#f39c12' : '#e74c3c';
          this.roundRect(timerX, timerY, timerW * progress, timerH, timerH / 2, barColor);
          // 文字
          ctx.save();
          const sec = (remaining / 1000).toFixed(1);
          ctx.font = `bold ${Math.max(7, Math.floor(9 * s))}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${sec}s`, timerX + timerW / 2, timerY + timerH / 2 + 0.5 * s);
          ctx.restore();
        }
      }
  
      // 出牌按钮（图片 + 阴影 + 按下偏移）
      const playX = btnStartX;
      const playY = btnY + (this.pressedBtn === 'play' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('out_card', playX, playY, btnW, btnH);
      ctx.restore();
      // 出牌文字 + 剩余次数
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const btnTextY = playY + btnH / 2 - 1 * s;
      const playText = `出牌 (${game.handsLeft})`;
      const playTx = playX + btnW / 2;
      const selectedCount = game.getSelectedCards ? game.getSelectedCards().length : 0;
      const isInvalid = game.pendingCheck && (game.pendingCheck.state === 'invalid' || game.pendingCheck.state === 'witch_failed');
      if (isInvalid || selectedCount < 2) {
        // 非法状态或牌数不足：暖灰色文字 + 深色描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#3a2e1d';
        ctx.strokeText(playText, playTx, btnTextY);
        ctx.fillStyle = '#9a8f7d';
        ctx.fillText(playText, playTx, btnTextY);
      } else {
        // 深色外描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#2a1f0d';
        ctx.strokeText(playText, playTx, btnTextY);
        // 金色渐变填充
        const grad = ctx.createLinearGradient(playTx, btnTextY - 7 * s, playTx, btnTextY + 7 * s);
        grad.addColorStop(0, '#dfc06e');
        grad.addColorStop(0.5, '#c9a84c');
        grad.addColorStop(1, '#b5973e');
        ctx.fillStyle = grad;
        ctx.fillText(playText, playTx, btnTextY);
      }
      ctx.restore();
      this.playBtnRect = { x: playX, y: btnY, w: btnW, h: btnH, action: 'play' };
  
      // 弃牌按钮（图片 + 阴影 + 按下偏移）
      const discardX = btnStartX + btnW + btnGap;
      const discardY = btnY + (this.pressedBtn === 'discard' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('throw_card', discardX, discardY, btnW, btnH);
      ctx.restore();
      // 弃牌文字 + 剩余次数
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const discardTextY = discardY + btnH / 2 - 1 * s;
      const discardText = `弃牌 (${game.discardsLeft})`;
      const discardTx = discardX + btnW / 2;
      if (game.discardsLeft <= 0) {
        // 次数用完：深灰色文字（disable 状态）
        ctx.fillStyle = '#666';
        ctx.fillText(discardText, discardTx, discardTextY);
      } else {
        // 深色外描边
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#2a1f0d';
        ctx.strokeText(discardText, discardTx, discardTextY);
        // 金色渐变填充（上亮下暗，自然光照）
        const dgrad = ctx.createLinearGradient(discardTx, discardTextY - 7 * s, discardTx, discardTextY + 7 * s);
        dgrad.addColorStop(0, '#dfc06e');
        dgrad.addColorStop(0.5, '#c9a84c');
        dgrad.addColorStop(1, '#b5973e');
        ctx.fillStyle = dgrad;
        ctx.fillText(discardText, discardTx, discardTextY);
      }
      ctx.restore();
      this.discardBtnRect = { x: discardX, y: btnY, w: btnW, h: btnH, action: 'discard' };
  
      // 清空选择按钮（图片 + 阴影 + 按下偏移）
      const resetX = btnStartX + (btnW + btnGap) * 2;
      const resetY = btnY + (this.pressedBtn === 'reset' ? 2 * s : 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 3 * s;
      this.drawBtnImage('reset_select', resetX, resetY, btnW, btnH);
      ctx.restore();
      // 清空选择文字
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const resetTextY = resetY + btnH / 2 - 1 * s;
      const resetText = '清空选择';
      const resetTx = resetX + btnW / 2;
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = '#5a4a2a';
      ctx.strokeText(resetText, resetTx, resetTextY);
      ctx.fillStyle = '#fff';
      ctx.fillText(resetText, resetTx, resetTextY);
      ctx.restore();
      this.resetBtnRect = { x: resetX, y: btnY, w: btnW, h: btnH, action: 'reset' };
  
      // 调试：点击第一个方块显示华丽 x2 标签（保持 1.5s）
      if (game._debugLabelShow) {
        const elapsed = Date.now() - game._debugLabelShow.startTime;
        if (elapsed < 1500) {
          const progress = Math.min(elapsed / 350, 1);
          const tagScale = 1 + 0.25 * Math.sin(progress * Math.PI);
          const tagCX = leftBoxX + boxSize / 2;
          const tagCY = boxY - 14 * s;
          this._drawFancyLabel(ctx, tagCX, tagCY, s, game._debugLabelShow.text, tagScale, elapsed);
        } else {
          game._debugLabelShow = null;
        }
      }
  
      // 女巫牌详情弹窗
      this._drawWitchDetailPopup(ctx, game, s);
    }

  // ===== 求助提示弹窗 =====
  Renderer.prototype.drawTipHelpPopup = function(game) {
    const popup = game._tipHelpPopup;
    if (!popup) return;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const s = this.scale;

    const isClosing = game._closingTipHelp;
    const elapsed = isClosing ? 99999 : Date.now() - popup.startTime;

    const panel = this._drawModalPanel(ctx, W, H, s, {
      isClosing,
      closeStartTime: game._closeTipHelpStartTime,
      width: 300,
      height: 280,
      bgColor: '#f5f0e1',
      borderColor: '#c4a35a',
      borderRadius: 14,
      borderWidth: 1.5,
      overlayAlpha: 0.55,
      overlayFadeInDuration: 200,
      enterOffset: 20,
      closeOffset: 30,
      elapsed,
      onCloseComplete: () => {
        game._tipHelpPopup = null;
        game._closingTipHelp = false;
        game._closeTipHelpStartTime = null;
        game._tipHelpBuyPressed = false;
        game._tipHelpSharePressed = false;
        game._tipHelpClosePressed = false;
        game._tipHelpBuyDelaying = false;
        game._tipHelpShareDelaying = false;
      }
    });

    if (!panel) return;
    const { px, py, pw, ph, closeAlpha } = panel;

    // 重置点击区域
    this.tipHelpBuyRect = null;
    this.tipHelpShareRect = null;
    this.tipHelpCloseRect = null;
    this.tipHelpPanelRect = { x: px, y: py, w: pw, h: ph };

    // === 内层细边框（参考设置弹窗） ===
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    const inset = 4 * s;
    const ix = px + inset, iy = py + inset, iw = pw - inset * 2, ih = ph - inset * 2, ir = 14 * s - inset;
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
    ctx.globalAlpha = titleAnim.alpha * closeAlpha;
    ctx.fillStyle = '#5a4a2a';
    ctx.font = `bold ${Math.floor(22 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('单词提示', W / 2, py + 34 * s + titleAnim.yShift);
    ctx.restore();

    // 标题下装饰线
    const decoLineY = py + 52 * s;
    const decoLineW = pw * 0.5;
    const decoLineX = px + (pw - decoLineW) / 2;
    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
    ctx.restore();

    // 副标题
    const subAnim = Easing.fadeIn(elapsed, 140, 250, 6 * s);
    ctx.save();
    ctx.globalAlpha = subAnim.alpha * closeAlpha * 0.85;
    ctx.fillStyle = '#7a6a4a';
    ctx.font = `${Math.floor(13 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const subY = py + 75 * s + subAnim.yShift;
    ctx.fillText('需要帮助？请选择以下方式获取提示', W / 2, subY);
    ctx.restore();

    // 按钮图片（buy_tip/share_tip 从 cloudStorage 预加载缓存获取，pop_close 本地加载）
    const buyData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages['buy_tip'];
    const today = new Date().toISOString().slice(0, 10);
    const shareCount = game._dailyShareDate === today ? game._dailyShareCount : 0;
    const shareImgKey = shareCount >= 3 ? 'share_tip_limit' : 'share_tip';
    const shareData = game.cloudStorage && game.cloudStorage.bgIconImages && game.cloudStorage.bgIconImages[shareImgKey];
    const closeData = this.tipHelpImages && this.tipHelpImages['pop_close'];

    const btnW = 200 * s;
    const buyH = 63 * s;
    const shareH = 66 * s;
    const btnGap = 12 * s;
    const btnX = (W - btnW) / 2;
    const startY = py + 105 * s;

    // 购买提示按钮
    const buyY = startY;
    if (buyData && buyData.loaded && buyData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      const buyPressOffset = game._tipHelpBuyPressed ? 2 * s : 0;
      ctx.drawImage(buyData.img, btnX, buyY + buyPressOffset, btnW, buyH);
      ctx.restore();
    }
    this.tipHelpBuyRect = { x: btnX, y: buyY, w: btnW, h: buyH };

    // 转发求助按钮
    const shareY = startY + buyH + btnGap;
    if (shareData && shareData.loaded && shareData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      const sharePressOffset = game._tipHelpSharePressed ? 2 * s : 0;
      ctx.drawImage(shareData.img, btnX, shareY + sharePressOffset, btnW, shareH);
      ctx.restore();
    }
    this.tipHelpShareRect = { x: btnX, y: shareY, w: btnW, h: shareH };

    // 右上角关闭按钮
    const closeSize = 32 * s;
    const closeX = px + pw - closeSize - 10 * s;
    const closeY = py + 10 * s;
    const closePressOffset = game._tipHelpClosePressed ? 2 * s : 0;
    if (closeData && closeData.loaded && closeData.img) {
      ctx.save();
      ctx.globalAlpha = closeAlpha;
      ctx.drawImage(closeData.img, closeX, closeY + closePressOffset, closeSize, closeSize);
      ctx.restore();
    }
    this.tipHelpCloseRect = { x: closeX, y: closeY, w: closeSize, h: closeSize };

  }

};
