# Word Balatro - 单词卡牌小游戏 技术文档

## 1. 项目概述

**Word Balatro** 是一款基于 Canvas 的微信小程序游戏，灵感来自独立游戏《Balatro》（小丑牌）。核心玩法是：玩家从手牌中选取字母卡牌拼出合法英文单词，根据字母分数和单词长度计算得分，在有限次数内达到目标分数进入下一关。游戏融合了 Roguelike 元素（女巫牌、水晶球、魔法药水）让每局体验不同。

| 属性 | 说明 |
|------|------|
| 平台 | 微信小游戏（Canvas 2D） |
| 主包大小 | ~120KB（含 4000+ 词库） |
| 适配基准 | iPhone 6/7/8（375pt 宽度），自动缩放 |
| 最低微信版本 | 基础库 3.0.0 |

---

## 2. 目录结构

```
word-balatro-miniprogram/
├── game.js                    # 游戏入口：初始化 + 主循环
├── game.json                  # 小游戏配置（竖屏、无状态栏）
├── project.config.json        # 项目配置（需替换 appid）
├── README.md                  # 本文档
└── js/
    ├── data.js                # 静态数据：词库 + 字母分数 + 商店池
    ├── game.js                # Game 核心类 + 工具函数
    ├── renderer.js            # Canvas 渲染器：绘制所有 UI 元素
    └── input.js               # 触摸输入处理器
```

---

## 3. 核心模块详解

### 3.1 data.js — 静态数据层

**词库系统（三层）**

| 数据源 | 数量 | 用途 |
|--------|------|------|
| `DICTIONARY` | 1280 词 | 基础离线词典，3字母为主 |
| `COMMON_WORDS` | 2851 词 | 高频扩展词（4-8字母） |
| `WORD_DATA` | 200 词 | 带中文释义 + 词性前缀的缓存 |
| `onlineWordCache` | 运行时增长 | 在线 API 成功查询的缓存 |

> 注意：`COMMON_WORDS` 会在初始化时自动合并到 `DICTIONARY` 中，实现统一查询。

**字母分数系统**

```
A=1  B=3  C=3  D=2  E=1  F=4  G=2  H=4  I=1
J=8  K=5  L=1  M=3  N=1  O=1  P=3  Q=10 R=1
S=1  T=1  U=1  V=4  W=4  X=8  Y=4  Z=10
```

**字母分布（98张牌）**

总牌数 98 张，模拟拼字游戏标准分布。每局创建一副新牌，洗牌后发给玩家。

**人头牌（FACE_CARDS）**

`J`、`Q`、`K` 被标记为人头牌（Face Card），触发特殊倍率效果。

> 实际上当前实现中 FACE_CARDS 包含 `J`、`Q`、`Z`（王牌），用于女巫牌和药水升级逻辑。

**商店池（SHOP_POOL）**

三类卡牌，每类 2 款商品，共 6 款：

| 类型 | 数量 | 价格区间 | 生效时机 | 标识颜色 |
|------|------|---------|---------|---------|
| 女巫牌（witch） | 8 种效果池，每回合随机 2 款 | 5-8 金币 | 每回合每次出牌生效 | 紫色 #6b2d8e |
| 水晶球（crystal） | 5 种效果池，每回合随机 2 款 | 3-5 金币 | 下一回合开始时生效 | 蓝色 #2d5a8e |
| 魔法药水（potion） | 3 种效果池，每回合随机 2 款 | 4-6 金币 | 购买后立即选手牌升级 | 绿色 #2d6b4e |

---

### 3.2 game.js — 核心逻辑层

#### 3.2.1 Game 类

**字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| `round` | number | 当前关卡（从 1 开始） |
| `gold` | number | 金币（商店消费） |
| `score` | number | 当前回合已获分数 |
| `totalScore` | number | 历史总分（跨回合累加，投降时报告用） |
| `roundScores` | Array | 每回合得分记录 `[{round, score}, ...]` |
| `target` | number | 当前回合目标分数 |
| `deck` | Array | 牌堆（剩余未发牌） |
| `hand` | Array | 手牌（9 张） |
| `selected` | Array | 已选卡牌 ID 列表 |
| `jokers` | Array | 女巫牌栏（最多 5 张） |
| `crystalEffects` | Array | 已购买的水晶球效果（下一回合结算） |
| `potionMode` | Object | 当前药水购买状态（进入选牌模式） |
| `shopItems` | Array | 当前回合的 6 款商品（`null` 表示已购买） |
| `state` | string | 当前状态：`playing`/`shop`/`potion`/`gameover` |
| `handsLeft` | number | 出牌次数（已设为 999，无限制） |
| `discardsLeft` | number | 剩余弃牌次数 |
| `extraDiscards` | number | 水晶球额外弃牌次数 |
| `extraSafety` | number | 水晶球保底延长回合数 |
| `safetyRounds` | number | 前 3 回合保底（手牌必有合法单词） |

#### 3.2.2 核心方法

**`toggleSelect(cardId)`**
- 选中/取消选中单张卡牌
- 限制最多选 9 张
- 切换 `card.selected` 布尔值

**`playHand()` — 出牌（异步）**
```
流程：
1. 检查选中卡牌 ≥3 张
2. 拼接字母成单词
3. 本地校验（DICTIONARY / COMMON_WORDS / onlineWordCache）
4. 本地不存在 → 在线 API 校验（dictionaryapi.dev）
5. 非法 → 返回 {valid: false}
6. 合法 → calcWordScore() 计算分数
7. score += result.score，totalScore += result.score
8. 移除打出的牌，确保手牌仍有合法单词
9. 从牌堆抽新牌填补空位（按原索引插入）
10. 若 score ≥ target → 进入商店
```

**`discard()` — 弃牌**
```
流程：
1. 检查 discardsLeft > 0 且 selected.length > 0
2. 记录被弃牌的索引位置
3. 移除选中牌
4. 确保手牌仍有合法单词
5. 按原索引从小到大插入新牌
6. discardsLeft--
```

**`buyItem(idx)` — 购买商品**
```
类型分流：
- witch → 加入 jokers[]（上限 5），标记 shopItems[idx] = null
- crystal → 加入 crystalEffects[]，标记 shopItems[idx] = null
- potion → 设置 potionMode，切换 state = 'potion'，标记 shopItems[idx] = null
```

**`upgradeCard(cardId)` — 药水升级**
```
效果：
- upgrade_letter / upgrade_any → 分数 ×2
- upgrade_face → 王牌 ×3，普通牌 ×2

跨回合持久化：
1. 更新 card.upgradeMult（累乘）
2. card.score = baseScore × upgradeMult
3. letterUpgrades.set(letter, {mult: totalMult}) // 全局 Map
4. createDeck() 时自动应用 letterUpgrades
```

**`nextRound()` — 进入下一关**
```
流程：
1. roundScores.push({round, score}) // 保存本回合得分
2. round++
3. shopItems = null // 清空商店
4. resetRound() // 重置回合状态
```

**`resetRound()` — 回合重置**
```
保留的字段（跨回合）：
- round, gold, jokers, totalScore, roundScores

重置的字段（每回合）：
- score=0, handsLeft=999, discardsLeft=3+extra, target=三角数公式
- deck=createDeck(), hand=drawWithSafety()
- selected=[], crystalEffects=[], extraHands=0, extraDiscards=0
```

---

#### 3.2.3 计分系统（calcWordScore）

**基础分** = 所选卡牌字母分数之和

**长度加成** = 单词 ≥5 字母 ? `10 + 长度×2` : 0

**女巫牌倍率**（按 trigger 条件）：

| Trigger | 条件 | 效果 |
|---------|------|------|
| `always` | 无条件 | 基础分 +20 |
| `letter_a` | 含字母 A | ×2 |
| `letter_e` | 含字母 E | ×2 |
| `has_vowel` | 含元音 | ×2 |
| `length_5` | ≥5 字母 | ×2 |
| `length_6` | ≥6 字母 | ×3 |
| `has_face` | 含 J/Q/Z | ×3 |
| `high_letter` | 含 J/Q/X/Z | ×2 |

**最终得分** = (基础分 + 长度加成 + 筹码加成) × 倍率乘积

**目标分数公式**（三角数增长）：
```
target = Math.floor(150 × round × (round + 1) / 2)
```

| 关卡 | 目标分数 |
|------|---------|
| 1 | 150 |
| 2 | 450 |
| 3 | 900 |
| 4 | 1500 |
| 5 | 2250 |

---

#### 3.2.4 保底机制（Safety）

**每回合发牌时**：
1. 从牌堆中"偷"走一个 3-6 字母合法单词所需的字母
2. 将这些字母作为"种子词"连续块插入随机位置
3. 若手牌已有合法单词，跳过此步骤
4. 若种子词导致手牌超过 9 张，把多余牌还回牌堆

> 确保前 3 回合（或水晶球延长后）手牌中必有至少一个合法单词。

---

#### 3.2.5 单词检测系统

**三层检测**：

| 层级 | 来源 | 速度 | 准确性 |
|------|------|------|--------|
| L1 | DICTIONARY / COMMON_WORDS / onlineWordCache | 毫秒级 | 100% |
| L2 | dictionaryapi.dev API | 1-3 秒 | 100%（权威词典） |
| L3 | MyMemory 翻译 + 中文释义 | 2-5 秒 | 翻译质量一般 |

**在线检测状态机**（`wordCheckState` Map）：
- `checking` → 黄色（检测中）
- `valid` → 绿色（合法，已缓存）
- `invalid` → 红色（非法）

> 修复记录：早期版本存在 Promise 回调直接操作 DOM 导致"先红后绿"闪烁的竞态 bug，已改为统一由 render() 根据 wordCheckState 渲染。

---

#### 3.2.6 中文释义系统

**数据来源优先级**：
1. `wordMeaningCache` — 已查询过的缓存
2. `WORD_DATA` — 200 个高频词本地释义（带词性）
3. dictionaryapi.dev — 获取英文定义 + 词性，再翻译为中文

**显示格式**：
```
n. 名词释义；v. 动词释义
```

**词性缩写**：
- `n.` noun（名词）
- `v.` verb（动词）
- `adj.` adjective（形容词）
- `adv.` adverb（副词）
- `pron.` pronoun（代词）
- `prep.` preposition（介词）
- `conj.` conjunction（连词）
- `int.` interjection（感叹词）
- `det.` determiner（限定词）
- `art.` article（冠词）

---

### 3.3 renderer.js — Canvas 渲染层

#### 3.3.1 渲染架构

采用**按帧渲染**模式，无 DOM，全部使用 Canvas 2D API：

```
render(game)
├── 清空画布 → 填充背景色 #0a1628
├── drawHUD(game) → 顶部状态栏
└── 状态分流
    ├── playing → drawPlaying(game)
    ├── shop → drawShop(game)
    ├── potion → drawPotion(game)
    └── gameover → drawGameOver(game)
```

#### 3.3.2 坐标系

- 基准宽度：375pt（iPhone 6/7/8）
- `scale = windowWidth / 375`
- 所有尺寸、位置均乘以 `scale`

#### 3.3.3 卡牌渲染

```
卡牌尺寸：80pt × 110pt（乘以 scale）
圆角：10pt

视觉层次：
┌─────────────────────┐
│        A            │  ← 大字母（白色，28px）
│        a            │  ← 小写字母（40%透明度，14px）
│       1分           │  ← 分数（升级前显示 baseScore）
│      x2             │  ← 升级倍率（黄色，仅升级后显示）
└─────────────────────┘

颜色：
- 默认：#1e3a5f（深蓝）
- 选中：#f39c12（橙色）
- 王牌：#8e44ad（紫色）
- 升级标记：#f1c40f（金色）
```

**新牌标记**：首次渲染显示绿色 "NEW" 标签，下一帧自动清除。

#### 3.3.4 手牌布局

```
3 × 3 网格（最多 9 张）
水平居中，垂直从 100pt 开始
```

#### 3.3.5 分数预览

选中 ≥3 张牌时显示：

```
┌──────┐     ┌──────┐
│  44  │  ×  │   3  │
└──────┘     └──────┘
  蓝色边框      绿色边框
  字母分        单词长度
```

不显示最终计算结果，只展示两个因子。

#### 3.3.6 HUD 布局

顶部状态栏（44pt 高）：
```
[回合] [金币] [目标] [当前] [弃牌]
  1     $4     150     0      3
```

女巫牌/水晶球效果以 badge 形式显示在 HUD 下方。

#### 3.3.7 商店布局

```
          第 1 关 - 商店
          金币: $4

┌──────────┐  ┌──────────┐
│ 女巫·A   │  │ 女巫·E   │
│ 字母A×2  │  │ 字母E×2  │
│   $5     │  │   $5     │
└──────────┘  └──────────┘

┌──────────┐  ┌──────────┐
│ 水晶球·  │  │ 水晶球·  │
│ 额外弃牌 │  │ 保底守护 │
│   $3     │  │   $4     │
└──────────┘  └──────────┘

┌──────────┐  ┌──────────┐
│ 药水·字母│  │ 药水·王牌│
│ 分数翻倍 │  │ 分数×3  │
│   $4     │  │   $5     │
└──────────┘  └──────────┘

      [下一关]
```

每行 2 款，共 3 行（女巫 / 水晶球 / 药水）。

#### 3.3.8 投降报告

```
         🏳️ 已投降
       主动选择投降

┌──────────────────┐
│ 结束关卡  第 3 关│
│                  │
│ 总分      2680   │  ← 绿色加粗
└──────────────────┘

      [重新开始]
```

---

### 3.4 input.js — 输入处理层

#### 3.4.1 触摸事件映射

```
wx.onTouchStart
└── handleInput(x, y)
    ├── 状态：playing
    │   ├── hitTest(cardRects) → toggleSelect(cardId)
    │   ├── hitTest(playBtnRect) → playHand()（异步）
    │   ├── hitTest(discardBtnRect) → discard()
    │   └── hitTest(surrenderBtnRect) → wx.showModal() → gameover
    ├── 状态：shop
    │   ├── hitTest(shopRects) → buyItem(index)
    │   └── hitTest(nextRoundBtnRect) → nextRound()
    ├── 状态：potion
    │   ├── hitTest(potionCardRects) → upgradeCard(cardId)
    │   └── hitTest(cancelBtnRect) → 退还金币 + 返回商店
    └── 状态：gameover
        └── hitTest(restartBtnRect) → restartGame()
```

#### 3.4.2 碰撞检测

```js
hitTest(x, y, rects) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return r; // 返回命中的区域对象
    }
  }
  return null;
}
```

> 采用**逆序遍历**，确保上层元素优先被命中（如按钮覆盖在卡牌上时优先触发按钮）。

---

## 4. 游戏状态机

```
[playing] ──score≥target──→ [shop]
    │                           │
    │←────────nextRound()─────┘
    │                           │
    │                    buy potion
    │                           ↓
    │←────────upgradeCard()── [potion]
    │                           │
    │                    cancel / confirm
    │                           │
    └───────────────────────────┘
    │
 surrender ──→ [gameover] ──restart()──→ [playing] (round=1)
```

---

## 5. 关键数据结构

### 5.1 卡牌对象（Card）

```js
{
  letter: "S",           // 字母（大写）
  baseScore: 1,          // 原始字母分数
  score: 1,              // 当前有效分数（升级后 = baseScore × mult）
  isFace: false,         // 是否王牌（J/Q/Z）
  id: "faxdakqgq",       // 唯一标识
  selected: false,       // 是否被选中
  upgraded: false,       // 是否被药水升级过
  upgradeMult: 1,        // 升级倍率（2, 3, 4, 6, ...）
  newCard: false,        // 是否是刚抽到的新牌（显示 NEW 标记）
  flyDir: "left"         // 动画方向（left/right）
}
```

### 5.2 商店商品对象（ShopItem）

```js
// 女巫牌
{ name: "女巫·字母A强化", type: "witch", trigger: "letter_a",
  value: 2, cost: 5, desc: "字母A分数×2" }

// 水晶球
{ name: "水晶球·额外弃牌", type: "crystal", effect: "extra_discard",
  value: 1, cost: 3, desc: "下一回合弃牌次数+1" }

// 魔法药水
{ name: "魔法药水·字母强化", type: "potion", effect: "upgrade_letter",
  cost: 4, desc: "选择一张字母牌，分数翻倍" }
```

### 5.3 回合得分记录（RoundScore）

```js
{ round: 1, score: 1280 }
```

### 5.4 字母升级记录（LetterUpgrade）

```js
letterUpgrades = Map {
  "T" => { mult: 2 },   // T 牌所有实例分数 ×2
  "S" => { mult: 6 },   // S 牌先×2再×3 = ×6
}
```

---

## 6. 外部 API 依赖

### 6.1 dictionaryapi.dev

- **用途**：在线单词合法性校验 + 获取英文定义/词性
- **Endpoint**：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- **限制**：免费，无需 API Key，但请求频率不宜过高
- **缓存**：成功结果存入 `onlineWordCache` 和 `wordMeaningCache`

### 6.2 微信小游戏 API

| API | 用途 |
|-----|------|
| `wx.createCanvas()` | 创建 Canvas |
| `wx.getSystemInfoSync()` | 获取屏幕尺寸 |
| `wx.onTouchStart()` | 触摸事件 |
| `wx.showModal()` | 投降确认弹窗 |
| `wx.showToast()` | 非法单词提示 |
| `wx.request()` | 在线词典请求 |

---

## 7. 部署指南

### 7.1 前置条件

1. 注册微信小程序账号
2. 下载并安装「微信开发者工具」
3. 在微信公众平台 → 开发 → 开发设置 中获取 **AppID**

### 7.2 配置步骤

1. 打开微信开发者工具
2. 选择「导入项目」
3. 选择 `word-balatro-miniprogram` 目录
4. 填入你的 AppID（测试号也可）
5. 替换 `project.config.json` 中的 `appid`：
   ```json
   "appid": "你的真实AppID"
   ```

### 7.3 配置合法域名（可选）

如果不配置，在线单词检测会失效（仅离线 4000 词可用）。

在微信公众平台 → 开发 → 开发设置 → 服务器域名：
- **request 合法域名**：添加 `https://api.dictionaryapi.dev`

### 7.4 真机调试

1. 开发者工具中点击「真机调试」
2. 用微信扫描二维码
3. 在真机上测试触摸、性能、布局适配

---

## 8. 已知限制

1. **在线词库有限**：仅 4000 词有离线校验，生僻词需要联网。网络不佳时可能误判合法单词为非法。
2. **中文释义有限**：仅 200 个高频词有本地中文释义，其余需在线查询。
3. **动画系统待完善**：当前版本无飞入飞出动画（CSS 动画无法迁移到 Canvas，需用 requestAnimationFrame 重新实现）。
4. **音效缺失**：原版有出牌/弃牌/升级的音效，Canvas 版尚未添加。
5. **iPhone 刘海适配**：需要额外处理 `safeArea` 避免按钮被刘海遮挡。

---

## 9. 后续优化方向

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 动画系统 | 卡牌飞入飞出、分数跳动、按钮反馈 |
| P1 | 音效 | 出牌声、弃牌声、升级声、BGM |
| P1 | 本地存储 | `wx.setStorageSync` 保存最高分、游戏进度 |
| P2 | 分享功能 | `wx.shareAppMessage` 分享成绩到群聊 |
| P2 | 排行榜 | 微信开放数据域实现好友排行榜 |
| P2 | 新手引导 | 首次进入游戏时的交互教程 |
| P3 | 皮肤系统 | 多种卡牌主题风格 |

---

## 10. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-04-30 | 初始版本，DOM 版完成 |
| v1.1.0 | 2026-04-30 | 转为微信小游戏 Canvas 版 |

---

*文档生成时间：2026-04-30 18:52 CST*
