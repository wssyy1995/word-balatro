# Renderer 架构拆分方案

> 当前状态：`js/renderer.js` 3749 行，单文件上帝类
> 目标：按功能模块拆分为 `js/render/` 文件夹，降低维护成本

---

## 一、现状诊断

### 1.1 代码规模

| 文件 | 行数 | 类/方法数 |
|------|------|-----------|
| `js/renderer.js` | **3749** | 1 主类 + 1 内联类，约 50+ 方法 |
| `js/settlement.js` | 578 | 2 子渲染器（已独立） |
| `js/shop.js` | 1584 | 2 子渲染器（已独立） |
| `js/animation.js` | 267 | Easing + AnimationManager（已独立） |

### 1.2 方法分布热力图

```
Renderer 方法分布（按代码行数）

构造与资源加载     ████████░░░░░░░░░░░░  316 行  ( 8%)
通用绘制工具         █████░░░░░░░░░░░░░░░  200 行  ( 5%)
卡牌绘制             ████░░░░░░░░░░░░░░░░  150 行  ( 4%)
粒子/特效/动画       ███████░░░░░░░░░░░░░  250 行  ( 7%)
主渲染入口           ███░░░░░░░░░░░░░░░░░  120 行  ( 3%)
HUD 系统             ████████░░░░░░░░░░░░  300 行  ( 8%)
游戏主界面           ████████████████████  900 行  (24%)  ← 最大痛点
drawPlaying 包含：
  - 布局计算（cardAreaY, wordAreaY, scoreAreaY...）
  - pendingCheck 状态机（checking/valid/invalid/witch_failed）
  - 单词预览（4 种状态渲染）
  - 分数方块（背景图 + 滚动数字 + per_card 倍率提示）
  - 倍率方块（基础倍率 + whole_word 依次触发 + 脉冲）
  - 卡牌布局（3/4 列自适应 + 最后一行居中）
  - 飞出动画（flyingCards）
  - 底部按钮（3 个图片按钮 + 文字渐变）
女巫牌系统           ███████░░░░░░░░░░░░░  300 行  ( 8%)
字母置换弹窗         ████░░░░░░░░░░░░░░░░  150 行  ( 4%)
药水系统             █████████░░░░░░░░░░░  350 行  ( 9%)
调试工具             ████░░░░░░░░░░░░░░░░  150 行  ( 4%)
提示系统             █░░░░░░░░░░░░░░░░░░░   30 行  ( 1%)
GameOverRenderer     ███░░░░░░░░░░░░░░░░░  120 行  ( 3%)
```

### 1.3 核心痛点

| 痛点 | 影响 |
|------|------|
| `drawPlaying` 近 900 行 | 任何游戏界面改动都要在这个巨型方法里找位置，极易引入回归 bug |
| 构造函数 316 行加载 20+ 种资源 | 新增一种图片要改 3 处（声明、加载、初始化），容易漏 |
| 通用工具与业务逻辑混在一起 | `roundRect`、`hitTest` 等工具方法和 `drawPlaying` 业务代码在同一个文件 |
| 弹窗系统分散 | 字母置换、药水、随机强化三个弹窗各自为政，没有统一框架 |
| 子渲染器模式不统一 | `SettlementRenderer.draw(ctx,game,W,H,s)` vs `Renderer._drawWitchDetailPopup(ctx,game,s)` |

### 1.4 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                       render(game)                           │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │drawHUD  │ │drawPlaying│ │各种弹窗  │ │子渲染器      │    │
│  │(250行)  │ │(900行)   │ │(650行)  │ │(settlement)  │    │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘    │
│       │           │            │              │             │
│       ▼           ▼            ▼              ▼             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              通用工具（被所有模块依赖）                  │  │
│  │  roundRect | text | _drawModalPanel | hitTest        │  │
│  │  _calcPulseScale | drawBtnImage | _drawStar          │  │
│  └──────────────────────────────────────────────────────┘  │
│       ▲           ▲            ▲              ▲             │
│       │           │            │              │             │
│  ┌────┴────┐ ┌────┴─────┐ ┌────┴─────┐ ┌──────┴───────┐    │
│  │卡牌绘制  │ │粒子特效  │ │女巫牌    │ │特效动画      │    │
│  │drawCard │ │sparkles  │ │_drawProp │ │_letterGodAnim│    │
│  └─────────┘ └──────────┘ └──────────┘ └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**高频交叉依赖：**
- `drawPlaying` → `drawCard`, `_drawPropCard`, `_drawWitchDetailPopup`, `drawCoinCapsule`
- `drawPotion` / `drawRandomUpgradePopup` → `drawTopHeader`, `drawCoinCapsule`, `drawCard`
- `_drawLetterGodAnim` → `this.cardRects`（由 `drawPlaying` 每帧写入）
- 所有弹窗 → `_drawModalPanel`

---

## 二、拆分方案（推荐：保守渐进式）

### 2.1 目标结构

```
js/
├── render/
│   ├── index.js           # Renderer 主类（约 400 行）
│   ├── assets.js          # 资源加载管理（约 250 行）
│   ├── utils.js           # 通用 Canvas 工具（约 200 行）
│   ├── hud.js             # HUD 绘制（约 300 行）
│   ├── card.js            # 卡牌绘制（约 150 行）
│   ├── effects.js         # 粒子/特效/动画（约 250 行）
│   ├── playing.js         # 游戏主界面（约 900 行）
│   ├── witch.js           # 女巫牌系统（约 300 行）
│   ├── popups.js          # 弹窗系统（约 500 行）
│   ├── debug.js           # 调试工具（约 150 行）
│   └── gameOver.js        # GameOverRenderer（约 120 行）
│
├── settlement.js          # 已独立，保持不变
├── shop.js                # 已独立，保持不变
└── animation.js           # 已独立，保持不变
```

### 2.2 各模块职责

#### `render/index.js` — Renderer 主类

```javascript
const { Assets } = require('./assets');
const { UtilsMixin } = require('./utils');
const { HudMixin } = require('./hud');
const { CardMixin } = require('./card');
const { EffectsMixin } = require('./effects');
const { PlayingMixin } = require('./playing');
const { WitchMixin } = require('./witch');
const { PopupsMixin } = require('./popups');
const { DebugMixin } = require('./debug');
const { GameOverRenderer } = require('./gameOver');
const { SettlementRenderer, WitchRewardRenderer } = require('../settlement');
const { ShopRenderer, ConfirmBuyRenderer } = require('../shop');

class Renderer {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.W = width;
    this.H = height;
    
    // 响应式基准
    const baseScale = Math.min(width / 375, height / 667);
    this.scale = Math.min(Math.max(baseScale, 0.8), 1.4);
    
    // 卡牌尺寸
    const maxCardW = Math.floor((width - 48) / 4);
    const maxCardH = Math.floor((height - 200) / 3);
    this.cardW = Math.min(Math.floor(74 * this.scale), maxCardW);
    this.cardH = Math.min(Math.floor(88 * this.scale), maxCardH);
    this.gap = Math.floor(8 * this.scale);
    
    // 安全区域
    this.safeTop = 0;
    try {
      const safeArea = wx.getMenuButtonBoundingClientRect?.();
      if (safeArea) this.safeTop = safeArea.top || 0;
    } catch (e) {}
    
    // 加载资源
    Assets.loadAll(this);
    
    // 初始化子渲染器
    this.settlementRenderer = new SettlementRenderer(this);
    this.witchRewardRenderer = new WitchRewardRenderer(this);
    this.shopRenderer = new ShopRenderer(this);
    this.confirmBuyRenderer = new ConfirmBuyRenderer(this);
    this.gameOverRenderer = new GameOverRenderer(this);
    
    // 动画状态
    this.sparkles = [];
    this.flyingScore = null;
    this.lastScore = 0;
    this.scoreAnim = null;
    this.lastGold = 0;
    this.goldAnim = null;
    
    // 点击区域
    this.cardRects = [];
    this.witchPropRects = [];
    this.potionPropRects = [];
    
    // 调试
    this.debugMenuOpen = false;
    this.showCloudDebugLogs = false;
  }
  
  render(game) {
    const ctx = this.ctx;
    const W = this.W, H = this.H, s = this.scale;
    
    // 背景
    ctx.clearRect(0, 0, W, H);
    Assets.drawBackground(this);
    
    // 状态分发
    switch (game.state) {
      case 'playing':
        this.drawHUD(game);
        this.drawPlaying(game);
        if (game._letterGodAnim) this._drawLetterGodAnim(game);
        if (game._hudWitchPopup) this._drawHudWitchPopup(game);
        if (game._changeLetterPopup) this.drawChangeLetterPopup(game);
        this._drawHintToast(game);
        break;
      case 'settlement':
        this.drawHUD(game);
        this.drawCoinCapsule(game);
        this.settlementRenderer.draw(ctx, game, W, H, s);
        break;
      // ... 其他状态
    }
    
    // 全局特效
    this._updateAndDrawSparkles(ctx, s);
    this._updateAndDrawFlyingScore(ctx, s, game);
    
    // 调试
    this._drawCloudDebugLogs(ctx, game, s);
    if (this.debugMenuOpen) this._drawDebugMenu(ctx, game, s);
  }
}

// Mixin 注入
Object.assign(Renderer.prototype, UtilsMixin);
Object.assign(Renderer.prototype, HudMixin);
Object.assign(Renderer.prototype, CardMixin);
Object.assign(Renderer.prototype, EffectsMixin);
Object.assign(Renderer.prototype, PlayingMixin);
Object.assign(Renderer.prototype, WitchMixin);
Object.assign(Renderer.prototype, PopupsMixin);
Object.assign(Renderer.prototype, DebugMixin);

module.exports = { Renderer };
```

#### `render/assets.js` — 资源管理

职责：
- 所有图片资源的声明、加载、状态管理
- `drawBackground(renderer)` 等基于资源的快捷绘制
- 提供 `getImage(name)` 统一访问接口

迁移内容：constructor 中 `bgImage`, `topIcon`, `btnImages`, `scoreBoxImages`, `cardTemplate`, `witchAvatars`, `coinIcon`, `shopCardImages`, `errorIcon`, `witchHatIcon`, `buySuccessBandImg` 等 20+ 资源的加载逻辑。

#### `render/utils.js` — 通用 Canvas 工具

职责：
- 与业务无关的纯绘制工具
- 不依赖 `game` 对象

方法清单：
- `roundRect(x, y, w, h, r, fill, stroke, lineWidth)`
- `text(str, x, y, size, color, align)`
- `button(label, x, y, w, h, color, textColor)`
- `hitTest(x, y, rects)`
- `_drawModalPanel(ctx, W, H, s, config)`
- `_calcPulseScale(animState, maxScale)`
- `_drawScaledButton(ctx, label, x, y, w, h, s, pressed, options)`
- `_drawStar(ctx, cx, cy, outerR, innerR, spikes, rotation)`
- `_drawSparkleShape(ctx, x, y, r)`

#### `render/hud.js` — HUD 系统

职责：
- 顶部栏、目标分/当前分显示、金币胶囊
- 所有 `game.state` 下都可能调用的通用 HUD 元素

方法清单：
- `drawTopHeader()`
- `drawHUD(game)`
- `drawCoinCapsule(game)`
- `_drawHintToast(game)`

#### `render/card.js` — 卡牌绘制

职责：
- 单张卡牌绘制（含分数脉冲、NEW 标记、Face 标记）
- 卡牌金色光晕
- 商店图标绘制

方法清单：
- `drawCard(card, x, y, isNew, displayScoreOverride)`
- `_drawCardGlow(ctx, cardX, cardY, cardW, cardH, s)`
- `drawShopCardIcon(x, y, size, name)`

#### `render/effects.js` — 粒子/特效/动画

职责：
- 烟花粒子系统
- 飞行总分动画
- 字母之神动画
- 卡牌飞出动画（由 AnimationManager 驱动，renderer 消费）

方法清单：
- `_spawnSparkles(cx, cy, count)`
- `_updateAndDrawSparkles(ctx, s)`
- `_startFlyingScore(value, startX, startY)`
- `_updateAndDrawFlyingScore(ctx, s, game)`
- `_drawLetterGodAnim(game)`
- `updateAnimations()`

#### `render/playing.js` — 游戏主界面（核心）

职责：
- 游戏核心界面的完整绘制
- 布局计算（卡牌区、预览区、分数方块区、按钮区）
- `pendingCheck` 状态机渲染

方法清单：
- `drawPlaying(game)` — 主方法
- 内部辅助方法（可私有）：`_calcLayout()`, `_drawScoreBoxes()`, `_drawButtons()`

> **注意**：这是拆分后最大的模块（约 900 行），但职责单一，只负责 `playing` 状态下的主界面。

#### `render/witch.js` — 女巫牌系统

职责：
- 道具栏（女巫牌 + 药水）绘制
- 女巫牌详情弹窗
- HUD 女巫技能弹窗
- 可作用字母计算

方法清单：
- `_drawPropCard(ctx, prop, x, y, w, h, s)`
- `_drawEmptySlot(ctx, x, y, w, h, s, type)`
- `_getWitchLetters(trigger)`
- `_drawWitchDetailPopup(ctx, game, s)`
- `_drawHudWitchPopup(game)`

#### `render/popups.js` — 弹窗系统

职责：
- 字母置换弹窗
- 药水选择页面
- 随机强化转盘
- 药水升级动画

方法清单：
- `drawChangeLetterPopup(game)`
- `drawPotion(game)`
- `drawRandomUpgradePopup(game)`
- `_drawPotionUpgradeAnim(game)`

#### `render/debug.js` — 调试工具

职责：
- 云存储调试日志
- 调试菜单

方法清单：
- `_drawCloudDebugLogs(ctx, game, s)`
- `_drawDebugMenu(ctx, game, s)`

#### `render/gameOver.js` — 游戏结束渲染器

职责：
- 从 renderer.js 末尾独立出来
- 与 `SettlementRenderer` 模式一致

### 2.3 关键设计决策

#### 决策 1：使用 Mixin 模式而非继承

**理由**：
- JavaScript 单继承，如果用继承链会变得很深
- Mixin 允许按需组合，未来新增模块只需 `Object.assign`
- 保持现有 `this.xxx()` 调用方式不变，迁移成本低

```javascript
// utils.js
const UtilsMixin = {
  roundRect(x, y, w, h, r, fill, stroke, lineWidth) { /* ... */ },
  hitTest(x, y, rects) { /* ... */ },
  // ...
};
module.exports = { UtilsMixin };
```

#### 决策 2：资源从 `this.xxxImage` 改为集中管理

**当前模式**：
```javascript
// renderer.js 中散落 20+ 个 this.xxxImage
if (this.bgImage && this.bgLoaded) ctx.drawImage(this.bgImage, ...);
if (this.coinIcon && this.coinIconLoaded) ctx.drawImage(this.coinIcon, ...);
```

**目标模式**：
```javascript
// assets.js
const Assets = {
  _cache: {},
  load(name, path) { /* ... */ },
  get(name) { return this._cache[name]; },
  isLoaded(name) { return this._cache[name]?.loaded; },
  draw(renderer, name, x, y, w, h) {
    const asset = this.get(name);
    if (asset?.loaded) renderer.ctx.drawImage(asset.img, x, y, w, h);
  }
};
```

#### 决策 3：`render()` 入口保持精简

`render()` 只负责：
1. 绘制背景
2. 根据 `game.state` 分发到各模块
3. 绘制全局特效（粒子、飞行分数）
4. 绘制调试覆盖层

**禁止**在 `render()` 中写具体绘制逻辑。

---

## 三、迁移路线图（分 4 步，每步可独立验证）

### Step 1：提取通用工具（风险最低，约 200 行）

**文件**：`render/utils.js`
**内容**：`roundRect`, `text`, `button`, `hitTest`, `_drawModalPanel`, `_calcPulseScale`, `_drawScaledButton`, `_drawStar`, `_drawSparkleShape`

**验证**：所有现有弹窗、按钮、弹窗面板正常显示。

### Step 2：提取资源加载（约 250 行）

**文件**：`render/assets.js`
**内容**：所有图片资源的加载逻辑 + `drawBackground()`

**验证**：所有图片正常加载显示，无白底/闪白。

### Step 3：提取独立模块（可并行）

| 优先级 | 文件 | 内容 | 验证点 |
|--------|------|------|--------|
| P0 | `render/gameOver.js` | `GameOverRenderer` | 游戏结束弹窗正常 |
| P0 | `render/card.js` | `drawCard`, `_drawCardGlow` | 卡牌、选中态、NEW 标记正常 |
| P0 | `render/hud.js` | `drawHUD`, `drawCoinCapsule` | HUD、金币胶囊正常 |
| P1 | `render/effects.js` | 粒子、飞行分数、字母之神 | 烟花、分数飞行、字母之神正常 |
| P1 | `render/witch.js` | 女巫牌、详情弹窗 | 道具栏、女巫弹窗正常 |
| P1 | `render/popups.js` | 字母置换、药水、转盘 | 三个弹窗正常 |
| P2 | `render/debug.js` | 调试日志、菜单 | 调试菜单正常 |

### Step 4：提取 `drawPlaying` + 主类瘦身

**文件**：`render/playing.js`, `render/index.js`
**内容**：
- `drawPlaying` 及所有内部辅助逻辑 → `playing.js`
- `render()` 入口 + constructor → `index.js`
- 原 `js/renderer.js` 删除

**验证**：完整跑一局游戏（选牌→出牌→计分→飞牌→补牌→结算）。

---

## 四、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| Mixin 导致 `this` 绑定问题 | 低 | 中 | 全部使用普通函数（非箭头函数），确保 `this` 指向 Renderer 实例 |
| 资源加载时序变化导致白图 | 中 | 高 | `assets.js` 保持与现有完全一致的加载逻辑，只做封装不做改动 |
| `drawPlaying` 提取后变量作用域断裂 | 中 | 高 | 提取时保持所有局部变量名不变，用 `const self = this` 或闭包过渡 |
| 微信小游戏 require 路径变化 | 低 | 高 | 同步修改 `game.js` 中的 `require('./js/renderer')` → `require('./js/render')` |
| 子渲染器 `this.parent` 引用断裂 | 中 | 中 | `SettlementRenderer` / `ShopRenderer` 通过 `this.parent` 访问 `_drawModalPanel`，提取后 `this.parent` 仍指向 Renderer 实例，不受影响 |

---

## 五、长期建议（激进版方案）

如果保守版拆分后仍有维护压力，可考虑进一步重构为**分层架构**：

```
js/render/
├── core/
│   ├── renderer.js       # 纯入口，只保留 render() 分发
│   ├── assets.js         # 资源管理
│   └── utils.js          # 纯工具函数（不依赖 this）
├── layers/
│   ├── background.js     # 背景层
│   ├── hud.js            # HUD 层
│   ├── board.js          # 游戏主界面层
│   ├── overlay.js        # 弹窗/覆盖层
│   └── effects.js        # 特效层（粒子、飞行分数）
├── widgets/
│   ├── card.js           # 卡牌组件
│   ├── button.js         # 按钮组件
│   ├── modal.js          # 弹窗组件
│   └── scoreBox.js       # 分数方块组件
└── screens/
    ├── playing.js        # 游戏界面
    ├── shop.js           # 商店界面
    ├── potion.js         # 药水界面
    └── gameOver.js       # 结束界面
```

**分层渲染顺序**：
```
render():
  BackgroundLayer.draw()
  BoardLayer.draw()        // 根据 state 分发
  HudLayer.draw()
  EffectsLayer.draw()      // 粒子、飞行分数（始终在最上层）
  OverlayLayer.draw()      // 弹窗
```

---

## 六、总结

| 指标 | 当前 | 保守拆分后 | 收益 |
|------|------|-----------|------|
| 最大文件行数 | 3749 | 900 (`playing.js`) | **降低 76%** |
| 单文件方法数 | 50+ | 15+ | 定位更快 |
| 新增资源改动点 | 3 处（声明+加载+初始化） | 1 处（assets.js 配置数组） | 降低出错率 |
| 新增弹窗成本 | 拷贝 200 行模板 | 继承 ModalBase + 50 行内容 | 提升效率 |

**推荐执行顺序**：Step 1 → Step 2 → Step 3（按 P0→P1→P2） → Step 4，每步独立 commit，可随时回滚。
