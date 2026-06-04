# Renderer 模块化重构说明

> 原 `js/renderer.js`（6600+ 行）已拆分为 `js/render/` 目录下的聚焦模块。

---

## 1. 重构背景

`js/renderer.js` 原先是一个 6600+ 行的单文件，包含：

- `Renderer` 类定义（构造函数、30+ 组图片资源加载）
- 核心绘制工具（`roundRect`、`drawCard`、`text`、`button`）
- 主渲染入口 `render(game)`
- 十余个子系统（HUD、玩法、商店、弹窗、引导、动画、特效、图鉴、调试、结算、GameOver）

**痛点**：定位 bug 困难、多人协作冲突、加新功能时不敢动旧代码。

**目标**：物理拆分（按功能分文件）+ 保持运行时行为 100% 不变。

---

## 2. 目录结构

```
js/
├── renderer.js          # 入口薄层：module.exports = require('./render/index');
└── render/
    ├── index.js         # 组装入口：加载所有扩展模块，定义 render() 主调度
    ├── base.js          # 核心类：Renderer 构造函数 + 通用工具方法
    ├── effects.js       # 视觉特效：道具卡牌绘制、星辰燔边粒子系统
    ├── animation.js     # 动画系统：字母之神星星飞行、飞分、闪光粒子
    ├── hud.js           # 头部 HUD：标题栏、回合/目标分/女巫头像
    ├── playing.js       # 主玩法：手牌矩阵、道具栏、预览、底部按钮
    ├── popup.js         # 弹窗：换字母、药水、随机升级、续命、通用面板
    ├── guide.js         # 新手引导：三阶段覆盖层 + 打字文本
    ├── cardbook.js      # 卡牌图鉴：图标按钮、详情弹窗
    ├── debug.js         # 调试：云存储日志面板、调试菜单
    ├── gameover.js      # 独立类：GameOverRenderer（非原型扩展）
    └── test.js          # 自测脚本：mock Canvas + game，验证加载与渲染
```

---

## 3. 模块职责与规模

| 模块 | 行数 | 职责 | 导出方式 |
|------|------|------|----------|
| `base.js` | ~980 | `Renderer` 类定义、构造函数、通用工具（`roundRect`、`drawCard` 等） | `class Renderer` |
| `effects.js` | ~747 | 道具卡牌渲染（含自毁动画、禁用蒙层）、星辰燔边粒子 | 函数扩展 |
| `animation.js` | ~365 | 字母之神飞星、分数飞入、闪光粒子、脉冲缩放 | 函数扩展 |
| `hud.js` | ~482 | 顶部标题栏、金币胶囊、回合/目标分条、女巫头像 | 函数扩展 |
| `playing.js` | ~1132 | 主玩法界面布局、手牌矩阵、道具槽、预览条、动作按钮 | 函数扩展 |
| `popup.js` | ~1016 | 换字母/药水/升级/续命弹窗、通用面板 `_drawModalPanel` | 函数扩展 |
| `guide.js` | ~664 | 三阶段新手引导覆盖层（playing/shop/cardbook） | 函数扩展 |
| `cardbook.js` | ~298 | 图鉴图标（含通知红点）、大图详情翻页 | 函数扩展 |
| `debug.js` | ~122 | 云日志滚动面板、调试菜单开关 | 函数扩展 |
| `gameover.js` | ~234 | **独立类** `GameOverRenderer`，持有 `parent` 引用 | 独立类 |
| `index.js` | ~569 | 加载所有扩展、定义 `render(game)` 状态机调度 | 组装入口 |
| `test.js` | ~311 | 自测：模块加载、原型挂载、实例化、跨状态 render | 测试脚本 |

---

## 4. 导出模式（重要）

本项目使用两种导出模式，**后续新增代码必须按此规范选择**：

### 4.1 模式 A：函数扩展（Prototype Extension）

适用于向 `Renderer.prototype` 追加绘制方法。

```js
// js/render/xxx.js
module.exports = function extendXxx(Renderer) {
  Renderer.prototype.someMethod = function(game) {
    // this.ctx / this.scale / this.W / this.H 均可直接访问
  };
};
```

**适用模块**：`effects.js`、`animation.js`、`hud.js`、`playing.js`、`popup.js`、`guide.js`、`cardbook.js`、`debug.js`

**在 `index.js` 中的加载方式**：

```js
require('./hud')(Renderer);      // ✅ 先 require，再调用函数传入 Renderer
```

### 4.2 模式 B：独立类（Standalone Class）

适用于不直接挂载到 `Renderer.prototype`、需要被 `Renderer` 构造函数实例化的子渲染器。

```js
// js/render/gameover.js
class GameOverRenderer {
  constructor(renderer) {
    this.parent = renderer;  // 持有父 Renderer 以访问工具方法
  }
  draw(ctx, game, W, H, s) { ... }
}
module.exports = { GameOverRenderer };
```

**在 `base.js` 中的加载方式**：

```js
const { GameOverRenderer } = require('./gameover');
// 在 Renderer 构造函数中：
this.gameOverRenderer = new GameOverRenderer(this);
```

**⚠️ 关键区别**：独立类**不能**在 `index.js` 里写成 `require('./gameover')(Renderer);`，因为它导出的是对象而非函数。

---

## 5. 依赖关系

```
renderer.js
    └── index.js
            ├── base.js          ← 导出 Renderer 类
            │       └── 引用 gameover.js 中的 GameOverRenderer（独立类）
            ├── effects.js       ← 扩展 Renderer.prototype
            ├── animation.js     ← 扩展 Renderer.prototype
            ├── hud.js           ← 扩展 Renderer.prototype
            ├── playing.js       ← 扩展 Renderer.prototype
            ├── popup.js         ← 扩展 Renderer.prototype
            ├── guide.js         ← 扩展 Renderer.prototype
            ├── cardbook.js      ← 扩展 Renderer.prototype
            └── debug.js         ← 扩展 Renderer.prototype
```

**加载顺序**（`index.js` 中的顺序）：

1. `base.js` — 必须先加载，拿到 `Renderer` 类
2. 所有扩展模块 — 任意顺序，但建议按功能依赖排列
3. `render()` 方法定义 — 必须在所有扩展加载完之后

---

## 6. 后续开发规范

### 6.1 新增绘制方法放哪里？

| 功能领域 | 目标文件 |
|----------|----------|
| 通用工具（`roundRect`、文字辅助、碰撞检测） | `base.js` |
| 顶部栏 / HUD / 金币 / 回合信息 | `hud.js` |
| 主玩法画面（手牌、道具、预览、按钮） | `playing.js` |
| 弹窗 / Modal / 覆盖层 | `popup.js` |
| 新手引导覆盖层 | `guide.js` |
| 动画效果（飞分、闪光、粒子） | `animation.js` |
| 视觉特效（边框发光、卡牌特效） | `effects.js` |
| 图鉴相关 | `cardbook.js` |
| 调试工具 | `debug.js` |
| 游戏结束画面 | `gameover.js`（独立类） |

**判断原则**：
- 如果只是给 `Renderer.prototype` 加新方法 → 用**模式 A**，放到对应的功能文件
- 如果需要一个新的子渲染器（如 `SettlementRenderer` 那种独立类）→ 用**模式 B**，新建文件或在现有独立类文件中扩展

### 6.2 命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| 公开绘制方法 | 无 | `drawHUD`、`drawPlaying` |
| 私有/内部方法 | `_` | `_drawPropCard`、`_drawModalPanel` |
| 粒子/动画系统 | `_` | `_spawnSparkles`、`_updateAndDrawFlyingScore` |
| 扩展函数本身 | `extend` | `extendHud`、`extendPopup` |

### 6.3 `require` 路径规范（微信小游戏环境）

**⚠️ 微信小游戏的 `require` 不支持 Node.js 的目录自动解析。**

```js
// ❌ 错误：WeChat 会解析为 js/render.js，但该文件不存在
require('./render');

// ✅ 正确：显式指向 index.js
require('./render/index');

// 同级模块间引用
require('./base');           // 同一目录下的文件
require('./gameover');       // 同一目录下的文件
require('../game');          // 上级目录
require('../animation');     // 上级目录
```

### 6.4 方法内访问共享资源

所有扩展模块的方法都通过 `this` 访问 `Renderer` 实例上的共享资源：

```js
Renderer.prototype.drawSomething = function(game) {
  const ctx = this.ctx;       // Canvas 2D 上下文
  const W = this.W;           // 画布宽度
  const H = this.H;           // 画布高度
  const s = this.scale;       // 响应式缩放比例
  
  // 图片资源
  if (this.coinIconLoaded) { ... }
  
  // 子渲染器
  this.shopRenderer.draw(ctx, game, W, H, s);
  
  // 调用其他原型方法
  this.roundRect(x, y, w, h, r, fill, stroke);
};
```

### 6.5 修改 `index.js` 的注意事项

`index.js` 只负责两件事：

1. **加载扩展**：`require('./xxx')(Renderer);`
2. **定义 `render(game)`**：状态机调度

**不要**在 `index.js` 里写具体的绘制逻辑（保持薄层）。

`render(game)` 的结构应保持：

```js
Renderer.prototype.render = function(game) {
  // 1. 清屏 / 背景
  // 2. 按 state 分发到各子渲染器
  // 3. 覆盖层（引导、调试、排行榜）
};
```

---

## 7. 自测脚本

文件：`js/render/test.js`

**测试内容**：
- 所有模块 `require` 不报错
- `Renderer.prototype` 上核心方法已挂载
- `new Renderer(ctx, w, h)` 实例化成功
- 5 个子渲染器已创建
- `render(mockGame)` 在 7 种 `game.state` 下不抛异常

**运行方式**（临时在 `game.js` 顶部加入）：

```js
require('./js/render/test');
```

编译后在控制台查看 ✅/❌ 结果。

---

## 8. 常见问题（FAQ）

### Q: 为什么 `gameover.js` 不和其他模块一样用函数扩展？

A: `GameOverRenderer` 在 `Renderer` 构造函数中被实例化为 `this.gameOverRenderer`，是一个独立的子渲染器对象。它不需要挂载到 `Renderer.prototype`，而是通过 `this.parent` 引用父 `Renderer` 实例来共享工具方法。

### Q: 加新方法后 WeChat 报 `require(...) is not a function`？

A: 检查你的模块导出方式。如果是模式 A（函数扩展），确保 `module.exports = function(Renderer) { ... }`；如果是模式 B（独立类），确保在引用处用 `const { Xxx } = require('./xxx')`，而不是 `require('./xxx')(Renderer)`。

### Q: `render()` 方法里的 state 判断可以改吗？

A: 可以。`index.js` 里的 `render(game)` 就是一个大的 `if/else if` 状态机。新增 state 时在这里增加分支即可，但具体绘制逻辑应放到对应子模块的方法中，不要在 `render()` 里写长代码。

---

## 9. 历史记录

| Commit | 说明 |
|--------|------|
| `74daf7d` | 初始拆分：6600 行 → 11 个模块 |
| `18f0b56` | 修复 WeChat `require` 路径 + 括号不匹配 |
| `3f0964f` | 修复 `gameover.js` 独立类导出方式 |
| `038ac49` | 添加自测脚本 `test.js` |
| `2951b3b` | 补全 mock Canvas `arcTo` |
| `02bb5e8` | 补全 mock Canvas 渐变 API |
| `1c674da` | 补全 mock Canvas 全部 2D API |
| `bddd24c` | mock game 改用 Proxy，避免属性缺失报错 |
