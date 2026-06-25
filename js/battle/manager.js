// ===== 对战模式状态管理器 =====
const { BattleBot } = require('./bot');
const { createBattleDeck } = require('./deck');
const { LETTER_SCORE, WORD_DATA, EXPAND_WORD_DATA, onlineWordCache } = require('../data');

const HAND_SIZE = 12;
const DEFAULT_TOTAL_ROUNDS = 10;
const BOT_THINK_MIN_MS = 2000;
const BOT_THINK_MAX_MS = 4000;
const REVEAL_DURATION_MS = 4000;

class BattleManager {
  constructor(game) {
    this.game = game;
  }

  startBattle(difficulty = 'easy') {
    const g = this.game;
    g.state = 'battle';
    g.battleMode = true;
    g.battleDifficulty = difficulty;
    g.battleRound = 1;
    g.battleTotalRounds = DEFAULT_TOTAL_ROUNDS;
    g.battlePlayerScore = 0;
    g.battleBotScore = 0;
    g.battlePlayerRoundScores = [];
    g.battleBotRoundScores = [];
    g.battlePhase = 'selecting';
    g.battleBotWord = null;
    g.battleBotCards = null;
    g.battleBotThinking = false;
    g.battleBotReady = false;
    g.battleBotThinkingStartTime = null;
    g.battleSelected = [];
    g._battleDeck = createBattleDeck();
    g._battlePlayedWords = new Set();
    g.battlePendingCheck = null;
    g._battleMatchAnim = null;
    g._battleMatchFinished = false;
    g._battleOpponent = null;
    // 立即初始化第一回合手牌，匹配弹窗弹出时背景已能看到字母卡牌
    this._startRound();
  }

  // 匹配弹窗结束后清理状态，玩家可立即开始操作
  finishMatchSetup() {
    const g = this.game;
    if (g._battleMatchFinished) return;
    g._battleMatchFinished = true;
    // 匹配弹窗结束后 bot 才真正开始思考，避免弹窗等待期间计入思考时间
    g.battleBotThinkingStartTime = Date.now();
    g._battleBotThinkDuration = BOT_THINK_MIN_MS + Math.floor(Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
  }

  _startRound() {
    const g = this.game;
    const deckCopy = [...g._battleDeck];
    g.battleHand = deckCopy.splice(0, HAND_SIZE);
    g.battleBotHand = [...g.battleHand];
    g._battleDeck = deckCopy;
    if (g.battleRound > 1 && g.audioManager) g.audioManager.play('card_shuffle');
    g.battleSelected = [];
    g.battlePlayerWord = null;
    g.battlePlayerCards = null;
    g.battleBotWord = null;
    g.battleBotCards = null;
    g.battlePhase = 'selecting';
    g.battleBotThinking = true;
    g.battleBotReady = false;
    g.battleBotThinkingStartTime = Date.now();
    g._battleBotThinkDuration = BOT_THINK_MIN_MS + Math.floor(Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
    g._battleBotReadyAnimStart = null;
    g.battlePendingCheck = null;
    g._battleCheckingWord = false;
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
    g._battleAnimTimeline = null;
    g._battleFlyingScores = [];
    g._battleScoreBarAnim = null;

    g._battleBot = new BattleBot(g.battleDifficulty);
    const botChoice = g._battleBot.chooseWord(g.battleBotHand, WORD_DATA, EXPAND_WORD_DATA);
    g._pendingBotChoice = botChoice;
    g.battleBotWordLength = botChoice ? botChoice.word.length : 0;

    if (g._battleDeck.length < HAND_SIZE) {
      g._battleDeck.push(...createBattleDeck());
    }
  }

  async playHand() {
    const g = this.game;
    if (g.battlePhase !== 'selecting') return { valid: false };
    if (g._battleCheckingWord) return { valid: false };
    const selected = this.getBattleSelectedCards();
    if (selected.length < 2) return { valid: false };

    const word = selected.map(c => c.letter.toLowerCase()).join('');
    const lowerWord = word.toLowerCase();

    // === 第一/二重校验：长度 + 本地/在线词库（在线结果缓存） ===
    const inWordData = WORD_DATA.has(lowerWord) || EXPAND_WORD_DATA.has(lowerWord) || onlineWordCache.has(lowerWord);

    // 本地未命中，尝试在线查询
    if (!inWordData) {
      g._battleCheckingWord = true;
      g.battlePendingCheck = { word, state: 'checking', failText: '查询中...', startTime: Date.now() };

      let valid = false;
      try {
        valid = await g.isValidWordOnline(word);
      } catch (e) {
        valid = false;
      }

      g._battleCheckingWord = false;

      // 查询期间玩家可能已清空选择或状态改变
      if (g.battlePhase !== 'selecting') return { valid: false };
      const currentSelected = this.getBattleSelectedCards();
      const currentWord = currentSelected.map(c => c.letter.toLowerCase()).join('');
      if (currentWord !== word) return { valid: false };

      if (!valid) {
        g.battlePendingCheck = { word, state: 'invalid', failText: '单词不存在', startTime: Date.now() };
        if (g.audioManager) g.audioManager.play('card_illegal');
        // 非法提示不自动消失，玩家需点击新卡牌或清空后重新选择
        return { valid: false };
      }
    }

    // === 第三重校验：本局是否已出过 ===
    if (g._battlePlayedWords && g._battlePlayedWords.has(lowerWord)) {
      g.battlePendingCheck = { word, state: 'duplicate', failText: '本局已出过该单词', startTime: Date.now() };
      if (g.audioManager) g.audioManager.play('card_illegal');
      // 重复提示不自动消失，玩家需点击新卡牌或清空后重新选择
      return { valid: false };
    }

    // 校验通过：记录已出单词
    g._battlePlayedWords.add(lowerWord);
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
    g.battlePendingCheck = { word, state: 'valid', startTime: Date.now() };
    if (g.audioManager) g.audioManager.play('card_valid');

    const score = this._calcWordScore(selected);
    g.battlePlayerWord = word;
    g.battlePlayerCards = selected;
    g.battlePlayerRoundScore = score;
    g.battlePhase = 'revealing';

    const botChoice = g._pendingBotChoice;
    if (botChoice) {
      g.battleBotWord = botChoice.word;
      g.battleBotCards = botChoice.cards;
      g.battleBotRoundScore = botChoice.score;
    } else {
      g.battleBotWord = '';
      g.battleBotCards = [];
      g.battleBotRoundScore = 0;
    }

    // 记录更新前的分数比例，用于进度条滑动动画
    const prevBotScore = g.battleBotScore || 0;
    const prevPlayerScore = g.battlePlayerScore || 0;
    const prevTotal = prevBotScore + prevPlayerScore;
    const fromRatio = prevTotal > 0 ? prevBotScore / prevTotal : 0.5;

    g.battlePlayerRoundScores.push(g.battlePlayerRoundScore);
    g.battleBotRoundScores.push(g.battleBotRoundScore);
    g.battlePlayerScore += g.battlePlayerRoundScore;
    g.battleBotScore += g.battleBotRoundScore;

    // 设置 reveal 动画时间线
    const now = Date.now();
    g._battleRevealStartTime = now;
    g._battleAnimTimeline = {
      playerScoreStart: now + 500,
      playerScoreTriggered: false,
      botWordStart: now + 1000,
      botWordTriggered: false,
      botScoreStart: now + 1500,
      botScoreTriggered: false,
    };
    g._battleFlyingScores = [];

    // 分数进度条动画：金光闪烁开始时启动，与闪烁同时结束
    const botScore = g.battleBotScore;
    const playerScore = g.battlePlayerScore;
    const total = botScore + playerScore;
    const toRatio = total > 0 ? botScore / total : 0.5;
    const appearDuration = 300;
    const delayAfterBoth = 500;
    const scoreDuration = 500;
    const flashDuration = 800;
    const lastScoreStart = Math.max(now + 500, now + 1500);
    const scoreScaleStart = lastScoreStart + appearDuration + delayAfterBoth;
    const flashStart = scoreScaleStart + scoreDuration;
    g._battleScoreBarAnim = {
      startTime: flashStart,
      fromRatio,
      toRatio,
      duration: flashDuration
    };

    return { valid: true, score };
  }

  _calcWordScore(cards) {
    if (!cards || cards.length === 0) return 0;
    const mult = cards.length;
    let baseScore = 0;
    for (const c of cards) {
      baseScore += c.score || LETTER_SCORE[c.letter] || 1;
    }
    return Math.ceil(baseScore * mult);
  }

  nextRound() {
    const g = this.game;
    if (g.battlePhase !== 'round_end') return;
    if (g.battleRound >= g.battleTotalRounds) {
      g.battlePhase = 'battle_end';
      return;
    }
    g.battleRound++;
    this._startRound();
  }

  updateBotThinking() {
    const g = this.game;
    if (!g.battleBotThinking || g.battleBotReady) return;
    if (g.battleBotThinkingStartTime && Date.now() - g.battleBotThinkingStartTime >= g._battleBotThinkDuration) {
      g.battleBotThinking = false;
      g.battleBotReady = true;
      g._battleBotReadyAnimStart = Date.now();
    }
  }

  checkReveal() {
    const g = this.game;
    if (g.battlePhase === 'revealing' && g._battleScoreBarAnim) {
      const animEnd = g._battleScoreBarAnim.startTime + g._battleScoreBarAnim.duration;
      if (Date.now() >= animEnd + 800) {
        if (g.battleRound >= g.battleTotalRounds) {
          g.battlePhase = 'battle_end';
        } else {
          g.battleRound++;
          this._startRound();
        }
      }
    }
  }

  toggleBattleSelect(card) {
    const g = this.game;
    if (!g.battleSelected) g.battleSelected = [];
    const idx = g.battleSelected.indexOf(card.id);
    if (idx >= 0) {
      g.battleSelected.splice(idx, 1);
      card.selected = false;
    } else {
      g.battleSelected.push(card.id);
      card.selected = true;
    }
  }

  getBattleSelectedCards() {
    const g = this.game;
    if (!g.battleSelected || !g.battleHand) return [];
    return g.battleSelected.map(id => g.battleHand.find(c => c && c.id === id)).filter(Boolean);
  }

  clearBattleSelection() {
    const g = this.game;
    if (g.battleHand) {
      g.battleHand.forEach(c => { if (c) c.selected = false; });
    }
    g.battleSelected = [];
    g.battlePendingCheck = null;
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
  }

  exitBattle() {
    const g = this.game;
    g.battleMode = false;
    g.state = 'playing';
    this._resetToSinglePlayer();
  }

  _resetToSinglePlayer() {
    const g = this.game;
    g.battleHand = null;
    g.battleBotHand = null;
    g.battleSelected = null;
    g.battleBotWordLength = 0;
    g._battleDeck = null;
    g._pendingBotChoice = null;
    g._battleBot = null;
    g._battleRevealStartTime = null;
    g.battleBotReady = false;
    g.battleBotThinking = false;
    g._battleBotReadyAnimStart = null;
    g._battlePlayedWords = null;
    g.battlePendingCheck = null;
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
    g._battleAnimTimeline = null;
    g._battleFlyingScores = [];
  }
}

module.exports = { BattleManager };
