# 小游戏内存优化方案 —— 针对「主页静止时内存超过 1024M」

> 文档版本：v1.0  
> 分析日期：2026-06-24  
> 分析范围：`game.js`、`js/game.js`、渲染模块、`js/cloud_storage.js`、词库、音频、动画粒子系统  

---

## 一、问题结论（ TL;DR ）

当前小游戏在 **homepage（主页）且用户未做任何操作** 时，仍然会占住大量内存，
触发微信小游戏 >1024M 的内存告警。核心原因不是主页本身在"跑逻辑"，而是：

1. **启动预加载把所有云图片/音频一次性装进内存**，且进入主页后没有释放；
2. **2.1 万条扩展词库在启动时全量加载并常驻 JS 堆**；
3. **高分屏 Canvas + 开放域 sharedCanvas 双缓冲占用大**；
4. **音频、图片在 `cloudStorage` 与 `renderer` 中双份引用**，GC 回收慢；
5. **主页阶段其实仍持有完整的 `Game` 实例**，音频管理器已经创建并预加载了全部音效。

这些资源叠加后，在中高端机（DPR 3 的 iPhone / 高分辨率安卓）上很容易接近或超过 1GB，
微信的内存告警因此弹出。

---

## 二、现状数据盘点

### 2.1 静态资源体积（本地包）

| 目录 | 体积 | 说明 |
|------|------|------|
| `images/` | ~1.6 MB | 本地 UI、按钮、预加载页背景等 |
| `music/` | ~28 KB | BGM + 音效（实际运行时会从云端再下载缓存） |
| `js/expand_words.js` | 831 KB | 21,000 条扩展词，启动即加载 |
| `js/words.js` | 166 KB | ~2,000 条核心词，启动即加载 |
| `js/render/` 等代码 | ~300 KB | 渲染、动画、弹窗逻辑 |

> 注意：`images/shop_card/`、`images/bg_icon/`、`images/witch/` 本地基本为空，
> 实际资源全部来自**云存储**，运行时下载。云图的真实像素尺寸未知，
> 但从代码中精灵图坐标（`360×360` 单帧、`1440×1440` 精灵图）来看，高清素材内存占用不容小觑。

### 2.2 启动时即常驻内存的大对象

| 对象 | 位置 | 估算内存 | 备注 |
|------|------|----------|------|
| `WORD_DATA` / `EXPAND_WORD_DATA` | `js/data.js` | 20–40 MB | 23,000 条词库 Map |
| `shopCardImages` | `cloudStorage` + `renderer` | 10–50 MB | 45+ 张商店卡 |
| `bgIconImages` | `cloudStorage` + `renderer` | 20–80 MB | 含背景、主页按钮、卡牌模板等 |
| `witchCardImages` | `cloudStorage` + `renderer` | 0–150 MB | 取决于已收集女巫卡数量 |
| `guideSpritesheets` | `cloudStorage` + `renderer` | 0–35 MB | 4 张 1440×1440 精灵图 |
| 主 Canvas + sharedCanvas | `game.js` | 20–50 MB | 按 DPR 放大，上限 1280×2560 |
| `AudioManager.sounds` + BGM | `js/audio.js` | 30–100 MB | 30 个 InnerAudioContext |
| `Game` 实例状态 | `js/game.js` | 5–15 MB | 牌堆、手牌、动画、各种弹窗状态 |

**合计（中高档设备）**：200–500 MB 是常态，若云图高清或设备 DPR 高，逼近 1GB 并不意外。

---

## 三、根因逐条分析

### 3.1 启动预加载策略过于激进

**代码位置**：`game.js:startPreload()`（第 480 行起）

```js
await cloudStorage.preloadShopCardImages(onProgress);
await cloudStorage.preloadBgIconImages(onProgress);
if (needGuide) {
  await cloudStorage.preloadGuideGroup(1, renderer);
  await cloudStorage.preloadGuideGroup(2, renderer);
}
await cloudStorage.preloadMusicFiles(onProgress);
if (collectedWitchCards.length > 0) {
  await Promise.all(collectedWitchCards.map(level =>
    cloudStorage.preloadWitchCardForLevel(level, renderer)
  ));
}
```

**问题**：
- 进入主页前，**所有**商店卡、所有背景图标、所有音效已经加载完成；
- `witch_card` 只要有收集记录就一次性全部加载；
- 这些资源进入主页后**不会被卸载**，即使玩家只是看看主页。

### 3.2 词库全量常驻

**代码位置**：`js/data.js` 第 28–29 行

```js
const { WORD_DATA } = require('./words');
const { EXPAND_WORD_DATA } = require('./expand_words');
```

`js/game.js`、`js/data.js` 以及所有依赖它们的模块启动时就把 2.1 万条词全部加载。
`hasValidWordInHand`、`findAllValidWordsInHand` 等校验函数会反复遍历这些 Map，
但更严重的是它们**永不释放**。

### 3.3 Canvas / sharedCanvas 双缓冲大

**代码位置**：`game.js` 第 434–446 行

```js
const dpr = info.pixelRatio || 1;
const scaleDpr = Math.min(dpr, MAX_CANVAS_WIDTH / WIDTH, MAX_CANVAS_HEIGHT / HEIGHT);
canvas.width = Math.floor(WIDTH * scaleDpr);
canvas.height = Math.floor(HEIGHT * scaleDpr);
ctx.scale(scaleDpr, scaleDpr);
```

- iPhone 15 Pro Max 等 DPR=3 设备上，主 Canvas 可达 `1182×2563`（约 12MB 帧缓冲）；
- 开放域 `sharedCanvas` 在 `showRankList()` 中被设为同样大小（`game.js` 第 154–161 行），
  即使排行榜没打开，它也保持该尺寸；
- 两个 Canvas 同时存在，高分辨率机型负担翻倍。

### 3.4 图片双份引用

以 `shopCardImages` 为例：

1. `cloudStorage.preloadShopCardImages()` 下载后存到 `cloudStorage.shopCardImages`；
2. `cloudStorage.injectToRenderer(renderer)` 再把这些对象赋给 `renderer.shopCardImages`。

虽然图片像素数据可能共享，但 JavaScript 层同时保留两份对象引用 + 大量 `{ img, loaded, width, height }` 包装对象，
会导致 GC 无法及时回收，且 `existing.img.src = ''` 的释放逻辑只在 `cloudStorage` 层，
`renderer` 里仍持有 Image 引用。

### 3.5 音频预加载过早

**代码位置**：`js/game.js:Game.constructor()` 第 1150–1151 行

```js
this.audioManager = new AudioManager();
this.audioManager.preloadAll();
```

`preloadAll()` 会创建约 30 个 `wx.createInnerAudioContext()` 实例（`js/audio.js` 第 217 行）。
InnerAudioContext 是原生对象，每个都会占用内存和音频句柄。
在 homepage 阶段玩家可能根本还没点开始游戏，但这些实例已经存在。

### 3.6 Game 实例在 homepage 阶段已经存在

`startPreload()` 完成后会调用 `startGame()`，创建完整 `Game` 实例（第 603 行起）。
homepage 只是为了展示入口，但游戏逻辑对象、牌堆、动画管理器、音频管理器已经全部构建。
这意味着 homepage 阶段的内存基线 = 游戏运行时的内存基线。

### 3.7 粒子/动画系统总体可控，但仍有小坑

- `sparkles` 数组会 `filter` 掉已死亡粒子（`js/render/animation.js:53`），不会无限增长；
- `flyingScore` 是单例（`js/render/animation.js:88`），不会累积；
- `cloudStorage.debugLogs` 限制 30 条（`js/cloud_storage.js:303`），可控；
- `wordMeaningCache` / `onlineWordCache` 使用 `LimitedSet/Map`，可控。

**结论**：动画粒子不是当前 1024M 告警的主因，但应在后续改造中保持警惕。

---

## 四、优化方案

### 4.1 短期可落地的「止血」措施（1–3 天）

#### 4.1.1 降低 Canvas 上限，减少高分屏帧缓冲

```js
// game.js
const MAX_CANVAS_WIDTH = 960;   // 从 1280 下调
const MAX_CANVAS_HEIGHT = 1920; // 从 2560 下调
```

在 iPhone DPR=3 上，scaleDpr 会从 2.75 降到约 2.0，Canvas 像素减少约 45%。
对文字/矢量 UI 的清晰度影响很小，但能显著降低显存/GPU 内存。

#### 4.1.2 排行榜 sharedCanvas 按需设置尺寸

当前 `showRankList()` 一上来就把 `sharedCanvas` 设成和主 Canvas 一样大。
应改为只在真正展示好友榜时设置，且可以按 panel 内容区域裁剪，不必全屏。

```js
// 只在 showRankList 且 friend tab 时设置
if (game._rankTab === 'friend') {
  sharedCanvas.width = Math.min(canvas.width, 800);
  sharedCanvas.height = Math.min(canvas.height, 1200);
}
```

#### 4.1.3 音频延迟/按需加载

把 `AudioManager.preloadAll()` 从 `Game.constructor` 移到**玩家点击「通关模式」或「对战模式」之后**。
homepage 阶段只保留一个极小的「点击音效」实例即可。

```js
// Game.constructor 中去掉 this.audioManager.preloadAll();
// 进入 playing 前调用：
this.audioManager.preloadAll(this.cloudStorage);
this.audioManager.tryStartBGM();
```

同时建议给 `AudioManager.destroy()` 增加更彻底的清理：

```js
destroy() {
  Object.values(this.sounds).forEach(audio => {
    try {
      audio.stop();
      audio.src = '';     // 释放音频资源
      audio.destroy();
    } catch (e) {}
  });
  this.sounds = {};
  // BGM 同理
}
```

#### 4.1.4 主页不预加载全部 `witch_card`

`collectedWitchCards` 可能在存档恢复时被全部加载（`game.js` 第 581–587 行）。
主页阶段玩家不一定立刻进游戏，建议：

- homepage 阶段只加载当前/下一回合会用到的 `witch_card`；
- 图鉴弹窗打开时再分页加载；
- 已收集卡牌先用占位图 + 名字展示，大图懒加载。

#### 4.1.5 云图加载降并发、加尺寸上限

`preloadShopCardImages`、`preloadBgIconImages` 已使用 batchSize=5/6，
但缺少**下载后缩放/压缩**。若云端原图很大，建议在加载时：

- 对非全屏 UI 图片限制最大解码尺寸（如 512×512），
- 或在上传/构建阶段把大图压缩到合理尺寸。

这是成本最低但效果最显著的优化：图片内存 = 宽 × 高 × 4。

---

### 4.2 中期结构性优化（1–2 周）

#### 4.2.1 词库按需加载 / 分片

把 `EXPAND_WORD_DATA` 从启动加载改为**按长度分片**或**按首字母分片**：

- 核心 2000 词（`words.js`）保留常驻；
- 扩展 2.1 万词按 `word.length` 拆成 `words_3.js`、`words_4.js` … `words_10.js`；
- `isValidWord()` 先查核心库，再按需加载对应长度扩展库；
- 校验手牌能组成的单词时，根据手牌最大长度只加载必要分片。

预估收益： homepage 阶段 JS 堆可减少 20–40 MB。

#### 4.2.2 主页与游戏状态分离

当前 `Game` 实例在 homepage 之前就被创建，导致音频、牌堆、对战管理器全部提前初始化。
建议引入一个轻量的 `HomepageSession`，仅在点击开始游戏后才创建 `Game`：

```
启动 → CloudStorage（轻量）
      → Renderer（轻量）
      → HomepageSession（无音频、无牌堆）
      → 点击开始 → 创建 Game（音频/牌堆/动画全开）
```

这样 homepage 阶段不会持有 `AudioManager`、不会加载全部音效、不会创建 `BattleManager`。

#### 4.2.3 图片引用去重与统一释放

建议用资源句柄模式：

```js
// 统一资源池
class AssetPool {
  constructor() { this.assets = new Map(); }
  load(name, loader) { /* 只加载一次 */ }
  release(name) { this.assets.delete(name); }
  releaseAll(pattern) { /* 正则批量释放 */ }
}
```

`renderer` 不再持有独立 `shopCardImages` 等对象，而是从 `AssetPool` 按名读取。
离开 shop、关闭图鉴、返回主页时，可以显式释放对应资源。

#### 4.2.4 音效实例池

当前每个音效一个独立 `InnerAudioContext`，30 个实例常驻。
可以改为：

- 通用短音效复用 4–6 个 `InnerAudioContext` 实例池；
- 只有 BGM 和循环音效单独持有实例；
- 播放前重置 `src` 和 `seek`。

能显著减少原生音频句柄和内存占用。

#### 4.2.5 增加内存监控与上报

在真机调试中增加内存采样：

```js
if (wx.getPerformance) {
  const perf = wx.getPerformance();
  const memory = perf.getMemoryInfo();
  console.log('[Memory] used:', memory.used, 'total:', memory.total);
}
```

在关键节点上报：
- 预加载完成时
- 进入 homepage 时
- 打开图鉴/商店/排行榜时
- 收到 `wx.onMemoryWarning` 时

便于持续观察优化效果。

---

## 五、推荐改造优先级

| 优先级 | 优化项 | 预期收益 | 工作量 |
|--------|--------|----------|--------|
| P0 | 下调 Canvas / sharedCanvas 上限 | 显著降低显存 | 5 分钟 |
| P0 | 主页不创建 `Game`、不预加载全部音效 | 降低 50–100 MB | 半天 |
| P0 | 云图上传/加载尺寸控制 | 可能降低数百 MB | 需美术/构建配合 |
| P1 | 词库分片按需加载 | 降低 20–40 MB JS 堆 | 1 天 |
| P1 | `witch_card` 懒加载 | 降低 0–150 MB | 半天 |
| P1 | 音效实例池化 | 降低音频句柄/内存 | 1 天 |
| P2 | 资源统一池与显式释放 | 长期防止内存泄漏 | 2–3 天 |
| P2 | 内存监控上报 | 持续观测 | 半天 |

---

## 六、验证方法

1. 在微信开发者工具 → 真机调试 → Performance 中观察：
   - `getMemoryInfo().used` 在 homepage 阶段数值；
   - 预加载完成前后的内存曲线；
   - 打开/关闭图鉴、商店时的内存变化。

2. 使用 `wx.onMemoryWarning` 监听内存告警级别：
   ```js
   wx.onMemoryWarning((res) => {
     console.warn('[MemoryWarning]', res.level);
     // 上报到服务器
   });
   ```

3. 逐条验证优化项：
   - 改 Canvas 上限后，比较 `canvas.width/height` 变化；
   - 延迟音频预加载后，homepage 阶段 `AudioManager.sounds` 应为空或极少；
   - 词库分片后，homepage 不应加载 `expand_words`。

---

## 七、当前代码里的「好习惯」与「坏味道」

### 值得保留的好习惯

- `LimitedSet/LimitedMap` 对在线词缓存做了容量限制（`js/data.js:32–61`）。
- 图片加载使用 `existing.img.src = ''` 尝试释放旧纹理。
- 云图加载分 batch（`batchSize=5/6`），避免瞬间并发爆炸。
- `renderer.resetState()` 清理了 sparkles、flyingScore 等动画状态。
- `Game.destroy()` 会清理音频和动画。

### 需要修正的坏味道

- `Game` 实例在 homepage 之前创建，homepage 基线过高。
- 音频 `preloadAll()` 发生在构造函数，无法延迟。
- `sharedCanvas` 默认全屏尺寸，未按需设置。
- 词库全量 `require`，无按需加载。
- 同一张图在 `cloudStorage` 和 `renderer` 中双份对象引用。
- 大量 `setTimeout` 散落在 `game.js` 中，建议统一由 `Game._clearAllTimeouts()` 管理。

---

## 八、总结

> **homepage 弹 1024M 告警，不是 homepage 本身在泄漏，而是「启动即全量加载」的设计让主页阶段就背上了游戏运行时的全部资源。**

最快速见效的三件事：
1. **降 Canvas 上限**（代码 5 分钟）；
2. **主页不创建 Game、不预加载音效**（半天）；
3. **控制云图实际解码尺寸 / 上传尺寸**（需要美术/构建配合，收益最大）。

中长期则需要把「全量常驻」改成「按需加载 + 显式释放」，
尤其是词库分片和统一的资源池。

---

## 附录：关键代码定位速查

| 功能 | 文件 | 行号 |
|------|------|------|
| 启动预加载 | `game.js` | 480–601 |
| Canvas 尺寸设置 | `game.js` | 434–446 |
| sharedCanvas 设置 | `game.js` | 153–162 |
| Game 构造函数 | `js/game.js` | 1147–1350 |
| Game.destroy | `js/game.js` | 1822–1842 |
| 音频预加载 | `js/audio.js` | 185–223 |
| 音频销毁 | `js/audio.js` | 154–172 |
| 词库引用 | `js/data.js` | 28–29 |
| 云图批量加载 | `js/cloud_storage.js` | 380–441, 1312–1335 |
| 图片注入 renderer | `js/cloud_storage.js` | 741–764, 1499–1619 |
| homepage 渲染 | `js/render/base.js` | 901–1157 |
| 粒子更新 | `js/render/animation.js` | 50–85 |
| 主循环 | `game.js` | 3536–3587 |
