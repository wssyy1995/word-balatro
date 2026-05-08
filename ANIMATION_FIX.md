# 动画重构修复进度记录

> 分支：`refactor/animation-generalization`

---

## ✅ P0-1: 统一缓动函数（已完成）

**问题**：`easeOutBack` 缓动函数在项目中重复定义了 **7 次**，分别位于：
- `js/shop.js:199` — `_easeOutBack()` 方法
- `js/shop.js:1127` — 内联函数（ConfirmBuyRenderer）
- `js/renderer.js:2380` — `_easeOutBackStrong()` 方法
- `js/renderer.js:2267` — 内联函数（药水升级）
- `js/renderer.js:2520` — 内联函数（GameOverRenderer）
- `js/settlement.js:27` — 内联函数（SettlementRenderer）
- `js/settlement.js:197` — 内联数学公式（WitchRewardRenderer）

**修复**：
1. 所有文件统一 `const { Easing } = require('./animation');`
2. 删除 7 处重复定义
3. 所有调用点替换为 `Easing.easeOutBack(...)` 或 `Easing.easeOutBackStrong(...)`

**删除代码量**：约 40 行
**风险**：低（纯函数替换）

---

## ✅ P0-2: 提取 `_drawCardGlow` 通用方法（已完成）

**问题**：金色脉动光晕 + 四角闪烁星的绘制代码在 `js/shop.js` 和 `js/settlement.js` 中**逐字复制**，约 45 行 × 2 = 90 行重复。

**修复**：
1. 在 `js/renderer.js` 中新增 `_drawCardGlow(ctx, cardX, cardY, cardW, cardH, s)` 方法
2. 新增 `_drawSparkleShape(ctx, x, y, r)` 辅助方法
3. `js/shop.js` 和 `js/settlement.js` 中的重复代码替换为 `this.parent._drawCardGlow(ctx, ...)`

**删除代码量**：约 90 行
**风险**：低（逻辑完全复用）

---

## ✅ P0-3: 提取 `fadeIn` 工具函数（已完成）

**问题**：`fadeIn` 内容渐入函数在 3 个文件中重复定义：
- `js/settlement.js:58` — SettlementRenderer
- `js/renderer.js:2589` — GameOverRenderer
- `js/shop.js:1176` — ConfirmBuyRenderer（内联写法）

**修复**：
1. 在 `js/animation.js` 的 `Easing` 对象中新增 `fadeIn(elapsed, delay, duration, offsetY)` 静态方法
2. 3 个文件中的重复定义/内联代码全部替换为 `Easing.fadeIn(...)`

**删除代码量**：约 30 行
**风险**：低（逻辑完全复用）

---

## ⏳ P1-1: 提取弹窗基类 `PopupRenderer`（待开始）

**问题**：5 个弹窗共用同一套"弹出-消失"模板，每处手写 80~120 行：
- SettlementRenderer
- GameOverRenderer
- WitchRewardRenderer
- ConfirmBuyRenderer
- drawChangeLetterPopup

## ✅ P1-2: 统一数字脉冲动画 `_calcPulseScale`（已完成）

**问题**：数字脉冲强调动画在 4 个地方重复出现，核心公式都是 `scale = 1 + maxScale * sin(progress * π)`：
- `js/renderer.js:990` — HUD 当前分数（maxScale=0.2, duration=400）
- `js/renderer.js:1628` — 倍率方块（maxScale=0.28, duration=400）
- `js/renderer.js:1815` — 金币胶囊（maxScale=0.3, duration=400）
- `js/shop.js:936` — 目标分数减免（maxScale=0.3, duration=500）

**修复**：
1. 在 `js/renderer.js` 中新增 `_calcPulseScale(animState, maxScale)` 方法
2. 4 处重复代码统一替换为该方法调用
3. 调用者只需根据返回的 `progress` 判断是否结束并清理状态

**删除代码量**：约 20 行重复公式
**风险**：低（逻辑复用，接口简单）

---

## ⏳ P1-3: 统一按钮按压（待开始）

**问题**：按钮按压反馈实现不统一，有的用 Y 轴位移 2px，有的用 scale 0.95：
- Y 轴位移：底部按钮（出牌/弃牌/重置）、商店价格按钮、挑战按钮
- Scale 缩放：成功弹窗按钮、结算按钮、游戏结束按钮

---

## ⏳ P1-1: 提取弹窗基类 `PopupRenderer`（待开始）

**问题**：5 个弹窗共用同一套"弹出-消失"模板，每处手写 80~120 行：
- SettlementRenderer
- GameOverRenderer
- WitchRewardRenderer
- ConfirmBuyRenderer
- drawChangeLetterPopup
- HUD 当前分数
- 金币胶囊
- 倍率方块
- 字母分数方块
- 目标分数减免
- 药水升级分数

## ⏳ P1-3: 统一按钮按压（待开始）

**问题**：按钮按压反馈实现不统一，有的用 Y 轴位移，有的用 scale 缩放。
