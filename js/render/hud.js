const { getSkillForLevel, WITCH_SKILLS, WITCH_CARDS } = require('../witch_skills');
const { Easing } = require('../animation');

module.exports = function extendHud(Renderer) {
    Renderer.prototype.drawTopHeader = function(game, showGold = true) {
      const ctx = this.ctx;
      const W = this.W;
      const s = this.scale;
      const headerOffset = (this.hasDynamicIsland ? 13 * s : 0);
      const iconSize = 34 * s;
      const iconX = 15 * s + 5 * s;
      const iconY = 10 * s + 5 * s + headerOffset;
      // top_icon 按压动画：按下时向下偏移，松手后回弹
      let pressOffsetY = 0;
      if (this._topIconPressAnim) {
        const anim = this._topIconPressAnim;
        const elapsed = Date.now() - anim.startTime;
        const duration = anim.pressing ? 80 : 150;
        const progress = Math.min(elapsed / duration, 1);
        const maxOffset = 3 * s;
        if (anim.pressing) {
          pressOffsetY = maxOffset * Easing.easeOutCubic(progress);
        } else {
          pressOffsetY = maxOffset * (1 - Easing.easeOutCubic(progress));
        }
        if (progress >= 1 && !anim.pressing) {
          this._topIconPressAnim = null;
        }
      }
      const drawIconY = iconY + pressOffsetY;
      if (this.topIcon && this.topIconLoaded) {
        ctx.drawImage(this.topIcon, iconX, drawIconY, iconSize, iconSize);
      }
      // 记录点击区域（使用当前绘制位置）
      this.topIconRect = { x: iconX, y: drawIconY, w: iconSize, h: iconSize };

      // 金币胶囊：放在 top_icon 右侧，间距 10px
      if (showGold) {
        const coinIconSize = 22 * s;
        ctx.font = `bold ${Math.floor(15 * s)}px sans-serif`;
        const goldText = String(game.gold);
        const goldTextW = ctx.measureText(goldText).width;
        const coinCapsuleW = coinIconSize + 6 * s + goldTextW + 18 * s;
        const coinCapsuleH = 32 * s;
        const coinX = iconX + iconSize + 7 * s;
        const coinY = iconY + (iconSize - coinCapsuleH) / 2 + 1 * s;
        this._drawCoinCapsuleAt(coinX, coinY, game);
      }
    }

    Renderer.prototype.drawHUD = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const s = this.scale;
      // 高度盈余/不足自适应：与 drawPlaying 保持一致
      const extraHeight = this.H - Math.floor(740 * s);
      const topOffset = extraHeight * 0.05;
      const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
      const h = 72 * s;
  
      this.drawTopHeader(game);
  
      // 游戏标题
      ctx.save();
      ctx.font = `${Math.floor(22 * s)}px ${this.titleFontFamily}`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hudTitleText = '女巫的词牌';
      const titleY = top - 12 * s + (this.hasDynamicIsland ? 3 * s : 0);
      ctx.fillText(hudTitleText, W / 2, titleY);
      const hudTitleW = ctx.measureText(hudTitleText).width;
      ctx.restore();
  
      this._drawCardBookIcon(game, W / 2, titleY, hudTitleW);
  
      // 争分夺秒倒计时条已移至 drawPlaying 出牌按钮上方
      const barW = W - 20 * s;
      const barH = h;
      const barX = 10 * s;
      const barY = top + 9 * s;
      const r = 10 * s;
      const gold = '#c4a35a';
      const darkBlue = '#1a2f4a';
  
      const witchSkill = getSkillForLevel(game.round, game._shuffledSkills);
      const bg = '#f0e0c8';
      const outerStroke = '#c5a059';
  
      // === 背景图（game_progress.png）===
      if (this.gameProgressImage && this.gameProgressLoaded) {
        ctx.drawImage(this.gameProgressImage, barX, barY, barW, barH);
      } else {
        this.roundRect(barX, barY, barW, barH, r, bg);
      }
  
      // 分隔线 + 列绘制
      const lineTop = barY + 14 * s;
      const lineBot = barY + barH - 14 * s;
      ctx.strokeStyle = outerStroke;
      ctx.lineWidth = 0.8 * s;
  
      if (witchSkill) {
        // === 四列布局（女巫技能 32%+10px + 后三列等分剩余）===
        const col1W = barW * 0.32 + 10 * s;
        const line1Offset = 20 * s;  // 第一根分割线额外右移
        const colOtherW = (barW - col1W - line1Offset) / 3;
        const colShift = 15 * s;
        const linePositions = [
          barX + col1W + line1Offset - colShift,
          barX + col1W + line1Offset + colOtherW - colShift,
          barX + col1W + line1Offset + colOtherW * 2 - colShift,
        ];
  
        // 绘制三条分隔线
        linePositions.forEach((lx) => {
          ctx.beginPath();
          ctx.moveTo(lx, lineTop);
          ctx.lineTo(lx, lineBot);
          ctx.stroke();
          // 菱形
          ctx.save();
          ctx.translate(lx, barY + barH / 2);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = outerStroke;
          ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
          ctx.restore();
        });
  
        // 列中心（各自在分割线之间居中，后三列整体左移15px）
        const c1 = barX + (col1W + line1Offset) * 0.5;
        const c2 = barX + col1W + line1Offset + colOtherW * 0.5 - colShift;
        const c3 = barX + col1W + line1Offset + colOtherW * 1.5 - colShift;
        const c4 = barX + col1W + line1Offset + colOtherW * 2.5 - colShift;
  
        // === 列1：女巫头像（大图直接显示，不裁剪 + 呼吸摇摆） ===
        const avatarH = barH + 22*s;
        const avatarW = Math.min(avatarH, col1W);
        const baseX = barX + 25* s;
        const baseY = barY + (barH - avatarH) / 2 - 5*s - 5 - 3;
        // 保存头像点击区域（提前设置，供星星动画使用）
        this.hudWitchAvatarRect = { x: baseX, y: baseY, w: avatarW, h: avatarH };
  
        // === 女巫头像背后的温柔旋转星星（在头像下层）===
        if (game._witchStarBurst) {
          const elapsed = Date.now() - game._witchStarBurst.startTime;
          const duration = 4500;
          if (elapsed < duration) {
            const fade = elapsed > 3500 ? 1 - (elapsed - 3500) / 1000 : 1;
            this._drawGentleStars(game._witchStarBurst.cx, game._witchStarBurst.cy, 80 * s, s, fade);
          } else {
            game._witchStarBurst = null;
          }
        }
  
        const witchAvatar = this.witchAvatars[`witch_${witchSkill.level}`];
  
        // 女巫呼吸缩放
        const now = Date.now();
        const breath = Math.sin(now / 1500) * 0.03;
        const scale = 1 + breath;
        const drawW = avatarW * scale;
        const drawH = avatarH * scale;
  
        ctx.save();
        // 移动到旋转中心（头像底部中心）
        ctx.translate(baseX + avatarW / 2, baseY + avatarH);
        // 绘制头像（以底部中心为原点）
        if (witchAvatar && witchAvatar.loaded && witchAvatar.img) {
          ctx.drawImage(witchAvatar.img, -drawW / 2, -drawH, drawW, drawH);
        } else {
          ctx.save();
          ctx.fillStyle = '#9b59b6';
          ctx.fillRect(-drawW / 2, -drawH, drawW, drawH);
          ctx.restore();
        }
        ctx.restore();
  
        // === 女巫技能描述标签（头像右侧，标题下方）===
        const tagH = 24 * s;
        const tagPaddingX = 11 * s;
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        let tagText = witchSkill.desc;
        if (game._witchAngryTip) {
          if (Date.now() < game._witchAngryTip.expireAt) {
            tagText = game._witchAngryTip.text;
          } else {
            game._witchAngryTip = null;
          }
        }
        const textMetrics = ctx.measureText(tagText);
        const tagW = textMetrics.width + tagPaddingX * 2;
        const tagX = baseX + avatarW ;
        const tagY = barY - 9 * s + 2 * s;
        const tagR = 6 * s;
  
        // 标签整体呼吸缩放（以中心为原点）
        const tagBreath = 1 + Math.sin(Date.now() / 1000) * 0.03;
        const tagCX = tagX + tagW / 2;
        const tagCY = tagY + tagH / 2;
        ctx.save();
        ctx.translate(tagCX, tagCY);
        ctx.scale(tagBreath, tagBreath);
        ctx.translate(-tagCX, -tagCY);
  
        // 标签背景（深紫色圆角 + 金色边框 + 底部小三角）
        const tagTipW = 7 * s;
        const tagTipH = 5 * s;
        const tagTipX = tagX + 18 * s;
        // 金色呼吸灯
        const breathe = (Math.sin(Date.now() / 900) + 1) / 2;
        ctx.save();
        ctx.fillStyle = '#5a3a6e';
        const glowAlpha = 0.15 + breathe * 0.28;
        ctx.shadowBlur = (3 + breathe * 6) * s;
        ctx.shadowColor = `rgba(196, 163, 90, ${glowAlpha})`;
        const sr = 190 + breathe * 35;
        const sg = 155 + breathe * 28;
        const sb = 85 + breathe * 18;
        ctx.strokeStyle = `rgb(${Math.floor(sr)},${Math.floor(sg)},${Math.floor(sb)})`;
        ctx.lineWidth = 1.2 * s + 1;
        ctx.beginPath();
        // 左上圆角
        ctx.moveTo(tagX + tagR, tagY);
        ctx.lineTo(tagX + tagW - tagR, tagY);
        ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + tagR);
        // 右边缘
        ctx.lineTo(tagX + tagW, tagY + tagH - tagR);
        ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - tagR, tagY + tagH);
        // 下边缘到三角右侧
        ctx.lineTo(tagTipX + tagTipW, tagY + tagH);
        // 三角右斜边
        ctx.lineTo(tagTipX, tagY + tagH + tagTipH);
        // 三角左斜边
        ctx.lineTo(tagTipX - tagTipW, tagY + tagH);
        // 下边缘到左下圆角
        ctx.lineTo(tagX + tagR, tagY + tagH);
        ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tagR);
        // 左边缘
        ctx.lineTo(tagX, tagY + tagR);
        ctx.quadraticCurveTo(tagX, tagY, tagX + tagR, tagY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
  
        // 再画一层无阴影的细边框，避免呼吸灯影响文字清晰度
        ctx.save();
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 0.6 * s;
        ctx.beginPath();
        ctx.moveTo(tagX + tagR, tagY);
        ctx.lineTo(tagX + tagW - tagR, tagY);
        ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + tagR);
        ctx.lineTo(tagX + tagW, tagY + tagH - tagR);
        ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - tagR, tagY + tagH);
        ctx.lineTo(tagTipX + tagTipW, tagY + tagH);
        ctx.lineTo(tagTipX, tagY + tagH + tagTipH);
        ctx.lineTo(tagTipX - tagTipW, tagY + tagH);
        ctx.lineTo(tagX + tagR, tagY + tagH);
        ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tagR);
        ctx.lineTo(tagX, tagY + tagR);
        ctx.quadraticCurveTo(tagX, tagY, tagX + tagR, tagY);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
  
        // 标签文字（白色）
        ctx.save();
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);
        ctx.restore();
  
        ctx.restore();
  
        // === 列2：回合 ===
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('回合', c2, barY + barH * 0.32 + 4 * s);
  
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.fillText(String(game.round), c2, barY + barH * 0.68 - 2 * s + 4 * s);
  
        // === 列3：目标分 ===
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('目标分', c3, barY + barH * 0.32 + 4 * s);
  
        const targetFontSize = game.target >= 10000 ? 18 : 22;
        ctx.font = `bold ${Math.floor(targetFontSize * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.fillText(String(game.target), c3, barY + barH * 0.68 - 2 * s + 4 * s);
  
        // === 列4：当前 ===
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('当前', c4, barY + barH * 0.32 + 4 * s);
  
        // 当前分数（带变化动画）
        if (!this._scoreUpdateLocked && this.lastScore !== game.score) {
          this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
          this.lastScore = game.score;
        }
        const scorePulse = this._calcPulseScale(this.scoreAnim, 0.2);
        let scoreScale = scorePulse.scale;
        if (scorePulse.progress >= 1) this.scoreAnim = null;
        ctx.save();
        ctx.translate(c4, barY + barH * 0.68 - 2 * s + 4);
        ctx.scale(scoreScale, scoreScale);
        const scoreFontSize = game.score >= 10000 ? 18 : 22;
        ctx.font = `bold ${Math.floor(scoreFontSize * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(game.score), 0, 0);
        ctx.restore();
  
      } else {
        // === 无女巫技能：保持原有3列布局 ===
        const line1X = barX + barW / 3;
        const line2X = barX + barW * 2 / 3;
        [line1X, line2X].forEach((lx) => {
          ctx.beginPath();
          ctx.moveTo(lx, lineTop);
          ctx.lineTo(lx, lineBot);
          ctx.stroke();
          ctx.save();
          ctx.translate(lx, barY + barH / 2);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = outerStroke;
          ctx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s);
          ctx.restore();
        });
  
        const roundCX = barX + barW / 6;
        const targetCX = barX + barW / 2;
        const scoreCX = barX + barW * 5 / 6;
  
        // 左侧：回合
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('回合', roundCX, barY + barH * 0.32);
  
        ctx.font = `bold ${Math.floor(22 * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.fillText(String(game.round), roundCX, barY + barH * 0.68 - 2 * s);
  
        // 中间：目标分
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('目标分', targetCX, barY + barH * 0.32);
  
        const targetFontSize2 = game.target >= 10000 ? 18 : 22;
        ctx.font = `bold ${Math.floor(targetFontSize2 * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.fillText(String(game.target), targetCX, barY + barH * 0.68 - 2 * s);
  
        // 右侧：当前
        ctx.font = `bold ${Math.floor(12 * s)}px sans-serif`;
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText('当前', scoreCX, barY + barH * 0.32);
  
        if (!this._scoreUpdateLocked && this.lastScore !== game.score) {
          this.scoreAnim = { from: this.lastScore, to: game.score, startTime: Date.now(), duration: 400 };
          this.lastScore = game.score;
        }
        const scorePulse = this._calcPulseScale(this.scoreAnim, 0.2);
        let scoreScale = scorePulse.scale;
        if (scorePulse.progress >= 1) this.scoreAnim = null;
        ctx.save();
        ctx.translate(scoreCX, barY + barH * 0.68 - 2 * s);
        ctx.scale(scoreScale, scoreScale);
        const scoreFontSize2 = game.score >= 10000 ? 18 : 22;
        ctx.font = `bold ${Math.floor(scoreFontSize2 * s)}px Georgia, serif`;
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(game.score), 0, 0);
        ctx.restore();
      }
  
    }

    Renderer.prototype._drawCoinCapsuleAt = function(coinCapsuleX, coinCapsuleY, game) {
      const ctx = this.ctx;
      const s = this.scale;
  
      const coinCapsuleH = 32 * s;
      const coinIconSize = 20 * s;
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      const goldText = String(game.gold);
      const goldTextW = ctx.measureText(goldText).width;
      const coinCapsuleW = coinIconSize + 6 * s + goldTextW + 18 * s;
  
      // 双层圆角边框胶囊：外层粗金边 + 内层细浅金边，浅米色背景
      const capsuleW = coinCapsuleW + 6 * s - 7 * s;
      const capsuleH = coinCapsuleH - 3 * s;
      const outerBorderW = 1.5 * s;
      const innerBorderW = 1 * s;
      // 外层：浅米色填充 + 粗深金色边框
      this.roundRect(coinCapsuleX, coinCapsuleY, capsuleW, capsuleH, capsuleH / 2, '#faf6ee', '#b8934a', outerBorderW);
      // 记录胶囊位置（商店页用于在右上角叠加广告小图标）
      this.coinCapsuleRect = { x: coinCapsuleX, y: coinCapsuleY, w: capsuleW, h: capsuleH };
      // 内层：只画细浅金色边框
      const innerGap = outerBorderW + 1 * s;
      this.roundRect(
        coinCapsuleX + innerGap,
        coinCapsuleY + innerGap,
        capsuleW - innerGap * 2,
        capsuleH - innerGap * 2,
        (capsuleH - innerGap * 2) / 2,
        null,
        '#d4c9a8',
        innerBorderW
      );
  
      // 内部隐隐立体感：顶部微弱高光 + 底部微弱阴影
      ctx.save();
      const ix = coinCapsuleX + outerBorderW;
      const iy = coinCapsuleY + outerBorderW;
      const iw = capsuleW - outerBorderW * 2;
      const ih = capsuleH - outerBorderW * 2;
      const ir = ih / 2;
      ctx.beginPath();
      ctx.moveTo(ix + ir, iy);
      ctx.lineTo(ix + iw - ir, iy);
      ctx.arcTo(ix + iw, iy, ix + iw, iy + ih, ir);
      ctx.lineTo(ix + iw, iy + ih - ir);
      ctx.arcTo(ix + iw, iy + ih, ix, iy + ih, ir);
      ctx.lineTo(ix + ir, iy + ih);
      ctx.arcTo(ix, iy + ih, ix, iy, ir);
      ctx.lineTo(ix, iy + ir);
      ctx.arcTo(ix, iy, ix + iw, iy, ir);
      ctx.closePath();
      ctx.clip();
      const innerGrad = ctx.createLinearGradient(0, iy, 0, iy + ih);
      innerGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
      innerGrad.addColorStop(0.35, 'rgba(255,255,255,0)');
      innerGrad.addColorStop(0.65, 'rgba(255,255,255,0)');
      innerGrad.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = innerGrad;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
  
      // coin.png 图标
      if (this.coinIcon && this.coinIconLoaded) {
        ctx.drawImage(this.coinIcon, coinCapsuleX + 8 * s, coinCapsuleY + (capsuleH - coinIconSize) / 2, coinIconSize, coinIconSize);
      }
  
      // 金币变化动画
      if (this.lastGold !== game.gold) {
        this.goldAnim = { startTime: Date.now(), duration: 400 };
        this.lastGold = game.gold;
      }
      const goldPulse = this._calcPulseScale(this.goldAnim, 0.3);
      let goldScale = goldPulse.scale;
      if (goldPulse.progress >= 1) this.goldAnim = null;
  
      // 金币数量（带动画缩放）
      ctx.save();
      const goldTextX = coinCapsuleX + 8 * s + coinIconSize + 6 * s - 1 * s;
      const goldTextY = coinCapsuleY + capsuleH / 2;
      ctx.translate(goldTextX + goldTextW / 2, goldTextY);
      ctx.scale(goldScale, goldScale);
      ctx.font = `bold ${Math.floor(16 * s)}px sans-serif`;
      ctx.fillStyle = '#8b6914';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(goldText, 0, 0);
      ctx.restore();
    }

    Renderer.prototype._drawHintToast = function(game) {
      const ctx = this.ctx;
      const W = this.W;
      const s = this.scale;
      if (!game.hintToast || !game.hintToast.text) return;
      const toastH = 32 * s;
      const padding = 12 * s;
      const iconSize = 56 * s;
      const iconSpacing = 6 * s;
      ctx.font = `bold ${Math.floor(13 * s)}px sans-serif`;
      const textW = ctx.measureText(game.hintToast.text).width;
      const toastW = textW + padding * 2 + iconSize + iconSpacing - 10 * s;
      const toastX = (W - toastW) / 2;
      // 位置：单词预览区上方（再往上 11px），无预览区时回退到屏幕底部
      // 支持自定义位置（如商店页道具栏下方）
      let toastY;
      if (game.hintToast.customY !== undefined && game.hintToast.customY !== null) {
        toastY = game.hintToast.customY;
      } else if (game.hintToast.customPosition === 'propBarBottom' && this.shopPropBarBottomY && game.state === 'shop') {
        toastY = this.shopPropBarBottomY + 12 * s;
      } else {
        toastY = this.wordAreaY ? this.wordAreaY - toastH - 10 * s - 3 * s - 3 * s - 3 * s : this.H - 118 * s;
      }

      // 进入动画：从下往上弹出 + 缩放（350ms easeOutBack）
      let animOffsetY = 0;
      let animAlpha = 1;
      let animScale = 1;
      if (game.hintToast.startTime) {
        const enterElapsed = Date.now() - game.hintToast.startTime;
        const enterDuration = 350;
        if (enterElapsed < enterDuration) {
          const t = Math.min(enterElapsed / enterDuration, 1);
          const eased = Easing.easeOutBack(t);
          const easedAlpha = t * (2 - t); // easeOutQuad
          animOffsetY = (1 - eased) * 50 * s;
          animAlpha = easedAlpha;
          animScale = 0.85 + 0.15 * eased;
        }
      }
      toastY += animOffsetY;

      ctx.save();
      ctx.globalAlpha = animAlpha;
      // 以 toast 中心为原点缩放
      const toastCX = toastX + toastW / 2;
      const toastCY = toastY + toastH / 2;
      ctx.translate(toastCX, toastCY);
      ctx.scale(animScale, animScale);
      ctx.translate(-toastCX, -toastCY);
      // 立体渐变背景 + 轻微阴影
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 8 * s;
      ctx.shadowOffsetY = 2 * s;
      const toastGrad = ctx.createLinearGradient(0, toastY, 0, toastY + toastH);
      toastGrad.addColorStop(0, '#fff');
      toastGrad.addColorStop(1, '#f0ebe0');
      this.roundRect(toastX, toastY, toastW, toastH, toastH / 2, toastGrad, '#c4a35a', 1.5 * s);
      ctx.shadowColor = 'transparent';

      // 顶部微弱高光条（增强立体感）
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const hlR = toastH / 2;
      ctx.moveTo(toastX + hlR, toastY + 1);
      ctx.lineTo(toastX + toastW - hlR, toastY + 1);
      ctx.arcTo(toastX + toastW, toastY + 1, toastX + toastW, toastY + hlR, hlR);
      ctx.lineTo(toastX + toastW, toastY + toastH * 0.35);
      ctx.arcTo(toastX + toastW, toastY + toastH * 0.45, toastX + toastW - hlR, toastY + toastH * 0.45, hlR * 0.3);
      ctx.lineTo(toastX + hlR, toastY + toastH * 0.45);
      ctx.arcTo(toastX, toastY + toastH * 0.45, toastX, toastY + toastH * 0.35, hlR * 0.3);
      ctx.lineTo(toastX, toastY + hlR);
      ctx.arcTo(toastX, toastY + 1, toastX + hlR, toastY + 1, hlR);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 头部 icon（底部略低于 toast 顶部，悬浮在 toast 左上角）
      const iconData = this.toastIcon;
      if (iconData && iconData.loaded && iconData.img) {
        ctx.drawImage(iconData.img, toastX - 4, toastY - 28, iconSize, iconSize);
      }

      // 深色文字
      ctx.fillStyle = '#5a4a2a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textX = toastX + padding + iconSize + iconSpacing - 10*s; // 文字整体左移
      const textY = toastY + toastH / 2;
      const dailyMatch = game.hintToast.text.match(/今日新词「(.+?)」收集成功！\((\d+)个待收集\)/);
      if (dailyMatch) {
        const [, word, remainingStr] = dailyMatch;
        const baseFont = `bold ${Math.floor(13 * s)}px sans-serif`;
        const heavyFont = `900 ${Math.floor(13 * s)}px sans-serif`;
        const p1 = '今日新词「';
        const p2 = '」收集成功！(';
        const p3 = '个待收集)';
        let cursorX = textX;
        ctx.font = baseFont;
        ctx.fillText(p1, cursorX, textY);
        cursorX += ctx.measureText(p1).width;
        ctx.font = heavyFont;
        ctx.fillText(word, cursorX, textY);
        cursorX += ctx.measureText(word).width;
        ctx.font = baseFont;
        ctx.fillText(p2, cursorX, textY);
        cursorX += ctx.measureText(p2).width;
        ctx.font = heavyFont;
        ctx.fillText(remainingStr, cursorX, textY);
        cursorX += ctx.measureText(remainingStr).width;
        ctx.font = baseFont;
        ctx.fillText(p3, cursorX, textY);
      } else {
        ctx.fillText(game.hintToast.text, textX, textY);
      }
      ctx.restore();

      // 记录 toast 位置信息（供飞行星星使用）
      this._lastToastRect = { x: toastX, y: toastY, w: toastW, h: toastH };
    }

    // 启动 toast 飞行星星动画
    // 三阶段：1) 从 toast 左边弹出 250ms；2) 停留 300ms；3) 飞行 800ms
    Renderer.prototype._startToastFlyStar = function(game) {
      const s = this.scale;
      const rect = this._lastToastRect;
      const toastCX = rect ? rect.x + rect.w / 2 : this.W / 2;
      const toastCY = rect ? rect.y + rect.h / 2 : this.H / 2;
      const toastLeft = rect ? rect.x : toastCX;
      const targetPos = this.topIconRect
        ? { x: this.topIconRect.x + this.topIconRect.w / 2, y: this.topIconRect.y + this.topIconRect.h / 2 }
        : { x: 30 * s, y: 30 * s };
      // 弹出位置：固定距离 toast 图标左侧 3px
      const popX = toastLeft - 3 * s;
      this._toastFlyStar = {
        popStartX: popX - 18 * s,
        popStartY: toastCY,
        popTargetX: popX,
        popTargetY: toastCY,
        flyTargetX: targetPos.x,
        flyTargetY: targetPos.y,
        startTime: Date.now(),
        popDuration: 250,
        holdDuration: 400,
        flyDuration: 800
      };
    }

    // 绘制飞行中的星星（三阶段：弹出 → 停留 → 飞行）
    Renderer.prototype._drawToastFlyStar = function() {
      if (!this._toastFlyStar) return;
      const fs = this._toastFlyStar;
      const elapsed = Date.now() - fs.startTime;
      const s = this.scale;
      const ctx = this.ctx;
      let x, y, scale;

      // 阶段1：从 toast 左边弹出（0 ~ 250ms，easeOutBack）
      if (elapsed < fs.popDuration) {
        const t = elapsed / fs.popDuration;
        const eased = Easing.easeOutBack(t);
        x = fs.popStartX + (fs.popTargetX - fs.popStartX) * eased;
        y = fs.popStartY + (fs.popTargetY - fs.popStartY) * eased;
        scale = eased;
      }
      // 阶段2：停留（250 ~ 550ms，轻微上下浮动）
      else if (elapsed < fs.popDuration + fs.holdDuration) {
        const holdElapsed = elapsed - fs.popDuration;
        x = fs.popTargetX;
        y = fs.popTargetY + Math.sin(holdElapsed / 120) * 2.5 * s;
        scale = 1;
      }
      // 阶段3：飞行（550 ~ 1350ms，easeOutCubic）
      else if (elapsed < fs.popDuration + fs.holdDuration + fs.flyDuration) {
        const flyElapsed = elapsed - fs.popDuration - fs.holdDuration;
        const t = flyElapsed / fs.flyDuration;
        const eased = Easing.easeOutCubic(t);
        x = fs.popTargetX + (fs.flyTargetX - fs.popTargetX) * eased;
        y = fs.popTargetY + (fs.flyTargetY - fs.popTargetY) * eased;
        scale = 1 - t * 0.4;
      }
      // 结束
      else {
        this._toastFlyStar = null;
        return;
      }

      const size = scale * 22 * s;
      ctx.save();
      const starData = this.toastStarIcon;
      if (starData && starData.loaded && starData.img) {
        ctx.shadowColor = '#c4a35a';
        ctx.shadowBlur = 12 * s;
        ctx.drawImage(starData.img, x - size / 2, y - size / 2, size, size);
      } else {
        // fallback：文字星星
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#c4a35a';
        ctx.shadowBlur = 12 * s;
        ctx.font = `bold ${Math.floor(size)}px sans-serif`;
        ctx.fillStyle = '#c4a35a';
        ctx.fillText('★', x, y);
      }
      ctx.restore();
    }

};
