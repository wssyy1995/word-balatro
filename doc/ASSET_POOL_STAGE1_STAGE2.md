# 统一资源池与事件点预加载开发文档

> 阶段 1：统一资源读取，消除 `cloudStorage → renderer` 双引用  
> 阶段 2：事件点按需预加载，替换启动期全量预加载  
> 版本：v1.0  
> 日期：2026-06-24  

---

## 一、背景与目标

### 1.1 当前问题

小游戏在 homepage 静止状态下触发 >1024M 内存告警。根因之一是**启动期预加载策略过于激进**：

- `startPreload()` 在进入主页前加载了所有 `shop_card`、所有 `bg_icon`、所有 music、引导精灵图等；
- 加载后的图片同时被 `CloudStorageManager` 和 `Renderer` 持有引用；
- 用户进入主页后，大量当前场景不需要的资源（如 shop_card、rank_avatar、witch_card）仍然常驻内存。

### 1.2 本次目标

通过阶段 1 + 阶段 2 的改造，实现：

1. **`CloudStorageManager` 成为唯一的图片资源池**，`Renderer` 不再持有独立的图片 map；
2. **启动期只加载 homepage 必需资源**；
3. **shop_card、rank_avatar、witch_card、游戏场景 bg_icon 等按事件点预加载**；
4. **用户无明显感知**，但 homepage 阶段内存显著下降。

### 1.3 不在本次范围内的内容

- 不实现场景切换后的「显式释放」（阶段 3）。本次只减少「不该加载的不要加载」；
- 不改词库加载策略；
- 不延迟 `Game` 实例创建；
- 不调整 Canvas 尺寸（已在另一轮优化中完成）。

---

## 二、现状架构分析

### 2.1 当前数据流

```
启动
  │
  ▼
startPreload()
  │
  ├── cloudStorage.preloadShopCardImages() ──┐
  ├── cloudStorage.preloadBgIconImages() ────┤
  ├── cloudStorage.preloadGuideGroup() ──────┤ → 全部存到 cloudStorage 各 map
  ├── cloudStorage.preloadMusicFiles() ──────┤
  └── cloudStorage.preloadWitchCardForLevel()┘
  │
  ├── cloudStorage.injectToRenderer(renderer)  → 把 cloudStorage 里的对象引用赋给 renderer
  ├── cloudStorage.injectBgIconToRenderer(renderer)
  ├── cloudStorage.injectWitchCardToRenderer(renderer)
  └── cloudStorage.injectGuideToRenderer(renderer)
  │
  ▼
startGame() / showHomepage
```

### 2.2 当前双引用示意

```js
// cloudStorage 加载后
cloudStorage.shopCardImages['life_extension'] = { img, loaded: true, width, height };

// injectToRenderer 后
renderer.shopCardImages['life_extension'] = cloudStorage.shopCardImages['life_extension'];
// ↑ 同一个对象，两处引用
```

### 2.3 当前 Renderer 中的读取方式

```js
// js/render/base.js / popup.js / playing.js 等
const data = this.shopCardImages[name];
if (data && data.loaded && data.img) {
  ctx.drawImage(data.img, x, y, w, h);
}
```

### 2.4 当前预加载范围

| 资源 | 加载时机 | 大小/数量 |
|------|----------|-----------|
| `shop_card` | `startPreload` | ~45 张 |
| `bg_icon` | `startPreload` | ~26 张（含 homepage、游戏、商店、对战） |
| `witch_card` | `startPreload`（仅已收集） | 0–26 张 |
| `guide` 精灵图 | `startPreload`（仅新用户） | 4 张大图 |
| `music` | `startPreload` | ~30 个文件 |
| `rank_avatar` | `startGame` | 4 张 |
| `witch` 头像 | 游戏内按需 | 当前/下一回合 |

---

## 三、目标架构设计

### 3.1 阶段 1：统一资源读取

```
CloudStorageManager（唯一资源池）
  │
  ├── shopCardImages
  ├── bgIconImages
  ├── witchImages
  ├── witchCardImages
  ├── guideImages / guideSpritesheets
  └── rankAvatarImages
  │
  ▼ 通过 getter 读取
Renderer
  │
  └── this.cloudStorage.getImage(name)
```

**核心改变**：
- `Renderer` 不再创建 `shopCardImages`、`witchCardImages` 等占位 map；
- `Renderer` 通过 `cloudStorage.getImage(name)` 等 getter 读取；
- 逐步废弃 `injectToRenderer`、`injectBgIconToRenderer` 等注入方法。

### 3.2 阶段 2：事件点预加载

```
启动期 (startPreload)
  │
  ├── 预加载 homepage 必需 bg_icon
  ├── 预加载 music
  └── 预加载 guide（如果需要）
  │
  ▼ 显示 homepage

用户点击「通关模式」/「对战模式」
  │
  ▼ 页面翻转动画期间
  ├── 预加载游戏场景 bg_icon（bg、card_template、card_book、score_line 等）
  └── 预加载当前/下一回合 witch 头像

进入 settlement
  │
  ▼ 结算弹窗停留期间
  └── 预加载 shop_card

用户打开排行榜
  │
  ▼ 弹窗打开期间
  └── 预加载 rank_avatar

用户打开卡牌图鉴
  │
  ▼ 弹窗打开期间
  └── 预加载已收集 witch_card
```

---

## 四、具体开发任务清单

### 任务 1：为 CloudStorageManager 增加统一 getter（阶段 1）

文件：`js/cloud_storage.js`

新增方法：

```js
getImage(name) { return this.shopCardImages[name] || null; }
getWitchImage(name) { return this.witchImages[name] || null; }
getWitchCardImage(name) { return this.witchCardImages[name] || null; }
getBgIconImage(name) { return this.bgIconImages[name] || null; }
getGuideSpritesheet(groupKey) { return this.guideSpritesheets[groupKey] || null; }
getRankAvatarImage(name) { return this.rankAvatarImages[name] || null; }
```

### 任务 2：Renderer 持有 cloudStorage 引用（阶段 1）

文件：`js/render/base.js`

- 在 `Renderer` 类中增加 `this.cloudStorage = null;`；
- 提供 `setCloudStorage(cs)` 方法；
- 在 `game.js` 中 `cloudStorage` 创建后调用 `renderer.setCloudStorage(cloudStorage)`。

### 任务 3：替换 Renderer 中的图片读取方式（阶段 1）

需要修改的文件：

| 文件 | 当前读取方式 | 目标读取方式 |
|------|-------------|-------------|
| `js/render/base.js` | `this.shopCardImages[name]` | `this.cloudStorage.getImage(name)` |
| `js/render/base.js` | `this.witchCardImages[name]` | `this.cloudStorage.getWitchCardImage(name)` |
| `js/render/base.js` | `this.witchAvatars[name]` | `this.cloudStorage.getWitchImage(name)` |
| `js/render/base.js` | `this.homepageBg` 等 homepage 图 | `this.cloudStorage.getBgIconImage('homepageBg')` 等 |
| `js/render/base.js` | `this.bgImage` | `this.cloudStorage.getBgIconImage('bg')` |
| `js/render/index.js` / `playing.js` / `popup.js` / `hud.js` / `cardbook.js` / `shop.js` 等 | 各种 `this.xxxImages[name]` | 对应 getter |

### 任务 4：移除 Renderer 中的占位 map 创建（阶段 1）

文件：`js/render/base.js`

移除或注释掉：

```js
this.shopCardImages = {};
// ... 遍历 SHOP_POOL 创建占位

this.witchAvatars = {};
// ... 遍历 WITCH_SKILLS 创建占位

this.witchCardImages = {};
// ... 遍历 WITCH_SKILLS 创建占位

this.homepageBg = null;
this.homepageRound = null;
// ... 等 homepage 图片字段

this.bgImage = null;
this.cardBookImage = null;
this.cardTemplate = null;
// ... 等 bg_icon 字段
```

### 任务 5：移除/改造 cloudStorage 的 inject 方法（阶段 1）

文件：`js/cloud_storage.js`

- `injectToRenderer` → 改为仅内部调试日志，或删除；
- `injectBgIconToRenderer` → 改为仅内部调试日志，或删除；
- `injectWitchToRenderer` → 删除（当前未使用）；
- `injectWitchCardToRenderer` → 删除；
- `injectGuideToRenderer` → 删除；
- `injectRankAvatarToRenderer` → 删除。

> 注意：这些 inject 方法目前没有实际业务逻辑作用，只是做引用复制。删除后，
> 只要 Renderer 通过 getter 读取，功能不变。

### 任务 6：拆分 bg_icon 预加载（阶段 2）

文件：`js/cloud_storage.js`

新增方法：

```js
async preloadHomepageBgIcons(onProgress = null) {
  // 只加载 homepage 相关的 bg_icon
  const homepageNames = ['homepageBg', 'homepageRound', 'homepageBattle', 'homepageSetting', 'homepageRanking', 'homepageDaily', 'homepageStudy', 'topHome'];
  // ...
}

async preloadGameBgIcons(onProgress = null) {
  // 加载游戏场景需要的 bg_icon
  const gameNames = ['bg', 'card_book', 'card_template', 'card_template_selected', 'card_template_upgrade', 'card_template_upgrade_selected', 'score_line', 'shop_card_bar_witch', 'shop_card_bar_crystal', 'shop_card_bar_potion', 'battle_player', 'battle_round_badge', 'battle_vs', 'discount_spritesheet', 'buy_tip', 'share_tip', 'share_tip_limit', 'card_bar'];
  // ...
}
```

改造 `preloadBgIconImages` 为可选的「全量加载」方法，或拆分为上述两个方法。

### 任务 7：改造 startPreload，只加载 homepage 必需资源（阶段 2）

文件：`game.js`

修改 `startPreload()`：

```js
// 移除
// await cloudStorage.preloadShopCardImages(onProgress);
// await cloudStorage.preloadBgIconImages(onProgress);

// 改为
await cloudStorage.preloadHomepageBgIcons(onProgress);
await cloudStorage.preloadMusicFiles(onProgress);
if (needGuide) {
  await cloudStorage.preloadGuideGroup(1, renderer);
  await cloudStorage.preloadGuideGroup(2, renderer);
}
// 不再预加载 shop_card 和 rank_avatar
// witch_card 也不预加载，进游戏后/开图鉴时再加载
```

### 任务 8：在 startGame / 页面翻转时预加载游戏 bg_icon（阶段 2）

文件：`game.js`

在 `startGame()` 中，创建 `Game` 实例后调用：

```js
game.cloudStorage.preloadGameBgIcons().then(() => {
  console.log('[Preload] 游戏场景 bg_icon 加载完成');
});
```

或者在页面翻转动画开始时调用，利用动画时间完成加载。

### 任务 9：在 settlement 时预加载 shop_card（阶段 2）

文件：`js/game.js` `_showSettlement()`

在 `this.state = 'settlement';` 之后：

```js
if (this.cloudStorage && !this._shopCardsPreloaded) {
  this._shopCardsPreloaded = true;
  this.cloudStorage.preloadShopCardImages().catch(err => {
    console.error('[Preload] shop_card 预加载失败:', err);
  });
}
```

### 任务 10：在打开排行榜时预加载 rank_avatar（阶段 2）

文件：`game.js` `showRankPopup()` 或 `handleGlobalTabEnter()`

在切换到全国榜或打开排行榜弹窗时：

```js
if (game && game.cloudStorage && !game._rankAvatarPreloaded) {
  game._rankAvatarPreloaded = true;
  game.cloudStorage.preloadRankAvatarImages().then(() => {
    console.log('[Preload] rank_avatar 加载完成');
  });
}
```

### 任务 11：在打开卡牌图鉴时预加载 witch_card（阶段 2）

文件：`js/render/cardbook.js` 或 `js/game.js` 图鉴打开逻辑

```js
if (game && game.cloudStorage && game.collectedWitchCards.length > 0) {
  game.collectedWitchCards.forEach(level => {
    game.cloudStorage.preloadWitchCardForLevel(level, renderer);
  });
}
```

### 任务 12：添加加载状态/降级显示（阶段 2）

- 如果 shop_card 加载未完成时进入 shop，绘制 fallback（当前已有）；
- 如果 witch_card 加载未完成时打开图鉴，显示占位图 + 名字（当前已有）；
- 确保所有 `drawImage` 调用前都判断 `data && data.loaded && data.img`。

---

## 五、关键代码改造点详解

### 5.1 CloudStorageManager getter 实现

```js
// js/cloud_storage.js

class CloudStorageManager {
  // ... 现有代码 ...

  // ===== 统一资源读取接口 =====
  getImage(name) {
    return this.shopCardImages[name] || null;
  }

  getWitchImage(name) {
    return this.witchImages[name] || null;
  }

  getWitchCardImage(name) {
    return this.witchCardImages[name] || null;
  }

  getBgIconImage(name) {
    return this.bgIconImages[name] || null;
  }

  getGuideSpritesheet(groupKey) {
    return this.guideSpritesheets[groupKey] || null;
  }

  getGuideFrames(groupKey) {
    const group = this.guideImages[groupKey];
    return group ? group.frames : null;
  }

  getRankAvatarImage(name) {
    return this.rankAvatarImages[name] || null;
  }
}
```

### 5.2 Renderer 中读取方式的替换示例

以 `js/render/base.js` 中的 `drawShopCardIcon` 为例：

```js
// 修改前
Renderer.prototype.drawShopCardIcon = function(x, y, size, name) {
  const ctx = this.ctx;
  const data = this.shopCardImages[name];
  if (data && data.loaded && data.img) {
    ctx.drawImage(data.img, x, y, size, size);
  } else { ... }
};

// 修改后
Renderer.prototype.drawShopCardIcon = function(x, y, size, name) {
  const ctx = this.ctx;
  const data = this.cloudStorage ? this.cloudStorage.getImage(name) : null;
  if (data && data.loaded && data.img) {
    ctx.drawImage(data.img, x, y, size, size);
  } else { ... }
};
```

### 5.3 Renderer 移除占位 map 示例

```js
// 修改前
this.shopCardImages = {};
const shopCardNames = new Set();
Object.values(SHOP_POOL).forEach(pool => {
  pool.forEach(item => {
    const iconName = item.trigger || item.effect;
    if (iconName) shopCardNames.add(iconName);
  });
});
shopCardNames.forEach(name => {
  this.shopCardImages[name] = { img: null, loaded: false, width: 0, height: 0 };
});

// 修改后：完全删除这段代码
// shop_card 统一通过 cloudStorage.getImage(name) 读取
```

### 5.4 startPreload 改造示例

```js
// game.js:startPreload

// 读取已解锁的 witch_card（仅判断是否需要，不预加载）
let collectedWitchCards = [];
const raw = wx.getStorageSync('word_balatro_collected_witch_cards');
if (raw) { ... }

// 扫描 music
const fs = wx.getFileSystemManager();
const musicFiles = cloudStorage._scanMusicDir(fs, 'music');
const musicCount = musicFiles.length > 0 ? musicFiles.length : Object.keys(cloudStorage.musicFileMap).length;

// 只预加载 homepage 必需的 bg_icon + music + guide
const homepageBgIconNames = Object.keys(cloudStorage.homepageBgIconFileMap);
const total = homepageBgIconNames.length + musicCount + guideStepCount;

// ... onProgress 定义 ...

await cloudStorage.preloadHomepageBgIcons(onProgress);
await cloudStorage.preloadMusicFiles(onProgress);
if (needGuide) {
  await cloudStorage.preloadGuideGroup(1, renderer);
  onProgress();
  await cloudStorage.preloadGuideGroup(2, renderer);
  onProgress();
}

// 不再预加载 shop_card、rank_avatar、witch_card
// 这些资源移到对应事件点加载

preloadComplete = true;
startGame();
showHomepage = true;
```

### 5.5 settlement 预加载 shop_card 示例

```js
// js/game.js _showSettlement()

this.state = 'settlement';

// 2026-06-24 优化：结算弹窗出现时后台预加载商店卡牌
if (this.cloudStorage && !this._shopCardsPreloaded) {
  this._shopCardsPreloaded = true;
  this.cloudStorage.preloadShopCardImages().catch(err => {
    console.error('[Preload] shop_card 预加载失败:', err);
  });
}
```

### 5.6 页面翻转时预加载游戏 bg_icon 示例

```js
// game.js 中处理 homepage → playing 的页面翻转

function startPageFlipToGame(targetState = 'playing') {
  pageFlipState = {
    startTime: Date.now(),
    duration: PAGE_FLIP_DURATION,
    targetState,
    complete: false,
  };

  // 2026-06-24 优化：页面翻转期间后台加载游戏场景资源
  if (game && game.cloudStorage && !game._gameBgIconsPreloaded) {
    game._gameBgIconsPreloaded = true;
    game.cloudStorage.preloadGameBgIcons().catch(err => {
      console.error('[Preload] 游戏 bg_icon 预加载失败:', err);
    });
  }
}
```

---

## 六、风险与回滚方案

### 6.1 风险 1：某个场景图片还没加载完就进入

**表现**：用户看到 fallback 占位图或纯色块。

**缓解**：
- settlement → shop 有过渡时间，shop_card 通常能加载完；
- 如果未加载完，现有 fallback 逻辑会显示占位；
- 可在此类场景切换时加一个 100–200ms 的强制等待（不推荐，影响手感）。

### 6.2 风险 2：事件点预加载触发网络请求，弱网体验变差

**表现**：点击排行榜后半天出不来头像。

**缓解**：
- 当前图片已经通过 `getTempFileURL` + `wx.createImage()` 加载；
- 弱网问题是原本就存在的，本次只是把加载时机后移；
- 未来阶段 3 可把图片持久化到 `wx.env.USER_DATA_PATH`，避免临时链接过期。

### 6.3 风险 3：修改面广，遗漏某个读取点

**表现**：某个界面图片不显示。

**缓解**：
- 所有读取点统一改为 `this.cloudStorage.getXxx(name)`；
- 保留 `if (data && data.loaded && data.img)` 保护；
- 真机逐项测试：homepage、playing、shop、settlement、图鉴、排行榜、对战。

### 6.4 风险 4：openDataContext 好友榜绘制异常

**表现**：好友榜内容错位或空白。

**缓解**：
- openDataContext 主要依赖 `sharedCanvas` 和 `scaleDpr`，不受本次图片读取方式影响；
- 但 `sharedCanvas` 尺寸已在前一轮优化中调整，需验证好友榜 panel 模式。

### 6.5 回滚方案

如果改造后出现严重问题，可快速回滚：

1. 保留 git commit；
2. 一键 revert 本次提交；
3. 重新上传/编译。

建议分多次 commit：
- commit 1：增加 getter、renderer setCloudStorage、移除占位 map；
- commit 2：替换所有读取点；
- commit 3：事件点预加载；
- commit 4：startPreload 瘦身。

这样出问题可以逐步回滚。

---

## 七、验证方案

### 7.1 功能验证清单

| 场景 | 验证内容 | 通过标准 |
|------|----------|----------|
| 启动到 homepage | homepage 背景、按钮正常显示 | 无黑屏、无占位 |
| 点击通关模式 | 进入 playing，背景、卡牌模板正常 | 无黑屏 |
| 结算弹窗 | 显示正常，后台加载 shop_card | 控制台有加载日志 |
| 进入 shop | 所有 shop_card 图标正常显示 | 无大量占位 |
| 打开排行榜 | 全国榜 rank_avatar 正常 | 无头像缺失 |
| 打开卡牌图鉴 | 已收集 witch_card 正常显示 | 无黑块 |
| 对战模式 | 对战背景、VS 图标正常 | 无缺失 |
| 游戏结束 restart | 资源重新加载逻辑正常 | 不崩溃 |

### 7.2 内存验证

1. 真机调试中观察 `[MemorySample]` 日志；
2. 对比优化前后 homepage 阶段 `used` 数值；
3. 观察是否触发 `[MemoryWarning]`；
4. 重点观察：
   - 预加载完成进入 homepage 时；
   - settlement 弹窗出现后；
   - 进入 shop 后；
   - 打开图鉴后。

### 7.3 性能验证

1. 场景切换时是否有明显卡顿；
2. 图片加载是否造成帧率下降；
3. 弱网环境下图片 fallback 是否可接受。

---

## 八、预计工作量与产出

| 任务 | 预计时间 | 产出 |
|------|----------|------|
| 增加 getter / setCloudStorage | 30 分钟 | `cloud_storage.js` 新接口 |
| 替换 Renderer 读取点 | 2–3 小时 | `base.js` / `index.js` / `playing.js` 等 |
| 移除占位 map 和 inject 方法 | 1 小时 | 简化后的 Renderer / CloudStorage |
| 拆分 bg_icon 预加载 | 1 小时 | `preloadHomepageBgIcons` / `preloadGameBgIcons` |
| 事件点预加载改造 | 1–2 小时 | `game.js` / `js/game.js` 改造 |
| 真机测试与修复 | 2–3 小时 | 验证报告 |

**总计**：1–2 天。

---

## 九、长期方向（阶段 3）

本次完成后，下一步可做：

1. **图片持久化到本地缓存**
   - 把云图下载到 `wx.env.USER_DATA_PATH/image_cache`；
   - 避免临时 URL 过期问题。

2. **场景切换后显式释放**
   - 离开 shop 时释放 shop_card；
   - 离开图鉴时释放 witch_card；
   - 进入 playing 时释放 homepage 大图。

3. **引用计数或 LRU 缓存**
   - 对图片资源做引用计数；
   - 或使用 LRU 策略自动淘汰不常用资源。

---

## 十、总结

本次阶段 1 + 阶段 2 的核心是：

> **让 cloudStorage 成为唯一资源池，让 Renderer 按需读取；把「启动全加载」改成「事件点按需加载」。**

不实现真正的「释放」，但已经能显著降低 homepage 基线内存，且对用户几乎无感知。

完成后，小游戏在 homepage 阶段只持有：
- homepage 背景/按钮图；
- music；
- 当前必要状态。

shop_card、rank_avatar、witch_card、游戏场景 bg_icon 等大资源不再常驻 homepage。
