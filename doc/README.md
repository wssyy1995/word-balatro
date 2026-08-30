# Word Balatro — 单词卡牌小游戏 技术文档

## 1. 项目概述

**Word Balatro**（游戏内标题 `女巫的词牌`）是一款基于 **Canvas 2D** 的微信小游戏。玩家从手牌中选取字母卡牌拼出合法英文单词，根据字母分数和单词长度计算得分，在限定出牌次数内达到目标分数即可进入下一关。游戏融合了 Roguelike 元素（女巫牌、水晶球、魔法药水），每局体验各不相同。

| 属性 | 说明 |
|------|------|
| 平台 | 微信小游戏（Canvas 2D） |
| 适配基准 | iPhone 6/7/8（375×667），自动缩放 |
| 缩放范围 | `scale` 限制在 0.8 ~ 1.4，防止过大/过小；折叠屏/矮屏设备高度不足时会进一步压低，下限 0.75 |
| 最低基础库 | 3.14.0 |
| 词库 | 本地高频词 + 在线百度翻译词典版 API 校验 |

---

## 2. 目录结构

```
word-balatro/
├── game.js                  # 游戏入口：初始化、主循环、触摸输入分发
├── game.json                # 小游戏配置（竖屏、无状态栏）
├── project.config.json      # 微信项目配置（已配置真实 appid）
├── project.private.config.json  # 微信开发者工具私有配置
├── code.fortify.config.json     # 代码加固配置
├── .gitignore
├── doc/
│   ├── README.md                       # 本文档
│   ├── ANIMATION_GUIDE.md              # 动画开发规范
│   ├── START.md                        # 开发启动说明
│   ├── START_SIMPLE.md                 # 简化版启动说明
│   ├── TECHNICAL_ARCHITECTURE.md       # 技术架构文档
│   ├── 26位女巫名字.md                  # 女巫名称参考
│   ├── 加固流程.md                       # 代码加固流程
│   └── daily_words_08_06_13.jsonl      # 每日挑战/每日金词词库（JSON Lines，2026-08-06~08-13）
├── images/                  # 图片资源（背景、卡牌模板、按钮、商店图标、女巫头像等）
├── music/                   # 音效/BGM 资源
│   ├── bg/                  # 背景音乐
│   └── sound_effect/        # 音效文件
├── raw_words/               # 原始词库数据（构建脚本输入）
├── openDataContext/         # 微信开放数据域 —— 好友排行榜
│   └── index.js             # 排行榜绘制与好友数据拉取
├── cloudfunctions/          # 微信云函数
│   ├── baiduDict/           # 百度翻译词典版 API（换取 access_token）
│   ├── getDailyWords/       # 每日挑战单词获取
│   ├── getGlobalRank/       # 全国排行榜数据获取
│   ├── updateBestRound/     # 排行榜 bestround 上传
│   ├── updateUserProfile/   # 头像昵称授权后上传到云数据库
│   ├── syncWordBook/        # 单词本增量同步到云数据库
│   ├── updateHonorTrophy/   # 对战荣誉杯累计上传到云数据库
│   ├── login/               # 用户登录信息上报
│   ├── battleRoom/          # 创建好友对战房间（生成第一回合统一种子词/手牌）
│   ├── battleJoin/          # 加入好友对战房间
│   ├── battleStart/         # 房主开始对战（复用预生成的种子词/手牌）
│   ├── battleReady/         # 好友点击准备
│   ├── battleGet/           # 轮询获取房间状态
│   ├── battlePlay/          # 玩家出牌同步到云端
│   ├── battleNextRound/     # 房主推进下一回合
│   ├── battleRequestRestart/# 发起重新挑战邀请
│   ├── battleAcceptRestart/ # 接受重新挑战邀请
│   ├── battleClose/         # 关闭房间（一方退出）
│   ├── getBattleOpponent/   # 获取对战对手头像/昵称/荣誉杯
│   └── syncSaveData/        # 存档云端备份与恢复（复用 users 表 saveData 字段）
├── scripts/                 # 构建脚本（词库生成、精灵图打包等）
└── js/
    ├── data.js              # 静态数据：字母分数/分布、人头牌、词库引用、缓存
    ├── words.js             # 本地核心词库（高频词含中文释义）
    ├── expand_words.js      # 扩展离线词库（补充高频词）
    ├── game.js              # Game 核心类 + 工具函数（计分、校验、保底、发牌）
    ├── renderer.js          # 渲染器入口薄层：require('./render/index')
    ├── render/              # Renderer 模块化目录（原 6600+ 行 renderer.js 拆分）
    │   ├── base.js          # Renderer 核心类、构造函数、通用工具
    │   ├── index.js         # 模块组装入口、render(game) 状态机调度
    │   ├── effects.js       # 道具卡牌渲染、星辰燔边粒子
    │   ├── animation.js     # 飞星/飞分/闪光粒子动画
    │   ├── hud.js           # 顶部标题栏、HUD（回合/目标分/女巫头像）
    │   ├── playing.js       # 主玩法画面（手牌矩阵、道具栏、预览、按钮）
    │   ├── popup.js         # 弹窗系统（换字母/药水/升级/续命）
    │   ├── guide.js         # 新手引导覆盖层
    │   ├── cardbook.js      # 卡牌图鉴图标与详情
    │   ├── debug.js         # 调试菜单、云日志
    │   ├── gameover.js      # GameOverRenderer 独立类
    │   ├── homepage_entry.js # 主页入场动画与装饰星星
    │   ├── golden.js        # 每日金词玩法画面（入口弹窗/HUD/手牌/历史/结果）
    │   └── test.js          # 渲染层自测脚本
    ├── battle/              # 对战模式（独立状态机与渲染）
    │   ├── index.js         # 对战入口
    │   ├── manager.js       # 对战逻辑管理
    │   ├── renderer.js      # 对战画面渲染
    │   ├── input.js         # 对战输入处理
    │   ├── deck.js          # 对战牌组
    │   └── bot.js           # 对战机器人
    ├── battle.js            # 对战模块薄层入口（require('./battle/index')）
    ├── shop.js              # 商店数据池、购买逻辑、ShopRenderer、ConfirmBuyRenderer
    ├── settlement.js        # 回合金币结算弹窗 + 女巫奖励渲染
    ├── animation.js         # 动画系统：Easing 曲线 + Animation + AnimationManager
    ├── cloud_storage.js     # 微信云存储：shop_card / witch / bg_icon / guide / rank_avatar / battle / music
    ├── audio.js             # 音效管理器（wx.createInnerAudioContext）
    ├── storage.js           # 本地存储：进度存档、最高分、统计、设置
    ├── witch_skills.js      # 女巫技能约束与奖励
    ├── daily_achievements.js # 每日成就系统：任务进度、奖励领取、每日过期清理
    ├── input.js             # InputHandler 类（触摸事件处理，game.js 入口引用）
    └── report.js            # 埋点事件上报封装（devtools 环境下跳过）
```

---

## 3. 核心模块详解

### 3.1 data.js — 静态数据层

**字母分数**

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 |

> 注：当前版本为 `beta:难度降低` 后的字母分数，所有字母在基准值上统一 +10；字母升级/随机强化在此基础上计算。

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
| `state` | string | `playing` / `settlement` / `witch_reward` / `shop` / `potion` / `mystery_discount` / `life_extended` / `gameover` / `battle` |
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
| `cardBookUnlocked` | boolean | 卡牌图鉴是否已解锁（第 3 关通关后） |
| `cardBookOpen` | boolean | 图鉴面板是否打开 |
| `cardBookPage` | number | 图鉴当前页码 |
| `_reduceTargetAnim` | Object | 目标分数减免动画状态 |
| `_changeLetterPopup` | Object | 字母置换弹窗状态 |
| `_equalSplitSelectedLetters` | Array | 平分秋色已选字母（选择阶段） |
| `_equalSplitAnim` | Object | 平分秋色旋转/结果动画状态 |
| `_starlightWashSelectedLetter` | string | 星辉洗涤已选字母（选择阶段） |
| `_starlightWashAnim` | Object | 星辉洗涤旋转/结果动画状态 |
| `_hastePlayActive` | boolean | 争分夺秒生效中（前 20 秒出牌不耗次数） |
| `_disableWitchAnim` | Object | 禁用女巫牌动画状态 |
| `_witchUpgradePopup` | Object | 女巫牌升级弹窗状态（jokerIndex / upgraded / closing，见 4.5.1） |
| `animManager` | AnimationManager | 动画管理器实例 |
| `audioManager` | AudioManager | 音效管理器实例 |
| `storageManager` | StorageManager | 本地存储管理器实例 |

> 注：新游戏初始金币为 4，每回合结算基础金币为 2（见 3.3.11）。

#### 3.2.2 核心方法

**`toggleSelect(cardId)`**
- 选中/取消选中单张卡牌
- 限制最多选当前手牌上限张（`_maxHandSize || baseHandSize`，默认 9 张）
- 触发 `cardSelect` / `cardDeselect` 动画
- 播放选牌/取消音效

**`playHand()` — 出牌（异步）**
```
流程：
1. 检查选中卡牌 ≥2 张，且不在 pendingCheck 中
2. 拼接字母成单词
3. 本地校验（WORD_DATA / EXPAND_WORD_DATA / onlineWordCache）
4. 本地不存在 → 在线 API 校验（百度翻译词典版）
5. 非法 → pendingCheck.state = 'invalid'，handsLeft--（或被 shield_illegal / haste_play 抵消），可能触发 gameover
6. 勇敢试错：非法单词且未触发容错咒文时，illegal_boost 倍率 +1
7. 女巫技能约束检查（如 need_letter_4 / force_letter_3）→ 不满足则 witch_failed
8. 字母之神（letter_god）预处理：若触发，先将所有出牌字母分数改为最高分
9. 以小博大（last_chance）：若出牌 ≤3 个字母，40% 概率 mult +8
10. letter_X_mult_half 惩罚检测（含 A/E/S/I）→ 满足条件则倍率减半
11. 合法 → calcWordScore() 计算分数
12. 启动完整动画时间线（事件驱动，renderer 推进）：
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
- 关闭动画后直接进入 `shop` 状态；`witch_reward` 是进入商店后延迟 600ms（图鉴引导后 400ms）弹出的覆盖层，中间可能先弹「获得新词牌」弹窗

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
- target = calcBaseTarget(round)（分段系数累加，见 3.2.3）
- deck=createDeck(), hand=drawWithSafety()（双种子词发牌：固定1个3字母+1个4字母种子词，随机补牌为辅音且不与种子词字母重复）
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
| 元音为首 | `initial_vowel` | per_card | 单词首字母为元音 | 该首字母 score +100 |
| 左右开弓 | `left_right_open` | per_card | 单词首尾两张字母牌 | 首尾字母各 score +30 |
| 五字母连击 | `length_5` | whole_word | 单词 ≥5 字母 | mult +2 |
| 六字母连击 | `length_6` | whole_word | 单词 ≥6 字母 | mult +4 |
| 珍稀之力 | `has_face` | whole_word | 单词含 J/Q/X/Y/Z | mult +4 |
| 容错咒文 | `shield_illegal` | — | 打出非法单词 | 不扣除出牌次数 |
| 字母之神 | `letter_god` | limit | 每次计分（限3次） | 本单词所有字母按最高分字母算分 |
| 生命延续 | `life_extension` | limit | 出牌耗尽时（限1次） | 挽救游戏结束，目标分差×2 加到下一回合目标分 |
| 勇敢试错 | `illegal_boost` | whole_word | 打出非法单词后 | 倍率 +1（若同时触发容错咒文则不生效） |
| 以小博大 | `last_chance` | whole_word | 出牌 ≤3 个字母 | 40% 概率 mult +8 |
| 双子合影 | `double_same` | whole_word | 含相邻重复字母 | mult +5 |
| 首尾呼应 | `firstend_same` | whole_word | 首尾字母相同 | mult +6 |
| 首字连击 | `initial_succession` | whole_word | 连续打出同首字母单词 | 每次 mult +3，中断后重置 |
| 回到过去 | `end_ed` | whole_word | 单词末尾加 "ed" 也合法 | mult +4 |
| 复制魔法 | `end_s` | whole_word | 单词末尾加 "s" 也合法 | mult +3 |
| 消元术 | `no_duplicate` | whole_word | 与上一手无重复字母 | mult +2（否则 -1） |
| 预言家 | `predicted_letter` | per_card | 回合开始时预言的字母 | 该字母分数 +100 |
| 混沌法球 | `chaos_orb` | whole_word | 每次出牌必触发 | 倍率随机 +[0.5~1.2] |
| 温故知新 | `is_new_word` | whole_word | 单词首次打出 | mult +3；否则 mult -1 |
| 出牌小能手 | `zero_hands_bonus` | global | 回合结算时出牌次数已耗尽 | 基础金币 +2 |

> 注：带 `limit` 的女巫牌拥有 `usesLeft` 字段，次数耗尽后卡牌自动销毁（带撕裂动画）。
> `illegal_boost` 的 value 会随非法单词打出次数动态变化。
> `length_4`（四字母连击）当前在 `SHOP_POOL` 中已注释掉，商店暂不投放；五/六字母连击正常投放。

**目标分数公式**（`calcBaseTarget(round)` 定义在 `js/data.js`，由 `js/game.js` 引入并调用）

采用分段系数累加：

```
target = 450 + Σ(第 r 关系数 × (r - 1))  (r 从 2 到当前回合)
```

| 回合区间 | 系数 |
|---------|------|
| 第 1 关 | 450（基准） |
| 第 2~5 关 | 40 |
| 第 6~10 关 | 35 |
| 第 11~20 关 | 37 |
| 第 21~30 关 | 40 |
| 第 31~40 关 | 44 |
| 第 41~50 关 | 50 |
| 第 51+ 关 | 60 |

| 关卡 | 目标分数 |
|------|---------|
| 1 | 450 |
| 2 | 490 |
| 3 | 570 |
| 4 | 690 |
| 5 | 850 |
| 6 | 1025 |
| 10 | 2075 |
| 11 | 2445 |
| 20 | 7440 |
| 30 | 17240 |
| 50 | 54670 |

#### 3.2.4 种子词与保底机制（Seed Word / Safety）

**回合初始发牌（`drawWithSafety`）**

每回合初始发牌时，固定生成种子词，确保玩家手牌中始终有合法单词可出：

- **第一回合特殊规则**：固定生成 **3 个长度 3** 的种子词（共 9 张种子牌，正好填满默认手牌，无随机补牌），三个词均从长度 3 候选中按元音规则筛选
- **其余回合双种子词固定长度**：一个长度 **3** 的单词 + 一个长度 **4** 的单词
- **种子词元音限制**：
  1. 所有种子词字母加起来，**不同元音种类不超过 2 个**（A/E/I/O/U）
  2. 同一个元音字母在所有种子词中**累计出现次数不超过 2 次**
  3. 第一回合若按元音规则凑不齐 3 个词，则放宽限制直接补足（兜底）
- **种子词不从牌堆消耗**：种子词卡牌直接凭空创建，不消耗 `deck` 中的牌
- **种子词在手牌中打散**：种子牌先内部打乱顺序，再逐个随机穿插到手牌各位置，不按单词字母顺序连续出现

**随机补牌规则**

在种子词之外，手牌剩余空位由随机牌补足（默认 9 张手牌补 2 张；第一回合 9 张种子牌已填满，补 0 张）：

- 随机牌的**字母不能与两个种子词的任何字母重复**
- 随机牌**不能是元音**（只能是纯辅音牌）

**弃牌/出牌后补牌（`drawWithSeedSafety`）**

弃牌或出牌后，旧牌回到牌堆底部并重新洗牌，然后通过 `drawWithSeedSafety` 补牌：

1. 从保留手牌中挑选 2 张字母牌（优先 1 元音 + 1 辅音，否则 2 辅音）
2. 在词库中查找包含这 2 个字母的保底种子词（出牌默认长度 4；弃牌时仅弃 1 张为 3，弃 ≥2 张为 4；`force_contain_X` 约束下会优先生成含指定字母的种子词）
3. 提取种子词剩余字母创建种子卡牌，剩余空位再通过 `drawWithVowelRules` 按元音规则从牌堆补齐
4. 元音规则兜底：保留手牌 + 新抽牌须满足**至少 2 种不同元音**且**每种元音不超过 2 张**，最多重试 10 次
5. 新牌从左侧飞入动画，填入 `null` 占位符位置

> 若旧存档中仍持有 `out_card_different` 装备技能，弃牌后补牌会先过滤掉原弃牌字母。

**存档恢复时的保底检查（`ensureValidWordInHand`）**

仅在从存档恢复且手牌存在缺口时触发：
- 若手牌无法组成任何合法单词，从词库随机选一个 **3~6 长度**的种子词
- 从 `deck` 抽出所需字母生成种子卡牌，替换 `null` 占位符

**其他约束**
- 回合初始发牌始终执行双种子词逻辑
- 弃牌/出牌后补牌优先通过 `drawWithSeedSafety` 生成种子词保底，再执行 `drawWithVowelRules` 元音规则
- 手牌上限始终不超过 `_maxHandSize`（默认 9 + 额外手牌）
- 若女巫技能为 `no_letter_a`，种子词候选也不会包含字母 A

#### 3.2.5 单词检测系统

**三层检测**

| 层级 | 来源 | 速度 |
|------|------|------|
| L1 | `WORD_DATA`（核心离线词库） | 毫秒级 |
| L1.5 | `EXPAND_WORD_DATA`（扩展离线词库） | 毫秒级 |
| L2 | `onlineWordCache` / 百度翻译词典版 API | 1-3 秒 |

> 注：早期版本曾接入 `MyMemory` 作为后台兜底翻译，当前已移除，统一由百度翻译词典版 API 负责在线校验与释义。

**校验状态机（`pendingCheck`）**
- `checking` → 显示橙色单词 + loading 动态点号
- `valid` → 深绿色单词 + 中文释义 + 烟花 + 字母跳跃动画
- `invalid` → 红色单词 + 错误图标
- `witch_failed` → 显示女巫约束失败提示

#### 3.2.6 女巫技能系统

特定回合会出现女巫约束，必须满足才能算合法出牌：

| 回合 | 约束 | 奖励 | 是否进入 `witch_reward` |
|------|------|------|------------------------|
| 第 3 关 | 动态分配* | 字母置换/吸星大法各 50%（100% 中奖） | ✅ |
| 第 5 关 | 动态分配* | 额外字母（10%） | ❌ |
| 第 8 关 | 动态分配* | 额外字母（100%） | ✅ |
| 第 11 关 | 动态分配* | 商店5折（100%） | ❌ |
| 第 14 关 | 动态分配* | 女巫槽位+1（100%） | ✅ |
| 第 16 关 | 动态分配* | 随机强化药水（100%） | ❌ |
| 第 18 关 | 动态分配* | 额外出牌（100%） | ✅ |
| 第 21 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 24 关 | 动态分配* | 商店5折（100%） | ✅ |
| 第 27 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 29 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 32 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 35 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 38 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 41 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 44 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 47 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 50 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 53 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 56 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 59 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 62 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 65 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 68 关 | 动态分配* | 字母升级（30%） | ❌ |
| 第 71 关 | 动态分配* | 字母升级（30%） | ✅ |
| 第 74 关 | 动态分配* | 字母升级（30%） | ❌ |

> 女巫约束按上表在各关卡生效；满足约束通关后，`has_reward` 为 `true` 的关卡进入女巫奖励阶段（`witch_reward`），按该技能 `rate` 概率触发 3 选 1 礼盒；`has_reward` 为 `false` 的关卡不进入奖励阶段，其奖励当前不会发放（`giveReward` 已导出但无调用方）。
>
> 当前 `WITCH_SKILLS` 配置中不包含 `double_coin`（金币翻倍），该奖励类型仅在 `getRewardName` / `createRewardItem` 中保留定义，未实际投放。
>
> *动态分配：所有关卡的约束均从 `SKILL_POOL` 中按游戏开始时打乱的顺序分配（`shuffleSkillPool`），每局游戏的约束组合各不相同；打乱时保证 `force_letter_3` 固定在第 3 个位置（若洗牌后不在第 3 位，则与第 3 个交换位置），即每局第 8 关（`WITCH_SKILLS` 下标 2，循环复用时下标 18 的第 53 关同理）的约束恒为「每次出牌只能出 3 张字母牌」。`SKILL_POOL` 共 16 个技能，少于 `WITCH_SKILLS` 的 25 关，超出时按 `idx % shuffledSkills.length` 循环复用分配。`SKILL_POOL` 包含：
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
> - `disable_two_witch_card`：回合开始时随机禁用 2 张女巫牌
> - `disable_potion_card`：本回合禁用所有魔法药水牌
> - `force_contain_A`：打出的单词必须包含字母 A
> - `force_contain_B`：打出的单词必须包含字母 B
> - `force_contain_O`：打出的单词必须包含字母 O
> - `witch_card_value_half`：本回合所有女巫牌倍率效果减半

过关且满足约束后，`has_reward` 为 `true` 的关卡进入 **女巫奖励阶段（`witch_reward`）**：3 选 1 礼盒抽奖，按该技能 `rate` 概率获得奖励。`has_reward` 为 `false` 的关卡则不进入奖励阶段，其奖励当前不会发放（`giveReward` 已导出但无调用方）。

奖励类型包括：
- **buff 类**：额外出牌、额外字母、女巫槽位+1、商店5折（直接生效，「领取」按钮）
- **药水类**：字母强化、字母置换、随机强化、吸星大法（字母置换/吸星大法为 `scope: 'game'`，结果页只有「暂存」按钮，游戏中点击道具栏使用）

> 兜底规则（`resolveWitchReward`）：命中的奖励为药水但道具栏已满（2 格）时，自动换成一张玩家当前未装备的随机女巫牌（从 `SHOP_POOL.witch` 中过滤已装备名称后随机），结果页按钮变为「装备」，点击后装备到女巫牌栏（初始化对齐商店购买：`usesLeft` / `level: 1` / `real_value`）；若此时女巫牌栏也已满，则 toast 提示「女巫牌栏已满，无法装备」，奖励不发放。第 3 关奖励 `card_change_letter_absorb_stars` 即为 50% 字母置换 / 50% 吸星大法的组合奖励。

> 注：`double_coin`（金币翻倍）在 `getRewardName` / `createRewardItem` 中有定义，但当前 `WITCH_SKILLS` 配置未实际投放该奖励。

---

### 3.3 js/render/ — Canvas 渲染层（模块化）

原 `js/renderer.js`（6600+ 行单文件）已拆分为 `js/render/` 目录下的聚焦模块，入口 `js/renderer.js` 现为薄层：

```js
module.exports = require('./render/index');
```

#### 3.3.1 模块目录

```
js/render/
├── index.js         # 组装入口：加载扩展模块，定义 render(game) 状态机与全局覆盖层调度
├── base.js          # Renderer 核心类、构造函数、通用工具方法
├── effects.js       # 道具卡牌渲染、粒子、弹窗面板、光晕、按钮、分隔线等通用特效
├── animation.js     # 烟花/字母之神飞星、飞分、闪光粒子、药水升级动画绘制，以及危险复制/平分秋色/星辉洗涤/吸星大法的选择页与结果动画
├── hud.js           # 顶部标题栏、HUD、Toast、飞行星星
├── playing.js       # 主玩法界面（手牌、道具、预览、按钮、出牌动画状态机）
├── popup.js         # 弹窗系统（换字母/药水/升级/续命/设置/反馈/单词本/今日新词）
├── guide.js         # 新手引导/商店引导/图鉴引导（共用 3 张静态引导图）
├── cardbook.js      # 卡牌图鉴图标、详情面板、全部/已装备 Tab
├── debug.js         # 调试菜单、云存储日志面板
├── gameover.js      # GameOverRenderer 独立类
├── homepage_entry.js # 主页入场"星轨铭文"动画与装饰星星
├── golden.js        # 每日金词玩法（入口弹窗/月历/HUD/手牌/历史/结果弹窗）
└── test.js          # 自测脚本（mock Canvas + game，验证加载与渲染）
```

| 模块 | 行数 | 职责 | 导出方式 |
|------|------|------|----------|
| `base.js` | ~1792 | `Renderer` 类定义、构造函数、通用工具、资源占位 | `class Renderer` |
| `effects.js` | ~1275 | 道具卡牌绘制、粒子、`_drawModalPanel`、`_drawCardGlow`、`_calcPulseScale`、按钮 | 函数扩展 |
| `animation.js` | ~1829 | 烟花/星星粒子、飞行总分、字母之神飞星、药水升级动画，以及危险复制/平分秋色/星辉洗涤/吸星大法的选择页与结果动画绘制 | 函数扩展 |
| `hud.js` | ~688 | 顶部栏、金币胶囊、回合/目标分、女巫头像、Toast 及飞行星星 | 函数扩展 |
| `playing.js` | ~1716 | 主玩法布局、手牌网格、预览/分数方块、出牌动画状态机、求助提示 | 函数扩展 |
| `popup.js` | ~4446 | 女巫详情、女巫牌升级、字母置换、药水升级/随机强化、设置/反馈/版本信息、单词本、今日新词 | 函数扩展 |
| `guide.js` | ~1082 | 新手引导/商店引导/图鉴引导（witch_1=主引导、witch_2=商店引导、witch_3=图鉴引导） | 函数扩展 |
| `cardbook.js` | ~290 | 图鉴图标/NEW 角标、大图灯箱（装备功能已隐藏） | 函数扩展 |
| `debug.js` | ~176 | 云日志、调试菜单 | 函数扩展 |
| `gameover.js` | ~242 | **独立类** `GameOverRenderer` | 独立类 |
| `index.js` | ~1507 | 组装扩展、`render()` 状态机、设置/单词本/今日新词/排行榜覆盖层 | 组装入口 |
| `homepage_entry.js` | ~144 | 主页入场"星轨铭文"动画与装饰星星 | 函数扩展 |
| `golden.js` | ~922 | 每日金词玩法：入口弹窗（月历）、HUD、手牌、历史面板、结果弹窗 | 函数扩展 |

#### 3.3.2 导出规范

本项目使用两种导出模式，**新增代码必须按此选择**：

**模式 A：函数扩展（Prototype Extension）**

向 `Renderer.prototype` 追加绘制方法。适用于大部分模块。

```js
// js/render/xxx.js
module.exports = function extendXxx(Renderer) {
  Renderer.prototype.someMethod = function(game) {
    // this.ctx / this.scale / this.W / this.H 均可直接访问
  };
};
```

在 `index.js` 中加载：

```js
require('./hud')(Renderer);      // ✅ 先 require，再调用并传入 Renderer
```

**模式 B：独立类（Standalone Class）**

不挂载到 `Renderer.prototype`，而是在 `Renderer` 构造函数中实例化为子渲染器。

```js
// js/render/gameover.js
class GameOverRenderer {
  constructor(renderer) {
    this.parent = renderer;  // 通过 parent 访问共享工具
  }
  draw(ctx, game, W, H, s) { ... }
}
module.exports = { GameOverRenderer };
```

在 `base.js` 中加载：

```js
const { GameOverRenderer } = require('./gameover');
// 在 Renderer 构造函数中：
this.gameOverRenderer = new GameOverRenderer(this);
```

> ⚠️ **关键区别**：独立类**不能**在 `index.js` 里写成 `require('./gameover')(Renderer);`，因为它导出的是对象而非函数。

> ⚠️ **微信小游戏 `require` 不支持目录自动解析**，必须用显式路径：`require('./render/index')`。

#### 3.3.3 后续开发规范

| 功能领域 | 目标文件 |
|----------|----------|
| 通用工具（`roundRect`、碰撞检测等） | `base.js` |
| 顶部栏 / HUD / 金币 / 回合信息 | `hud.js` |
| 主玩法画面（手牌、道具、预览、按钮） | `playing.js` |
| 弹窗 / Modal / 覆盖层 | `popup.js` |
| 新手引导覆盖层 | `guide.js` |
| 动画效果（飞分、闪光、粒子） | `animation.js` |
| 视觉特效（边框发光、卡牌特效） | `effects.js` |
| 图鉴相关 | `cardbook.js` |
| 调试工具 | `debug.js` |
| 新的子渲染器（独立类） | 新建文件（模式 B）|

- **命名**：公开方法无前缀（`drawHUD`），私有/内部方法用 `_`（`_drawPropCard`）
- **`index.js` 保持薄层**：负责 `require` 扩展和 `render()` 状态机，以及设置/单词本/今日新词/排行榜等全局覆盖层的调度；各覆盖层具体绘制仍由对应模块或本文件聚焦方法实现
- **加载顺序**：`base.js` 必须先加载拿到 `Renderer` 类，扩展模块任意顺序

#### 3.3.4 渲染架构

采用**按帧渲染**，全部使用 Canvas 2D API，无 DOM。

```
render(game)
├── 清空画布 → 绘制背景图（云存储注入 bg_icon/bg.png，回退纯色 #0a1628）
├── 状态分流
│   ├── playing      → drawHUD() + drawPlaying()
│   ├── settlement   → drawHUD() + settlementRenderer.draw()
│   ├── witch_reward → witchRewardRenderer.draw()
│   ├── shop         → drawTopHeader() + shopRenderer.draw()
│   │                  └── confirmBuyRenderer.draw()（如有购买弹窗）
│   ├── mystery_discount → mysteryDiscountRenderer.draw()（独立全屏开奖页，不显示商店背景）
│   ├── potion       → drawPotion()（字母升级/随机强化不显示顶部栏）
│   ├── life_extended → drawHUD() + drawPlaying() + 续命弹窗
│   ├── gameover     → drawHUD() + drawPlaying() + gameOverRenderer.draw()
│   ├── battle       → battleRenderer.draw()（对战模式）
│   └── daily_gold   → drawGoldenHUD() + drawGoldenPlaying()（每日金词，golden.js）
├── game.animManager.update()   # 通用动画属性更新（来自 js/animation.js）
├── _updateAndDrawSparkles()    # 烟花粒子
├── _updateAndDrawFlyingScore() # 飞行总分
├── _shopToGameTransition()     # 页面过渡遮罩
├── 设置/单词本/今日新词弹窗  # 由 index.js 统一调度
├── _drawGuideOverlay()         # 新手引导覆盖层（Phase 1~4）
├── _drawShopGuideOverlay()     # 商店女巫技能引导
├── _drawCardBookGuideOverlay() # 卡牌图鉴引导
├── _drawCloudDebugLogs()       # 云存储调试日志
├── _drawDebugMenu()            # 调试菜单（长按 top_icon 触发）
└── 开放数据域排行榜绘制       # 主域直接 drawImage(sharedCanvas)
```

> 注：`js/render/animation.js` 中的 `updateAnimations()` 当前为空实现，通用动画更新由 `game.animManager`（`js/animation.js` 的 `AnimationManager`）负责；`render/animation.js` 主要承担粒子、飞分、字母之神飞星等绘制类动画。

#### 3.3.5 坐标系与适配

```
baseScale = min(windowWidth / 375, windowHeight / 667)
scale = clamp(baseScale, 0.8, 1.4)

// 折叠屏/矮屏二次约束：当 scale > 1.0 且 740*s 超过可用高度时，
// 整体压低 scale，避免 16:10 折叠屏（如 HUAWEI Pura X 内屏）内容溢出
requiredHeight = 740 * scale + 10
availableHeight = height - safeTop - safeBottom
if (scale > 1.0 && requiredHeight > availableHeight && availableHeight > 0) {
  scale = max((availableHeight - 10) / 740, 0.75)
}

卡牌尺寸动态计算（最多支持 4 列 × 3 行）：
cardW = min(74 * scale, (width - 48) / 4)
cardH = min(88 * scale, (height - 200) / 3)
gap = 8 * scale

主界面基准高度 740*s，盈余/不足自适应：
extraHeight = height - 740 * scale  // 可为负值
topOffset = extraHeight * 0.05
cardGap = max(4 * scale, 50 * scale + extraHeight * 0.25 - 10)
```

> 注：当手牌数 > 9（额外手牌效果）时，布局自动切换为 4 列自适应 + 最后一行居中。
> 针对灵动岛机型（iOS safeTop ≥ 44）增加顶部安全区域 padding。
> `playing` / `shop` / `life_extended` 三个状态下，页面内容整体下移 10px，底部操作按钮额外上移 5px，触摸命中已做对应反向偏移。

#### 3.3.6 卡牌渲染

使用 `card_template.png` / `card_template_selected.png` 作为背景，叠加文字：
- 大写字母（Georgia 粗体，32px，深蓝 `#1a2f4a`）
- 当前分数（11px，底部）
- Face 牌标记 `★`（右下角，金色）
- 新牌标记 `NEW`（绿色，首次渲染）
- 禁用标记（红色边框 + 抖动，disable_one_witch_card 触发）

> 注：卡牌模板文件现统一放在 `images/bg_icon/` 目录下，运行时强制从云存储下载并注入（`card_template`、`card_template_selected`、`card_template_upgrade`、`card_template_upgrade_selected`），不再由渲染器直接本地加载。已装备图鉴女巫卡牌后，对应字母牌渲染时使用升级模板（`card_template_upgrade.png` / `card_template_upgrade_selected.png`）。

卡牌支持动画偏移：`animOffset`（飞入/飞出）、`selectOffset`（选中上移）、`jumpOffsetY`（字母跳跃）。

#### 3.3.7 手牌与道具栏布局

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

#### 3.3.8 分数预览方块

选中 ≥1 张牌时显示两个方块（方块上方带「字母总分」「倍率」提示小字）：
- 左方块（蓝色背景）：字母基础分累加
- 右方块（绿色背景）：单词长度（即倍率）

> 预览值为基础值，不含女巫牌加成；出牌后预览值无缝接管正式计分动画（不再从 0 逐字母重新计分）。

出牌合法后，左方块上方可能显示 `xN`（per_card 女巫牌倍率提示）。

- 预览区左侧常驻 `help` 按钮，点击可打开求助弹窗（2 金币购买提示或分享后免费提示）。
- 使用求助后，预览区下方会显示 `[提示] 中文释义`，帮助玩家拼出当前手牌中的种子词。
- 预览单词字体自适应：长度 >9 时按 `28×9/长度` 缩放，防止超长单词溢出。

#### 3.3.9 商店页面布局

```
        女巫的词牌
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

#### 3.3.10 购买成功弹窗

点击价格按钮 → 扣除金币 → 显示成功弹窗：
- **女巫牌**：展示"装备"按钮 → 加入 `jokers[]`
- **药水牌**：展示"暂存"（加入 `potions[]`）和"立即使用"（进入 `potion` 状态）
- **水晶球**：展示"生效"（立即加入 `crystalEffects[]`）
- **技能重掷水晶球**：展示"生效" → 替换下一回合女巫技能

弹窗动画：easeOutBack 入场 + 内容渐入 + 关闭时上滑淡出。

#### 3.3.11 回合金币结算弹窗

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

> 注：`extraDiscards = this.discardsLeft`，即剩余弃牌次数直接折算为金币。当前版本 `baseGold` 固定为 2，再叠加装备卡结算加成。

**一击入魂（单手通关翻倍）**：本回合只出牌 1 次（含非法单词/试炼失败，只要点了出牌即计一次）即通关时，结算金币全部翻倍。弹窗入场后延迟 500ms 在顶部敲章（「一击入魂」横幅，easeInCubic 砸下 + 落点震动衰减 + 金色粒子 + `battle_pop_success` 音效），敲章后各明细与总计以「+2 → +4」形式揭晓翻倍值（Canvas 金色块状箭头 + easeOutBack 缩放弹出），领取时按翻倍后总金币入账。

#### 3.3.12 药水升级页面（potion 状态）

进入后显示 A-Z 字母矩阵，选中字母后点击升级：
- **字母升级**：指定字母分数 +10（加法叠加，全局，跨回合保留）。+10 仅对商店购买的药水成立；女巫奖励的「字母强化」药水 value 为 2，实际 +2
- **随机强化**：随机强化手牌中 1 个字母，不分来源统一转盘随机 1.2~3.0 带权重倍率（10% 概率 2.5~3.0，50% 概率 1.2~1.8，40% 概率 1.8~2.5），老虎机抽奖形式；SHOP_POOL 中的 value:2 与女巫奖励的 value:4 不参与转盘
- **字母置换**：将手牌中选中的一张牌替换为指定字母（游戏中直接使用，不进入本页面）
- **危险复制**：选择两个字母，70% 概率低分变高分，30% 概率相反；选中两个字母后播放约 1 秒旋转动画并揭晓结果，成功后目标字母分数永久替换为源字母分数
- **平分秋色**：选择两个字母，将当前分数相加后平分，永久修改两字母基础分
- **星辉洗涤**：选择一个字母，重置所有强化恢复基础分，并获得（当前分数 − 基础分）差值 1/3 的金币，向下取整

> **吸星大法** 不进入药水升级页，购买后暂存到道具栏，在主玩法中点击药水牌进入专属选择页，选择一张手牌后点击「确定」，将其他手牌分数临时加给它；被弃掉的牌 `absorbBonus` 立即清零。

升级后启动弹出动画（oldScore → newScore），播放升级音效。

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
| `easeInCubic` | 加速进入（退场/下滑动画） |
| `jump` | 跳跃曲线（字母跳跃） |
| `fadeIn` | 内容交错淡入（alpha + yShift） |

**快捷动画**

- `flyOut(card, direction)`：卡牌飞出（400ms，旋转+位移）；实际忽略 direction 参数，始终向左飞出
- `flyIn(card, direction)`：卡牌从侧边飞入（550ms，强力回弹）
- `scorePop(text, x, y)`：分数向上弹出并淡出（800ms）
- `buttonPress(target)`：按钮按下缩放至 0.92 后回弹
- `cardSelect(card)`：卡牌上移 8px（保持）
- `cardDeselect(card)`：卡牌回落原位

---

### 3.5 audio.js — 音效系统

使用 `wx.createInnerAudioContext()` 管理音效：

| 音效名 | 文件 | 触发时机 | 预加载 |
|--------|------|---------|--------|
| `card_placement` | music/sound_effect/card_placement.mp3 | 点击字母卡牌 | ✅ |
| `card_valid` | music/sound_effect/card_valid.mp3 | 单词校验合法 | ✅ |
| `card_shuffle` | music/sound_effect/card_shuffle.mp3 | 点击弃牌 | ✅ |
| `card_illegal` | music/sound_effect/card_illegal.mp3 | 非法单词提示 | ✅ |
| `card_jump` | music/sound_effect/card_jump.mp3 | 字母牌跳跃动画 | ✅ |
| `answer_tone` | music/sound_effect/answer_tone.mp3 | 字母跳跃触发女巫牌 | ✅ |
| `word_score` | music/sound_effect/word_score.mp3 | 计分总数弹出（含药水升级分数变化） | ✅ |
| `round_win` | music/sound_effect/round_win.mp3 | 回合结算弹窗 | ✅ |
| `game_over` | music/sound_effect/game_over.mp3 | 游戏结束弹窗 | ✅ |
| `fail` | music/sound_effect/fail.mp3 | 复刻失败等失败提示 | ✅ |
| `buy_success` | music/sound_effect/buy_success.mp3 | 购买成功弹窗 | ✅ |
| `card_sell` | music/sound_effect/card_sell.mp3 | 售出道具 | ✅ |
| `card_book_page` | music/sound_effect/card_book_page.mp3 | 图鉴翻页 | ✅ |
| `challenge` | music/sound_effect/challenge.mp3 | 点击挑战按钮 | ✅ |
| `tap` | music/sound_effect/tap.mp3 | 弹窗/按钮点击 | ✅ |
| `levelup` | music/sound_effect/levelup.mp3 | 进入下一关 | ✅ |
| `spin_wheel` | music/sound_effect/spin_wheel.mp3 | 转盘旋转（随机强化药水） | ✅ |
| `heart_beat` | music/sound_effect/heart_beat.mp3 | 危险复制心跳共振动画 | ✅ |
| `magic_twinkle` | 云存储加载 | 星辉洗涤数字晃动/女巫奖励阶段闪光 | ⚠️ 未预加载 |
| `battle_matching` | music/sound_effect/battle/battle_matching.mp3 | 对战匹配弹窗循环音效 | ✅ |
| `battle_match_sccess` | music/sound_effect/battle_match_sccess.mp3 | 对战匹配成功瞬间（键名 `sccess` 为代码实际拼写） | ⚠️ 依赖云缓存 |
| `battle_play_card` | music/sound_effect/battle_play_card.mp3 | 对战双方出牌后展示占位方块 | ⚠️ 依赖云缓存 |
| `battle_countdown` | music/sound_effect/battle_countdown.mp3 | 对战匹配成功后 3 秒倒计时 | ⚠️ 依赖云缓存 |
| `battle_pop_success` | music/sound_effect/battle/battle_pop_success.mp3 | 对战胜利结束弹窗 | ⚠️ 依赖云缓存 |
| `cloth_flap` | music/sound_effect/cloth_flap.mp3 | 对战匹配弹窗启动（含结算「重新挑战」重走匹配流程） | ⚠️ 依赖云缓存 |
| `bubble_wash` | music/sound_effect/bubble_wash.mp3 | 星辉洗涤泡沫动画阶段 | ⚠️ 依赖云缓存 |
| `bubble` | music/sound_effect/bubble.mp3 | 主页入场气泡装饰音效（连播 2 次） | ⚠️ 依赖云缓存 |
| `win_success` | music/sound_effect/win_success.mp3 | 迷之优惠刮奖刮开后的中奖音效 | ⚠️ 依赖云缓存 |
| `homepage_round_tap` | music/sound_effect/homepage_round_tap.mp3 | 主页「开始闯关/继续」按钮点击 | ✅ |
| `homepage_big_button` | music/sound_effect/homepage_big_button.mp3 | 主页两个大按钮入场弹出 | ✅ |
| `guide_type` | music/sound_effect/type_2.mp3 | 新手/商店/图鉴引导打字机循环音效（3 秒循环） | ✅ |
| `witch_guide_1_bg` | music/sound_effect/witch_guide_1_bg.mp3 | 新手引导 Phase 1 背景音乐（播放一次） | ✅ |
| `fantasy` | music/sound_effect/fantasy.mp3 | 吸星大法分数飞行（已预加载，触发点待接入） | ✅ |

**音频管理**：
- 音效通过 `wx.createInnerAudioContext()` 管理，默认音量 0.6；`guide_type` 单独使用 0.35
- BGM 支持循环播放，音量 0.3
- 预加载列表（`preloadAll`）包含 24 个音效；其他音效依赖 `cloudStorage.musicCache` 从云缓存加载
- 云存储默认映射中存在音源路径拼写差异：`challenge` 对应 `challange.mp3`，`spin_wheel` 对应 `spin_whell.mp3`，需与上传至云端的实际文件名保持一致

---

### 3.6 storage.js — 本地存储

| 键 | 内容 |
|----|------|
| `word_balatro_progress` | 游戏进度（回合、金币、女巫牌、药水、字母升级、maxJokerSlots） |
| `word_balatro_high_score` | 历史最高分 |
| `word_balatro_stats` | 统计（总局数、总分、最高关卡） |
| `word_balatro_settings` | 设置（音效、音乐、震动、学习模式开关、首次提示标志） |
| `word_balatro_card_book_unlocked` | 卡牌图鉴解锁状态（跨局永久保留） |
| `word_balatro_collected_witch_cards` | 已收集的女巫卡牌列表（跨局永久保留） |
| `word_balatro_equipped_witch_card` | 已装备的女巫卡牌（跨局永久保留） |
| `word_balatro_daily_revive` | 每日复活次数记录（日期 + 是否已使用） |
| `word_balatro_daily_challenge` | 每日挑战状态（日期 + 10 个目标词 + 已收集列表 + 奖励状态） |
| `word_balatro_word_book` | 单词本（历史打出单词及次数 + 待同步增量） |
| `word_balatro_best_round` | 历史最高到达回合 |
| `word_balatro_guide_phase` | 新手引导阶段（终身只显示一次） |
| `word_balatro_shop_guide_phase` | 商店女巫技能引导阶段（终身只显示一次） |
| `word_balatro_cardbook_guide_phase` | 卡牌图鉴引导阶段（终身只显示一次） |
| `word_balatro_joker_sort_hint_shown` | 女巫牌长按拖拽排序提示是否已展示 |
| `word_balatro_honor_trophies` | 对战荣誉杯累计胜场数（跨局永久保留） |
| `word_balatro_round_entered` | 是否已首次进入过单人玩法（主页大按钮「开始闯关」↔「继续」切换依据） |
| `word_balatro_daily_achievements_v2` | 每日成就任务进度与领取状态（日期 + 各任务记录） |

**存档云端备份（syncSaveData）**：`js/save_sync.js` 每 5 分钟将上述用户数据（`word_book` 除外，其已有 `syncWordBook` 增量同步）打包为全量快照上传到 `users` 表的 `saveData` 字段（覆盖写入，last-write-wins，云端记录 `savedAt`）。仅在启动时本地无可用存档（新设备/重装/存档过期或残缺）才从云端拉取并写回本地存储（5 秒超时兜底）；本地有可用存档时一律使用本地，不访问云端。

### 3.7 cloud_storage.js — 微信云存储

用于管理 `shop_card`、`witch`、`bg_icon`、`guide`、`rank_avatar`、`battle`、`music` 系列资源的上传、下载与运行时注入：

- **上传**：
  - `uploadShopCards()`：批量上传 `images/shop_card/` 到云存储
  - `uploadWitchImages()`：递归扫描 `images/witch/`（含子目录 `witch_card` / `witch_guide`），witch 头像上传至 `witch/`，guide 静态引导图上传至 `witch/guide/witch_guide/`
  - `uploadBgIconImages()`：上传背景图、卡牌模板、主页按钮、对战/荣誉杯图标到 `bg_icon/`
  - `uploadRankAvatarImages()`：批量上传 `images/rank_avatar/` 到云存储（全国榜默认头像）
  - `uploadBattleImages()`：批量上传 `images/battle/` 到云存储（对战模式图片）
  - `uploadMusicFiles()`：批量上传 `music/` 下所有 `.mp3` 到云存储
- **下载**：
  - `preloadShopCardImages()`：预加载页批量下载商店卡牌图片
  - `preloadBgIconImages()`：预加载页下载背景图与卡牌模板
  - `preloadGuideGroup(groupNum, renderer)`：按需下载指定 guide 组的静态引导图并注入渲染器（组 1=主引导、组 2=商店引导、组 3/4=图鉴引导）；预加载页通过它下载 witch_guide_1
  - `preloadWitchAvatarForLevel(level, renderer)`：**回合级按需下载**，当前回合进行时后台预加载下一回合的女巫头像
  - `preloadRankAvatarImages()`：点击排行榜或对战匹配时按需下载全国榜默认头像
  - `preloadBattleImages()`：点击主页「双人对战」时预加载对战模式图片
  - `preloadMusicFiles()`：预加载页完成后后台下载非预加载音效/BGM
- **注入**：`injectToRenderer()` / `injectWitchToRenderer()` / `injectBgIconToRenderer()` / `injectGuideToRenderer()` / `injectRankAvatarToRenderer()` / `injectBattleToRenderer()` / `injectRewardBuffImages()` 将云缓存资源覆盖到渲染器；`injectBgIconToRenderer()` 额外注入 `card_template` / `card_template_selected` / `card_template_upgrade` 系列卡牌模板
- **调试**：提供 `debugLogs` 数组，可在游戏中通过调试菜单查看云存储操作日志

> 注：`bg_icon/` 云存储中的卡牌模板文件名与渲染器字段名并不完全一一对应：`card_template_selected` 对应云端 `card_template_selected_new.png`，`card_template_upgrade` 对应 `card_template_upgrade9.png`，`card_template_upgrade_selected` 对应 `card_template_upgrade_selected2.png`。主页部分按钮文件名在云存储中拼写为 `hompage_*`，代码中通过字段名 `homepage*` 做映射。
> 注：音源路径在云存储默认映射中存在拼写差异，`challenge` 对应 `challange.mp3`，`spin_wheel` 对应 `spin_whell.mp3`，需确保与实际上传的云文件名一致。

---

## 4. 商店系统（Shop）

### 4.1 商品池（SHOP_POOL）

| 类型 | 数量 | 价格 | 上限 | 标识色 |
|------|------|------|------|--------|
| **女巫牌**（witch） | 21 种 | 6-14 金币 | 装备栏默认 4 格（可扩展） | 紫色 |
| **水晶球**（crystal） | 7 种 | 3-8 金币 | 购买即生效 | 蓝色 |
| **魔法药水**（potion） | 7 种 | 5-8 金币 | 道具栏 2 格（部分药水不占用槽位） | 绿色 |

每回合从各池中随机抽取 2 款，共 6 款商品。女巫牌会过滤已装备的名称避免重复，并按 `min_level`（最低出现关卡）过滤——只有当前回合 ≥ `min_level` 的女巫牌才会出现在商店中；过滤后不足 2 款时，用满足 `min_level` 的池子补充。

**女巫牌列表**：元音强化、元音为首、左右开弓、五字母连击、六字母连击、珍稀之力、容错咒文、字母之神、生命延续、勇敢试错、以小博大、双子合影、首尾呼应、首字连击、回到过去、复制魔法、消元术、预言家、混沌法球、温故知新、出牌小能手。

> 部分女巫牌设有 `min_level` 解锁门槛，例如生命延续（Lv.10）、双子合影（Lv.10）、首尾呼应（Lv.15）、回到过去（Lv.5）、复制魔法（Lv.10）、字母之神（Lv.5）、出牌小能手（Lv.3）等；低回合商店不会刷出高等级牌。`length_4`（四字母连击）当前在 `SHOP_POOL` 中已注释掉，商店暂不投放；五/六字母连击正常投放。

### 4.2 药水种类

| 名称 | 效果 | value |
|------|------|-------|
| 字母升级 | 指定字母分数 +10（加法叠加，全局跨回合保留） | 10 |
| 字母置换 | 将手牌中一张替换为指定字母 | - |
| 随机强化 | 随机强化 1 个字母，分数乘以 1.2~3.0 倍随机倍数（商店与女巫奖励相同） | 1.2~3.0 |
| 危险复制 | 选择两个字母，70% 概率低分变高分，30% 概率相反 | - |
| 平分秋色 | 选择两个字母，将当前分数相加后平分，永久修改两字母的基础分 | - |
| 吸星大法 | 游戏中选择一张手牌，将其他手牌分数临时加给它，该牌参与计分 | - |
| 星辉洗涤 | 选择一个字母，重置所有强化恢复基础分，并获得（当前分数 − 基础分）差值 1/3 的金币，向下取整 | - |

> 药水购买后需在成功弹窗选择"暂存"（放入道具栏）或"立即使用"。
> - **字母置换 / 吸星大法**：不在药水升级页使用，而是在主玩法中点击道具栏的药水牌直接使用。
> - **立即使用且不占药水槽**（药水槽满时仍可购买，但"暂存"按钮置灰）：字母升级、随机强化、危险复制、平分秋色、星辉洗涤。
> - **危险复制 / 平分秋色 / 星辉洗涤**：进入全屏选择页，选中字母后点击"开始"，播放约 1 秒旋转动画并揭晓结果；危险复制成功后低分字母分数永久替换为高分字母分数，失败则相反；平分秋色永久生效；星辉洗涤重置强化并立即发放金币。

### 4.3 水晶球种类

| 名称 | 效果 |
|------|------|
| 额外弃牌 | 下一回合弃牌次数 +1 |
| 额外出牌 | 下一回合出牌次数 +1 |
| 额外手牌 | 下一回合增加一张字母手牌 |
| 目标减免 | 下一回合目标分数 ×0.8 |
| 技能重掷 | 重掷下一回合的女巫技能 |
| 争分夺秒 | 下回合前20秒出牌不消耗次数 |
| 迷之优惠 | 购买后进入独立全屏开奖页，3 张优惠券预生成随机折扣（6~9 折），刮开并收下后本回合商店商品按该折扣计价，折扣价向下取整 |

### 4.4 购买与售出流程

```
点击价格按钮
  → 扣除金币
  → 显示购买成功弹窗
     ├── 女巫牌 → 点击"装备" → 加入 jokers[]
     ├── 水晶球 → 点击"生效" → 加入 crystalEffects[]
     │   └── 迷之优惠 → 点击"开奖"进入独立全屏开奖页，3 张优惠券中预生成 6~9 折随机折扣，选择并刮开后显示实际折扣，点击"收下优惠"后本回合商店商品按该折扣计价（折扣价向下取整），价格按钮右上角显示对应折扣雪碧图标签
     └── 药水牌 → 点击"暂存" → 加入 potions[]
                ├── 字母置换 / 吸星大法：只能在游戏中点击药水牌使用
                └── 其他药水 → 点击"立即使用" → 进入 potion 状态（或立即生效）
                    ├── 危险复制 → 全屏选择两个字母后开奖
                    ├── 平分秋色 → 全屏选择两个字母后平分
                    └── 星辉洗涤 → 全屏选择一个字母后重置并领取金币

点击已装备女巫牌 → 打开女巫详情弹窗，售出按钮位于弹窗右上角，售价 Math.round(cost/2)
  → 点击售出 → 卡牌飞出动画 → 获得金币 → 补位滑动
  （详情弹窗内另有金色「升级」按钮，见 4.5.1 女巫牌升级系统）
商店页点击已装备药水牌 → 打开药水详情弹窗（效果说明 + 底部按钮）：
  → 普通药水：「售出」（红色）+「使用」（绿色）
  → 吸星大法 / 字母置换：只能在游戏中使用，详情弹窗隐藏「使用」按钮，只保留「售出」
游戏中（playing）点击道具栏药水牌 → 直接使用（usePotionInGame），不再弹出详情弹窗
  → 本回合被 disable_potion_card 禁用的药水牌点击后仅提示 toast，无法使用
```

### 4.5 刷新

商店标题栏右侧设有**全局重掷按钮**，消耗 3 金币可刷新全部三行商品（每行重新随机生成 2 款）。余额不足时按钮置灰。

### 4.5.1 女巫牌升级系统（Witch Upgrade）

已装备的女巫牌可消耗金币逐级升级，永久提升其效果数值（跨回合保留，随存档持久化）。

**入口**：商店页点击已装备女巫牌打开详情弹窗，弹窗内有金色「升级」按钮（白色箭头，带上下轻微浮动动画）。
- 不带 `upgrate_value` / `upgrate_rate` 的女巫牌不可升级：按钮置灰（箭头不浮动），点击弹 toast「该女巫牌不支持升级」。
- 达到 `max_level` 的牌同样置灰，点击 toast「该女巫牌最高等级Lv.N」（当前仅「以小博大」设 `max_level: 5`）。

**升级弹窗（`_witchUpgradePopup`）**：
- 顶部展示所有已装备的可升级女巫牌，点击切换升级目标
- 对比视图展示 当前等级效果 → 下一级效果（`desc` 中 `value` / `min` / `max` / `rate` 占位符按等级实时替换，关键数值加粗紫色高亮）
- 升级消耗：`(当前等级 + 1) × 该牌原价` 金币；金币不足时确认按钮置灰（点击 toast「金币不足，无法升级」）
- 确认后播放 `magic_twinkle` 音效并切换到成功视图：卡牌移动放大 + 紫色光芒（`_drawLightRays`）+ 闪烁星星（`_drawSparkleStars`），卡牌到位瞬间上方爆发紫金色双点烟花（`_spawnSparkles`，粒子在弹窗最顶层绘制），确认按钮变为关闭按钮

**升级数值规则**：
- **value 方向**：`_originalValue += upgrate_value`（保留 1 位小数），并重算 `real_value`；`witch_card_value_half` 试炼回合按原始值升级后重新减半，回合结束归一化不丢失升级
- **rate 方向**（概率类卡牌，如以小博大）：`rate += upgrate_rate`（40%→45%，逐级 +5%），不改动 `real_value`
- **混沌法球**：随机区间随等级整体上移（`upgrate_value: 0.2`/级，Lv.2 区间为 0.7~1.4）
- 计分与出牌动画统一通过 `getJokerValue` 读取 `real_value`，保证升级后动画显示与实际计分一致

**存档兼容**：旧存档中的 joker 实例缺少升级相关字段，读档/购买时按名称从 `SHOP_POOL` 回填 `desc` / `upgrate_value` / `upgrate_rate` / `max_level` / `rate` / `min_value` / `max_value`（`getWitchUpgradeStep` / `getWitchUpgradeRateStep` / `getWitchMaxLevel` 同样带实例缺失时的回退查找），修复老用户升级预览文案不替换（Lv.1/Lv.2 显示相同）的问题。

### 4.6 卡牌图鉴（Card Book）

第 3 关通关后解锁，商店页面标题旁显示图鉴图标（新收集时触发闪烁动画）。点击图标进入图鉴面板：

- **收集机制**：每通关一个带女巫头像的关卡，自动收集该关卡对应的女巫卡牌（存入 `collectedWitchCards`）。已收集的卡牌显示彩色头像，未收集的显示灰色占位。
- **新收集提示**：新收集的卡牌在收集 2 秒后显示「NEW!」角标（呼吸缩放 ±4%）+ 常驻金色星星光晕（glowMult=1.2）。调试菜单提供「图鉴闪烁」按钮可手动触发。
- **分页浏览**：左右翻页按钮浏览全部关卡女巫牌（每页 4 张，2×2 布局），翻页时自动重置上一页的选中状态。
- **大图灯箱**：点击已收集卡牌打开大图灯箱——全屏黑色蒙层（alpha 0.65）+ 屏幕居中圆角大图（高约 0.42 屏高）+ 四角闪烁星星（无光晕），图片下方灰色小字「点击空白处返回」，点击任意处关闭。
- **装备功能已隐藏**：图鉴 UI 已移除「已装备」Tab、装备/卸下按钮与格子已装备标签（v1.16.0）；但历史上已装备的女巫卡牌（`equippedWitchCards`）仍持久化保留并在计分中正常生效。
- **持久化**：收集状态和装备状态均跨局永久保留（`clearProgress()` 不会清除）。

**已装备女巫卡牌（WITCH_CARDS）**

> ⚠️ v1.16.0 起图鉴的装备入口已在 UI 层隐藏（点击卡牌改为大图灯箱），以下装备机制仅对历史已装备的玩家继续生效。

图鉴中收集到的女巫卡牌可**最多同时装备 3 张**，提供跨局被动技能，同技能效果可叠加：

| 卡牌 | 女巫 | 技能名称 | 效果 |
|------|------|---------|------|
| witch_card_3 | 爱莉亚 | letter_trigger_twice_A | 打出单词包含字母 A，该字母触发 2 次计分 |
| witch_card_5 | 柏丽桑忒 | letter_trigger_twice_B | 打出单词包含字母 B，该字母触发 2 次计分 |
| witch_card_8 | 喀薇娅 | letter_trigger_twice_C | 打出单词包含字母 C，该字母触发 2 次计分 |
| witch_card_11 | 德莱薇尔 | letter_trigger_twice_D | 打出单词包含字母 D，该字母触发 2 次计分 |
| witch_card_14 | 艾莉瑟瑞丝 | letter_trigger_twice_E | 打出单词包含字母 E，该字母触发 2 次计分 |
| witch_card_16 | 菲兰瑟娅 | letter_trigger_twice_F | 打出单词包含字母 F，该字母触发 2 次计分 |
| witch_card_18 | 格莱薇妮娅 | letter_trigger_twice_G | 打出单词包含字母 G，该字母触发 2 次计分 |
| witch_card_21 | 赫丝佩瑞丝 | letter_trigger_twice_H | 打出单词包含字母 H，该字母触发 2 次计分 |
| witch_card_24 | 伊洛薇尔 | letter_trigger_twice_I | 打出单词包含字母 I，该字母触发 2 次计分 |
| witch_card_27 | 柔莉丝特 | letter_trigger_twice_J | 打出单词包含字母 J，该字母触发 2 次计分 |
| witch_card_29 | 卡莉瑟薇 | letter_trigger_twice_K | 打出单词包含字母 K，该字母触发 2 次计分 |
| witch_card_32 | 莉丝薇娜 | letter_trigger_twice_L | 打出单词包含字母 L，该字母触发 2 次计分 |
| witch_card_35 | 莫薇希娅 | letter_trigger_twice_M | 打出单词包含字母 M，该字母触发 2 次计分 |
| witch_card_38 | 妮瓦瑞丝 | letter_trigger_twice_N | 打出单词包含字母 N，该字母触发 2 次计分 |
| witch_card_41 | 奥菲妮娅 | letter_trigger_twice_O | 打出单词包含字母 O，该字母触发 2 次计分 |
| witch_card_44 | 佩洛薇拉 | letter_trigger_twice_P | 打出单词包含字母 P，该字母触发 2 次计分 |
| witch_card_47 | 奎薇莉娅 | letter_trigger_twice_Q | 打出单词包含字母 Q，该字母触发 2 次计分 |
| witch_card_50 | 拉薇希娅 | letter_trigger_twice_R | 打出单词包含字母 R，该字母触发 2 次计分 |
| witch_card_53 | 茜达尔 | letter_trigger_twice_S | 打出单词包含字母 S，该字母触发 2 次计分 |
| witch_card_56 | 翠诺莎 | letter_trigger_twice_T | 打出单词包含字母 T，该字母触发 2 次计分 |
| witch_card_59 | 安柏瑞拉 | letter_trigger_twice_U | 打出单词包含字母 U，该字母触发 2 次计分 |
| witch_card_62 | 薇尔菲拉 | letter_trigger_twice_V | 打出单词包含字母 V，该字母触发 2 次计分 |

> 装备后女巫头像显示在商店已装备栏最右侧，技能在每回合自动生效。当前版本统一为 `letter_trigger_twice_X` 系列；若多张装备且单词含多个目标字母，可叠加触发。
> 装备图鉴女巫卡牌时，会触发字母牌升级动画：对应字母牌从普通模板翻转为升级模板（带白色光晕与 `word_score` 音效），持续约 1.8 秒。

**女巫牌排序**

商店已装备栏的女巫牌支持**长按拖拽排序**：
- 长按某张女巫牌进入排序状态，卡牌放大并跟随手指移动，其他牌自动腾位置
- 松手后完成排序，保存到 `game.jokers` 数组（顺序影响出牌时女巫牌的处理优先级）
- 首次装备第 2 张女巫牌时，已装备的两张牌会一起轻微抖动 3.5 秒，提示玩家可以排序

**获得新词牌弹窗**

每回合结算后，如果玩家首次收集到本关对应的女巫卡牌（存入 `collectedWitchCards`），会先在商店页弹出「获得新词牌」弹窗：
- 展示新收集的女巫卡牌头像、名称与技能说明
- 提供「收下」按钮，点击后弹窗关闭
- 弹窗关闭后延迟 600ms 再进入女巫奖励阶段（`witch_reward`）
- 若此时卡牌图鉴引导（第 3 关商店）正在进行，等引导结束后延迟 400ms 进入女巫奖励阶段

---

## 4.5 每日挑战 / 学习模式（Daily Challenge）

**每日挑战**是一个可选的单词学习目标系统。设置弹窗现仅有 音效/重新闯关/问题反馈/版本信息 四项，「今日新词」入口已移除；开关 `settings.dailyWordChallengeEnabled` 只能在今日新词弹窗内切换（默认 false），而该弹窗当前全代码库无可达打开入口，因此学习模式暂无 UI 可开启。

> 「版本信息」为二级页：点击后按 `game_version` 查询云数据库 `version_info` 集合并展示版本说明（含加载/失败/空态，复用反馈页的返回按钮与页面切换机制；info 文本按「数字.」序号自动换行）。正式版读线上真实版本号，开发版/体验版兜底硬编码常量 `GAME_VERSION`。

### 4.5.1 机制

- **每日 1 词**：每天凌晨（北京时间）由云函数 `getDailyWords` 从数据库 `daily_words` 集合中获取当日 1 个目标单词；若无记录则自动生成兜底词库并入库
- **学习模式开关**：`settings.dailyWordChallengeEnabled`（默认关闭），首次开启时弹出「下回合起生效」提示 toast
- **种子词替换**：开启后，`drawWithSafety()` 的第二组种子词不再随机生成，而是从当日 1 个未学习的词中随机选取一个，取其字母作为种子牌注入手牌（带 `_isDailyChallengeCard` 标记）
- **已学习过滤**：每回合发牌时自动排除已收集的单词，确保目标词始终为未学习状态
- **收集判定**：玩家打出合法单词后，若该单词在当日 10 词列表中且未被收集过，则触发收集成功
- **新词主动提示**：每回合发牌或补牌后，若当前手牌字母可直接拼出某个未收集的当日目标词，前 10 秒不显示提示；10 秒后若用户仍未点击出牌，单词预览区下方会淡入显示 `[新词提示] 中文释义`

### 4.5.2 收集反馈

- **Toast 提示**：白色圆角提示，带 `images/toast_icon.png` 图标，显示「今日新词「xxx」收集成功！(N 个待收集)」，目标词与剩余数量文字加粗显示
- **入场动画**：从下往上弹出，350ms easeOutBack
- **飞行星星**：收集成功后 2 秒，从 toast 图标左侧弹出星星，停留 400ms 后沿 easeOutCubic 飞向顶部设置图标，尺寸从 1 缩小至 0.6
- **全部集齐**：10 词全部收集后，`_showDailyChallengeReward()` 以 toast 提示「恭喜！今日10个新词全部收集完成！」并直接发放 50 金币，无弹窗

### 4.5.3 集齐奖励

10 词全部收集后不再弹出奖励弹窗（旧版集齐奖励弹窗已移除）：`_showDailyChallengeReward()` 直接发放 50 金币，并以 toast 提示「恭喜！今日10个新词全部收集完成！」。无弹窗、无分享/确定按钮。

### 4.5.4 今日新词弹窗

该弹窗（`_dailyWordsPopup`）当前无可达入口（设置弹窗已无「今日新词」按钮）：
- **标题**：「学习模式」，开关旁文案「每日10个新词，随机添加到每回合游戏中」，底部 slogan「每日10个新词，积累从现在开始！」
- **Switch 开关**：控制学习模式开关（实时保存到 settings）
- **单词卡片列表**：可惯性滚动，支持边界阻尼回弹（rubber band + easeOutBack）
- **单词状态**：已收集显示绿色勾选 + 金色星星，未收集显示灰色锁定
- **返回按钮**：左上角返回按钮回到设置弹窗；关闭按钮同时关闭两层弹窗
- **全部完成分享**：10 词全部收集后，今日新词弹窗底部文案右侧显示分享图标，点击可截图分享至微信
- **首次提示**：首次打开 switch 时，在开关上方弹出带小箭头指向 switch 的 toast

### 4.5.5 持久化

| 键 | 内容 |
|----|------|
| `word_balatro_daily_challenge` | `{ date, words, collected, rewarded }` |
| `word_balatro_settings.dailyWordChallengeEnabled` | 开关状态 |
| `word_balatro_settings.dailyWordHintShown` | 首次提示是否已展示 |

---

## 4.6 每日金词（Golden Word）

**每日金词**是每日一次的推理玩法：金词字母必然藏在每一手牌中，玩家通过多次出牌的"命中数反馈"逐步缩小范围，最终锁定答案。

### 4.6.1 机制

- **入口**：主页第 3 个小按钮（原「每日成就」入口位置，key `golden`，图片 `hompage_golden.png`，未加载时 canvas 兜底绘制「金词」文字按钮）；今日挑战未完成时按钮右上角显示红点。点击后先弹**入口弹窗**（`_goldenEntryPopup`，叠加在主页上）：本月点亮日历 + 今日金词词长 + [开始挑战] 按钮（今日已结束则显示 [查看结果]），点挑战按钮才翻页进入金词页
- **金词来源**：复用云函数 `getDailyWords`（每日 1 词），与每日挑战共用当日词但进度独立
- **状态**：`game.state = 'daily_gold'`；手牌独立存放于 `game.goldenHand` / `game.goldenSelected`（不污染单人手牌与存档）；进入前单人页面状态存 `_preGoldenSoloState`，主页「闯关/对战」入口负责恢复
- **发牌**：初始及每次出牌后整手重发 12 张（4 列 × 3 行），`drawWithSafety(deck, 12, 1, 0, 3, 6, [], goldenWord)` 的 dailyWord 分支保证金词全部字母在手牌中，另含一个 3 字母保底词
- **尝试次数**：每日 10 次；只要点了出牌就算一次猜测——非法单词（本地词库 + 百度 API 校验）同样记入已猜并消耗 1 次，预览区上方红色提示「『x』不是有效单词」，历史面板中标记为红色「无效」
- **命中反馈**：按位置判定——出牌与金词同位置字母相同即揭示该位置，金词占位卡逐格翻开显示该字母（揭示跨出牌累积）；预览区上方提示「命中 N 个位置」（N 为本次新揭示数量），展示 3 秒
- **占位卡模板**：复用对战图片 `battle_me_place`（未揭示占位）/ `battle_me_word_bg`（已揭示字母格），未加载时回退 canvas 绘制
- **猜中**：占位卡逐格翻开（180ms 间隔 + `card_jump` 音效），点亮当月日历，当日不可重复挑战
- **失败**：10 次用完当日失败，答案不公布，次日直接开始新挑战
- **分享**：猜中后结果面板提供「分享战绩」（`wx.shareAppMessage` 文字分享 + 当前画面截图）

### 4.6.2 页面结构（`js/render/golden.js`）

- `drawGoldenEntryPopup`：主页入口弹窗（本月日历 + 今日词长 + 挑战按钮）
- `drawGoldenHUD`：顶部栏（词长 / 剩余次数 / 已猜）
- `drawGoldenPlaying`：词长张问号占位卡（原道具栏位置）+ 拼词预览/命中反馈 + 手牌网格 + 底部 [出牌] [历史] [清空]
- `_drawGoldenMonthCalendar`：本月点亮日历（入口弹窗与历史面板共用）
- `drawGoldenHistoryPopup`：「本月点亮」日历小格 + 本次挑战出牌记录（单词 · 命中数）
- `drawGoldenResultPopup`：猜中（金词/音标/释义/分享/返回主页）或失败（明日再来提示）

### 4.6.3 持久化

| 键 | 内容 |
|----|------|
| `word_balatro_golden_word` | `{ date, word, meaning, phonetic, attemptsLeft, guesses: [{word, hits}], positions: [bool...], won, finished, revealed, shared }` |
| `word_balatro_golden_word_calendar` | `{ '2026-08': [5, 12, ...] }` 每月猜中日期 |

---

## 4.7 单词本（Word Book）

记录玩家历史打出的所有合法单词及每个单词的打出次数，数据本地持久化并在回合结算时增量同步到云数据库。

### 4.7.1 机制

- **本地记录**：每次打出合法单词后，立即写入本地 `word_balatro_word_book`
  - `words`：去重单词表 `{ word: count }`
  - `pending`：自上次成功同步到云端的增量 `{ word: count }`
  - `lastSyncAt`：上次成功同步时间戳
- **云端同步**：每回合弹出结算弹窗时，调用 `syncWordBook` 云函数，仅上传 `pending` 增量
- **控制数据量**：
  - 不上传完整词表，只传本局/本回合新增/变化的单词
  - 云端使用 `$inc` 原子累加，避免读-改-写竞争
  - 同步成功后清空本地 `pending`

### 4.7.2 单词本弹窗

单词本现从主页「学习」按钮打开（设置弹窗已无「单词本」入口）：

- 顶部显示累计去重单词总数
- 列表默认按打出次数降序排列；「单词」「次数」表头可点击切换排序字段与升降序
- 每行显示：单词（大写）+ 次数标签
- 支持上下拖动滚动、惯性滚动与边界回弹
- 从单词本返回时回到设置弹窗

### 4.7.3 好友排行榜

好友排行榜新增 **「单词量」** 列，展示每位好友历史打出的去重单词数量。该数值通过 `wx.setUserCloudStorage` 的 `wordCount` 字段上传，与 `score`、`bestround` 独立比较更新。

### 4.7.4 持久化

| 键 | 内容 |
|----|------|
| `word_balatro_word_book` | `{ words: { word: count }, pending: { word: count }, lastSyncAt }` |
| 云端 `user_word_books` | `{ _openid, words: { word: count }, totalUnique, totalCount, create_time, update_time }` |

---

## 4.8 主页系统（Homepage）

预加载完成后进入主页，作为所有功能的统一入口：

```
┌─────────────────────────────┐
│      女巫的词牌              │
│                             │
│  [开始闯关]  [双人对战]      │  ← 两个大按钮
│                             │
│ [设置] [排行] [每日] [学习]  │  ← 四个小按钮
└─────────────────────────────┘
```

**主按钮**
- **开始闯关 / 继续**：点击后从主页翻页过渡到单人玩法（`state = 'playing'`）。首次进入游戏前大按钮显示「开始闯关」；玩家首次点击进入后通过 `storage.saveRoundEntered()` 记录 `_roundEntered`（存储键 `word_balatro_round_entered`），此后大按钮永久显示「继续」（云图 `homepageRoundContinue`）。
- **双人对战**：点击后同样翻页过渡，并后台预加载对战云图片，随后进入匹配弹窗。**解锁条件**：当前回合数 ≥ 5 才开放；未解锁时按钮显示锁定图 `homepageBattleLocked`（云存储 `bg_icon/homepage_battle_locked.png`），点击不进入对战页面，在两个大按钮上方 12*s 处弹出 toast「闯关5回合后,即可解锁」（复用通用 hintToast 样式，`customY` 按 battle 按钮实际位置计算）。

**小按钮**
- **设置**：在当前页面弹出设置弹窗。
- **排行**：在当前页面弹出好友/全国排行榜弹窗。
- **每日**：打开每日成就弹窗；有已完成未领取奖励时按钮右上角显示红点。
- **学习**：打开单词本弹窗（原「今日新词」入口也位于设置弹窗内）。

**返回主页**：游戏中点击左上角 `top_icon`（短按）可回到主页；对战状态下由对战自己的 `top_home` 处理返回逻辑。

**入场动画**：主页展示时播放星星飞入、按钮依次弹出的入场动画，详见 `js/render/homepage_entry.js`。

---

## 4.9 每日成就系统（Daily Achievements）

每日成就模块位于 `js/daily_achievements.js`，为玩家提供每日可重复完成的任务目标。

### 任务列表

| 任务 | 图标 | 目标 | 奖励金币 | 进度触发点 |
|------|------|------|---------|-----------|
| 连续闯关 10 回合 | 🔥 | 10 | 30 | 每回合结算时递增；游戏结束/新游戏时清零 |
| 使用 5 张魔法药水牌 | 🧪 | 5 | 10 | 使用药水时（待接入完整触发） |
| 分享给好友 | 🔗 | 1 | 10 | 分享成功时（待接入完整触发） |
| 完成 3 局双人对战 | ⚔️ | 3 | 15 | 对战结束弹窗弹出时 |
| 赢得 1 局对战模式 | 🏆 | 1 | 10 | 对战结束且玩家总分 > Bot 总分时 |

> 注：药水使用和分享任务当前已在任务列表中定义，游戏内具体触发点将在后续版本中统一补齐。

### 本地存储与过期清理

| 键 | 内容 |
|----|------|
| `word_balatro_daily_achievements_v2` | `{ records: { index: { name, completed, completedDate, claimed, progress } }, savedAt }` |

- 加载时仅保留 `completedDate` 为当天的记录，非当天记录自动清理。
- 所有记录均过期时会删除整份存储。
- 奖励领取后立即保存，避免重复领取。

### 弹窗交互

- 点击主页「每日」按钮打开成就弹窗（`game._dailyAchievementPopup`）。
- 弹窗内任务列表支持上下拖动滚动、惯性滚动与边界回弹。
- 已完成未领取的任务显示礼盒图标，点击后播放领取动画并发放金币。
- 已领取任务显示「已领取」标签。

---

## 5. 游戏状态机

```
[homepage] ──开始闯关──→ [playing]
    │                      │
    └── 双人对战 ─────────→ [battle]（对战模式，独立状态机）
                           │
    ←──────────────────────┘（对战结束回到主页）

[playing] ──score≥target──→ [settlement] ──claim──→ [shop]（进入商店后延迟 600ms、
    │                                                     图鉴引导后 400ms 切入
    │                                                     [witch_reward]，领取后回 [shop]）
    │←──────────────────nextRound()───────────────────────────────┘
    │                                                              │
    │←──按 game._prePotionState 恢复── [potion] ←── buy/use potion ──┘
    │       (商店进入回 shop；出牌页道具栏使用回 playing)
    │
    │←──收下优惠── [mystery_discount] ←── 购买迷之优惠 ────────────┘
    │
    ├── 点击 top_icon ──→ [homepage]
    │
    ├── [battle]（对战模式，独立状态机）
    │
    └── out_of_hands ──→ [life_extended] ──领取──→ [shop]  （如有生命延续女巫牌）
    │
    └── out_of_hands / surrender ──→ [gameover] ──restart()──→ [playing]
    │                                      │
    │                                      └── 分享复活 ──→ [playing]（每日限1次）
```

### 5.0.1 游戏结束弹窗（gameover）

达到游戏结束条件（出牌耗尽、非法单词导致失败、主动投降）后弹出：

```
┌──────────────────────────────────────┐
│         🧙‍♀️ fail_witch.png            │  ← 小女巫趴在弹窗顶部，底部重叠，带投影
│          游 戏 结 束                  │
│         ◇─────── 分割线 ───────◇     │  ← 金色实线 + 中间小菱形
│  到达回合          第 N 关            │
│  最高回合          第 N 关            │  ← getBestRound，从本地存档读取
│  单词总量          N                  │  ← getWordBookUniqueCount
│  ─────────────────────────────────   │
│  还差一点，再多收集几张词牌吧！        │
│  [复活]  [重新开始]  [排行榜]         │  ← 三按钮横排（图片按钮）
└──────────────────────────────────────┘
```

**弹窗装饰细节**：
- 顶部 `fail_witch.png` 小女巫图，底部重叠约 25px，带投影阴影
- 女巫左右及右上方点缀圆角五角星装饰（紫色 + 金色错落分布）
- 女巫右上角 4 道交错紫色竖线（失落符号）
- 标题分割线采用 `_drawTitleDivider` 通用方法：金色实线 + 中间旋转 45° 小菱形
- 弹窗蒙层透明度 0.75，关闭动画统一为向上滑动 40px + 淡出 200ms

**按钮布局**：复活（左）、重新开始（中）、排行榜（右），等分三列，5px 间距。

---

### 5.0.2 对战模式（Battle Mode）

对战模式是独立于主玩法的状态机，文件位于 `js/battle/`：

```
js/battle/
├── index.js     # 模块入口，导出 BattleManager / BattleRenderer / BattleBot 等
├── manager.js   # 对战状态机与核心逻辑（出牌、计分、揭晓、回合推进、联网同步）
├── renderer.js  # 对战画面渲染（匹配弹窗、手牌、揭晓动画、结束弹窗）
├── input.js     # 对战触摸输入处理
├── bot.js       # 对战机器人行为
└── deck.js      # 对战专用牌堆生成
```

对战模式支持两种子模式：
- **本地人机 / 在线随机匹配**：走匹配弹窗流程。`BattleBot` 类（`js/battle/bot.js`）当前从未被实例化，对手行为由 `manager.js` 内部实现（`_initBotStrategy` / `_pendingBotChoice`，从 3 个种子词中随机选一个作为 Bot 出牌）。
- **好友对战**：房主创建房间 → 分享房间号 → 好友加入 → 双方准备 → 同步开局，10 回合后支持重新挑战。

**进入/退出对战与单人进度恢复**

进入对战前 `startBattle` 会把单人页面状态存入 `game._preBattleSoloState`；`exitBattle` 退出时按该状态恢复 shop / settlement（其余情况回 playing）。配合 `SOLO_RESUMABLE_STATES = ['playing', 'settlement', 'shop']`，保证主页「继续闯关」能回到进入对战前的单人页面，而不是强制回到出牌页。

#### 本地人机对战流程

```
[开始对战] → 匹配弹窗（matching → matched → countdown → disappearing）
                ↓
        每回合：selecting → player_played → revealing → round_end
                ↓
        10 回合后 → battle_end（对战结束弹窗）
```

1. **进入对战**：主页点击「双人对战」→ 选择「在线对战」→ `battleManager.startBattle('easy')`。
2. **匹配弹窗**：弹出 `battle_match.png` 底图，显示「对手匹配中」， swords 图标伴随金色呼吸光圈；音效 `battle_matching` 延迟 200ms 启动，呼吸频率与该循环音效时长同步。
3. **匹配成功**：随机生成对手（昵称与头像索引绑定），进入 matched 阶段展示对手信息；1.5 秒后进入 countdown 3 秒倒计时；最后 disappearing 淡出并正式进入对战。
   - **对手头像来源**：取自 `rank_avatar` 云图集，共 4 张 5×5 精灵图（每张 200×200，单头像 40×40），按索引 `idx` 计算所在图集、行、列。为去除单头像四周留白，绘制时居中裁剪 20% 直径的边距（四周各 10%，取中间 32×32 区域），再拉伸铺满圆形显示区域。
4. **对战回合**：
   - 每局共 **10 回合**（`DEFAULT_TOTAL_ROUNDS = 10`）。
   - 每回合生成 **3 个种子词**：1 个 3 字母 + 2 个 4 字母，合并所需字母作为初始手牌，再从对战牌堆补至 **12 张**后洗牌。
   - Bot 从 3 个种子词中随机选择一个作为本回合出牌。
5. **Bot 策略**：
   - **70% fast 模式**：Bot 在 **6~10 秒**内自行出牌。
   - **30% wait_player 模式**：等玩家出牌后再等待 **2~4 秒**出牌；玩家一直不出则最多等 30 秒。
6. **玩家出牌**：
   - 选中 ≥2 张卡牌，点击「出牌」。
   - 校验顺序：长度检查 → 本地/在线词库校验（支持 `isValidWordOnline`）。`_battlePlayedWords` 仅初始化、未做 add/has 检查，本局出牌去重当前未实现。
   - 非法/重复提示不自动消失，需重新选择。
   - 玩家出牌后若 Bot 未出，启动 **15 秒倒计时**，超时判该方 0 分。
7. **揭晓动画（revealing）**：双方均出牌后进入揭晓阶段，展示双方单词、中文释义、得分，进度条从旧比例滑动到新比例，总分在动画结束后累加。
8. **回合结束**：揭晓动画完成后进入下一回合，10 回合后进入 `battle_end`。

#### 好友对战流程

```
主页「双人对战」→ 选择「好友对战」
    │
    ├── 房主：创建房间 → 分享房间号 → 等待好友加入 → 检测到好友已准备 → 同步 3 秒倒计时 → 开始对战
    │
    └── 好友：通过分享链接进入 → 自动加入房间 → 点击「开始对战」准备 → 等待房主启动 → 同步 3 秒倒计时 → 开始对战

对局中：
每回合：selecting → player_played → revealing → round_end（房主推进下一回合）
        ↓
10 回合后 → battle_end → 可发起/接受重新挑战
```

**状态字段**

| 字段 | 说明 |
|------|------|
| `_battleOnline` | 是否为联网好友对战 |
| `_battleRoomId` | 房间号（6 位字母数字） |
| `_battleIsHost` | 当前玩家是否为房主 |
| `_battleOpponentOpenId` | 对手 openid |
| `_friendBattleStarted` | 本轮好友对战是否已正式开始 |
| `_friendBattleCountdown` | 同步倒计时状态 |
| `_battleModeSelectPopup` | 对战模式/房间/准备/重开弹窗状态 |
| `_battleNextRoundPressed` | 好友是否已点击「下一回合」（等待房主推进） |

**弹窗状态（`_battleModeSelectPopup.mode`）**

| 模式 | 场景 | 交互 |
|------|------|------|
| `select` | 初始选择好友对战 / 在线对战 | 点击对应按钮进入 |
| `friend_loading` | 创建房间中 | 显示 loading |
| `friend_room` | 房主创建成功 | 显示房间号 + 分享按钮 |
| `friend_waiting` | 房主等待好友加入 | 显示房间号 + 等待动画 |
| `friend_join_ready` | 好友加入后未准备 | 显示「开始对战」按钮 |
| `friend_join_wait` | 好友已准备，等待房主开始 | 显示 loading |
| `friend_countdown` | 双方同步 3 秒倒计时 | 显示倒计时数字 |
| `friend_restart_inviting` | 对战结束，自己发起重新挑战 | 显示「正在邀请」 |
| `friend_restart_invited` | 对战结束，收到对方重新挑战邀请 | 显示「接受」/「取消」 |

**云函数交互**

| 云函数 | 调用方 | 职责 |
|--------|--------|------|
| `battleRoom` | 房主 | 创建房间，生成 6 位房间号；同时生成第一回合统一种子词和手牌 |
| `battleJoin` | 好友 | 加入房间，返回角色（host/guest） |
| `battleReady` | 好友 | 点击「开始对战」后标记准备，返回统一起点时间 `guestReadyAt` |
| `battleStart` | 房主 | 倒计时结束后将房间状态改为 `playing`；第一回合手牌复用 `battleRoom` 预生成的数据（无预生成数据时才现场生成） |
| `battleGet` | 双方 | 每 800 毫秒轮询房间状态（串行请求，避免重叠响应导致状态回退） |
| `battlePlay` | 双方 | 玩家出牌后同步单词/卡牌/得分到云端（失败自动重试，最终失败回滚并允许重新出牌） |
| `battleNextRound` | 房主 | 揭晓动画结束后生成下一回合统一种子词和手牌 |
| `battleRequestRestart` | 任意一方 | 对战结束后发起重新挑战邀请 |
| `battleAcceptRestart` | 另一方 | 接受重新挑战邀请，房间重置为 ready |
| `battleClose` | 退出方 | 一方主动退出或关闭房间时调用 |
| `getBattleOpponent` | 双方 | 加载对手真实头像、昵称、累计荣誉杯 |

**关键机制**

- **统一手牌**：`battleRoom`（第一回合）与 `battleNextRound`（后续回合）在云端生成 `seedWords` 与 `hand`，双方通过轮询获取同一份数据，保证每回合手牌完全一致。第一回合手牌在创建房间时即生成，房主创建后与好友加入后都会立即用它做背景预览，因此好友从分享链接进入对战页时看到的字母牌区域就与房主一致，不必等到正式开始；`battleStart` 直接复用该预生成数据（重新挑战时 `battleAcceptRestart` 会清掉旧数据，下一局重新生成）。
- **回合推进**：只有房主可以调用 `battleNextRound`；好友点击「下一回合」后仅设置 `_battleNextRoundPressed = true`，等待房主推进并同步。揭晓动画期间若收到下一回合的房间状态，会先把房间缓存起来，等本地 reveal 动画完成、总分累加后再同步新回合，避免"看不到对手出牌"和分数丢失。
- **状态同步**：`battleGet` 采用串行轮询（上一请求返回后才发下一次），并把轮询间隔降到 800ms，降低因请求重叠或响应乱序导致的状态回退。`_applyRoomState` 会丢弃 `cloudRound` 小于本地的过期响应，并在揭晓动画期间把新回合房间状态缓存到 `_battlePendingRoom`，等动画完成后再同步。
- **防卡死**：揭晓动画结束后进入 `round_end`，房主调用 `battleNextRound` 推进；若超过 1500ms 仍未离开 `round_end`，房主/好友会先主动拉取一次房间状态，云端已推进则直接同步，未推进且是房主则重试 `battleNextRound`。`battleNextRound` 已做幂等处理并带 6 秒客户端超时兜底：客户端携带 `currentRound`，服务端仅在 `room.currentRound === currentRound` 时推进，已推进则直接返回当前房间；若 iOS 上云函数回调完全丢失，6 秒后会自动按失败重试，避免一直卡住。
- **超时处理**：好友对战已接入本地 15 秒出牌倒计时。一方出牌或超时后，另一方需在 15 秒内出牌，否则本地自动提交 0 分空牌到云端（`battlePlay` 带 `isTimeout: true`）；同时增加 30 秒兜底超时，若双方开局后 30 秒都未出牌，本地玩家自动超时，避免双人挂机导致对局卡住。超时方在揭晓动画中先展示 `+0`，面板会显示「对手已超时」/「已超时」状态。
- **房间关闭**：一方主动退出（点击左上角返回主页）调用 `battleClose`，另一方轮询到 `status === 'closed'` 后弹出「房间已结束」提示。对战结束弹窗点击「回到首页」同样会调用 `battleClose`。
- **重新挑战**：对战结束弹窗点击「重新挑战」→ 调用 `battleRequestRestart`；对方收到 `friend_restart_invited` 弹窗，点击接受后双方回到准备状态，房间 `currentRound` 重置为 1，重走倒计时与 `battleStart`。
- **局号（gameId）跨局防护**：`battleStart` 每次开局把房间 `gameId + 1`（第一局为 1，重开为 2……），客户端在 `startBattleFromRoom` 记录本地局号 `_battleGameId`。对局轮询 `_applyRoomState` 丢弃 `gameId` 不符的响应；lobby 状态机 `applyFriendRoomState` 发现本局已开局则跳过 `playing` 重复触发；`battlePlay` 云端校验上报 `gameId` 不符拒绝写入。重开邀请流程中的迟到响应、残留轮询链因此无处可写，从机制上杜绝跨局状态污染。同时 lobby 轮询（`_friendRoomPollTimer`）与对局轮询（`_battleRoomPollTimer` + 代数计数）使用相互独立的定时器，旧轮询链在重开/退出时自动死亡。若本地完全错过重开流程仍停在 `battle_end`，轮询到新局 `playing` 响应时会自动切回 lobby 流程追上新局。

#### 对战计分规则

与单人模式一致：

```
基础分 = Σ 每张卡牌 score
倍率  = 卡牌数量（单词长度）
回合得分 = ceil(基础分 × 倍率)
```

对战模式无女巫牌、药水、水晶球等 Roguelike 元素，牌堆使用简化分布（`js/battle/deck.js` 中独立 `LETTER_DISTRIBUTION`）。

#### 对战荣誉杯系统（Honor Trophy）

对战模式引入**荣誉杯**作为跨局累计的胜利凭证：

- **获取**：每赢得一局对战荣誉杯 +1。对战结束弹窗弹出时，若 `battlePlayerScore > battleBotScore`，调用 `battleManager.awardHonorTrophy()`。
- **本地存储**：`StorageManager.addHonorTrophy()` 累加并写入本地键 `word_balatro_honor_trophies`（跨局永久保留）；`game.honorTrophies` 在游戏初始化时由 `getHonorTrophies()` 读入。
- **云端同步**：`awardHonorTrophy()` 调用云函数 `updateHonorTrophy`，上传本地累计总数到云数据库 `user_honor_trophy` 集合。云端取 `max(已有, 上传值)` 合并，保证幂等——重试或重复调用不会重复计数或回退。
- **展示位置**（半透明白色圆角蒙层 + `battle_hornor_trophy.png` 图标 + 金棕色数字）：
  - **VS 模块**（对战页顶部 `_drawTrophyBadge`）：左对手、右"我"各显示荣誉杯徽章。我方为真实值，对手本地人机时为虚拟值（我方 +2~10，整局缓存，缓存在 `game._battleOpponent.trophies`）；好友对战时显示对手真实荣誉杯。
  - **匹配弹窗 / 倒计时阶段**：展示对手荣誉杯数。
  - **对战结束弹窗**：胜利时在激励文案上方显示荣誉杯图标 + `荣誉杯+1`（金棕 `#8B6914`）+ 左右 `score_line` 装饰线。
- **图标资源**：`images/battle_hornor_trophy.png`，由 `Renderer`（`base.js`）与对战渲染器各自加载为 `battleHonorTrophyIcon`。

#### 对战结束弹窗

10 回合结束后弹出结束面板（`panelH = 270*s`）：

```
┌─────────────────────────────────────┐
│  [battle_pop_success.png 胜利标题图]   │
│  对手名+分数   VS   我+分数            │  ← _drawSimpleVSModule 简化 VS 模块
│  ── 荣誉杯+1 ──（胜利时，金棕色）       │  ← 左右 score_line 装饰线
│                                     │
│  [分享] [重新挑战] [回到主页]          │  ← 底部图片按钮
└─────────────────────────────────────┘
```

- **VS 模块**：结束弹窗使用 `_drawSimpleVSModule` 简化模块——无头像无进度条，仅左侧对手名+分数（`#3b5998`）、中间 VS、右侧"我"+分数（`#993e2d`）；带双方头像边框（对手 `COLORS.blueHeader`、玩家 `#c0392b`）与总分进度条的完整 VS 模块位于对战页顶部。
- **结果标题与文案**：
  - 胜利：标题为 `battle_pop_success.png` 图片，直接显示「荣誉杯+1」（金棕 `#8B6914`）+ 左右 `score_line` 装饰线
  - 失败：`很遗憾,你未能击败对手,再接再厉!`（红色 `#f87171`）
  - 平局：`旗鼓相当,不分胜负!`（金色）
- **底部按钮**：
  - 胜利时显示 3 个按钮：分享战绩、重新挑战、回到主页。
  - 失败/平局只显示：重新挑战、回到主页。
  - 按钮使用云存储图片 `battle_pop_share.png`、`battle_pop_restart.png`、`battle_pop_backto_homepage.png`，未加载时兜底为圆形文字按钮。
- 点击「分享战绩」拉起 `wx.shareAppMessage`，标题为 `我在单词对战中以 X:Y 获胜!`。
- 点击「重新挑战」：
  - 本地人机：重走匹配弹窗流程（`startMatchAnim()`）。
  - 好友对战：发起重新挑战邀请，对方接受后房间重置并重新开局。
- 点击「回到主页」调用 `game.returnToHomepage()` 退出对战；好友对战还会调用 `battleClose` 关闭房间。

#### 对战模式 top_home 交互

对战界面左上角 `top_home` 图标：
- **短按**：返回主页（`returnToHomepage`）；好友对战会先调用 `battleClose` 关闭房间。
- **长按 600ms**：打开调试面板，与主玩法长按 top_icon 逻辑一致。
  - ⚠️ 该调试入口仅在**开发版/体验版**开放，正式版本（`envVersion === 'release'`）长按不会触发。
- 按下时图标下压 2*s。

#### 对战模式音效

| 音效名 | 文件 | 触发时机 |
|--------|------|---------|
| `battle_matching` | `music/sound_effect/battle/battle_matching.mp3` | 匹配弹窗弹出后循环播放，匹配成功/弹窗消失时停止 |
| `battle_match_sccess` | `music/sound_effect/battle_match_sccess.mp3`（`sound_effect/` 根下，播放名拼写如此） | 匹配成功瞬间 |
| `battle_play_card` | `music/sound_effect/battle_play_card.mp3`（`sound_effect/` 根下） | 玩家或 Bot 出牌后展示占位方块时 |
| `battle_countdown` | `music/sound_effect/battle_countdown.mp3`（`sound_effect/` 根下） | 好友对战同步 3 秒倒计时阶段 |
| `battle_pop_success` | `music/sound_effect/battle/battle_pop_success.mp3` | 对战胜利结束弹窗 |

#### 对战相关云存储资源

`cloud_storage.js` 中为对战模式预置以下资源映射：

- `battle_match.png` / `battle_match_sword.png`：匹配弹窗底图与剑图标
- `battle_me_place.png` / `battle_me_word_bg.png` / `battle_rival_place.png` / `battle_rival_word_bg.png`：对战双方单词展示背景
- `battle_pop_share.png` / `battle_pop_restart.png` / `battle_pop_backto_homepage.png`：对战结束弹窗按钮
- `battle_pop_success.png` / `battle_pop_fail.png`：对战结束胜利/失败标题图
- `battle_room_share.png`：好友对战房间分享按钮
- `music/sound_effect/battle/battle_matching.mp3`：匹配循环音效

---

## 5.1 新手引导（witch_guide）

首次进入游戏的玩家会在第 1 回合触发新手引导，共 **2 个内容 Phase + 退场 + 赠卡弹窗**：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 玩法说明：点击字母牌拼单词得分 | 先聚光灯高亮字母卡牌区域（evenodd 挖空 + 金色呼吸边框）；随后 witch_1 静态图从屏幕左侧缓慢飞入（1200ms easeOutCubic）并持续上下漂浮（骑扫把感，x 到位后固定）；最后对话框从屏幕右侧飞入（位于女巫右侧，不重叠、不在女巫下方）+ 逐字显示 |
| 2 | 赠送卡牌预告：介绍女巫牌作用 | witch_1 静态图 + 逐字显示（赠卡改由引导结束后的「获得女巫牌」弹窗统一呈现） |
| 5 | 退场动画：女巫+对话框弹出屏幕 | 黑色蒙层**不消失**，进入赠卡弹窗 |
| 5（退场后） | 「获得女巫牌」弹窗 | 蒙层保留，屏幕中央弹出：标题「获得女巫牌」（金色装饰线）+ `has_vowel` 卡牌（等比缩放 + 圆角裁剪 + 金色光晕）+ 卡牌名称/介绍（金色半透明蒙层）+「领取」按钮（水波纹）；样式与女巫奖励弹窗一致，弹出时播放 `magic_twinkle` 音效。点击「领取」后播放退出动画（弹窗上滑 40px + 淡出 200ms，蒙层同步淡出），完成后引导全部结束（`guidePhase = 6`） |

**布局**：女巫位于左侧、字母卡牌区域上方（底部悬浮于卡牌区顶部）；对话框位于女巫右侧，垂直方向与女巫居中，宽度占满剩余屏幕，高度按文案行数动态计算。女巫图片两侧有紫/金五角星装饰（`_drawWitchSideStars`，移植自游戏结束弹窗小女巫装饰，三套引导共用，跟随女巫移动/漂浮）。

**入场时序（Phase 1）**：
```
0~800ms     → 全亮无 UI（只显示游戏画面）
800~1600ms  → 渐变变暗（黑色蒙层 alpha 0→0.75，FADE_START=800 / FADE_DURATION=800）
1600ms      → 聚光灯开始高亮字母卡牌区域（evenodd 挖空 + 金色呼吸边框），卡牌区 600ms 逐渐亮起（遮罩 0.75→0 褪去，边框同步淡入）
2200ms      → 女巫从左侧缓慢飞入（1200ms easeOutCubic，全程上下漂浮 ±6*s）
3400ms      → 女巫到位，稍作停顿（100ms）
3500ms      → 对话框从右侧飞入（500ms easeOutCubic）
4500ms      → 文字开始逐字显示（每 65ms 一个字）
```

**持久化**：引导完成状态（`guidePhase ≥ 5`，领取赠卡后为 6）通过 `storage.saveGuidePhase()` **独立存储**，即使游戏结束 `clearProgress()` 也不会清除。同一位玩家终身只显示一次引导。存档恢复时若停在 Phase 5（赠卡弹窗未领取），会直接重建弹窗状态（跳过退场动画）。

**预加载**：预加载页仅下载新手引导 witch_guide_1 静态图（判断 `savedProgress.guidePhase < 5` 或存档不存在，主引导两个阶段共用此图）。witch_guide_2（商店引导）与 witch_guide_3（图鉴引导）均为**回合级按需下载**，不占用预加载流量。

> 引导图片自 v1.14.0 起由 4 组精灵图（帧动画）简化为 3 张静态图，位于 `images/witch/witch_guide/`（云存储 `witch/guide/witch_guide/`）：`witch_guide_1.png`（主引导两个阶段共用）、`witch_guide_2.png`（商店引导）、`witch_guide_3.png`（图鉴引导）。

预加载页底部显示一只走路小女巫（`small_witch_sprite.png`，21 帧精灵图，50ms/帧，witchScale=0.53），位置随进度条同步前进，保持原始像素比例。

### 5.1.1 商店女巫技能引导（witch_guide_2）

第 2 回合进入商店时触发，终身只显示一次。共 **2 个 Phase**：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 聚光灯挖空聚焦下一回合女巫技能模块，只画聚光灯蒙层+呼吸边框（不画女巫），1.5 秒后自动进入 Phase 2 | 聚光灯蒙层 + 呼吸边框 |
| 2 | 解释女巫技能的作用与影响 | witch_2 静态图从屏幕左侧缓慢飞入（1200ms easeOutCubic）并持续上下漂浮（骑扫把感，同主引导）；到位后对话框从屏幕右侧飞入（500ms）+ 逐字显示 |
| 3 | 退场动画 | 女巫+对话框淡出，恢复正常商店交互 |

**布局**：与主引导一致——女巫（130*s 宽）在左、对话框在右并排不重叠，整体位于底部高亮区域（下一回合女巫技能模块）上方；对话框高度按文案行数动态计算。

**持久化**：`shopGuidePhase` 独立存储，游戏结束不清除。

### 5.1.2 卡牌图鉴引导（witch_guide_3）

第 3 关解锁卡牌图鉴后，首次进入商店时触发，终身只显示一次。采用**聚光灯 + 女巫对话框**形式：

| Phase | 内容 | 动画 |
|-------|------|------|
| 1 | 高亮图鉴图标，女巫介绍图鉴功能 | 聚光灯显示后 witch_3 静态图（130*s，位于图鉴图标下方）从屏幕左侧缓慢飞入（1200ms easeOutCubic）并持续上下漂浮（骑扫把感，同主引导）；到位后对话框从屏幕右侧飞入（500ms，与女巫齐平并排，高度按文案行数动态计算）+ 逐字显示 |
| 2 | 解释收集与装备女巫卡牌的作用 | witch_3 静态图 + 逐字显示 |
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
  _scoreScale: undefined, // 药水升级时的脉冲缩放（由 renderer 消费）
  absorbBonus: 0         // 吸星大法临时加上的分数（弃牌后清零）
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
  value: 10, cost: 5, desc: "指定一张字母牌，分数 +10" }
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

### 7.1 百度翻译词典版 API

- **用途**：在线单词合法性校验 + 获取中文释义/词性/音标
- **Endpoint**：`https://aip.baidubce.com/rpc/2.0/mt/texttrans-with-dict/v1`
- **认证方式**：OAuth2（`access_token`）
- **缓存**：成功结果存入 `onlineWordCache` 和 `wordMeaningCache`

**调用链路**
```
前端 → 云函数 baiduDict → 换取 access_token
前端 → 直连百度接口（带 token）→ 返回翻译/词典结果
前端 → 云函数 getDailyWords → 返回今日 1 个目标单词
前端 → 云函数 updateBestRound → 更新好友排行榜 bestround
前端 → 云函数 syncWordBook → 同步历史打出单词到云数据库
前端 → 云函数 updateHonorTrophy → 同步对战荣誉杯累计数到云数据库
前端 → 云函数 login → 上报用户设备信息（users 表以 _id = OPENID 保证唯一；同 _openid 重复记录会保留最早一条并自动清理）
前端 → 云函数 syncSaveData → 存档定时全量备份到 users 表 saveData / 本地无存档时从云端恢复
```

**Token 管理**
- 密钥（API Key / Secret Key）存放在云函数 `cloudfunctions/baiduDict/` 中，前端不可见
- `access_token` 通过云函数获取后本地缓存 7 天（`wx.setStorageSync`）
- token 失效时（HTTP 401 / error_code 110/111）自动清除缓存并重试一次

**请求参数**
```json
{ "from": "en", "to": "zh", "q": "hello" }
```

**响应内容**
```json
{
  "result": {
    "trans_result": [{
      "src": "hello",
      "dst": "你好",
      "dict": "英 [həˈləʊ]  int. 喂；你好..."
    }]
  }
}
```

> 注：该接口同时覆盖原 dictionaryapi.dev + MyMemory 的功能，既校验单词合法性，又返回中文释义，无需再维护两套外部 API。

### 7.1.1 好友对战云函数

好友对战依赖微信云开发数据库 `rooms` 集合与以下云函数：

| 云函数 | 调用方 | 输入 | 输出 | 说明 |
|--------|--------|------|------|------|
| `battleRoom` | 房主 | — | `{ code, roomId, _id, room }` | 创建 6 位房间号，status=`waiting`；同时生成第一回合统一种子词和手牌（双方可在开局前预览） |
| `battleJoin` | 好友 | `{ roomId }` | `{ code, role, room }` | 加入房间，role=`host`/`guest`；房间满或已开始则失败 |
| `battleReady` | 好友 | `{ roomId }` | `{ code, room }` | 好友标记准备，记录 `guestReadyAt` 作为同步倒计时起点 |
| `battleStart` | 房主 | `{ roomId }` | `{ code, room }` | 将房间状态改为 `playing`；第一回合种子词/手牌复用 `battleRoom` 预生成的数据（无预生成数据时才现场生成）；每次开局 `gameId + 1`，作为跨局响应的身份标识 |
| `battleGet` | 双方 | `{ roomId }` | `{ code, room }` | 获取房间完整状态，供前端 800ms 串行轮询 |
| `battlePlay` | 双方 | `{ roomId, word, cards, score, isTimeout, gameId }` | `{ code, room }` | 玩家出牌后写入 `hostPlay` 或 `guestPlay`；`isTimeout=true` 时允许空 word/cards，表示本地 15 秒倒计时超时提交 0 分；`gameId` 与房间当前局号不符时拒绝写入（防上一局迟到请求跨局覆盖） |
| `battleNextRound` | 房主 | `{ roomId, currentRound }` | `{ code, room }` | 清空双方出牌，生成下一回合统一种子词和手牌；带 `currentRound` 幂等校验，防止 iOS 云函数回调丢失时重复推进 |
| `battleRequestRestart` | 任意一方 | `{ roomId }` | `{ code, room }` | 在对战结束后写入 `restartRequest` 邀请 |
| `battleAcceptRestart` | 另一方 | `{ roomId }` | `{ code, room }` | 接受重新挑战，重置房间状态为 `ready`，`currentRound=1` |
| `battleClose` | 退出方 | `{ roomId }` | `{ code }` | 将房间状态改为 `closed`，另一方轮询到后结束对战 |
| `getBattleOpponent` | 双方 | `{ opponentOpenId }` | `{ code, opponent }` | 从 `user_honor_trophy` / `user_profiles` 读取对手昵称、头像、荣誉杯 |

**房间状态流转**

```
waiting（房主创建） → ready（好友加入） → playing（房主开始） → closed（一方退出）
                          ↑_________________________________|
                                    （重新挑战 accepted 后回到 ready）
```

**数据字段（rooms 集合）**

```js
{
  roomId: 'A1B2C3',
  host: '房主 OPENID',
  guest: '好友 OPENID',
  hostReady: true,
  guestReady: true,
  status: 'playing',
  currentRound: 1,
  totalRounds: 10,
  seedWords: [{ word, meaning }, ...],
  hand: [{ letter, baseScore, score, isFace, id, selected }],
  hostPlay: { openid, word, cards, score, round, isTimeout, time },
  guestPlay: { openid, word, cards, score, round, isTimeout, time },
  restartRequest: { fromOpenId, accepted, acceptedAt },
  createTime: Date.now(),
  updateTime: Date.now()
}
```

### 7.2 启动隐私与头像昵称授权

游戏启动后（预加载页阶段）会主动触发一次授权流程，用于后续排行榜和对战中展示玩家头像昵称。

**流程**

1. **检查是否已授权**：调用 `wx.getSetting` 检查 `scope.userInfo` 授权状态；已授权则直接跳过。
2. **隐私保护提示**：若当前基础库支持 `wx.getPrivacySetting` 且需要隐私授权，先调用 `wx.requirePrivacyAuthorize` 触发微信自带隐私保护提示。
3. **展示头像昵称授权弹窗**：隐私授权同意后（或不需要隐私授权时），从屏幕底部滑出 Canvas 授权面板。
   - 面板标题「授权头像昵称」，说明授权后可在排行榜和对战中展示头像。
   - 原生 `wx.createUserInfoButton` 延迟 350ms 显示，与 Canvas 弹窗滑入动画同步，避免视觉割裂。
4. **用户点击授权按钮**：
   - 立即销毁原生按钮。
   - Canvas 面板执行向下退出动画（easeInCubic + 淡出）。
   - 动画结束后应用结果：同意则缓存 `userInfo` 并应用到对战头像；拒绝则提示可在排行榜中再次授权。

**状态字段**

| 字段 | 说明 |
|------|------|
| `game._showingProfileAuthButton` | 授权弹窗是否展示中，含 `startTime` |
| `game._closingProfileAuth` | 是否正在关闭 |
| `game._closeProfileAuthStartTime` | 关闭动画开始时间 |
| `game._profileAuthResult` | 授权结果（success / userInfo） |
| `game._profileAuthCompleted` | 本次启动流程是否已完成 |

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
| `wx.getOpenDataContext()` | 获取开放数据域（好友排行榜） |
| `wx.setUserCloudStorage()` | 上传历史最高分到微信云端 |
| `wx.shareAppMessage()` | 分享消息（复活分享） |

---

## 7.4 排行榜系统（好友榜 + 全国榜）

排行榜弹窗通过顶部 Tab 切换「好友榜」与「全国榜」，共用同一面板容器。

### 7.4.1 好友排行榜

采用 **微信开放数据域（Open Data Context）+ OffScreenCanvas** 架构：

**架构设计**
- **开放数据域** `openDataContext/index.js`：独立 JS 运行环境，通过 `wx.getFriendCloudStorage()` 拉取好友数据，在 `sharedCanvas` 上绘制排行榜 UI
- **主域** `game.js`：负责设置 `sharedCanvas` 的物理像素宽高（解决 ScreenCanvas 文字模糊问题），每帧通过 `ctx.drawImage(odc.canvas)` 将排行榜渲染到主画布
- **分数、回合与单词量上传**：游戏结束时调用 `uploadScoreAndRound()`，按以下规则写入微信云端：
  - 若当前到达回合 > 云端 bestround：同时更新 `score` 和 `bestround`
  - 若回合未创新高但总分 > 云端 score：仅更新 `score`
  - 若当前去重单词量 > 云端 wordCount：更新 `wordCount`
  - 都不高时不更新，避免覆盖云端更高记录

**排行榜弹窗 UI**
- 深色圆角面板（`#2a2a3a` 边框 `#4a4a6a`）
- 表头：排名、头像、昵称、**回合**、**单词量**、总分
- 当前玩家高亮显示（蓝色背景条）
- 头像通过 `wx.createImage()` 异步加载并缓存

**交互**：游戏结束弹窗点击「排行榜」按钮 → `showRankList()` → 开放域 postMessage `action: 'show'` → 主域每帧 `drawImage` 渲染。点击排行榜任意位置 → `hideRankList()` → 恢复游戏结束弹窗。

**配置**：`game.json` 需添加 `"openDataContext": "openDataContext"`。

### 7.4.2 全国排行榜

全国榜由主域直接绘制，数据来自微信云函数 `getGlobalRank`。

**架构设计**
- **数据获取**：`js/game.js` 中的 `fetchGlobalRank()` 调用云函数 `getGlobalRank`，返回 `topList`（前 N 名）与 `self`（玩家自己排名）数据
- **授权**：首次进入全国榜时检查 `scope.userInfo` 授权；未授权则通过 `wx.createUserInfoButton` 展示原生授权按钮，用户同意后调用 `updateUserProfile` 云函数上传头像昵称
- **数据上传**：与好友榜共用 `uploadScoreAndRound()`，在 `gameover` 时将 `score`、`bestround`、`wordCount` 写入微信云端，作为全国榜排序依据

**排行榜弹窗 UI**
- 与好友榜共用面板与 Tab 切换栏，顶部标题「全国榜」
- 表头：排名、头像、昵称、回合、单词量、总分
- 当前玩家高亮显示（蓝色背景条）
- **默认头像**：未授权或云端无头像的用户，使用 `rank_avatar` 云图集中的默认头像（4 张 5×5 精灵图，单头像 40×40）。绘制时居中裁剪 20% 直径的边距（四周各 10%，取中间 32×32 区域），再拉伸铺满圆形显示区，去除单头像四周留白。
- 支持上下拖动滚动、惯性滚动与边界回弹
- 若未授权或加载失败，面板中央显示对应提示与重试/授权按钮

**交互**：设置弹窗点击「排行榜」→ 默认打开好友榜 Tab → 点击「全国榜」Tab 切换；切换时隐藏开放域好友榜，由主域绘制全国榜内容。点击面板外部或关闭按钮退出排行榜。

---

## 7.5 分享复活机制

游戏结束时提供**分享复活**机会：

**流程**
1. 玩家点击「复活」按钮（`relive_button.png`）
2. 拉起 `wx.shareAppMessage({ title: '我正在收集女巫词牌，快来帮我过这关！', query: 'from=revive&round=...' })`
3. 玩家进入分享界面
4. `wx.onShow` 检测切回前台后的停留时间 ≥ 2500ms，判定分享成功
5. 执行 `game.revive()`：恢复 1 次出牌机会（`handsLeft = 1`），状态切回 `playing`
6. 若停留时间不足，提示「分享后才可以复活哦~」

**限制**
- **每日限 1 次**：通过 `word_balatro_daily_revive` 本地存储记录（日期 + used 状态）
- 当日已使用后，复活按钮显示为 `relive_limit_button.png`（置灰/限制状态）

**复活效果**
- 恢复 1 次出牌机会
- 清空 gameover 相关状态（`_closingGameOver`、`_restartBtnPressed` 等）
- 自动存档（含复活标记）

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
- **request 合法域名**：添加 `https://aip.baidubce.com`
- **云函数**：确保已创建并部署 `cloudfunctions/baiduDict/`

> 若不配置，在线单词检测和翻译会失效，仅本地词库可用。

---

## 9. 调试功能

**长按**游戏左上角图标（`top_icon.png`）**600ms** 可打开/关闭调试菜单：
- 重置出牌次数
- 当前分+1000
- 💰 增加100金币
- 跳转至X回合
- ✅ 直接通关
- 刷新商店
- 5张女巫牌
- 上传shop_card
- 上传witch
- 上传bg_icon
- 上传music
- ⚔️ 对战模式（进入对战）
- 对战-成功（直接跳转对战结束弹窗，玩家获胜）
- 对战-失败（直接跳转对战结束弹窗，玩家失败）
- 触发新人引导
- 触发商店引导
- 触发图鉴引导
- 👻 结束游戏
- 图鉴闪烁（手动触发图鉴图标收集动画）
- 今日新词完成（强制标记当日 10 词全部学习完成）

> 调试功能仅在开发阶段使用，上线前应移除或隐藏入口。
> 其中对战模式 `top_home` 长按入口仅在非正式版本（开发版/体验版）生效，正式版（`release`）不开放。

---

## 10. 已知限制与优化方向

### 当前限制

1. **在线词库依赖**：网络不佳时生僻词可能误判为非法
2. **中文释义有限**：仅本地高频词有中文释义，其余需在线查询
3. **iPhone 刘海适配**：已通过 `safeTop` 做了基础适配，极端机型可能需要微调

### 后续优化方向

| 优先级 | 功能 |
|--------|------|
| P1 | 动画系统持续完善（更多粒子效果、过渡动画） |
| ~~P1~~ | ~~音效资源补充与 BGM~~ ✅ 已完成（音效云存储管理 + BGM 循环播放） |
| ~~P2~~ | ~~分享功能（`wx.shareAppMessage`）~~ ✅ 已完成（分享复活） |
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
| v1.7.1 | 2026-06-01 | witch_guide_3 改为精灵图；预加载页不再下载 witch_guide_3/4；上传逻辑跳过精灵图目录下的旧帧图 |
| v1.7.2 | 2026-06-01 | witch_guide_1/2/3 统一改为精灵图（1/2/3 各 14 帧 4×4 拼接，4 为 20 帧 4×5）；预加载页改用 `preloadGuideGroup`；cloud_storage 统一 spritesheet 下载/注入管道；修复 guide 缓存检测的 `.frames` 遗留引用 |
| v1.8.0 | 2026-06-02 | 接入微信小游戏好友排行榜（开放数据域 + OffScreenCanvas）；游戏结束弹窗全面改造（三按钮横排、历史最高、fail_witch 装饰）；新增分享复活机制（每日限1次）；预加载页女巫走路动画改为 21 帧精灵图；图鉴图标新增收集闪烁动画；新增 `_drawTitleDivider` 通用分割线方法 |
| v1.8.1 | 2026-06-03 | 音效系统完善（新增 challenge、buy_success 等音效触发点）；音乐云存储管理（music 上传/预加载/本地缓存）；修复弹窗关闭时内容与背景不同步淡出（所有弹窗内容统一乘 `closeAlpha`，`drawCard` 改为 `globalAlpha *= opacity`） |
| v1.8.2 | 2026-06-03 | 药水升级动画分数变化时播放 `word_score` 音效；商店金币购买按钮和重掷按钮点击区域扩大 2px；售出卡牌后空位占位图片添加果冻弹出动画；商店下一回合标题颜色统一为 `#8b6914` |
| v1.9.0 | 2026-06-03 | Renderer 模块化重构：6600+ 行 `js/renderer.js` 拆分为 `js/render/` 目录下的 11 个聚焦模块（base/effects/animation/hud/playing/popup/guide/cardbook/debug/gameover/index）；入口 `js/renderer.js` 改为薄层 `require('./render/index')`；新增 `js/render/test.js` 自测脚本 |
| v1.9.1 | 2026-06-05 | 移除全球排行榜与主页系统，保留好友排行榜及设置弹窗 UI 改进；`global_ranking` 分支独立保留完整排行榜功能 |
| v1.9.2 | 2026-06-05 | 新增菲兰瑟娅/格莱薇妮娅两张图鉴女巫卡牌；目标分数分段系数下调（6~50关系数各降10）；修复随机强化药水实际倍率未生效的bug；排行榜/设置/图鉴关闭按钮添加按压反馈；反馈键盘体验优化；调试面板增加版本限制；商店目标分数图标替换为图片 |
| v1.9.3 | 2026-06-08 | 新增女巫奖励"商店5折"（第24关）；新增赫丝佩瑞丝/伊洛薇尔两张图鉴女巫卡牌；菲兰瑟娅技能阈值修正为30%/6折；修复排行榜点击面板内部误关闭问题；女巫技能奖励表格与代码实际对齐；魔法药水种类修正为3种 |
| v1.9.4 | 2026-06-08 | 图鉴女巫卡牌装备上限从1张提升至3张，同技能效果叠加；装备交互支持多选/卸下；UI增加已装备计数和满3提示 |
| v1.9.5 | 2026-06-10 | 重做种子词机制：固定双种子词（3字母+4字母），新增元音种类/次数双重限制；种子词不消耗牌堆；随机补牌仅允许辅音且不与种子词字母重复；种子牌在手牌中随机打散 |
| v1.9.6 | 2026-06-10 | 新增每日挑战学习模式：每日10个目标单词，开启后第二组种子词替换为每日新词字母，打出目标词收集成功；集齐10词奖励50金币；设置弹窗新增今日新词入口与可滚动单词列表；好友排行榜增加「回合」列；游戏结束按规则上传 score/bestround；新增 getDailyWords/updateBestRound 云函数 |
| v1.9.7 | 2026-06-11 | 目标分数系数全面下调：2~5关20、6~10关25、11~20关30、21~30关35、31~40关40、41~50关45、51+关50；同步更新 README 目标分数表；预览区左侧新增 help 按钮，点击后弹出求助选择弹窗，支持 2 金币购买提示或分享后免费获得提示，提示以金色水波纹高亮种子词卡牌；求助弹窗绘制对齐设置弹窗规范（`overlayAlpha` 0.55、`enterOffset` 20、`closeOffset` 30），修复副标题 `ctx.restore()` 遗漏导致的 `globalAlpha`/`fillStyle` 状态泄漏问题，调用位置移至 `render()` 通用部分末尾确保蒙层覆盖所有内容 |
| v1.9.8 | 2026-06-13 | 修复提示水波纹金色色块爆发并调整参数；回合基础金币改为 3；商店价格与资源更新（女巫牌 6~14 金币、水晶球 3~4 金币、药水 5~6 金币）；手牌选择上限改为当前手牌上限（`_maxHandSize \|\| baseHandSize`）；help 按钮常驻显示；预览字体根据单词长度自适应；新增 `letter_trigger_twice` 图鉴装备卡计分与跳跃动画；呼吸蒙层速度从 500ms 加快到 400ms；已购买道具栏竖分割线改为亮金棕色；5 张女巫牌时间距最小值从 1*s 调整为 0.6*s；card_bar 云路径更新为 v7 |
| v1.9.9 | 2026-06-14 | 目标分数基准从 150 提升至 250，后续分段系数上调（11~20:33、21~30:43、31~40:55、41~50+:70），同步更新 README 目标分数表；新增女巫技能 `disable_potion_card`（本回合禁用所有魔法药水牌）；图鉴女巫牌关卡调整（女巫_K 30→29、女巫_L 33→32）；新增图鉴女巫卡牌 `witch_card_29` 卡莉瑟薇、`witch_card_32` 莉丝薇娜；`witch_card_27` 名称从薇尔莉特改为柔莉丝特；使用求助后预览区下方显示种子词中文释义；今日新词弹窗 10 词集齐后新增截图分享按钮 |
| v1.10.0 | 2026-06-15 | 新增女巫技能 `disable_two_witch_card`（回合开始时随机禁用 2 张女巫牌）；`_disableWitchAnim` 改为使用 `jokerIndices` 数组以支持多张禁用动画 |
| v1.10.1 | 2026-06-15 | 新增单词本系统：记录历史打出单词及次数，本地 `word_balatro_word_book` 持久化，回合结算时通过 `syncWordBook` 云函数增量同步到 `user_word_books`；设置弹窗新增「单词本」入口与可滚动弹窗；好友排行榜新增「单词量」列，通过 `wordCount` 字段上传 |
| v1.10.2 | 2026-06-16 | 新增女巫牌「左右开弓」「混沌法球」；女巫牌按 `min_level` 解锁并在商店中动态过滤；已装备女巫牌支持长按拖拽排序，装备第 2 张时播放提示抖动；结算后新增「获得新词牌」弹窗，关闭后延迟 1 秒进入女巫奖励；女巫奖励蒙层调暗；补牌机制统一为 `drawWithSeedSafety`（保留手牌生成种子词保底 + 元音规则兜底）；同步更新 README |
| v1.10.3 | 2026-06-16 | `witch_card_value_half` 约束只对 `whole_word` 作用域的女巫牌生效；引导结束后女巫奖励弹窗延迟从 1s 调整为 600ms；卡牌模板迁移到 `images/bg_icon/` 并强制从云存储加载注入；调整卡牌样式并补充图鉴女巫卡牌 P~V；商店女巫牌 `min_level` 调整（生命延续 12→10、双子合影 20→10、回到过去 10→5、复制魔法 15→10）；女巫奖励药水「暂存」按钮在道具栏已满时置灰禁用；装备图鉴女巫卡牌时新增字母牌升级翻转动画与音效 |
| v1.10.4 | 2026-06-17 | 回合结算基础金币由 3 下调至 2；生命延续按钮发放结算金币的基数同步由 3 下调至 2 |
| v1.10.5 | 2026-06-17 | 基础目标分系数上调：2~5 关 25、6~10 关 30、11~20 关 36、31~40 关 51、41~50 关 60；同步更新 README 目标分数表 |
| v1.10.6 | 2026-06-17 | 临时调整女巫奖励触发范围：女巫约束仍按原关卡生效，但女巫奖励阶段（`witch_reward`）仅在第 3 关触发，第 5 关及以后通关后不再进入奖励阶段；同步更新 README |
| v1.10.7 | 2026-06-17 | 再次上调基础目标分系数：2~5 关 30、6~10 关 35、11~20 关 37、21~30 关 40、31~40 关 44、41~50 关 50、51+ 关 60；同步更新 README 目标分数表 |
| v1.10.8 | 2026-06-17 | 新增 `js/report.js` 统一封装埋点上报，开发者工具环境下自动跳过不上报；新增 `rank_avatar` 全国榜默认头像云存储支持（上传、第一回合按需下载、注入渲染器）；抽离云存储文件 ID 前缀为 `CLOUD_BASE` 变量；同步更新 README |
| v1.10.9 | 2026-06-17 | 适配 HUAWEI Pura X 等折叠屏/矮屏设备：scale 在高度不足时自动压低（最低 0.75），`extraHeight` 允许负值以压缩布局间距；`playing` / `shop` / `life_extended` 页面内容整体下移 10px，底部按钮上移 5px，商店挑战按钮放大；同步更新 README |
| v1.11.0 | 2026-06-22 | 新增女巫牌「出牌小能手」：回合结算时出牌次数用光则基础金币 +2；新增魔法药水「危险复制」：选择两个字母，60% 概率低分变高分，40% 概率相反；新增水晶球「迷之优惠」：购买后进入独立全屏开奖页，开奖后本回合商店商品随机打折；同步更新 README |
| v1.11.1 | 2026-06-23 | 迷之优惠折扣从固定 8 折调整为随机 6~9 折，折扣价向下取整，价格按钮右上角使用雪碧图标签显示实际折扣；同步修正 README 中女巫牌数量、价格范围、危险复制概率、状态机与存储键等描述 |
| v1.12.0 | 2026-06-24 | 新增 3 张魔法药水牌：吸星大法（临时吸收其他手牌分数）、平分秋色（两字母分数相加后平分并永久生效）、星辉洗涤（重置强化恢复基础分并获得金币）；同步更新 README 药水种类、购买流程与版本历史 |
| v1.12.1 | 2026-06-25 | 修正 README 中药水名称与代码一致（复刻水 → 危险复制）；补充全国排行榜系统文档；好友榜 sharedCanvas 绘制坐标与主域 content 区域对齐 |
| v1.12.2 | 2026-06-28 | 对战模式结束弹窗重构：胜利/失败分别展示 VS 模块、激励文案和底部图片按钮（分享/重新挑战/回到主页）；对战模式 top_home 长按打开调试面板，新增「对战-成功」「对战-失败」调试按钮；匹配成功/对战即将开始阶段主副标题整体下移 2*s；对战匹配音效与光圈呼吸延迟 200ms 启动并保持频率同步；补充对战模式完整文档 |
| v1.12.3 | 2026-06-29 | 恢复对战匹配弹窗；新增启动时隐私授权后头像昵称授权弹窗，支持向下消失动画与按钮延迟显示同步；优化每日成就样式与 toast；同步补充 README 中主页系统、每日成就系统、启动授权文档 |
| v1.12.4 | 2026-06-29 | 对战模式 `top_home` 长按调试入口仅在非正式版本（开发版/体验版）开放，正式版本（`release`）禁用；同步更新 README |
| v1.12.5 | 2026-06-29 | 修复每日成就首次领取奖励的 hintToast 不在弹窗内显示的问题：主页状态也绘制 hintToast，并定位到每日成就弹窗内部偏上位置 |
| v1.12.6 | 2026-06-30 | 新增对战荣誉杯系统：胜利 +1，本地存储 `honor_trophies` + 云函数 `updateHonorTrophy`（云端取 max 幂等合并），对战页 VS 模块/匹配弹窗/结算弹窗展示荣誉杯徽章（白色蒙层+图标+金棕色数字）；主页大按钮首次进入游戏后永久显示「继续」（`_roundEntered` / `word_balatro_round_entered`）；对战「重新挑战」改为重走匹配弹窗流程（`startMatchAnim`）；Bot 出牌时间 4~8s 调整为 6~10s；每日成就任务表调整顺序与文案（连续闯关、完成 3 局双人对战等）；星辉洗涤新增卡牌弹出 popup 阶段与 `bubble_wash` 音效；修复迷之优惠按折后价判定可购买、平分秋色支持降分、字母置换用真实当前分等；同步更新 README（荣誉杯系统、存储键、云函数、音效表、五/六字母连击倍率 +2/+4、主页继续按钮、每日成就表） |
| v1.12.7 | 2026-07-02 | 女巫奖励全局 buff 图标改为云存储懒加载，修复高回合/存档恢复时 buff 图片未生效与重复注入日志问题；商店 5 折时价格按钮右上角改用本地 `discount.png`；对战结束分享战绩截取屏幕中间 50% 区域作为分享图；商店女巫试炼 UI 统一：礼物图标、文案、按钮尺寸与水波纹样式调整；修复领取女巫奖励后延迟标记未清理导致卡在商店页的问题；修复结算领取后无新词牌时误判为新词牌阶段导致卡住的问题；同步更新 README |
| v1.12.8 | 2026-07-09 | 好友对战特性更新：新增 `battleRoom`/`battleJoin`/`battleStart`/`battleReady`/`battleGet`/`battlePlay`/`battleNextRound`/`battleRequestRestart`/`battleAcceptRestart`/`battleClose`/`getBattleOpponent` 云函数；实现创建房间、分享房间号、好友加入、准备同步、云端统一手牌、出牌同步、回合推进、重新挑战、房间关闭等完整流程；对战模式选择弹窗支持好友对战/在线对战双入口；修复好友对战重开邀请对方未弹窗、一方退出后另一方未提示、轮次不同步等问题；同步更新 README（好友对战流程、云函数、目录结构） |
| v1.12.9 | 2026-07-09 | 修复字母升级/随机升级音效在动画期间重复播放的问题：只在分数切换阶段播放一次 `word_score` |
| v1.13.0 | 2026-07-14 | 好友对战状态同步加固：轮询间隔降至 800ms 并改为串行轮询避免请求重叠；出牌同步/回合推进增加失败重试；揭晓动画期间收到下一回合状态则延迟同步，防止中断 reveal 导致看不到对手出牌和分数未累加；对战结束弹窗「回到首页」正确调用 `battleClose` 关闭房间；同步更新 README |
| v1.13.1 | 2026-07-14 | 修复好友对战计分动画后偶现页面卡住：修复 `_applyRoomState` 中 `effectiveRound` 引用错误；丢弃乱序到达的过期房间响应；增加 round_end 3 秒卡住自动恢复（房主重试推进/好友主动拉取）；防止房主并发调用 `battleNextRound` |
| v1.13.2 | 2026-07-14 | 好友对战卡顿问题进一步加固：修复弹窗 closing 后仍阻塞 `checkReveal` 的问题；给 `gameLoop` 对战状态更新和 `nextRound` 增加异常捕获，防止异常中断渲染循环；增加更详细的对战日志前缀 `[Battle]`，便于复现时通过调试面板定位卡住阶段 |
| v1.13.3 | 2026-07-16 | 修复 iOS 好友对战计分动画后屏幕卡住：为房主的 `battleNextRound` 调用锁增加 5 秒超时，并在 round_end 3 秒恢复逻辑中重置调用锁，避免 iOS 上云函数回调丢失导致重试被跳过、对局无法推进；同步更新 README |
| v1.13.4 | 2026-07-16 | 好友对战新增 15 秒出牌倒计时：一方出牌/超时后，另一方需在 15 秒内出牌，超时自动提交 0 分；增加 30 秒双方未出牌兜底超时，避免双人挂机对局卡住；对战面板显示「对手已超时」/「已超时」状态；云函数 `battlePlay` 支持 `isTimeout` 字段；同步更新 README |
| v1.13.5 | 2026-07-16 | 再次修复 iOS 好友对战计分动画后屏幕卡住：`battleNextRound` 增加 `currentRound` 幂等校验与 6 秒客户端超时兜底；round_end 卡住恢复改为先拉取房间状态再决定同步或重试；增加 revealing done 后 3 秒未离开、player_played 10 秒未进入 revealing 的兜底恢复；客户端收到「对局已结束」时直接进入 `battle_end`；揭晓动画中超时方先展示 +0；同步更新 README |
| v1.13.6 | 2026-07-16 | 好友对战卡住问题增加手动逃生与诊断：round_end / revealing done 后显示「同步下一回合/刷新房间状态」手动按钮；关键路径（checkReveal、battleNextRound 成功/失败/超时、房间状态同步）增加 `console.log`，便于在微信开发者工具真机调试中直接查看；同步更新 README |
| v1.13.7 | 2026-07-17 | 好友对战第一回合手牌生成时机提前到创建房间（`battleRoom`）：好友从分享链接进入对战页时，字母牌区域立即与房主一致，不再等正式开始才同步；`battleStart` 复用预生成数据（旧房间无数据时兜底现场生成）；`battleAcceptRestart` 重开时清空旧手牌以便新一局重新生成；房主创建房间后同样立即展示统一手牌预览；同步更新 README |
| v1.13.8 | 2026-07-17 | 根治重开后出牌状态不同步：引入局号 `gameId`（`battleStart` 每次开局 +1），对局轮询丢弃跨局响应、lobby 状态机跳过本局 `playing` 重复触发、`battlePlay` 云端拒绝跨局写入；lobby 轮询改用独立定时器字段 `_friendRoomPollTimer`（原与对局轮询共用字段导致重开时清错定时器、lobby 轮询存活进对局并重置出牌状态，为问题根因）；对局轮询链加代数计数自动死亡；本地错过重开流程时自动切回 lobby 追上新局；同步更新 README |
| v1.13.9 | 2026-07-21 | 危险复制概率由 60%/40% 调整为 70%/30%（低分变高分概率提升，同步修正选择页副标题残留的过时的 80% 文案）；修复游戏中从道具栏使用的药水（危险复制/星辉洗涤/平分秋色等）点击返回错回商店、吸星大法返回误弹「卡槽已满」的问题，现按来源返回游戏进行页且药水放回原槽位；购买成功弹窗卡牌背后新增金色呼吸光晕（`_drawCardGlow` 增加 `options.halo/sparkles` 分层开关），优化卡牌左右闪烁星星在手机上的显示（去旋转 + 细腰星形 + 中心亮点，不再糊成正方形） |
| v1.14.0 | 2026-08-03 | 三套新手引导图片由 4 组精灵图（witch_guide_1~4 帧动画）简化为 3 张静态图：`witch_guide_1.png`（主引导 Phase 1）、`witch_guide_2.png`（主引导 Phase 2~5）、`witch_guide_3.png`（商店引导与图鉴引导共用），存放于 `images/witch/witch_guide/`，云路径 `witch/guide/witch_guide/`；`guide.js` 绘制、`cloud_storage.js` 默认映射/下载/注入逻辑、`base.js` 占位结构同步简化；删除旧精灵图目录与 `scripts/build-spritesheet.js`；同步更新 README |
| v1.14.1 | 2026-08-03 | 新手引导流程重构：内容阶段由 4 段精简为 2 段（字母牌教学 → 赠送 has_vowel 女巫牌）后直接进入退场；Phase 1 改为女巫从屏幕左侧缓慢飞入（1200ms easeOutCubic）并持续上下漂浮（骑扫把感，x 到位固定、y 悬浮于字母卡牌区上方）；女巫到位后聚光灯高亮字母卡牌区域（evenodd 挖空 + 金色呼吸边框）；对话框改为从屏幕右侧飞入，位于女巫右侧不重叠，宽度占满剩余屏幕、高度按文案行数动态计算；赠卡弹入位置改为高亮卡牌区中心；同步更新 README |
| v1.14.2 | 2026-08-03 | 三套引导图片对应关系最终确定：`witch_guide_1`=主引导（两个阶段共用）、`witch_guide_2`=商店引导、`witch_guide_3`=图鉴引导；预加载页只下载 guide 组 1，商店/图鉴引导图按回合按需下载；同步更新 README |
| v1.14.3 | 2026-08-03 | 新手引导 Phase 1 入场顺序调整：渐暗完成后先聚光灯高亮字母卡牌区域（单独停留 600ms），再让女巫从左侧飞入，最后对话框从右侧飞入；同步更新 README |
| v1.14.4 | 2026-08-03 | 新手引导完成后新增「获得女巫牌」弹窗：女巫与对话框退场后黑色蒙层不再淡出，屏幕中央弹出标题+has_vowel 卡牌+名称/介绍+「领取」按钮（样式复用女巫奖励弹窗：金色装饰线标题、卡牌等比缩放+圆角裁剪+金色光晕、水波纹领取按钮）；点击领取后引导全部完成（guidePhase=6）；存档恢复时若停在 Phase 5 直接重建弹窗；同步更新 README |
| v1.14.5 | 2026-08-03 | 移除新手引导 Phase 2 的 has_vowel 卡牌弹入动画（与引导结束后的「获得女巫牌」弹窗重复），清理 `_guideCardGiftStartTime` 相关状态；同步更新 README |
| v1.14.6 | 2026-08-03 | 「获得女巫牌」弹窗弹出时播放 `magic_twinkle` 音效（与女巫奖励弹窗一致） |
| v1.14.7 | 2026-08-03 | 新手引导字母牌区域高亮改为 600ms 逐渐亮起（卡牌区遮罩 0.75→0 褪去、金色边框同步淡入），不再瞬间变亮；「获得女巫牌」弹窗领取按钮点击不再播放音效 |
| v1.14.8 | 2026-08-03 | 商店引导布局调整：女巫与对话框改为左右并排（女巫在左、对话框在右不重叠），女巫图片由 180*s 缩小至 130*s，整体下移至底部高亮区域（下一回合女巫技能模块）上方；对话框高度按文案行数动态计算；同步更新 README |
| v1.14.9 | 2026-08-03 | 「获得女巫牌」弹窗领取后新增退出动画：弹窗内容上滑 40px + 淡出 200ms，黑色蒙层同步淡出，完成后引导才结束（新增 `requestCloseGuideGift()`，关闭状态命名 `_closingGuideGift` / `_closeGuideGiftStartTime` 符合动画规范）；领取按钮点击不再播放音效 |
| v1.14.10 | 2026-08-03 | 商店引导入场动画对齐主引导：女巫先从屏幕左侧缓慢飞入（1200ms easeOutCubic）并全程上下漂浮（骑扫把感），到位后对话框再从右侧飞入（500ms），打字开始时间相应顺延；同步更新 README |
| v1.14.11 | 2026-08-03 | 图鉴引导入场动画对齐主引导：聚光灯显示后女巫先从左侧缓慢飞入（1200ms easeOutCubic）并全程上下漂浮（骑扫把感），到位后对话框再从右侧飞入（500ms），Phase 1 打字开始时间相应顺延；同步更新 README |
| v1.14.12 | 2026-08-03 | 第一回合初始发牌改为 3 个长度 3 的种子词（9 张种子牌填满默认手牌，无随机补牌），元音规则与双种子词一致（≤2 种、每种 ≤2 次，凑不齐时放宽兜底）；其余回合保持 3+4 双种子词不变；同步更新 README |
| v1.14.13 | 2026-08-03 | 图鉴引导布局调整：女巫图片由 180*s 缩小至 130*s；女巫与对话框整体上移，女巫位于图鉴图标（聚光灯高亮区域）下方，对话框跟随移至女巫下方 |
| v1.14.14 | 2026-08-03 | 图鉴引导改为女巫与对话框齐平并排（女巫在左、对话框在右，垂直居中齐平），对话框宽度占满剩余屏幕、高度按文案行数动态计算（修正长文案溢出问题） |
| v1.14.15 | 2026-08-03 | 三套新手引导的女巫图片两侧新增紫/金五角星装饰（新增 `_drawWitchSideStars`，移植自游戏结束弹窗小女巫装饰：右 3 颗紫+金、左 2 颗紫+金，跟随女巫移动/漂浮，绘制在对话框背景之后避免被遮挡） |
| v1.14.16 | 2026-08-03 | 引导五角星新增闪烁呼吸动画：透明度（0.35~1）与缩放（0.85~1.15）按正弦脉动（周期约 1.6s），5 颗星相位逐颗错开，呈现一闪一闪效果 |
| v1.14.17 | 2026-08-03 | 主页「双人对战」增加解锁条件：当前回合数 ≥ 5 才开放，未解锁时按钮显示锁定图 `homepageBattleLocked`（`bg_icon/homepage_battle_locked.png`），点击不进入对战页面；同步更新 README |
| v1.14.18 | 2026-07-31 | （补录）计分预览增强：选中 1 张牌即显示基础字母总分/倍率预览（方块上方「字母总分」「倍率」提示小字），出牌后预览值无缝接管正式计分动画；结算新增「一击入魂」：本回合只出牌 1 次即通关时金币全部翻倍（延迟敲章 + 「+2 → +4」翻倍揭晓动画）；混沌法球随机倍率量化到 0.1 步进；继续闯关恢复到进入对战/金词前的单人页面状态；设置弹窗新增版本信息行（`GAME_VERSION` 常量） |
| v1.15.0 | 2026-08-06 | 新增每日金词推理玩法：每日 1 词（`getDailyWords` 改为每日 1 词），10 次出牌机会按位置命中揭示占位卡，含主页入口弹窗（本月点亮日历 + 词长 + 挑战/查看结果按钮）、历史面板、猜中/失败结果弹窗与文字分享；占位卡复用对战模板 `battle_me_place`/`battle_me_word_bg`；主页「每日成就」入口替换为金词入口（未完成时显示呼吸红点）；词库文件改为 `daily_words_08_06_13.jsonl`（JSON Lines）；新增 `js/render/golden.js` |
| v1.16.0 | 2026-08-08 | 新增女巫牌升级系统：详情弹窗金色升级按钮，消耗 (等级+1)×原价 金币逐级提升 `real_value`（`upgrate_value` 步进）或 `rate`（以小博大 `upgrate_rate` +5%/级，`max_level` Lv.5）；混沌法球随机区间随等级整体上移；升级成功视图（卡牌放大 + 紫色光芒 + 闪烁星星 + `magic_twinkle`）；计分/动画统一走 `getJokerValue`；升级同步写回 `_originalValue` 防止回合重置覆盖；词牌图鉴隐藏装备功能（移除「已装备」Tab 与装备按钮，点击词牌改为大图灯箱，历史已装备卡牌仍生效）；设置弹窗版本信息改为二级页（按 `game_version` 查询云数据库 `version_info` 集合）；消元术新增 `_lastPlayedWord` 记录单词原文用于展示；同步更新 README |
| v1.16.1 | 2026-08-09 | 游戏中点击道具栏药水牌直接使用（`usePotionInGame`），不再弹出详情弹窗；商店页药水详情弹窗中吸星大法/字母置换隐藏「使用」按钮（这两张只能在游戏中使用），只保留售出；旧存档 joker 按名称从 `SHOP_POOL` 回填 desc/升级配置字段，修复老用户升级预览效果文案不替换（Lv.1/Lv.2 显示相同）；版本信息按「数字.」序号自动换行展示；同步更新 README |
| v1.16.2 | 2026-08-11 | 第 3 关女巫奖励改为 `card_change_letter_absorb_stars`：50% 字母置换 / 50% 吸星大法（均为「暂存」按钮）；女巫奖励命中药水但道具栏已满时，兜底换成一张未装备的随机女巫牌，结果页按钮变为「装备」（女巫牌栏也满则 toast 提示不发放）；女巫牌升级成功视图卡牌到位时新增紫金色双点烟花（复用 `_spawnSparkles`，弹窗最顶层绘制）；同步更新 README |

---

*文档基于实际代码整理，最后更新：2026-08-11*
