# Word Balatro — 单词卡牌小游戏 技术文档

## 1. 项目概述

**Word Balatro**（游戏内标题 `Words Witch Game`）是一款基于 **Canvas 2D** 的微信小游戏。玩家从手牌中选取字母卡牌拼出合法英文单词，根据字母分数和单词长度计算得分，在限定出牌次数内达到目标分数即可进入下一关。游戏融合了 Roguelike 元素（女巫牌、水晶球、魔法药水），每局体验各不相同。

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
├── images/              # 图片资源（背景、卡牌模板、按钮、商店图标、女巫头像等）
└── js/
    ├── data.js          # 静态数据：字母分数/分布、人头牌、词库引用、缓存
    ├── words.js         # 本地核心词库（高频词含中文释义）
    ├── expand_words.js  # 扩展离线词库（补充高频词）
    ├── game.js          # Game 核心类 + 工具函数（计分、校验、保底、发牌）
    ├── renderer.js      # Canvas 主渲染器：所有 UI、动画、粒子、HUD
    ├── shop.js          # 商店数据池、购买逻辑、ShopRenderer、ConfirmBuyRenderer
    ├── settlement.js    # 回合金币结算弹窗 + 女巫奖励渲染
    ├── animation.js     # 动画系统：Easing 曲线 + Animation + AnimationManager
    ├── cloud_storage.js # 微信云存储：shop_card / witch 图片上传/下载/注入
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
| `hand` | Array | 手牌（默认 9 张，3×3 网格，可被水晶球/奖励扩充） |
| `selected` | Array | 已选卡牌 ID 列表 |
| `jokers` | Array | 女巫牌栏（默认最多 4 张，可扩展） |
| `maxJokerSlots` | number | 女巫牌栏上限（默认 4，可被奖励永久增加） |
| `potions` | Array | 魔法药水栏（最多 2 张） |
| `crystalEffects` | Array | 已购买的水晶球效果（下一回合结算） |
| `potionMode` | Object | 当前药水使用状态 |
| `shopItems` | Array | 当前回合 6 款商品（`null` 表示已购买） |
| `state` | string | `playing` / `settlement` / `witch_reward` / `shop` / `potion` / `life_extended` / `gameover` |
| `handsLeft` | number | 剩余出牌次数（初始 4 + 水晶球加成） |
| `discardsLeft` | number | 剩余弃牌次数（初始 3 + 水晶球加成） |
| `extraDiscards` | number | 水晶球额外弃牌次数（跨回合清零） |
| `extraHands` | number | 水晶球额外出牌次数（跨回合清零） |
| `extraSafety` | number | 水晶球延长保底回合数 |
| `extraLetters` | number | 水晶球额外手牌数量（跨回合清零） |
| `_lifeExtensionBonus` | number | 生命延续加成的目标分数（跨回合生效后清零） |
| `_shuffledSkills` | Array | 游戏开始时打乱后的 SKILL_POOL，用于动态分配女巫约束 |
| `witchSkillPassed` | boolean | 本回合是否通过女巫技能约束 |
| `baseHandSize` | number | 基础手牌数量（默认 9，可被女巫奖励永久增加） |
| `_maxHandSize` | number | 本回合实际手牌上限 |
| `safetyRounds` | number | 保底相关配置（默认 3，实际所有回合均保底） |
| `settlementData` | Object | 回合结算弹窗数据 |
| `witchRewardData` | Object | 女巫奖励阶段数据（gift / result） |
| `pendingCheck` | Object | 单词校验状态机（checking / valid / invalid / witch_failed） |
| `_reduceTargetAnim` | Object | 目标分数减免动画状态 |
| `_changeLetterPopup` | Object | 字母置换弹窗状态 |
| `_hastePlayActive` | boolean | 争分夺秒生效中（前 20 秒出牌不耗次数） |
| `_disableWitchAnim` | Object | 禁用女巫牌动画状态 |
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
1. 检查选中卡牌 ≥2 张，且不在 pendingCheck 中
2. 拼接字母成单词
3. 本地校验（WORD_DATA / EXPAND_WORD_DATA / onlineWordCache）
4. 本地不存在 → 在线 API 校验（dictionaryapi.dev）
5. 非法 → pendingCheck.state = 'invalid'，handsLeft--（或被 shield_illegal / haste_play 抵消），可能触发 gameover
6. 勇敢试错：非法单词且未触发容错咒文时，illegal_boost 倍率 +1
7. 女巫技能约束检查（如 need_letter_4 / force_letter_3）→ 不满足则 witch_failed
9. 字母之神（letter_god）预处理：若触发，先将所有出牌字母分数改为最高分
10. 以小博大（last_chance）：若最后一次出牌且 <4 字母，50% 概率 mult +10
11. letter_X_mult_half 惩罚检测（含 A/E/S/I）→ 满足条件则倍率减半
12. 合法 → calcWordScore() 计算分数
13. 启动完整动画时间线（事件驱动，renderer 推进）：
    - 阶段0：烟花 + 字母之神飞星动画（如有）
    - 阶段1：字母依次跳跃 + per_card 女巫牌触发
    - 阶段1.5：波浪动画 + whole_word 女巫牌依次触发
    - 阶段2：基础倍率弹出
    - 阶段3：总分飞行
    - 阶段4：执行计分、旧牌飞出、新牌飞入
    - 阶段5：score≥target 进入 settlement，或 handsLeft≤0 进入 life_extension / gameover
```

**`discard()` — 弃牌**
- 检查 `discardsLeft > 0` 且 `selected.length > 0`
- 弃掉的牌飞出动画，0.6 秒后回牌堆底部、洗牌、补新牌
- 补牌后确保手牌仍有合法单词
- `discardsLeft--`

**`completePlayHand()` — 完成出牌（由渲染器动画完成后调用）**
- 执行计分、旧牌飞出、新牌飞入
- 判断 score≥target 进入 settlement，或 handsLeft≤0 触发 life_extension / gameover

**`claimSettlement()` — 领取结算**
- 将结算金币加入 `gold`
- 200ms 关闭动画后进入 `witch_reward`（如有女巫技能且通过）或 `shop` 状态

**`nextRound()` — 进入下一关**
- 保存本回合得分到 `roundScores`
- `round++`，清空 `shopItems`
- 调用 `resetRound()`

**`_checkLifeExtension()` — 检查生命延续**
- 出牌耗尽时检查是否拥有「生命延续」女巫牌且次数未耗尽
- 若触发：计算 `target - score` 的差值×2 加到下一回合目标分，进入 `life_extended` 状态

**`showHint()` — 提示功能**
- 调用 `findAllValidWordsInHand()` 查找当前手牌所有可组成的合法单词
- 显示前 10 个高分单词及其分数预览

**`resetRound()` — 回合重置**
```
保留字段：round, gold, jokers, potions, totalScore, roundScores, letterUpgrades, baseHandSize, maxJokerSlots
重置字段：
- score=0, handsLeft=4+extraHands, discardsLeft=3+extraDiscards
- target = 150 + 50 × round × (round - 1)
- deck=createDeck(), hand=drawWithSafety()（保底词长度受女巫技能影响）
- 排除字母：若女巫技能为 no_letter_a，牌堆中移除所有 A
- selected=[], crystalEffects 生效后清空
- extraDiscards=0, extraSafety=0, extraHands=0, extraLetters=0
- _reduceTargetAnim=null, witchSkillPassed=true
- disable_one_witch_card：回合开始时随机禁用 1 张女巫牌（延迟 1 秒播放边框动画）
- haste_play：若生效（由水晶球触发），激活 20 秒倒计时，期间出牌不消耗次数
```

#### 3.2.3 计分系统（calcWordScore）

```
基础分 = Σ(每张卡牌的 score × 该卡牌对应的女巫牌倍率)

mult = 单词长度（即卡牌数量）

for each whole_word 女巫牌:
  若 trigger 满足 → mult = ceil(mult × 女巫牌 value) 或 mult += value（illegal_boost / last_chance）

for each flat_bonus 女巫牌:
  基础分 += 女巫牌 value

// letter_god（字母之神）：在 playHand() 中预处理，所有出牌字母分数改为最高分
// 因此 calcWordScore 内部只需读取当前 card.score

总分 = ceil(基础分 × mult)

// letter_X_mult_half 惩罚：若触发，mult 减半（取 max(1, mult/2)），总分重算
```

**女巫牌触发条件（per_card / whole_word / limit / flat_bonus）**

| 名称 | Trigger | Scope | 条件 | 效果 |
|------|---------|-------|------|------|
| 元音强化 | `has_vowel` | per_card | 卡牌为元音 | 该卡 score ×3 |
| 元音为首 | `initial_vowel` | per_card | 单词首字母为元音 | 该首字母 score +60 |
| 五字母连击 | `length_5` | whole_word | 单词 ≥5 字母 | mult ×1.5 |
| 六字母连击 | `length_6` | whole_word | 单词 ≥6 字母 | mult ×2 |
| 珍稀之力 | `has_face` | whole_word | 单词含 J/Q/X/Y/Z | mult +5 |
| 容错咒文 | `shield_illegal` | — | 打出非法单词 | 不扣除出牌次数 |
| 字母之神 | `letter_god` | limit | 每次计分（限3次） | 本单词所有字母按最高分字母算分 |
| 生命延续 | `life_extension` | limit | 出牌耗尽时（限1次） | 挽救游戏结束，目标分差×2 加到下一回合目标分 |
| 勇敢试错 | `illegal_boost` | whole_word | 打出非法单词后 | 倍率 +1（若同时触发容错咒文则不生效） |
| 以小博大 | `last_chance` | whole_word | 最后一次出牌且 <4 字母 | 20% 概率 mult +8 |
| 双子合影 | `double_same` | whole_word | 含相邻重复字母 | mult +5 |
| 首尾呼应 | `firstend_same` | whole_word | 首尾字母相同 | mult +6 |
| 首字连击 | `initial_succession` | whole_word | 连续打出同首字母单词 | 每次 mult +3，中断后重置 |
| 回到过去 | `end_ed` | whole_word | 单词末尾加 "ed" 也合法 | mult +6 |
| 复制魔法 | `end_s` | whole_word | 单词末尾加 "s" 也合法 | mult +5 |

> 注：带 `limit` 的女巫牌拥有 `usesLeft` 字段，次数耗尽后卡牌自动销毁（带撕裂动画）。
> `illegal_boost` 的 value 会随非法单词打出次数动态变化。

**目标分数公式**
采用分段系数累加：

```
target = 150 + Σ(第 r 关系数 × (r - 1))  (r 从 2 到当前回合)
```

| 回合区间 | 系数 |
|---------|------|
| 第 1 关 | 150（基准） |
| 第 2~5 关 | 100 |
| 第 6~10 关 | 50 |
| 第 11~20 关 | 60 |
| 第 21~30 关 | 70 |
| 第 31~40 关 | 80 |
| 第 41~50 关 | 90 |
| 第 51~80 关 | 100 |

| 关卡 | 目标分数 |
|------|---------|
| 1 | 150 |
| 2 | 250 |
| 3 | 450 |
| 4 | 750 |
| 5 | 1150 |
| 6 | 1400 |
| 10 | 2900 |

#### 3.2.4 保底机制（Safety）

- **发牌时**：从本地词库 `WORD_DATA` 中按长度（3~6 字母，受女巫技能强制限制）过滤后随机选一个，将其所需字母从牌堆中抽出并插入随机位置
- **弃牌/出牌后补牌**：若补牌后手牌无合法单词，再次从本地词库中按长度过滤后选保底词替换空位
- **生效范围**：所有回合均保底（`drawWithSafety` 始终执行）
- **手牌上限**：始终不超过 `_maxHandSize`（默认 9 + 额外手牌）
- **排除字母**：若女巫技能为 `no_letter_a`，保底词也不会包含字母 A

#### 3.2.5 单词检测系统

**四层检测**

| 层级 | 来源 | 速度 |
|------|------|------|
| L1 | `WORD_DATA`（核心离线词库） | 毫秒级 |
| L1.5 | `EXPAND_WORD_DATA`（扩展离线词库） | 毫秒级 |
| L2 | `onlineWordCache` / `dictionaryapi.dev` API | 1-3 秒 |
| L3 | `MyMemory` 翻译（后台） | 异步 |

**校验状态机（`pendingCheck`）**
- `checking` → 显示橙色单词 + loading 动态点号
- `valid` → 深绿色单词 + 中文释义 + 烟花 + 字母跳跃动画
- `invalid` → 红色单词 + 错误图标
- `witch_failed` → 显示女巫约束失败提示

#### 3.2.6 女巫技能系统

特定回合会出现女巫约束，必须满足才能算合法出牌：

| 回合 | 约束 | 奖励 |
|------|------|------|
| 第 3 关 | 动态分配* | 字母置换药水（50%） |
| 第 5 关 | 动态分配* | 金币翻倍（50%） |
| 第 8 关 | 动态分配* | 额外字母（100%） |
| 第 11 关 | 动态分配* | 女巫槽位+1（100%） |
| 第 14 关 | 动态分配* | 随机强化药水（30%） |
| 第 16 关 | 动态分配* | 额外出牌（100%） |
| 第 18 关 | 动态分配* | 随机强化药水（50%） |
| 第 21 关 | 动态分配* | 字母升级（30%） |
| 第 24~75 关 | 动态分配* | 字母升级（30%） |

> *动态分配：所有关卡的约束均从 `SKILL_POOL` 中按游戏开始时打乱的顺序分配，每局游戏的约束组合各不相同。`SKILL_POOL` 包含：
> - `force_letter_3`：每次出牌只能出 3 张字母牌
> - `need_letter_4`：每次出牌必须不少于 4 个字母
> - `forbid_illegal_words`：出现非法单词即游戏结束
> - `force_letter_4`：每次出牌只能出 4 张字母牌
> - `letter_a_mult_half`：出牌含字母 A，则单词倍率减半
> - `letter_e_mult_half`：出牌含字母 E，则单词倍率减半
> - `letter_s_mult_half`：出牌含字母 S，则单词倍率减半
> - `letter_i_mult_half`：出牌含字母 I，则单词倍率减半
> - `no_letter_a`：本回合牌堆中不会出现字母 A
> - `disable_one_witch_card`：回合开始时随机禁用 1 张女巫牌

过关且满足约束后，进入 **女巫奖励阶段（`witch_reward`）**：3 选 1 礼盒抽奖，根据技能 `rate` 概率获得奖励。奖励类型包括：
- **buff 类**：额外出牌、额外字母、金币翻倍、女巫槽位+1（直接生效）
- **药水类**：字母强化、字母置换、随机强化（可暂存或立即使用）

---

### 3.3 renderer.js — Canvas 渲染层

#### 3.3.1 渲染架构

采用**按帧渲染**，全部使用 Canvas 2D API，无 DOM。

```
render(game)
├── 清空画布 → 绘制背景图（云存储注入 bg_icon/bg.png，回退纯色 #0a1628）
├── 状态分流
│   ├── playing  → drawHUD() + drawPlaying()
│   ├── settlement → drawHUD() + drawCoinCapsule() + settlementRenderer.draw()
│   ├── witch_reward → witchRewardRenderer.draw()
│   ├── shop     → drawTopHeader() + drawCoinCapsule() + shopRenderer.draw()
│   │              └── confirmBuyRenderer.draw()（如有购买弹窗）
│   ├── potion   → drawPotion()（字母升级/随机强化不显示顶部栏）
│   ├── life_extended → drawLifeExtension()
│   └── gameover → drawHUD() + drawPlaying() + gameOverRenderer.draw()
├── updateAnimations()
├── _updateAndDrawSparkles()    # 烟花粒子
├── _updateAndDrawFlyingScore() # 飞行总分
├── _shopToGameTransition()     # 页面过渡遮罩
├── _drawGuideOverlay()         # 新手引导覆盖层（Phase 1~5）
├── _drawCloudDebugLogs()       # 云存储调试日志
└── _drawDebugMenu()            # 调试菜单（长按 top_icon 触发）
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

> 注：当手牌数 > 9（额外手牌效果）时，布局自动切换为 4 列自适应 + 最后一行居中。
> 针对灵动岛机型（iOS safeTop ≥ 59）增加顶部安全区域 padding。

#### 3.3.3 卡牌渲染

使用 `card_template.png` / `card_template_selected.png` 作为背景，叠加文字：
- 大写字母（Georgia 粗体，32px，深蓝 `#1a2f4a`）
- 当前分数（11px，底部）
- Face 牌标记 `★`（右下角，金色）
- 新牌标记 `NEW`（绿色，首次渲染）
- 禁用标记（红色边框 + 抖动，disable_one_witch_card 触发）

卡牌支持动画偏移：`animOffset`（飞入/飞出）、`selectOffset`（选中上移）、`jumpOffsetY`（字母跳跃）。

#### 3.3.4 手牌与道具栏布局

```
┌─────────────────────────────┐
│  [HUD: 回合 | 目标分 | 当前]  │  ← 顶部状态栏
├─────────────────────────────┤
│  [女巫牌×N] |[药水瓶×2]      │  ← 道具栏（N+2 格，金色竖线分隔，N 默认 4 可扩展）
├─────────────────────────────┤
│                              │
│      预 览 区 域              │  ← 单词预览 + 分数方块
│                              │
├─────────────────────────────┤
│  ┌──┐ ┌──┐ ┌──┐             │
│  │A │ │B │ │C │  ... 3×3    │  ← 手牌网格（默认9张，>9时4列）
│  └──┘ └──┘ └──┘             │
├─────────────────────────────┤
│  [出牌] [弃牌] [清空]        │  ← 底部操作按钮（图片按钮）
└─────────────────────────────┘
```

#### 3.3.5 分数预览方块

选中 ≥2 张牌时显示两个方块：
- 左方块（蓝色背景）：字母基础分累加
- 右方块（绿色背景）：单词长度（即倍率）

出牌合法后，左方块上方可能显示 `xN`（per_card 女巫牌倍率提示）。

#### 3.3.6 商店页面布局

```
        Words Witch Game
        💰 金币胶囊

┌─────────────────────────────┐
│ [女巫×N] |[药水×2]  已装备栏  │  ← N 随 maxJokerSlots 动态变化
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
- 商店标题右侧设有"重掷"按钮（3 金币刷新全部商品）
- 已装备栏支持点击选中 + 售出（红色按钮，easeOutBack 弹出动画）
- 女巫牌槽位 >4 时，卡牌自动重叠排列以适应屏幕

#### 3.3.7 购买成功弹窗

点击价格按钮 → 扣除金币 → 显示成功弹窗：
- **女巫牌**：展示"装备"按钮 → 加入 `jokers[]`
- **药水牌**：展示"暂存"（加入 `potions[]`）和"立即使用"（进入 `potion` 状态）
- **水晶球**：展示"生效"（立即加入 `crystalEffects[]`）
- **技能重掷水晶球**：展示"生效" → 替换下一回合女巫技能

弹窗动画：easeOutBack 入场 + 内容渐入 + 关闭时上滑淡出。

#### 3.3.8 回合金币结算弹窗

达到目标分数后弹出：
```
┌──────────────────┐
│  第 N 关结算      │
│  ─────────────   │
│  基础金币    +x   │
│  剩余出牌×2  +x   │
│  剩余弃牌×1  +x   │
│  ─────────────   │
│  总计       +xx  │
│     [领取]       │
└──────────────────┘
```

> 注：`extraDiscards = this.discardsLeft`，即剩余弃牌次数直接折算为金币。

#### 3.3.9 药水升级页面（potion 状态）

进入后显示 A-Z 字母矩阵，选中字母后点击升级：
- **字母升级**：指定字母分数 +10（加法叠加，全局，跨回合保留）
- **随机强化**：随机强化手牌中 1 个字母，分数 ×2（商店购买）或 ×4（女巫奖励），老虎机抽奖形式
- **字母置换**：将手牌中选中的一张牌替换为指定字母（游戏中直接使用）

升级后启动弹出动画（oldScore → newScore），播放升级音效。

---

### 3.4 animation.js — 动画系统

**缓动函数**

| 名称 | 用途 |
|------|------|
| `easeOutCubic` | 通用减速（飞牌、分数弹出） |
| `easeOutBack` | 轻微回弹（按钮出现、补位滑动） |
| `easeOutBackStrong` | 强力回弹（卡牌飞入果冻感） |
| `easeOutBounce` | 弹跳效果 |
| `linear` | 线性 |
| `easeInOutQuad` | 缓入缓出 |
| `fadeIn` | 内容交错淡入（alpha + yShift） |

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
| `word_balatro_progress` | 游戏进度（回合、金币、女巫牌、药水、字母升级、maxJokerSlots） |
| `word_balatro_high_score` | 历史最高分 |
| `word_balatro_stats` | 统计（总局数、总分、最高关卡） |
| `word_balatro_settings` | 设置（音效、音乐、震动开关） |
| `word_balatro_card_book_unlocked` | 卡牌图鉴解锁状态（跨局永久保留） |
| `word_balatro_collected_witch_cards` | 已收集的女巫卡牌列表（跨局永久保留） |
| `word_balatro_equipped_witch_card` | 已装备的女巫卡牌（跨局永久保留） |

### 3.7 cloud_storage.js — 微信云存储

用于管理 `shop_card`、`witch`、`bg_icon`、`guide` 系列图片的上传、下载与运行时注入：

- **上传**：
  - `uploadShopCards()`：批量上传 `images/shop_card/` 到云存储
  - `uploadWitchImages()`：递归扫描 `images/witch/`（含子目录 `witch_guide_1`、`witch_guide_2`），witch 头像上传至 `witch/`，guide 帧序列上传至 `witch/guide/`
  - `uploadBgIconImages()`：上传背景图到 `bg_icon/`
- **下载**：
  - `preloadShopCardImages()`：预加载页批量下载商店卡牌图片
  - `preloadBgIconImages()`：预加载页下载背景图
  - `preloadGuideImages()`：按需下载（仅新用户/引导未完成时）
  - `preloadWitchAvatarForLevel(level, renderer)`：**回合级按需下载**，当前回合进行时后台预加载下一回合的女巫头像
- **注入**：`injectToRenderer()` / `injectWitchToRenderer()` / `injectBgIconToRenderer()` / `injectGuideToRenderer()` 将云缓存图片覆盖到渲染器
- **调试**：提供 `debugLogs` 数组，可在游戏中通过调试菜单查看云存储操作日志

---

## 4. 商店系统（Shop）

### 4.1 商品池（SHOP_POOL）

| 类型 | 数量 | 价格 | 上限 | 标识色 |
|------|------|------|------|--------|
| **女巫牌**（witch） | 10 种 | 4-10 金币 | 装备栏默认 4 格（可扩展） | 紫色 |
| **水晶球**（crystal） | 6 种 | 3-8 金币 | 购买即生效 | 蓝色 |
| **魔法药水**（potion） | 4 种 | 4-6 金币 | 道具栏 2 格 | 绿色 |

每回合从各池中随机抽取 2 款，共 6 款商品。女巫牌会过滤已装备的名称避免重复。

**女巫牌列表**：元音强化、元音为首、五字母连击、六字母连击、珍稀之力、容错咒文、字母之神、生命延续、勇敢试错、以小博大、双子合影、首尾呼应、首字连击、回到过去、复制魔法。

### 4.2 药水种类

| 名称 | 效果 | value |
|------|------|-------|
| 字母升级 | 指定字母分数 +10（加法叠加，全局跨回合保留） | 10 |
| 字母置换 | 将手牌中一张替换为指定字母 | - |
| 随机强化 | 随机强化 1 个字母，分数 ×2（商店）/ ×4（女巫奖励） | 2/4 |

> 药水购买后需在成功弹窗选择"暂存"（放入道具栏）或"立即使用"。字母置换药水仅在道具栏点击后游戏中直接使用。

### 4.3 水晶球种类

| 名称 | 效果 |
|------|------|
| 额外弃牌 | 下一回合弃牌次数 +1 |
| 额外出牌 | 下一回合出牌次数 +1 |
| 额外手牌 | 下一回合增加一张字母手牌 |
| 目标减免 | 下一回合目标分数 ×0.8 |
| 技能重掷 | 重掷下一回合的女巫技能 |
| 争分夺秒 | 下回合前20秒出牌不消耗次数 |

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
  → 显示"售出"按钮（easeOutBack 弹出，3 秒后自动消失）
  → 点击售出 → 卡牌飞出动画 → 获得金币（售价的一半） → 补位滑动
```

### 4.5 刷新

商店标题栏右侧设有**全局重掷按钮**，消耗 3 金币可刷新全部三行商品（每行重新随机生成 2 款）。余额不足时按钮置灰。

### 4.6 卡牌图鉴（Card Book）

第 3 关通关后解锁，商店页面标题旁显示图鉴图标（闪光提示新收集）。点击图标进入图鉴面板：

- **收集机制**：每通关一个带女巫头像的关卡，自动收集该关卡对应的女巫卡牌（存入 `collectedWitchCards`）。已收集的卡牌显示彩色头像，未收集的显示灰色占位。
- **分页浏览**：左右翻页按钮浏览全部关卡女巫牌（每页最多 6 张）。
- **详情与装备**：点击已收集卡牌展开详情面板，显示女巫名称、描述和技能说明；面板底部提供**装备/卸下**按钮。装备后该女巫头像会显示在商店已装备栏的最右侧。
- **持久化**：收集状态和装备状态均跨局永久保留（`clearProgress()` 不会清除）。

**已装备女巫卡牌（WITCH_CARDS）**

图鉴中收集到的女巫卡牌可**装备 1 张**，提供跨局被动技能：

| 卡牌 | 女巫 | 技能名称 | 效果 |
|------|------|---------|------|
| witch_card_3 | 爱莉亚 | each_round_coin_plus1 | 每回合结算，基础金币 +1 |
| witch_card_5 | 柏丽桑忒 | each_round_hand_plus1 | 每回合出牌次数 +1，基础金币 -1 |
| witch_card_8 | 喀薇娅 | illegal_words_one | 每回合首次非法单词不扣除出牌次数 |

> 装备后女巫头像显示在商店已装备栏最右侧，技能在每回合自动生效。

---

## 5. 游戏状态机

```
[playing] ──score≥target──→ [settlement] ──claim──→ [witch_reward] ──领取奖励──→ [shop]
    │                                                              │
    │←──────────────────nextRound()───────────────────────────────┘
    │                                                              │
    │←──upgradeCard()── [potion] ←── buy/use potion ──────────────┘
    │       (暂存/升级后返回)
    │
    └── out_of_hands ──→ [life_extended] ──领取──→ [shop]  （如有生命延续女巫牌）
    │
    └── out_of_hands / surrender ──→ [gameover] ──restart()──→ [playing]
```

---

## 5.1 新手引导（witch_guide）

首次进入游戏的玩家会在第 1 回合触发新手引导，共 **5 个 Phase**：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 开场白：女巫介绍世界观 | witch_1 帧动画（左→右果冻弹出）+ 对话框（右→左弹出）+ 逐字显示 |
| 2 | 玩法说明：如何拼单词得分 | witch_2 帧动画 |
| 3 | 赠送卡牌：插入 `has_vowel` 女巫牌 | witch_2 帧动画 + 卡牌果冻弹入（带金色星星光晕） |
| 4 | 结束语：鼓励出发挑战 | witch_2 帧动画 |
| 5 | 退场动画：女巫+对话框弹出屏幕 | 退场后引导层消失，恢复正常游戏 |

**入场时序（Phase 1）**：
```
0~1000ms    → 全亮无 UI（只显示游戏画面）
1000~1500ms → 渐变变暗（黑色蒙层 alpha 0→0.75）
1500ms      → 女巫+对话框果冻感弹出（600ms easeOutBackStrong）
2000ms      → 弹出完成，延迟 500ms
2500ms      → 文字开始逐字显示（每 65ms 一个字）
```

**持久化**：引导完成状态（`guidePhase ≥ 5`）通过 `storage.saveGuidePhase()` **独立存储**，即使游戏结束 `clearProgress()` 也不会清除。同一位玩家终身只显示一次引导。

**预加载**：guide 帧序列仅在预加载页**按需下载**（判断 `savedProgress.guidePhase < 5` 或存档不存在），已完成引导的用户不下载，节省流量。

### 5.1.1 商店女巫技能引导（witch_guide_3）

第 2 回合进入商店时触发，终身只显示一次。共 **2 个 Phase**：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 聚光灯挖空效果聚焦下一回合女巫技能模块，女巫+对话框果冻弹出 | witch_3 帧动画 + 逐字显示 |
| 2 | 解释女巫技能的作用与影响 | 继续 witch_3 帧动画 + 逐字显示 |
| 3 | 退场动画 | 女巫+对话框淡出，恢复正常商店交互 |

**持久化**：`shopGuidePhase` 独立存储，游戏结束不清除。

### 5.1.2 卡牌图鉴引导（witch_guide_4）

第 3 关解锁卡牌图鉴后，首次进入商店时触发，终身只显示一次。采用**聚光灯 + 女巫对话框**形式：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 高亮图鉴图标，女巫介绍图鉴功能 | witch_4 帧动画 + 逐字显示 |
| 2 | 解释收集与装备女巫卡牌的作用 | 继续 witch_4 帧动画 + 逐字显示 |
| 3 | 退场动画 | 女巫+对话框淡出，恢复正常商店交互 |

**持久化**：`cardBookGuidePhase` 独立存储，游戏结束不清除。

---

## 6. 关键数据结构

### 6.1 卡牌对象（Card）

```js
{
  letter: "S",           // 字母（大写）
  baseScore: 19,         // 原始字母分数
  score: 19,             // 当前有效分数（升级后 = baseScore × upgradeMult + upgradeAdd）
  isFace: false,         // 是否人头牌（X/Y/Z）
  id: "faxdakqgq",       // 唯一标识
  selected: false,       // 是否被选中
  upgraded: false,       // 是否被药水升级过
  upgradeMult: 1,        // 升级倍率（累乘）
  upgradeAdd: 0,         // 升级加法值（加法叠加）
  newCard: false,        // 是否是刚抽到的新牌
  animOffset: null,      // 动画偏移 {x, y, rotation, opacity, scale}
  selectOffset: 0,       // 选中上移偏移
  jumpOffsetY: 0,        // 字母跳跃偏移
  _flyIndex: undefined,  // 飞出时的原始索引
  _originalScore: undefined, // 字母之神临时保存的原始分数
  _scoreScale: undefined // 药水升级时的脉冲缩放（由 renderer 消费）
}
```

### 6.2 商店商品对象（ShopItem）

```js
// 女巫牌（无 scope 的仅触发特殊效果，不参与常规倍率计算）
{ name: "容错咒文", type: "witch", trigger: "shield_illegal",
  cost: 8, desc: "打出非法单词，不扣除出牌次数" }

// 水晶球
{ name: "额外弃牌", type: "crystal", effect: "extra_discard",
  value: 1, cost: 3, desc: "下一回合弃牌次数+1" }

// 魔法药水
{ name: "字母升级", type: "potion", effect: "upgrade_letter",
  value: 10, cost: 4, desc: "指定一张字母牌，分数 +10" }
```

### 6.3 字母升级记录（LetterUpgrade）

```js
letterUpgrades = Map {
  "T" => { mult: 2 },   // T 牌所有实例分数 ×2
  "S" => { mult: 6, add: 10 },   // S 牌先×2再×3 = ×6，再加 10
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
| `wx.getSystemInfoSync()` | 获取屏幕尺寸、DPR、安全区域 |
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

**长按**游戏左上角图标（`top_icon.png`）**600ms** 可打开/关闭调试菜单：
- 重置出牌次数
- 增加 100 分
- 增加 10 金币
- 增加女巫槽位
- 跳转回合（输入目标回合数）
- 直接通关（进入 settlement）
- 刷新商店（重新生成 6 款商品）
- 上传 shop_card 图片到云存储
- 上传 witch 图片到云存储（含 guide 帧序列）
- 上传 bg_icon 图片到云存储
- **触发新人引导**（强制回到 Phase 1）
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
| ~~P2~~ | ~~新手引导~~ ✅ 已完成 |
| P3 | 皮肤系统 / 多种卡牌主题 |

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-04-30 | 初始版本 |
| v1.1.0 | 2026-04-30 | 转为微信小游戏 Canvas 版 |
| v1.2.0 | 2026-05-01 | 新增动画系统、音效系统、本地存储、女巫技能、售出/刷新、药水升级、调试菜单 |
| v1.3.0 | 2026-05-06 | 新增女巫奖励阶段、云存储系统、字母置换、目标减免、额外手牌、字母之神、容错咒文等 |
| v1.3.1 | 2026-05-11 | 更新文档，修正 README 与代码不一致处；补充随机强化、女巫奖励、保底机制等说明 |
| v1.3.2 | 2026-05-13 | 补充生命延续、动态女巫技能分配、扩展词库、提示功能等；修正女巫牌/药水/水晶球描述；更新状态机与调试菜单 |
| v1.3.3 | 2026-05-17 | 修正女巫技能奖励表格与代码实际一致；补充四字母连击女巫牌；修正商店随机强化药水倍率说明 |
| v1.4.0 | 2026-05-18 | 新增女巫牌：以小博大、争分夺秒；新增水晶球：技能重掷；新增女巫技能池：letter_s_mult_half、letter_i_mult_half、disable_one_witch_card；新增 Lv.21 女巫奖励（女巫槽位+1）；新增生命延续状态机；优化灵动岛适配、金币胶囊样式、商店售出补位动画 |
| v1.5.0 | 2026-05-21 | 新增新手引导（5 Phase 帧动画 + 卡牌赠送）；背景图强制云存储；witch/guide 帧序列云存储管理；女巫头像改为回合级按需下载；调试菜单改为长按触发；字母升级/随机强化页面去顶部栏；修复游戏结束后重复触发引导的 bug |
| v1.6.0 | 2026-05-26 | 新增女巫牌"对称之美"；争分夺秒改为水晶球；商店改为全局重掷按钮（3 金币刷新全部）；新增卡牌图鉴系统（第 3 关解锁，收集/装备女巫牌）；顶部布局与灵动岛适配优化 |
| v1.6.1 | 2026-05-27 | 拆分"对称之美"为"双子合影"+"首尾呼应"两张独立女巫牌；修复首字连击详情显示倍率增值；修复 haste_play 永久不耗牌 bug |
| v1.7.0 | 2026-05-28 | 目标分数改为分段系数曲线；新增商店女巫技能引导（witch_guide_3）；新增卡牌图鉴引导（witch_guide_4）；witch_guide_4 改用精灵图；优化配置 |

---

*文档基于实际代码整理，最后更新：2026-05-28*
