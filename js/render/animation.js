const { Easing } = require('../animation');
const { LETTER_SCORE } = require('../data');

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

};
