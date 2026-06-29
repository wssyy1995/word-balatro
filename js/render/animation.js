const { Easing } = require('../animation');
const { LETTER_SCORE, letterUpgrades } = require('../data');

module.exports = function extendAnimation(Renderer) {
    Renderer.prototype.updateAnimations = function() {
      // 动画更新（后续实现）
    }

    Renderer.prototype._spawnSparkles = function(cx, cy, count = 20, colors = null, speedScale = 1) {
      const s = this.scale;
      const palette = colors || ['#ffd700', '#ffffff'];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (1 + Math.random() * 2.5) * speedScale;
        this.sparkles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed * s,
          vy: Math.sin(angle) * speed * s - 1.5 * s * speedScale,
          life: 1,
          decay: (0.015 + Math.random() * 0.02) * speedScale,
          size: (1.5 + Math.random() * 2.5) * s,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
    }

    Renderer.prototype._spawnStarBurst = function(cx, cy, count = 16, colors = null) {
      const s = this.scale;
      const palette = colors || ['#ffd700', '#ffffff'];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 1.0;
        this.sparkles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed * s,
          vy: Math.sin(angle) * speed * s - 0.6 * s,
          life: 1,
          decay: 0.010 + Math.random() * 0.012,
          size: (1.2 + Math.random() * 1.8) * s,
          color: palette[Math.floor(Math.random() * palette.length)],
          shape: 'star',
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.12,
        });
      }
    }

    Renderer.prototype._updateAndDrawSparkles = function(ctx, s) {
      if (this.sparkles.length === 0) return;
      ctx.save();
      this.sparkles = this.sparkles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08 * s; // 重力
        p.life -= p.decay;
        p.rotation += p.rotSpeed || 0;
        if (p.life > 0) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          if (p.shape === 'star') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.beginPath();
            for (let k = 0; k < 4; k++) {
              const a = (Math.PI / 2) * k;
              const r = k % 2 === 0 ? p.size : p.size * 0.35;
              ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
          return true;
        }
        return false;
      });
      ctx.restore();
    }

    Renderer.prototype._startFlyingScore = function(value, startX, startY, game) {
      this.flyingScore = {
        value,
        startX, startY,
        startTime: Date.now(),
      };
      // 锁定 HUD 分数动画，等飞行结束后再更新
      this._scoreUpdateLocked = true;
      // 播放总分弹出音效
      if (game && game.audioManager) game.audioManager.play('word_score');
    }

    Renderer.prototype._updateAndDrawFlyingScore = function(ctx, s, game) {
      if (!this.flyingScore) return;
      const fs = this.flyingScore;
      const elapsed = Date.now() - fs.startTime;
  
      const appearDuration = 300;
      const holdDuration = 600;
      const fadeDuration = 150;
      const totalDuration = appearDuration + holdDuration + fadeDuration;
  
      ctx.save();
      ctx.font = `bold ${Math.floor(26 * s)}px Georgia, serif`;
      ctx.fillStyle = '#c4a35a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,215,0,0.25)';
      ctx.shadowBlur = 20 * s;
  
      if (elapsed < appearDuration) {
        // 阶段1: 果冻弹出（easeOutBackStrong）
        const progress = elapsed / appearDuration;
        const ease = Easing.easeOutBackStrong(progress);
        const scale = ease;
        const offsetY = (1 - ease) * 15 * s;
  
        ctx.translate(fs.startX, fs.startY + offsetY);
        ctx.scale(scale, scale);
        ctx.fillText(`+${fs.value}`, 0, 0);
      } else if (elapsed < appearDuration + holdDuration) {
        // 阶段2: 停留（弹出结束时解锁 HUD）
        this._scoreUpdateLocked = false;
        ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
      } else if (elapsed < totalDuration) {
        // 阶段3: 淡出
        this._scoreUpdateLocked = false;
        const fadeProgress = (elapsed - appearDuration - holdDuration) / fadeDuration;
        ctx.globalAlpha = 1 - fadeProgress;
        ctx.fillText(`+${fs.value}`, fs.startX, fs.startY);
      } else {
        // 动画结束
        this.flyingScore = null;
        this._scoreUpdateLocked = false;
        if (this.lastScore !== game.score) {
          this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
          this.lastScore = game.score;
        }
      }
      ctx.restore();
    }

    Renderer.prototype._drawLetterGodAnim = function(game) {
      const ctx = this.ctx;
      const s = this.scale;
      const anim = game._letterGodAnim;
      if (!anim) return;
  
      if (!anim.hitCardIds) anim.hitCardIds = {};
      const elapsed = Date.now() - anim.startTime;
      const flyDuration = 1000;
      const stayDuration = 350;
      const jumpDuration = 300;
      const maxCardId = anim.maxCardId;
      const orderedIds = anim.playedCardIds;
      const sequence = [maxCardId, ...orderedIds.filter(id => id !== maxCardId)];
  
      // 计算总时长
      let totalDuration = flyDuration + stayDuration;
      for (let i = 1; i < sequence.length; i++) {
        totalDuration += jumpDuration + stayDuration;
      }
  
      // 动画完成
      if (elapsed >= totalDuration) {
        game._letterGodAnim = null;
        if (game.pendingCheck && game.pendingCheck.state === 'valid') {
          // 字母之神完成后，重置时间基准并进入阶段1（字母跳跃）
          // resolveTime 设为当前时间减去 letterJumpStart(1000ms)，
          // 这样 jumpElapsed 从 0 开始，第一个字母立即开始跳跃，不会显示 0
          game.pendingCheck.resolveTime = Date.now() - 1000;
          game.pendingCheck.animPhase = 1;
        }
        const letterGodIdx = game.pendingCheck?.letterGodIndex ?? -1;
        if (letterGodIdx >= 0 && game.jokers[letterGodIdx]) {
          game.jokers[letterGodIdx]._triggered = false;
          game.jokers[letterGodIdx]._letterGodAnimStart = null;
        }
        return;
      }
  
      // 获取女巫牌位置
      const letterGodIdx = game.pendingCheck?.letterGodIndex ?? -1;
      const witchRect = this.witchPropRects?.find(r => r.jokerIndex === letterGodIdx);
      const cardRects = this.cardRects || [];
      const getCardRect = (cardId) => cardRects.find(r => r.cardId === cardId);
  
      // 幽光流焰由 _drawPropCard 统一绘制，此处不再重复绘制紫色呼吸光晕
  
      // ===== 计算星星位置 =====
      let starX, starY;
      let currentCardId = null;
  
      if (elapsed < flyDuration) {
        const t = elapsed / flyDuration;
        const eased = Easing.easeOutCubic(t);
        const maxRect = getCardRect(maxCardId);
        if (witchRect && maxRect) {
          starX = witchRect.x + witchRect.w / 2 + (maxRect.x + maxRect.w / 2 - witchRect.x - witchRect.w / 2) * eased;
          starY = witchRect.y + witchRect.h / 2 + (maxRect.y + maxRect.h / 2 - witchRect.y - witchRect.h / 2) * eased;
        }
      } else {
        let t0 = flyDuration;
        if (elapsed < t0 + stayDuration) {
          const maxRect = getCardRect(maxCardId);
          if (maxRect) {
            starX = maxRect.x + maxRect.w / 2;
            starY = maxRect.y + maxRect.h / 2;
          }
          currentCardId = maxCardId;
          anim.hitCardIds[maxCardId] = true;
        } else {
          t0 += stayDuration;
          for (let i = 1; i < sequence.length; i++) {
            const fromId = sequence[i - 1];
            const toId = sequence[i];
            if (elapsed < t0 + jumpDuration) {
              const t = (elapsed - t0) / jumpDuration;
              const fromRect = getCardRect(fromId);
              const toRect = getCardRect(toId);
              if (fromRect && toRect) {
                const fromX = fromRect.x + fromRect.w / 2;
                const fromY = fromRect.y + fromRect.h / 2;
                const toX = toRect.x + toRect.w / 2;
                const toY = toRect.y + toRect.h / 2;
                starX = fromX + (toX - fromX) * t;
                const jumpHeight = 40 * s;
                starY = fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * jumpHeight;
              }
              currentCardId = toId;
              break;
            }
            t0 += jumpDuration;
            if (elapsed < t0 + stayDuration) {
              const toRect = getCardRect(toId);
              if (toRect) {
                starX = toRect.x + toRect.w / 2;
                starY = toRect.y + toRect.h / 2;
              }
              currentCardId = toId;
              anim.hitCardIds[toId] = true;
              break;
            }
            t0 += stayDuration;
          }
        }
      }
  
      // 设置当前停留卡牌的分数脉冲
      if (currentCardId) {
        let card = null;
        if (game.hand) card = game.hand.find(c => c && c.id === currentCardId);
        if (!card && game.pendingCheck && game.pendingCheck.cards) {
          card = game.pendingCheck.cards.find(c => c.id === currentCardId);
        }
        if (card && !card._scorePulseAnim) {
          card._scorePulseAnim = { startTime: Date.now(), duration: 500 };
        }
      }
  
      // ===== 绘制星星 =====
      if (starX !== undefined && starY !== undefined) {
        ctx.save();
        // 星星自转角度（飞行过程中缓慢旋转）
        const starRot = elapsed / 800;
        ctx.shadowColor = 'rgba(155,89,182,0.85)';
        ctx.shadowBlur = 14 * s;
        ctx.fillStyle = '#9b59b6';
        this._drawStar(ctx, starX, starY, 7 * s, 3 * s, 5, starRot);
        ctx.shadowBlur = 0;
        // 中心高光点
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(starX, starY, 2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    Renderer.prototype._drawPotionUpgradeAnim = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const anim = game._potionUpgrading;
      const now = Date.now();
      const elapsed = now - anim.startTime;
  
      if (elapsed < 1800) {
        const popDuration = 300;
        const holdOldDuration = 300;
        const scoreChangeDuration = 400;
        const holdNewDuration = 700;
        const fadeOutDuration = 100;
  
        let cardScale = 1;
        let alpha = 1;
        let showNewScore = false;
        let scoreScale = 1;
  
        if (elapsed < popDuration) {
          const t = elapsed / popDuration;
          cardScale = Easing.easeOutBack(t);
        } else if (elapsed < popDuration + holdOldDuration) {
          cardScale = 1;
        } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
          showNewScore = true;
          if (!anim._scoreSoundPlayed) {
            anim._scoreSoundPlayed = true;
            if (game.audioManager) game.audioManager.play('word_score');
          }
          const pulseState = {
            startTime: anim.startTime + popDuration + holdOldDuration,
            duration: scoreChangeDuration
          };
          scoreScale = this._calcPulseScale(pulseState, 0.2).scale;
        } else if (elapsed < popDuration + holdOldDuration + scoreChangeDuration + holdNewDuration) {
          showNewScore = true;
          cardScale = 1;
        } else {
          const t = (elapsed - popDuration - holdOldDuration - scoreChangeDuration - holdNewDuration) / fadeOutDuration;
          cardScale = 1 - t * 0.5;
          alpha = 1 - t;
          showNewScore = true;
        }
  
        // 遮罩保留，但让背景转盘依然可见
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
  
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(2, 2);
  
        const tempCard = {
          letter: anim.letter,
          score: showNewScore ? anim.newScore : anim.oldScore,
          baseScore: LETTER_SCORE[anim.letter],
          upgraded: showNewScore,
          upgradeMult: showNewScore ? (anim.upgradeMult || 1) : 1,
          animOffset: { scale: Math.max(0, cardScale), opacity: Math.max(0, alpha) }
        };
  
        if (elapsed >= popDuration + holdOldDuration && elapsed < popDuration + holdOldDuration + scoreChangeDuration) {
          tempCard._scoreScale = scoreScale;
        }
  
        this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2);
        ctx.restore();
      } else {
        game._potionUpgrading = null;
        game._randomUpgradePopup = null;
        game.potionMode = null; // 动画结束后才真正清除药水
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
      }
    }

    Renderer.prototype._drawReplicateSelect = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const selected = game._replicateSelectedLetters || [];

      // === 标题 ===
      const titleY = top - 10 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('危险复制', W / 2, titleY);
      ctx.restore();

      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择两个字母，80%概率低分变高分', W / 2, subTitleY);
      ctx.restore();

      // === 分隔线 ===
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

      // === A-Z 字母网格 ===
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const cols = 4;
      const btnSize = 54 * s;
      const btnGap = 13 * s;
      const totalGridW = cols * btnSize + (cols - 1) * btnGap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = dividerY + 30 * s;

      this.potionLetterRects = [];
      letters.forEach((letter, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridStartX + col * (btnSize + btnGap);
        const y = gridStartY + row * (btnSize + btnGap);

        const isSelected = selected.includes(letter);
        const canSelect = selected.length < 2 || isSelected;

        const br = 8 * s;
        ctx.save();
        if (isSelected) {
          ctx.shadowColor = 'rgba(196,163,90,0.35)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 3 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
        } else if (!canSelect) {
          ctx.shadowColor = 'rgba(0,0,0,0.06)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#e8e4dc', null, 0);
        } else {
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
        if (isSelected) {
          ctx.fillStyle = '#8b6914';
        } else if (!canSelect) {
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
        if (isSelected) {
          ctx.fillStyle = '#c4a35a';
        } else if (!canSelect) {
          ctx.fillStyle = '#c0b8a8';
        } else {
          ctx.fillStyle = '#9a7b3d';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letterScore, centerX, centerY + 11 * s);
        ctx.restore();

        if (canSelect) {
          this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
        }
      });

      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

      // === 已选字母结果预览 ===
      if (selected.length === 2) {
        const [letterA, letterB] = selected;
        const baseA = LETTER_SCORE[letterA];
        const baseB = LETTER_SCORE[letterB];
        const upA = letterUpgrades.get(letterA) || {};
        const upB = letterUpgrades.get(letterB) || {};
        const scoreA = Math.floor(baseA * (upA.mult || 1)) + (upA.add || 0);
        const scoreB = Math.floor(baseB * (upB.mult || 1)) + (upB.add || 0);

        let successScores, failScores;
        if (scoreA === scoreB) {
          successScores = [scoreA, scoreB];
          failScores = [scoreA, scoreB];
        } else if (scoreA < scoreB) {
          successScores = [scoreB, scoreB];
          failScores = [scoreA, scoreA];
        } else {
          successScores = [scoreA, scoreA];
          failScores = [scoreB, scoreB];
        }

        const line1 = `60%概率:  ${letterA}=${successScores[0]}, ${letterB}=${successScores[1]}`;
        const line2 = `40%概率:  ${letterA}=${failScores[0]}, ${letterB}=${failScores[1]}`;
        const tipY = gridBottomY + 18 * s;
        const lineGap = 18 * s;

        ctx.save();
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxTipW = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
        const tipX = W / 2 - maxTipW / 2;
        ctx.fillText(line1, tipX, tipY);
        ctx.fillText(line2, tipX, tipY + lineGap);
        ctx.restore();
      }

      // === 底部按钮区域 ===
      const btnAreaY = H - 75 * s;
      const potionBtnW = 130 * s;
      const potionBtnH = 46 * s;
      const potionBtnGap = 16 * s;
      const totalBtnW = potionBtnW * 2 + potionBtnGap;
      const btnStartX = (W - totalBtnW) / 2;

      // 开始按钮（需要选中两个字母）
      const startBtnX = btnStartX;
      const startBtnY = btnAreaY;
      const startEnabled = selected.length === 2;
      this.roundRect(startBtnX, startBtnY, potionBtnW, potionBtnH, 10 * s,
        startEnabled ? '#c4a35a' : '#d4c9a8',
        startEnabled ? null : '#bbb', startEnabled ? 0 : 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('开始', startBtnX + potionBtnW / 2, startBtnY + potionBtnH / 2);
      ctx.restore();
      this.replicateStartBtnRect = { x: startBtnX, y: startBtnY, w: potionBtnW, h: potionBtnH, enabled: startEnabled };

      // 重选按钮
      const resetBtnX = btnStartX + potionBtnW + potionBtnGap;
      const resetBtnY = btnAreaY;
      this.roundRect(resetBtnX, resetBtnY, potionBtnW, potionBtnH, 10 * s, '#f5f0e6', '#c4a35a', 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('重选', resetBtnX + potionBtnW / 2, resetBtnY + potionBtnH / 2);
      ctx.restore();
      this.replicateResetBtnRect = { x: resetBtnX, y: resetBtnY, w: potionBtnW, h: potionBtnH, enabled: true };
    }

    Renderer.prototype._drawReplicateAnim = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const anim = game._replicateAnim;
      const now = Date.now();
      const baseCardScale = 1.8;

      if (anim.phase === 'spinning') {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / 2000, 1);

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 两张字母牌：心跳共振动画（参考 Demo 模式 4）
        const gap = 20 * s;
        const cardW = this.cardW * baseCardScale;
        const totalW = cardW * 2 + gap;
        const startX = (W - totalW) / 2;
        const baseY = H / 2;

        // 最后 400ms 心跳幅度衰减到 0，自然停止到 baseCardScale
        const FADE_DURATION = 400;
        let fadeOut = 1;
        if (progress > (2000 - FADE_DURATION) / 2000) {
          fadeOut = 1 - (progress - (2000 - FADE_DURATION) / 2000) / (FADE_DURATION / 2000);
          fadeOut = Math.max(0, fadeOut);
        }

        const period = 1600;
        const omega = (2 * Math.PI) / period;
        function heartbeat(phaseOffset) {
          const biphasic = Math.abs(Math.sin(omega * elapsed * 1.3 + phaseOffset));
          const pulse = Math.pow(biphasic, 3);
          const beat = 0.12 * pulse + 0.03 * Math.sin(omega * elapsed * 0.5 + phaseOffset);
          return beat;
        }
        const hb1 = heartbeat(0);
        const hb2 = heartbeat(Math.PI * 0.7);
        const beats = [hb1, hb2];

        anim.letters.forEach((letter, i) => {
          const hb = beats[i] * fadeOut;
          const cx = startX + i * (cardW + gap) + cardW / 2;
          const cy = baseY - 18 * s * hb * 3;
          const cardScale = baseCardScale * (1 + hb);
          const glowAlpha = 0.7 * hb * 3;

          const base = LETTER_SCORE[letter];
          const up = letterUpgrades.get(letter) || {};
          const score = Math.floor(base * (up.mult || 1)) + (up.add || 0);

          const tempCard = {
            letter,
            score,
            baseScore: base,
            upgraded: !!(up.mult || up.add),
            upgradeMult: up.mult || 1,
            animOffset: { scale: 1, opacity: 1 }
          };

          // 发光边框
          if (glowAlpha > 0.01) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(cardScale, cardScale);
            ctx.shadowColor = `rgba(180,140,210,${glowAlpha})`;
            ctx.shadowBlur = 22 * s;
            ctx.strokeStyle = `rgba(200,160,230,${glowAlpha * 0.6})`;
            ctx.lineWidth = 3 * s;
            const hw = this.cardW / 2;
            const hh = this.cardH / 2;
            const r = 10 * s;
            ctx.beginPath();
            ctx.moveTo(-hw + r, -hh);
            ctx.lineTo(hw - r, -hh);
            ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
            ctx.lineTo(hw, hh - r);
            ctx.quadraticCurveTo(hw, hh, hw - r, hh);
            ctx.lineTo(-hw + r, hh);
            ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
            ctx.lineTo(-hw, -hh + r);
            ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.globalAlpha = 1;
          ctx.translate(cx, cy);
          ctx.scale(cardScale, cardScale);
          this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, score);
          ctx.restore();
        });
      } else if (anim.phase === 'result') {
        const resultElapsed = now - (anim.resultStartTime || anim.startTime + 2000);
        const fadeIn = Math.min(resultElapsed / 300, 1);

        // 分数缩放脉冲动画
        const SCORE_CHANGE_DURATION = 600;
        const scorePulseStart = anim.resultStartTime || anim.startTime + 2000;

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 结果标题
        const titleY = H * 0.25 + 10 * s;

        // 复刻成功：标题左右放烟花（复用单词校验合法烟花）
        if (anim.success && !anim._sparklesSpawned) {
          anim._sparklesSpawned = true;
          this._spawnSparkles(W / 2 - 60 * s, titleY, 12);
          this._spawnSparkles(W / 2 + 60 * s, titleY, 12);
        }

        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `bold ${Math.floor(30 * s)}px Georgia, serif`;
        ctx.fillStyle = anim.success ? '#c4a35a' : '#a33a2b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(anim.success ? '复制成功！' : '复制失败…', W / 2, titleY);
        ctx.restore();

        // 标题下分隔线
        const decoLineY = titleY + 22 * s;
        const decoLineW = 160 * s;
        const decoLineX = (W - decoLineW) / 2;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
        ctx.restore();

        // 两张字母牌（显示新分数）：从 spinning 结束时的 baseCardScale 自然过渡到 1.6
        const targetCardScale = 1.6;
        const resultScale = baseCardScale - (baseCardScale - targetCardScale) * fadeIn;
        const gap = 20 * s;
        const cardW = this.cardW * resultScale;
        const cardH = this.cardH * resultScale;
        const totalW = cardW * 2 + gap;
        const startX = (W - totalW) / 2;
        const cardY = (H - cardH) / 2;

        anim.letters.forEach((letter, i) => {
          const x = startX + i * (cardW + gap);
          const score = anim.newScores[i];
          const base = LETTER_SCORE[letter];

          ctx.save();
          // 卡牌保持不透明，避免从 spinning 切换时出现闪烁
          ctx.globalAlpha = 1;

          const tempCard = {
            letter,
            score,
            baseScore: base,
            upgraded: true,
            upgradeMult: 1,
            animOffset: { scale: 1, opacity: 1 },
            _scorePulseAnim: { startTime: scorePulseStart, duration: SCORE_CHANGE_DURATION }
          };
          ctx.translate(x + cardW / 2, cardY + cardH / 2);
          ctx.scale(resultScale, resultScale);
          this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, score);
          ctx.restore();
        });

        // 提示文字
        const tipY = cardY + cardH + 40 * s;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点击任意位置继续', W / 2, tipY);
        ctx.restore();
      }
    }

    Renderer.prototype._drawEqualSplitSelect = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const selected = game._equalSplitSelectedLetters || [];

      // === 标题 ===
      const titleY = top - 10 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('平分秋色', W / 2, titleY);
      ctx.restore();

      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择两个字母，分数相加后平分', W / 2, subTitleY);
      ctx.restore();

      // === 分隔线 ===
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

      // === A-Z 字母网格 ===
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const cols = 4;
      const btnSize = 54 * s;
      const btnGap = 13 * s;
      const totalGridW = cols * btnSize + (cols - 1) * btnGap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = dividerY + 30 * s;

      this.potionLetterRects = [];
      letters.forEach((letter, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridStartX + col * (btnSize + btnGap);
        const y = gridStartY + row * (btnSize + btnGap);

        const isSelected = selected.includes(letter);
        const canSelect = selected.length < 2 || isSelected;

        const br = 8 * s;
        ctx.save();
        if (isSelected) {
          ctx.shadowColor = 'rgba(196,163,90,0.35)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 3 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
        } else if (!canSelect) {
          ctx.shadowColor = 'rgba(0,0,0,0.06)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#e8e4dc', null, 0);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#f5f0e6', '#d4c9a8', 1.5 * s);
        }
        ctx.restore();

        const up = letterUpgrades.get(letter) || {};
        const letterScore = Math.floor(LETTER_SCORE[letter] * (up.mult || 1)) + (up.add || 0);
        const centerX = x + btnSize / 2;
        const centerY = y + btnSize / 2;

        ctx.save();
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        if (isSelected) {
          ctx.fillStyle = '#8b6914';
        } else if (!canSelect) {
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
        if (isSelected) {
          ctx.fillStyle = '#c4a35a';
        } else if (!canSelect) {
          ctx.fillStyle = '#c0b8a8';
        } else {
          ctx.fillStyle = '#9a7b3d';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letterScore, centerX, centerY + 11 * s);
        ctx.restore();

        if (canSelect) {
          this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
        }
      });

      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

      // === 已选字母结果预览 ===
      if (selected.length === 2) {
        const [letterA, letterB] = selected;
        const baseA = LETTER_SCORE[letterA];
        const baseB = LETTER_SCORE[letterB];
        const upA = letterUpgrades.get(letterA) || {};
        const upB = letterUpgrades.get(letterB) || {};
        const scoreA = Math.floor(baseA * (upA.mult || 1)) + (upA.add || 0);
        const scoreB = Math.floor(baseB * (upB.mult || 1)) + (upB.add || 0);

        const totalScore = scoreA + scoreB;
        let newScoreA = Math.floor(totalScore / 2);
        let newScoreB = Math.floor(totalScore / 2);
        if (totalScore % 2 !== 0) {
          newScoreA += 1; // 预览时显示一种情况（奇数时+1给第一个）
        }

        const tipText = `平分后: ${letterA}=${newScoreA}, ${letterB}=${newScoreB}`;
        const tipY = gridBottomY + 18 * s;

        ctx.save();
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tipText, W / 2, tipY);
        ctx.restore();
      }

      // === 底部按钮区域 ===
      const btnAreaY = H - 75 * s;
      const potionBtnW = 130 * s;
      const potionBtnH = 46 * s;
      const potionBtnGap = 16 * s;
      const totalBtnW = potionBtnW * 2 + potionBtnGap;
      const btnStartX = (W - totalBtnW) / 2;

      // 开始按钮（需要选中两个字母）
      const startBtnX = btnStartX;
      const startBtnY = btnAreaY;
      const startEnabled = selected.length === 2;
      this.roundRect(startBtnX, startBtnY, potionBtnW, potionBtnH, 10 * s,
        startEnabled ? '#c4a35a' : '#d4c9a8',
        startEnabled ? null : '#bbb', startEnabled ? 0 : 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('开始', startBtnX + potionBtnW / 2, startBtnY + potionBtnH / 2);
      ctx.restore();
      this.equalSplitStartBtnRect = { x: startBtnX, y: startBtnY, w: potionBtnW, h: potionBtnH, enabled: startEnabled };

      // 重选按钮
      const resetBtnX = btnStartX + potionBtnW + potionBtnGap;
      const resetBtnY = btnAreaY;
      this.roundRect(resetBtnX, resetBtnY, potionBtnW, potionBtnH, 10 * s, '#f5f0e6', '#c4a35a', 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('重选', resetBtnX + potionBtnW / 2, resetBtnY + potionBtnH / 2);
      ctx.restore();
      this.equalSplitResetBtnRect = { x: resetBtnX, y: resetBtnY, w: potionBtnW, h: potionBtnH, enabled: true };
    }

    Renderer.prototype._drawEqualSplitAnim = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const anim = game._equalSplitAnim;
      const now = Date.now();
      const baseCardScale = 1.8;

      if (anim.phase === 'spinning') {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / 2000, 1);

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 两张字母牌：心跳动画（与复刻水一致）
        const gap = 20 * s;
        const cardW = this.cardW * baseCardScale;
        const totalW = cardW * 2 + gap;
        const startX = (W - totalW) / 2;
        const baseY = H / 2;

        // 最后 400ms 心跳幅度衰减到 0
        const FADE_DURATION = 400;
        let fadeOut = 1;
        if (progress > (2000 - FADE_DURATION) / 2000) {
          fadeOut = 1 - (progress - (2000 - FADE_DURATION) / 2000) / (FADE_DURATION / 2000);
          fadeOut = Math.max(0, fadeOut);
        }

        const period = 1600;
        const omega = (2 * Math.PI) / period;
        function heartbeat(phaseOffset) {
          const biphasic = Math.abs(Math.sin(omega * elapsed * 1.3 + phaseOffset));
          const pulse = Math.pow(biphasic, 3);
          const beat = 0.12 * pulse + 0.03 * Math.sin(omega * elapsed * 0.5 + phaseOffset);
          return beat;
        }
        const hb1 = heartbeat(0);
        const hb2 = heartbeat(Math.PI * 0.7);
        const beats = [hb1, hb2];

        anim.letters.forEach((letter, i) => {
          const hb = beats[i] * fadeOut;
          const cx = startX + i * (cardW + gap) + cardW / 2;
          const cy = baseY - 18 * s * hb * 3;
          const cardScale = baseCardScale * (1 + hb);
          const glowAlpha = 0.7 * hb * 3;

          const base = LETTER_SCORE[letter];
          const up = letterUpgrades.get(letter) || {};
          const score = Math.floor(base * (up.mult || 1)) + (up.add || 0);

          const tempCard = {
            letter,
            score,
            baseScore: base,
            upgraded: !!(up.mult || up.add),
            upgradeMult: up.mult || 1,
            animOffset: { scale: 1, opacity: 1 }
          };

          // 发光边框
          if (glowAlpha > 0.01) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(cardScale, cardScale);
            ctx.shadowColor = `rgba(180,140,210,${glowAlpha})`;
            ctx.shadowBlur = 22 * s;
            ctx.strokeStyle = `rgba(200,160,230,${glowAlpha * 0.6})`;
            ctx.lineWidth = 3 * s;
            const hw = this.cardW / 2;
            const hh = this.cardH / 2;
            const r = 10 * s;
            ctx.beginPath();
            ctx.moveTo(-hw + r, -hh);
            ctx.lineTo(hw - r, -hh);
            ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
            ctx.lineTo(hw, hh - r);
            ctx.quadraticCurveTo(hw, hh, hw - r, hh);
            ctx.lineTo(-hw + r, hh);
            ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
            ctx.lineTo(-hw, -hh + r);
            ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.globalAlpha = 1;
          ctx.translate(cx, cy);
          ctx.scale(cardScale, cardScale);
          this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, score);
          ctx.restore();
        });
      } else if (anim.phase === 'result') {
        const resultElapsed = now - (anim.resultStartTime || anim.startTime + 2000);
        const fadeIn = Math.min(resultElapsed / 300, 1);

        // 分数缩放脉冲动画
        const SCORE_CHANGE_DURATION = 600;
        const scorePulseStart = anim.resultStartTime || anim.startTime + 2000;

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 结果标题
        const titleY = H * 0.25 + 10 * s;

        // 放烟花
        if (!anim._sparklesSpawned) {
          anim._sparklesSpawned = true;
          this._spawnSparkles(W / 2 - 60 * s, titleY, 12);
          this._spawnSparkles(W / 2 + 60 * s, titleY, 12);
        }

        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `bold ${Math.floor(30 * s)}px Georgia, serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('平分完成！', W / 2, titleY);
        ctx.restore();

        // 标题下分隔线
        const decoLineY = titleY + 22 * s;
        const decoLineW = 160 * s;
        const decoLineX = (W - decoLineW) / 2;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
        ctx.restore();

        // 两张字母牌（显示新分数）
        const targetCardScale = 1.6;
        const resultScale = baseCardScale - (baseCardScale - targetCardScale) * fadeIn;
        const gap = 20 * s;
        const cardW = this.cardW * resultScale;
        const cardH = this.cardH * resultScale;
        const totalW = cardW * 2 + gap;
        const startX = (W - totalW) / 2;
        const cardY = (H - cardH) / 2;

        anim.letters.forEach((letter, i) => {
          const x = startX + i * (cardW + gap);
          const score = anim.newScores[i];
          const base = LETTER_SCORE[letter];

          ctx.save();
          ctx.globalAlpha = 1;

          const tempCard = {
            letter,
            score,
            baseScore: base,
            upgraded: true,
            upgradeMult: 1,
            animOffset: { scale: 1, opacity: 1 },
            _scorePulseAnim: { startTime: scorePulseStart, duration: SCORE_CHANGE_DURATION }
          };
          ctx.translate(x + cardW / 2, cardY + cardH / 2);
          ctx.scale(resultScale, resultScale);
          this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, score);
          ctx.restore();
        });

        // 提示文字
        const tipY = cardY + cardH + 40 * s;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点击任意位置继续', W / 2, tipY);
        ctx.restore();
      }
    }

    Renderer.prototype._drawStarlightWashSelect = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const selected = game._starlightWashSelectedLetter;

      // === 标题 ===
      const titleY = top - 10 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('星辉洗涤', W / 2, titleY);
      ctx.restore();

      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择一个字母，重置强化恢复基础分', W / 2, subTitleY);
      ctx.restore();

      // === 分隔线 ===
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

      // === A-Z 字母网格 ===
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const cols = 4;
      const btnSize = 54 * s;
      const btnGap = 13 * s;
      const totalGridW = cols * btnSize + (cols - 1) * btnGap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = dividerY + 30 * s;

      this.potionLetterRects = [];
      letters.forEach((letter, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridStartX + col * (btnSize + btnGap);
        const y = gridStartY + row * (btnSize + btnGap);

        const isSelected = selected === letter;

        const br = 8 * s;
        ctx.save();
        if (isSelected) {
          ctx.shadowColor = 'rgba(196,163,90,0.35)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 3 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#fdf5e0', '#c4a35a', 2.5 * s);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 4 * s;
          ctx.shadowOffsetY = 2 * s;
          this.roundRect(x, y, btnSize, btnSize, br, '#f5f0e6', '#d4c9a8', 1.5 * s);
        }
        ctx.restore();

        const up = letterUpgrades.get(letter) || {};
        const letterScore = Math.floor(LETTER_SCORE[letter] * (up.mult || 1)) + (up.add || 0);
        const centerX = x + btnSize / 2;
        const centerY = y + btnSize / 2;

        ctx.save();
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        ctx.fillStyle = isSelected ? '#8b6914' : '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, centerX, centerY - 7 * s);
        ctx.restore();

        ctx.save();
        ctx.font = `bold ${Math.floor(10 * s)}px sans-serif`;
        ctx.fillStyle = isSelected ? '#c4a35a' : '#9a7b3d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letterScore, centerX, centerY + 11 * s);
        ctx.restore();

        this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
      });

      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

      // === 已选字母结果预览 ===
      if (selected) {
        const base = LETTER_SCORE[selected];
        const up = letterUpgrades.get(selected) || {};
        const score = Math.floor(base * (up.mult || 1)) + (up.add || 0);
        const goldReward = Math.floor(Math.max(0, score - base) / 5);

        const line1 = `${selected}: ${score}分 → 恢复为 ${base}分`;
        const line2 = `获得 ${goldReward} 金币`;
        const tipY = gridBottomY + 18 * s;
        const lineGap = 18 * s;

        ctx.save();
        ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxTipW = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
        const tipX = W / 2 - maxTipW / 2;
        ctx.fillText(line1, tipX, tipY);
        ctx.fillText(line2, tipX, tipY + lineGap);
        ctx.restore();
      }

      // === 底部按钮区域 ===
      const btnAreaY = H - 75 * s;
      const potionBtnW = 130 * s;
      const potionBtnH = 46 * s;
      const potionBtnGap = 16 * s;
      const totalBtnW = potionBtnW * 2 + potionBtnGap;
      const btnStartX = (W - totalBtnW) / 2;

      // 开始按钮（需要选中一个字母）
      const startBtnX = btnStartX;
      const startBtnY = btnAreaY;
      const startEnabled = !!selected;
      this.roundRect(startBtnX, startBtnY, potionBtnW, potionBtnH, 10 * s,
        startEnabled ? '#c4a35a' : '#d4c9a8',
        startEnabled ? null : '#bbb', startEnabled ? 0 : 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('开始', startBtnX + potionBtnW / 2, startBtnY + potionBtnH / 2);
      ctx.restore();
      this.starlightWashStartBtnRect = { x: startBtnX, y: startBtnY, w: potionBtnW, h: potionBtnH, enabled: startEnabled };

      // 重选按钮
      const resetBtnX = btnStartX + potionBtnW + potionBtnGap;
      const resetBtnY = btnAreaY;
      this.roundRect(resetBtnX, resetBtnY, potionBtnW, potionBtnH, 10 * s, '#f5f0e6', '#c4a35a', 1.5 * s);
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('重选', resetBtnX + potionBtnW / 2, resetBtnY + potionBtnH / 2);
      ctx.restore();
      this.starlightWashResetBtnRect = { x: resetBtnX, y: resetBtnY, w: potionBtnW, h: potionBtnH, enabled: true };
    }

    Renderer.prototype._drawStarlightWashAnim = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const anim = game._starlightWashAnim;
      const now = Date.now();
      const baseCardScale = 1.8;

      if (anim.phase === 'foam') {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / 2000, 1);

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 字母牌（显示原分数）
        const cardW = this.cardW * baseCardScale;
        const cardH = this.cardH * baseCardScale;
        const cx = W / 2;
        const cy = H / 2 - 18 * s;
        const cardRect = { x: cx - cardW / 2, y: cy - cardH / 2, w: cardW, h: cardH };

        const base = LETTER_SCORE[anim.letter];
        const tempCard = {
          letter: anim.letter,
          score: anim.oldScore,
          baseScore: base,
          upgraded: true,
          upgradeMult: 1,
          animOffset: { scale: 1, opacity: 1 }
        };

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(baseCardScale, baseCardScale);
        this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, anim.oldScore);
        ctx.restore();

        // 泡沫动画（参考中央浓密泡团）
        if (!anim.bubbles) anim.bubbles = this._initStarlightFoam(cardRect);
        this._drawStarlightFoam(ctx, anim.bubbles, cardRect, elapsed / 1000, s);

        if (progress >= 1) {
          anim.phase = 'result';
          anim.resultStartTime = now;
          anim._sparklesSpawned = false;
        }
      } else if (anim.phase === 'result') {
        const resultElapsed = now - (anim.resultStartTime || anim.startTime + 1000);
        const fadeIn = Math.min(resultElapsed / 300, 1);

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 结果标题
        const titleY = H * 0.25 + 10 * s;

        // 放烟花
        if (!anim._sparklesSpawned) {
          anim._sparklesSpawned = true;
          this._spawnSparkles(W / 2 - 60 * s, titleY, 12);
          this._spawnSparkles(W / 2 + 60 * s, titleY, 12);
        }

        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `bold ${Math.floor(30 * s)}px Georgia, serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('星辉洗涤完成！', W / 2, titleY);
        ctx.restore();

        // 标题下分隔线
        const decoLineY = titleY + 22 * s;
        const decoLineW = 160 * s;
        const decoLineX = (W - decoLineW) / 2;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        this._drawTitleDivider(ctx, decoLineX, decoLineY, decoLineW, s, { diamondColor: '#c4a35a' });
        ctx.restore();

        // 字母牌（显示基础分数，隐藏默认分数以便做脉冲）
        const targetCardScale = 1.6;
        const resultScale = baseCardScale - (baseCardScale - targetCardScale) * fadeIn;
        const cardW = this.cardW * resultScale;
        const cardH = this.cardH * resultScale;
        const cardX = (W - cardW) / 2;
        const cardY = (H - cardH) / 2;

        const base = LETTER_SCORE[anim.letter];
        const tempCard = {
          letter: anim.letter,
          score: base,
          baseScore: base,
          upgraded: false,
          upgradeMult: 1,
          animOffset: { scale: 1, opacity: 1 }
        };

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
        ctx.scale(resultScale, resultScale);
        this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, base, null, true);

        // 分数脉冲缩放更新
        const pulseElapsed = Math.min(resultElapsed, 600);
        const pulseProgress = pulseElapsed / 600;
        const pulseScale = 1 + 0.55 * (1 - Easing.easeOutBack(pulseProgress));
        ctx.save();
        ctx.translate(0, this.cardH * 0.24);
        ctx.scale(pulseScale, pulseScale);
        ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a2f4a';
        ctx.fillText(`${base}分`, 0, 0);
        ctx.restore();
        ctx.restore();

        // 获得金币提示
        const goldY = cardY + cardH + 30 * s;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `bold ${Math.floor(18 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`获得 ${anim.goldReward} 金币`, W / 2, goldY);
        ctx.restore();

        // 提示文字
        const tipY = goldY + 40 * s;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点击任意位置继续', W / 2, tipY);
        ctx.restore();
      }
    }

    Renderer.prototype._initStarlightFoam = function(rect) {
      const bubbles = [];
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random());
        const x = rect.x + rect.w * 0.5 + Math.cos(a) * rr * rect.w * 0.35;
        const y = rect.y + rect.h * 0.08 + Math.sin(a) * rr * rect.h * 0.15;
        const r = 10 + Math.random() * 21;
        const row = Math.floor(i / 8);
        const col = i;
        const alpha = 0.58 + Math.random() * 0.32;
        const phase = col * 0.52 + row * 0.78;
        bubbles.push({ x, y, r, row, col, alpha, phase });
      }
      return bubbles;
    };

    Renderer.prototype._drawStarlightFoam = function(ctx, bubbles, rect, t, s) {
      // 底层光晕床垫
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sway = Math.sin(t * 1.35) * 5 * s;
      const cx = rect.x + rect.w / 2 + sway;
      const cy = rect.y + rect.h * 0.07;
      const grad = ctx.createRadialGradient(cx, cy, 10 * s, cx, cy, rect.w * 0.65);
      grad.addColorStop(0, 'rgba(255,255,255,0.24)');
      grad.addColorStop(0.55, 'rgba(230,250,255,0.12)');
      grad.addColorStop(1, 'rgba(230,250,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rect.w * 0.48, rect.h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 浓密气泡
      bubbles.forEach(b => {
        const rhythm = Math.sin(t * 1.55 + b.row * 0.72);
        const x = b.x + rhythm * (5 + b.row * 1.5) * s + Math.sin(t * 1.55 + b.phase) * 1.5 * s;
        const y = b.y + Math.cos(t * 1.55 + b.col * 0.38) * 3.5 * s;
        const r = b.r * (1 + Math.sin(t * 1.55 + b.phase) * 0.045) * s;
        const alpha = b.alpha * (0.9 + Math.sin(t * 1.55 + b.phase) * 0.08);
        this._drawFoamBubble(ctx, x, y, r, alpha);
      });
    };

    Renderer.prototype._drawFoamBubble = function(ctx, x, y, r, alpha) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const glow = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, 1, x, y, r * 1.45);
      glow.addColorStop(0, `rgba(255,255,255,${alpha * 0.46})`);
      glow.addColorStop(0.45, `rgba(235,250,255,${alpha * 0.22})`);
      glow.addColorStop(1, 'rgba(235,250,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
      ctx.fill();

      const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, 1, x, y, r);
      body.addColorStop(0, `rgba(255,255,255,${alpha})`);
      body.addColorStop(0.34, `rgba(255,255,255,${alpha * 0.44})`);
      body.addColorStop(0.72, `rgba(224,246,255,${alpha * 0.18})`);
      body.addColorStop(1, `rgba(255,255,255,${alpha * 0.08})`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.65})`;
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.96, -0.25, Math.PI * 1.23);
      ctx.stroke();

      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.18, r * 0.1, -0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    Renderer.prototype._completeAbsorbStarsAnim = function(game) {
      const anim = game._absorbStarsAnim;
      if (!anim) return;
      const targetCard = (game.hand || []).find(c => c && c.id === anim.targetCardId);
      if (targetCard) {
        targetCard.absorbBonus = (targetCard.absorbBonus || 0) + anim.absorbTotal;
      }
      if (anim.potionIndex !== undefined && anim.potionIndex >= 0 && game.potions) {
        game.potions.splice(anim.potionIndex, 1);
      }
      if (game.storageManager) game.storageManager.saveProgress();
      game._absorbStarsAnim = null;
      game._absorbStarsSelectedCardId = null;
      game.potionMode = null;
      game.state = anim.prePotionState || 'playing';
      game._prePotionState = null;
    };

    Renderer.prototype._drawAbsorbStarsSelect = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const s = this.scale;
      const top = (this.safeTop || 0) + 20 * s + (this.hasDynamicIsland ? 10 * s : 0);
      const selectedId = game._absorbStarsSelectedCardId;
      const hand = (game.hand || []).filter(c => c);
      const anim = game._absorbStarsAnim;

      // 动画总时长：晃动 1000ms + 飞行 800ms + 滚动 500ms + 停留 500ms
      const SHAKE_DURATION = 1000;
      const FLY_DURATION = 800;
      const ROLL_DURATION = 500;
      const HOLD_DURATION = 500;
      const TOTAL_DURATION = SHAKE_DURATION + FLY_DURATION + ROLL_DURATION + HOLD_DURATION;

      // 动画完成，应用 absorbBonus 并返回
      if (anim && Date.now() - anim.startTime >= TOTAL_DURATION) {
        this._completeAbsorbStarsAnim(game);
        return;
      }

      // === 标题（左上角返回按钮） ===
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
      this.absorbStarsBackRect = { x: backIconX - 14 * s, y: titleY - 18 * s, w: backIconSize + 28 * s, h: 36 * s };

      ctx.save();
      ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('吸星大法', W / 2, titleY);
      ctx.restore();

      // === 副标题 ===
      const subTitleY = titleY + 52 * s;
      ctx.save();
      ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('选择一张手牌，吸收其他手牌分数', W / 2, subTitleY);
      ctx.restore();

      // === 分隔线 ===
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

      // === 手牌网格 ===
      const cardW = this.cardW;
      const cardH = this.cardH;
      const gap = 8 * s;
      const cols = hand.length <= 4 ? hand.length : (hand.length > 9 ? 4 : 3);
      const rows = Math.ceil(hand.length / cols);
      const totalGridW = cols * cardW + (cols - 1) * gap;
      const totalGridH = rows * cardH + (rows - 1) * gap;
      const gridStartX = (W - totalGridW) / 2;
      const gridStartY = (H - totalGridH) / 2 - 10 * s;

      this.absorbStarsCardRects = [];
      const cardCenters = {};
      const elapsed = anim ? Date.now() - anim.startTime : 0;
      hand.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridStartX + col * (cardW + gap);
        const y = gridStartY + row * (cardH + gap);
        const isSelected = card.id === selectedId;
        const isSource = anim && anim.sourceCardIds.includes(card.id);
        const isTarget = anim && card.id === anim.targetCardId;
        // 分数滚动阶段隐藏目标卡牌原本的分数，由下方动画层绘制滚动/停留分数
        const hideScore = !!(isTarget && anim && elapsed >= SHAKE_DURATION + FLY_DURATION);

        // 使用卡牌自身的 selected_template 作为选中态，不额外绘制边框
        const wasSelected = card.selected;
        const wasSelectOffset = card.selectOffset;
        card.selected = isSelected;
        card.selectOffset = 0;
        this.drawCard(card, x, y, false, null, null, hideScore);
        card.selected = wasSelected;
        card.selectOffset = wasSelectOffset;
        this.absorbStarsCardRects.push({ x, y, w: cardW, h: cardH, card });
        cardCenters[card.id] = { x: x + cardW / 2, y: y + cardH / 2 };

        // 阶段1：其他卡牌分数轻微晃动
        if (isSource && anim) {
          const elapsed = Date.now() - anim.startTime;
          if (elapsed < SHAKE_DURATION) {
            const shakeOffset = Math.sin(elapsed / 40) * 1.5 * s;
            ctx.save();
            ctx.fillStyle = '#faf6ee';
            ctx.fillRect(x + cardW / 2 - 18 * s, y + cardH * 0.74 - 8 * s + shakeOffset, 36 * s, 16 * s);
            ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
            ctx.fillStyle = '#1a2f4a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${card.score}分`, x + cardW / 2, y + cardH * 0.74 + shakeOffset);
            ctx.restore();
          }
        }
      });

      // 动画层：飞行星星 + 目标分数滚动
      if (anim) {
        const elapsed = Date.now() - anim.startTime;

        // 阶段2：金色八角星从其他卡牌飞向目标卡牌
        if (elapsed >= SHAKE_DURATION && elapsed < SHAKE_DURATION + FLY_DURATION) {
          const flyProgress = (elapsed - SHAKE_DURATION) / FLY_DURATION;
          const ease = Easing.easeOutCubic(flyProgress);
          const targetCenter = cardCenters[anim.targetCardId];
          if (targetCenter) {
            anim.sourceCardIds.forEach((sourceId, idx) => {
              const sourceCenter = cardCenters[sourceId];
              if (!sourceCenter) return;
              const stagger = idx * 0.05;
              const localProgress = Math.min(1, Math.max(0, ease * 1.15 - stagger));
              const starX = sourceCenter.x + (targetCenter.x - sourceCenter.x) * localProgress;
              const starY = sourceCenter.y + (targetCenter.y - sourceCenter.y) * localProgress;
              const starSize = 6 * s + 2 * s * (1 - localProgress);
              const alpha = localProgress < 0.92 ? 1 : (1 - localProgress) / 0.08;
              this._drawOctStar(ctx, starX, starY, starSize, alpha);
            });
          }
        }

        // 阶段3：目标卡牌分数快速滚动更新，结束后停留 500ms
        if (elapsed >= SHAKE_DURATION + FLY_DURATION) {
          const rollElapsed = elapsed - SHAKE_DURATION - FLY_DURATION;
          const targetCenter = cardCenters[anim.targetCardId];
          if (targetCenter) {
            const cx = targetCenter.x;
            const cy = targetCenter.y + cardH * 0.24;
            ctx.save();
            ctx.font = `bold ${Math.floor(11 * s)}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (rollElapsed < ROLL_DURATION) {
              const rollProgress = rollElapsed / ROLL_DURATION;
              const rollEase = Easing.easeOutCubic(rollProgress);
              const offset = 8 * s;
              ctx.globalAlpha = 1 - rollEase;
              ctx.fillStyle = '#1a2f4a';
              ctx.fillText(`${anim.oldScore}分`, cx, cy - rollEase * offset);
              ctx.globalAlpha = rollEase;
              ctx.fillText(`${anim.newScore}分`, cx, cy + (1 - rollEase) * offset);
            } else {
              // 停留阶段直接显示新分数
              ctx.fillStyle = '#1a2f4a';
              ctx.fillText(`${anim.newScore}分`, cx, cy);
            }
            ctx.restore();
          }
        }
      }

      // === 确定按钮 ===
      if (!anim) {
        const btnAreaY = H - 75 * s;
        const btnW = 160 * s;
        const btnH = 46 * s;
        const btnX = (W - btnW) / 2;
        const btnEnabled = !!selectedId;
        this.roundRect(btnX, btnAreaY, btnW, btnH, 10 * s,
          btnEnabled ? '#c4a35a' : '#d4c9a8',
          btnEnabled ? null : '#bbb', btnEnabled ? 0 : 1.5 * s);
        ctx.save();
        ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('确定', btnX + btnW / 2, btnAreaY + btnH / 2);
        ctx.restore();
        this.absorbStarsConfirmBtnRect = { x: btnX, y: btnAreaY, w: btnW, h: btnH, enabled: btnEnabled };
      }
    }
};
