// ===== 对战模式状态管理器 =====
const { BattleBot } = require('./bot');
const { createBattleDeck, shuffle } = require('./deck');
const { LETTER_SCORE, WORD_DATA, EXPAND_WORD_DATA, onlineWordCache } = require('../data');

const HAND_SIZE = 12;
const DEFAULT_TOTAL_ROUNDS = 10;
const BOT_THINK_MIN_MS = 2000;
const BOT_THINK_MAX_MS = 4000;
const REVEAL_DURATION_MS = 4000;

// 模块加载时预缓存 3 字母和 4 字母种子词，避免每轮遍历整个词库
const BATTLE_SEED_WORDS_3 = [];
const BATTLE_SEED_WORDS_4 = [];
(function buildSeedWordCache() {
  for (const [word, info] of WORD_DATA.entries()) {
    if (word.length === 3) BATTLE_SEED_WORDS_3.push({ word, meaning: info.meaning || '' });
    else if (word.length === 4) BATTLE_SEED_WORDS_4.push({ word, meaning: info.meaning || '' });
  }
  if (EXPAND_WORD_DATA) {
    for (const [word, meaning] of EXPAND_WORD_DATA.entries()) {
      if (word.length === 3) BATTLE_SEED_WORDS_3.push({ word, meaning: meaning || '' });
      else if (word.length === 4) BATTLE_SEED_WORDS_4.push({ word, meaning: meaning || '' });
    }
  }
})();

// 生成 3 个种子词：1 个 3 字母 + 2 个 4 字母
function generateBattleSeedWords() {
  if (BATTLE_SEED_WORDS_3.length === 0 || BATTLE_SEED_WORDS_4.length === 0) {
    return [
      { word: 'cat', meaning: '猫' },
      { word: 'book', meaning: '书' },
      { word: 'look', meaning: '看' },
    ];
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return [pick(BATTLE_SEED_WORDS_3), pick(BATTLE_SEED_WORDS_4), pick(BATTLE_SEED_WORDS_4)];
}

// 根据多个单词计算合并所需字母（保留重复次数最大值）
function getRequiredLetters(words) {
  const maxCounts = {};
  for (const w of words) {
    const counts = {};
    for (const ch of w.toUpperCase()) {
      counts[ch] = (counts[ch] || 0) + 1;
    }
    for (const [ch, count] of Object.entries(counts)) {
      maxCounts[ch] = Math.max(maxCounts[ch] || 0, count);
    }
  }
  const letters = [];
  for (const [ch, count] of Object.entries(maxCounts)) {
    for (let i = 0; i < count; i++) letters.push(ch);
  }
  return letters;
}

// 创建单张对战卡牌
function createBattleCard(letter) {
  return {
    letter,
    baseScore: LETTER_SCORE[letter] || 1,
    score: LETTER_SCORE[letter] || 1,
    isFace: false,
    id: Math.random().toString(36).substr(2, 9),
    selected: false,
  };
}

// 从手牌中找出能组成单词的卡牌数组
function findCardsForWord(word, hand) {
  const cards = hand.filter(Boolean);
  const used = new Set();
  const result = [];
  for (const ch of word.toUpperCase()) {
    let found = false;
    for (let i = 0; i < cards.length; i++) {
      if (!used.has(i) && cards[i].letter.toUpperCase() === ch) {
        used.add(i);
        result.push(cards[i]);
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return result;
}

// 获取单词中文释义（优先种子词，再本地词库）
function getBattleWordMeaning(word, seedWords) {
  const lower = word.toLowerCase();
  // 1. 优先从种子词匹配
  if (seedWords) {
    for (const sw of seedWords) {
      if (sw.word.toLowerCase() === lower) return sw.meaning || '';
    }
  }
  // 2. 核心离线词库
  if (WORD_DATA.has(lower)) {
    const info = WORD_DATA.get(lower);
    return info.meaning || '';
  }
  // 3. 扩展离线词库
  if (EXPAND_WORD_DATA && EXPAND_WORD_DATA.has(lower)) {
    return EXPAND_WORD_DATA.get(lower) || '';
  }
  return '';
}

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
    g._battleSeedWords = [];
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

    // 生成 3 个种子词：1 个 3 字母 + 2 个 4 字母
    const seedWords = generateBattleSeedWords();
    g._battleSeedWords = seedWords;

    // Bot 随机从 3 个种子词里选一个
    const botSeedIndex = Math.floor(Math.random() * seedWords.length);
    const botSeed = seedWords[botSeedIndex];
    g._battleBotSeedIndex = botSeedIndex;

    // 计算 3 个种子词合并所需字母，生成手牌（确保玩家能出所有种子词）
    const requiredLetters = getRequiredLetters(seedWords.map(s => s.word));
    let hand = requiredLetters.map(letter => createBattleCard(letter));

    // 从牌堆补牌到 12 张
    const deckCopy = [...g._battleDeck];
    while (hand.length < HAND_SIZE && deckCopy.length > 0) {
      hand.push(deckCopy.shift());
    }
    // 洗牌
    hand = shuffle(hand);

    g.battleHand = hand;
    g.battleBotHand = [...hand];
    g._battleDeck = deckCopy;

    if (g.battleRound > 1 && g.audioManager) g.audioManager.play('card_shuffle');
    g.battleSelected = [];
    g.battlePlayerWord = null;
    g.battlePlayerCards = null;
    g.battleBotWord = null;
    g.battleBotCards = null;
    g.battlePlayerWordMeaning = '';
    g.battleBotWordMeaning = '';
    g.battlePhase = 'selecting';
    g.battleBotThinking = true;
    g.battleBotReady = false;
    g.battleBotThinkingStartTime = Date.now();
    g._battleBotThinkDuration = BOT_THINK_MIN_MS + Math.floor(Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
    g._battleBotReadyAnimStart = null;
    g._battlePlayerReadyAnimStart = null;
    g.battlePendingCheck = null;
    g._battleCheckingWord = false;
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
    g._battleAnimTimeline = null;
    g._battleFlyingScores = [];
    g._battleScoreBarAnim = null;
    g._battleAvatarGlowAnim = null;
    g._battlePlayerPlayed = false;

    // 预计算 Bot 出牌：它出的就是选中的种子词
    const botCards = findCardsForWord(botSeed.word, g.battleBotHand) || botSeed.word.toUpperCase().split('').map(letter => createBattleCard(letter));
    const botScore = this._calcWordScore(botCards);
    g._pendingBotChoice = {
      word: botSeed.word,
      cards: botCards,
      score: botScore,
      meaning: botSeed.meaning,
    };
    g.battleBotWordLength = botSeed.word.length;

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
    g.battlePlayerWordMeaning = getBattleWordMeaning(word, g._battleSeedWords);
    g.battlePhase = 'player_played';
    g._battlePlayerPlayed = true;
    g._battlePlayerReadyAnimStart = Date.now();
    g._battleFlyingScores = [];
    g._battleScoreBarAnim = null;
    // 玩家出牌后显示 battle_me_place 占位方块时播放音效
    if (g.audioManager) g.audioManager.play('battle_play_card');

    // 如果对方已经就绪，直接进入揭晓阶段
    if (g.battleBotReady) {
      this.startReveal();
    }

    return { valid: true, score };
  }

  // 双方都已出牌，进入揭晓动画
  startReveal() {
    const g = this.game;
    if (g.battlePhase !== 'player_played') return;
    g.battlePhase = 'revealing';

    const botChoice = g._pendingBotChoice;
    if (botChoice) {
      g.battleBotWord = botChoice.word;
      g.battleBotCards = botChoice.cards;
      g.battleBotRoundScore = botChoice.score;
      g.battleBotWordMeaning = botChoice.meaning || '';
    } else {
      g.battleBotWord = '';
      g.battleBotCards = [];
      g.battleBotRoundScore = 0;
      g.battleBotWordMeaning = '';
    }

    g.battlePlayerRoundScores.push(g.battlePlayerRoundScore);
    g.battleBotRoundScores.push(g.battleBotRoundScore);

    // 记录更新前的分数比例，用于进度条滑动动画
    // 总分在计分动画结束后再累加，避免进度条提前变化
    const prevBotScore = g.battleBotScore || 0;
    const prevPlayerScore = g.battlePlayerScore || 0;
    const prevTotal = prevBotScore + prevPlayerScore;
    const fromRatio = prevTotal > 0 ? prevBotScore / prevTotal : 0.5;

    const botScore = prevBotScore + (g.battleBotRoundScore || 0);
    const playerScore = prevPlayerScore + (g.battlePlayerRoundScore || 0);
    const total = botScore + playerScore;
    const toRatio = total > 0 ? botScore / total : 0.5;

    // 设置 reveal 动画时间线
    const now = Date.now();
    g._battleRevealStartTime = now;
    g._battleAnimTimeline = {
      step: 'placeholders',
      stepStartTime: now,
      fromRatio,
      toRatio,
      playerScoreTriggered: false,
      botScoreTriggered: false,
    };
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
      // 对方从“选择中”变为“已选择”时播放出牌音效
      if (g.audioManager) g.audioManager.play('battle_play_card');
      // 如果玩家已经出牌，双方就绪，进入揭晓
      if (g.battlePhase === 'player_played') {
        this.startReveal();
      }
    }
  }

  checkReveal() {
    const g = this.game;
    if (g.battlePhase === 'revealing' && g._battleAnimTimeline && g._battleAnimTimeline.step === 'done') {
      if (Date.now() - g._battleAnimTimeline.stepStartTime >= 800) {
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
    g._battlePlayerReadyAnimStart = null;
    g._battlePlayedWords = null;
    g.battlePendingCheck = null;
    g._battleSeedWords = null;
    g._battleBotSeedIndex = null;
    g.battlePlayerWordMeaning = '';
    g.battleBotWordMeaning = '';
    if (g._battlePendingCheckTimer) {
      clearTimeout(g._battlePendingCheckTimer);
      g._battlePendingCheckTimer = null;
    }
    g._battleAnimTimeline = null;
    g._battleFlyingScores = [];
    g._battleAvatarGlowAnim = null;
    g._battlePlayerPlayed = false;
  }
}

module.exports = { BattleManager };
