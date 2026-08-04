// 临时冒烟脚本：验证图鉴引导齐平并排布局
global.wx = {
  getSystemInfoSync: () => ({ safeArea: { top: 44, bottom: 800 }, screenHeight: 812, statusBarHeight: 44, platform: 'ios' }),
  createImage: () => ({ src: '', onload: null, onerror: null }),
  loadFont: () => null,
  getImageInfo: () => {},
  getOpenDataContext: () => null,
};

const { Renderer } = require('../js/render/index');

const ctx = {
  beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
  arc: () => {}, arcTo: () => {}, ellipse: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {},
  rect: () => {}, fill: () => {}, stroke: () => {}, fillRect: () => {}, strokeRect: () => {},
  clearRect: () => {}, drawImage: () => {}, fillText: () => {}, strokeText: () => {},
  measureText: (t) => ({ width: (t || '').length * 17 }),
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
  setLineDash: () => {}, clip: () => {},
  font: '', textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '', globalAlpha: 1,
  lineWidth: 1, shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
  canvas: { width: 375, height: 667 },
};

const renderer = new Renderer(ctx, 375, 667);
renderer.guideImages.witch_3 = { img: {}, loaded: true };
renderer.cardBookIconRect = { x: 300, y: 100, w: 50, h: 50 };

// 各阶段完整跑一遍（文字打完）
const phases = [
  { phase: 1, setup: g => { g._cardBookGuideStartTime = Date.now() - 6000; } },
  { phase: 2, setup: g => { g._cardBookGuideText2StartTime = Date.now() - 30000; } },
  { phase: 3, setup: g => { g._cardBookGuideText3StartTime = Date.now() - 30000; } },
  { phase: 4, setup: g => { g._cardBookGuideExitStartTime = Date.now() - 300; } },
];
for (const p of phases) {
  const game = { cardBookGuidePhase: p.phase, audioManager: null, _cardBookGuideStartTime: Date.now() - 6000 };
  p.setup(game);
  renderer._drawCardBookGuideOverlay(game);
  const d = renderer.cardBookGuideDialogRect;
  console.log(`phase${p.phase} OK, dialogRect=`, d ? JSON.stringify({ x: +d.x.toFixed(0), y: +d.y.toFixed(0), w: +d.w.toFixed(0), h: +d.h.toFixed(0) }) : null);
  if (d) {
    // 女巫 x=20, w=130 → 右缘 150；对话框 x=162
    console.assert(d.x === 162, '对话框应在女巫右侧 x=162');
    console.assert(d.y + d.h <= 667, '对话框底部应在屏幕内');
  }
}
console.log('SMOKE TEST ALL OK');
