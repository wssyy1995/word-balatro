# 内存修复方案 — 功能影响范围详细分析

> 基于 `MEMORY_INVESTIGATION_V2.md` 的六大根因，逐项拆解修改范围、功能影响链、用户体验变化和测试要点。

---

## 一、`expand_words.js` 改 JSON 异步 / 压缩

### 1.1 修改方案对比

| 方案 | 内存收益 | 工作量 | 功能影响 |
|------|---------|--------|---------|
| A. 改 JSON 文件 + 启动时异步读取 | **-30~40MB** | 大 | **大** |
| B. 压缩为紧凑字符串数组（仍 JS 模块） | **-3~5MB** | 中 | **无** |
| C. 懒加载（首次用再 require） | **-0MB** | 小 | **无** |

### 1.2 方案 A（JSON 异步化）——功能影响详拆

**需要修改的文件**：`js/data.js`、`js/game.js`、`raw_words/expand_words.csv`

**核心改动**：
```js
// data.js — 之前：模块顶层同步 require
const { EXPAND_WORD_DATA } = require('./expand_words');

// data.js — 之后：异步加载，初始为空 Map
let EXPAND_WORD_DATA = new Map();
async function loadExpandWords() {
  const fs = wx.getFileSystemManager();
  const data = fs.readFileSync('raw_words/expand_words.json', 'utf8');
  const arr = JSON.parse(data);
  EXPAND_WORD_DATA = new Map(arr); // 或遍历填充
}
```

**受影响的调用链（全部在 `js/game.js` 中）**：

| 调用点 | 行号 | 当前调用方式 | 改后调用方式 | 影响 |
|--------|------|-------------|-------------|------|
| `hasValidWordInHand()` | 182 | `for (const word of EXPAND_WORD_DATA.keys())` | `await loadExpandWords()` 前置 | **保底发牌**必须在词库加载完成后才能执行 |
| `findAllValidWordsInHand()` | 248 | 同上 | 同上 | **提示功能**必须在词库加载完成后才能执行 |
| `isValidWord()` | 383 | `EXPAND_WORD_DATA.has(word)` | 同上 | **单词校验**必须在词库加载完成后才能执行 |
| `isValidWordOnline()` | 421 | 同上 | 同上 | **在线查词前的本地检查**必须在词库加载完成后才能执行 |
| `getWordMeaning()` | 502 | `EXPAND_WORD_DATA.get(word)` | 同上 | **释义显示**必须在词库加载完成后才能执行 |
| `drawWithSafety()` | 88 | 调用 `getSeedWord()` → `hasValidWordInHand()` | 链式异步化 | **发牌**必须在词库加载完成后才能执行 |
| `ensureValidWordInHand()` | 121 | 调用 `hasValidWordInHand()` | 链式异步化 | **补牌保底**必须在词库加载完成后才能执行 |

**连锁反应——这些函数全部要 async 化**：

```
loadExpandWords() ──→ data.js 导出变为异步
  └── hasValidWordInHand() ──→ 改 async
        └── drawWithSafety() ──→ 改 async
              └── resetRound() ──→ 改 async
                    └── Game.constructor() ──→ 无法 await（构造函数不能 async）
        └── ensureValidWordInHand() ──→ 改 async
              └── _executePlayHand() 的 setTimeout 回调 ──→ 需 await
              └── discard() 的 setTimeout 回调 ──→ 需 await
        └── findAllValidWordsInHand() ──→ 改 async
              └── showHint() ──→ 改 async
  └── isValidWord() ──→ 改 async
        └── playHand() ──→ 已经是 async，但需加 await
        └── isValidWordOnline() ──→ 已经是 async，但需调整顺序
```

**Game.constructor 无法 await 的问题**：

```js
class Game {
  constructor() {
    // 之前：同步 require，词库立即可用
    this.resetRound(); // 内部调用 drawWithSafety() → getSeedWord() → 查词库
    
    // 之后：异步加载，构造函数不能 await
    // 方案 1：在 constructor 外由调用方 await
    // 方案 2：round 1 用 WORD_DATA（核心词库）保底，expand_words 后台加载
  }
}
```

**用户体验变化**：
- **首次启动**：需要等待 `expand_words.json` 加载完成后才能开始第一局（增加 100-300ms 启动延迟）
- **离线游玩**：如果 JSON 文件读取失败，expand_words 词库不可用，生僻词会被误判为非法（但 WORD_DATA 核心词库仍可正常使用）
- **词库热更新**：JSON 文件可以独立更新，不需要重新编译 JS

**风险点**：
- ⚠️ **高风险**：异步化链条长，任何一处 `await` 遗漏都会导致词库未加载时查词返回 `false`，生僻词被误判为非法单词
- ⚠️ **中风险**：`resetRound()` 异步化后，`Game` 构造函数不能 `await`，第一局启动逻辑需要重写
- ⚠️ **中风险**：`wx.getFileSystemManager().readFileSync` 在真机上对 `json` 文件的路径解析可能与开发者工具不同

**测试要点**：
- [ ] 断网环境下启动游戏，确认核心词库（WORD_DATA）仍能正常游戏
- [ ] 快速连续出牌，确认 async 边界没有遗漏 await
- [ ] 第一局就打出 expand_words 中的生僻词，确认能正确识别

---

### 1.3 方案 B（压缩为紧凑字符串）——功能影响

**不改异步，只改数据格式**：

```js
// expand_words.js — 之前：5.4MB 打包后
const EXPAND_WORD_DATA = new Map([
  ['a', 'article. 一，一个...'],
  ['abandon', 'v. 放弃...'],
  // 21000 条数组字面量
]);

// expand_words.js — 之后：~2MB 打包后
const RAW = "a|article. 一，一个...\nabandon|v. 放弃...\n...";
const EXPAND_WORD_DATA = new Map(RAW.split('\n').map(l => {
  const i = l.indexOf('|');
  return [l.slice(0, i), l.slice(i + 1)];
}));
```

**功能影响**：**零**
- 导出接口不变（仍是 `EXPAND_WORD_DATA` Map）
- 所有调用方无需修改
- 启动时间不变（仍是同步 require）

**风险点**：
- 无功能风险
- 只是词库维护时格式变了（从 `['word', 'meaning']` 变成 `"word|meaning"`）

---

## 二、Image / ArrayBuffer 修复

### 2.1 防止云图片重复加载

**需要修改的文件**：`js/cloud_storage.js`

**核心改动**：
```js
async _loadCloudImage(name) {
  // 新增：已加载成功则跳过
  const existing = this.shopCardImages[name];
  if (existing && existing.loaded && existing.img) {
    return;
  }
  // ... 原有逻辑
}
```

**功能影响**：**无**
- 只是跳过重复加载，视觉表现完全一致
- 如果云存储临时 URL 过期（通常 2 小时），旧 Image 会加载失败，但此时 `loaded=false`，会重新加载

**风险点**：
- 极小。唯一场景：用户玩超过 2 小时且云 URL 过期，此时需要重新加载，逻辑仍正确。

---

### 2.2 释放旧 Image 对象像素数据

**需要修改的文件**：`js/cloud_storage.js`

**核心改动**：
```js
async _loadCloudImage(name) {
  const old = this.shopCardImages[name];
  if (old && old.img) {
    old.img.src = ''; // 释放 Native 层像素数据
  }
  // ... 创建新 Image
}
```

**功能影响**：**无**
- `img.src = ''` 只是释放像素数据，不影响渲染（新 Image 会立即替换）

**风险点**：
- 极小。`img.src = ''` 是标准做法，微信小游戏 Canvas 2D 支持。

---

### 2.3 限制并行加载数量

**需要修改的文件**：`js/cloud_storage.js`

**核心改动**：
```js
async preloadShopCardImages() {
  const names = Object.keys(this.cloudFileMap);
  const batchSize = 5; // 从并行全部改为分批
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    await Promise.all(batch.map(name => this._loadCloudImage(name)));
  }
}
```

**功能影响**：**极小**
- 云图片加载从"瞬间全部并行"变成"分批加载"
- 商店页面的图标可能出现**依次显示**的效果（延迟 100-500ms）
- 游戏核心逻辑（出牌、计分）完全不受影响

**风险点**：
- 极低。只是视觉上的加载顺序变化。

---

### 2.4 `card_book.png` 尺寸检查

**需要修改的文件**：`images/card_book.png`（替换为更小尺寸）

**功能影响**：**无**
- 只要保持宽高比，缩小图片尺寸不影响渲染
- 如果改为更小尺寸，Canvas `drawImage` 时仍然可以拉伸到原尺寸

**风险点**：
- 缩小后图片可能变模糊，需要确认视觉效果可接受

---

## 三、Object 引用链修复

### 3.1 `playHand()` 增加 `_destroyed` 早退检查

**需要修改的文件**：`js/game.js`

**核心改动**：
```js
async playHand() {
  // ...
  let valid = isValidWord(word);
  if (!valid) valid = await isValidWordOnline(word);
  
  // 新增：实例已销毁则立即停止
  if (this._destroyed) return { valid: false };
  
  // ... 后续逻辑
}
```

**功能影响**：**无（对正常流程）**
- 正常游戏中 `_destroyed` 始终为 `false`，不触发早退
- 只有在用户点击"重新开始"（restartGame）后，旧实例的 pending Promise 才会触发早退

**用户体验变化**：
- **正面**：restart 后不会出现"旧实例的延迟 gameover 弹窗"或"旧实例的结算动画"
- **无负面**：正常游玩完全无感知

**风险点**：
- 极低。只是加了一个 `if` 早退。

---

### 3.2 清理 `lastPlayResult` 全局变量

**需要修改的文件**：`game.js`（入口）

**当前代码**：
```js
// game.js:42
game.playHand().then(result => {
  lastPlayResult = result;  // ← 全局变量长期持有
});
```

**改动方案**：
```js
game.playHand().then(result => {
  // 不保存到全局变量，只在 then 内消费
}).catch(err => {
  console.error('playHand error:', err);
});
```

**功能影响**：
- `lastPlayResult` 变量当前在代码中**没有任何消费方**（grep 显示只在 3 处出现：声明、赋值、restart 时清空）
- **删除它没有任何功能影响**

**风险点**：
- 零。这是一个死变量。

---

### 3.3 清理子渲染器状态

**需要修改的文件**：`js/renderer.js` 的 `resetState()`

**当前 `resetState()`**：
```js
resetState() {
  this.sparkles = [];
  this.flyingScore = null;
  // ...
  this.settlementRenderer.claimBtnPressed = false;
}
```

**需要补充**：
```js
resetState() {
  // ... 已有清理
  this.settlementRenderer.lastSettlementData = null;
  this.settlementRenderer.animStartTime = null;
}
```

**功能影响**：**无**
- 只是 restart 时清理旧状态，正常游戏流程不受影响

**风险点**：
- 极低。

---

### 3.4 `fetchChineseTranslation` 的闭包引用

**需要修改的文件**：`js/game.js`

**当前代码**：
```js
async function fetchChineseTranslation(word, enDef, pos) {
  // 后台异步调用，不 await
  // enDef 和 pos 被闭包持有直到请求完成
}
```

**功能影响**：**无需修改**
- 该函数写入 `wordMeaningCache`（模块级 Map，500 条 LRU 上限）
- 不会导致泄漏，只是临时持有几个字符串
- 如果用户在网络差的环境频繁查词，最多等待请求超时（5s）后释放

---

## 四、颜色字符串缓存

### 4.1 缓存 `rgba()` 颜色值

**需要修改的文件**：`js/renderer.js`

**核心改动**：
```js
// constructor 中初始化缓存
this._colorCache = {};

// _drawPropCard / _updateAndDrawSparkParticles 中使用
const key = `${p.cr},${p.cg},${p.cb},${Math.round(ca * 100) / 100}`;
if (!this._colorCache[key]) {
  this._colorCache[key] = `rgba(${p.cr},${p.cg},${p.cb},${ca})`;
}
ctx.fillStyle = this._colorCache[key];
```

**功能影响**：**无**
- 只是避免重复拼接相同的 rgba 字符串
- 视觉效果完全一致

**风险点**：
- 如果颜色值精度很高（如 `ca` 是浮点数），缓存 key 会非常多，反而占用更多内存
- 解决方案：对 `ca` 做精度截断（如保留 2 位小数）

---

### 4.2 缓存 `measureText` 结果

**需要修改的文件**：`js/renderer.js`、`js/shop.js`

**核心改动**：
```js
// constructor 中
this._textWidthCache = {};

// 使用时
const cacheKey = `${text}_${font}`;
if (!this._textWidthCache[cacheKey]) {
  this._textWidthCache[cacheKey] = ctx.measureText(text).width;
}
return this._textWidthCache[cacheKey];
```

**功能影响**：**无**
- 固定文本（如"出牌"、"弃牌"、女巫牌名称）的宽度是不变的，缓存后完全一致
- 动态文本（如分数 `123`）变化频繁，缓存收益低

**风险点**：
- 如果字体大小动态变化（如缩放），缓存会失效，需要加字体大小到 key 中

---

## 五、`saveProgress` 防抖

### 5.1 500ms 防抖

**需要修改的文件**：`js/storage.js`

**核心改动**：
```js
saveProgress(game) {
  if (this._saveTimer) clearTimeout(this._saveTimer);
  this._saveTimer = setTimeout(() => {
    this._doSave(game);
  }, 500);
}
```

**功能影响**：**极小**

| 场景 | 之前 | 之后 | 影响 |
|------|------|------|------|
| 正常出牌 | 立即保存 | 500ms 后保存 | 无感知 |
| 快速连续弃牌 3 次 | 保存 3 次 | 只保存最后 1 次 | 无感知 |
| 用户在操作后 500ms 内杀进程 | 已保存 | **可能丢失最后一次操作** | ⚠️ 极小概率 |

**用户体验变化**：
- 操作更流畅（减少 `wx.setStorageSync` 的同步阻塞）
- 无负面感知

**风险点**：
- 极低。500ms 窗口内杀进程的概率极小。

---

## 六、去掉 `console.log`

### 6.1 方案对比

| 方案 | 功能影响 | 工作量 |
|------|---------|--------|
| A. 直接删除所有 `console.log` | 无（开发时重新加） | 小 |
| B. 用 `DEBUG` 开关包裹 | 无 | 小 |
| C. 保留，生产环境自动去除 | 无 | 中（需构建工具） |

### 6.2 方案 B（推荐）

**需要修改的文件**：`js/game.js`、`game.js`、`js/cloud_storage.js`

**核心改动**：
```js
// 在入口或 data.js 中定义
const DEBUG = false;
const log = DEBUG ? console.log : () => {};

// 替换所有 console.log
// 之前
console.log(`[WordCheck] word="${word}" layer=L1(WORD_DATA) hit`);

// 之后
log(`[WordCheck] word="${word}" layer=L1(WORD_DATA) hit`);
```

**功能影响**：**无**
- 只是关闭日志输出
- `console.error` 建议保留（用于捕获异常）

**风险点**：
- 零。

---

## 七、综合对比表

| 修复项 | 修改文件数 | 功能影响 | 用户体验变化 | 风险等级 | 推荐优先级 |
|--------|-----------|---------|-------------|---------|-----------|
| expand_words.js JSON 异步化 | 3+ | **大**（全链路 async 化） | 启动延迟 100-300ms | 🔴 高 | P0（如果接受大改动） |
| expand_words.js 紧凑字符串 | 1 | **无** | 无 | 🟢 无 | P0（推荐先做） |
| Image 重复加载防护 | 1 | **无** | 无 | 🟢 无 | P0 |
| Image 旧像素释放 | 1 | **无** | 无 | 🟢 无 | P0 |
| playHand `_destroyed` 早退 | 1 | **无** | restart 更干净 | 🟢 无 | P1 |
| 清理 `lastPlayResult` | 1 | **无**（死变量） | 无 | 🟢 无 | P1 |
| 子渲染器状态清理 | 1 | **无** | 无 | 🟢 无 | P1 |
| 颜色字符串缓存 | 1 | **无** | 无 | 🟡 低 | P1 |
| saveProgress 防抖 | 1 | **极小** | 操作更流畅 | 🟢 无 | P2 |
| console.log 开关 | 3 | **无** | 无 | 🟢 无 | P2 |

---

## 八、推荐执行路线

### 路线 A：保守派（不动核心架构，先拿低 hanging fruit）

1. ✅ expand_words.js 紧凑字符串（收益 3-5MB，零风险）
2. ✅ Image 重复加载防护 + 旧像素释放（收益 10-30MB，零风险）
3. ✅ playHand `_destroyed` 早退（收益 10-30MB，零风险）
4. ✅ 清理 `lastPlayResult` + 子渲染器状态（收益 5-10MB，零风险）
5. ✅ saveProgress 防抖（收益 5-10MB，零风险）
6. ✅ console.log 开关（收益 2-5MB，零风险）
7. ✅ 颜色字符串缓存（收益 5-10MB，低风险）

**预期总收益**：40-100MB，**零功能风险**

### 路线 B：激进派（解决根本问题）

在路线 A 基础上，增加：
8. expand_words.js JSON 异步化（额外收益 25-35MB，**但需重构核心逻辑**）

---

## 九、测试矩阵

| 修复项 | 启动测试 | 出牌测试 | 弃牌测试 | 结算测试 | restart 测试 | 断网测试 |
|--------|---------|---------|---------|---------|-------------|---------|
| expand_words 紧凑字符串 | ✅ | ✅ | ✅ | — | — | ✅ |
| Image 加载优化 | — | ✅ | ✅ | ✅ | — | — |
| playHand 早退 | — | ✅ | ✅ | — | ✅ | — |
| saveProgress 防抖 | — | ✅ | ✅ | — | — | — |
| console.log 开关 | ✅ | — | — | — | — | — |
| 颜色缓存 | — | ✅ | ✅ | ✅ | — | — |
