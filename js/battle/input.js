// ===== 对战模式输入处理 =====
function handleBattleInput(game, renderer, x, inputY, vibrate) {
  if (game.state !== 'battle' || !game.battleManager) return false;

  const battle = renderer.battleRenderer;
  if (!battle) return false;

  // 设置弹窗打开时，不处理对战底层交互
  if (game._settingsPopup && !game._closingSettings) return false;

  // 左上角返回按钮
  if (battle.battleBackBtnRect) {
    const backHit = renderer.hitTest(x, inputY, [battle.battleBackBtnRect]);
    if (backHit) {
      vibrate();
      game.battleManager.exitBattle();
      return true;
    }
  }

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
    // 检测返回菜单按钮
    if (battle.battleMenuBtnRect) {
      const btnHit = renderer.hitTest(x, inputY, [battle.battleMenuBtnRect]);
      if (btnHit) {
        vibrate();
        game._battleMenuBtnPressed = true;
        setTimeout(() => { game._battleMenuBtnPressed = false; }, 150);
        game.battleManager.exitBattle();
        return true;
      }
    }
  }

  return false;
}

module.exports = { handleBattleInput };
