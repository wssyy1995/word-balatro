# 项目动画效果完整梳理与通用化重构建议

> 文档生成时间：2026-05-07
> 覆盖文件：`js/renderer.js`、`js/shop.js`、`js/settlement.js`、`js/game.js`、`game.js`、`js/animation.js`

---

## 一、项目动画体系现状总览

本项目（Words Witch Game）是一个基于 Canvas 2D 的微信小游戏，所有 UI 动画均通过手动计算 `Date.now()` 差值、进度比例 (`progress = elapsed / duration`) 和缓动函数 (`easing`) 来实现。项目**没有使用任何第三方动画库**。

目前项目中存在两套动画机制：

| 机制 | 位置 | 特点 | 使用场景 |
|------|------|------|----------|
| **AnimationManager** | `js/animation.js` | 集中式、基于对象的动画系统，支持 `from`/`to` 属性插值 | 卡牌飞入/飞出、分数弹出、按钮按压、卡牌选中 |
| **手动内联动画** | 散落在各 Renderer 的 `draw()` 方法中 | 每次 `draw()` 时根据 `Date.now()` 重新计算状态 | 弹窗弹出/消失、数字滚动、脉冲效果、粒子系统 |

**核心问题**：大量重复的手动动画代码分散在 6 个文件中，同一套缓动函数被重复定义了 7 次以上，5 个弹窗共用一套几乎完全相同的"弹出-消失"模板却各自手写。

---

## 二、完整动画效果清单（按文件分类）

### 2.1 `js/animation.js` — 集中式动画引擎

这是项目中唯一抽象的动画系统，设计良好，支持属性插值。

| 动画 | 方法 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 卡牌飞出 | `flyOut()` | easeOutCubic | 400ms | 向左滑出，带旋转 |
| 卡牌飞入 | `flyIn()` | easeOutBackStrong | 550ms | 从屏幕外弹入，带果冻感 |
| 分数弹出 | `scorePop()` | easeOutCubic | 800ms | 向上飘并淡出 |
| 按钮按压 | `buttonPress()` | easeOutCubic + easeOutBack | 100ms + 150ms | 按下缩小，松手回弹 |
| 卡牌选中 | `cardSelect()` | easeOutBack | 150ms | 上移 8px |
| 卡牌取消选中 | `cardDeselect()` | easeOutCubic | 200ms | 落回原地 |

**已定义的缓动函数**：`easeOutCubic`、`easeOutBack`、`easeOutBackStrong`、`easeOutBounce`、`linear`、`easeInOutQuad`

---

### 2.2 `js/renderer.js` — 主渲染器（动画最密集）

#### A. HUD 区域

| 动画 | 位置 | 缓动 | 时长 | 触发条件 |
|------|------|------|------|----------|
| 当前分数脉冲 | `drawHUD()` ~L985 | `sin(πt)` | 400ms | 分数变化时 |
| 金币数字脉冲 | `drawCoinCapsule()` ~L1806 | `sin(πt)` | 400ms | 金币变化时 |

#### B. 游戏主区域

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 字母牌依次跳跃 | `updateAnimations()` ~L1284 | `sin(πt)` | 200ms/字母 | 结算阶段1，每张字母牌向上跳 12px |
| 波浪偏移 | `updateAnimations()` ~L1264 | `sin(πt)` | 250ms/字母 | 全部跳完后的波浪效果 |
| 女巫牌同步跳跃 | `updateAnimations()` ~L1292 | `sin(πt)` | 200ms | 与当前字母同步跳跃 |
| 女巫牌紫色光晕 | `_drawPropCard()` ~L458 | `sin(t/250)` | 持续 | 触发时呼吸式紫色径向渐变 |
| 基础倍率脉冲 | `updateAnimations()` ~L1379 | `sin(πt)` | 400ms | 倍率方块放大到 1.28x 回弹 |
| 分数滚动 | `drawPlaying()` ~L1497 | easeOutQuad | 300ms | 旧数字上滑淡出，新数字从下方进入 |
| 总分飞行 | `_startFlyingScore()` ~L2392 | easeOutBackStrong | 400ms | 总分从预览区飞向 HUD |

#### C. 弹窗与过渡

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 字母置换弹窗弹出 | `drawChangeLetterPopup()` ~L1856 | easeOutBack | 350ms | 从下方 30px 弹入 |
| 字母置换弹窗消失 | `drawChangeLetterPopup()` ~L1856 | linear | 300ms | 上滑 40px + 淡出 |
| 商店→游戏过渡 | `draw()` ~L768 | linear | 800ms | 半透明遮罩淡入淡出 |
| 游戏结束弹窗弹出 | `gameOverRenderer.draw()` ~L2512 | easeOutBack | 350ms | 从下方 25px 弹入 |
| 游戏结束弹窗消失 | `gameOverRenderer.draw()` ~L2512 | linear | 300ms | 上滑 40px + 淡出 |
| 药水升级弹出 | `drawPotionUpgrade()` ~L2248 | easeOutBack | 500ms | 卡牌放大弹出，分数切换，淡出 |

#### D. 按钮与提示

| 动画 | 位置 | 效果 | 说明 |
|------|------|------|------|
| 出牌/弃牌/重置按钮按下 | `drawButtons()` ~L1688 | Y 轴下移 2px | 按压反馈 |
| 置换提示按钮出现 | `drawPlaying()` ~L1099 | easeOutBack | 从下方弹出 |
| 烟花粒子 | `_spawnSparkles()` ~L2346 | 物理模拟 | 重力 + 衰减 + 淡出 |

#### E. 缓动函数重复定义

- `_easeOutBackStrong()`（L2385）：c1=2.5 的强回弹
- 内联 `easeOutBack()`（L2525）：c1=1.70158 的标准回弹
- 内联 `easeOutBack()`（L2267）：药水升级弹窗中使用
- 内联 `fadeIn()`（L2558）：easeOutQuad 渐入工具函数

---

### 2.3 `js/shop.js` — 商店渲染器

#### A. 已购买道具栏

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 售出按钮出现 | `draw()` ~L215 | easeOutBack | 200ms | 选中卡牌后下方弹出"售出"按钮 |
| 卡牌售出飞出 | `draw()` ~L298 | easeOutCubic | 700ms | 女巫牌向左/药水牌向右飞出，带旋转 |
| 补位滑动 | `draw()` ~L282 | easeOutBack | 500ms | 右侧卡牌依次左移填补空位，带交错延迟 |

#### B. 商品列表

| 动画 | 位置 | 效果 | 说明 |
|------|------|------|------|
| 价格按钮按下 | `draw()` ~L764 | Y 轴下移 2px | 按压反馈 |
| 挑战按钮按下 | `draw()` ~L1057 | Y 轴下移 2px | 按压反馈 |

#### C. 确认购买弹窗

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 弹窗弹出 | `draw()` ~L1089 | easeOutBack | 350ms | 从下方 25px 弹入 |
| 弹窗消失 | `draw()` ~L1089 | linear | 150ms | 上滑 25px + 淡出 |
| 内容渐入 | `draw()` ~L1177 | easeOutQuad | 250ms | 内部元素延迟 150ms 后渐入，带 10px 上移 |
| 购买成功光晕 | `draw()` ~L1284 | `sin(t/400)` | 持续 | 金色脉动光晕 + 四角闪烁星星 |
| 成功按钮按下缩放 | `draw()` ~L1375 | scale 0.95 | 150ms | "立即使用"/"暂存"/"生效"按钮按下缩小 |

#### D. 下一回合模块

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 目标分数减免切换 | `draw()` ~L932 | `sin(πt)` | 500ms | 先放大显示旧值→顶峰切换为新值→缩小 |

#### E. 缓动函数重复定义

- `_easeOutBack()`（L199）：c1=1.70158 的标准回弹
- 内联 `easeOutBack()`（L1127）：确认购买弹窗中使用

---

### 2.4 `js/settlement.js` — 结算与奖励渲染器

#### A. 金币结算弹窗

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 弹窗弹出 | `SettlementRenderer.draw()` ~L9 | easeOutBack | 350ms | 从下方 25px 弹入 |
| 弹窗消失 | `SettlementRenderer.draw()` ~L9 | linear | 300ms | 上滑 40px + 淡出 |
| 遮罩淡入 | `SettlementRenderer.draw()` ~L9 | linear | 200ms | 黑色半透明遮罩从 0→0.65 |
| 内容元素渐入 | `SettlementRenderer.draw()` ~L9 | easeOutQuad | 250ms | 交错延迟渐入，带 8px 上移 |

#### B. 女巫奖励弹窗

| 动画 | 位置 | 缓动 | 时长 | 说明 |
|------|------|------|------|------|
| 弹窗弹出 | `WitchRewardRenderer.draw()` ~L189 | easeOutBack | 350ms | 从下方 30px 弹入 |
| 礼物呼吸 | `WitchRewardRenderer.draw()` ~L251 | `sin(t/800)` | 持续 | 静态时 ±5% 呼吸 |
| 礼物开启闪烁 | `WitchRewardRenderer.draw()` ~L251 | `sin(t/80)` | 800ms | 点击后快速脉动 + 透明度闪烁 |
| 奖励结果光晕 | `WitchRewardRenderer.draw()` ~L449 | `sin(t/400)` | 持续 | 金色脉动光晕 + 四角闪烁星星 |
| buff 奖励按钮按下 | `WitchRewardRenderer.draw()` ~L388 | scale 0.95 | 150ms | "领取"按钮按下缩小 |

#### C. 缓动函数重复定义

- 内联 `easeOutBack()`（L27）：c1=1.70158 的标准回弹
- 内联 `fadeIn()`（L61）：easeOutQuad 渐入工具函数

---

### 2.5 `js/game.js` & `game.js`（根目录）— 逻辑与输入层

这两层主要负责**触发**动画，本身不绘制。关键触发点：

| 触发点 | 文件 | 触发的动画 |
|--------|------|-----------|
| 点击"出牌" | `game.js` | `animManager.flyOut()` 卡牌飞出 → `flyIn()` 新卡补位 |
| 点击"弃牌" | `game.js` | `animManager.flyOut()` 卡牌飞出 → `flyIn()` 新卡补位 |
| 点击按钮 | `game.js` | `animManager.buttonPress()` 按钮按压反馈 |
| 药水升级完成 | `game.js` | `game._potionUpgrading` 状态触发弹窗动画 |
| 结算进入 | `js/game.js` | `setTimeout` 链触发阶段 0→1→2→3 动画时序 |
| 售出道具 | `js/game.js` | `game._sellingProp` 状态触发飞出+补位动画 |
| 购买水晶 | `js/game.js` | `game._reduceTargetAnim` 状态触发目标分数动画 |

---

## 三、重复模式深度分析（重点）

### 模式 1：easeOutBack 缓动函数的 7 次重复定义 ❌❌❌

这是项目中**最应该被立即重构**的重复代码。

```javascript
// === 定义 A：js/animation.js（共享）===
const Easing = {
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutBackStrong: (t) => {
    const c1 = 2.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// === 定义 B：js/shop.js:199 ===
_easeOutBack(t) { /* 完全相同的 c1=1.70158 版本 */ }

// === 定义 C：js/renderer.js:2385 ===
_easeOutBackStrong(t) { /* 完全相同的 c1=2.5 版本 */ }

// === 定义 D：js/settlement.js:27 ===
function easeOutBack(t) { /* 完全相同的 c1=1.70158 版本 */ }

// === 定义 E：js/renderer.js:2525（GameOverRenderer 内）===
function easeOutBack(t) { /* 完全相同的 c1=1.70158 版本 */ }

// === 定义 F：js/renderer.js:2267（药水升级弹窗内）===
function easeOutBack(t) { /* 完全相同的 c1=1.70158 版本 */ }

// === 定义 G：js/shop.js:1127（ConfirmBuyRenderer 内）===
function easeOutBack(t) { /* 完全相同的 c1=1.70158 版本 */ }
```

**重复度**：`easeOutBack(c1=1.70158)` 被重复定义了 **6 次**，`easeOutBackStrong(c1=2.5)` 被重复定义了 **2 次**。

**通用化建议**：
- ✅ **立即可做**：所有 Renderer 统一 `require('./animation').Easing`，删除各自的私有定义。
- `renderer.js` 中的 `_easeOutBackStrong` 可以改为直接使用 `Easing.easeOutBackStrong`。
- `shop.js`、`settlement.js`、内联函数全部删除。

---

### 模式 2：弹窗"弹出-消失"模板的 5 次重复实现 ❌❌❌

项目中 **5 个弹窗/面板** 共用同一套动画模板，但每个都手写了完整的 80~120 行代码。

**共同模板结构**：

```
1. isClosing / closeElapsed / closeProgress 关闭状态判断
2. if (isClosing && closeProgress >= 1) { 清理状态 + return }
3. 黑色半透明遮罩（alpha 从 0 → 0.65，关闭时淡出）
4. 面板尺寸计算（pw = 300*s, px = (W-pw)/2）
5. easeOutBack 入场（从下方 25~30px 弹入）
6. roundRect 背景（#faf6ee 填充 + #c4a35a 边框）
7. 关闭时整体向上滑出 40px + 淡出
8. [可选] 内部内容 stagger fadeIn（easeOutQuad，延迟 100~250ms）
```

**5 个弹窗对比**：

| 弹窗 | 文件 | 入场距离 | 入场时长 | 关闭时长 | 关闭位移 | 遮罩 alpha |
|------|------|----------|----------|----------|----------|------------|
| 金币结算 | settlement.js | 25px | 350ms | 300ms | -40px | 0.65 |
| 女巫奖励 | settlement.js | 30px | 350ms | — | — | 0.60 |
| 确认购买 | shop.js | 25px | 350ms | 150ms | -25px | 0.65 |
| 字母置换 | renderer.js | 30px | 350ms | 300ms | -40px | 0.50 |
| 游戏结束 | renderer.js | 25px | 350ms | 300ms | -40px | 0.65 |

**差异非常小**：入场距离 25px/30px、关闭时长 150ms/300ms、遮罩 alpha 0.5/0.65。

**通用化建议**：
- 🔶 **建议做**：提取一个 `PopupRenderer` 基类或 `drawModal(ctx, config)` 工具函数。
- 配置项：`width`, `height`, `enterOffset`, `enterDuration`, `closeDuration`, `closeOffset`, `overlayAlpha`, `bgColor`, `borderColor`, `borderRadius`, `hasFadeInContent`。
- 每个具体弹窗只需传入配置 + 在回调中绘制自己的内容。

---

### 模式 3：数字"脉冲/滚动/切换"动画的 6 次重复 ❌❌

项目中数字变化的强调动画出现了 6 次，每处都手写了不同的实现：

| 位置 | 动画类型 | 核心代码 |
|------|----------|----------|
| HUD 当前分数 (`drawHUD`) | 脉冲 | `scale = 1 + 0.2 * sin(π * progress)` |
| 金币胶囊 (`drawCoinCapsule`) | 脉冲 | `scale = 1 + 0.3 * sin(π * progress)` |
| 倍率方块 (`updateAnimations`) | 脉冲 | `scale = 1 + 0.28 * sin(π * progress)` |
| 字母分数方块 (`drawPlaying`) | 滚动 | 旧数字上滑淡出 + 新数字从下方进入 |
| 目标分数减免 (`shop.js`) | 脉冲+切换 | `sin(π * progress)` + 进度>0.5 时切换值 |
| 药水升级分数 (`drawPotionUpgrade`) | 脉冲 | `scale = 1 + 0.2 * sin(π * progress)` |

**通用化建议**：
- 🔶 **建议做**：在 `Renderer` 上增加 `animatedNumber()` 方法，支持以下模式：
  - `mode: 'pulse'` — 脉冲放大缩小
  - `mode: 'roll'` — 滚动切换（旧数字上滑淡出，新数字从下方进入）
  - `mode: 'switch'` — 脉冲过程中切换数值
- 统一参数：`duration`, `maxScale`, `easing`, `onValueChange`

---

### 模式 4：按钮按压反馈的 N 次重复 ❌

项目中所有按钮按压都遵循同一模式，但实现方式五花八门：

| 位置 | 实现方式 | 代码 |
|------|----------|------|
| 底部按钮 (出牌/弃牌/重置) | Y 轴位移 | `y += pressed ? 2*s : 0` |
| 商店价格按钮 | Y 轴位移 | `y += pressed ? 2*s : 0` |
| 挑战按钮 | Y 轴位移 | `y += pressed ? 2*s : 0` |
| 确认购买按钮 | scale 缩放 | `scale = pressed ? 0.95 : 1` |
| 成功弹窗按钮 | scale 缩放 | `scale = pressed ? 0.95 : 1` |
| 结算弹窗按钮 | scale 缩放 | `scale = pressed ? 0.95 : 1` |
| 根目录 game.js | AnimationManager | `animManager.buttonPress()` |

**问题**：
1. 有的用位移，有的用缩放，体验不一致。
2. `AnimationManager.buttonPress()` 只在根目录 game.js 使用，其他按钮都是手动判断 `_pressed` 状态。

**通用化建议**：
- 🔶 **建议做**：统一使用 `AnimationManager.buttonPress()` 或在 `Renderer` 上增加 `drawAnimatedButton()`。
- 所有按钮统一为"按下缩小到 0.92 + 松手 easeOutBack 回弹"的体验。

---

### 模式 5：金色光晕 + 四角闪烁星星的 2 次完全复制 ❌❌

```javascript
// === 商店购买成功弹窗 (shop.js ~L1284) ===
const t = Date.now();
const haloR = Math.max(cardW, cardH) * 0.85;
const pulse = 0.5 + 0.5 * Math.sin(t / 400);
const haloGrad = ctx.createRadialGradient(cardCX, cardCY, haloR * 0.25, cardCX, cardCY, haloR);
// + 4 个角上的闪烁星星

// === 女巫奖励结果弹窗 (settlement.js ~L449) ===
const t = Date.now();
const haloR = Math.max(cardW, cardH) * 0.85;
const pulse = 0.5 + 0.5 * Math.sin(t / 400);
const haloGrad = ctx.createRadialGradient(cardCX, cardCY, haloR * 0.25, cardCX, cardCY, haloR);
// + 4 个角上的闪烁星星
```

两段代码几乎**逐字相同**，只有变量名不同。

**通用化建议**：
- ✅ **立即可做**：提取 `drawCardGlow(ctx, cx, cy, w, h, s)` 方法到 `Renderer`。

---

### 模式 6：stagger fadeIn 内容渐入的 3 次重复 ❌

```javascript
// 结算弹窗 (settlement.js)
function fadeIn(el, delay, offsetY = 8 * s) {
  const t = Math.max(0, Math.min((el - delay) / 250, 1));
  const ease = t * (2 - t); // easeOutQuad
  return { alpha: ease, yShift: (1 - ease) * offsetY };
}

// 游戏结束弹窗 (renderer.js) — 完全相同的函数
function fadeIn(el, delay, offsetY = 8 * s) { /* 完全相同的实现 */ }

// 确认购买弹窗 (shop.js) — 内联写法
const contentT = Math.max(0, Math.min((elapsed - contentDelay) / 250, 1));
const contentEase = contentT * (2 - contentT);
const contentAlpha = contentEase;
const contentYShift = (1 - contentEase) * 10 * s;
```

**通用化建议**：
- ✅ **立即可做**：提取到 `Easing.fadeIn(elapsed, delay, duration, offsetY)` 或 `Animation.fadeIn()`。

---

### 模式 7：卡牌飞出动画的 2 套实现 ❌

| 实现 | 位置 | 特点 |
|------|------|------|
| `AnimationManager.flyOut()` | animation.js | 通用，向左飞出 400px，easeOutCubic |
| 内联售出飞出 | shop.js | 女巫牌向左/药水牌向右，easeOutCubic，带旋转，700ms |

商店售出飞出完全可以用 `AnimationManager.flyOut()` 实现，只需增加 `direction` 参数支持 `"right"`。

**通用化建议**：
- 🔶 **建议做**：扩展 `AnimationManager.flyOut()` 支持 `direction: 'left' | 'right'`，替换 shop.js 中的内联实现。

---

## 四、通用化可行性评估矩阵

| 重复模式 | 重复次数 | 通用化难度 | 建议优先级 | 预期收益 |
|----------|----------|------------|------------|----------|
| easeOutBack 缓动函数 | 7 次 | ⭐ 极易 | **P0-立即做** | 删除 ~40 行重复代码 |
| 弹窗弹出-消失模板 | 5 次 | ⭐⭐ 较易 | **P0-立即做** | 减少 ~400 行重复代码 |
| 金色光晕+闪烁星星 | 2 次 | ⭐ 极易 | **P0-立即做** | 删除 ~80 行重复代码 |
| stagger fadeIn | 3 次 | ⭐ 极易 | **P1-建议做** | 删除 ~30 行重复代码 |
| 数字脉冲/滚动/切换 | 6 次 | ⭐⭐ 较易 | **P1-建议做** | 统一体验，减少 ~100 行 |
| 按钮按压反馈 | N 次 | ⭐⭐ 较易 | **P1-建议做** | 统一体验 |
| 卡牌飞出 | 2 套 | ⭐⭐ 较易 | **P2-可选做** | 减少 ~50 行 |

---

## 五、具体重构方案

### 方案 1：统一缓动函数（P0，30 分钟可完成）

```javascript
// js/animation.js 已导出 Easing
// 所有文件顶部统一：
const { Easing } = require('./animation');

// 删除以下代码：
// - js/shop.js:199 _easeOutBack()
// - js/renderer.js:2385 _easeOutBackStrong()
// - js/settlement.js:27 easeOutBack()
// - js/renderer.js:2525 内联 easeOutBack()
// - js/renderer.js:2267 内联 easeOutBack()
// - js/shop.js:1127 内联 easeOutBack()

// 替换为：
Easing.easeOutBack(progress)
Easing.easeOutBackStrong(progress)
```

**影响范围**：纯函数替换，零风险。

---

### 方案 2：提取弹窗基类（P0，2 小时）

```javascript
// 新增 js/popup.js
class PopupRenderer {
  constructor(parent) {
    this.parent = parent;
    this.animStartTime = Date.now();
  }

  draw(ctx, game, W, H, s, config) {
    const {
      width = 300, height = 340,
      enterOffset = 25, enterDuration = 350,
      closeDuration = 300, closeOffset = 40,
      overlayAlpha = 0.65,
      bgColor = '#faf6ee', borderColor = '#c4a35a',
      borderRadius = 14, borderWidth = 1.5
    } = config;

    // 1. 关闭状态
    const isClosing = config.isClosing;
    const closeElapsed = isClosing ? Date.now() - config.closeStartTime : 0;
    const closeProgress = isClosing ? Math.min(closeElapsed / closeDuration, 1) : 0;
    if (isClosing && closeProgress >= 1) {
      config.onCloseComplete?.();
      return null;
    }

    // 2. 遮罩
    const overlayA = isClosing
      ? overlayAlpha * (1 - closeProgress)
      : overlayAlpha * Math.min((Date.now() - this.animStartTime) / 200, 1);
    ctx.fillStyle = `rgba(0,0,0,${overlayA})`;
    ctx.fillRect(0, 0, W, H);

    // 3. 面板入场
    const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;
    const enterProgress = Math.min(elapsed / enterDuration, 1);
    const enterEase = Easing.easeOutBack(enterProgress);
    const pw = width * s;
    const ph = height * s;
    const px = (W - pw) / 2;
    const basePy = (H - ph) / 2;
    const closeSlideY = isClosing ? -closeProgress * closeOffset * s : 0;
    const closeAlpha = isClosing ? 1 - closeProgress : 1;
    const py = basePy + (1 - enterEase) * enterOffset * s + closeSlideY;

    ctx.save();
    ctx.globalAlpha = closeAlpha;
    this.parent.roundRect(px, py, pw, ph, borderRadius * s, bgColor, borderColor, borderWidth * s);

    return { px, py, pw, ph, elapsed, enterProgress, closeProgress, closeAlpha };
  }

  fadeIn(elapsed, delay, duration = 250, offsetY = 8 * s) {
    const t = Math.max(0, Math.min((elapsed - delay) / duration, 1));
    const ease = t * (2 - t); // easeOutQuad
    return { alpha: ease, yShift: (1 - ease) * offsetY };
  }
}
```

**使用示例**（结算弹窗简化后）：

```javascript
// settlement.js
class SettlementRenderer {
  draw(ctx, game, W, H, s) {
    if (!this.popup) this.popup = new PopupRenderer(this.parent);
    const panel = this.popup.draw(ctx, game, W, H, s, {
      width: 300, height: 340,
      isClosing: game._closingSettlement,
      closeStartTime: game._closeStartTime,
      onCloseComplete: () => { /* 清理 */ }
    });
    if (!panel) return;

    const { px, py, pw, ph, elapsed } = panel;

    // 标题
    const titleFade = this.popup.fadeIn(elapsed, 100);
    ctx.globalAlpha = titleFade.alpha;
    ctx.fillText('金币结算', W / 2, py + 40 * s + titleFade.yShift);

    // ... 其他内容
    ctx.restore();
  }
}
```

---

### 方案 3：提取金色光晕方法（P0，15 分钟）

```javascript
// 添加到 js/renderer.js 的 Renderer 类中
_drawCardGlow(ctx, cx, cy, w, h, s, options = {}) {
  const { color = '#ffd700', pulseSpeed = 400, minAlpha = 0.08 } = options;
  const t = Date.now();
  const haloR = Math.max(w, h) * 0.85;
  const pulse = 0.5 + 0.5 * Math.sin(t / pulseSpeed);
  const haloGrad = ctx.createRadialGradient(cx, cy, haloR * 0.25, cx, cy, haloR);
  haloGrad.addColorStop(0, `rgba(255,215,0,${0.15 * pulse})`);
  haloGrad.addColorStop(0.5, `rgba(255,200,60,${minAlpha * pulse})`);
  haloGrad.addColorStop(1, 'rgba(255,180,0,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 四角闪烁星星
  const sparkles = [
    { x: cx - w/2 - 10*s, y: cy - h/2 - 6*s, r: 5, ph: 0.0 },
    { x: cx + w/2 + 8*s,  y: cy - h/2 + 4*s, r: 4, ph: 2.0 },
    { x: cx + w/2 + 6*s,  y: cy + h/2,       r: 5, ph: 4.0 },
    { x: cx - w/2 - 4*s,  y: cy + h/2 + 6*s, r: 4, ph: 1.0 },
  ];
  sparkles.forEach((sp, i) => {
    const blink = Math.abs(Math.sin(t / 350 + sp.ph));
    const alpha = 0.3 + 0.7 * blink;
    const r = sp.r * (0.6 + 0.4 * blink) * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#ffffff';
    this._drawSparkleShape(ctx, sp.x, sp.y, r);
    ctx.restore();
  });
}
```

---

### 方案 4：统一数字强调动画（P1，1 小时）

```javascript
// 添加到 js/renderer.js 的 Renderer 类中
animatedNumber(ctx, x, y, value, options = {}) {
  const {
    mode = 'pulse',        // 'pulse' | 'roll' | 'switch'
    animState,             // { startTime, fromValue?, toValue? }
    size = 16,
    color = '#5a4a2a',
    align = 'center',
    s = this.scale,
    pulseScale = 0.3,
    duration = 400
  } = options;

  ctx.save();
  ctx.font = `bold ${Math.floor(size * s)}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  let displayValue = value;
  let scale = 1;

  if (animState && animState.startTime) {
    const elapsed = Date.now() - animState.startTime;
    const progress = Math.min(elapsed / duration, 1);

    if (mode === 'pulse') {
      scale = 1 + pulseScale * Math.sin(progress * Math.PI);
    } else if (mode === 'switch' && animState.fromValue !== undefined) {
      scale = 1 + pulseScale * Math.sin(progress * Math.PI);
      displayValue = progress >= 0.5 ? value : animState.fromValue;
    } else if (mode === 'roll' && animState.fromValue !== undefined) {
      const ease = progress * (2 - progress);
      // 旧数字上滑淡出
      if (progress < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - ease;
        ctx.fillText(String(animState.fromValue), x, y - ease * size * s);
        ctx.restore();
      }
      // 新数字从下方进入
      ctx.globalAlpha = ease;
      ctx.translate(x, y + (1 - ease) * size * s);
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
      return;
    }
  }

  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillText(String(displayValue), 0, 0);
  ctx.restore();
}
```

---

### 方案 5：统一按钮按压（P1，1 小时）

在 `Renderer` 上增加 `drawAnimatedButton()`，内部统一使用 `AnimationManager.buttonPress()` 逻辑：

```javascript
drawAnimatedButton(label, x, y, w, h, options = {}) {
  const { color = '#c4a35a', textColor = '#fff', pressed = false, s = this.scale } = options;
  const scale = pressed ? 0.92 : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(scale, scale);
  this.roundRect(-w / 2, -h / 2, w, h, 8 * s, color);
  this.text(label, 0, 0, 16, textColor);
  ctx.restore();
  return { x, y, w, h };
}
```

所有按钮统一改为 `pressed` 状态触发 `scale=0.92`，删除各种 `pressOffset` 的 Y 轴位移实现。

---

## 六、重构实施优先级

### P0 — 立即做（今天就能完成，零风险）

1. **统一缓动函数**：删除 6 个重复的 `easeOutBack` 定义，全部改用 `Easing.xxx`
2. **提取 `_drawCardGlow`**：删除 shop.js 和 settlement.js 中重复的金色光晕代码
3. **提取 `fadeIn` 工具函数**：删除 settlement.js 和 renderer.js 中重复的 `fadeIn`

**预期收益**：删除约 150 行重复代码，减少 3 个文件中的重复定义。

### P1 — 建议做（1~2 天，低风险）

4. **提取弹窗基类 `PopupRenderer`**：统一 5 个弹窗的弹出/消失动画
5. **统一数字动画 `animatedNumber`**：统一 6 处数字强调动画
6. **统一按钮按压**：全部改为 scale 0.92 回弹

**预期收益**：减少约 500 行重复代码，所有弹窗和按钮动画体验一致。

### P2 — 可选做（不影响当前迭代）

7. **扩展 `AnimationManager.flyOut()`**：支持 `right` 方向，替换 shop.js 中的售出飞出
8. **将更多手动动画迁移到 `AnimationManager`**：如 pendingCheck 中的字母跳跃、女巫牌跳跃等

---

## 七、注意事项

1. **Canvas 2D 的 `ctx.save()`/`ctx.restore()`**：弹窗基类重构时需要特别注意状态栈的嵌套，确保每个 `save` 都有对应的 `restore`。
2. **WeChat Mini Game 基础库兼容性**：避免使用 `requestAnimationFrame` 之外的高精度定时器，当前基于 `Date.now()` 的方案兼容性最好。
3. **性能考虑**：Canvas 2D 的 `globalAlpha`、`scale`、`translate` 状态切换频繁时可能影响低端机性能，重构后可以通过减少 `save`/`restore` 嵌套层数来优化。
4. **状态管理**：当前大量动画状态挂在 `game` 对象上（如 `_closingSettlement`、`_reduceTargetAnim`），重构弹窗基类时建议改为每个 Renderer 实例自己管理状态。

---

## 八、附录：所有动画状态字段清单

以下字段散落在 `game` 对象或 Renderer 实例上，用于控制动画状态：

| 字段 | 位置 | 用途 |
|------|------|------|
| `game._closingSettlement` | game.js | 结算弹窗关闭中 |
| `game._closeStartTime` | game.js | 结算弹窗关闭开始时间 |
| `game._closingGameOver` | game.js | 游戏结束弹窗关闭中 |
| `game._closingChangeLetter` | game.js | 字母置换弹窗关闭中 |
| `game._closeChangeLetterStartTime` | game.js | 字母置换弹窗关闭开始时间 |
| `game._closingConfirmBuy` | game.js | 确认购买弹窗关闭中 |
| `game._closeConfirmBuyStartTime` | game.js | 确认购买弹窗关闭开始时间 |
| `game._successBtnPressed` | game.js | 成功弹窗按钮按下中 |
| `game._successPressedBtn` | game.js | 按下的按钮 action |
| `game._successBtnPressTime` | game.js | 成功按钮按下时间 |
| `game._challengeBtnPressed` | game.js | 挑战按钮按下中 |
| `game._shopToGameTransition` | game.js | 商店→游戏过渡动画 |
| `game._sellingProp` | game.js | 售出道具动画状态 |
| `game._reduceTargetAnim` | game.js | 目标分数减免动画 |
| `game._potionUpgrading` | game.js | 药水升级动画状态 |
| `game._restartBtnPressed` | game.js | 重新开始按钮按下 |
| `game.potionMode` | game.js | 药水立即使用模式 |
| `game._prePotionState` | game.js | 药水使用前状态 |
| `game.pendingCheck` | game.js | 单词检测动画状态（含 animPhase） |
| `game._changeLetterHint` | game.js | 置换提示动画状态 |
| `game.witchRewardData` | game.js | 女巫奖励状态（含 phase、_opening） |
| `renderer.scoreAnim` | renderer.js | HUD 分数脉冲动画 |
| `renderer.goldAnim` | renderer.js | 金币脉冲动画 |
| `renderer.scoreRoll` | renderer.js | 分数方块数字滚动 |
| `renderer.multAnim` | renderer.js | 倍率方块脉冲动画 |
| `renderer.sparkles` | renderer.js | 烟花粒子数组 |
| `renderer.flyingScore` | renderer.js | 飞行总分动画 |
| `shopRenderer.sellBtnAnimStart` | shop.js | 售出按钮出现动画 |
| `shopRenderer.priceBtnPressed` | shop.js | 价格按钮按下状态 |
| `shopRenderer.challengeBtnPressed` | shop.js | 挑战按钮按下状态 |
| `confirmBuyRenderer._successAnimStarted` | shop.js | 购买成功动画已开始 |
| `animManager.animations` | animation.js | 集中式动画实例数组 |
| `card.animOffset` | 各卡片 | 飞入/飞出偏移量 |
| `card.selectOffset` | 各卡片 | 选中偏移量 |
| `card.jumpOffsetY` | 各卡片 | 字母跳跃偏移量 |
| `joker._triggered` | 各女巫牌 | 是否触发紫色边框 |
| `joker._jumpOffsetY` | 各女巫牌 | 女巫牌跳跃偏移量 |
| `joker._wwJumpStart` | 各女巫牌 | whole_word 跳跃开始时间 |
| `joker._wwJumpDone` | 各女巫牌 | whole_word 跳跃是否完成 |
