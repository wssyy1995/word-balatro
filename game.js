// 微信小游戏入口
const { Game } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');
const { buyItem, upgradeCard } = require('./js/shop');

// 获取 Canvas 上下文
wx.onShow(() => {
  console.log('游戏启动');
});

const info = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 平台判断：开发者工具不震动
const isDevTools = info.platform === 'devtools';
function vibrate() {
  if (!isDevTools && wx.vibrateShort) {
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
  }
}

// 设置画布尺寸（适配 Retina 高分屏）
const WIDTH = info.windowWidth;
const HEIGHT = info.windowHeight;
const dpr = info.pixelRatio || 1;
canvas.width = WIDTH * dpr;
canvas.height = HEIGHT * dpr;
ctx.scale(dpr, dpr);

// 游戏全局状态
let game = new Game();
let lastPlayResult = null;
const renderer = new Renderer(ctx, WIDTH, HEIGHT);

// 触摸事件处理
wx.onTouchStart((e) => {
  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;

  handleInput(x, y);
});

wx.onTouchEnd(() => {
  renderer.pressedBtn = null;
});

function handleInput(x, y) {
  // 检测调试菜单按钮（优先）
  if (renderer.debugMenuOpen && renderer.debugMenuRects) {
    const debugHit = renderer.hitTest(x, y, renderer.debugMenuRects);
    if (debugHit) {
      if (debugHit.action === 'debug_resetHands') game.resetHands();
      if (debugHit.action === 'debug_addScore') game.addScore(100);
      if (debugHit.action === 'debug_winRound') game.winRound();
      renderer.debugMenuOpen = false;
      return;
    }
  }
  
  // 检测 top_icon 点击（切换调试菜单）
  if (renderer.topIconRect) {
    const iconHit = renderer.hitTest(x, y, [renderer.topIconRect]);
    if (iconHit) {
      renderer.debugMenuOpen = !renderer.debugMenuOpen;
      return;
    }
  }

  if (game.state === 'playing') {
    // 检测卡牌点击
    const cardHit = renderer.hitTest(x, y, renderer.cardRects);
    if (cardHit) {
      vibrate();
      game.toggleSelect(cardHit.cardId);
      return;
    }

    // 检测出牌按钮
    if (renderer.playBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.playBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'play';
        if (game.animManager) game.animManager.buttonPress(renderer.playBtnRect);
        const selected = game.getSelectedCards();
        if (selected.length >= 3 && !game.pendingCheck) {
          game.playHand().then(result => {
            lastPlayResult = result;
          }).catch(err => {
            console.error('playHand error:', err);
          });
        }
        return;
      }
    }

    // 检测弃牌按钮
    if (renderer.discardBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.discardBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'discard';
        if (game.animManager) game.animManager.buttonPress(renderer.discardBtnRect);
        game.discard();
        return;
      }
    }

    // 检测清空选择按钮
    if (renderer.resetBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.resetBtnRect]);
      if (btnHit) {
        vibrate();
        renderer.pressedBtn = 'reset';
        if (game.animManager) game.animManager.buttonPress(renderer.resetBtnRect);
        game.clearSelection();
        return;
      }
    }
  }

  if (game.state === 'settlement') {
    if (renderer.settlementRenderer && renderer.settlementRenderer.claimBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.settlementRenderer.claimBtnRect]);
      if (btnHit) {
        vibrate();
        game.claimSettlement();
        return;
      }
    }
  }

  if (game.state === 'shop') {
    // 确认购买弹窗打开时
    if (game.confirmBuyItem !== undefined && game.confirmBuyItem !== null) {
      // 正在按钮按下动画中，忽略重复点击
      if (game._confirmBuyPressed) return;

      // 检测确认按钮点击
      if (renderer.confirmBuyRenderer && renderer.confirmBuyRenderer.confirmBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.confirmBuyRenderer.confirmBtnRect]);
        if (btnHit) {
          vibrate();
          game._confirmBuyPressed = true;
          game._confirmBuyPressTime = Date.now();
          setTimeout(() => {
            buyItem(game, game.confirmBuyItem);
            game._confirmBuyPressed = false;
            game._closingConfirmBuy = true;
            game._closeConfirmBuyStartTime = Date.now();
          }, 300);
          return;
        }
      }
      // 点击弹窗外区域 → 关闭弹窗（取消）
      game._closingConfirmBuy = true;
      game._closeConfirmBuyStartTime = Date.now();
      return;
    }

    // 正常商店点击
    if (renderer.shopRenderer && renderer.shopRenderer.shopItemRects) {
      const itemHit = renderer.hitTest(x, y, renderer.shopRenderer.shopItemRects);
      if (itemHit) {
        vibrate();
        const item = game.shopItems[itemHit.index];
        if (item && (item.type === 'witch' || item.type === 'crystal')) {
          // 女巫/水晶球打开确认弹窗
          game.confirmBuyItem = itemHit.index;
        } else {
          // 药水直接购买
          buyItem(game, itemHit.index);
        }
        return;
      }
    }

    if (renderer.shopRenderer && renderer.shopRenderer.nextRoundBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.shopRenderer.nextRoundBtnRect]);
      if (btnHit) {
        vibrate();
        game.nextRound();
        return;
      }
    }
  }

  if (game.state === 'potion') {
    if (renderer.potionCardRects) {
      const cardHit = renderer.hitTest(x, y, renderer.potionCardRects);
      if (cardHit) {
        const card = game.hand.find(c => c.id === cardHit.cardId);
        if (game.animManager && card) game.animManager.cardSelect(card);
        upgradeCard(game, cardHit.cardId);
        return;
      }
    }

    if (renderer.cancelBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.cancelBtnRect]);
      if (btnHit) {
        if (game.animManager) game.animManager.buttonPress(renderer.cancelBtnRect);
        if (game.potionMode) {
          game.gold += game.potionMode.cost;
          game.potionMode = null;
        }
        game.state = 'shop';
        return;
      }
    }
  }

  if (game.state === 'gameover') {
    const rects = [];
    if (renderer.gameOverCloseRect) rects.push(renderer.gameOverCloseRect);
    if (renderer.restartBtnRect) rects.push(renderer.restartBtnRect);
    const hit = renderer.hitTest(x, y, rects);
    if (hit) {
      if (game.animManager) game.animManager.buttonPress(hit);
      restartGame();
      return;
    }
  }
}

function restartGame() {
  game = new Game();
  lastPlayResult = null;
}

// 游戏主循环
let lastTime = 0;
function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  game.update(deltaTime);
  renderer.render(game);

  requestAnimationFrame(gameLoop);
}

// 启动游戏循环
requestAnimationFrame(gameLoop);

// 暴露到全局（调试用）
wx.game = game;
wx.renderer = renderer;
