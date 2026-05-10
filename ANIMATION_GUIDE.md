# 动画开发规范（Animation Coding Standards）

> 适用范围：`js/renderer.js`、`js/shop.js`、`js/settlement.js`、`js/game.js` 及所有新增 Renderer
> 生效分支：`refactor/animation-generalization` 合并后全分支生效

---

## 一、总则

本项目基于 **Canvas 2D + 纯手动帧动画**（无第三方动画库）。所有动画通过 `Date.now()` 计算 `elapsed` 和 `progress` 实现。

**核心原则**：
1. **不重复造轮子** — 已有通用方法必须先复用，禁止 copy-paste 修改
2. **状态与绘制分离** — 动画状态计算在 `draw()` 开头集中完成，绘制逻辑只读状态
3. **每个 `save()` 必须有对应的 `restore()`** — Canvas 状态栈泄漏是本项目最高频的隐形 bug
4. **WeChat 兼容性优先** — 不使用 `requestAnimationFrame` 之外的高精度定时器

---

## 二、缓动函数（Easing）— 绝对禁止 inline 定义

### ❌ 禁止（反模式）

```javascript
// 任何 Renderer 的 draw() 方法中禁止出现以下代码：
const c1 = 1.70158;
const c3 = c1 + 1;
const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

// 或
const eased = 1 - Math.pow(1 - t, 3);

// 或
const ease = t * (2 - t);
```

**原因**：本项目历史上有 7 处完全相同的 `easeOutBack` inline 定义，维护时修改一处会漏掉其他 6 处。

### ✅ 正确做法

```javascript
const { Easing } = require('./animation');

// 所有缓动统一从 Easing 对象获取：
const enterEase = Easing.easeOutBack(progress);
const flyEase   = Easing.easeOutCubic(progress);
const fadeEase  = Easing.easeInOutQuad(progress);
```

### 可用缓动清单

| 名称 | 用途 | 公式 |
|------|------|------|
| `Easing.easeOutBack` | 弹窗入场、按钮出现、补位滑动 | 标准 easeOutBack (c1=1.70158) |
| `Easing.easeOutBackStrong` | 需要更强回弹感的场景 | c1=2.5 的强回弹版 |
| `Easing.easeOutCubic` | 卡牌飞出、平滑过渡 | 1 - (1-t)³ |
| `Easing.easeInOutQuad` | 双向对称缓动 | |
| `Easing.easeOutBounce` | 掉落回弹 | 物理弹跳 |
| `Easing.linear` | 匀速 | |

---

## 三、弹窗动画 — 必须使用 `_drawModalPanel`

### 规则

所有**居中弹窗**（遮罩 + 面板背景 + 入场/关闭动画）必须使用 `Renderer._drawModalPanel()`。

### 已覆盖的弹窗

| 弹窗 | 文件 | 状态 |
|------|------|------|
| 结算弹窗 | `settlement.js` | ✅ 已迁移 |
| 游戏结束弹窗 | `renderer.js` | ✅ 已迁移 |
| 字母置换弹窗 | `renderer.js` | ✅ 已迁移 |
| 确认购买弹窗 | `shop.js` | ⚠️ 特殊，暂保留手写（见例外） |

### ✅ 标准用法

```javascript
draw(ctx, game, W, H, s) {
  const elapsed = isClosing ? 99999 : Date.now() - this.animStartTime;

  const panel = this.parent._drawModalPanel(ctx, W, H, s, {
    isClosing: game._closingXxx,
    closeStartTime: game._closeXxxStartTime,
    width: 300,           // 弹窗宽度（设计稿 px，内部自动乘 s）
    height: 340,          // 弹窗高度
    borderRadius: 14,     // 圆角（默认 14）
    borderWidth: 1.5,     // 边框粗细（默认 1.5）
    overlayAlpha: 0.65,   // 遮罩最大透明度（默认 0.65）
    overlayFadeInDuration: 200,
    enterOffset: 25,      // 入场从下方偏移距离
    closeOffset: 40,      // 关闭向上滑出距离
    elapsed,
    onCloseComplete: () => {
      // 关闭动画完成后执行清理
      game.settlementData = null;
      game._closingXxx = false;
    }
  });

  if (!panel) return;  // 关闭动画已完成，直接返回
  const { px, py, pw, ph, elapsed: panelElapsed } = panel;

  // 在此之后绘制弹窗内部内容
  // 每个元素自己 ctx.save()/ctx.restore()
}
```

### ⚠️ 例外：ConfirmBuyRenderer

`ConfirmBuyRenderer` 因以下特殊性暂未迁移：
- 内层细边框（双层边框效果）
- 成功弹窗切换时遮罩不重新淡入
- 关闭时长 150ms（标准 300ms）
- 关闭后触发 `reduceTargetAnim`

**若后续需要新增类似复杂弹窗，优先扩展 `_drawModalPanel` 的配置参数，而非新开手写模板。**

### `_drawModalPanel` 已内部处理的事项

调用者**不需要也不应该**自己处理：
- ✅ 遮罩绘制（含淡入/淡出）
- ✅ 面板背景 + 边框绘制
- ✅ 关闭进度计算（`closeProgress`、`closeAlpha`、`closeSlideY`）
- ✅ 入场 easeOutBack 计算
- ✅ `ctx.save()` / `ctx.restore()`（方法内部已配对）

调用者**必须自己处理**：
- 弹窗标题、分隔线、内容列表
- 按钮、关闭图标
- 内容淡入（用 `Easing.fadeIn`）

---

## 四、内容交错淡入 — 必须使用 `Easing.fadeIn`

### 规则

弹窗内部的内容（标题、列表项、按钮）需要依次淡入时，统一使用 `Easing.fadeIn`。

### ✅ 正确做法

```javascript
// 标题：延迟 80ms，250ms 淡入，向上偏移 8*s
const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
ctx.save();
ctx.globalAlpha = titleAnim.alpha;
ctx.fillText('标题文字', x, y + titleAnim.yShift);
ctx.restore();

// 列表项：交错延迟，每项间隔 60ms
items.forEach((item, i) => {
  const itemAnim = Easing.fadeIn(elapsed, 180 + i * 60, 250, 8 * s);
  ctx.save();
  ctx.globalAlpha = itemAnim.alpha;
  ctx.fillText(item.label, x, y + i * lineH + itemAnim.yShift);
  ctx.restore();
});

// 按钮：最后出现
const btnAnim = Easing.fadeIn(elapsed, 480, 250, 10 * s);
```

### 参数说明

```javascript
Easing.fadeIn(elapsed, delay, duration = 250, offsetY = 0)
// 返回 { alpha: 0~1, yShift: offsetY~0 }
// 使用 easeOutQuad: t * (2 - t)
```

---

## 五、数字强调动画（脉冲）— 必须使用 `_calcPulseScale`

### 规则

任何数字变化时的"放大→缩小回弹"效果，统一使用 `Renderer._calcPulseScale()`。

### ✅ 正确做法

```javascript
// 初始化脉冲状态（在检测到数值变化时）
if (this.lastScore !== game.score) {
  this.scoreAnim = { startTime: Date.now(), duration: 400 };
  this.lastScore = game.score;
}

// 绘制时获取当前脉冲值
const pulse = this._calcPulseScale(this.scoreAnim, 0.2);  // maxScale = 20%
let scale = pulse.scale;
if (pulse.progress >= 1) this.scoreAnim = null;

ctx.save();
ctx.translate(cx, cy);
ctx.scale(scale, scale);
ctx.fillText(String(game.score), 0, 0);
ctx.restore();
```

### ⚠️ 跨方法传递脉冲（如药水升级分数）

若脉冲发生在动画时间线内部，且最终由 `drawCard()` 绘制，可将计算好的 scale 写入 `card._scoreScale`：

```javascript
// 在动画方法中计算脉冲并挂载到卡牌对象
const pulseState = { startTime: Date.now(), duration: 400 };
const scoreScale = this._calcPulseScale(pulseState, 0.2).scale;
tempCard._scoreScale = scoreScale;

// 在 drawCard() 分数绘制段消费
let scoreScale = 1;
if (card._scorePulseAnim) { /* ... */ }
if (card._scoreScale) {
  scoreScale = card._scoreScale;
}
ctx.scale(scoreScale, scoreScale);
```

### 已统一的使用场景

| 场景 | 文件 | maxScale | 说明 |
|------|------|----------|------|
| HUD 当前分数 | renderer.js | 0.20 | 分数变化时 |
| 金币胶囊 | renderer.js | 0.30 | 金币变化时 |
| 基础倍率 | renderer.js | 0.28 | 倍率变化时 |
| 目标分数减免 | shop.js | 0.20 | 购买 reduce_target 后，目标数字放大回弹 |
| 药水升级分数 | renderer.js | 0.20 | `_drawPotionUpgradeAnim` 计算脉冲后写入 `card._scoreScale`，`drawCard` 读取并应用缩放 |

### 返回值

```javascript
{ scale: number, progress: number }
// scale: 1 + maxScale * sin(π * progress)
// progress: 0~1，完成后外部负责把 animState 置 null
```

---

## 六、按钮按压 — 必须使用 `_drawScaledBtn`

### 规则

所有可点击按钮的按压反馈（按下缩小，松手回弹），统一使用 `Renderer._drawScaledBtn()`。

### ✅ 正确做法

```javascript
// 在 Renderer 中定义按钮状态
this.restartBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

// 绘制时判断是否按下
const isPressed = game._restartBtnPressed;
const pressScale = isPressed ? 0.92 : 1;

this._drawScaledBtn(ctx, btnX, btnY, btnW, btnH, 8 * s,
  '#c4a35a', null, pressScale, '重新开始', '#fff', 16 * s);
```

### 参数

```javascript
_drawScaledBtn(ctx, x, y, w, h, r, fill, stroke, scale, text, textColor, fontSize)
// scale: 1 为正常，0.92 为按下状态
// 文字会自动居中
```

---

## 七、卡牌金色光晕 — 必须使用 `_drawCardGlow`

### 规则

任何需要给卡牌添加金色脉动光晕 + 四角闪烁星星的场景，统一使用 `Renderer._drawCardGlow()`。

### ✅ 正确做法

```javascript
// 在绘制完卡牌图片后调用
this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s, contentAlpha);

// contentAlpha: 如果外层有淡入动画，传入当前透明度（默认 1）
```

---

## 八、Canvas 状态管理规范

### 黄金法则

**每个 `ctx.save()` 必须在同一作用域内有对应的 `ctx.restore()`。**

### ❌ 禁止（反模式）

```javascript
// 反模式 A：只 save 不 restore
ctx.save();
ctx.globalAlpha = 0.5;
ctx.fillRect(...);
// 漏了 restore！

// 反模式 B：跨方法 save/restore
// 方法 A 中 save，方法 B 中 restore — 绝对禁止
```

### ✅ 正确做法

```javascript
// 模式 A：紧挨着的一对
ctx.save();
ctx.globalAlpha = fadeAlpha;
ctx.fillText(...);
ctx.restore();

// 模式 B：提前返回时也要 restore
ctx.save();
ctx.globalAlpha = fadeAlpha;
if (!shouldDraw) {
  ctx.restore();
  return;
}
ctx.fillText(...);
ctx.restore();
```

### 弹窗绘制的状态嵌套

`_drawModalPanel` 内部已做 `save()/restore()`，返回后 globalAlpha 恢复为 1。调用者绘制弹窗内容时**必须自己再 save/restore**。

```javascript
const panel = this._drawModalPanel(...);
if (!panel) return;

// 绘制标题
ctx.save();
ctx.globalAlpha = titleAnim.alpha;
ctx.fillText('标题', x, y);
ctx.restore();

// 绘制按钮
ctx.save();
ctx.globalAlpha = btnAnim.alpha;
this._drawScaledBtn(...);
ctx.restore();
```

---

## 九、动画状态命名规范

### 关闭状态（Popup Close State）

所有弹窗关闭状态必须遵循以下命名：

```javascript
// game 对象上的关闭标志
{popupName}._closing{PopupName}        // 是否正在关闭，boolean
{popupName}._close{PopupName}StartTime // 关闭开始时间，number (Date.now())

// 示例
// 结算弹窗
game._closingSettlement = true;
game._closeStartTime = Date.now();

// 字母置换弹窗
game._closingChangeLetter = true;
game._closeChangeLetterStartTime = Date.now();

// 确认购买弹窗
game._closingConfirmBuy = true;
game._closeConfirmBuyStartTime = Date.now();
```

### 脉冲状态（Pulse State）

```javascript
// Renderer 实例上的脉冲状态
this.{name}Anim = { startTime: Date.now(), duration: 400 };

// 示例
this.scoreAnim = { startTime: Date.now(), duration: 400 };
this.goldAnim = { startTime: Date.now(), duration: 400 };
this.multAnim = { startTime: Date.now(), duration: 400 };
```

### 淡入/滚动状态

```javascript
this.scoreRoll = { from: 10, to: 15, startTime: Date.now(), duration: 300 };
this.animStartTime = Date.now();  // 弹窗/元素入场开始时间
```

---

## 十、新增动画的决策流程

开发新动画时，按以下顺序判断：

```
1. 是否是卡牌飞入/飞出/选中/取消选中？
   → 使用 AnimationManager（animation.js）

2. 是否是居中弹窗（遮罩 + 背景 + 入场/关闭）？
   → 使用 _drawModalPanel

3. 是否是数字变化时的放大缩小脉冲？
   → 使用 _calcPulseScale

4. 是否是内容依次淡入？
   → 使用 Easing.fadeIn

5. 是否是按钮按压反馈？
   → 使用 _drawScaledBtn

6. 是否是卡牌金色光晕？
   → 使用 _drawCardGlow

7. 都不匹配？
   → 先查 Easing 是否有合适的缓动函数
   → 仍不匹配，才允许手写，但必须注释说明"未命中现有通用方案"
```

---

## 十一、Code Review Checklist

提交涉及动画的 PR 时，必须自查以下项目：

- [ ] 没有 inline 定义的缓动函数（`c1 = 1.70158`、`1 - Math.pow(1-t, 3)`、`t*(2-t)` 等）
- [ ] 没有遗漏的 `ctx.restore()`（每个 save 都有 restore）
- [ ] 弹窗使用了 `_drawModalPanel`（除非在"例外清单"中）
- [ ] 数字脉冲使用了 `_calcPulseScale`
- [ ] 内容淡入使用了 `Easing.fadeIn`
- [ ] 按钮按压使用了 `_drawScaledBtn`
- [ ] 动画状态命名符合规范（`_closingXxx` / `_closeXxxStartTime`）
- [ ] 通过 `node --check` 语法检查
- [ ] 在微信开发者工具中实际运行验证

---

## 十二、常见 Bug 与教训

### Bug 1：变量未定义（`ReferenceError: gold is not defined`）

**场景**：重构时把 `const gold = '#c4a35a'` 移到方法后面，但前面还有引用。
**修复**：改为直接写颜色值，或确保变量定义在使用之前。

### Bug 2：Canvas 状态泄漏（`ctx.save()` 无 `restore`）

**场景**：`_drawModalPanel` 原来只有 `save` 没有 `restore`，导致 globalAlpha 持续累积。
**修复**：`_drawModalPanel` 返回前增加 `ctx.restore()`。

### Bug 3：缓动函数 copy-paste 后漏改

**场景**：7 处 `easeOutBack` 分别手写，某次调整回弹强度时只改了 1 处。
**修复**：全部集中到 `Easing.easeOutBack`。

---

### Bug 4：串行动画的时间基准错位（`letter_god` 重构案）⭐⭐⭐

**影响范围**：`js/game.js` `playHand()`、`js/renderer.js` `_drawLetterGodAnim()` / `drawPlaying()`

#### 问题描述

`letter_god`（字母之神）女巫牌触发时，需要在单词验证成功后插入一段专属动画（星星从女巫牌飞到各字母牌），然后再继续正常的计分动画（字母跳跃→倍率→总分飞行）。

原始实现用固定 `setTimeout` 时间轴推进 `animPhase`，导致：
- 字母之神动画期间跳过了烟花
- 总分飞行动画比倍率/字母跳跃还早触发
- 时间轴计算复杂且容易出错

#### 重构方案：事件驱动 + 串行时间基准重置

**核心原则**：
1. **事件驱动推进**：前一阶段动画完成后，由 renderer 主动设置下一 `animPhase`，不用 `setTimeout`
2. **每个阶段独立计时**：串行动画切换时必须重置 `resolveTime`，否则 `elapsed` 会累积到下一阶段，导致动画瞬间完成或计算错乱

**正确做法**：

```javascript
// === game.js playHand() ===
// 始终设置 resolveTime 和 animPhase = 0，让烟花立即开始
this.pendingCheck.resolveTime = Date.now();
this.pendingCheck.animPhase = 0;

// 字母之神动画延迟 startTime，等烟花放完（1000ms）后再开始
this._letterGodAnim = {
  startTime: Date.now() + 1000,  // ← 关键：延迟启动
  maxCardId: maxCard.id,
  playedCardIds: played.map(c => c.id),
};

// 不再使用 setTimeout 推进 animPhase！

// === renderer.js _drawLetterGodAnim() ===
// 动画完成后：
if (elapsed >= totalDuration) {
  game._letterGodAnim = null;
  if (game.pendingCheck && game.pendingCheck.state === 'valid') {
    // 关键：重置 resolveTime，让后续字母跳跃从当前时间开始计时
    // 减去 letterJumpStart(1000ms)，使 jumpElapsed 从 0 开始，
    // 第一个字母立即跳跃，方块不会显示 "0"
    game.pendingCheck.resolveTime = Date.now() - 1000;
    game.pendingCheck.animPhase = 1;  // 直接进入字母跳跃阶段
  }
  return;
}

// === renderer.js drawPlaying() ===
// 阶段0→1 过渡（事件驱动）
if (phase === 0 && !game._letterGodAnim) {
  if (!pc._phase0StartTime) pc._phase0StartTime = Date.now();
  if (Date.now() - pc._phase0StartTime >= 1000) {
    pc.animPhase = 1;  // 烟花放完后主动推进
  }
}

// 阶段1 完成后主动推进到阶段2
if (isAllJumped && phase < 2) {
  const totalJumpTime = cardsInOrder.length * letterInterval;
  const waveDuration = 200 + cardsInOrder.length * 100;
  const waveElapsed = jumpElapsed - totalJumpTime;
  if (waveElapsed >= waveDuration + 100) {
    pc.animPhase = 2;
  }
}

// 阶段2 完成后主动推进到阶段3
if (phase >= 2 && phase < 3) {
  const wjList = pc.wholeWordJokers || [];
  const allDone = wjList.every(({ idx }) => {
    const joker = game.jokers?.[idx];
    return !joker || joker._wwJumpDone;
  });
  if (allDone && elapsedSincePhase2 >= baseMultDelay + 200) {
    pc.animPhase = 3;
  }
}

// 全部完成后统一回调
if (phase >= 3 && pc._flyingScoreStarted && !this.flyingScore && !game._playHandAnimCompleted) {
  game._playHandAnimCompleted = true;
  if (game.completePlayHand) game.completePlayHand();
}
```

#### 踩过的坑

| 现象 | 根因 | 修复 |
|------|------|------|
| 字母之神动画期间烟花被跳过 | `drawPlaying` 中 `_letterGodAnim` 存在时直接跳过了 `else` 块（包含烟花） | 把烟花逻辑提到 `if/else` 外面，始终触发 |
| 字母之神完成后字母跳跃/波浪看不到 | `resolveTime` 未重置，`elapsed` 已 3000+ms，所有字母瞬间判定为跳完 | 完成时设置 `resolveTime = Date.now() - 1000` |
| 第一个方块显示 "0" | `resolveTime` 重置为 `Date.now()` 后 `jumpElapsed = -1000`，`accumulatedScore = 0` | 重置时减去 `letterJumpStart`，让 `jumpElapsed` 从 0 开始 |
| 总分飞行结束后没重置预览区、没飞牌 | `completePlayHand()` 未清 `pendingCheck`；`_executePlayHand` 依赖 `selected` 状态，动画期间用户点击会清除 `selected` | `completePlayHand()` 末尾加 `this.pendingCheck = null`；`_executePlayHand` 改用传入的 `playedCards` 参数；动画期间禁用卡牌点击 |
| 总分飞行比倍率还早 | `game.js` 中 `letter_god` 触发时 setTimeout 仍在执行，提前把 `animPhase` 推到 3 | 移除所有 setTimeout，完全由 renderer 事件驱动 |

#### 铁律（以后加新动画必须遵守）

1. **串行动画 = 必须重置时间基准**
   - 每个阶段的 `resolveTime` 或 `startTime` 必须在阶段开始时重新设置
   - 如果新动画插在现有动画中间，要么让新动画自己独立计时，要么把后续动画的计时起点后移

2. **事件驱动 > 固定时间轴**
   - 用 "前一动画完成标志" 或 "状态检测" 推进阶段，不要用 `setTimeout(() => animPhase = N, delay)`
   - 例外：仅适用于不依赖动画完成的纯延迟（如音效播放）

3. **动画完成回调里清理所有状态**
   - `pendingCheck = null`
   - `_playHandAnimCompleted = false`（下一轮开始前的重置）
   - 任何挂载在 `game` 或 `renderer` 上的临时动画状态都要清理

4. **动画期间必须禁用相关交互**
   - `handleInput` 中检查 `game.pendingCheck`，存在时跳过卡牌点击
   - 否则用户误触会修改动画依赖的状态（如 `selected`）

5. **后端逻辑不要依赖前端 UI 状态**
   - `_executePlayHand` 之前通过 `this.hand` 遍历找 `selected` 牌，这非常脆弱
   - 后端方法应该接收明确的参数（如 `playedCards` 数组），不依赖 `selected` / `cardRects` 等 UI 状态

---

## 十三、附录：通用 API 速查

### `Easing`（`js/animation.js`）

```javascript
Easing.easeOutBack(t)         // 弹窗入场、按钮出现
Easing.easeOutBackStrong(t)   // 更强回弹
Easing.easeOutCubic(t)        // 平滑飞出
Easing.easeInOutQuad(t)       // 对称缓动
Easing.easeOutBounce(t)       // 物理弹跳
Easing.linear(t)              // 匀速
Easing.fadeIn(elapsed, delay, duration = 250, offsetY = 0)
                              // 返回 { alpha, yShift }
```

### `Renderer` 通用绘制方法（`js/renderer.js`）

```javascript
// 弹窗模板
this._drawModalPanel(ctx, W, H, s, config)
  // config: isClosing, closeStartTime, width, height, borderRadius, borderWidth,
  //         overlayAlpha, overlayFadeInDuration, enterOffset, closeOffset,
  //         elapsed, onCloseComplete
  // 返回: { px, py, pw, ph, elapsed, enterProgress, closeProgress, closeAlpha }

// 数字脉冲
this._calcPulseScale(animState, maxScale = 0.3)
  // 返回: { scale, progress }

// 按钮按压
this._drawScaledBtn(ctx, x, y, w, h, r, fill, stroke, scale, text, textColor, fontSize)

// 卡牌光晕
this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s, contentAlpha = 1)
```

### `AnimationManager`（`js/animation.js`）

```javascript
const { AnimationManager } = require('./animation');
this.animManager = new AnimationManager();

this.animManager.flyOut(card, 'left', onComplete, delay);
this.animManager.flyIn(card, 'left', onComplete, delay);
this.animManager.scorePop(value, x, y, onComplete);
this.animManager.buttonPress(btnRect, onComplete);
this.animManager.cardSelect(card, onComplete);
this.animManager.cardDeselect(card, onComplete);
```
