const { Easing } = require('../animation');

module.exports = function extendEffects(Renderer) {
    Renderer.prototype._drawPropCard = function(ctx, prop, x, y, w, h, s, showDisabled = true, showPredicted = true) {
      const iconName = prop.trigger || prop.effect;
      const iconData = this.shopCardImages[iconName];
      let offsetY = prop._jumpOffsetY || 0;
  
      // shield_illegal 触发动画（非法单词时的跳跃+光晕，跳2次每次200ms）
      if (prop._shieldAnimStart && prop.trigger === 'shield_illegal') {
        const elapsed = Date.now() - prop._shieldAnimStart;
        const totalDuration = 400; // 2次 × 200ms
        if (elapsed < totalDuration) {
          const cycle = 200;
          const cycleProgress = (elapsed % cycle) / cycle;
          offsetY = Easing.jump(cycleProgress, 12 * s);
          prop._triggered = true;
        } else {
          prop._shieldAnimStart = null;
          prop._triggered = false;
          offsetY = 0;
        }
      }
  
      // letter_god 呼吸光晕（由 _drawLetterGodAnim 统一管理时长）
      if (prop._letterGodAnimStart && prop.trigger === 'letter_god') {
        prop._triggered = true;
      }
  
      const finalY = y + offsetY;
      const r = 4 * s;
  
      // === 自毁动画（撕裂效果）===
      let destroyProgress = 0;
      if (prop._destroying && prop._destroyStart) {
        const destroyElapsed = Date.now() - prop._destroyStart;
        const destroyDuration = 900;
        destroyProgress = Math.min(destroyElapsed / destroyDuration, 1);
      }
  
      // === 星辰燔边边框（女巫牌触发时）===
      if (prop.type === 'witch') {
        if (prop._triggered) {
          if (!prop._sparkParticles) prop._sparkParticles = [];
          if (!prop._sparkLastEmit || Date.now() - prop._sparkLastEmit > 60) {
            const fresh = this._createSparkParticles(x, finalY, w, h, s, 24);
            prop._sparkParticles.push(...fresh);
            prop._sparkLastEmit = Date.now();
          }
          prop._sparkParticles = this._updateAndDrawSparkParticles(ctx, prop._sparkParticles, s);
        } else if (prop._sparkParticles && prop._sparkParticles.length > 0) {
          prop._sparkParticles = this._updateAndDrawSparkParticles(ctx, prop._sparkParticles, s);
        }
      }
  
      // 自毁动画变换
      if (destroyProgress > 0) {
        ctx.save();
        const centerX = x + w / 2;
        const centerY = finalY + h / 2;
        const eased = Easing.easeOutCubic(destroyProgress);
        ctx.translate(centerX, centerY);
        ctx.rotate(eased * 0.3);
        ctx.scale(1 - eased * 0.5, 1 - eased * 0.5);
        ctx.translate(-centerX, -centerY);
        ctx.globalAlpha = 1 - eased;
      }
  
      // 圆角裁剪（与空位形状一致）
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + r, finalY);
      ctx.lineTo(x + w - r, finalY);
      ctx.quadraticCurveTo(x + w, finalY, x + w, finalY + r);
      ctx.lineTo(x + w, finalY + h - r);
      ctx.quadraticCurveTo(x + w, finalY + h, x + w - r, finalY + h);
      ctx.lineTo(x + r, finalY + h);
      ctx.quadraticCurveTo(x, finalY + h, x, finalY + h - r);
      ctx.lineTo(x, finalY + r);
      ctx.quadraticCurveTo(x, finalY, x + r, finalY);
      ctx.closePath();
      ctx.clip();
  
      if (iconData && iconData.loaded && iconData.img) {
        const cardAspect = w / h;
        const aspect = (iconData.width > 0 && iconData.height > 0)
          ? iconData.width / iconData.height
          : cardAspect;
        const imageScale = 1.02; // 等比例放大 2%，避免超出圆角裁剪区
        let drawW, drawH, imgX, imgY;
        if (aspect > cardAspect) {
          drawW = w * imageScale;
          drawH = drawW / aspect;
        } else {
          drawH = h * imageScale;
          drawW = drawH * aspect;
        }
        imgX = x + (w - drawW) / 2;
        imgY = finalY + (h - drawH) / 2;
        ctx.drawImage(iconData.img, imgX, imgY, drawW, drawH);
      } else {
        this.roundRect(x, finalY, w, h, 4 * s, '#2d2d3a');
        this.drawShopCardIcon(x + (w - 24 * s) / 2, finalY + (h - 24 * s) / 2, 24 * s, iconName);
      }
      ctx.restore();
  
      // 底部蒙层 + 名字（临时隐藏）
      /*
      const maskH = Math.max(h * 0.35 - 8 * s, 0);
      const maskY = finalY + h - maskH;
      const maskR = Math.min(r, maskH / 2);
      this.roundRect(x + 3, maskY, w - 6, maskH, maskR, 'rgba(0,0,0,0.55)');
  
      // 名字（自适应字号）
      ctx.save();
      const fontSize = Math.min(Math.floor(10 * s), Math.floor(w / 6));
      ctx.font = `bold ${Math.max(7, fontSize)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(prop.name, x + w / 2, maskY + maskH / 2);
      ctx.restore();
      */
  
      // 剩余次数标签（limit 型女巫牌，右上角）
      if (prop.limit !== undefined && prop.usesLeft !== undefined) {
        ctx.save();
        const badgeSize = 14 * s;
        const badgeX = x + w - badgeSize - 2 * s + 1;
        const badgeY = finalY + 2 * s - 1;
        const badgeColor = prop.usesLeft > 0 ? '#e74c3c' : '#7f8c8d';
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = badgeColor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        ctx.font = `bold ${Math.max(7, Math.floor(8 * s))}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${prop.usesLeft}`, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 0.5 * s);
        ctx.restore();
      }
  
      // 预言字母标记（预言家牌，右上角）
      if (showPredicted && prop.trigger === 'predicted_letter' && prop._predictedLetter) {
        ctx.save();
        const badgeSize = 18 * s;
        const centerX = x + w - badgeSize / 2 - 2 * s;
        const centerY = finalY + badgeSize / 2 + 2 * s;
        const floatY = Math.sin(Date.now() / 500) * 1; // 微弱上下飘动 ±1px
        ctx.beginPath();
        ctx.arc(centerX, centerY + floatY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#9b59b6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        ctx.font = `bold ${Math.max(10, Math.floor(11 * s))}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prop._predictedLetter, centerX, centerY + floatY + 0.5 * s);
        ctx.restore();
      }
  
      // 撕裂线条效果（自毁动画期间）
      if (destroyProgress > 0) {
        ctx.save();
        const tearAlpha = Math.min(destroyProgress * 2, 1);
        ctx.strokeStyle = `rgba(0,0,0,${tearAlpha})`;
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        // 左下到右上的斜线
        ctx.moveTo(x + w * 0.1, finalY + h * 0.9);
        ctx.lineTo(x + w * 0.3, finalY + h * 0.7);
        ctx.moveTo(x + w * 0.7, finalY + h * 0.3);
        ctx.lineTo(x + w * 0.9, finalY + h * 0.1);
        // 横向裂缝
        ctx.moveTo(x + w * 0.2, finalY + h * 0.5);
        ctx.lineTo(x + w * 0.5, finalY + h * 0.45);
        ctx.moveTo(x + w * 0.5, finalY + h * 0.55);
        ctx.lineTo(x + w * 0.8, finalY + h * 0.5);
        ctx.stroke();
        ctx.restore();
      }
  
      // 恢复自毁动画变换
      if (destroyProgress > 0) {
        ctx.restore();
      }
  
      // 禁用状态：灰色半透明蒙层 + 锁图标（由调用方控制是否显示，支持动画过渡）
      if (showDisabled && prop._disabled) {
        ctx.save();
        this.roundRect(x, finalY, w, h, r, 'rgba(60, 60, 60, 0.5)');
  
        const iconSize = 20 * s;
        const iconX = x + (w - iconSize) / 2;
        const iconY = finalY + (h - iconSize) / 2;
  
        if (this.cardDisableIconLoaded && this.cardDisableIcon) {
          ctx.drawImage(this.cardDisableIcon, iconX, iconY, iconSize, iconSize);
        } else {
          ctx.font = `bold ${Math.floor(iconSize)}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔒', x + w / 2, finalY + h / 2);
        }
  
        ctx.restore();
      }
    }

    Renderer.prototype._createSparkParticles = function(x, y, w, h, s, count) {
      const particles = [];
      const perSide = Math.max(6, Math.floor(count / 4));
  
      const emit = (sx, sy, ex, ey, dx, dy, n) => {
        const lenX = ex - sx;
        const lenY = ey - sy;
        for (let i = 0; i < n; i++) {
          const t = Math.random();
          const px = sx + lenX * t;
          const py = sy + lenY * t;
          const isGold = Math.random() < 0.15;
          const spd = (0.15 + Math.random() * 0.5) * s;
          const life = 8 + Math.floor(Math.random() * 22);
          const size = (0.5 + Math.random() * 2.0) * s;
  
          let cr, cg, cb;
          if (isGold) {
            cr = 251; cg = 191; cb = 36;
          } else if (Math.random() < 0.55) {
            cr = 233; cg = 213; cb = 255;
          } else {
            cr = 139; cg = 92; cb = 246;
          }
  
          particles.push({
            x: px, y: py,
            vx: dx * spd + (Math.random() - 0.5) * 0.15 * s,
            vy: dy * spd + (Math.random() - 0.5) * 0.1 * s,
            life, maxLife: life,
            size,
            cr, cg, cb,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpd: 0.1 + Math.random() * 0.3,
          });
        }
      };
  
      emit(x, y, x + w, y, 0, -1, perSide);
      emit(x, y + h, x + w, y + h, 0, 1, perSide);
      emit(x, y, x, y + h, -1, 0, perSide);
      emit(x + w, y, x + w, y + h, 1, 0, perSide);
  
      return particles;
    }

    Renderer.prototype._updateAndDrawSparkParticles = function(ctx, particles, s) {
      const alive = [];
  
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
  
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.life <= 0) continue;
        alive.push(p);
  
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.twinkle += p.twinkleSpd;
  
        const alpha = p.life / p.maxLife;
        if (alpha <= 0.01) continue;
  
        const flicker = 0.6 + 0.4 * Math.sin(p.twinkle);
        const ca = alpha * flicker;
        const sz = p.size;
  
        // 十字光芒
        ctx.strokeStyle = `rgba(${p.cr},${p.cg},${p.cb},${ca * 0.5})`;
        ctx.lineWidth = sz * 0.25;
        ctx.beginPath();
        ctx.moveTo(p.x - sz, p.y);
        ctx.lineTo(p.x + sz, p.y);
        ctx.moveTo(p.x, p.y - sz);
        ctx.lineTo(p.x, p.y + sz);
        ctx.stroke();
  
        // 核心
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${ca})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 0.35, 0, Math.PI * 2);
        ctx.fill();
  
        // 外圈微光
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${ca * 0.12})`;
        ctx.fill();
      }
  
      ctx.restore();
      return alive;
    }

    Renderer.prototype._drawLashBorder = function(ctx, x, y, w, h, r, s, elapsedSec, duration = 0.7) {
      const cycle = Math.min(elapsedSec / duration, 1);
      const breathe = 0.5 + 0.5 * Math.sin(cycle * Math.PI);
  
      ctx.save();
  
      // 1. 外层光晕描边（缩到 0.3 比例）
      this._roundedRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = `rgba(180,100,255,${0.25 + breathe * 0.6})`;
      ctx.lineWidth = (4 + breathe * 3) * s;
      ctx.shadowColor = `rgba(160,75,240,${0.35 + breathe * 0.5})`;
      ctx.shadowBlur = (7 + breathe * 5) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
  
      // 2. 内层细描边
      this._roundedRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = `rgba(230,200,255,${0.25 + breathe * 0.35})`;
      ctx.lineWidth = 0.8 * s;
      ctx.shadowColor = `rgba(200,150,255,${0.3 + breathe * 0.4})`;
      ctx.shadowBlur = (4 + breathe * 3) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
  
      // 3. 雾层（缩到 0.3 比例）
      this._roundedRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = `rgba(140,60,230,${0.15 + breathe * 0.2})`;
      ctx.lineWidth = (6 + breathe * 4) * s;
      ctx.shadowColor = `rgba(120,40,210,${0.1 + breathe * 0.18})`;
      ctx.shadowBlur = 8 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
  
      // 4. 妖雾粒子（状态驱动，每帧持续渗出，cycle 0.1~0.4）
      if (!this._lashParticles) this._lashParticles = [];
  
      // 新动画周期开始时清空旧粒子
      if (cycle < 0.05) {
        this._lashParticles = [];
      }
  
      // 在 cycle 0.1~0.4 期间，每帧概率生成新粒子（8 个起源点，适配小方块）
      if (cycle > 0.1 && cycle < 0.4) {
        const origins = this._borderPoints(x, y, w, h, 8);
        origins.forEach((o) => {
          if (Math.random() < 0.32) {
            for (let i = 0; i < 3; i++) {
              const angle = Math.atan2(o.ny, o.nx) + (Math.random() * 1.2 - 0.6);
              const spd = 1.3 * (0.5 + Math.random() * 0.7) * s;
              this._lashParticles.push({
                x: o.x,
                y: o.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: Math.floor(35 * (0.3 + Math.random() * 0.7)),
                maxLife: 35,
                size: (0.5 + Math.random() * 1.5) * s,
                color: { r: 180, g: 110, b: 255 }
              });
            }
          }
        });
      }
  
      // 更新并绘制粒子（像 HTML 原版一样：位置更新 + 阻力衰减）
      const alive = [];
      for (const p of this._lashParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.vx *= 0.965;
        p.vy *= 0.965;
        if (p.life > 0) alive.push(p);
      }
      this._lashParticles = alive;
  
      for (const p of this._lashParticles) {
        const a = (p.life / p.maxLife) * 0.85;
        if (a < 0.02) continue;
        ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${a})`;
        ctx.shadowColor = `rgba(140,70,230,${a * 0.5})`;
        ctx.shadowBlur = p.size * 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
  
        // 雾团光晕（存活期>40%）
        if (p.life / p.maxLife > 0.4) {
          const glowAlpha = (p.life / p.maxLife) * 0.15;
          ctx.fillStyle = `rgba(160,90,240,${glowAlpha})`;
          ctx.shadowColor = 'rgba(140,70,230,0.3)';
          ctx.shadowBlur = 3 * s;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
  
      // 动画快结束时清空粒子，防止残留到下一轮
      if (cycle >= 0.95) {
        this._lashParticles = [];
      }
  
      ctx.restore();
    }

    Renderer.prototype._borderPoints = function(x, y, w, h, n) {
      const perim = w * 2 + h * 2;
      const pts = [];
      for (let i = 0; i < n; i++) {
        let d = (i / n) * perim;
        let px, py, nx, ny;
        if (d <= w) { px = x + d; py = y; nx = 0; ny = -1; }
        else { d -= w; if (d <= h) { px = x + w; py = y + d; nx = 1; ny = 0; }
        else { d -= h; if (d <= w) { px = x + w - d; py = y + h; nx = 0; ny = 1; }
        else { d -= w; px = x; py = y + h - d; nx = -1; ny = 0; }}}
        pts.push({ x: px, y: py, nx, ny });
      }
      return pts;
    }

    Renderer.prototype._drawFancyLabel = function(ctx, cx, cy, s, text, scale, elapsed) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
  
      const fontSize = Math.floor(28 * s);
      const t = elapsed * 0.001;
  
      // ============ 方案B · 光晕呼吸 ============
  
      // 1. 底层大光晕（呼吸）—— 透明度适度、半径缩小
      const breathe = 0.5 + 0.5 * Math.cos(t * 3); // cos(0)=1，弹出瞬间光晕最大
      for (let i = 3; i >= 1; i--) {
        const r = (6 + i * 3 + breathe * 2) * s;
        const g = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${0.35 - i * 0.06})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.30 - i * 0.035})`);
        g.addColorStop(1, `rgba(255,255,255,${0.25 - i * 0.02})`);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
  
      // 3. 金色粒子（12个）
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 / 12) * i + t * 0.35;
        const dist = (24 + Math.sin(t * 2 + i) * 7) * s;
        const px = Math.cos(a) * dist;
        const py = Math.sin(a) * dist;
        const alpha = 0.40 + Math.sin(t * 3 + i) * 0.20;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,100,${alpha})`;
        ctx.fill();
      }
  
      // 4. 文字（深紫描边 + 紫色主体 + 金色外发光，x/+ 前缀小一点）
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
  
      const prefix = (text.length >= 2 && /[x+\-×]/.test(text[0])) ? text[0] : '';
      const numStr = prefix ? text.slice(1) : text;
      const pSize = prefix ? Math.floor(fontSize * 0.78) : fontSize;
      const pYOff = prefix ? (fontSize - pSize) / 2 - 1 * s : 0;
  
      ctx.font = `900 ${pSize}px sans-serif`;
      const pW = prefix ? ctx.measureText(prefix).width : 0;
      ctx.font = `900 ${fontSize}px sans-serif`;
      const nW = ctx.measureText(numStr).width;
      const gap = 1 * s;
      const startX = -(pW + gap + nW) / 2;
      const pX = startX + pW / 2;
      const nX = startX + pW + gap + nW / 2;
  
      const drawLayer = (styleFn, drawFn) => {
        styleFn();
        if (prefix) {
          ctx.font = `900 ${pSize}px sans-serif`; drawFn(prefix, pX, pYOff);
          ctx.font = `900 ${fontSize}px sans-serif`; drawFn(numStr, nX, 0);
        } else {
          ctx.font = `900 ${fontSize}px sans-serif`; drawFn(text, 0, 0);
        }
      };
  
      // 深紫描边
      drawLayer(
        () => { ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#2a0850'; },
        (t, x, y) => ctx.strokeText(t, x, y)
      );
  
      // 紫色主体 + 金色外发光
      drawLayer(
        () => {
          ctx.shadowColor = 'rgba(230,180,60,0.8)';
          ctx.shadowBlur = 6 * s;
          ctx.shadowOffsetY = 1 * s;
          ctx.fillStyle = '#64009e';
        },
        (t, x, y) => ctx.fillText(t, x, y)
      );
  
      // 白色高光（向上偏移）
      drawLayer(
        () => {
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
        },
        (t, x, y) => ctx.fillText(t, x, y - fontSize * 0.025)
      );
  
      ctx.restore();
      ctx.restore();
    }

    Renderer.prototype._drawScaledButton = function(ctx, label, x, y, w, h, s, pressed, options = {}) {
      const { color = '#c4a35a', textColor = '#fff', radius = 8, stroke = null, lineWidth = 1.5 } = options;
      const scale = pressed ? 0.95 : 1;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(scale, scale);
      this.roundRect(-w / 2, -h / 2, w, h, radius * s, color, stroke, stroke ? lineWidth * s : null);
      this.text(label, 0, 0, 16, textColor);
      ctx.restore();
    }

    Renderer.prototype._drawTitleDivider = function(ctx, x, y, w, s, options = {}) {
      const {
        color = '#c4a35a',
        lineWidth = 1.2,
        hasDiamond = true,
        diamondSize = 6,
        diamondColor = '#c4a35a',
        gap = 10
      } = options;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * s;
      const cx = x + w / 2;
      const gapPx = gap * s;
      // 左线
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx - gapPx, y);
      ctx.stroke();
      // 右线
      ctx.beginPath();
      ctx.moveTo(cx + gapPx, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      if (hasDiamond) {
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = diamondColor;
        ctx.fillRect(-diamondSize * s / 2, -diamondSize * s / 2, diamondSize * s, diamondSize * s);
        ctx.restore();
      }
      ctx.restore();
    }

    Renderer.prototype._drawModalPanel = function(ctx, W, H, s, config) {
      const {
        isClosing, closeStartTime, closeDuration = 200, closeOffset = 40,
        width = 300, height = 340, enterOffset = 25, enterDuration = 350,
        overlayAlpha = 0.7, overlayFadeInDuration = 200,
        bgColor = '#faf6ee', borderColor = '#c4a35a', borderRadius = 14, borderWidth = 1.5,
        onCloseComplete, elapsed
      } = config;
  
      const closeElapsed = isClosing ? Date.now() - (closeStartTime || Date.now()) : 0;
      const closeProgress = isClosing ? Math.min(closeElapsed / closeDuration, 1) : 0;
  
      if (isClosing && closeProgress >= 1) {
        onCloseComplete?.();
        return null;
      }
  
      const closeSlideY = isClosing ? -closeProgress * closeOffset * s : 0;
      const closeAlpha = isClosing ? 1 - closeProgress : 1;
  
      ctx.save();
  
      // 遮罩
      const overlayA = isClosing
        ? overlayAlpha * (1 - closeProgress)
        : overlayAlpha * Math.min(elapsed / overlayFadeInDuration, 1);
      ctx.fillStyle = `rgba(0,0,0,${overlayA})`;
      ctx.fillRect(0, 0, W, H);
  
      // 面板入场
      const enterProgress = Math.min(elapsed / enterDuration, 1);
      const enterEase = Easing.easeOutBack(enterProgress);
      const pw = width * s;
      const ph = height * s;
      const px = (W - pw) / 2;
      const basePy = (H - ph) / 2;
      const py = basePy + (1 - enterEase) * enterOffset * s + closeSlideY;
  
      ctx.globalAlpha = closeAlpha;
      this.roundRect(px, py, pw, ph, borderRadius * s, bgColor, borderColor, borderWidth * s);
      ctx.restore();
  
      return { px, py, pw, ph, elapsed, enterProgress, closeProgress, closeAlpha };
    }

    Renderer.prototype._drawCardGlow = function(ctx, cardX, cardY, cardW, cardH, s) {
      ctx.save();
      const t = Date.now();
      const cardCX = cardX + cardW / 2;
      const cardCY = cardY + cardH / 2;
      const haloR = Math.max(cardW, cardH) * 0.85;
      const pulse = 0.5 + 0.5 * Math.sin(t / 500);
      const haloGrad = ctx.createRadialGradient(cardCX, cardCY, haloR * 0.25, cardCX, cardCY, haloR);
      haloGrad.addColorStop(0, `rgba(255,215,0,${0.12 + 0.06 * pulse})`);
      haloGrad.addColorStop(0.5, `rgba(255,200,60,${0.06 + 0.04 * pulse})`);
      haloGrad.addColorStop(1, 'rgba(255,180,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cardCX, cardCY, haloR, 0, Math.PI * 2);
      ctx.fill();
  
      const sparkles = [
        { x: cardX - 10*s, y: cardY - 6*s, r: 5, ph: 0.0 },
        { x: cardX + cardW + 8*s, y: cardY + 4*s, r: 4, ph: 2.0 },
        { x: cardX + cardW + 6*s, y: cardY + cardH, r: 5, ph: 4.0 },
        { x: cardX - 4*s, y: cardY + cardH + 6*s, r: 4, ph: 1.0 },
      ];
      sparkles.forEach((sp, i) => {
        const blink = 0.5 + 0.5 * Math.sin(t / 600 + sp.ph);
        const alpha = 0.25 + 0.55 * blink;
        const r = sp.r * (0.75 + 0.2 * blink) * s;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#ffffff';
        this._drawSparkleShape(ctx, sp.x, sp.y, r);
        ctx.restore();
      });
      ctx.restore();
    }

    Renderer.prototype._drawSparkleShape = function(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.35, y - r * 0.35);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.35, y + r * 0.35);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.35, y + r * 0.35);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x - r * 0.35, y - r * 0.35);
      ctx.closePath();
      ctx.fill();
    }

    Renderer.prototype._drawGentleStars = function(cx, cy, size, s, globalAlpha = 1, glowMult = 1) {
      const ctx = this.ctx;
      const now = Date.now();
      const breath = 0.5 + 0.5 * Math.sin(now / 800);
  
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = globalAlpha;
      ctx.shadowBlur = 0;
  
      // === 淡紫色径向光晕 ===
      const glowR = size * 0.6 * glowMult;
      const glowAlpha = 0.18 * breath * glowMult;
      const glowGrad = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, glowR);
      glowGrad.addColorStop(0, `rgba(180,140,220,${glowAlpha})`);
      glowGrad.addColorStop(0.4, `rgba(155,89,182,${glowAlpha * 0.6})`);
      glowGrad.addColorStop(1, 'rgba(155,89,182,0)');
  
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();
  
      // === 散落小星星（绕中心缓慢旋转+闪烁）===
      const starCount = 14;
      for (let i = 0; i < starCount; i++) {
        const seed = i * 137.5;
        const dist = size * (0.3 + 0.45 * Math.abs(Math.sin(seed)));
        const angle = seed + now / 1000;
        const twinkle = 0.5 + 0.5 * Math.sin(now / 350 + i * 2.5);
        const starSize = (1.6 + 1.0 * Math.sin(i * 3)) * s;
  
        ctx.fillStyle = `rgba(220,190,255,${0.9 * twinkle})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, starSize, 0, Math.PI * 2);
        ctx.fill();
      }
  
      // === 紫色五角星（复用字母之神同款）===
      const pentagramCount = 6;
      for (let i = 0; i < pentagramCount; i++) {
        const seed = i * 213.7 + 50;
        const dist = size * (0.25 + 0.5 * Math.abs(Math.sin(seed)));
        const angle = seed + now / 800;
        const twinkle = 0.5 + 0.5 * Math.sin(now / 400 + i * 3.1);
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        const starOuterR = (2.5 + 1.5 * Math.sin(i * 2.7)) * s;
        const starInnerR = starOuterR * 0.4;
        const starRot = now / 550 + i * 1.3;
  
        ctx.save();
        ctx.shadowColor = 'rgba(155,89,182,0.85)';
        ctx.shadowBlur = 10 * s * twinkle;
        ctx.fillStyle = `rgba(155,89,182,${0.85 * twinkle})`;
        this._drawStar(ctx, px, py, starOuterR, starInnerR, 5, starRot);
        ctx.restore();
  
        // 中心高光点
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255,255,255,${0.6 * twinkle})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
  
      ctx.restore();
    }

    Renderer.prototype._calcPulseScale = function(animState, maxScale = 0.3) {
      if (!animState || !animState.startTime) return { scale: 1, progress: 1 };
      const elapsed = Date.now() - animState.startTime;
      const progress = Math.min(elapsed / animState.duration, 1);
      const scale = 1 + maxScale * Math.sin(progress * Math.PI);
      return { scale, progress };
    }

};
