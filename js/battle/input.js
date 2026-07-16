// ===== 对战模式输入处理 =====
function handleBattleInput(game, renderer, x, inputY, vibrate) {
  if (game.state !== 'battle' || !game.battleManager) return false;

  const battle = renderer.battleRenderer;
  if (!battle) return false;

  // 设置弹窗打开时，不处理对战底层交互
  if (game._settingsPopup && !game._closingSettings) return false;

  // 回到首页确认弹窗
  if (game._battleHomeConfirmPopup) {
    const cancelHit = battle.battleHomeConfirmCancelRect && renderer.hitTest(x, inputY, [battle.battleHomeConfirmCancelRect]);
    const okHit = battle.battleHomeConfirmOkRect && renderer.hitTest(x, inputY, [battle.battleHomeConfirmOkRect]);
    if (cancelHit) {
      vibrate();
      if (game.audioManager) game.audioManager.play('tap');
      game._battleHomeConfirmCancelPressed = true;
      setTimeout(() => { game._battleHomeConfirmCancelPressed = false; }, 150);
      setTimeout(() => {
        game._battleHomeConfirmPopup = false;
        game._battleHomeConfirmAnimStart = null;
      }, 350);
      return true;
    }
    if (okHit) {
      vibrate();
      if (game.audioManager) game.audioManager.play('tap');
      game._battleHomeConfirmOkPressed = true;
      setTimeout(() => { game._battleHomeConfirmOkPressed = false; }, 150);
      setTimeout(() => {
        game._battleHomeConfirmPopup = false;
        game._battleHomeConfirmAnimStart = null;
        // 联网对战且仍在房间中：先关闭房间再返回首页
        if (game._battleOnline && game._battleRoomId) {
          game.battleManager.closeRoomAndReturnHomepage();
        } else {
          game.returnToHomepage();
        }
      }, 350);
      return true;
    }
    // 点击弹窗外关闭弹窗
    game._battleHomeConfirmPopup = false;
    game._battleHomeConfirmAnimStart = null;
    return true;
  }

  // 房间已结束弹窗（对方退出）
  if (game._battleRoomClosedPopup) {
    const okHit = battle.battleRoomClosedOkRect && renderer.hitTest(x, inputY, [battle.battleRoomClosedOkRect]);
    if (okHit) {
      vibrate();
      if (game.audioManager) game.audioManager.play('tap');
      game._battleRoomClosedOkPressed = true;
      setTimeout(() => { game._battleRoomClosedOkPressed = false; }, 150);
      setTimeout(() => {
        game.battleManager.closeRoomClosedPopupAndExit();
      }, 350);
      return true;
    }
    // 房间结束弹窗必须点击按钮才能关闭
    return true;
  }

  // 左上角 top_home 返回主页按钮：已移至 game.js 统一处理（支持长按调试面板）

  if (game.battlePhase === 'selecting') {
    // 选择新卡牌时清除之前的失败校验提示
    if (game.battlePendingCheck && game.battlePendingCheck.state !== 'valid') {
      game.battlePendingCheck = null;
    }

    // 检测卡牌点击
    if (battle.battleCardRects) {
      const cardHit = renderer.hitTest(x, inputY, battle.battleCardRects);
      if (cardHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_placement');
        game.battleManager.toggleBattleSelect(cardHit.card);
        return true;
      }
    }
    // 检测出牌按钮
    if (battle.battlePlayBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battlePlayBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._battlePlayBtnPressed = true;
        setTimeout(() => { game._battlePlayBtnPressed = false; }, 150);
        game.battleManager.playHand().catch(() => {});
        return true;
      }
    }
    // 检测清空按钮
    if (battle.battleClearBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleClearBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('card_placement');
        game._battleClearBtnPressed = true;
        setTimeout(() => { game._battleClearBtnPressed = false; }, 150);
        game.battleManager.clearBattleSelection();
        return true;
      }
    }
  } else if (game.battlePhase === 'round_end' || (game.battlePhase === 'revealing' && game._battleAnimTimeline && game._battleAnimTimeline.step === 'done')) {
    // 回合推进卡住时的手动重试按钮
    if (battle.battleRetryBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleRetryBtnRect]);
      if (btnHit) {
        vibrate();
        if (game.audioManager) game.audioManager.play('tap');
        game._battleRetryBtnPressed = true;
        setTimeout(() => { game._battleRetryBtnPressed = false; }, 150);
        if (game.battleManager) {
          if (game._battleIsHost) {
            // 房主：强制重置调用锁并重试推进
            if (game._battleNextRoundCalling) {
              game._battleNextRoundCalling = false;
              game._battleNextRoundCallingStartTime = null;
            }
            game.battleManager.nextRound();
          } else {
            // 好友：主动拉取一次最新房间状态
            wx.cloud.callFunction({
              name: 'battleGet',
              data: { roomId: game._battleRoomId },
              success: (res) => {
                if (res.result && res.result.code === 0 && game.battleManager) {
                  game.battleManager._applyRoomState(res.result.room);
                }
              },
              fail: (err) => {
                console.error('[battleGet] 手动刷新失败:', err);
              }
            });
          }
        }
        return true;
      }
    }
  } else if (game.battlePhase === 'battle_end') {
    // 检测分享战绩按钮（仅胜利时存在）
    if (battle.battleShareBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleShareBtnRect]);
      if (btnHit) {
        if (game._battleShareBtnLocked) return true;
        game._battleShareBtnLocked = true;
        vibrate();
        game._battleShareBtnPressed = true;
        setTimeout(() => { game._battleShareBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        setTimeout(() => {
          const playerScore = game.battlePlayerScore || 0;
          const botScore = game.battleBotScore || 0;
          const canvas = renderer.ctx && renderer.ctx.canvas;
          let imageUrl = '';
          if (canvas) {
            try {
              const captureH = Math.floor(canvas.height * 0.5);
              const captureY = Math.floor((canvas.height - captureH) / 2);
              imageUrl = canvas.toTempFilePathSync({
                x: 0,
                y: captureY,
                width: canvas.width,
                height: captureH,
                destWidth: 500,
                destHeight: Math.floor(500 * captureH / canvas.width),
                fileType: 'png',
                quality: 0.85
              });
            } catch (e) {
              console.warn('[BattleShare] Canvas 截图失败:', e);
            }
          }
          wx.shareAppMessage({
            title: `我在单词对战中以 ${playerScore}:${botScore} 获胜!`,
            imageUrl
          });
          game._battleShareBtnLocked = false;
        }, 350);
        return true;
      }
    }

    // 检测重新挑战按钮
    if (battle.battleRestartBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleRestartBtnRect]);
      if (btnHit) {
        if (game._battleRestartBtnLocked) return true;
        game._battleRestartBtnLocked = true;
        vibrate();
        game._battleRestartBtnPressed = true;
        setTimeout(() => { game._battleRestartBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        setTimeout(() => {
          if (game._battleOnline && game.battleManager) {
            // 好友对战：发起重新开始邀请
            game.battleManager.requestRestart();
          } else {
            // 本地人机/随机匹配：重新开局
            game.battleManager.startBattle('easy');
            game.battleManager.startMatchAnim();
          }
        }, 350);
        return true;
      }
    }

    // 检测回到首页按钮
    if (battle.battleHomeBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleHomeBtnRect]);
      if (btnHit) {
        console.log('[BattleInput] home button hit');
        if (game._battleHomeBtnLocked) return true;
        game._battleHomeBtnLocked = true;
        vibrate();
        game._battleHomeBtnPressed = true;
        setTimeout(() => { game._battleHomeBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        setTimeout(() => {
          // 好友对战需要先关闭房间，避免对方卡在房间中看不到状态
          if (game._battleOnline && game.battleManager) {
            game.battleManager.closeRoomAndReturnHomepage();
          } else {
            game.returnToHomepage();
          }
        }, 350);
        return true;
      }
    }
  }

  return false;
}

module.exports = { handleBattleInput };
