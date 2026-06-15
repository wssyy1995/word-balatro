// ===== 触摸输入处理 =====
class InputHandler {
  constructor(canvas, game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.lastTapTime = 0;

    // 绑定触摸事件
    canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    const game = this.game;
    const renderer = this.renderer;

    if (game.state === 'playing') {
      // 检测卡牌点击
      const cardHit = renderer.hitTest(x, y, renderer.cardRects);
      if (cardHit) {
        game.toggleSelect(cardHit.cardId);
        return;
      }

      // 检测出牌按钮
      if (renderer.playBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.playBtnRect]);
        if (btnHit) {
          const selected = game.getSelectedCards();
          if (selected.length >= 2) {
            game.playHand().then(result => {
              if (result.valid) {
                // 出牌成功
              }
            });
          }
          return;
        }
      }

      // 检测弃牌按钮
      if (renderer.discardBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.discardBtnRect]);
        if (btnHit) {
          game.discard();
          return;
        }
      }

      // 检测投降按钮
      if (renderer.surrenderBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.surrenderBtnRect]);
        if (btnHit) {
          // 微信小游戏 confirm 需要用 wx.showModal
          wx.showModal({
            title: '确认投降',
            content: '确定要投降吗？当前进度将保存到报告中。',
            success: (res) => {
              if (res.confirm) {
                game.state = 'gameover';
                game.gameOverReason = 'surrender';
                if (game._uploadRankData) game._uploadRankData();
              }
            }
          });
          return;
        }
      }
    }

    if (game.state === 'shop') {
      // 检测商品点击
      if (renderer.shopRects) {
        const itemHit = renderer.hitTest(x, y, renderer.shopRects);
        if (itemHit) {
          game.buyItem(itemHit.index);
          return;
        }
      }

      // 检测下一关按钮
      if (renderer.nextRoundBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.nextRoundBtnRect]);
        if (btnHit) {
          game.nextRound();
          return;
        }
      }
    }

    if (game.state === 'potion') {
      // 随机强化转盘弹窗
      if (game.potionMode && game.potionMode.effect === 'random_upgrade') {
        // 检测关闭按钮
        if (renderer.randomUpgradeCloseRect) {
          const closeHit = renderer.hitTest(x, y, [renderer.randomUpgradeCloseRect]);
          if (closeHit) {
            if (game.potionMode) {
              game.gold += game.potionMode.cost;
              game.potionMode = null;
            }
            game._randomUpgradePopup = null;
            game.state = 'shop';
            return;
          }
        }

        // 检测中心抽选按钮（圆形区域）
        if (renderer.randomSpinBtnRect && renderer.randomSpinBtnRect.enabled) {
          const btn = renderer.randomSpinBtnRect;
          const dx = x - btn.cx;
          const dy = y - btn.cy;
          if (dx * dx + dy * dy <= btn.r * btn.r) {
            game.startRandomSpin();
            return;
          }
        }

        return; // 转盘弹窗内其他区域不响应
      }

      // 检测药水选牌
      if (renderer.potionCardRects) {
        const cardHit = renderer.hitTest(x, y, renderer.potionCardRects);
        if (cardHit) {
          game.upgradeCard(cardHit.cardId);
          return;
        }
      }

      // 检测取消按钮
      if (renderer.cancelBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.cancelBtnRect]);
        if (btnHit) {
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
      // 检测重新开始按钮
      if (renderer.restartBtnRect) {
        const btnHit = renderer.hitTest(x, y, [renderer.restartBtnRect]);
        if (btnHit) {
          // 需要暴露 restart 方法
          wx.emit('restart');
          return;
        }
      }
    }
  }
}

module.exports = { InputHandler };
