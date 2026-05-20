# Word Balatro 内存排查报告 V2

> 排查日期：2026-05-20
> 基于：微信开发者工具 Memory Heap Snapshot + Allocation Timeline

---

## 一、执行摘要

上一轮修复（`eda0c57`）解决了三个静态累积问题（Canvas 上限、floatingTexts 泄漏、缓存 LRU）。

但游戏运行中内存仍持续飙高至 1GB+。本轮排查通过 Heap Snapshot 分析，定位到**六大类内存问题**：

| 排名 | 类型 | 内存占用 | 根因 |
|------|------|---------|------|
| 1 | **Object 引用链** | ~103MB Retained | async Promise 闭包 + 渲染器状态累积 |
| 2 | **ArrayBuffer / JSArrayBufferData** | ~106MB | Canvas backbuffer + Image 像素数据 + 音频 |
| 3 | **源码字符串** | ~80MB | 打包后 bundle 膨胀 + expand_words.js 打包后 5.4MB |
| 4 | **拼接字符串 (ConsString)** | ~39MB | 每帧 `rgba()` / `fillText` 模板字符串 |
| 5 | **JSON 序列化** | 动态 | `saveProgress` 每次操作都 `JSON.stringify` |
| 6 | **日志字符串** | 动态 | `console.log` 在 DevTools 中持有引用 |

**核心结论**：内存暴涨不是单一泄漏点，而是**"打包膨胀 + Image/Canvas 原生内存 + 运行时对象/字符串持续产生"**的三重叠加。

---

## 二、Heap Snapshot 数据分析

### 2.1 第一次 Snapshot（String 视角）

```
(string)          x290478    Shallow: 80.4MB   Retained: 80.4MB
├─ 主 bundle 源码              30.3MB  ← 打包后的 game.js 及其所有依赖
├─ expand_words.js 源码         5.4MB  ← 原始 903KB，打包膨胀 6 倍
├─ 其他模块源码                 5.2MB
├─ renderer.js 源码             1.4MB  ← 原始 167KB，打包膨胀 8.5 倍
└─ 其他分散字符串              ~38MB
```

**关键发现**：`expand_words.js`（21,000 词条）被同时打包进 **30MB 主 bundle** 和 **独立的 5.4MB 模块字符串**，同一份词库内容在 JS 堆中存在**多份副本**。

### 2.2 第二次 Snapshot（Object 视角）

```
Object            x177544    Shallow: 4.5MB    Retained: 102.8MB  ← 冠军
(string)          x295336    Shallow: 81.4MB   Retained: 81.4MB
(compiled code)   x98798     Shallow: 4.8MB    Retained: 62.5MB
ArrayBuffer       x654       Shallow: 36KB     Retained: 52.9MB
JSArrayBufferData x610       Shallow: 52.9MB   Retained: 52.9MB
(concatenated string) x88447 Shallow: 1.8MB    Retained: 39.4MB
```

**关键发现**：
- **Object 的 Shallow 仅 4.5MB，但 Retained 高达 102.8MB** → 说明 Object 是引用链的"根"，挂着大量下级对象释放不了。
- **ArrayBuffer + JSArrayBufferData 共 106MB** → Canvas / Image / 音频的原生内存。
- **Concatenated String 88,447 个实例** → 代码里存在高频字符串拼接，产物未被及时 GC。

---

## 三、根因详查（按修复优先级）

### P0-1：打包源代码字符串膨胀（~44MB 固定占用）

**问题描述**：

`js/expand_words.js` 原始大小 **903KB**，被打包后膨胀为 **5.4MB** 的源代码字符串。更糟的是，它还被包含进 **30MB 的主 bundle** 中一份。

```
实际 JS 源码总量：~1.3MB
打包后内存占用：~44MB（膨胀 34 倍）
```

**膨胀原因**：
- 微信小游戏开发者工具的打包器会把每个模块包装成 `define("模块名", function(require, module, exports, process){...})`
- `expand_words.js` 内有 21,000 条 `['word', 'meaning']` 数组字面量，打包器无法压缩
- 词库作为 JS 模块，其**源代码字符串会永久驻留在 JS 堆**中（模块系统持有引用，无法 GC）

**影响**：这部分是"死内存"——一旦加载就占 44MB，且游戏运行时完全用不到源码字符串，只用执行后的 Map。

---

### P0-2：Image / ArrayBuffer 原生内存泄漏（~106MB）

**问题描述**：

代码中共有 **21 处 `wx.createImage()`** 调用：
- `renderer.js`：17 次（背景、卡牌模板、按钮、图标、女巫头像占位等）
- `cloud_storage.js`：4 次（`_loadCloudImage` ×2 + `_loadWitchImage` ×2，但实际会遍历所有云图片）

`wx.createImage()` 加载的图片在 Native 层解码为像素数据（RGBA），每张图片的内存占用 = `width × height × 4`。

**可疑点**：

1. **`cloud_storage.js` 重复加载**：
   ```js
   async _loadCloudImage(name) {
     // 每次调用都 new wx.createImage()
     const img = wx.createImage();
     img.src = urlData.tempFileURL;
     // ...
     this.shopCardImages[name] = { img, loaded: true, ... };
   }
   ```
   如果 `preloadShopCardImages()` 被多次调用（如云存储重试、调试菜单触发），会重复创建 Image 对象，旧的 Image 像素数据不被释放。

2. **`images/card_book.png` 高达 367KB**：
   如果这是一张高分辨率图片（如 1024×1024），解压后就是 **4MB** 像素数据。

3. **音频 ArrayBuffer**：
   `audio.js` 中 `wx.createInnerAudioContext()` 加载 12 个 mp3。虽然 mp3 是压缩格式，但解码后的 PCM 数据可能存储在 Native 层 ArrayBuffer 中。

4. **Canvas backbuffer**：
   上次修复限制了物理像素上限，但 iPhone 高 DPR（3x）下仍有约 9MB backbuffer。

---

### P1-1：Object 引用链泄漏（~103MB Retained）

**问题描述**：

Object 的 Shallow Size 仅 4.5MB，但 Retained 102.8MB，说明 Object 实例作为"根"引用了大量其他对象。排查发现以下引用链：

#### ① `lastPlayResult` 持有旧的计分结果对象

```js
// game.js 入口
game.playHand().then(result => {
  lastPlayResult = result;  // ← 全局变量长期持有 result 对象
});
```

`result` 对象包含：
```js
{ valid: true, score: 123, base: 100, mult: 2, word: 'hello', hasFace: false }
```

虽然 `restartGame()` 中 `lastPlayResult = null`，但如果用户在 `playHand()` 执行期间 restart，旧 Promise 返回后 `result` 会被赋给 `lastPlayResult`。此时如果 `lastPlayResult` 已经有值，旧值会被覆盖。但**旧 Promise 的闭包中可能还持有 `result` 引用**。

#### ② `async playHand()` 的 Promise 闭包持有旧 Game 实例

```js
async playHand() {
  // ...
  let valid = isValidWord(word);
  if (!valid) valid = await isValidWordOnline(word);  // ← 网络请求可能 1-3 秒
  
  // 如果用户在此期间 restart，旧 Promise 会继续执行：
  this.pendingCheck.state = 'valid';
  this.pendingCheck.result = result;
  this.pendingCheck.meaning = getWordMeaning(word);
  // ...
}
```

`await isValidWordOnline(word)` 期间如果 restart：
- 旧 Promise 的网络请求返回后，会修改**旧 Game 实例**的 `pendingCheck`
- `pendingCheck` 是一个复杂对象，持有 `cards`（卡牌数组）、`result`（计分对象）、`meaning`（释义对象）、`jokerTriggers`（数组）、`wholeWordJokers`（数组）
- 这些对象又引用卡牌对象、女巫牌对象等
- **只要 Promise 还没执行完，整个旧 Game 实例就通过 `this` 被闭包持有，无法 GC**

#### ③ `renderer` 子渲染器持有 `parent` 引用

```js
// settlement.js
class SettlementRenderer {
  constructor(renderer) {
    this.parent = renderer;  // ← 长期持有 renderer 引用
  }
}
```

`SettlementRenderer`、`WitchRewardRenderer`、`ShopRenderer`、`ConfirmBuyRenderer`、`GameOverRenderer` 都在 `Renderer` 的 constructor 中被创建，并持有 `this.parent = renderer`。虽然 `renderer` 是全局单例不泄漏，但如果子渲染器内部持有对 `game` 对象的引用（通过 `draw(ctx, game, ...)` 传入），在 draw 结束后是否清理？

检查发现：`SettlementRenderer.lastSettlementData` 会持有旧的 `settlement` 对象：
```js
if (!isClosing && this.lastSettlementData !== settlement) {
  this.animStartTime = Date.now();
  this.lastSettlementData = settlement;  // ← 持有 settlement 对象引用
}
```

`settlement` 对象是 `game.settlementData`，包含回合数、金币等数据。这个引用在 `renderer.resetState()` 中没有清理。

#### ④ `fetchChineseTranslation` 的后台异步翻译

```js
async function fetchChineseTranslation(word, enDef, pos) {
  // ...
  const transResp = await requestPromise({...});
  if (transResp.statusCode === 200) {
    const zhDef = transResp.data?.responseData?.translatedText;
    wordMeaningCache.set(word, { entries: [{ pos, def: zhDef }], pos, meaning: zhDef });
  }
}
```

这个函数在 `isValidWordOnline` 中被**后台异步调用**（不 await）。如果 game restart 时翻译请求还在进行中，返回后会写入 `wordMeaningCache`（模块级 Map，500 条上限）。不会泄漏，但 `enDef` 和 `pos` 字符串会被闭包持有直到请求完成。

---

### P1-2：每帧拼接字符串累积（39MB ConsString）

**问题描述**：

`renderer.js` 中每帧 60 次渲染，大量使用模板字符串：

```js
// 74 处 rgba() 拼接，每帧都新建字符串
ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${ca})`;
ctx.strokeStyle = `rgba(${p.cr},${p.cg},${p.cb},${ca * 0.5})`;

// 85 处 fillText，大量模板字符串
ctx.fillText(`第 ${settlement.round} 关结算`, cx, cy);
ctx.fillText(`剩余次数：${joker.usesLeft} / ${joker.limit}`, x, y);
ctx.fillText(`✦ ${joker.name} ✦`, cx, cy);
```

V8 引擎对模板字符串会创建 **ConsString**（连接树）或 **SlicedString**。短字符串可能被 intern，但 `rgba(140,60,230,0.15)` 这种动态值不会被 intern。

虽然大部分临时字符串应该被 GC，但如果**同时存在 Object 泄漏导致 GC 压力增大**，临时字符串就会在内存中堆积，形成"泄漏假象"。

---

### P2-1：`saveProgress` 频繁 JSON 序列化

**问题描述**：

`js/game.js` 中 `saveProgress` 被调用 **14 处**，几乎每次操作都触发：
- 每次出牌（合法/非法）→ 2-3 次
- 每次弃牌 → 2-3 次
- 每次结算 → 1 次

每次调用都要序列化：
```js
const progress = {
  round, gold, score, totalScore, roundScores,
  jokers, maxJokerSlots, letterUpgrades: [...letterUpgrades.entries()]
};
wx.setStorageSync('word_balatro_progress', progress);  // ← 内部 JSON.stringify
```

`jokers` 数组包含所有女巫牌对象（含大量动画状态字段），`letterUpgrades` 展开为数组。每次序列化都产生一个**巨大的 JSON 字符串**。

---

### P2-2：`console.log` 字符串被 DevTools 持有

**问题描述**：

`js/game.js` 中有 11 处 `[WordCheck]` 日志，每次查词都输出：
```js
console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) requesting...`);
```

在微信开发者工具中，`console.log` 的字符串参数会被**控制台持有引用**，直到控制台被清空。如果控制台开着且日志量大，这些字符串不会被 GC。

---

## 四、修复建议

### 4.1 P0-1：解决源码字符串膨胀（不动词量，改加载方式）

**方案 A（推荐）：`expand_words.js` 改为 JSON 文件，启动时异步读取**

> ⚠️ 需要把 `isValidWord()`、`hasValidWordInHand()` 等同步调用改为异步。牵连面大，但内存收益最高（可直接释放 5.4MB + 减少 bundle 体积）。

**方案 B（折中）：保留 JS 模块，但将词库数据压缩为字符串数组**

把 `Map<word, meaning>` 改为紧凑的字符串格式，让打包器压缩率更高：
```js
// 之前：5.4MB 打包后
const EXPAND_WORD_DATA = new Map([
  ['a', 'article. 一，一个...'],
  // 21000 条
]);

// 之后：~2MB 打包后
const EXPAND_WORDS = "a|article. 一...\nb|pron. 我...\n...";  // 用换行分隔
const EXPAND_WORD_DATA = new Map(EXPAND_WORDS.split('\n').map(l => l.split('|')));
```

**方案 C（最简单）：`expand_words.js` 懒加载**

不直接 `require`，而是在 `data.js` 中延迟加载：
```js
let EXPAND_WORD_DATA = null;
function getExpandWords() {
  if (!EXPAND_WORD_DATA) {
    EXPAND_WORD_DATA = require('./expand_words').EXPAND_WORD_DATA;
  }
  return EXPAND_WORD_DATA;
}
```

但这不能减少源码字符串（模块还是被加载了），只是延迟初始化 Map 对象。

---

### 4.2 P0-2：Image / ArrayBuffer 修复

**① 防止云图片重复加载**

```js
// cloud_storage.js
async _loadCloudImage(name) {
  // 如果已经加载成功，跳过
  const existing = this.shopCardImages[name];
  if (existing && existing.loaded && existing.img) return;
  // ...
}
```

**② 限制云图片同时加载数量**

当前 `preloadShopCardImages()` 用 `Promise.all` 并行加载所有图片，如果图片多会同时创建大量 Image 对象。改为分批加载（如每次 5 张）。

**③ 释放旧 Image 对象**

在 `_loadCloudImage` 中，如果旧 Image 存在，先销毁：
```js
const old = this.shopCardImages[name];
if (old && old.img) {
  old.img.src = '';  // 释放像素数据
}
```

**④ `card_book.png` 检查**

`images/card_book.png` 367KB，确认尺寸是否过大。如果是 2048×2048 的图，建议缩放到 512×512。

---

### 4.3 P1-1：Object 引用链修复

**① 清理 `lastPlayResult`**

```js
// game.js 入口
// playHand 返回的 result 不要长期持有
if (selected.length >= 2 && !game.pendingCheck) {
  game.playHand().then(result => {
    // 不保存到全局变量，用完即丢
  });
}
```

**② `playHand()` 增加 `_destroyed` 早退检查**

```js
async playHand() {
  // ...
  let valid = isValidWord(word);
  if (!valid) valid = await isValidWordOnline(word);
  
  // 如果实例已被销毁，立即停止
  if (this._destroyed) return { valid: false };
  
  // ...
}
```

**③ 清理子渲染器状态**

在 `renderer.resetState()` 中补充：
```js
resetState() {
  // ... 已有清理
  this.settlementRenderer.lastSettlementData = null;
  this.settlementRenderer.animStartTime = null;
}
```

---

### 4.4 P1-2：减少每帧字符串拼接

**① 缓存高频颜色字符串**

```js
// renderer constructor 中
this._colorCache = {};

// 使用时
const key = `${p.cr},${p.cg},${p.cb},${ca}`;
if (!this._colorCache[key]) {
  this._colorCache[key] = `rgba(${p.cr},${p.cg},${p.cb},${ca})`;
}
ctx.fillStyle = this._colorCache[key];
```

**② 减少 `measureText` 调用**

对固定文本（如按钮"出牌"、"弃牌"）的宽度在初始化时 measure 一次后缓存。

---

### 4.5 P2-1：`saveProgress` 防抖

```js
// storage.js
saveProgress(game) {
  if (this._saveTimer) clearTimeout(this._saveTimer);
  this._saveTimer = setTimeout(() => {
    this._doSave(game);
  }, 500);
}
```

---

### 4.6 P2-2：清理 console.log

**开发环境保留，生产环境移除**：
```js
// 在入口加一个开关
const DEBUG = false;
const log = DEBUG ? console.log : () => {};
```

---

## 五、修复优先级与预期收益

| 优先级 | 修复项 | 预期内存收益 | 功能影响 | 工作量 |
|--------|--------|-------------|---------|--------|
| P0 | expand_words.js 改 JSON / 压缩 | **-30~40MB** | 大（需异步化） | 大 |
| P0 | Image 重复加载 + 释放 | **-20~50MB** | 无 | 小 |
| P1 | playHand `_destroyed` 早退 | **-10~30MB**（长期游玩） | 无 | 小 |
| P1 | 颜色字符串缓存 | **-5~10MB** | 无 | 小 |
| P2 | saveProgress 防抖 | **-5~10MB**（动态） | 极小 | 小 |
| P2 | 去掉 console.log | **-2~5MB** | 无 | 极小 |

---

## 六、验证方法

1. **Heap Snapshot 对比**：修复前后各截一张 Snapshot，对比 `(string)`、`Object`、`ArrayBuffer` 的 Retained Size。
2. **Allocation Timeline**：录制 5 分钟游戏操作，观察 `(concatenated string)` 的分配斜率是否下降。
3. **长时间压力测试**：连续玩 10 关以上，观察内存曲线是否趋于平稳（而非持续上升）。

---

## 七、本轮已完成的修复（setTimeout / AudioManager）

| 修复 | 状态 |
|------|------|
| Game 类 `_delay` 封装 + `destroy()` 清除 timeout 闭包 | ✅ 已完成 |
| `audio.js` 新增 `destroy()` 释放 InnerAudioContext | ✅ 已完成 |
| `restartGame()` 调用 `game.destroy()` + `renderer.resetState()` | ✅ 已完成 |
| `checkingWords.clear()` 防止网络请求标记残留 | ✅ 已完成 |
