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
  
      // 底部蒙层 + 名字
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

      const fontSize = Math.floor(24 * s);
      const t = elapsed * 0.001;

      // ============ 方案B · 光晕呼吸（受 scale 脉冲影响） ============

      ctx.save();
      ctx.scale(scale, scale);

      // 1. 底层大光晕（呼吸）
      const breathe = 0.5 + 0.5 * Math.cos(t * 3); // cos(0)=1，弹出瞬间光晕最大
      for (let i = 2; i >= 1; i--) {
        const r = (9 + i * 3 + breathe * 2) * s;
        const g = ctx.createRadialGradient(0, 0, 4 * s, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${0.30 - i * 0.08})`);
        g.addColorStop(0.55, `rgba(255,255,255,${0.22 - i * 0.04})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // 3. 金色粒子（6个，降低性能开销）
      const particleCount = 6;
      for (let i = 0; i < particleCount; i++) {
        const a = (Math.PI * 2 / particleCount) * i + t * 0.35;
        const dist = (24 + Math.sin(t * 2 + i) * 7) * s;
        const px = Math.cos(a) * dist;
        const py = Math.sin(a) * dist;
        const alpha = 0.40 + Math.sin(t * 3 + i) * 0.20;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,100,${alpha})`;
        ctx.fill();
      }

      ctx.restore();

      // 4. 文字与菱形背景（固定 scale=1，避免左右方块标签大小/间距不一致）
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const prefix = (text.length >= 2 && /[x+\-×]/.test(text[0])) ? text[0] : '';
      const numStr = prefix ? text.slice(1) : text;
      const pSize = fontSize;
      const pYOff = 0;
      const textYOff = 1; // 文字整体下移 1px

      ctx.font = `900 ${pSize}px sans-serif`;
      const pW = prefix ? ctx.measureText(prefix).width : 0;
      ctx.font = `900 ${fontSize}px sans-serif`;
      const nW = ctx.measureText(numStr).width;

      const gap = 6 * s;
      const startX = -(pW + gap + nW) / 2;
      const pX = startX + pW / 2;
      const nX = startX + pW + gap + nW / 2;

      const drawLayer = (styleFn, drawFn) => {
        styleFn();
        if (prefix) {
          ctx.font = `900 ${pSize}px sans-serif`; drawFn(prefix, pX, pYOff + textYOff);
          ctx.font = `900 ${fontSize}px sans-serif`; drawFn(numStr, nX, textYOff);
        } else {
          ctx.font = `900 ${fontSize}px sans-serif`; drawFn(text, 0, textYOff);
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

    // 按钮呼吸光边波纹（参考 card_book 装备按钮效果）
    // stateKey 用于区分不同按钮的波纹状态；options 可自定义颜色、频率、强度
    Renderer.prototype._drawButtonRipple = function(ctx, x, y, w, h, s, options = {}) {
      const {
        stateKey = 'default',
        interval = 1700,
        duration = 2200,
        alphaScale = 1,
        lineWidthScale = 1,
        fillAlpha = 0.35,
        strokeAlpha = 0.55,
        color = { r: 255, g: 215, b: 120 },
        strokeColor = { r: 212, g: 169, b: 78 },
        radius = 5
      } = options;

      if (!this._buttonRippleStates) this._buttonRippleStates = {};
      if (!this._buttonRippleStates[stateKey]) this._buttonRippleStates[stateKey] = [];

      const rings = this._buttonRippleStates[stateKey];
      const now = Date.now();

      if (rings.length === 0 || now - rings[rings.length - 1].start > interval) {
        rings.push({ start: now });
      }
      while (rings.length > 0 && now - rings[0].start > duration) {
        rings.shift();
      }

      for (const ring of rings) {
        const elapsed = now - ring.start;
        const progress = elapsed / duration;
        const expand = progress * 10 * s;
        const alpha = strokeAlpha * (1 - progress) * (1 - progress) * alphaScale;

        ctx.save();
        ctx.beginPath();
        const er = radius * s + expand;
        const ex = x - expand;
        const ey = y - expand;
        const ew = w + 2 * expand;
        const eh = h + 2 * expand;
        ctx.moveTo(ex + er, ey);
        ctx.lineTo(ex + ew - er, ey);
        ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + er);
        ctx.lineTo(ex + ew, ey + eh - er);
        ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - er, ey + eh);
        ctx.lineTo(ex + er, ey + eh);
        ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - er);
        ctx.lineTo(ex, ey + er);
        ctx.quadraticCurveTo(ex, ey, ex + er, ey);
        ctx.closePath();

        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${fillAlpha * (1 - progress) * alphaScale})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${strokeColor.r}, ${strokeColor.g}, ${strokeColor.b}, ${alpha})`;
        ctx.lineWidth = 2.2 * s * lineWidthScale;
        ctx.stroke();
        ctx.restore();
      }
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

    // 绘制女巫奖励风格标题（金色渐变文字 + 两侧菱形渐变装饰线）
    // 用于女巫奖励弹窗、获得新词牌弹窗等需要统一标题风格的地方
    Renderer.prototype._drawWitchRewardTitle = function(ctx, text, W, titleY, s, options = {}) {
      const { alpha = 1 } = options;
      const gold = '#c4a35a';
      const titleFontSize = 24 * s;

      // 先设置字体以测量文字宽度
      ctx.font = `bold ${Math.floor(titleFontSize)}px Georgia, serif`;
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;

      // 文字两侧装饰线参数
      const solidSize = 1.5 * s;
      const hollowSize = 2 * s;
      const gap = 8 * s;             // 文字到实心菱形
      const solidToHollow = 8 * s;   // 实心菱形到空心菱形
      const lineOffset = 3 * s;      // 线与空心菱形之间的间距
      const lineLength = 45 * s;     // 线起点到线末端

      const leftSolidX = W / 2 - textWidth / 2 - gap;
      const leftHollowX = leftSolidX - solidToHollow;
      const leftLineEndX = leftHollowX - lineLength;
      const rightSolidX = W / 2 + textWidth / 2 + gap;
      const rightHollowX = rightSolidX + solidToHollow;
      const rightLineEndX = rightHollowX + lineLength;

      ctx.save();
      ctx.globalAlpha = alpha;

      // --- 左侧（从右到左：实心小菱形 → 空心菱形 → 渐变线）---
      ctx.save();
      ctx.translate(leftSolidX, titleY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gold;
      ctx.fillRect(-solidSize, -solidSize, solidSize * 2, solidSize * 2);
      ctx.restore();

      ctx.save();
      ctx.translate(leftHollowX, titleY);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.2 * s;
      ctx.strokeRect(-hollowSize, -hollowSize, hollowSize * 2, hollowSize * 2);
      ctx.restore();

      const leftLineStartX = leftHollowX - lineOffset;
      const leftGrad = ctx.createLinearGradient(leftLineStartX, titleY, leftLineEndX, titleY);
      leftGrad.addColorStop(0, gold);
      leftGrad.addColorStop(1, 'rgba(196,163,90,0)');
      ctx.strokeStyle = leftGrad;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(leftLineStartX, titleY);
      ctx.lineTo(leftLineEndX, titleY);
      ctx.stroke();

      // --- 右侧（从左到右：实心小菱形 → 空心菱形 → 渐变线）---
      ctx.save();
      ctx.translate(rightSolidX, titleY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gold;
      ctx.fillRect(-solidSize, -solidSize, solidSize * 2, solidSize * 2);
      ctx.restore();

      ctx.save();
      ctx.translate(rightHollowX, titleY);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.2 * s;
      ctx.strokeRect(-hollowSize, -hollowSize, hollowSize * 2, hollowSize * 2);
      ctx.restore();

      const rightLineStartX = rightHollowX + lineOffset;
      const rightGrad = ctx.createLinearGradient(rightLineStartX, titleY, rightLineEndX, titleY);
      rightGrad.addColorStop(0, gold);
      rightGrad.addColorStop(1, 'rgba(196,163,90,0)');
      ctx.strokeStyle = rightGrad;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(rightLineStartX, titleY);
      ctx.lineTo(rightLineEndX, titleY);
      ctx.stroke();

      ctx.restore();

      // 金色渐变文字
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.floor(titleFontSize)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textGrad = ctx.createLinearGradient(W / 2, titleY - 10 * s, W / 2, titleY + 10 * s);
      textGrad.addColorStop(0, '#f5d78e');
      textGrad.addColorStop(0.5, '#dfc06e');
      textGrad.addColorStop(1, '#b5973e');
      ctx.fillStyle = textGrad;
      ctx.fillText(text, W / 2, titleY);
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

    Renderer.prototype._drawCardGlow = function(ctx, cardX, cardY, cardW, cardH, s, alphaScale = 1) {
      ctx.save();
      const t = Date.now();
      const cardCX = cardX + cardW / 2;
      const cardCY = cardY + cardH / 2;
      const haloR = Math.max(cardW, cardH) * 0.85;
      const pulse = 0.5 + 0.5 * Math.sin(t / 500);
      const haloGrad = ctx.createRadialGradient(cardCX, cardCY, haloR * 0.25, cardCX, cardCY, haloR);
      haloGrad.addColorStop(0, `rgba(255,215,0,${(0.12 + 0.06 * pulse) * alphaScale})`);
      haloGrad.addColorStop(0.5, `rgba(255,200,60,${(0.06 + 0.04 * pulse) * alphaScale})`);
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
        const alpha = (0.25 + 0.55 * blink) * alphaScale;
        const r = sp.r * (0.75 + 0.2 * blink) * s;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#ffffff';
        this._drawSparkleShape(ctx, sp.x, sp.y, r);
        ctx.restore();
      });
      ctx.restore();
    }

    // 通用矩形斜光扫过（屏幕坐标）
    // color: 'purple' | 'green' | 其他，默认紫色
    Renderer.prototype._drawRectSweep = function(ctx, x, y, w, h, s, color, timeOffset = 0) {
      ctx.save();
      const r = 10 * s;
      this._roundedRectPath(ctx, x, y, w, h, r);
      ctx.clip();

      const to = typeof timeOffset === 'number' && !isNaN(timeOffset) ? timeOffset : 0;
      const t = ((Date.now() / 1000 + to) % 7.0) / 7.0;
      const sweepLen = (w + h) * 0.72;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const d = -Math.max(w, h) * 0.55 + t * sweepLen;
      const dx = cx + d - h * 0.2;
      const dy = cy + d - w * 0.2;

      let tintCenter, tintEdge;
      if (color === 'green') {
        tintCenter = 'rgba(200, 255, 220,';
        tintEdge = 'rgba(180, 255, 210,';
      } else {
        tintCenter = 'rgba(255, 220, 255,';
        tintEdge = 'rgba(255, 200, 255,';
      }

      // 主光带：宽大、柔和、低饱和
      const beamW = Math.min(w, h) * 0.55;
      const grad = ctx.createLinearGradient(dx - beamW, dy - beamW, dx + beamW, dy + beamW);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.42, 'rgba(255,255,255,0.02)');
      grad.addColorStop(0.5, `${tintCenter}0.18)`);
      grad.addColorStop(0.58, 'rgba(255,255,255,0.02)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - w, y - h, w * 3, h * 3);

      // 第二层更淡的反相微光，增加朦胧层次
      const t2 = ((Date.now() / 1000 + to + 3.5) % 7.0) / 7.0;
      const d2 = -Math.max(w, h) * 0.55 + t2 * sweepLen;
      const dx2 = cx + d2 - h * 0.2;
      const dy2 = cy + d2 - w * 0.2;
      const grad2 = ctx.createLinearGradient(dx2 - beamW * 0.8, dy2 - beamW * 0.8, dx2 + beamW * 0.8, dy2 + beamW * 0.8);
      grad2.addColorStop(0, 'rgba(255,255,255,0)');
      grad2.addColorStop(0.45, `${tintEdge}0.015)`);
      grad2.addColorStop(0.5, `${tintCenter}0.08)`);
      grad2.addColorStop(0.55, `${tintEdge}0.015)`);
      grad2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(x - w, y - h, w * 3, h * 3);
      ctx.restore();
    }

    // 卡牌斜光扫过（通关模式紫色 / 对战模式绿色）
    // 在 drawCard 的变换坐标系中调用：卡牌中心为 (0,0)，范围为 (-w/2, -h/2) 到 (w/2, h/2)
    Renderer.prototype._drawCardSweep = function(ctx, w, h, s, color, timeOffset = 0) {
      ctx.save();
      const r = 10 * s;
      this._roundedRectPath(ctx, -w / 2, -h / 2, w, h, r);
      ctx.clip();

      const to = typeof timeOffset === 'number' && !isNaN(timeOffset) ? timeOffset : 0;
      const t = ((Date.now() / 1000 + to) % 2.8) / 2.8;
      const sweepLen = (w + h) * 1.6;
      const d = -Math.max(w, h) + t * sweepLen;
      const dx = d;
      const dy = d;

      let centerColor, edgeColor;
      if (color === 'green') {
        centerColor = 'rgba(60, 255, 140,';
        edgeColor = 'rgba(60, 255, 140,';
      } else {
        // 默认紫色
        centerColor = 'rgba(200, 100, 255,';
        edgeColor = 'rgba(200, 100, 255,';
      }

      const beamW = 40 * s;
      const grad = ctx.createLinearGradient(dx - beamW, dy - beamW, dx + beamW, dy + beamW);
      grad.addColorStop(0, `${edgeColor}0)`);
      grad.addColorStop(0.42, `${edgeColor}0.08)`);
      grad.addColorStop(0.5, `${centerColor}0.85)`);
      grad.addColorStop(0.58, `${edgeColor}0.08)`);
      grad.addColorStop(1, `${edgeColor}0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(-w * 2, -h * 2, w * 4, h * 4);
      ctx.restore();
    }

    // 卡牌选中态闪烁小星星（菱形星心 + 十字光芒）
    // 原实现位于 card_book 的 cell 选中态，抽成通用方法供新词牌弹窗等复用
    // randomArea=false 时沿卡牌边缘分布，randomArea=true 时在卡牌区域内随机分布
    Renderer.prototype._drawCardPressedStars = function(ctx, x, y, w, h, s, seed = 0, randomArea = false, starCount = 6, sizeScale = 1) {
      const time = Date.now();
      const pr = (n) => {
        const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const edgeThick = 12 * s;
      const margin = 4 * s;
      for (let i = 0; i < starCount; i++) {
        let sx, sy;
        if (randomArea) {
          const innerMargin = Math.min(w, h) * 0.08;
          sx = x + innerMargin + pr(seed + i + 300) * (w - innerMargin * 2);
          sy = y + innerMargin + pr(seed + i + 350) * (h - innerMargin * 2);
        } else {
          const isHorizontalEdge = pr(seed + i + 200) < 0.5;
          if (isHorizontalEdge) {
            const isTop = pr(seed + i + 250) < 0.5;
            sx = x + pr(seed + i + 300) * w;
            sy = isTop
              ? y + margin + pr(seed + i + 350) * edgeThick
              : y + h - margin - pr(seed + i + 350) * edgeThick;
          } else {
            const isLeft = pr(seed + i + 250) < 0.5;
            sx = isLeft
              ? x + margin + pr(seed + i + 350) * edgeThick
              : x + w - margin - pr(seed + i + 350) * edgeThick;
            sy = y + pr(seed + i + 300) * h;
          }
        }
        const offset = i * 80;
        const size = 2.8 * s * sizeScale;
        const alpha = 0.25 + 0.75 * Math.abs(Math.sin((time + offset) / 400));
        ctx.save();
        // 菱形星心
        ctx.fillStyle = `rgba(255, 240, 180, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - size);
        ctx.lineTo(sx + size * 0.5, sy);
        ctx.lineTo(sx, sy + size);
        ctx.lineTo(sx - size * 0.5, sy);
        ctx.closePath();
        ctx.fill();
        // 十字光芒
        ctx.strokeStyle = `rgba(255, 240, 180, ${alpha * 0.6})`;
        ctx.lineWidth = 0.8 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx - size * 1.6, sy);
        ctx.lineTo(sx + size * 1.6, sy);
        ctx.moveTo(sx, sy - size * 1.6);
        ctx.lineTo(sx, sy + size * 1.6);
        ctx.stroke();
        ctx.restore();
      }
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

    // 通用闪烁星星组（可控制数量）
    // stars: 调用方维护的状态数组，方法会在长度不符时重新生成并返回
    Renderer.prototype._drawSparkleStars = function(ctx, cx, cy, width, height, s, elapsed, count, stars, closeAlpha = 1, scale = 1) {
      if (!stars || stars.length !== count) {
        stars = Array.from({ length: count }, () => ({
          x: (Math.random() * 2 - 1) * 0.9,
          y: (Math.random() * 2 - 1) * 0.9,
          r: 1.5 + Math.random() * 3,
          phase: Math.random() * Math.PI * 2,
          speed: 1 + Math.random() * 2.5,
          alpha: 0.3 + Math.random() * 0.7
        }));
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      stars.forEach((star) => {
        const sx = cx + star.x * width * 0.5;
        const sy = cy + star.y * height * 0.5;
        const twinkle = (Math.sin(elapsed * 0.003 * star.speed + star.phase) + 1) / 2;
        const alpha = star.alpha * (0.25 + twinkle * 0.85) * closeAlpha;
        const r = star.r * s * (0.65 + twinkle * 0.7) * scale;
        const rotation = elapsed * 0.0005 + star.phase;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rotation);
        ctx.strokeStyle = `rgba(255, 243, 177, ${alpha})`;
        ctx.fillStyle = `rgba(255, 204, 67, ${alpha})`;
        ctx.lineWidth = Math.max(1 * s, r * 0.15);
        ctx.shadowColor = 'rgba(255, 190, 45, 0.7)';
        ctx.shadowBlur = r * 1.6;

        // 十字星主体
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.8);
        ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 1.8, 0);
        ctx.quadraticCurveTo(r * 0.22, r * 0.22, 0, r * 1.8);
        ctx.quadraticCurveTo(-r * 0.22, r * 0.22, -r * 1.8, 0);
        ctx.quadraticCurveTo(-r * 0.22, -r * 0.22, 0, -r * 1.8);
        ctx.closePath();
        ctx.fill();

        // 十字线
        ctx.beginPath();
        ctx.moveTo(-r * 2.4, 0);
        ctx.lineTo(r * 2.4, 0);
        ctx.moveTo(0, -r * 2.4);
        ctx.lineTo(0, r * 2.4);
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();
      return stars;
    }

    Renderer.prototype._drawGentleStars = function(cx, cy, size, s, globalAlpha = 1, glowMult = 1, theme = 'purple') {
      const ctx = this.ctx;
      const now = Date.now();
      const breath = 0.5 + 0.5 * Math.sin(now / 800);
  
      // 配色主题：紫色（默认）/ 金色
      const colors = theme === 'gold' ? {
        glowInner: '255,220,130',
        glowOuter: '218,165,32',
        star: '255,240,180',
        pentagram: '218,165,32',
        shadow: '218,165,32'
      } : {
        glowInner: '180,140,220',
        glowOuter: '155,89,182',
        star: '220,190,255',
        pentagram: '155,89,182',
        shadow: '155,89,182'
      };
  
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = globalAlpha;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
  
      // === 径向光晕 ===
      // 降低整体亮度并避免中心实心色块：从中心低透明度向外自然过渡
      const glowR = size * 0.65 * glowMult;
      const glowAlpha = 0.12 * breath * glowMult;
      const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
      glowGrad.addColorStop(0, `rgba(${colors.glowInner},${glowAlpha * 0.35})`);
      glowGrad.addColorStop(0.5, `rgba(${colors.glowOuter},${glowAlpha * 0.8})`);
      glowGrad.addColorStop(1, `rgba(${colors.glowOuter},0)`);
  
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
  
        ctx.fillStyle = `rgba(${colors.star},${0.9 * twinkle})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, starSize, 0, Math.PI * 2);
        ctx.fill();
      }
  
      // === 五角星 ===
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
        ctx.shadowColor = `rgba(${colors.shadow},0.85)`;
        ctx.shadowBlur = 10 * s * twinkle;
        ctx.fillStyle = `rgba(${colors.pentagram},${0.85 * twinkle})`;
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

    // 彩虹箔光：沿对角线扫过的彩虹渐变流光，用于商店卡牌
    // 未命中现有通用动画方案（自定义渐变位移动画）
    Renderer.prototype._drawRainbowFoil = function(ctx, x, y, w, h, r, s) {
      ctx.save();
      // 圆角裁切，确保流光不溢出卡牌
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.clip();

      const t = Date.now() / 1000;
      const cycle = 3.2;
      const p = (t % cycle) / cycle;
      const dx = x - w * 0.5 + p * (w + h) * 1.4;
      const dy = y - h * 0.3 + p * (w + h) * 0.7;
      const gradSize = 70 * s;
      const grad = ctx.createLinearGradient(dx - gradSize, dy - gradSize, dx + gradSize, dy + gradSize);
      grad.addColorStop(0, 'rgba(255,100,150,0)');
      grad.addColorStop(0.3, 'rgba(255,180,100,0.08)');
      grad.addColorStop(0.45, 'rgba(255,255,150,0.18)');
      grad.addColorStop(0.5, 'rgba(200,255,200,0.22)');
      grad.addColorStop(0.55, 'rgba(150,200,255,0.18)');
      grad.addColorStop(0.7, 'rgba(200,150,255,0.08)');
      grad.addColorStop(1, 'rgba(255,100,150,0)');

      ctx.fillStyle = grad;
      ctx.fillRect(x - w, y - h, w * 3, h * 3);
      ctx.restore();
    };

    Renderer.prototype._calcPulseScale = function(animState, maxScale = 0.3) {
      if (!animState || !animState.startTime) return { scale: 1, progress: 1 };
      const elapsed = Date.now() - animState.startTime;
      const progress = Math.min(elapsed / animState.duration, 1);
      const scale = 1 + maxScale * Math.sin(progress * Math.PI);
      return { scale, progress };
    }

};
