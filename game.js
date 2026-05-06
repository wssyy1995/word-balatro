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
    // 字母置换弹窗打开时，优先处理弹窗点击
    if (game._changeLetterPopup) {
      // 检测关闭按钮
      if (renderer.changeLetterCloseRect) {
        const closeHit = renderer.hitTest(x, y, [renderer.changeLetterCloseRect]);
        if (closeHit) {
          vibrate();
          game._changeLetterPopup = null;
          return;
        }
      }
      // 检测字母块点击
      if (renderer.changeLetterRects) {
        const letterHit = renderer.hitTest(x, y, renderer.changeLetterRects);
        if (letterHit) {
          vibrate();
          game._changeLetterPopup.targetLetter = letterHit.letter;
          return;
        }
      }
      // 检测置换按钮
      if (renderer.changeLetterSwapBtnRect && renderer.changeLetterSwapBtnRect.enabled) {
        const btnHit = renderer.hitTest(x, y, [renderer.changeLetterSwapBtnRect]);
        if (btnHit) {
          vibrate();
          const popup = game._changeLetterPopup;
          const card = game.hand.find(c => c && c.id === popup.cardId);
          if (card && popup.targetLetter) {
            // 执行字母置换
            const { LETTER_SCORE, letterUpgrades, FACE_CARDS } = require('./data');
            card.letter = popup.targetLetter;
            card.baseScore = LETTER_SCORE[popup.targetLetter];
            const upgrade = letterUpgrades.get(popup.targetLetter);
            card.score = upgrade ? Math.floor(card.baseScore * upgrade.mult) : card.baseScore;
            card.upgraded = !!upgrade;
            card.upgradeMult = upgrade ? upgrade.mult : 1;
            card.isFace = FACE_CARDS.has(popup.targetLetter);
            // 清除选择状态
            card.selected = false;
            const selIdx = game.selected.indexOf(card.id);
            if (selIdx >= 0) game.selected.splice(selIdx, 1);
            // 消耗药水
            if (game.potions && game.potions[popup.potionIndex]) {
              game.potions.splice(popup.potionIndex, 1);
            }
            if (game.audioManager) game.audioManager.play('upgrade');
            if (game.storageManager) game.storageManager.saveProgress(game);
          }
          game._changeLetterPopup = null;
          return;
        }
      }
      // 点击遮罩关闭
      game._changeLetterPopup = null;
      return;
    }

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

    // 检测字母置换提示按钮点击
    if (renderer.changeLetterHintRect) {
      const hintHit = renderer.hitTest(x, y, [renderer.changeLetterHintRect]);
      if (hintHit) {
        vibrate();
        game._changeLetterHint = null;
        return;
      }
    }

    // 检测已购买道具栏中的药水牌点击
    if (renderer.potionPropRects) {
      const potionHit = renderer.hitTest(x, y, renderer.potionPropRects);
      if (potionHit) {
        vibrate();
        const potion = game.potions[potionHit.potionIndex];
        if (!potion) return;
        // 字母置换药水：游戏中直接使用，弹出选择弹窗
        if (potion.effect === 'change_letter') {
          const selectedCards = game.getSelectedCards();
          if (selectedCards.length !== 1) {
            game._changeLetterHint = { potionIndex: potionHit.potionIndex, startTime: Date.now() };
            return;
          }
          game._changeLetterPopup = {
            potionIndex: potionHit.potionIndex,
            cardId: selectedCards[0].id,
            originalLetter: selectedCards[0].letter,
            targetLetter: null,
            startTime: Date.now(),
          };
          return;
        }
        // 其他药水：进入 potion 状态
        game.potionMode = {...potion};
        game._prePotionState = 'playing';
        game.state = 'potion';
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

    // 检测刷新按钮点击（扣除 5 金币）
    if (renderer.shopRenderer && renderer.shopRenderer.shopRefreshRects) {
      const refreshHit = renderer.hitTest(x, y, renderer.shopRenderer.shopRefreshRects);
      if (refreshHit) {
        if (game.gold >= 5) {
          game.gold -= 5;
          vibrate();
          refreshModule(game, refreshHit.modIdx);
        }
        return;
      }
    }

    // 点击价格按钮直接购买（跳过确认弹窗）
    if (renderer.shopRenderer && renderer.shopRenderer.shopPriceBtnRects) {
      const priceHit = renderer.hitTest(x, y, renderer.shopRenderer.shopPriceBtnRects);
      if (priceHit) {
        vibrate();
        const item = game.shopItems[priceHit.index];
        if (!item) return;
        // 金币不足或已达上限，直接忽略
        if (game.gold < item.cost) return;
        if (item.type === 'witch' && (game.jokers || []).length >= 4) return;
        if (item.type === 'potion' && (game.potions || []).length >= 2) return;

        // 按下动效
        renderer.shopRenderer.priceBtnPressed = { index: priceHit.index, pressTime: Date.now() };

        setTimeout(() => {
          renderer.shopRenderer.priceBtnPressed = null;
          // 执行购买
          game._confirmBuyItemData = item ? {...item} : null;
          const success = buyItem(game, priceHit.index);
          if (success) {
            game.confirmBuyItem = priceHit.index;
            game._confirmBuySuccess = true;
            game._confirmBuySuccessTime = Date.now();
          }
        }, 200);
        return;
      }
    }

    if (renderer.shopRenderer && renderer.shopRenderer.nextRoundBtnRect) {
      const btnHit = renderer.hitTest(x, y, [renderer.shopRenderer.nextRoundBtnRect]);
      if (btnHit && !game._challengeBtnPressed) {
        vibrate();
        game._challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressed = true;
        renderer.shopRenderer.challengeBtnPressTime = Date.now();
        // 启动页面过渡动画
        game._shopToGameTransition = { startTime: Date.now() };
        setTimeout(() => {
          game.nextRound();
        }, 400);
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
        const oldScore = existing ? Math.floor(LETTER_SCORE[game._potionSelectedLetter] * existing.mult) : LETTER_SCORE[game._potionSelectedLetter];
        // 执行升级
        upgradeLetter(game, game._potionSelectedLetter);
        // 启动弹出动画
        game._potionUpgrading = {
          startTime: Date.now(),
          letter: game._potionSelectedLetter,
          oldScore: oldScore,
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
  game._changeLetterPopup = null;
  game._changeLetterHint = null;
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
