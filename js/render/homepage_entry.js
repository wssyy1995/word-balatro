// 主页入场动画：光晕呼吸描 · 星雨纷落
// 在预加载页 → 主页过渡时，于两个大按钮位置播放
module.exports = function extendHomepageEntry(Renderer) {
  // 重置动画状态
  Renderer.prototype._resetHomepageEntryAnim = function() {
    this._homepageEntryBurstInitialized = false;
    this._homepageEntryBurstParticles = [];
    this._homepageEntryRingStars = [];
    for (let i = 0; i < 8; i++) {
      this._homepageEntryRingStars.push({
        angle: (Math.PI * 2 / 8) * i - Math.PI / 2,
        phase: Math.random() * Math.PI * 2
      });
    }
  };

  // 初始化爆发粒子
  Renderer.prototype._initHomepageEntryBurst = function(ringCX, ringCY, s) {
    const particles = [];
    for (let i = 0; i < 100; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (60 + Math.random() * 220) * s;
      particles.push({
        x: ringCX,
        y: ringCY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30 * s,
        life: 0.6 + Math.random() * 1.4,
        age: 0,
        size: (0.4 + Math.random() * 0.9) * s,
        gravity: (50 + Math.random() * 60) * s,
        twinkle: Math.random() * Math.PI * 2
      });
    }
    this._homepageEntryBurstParticles = particles;
    this._homepageEntryBurstInitialized = true;
  };

  // 绘制四角星
  Renderer.prototype._drawHomepageEntryStar = function(ctx, cx, cy, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // 外层光晕
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
    g.addColorStop(0, 'rgba(255,240,200,0.6)');
    g.addColorStop(0.3, 'rgba(255,220,140,0.35)');
    g.addColorStop(0.7, 'rgba(255,180,60,0.06)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 垂直星芒
    const gv = ctx.createLinearGradient(cx, cy - r * 2, cx, cy + r * 2);
    gv.addColorStop(0, 'rgba(255,240,200,0)');
    gv.addColorStop(0.35, 'rgba(255,255,230,0.9)');
    gv.addColorStop(0.5, 'rgba(255,255,255,1)');
    gv.addColorStop(0.65, 'rgba(255,255,230,0.9)');
    gv.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = gv;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 2);
    ctx.lineTo(cx + r * 0.25, cy);
    ctx.lineTo(cx, cy + r * 2);
    ctx.lineTo(cx - r * 0.25, cy);
    ctx.closePath();
    ctx.fill();

    // 水平星芒
    const gh = ctx.createLinearGradient(cx - r * 2, cy, cx + r * 2, cy);
    gh.addColorStop(0, 'rgba(255,240,200,0)');
    gh.addColorStop(0.35, 'rgba(255,255,230,0.9)');
    gh.addColorStop(0.5, 'rgba(255,255,255,1)');
    gh.addColorStop(0.65, 'rgba(255,255,230,0.9)');
    gh.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = gh;
    ctx.beginPath();
    ctx.moveTo(cx - r * 2, cy);
    ctx.lineTo(cx, cy - r * 0.25);
    ctx.lineTo(cx + r * 2, cy);
    ctx.lineTo(cx, cy + r * 0.25);
    ctx.closePath();
    ctx.fill();

    // 中心点
    const gd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
    gd.addColorStop(0, 'rgba(255,255,255,1)');
    gd.addColorStop(0.5, 'rgba(255,250,220,0.7)');
    gd.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = gd;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // 绘制入场动画
  // cx, cy: 动画中心（两个大按钮中间位置）
  // s: 屏幕缩放
  // elapsed: 动画已进行时间（毫秒）
  Renderer.prototype._drawHomepageEntryAnim = function(ctx, cx, cy, s, elapsed) {
    const T1 = 1200;          // 圆环绘制完成
    const FADE_DUR = 350;     // 淡出时长
    const T2 = T1 + FADE_DUR; // 圆环完全消失
    const T3 = 3200;          // 总时长
    const t = elapsed;
    const dtSec = 1 / 60;     // 简化：按固定帧率推进粒子

    const ringR = 65 * s;
    const ringCX = cx;
    const ringCY = cy - 10 * s;

    ctx.save();

    // Phase 1: 绘制圆环（带呼吸）
    if (t < T1) {
      const progress = Math.min(t / 720, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const breathe = 0.8 + 0.2 * Math.sin(t / 1000 * 4.5);
      const ringAlpha = breathe;
      const sweep = eased * Math.PI * 2;
      const startA = -Math.PI / 2;

      if (sweep > 0.01) {
        // 外层光晕圆环
        ctx.save();
        ctx.globalAlpha = ringAlpha * 0.25;
        ctx.strokeStyle = '#e8c860';
        ctx.lineWidth = 14 * s;
        ctx.shadowColor = 'rgba(220,170,40,0.5)';
        ctx.shadowBlur = 18 * s;
        ctx.beginPath();
        ctx.arc(ringCX, ringCY, ringR, startA, startA - sweep, true);
        ctx.stroke();
        ctx.restore();

        // 中层圆环
        ctx.save();
        ctx.globalAlpha = ringAlpha * 0.5;
        ctx.strokeStyle = '#f0d878';
        ctx.lineWidth = 5 * s;
        ctx.shadowColor = 'rgba(255,200,80,0.7)';
        ctx.shadowBlur = 10 * s;
        ctx.beginPath();
        ctx.arc(ringCX, ringCY, ringR, startA, startA - sweep, true);
        ctx.stroke();
        ctx.restore();

        // 核心亮环
        ctx.save();
        ctx.globalAlpha = ringAlpha * 0.85;
        ctx.strokeStyle = '#fffbe6';
        ctx.lineWidth = 2 * s;
        ctx.shadowColor = 'rgba(255,255,200,0.9)';
        ctx.shadowBlur = 6 * s;
        ctx.beginPath();
        ctx.arc(ringCX, ringCY, ringR, startA, startA - sweep, true);
        ctx.stroke();
        ctx.restore();

        // 彗星头部
        const tipAngle = startA - sweep;
        const tipX = ringCX + Math.cos(tipAngle) * ringR;
        const tipY = ringCY + Math.sin(tipAngle) * ringR;

        // 彗星尾巴
        const tailLen = 0.35;
        for (let j = 0; j < 20; j++) {
          const frac = j / 20;
          const a = tipAngle + frac * tailLen;
          const px = ringCX + Math.cos(a) * ringR;
          const py = ringCY + Math.sin(a) * ringR;
          const alpha = (1 - frac) * 0.7 * ringAlpha;
          const r = (1.5 + (1 - frac) * 3) * s;
          ctx.save();
          ctx.globalAlpha = alpha;
          const gd = ctx.createRadialGradient(px, py, 0, px, py, r);
          gd.addColorStop(0, 'rgba(255,255,240,1)');
          gd.addColorStop(0.4, 'rgba(255,220,120,0.6)');
          gd.addColorStop(1, 'rgba(255,180,40,0)');
          ctx.fillStyle = gd;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 彗星头部光晕
        ctx.save();
        ctx.globalAlpha = ringAlpha;
        const ch = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 12 * s);
        ch.addColorStop(0, 'rgba(255,255,255,1)');
        ch.addColorStop(0.15, 'rgba(255,250,220,0.9)');
        ch.addColorStop(0.4, 'rgba(255,220,120,0.4)');
        ch.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = ch;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 12 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 彗星头部核心
        ctx.save();
        ctx.globalAlpha = ringAlpha * 0.9;
        const cc = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 3 * s);
        cc.addColorStop(0, 'rgba(255,255,255,1)');
        cc.addColorStop(0.6, 'rgba(255,250,200,0.6)');
        cc.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = cc;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 圆环星星随圆弧经过依次点亮
      const drawnA = startA - sweep;
      this._homepageEntryRingStars.forEach(star => {
        let dist = drawnA - star.angle;
        if (dist > 0) dist -= Math.PI * 2;
        if (dist < -Math.PI * 2) dist += Math.PI * 2;
        const lit = dist > -0.05;
        if (lit) {
          const twinkle = 0.5 + 0.5 * Math.sin(t / 1000 * 5 + star.phase);
          const sx = ringCX + Math.cos(star.angle) * ringR;
          const sy = ringCY + Math.sin(star.angle) * ringR;
          this._drawHomepageEntryStar(ctx, sx, sy, 2.5 * s, twinkle * 0.85);
        }
      });
    }

    // Phase 2+: 圆环淡出 + 粒子爆发同时进行
    if (t >= T1 && t < T2) {
      const fadeProgress = (t - T1) / FADE_DUR;

      if (!this._homepageEntryBurstInitialized) {
        this._initHomepageEntryBurst(ringCX, ringCY, s);
      }

      const ringAlpha = Math.max(0, 1 - fadeProgress);

      // 淡出中的圆环
      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.25;
      ctx.strokeStyle = '#e8c860';
      ctx.lineWidth = 14 * s;
      ctx.shadowColor = 'rgba(220,170,40,0.5)';
      ctx.shadowBlur = 18 * s;
      ctx.beginPath();
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.5;
      ctx.strokeStyle = '#f0d878';
      ctx.lineWidth = 5 * s;
      ctx.shadowColor = 'rgba(255,200,80,0.7)';
      ctx.shadowBlur = 10 * s;
      ctx.beginPath();
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.85;
      ctx.strokeStyle = '#fffbe6';
      ctx.lineWidth = 2 * s;
      ctx.shadowColor = 'rgba(255,255,200,0.9)';
      ctx.shadowBlur = 6 * s;
      ctx.beginPath();
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 圆环星星渐暗
      this._homepageEntryRingStars.forEach(star => {
        const twinkle = 0.5 + 0.5 * Math.sin(t / 1000 * 5 + star.phase);
        const sx = ringCX + Math.cos(star.angle) * ringR;
        const sy = ringCY + Math.sin(star.angle) * ringR;
        this._drawHomepageEntryStar(ctx, sx, sy, 2.5 * s, twinkle * ringAlpha * 0.85);
      });

      // 爆发粒子
      this._homepageEntryBurstParticles.forEach(p => {
        p.age += dtSec;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.vy += p.gravity * dtSec;

        const lifeFrac = p.age / p.life;
        if (lifeFrac >= 1) return;

        const alpha = lifeFrac < 0.1 ? lifeFrac / 0.1 : 1 - lifeFrac;

        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        const gp = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gp.addColorStop(0, 'rgba(255,255,240,0.9)');
        gp.addColorStop(0.3, 'rgba(255,220,120,0.4)');
        gp.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = gp;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
        this._drawHomepageEntryStar(ctx, p.x, p.y, p.size * 0.6, alpha * 0.9);
        ctx.restore();
      });

      // 中心闪光
      const flashAlpha = fadeProgress < 0.5 ? fadeProgress * 2 : 2 - fadeProgress * 2;
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.6;
      const cf = ctx.createRadialGradient(ringCX, ringCY, 0, ringCX, ringCY, 30 * s);
      cf.addColorStop(0, 'rgba(255,255,255,0.9)');
      cf.addColorStop(0.3, 'rgba(255,240,200,0.4)');
      cf.addColorStop(1, 'rgba(255,180,40,0)');
      ctx.fillStyle = cf;
      ctx.beginPath();
      ctx.arc(ringCX, ringCY, 30 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Phase 2 继续：爆发后的粒子持续下落
    if (t >= T2 && t < T3 && this._homepageEntryBurstParticles.length > 0) {
      this._homepageEntryBurstParticles.forEach(p => {
        p.age += dtSec;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.vy += p.gravity * dtSec;

        const lifeFrac = p.age / p.life;
        if (lifeFrac >= 1) return;

        const alpha = 1 - lifeFrac;

        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        const gp = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        gp.addColorStop(0, 'rgba(255,255,240,0.7)');
        gp.addColorStop(0.5, 'rgba(255,220,120,0.25)');
        gp.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = gp;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
        this._drawHomepageEntryStar(ctx, p.x, p.y, p.size * 0.5, alpha * 0.7);
        ctx.restore();
      });
    }

    ctx.restore();
  };
};
