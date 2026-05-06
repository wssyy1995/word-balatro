# Word Balatro — 单词卡牌小游戏 技术文档

## 1. 项目概述

**Word Balatro**（游戏内标题 `Words Witch Game`）是一款基于 **Canvas 2D** 的微信小游戏。玩家从 3×3 手牌中选取字母卡牌拼出合法英文单词，根据字母分数和单词长度计算得分，在限定出牌次数内达到目标分数即可进入下一关。游戏融合了 Roguelike 元素（女巫牌、水晶球、魔法药水），每局体验各不相同。

| 属性 | 说明 |
|------|------|
| 平台 | 微信小游戏（Canvas 2D） |
| 适配基准 | iPhone 6/7/8（375×667），自动缩放 |
| 缩放范围 | `scale` 限制在 0.8 ~ 1.4，防止过大/过小 |
| 最低基础库 | 3.0.0 |
| 词库 | 本地高频词 + 在线 dictionaryapi.dev 校验 |

---

## 2. 目录结构

```
word-balatro/
├── game.js              # 游戏入口：初始化、主循环、触摸输入分发
├── game.json            # 小游戏配置（竖屏、无状态栏）
├── project.config.json  # 微信项目配置（需替换 appid）
├── README.md            # 本文档
├── images/              # 图片资源（背景、卡牌模板、按钮、商店图标等）
└── js/
    ├── data.js          # 静态数据：字母分数/分布、人头牌、词库引用、缓存
    ├── words.js         # 本地词库（高频词含中文释义）+ 保底种子词 SEED_WORDS
    ├── game.js          # Game 核心类 + 工具函数（计分、校验、保底、发牌）
    ├── renderer.js      # Canvas 主渲染器：所有 UI、动画、粒子、HUD
    ├── shop.js          # 商店数据池、购买逻辑、ShopRenderer、ConfirmBuyRenderer
    ├── settlement.js    # 回合金币结算弹窗渲染
    ├── animation.js     # 动画系统：Easing 曲线 + Animation + AnimationManager
    ├── audio.js         # 音效管理器（wx.createInnerAudioContext）
    ├── storage.js       # 本地存储：进度存档、最高分、统计、设置
    ├── witch_skills.js  # 女巫技能约束与奖励
    └── input.js         # InputHandler 类（备用，入口未直接使用）
```

---

## 3. 核心模块详解

### 3.1 data.js — 静态数据层

**字母分数**

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 |

**字母分布（98 张牌）**

模拟拼字游戏标准分布，每局创建一副新牌并洗牌。

**人头牌（FACE_CARDS）**

`X`、`Y`、`Z` 被标记为人头牌（Face Card），在女巫牌倍率中触发特殊效果。

**商店池引用**

实际商品池定义在 `js/shop.js` 的 `SHOP_POOL` 中。

---

### 3.2 game.js — 核心逻辑层

#### 3.2.1 Game 类关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `round` | number | 当前关卡（从 1 开始） |
| `gold` | number | 金币（商店消费） |
| `score` | number | 当前回合已获分数 |
| `totalScore` | number | 历史总分（跨回合累加） |
| `target` | number | 当前回合目标分数 |
| `deck` | Array | 牌堆（剩余未发牌） |
| `hand` | Array | 手牌（9 张，3×3 网格） |
| `selected` | Array | 已选卡牌 ID 列表 |
| `jokers` | Array | 女巫牌栏（最多 4 张） |
| `potions` | Array | 魔法药水栏（最多 2 张） |
| `crystalEffects` | Array | 已购买的水晶球效果（下一回合结算） |
| `potionMode` | Object | 当前药水购买/使用状态 |
| `shopItems` | Array | 当前回合 6 款商品（`null` 表示已购买） |
| `state` | string | `playing` / `settlement` / `shop` / `potion` / `gameover` |
| `handsLeft` | number | 剩余出牌次数（初始 4 + 水晶球加成） |
| `discardsLeft` | number | 剩余弃牌次数（初始 3 + 水晶球加成） |
| `extraDiscards` | number | 水晶球额外弃牌次数（跨回合清零） |
| `extraHands` | number | 水晶球额外出牌次数（跨回合清零） |
| `extraSafety` | number | 水晶球延长保底回合数 |
| `safetyRounds` | number | 前 3 回合保底（手牌必有合法单词） |
| `settlementData` | Object | 回合结算弹窗数据 |
| `pendingCheck` | Object | 单词校验状态机（checking / valid / invalid / witch_failed） |
| `animManager` | AnimationManager | 动画管理器实例 |
| `audioManager` | AudioManager | 音效管理器实例 |
| `storageManager` | StorageManager | 本地存储管理器实例 |

#### 3.2.2 核心方法

**`toggleSelect(cardId)`**
- 选中/取消选中单张卡牌
- 限制最多选 9 张
- 触发 `cardSelect` / `cardDeselect` 动画
- 播放选牌/取消音效

**`playHand()` — 出牌（异步）**
```
流程：
1. 检查选中卡牌 ≥3 张，且不在 pendingCheck 中
2. 拼接字母成单词
3. 本地校验（WORD_DATA / onlineWordCache）
4. 本地不存在 → 在线 API 校验（dictionaryapi.dev）
5. 非法 → pendingCheck.state = 'invalid'，handsLeft--，可能触发 gameover
6. 女巫技能约束检查（如 need_letter_4）→ 不满足则 witch_failed
7. 合法 → calcWordScore() 计算分数
8. 启动完整动画时间线：
   - 阶段1（1s后）：字母依次跳跃 + per_card 女巫牌触发
   - 阶段1.5：波浪动画 + whole_word 女巫牌依次触发
   - 阶段2：基础倍率弹出
   - 阶段3：总分飞行
   - 阶段4：执行计分、旧牌飞出、新牌飞入
   - 阶段5：score≥target 进入 settlement，或 handsLeft≤0 进入 gameover
```

**`discard()` — 弃牌**
- 检查 `discardsLeft > 0` 且 `selected.length > 0`
- 弃掉的牌飞出动画，0.6 秒后回牌堆底部、洗牌、补新牌
- 补牌后确保手牌仍有合法单词
- `discardsLeft--`

**`claimSettlement()` — 领取结算**
- 将结算金币加入 `gold`
- 300ms 关闭动画后进入 `shop` 状态

**`nextRound()` — 进入下一关**
- 保存本回合得分到 `roundScores`
- `round++`，清空 `shopItems`
- 调用 `resetRound()`

**`resetRound()` — 回合重置**
```
保留字段：round, gold, jokers, potions, totalScore, roundScores, letterUpgrades
重置字段：
- score=0, handsLeft=4+extraHands, discardsLeft=3+extraDiscards
- target = 150 + 50 × round × (round - 1)
- deck=createDeck(), hand=drawWithSafety()
- selected=[], crystalEffects 生效后清空
- extraDiscards=0, extraSafety=0, extraHands=0
```

#### 3.2.3 计分系统（calcWordScore）

```
基础分 = Σ(每张卡牌的 score × 该卡牌对应的女巫牌倍率)

mult = 单词长度（即卡牌数量）

for each whole_word 女巫牌:
  若 trigger 满足 → mult = ceil(mult × 女巫牌 value)

for each flat_bonus 女巫牌:
  基础分 += 女巫牌 value

总分 = ceil(基础分 × mult)
```

**女巫牌触发条件（per_card / whole_word）**

| Trigger | 条件 | 效果类型 |
|---------|------|---------|
| `letter_a` | 卡牌为 A | per_card：该卡 score ×2 |
| `letter_e` | 卡牌为 E | per_card：该卡 score ×2 |
| `has_vowel` | 卡牌为元音 | per_card：该卡 score ×2 |
| `has_face` | 整词含 X/Y/Z | whole_word：mult ×3 |
| `length_3` | 单词 ≥3 字母 | whole_word：mult ×1.2 |
| `length_5` | 单词 ≥5 字母 | whole_word：mult ×2 |
| `length_6` | 单词 ≥6 字母 | whole_word：mult ×3 |

**目标分数公式**
```
target = 150 + 50 × round × (round - 1)
```

| 关卡 | 目标分数 |
|------|---------|
| 1 | 150 |
| 2 | 250 |
| 3 | 450 |
| 4 | 750 |
| 5 | 1150 |

#### 3.2.4 保底机制（Safety）

- **发牌时**：从 `SEED_WORDS`（500 个高频常用词，3-6 字母）中随机选一个，将其所需字母从牌堆中抽出并插入随机位置
- **弃牌/出牌后补牌**：若补牌后手牌无合法单词，再次用种子词替换空位
- **生效范围**：前 `safetyRounds + extraSafety` 回合（默认前 3 回合）
- **手牌上限**：始终不超过 9 张

#### 3.2.5 单词检测系统

**三层检测**

| 层级 | 来源 | 速度 |
|------|------|------|
| L1 | `WORD_DATA` / `onlineWordCache` | 毫秒级 |
| L2 | `dictionaryapi.dev` API | 1-3 秒 |
| L3 | `MyMemory` 翻译（后台） | 异步 |

**校验状态机（`pendingCheck`）**
- `checking` → 显示橙色单词 + loading 动态点号
- `valid` → 深绿色单词 + 中文释义 + 烟花 + 字母跳跃动画
- `invalid` → 红色单词 + 错误图标
- `witch_failed` → 显示女巫约束失败提示

#### 3.2.6 女巫技能系统

特定回合会出现女巫约束，必须满足才能算合法出牌：

| 回合 | 约束 | 说明 | 奖励 |
|------|------|------|------|
| 第 2 关 | `need_letter_4` | 每次出牌必须不少于 4 个字母 | 字母强化药水 |

---

### 3.3 renderer.js — Canvas 渲染层

#### 3.3.1 渲染架构

采用**按帧渲染**，全部使用 Canvas 2D API，无 DOM。

```
render(game)
├── 清空画布 → 绘制背景图（bg.png）或纯色 #0a1628
├── 状态分流
│   ├── playing  → drawHUD() + drawPlaying()
│   ├── settlement → drawHUD() + drawCoinCapsule() + settlementRenderer.draw()
│   ├── shop     → drawTopHeader() + drawCoinCapsule() + shopRenderer.draw()
│   │              └── confirmBuyRenderer.draw()（如有购买弹窗）
│   ├── potion   → drawPotion()
│   └── gameover → drawHUD() + drawPlaying() + gameOverRenderer.draw()
├── updateAnimations()
├── _updateAndDrawSparkles()    # 烟花粒子
├── _updateAndDrawFlyingScore() # 飞行总分
├── _shopToGameTransition()     # 页面过渡遮罩
└── _drawDebugMenu()            # 调试菜单（如需）
```

#### 3.3.2 坐标系与适配

```
baseScale = min(windowWidth / 375, windowHeight / 667)
scale = clamp(baseScale, 0.8, 1.4)

卡牌尺寸动态计算：
cardW = min(74 * scale, (width - 48) / 3)
cardH = min(88 * scale, (height - 200) / 3)
gap = 8 * scale
```

#### 3.3.3 卡牌渲染

使用 `card_template.png` / `card_template_selected.png` 作为背景，叠加文字：
- 大写字母（Georgia 粗体，32px，深蓝 `#1a2f4a`）
- 当前分数（11px，底部）
- Face 牌标记 `★`（右下角，金色）
- 新牌标记 `NEW`（绿色，首次渲染）

卡牌支持动画偏移：`animOffset`（飞入/飞出）、`selectOffset`（选中上移）、`jumpOffsetY`（字母跳跃）。

#### 3.3.4 手牌与道具栏布局

```
┌─────────────────────────────┐
│  [HUD: 回合 | 目标分 | 当前]  │  ← 顶部状态栏
├─────────────────────────────┤
│  [女巫牌×4] |[药水瓶×2]      │  ← 道具栏（6格，金色竖线分隔）
├─────────────────────────────┤
│                              │
│      预 览 区 域              │  ← 单词预览 + 分数方块
│                              │
├─────────────────────────────┤
│  ┌──┐ ┌──┐ ┌──┐             │
│  │A │ │B │ │C │  ... 3×3    │  ← 手牌网格
│  └──┘ └──┘ └──┘             │
├─────────────────────────────┤
│  [出牌] [弃牌] [清空]        │  ← 底部操作按钮（图片按钮）
└─────────────────────────────┘
```

#### 3.3.5 分数预览方块

选中 ≥3 张牌时显示两个方块：
- 左方块（蓝色背景）：字母基础分累加
- 右方块（绿色背景）：单词长度（即倍率）

出牌合法后，左方块上方可能显示 `xN`（per_card 女巫牌倍率提示）。

#### 3.3.6 商店页面布局

```
        Words Witch Game
        💰 金币胶囊

┌─────────────────────────────┐
│ [女巫×4] |[药水×2]  已装备栏  │
├─────────────────────────────┤
│      ⚜️ 卡牌商店 ⚜️          │
├─────────────────────────────┤
│ 🧙 女巫牌  │ [商品1] [商品2]  │
├───────────┤─────────────────┤
│ 🔮 水晶球  │ [商品3] [商品4]  │
├───────────┤─────────────────┤
│ 🧪 魔法药水│ [商品5] [商品6]  │
├─────────────────────────────┤
│        ⚜️ 下一回合 ⚜️        │
│  🎯 目标分数: xxx            │
│  🧙 女巫技能 / [挑战按钮]    │
└─────────────────────────────┘
```

- 每行 2 款商品，左侧分类标签带 emoji 图标
- 价格按钮：暖米色，带金币图标
- 商品售完后显示"刷新"按钮（5 金币刷新该行）
- 已装备栏支持点击选中 + 售出（红色按钮，easeOutBack 弹出动画）

#### 3.3.7 购买成功弹窗

点击价格按钮 → 扣除金币 → 显示成功弹窗：
- **女巫牌**：展示"装备"按钮 → 加入 `jokers[]`
- **药水牌**：展示"暂存"（加入 `potions[]`）和"立即使用"（进入 `potion` 状态）
- **水晶球**：展示"生效"（立即加入 `crystalEffects[]`）

弹窗动画：easeOutBack 入场 + 内容渐入 + 关闭时上滑淡出。

#### 3.3.8 回合金币结算弹窗

达到目标分数后弹出：
```
┌──────────────────┐
│  第 N 关结算      │
│  ─────────────   │
│  基础金币    +x   │
│  剩余出牌×1  +x   │
│  剩余弃牌×1  +x   │
│  ─────────────   │
│  总计       +xx  │
│     [领取]       │
└──────────────────┘
```

#### 3.3.9 药水升级页面（potion 状态）

进入后显示 A-Z 字母矩阵，选中字母后点击升级：
- 字母强化：指定字母分数 ×2（全局，跨回合保留）
- 王牌强化：X/Y/Z 分数 ×3
- 通用强化：任意字母分数 ×2
- 字母置换：将手牌中选中的一张牌替换为指定字母（游戏中直接使用）

升级后启动弹出动画（oldScore → newScore），播放升级音效。

---

### 3.4 animation.js — 动画系统

**缓动函数**

| 名称 | 用途 |
|------|------|
| `easeOutCubic` | 通用减速（飞牌、分数弹出） |
| `easeOutBack` | 轻微回弹（按钮按压恢复） |
| `easeOutBackStrong` | 强力回弹（卡牌飞入果冻感） |
| `easeOutBounce` | 弹跳效果 |
| `linear` | 线性 |
| `easeInOutQuad` | 缓入缓出 |

**快捷动画**

- `flyOut(card, direction)`：卡牌向左/右飞出（400ms，旋转+位移）
- `flyIn(card, direction)`：卡牌从侧边飞入（550ms，强力回弹）
- `scorePop(text, x, y)`：分数向上弹出并淡出（800ms）
- `buttonPress(target)`：按钮按下缩放至 0.92 后回弹
- `cardSelect(card)`：卡牌上移 8px（保持）
- `cardDeselect(card)`：卡牌回落原位

---

### 3.5 audio.js — 音效系统

使用 `wx.createInnerAudioContext()` 管理音效：

| 音效名 | 文件 | 触发时机 |
|--------|------|---------|
| `select` | audio/select.mp3 | 选牌 |
| `deselect` | audio/deselect.mp3 | 取消选牌 |
| `play` | audio/play.mp3 | 点击出牌 |
| `discard` | audio/discard.mp3 | 弃牌 |
| `valid` | audio/valid.mp3 | 单词合法 |
| `invalid` | audio/invalid.mp3 | 单词非法/约束失败 |
| `score` | audio/score.mp3 | 分数计入 |
| `upgrade` | audio/upgrade.mp3 | 药水升级 |
| `buy` | audio/buy.mp3 | 商店购买 |
| `levelup` | audio/levelup.mp3 | 进入下一关 |
| `surrender` | audio/surrender.mp3 | 投降 |
| `button` | audio/button.mp3 | 按钮点击 |

BGM 支持循环播放，音量 0.3。

---

### 3.6 storage.js — 本地存储

| 键 | 内容 |
|----|------|
| `word_balatro_progress` | 游戏进度（回合、金币、女巫牌、药水、字母升级） |
| `word_balatro_high_score` | 历史最高分 |
| `word_balatro_stats` | 统计（总局数、总分、最高关卡） |
| `word_balatro_settings` | 设置（音效、音乐、震动开关） |

---

## 4. 商店系统（Shop）

### 4.1 商品池（SHOP_POOL）

| 类型 | 数量 | 价格 | 上限 | 标识色 |
|------|------|------|------|--------|
| **女巫牌**（witch） | 7 种 | 4-8 金币 | 装备栏 4 格 | 紫色 |
| **水晶球**（crystal） | 3 种 | 3-5 金币 | 购买即生效 | 蓝色 |
| **魔法药水**（potion） | 4 种 | 4-6 金币 | 道具栏 2 格 | 绿色 |

每回合从各池中随机抽取 2 款，共 6 款商品。女巫牌会过滤已装备的名称避免重复。

### 4.2 药水种类

| 名称 | 效果 | value |
|------|------|-------|
| 字母强化 | 指定字母分数 ×2 | 2 |
| 王牌强化 | X/Y/Z 分数 ×3 | 3 |
| 通用强化 | 任意字母分数 ×2 | 2 |
| 字母置换 | 将手牌中一张替换为指定字母 | - |

### 4.3 水晶球种类

| 名称 | 效果 |
|------|------|
| 额外弃牌 | 下一回合弃牌次数 +1 |
| 额外出牌 | 下一回合出牌次数 +1 |
| 金币祝福 | 下一回合开始时获得 3 金币 |

### 4.4 购买与售出流程

```
点击价格按钮
  → 扣除金币
  → 显示购买成功弹窗
     ├── 女巫牌 → 点击"装备" → 加入 jokers[]
     ├── 水晶球 → 点击"生效" → 加入 crystalEffects[]
     └── 药水牌 → 点击"暂存" → 加入 potions[]
                → 点击"立即使用" → 进入 potion 状态

点击已装备道具 → 选中（紫色边框）
  → 显示"售出"按钮（easeOutBack 弹出）
  → 点击售出 → 卡牌飞出动画 → 获得金币 → 补位滑动
```

### 4.5 刷新

当某行两款商品均售罄时，显示"刷新"按钮，消耗 5 金币重新随机生成该行的 2 款商品。

---

## 5. 游戏状态机

```
[playing] ──score≥target──→ [settlement] ──claim──→ [shop]
    │                                                    │
    │←────────────nextRound()───────────────────────────┘
    │                                                    │
    │←──upgradeCard()── [potion] ←── buy potion →───────┘
    │       (暂存/升级后返回)
    │
    └── out_of_hands / surrender ──→ [gameover] ──restart()──→ [playing]
```

---

## 6. 关键数据结构

### 6.1 卡牌对象（Card）

```js
{
  letter: "S",           // 字母（大写）
  baseScore: 19,         // 原始字母分数
  score: 19,             // 当前有效分数（升级后 = baseScore × upgradeMult）
  isFace: false,         // 是否人头牌（X/Y/Z）
  id: "faxdakqgq",       // 唯一标识
  selected: false,       // 是否被选中
  upgraded: false,       // 是否被药水升级过
  upgradeMult: 1,        // 升级倍率（累乘）
  newCard: false,        // 是否是刚抽到的新牌
  animOffset: null,      // 动画偏移 {x, y, rotation, opacity, scale}
  selectOffset: 0,       // 选中上移偏移
  jumpOffsetY: 0,        // 字母跳跃偏移
  _flyIndex: undefined   // 飞出时的原始索引
}
```

### 6.2 商店商品对象（ShopItem）

```js
// 女巫牌
{ name: "A之强化", type: "witch", scope: "per_card", trigger: "letter_a",
  value: 2, cost: 5, desc: "字母A分数×2" }

// 水晶球
{ name: "额外弃牌", type: "crystal", effect: "extra_discard",
  value: 1, cost: 3, desc: "下一回合弃牌次数+1" }

// 魔法药水
{ name: "字母强化", type: "potion", effect: "upgrade_letter",
  value: 2, cost: 4, desc: "选择一张字母牌，分数翻倍" }
```

### 6.3 字母升级记录（LetterUpgrade）

```js
letterUpgrades = Map {
  "T" => { mult: 2 },   // T 牌所有实例分数 ×2
  "S" => { mult: 6 },   // S 牌先×2再×3 = ×6（累乘）
}
```

创建新牌时自动应用 `letterUpgrades`，实现跨回合持久化。

---

## 7. 外部 API 依赖

### 7.1 dictionaryapi.dev

- **用途**：在线单词合法性校验 + 获取英文定义/词性
- **Endpoint**：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- **缓存**：成功结果存入 `onlineWordCache` 和 `wordMeaningCache`

### 7.2 MyMemory 翻译

- **用途**：将英文定义翻译为中文
- **Endpoint**：`https://api.mymemory.translated.net/get?q=...&langpair=en|zh-CN`
- **特点**：后台异步调用，不影响主流程

### 7.3 微信小游戏 API

| API | 用途 |
|-----|------|
| `wx.createCanvas()` | 创建 Canvas |
| `wx.getSystemInfoSync()` | 获取屏幕尺寸、DPR |
| `wx.onTouchStart()` | 触摸事件 |
| `wx.createImage()` | 加载图片资源 |
| `wx.createInnerAudioContext()` | 音效/BGM |
| `wx.setStorageSync()` / `wx.getStorageSync()` | 本地存储 |
| `wx.request()` | 在线词典/翻译请求 |
| `wx.showModal()` | 投降确认弹窗 |
| `wx.vibrateShort()` | 触觉反馈 |

---

## 8. 部署指南

### 8.1 前置条件

1. 注册微信小程序账号
2. 下载「微信开发者工具」
3. 在微信公众平台获取 **AppID**

### 8.2 配置步骤

1. 打开微信开发者工具 → 导入项目
2. 选择本项目目录
3. 填入你的 AppID（测试号也可）
4. 替换 `project.config.json` 中的 `appid`

### 8.3 配置合法域名

在微信公众平台 → 开发 → 开发设置 → 服务器域名：
- **request 合法域名**：添加 `https://api.dictionaryapi.dev` 和 `https://api.mymemory.translated.net`

> 若不配置，在线单词检测和翻译会失效，仅本地词库可用。

---

## 9. 调试功能

点击游戏左上角图标（`top_icon.png`）可打开调试菜单：
- 重置出牌次数
- 增加 100 分
- 直接通关（进入 settlement）
- 结束游戏（进入 gameover）

> 调试功能仅在开发阶段使用，上线前应移除或隐藏入口。

---

## 10. 已知限制与优化方向

### 当前限制

1. **在线词库依赖**：网络不佳时生僻词可能误判为非法
2. **中文释义有限**：仅本地高频词有中文释义，其余需在线查询
3. **音效文件缺失**：代码已预留音频接口，但 `audio/` 目录下文件需自行准备
4. **iPhone 刘海适配**：已通过 `safeTop` 做了基础适配，极端机型可能需要微调

### 后续优化方向

| 优先级 | 功能 |
|--------|------|
| P1 | 动画系统持续完善（更多粒子效果、过渡动画） |
| P1 | 音效资源补充与 BGM |
| P2 | 分享功能（`wx.shareAppMessage`） |
| P2 | 新手引导 |
| P3 | 皮肤系统 / 多种卡牌主题 |

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-04-30 | 初始版本 |
| v1.1.0 | 2026-04-30 | 转为微信小游戏 Canvas 版 |
| v1.2.0+ | 2026-05 | 新增动画系统、音效系统、本地存储、女巫技能、售出/刷新、药水升级、调试菜单等 |

---

*文档基于实际代码整理，最后更新：2026-05-06*
