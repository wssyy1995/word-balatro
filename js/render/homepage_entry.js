// 主页入场动画：星轨铭文（基于 7种高级魔法金环方案.html 的 scheme6）
// 预加载页 → 主页时，在两个大按钮位置播放
module.exports = function extendHomepageEntry(Renderer) {
  // 重置动画状态
  Renderer.prototype._resetHomepageEntryAnim = function() {
    this._homepageEntryBGMStarted = false;
    this._homepageEntryTrailStars = [];
    const N = 45;
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 - (Math.PI * 2 / N) * i;
      this._homepageEntryTrailStars.push({
        angle: a,
        size: (1.2 + Math.random() * 2.5) * 2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpd: 3 + Math.random() * 4,
      });
    }
  };

  // 椭圆上一点
  Renderer.prototype._homepageEntryEllipsePt = function(cx, cy, rx, ry, angle) {
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  };

  // 绘制椭圆环层
  Renderer.prototype._homepageEntryDrawRingLayer = function(ctx, cx, cy, rx, ry, alpha, width, color, blur, blurColor, startA, sweep) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.shadowColor = blurColor;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, startA, startA + sweep, false);
    ctx.stroke();
    ctx.restore();
  };

  // 绘制八角星（含对角星芒）
  Renderer.prototype._drawHomepageEntryStar = function(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // 外层光晕
    const go = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    go.addColorStop(0, 'rgba(255,250,225,0.3)');
    go.addColorStop(0.4, 'rgba(255,210,130,0.1)');
    go.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = go;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 垂直星芒
    const gv = ctx.createLinearGradient(x, y - r * 2, x, y + r * 2);
    gv.addColorStop(0, 'rgba(255,245,200,0)');
    gv.addColorStop(0.35, 'rgba(255,255,240,0.7)');
    gv.addColorStop(0.5, 'rgba(255,255,255,1)');
    gv.addColorStop(0.65, 'rgba(255,255,240,0.7)');
    gv.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = gv;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2);
    ctx.lineTo(x + r * 0.22, y);
    ctx.lineTo(x, y + r * 2);
    ctx.lineTo(x - r * 0.22, y);
    ctx.closePath();
    ctx.fill();

    // 水平星芒
    const gh = ctx.createLinearGradient(x - r * 2, y, x + r * 2, y);
    gh.addColorStop(0, 'rgba(255,245,200,0)');
    gh.addColorStop(0.35, 'rgba(255,255,240,0.7)');
    gh.addColorStop(0.5, 'rgba(255,255,255,1)');
    gh.addColorStop(0.65, 'rgba(255,255,240,0.7)');
    gh.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = gh;
    ctx.beginPath();
    ctx.moveTo(x - r * 2, y);
    ctx.lineTo(x, y - r * 0.22);
    ctx.lineTo(x + r * 2, y);
    ctx.lineTo(x, y + r * 0.22);
    ctx.closePath();
    ctx.fill();

    // 对角星芒
    for (const rot of [0.785, -0.785]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const gd = ctx.createLinearGradient(0, -r * 1.2, 0, r * 1.2);
      gd.addColorStop(0, 'rgba(255,245,200,0)');
      gd.addColorStop(0.4, 'rgba(255,255,245,0.45)');
      gd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      gd.addColorStop(0.6, 'rgba(255,255,245,0.45)');
      gd.addColorStop(1, 'rgba(255,245,200,0)');
      ctx.fillStyle = gd;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.2);
      ctx.lineTo(r * 0.12, 0);
      ctx.lineTo(0, r * 1.2);
      ctx.lineTo(-r * 0.12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 中心点
    const gc = ctx.createRadialGradient(x, y, 0, x, y, r * 0.4);
    gc.addColorStop(0, 'rgba(255,255,255,1)');
    gc.addColorStop(0.5, 'rgba(255,255,240,0.6)');
    gc.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // 绘制入场动画
  // cx, cy: 动画中心（两个大按钮中间位置）
  // s: 屏幕缩放
  // elapsed: 动画已进行时间（毫秒）
  Renderer.prototype._drawHomepageEntryAnim = function(ctx, cx, cy, s, elapsed) {
    const DRAW = 1400;   // 轨道绘制阶段（ms）
    const BURST = 1800;  // 爆发阶段（ms）
    const FADE = 400;    // 圆环淡出时长（ms）
    const TOTAL = 3200;  // 总时长（ms）

    const t = elapsed / 1000;              // 秒，用于闪烁周期
    const inDraw = elapsed < DRAW;
    const inBurst = elapsed >= DRAW && elapsed < TOTAL;
    const burstT = (elapsed - DRAW) / 1000; // 爆发阶段经过的秒数

    const rx = 144 * s;
    const ry = 124 * s;
    const ringCX = cx;
    const ringCY = cy;

    ctx.save();

    if (inDraw) {
      const drawT = Math.min(elapsed / DRAW, 1);
      const eased = 1 - Math.pow(1 - drawT, 2.4);
      const sweep = eased * Math.PI * 2;
      const startA = -Math.PI / 2;
      const drawnAngle = startA - sweep;

      // 已点亮的轨道星辰
      this._homepageEntryTrailStars.forEach(st => {
        let dist = drawnAngle - st.angle;
        if (dist > Math.PI) dist -= Math.PI * 2;
        if (dist < -Math.PI) dist += Math.PI * 2;
        const lit = dist > -0.03;
        if (!lit) return;

        const pt = this._homepageEntryEllipsePt(ringCX, ringCY, rx, ry, st.angle);
        const fresh = Math.min(1, Math.max(0, 1 + dist / 0.5));
        const twinkle = 0.5 + 0.5 * Math.sin(t * st.twinkleSpd + st.twinklePhase);
        this._drawHomepageEntryStar(ctx, pt.x, pt.y, st.size * twinkle * s, 0.7 + fresh * 0.3);
      });

      // 领先的写法之星
      const tip = this._homepageEntryEllipsePt(ringCX, ringCY, rx, ry, drawnAngle);
      this._drawHomepageEntryStar(ctx, tip.x, tip.y, 7 * s, 1);

      //  subtle connecting line
      if (sweep > 0.05) {
        this._homepageEntryDrawRingLayer(
          ctx, ringCX, ringCY, rx, ry,
          0.5, 2.4 * s, '#fff8d0', 8 * s, 'rgba(255,240,180,0.5)',
          startA, -sweep
        );
      }
    }

    if (inBurst) {
      const fadeP = Math.min(burstT / (FADE / 1000), 1);
      const ringA = Math.max(0, 1 - fadeP);

      // 轨道星辰向外爆发
      this._homepageEntryTrailStars.forEach(st => {
        const pt = this._homepageEntryEllipsePt(ringCX, ringCY, rx, ry, st.angle);
        const outward = fadeP;
        const px = pt.x + (pt.x - ringCX) * outward * 4;
        const py = pt.y + (pt.y - ringCY) * outward * 4;
        const twinkle = 0.5 + 0.5 * Math.sin(t * st.twinkleSpd + st.twinklePhase);
        const alpha = Math.max(0, 1 - outward * 1.2) * twinkle;
        this._drawHomepageEntryStar(ctx, px, py, st.size * twinkle * s, Math.min(1, alpha * 1.5));
      });

      if (ringA > 0.01) {
        this._homepageEntryDrawRingLayer(
          ctx, ringCX, ringCY, rx, ry,
          ringA * 0.5, 3 * s, '#fff8d0', 6 * s, 'rgba(255,240,180,0.35)',
          0, -Math.PI * 2
        );
      }

      // 中心新星爆发
      for (let j = 0; j < 50; j++) {
        const a = Math.random() * Math.PI * 2;
        const dist = burstT * (100 + Math.random() * 260) * s;
        const px = ringCX + Math.cos(a) * dist;
        const py = ringCY + Math.sin(a) * dist * (ry / rx);
        const alpha = Math.max(0, 1 - burstT / 1.8);
        this._drawHomepageEntryStar(ctx, px, py, (1.6 + Math.random() * 3.0) * s, alpha);
      }

      // 中心闪光
      const flash = burstT < 0.2 ? burstT / 0.2 : Math.max(0, 1 - (burstT - 0.2) / 0.4);
      if (flash > 0) {
        this._drawHomepageEntryStar(ctx, ringCX, ringCY, 10 * s, flash);
      }
    }

    ctx.restore();
  };
};
