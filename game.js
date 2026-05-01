// 微信小游戏入口
const { Game } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');

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
        if (selected.length >= 3) {
          game.playHand().then(result => {
            lastPlayResult = result;
            if (!result.valid) {
              wx.showToast({ title: '非法单词', icon: 'none' });
            }
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

    // 检测提示按钮
    if (renderer.hintBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.hintBtnRect]);
      if (btnHit) {
        renderer.pressedBtn = 'hint';
        if (game.animManager) game.animManager.buttonPress(renderer.hintBtnRect);
        game.showHint();
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

  if (game.state === 'shop') {
    if (renderer.shopRects) {
      const itemHit = renderer.hitTest(x, y, renderer.shopRects);
      if (itemHit) {
        if (game.animManager) game.animManager.buttonPress(itemHit);
        game.buyItem(itemHit.index);
        return;
      }
    }

    if (renderer.nextRoundBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.nextRoundBtnRect]);
      if (btnHit) {
        if (game.animManager) game.animManager.buttonPress(renderer.nextRoundBtnRect);
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
        game.upgradeCard(cardHit.cardId);
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
