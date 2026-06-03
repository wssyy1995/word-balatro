# renderer.js 结构梳理文档

> 文件总行数：**6600 行**  
> 核心类：`Renderer`（Canvas 2D 主渲染器）  
> 附属类：`GameOverRenderer`（游戏结束弹窗子渲染器）

---

## 一、整体架构

```
Renderer
├── 资源加载与状态管理（构造函数 + 属性）
├── 预加载页绘制
├── 通用绘制工具库（~60 个方法）
├── 主渲染入口 render(game) —— 状态机调度
│   ├── playing    → drawHUD + drawPlaying + 各种弹窗/动画
│   ├── settlement → drawHUD + SettlementRenderer
│   ├── witch_reward → drawHUD + WitchRewardRenderer
│   ├── shop       → drawTopHeader + ShopRenderer + ConfirmBuyRenderer
│   ├── potion     → drawPotion
│   ├── life_extended → drawHUD + drawPlaying + _drawLifeExtensionPopup
│   └── gameover   → drawHUD + drawPlaying + GameOverRenderer
├── 新手引导覆盖层（3 套引导）
├── 图鉴弹窗（cardBook）
└── 粒子/动画/过渡效果（全局叠加层）
```

---

## 二、模块详细拆解

### 模块 A：构造函数与资源管理（行 1–557）

**职责**：初始化 Canvas 尺寸、安全区域、加载所有图片资源、实例化子渲染器。

| 属性类别 | 关键属性 | 说明 |
|---------|---------|------|
| 尺寸 | `W`, `H`, `scale`, `cardW`, `cardH`, `gap` | 响应式基准，限制 scale 在 0.8~1.4 |
| 安全区 | `safeTop`, `safeBottom`, `hasDynamicIsland`, `platform` | 刘海屏/灵动岛适配（wx.getSystemInfoSync） |
| 背景 | `bgImage`, `bgLoaded` | 云存储注入 |
| 新手引导精灵图 | `guideImages.witch_1~4` | 帧动画坐标，16/14 帧，150ms/帧 |
| 图标 | `topIcon`, `coinIcon`, `refreshIcon`, `errorIcon`, `shopIcon` | 本地图片 |
| 卡牌图鉴 | `cardBookIcon`, `cardBookImage`, `cardBookLeftBtn`, `cardBookRightBtn` | 图鉴入口 + 弹窗背景 + 翻页按钮 |
| 按钮 | `btnImages`（出牌/弃牌/重置/挑战） | 本地图片 |
| 分数方块 | `scoreBoxImages`（3 种背景）, `scoreLineImg` | 计分方块背景图 |
| 女巫 | `witchAvatars`, `witchCardImages`, `failWitchImg` | 云存储按需预加载 |
| 商店卡牌 | `shopCardImages`（~20 种 trigger 图标 + empty 占位图） | 云存储/本地混合 |
| 游戏结束 | `gameOverBtnImages`（复活/重开/排行） | 本地图片 |
| 其他 | `cardTemplate`, `cardTemplateSelected`, `cardDisableIcon`, `buySuccessBandImg`, `gameProgressImage` | 卡牌模板、禁用锁、购买成功横幅、进度条 |
| 预加载 | `previewLoadBg`, `witchWalkSprite` | 预加载页背景 + 小女巫走路精灵图 |
| 字体 | `titleFontFamily` | 香萃灯粗宋子集字体（4.4KB），失败回退系统字体 |
| 动画状态 | `sparkles`, `flyingScore`, `scoreRoll`, `scoreAnim`, `goldAnim`, `labelTagAnim` | 粒子数组、飞分动画、数字滚动、标签弹出 |
| 调试 | `debugMenuOpen`, `showCloudDebugLogs`, `cloudLogScrollY` | 调试菜单、云存储日志 |
| 点击区域 | `witchPropRects`, `cardRects`, `topIconRect` 等 | 各模块绘制时写入，handleInput 读取 |
| **子渲染器** | `settlementRenderer`, `witchRewardRenderer`, `shopRenderer`, `confirmBuyRenderer`, `gameOverRenderer` | 4 个独立类实例，通过 `this.parent` 回访问主渲染器方法 |

---

### 模块 B：预加载页（行 559–665）

| 方法 | 行号 | 职责 |
|------|------|------|
| `drawPreviewLoad(progress)` | 560 | 绘制预加载进度页：背景图 + 走路小女巫精灵图帧动画 + 进度条 + 百分比文字 |
| `_drawTinyStar(ctx, cx, cy, r, color)` | 649 | 绘制微小四角星（进度条装饰） |

**资源依赖**：`previewLoadBg`, `witchWalkSprite`

---

### 模块 C：通用绘制工具库（行 666–1857）

这是整个渲染器的**基础设施层**，被几乎所有业务模块调用。

#### C1. 状态与图标（666–721）

| 方法 | 行号 | 职责 |
|------|------|------|
| `resetState()` | 666 | 重置动画状态（scoreAnim、goldAnim、sparkles、witchPropRects 等），回合切换时调用 |
| `drawShopCardIcon(x, y, size, name)` | 692 | 绘制商店卡牌图标（SVG path 硬编码：has_vowel, high_letter, end_s, end_ed, no_duplicate 等 ~15 种），fallback 时画文字首字母 |
| `_getWitchLetters(trigger)` | 710 | 返回女巫牌可作用字母列表（如 `high_letter` → JQXZ），用于详情弹窗字母标签 |

#### C2. 女巫牌详情弹窗（722–928）

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawWitchDetailPopup(ctx, game, s)` | 722 | 绘制女巫牌/药水详情弹窗（点击已装备道具触发）。含：弹窗背景、图标、名称、效果标签（limit/usesLeft/whole_word 等）、描述文字、预言字母（predicted_letter）、可作用字母标签（圆角彩色小圆）、累计倍率（illegal_boost）、星辰燔边特效（triggered 状态） |

**写入的点击区域**：`witchDetailPopupCloseRect`

#### C3. 字母之神动画（929–1066）

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawLetterGodAnim(game)` | 929 | 字母之神触发后的专属星星飞行动画：从 maxScore 卡牌飞出金色星星，沿贝塞尔曲线飞向各 played 卡牌，落地时产生金色涟漪 |

#### C4. 形状与特效（1067–1703）

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawStar(ctx, cx, cy, outerR, innerR, spikes, rotation)` | 1067 | 绘制星形（5角星，圆角 stroke） |
| `_drawEmptySlot(ctx, x, y, w, h, s, type)` | 1090 | 绘制空槽位（虚线边框 + 半透明背景 + 类型图标） |
| `_drawPropCard(ctx, prop, x, y, w, h, s, showDisabled, showPredicted)` | 1156 | **核心方法**：绘制道具卡牌（女巫牌/药水）。含：图标/背景图、底部蒙层+名字、limit 次数徽章（右上角红色）、预言字母徽章（紫色）、自毁撕裂动画、星辰燔边粒子特效、禁用状态暗化+锁图标、禁用动画光晕 |
| `_createSparkParticles(x, y, w, h, s, count)` | 1369 | 创建星辰燔边粒子（沿边框均匀分布） |
| `_updateAndDrawSparkParticles(ctx, particles, s)` | 1415 | 更新并绘制星辰粒子（生命周期、闪烁、大小变化） |
| `_roundedRectPath(ctx, x, y, w, h, r)` | 1465 | 圆角矩形路径（供 clip/stroke 复用） |
| `_drawLashBorder(ctx, x, y, w, h, r, s, elapsedSec, duration)` | 1481 | 撕裂边框动画（黑色锯齿状线条，自毁动画期间） |
| `_borderPoints(x, y, w, h, n)` | 1589 | 计算边框等分点（用于粒子分布） |
| `_drawFancyLabel(ctx, cx, cy, s, text, scale, elapsed)` | 1606 | 绘制华丽弹出标签（金色底+阴影+放大动画，调试用） |

#### C5. 基础 UI 工具（1704–1857）

| 方法 | 行号 | 职责 |
|------|------|------|
| `roundRect(x, y, w, h, r, fill, stroke, lineWidth)` | 1704 | 圆角矩形（填充+描边） |
| `text(str, x, y, size, color, align)` | 1722 | 快捷文字绘制 |
| `button(label, x, y, w, h, color, textColor)` | 1732 | 快捷按钮绘制（圆角矩形+文字） |
| `drawBtnImage(name, x, y, w, h)` | 1739 | 绘制图片按钮（如出牌/弃牌按钮） |
| `drawCard(card, x, y, isNew, displayScoreOverride)` | 1751 | **核心方法**：绘制字母卡牌。含：模板底图（普通/选中）、字母（大写+小写）、分数（升级后变色+箭头）、左上角花色标记、新牌入场动画（缩小+淡入）、选中放大上浮、禁用状态（灰色遮罩+斜线）、pendingCheck 成功/失败状态（绿色勾/红色叉+抖动） |

---

### 模块 D：主渲染入口（行 1858–2414）

| 方法 | 行号 | 职责 |
|------|------|------|
| `render(game)` | 1859 | **唯一对外主入口**。按 `game.state` 分发：playing / settlement / witch_reward / shop / potion / life_extended / gameover。每层绘制后叠加：字母之神动画 → 字母置换弹窗 → hintToast → updateAnimations → 烟花粒子 → 飞行分数 → 商店过渡遮罩 → 云调试日志 → 新手引导覆盖层 → 卡牌图鉴弹窗 |

**渲染顺序（z-index 从底到顶）**：
1. 背景（bgImage 或纯色 #0a1628）
2. 状态特定页面内容
3. 子渲染器（settlement/shop/gameover 等）
4. 弹窗/特效（changeLetterPopup, letterGodAnim, hintToast）
5. 粒子与飞行动画（sparkles, flyingScore）
6. 过渡遮罩（shopToGameTransition）
7. 调试日志
8. **新手引导覆盖层（最顶层）**
9. **卡牌图鉴弹窗（最顶层之一）**

---

### 模块 E：新手引导系统（行 2415–3077）

三套独立引导，均使用 evenodd 挖空蒙层 + 女巫精灵图 + 对话框逐字显示。

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawGuideOverlay(game)` | 2415 | **主游戏引导**（第1回合）。Phase 1~5：入场渐变 → 女巫果冻弹出（witch_1/2 精灵图） → 逐字打字 → has_vowel 礼物卡牌弹入（Phase 3） → 退场。文案数组 PHASE_TEXTS[1~4] |
| `_drawShopGuideOverlay(game)` | 2626 | **商店引导**（第2回合）。Phase 1~3：evenodd 聚光灯挖空高亮商店技能区 → 女巫弹出（witch_3） → 逐字打字 → 退场 |
| `_drawCardBookGuideOverlay(game)` | 2827 | **图鉴引导**（第3回合商店）。Phase 1~3：500ms 延迟 → evenodd 挖空图鉴图标 → 女巫弹出（witch_4） → 逐字打字 → 退场 |
| `_drawCardBookIcon(game, titleX, titleY, titleW)` | 3078 | 绘制卡牌图鉴入口图标（标题右侧书本图标，带呼吸缩放动画） |
| `_drawCardBookDetail(ctx, game, W, H, s)` | 3139 | 绘制图鉴详情页（4格布局 + 翻页 + 女巫头像/名字/技能/通过状态） |
| `_wrapText(ctx, text, maxWidth, fontSize)` | 3356 | 文字自动换行（返回行数组） |

**点击区域暴露**：
- `guideDialogRect` / `guideNextBtnRect`
- `shopGuideDialogRect` / `shopGuideNextBtnRect`
- `cardBookGuideDialogRect` / `cardBookGuideNextBtnRect`

---

### 模块 F：顶部 HUD（行 3374–3739）

| 方法 | 行号 | 职责 |
|------|------|------|
| `drawTopHeader(game)` | 3375 | 商店页面顶部：top_icon（左上角） + 金币胶囊（右侧） |
| `drawHUD(game)` | 3401 | **游戏页面 HUD**。含：回合/目标分 bar（渐变底色+斜纹）、目标分文字、当前分数（数字滚动动画+脉冲缩放）、女巫头像（带关卡标记）、禁用状态锁图标、约束规则文字、女巫头像星星爆发动画触发、金币胶囊（右上角） |

**写入的点击区域**：`hudWitchAvatarRect`（点击打开女巫详情）

---

### 模块 G：游戏主界面 drawPlaying（行 3741–4865）

**约 1125 行，文件最大方法**。负责游戏核心交互界面的全部绘制。

#### G1. 布局计算（3741–3760）
- 手牌列数：≤9 张用 3 列，≥10 张用 4 列
- **从底部按钮倒推布局**：按钮 → 卡牌区 → 预览区 → 分数方块 → 道具栏
- 自适应 tall/narrow 屏幕（s<1 时分配额外高度）

#### G2. 道具栏（3779–3920）
- 女巫槽位（动态 4~6 格）+ 药水槽位（2 格）
- 动态 gap：槽位增加时卡牌重叠
- 绘制 `_drawPropCard` + 禁用动画光晕 + 禁用锁图标
- **写入点击区域**：`witchPropRects`（女巫牌点击）

#### G3. 单词预览区（3921–4060）
- 白色半透明蒙层（固定 6 字母宽度）
- 已选字母实时显示（带选中序号小圆点）
- pendingCheck 状态：单词校验中旋转圈、非法单词红色抖动+错误图标、女巫约束失败红色提示

#### G4. 分数预览方块（4061–4230）
- 左：字母基础分（背景图 + 数字滚动）
- 中：乘号（×）
- 右：长度倍率（背景图 + 数字）
- `letter_a_mult_half` 惩罚动画：紫色妖雾弥散边框
- **写入点击区域**：`leftBoxRect`, `rightBoxRect`（调试用）

#### G5. 卡牌区（4231–4370）
- 调用 `drawCard` 绘制手牌
- 绘制正在飞出的旧牌（animOffset）
- **写入点击区域**：`cardRects`

#### G6. 底部按钮区（4371–4850）
- 争分夺秒倒计时条（hastePlay）
- 出牌按钮（图片 + 文字 + 剩余次数）
- 弃牌按钮（同上）
- 清空选择按钮（同上）
- **写入点击区域**：`challengeBtnRect`, `discardBtnRect`, `resetBtnRect`

#### G7. 弹窗覆盖（4851–4865）
- 调试华丽标签
- `_drawWitchDetailPopup`

---

### 模块 H：辅助 UI 组件（行 4867–5770）

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawCoinCapsuleAt(coinCapsuleX, coinCapsuleY, game)` | 4867 | 绘制金币胶囊（双层圆角边框 + 内部立体感渐变 + 金币图标 + 数字） |
| `_drawHintToast(game)` | 4954 | 顶部提示条（如"单词不存在"），红色/黄色渐变底，带入场/退场动画 |
| `drawChangeLetterPopup(game)` | 4978 | 字母置换弹窗（药水效果）：可选旧字母（左）→ 箭头 → 可选新字母（右），格子布局 |
| `_drawPotionUpgradeAnim(game)` | 5134 | 药水升级成功动画：卡牌飞出 → 金色星星爆发 → 新卡牌飞入 |
| `drawPotion(game)` | 5214 | 药水使用页面（potion 状态）：标题 + 药水效果说明 + 开始使用/取消按钮 |
| `drawRandomUpgradePopup(game)` | 5452 | 随机强化弹窗（转盘抽奖）：外圈字母转盘 + 内圈指针 + 旋转/暂停/完成三阶段动画 + 高亮当前字母 |

---

### 模块 I：动画与粒子系统（行 5789–5991）

| 方法 | 行号 | 职责 |
|------|------|------|
| `updateAnimations()` | 5789 | 动画更新（预留接口，当前为空） |
| `_spawnSparkles(cx, cy, count, colors)` | 5794 | 产生普通粒子（金色/白色，向四周散射） |
| `_spawnStarBurst(cx, cy, count, colors)` | 5814 | 产生星形粒子（较慢、范围大、带旋转） |
| `_updateAndDrawSparkles(ctx, s)` | 5836 | 更新粒子位置（重力衰减）并绘制（支持 star/circle 两种 shape） |
| `_drawGentleStars(cx, cy, size, s, globalAlpha, glowMult)` | 5874 | 绘制柔和星星背景（十字光芒 + 渐变） |
| `_drawCardGlow(ctx, cardX, cardY, cardW, cardH, s)` | 5944 | 卡牌金色光晕（星星 + 渐变圆） |
| `_drawSparkleShape(ctx, x, y, r)` | 5977 | 绘制菱形闪光（四角星） |
| `_calcPulseScale(animState, maxScale)` | 5992 | 计算脉冲缩放（正弦波，用于分数数字跳动） |

---

### 模块 J：通用 UI 组件（行 5992–6356）

| 方法 | 行号 | 职责 |
|------|------|------|
| `_drawScaledButton(ctx, label, x, y, w, h, s, pressed, options)` | 6001 | 标准缩放按钮（圆角矩形 + 文字 + 按下偏移 + 渐变色） |
| `_drawTitleDivider(ctx, x, y, w, s, options)` | 6013 | 标题装饰分割线（金色横线 + 中间菱形 + 两侧短线） |
| `_drawModalPanel(ctx, W, H, s, config)` | 6049 | **标准弹窗面板**：全屏暗色遮罩 + 居中面板（入场/退场动画：位移+缩放+淡入淡出），返回 `{px, py, pw, ph, elapsed, closeAlpha}`。被 settlement/witch_reward/gameover/cardBook/life_extension 等广泛使用 |
| `_startFlyingScore(value, startX, startY, game)` | 6095 | 启动飞行分数动画（数字从起点飞向总分位置） |
| `_updateAndDrawFlyingScore(ctx, s, game)` | 6107 | 更新并绘制飞行中的分数（抛物线轨迹 + 渐隐） |
| `_drawCloudDebugLogs(ctx, game, s)` | 6158 | 云存储调试日志面板（真机排查用，可滚动） |
| `_drawDebugMenu(ctx, game, x, y, s)` | 6228 | 调试菜单（12 个按钮：加金币/分数/跳回合/触发引导/显示云日志等） |
| `_drawLifeExtensionPopup(game)` | 6280 | 生命延续（life_extension 药水）弹窗：女巫图片 + 文案 + 确定按钮 |

---

### 模块 K：工具方法（行 6357–6367）

| 方法 | 行号 | 职责 |
|------|------|------|
| `hitTest(x, y, rects)` | 6357 | 点击检测（逆序遍历，返回第一个命中 rect） |

---

### 模块 L：GameOverRenderer 子类（行 6369–6598）

| 方法 | 行号 | 职责 |
|------|------|------|
| `constructor(renderer)` | 6371 | 接收 parent Renderer |
| `draw(ctx, game, W, H, s)` | 6377 | 绘制游戏结束弹窗：标准面板（`_drawModalPanel`）+ 小女巫（顶部重叠）+ 失落竖线 + 星星装饰 + "游戏结束"标题 + 分隔线 + 数据行（到达回合/本局总分/历史最高）+ 提示文字 + 三按钮横排（复活/重新开始/排行榜） |

**写入的点击区域**：`restartBtnRect`, `rankBtnRect`, `reviveBtnRect`

---

## 三、关键依赖关系图

```
Renderer
│
├─ 被 settlement.js 依赖：SettlementRenderer(parent)
├─ 被 witch_reward.js 依赖：WitchRewardRenderer(parent)
├─ 被 shop.js 依赖：ShopRenderer(parent), ConfirmBuyRenderer(parent)
│   └─ shop.js 反向注入：shopGuideSpotRect（商店引导聚光灯区域）
├─ 被 game.js（入口）依赖：Renderer 实例化后传给 gameLoop
├─ 被 cloud_storage.js 依赖：injectBgToRenderer, injectGuideToRenderer,
│   injectWitchAvatarToRenderer, injectShopCardToRenderer 等注入方法
└─ 内部使用：Easing（动画曲线）, data.js（词库/分数表）,
    witch_skills.js（技能配置/卡牌配置）

GameOverRenderer
└─ 依赖 parent._drawModalPanel, parent.roundRect, parent._drawTitleDivider
   parent.gameOverBtnImages, parent.failWitchImg
```

---

## 四、点击区域汇总表

| Rect 名称 | 写入位置 | 读取位置（handleInput） |
|-----------|---------|------------------------|
| `guideDialogRect` / `guideNextBtnRect` | `_drawGuideOverlay` | game.js 主引导点击 |
| `shopGuideDialogRect` / `shopGuideNextBtnRect` | `_drawShopGuideOverlay` | game.js 商店引导点击 |
| `cardBookGuideDialogRect` / `cardBookGuideNextBtnRect` | `_drawCardBookGuideOverlay` | game.js 图鉴引导点击 |
| `cardBookIconRect` | `_drawCardBookIcon` | game.js 打开图鉴 |
| `cardBookPanelRect` / `cardBookLeftRect` / `cardBookRightRect` | render() cardBook 弹窗 | game.js 图鉴翻页/关闭 |
| `topIconRect` | `drawTopHeader` | game.js（未使用？） |
| `hudWitchAvatarRect` | `drawHUD` | game.js 打开女巫详情 |
| `witchPropRects[]` | `drawPlaying` 道具栏 | game.js 女巫牌/药水点击 |
| `cardRects[]` | `drawPlaying` 卡牌区 | game.js 手牌点击/选中 |
| `challengeBtnRect` / `discardBtnRect` / `resetBtnRect` | `drawPlaying` 底部按钮 | game.js 出牌/弃牌/清空 |
| `leftBoxRect` / `rightBoxRect` | `drawPlaying` 分数方块 | game.js 调试用 |
| `witchDetailPopupCloseRect` | `_drawWitchDetailPopup` | game.js 关闭详情 |
| `changeLetterRects[]` / `changeLetterCancelRect` | `drawChangeLetterPopup` | game.js 字母置换 |
| `potionStartRect` / `potionCancelRect` | `drawPotion` | game.js 药水页面 |
| `randomUpgradeCloseRect` | `drawRandomUpgradePopup` | game.js 关闭随机强化 |
| `lifeExtensionBtnRect` | `_drawLifeExtensionPopup` | game.js 生命延续确定 |
| `restartBtnRect` / `rankBtnRect` / `reviveBtnRect` | `GameOverRenderer.draw` | game.js 游戏结束按钮 |
| `debugMenuRects[]` | `_drawDebugMenu` | game.js 调试菜单 |
| `shopRenderer.shopItemRects[]` | `ShopRenderer.draw` | game.js 商店商品点击 |
| `shopRenderer.shopOwnedPropRects[]` | `ShopRenderer.drawOwnedProps` | game.js 已购买道具点击 |
| `confirmBuyRenderer.confirmBuyBtnRect` | `ConfirmBuyRenderer.draw` | game.js 确认购买 |

---

## 五、状态机与 render() 绘制流程

```
render(game)
├── 清屏 + 背景
├── switch game.state:
│   ├── playing:
│   │   ├── drawHUD()              ← 回合/目标分/金币/女巫头像
│   │   ├── drawPlaying()          ← 道具栏/预览/方块/卡牌/按钮
│   │   ├── _drawLetterGodAnim()   ← 字母之神飞星（如有）
│   │   ├── drawChangeLetterPopup() ← 字母置换弹窗（如有）
│   │   └── _drawHintToast()       ← 顶部提示（如有）
│   ├── settlement:
│   │   ├── drawHUD()              ← 保留背景
│   │   └── settlementRenderer.draw()
│   ├── witch_reward:
│   │   ├── drawHUD()
│   │   └── witchRewardRenderer.draw()
│   ├── shop:
│   │   ├── drawTopHeader()        ← 标题 + 金币
│   │   ├── _drawCardBookIcon()    ← 图鉴入口
│   │   ├── shopRenderer.draw()    ← 商店主体
│   │   ├── confirmBuyRenderer.draw() ← 确认弹窗（如有）
│   │   ├── _drawShopGuideOverlay()   ← 商店引导（如有）
│   │   └── _drawCardBookGuideOverlay() ← 图鉴引导（如有）
│   ├── potion:
│   │   └── drawPotion()
│   ├── life_extended:
│   │   ├── drawHUD()
│   │   ├── drawPlaying()
│   │   └── _drawLifeExtensionPopup()
│   └── gameover:
│       ├── drawHUD()
│       ├── drawPlaying()
│       └── gameOverRenderer.draw()
│
├── updateAnimations()
├── _updateAndDrawSparkles()       ← 全局烟花粒子
├── _updateAndDrawFlyingScore()    ← 飞行分数
├── _shopToGameTransition 遮罩     ← 页面过渡（如有）
├── _drawCloudDebugLogs()          ← 调试日志
│
├── _drawGuideOverlay()            ← 主引导（最上层）
├── cardBookOpen 弹窗              ← 图鉴（最上层之一）
└── (end)
```

---

## 六、待拆解建议（按业务模块）

基于以上分析，`renderer.js` 可拆解为以下文件（放到 `js/render/` 目录）：

| 文件 | 包含内容 | 预估行数 |
|------|---------|---------|
| `base.js` | Renderer 构造函数、资源加载、基础工具（roundRect/text/button/hitTest/drawCard/drawBtnImage）、预加载页 | ~600 |
| `hud.js` | drawTopHeader、drawHUD、_drawCoinCapsuleAt、_drawHintToast | ~400 |
| `playing.js` | drawPlaying（道具栏/预览/方块/卡牌/按钮） | ~1200 |
| `guide.js` | 三套引导覆盖层（_drawGuideOverlay/_drawShopGuideOverlay/_drawCardBookGuideOverlay） | ~700 |
| `cardbook.js` | _drawCardBookIcon、_drawCardBookDetail、cardBook 弹窗绘制 | ~400 |
| `popup.js` | drawChangeLetterPopup、drawPotion、drawRandomUpgradePopup、_drawLifeExtensionPopup、_drawWitchDetailPopup | ~900 |
| `animation.js` | 粒子系统（spawnSparkles/updateAndDrawSparkles/starBurst）、_drawCardGlow、_drawGentleStars、_drawLetterGodAnim、_drawPotionUpgradeAnim、飞分动画 | ~500 |
| `effects.js` | _drawPropCard、_drawEmptySlot、星辰粒子（create/update）、_drawLashBorder、_drawFancyLabel、_drawScaledButton、_drawTitleDivider、_drawModalPanel | ~700 |
| `debug.js` | _drawDebugMenu、_drawCloudDebugLogs | ~200 |
| `gameover.js` | GameOverRenderer 类 | ~250 |

> 注：`render()` 主调度方法保留在入口文件中，或单独放入 `render_dispatcher.js`。
