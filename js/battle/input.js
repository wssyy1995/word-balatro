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
        game.returnToHomepage();
      }, 350);
      return true;
    }
    // 点击弹窗外关闭弹窗
    game._battleHomeConfirmPopup = false;
    game._battleHomeConfirmAnimStart = null;
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
          wx.shareAppMessage({
            title: `我在单词对战中以 ${playerScore}:${botScore} 获胜!`,
            imageUrl: ''
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
          game.battleManager.startBattle('easy');
          // 重新走一遍匹配弹窗流程，等同于重新进入对战页
          game.battleManager.startMatchAnim();
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
          game.returnToHomepage();
        }, 350);
        return true;
      }
    }
  }

  return false;
}

module.exports = { handleBattleInput };
