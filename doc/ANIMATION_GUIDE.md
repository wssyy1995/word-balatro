# 动画开发规范（Animation Coding Standards）

> 适用范围：`js/render/*.js`、`js/shop.js`、`js/settlement.js`、`js/game.js` 及所有新增 Renderer
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
| 游戏结束弹窗 | `js/render/gameover.js` | ✅ 已迁移 |
| 字母置换弹窗 | `js/render/popup.js` | ✅ 已迁移 |
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

### 弹窗关闭时的内容淡出规范 ⭐⭐⭐

`_drawModalPanel` 返回 `closeAlpha`（关闭时从 1→0 线性淡出），但**只应用到遮罩和面板背景**。弹窗内的所有内容（文字、图片、按钮、装饰线）必须由调用者手动乘上 `closeAlpha`。

#### ✅ 正确做法

```javascript
const panel = this._drawModalPanel(...);
if (!panel) return;
const { px, py, pw, ph, closeAlpha } = panel;

// 标题
const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
ctx.save();
ctx.globalAlpha = titleAnim.alpha * closeAlpha;  // ← 必须乘 closeAlpha
ctx.fillText('标题', x, y + titleAnim.yShift);
ctx.restore();

// 图片也一样
ctx.save();
ctx.globalAlpha = closeAlpha;  // ← 图片没有 fadeIn，直接乘 closeAlpha
ctx.drawImage(img, x, y, w, h);
ctx.restore();
```

#### ❌ 错误做法

```javascript
// 错误 1：完全忘了乘 closeAlpha
ctx.save();
ctx.globalAlpha = titleAnim.alpha;  // 关闭时 titleAnim.alpha = 1，内容不淡出！
ctx.fillText('标题', x, y);
ctx.restore();

// 错误 2：用 if (!isClosing) 条件控制，关闭时完全不绘制
if (!isClosing) {
  ctx.save();
  ctx.globalAlpha = contentAlpha;
  this._drawCardGlow(...);  // 关闭时光晕直接消失，不是淡出
  ctx.restore();
}
```

#### 常见遗漏清单

| 元素 | 是否容易遗漏 | 示例 |
|------|-------------|------|
| 标题文字 | ✅ | `ctx.globalAlpha = titleAnim.alpha` 忘了 `* closeAlpha` |
| 图片（drawImage） | ✅ | 图片没有 fadeIn，需直接 `ctx.globalAlpha = closeAlpha` |
| 装饰线/分隔线 | ✅ | `_drawTitleDivider` 调用前需设 alpha |
| 按钮 | ✅ | `_drawScaledButton` 调用前需设 alpha |
| 自定义装饰（星星、竖线） | ✅ | 直接 `fillRect` / `drawStar` 无 alpha 控制 |

### `_drawModalPanel` 已内部处理的事项

调用者**不需要也不应该**自己处理：
- ✅ 遮罩绘制（含淡入/淡出）
- ✅ 面板背景 + 边框绘制
- ✅ 关闭进度计算（`closeProgress`、`closeAlpha`）
- ✅ 入场 easeOutBack 计算
- ✅ `ctx.save()` / `ctx.restore()`（方法内部已配对）

调用者**必须自己处理**：
- 弹窗标题、分隔线、内容列表
- 按钮、关闭图标
- 内容淡入（用 `Easing.fadeIn`）
- **关闭淡出（必须乘 `closeAlpha`）** — 见下文「弹窗关闭时的内容淡出规范」

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
| HUD 当前分数 | `js/render/hud.js` | 0.20 | 分数变化时 |
| 金币胶囊 | `js/render/hud.js` | 0.30 | 金币变化时 |
| 基础倍率 | `js/render/playing.js` | 0.28 | 倍率变化时 |
| 目标分数减免 | `js/shop.js` | 0.20 | 购买 reduce_target 后，目标数字放大回弹 |
| 药水升级分数 | `js/render/popup.js` | 0.20 | `_drawPotionUpgradeAnim` 计算脉冲后写入 `card._scoreScale`，`drawCard` 读取并应用缩放 |

### 返回值

```javascript
{ scale: number, progress: number }
// scale: 1 + maxScale * sin(π * progress)
// progress: 0~1，完成后外部负责把 animState 置 null
```

---

## 六、按钮按压 — 必须使用 `_drawScaledButton`

### 规则

所有可点击按钮的按压反馈（按下缩小，松手回弹），统一使用 `Renderer._drawScaledButton()`。

### ✅ 正确做法

```javascript
// 在 Renderer 中定义按钮状态
this.restartBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

// 绘制时传入 pressed 状态
const isPressed = game._restartBtnPressed;

this._drawScaledButton(ctx, '重新开始', btnX, btnY, btnW, btnH, s, isPressed, {
  color: '#c4a35a',
  radius: 8,
  textColor: '#fff'
});
```

### 参数

```javascript
_drawScaledButton(ctx, label, x, y, w, h, s, pressed, options = {})
// label: 按钮文字
// s: 响应式缩放比例
// pressed: true 为按下状态（内部自动缩放到 0.95）
// options: { color, textColor, radius, stroke, lineWidth }
// 文字会自动居中
```

---

## 七、卡牌金色光晕 — 必须使用 `_drawCardGlow`

### 规则

任何需要给卡牌添加金色脉动光晕 + 四角闪烁星星的场景，统一使用 `Renderer._drawCardGlow()`。

### ✅ 正确做法

```javascript
// 在绘制完卡牌图片后调用
this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s);

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
ctx.globalAlpha = titleAnim.alpha * closeAlpha;
ctx.fillText('标题', x, y);
ctx.restore();

// 绘制按钮
ctx.save();
ctx.globalAlpha = btnAnim.alpha * closeAlpha;
this._drawScaledButton(ctx, "按钮文字", x, y, w, h, s, isPressed, { color: "#c4a35a" });
ctx.restore();
```

### 子方法覆盖 `globalAlpha` 的风险（`drawCard` 案）

调用 `drawCard()` 时要特别小心：该方法内部会直接设置 `ctx.globalAlpha`，如果放在弹窗的 `closeAlpha` 环境下，**必须确保 `drawCard` 不会覆盖外层的 alpha**。

```javascript
// drawCard 内部实现（js/render/base.js，简化）
ctx.save();
ctx.globalAlpha *= opacity;  // ✅ 正确：乘上 opacity，保留外层 closeAlpha
// 绘制卡牌...
ctx.restore();
```

**如果子方法内部是 `ctx.globalAlpha = opacity`（赋值而非相乘），就会覆盖外层的 `closeAlpha`，导致卡牌不随弹窗淡出。**

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
   → 使用 _drawScaledButton（或 drawImgBtn 用于图片按钮）

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
- [ ] 按钮按压使用了 `_drawScaledButton`
- [ ] 动画状态命名符合规范（`_closingXxx` / `_closeXxxStartTime`）
- [ ] **串行动画基于统一时间轴，没有引入独立计时器（如 `_xxxAnimStart = Date.now()`）**
- [ ] **Renderer 子方法没有访问父方法局部变量**
- [ ] **保命/惩罚/拦截机制覆盖了所有触发路径**
- [ ] **新增动画已查第十章决策流程，有注释说明未命中原因**
- [ ] **弹窗关闭时所有内容都乘了 `closeAlpha`（文字、图片、按钮、装饰线）**
- [ ] **调用 `drawCard()` 等子方法时，确认其 `globalAlpha` 是 `*=` 而非 `=`**
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

**影响范围**：`js/game.js` `playHand()`、`js/render/animation.js` `_drawLetterGodAnim()` / `js/render/playing.js` `drawPlaying()`

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
  const waveDuration = 180 + cardsInOrder.length * 90;
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

### Bug 5：串行动画时间基准不统一（`letter_a_mult_half` 惩罚动画案）⭐⭐⭐

**影响范围**：`js/render/playing.js` `drawPlaying()` 阶段2→3过渡

#### 问题描述

`letter_a_mult_half`（字母A倍率减半）惩罚动画需要插入到计分动画的阶段2（倍率弹出）和阶段3（总分飞行）之间。原始实现使用了独立的 `_multHalfAnimStart = Date.now()` 作为时间基准，与阶段2的 `phase2Elapsed` 各自为政。

后果：
- `whole_word` 女巫牌跳跃还没完成，惩罚动画就开始执行
- 倍率更新与惩罚光晕不同步
- 总分飞行时机混乱，有时提前有时延后

#### 错误代码（反模式）

```javascript
// ❌ 错误：引入独立时间基准
if (!pc._multHalfAnimStart) {
  pc._multHalfAnimStart = Date.now();
}
const multHalfElapsed = Date.now() - pc._multHalfAnimStart;

// ❌ 错误：与 afterBase 各自计算，两套时间线
if (multHalfElapsed >= MULT_HALF_DELAY + MULT_HALF_DURATION) {
  pc.animPhase = 3;
}
```

#### 修复：统一基于 `afterBase` 的时间轴

```javascript
// ✅ 正确：所有时间计算统一基于 afterBase = phase2Elapsed - baseMultDelay
const totalSteps = 1 + wjList.length;      // 基础倍率 + whole_word
const postWait = 300;                       // 强制等待
const readyTime = totalSteps * STEP_DURATION + postWait;

if (afterBase >= readyTime) {
  // 惩罚动画基于 afterBase 计算，不再引入新的 Date.now()
  const penaltyElapsed = afterBase - readyTime;
  const PENALTY_DURATION = 500;
  const POST_PENALTY_WAIT = 350;

  if (penaltyElapsed >= 0 && penaltyElapsed < PENALTY_DURATION) {
    // 执行惩罚动画...
  }
  if (penaltyElapsed >= PENALTY_DURATION + POST_PENALTY_WAIT) {
    pc.animPhase = 3;
  }
}
```

#### 踩过的坑

| 现象 | 根因 | 修复 |
|------|------|------|
| whole_word 跳跃和惩罚动画同时执行 | `_multHalfAnimStart` 与 `_phase2StartTime` 不同步，两个计时器各自推进 | 移除 `_multHalfAnimStart`，统一用 `afterBase` |
| 倍率更新后惩罚光晕还没出现 | `displayStep` 按 700ms 计算，`multHalfElapsed` 按 1500ms 计算，两套步长 | 统一 `STEP_DURATION = 400ms` |
| 总分飞行提前触发 | `allDone && elapsedSincePhase2 >= baseMultDelay + 200` 与惩罚延迟条件竞态 | 用 `afterBase >= readyTime + PENALTY_DURATION + POST_PENALTY_WAIT` 统一判断 |

### Bug 6：Renderer 子方法访问父方法局部变量（`witchSkill is not defined`）

**影响范围**：`js/render/playing.js` `drawPlaying()`

#### 问题描述

`drawPlaying()` 是 `render()` 调用的子方法。开发者在 `drawPlaying()` 中直接使用了 `render()` 方法体内的局部变量 `witchSkill`，导致运行时 `ReferenceError`。

```javascript
// ❌ 错误：drawPlaying 内访问了 render() 的局部变量
if (witchSkill && witchSkill.skill === 'letter_a_mult_half') {
  // ReferenceError: witchSkill is not defined
}
```

#### 修复

```javascript
// ✅ 正确：数据通过 game 对象或 pendingCheck 传递
const currentWitchSkill = getSkillForLevel(game.round);
const multHalfResult = pc.multHalfResult;  // 由 game.js 计算后挂载到 pendingCheck
```

### Bug 11：弹窗关闭时内容未同步淡出（`closeAlpha` 遗漏案）⭐⭐⭐

**影响范围**：`js/render/gameover.js` `GameOverRenderer` / `js/shop.js` `ConfirmBuyRenderer` / `js/render/popup.js` `drawChangeLetterPopup`

#### 问题描述

`_drawModalPanel` 采用"外包"模式：只负责绘制遮罩和面板背景，返回 `closeAlpha`，内容由各 Renderer 自行绘制。但多个 Renderer 中大量内容（图片、文字、装饰线、按钮）**完全没有乘 `closeAlpha`**，导致关闭时背景淡出了，内容还保持不透明，视觉上像被"拆开"。

#### 错误代码（反模式）

```javascript
// ❌ GameOverRenderer：标题忘了乘 closeAlpha
const titleAnim = Easing.fadeIn(elapsed, 80, 250, 8 * s);
ctx.save();
ctx.globalAlpha = titleAnim.alpha;  // 关闭时 elapsed=99999，alpha=1，完全不淡出！
ctx.fillText('游戏结束', x, y);
ctx.restore();

// ❌ ConfirmBuyRenderer：用 if (!isClosing) 条件控制
if (!isClosing) {
  ctx.save();
  ctx.globalAlpha = contentAlpha;
  this.parent._drawCardGlow(...);  // 关闭时光晕直接消失，不是淡出
  ctx.restore();
}
```

#### 修复

```javascript
// ✅ 所有内容统一乘 closeAlpha
ctx.save();
ctx.globalAlpha = titleAnim.alpha * closeAlpha;
ctx.fillText('游戏结束', x, y);
ctx.restore();

// ✅ ConfirmBuyRenderer：去掉 if (!isClosing)，统一使用 contentAlpha * closeAlpha
ctx.save();
ctx.globalAlpha = contentAlpha * closeAlpha;
this.parent._drawCardGlow(...);
ctx.restore();
```

#### 踩过的坑

| 现象 | 根因 | 修复 |
|------|------|------|
| 关闭时背景变透明了，文字/图片还留在屏幕上 | 内容绘制时忘了 `* closeAlpha` | GameOverRenderer 所有内容统一 `* closeAlpha` |
| 关闭时光晕突然消失（不是淡出） | `if (!isClosing)` 导致关闭时直接不绘制 `_drawCardGlow` | 去掉条件判断，改为 `contentAlpha * closeAlpha` |
| 字母置换弹窗关闭速度异常快 | `_drawModalPanel` 默认 `closeDuration=200ms`，但旧版是 300ms | 显式传入 `closeDuration: 300` |

---

### Bug 12：`drawCard` 覆盖外层 `globalAlpha`（弹窗内卡牌不淡出案）

**影响范围**：`js/render/base.js` `drawCard()` → 所有在弹窗内调用 `drawCard` 的场景

#### 问题描述

`drawCard()` 内部为了支持 `card.animOffset.opacity`，在开头设置了 `ctx.globalAlpha = opacity`。当弹窗关闭时，调用方已经设置了 `ctx.globalAlpha = closeAlpha`（如 0.5），但 `drawCard` 进入后直接覆盖为 `opacity`（默认 1），导致**卡牌图片完全不随弹窗淡出**。

#### 错误代码（反模式）

```javascript
// drawCard 内部（旧代码）
ctx.globalAlpha = opacity;  // ← 直接赋值，覆盖外层 closeAlpha
ctx.save();
// ... 绘制卡牌 ...
ctx.restore();
```

#### 修复

```javascript
// drawCard 内部（修复后）
ctx.save();
ctx.globalAlpha *= opacity;  // ← 相乘，保留外层 closeAlpha
// ... 绘制卡牌 ...
ctx.restore();
```

**注意**：`save()` 必须先于 `globalAlpha` 修改，否则 `restore()` 恢复的是被污染后的值。

---

### Bug 13：尝试"整体缩放"改动时 `save/restore` 严重不匹配 ⭐⭐⭐

**影响范围**：所有使用 `_drawModalPanel` 的弹窗（定义于 `js/render/effects.js`）

#### 问题描述

试图把所有弹窗关闭动画从"淡出+上移"改为"缩放至 0.3 + 淡出"时，需要在 `_drawModalPanel` 和各 Renderer 中添加统一的外层 `ctx.save()/ctx.scale()/ctx.restore()` 包裹。

但弹窗内容本身已有大量独立的 `ctx.save()/restore()`（标题、分隔线、列表项、按钮各自一对）。新增外层包裹后，极易导致：
- `save` 次数 ≠ `restore` 次数
- Canvas 状态栈泄漏或下溢
- 绘制错乱（出现"无数个嵌套页面"）

#### 教训

| 方案 | 可行性 | 原因 |
|------|--------|------|
| 给每个 Renderer 加外层 `save/scale/restore` | ❌ 风险极高 | 原有代码中 save/restore 嵌套复杂，人工包裹极易不匹配 |
| 重构 `_drawModalPanel` 接受 `drawContent` 回调 | ✅ 推荐 | 由 `_drawModalPanel` 统一 `save/scale/restore`，调用方只负责绘制内容，不管理状态 |
| 使用离屏 Canvas 统一缩放 | ⚠️ 性能开销 | 每帧创建/绘制离屏画布，低端机可能掉帧 |

**结论**：若要实现弹窗整体缩放，优先重构 `_drawModalPanel` 为回调模式，**禁止**在各 Renderer 中手动添加外层 save/restore 包裹。

---

### Bug 7：数字更新动画未复用通用方案（`_targetRollAnim` 案）

**影响范围**：`js/shop.js` `ShopRenderer.drawBottomModule()`、`game.js` `handleInput()`

#### 问题描述

生命延续触发后，商店底部目标分需要更新动画。最初独立实现了一套 `_targetRollAnim` 滚动动画（`easeOutCubic` 渐变），与项目内已有的「目标减免」脉冲动画（`_calcPulseScale`）效果不一致。

后果：
- 同一页面内两种数字更新动画风格冲突
- 多维护一套动画逻辑和状态清理代码

#### 错误代码（反模式）

```javascript
// ❌ 错误：独立实现滚动动画
game._targetRollAnim = {
  from: baseTarget,
  to: baseTarget + bonus,
  startTime: Date.now(),
  duration: 800,
};
// shop.js 内单独计算 easeOutCubic + 滚动值
```

#### 修复：复用 `_calcPulseScale`

```javascript
// ✅ 正确：复用已有的脉冲动画机制
game._lifeExtensionTargetAnim = { startTime: Date.now(), duration: 600 };

// shop.js 内
const pulse = this.parent._calcPulseScale(game._lifeExtensionTargetAnim, 0.2);
targetScale = pulse.scale;
displayTarget = pulse.progress >= 0.5 ? (baseTarget + bonus) : baseTarget;
```

### Bug 8：保命机制只覆盖了一条 gameover 路径

**影响范围**：`js/game.js` `playHand()`、`completePlayHand()`

#### 问题描述

生命延续女巫牌的检查只加在了 `completePlayHand()` 中（正常计分路径）。但「非法单词」和「女巫约束失败」时直接在 `playHand()` 里就进了 gameover，根本没走到 `completePlayHand()`。

后果：装备了生命延续，打出非法单词扣完最后 1 次出牌次数后，仍然弹出游戏结束。

#### 修复：提取通用方法，3 个触发点统一调用

```javascript
// ✅ 正确：提取 _checkLifeExtension()，在所有 handsLeft <= 0 的地方调用
_checkLifeExtension() { /* ... */ return triggered; }

// 触发点 1：completePlayHand 中 score < target
// 触发点 2：playHand 中非法单词
// 触发点 3：playHand 中女巫约束失败
```

### Bug 9：第二个方块数字更新与女巫跳跃时间基准不同步

**影响范围**：`js/render/playing.js` `drawPlaying()` 阶段2 逻辑推进区 + 数字渲染区

#### 问题描述

Phase 2（倍率弹出阶段）的时间基准在「逻辑推进区」和「数字渲染区」中使用了两个不同的计算方式：

- **逻辑推进区**：使用 `pc._phase2StartTime`（`animPhase` 真正变为 2 的时刻）
- **数字渲染区**：使用 `resolveTime + phase2Start`（理论值，因 `phase2Start` 未包含波浪结束后多等的 100ms，导致比真实时间早约 100ms）

后果：
- 第二个方块的倍率数字**提前约 100ms** 更新
- 对应的女巫牌**还没开始跳跃**，数字已经变了
- 如果有后续 whole_word 步骤，数字可能在女巫跳跃尚未结束时再次提前变化

#### 错误代码（反模式）

```javascript
// ❌ 错误：渲染区使用 resolveTime + phase2Start，与逻辑区基准不一致
const waveDuration = 180 + cardsInOrder.length * 90;
const phase2Start = 1000 + cards.length * 350 + waveDuration;
const phase2Elapsed = (Date.now() - pc.resolveTime) - phase2Start;

// 逻辑区使用 _phase2StartTime
const elapsedSincePhase2 = Date.now() - pc._phase2StartTime;
// 同一物理时刻，phase2Elapsed ≈ elapsedSincePhase2 + 100
```

#### 修复：统一使用 `_phase2StartTime`

```javascript
// ✅ 正确：渲染区与逻辑区共用同一个时间基准
const phase2Elapsed = Date.now() - (pc._phase2StartTime || Date.now());
```

#### 踩过的坑

| 现象 | 根因 | 修复 |
|------|------|------|
| 数字已变，女巫牌还没跳 | `phase2Elapsed` 比 `elapsedSincePhase2` 大 100ms，渲染提前进入下一步 | 渲染区统一使用 `_phase2StartTime` |
| 步进结束后女巫仍在跳 | `waveDuration + 100` 的 100ms 静默未纳入 `phase2Start` | 不再依赖 `phase2Start`，直接用真实触发时间 `_phase2StartTime` |

---

### Bug 10：whole_word 标签显示时长与女巫跳跃动画不一致

**影响范围**：`js/render/playing.js` `drawPlaying()` 阶段2 标签绘制

#### 问题描述

`whole_word` 女巫牌触发时，第二个方块上方会显示标签（如 `x2`、`+1`）。原始实现中标签只在每步的前 80% 时间显示：

```javascript
// 错误：标签只显示 320ms（400ms × 0.8）
if (stepProgress < 0.8) {
  labelText = joker.trigger === 'illegal_boost' ? `+${joker.value}` : `x${joker.value}`;
}
```

而女巫跳跃动画持续 **400ms**，数字脉冲也持续 **400ms**。后果：
- 标签提前 80ms 消失
- 女巫牌还在跳跃，但上方标签已经没了
- 视觉反馈不完整

#### 修复：标签持续整步

```javascript
// ✅ 正确：标签与跳跃、数字脉冲同步，持续整步 400ms
if (stepProgress < 1.0) {
  labelText = joker.trigger === 'illegal_boost' ? `+${joker.value}` : `x${joker.value}`;
}
```

#### 踩过的坑

| 现象 | 根因 | 修复 |
|------|------|------|
| 标签提前消失 | `stepProgress < 0.8` 只覆盖 320ms | 改为 `stepProgress < 1.0`，覆盖整步 400ms |
| 多步连续触发时标签闪烁 | 下一步开始时旧标签瞬间消失，新标签延迟出现 | 整步显示后，下一步 currentStep 增加自然切换 labelIdx |

---

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

6. **串行动画必须基于统一的时间轴，禁止引入独立计时器**
   - 新动画插入现有动画链时，必须与已有动画共用同一个 `elapsed` / `afterBase` 基准
   - 禁止为新动画单独创建 `Date.now()` 基准（如 `_multHalfAnimStart`），所有阶段过渡基于统一变量计算
   - 需要延迟时，用「统一基准 + 偏移量」而非「新的 `setTimeout` / `Date.now()`」

7. **Renderer 子方法禁止访问父方法的局部变量**
   - `drawPlaying()`、`drawHUD()` 等子方法只能访问 `this`（Renderer 实例）和传入的参数（如 `game`）
   - 任何数据必须通过 `game` 对象或 `pendingCheck` 传递，禁止直接引用 `render()` 体内的局部变量（如 `witchSkill`）

8. **数字变化动画必须复用 `_calcPulseScale`，禁止独立实现**
   - 新增数字更新动画时，先查第十章决策流程，确认是否命中 `_calcPulseScale`、`_reduceTargetAnim` 等现有方案
   - 禁止手写 `easeOutCubic` 滚动或自定义脉冲逻辑，避免同一页面内动画风格冲突

9. **保命/惩罚/拦截类机制必须覆盖所有触发路径**
   - 修改 gameover、结算、拦截逻辑时，必须梳理所有可能的触发路径（如 `playHand` 非法单词、女巫约束失败、`completePlayHand` 正常结算）
   - 提取通用方法（如 `_checkLifeExtension()`），在所有路径统一调用，禁止只改一处

10. **新增动画必须先走决策流程，禁止直接手写**
    - 开发新动画前，必须先查第十章「新增动画的决策流程」
    - 未命中任何通用方案才允许手写，且必须注释说明「未命中现有通用方案，原因：XXX」

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

### `Renderer` 通用绘制方法（`js/render/` 各模块）

```javascript
// 弹窗模板
this._drawModalPanel(ctx, W, H, s, config)
  // config: isClosing, closeStartTime, width, height, borderRadius, borderWidth,
  //         overlayAlpha, overlayFadeInDuration, enterOffset, closeOffset,
  //         elapsed, onCloseComplete
  // 返回: { px, py, pw, ph, elapsed, enterProgress, closeProgress, closeAlpha, closeScale }

// 数字脉冲
this._calcPulseScale(animState, maxScale = 0.3)
  // 返回: { scale, progress }

// 按钮按压
this._drawScaledButton(ctx, label, x, y, w, h, s, pressed, options = {})

// 卡牌光晕
this._drawCardGlow(ctx, cardX, cardY, cardW, cardH, s)
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
