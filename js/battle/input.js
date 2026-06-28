// ===== 对战模式输入处理 =====
function handleBattleInput(game, renderer, x, inputY, vibrate) {
  if (game.state !== 'battle' || !game.battleManager) return false;

  const battle = renderer.battleRenderer;
  if (!battle) return false;

  // 设置弹窗打开时，不处理对战底层交互
  if (game._settingsPopup && !game._closingSettings) return false;

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
        vibrate();
        game._battleShareBtnPressed = true;
        setTimeout(() => { game._battleShareBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        const playerScore = game.battlePlayerScore || 0;
        const botScore = game.battleBotScore || 0;
        wx.shareAppMessage({
          title: `我在单词对战中以 ${playerScore}:${botScore} 获胜!`,
          imageUrl: ''
        });
        return true;
      }
    }

    // 检测重新挑战按钮
    if (battle.battleRestartBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleRestartBtnRect]);
      if (btnHit) {
        vibrate();
        game._battleRestartBtnPressed = true;
        setTimeout(() => { game._battleRestartBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        game.battleManager.startBattle('easy');
        return true;
      }
    }

    // 检测回到主页按钮
    if (battle.battleHomeBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleHomeBtnRect]);
      if (btnHit) {
        vibrate();
        game._battleHomeBtnPressed = true;
        setTimeout(() => { game._battleHomeBtnPressed = false; }, 150);
        if (game.audioManager) game.audioManager.play('tap');
        game.returnToHomepage();
        return true;
      }
    }
  }

  return false;
}

module.exports = { handleBattleInput };
