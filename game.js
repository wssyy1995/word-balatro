// 微信小游戏入口
const { Game } = require('./js/game');
const { Renderer } = require('./js/renderer');
const { InputHandler } = require('./js/input');
const { buyItem, upgradeLetter, refreshModule } = require('./js/shop');
const { LETTER_SCORE, letterUpgrades } = require('./js/data');

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
          game._successPressedBtn = btnHit.action;
          game._successBtnPressTime = Date.now();
          setTimeout(() => {
            game._successBtnPressed = false;
            game._successPressedBtn = null;
            // 女巫牌且点击"装备"
            if (btnHit.action === 'equipWitch' && game._confirmBuyItemData) {
              game.jokers.push({...game._confirmBuyItemData});
              if (game.storageManager) game.storageManager.saveProgress(game);
            }
            // 药水牌且点击"暂存"
            if (btnHit.action === 'stashPotion' && game._confirmBuyItemData) {
              game.potions.push({...game._confirmBuyItemData});
              if (game.storageManager) game.storageManager.saveProgress(game);
            }
            // 药水牌且点击"立即使用"
            if (btnHit.action === 'usePotionNow' && game._confirmBuyItemData) {
              game.potionMode = {...game._confirmBuyItemData};
              game._prePotionState = 'shop';
              game.state = 'potion';
            }
            // 水晶球点击"生效"（购买时已生效，无需额外处理）
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

    // 检测已购买道具栏点击（选中/取消选中）
    if (renderer.shopRenderer && renderer.shopRenderer.shopOwnedPropRects) {
      const propHit = renderer.hitTest(x, y, renderer.shopRenderer.shopOwnedPropRects);
      if (propHit) {
        vibrate();
        const prev = renderer.shopRenderer.shopSelectedOwned;
        if (prev && prev.type === propHit.array && prev.index === propHit.index) {
          renderer.shopRenderer.shopSelectedOwned = null;
        } else {
          renderer.shopRenderer.shopSelectedOwned = { type: propHit.array, index: propHit.index };
        }
        return;
      }
    }

    // 检测售出按钮点击
    if (renderer.shopRenderer && renderer.shopRenderer.shopSellBtnRect) {
      const sellHit = renderer.hitTest(x, y, [renderer.shopRenderer.shopSellBtnRect]);
      if (sellHit) {
        vibrate();
        const arr = game[sellHit.array];
        if (arr && arr[sellHit.index]) {
          const item = arr[sellHit.index];
          game.gold += item.cost;
          // 启动售出消失动画（400ms 后实际移除）
          game._sellingProp = {
            type: sellHit.array,
            index: sellHit.index,
            startTime: Date.now(),
          };
          renderer.shopRenderer.shopSelectedOwned = null;
          if (game.storageManager) game.storageManager.saveProgress(game);
        }
        return;
      }
    }

    // 检测刷新按钮点击
    if (renderer.shopRenderer && renderer.shopRenderer.shopRefreshRects) {
      const refreshHit = renderer.hitTest(x, y, renderer.shopRenderer.shopRefreshRects);
      if (refreshHit) {
        vibrate();
        refreshModule(game, refreshHit.modIdx);
        return;
      }
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
    // 动画进行中，忽略所有点击
    if (game._potionUpgrading) return;

    // 检测字母点击
    if (renderer.potionLetterRects) {
      const letterHit = renderer.hitTest(x, y, renderer.potionLetterRects);
      if (letterHit) {
        vibrate();
        game._potionSelectedLetter = letterHit.letter;
        return;
      }
    }

    // 检测升级按钮
    if (renderer.potionUpgradeBtnRect && renderer.potionUpgradeBtnRect.enabled) {
      const btnHit = renderer.hitTest(x, y, [renderer.potionUpgradeBtnRect]);
      if (btnHit && game._potionSelectedLetter) {
        vibrate();
        // 先计算升级后的分数
        const potion = game.potionMode;
        const mult = potion.value || 2;
        const existing = letterUpgrades.get(game._potionSelectedLetter);
        const totalMult = existing ? existing.mult * mult : mult;
        const newScore = Math.floor(LETTER_SCORE[game._potionSelectedLetter] * totalMult);
        // 执行升级
        upgradeLetter(game, game._potionSelectedLetter);
        // 启动弹出动画
        game._potionUpgrading = {
          startTime: Date.now(),
          letter: game._potionSelectedLetter,
          newScore: newScore,
          upgradeMult: totalMult
        };
        game._potionSelectedLetter = null;
        return;
      }
    }

    // 检测暂存按钮
    if (renderer.potionStashBtnRect && renderer.potionStashBtnRect.enabled) {
      const btnHit = renderer.hitTest(x, y, [renderer.potionStashBtnRect]);
      if (btnHit) {
        vibrate();
        // 将药水放入道具栏（如果不在的话）
        if (game.potionMode) {
          const alreadyStashed = game.potions && game.potions.some(p => p.effect === game.potionMode.effect);
          if (!alreadyStashed) {
            game.potions = game.potions || [];
            game.potions.push({...game.potionMode});
          }
          game.potionMode = null;
        }
        game.state = game._prePotionState || 'shop';
        game._prePotionState = null;
        game._potionSelectedLetter = null;
        if (game.storageManager) game.storageManager.saveProgress(game);
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
  game._potionSelectedLetter = null;
  game._potionUpgrading = null;
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
