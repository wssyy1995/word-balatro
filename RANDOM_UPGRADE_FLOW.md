# 随机强化药水 — 抽奖动画与功能完整梳理

## 一、数据定义

### 1. 商店购买版
```js
// js/shop.js
{name:'随机强化', type:'potion', effect:'random_upgrade', value:2, cost:5, desc:'随机强化1个字母，分数×2'}
```

### 2. 女巫奖励版
```js
// js/witch_skills.js
case 'card_random_upgrade':
  name: '随机强化', effect: 'random_upgrade', value: 4,
  desc: '随机强化1个字母，分数×4'
```

> `value` 决定倍率：商店购买 `×2`，女巫奖励 `×4`。

---

## 二、触发入口

| 来源 | 触发方式 | 进入状态 |
|------|---------|---------|
| 商店购买 | 点击价格 → 购买成功 → 点击"立即使用" | `game.state = 'potion'` |
| 女巫奖励 | 女巫 Lv.11/Lv.18 礼盒中奖 → 点击"使用" | `game.state = 'potion'` |

进入时设置：
```js
game.potionMode = { effect: 'random_upgrade', value: 2 /*或4*/ };
game._prePotionState = 'shop'; // 或 'playing'
game._randomUpgradePopup = null; // 初始无弹窗
```

---

## 三、输入交互流程

```
game.state === 'potion'
  └── potionMode.effect === 'random_upgrade'
        ├── 点击关闭按钮(X)
        │     → 返还金币 (gold += cost)
        │     → 清除药水
        │     → 返回商店/游戏
        │
        └── 点击中心"抽选"按钮
              → game.startRandomSpin()
```

**关闭按钮**位置：转盘弹窗右上角圆形 X 按钮。  
**抽选按钮**位置：转盘正中心圆形红色按钮，半径 `36*s`。

---

## 四、抽奖核心逻辑（Game 层）

### 4.1 startRandomSpin() — 启动抽奖

```js
// js/game.js:1459
startRandomSpin() {
  if (this._randomUpgradePopup && this._randomUpgradePopup.phase !== 'idle') return;

  // 从手牌中随机选一个字母
  const handLetters = [...new Set(this.hand.filter(c => c).map(c => c.letter))];
  const targetLetter = handLetters.length > 0
    ? handLetters[Math.floor(Math.random() * handLetters.length)]
    : 'A';

  this._randomUpgradePopup = {
    phase: 'spinning',      // 阶段
    targetLetter,            // 目标字母（已确定）
    spinStartTime: Date.now(),
  };
}
```

> ⚠️ **注意**：目标字母在点击瞬间就通过 `Math.random()` 确定了，不是转盘上指针停下的位置决定的。转盘动画只是视觉演出，结果早已内定。

### 4.2 状态机（update 中驱动）

```js
// js/game.js:1419 ~ 1456
_randomUpgradePopup 的状态流转：

idle ──点击抽选──→ spinning ──3秒后──→ paused ──1.125秒后──→ done
```

| 阶段 | 持续时间 | 行为 |
|------|---------|------|
| **idle** | 无限 | 等待用户点击"抽选"按钮 |
| **spinning** | 3000ms | 转盘旋转，easeOutCubic 减速，转 3 圈后停在目标字母 |
| **paused** | ~1125ms (1.5个周期) | 目标扇形闪烁（浅金色 ↔ 金色，周期 750ms），显示"当前：X" |
| **done** | 2100ms 升级动画 | 执行 `upgradeLetter()`，弹出升级动画 |

---

## 五、渲染层绘制详解

### 5.1 整体布局（js/renderer.js:3643）

从上到下依次绘制：

```
┌─────────────────────────────┐
│  [top_icon]  [金币胶囊]      │  ← drawTopHeader()
│                             │
│        "随机强化"            │  ← 标题 + shop_icon 左右装饰
│      "点击抽选，随机强化1个字母" │  ← 副标题
│         ───◆───              │  ← 分隔线 + 菱形装饰
│                             │
│           ▲                 │  ← 红色指针
│        ╭─────╮              │
│       │  A B  │             │
│       │ C   D │             │
│       │  抽选 │  ← 中心按钮  │
│       │ E   F │             │
│       │  G H  │             │
│        ╰─────╯              │
│           ▼                 │
│        "当前：X"             │
│                             │
│                    [X]      │  ← 关闭按钮
└─────────────────────────────┘
```

### 5.2 转盘绘制参数

```js
const wheelRadius = 160 * s;          // 转盘半径
const anglePerSector = 360 / 26;       // 每扇形约 13.85°
const sectorColors = ['#f5f0e6', '#fdf5e0'];  // 扇形交替颜色
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
```

### 5.3 旋转动画计算

```js
// 目标字母的扇形中心角度
targetIdx = letters.indexOf(targetLetter);
targetCenterAngle = targetIdx * anglePerSector + anglePerSector / 2;

// 最终角度：转 3 圈后目标扇形对准顶部指针
finalAngle = 360 * 3 + (360 - targetCenterAngle);

// spinning 阶段：easeOutCubic 缓动
currentAngle = finalAngle * easeOutCubic(elapsed / 3000);
```

> 顶部指针固定指向 12 点钟方向，转盘旋转使目标字母最终停在指针位置。

### 5.4 高亮逻辑

```js
// 根据当前旋转角度反推指针指向的扇形
normalized = ((-currentAngle) % 360 + 360) % 360;
highlightIdx = Math.floor(normalized / anglePerSector) % 26;
```

**paused 阶段闪烁**：
- 周期 750ms，共闪 1.5 个周期（约 1125ms）
- `sin` 波驱动：浅金色 `#ffe8a0` ↔ 金色 `#f5c542`
- 高亮扇形加粗金色边框 + 外发光阴影

---

## 六、升级动画

### 6.1 触发时机

`paused` 阶段 1125ms 后，`update()` 中自动触发：

```js
upgradeLetter(this, letter);           // 实际升级逻辑
this._potionUpgrading = { ... };       // 启动升级动画
popup.phase = 'done';
```

### 6.2 动画时间线（_drawPotionUpgradeAnim）

```
0ms      → 400ms    : 卡牌弹出（easeOutBack 缩放从 0→1）
400ms    → 800ms    : 显示旧分数（静止）
800ms    → 1200ms   : 分数切换 + 脉冲放大（×1.2）
1200ms   → 1900ms   : 显示新分数（静止）
1900ms   → 2100ms   : 淡出 + 缩小
2100ms+             : 清理状态，返回商店/游戏
```

### 6.3 视觉效果

- 半透明黑色遮罩覆盖全屏（`rgba(0,0,0,0.35)`），但转盘背景仍可见
- 中央弹出一张放大 2 倍的字母卡牌
- 卡牌分数从旧值 → 新值切换时有脉冲放大效果
- 卡牌底部显示升级倍率标记

---

## 七、实际升级逻辑

```js
// upgradeLetter(game, letter)
// 从 js/shop.js 引入

const potion = game.potionMode;
const mult = potion ? (potion.value || 4) : 4;  // 倍率
const existing = letterUpgrades.get(letter) || {};
const totalMult = (existing.mult || 1) * mult;   // 乘法叠加
const totalAdd = existing.add || 0;

// 更新 letterUpgrades Map
letterUpgrades.set(letter, { mult: totalMult, add: totalAdd });

// 手牌中所有该字母的卡牌实时更新分数
for (const card of game.hand) {
  if (card.letter === letter) {
    card.score = Math.floor(card.baseScore * totalMult) + totalAdd;
    card.upgraded = true;
    card.upgradeMult = totalMult;
  }
}
```

> 升级是**永久性的**（`letterUpgrades` Map 持久化），影响当前及未来所有回合中该字母的卡牌。

---

## 八、状态清理

动画结束（2100ms）后：
```js
game._potionUpgrading = null;
game._randomUpgradePopup = null;
game.potionMode = null;
game.state = game._prePotionState || 'shop';
game._prePotionState = null;
```

---

## 九、关键问题与风险点

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | 结果内定 | `startRandomSpin()` | 目标字母在点击瞬间随机确定，转盘动画只是演出，非物理停止 |
| 2 | 倍率乘法叠加 | `upgradeLetter()` | 同一字母多次使用随机强化会**乘法叠加**（×2 → ×4 → ×8） |
| 3 | 升级永久生效 | `letterUpgrades` Map | 升级后该字母在所有回合的卡牌中都生效 |
| 4 | 关闭返还金币 | `input.js:102` | 点击关闭会返还药水费用，但女巫奖励版（cost=0）也走同样逻辑 |
| 5 | 手牌为空兜底 | `startRandomSpin()` | 手牌无字母时默认强化 'A'，但此时手牌中可能没有 A |

---

## 十、文件调用关系图

```
┌─────────────┐     购买/奖励      ┌─────────────┐
│   shop.js   │ ─────────────────→ │  game.js    │
│ witch_skills│                    │ (entry)     │
└─────────────┘                    └──────┬──────┘
                                          │ state='potion'
                                          ▼
┌─────────────┐                    ┌─────────────┐
│  renderer.js│ ←───────────────── │  input.js   │
│ drawRandom  │   render(game)     │ handleInput │
│ UpgradePopup│                    │ 点击抽选    │
└─────────────┘                    └──────┬──────┘
                                          │ startRandomSpin()
                                          ▼
                                    ┌─────────────┐
                                    │  js/game.js │
                                    │  Game class │
                                    │ update()+   │
                                    │ startRandom │
                                    │ Spin()      │
                                    └─────────────┘
```
