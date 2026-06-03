// ===== Renderer 拆分自测脚本 =====
// 运行方式：
//   1. 在微信开发者工具中，于 game.js 顶部加入：require('./js/render/test');
//   2. 或在支持 Node.js 的环境中先 mock wx 再运行：node js/render/test.js

(function runTests() {
  const results = [];
  let pass = 0;
  let fail = 0;

  function assert(label, condition) {
    if (condition) {
      pass++;
      results.push(`✅ ${label}`);
    } else {
      fail++;
      results.push(`❌ ${label}`);
      console.error(`[TEST FAIL] ${label}`);
    }
  }

  function assertEq(label, actual, expected) {
    const ok = actual === expected;
    assert(`${label} (expect ${expected}, got ${actual})`, ok);
  }

  // ===== 0. Mock wx (若在非微信环境运行) =====
  if (typeof wx === 'undefined') {
    global.wx = {
      getSystemInfoSync: () => ({ safeArea: { top: 44, bottom: 800 }, screenHeight: 812, statusBarHeight: 44, platform: 'ios' }),
      createImage: () => ({ src: '', onload: null, onerror: null }),
      loadFont: () => null,
      getImageInfo: () => {},
      getOpenDataContext: () => null,
    };
  }

  // ===== 1. 模块加载测试 =====
  let Renderer;
  try {
    const base = require('./base');
    Renderer = base.Renderer;
    assert('base.js 导出 Renderer', typeof Renderer === 'function');
  } catch (e) {
    assert('base.js 加载成功', false);
    console.error(e);
  }

  const extModules = [
    'effects', 'animation', 'hud', 'playing',
    'popup', 'guide', 'cardbook', 'debug',
  ];

  extModules.forEach(name => {
    try {
      const mod = require(`./${name}`);
      assert(`${name}.js 可加载`, typeof mod === 'function');
      assert(`${name}.js 导出为函数`, typeof mod === 'function');
    } catch (e) {
      assert(`${name}.js 可加载`, false);
      console.error(e);
    }
  });

  // gameover.js 是独立类
  try {
    const go = require('./gameover');
    assert('gameover.js 可加载', typeof go === 'object' && typeof go.GameOverRenderer === 'function');
  } catch (e) {
    assert('gameover.js 可加载', false);
    console.error(e);
  }

  // index.js 组装入口
  try {
    const entry = require('./index');
    assert('index.js 可加载', typeof entry === 'object');
    assert('index.js 导出 Renderer', typeof entry.Renderer === 'function');
    Renderer = entry.Renderer;
  } catch (e) {
    assert('index.js 可加载', false);
    console.error(e);
  }

  // ===== 2. 原型方法挂载测试 =====
  const expectedMethods = [
    'render',
    'drawPreviewLoad',
    'drawTopHeader',
    'drawHUD',
    'drawPlaying',
    'drawPotion',
    'drawShopCardIcon',
    'drawChangeLetterPopup',
    'resetState',
    'hitTest',
    'roundRect',
    '_drawPropCard',
    '_drawLetterGodAnim',
    '_drawStar',
    '_drawGuideOverlay',
    '_drawShopGuideOverlay',
    '_drawCardBookGuideOverlay',
    '_drawCardBookIcon',
    '_drawCardBookDetail',
    '_drawDebugMenu',
    '_drawCloudDebugLogs',
    '_drawModalPanel',
    '_drawLifeExtensionPopup',
    '_drawLashBorder',
    '_createSparkParticles',
    '_updateAndDrawSparkParticles',
    '_spawnSparkles',
    '_updateAndDrawSparkles',
    '_startFlyingScore',
    '_updateAndDrawFlyingScore',
    '_calcPulseScale',
    '_drawEmptySlot',
    '_getWitchLetters',
    '_drawWitchDetailPopup',
  ];

  expectedMethods.forEach(name => {
    assert(`Renderer.prototype.${name} 已挂载`, typeof Renderer.prototype[name] === 'function');
  });

  // ===== 3. 实例化测试 =====
  let renderer;
  try {
    const canvas = {
      getContext: () => ({
        clearRect: () => {},
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        fillText: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        arcTo: () => {},
        quadraticCurveTo: () => {},
        clip: () => {},
        drawImage: () => {},
        measureText: () => ({ width: 100 }),
        setLineDash: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        imageSmoothingEnabled: true,
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        font: '',
        fillStyle: '',
        strokeStyle: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        shadowColor: '',
        shadowBlur: 0,
        lineWidth: 1,
      }),
      width: 375,
      height: 667,
    };
    const ctx = canvas.getContext('2d');
    renderer = new Renderer(ctx, 375, 667);
    assert('Renderer 可实例化', !!renderer);
    assert('子渲染器 settlementRenderer 已创建', !!renderer.settlementRenderer);
    assert('子渲染器 witchRewardRenderer 已创建', !!renderer.witchRewardRenderer);
    assert('子渲染器 shopRenderer 已创建', !!renderer.shopRenderer);
    assert('子渲染器 confirmBuyRenderer 已创建', !!renderer.confirmBuyRenderer);
    assert('子渲染器 gameOverRenderer 已创建', !!renderer.gameOverRenderer);
  } catch (e) {
    assert('Renderer 可实例化', false);
    console.error(e);
  }

  // ===== 4. render() 调用测试 =====
  if (renderer) {
    const mockGame = {
      state: 'playing',
      round: 1,
      score: 0,
      targetScore: 100,
      gold: 10,
      hand: [],
      selectedCards: [],
      jokers: [],
      shopItems: [],
      shopGuidePhase: 0,
      cardBookGuidePhase: 0,
      cardBookUnlocked: false,
      confirmBuyItem: null,
      _showingRankList: false,
      _witchDetailPopup: null,
      _changeLetterPopup: null,
      _randomUpgradePopup: null,
      _lifeExtensionPopup: null,
      _potionUpgradeAnim: null,
      _letterGodAnim: null,
      _cardBookOpen: false,
      _showCardBookDetail: false,
      _shopGuideExitStartTime: null,
      _cardBookGuideStartTime: null,
      _cardBookGuideTextStartTime: null,
      storageManager: null,
      debugMenuOpen: false,
    };

    try {
      renderer.render(mockGame);
      assert('render(game) 执行不抛错 (playing)', true);
    } catch (e) {
      assert('render(game) 执行不抛错 (playing)', false);
      console.error(e);
    }

    // 测试其他状态
    ['shop', 'gameover', 'settlement', 'witch_reward', 'potion', 'life_extended'].forEach(state => {
      try {
        mockGame.state = state;
        renderer.render(mockGame);
        assert(`render(game) 执行不抛错 (${state})`, true);
      } catch (e) {
        assert(`render(game) 执行不抛错 (${state})`, false);
        console.error(`[state=${state}]`, e);
      }
    });
  }

  // ===== 5. 结果汇总 =====
  console.log('\n========== Renderer 自测结果 ==========');
  results.forEach(r => console.log(r));
  console.log(`\n总计: ${pass} 通过, ${fail} 失败`);
  if (fail === 0) {
    console.log('🎉 全部通过！');
  } else {
    console.log('⚠️ 存在失败项，请检查上方日志。');
  }
  console.log('=======================================\n');

  // 导出结果（便于 game.js 捕获）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pass, fail, total: pass + fail, results };
  }
})();
