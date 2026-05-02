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
      if (debugHit.action === 'debug_endGame') {
        game.state = 'gameover';
        game.gameOverReason = 'debug';
        if (game.storageManager) {
          game.storageManager.setHighScore(game.totalScore);
          game.storageManager.updateStats(game);
        }
      }
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

    // 检测已购买道具栏中的药水牌点击
    if (renderer.potionPropRects) {
      const potionHit = renderer.hitTest(x, y, renderer.potionPropRects);
      if (potionHit) {
        vibrate();
        const potion = game.potions[potionHit.potionIndex];
        if (potion) {
          game.potionMode = {...potion};
          game._prePotionState = 'playing';
          game.state = 'potion';
        }
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
      // 购买成功弹窗
      if (game._confirmBuySuccess) {
        if (game._successBtnPressed) return;

        const rects = [];
        if (renderer.confirmBuyRenderer && renderer.confirmBuyRenderer.successBtnRect) {
          rects.push(renderer.confirmBuyRenderer.successBtnRect);
        }
        if (renderer.confirmBuyRenderer && renderer.confirmBuyRenderer.successBtn2Rect) {
          rects.push(renderer.confirmBuyRenderer.successBtn2Rect);
        }
        const btnHit = renderer.hitTest(x, y, rects);
        if (btnHit) {
          vibrate();
          game._successBtnPressed = true;
          game._successBtnPressTime = Date.now();
          setTimeout(() => {
            game._successBtnPressed = false;
            // 药水牌且点击"暂存"
            if (btnHit.action === 'stashPotion' && game._confirmBuyItemData) {
              game.potions.push({...game._confirmBuyItemData});
            }
            // 药水牌且点击"立即使用"
            if (btnHit.action === 'usePotionNow' && game._confirmBuyItemData) {
              game.potionMode = {...game._confirmBuyItemData};
              game._prePotionState = 'shop';
              game.state = 'potion';
            }
            game._closingConfirmBuy = true;
            game._closeConfirmBuyStartTime = Date.now();
          }, 300);
          return;
        }
        return; // 点击外部不关闭
      }

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
            // 先保存商品数据（buyItem 会将其设为 null）
            const item = game.shopItems[game.confirmBuyItem];
            game._confirmBuyItemData = item ? {...item} : null;
            buyItem(game, game.confirmBuyItem);
            game._confirmBuyPressed = false;
            game._confirmBuySuccess = true;
            game._confirmBuySuccessTime = Date.now();

          }, 200);
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
        if (item && (item.type === 'witch' || item.type === 'crystal' || item.type === 'potion')) {
          // 女巫/水晶球/药水 打开确认弹窗
          game.confirmBuyItem = itemHit.index;
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
          // 只有从商店直接购买时取消才退金币；暂存的不退
          if (game._prePotionState !== 'playing') {
            game.gold += game.potionMode.cost;
          }
          game.potionMode = null;
        }
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
        return;
      }
    }
  }

  if (game.state === 'gameover') {
    if (game._closingGameOver) return;
    if (game._restartBtnPressed) return;
    if (renderer.gameOverRenderer && renderer.gameOverRenderer.restartBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.gameOverRenderer.restartBtnRect]);
      if (btnHit) {
        vibrate();
        game._restartBtnPressed = true;
        game._restartBtnPressTime = Date.now();
        setTimeout(() => {
          game._restartBtnPressed = false;
          game._closingGameOver = true;
          game._closeStartTime = Date.now();
          setTimeout(() => {
            restartGame();
          }, 300);
        }, 150);
        return;
      }
    }
  }
}

function restartGame() {
  if (renderer && renderer.gameOverRenderer) {
    renderer.gameOverRenderer.lastGameOverReason = null;
    renderer.gameOverRenderer.animStartTime = null;
  }
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
