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
      ctx.fillText('复刻水', W / 2, titleY);
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
      const btnSize = 52 * s;
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
        ctx.fillText(letter, x + btnSize / 2, y + btnSize / 2);
        ctx.restore();

        if (canSelect) {
          this.potionLetterRects.push({ x, y, w: btnSize, h: btnSize, letter });
        }
      });

      const gridBottomY = gridStartY + Math.ceil(letters.length / cols) * (btnSize + btnGap);

      // === 已选字母提示 ===
      if (selected.length > 0) {
        const tipY = gridBottomY + 18 * s;
        const tipTexts = selected.map(l => {
          const base = LETTER_SCORE[l];
          const up = letterUpgrades.get(l) || {};
          const score = Math.floor(base * (up.mult || 1)) + (up.add || 0);
          return `${l}=${score}`;
        }).join('  vs  ');
        ctx.save();
        ctx.font = `bold ${Math.floor(14 * s)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tipTexts, W / 2, tipY);
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
          ctx.globalAlpha = 0.3 + progress * 0.7;
          ctx.translate(cx, cy);
          ctx.scale(cardScale, cardScale);
          this.drawCard(tempCard, -this.cardW / 2, -this.cardH / 2, false, score);
          ctx.restore();
        });
      } else if (anim.phase === 'result') {
        const resultElapsed = now - (anim.resultStartTime || anim.startTime + 2000);
        const fadeIn = Math.min(resultElapsed / 300, 1);

        // 遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 结果标题
        const titleY = H * 0.25;
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.font = `bold ${Math.floor(30 * s)}px Georgia, serif`;
        ctx.fillStyle = anim.success ? '#c4a35a' : '#c44536';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(anim.success ? '复刻成功！' : '复刻失败…', W / 2, titleY);
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
          ctx.globalAlpha = fadeIn;

          const tempCard = {
            letter,
            score,
            baseScore: base,
            upgraded: true,
            upgradeMult: 1,
            animOffset: { scale: 1, opacity: 1 }
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

};
