# 《女巫的词牌》小游戏页面布局与机型适配文档

> 本文档基于 `js/` 与 `game.js` 源码整理，重点描述当前游戏页面的 Canvas 布局方式、各区域尺寸计算逻辑，以及机型适配方案。

---

## 1. 项目基础信息

| 项目 | 说明 |
|------|------|
| 项目名 | word-balatro |
| 类型 | 微信小游戏（`compileType: game`） |
| 渲染方式 | 纯 Canvas 2D（`wx.createCanvas()` + `getContext('2d')`） |
| 入口文件 | `/game.js` |
| 渲染器入口 | `/js/renderer.js` → `/js/render/index.js` |
| 核心渲染类 | `/js/render/base.js` 中的 `Renderer` |
| 方向 | 竖屏（`deviceOrientation: portrait`） |
| 状态栏 | 隐藏（`showStatusBar: false`） |

整个游戏没有使用 WXML/WXSS，全部界面元素均由 Canvas 绘制。因此布局、适配、点击命中全部在 JS 中自行计算。

---

## 2. 渲染架构概览

```
game.js
  │ 获取系统信息 & 创建 Canvas
  │ 设置 Canvas 物理尺寸 & DPR
  │
  ▼
Renderer（base.js）
  │ 计算 scale、safeTop、safeBottom
  │ 预加载图片资源
  │
  ├─ drawHUD()          ── 顶部栏 / HUD（js/render/hud.js）
  ├─ drawPlaying()      ── 游戏主界面（js/render/playing.js）
  ├─ shopRenderer.draw()── 商店界面（js/shop.js）
  ├─ settlementRenderer ── 结算弹窗（js/settlement.js）
  ├─ witchRewardRenderer── 女巫奖励（js/settlement.js）
  ├─ gameOverRenderer   ── 游戏结束（js/render/gameover.js）
  ├─ popup.js           ── 各类弹窗（设置、单词本、今日新词等）
  └─ guide.js / cardbook.js / effects.js / animation.js
```

所有渲染模块通过 `require('./xxx')(Renderer)` 的方式把方法挂载到 `Renderer.prototype` 上。

---

## 3. 机型适配策略（核心）

### 3.1 Canvas 尺寸与 DPR 适配（game.js）

```js
const info = wx.getSystemInfoSync();
const WIDTH = info.windowWidth;
const HEIGHT = info.windowHeight;
const dpr = info.pixelRatio || 1;

// 限制 Canvas 物理像素上限，防止高分屏内存爆炸
const MAX_CANVAS_WIDTH = 1280;
const MAX_CANVAS_HEIGHT = 2560;
const scaleDpr = Math.min(dpr, MAX_CANVAS_WIDTH / WIDTH, MAX_CANVAS_HEIGHT / HEIGHT);

canvas.width = Math.floor(WIDTH * scaleDpr);
canvas.height = Math.floor(HEIGHT * scaleDpr);
ctx.scale(scaleDpr, scaleDpr);

const renderer = new Renderer(ctx, WIDTH, HEIGHT);
renderer.dpr = scaleDpr;
```

| 参数 | 含义 |
|------|------|
| `WIDTH` / `HEIGHT` | 逻辑尺寸，即 `windowWidth` / `windowHeight` |
| `dpr` | 设备像素比 |
| `scaleDpr` | 实际使用的 DPR，受最大物理分辨率限制 |
| `ctx.scale(scaleDpr, scaleDpr)` | 把 Canvas 坐标系缩放到逻辑尺寸，后续代码全部以逻辑像素计算 |

**关键点**：
- 在 iPhone 14 Pro / 灵动岛机型上，`WIDTH` 可能为 393，`HEIGHT` 为 852，`dpr` 为 3，则物理分辨率 `1179×2556` 接近上限。
- 在 iPad 上，`WIDTH` 较大，`dpr` 可能为 2，物理分辨率容易超过 1280 宽，因此 `scaleDpr` 会被压低。
- 所有绘制代码后续只使用 `WIDTH`、`HEIGHT` 和 `renderer.scale`，不再关心 DPR。

### 3.2 缩放因子 scale 的确定（base.js）

```js
const baseScale = Math.min(width / 375, height / 667);
this.scale = Math.min(baseScale, 1.4);   // 上限 1.4，避免 iPad 上元素过大
this.scale = Math.max(this.scale, 0.8);  // 下限 0.8，避免小屏元素过小
// 折叠屏/矮屏适配：当 scale 被放大到 1.0 以上，且 740*s 超过可用高度时，
// 整体缩小 scale，避免在 16:10 折叠屏（如 HUAWEI Pura X 内屏）上内容溢出。
// 注意：playing/shop/life_extended 页面整体下移了 10px，所以额外预留 10px。
const requiredHeight = Math.floor(740 * this.scale + 10);
const availableHeight = height - this.safeTop - this.safeBottom;
if (this.scale > 1.0 && requiredHeight > availableHeight && availableHeight > 0) {
  this.scale = Math.max((availableHeight - 10) / 740, 0.75);
}
```

| 参数 | 含义 |
|------|------|
| 基准屏 | iPhone 6/7/8：375×667 逻辑像素 |
| `baseScale` | 相对基准屏的等比缩放 |
| 上限 `1.4` | 在 iPad / 大屏手机上，元素不会无限放大 |
| 下限 `0.8` | 在极小屏设备上，元素不会缩得过小 |
| 高度约束 | 当 `740 * s` 超过可用高度（如 HUAWEI Pura X 内屏），`scale` 会被进一步压低，最低可到 `0.75` |

**举例**：
- iPhone 6/7/8（375×667）：`scale = 1.0`
- iPhone X/11/12/13/14（375×812 或 390×844）：`scale ≈ 1.0 ~ 1.05`
- iPhone 14 Pro Max（430×932）：`scale ≈ 1.15`，但会被限制在 `1.4` 以内
- iPad mini（744×1133）：`baseScale ≈ 1.98`，会被限制为 `1.4`
- 某些小屏 Android（360×640）：`scale ≈ 0.96`，会被限制为 `0.8`
- HUAWEI Pura X 内屏（440×707）：`baseScale ≈ 1.06`，但 `(740 * 1.06 + 10) = 794 > 707`，会被压低到 `≈ 0.942`
- HUAWEI Pura X 外屏（326×326）：即使压低到 `0.75`，`740 * 0.75 = 555 > 326`，仍无法完整显示

### 3.3 安全区域适配（刘海 / 灵动岛）

```js
this.safeTop = sysInfo.safeArea?.top || sysInfo.statusBarHeight || 0;
this.safeBottom = sysInfo.screenHeight - (sysInfo.safeArea?.bottom || sysInfo.screenHeight);
this.hasDynamicIsland = this.safeTop >= 44;
```

| 字段 | 用途 |
|------|------|
| `safeTop` | 顶部安全距离，用于避开刘海 / 灵动岛 / 状态栏 |
| `safeBottom` | 底部安全距离，用于避开 Home 指示条 |
| `hasDynamicIsland` | `safeTop >= 44` 时认为是灵动岛机型，额外再下沉 10s |

代码中常见的顶部偏移写法：
```js
const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0);
```

### 3.4 卡牌尺寸的响应式计算（base.js）

```js
const maxCardW = Math.floor((width - 48) / 4);   // 4列，左右边距24
const maxCardH = Math.floor((height - 200) / 3); // 最多3行，预留上方HUD和下方按钮
this.cardW = Math.min(Math.floor(74 * this.scale), maxCardW);
this.cardH = Math.min(Math.floor(88 * this.scale), maxCardH);
this.gap = Math.floor(8 * this.scale);
```

- 手牌区最多支持 4 列 × 3 行（12 张）。
- 卡牌宽/高受两个约束：
  1. 按 `scale` 缩放后的基准尺寸（74×88）。
  2. 屏幕实际可摆放的最大尺寸（避免在极小屏上溢出）。
- 最终取两者较小值，因此大屏不会无限放大，小屏会优先保证放得下。

### 3.5 高度盈余 / 不足的自适应

在 `drawPlaying` 中：

```js
const extraHeight = H - Math.floor(740 * s);
const topOffset = extraHeight * 0.05;
const cardGap = Math.max(4 * s, 50 * s + extraHeight * 0.25 - 10);
```

- 以 `740 * s` 作为游戏主界面基准高度，`extraHeight = H - 740 * s`。
- 当屏幕比基准高时（`extraHeight > 0`）：
  - 把多余高度的 `5%` 加到顶部偏移，让顶部不要太挤。
  - 剩余 `25%` 加到底部卡牌与按钮间距，保持舒适间距。
- 当屏幕比基准矮时（`extraHeight < 0`，如 HUAWEI Pura X 内屏）：
  - `topOffset` 为负，HUD 顶部适当上移以节省空间。
  - `cardGap` 被压缩，最小限制为 `4 * s`，避免卡牌与底部按钮重叠。
- 这样在不同高度屏幕上，内容都能尽量完整显示而不溢出。

---

## 4. 游戏主界面（playing 状态）布局

主界面纵向从上到下分为以下区域：

```
┌─────────────────────────────┐
│ 顶部栏：设置图标 + 金币胶囊    │  ← drawTopHeader
├─────────────────────────────┤
│ 进度条：女巫头像 / 回合 / 目标 / 当前 │  ← drawHUD
├─────────────────────────────┤
│ 道具栏：女巫牌槽位 + 药水槽位  │  ← drawPlaying 上部
├─────────────────────────────┤
│ 分数预览：字母分 × 长度倍率    │  ← drawPlaying 中部
├─────────────────────────────┤
│ 单词预览区                    │  ← drawPlaying 中部
├─────────────────────────────┤
│ 手牌区（字母牌网格）           │  ← drawPlaying 中下部
├─────────────────────────────┤
│ 倒计时条（争分夺秒时）         │  ← drawPlaying 底部上方
├─────────────────────────────┤
│ 底部按钮：出牌 / 弃牌 / 清空   │  ← drawPlaying 底部
└─────────────────────────────┘
```

### 4.1 顶部栏（drawTopHeader）

```js
const headerOffset = (this.hasDynamicIsland ? 13 * s : 0);
const iconSize = 34 * s;
const iconX = 15 * s + 5 * s;
const iconY = 10 * s + 5 * s + headerOffset;
```

- 左上角 `top_icon.png`：设置入口。
- 右侧紧邻金币胶囊：
  ```js
  const coinCapsuleW = coinIconSize + 6 * s + goldTextW + 18 * s;
  const coinCapsuleH = 32 * s;
  const coinX = iconX + iconSize + 7 * s;
  const coinY = iconY + (iconSize - coinCapsuleH) / 2 + 1 * s;
  ```
- 金币胶囊宽度根据金币文字长度动态计算。

### 4.2 HUD 进度条（drawHUD）

```js
const top = (this.safeTop || 0) + 18 * s + (this.hasDynamicIsland ? 10 * s : 0) + topOffset;
const h = 72 * s;
const barW = W - 20 * s;
const barH = h;
const barX = 10 * s;
const barY = top + 9 * s;
```

进度条内部有两种布局：

#### A. 有女巫技能时（4列）

```
┌────────────────────────────────────┐
│ 女巫头像 │ 回合 │ 目标分 │ 当前分数 │
└────────────────────────────────────┘
```

- 第 1 列（女巫头像）占 `barW * 0.32 + 10s`。
- 剩余空间被 3 根分隔线切成 3 等份，分别显示回合、目标分、当前分数。
- 女巫头像实际绘制区域超出进度条上下边缘（`avatarH = barH + 22*s`），营造探头效果。
- 头像右侧显示技能描述标签，带呼吸灯边框。

#### B. 无女巫技能时（3列）

平均三等分，只显示回合、目标分、当前分数。

### 4.3 道具栏（drawPlaying 上部）

```js
const propW = W - 20 * s;
const propX = (W - propW) / 2;
const propBarH = 84 * s;
const propY = hudBottom + 6 * s;
```

道具栏分左右两组：

| 区域 | 槽位数 | 说明 |
|------|--------|------|
| 左组 | `actualWitchSlots`（默认 4，可升级） | 女巫牌（jokers） |
| 右组 | 2 | 药水牌（potions） |

#### 动态槽位适配

```js
const rawSlotW = (W - 20 * s - padX * 2 - 5 * BASE_GAP - dividerW) / 6;
const actualTotalSlots = actualWitchSlots + 2;
const rawGap = (propW - padX * 2 - dividerW - actualTotalSlots * rawSlotW) / (actualTotalSlots - 1);
const minGap = actualWitchSlots >= 5 ? 0.6 * s : -Infinity;
const actualGap = Math.max(rawGap, minGap);
```

- 女巫槽位超过 5 个时，强制 gap 不小于 `0.6 * s`，允许卡牌左右轻微重叠，保证内容居中。
- 卡牌宽度固定按 6 槽位计算，不因槽位变多而压缩单卡宽度。
- 左组与右组中间有金色竖线 + 菱形装饰分隔。

### 4.4 分数预览区（drawPlaying 中部）

```js
const boxSize = 56 * s;
const boxY = scoreAreaY + 3 * s;
const leftBoxX = centerX - boxSize - 10 * s - 5 * s;
const rightBoxX = centerX + 10 * s + 5 * s;
```

- 左侧方块：当前基础字母分（背景 `letter_score.png`）。
- 中间：金色乘号 `×`。
- 右侧方块：长度倍率（背景 `length.png`）。
- 方块两侧有 `score_line.png` 装饰线。

### 4.5 单词预览区

```js
const maskW = 180 * s;
const maskH = 40 * s;
const maskX = W / 2 - maskW / 2;
const maskY = wordAreaY - maskH / 2;
```

- 宽度固定为 180s，与选择字母数量无关。
- 左侧有 `help.png` 提示按钮。
- 未选择时显示提示文案“选择字母牌组成单词”。
- 选择后显示当前拼出的单词。
- 校验中 / 合法 / 非法 / 女巫约束失败时显示不同颜色与动画。

### 4.6 手牌区（drawPlaying 中下部）

```js
const cols = game.hand.length <= 9 ? 3 : 4;
const rows = Math.ceil(game.hand.length / cols);
const totalW = cols * this.cardW + (cols - 1) * this.gap;
const startX = (W - totalW) / 2;
```

- ≤9 张：3 列布局。
- ≥10 张：4 列布局。
- 最后一行不足时，该行单独居中：
  ```js
  const cardsInRow = (row === rows - 1 && game.hand.length % cols !== 0)
    ? game.hand.length % cols
    : cols;
  const rowTotalW = cardsInRow * this.cardW + (cardsInRow - 1) * this.gap;
  const rowStartX = (W - rowTotalW) / 2;
  ```

手牌区 Y 坐标通过从底部按钮倒推得到：

```js
const btnTop = H - 90 * s;
const cardGap = 50 * s + extraHeight * 0.25 - 10;
const cardBottom = btnTop - cardGap + 3 * s;
const cardAreaY = cardBottom - cardGridH;
```

### 4.7 底部按钮区

```js
const btnY = H - 90 * s;
const btnW = 90 * s;
const btnH = 56 * s;
const btnGap = 20 * s;
const totalBtnW = btnW * 3 + btnGap * 2;
const btnStartX = (W - totalBtnW) / 2;
```

| 按钮 | X 坐标 | 说明 |
|------|--------|------|
| 出牌 | `btnStartX` | 显示剩余出牌次数，选中≥2张且合法时高亮 |
| 弃牌 | `btnStartX + btnW + btnGap` | 显示剩余弃牌次数 |
| 清空选择 | `btnStartX + (btnW + btnGap) * 2` | 重置选中状态 |

按钮使用 `out_card.png`、`throw_card.png`、`reset_select.png` 图片，文字叠加在图片上。

### 4.8 争分夺秒倒计时条

当 `game._hastePlayActive` 激活时，在按钮上方绘制：

```js
const timerH = 6 * s;
const timerY = btnY - timerH - 8 * s;
const timerW = W * 0.5;
const timerX = W / 2 - timerW / 2;
```

---

## 5. 商店界面（shop 状态）布局

商店页纵向结构：

```
┌─────────────────────────────┐
│ 顶部栏：设置图标 + 金币胶囊    │
├─────────────────────────────┤
│ 标题：女巫的词牌 + 图鉴图标    │
├─────────────────────────────┤
│ 已购买道具栏（女巫 + 药水）    │
├─────────────────────────────┤
│ 卡牌商店标题 + 全局重掷按钮    │
├─────────────────────────────┤
│ 大容器：3 行商品              │
│  ├─ 女巫牌行                 │
│  ├─ 水晶球牌行               │
│  └─ 魔法药水牌行             │
├─────────────────────────────┤
│ 底部挑战按钮                  │
└─────────────────────────────┘
```

### 5.1 已购买道具栏

```js
const ownedY = top + 16 * s + 2 * s;
const ownedH = 92 * s;
const ownedW = W - 30 * s;
const ownedX = (W - ownedW) / 2;
```

- 与游戏页道具栏共用同一套布局算法。
- 女巫牌支持拖拽排序、售出动画、补位滑动动画。
- 药水牌选中后显示“售出 / 使用”两个按钮。

### 5.2 商品区域

```js
const modPad = 10 * s;
const modW = W - 30 * s;
const modX = 15 * s;
const unitH = 100 * s;
const rowH = unitH + 8 * s;
const cardGap = 8 * s;
const unitW = (modW - modPad * 2 - cardGap) / 2;
const cardW = Math.floor(unitW * 0.35);
const cardH = unitH - 20 * s;
```

- 大容器宽度 `W - 30s`，圆角奶油色边框。
- 每行 2 个商品单元，共 3 行（女巫牌、水晶球牌、魔法药水牌）。
- 每个单元左侧是竖向卡牌图标（cover 模式），右侧是名称、描述、价格按钮。
- 价格按钮统一宽度 `82 * s`，余额不足时显示“余额不足”，药水槽满时显示“已达上限”。

### 5.3 全局重掷按钮

```js
const rerollBtnX = modX + modW - rerollBtnW - 6 * s + 9;
const rerollBtnY = titleMidY - rerollBtnH / 2 - 1;
```

位于“卡牌商店”标题右侧，消耗 3 金币刷新商品。

### 5.4 底部挑战按钮

```js
const challengeBtnW = 92 * s;
const challengeBtnH = 40 * s;
```

- 默认位于商店大容器底部居中。
- 当商品描述过长时，按钮会右移，避免遮挡文字。

---

## 6. 弹窗体系

所有弹窗复用 `_drawModalPanel` 通用框架（定义在 `js/render/index.js` 或相关模块）。

### 6.1 通用弹窗参数

```js
{
  width: 300,          // 逻辑宽度（未乘 scale）
  height: 340,
  overlayAlpha: 0.75,  // 遮罩透明度
  enterOffset: 25,     // 进入动画 Y 轴偏移（单位 s）
  closeOffset: 40,     // 关闭动画 Y 轴偏移
  borderRadius: 12,
  borderWidth: 2,
  elapsed,
  onCloseComplete
}
```

`_drawModalPanel` 内部会把 `width` / `height` 乘以 `s`：

```js
const pw = 300 * s;
const ph = 340 * s;
const px = (W - pw) / 2;
const py = (H - ph) / 2 + panelOffsetY;
```

### 6.2 主要弹窗尺寸

| 弹窗 | 宽度 | 高度 | 文件 |
|------|------|------|------|
| 结算弹窗 | 300 | 340 | settlement.js |
| 女巫奖励 result | 300 | 340 | settlement.js |
| 游戏结束 | 300 | 310 | gameover.js |
| 字母置换 | 300 | 410 | popup.js |
| 求助提示 | 300 | 280 | playing.js |
| 获得新词牌 | 300 | 400 | index.js |
| 卡牌图鉴 | 320 / 按图片比例 | 440 / 按图片比例 | index.js |
| 排行榜 | `min(W*0.9, 340s)` | `min(H*0.75, 520s)` | index.js / game.js |
| 设置弹窗 | 约 W - 40s | 动态 | popup.js |

### 6.3 弹窗内的点击区域

弹窗关闭后，相关的 Rect 通常不会立即清空，因此触摸处理逻辑会先判断当前是否有弹窗状态（如 `game._settingsPopup`、`game._dailyWordsPopup`），优先拦截弹窗内点击。

---

## 7. 触摸命中机制

### 7.1 命中测试函数（base.js）

```js
hitTest(x, y, rects) {
  if (!rects) return null;
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return r;
    }
  }
  return null;
}
```

所有可点击元素在绘制时都会把 `{x, y, w, h, ...}` 保存到 `this.xxxRect` 或 `this.xxxRects` 数组中。

### 7.2 主触摸处理流程（game.js）

1. 预加载阶段不响应触摸。
2. 优先处理滚动类交互（云日志、今日新词、单词本）。
3. 处理设置图标长按（开发者工具 / 体验版打开调试菜单）。
4. 处理各类弹窗（今日新词、单词本、设置、排行榜、求助提示）。
5. 处理卡牌图鉴图标。
6. 最后调用 `handleInput(x, y)` 处理游戏主交互。

### 7.3 各状态主要命中区域

| 状态 | 命中区域 | 来源 |
|------|----------|------|
| playing | `cardRects`、`playBtnRect`、`discardBtnRect`、`surrenderBtnRect`、`witchPropRects`、`potionPropRects`、`hintBtnRect` | playing.js / input.js |
| shop | `shopRects`、`nextRoundBtnRect`、`shopOwnedPropRects`、`shopSellBtnRect`、`shopUseBtnRect`、`shopGlobalRerollBtnRect` | shop.js / input.js |
| potion | `potionCardRects`、`cancelBtnRect`、`randomSpinBtnRect` | popup.js / input.js |
| gameover | `restartBtnRect`、`rankBtnRect`、`reviveBtnRect` | gameover.js |

---

## 8. 图片与资源的适配处理

### 8.1 图片加载方式

- 本地图片：`wx.createImage()` 直接加载 `images/xxx.png`。
- 云图片：通过 `CloudStorageManager` 预加载到本地缓存，再注入到 `renderer`。

### 8.2 图片绘制模式

| 场景 | 模式 | 说明 |
|------|------|------|
| 背景图 | stretch | `ctx.drawImage(bgImage, 0, 0, W, H)` |
| 卡牌模板 | stretch | 按 `cardW` / `cardH` 拉伸 |
| 商店商品图标 | cover | 保持宽高比，裁剪到圆角矩形内 |
| 女巫头像 | cover / 底部对齐 | 以底部中心为锚点绘制，带呼吸缩放 |
| 图鉴大图 | contain | 按面板比例计算，完整显示 |
| 游戏结束按钮 | contain | 保持图片比例，在按钮区域内居中 |

### 8.3 字体适配

```js
this.titleFontFamily = '"PingFang SC", "Noto Sans SC", sans-serif';
try {
  const fontFamily = wx.loadFont('images/fonts/XiangcuiDengcusong_subset.ttf');
  if (fontFamily) this.titleFontFamily = fontFamily + ', sans-serif';
} catch (e) {}
```

- 标题使用自定义字体（香萃灯粗宋），加载失败回退到系统字体。
- 所有文字尺寸都乘以 `s`。

---

## 9. 适配边界与注意事项

### 9.1 已处理的机型差异

1. **DPR 差异**：通过 `scaleDpr` 限制最大物理分辨率，避免 iPad / 高分 Android 内存问题。
2. **屏幕比例差异**：
   - 矮屏（iPhone 6/7/8 16:9）：`scale ≈ 1.0`，元素紧凑。
   - 长屏（iPhone X+ 19.5:9）：`scale ≈ 1.0~1.05`，多余高度分配给底部间距。
   - 大屏（iPad 4:3）：`scale` 被限制为 `1.4`，元素不会过大。
3. **刘海 / 灵动岛**：通过 `safeTop` 和 `hasDynamicIsland` 下沉顶部内容。
4. **底部 Home 指示条**：按钮放在 `H - 90 * s`，通常已避开安全区；未显式使用 `safeBottom`，但通过 `H - 90s` 的固定底部边距间接规避。
5. **槽位扩展**：女巫槽位可超过 4 个，通过缩小 gap 甚至轻微重叠适配。

### 9.2 当前可能存在的边界问题

1. **底部安全区未严格扣除**：`btnTop = H - 90 * s` 未减去 `safeBottom`，在 iPhone X+ 上若 `safeBottom` 较大（34px），按钮可能离 Home 指示条较近。
2. **排行榜弹窗尺寸**：使用 `min(W*0.9, 340*s)`，在极小屏上 `340*s` 可能仍大于 `W*0.9`，但已取较小值，相对安全。
3. **弹窗宽度固定 300**：大部分弹窗宽度固定为 300（逻辑像素），在 `scale < 1` 的极小屏上，实际宽度 `300*s < 300`，可能影响内容显示。
4. **商店商品描述换行**：`drawWrappedText` 已按 `textMaxW` 换行，但名称未做截断，超长名称可能溢出。
5. **图鉴弹窗尺寸依赖图片比例**：`cardBookImage` 加载前使用默认 `320×440`，加载后按图片比例重新计算，首帧可能有跳变。

---

## 10. 关键文件速查

| 文件 | 负责内容 |
|------|----------|
| `game.js` | Canvas 创建、DPR 设置、触摸事件主分发 |
| `js/render/base.js` | Renderer 类、scale / safeArea 计算、通用绘制工具 |
| `js/render/index.js` | 主渲染入口 `render()`、状态分发、弹窗框架 |
| `js/render/playing.js` | 游戏主界面布局 |
| `js/render/hud.js` | 顶部栏、HUD 进度条、hint toast |
| `js/shop.js` | 商店渲染器 `ShopRenderer` |
| `js/settlement.js` | 结算弹窗、女巫奖励弹窗 |
| `js/render/gameover.js` | 游戏结束弹窗 |
| `js/render/popup.js` | 药水升级、字母置换、随机强化等弹窗 |
| `js/input.js` | 部分触摸输入处理（较旧） |

---

## 11. 总结

《女巫的词牌》采用**纯 Canvas 自绘布局**，适配策略可以概括为：

1. **以 iPhone 6/7/8（375×667）为基准屏**，所有尺寸用 `s = scale` 统一缩放。
2. **缩放因子限制在 [0.8, 1.4]**，兼顾小屏和大屏。
3. **DPR 单独处理**，通过 `scaleDpr` 限制 Canvas 物理像素上限。
4. **安全区域手动处理**，顶部内容根据 `safeTop` 和 `hasDynamicIsland` 下沉。
5. **关键区域采用倒推布局**，从底部按钮向上推导卡牌区、预览区、分数区位置，保证底部操作区稳定。
6. **动态槽位/列数**，手牌 ≤9 张 3 列、≥10 张 4 列；女巫槽位多时自动缩小间距。
7. **弹窗统一框架**，宽度多为固定 300 逻辑像素，高度按内容扩展。

整体布局已经考虑了当前主流 iPhone / Android / iPad 的竖屏差异，但底部 Home 指示条、极小屏弹窗宽度等细节仍可进一步优化。
