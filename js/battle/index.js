// ===== 对战模式模块入口 =====
const { BattleManager } = require('./manager');
const { BattleRenderer } = require('./renderer');
const { BattleBot } = require('./bot');
const { createBattleDeck, shuffle } = require('./deck');
const { handleBattleInput } = require('./input');

module.exports = {
  BattleManager,
  BattleRenderer,
  BattleBot,
  createBattleDeck,
  shuffle,
  handleBattleInput,
};
