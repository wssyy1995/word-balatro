# Word Balatro 微信小游戏 — 技术底层架构设计

> 本文档只描述项目的技术底层架构、模块组织与运行原理，不涉及具体业务玩法、卡牌规则或数值设计。

---

## 1. 项目定位与技术栈

本项目是一个基于 **微信小游戏 Canvas 2D** 的移动端游戏。技术选型以原生小游戏 API 为主，不依赖第三方游戏引擎，整体采用 **自研轻量框架 + 模块化渲染** 的架构。

| 维度 | 技术选择 |
|------|----------|
| 运行平台 | 微信小游戏（WeChat Mini Game） |
| 渲染 API | Canvas 2D (`wx.createCanvas` + `getContext('2d')`) |
| 脚本语言 | JavaScript（ES6/模块化，使用 `module.exports`/`require`） |
| 后端服务 | 微信云开发（云函数 + 云数据库 + 云存储） |
| 排行榜 | 微信开放数据域（`openDataContext`） |
| 基础库版本 | 3.14.0（`project.config.json` 配置） |
| 构建工具 | Node.js 脚本（词库处理、精灵图打包） |

---

## 2. 项目目录与技术分层

```
word-balatro/
├── game.js                 # 小游戏入口：初始化、生命周期、主循环、输入分发
├── game.json               # 小游戏全局配置（竖屏、开放数据域等）
├── project.config.json     # 微信开发者工具项目配置
│
├── js/                     # 主程序代码（核心引擎与业务逻辑）
│   ├── game.js             # Game 核心类：状态机、事件驱动、主流程控制
│   ├── renderer.js         # 渲染器入口薄层（require './render/index'）
│   ├── render/             # 渲染器模块化目录
│   │   ├── base.js         # Renderer 基类：Canvas 上下文、屏幕适配、通用工具
│   │   ├── index.js        # 渲染主入口：按 game.state 状态机调度各子渲染器
│   │   ├── effects.js      # 粒子/特效/道具卡牌渲染
│   │   ├── animation.js    # 飞星/飞分/闪光等帧动画
│   │   ├── hud.js          # 顶部信息栏/HUD 渲染
│   │   ├── playing.js      # 主玩法画面渲染
│   │   ├── popup.js        # 弹窗系统渲染
│   │   ├── guide.js        # 新手引导覆盖层渲染
│   │   ├── cardbook.js     # 卡牌图鉴渲染
│   │   ├── debug.js        # 调试菜单与云日志可视化
│   │   ├── homepage_entry.js # 主页/入口页渲染
│   │   └── gameover.js     # 结束画面渲染（独立 Renderer 类）
│   ├── battle/             # 对战模式独立子系统
│   │   ├── index.js        # 对战模块聚合导出
│   │   ├── manager.js      # 对战状态机与流程控制
│   │   ├── renderer.js     # 对战画面渲染
│   │   ├── input.js        # 对战输入处理
│   │   ├── deck.js         # 对战牌组工具
│   │   └── bot.js          # 对战机器人逻辑
│   ├── animation.js        # 通用动画系统（Easing + AnimationManager）
│   ├── audio.js            # 音效/BGM 管理器
│   ├── input.js            # 触摸输入处理器（InputHandler）
│   ├── storage.js          # 本地存储管理器
│   ├── cloud_storage.js    # 微信云存储资源管理器
│   ├── data.js             # 静态数据与缓存容器
│   ├── words.js            # 本地核心词库数据
│   ├── expand_words.js     # 扩展本地词库数据
│   ├── shop.js             # 商店数据池与渲染
│   ├── settlement.js       # 结算弹窗渲染
│   ├── witch_skills.js     # 女巫技能数据与规则
│   └── report.js           # 埋点事件上报封装
│
├── openDataContext/        # 微信开放数据域
│   └── index.js            # 好友排行榜绘制与数据拉取
│
├── cloudfunctions/         # 微信云函数
│   ├── login/              # 用户登录信息上报
│   ├── baiduDict/          # 百度 API token 换取
│   ├── getDailyWords/      # 每日挑战词获取
│   ├── getGlobalRank/      # 全国排行榜数据拉取
│   ├── updateBestRound/    # 最佳回合数据更新
│   ├── updateUserProfile/  # 用户头像昵称更新
│   └── syncWordBook/       # 单词本云端同步
│
├── scripts/                # 构建与数据处理脚本
├── raw_words/              # 原始词库 CSV
├── images/                 # 本地图片资源
└── music/                  # 本地音频资源
```

---

## 3. 入口与生命周期

### 3.1 入口文件 `game.js`

`game.js` 是微信小游戏的主入口，承担以下职责：

1. **环境初始化**：获取系统信息、创建 Canvas、设置 DPR 缩放、初始化云开发。
2. **全局事件绑定**：
   - `wx.onShow` / `wx.onHide`：前台恢复/后台挂起时的存档与分享检测。
   - `wx.onTouchStart` / `wx.onTouchMove` / `wx.onTouchEnd`：统一触摸输入分发。
   - `wx.onKeyboardInput` / `wx.onKeyboardConfirm`：键盘输入（反馈框）。
   - `wx.onMemoryWarning`：内存告警监听。
3. **资源预加载**：通过 `CloudStorageManager` 下载云存储图片/音频。
4. **游戏启动**：根据存档恢复或新建 `Game` 实例，注入 `renderer` 与 `cloudStorage`。
5. **主循环**：通过 `requestAnimationFrame` 驱动 `game.update()` 与 `renderer.render(game)`。

### 3.2 主循环模型

```
requestAnimationFrame(loop)
  ├── game.update(dt)        # 更新逻辑状态、动画时间线
  ├── renderer.render(game)  # 根据 game.state 绘制当前帧
  └── 处理弹窗/过渡/粒子等覆盖层
```

这是一个典型的 **状态驱动渲染（State-Driven Rendering）** 模型：`Game` 维护完整状态，`Renderer` 只负责读取状态并绘制，不修改业务状态。

### 3.3 全局单例

- `wx.game`：挂载当前 `Game` 实例，方便调试、存档、云函数回调中访问。
- `renderer`：单一 `Renderer` 实例，贯穿整个生命周期。
- `cloudStorage`：单一 `CloudStorageManager` 实例，管理云资源。

---

## 4. 核心架构分层

### 4.1 表现层：Renderer 体系

渲染层采用 **"基类 + Mixin 式模块扩展"** 的设计：

- `js/render/base.js` 定义 `Renderer` 类，包含：
  - Canvas 上下文 `ctx`、逻辑分辨率 `W/H`、适配缩放 `scale`。
  - 安全区域读取（刘海屏/灵动岛适配）。
  - 通用工具：`hitTest`、文字换行、图片加载、圆角矩形、渐变等。
  - 资源占位槽位（背景图、按钮图、引导精灵图等），等待 `CloudStorageManager` 注入。

- `js/render/index.js` 通过 `require` 各模块并调用 `module(Renderer)` 的方式，将能力扩展（Mixin）注入到 `Renderer.prototype`，包括：
  - `effects.js`：粒子、飞星、飞分、卡牌特效。
  - `animation.js`：帧动画更新与绘制。
  - `hud.js` / `playing.js` / `popup.js` / `guide.js` 等：各界面绘制。

- `Renderer.prototype.render(game)` 是一个 **基于 `game.state` 的状态机调度器**：
  ```
  render(game)
    ├── 清屏 + 绘制背景
    ├── if state === 'playing'   → drawHUD + drawPlaying
    ├── if state === 'shop'      → drawShopBackground + shop UI
    ├── if state === 'settlement'→ settlementRenderer.draw
    ├── if state === 'battle'    → battleRenderer.draw
    ├── if state === 'gameover'  → gameOverRenderer.draw
    ├── 更新动画/粒子
    └── 绘制全局覆盖层（弹窗、过渡遮罩、debug 日志）
  ```

这种设计使得：
- 新增界面只需要新增一个 `drawXxx` 方法并在 `render` 状态机中注册。
- 渲染模块可以独立维护，避免单文件过大。
- 渲染器完全无状态（业务状态全部来自 `game`）。

### 4.2 输入层

输入处理分为两套：

#### A. 主入口中的原始触摸分发（`game.js`）

`wx.onTouchStart` 中直接处理大量界面级输入：
- 主页按钮。
- 设置弹窗、单词本弹窗、今日新词弹窗。
- 排行榜弹窗（含开放域按钮控制）。
- 长按检测（调试菜单）。
- 全局返回主页按钮。

这种集中式处理适合处理跨界面、全局性的输入。

#### B. `InputHandler` 类（`js/input.js`）

`InputHandler` 是一个轻量级输入处理器，通过 `canvas.addEventListener('touchstart')` 监听：
- 主玩法状态：`toggleSelect`、出牌、弃牌、投降。
- 商店状态：购买、下一关。
- 药水状态：选牌、取消、转盘。
- 结束状态：重新开始。

它依赖 `renderer.hitTest` 做点击检测，将触摸坐标映射到 `renderer.cardRects`、`renderer.shopRects` 等由渲染层暴露的点击区域。

#### 输入层设计要点

- **命中区域由渲染层计算并暴露**，逻辑层只读取这些区域做命中测试。
- **长按/短按分离**：通过 `setTimeout` 实现长按打开调试菜单，移动超过阈值取消。
- **触摸 Y 轴校正**：特定状态下页面整体下移 10px，输入层通过 `getInputY` 反向偏移对齐视觉位置。

### 4.3 逻辑层：Game 类

`js/game.js` 中的 `Game` 类是核心业务状态机：

- 维护完整的游戏状态（回合、分数、手牌、牌堆、状态机等）。
- 提供状态转换方法：`playHand()`、`discard()`、`nextRound()` 等。
- 通过 `renderer` 暴露动画时间线字段，由渲染层驱动动画推进。
- 持有子管理器实例：`animManager`、`audioManager`、`storageManager`。

**设计模式**：
- **状态机（State Machine）**：`game.state` 是单一状态字符串，渲染层按状态切换画面。
- **命令模式（Command）**：玩家操作通过 `InputHandler` 调用 `game.xxx()`，内部修改状态并触发副作用。
- **依赖注入**：`cloudStorage`、`renderer` 由外部注入，便于测试与替换。

### 4.4 数据层

#### 静态数据

- `js/data.js`：字母分数、字母分布、人头牌标记、目标分计算、LRU 缓存容器。
- `js/words.js` / `js/expand_words.js`：本地词库，构建时生成。
- `js/witch_skills.js` / `js/shop.js`：技能池、商店池定义。

#### 缓存策略

`data.js` 实现了两个带容量上限的集合类：
- `LimitedSet`：LRU 风格的 Set，用于 `onlineWordCache`。
- `LimitedMap`：LRU 风格的 Map，用于 `wordMeaningCache`。

缓存上限固定为 500 条，避免内存无限增长。

### 4.5 资源层：CloudStorageManager

`js/cloud_storage.js` 是云资源管理中枢，职责包括：

1. **云开发初始化**：`wx.cloud.init()`。
2. **文件映射管理**：维护多类资源的 `fileID → name` 映射：
   - `cloudFileMap`：商店卡牌图片。
   - `witchFileMap` / `witchCardFileMap`：女巫头像/卡牌。
   - `bgIconFileMap`：背景与 UI 图标。
   - `guideFileMap`：引导精灵图。
   - `musicFileMap`：音效/音乐。
   - `rankAvatarFileMap`：排行榜头像框。
3. **本地缓存覆盖**：启动时从 `wx.getStorageSync` 读取本地缓存的映射表，允许热更新云文件而不改代码。
4. **预加载**：
   - 下载云图片到 `wx.createImage()`。
   - 下载音频到本地临时文件并缓存路径。
   - 按需下载女巫头像/引导精灵图。
5. **注入渲染器**：通过 `injectToRenderer`、`injectBgIconToRenderer` 等方法将加载好的资源赋值给 `Renderer` 实例的对应字段。

这种设计实现了 **"云存储为资源仓库、本地缓存为加速层、Renderer 为消费端"** 的三层资源架构。

### 4.6 音频层：AudioManager

`js/audio.js` 封装微信音频 API：

- 音效：`wx.createInnerAudioContext()`，支持懒加载、指定播放时长、循环播放。
- BGM：`playBGM()` / `tryStartBGM()`，支持静音开关、音量控制。
- 独立开关：`soundEnabled`（音效）与 `musicEnabled`（BGM）可分别控制。
- 云缓存音频加载：`loadFromCloud(cloudStorage)` 从 `musicCache` 读取已下载的本地路径。

---

## 5. 动画系统

`js/animation.js` 提供轻量级补间动画框架：

- `Easing`：内置多种缓动函数（easeOutCubic、easeOutBack、easeOutBounce 等）。
- `Animation`：单一补间实例，支持 `from/to`、delay、easing、onUpdate、onComplete。
- `AnimationManager`：管理动画列表，每帧 `update(now)` 推进并清理已完成动画。

渲染层通过 `AnimationManager` 的快捷方法创建动画：
- `flyOut` / `flyIn`：卡牌飞入飞出。
- `scorePop`：分数弹出。
- `buttonPress`：按钮按压回弹。
- `cardSelect` / `cardDeselect`：选牌位移。

粒子系统（烟花、飞星、飞分）由 `render/effects.js` 与 `render/animation.js` 自行维护数组状态，每帧更新位置与透明度。

---

## 6. 存储与持久化

### 6.1 本地存储：StorageManager

`js/storage.js` 封装 `wx.setStorageSync` / `wx.getStorageSync`：

- 统一 key 前缀 `word_balatro_`。
- 提供 `set/get/remove/clear` 基础方法。
- 游戏进度存档：
  - 保存时做深拷贝快照，避免引用被后续修改污染。
  - 写入后回读验证。
  - 后台切换时立即调用 `saveProgressImmediate()`。
- 独立持久化数据：
  - 新手引导阶段。
  - 最高分/最佳回合。
  - 统计信息。
  - 每日复活标记。
  - 已收集女巫卡牌。

### 6.2 存档恢复策略

启动时检查存档：
- 超过 7 天视为过期。
- 缺少关键字段（`hand`/`deck`/`target`/`state`/`_shuffledSkills`）视为不兼容，清理旧存档。
- 否则用存档实例化 `Game`，实现断点续玩。

---

## 7. 云开发架构

### 7.1 云函数

每个云函数职责单一：

| 云函数 | 职责 |
|--------|------|
| `login` | 用户首次/再次登录，记录设备信息，返回 openid。 |
| `baiduDict` | 调用百度 API 换取 `access_token`，前端不保存密钥。 |
| `getDailyWords` | 按日期返回每日挑战词。 |
| `getGlobalRank` | 查询全国排行榜（云数据库聚合）。 |
| `updateBestRound` | 更新用户最佳回合到云数据库。 |
| `updateUserProfile` | 更新用户头像昵称。 |
| `syncWordBook` | 单词本增量同步到云端。 |

### 7.2 开放数据域：好友排行榜

`openDataContext/index.js` 运行在隔离的开放数据域：

- 通过 `wx.getSharedCanvas()` 获取共享 Canvas。
- 从 `wx.getFriendCloudStorage()` 拉取好友数据。
- 支持两种绘制模式：
  - `full`：全屏排行榜。
  - `panel`：主域弹窗内嵌列表，主域设置 `sharedCanvas` 尺寸并传入 `rect`。
- 主域通过 `postMessage` 控制显示/隐藏，隐藏时主动将 `sharedCanvas` 尺寸设为 1×1 释放内存。

### 7.3 全国榜与授权

全国榜在主域绘制，数据来自 `getGlobalRank` 云函数：
- 首次进入检查 `scope.userInfo` 授权。
- 未授权时创建原生 `wx.createUserInfoButton` 按钮，用户点击后上传头像昵称。
- 授权按钮的位置/尺寸与渲染层计算的弹窗矩形保持同步。

---

## 8. 状态驱动渲染模型详解

本项目最核心的架构特征是 **"单一状态源 + 状态驱动渲染"**：

```
玩家输入 → Game 状态变更 → Renderer 读取 game 绘制 → 下一帧循环
```

### 8.1 状态字段分类

`Game` 中的字段可按职责分为：

1. **核心流程状态**：`state`、`round`、`score`、`target` 等。
2. **牌组状态**：`hand`、`deck`、`selected` 等。
3. **UI/弹窗状态**：`_dailyWordsPopup`、`_settingsPopup`、`cardBookOpen` 等。
4. **动画时间线状态**：`_battleAnimTimeline`、`_reduceTargetAnim`、`_lifeExtensionAnim` 等。
5. **输入按压状态**：`_settingsSoundPressed`、`_wordBookClosePressed` 等（用于渲染按下反馈）。
6. **滚动状态**：`_globalRankScrollY`、`_wordBookScrollY` 等（含物理滚动/回弹）。

### 8.2 渲染层只读原则

渲染层原则上不修改 `game` 的业务状态，只修改：
- 自身动画数组（粒子、飞分）。
- 按压反馈状态（如 `_homepagePressedBtn`）。
- 调试菜单开关。

这种读写分离使得：
- 调试时容易定位问题来源。
- 存档只需要序列化 `Game` 状态。
- 新增界面不影响核心逻辑。

### 8.3 动画与逻辑分离

复杂动画（如出牌）通过 `Game` 设置时间线字段，渲染层每帧检查时间线推进：

```
Game.playHand() 设置 animTimeline = { phase: 0, startTime: now, ... }
Renderer.drawPlaying() 读取 animTimeline，按 elapsed 绘制不同阶段
animTimeline.phase++ 由 Renderer 在合适时机推进
```

动画完成后，Renderer 调用 `game.completePlayHand()` 等回调完成状态切换。

---

## 9. 屏幕适配策略

适配逻辑集中在 `Renderer` 构造函数中：

1. **基准缩放**：以 iPhone 6/7/8（375×667）为基准，计算 `scale = min(width/375, height/667)`。
2. **缩放边界**：限制 `scale ∈ [0.8, 1.4]`，防止元素过大或过小。
3. **折叠屏/矮屏适配**：当可用高度不足时，进一步压缩 `scale`。
4. **安全区域**：读取 `safeArea.top` / `safeArea.bottom`，避开刘海与底部手势区。
5. **高分屏 Canvas 上限**：
   - 限制 Canvas 物理像素最大 960×1920。
   - `scaleDpr = min(dpr, MAX_CANVAS_WIDTH/WIDTH, MAX_CANVAS_HEIGHT/HEIGHT)`。
   - 既利用 Retina 清晰度，又避免高分屏内存爆炸。

---

## 10. 性能优化策略

1. **Canvas 像素上限**：限制物理分辨率，降低 GPU/显存压力。
2. **sharedCanvas 尺寸控制**：好友榜隐藏时重置为 1×1，弹窗模式按实际区域设置。
3. **资源按需加载**：
   - 女巫头像按回合下载。
   - 引导精灵图按阶段下载。
   - 商店/背景图标预加载，但音频进入游戏后再加载。
4. **内存监控**：
   - 监听 `wx.onMemoryWarning`。
   - 每 10 秒采样 `wx.getPerformance().getMemoryInfo()`（调试阶段）。
5. **缓存淘汰**：在线词校验缓存使用 LRU，上限 500 条。
6. **动画对象池化**：避免每帧创建大量临时对象（如 `_lastFloatingText` 复用）。
7. **云文件映射缓存**：启动时从本地缓存读取映射，避免重复查询云存储列表。

---

## 11. 模块依赖关系

```
              game.js (入口)
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
  Game       Renderer    CloudStorageManager
 (js/game.js)(js/render/*)(js/cloud_storage.js)
    │            │            │
    ├────┬───────┤            │
    ▼    ▼       ▼            ▼
Animation Audio  Storage    wx.cloud
(js/animation.js)(js/audio.js)(js/storage.js)
    │
    ▼
  data.js / words.js / expand_words.js
```

依赖方向：
- 入口依赖所有核心模块。
- `Renderer` 依赖 `data.js`、`settlement.js`、`shop.js`、`witch_skills.js`、`animation.js`。
- `Game` 依赖 `data.js`、`animation.js`、`audio.js`、`storage.js`、`shop.js`、`witch_skills.js`、`battle/index.js`。
- `InputHandler` 依赖 `game` 与 `renderer`。
- 渲染子模块通过 Mixin 挂载到 `Renderer.prototype`，彼此无直接依赖。

---

## 12. 可复用的技术资产

如果基于本项目开发新的微信小游戏，以下模块/设计可以直接复用：

| 资产 | 复用价值 |
|------|----------|
| `js/render/base.js` | Canvas 2D 渲染基类、屏幕适配、点击测试、通用绘制工具。 |
| `js/render/index.js` Mixin 模式 | 渲染器模块化扩展方案。 |
| `js/animation.js` | 轻量补间动画框架，含多种缓动函数。 |
| `js/audio.js` | 微信小游戏音效/BGM 管理封装。 |
| `js/storage.js` | 本地存储、进度存档、跨版本兼容。 |
| `js/cloud_storage.js` | 云存储资源映射、预加载、本地缓存、注入渲染器。 |
| `js/input.js` | 触摸输入处理器模式。 |
| `openDataContext/index.js` | 开放数据域排行榜完整实现。 |
| 云函数模板 | 登录、token 代理、排行榜、用户资料更新。 |
| 状态驱动渲染模型 | `Game` 状态机 + `Renderer` 按状态调度。 |

---

## 13. 当前架构的取舍与注意事项

### 13.1 优点

- **无外部引擎依赖**：全部基于微信原生 API，包体小、可控性强。
- **状态驱动渲染**：逻辑与表现分离，易于调试与扩展。
- **模块化渲染**：通过 Mixin 拆分巨型 Renderer，维护性较好。
- **云开发一体化**：登录、排行榜、资源、反馈全部基于微信云开发，减少后端成本。
- **性能意识强**：Canvas 像素上限、资源按需加载、内存监控都有体现。

### 13.2 待改进点

- **入口文件过大**：`game.js` 超过 3000 行，承担入口、生命周期、输入分发、排行榜授权、分享回调等多重职责，建议进一步拆分为 `lifecycle.js`、`input_dispatcher.js`、`rank_manager.js` 等模块。
- **渲染与输入耦合**：部分全局输入仍直接写在 `game.js` 中，与渲染层计算的位置矩形强耦合。
- **Game 类职责过重**：可进一步拆分为 `RoundManager`、`UIManager`、`AnimationDriver` 等子系统。
- **对战模式与主玩法共享 Game 状态**：对战状态字段直接挂在 `game` 上，可考虑独立 `BattleGame` 子状态机。

---

## 14. 总结

本项目的技术底层是一个 **轻量级、自研的微信小游戏 Canvas 2D 框架**，核心设计为：

> **单一状态源（Game） + 状态驱动渲染（Renderer） + 云存储资源管理（CloudStorageManager） + 微信云开发后端。**

在此之上，通过 `AnimationManager`、`AudioManager`、`StorageManager` 等子系统支撑表现、声音与持久化；通过 `openDataContext` 实现好友排行榜；通过云函数实现登录、全国榜、每日词、反馈等业务后端能力。

理解这套底层架构后，可以在保留渲染、输入、资源、音频、存储等基础设施的前提下，快速替换业务逻辑与表现资源，开发新的微信小游戏。
