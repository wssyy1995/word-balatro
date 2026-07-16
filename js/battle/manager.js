// ===== 对战模式状态管理器 =====
const { BattleBot } = require('./bot');
const { createBattleDeck, shuffle } = require('./deck');
const { LETTER_SCORE, WORD_DATA, EXPAND_WORD_DATA, onlineWordCache, wordMeaningCache } = require('../data');

function cloudLog(game, msg) {
  if (game && game.cloudStorage && game.cloudStorage.log) {
    game.cloudStorage.log(msg);
  }
}

const HAND_SIZE = 12;
const DEFAULT_TOTAL_ROUNDS = 10;
const BOT_FAST_MIN_MS = 6000;
const BOT_FAST_MAX_MS = 10000;
const BOT_WAIT_PLAYER_MIN_MS = 2000;
const BOT_WAIT_PLAYER_MAX_MS = 4000;
const BOT_WAIT_PLAYER_MAX_WAIT_MS = 30000; // wait_player 策略最多等玩家 30 秒
const BOT_FAST_PROBABILITY = 0.7;
const REVEAL_DURATION_MS = 4000;
const TURN_TIMEOUT_MS = 15000; // 单回合出牌倒计时 15 秒
const ROOM_POLL_INTERVAL_MS = 800; // 好友对战房间状态轮询间隔（原 1500ms，降低延迟）

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
  // 4. 在线校验缓存的释义：玩家打出「在线校验通过但不在本地词库/种子词」的生僻词时，
  //    本地取不到释义，但 isValidWordOnline 已把百度词典释义写入全局 wordMeaningCache
  if (wordMeaningCache && wordMeaningCache.has(lower)) {
    const cached = wordMeaningCache.get(lower);
    if (cached && cached.meaning) return cached.meaning;
  }
  return '';
}

class BattleManager {
  constructor(game) {
    this.game = game;
  }

  startBattle(difficulty = 'easy', options = {}) {
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
    // 联网对战标记
    g._battleOnline = options.online || false;
    g._battleRoomId = options.roomId || null;
    g._battleIsHost = options.isHost || false;
    g._battleOpponentOpenId = null;
    g._battleHostPlay = null;
    g._battleGuestPlay = null;
    g._battleRoomPollTimer = null;
    g._battlePendingRoom = null;
    g._battleRoundEndStartTime = null;
    g._battleNextRoundPressed = false;
    g._battleNextRoundCalling = false;
    // 清除对战结束弹窗按钮锁，避免重开后按钮无响应
    g._battleShareBtnLocked = false;
    g._battleRestartBtnLocked = false;
    g._battleHomeBtnLocked = false;
    g._battleRetryBtnPressed = false;
    // 清除回到首页确认弹窗状态
    g._battleHomeConfirmPopup = false;
    g._battleHomeConfirmAnimStart = null;
    g._battleHomeConfirmCancelPressed = false;
    g._battleHomeConfirmOkPressed = false;
    // 立即初始化第一回合手牌，匹配弹窗弹出时背景已能看到字母卡牌
    // 联网对战且传入 roomData 时，使用云端统一生成的手牌
    if (g._battleOnline && options.roomData) {
      this._startRound(options.roomData);
    } else {
      this._startRound();
    }

    // 联网对战：异步加载对手真实头像/昵称/荣誉杯
    // 注意：startBattle 时 _battleOpponentOpenId 可能尚未赋值，
    // 实际加载逻辑在 _applyRoomState 首次获取到 room.host/guest 时触发。
  }

  // 联网对战：从云端加载对手真实信息
  async _loadOnlineOpponent(opponentOpenId) {
    const g = this.game;
    if (!opponentOpenId) return;
    try {
      const res = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'getBattleOpponent',
          data: { opponentOpenId },
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      });
      if (res.result && res.result.code === 0 && res.result.opponent) {
        const opp = res.result.opponent;
        g._battleOpponent = {
          name: opp.nickname || '玩家A',
          avatarUrl: opp.avatarUrl || '',
          trophies: typeof opp.trophies === 'number' ? opp.trophies : 0,
          openid: opp.openid
        };
        // 如果有头像 URL，让渲染器异步加载图片
        if (opp.avatarUrl && g.renderer && g.renderer.battleRenderer) {
          g.renderer.battleRenderer._loadOpponentAvatar(opp.avatarUrl, g);
        }
      }
    } catch (e) {
      console.error('[BattleManager] _loadOnlineOpponent 失败:', e);
    }
  }

  // 启动对战匹配弹窗流程（匹配中 → 匹配成功 → 倒计时 → 进入对局）
  // 用于从主页进入对战、以及结算弹窗"重新挑战"，等同于重新进入对战页
  startMatchAnim() {
    const g = this.game;
    g._battleMatchAnim = {
      phase: 'matching',
      startTime: Date.now(),
      matchDuration: 3000 + Math.floor(Math.random() * 3000),
      matchedTime: null,
      opponent: null
    };
    if (g.audioManager) g.audioManager.play('cloth_flap');

    // 匹配中阶段按需下载 rank_avatar 云图集（不阻塞匹配动画）
    if (g.cloudStorage && !g._rankAvatarPreloaded) {
      g._rankAvatarPreloaded = true;
      g.cloudStorage.preloadRankAvatarImages().then(() => {
        if (g.cloudStorage) g.cloudStorage.injectRankAvatarToRenderer(g.renderer);
      });
    }
  }

  // 匹配弹窗结束后清理状态，玩家可立即开始操作
  finishMatchSetup() {
    const g = this.game;
    if (g._battleMatchFinished) return;
    g._battleMatchFinished = true;
    // 匹配弹窗结束后 bot 才真正开始思考，避免弹窗等待期间计入思考时间
    this._startBotTimer();
  }

  // 荣誉杯：对战胜利一场 +1。本地累加存储，并上传云端数据库
  // （云端取 max 合并，重试 / 重复调用不会重复计数或回退）
  awardHonorTrophy() {
    const g = this.game;
    if (!g.storageManager) return;
    const total = g.storageManager.addHonorTrophy();
    g.honorTrophies = total;
    try {
      if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) {
        wx.cloud.callFunction({
          name: 'updateHonorTrophy',
          data: { count: total }
        }).then(res => {
          console.log('[HonorTrophy] 云函数返回:', res.result);
        }).catch(err => {
          console.error('[HonorTrophy] 云函数调用失败:', err);
        });
      }
    } catch (e) {
      console.error('[HonorTrophy] 上报异常:', e);
    }
  }

  // 每回合随机选择 Bot 出牌策略
  _initBotStrategy() {
    const g = this.game;
    if (Math.random() < BOT_FAST_PROBABILITY) {
      // 70%：Bot 在 4~8 秒内自行出牌
      g._battleBotStrategy = 'fast';
      g._battleBotThinkDuration = BOT_FAST_MIN_MS + Math.floor(Math.random() * (BOT_FAST_MAX_MS - BOT_FAST_MIN_MS));
    } else {
      // 30%：最多等玩家 30 秒；玩家出牌后再等 2~4 秒出牌
      g._battleBotStrategy = 'wait_player';
      g._battleBotThinkDuration = BOT_WAIT_PLAYER_MIN_MS + Math.floor(Math.random() * (BOT_WAIT_PLAYER_MAX_MS - BOT_WAIT_PLAYER_MIN_MS));
    }
  }

  // 根据当前策略启动 Bot 思考计时器
  _startBotTimer() {
    const g = this.game;
    // 统一从回合开始计时；wait_player 会在 30 秒上限或玩家出牌后处理
    g.battleBotThinkingStartTime = Date.now();
    g.battleBotThinking = true;
    g.battleBotReady = false;
  }

  _startRound(roundData) {
    const g = this.game;

    let seedWords;
    let hand;
    let botSeed;
    let botSeedIndex;

    if (g._battleOnline && roundData) {
      // 联网对战：使用云端统一生成的种子词和手牌，确保双方一致
      seedWords = roundData.seedWords || generateBattleSeedWords();
      hand = (roundData.hand || []).map(c => createBattleCard(c.letter));
      // 补齐 12 张（云端应已保证，但做防御性兜底）
      if (hand.length < HAND_SIZE) {
        const deck = createBattleDeck();
        while (hand.length < HAND_SIZE && deck.length > 0) {
          hand.push(deck.shift());
        }
        hand = shuffle(hand);
      }
      // 云端已对手牌洗过牌，客户端不再重洗，避免双方显示顺序不一致
      botSeedIndex = Math.floor(Math.random() * seedWords.length);
      botSeed = seedWords[botSeedIndex];
    } else {
      // 本地人机/随机匹配：本地生成
      seedWords = generateBattleSeedWords();
      g._battleSeedWords = seedWords;
      botSeedIndex = Math.floor(Math.random() * seedWords.length);
      botSeed = seedWords[botSeedIndex];
      const requiredLetters = getRequiredLetters(seedWords.map(s => s.word));
      hand = requiredLetters.map(letter => createBattleCard(letter));
      const deckCopy = [...g._battleDeck];
      while (hand.length < HAND_SIZE && deckCopy.length > 0) {
        hand.push(deckCopy.shift());
      }
      hand = shuffle(hand);
      g._battleDeck = deckCopy;
    }

    g._battleSeedWords = seedWords;
    g._battleBotSeedIndex = botSeedIndex;
    g.battleHand = hand;
    g.battleBotHand = [...hand];

    if (g.battleRound > 1 && g.audioManager) g.audioManager.play('card_shuffle');
    g.battleSelected = [];
    g.battlePlayerWord = null;
    g.battlePlayerCards = null;
    g.battleBotWord = null;
    g.battleBotCards = null;
    g.battlePlayerWordMeaning = '';
    g.battleBotWordMeaning = '';
    g.battlePhase = 'selecting';
    this._initBotStrategy();
    this._startBotTimer();
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
    g._battleOnlinePlayerPlayed = false;
    g._battleOnlineOpponentPlayed = false;

    // 出牌倒计时：一方出牌后给另一方 15 秒
    g._battleTurnDeadline = null;
    g._battleTurnCountdownSide = null;
    g._battlePlayerTimedOut = false;
    g._battleBotTimedOut = false;
    g._battleRoundStartTime = Date.now();

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

    // 联网对战：把出牌同步到云端；本地已出牌，停止自己的倒计时
    if (g._battleOnline) {
      g._battleTurnDeadline = null;
      g._battleTurnCountdownSide = null;
      g._battlePlayerTimedOut = false;
      cloudLog(g, '[Battle] playHand 准备同步到云端 roomId=' + (g._battleRoomId || 'null') + ' word=' + word + ' score=' + score);
      this._syncPlayToServer(word, selected, score);
    }

    // 如果对方已经就绪，直接进入揭晓阶段
    if (g.battleBotReady) {
      // 超时方先展示 +0；否则保持玩家先 Bot 后
      const firstSide = g._battleBotTimedOut ? 'bot' : (g._battlePlayerTimedOut ? 'player' : 'player');
      this.startReveal(firstSide);
    } else if (!g._battleOnline) {
      // 玩家先出牌，给 Bot 启动 15 秒倒计时（本地人机）
      g._battleTurnDeadline = Date.now() + TURN_TIMEOUT_MS;
      g._battleTurnCountdownSide = 'bot';
      if (g._battleBotStrategy === 'wait_player') {
        // 玩家已出，Bot 开始 2~4 秒 post-wait 计时
        g.battleBotThinkingStartTime = Date.now();
      }
    }

    return { valid: true, score };
  }

  // 联网对战：同步出牌到服务器（isTimeout 为 true 表示本地倒计时超时，提交 0 分空牌）
  _syncPlayToServer(word, cards, score, retryCount = 1, isTimeout = false) {
    const g = this.game;
    if (!g._battleRoomId) {
      cloudLog(g, '[Battle] _syncPlayToServer 跳过，无 roomId');
      return;
    }
    cloudLog(g, '[Battle] _syncPlayToServer 调用 roomId=' + g._battleRoomId + ' word=' + word + ' score=' + score + ' cardsCount=' + (cards ? cards.length : 0) + ' retry=' + retryCount + ' isTimeout=' + isTimeout);
    wx.cloud.callFunction({
      name: 'battlePlay',
      data: {
        roomId: g._battleRoomId,
        word,
        cards: (cards || []).map(c => ({ id: c.id, letter: c.letter, score: c.score })),
        score,
        isTimeout
      },
      success: (res) => {
        cloudLog(g, '[Battle] _syncPlayToServer success res=' + JSON.stringify({
          code: res.result && res.result.code,
          roomStatus: res.result && res.result.room && res.result.room.status,
          roomCurrentRound: res.result && res.result.room && res.result.room.currentRound,
          hasHostPlay: !!(res.result && res.result.room && res.result.room.hostPlay),
          hasGuestPlay: !!(res.result && res.result.room && res.result.room.guestPlay)
        }));
        if (res.result && res.result.code === 0) {
          // 同步成功后，标记自己已在线同步
          if (res.result.room) {
            const room = res.result.room;
            const myOpenId = g._battleIsHost ? room.host : room.guest;
            const myPlay = g._battleIsHost
              ? (room.hostPlay && room.hostPlay.openid === myOpenId ? room.hostPlay : null)
              : (room.guestPlay && room.guestPlay.openid === myOpenId ? room.guestPlay : null);
            if (myPlay) {
              g._battleOnlinePlayerPlayed = true;
            }
            // battlePlay 返回的 room 可能已包含对手出牌（尤其后出牌一方），立即应用
            // 避免等下一轮 1.5s 轮询，减少“对方选择中”滞留
            this._applyRoomState(room);
          }
        } else {
          // 业务失败也尝试重试，过滤掉明确的参数错误
          const msg = res.result && res.result.message ? res.result.message : '';
          if (retryCount > 0 && !msg.includes('参数错误') && !msg.includes('房间不存在') && !msg.includes('你不是房间玩家')) {
            cloudLog(g, '[Battle] _syncPlayToServer 业务失败，准备重试: ' + msg);
            setTimeout(() => this._syncPlayToServer(word, cards, score, retryCount - 1, isTimeout), 800);
          } else {
            cloudLog(g, '[Battle] _syncPlayToServer 业务失败不重试: ' + msg);
            if (isTimeout) {
              // 超时同步最终失败：无法重新出牌，只能记录日志，由轮询或对手超时推进
              cloudLog(g, '[Battle] 超时同步最终失败，等待轮询恢复');
            }
          }
        }
      },
      fail: (err) => {
        cloudLog(g, '[Battle] _syncPlayToServer fail err=' + (err && err.message ? err.message : String(err)) + ' retry=' + retryCount);
        if (retryCount > 0) {
          setTimeout(() => this._syncPlayToServer(word, cards, score, retryCount - 1, isTimeout), 800);
        } else {
          if (isTimeout) {
            // 超时同步最终失败：无法重新出牌
            cloudLog(g, '[Battle] 超时同步最终失败，等待轮询恢复');
          } else {
            // 最终失败：提示玩家并允许重新出牌
            g.hintToast = { text: '出牌同步失败，请重新出牌', expireAt: Date.now() + 2000 };
            g.battlePhase = 'selecting';
            g._battlePlayerPlayed = false;
            g.battlePlayerWord = null;
            g.battlePlayerCards = null;
            g.battlePlayerRoundScore = 0;
            // 从本局已出牌集合中移除，避免重新出同一个词时被误判为重复
            if (g._battlePlayedWords && word) {
              g._battlePlayedWords.delete(word.toLowerCase());
            }
            cloudLog(g, '[Battle] _syncPlayToServer 最终失败，允许重新出牌');
          }
        }
      }
    });
  }

  // 联网对战：轮询房间状态
  startRoomPolling() {
    const g = this.game;
    if (!g._battleOnline || !g._battleRoomId) return;
    if (g._battleRoomPollTimer) {
      clearTimeout(g._battleRoomPollTimer);
    }
    const poll = () => {
      if (!g._battleOnline || !g._battleRoomId) {
        g._battleRoomPollTimer = null;
        return;
      }
      wx.cloud.callFunction({
        name: 'battleGet',
        data: { roomId: g._battleRoomId },
        success: (res) => {
          if (res.result && res.result.code === 0) {
            this._applyRoomState(res.result.room);
          }
        },
        fail: (err) => {
          console.error('[battleGet] 轮询失败:', err);
        },
        complete: () => {
          if (g._battleOnline && g._battleRoomId) {
            g._battleRoomPollTimer = setTimeout(poll, ROOM_POLL_INTERVAL_MS);
          } else {
            g._battleRoomPollTimer = null;
          }
        }
      });
    };
    g._battleRoomPollTimer = setTimeout(poll, ROOM_POLL_INTERVAL_MS);
  }

  // 联网对战：应用房间状态
  _applyRoomState(room) {
    const g = this.game;
    try {
      if (!room || !g._battleOnline) return;

      cloudLog(g, '[Battle] _applyRoomState fullRoom=' + JSON.stringify({
        _id: room._id,
        status: room.status,
        currentRound: room.currentRound,
        host: (room.host || '').slice(-6),
        guest: (room.guest || '').slice(-6),
        hasHostPlay: !!room.hostPlay,
        hasGuestPlay: !!room.guestPlay
      }));

      const currentRound = g.battleRound || 1;
      const cloudRound = room.currentRound || 1;

      // 防御性过滤：云端轮次比本地还旧，说明是乱序到达的过期响应，直接丢弃
      if (cloudRound < currentRound) {
        cloudLog(g, '[Battle] 房间响应过期，丢弃: cloudRound=' + cloudRound + ' < localRound=' + currentRound);
        return;
      }

      // 房间被对方关闭，弹出“房间已结束”提示
      if (room.status === 'closed') {
        cloudLog(g, '[Battle] 房间已关闭，触发对战结束弹窗');
        this._showRoomClosedPopup();
        return;
      }

      // 检测到重开邀请：对战结束后统一交给 game.js 的好友房轮询处理弹窗/倒计时/开局
      if (room.restartRequest && g.battlePhase === 'battle_end') {
        cloudLog(g, '[Battle] 检测到重开邀请，切到好友房轮询: accepted=' + room.restartRequest.accepted);
        if (g.applyFriendRoomState) {
          g.applyFriendRoomState(room);
        }
        if (g.startFriendRoomPolling) {
          g.startFriendRoomPolling(g._battleRoomId);
        }
        return;
      }

      // 正确计算我的 openid：直接用 _battleIsHost 判断
      const myOpenId = g._battleIsHost ? room.host : room.guest;
      // 对方的 openid 实时计算，不依赖可能出错的缓存
      const opponentOpenId = g._battleIsHost ? room.guest : room.host;

      // 只有拿到有效对手 openid 时才缓存，避免被 undefined 污染后反复加载
      if (!g._battleOpponentOpenId && opponentOpenId) {
        g._battleOpponentOpenId = opponentOpenId;
        this._loadOnlineOpponent(opponentOpenId);
      }

      const hostPlay = room.hostPlay;
      const guestPlay = room.guestPlay;

      const effectiveRound = currentRound;
      cloudLog(g, '[Battle] _applyRoomState effectiveRound=' + effectiveRound + ' host=' + (hostPlay ? 'yes' : 'no') + ' guest=' + (guestPlay ? 'yes' : 'no') + ' isHost=' + g._battleIsHost + ' myOpenId=' + (myOpenId || '').slice(-6) + ' oppOpenId=' + (opponentOpenId || '').slice(-6));
      if (hostPlay) cloudLog(g, '[Battle] hostPlay raw=' + JSON.stringify({ word: hostPlay.word, round: hostPlay.round, openid: (hostPlay.openid || '').slice(-6) }));
      if (guestPlay) cloudLog(g, '[Battle] guestPlay raw=' + JSON.stringify({ word: guestPlay.word, round: guestPlay.round, openid: (guestPlay.openid || '').slice(-6) }));

      // 我的出牌：openId 必须匹配自己
      const myPlay = g._battleIsHost
        ? (hostPlay && hostPlay.openid === myOpenId ? hostPlay : null)
        : (guestPlay && guestPlay.openid === myOpenId ? guestPlay : null);

      // 对方的出牌：openId 必须匹配对方，且绝对不能是我自己
      let opponentPlay = g._battleIsHost
        ? (guestPlay && guestPlay.openid && guestPlay.openid === opponentOpenId && guestPlay.openid !== myOpenId ? guestPlay : null)
        : (hostPlay && hostPlay.openid && hostPlay.openid === opponentOpenId && hostPlay.openid !== myOpenId ? hostPlay : null);

      // 兜底：如果严格 openid 匹配没命中，但对手槽位有出牌且不是我方 openid，也视为对手出牌
      if (!opponentPlay) {
        if (g._battleIsHost && guestPlay && guestPlay.openid && guestPlay.openid !== myOpenId) {
          opponentPlay = guestPlay;
          cloudLog(g, '[Battle] 使用兜底对手出牌 guestPlay=' + (guestPlay ? guestPlay.word : 'null'));
        } else if (!g._battleIsHost && hostPlay && hostPlay.openid && hostPlay.openid !== myOpenId) {
          opponentPlay = hostPlay;
          cloudLog(g, '[Battle] 使用兜底对手出牌 hostPlay=' + (hostPlay ? hostPlay.word : 'null'));
        }
      }

      // 回合推进检测：云端 currentRound 大于本地，说明房主已经推进到下一回合
      if (g._battleOnline && cloudRound > currentRound) {
        // 如果本机还在揭晓动画中，先缓存房间状态，等 reveal 完成后再同步。
        // 否则房主已经推进到下一回合时，本机直接 reset 到 selecting 会中断 reveal，
        // 导致本轮总分未累加、对手出牌也看不到（好友对战第 x 回合偶现问题）。
        if (g.battlePhase === 'revealing') {
          g._battlePendingRoom = room;
          cloudLog(g, '[Battle] 云端已进入第' + cloudRound + '回合，本地仍在揭晓动画，延迟同步');
          return;
        }
        cloudLog(g, '[Battle] 检测到云端进入第' + cloudRound + '回合，本地同步');
        console.log('[Battle] 检测到云端进入第' + cloudRound + '回合，本地同步');
        g._battlePendingRoom = null;
        g.battleRound = cloudRound;
        this._startRound({
          seedWords: room.seedWords,
          hand: room.hand
        });
        // 同步新回合后，继续处理当前 room 中可能已有的出牌数据（如好友已在新回合出牌）
        // 而不是 return 等下一次轮询，减少"看不到对手出牌"的概率
      }

      // 重新计算 isMyPlayCurrent / isOpponentPlayCurrent（如果回合推进过，使用新轮次）
      const newEffectiveRound = g.battleRound || 1;
      const isMyPlayCurrent2 = myPlay && (myPlay.round === undefined || myPlay.round === newEffectiveRound || myPlay.round === cloudRound);
      const isOpponentPlayCurrent2 = opponentPlay && (
        opponentPlay.round === undefined ||
        opponentPlay.round === newEffectiveRound ||
        opponentPlay.round === cloudRound ||
        opponentPlay.round > newEffectiveRound
      );
      if (opponentPlay && !isOpponentPlayCurrent2) {
        cloudLog(g, '[Battle] 对手出牌被过滤: oppRound=' + opponentPlay.round + ' localRound=' + newEffectiveRound + ' cloudRound=' + cloudRound);
      }

      cloudLog(g, '[Battle] _applyRoomState myPlay=' + (myPlay ? myPlay.word : 'null') + ' opponentPlay=' + (opponentPlay ? opponentPlay.word : 'null') + ' hostOpenid=' + (hostPlay ? (hostPlay.openid || '').slice(-6) : 'null') + ' guestOpenid=' + (guestPlay ? (guestPlay.openid || '').slice(-6) : 'null'));

      // 如果本地还没标记自己出牌，但服务端已有，则同步回来（极少情况）
      if (!g._battleOnlinePlayerPlayed && myPlay && isMyPlayCurrent2) {
        g._battleOnlinePlayerPlayed = true;
      }

      // 对方已出牌（含超时出牌）
      if (!g._battleOnlineOpponentPlayed && opponentPlay && isOpponentPlayCurrent2) {
        g._battleOnlineOpponentPlayed = true;
        g.battleBotReady = true;
        g._battleBotReadyAnimStart = Date.now();
        g.battleBotWord = opponentPlay.word || '';
        g.battleBotCards = (opponentPlay.cards || []).map(c => createBattleCard(c.letter));
        g.battleBotRoundScore = opponentPlay.score || 0;
        g._battleBotTimedOut = !!opponentPlay.isTimeout;
        g.battleBotWordLength = opponentPlay.isTimeout ? 0 : (opponentPlay.word ? opponentPlay.word.length : 0);
        g.battleBotWordMeaning = opponentPlay.isTimeout ? '' : getBattleWordMeaning(opponentPlay.word, g._battleSeedWords);
        cloudLog(g, '[Battle] 同步到对手出牌 word=' + opponentPlay.word + ' score=' + opponentPlay.score + ' isTimeout=' + opponentPlay.isTimeout + ' phase=' + g.battlePhase);
        if (g.audioManager) g.audioManager.play('battle_play_card');

        if (g.battlePhase === 'player_played' || g._battlePlayerPlayed) {
          // 自己已经出过，直接揭晓；超时方先展示 +0
          const firstSide = g._battleBotTimedOut ? 'bot' : (g._battlePlayerTimedOut ? 'player' : 'player');
          this.startReveal(firstSide);
        } else if (opponentPlay.isTimeout) {
          // 对手已超时，自己还没出：给自己 15 秒倒计时继续出牌
          g._battleTurnDeadline = Date.now() + TURN_TIMEOUT_MS;
          g._battleTurnCountdownSide = 'player';
          cloudLog(g, '[Battle] 对手已超时，本地玩家获得 15 秒倒计时');
        } else {
          // 对手已正常出牌，自己还没出：启动 15 秒倒计时
          g._battleTurnDeadline = Date.now() + TURN_TIMEOUT_MS;
          g._battleTurnCountdownSide = 'player';
        }
      }
    } catch (e) {
      cloudLog(g, '[Battle] _applyRoomState 异常: ' + (e && e.message ? e.message : String(e)) + ' stack=' + (e && e.stack ? e.stack : 'null'));
      console.error('[Battle] _applyRoomState 异常:', e);
    }
  }

  // 双方都已出牌，进入揭晓动画
  startReveal(firstSide = 'player') {
    const g = this.game;
    if (g.battlePhase !== 'player_played' && g.battlePhase !== 'selecting') return;
    g.battlePhase = 'revealing';

    // 揭晓阶段不再倒计时
    g._battleTurnDeadline = null;
    g._battleTurnCountdownSide = null;

    // 联网对战：直接使用双方已同步的出牌
    if (g._battleOnline) {
      // 本地玩家数据已经设置好；对手数据在轮询里已设置
      if (g.battleBotWord === undefined || g.battleBotWord === null) {
        g.battleBotWord = '';
        g.battleBotCards = [];
        g.battleBotRoundScore = 0;
        g.battleBotWordMeaning = '';
      }
    } else {
      // Bot 未超时时，使用预计算的 Bot 出牌；超时时已置为 0 分，不再覆盖
      if (!g._battleBotTimedOut) {
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
      }
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
    // firstSide 为超时方时先展示 +0，未超时方后正常展示；正常情况保持玩家先 Bot 后
    const now = Date.now();
    g._battleRevealStartTime = now;
    g._battleAnimTimeline = {
      step: 'placeholders',
      stepStartTime: now,
      fromRatio,
      toRatio,
      firstScoreTriggered: false,
      secondScoreTriggered: false,
      firstSide,
      secondSide: firstSide === 'player' ? 'bot' : 'player'
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

  nextRound(retryCount = 1) {
    const g = this.game;
    try {
      if (g.battlePhase !== 'round_end') return;
      if (g.battleRound >= g.battleTotalRounds) {
        g.battlePhase = 'battle_end';
        return;
      }

      if (g._battleOnline) {
        // 联网对战：只有房主可以推进下一回合，避免双方并发生成不同手牌
        if (!g._battleIsHost) {
          // 好友点击下一回合：只标记状态，等待房主推进后通过轮询同步
          g._battleNextRoundPressed = true;
          return;
        }
        // 防止房主并发多次调用 battleNextRound；若上一次调用长时间未返回（iOS 偶现回调丢失），强制重置锁
        if (g._battleNextRoundCalling) {
          const callingMs = Date.now() - (g._battleNextRoundCallingStartTime || 0);
          if (callingMs < 5000) {
            cloudLog(g, '[Battle] nextRound 已在调用中，跳过重复请求');
            return;
          }
          cloudLog(g, '[Battle] nextRound 调用锁超时 ' + callingMs + 'ms，强制重置');
          g._battleNextRoundCalling = false;
        }
        g._battleNextRoundCalling = true;
        g._battleNextRoundCallingStartTime = Date.now();
        // 客户端兜底：iOS 上偶现云函数回调完全丢失（success/fail 都不触发），
        // 设置 6 秒超时，到期未收到回调则按失败重试
        let callbackFired = false;
        const callTimeoutId = setTimeout(() => {
          if (callbackFired) return;
          callbackFired = true;
          g._battleNextRoundCalling = false;
          g._battleNextRoundCallingStartTime = null;
          cloudLog(g, '[Battle] battleNextRound 客户端 6 秒超时，按失败重试 retry=' + retryCount);
          console.log('[Battle] battleNextRound 客户端 6 秒超时，按失败重试 retry=' + retryCount);
          if (retryCount > 0) {
            setTimeout(() => this.nextRound(retryCount - 1), 800);
          } else {
            g.hintToast = { text: '推进回合超时，请重试', expireAt: Date.now() + 2000 };
          }
        }, 6000);
        wx.cloud.callFunction({
          name: 'battleNextRound',
          data: { roomId: g._battleRoomId, currentRound: g.battleRound },
          success: (res) => {
            if (callbackFired) {
              cloudLog(g, '[Battle] battleNextRound 超时后收到 success，忽略');
              return;
            }
            callbackFired = true;
            clearTimeout(callTimeoutId);
            g._battleNextRoundCalling = false;
            g._battleNextRoundCallingStartTime = null;
            if (res.result && res.result.code === 0 && res.result.room) {
              const room = res.result.room;
              const cloudRound = room.currentRound || (g.battleRound + 1);
              cloudLog(g, '[Battle] battleNextRound 成功, cloudRound=' + cloudRound + ' localRound=' + g.battleRound);
              console.log('[Battle] battleNextRound 成功, cloudRound=' + cloudRound + ' localRound=' + g.battleRound);
              // 仅当云端轮次确实领先本地时才 _startRound，避免轮询已同步到新回合后又被 reset
              if (cloudRound > g.battleRound) {
                g.battleRound = cloudRound;
                this._startRound({
                  seedWords: room.seedWords,
                  hand: room.hand
                });
              } else {
                cloudLog(g, '[Battle] 本地轮次已 >= 云端轮次，跳过 _startRound');
              }
              // battleNextRound 返回的 room 可能已包含对手出牌（尤其好友出牌很快时），
              // 立即应用一次，避免等下一次轮询
              if (room.hostPlay || room.guestPlay) {
                this._applyRoomState(room);
              }
            } else {
              const msg = res.result && res.result.message ? res.result.message : '';
              cloudLog(g, '[Battle] battleNextRound 失败: ' + msg + ' retry=' + retryCount);
              console.log('[Battle] battleNextRound 失败: ' + msg + ' retry=' + retryCount);
              if (msg.includes('对局已结束')) {
                cloudLog(g, '[Battle] 服务端提示对局已结束，本地进入 battle_end');
                g.battlePhase = 'battle_end';
                return;
              }
              if (retryCount > 0 && !msg.includes('房间不存在') && !msg.includes('你不是房间玩家') && !msg.includes('房间轮次落后')) {
                setTimeout(() => this.nextRound(retryCount - 1), 800);
              }
            }
          },
          fail: (err) => {
            if (callbackFired) {
              cloudLog(g, '[Battle] battleNextRound 超时后收到 fail，忽略');
              return;
            }
            callbackFired = true;
            clearTimeout(callTimeoutId);
            g._battleNextRoundCalling = false;
            g._battleNextRoundCallingStartTime = null;
            cloudLog(g, '[Battle] battleNextRound 调用失败: ' + (err && err.message ? err.message : String(err)) + ' retry=' + retryCount);
            console.log('[Battle] battleNextRound 调用失败: ' + (err && err.message ? err.message : String(err)) + ' retry=' + retryCount);
            if (retryCount > 0) {
              setTimeout(() => this.nextRound(retryCount - 1), 800);
            } else {
              g.hintToast = { text: '推进回合失败，请重试', expireAt: Date.now() + 2000 };
            }
          }
        });
        return;
      }

      g.battleRound++;
      this._startRound();
    } catch (e) {
      g._battleNextRoundCalling = false;
      g._battleNextRoundCallingStartTime = null;
      cloudLog(g, '[Battle] nextRound 异常: ' + (e && e.message ? e.message : String(e)) + ' stack=' + (e && e.stack ? e.stack : 'null'));
      console.error('[Battle] nextRound 异常:', e);
    }
  }

  updateBotThinking() {
    const g = this.game;
    // 联网对战不走本地 Bot 思考逻辑，完全由云端轮询决定对方是否出牌
    if (g._battleOnline) return;
    if (!g.battleBotThinking || g.battleBotReady) return;
    if (!g.battleBotThinkingStartTime) return;

    const elapsed = Date.now() - g.battleBotThinkingStartTime;
    let shouldPlay = false;

    if (g._battleBotStrategy === 'wait_player') {
      if (g.battlePhase === 'player_played') {
        // 玩家已出，按 2~4 秒 post-wait 计时
        if (elapsed >= g._battleBotThinkDuration) shouldPlay = true;
      } else {
        // 玩家未出，最多等 30 秒；超过立即出牌
        if (elapsed >= BOT_WAIT_PLAYER_MAX_WAIT_MS) shouldPlay = true;
      }
    } else {
      // fast 策略：4~8 秒
      if (elapsed >= g._battleBotThinkDuration) shouldPlay = true;
    }

    if (!shouldPlay) return;

    g.battleBotThinking = false;
    g.battleBotReady = true;
    g._battleBotReadyAnimStart = Date.now();
    // 对方从“选择中”变为“已选择”时播放出牌音效
    if (g.audioManager) g.audioManager.play('battle_play_card');
    // 如果玩家已经出牌，双方就绪，进入揭晓
    if (g.battlePhase === 'player_played') {
      this.startReveal();
    } else if (!g._battleOnline) {
      // Bot 先出牌，给玩家启动 15 秒倒计时（仅本地人机）
      g._battleTurnDeadline = Date.now() + TURN_TIMEOUT_MS;
      g._battleTurnCountdownSide = 'player';
    }
  }

  // 检查出牌倒计时：一方出牌后另一方必须在 15 秒内出牌，否则超时判 0 分
  updateTurnTimer() {
    const g = this.game;
    if (g._battleOnline) {
      // 联网对战：对手已出牌/超时且自己尚未出牌时，维持 15 秒倒计时
      if (g.battlePhase === 'selecting' && g._battleOnlineOpponentPlayed && !g._battlePlayerPlayed && !g._battlePlayerTimedOut) {
        if (!g._battleTurnDeadline) {
          g._battleTurnDeadline = Date.now() + TURN_TIMEOUT_MS;
          g._battleTurnCountdownSide = 'player';
        }
      } else if (g.battlePhase !== 'selecting' && g.battlePhase !== 'player_played') {
        g._battleTurnDeadline = null;
        g._battleTurnCountdownSide = null;
      }
      if (g._battleTurnDeadline) {
        if (Date.now() >= g._battleTurnDeadline) {
          // 本地玩家超时
          const side = g._battleTurnCountdownSide;
          g._battleTurnDeadline = null;
          g._battleTurnCountdownSide = null;
          if (side === 'player') {
            this.forceTimeout('player');
          }
        }
        return;
      }

      // 双方一直未出牌兜底：回合开始 30 秒后强制本地玩家超时，避免双人同时挂机导致对局卡住
      const roundElapsed = Date.now() - (g._battleRoundStartTime || Date.now());
      if (g.battlePhase === 'selecting' && !g._battlePlayerPlayed && !g._battlePlayerTimedOut && roundElapsed >= 30000) {
        cloudLog(g, '[Battle] 回合开始 30 秒双方仍未出牌，强制本地玩家超时');
        this.forceTimeout('player');
      }
      return;
    }

    if (!g._battleTurnDeadline) return;
    if (g.battlePhase !== 'selecting' && g.battlePhase !== 'player_played') return;
    if (Date.now() < g._battleTurnDeadline) return;

    const side = g._battleTurnCountdownSide;
    g._battleTurnDeadline = null;
    g._battleTurnCountdownSide = null;
    this.forceTimeout(side);
  }

  forceTimeout(side) {
    const g = this.game;
    // 超时后先清理倒计时，避免同一帧重复触发
    g._battleTurnDeadline = null;
    g._battleTurnCountdownSide = null;

    if (side === 'player') {
      g._battlePlayerTimedOut = true;
      g.battlePlayerWord = '';
      g.battlePlayerCards = [];
      g.battleSelected = [];
      if (g.battleHand) g.battleHand.forEach(c => { if (c) c.selected = false; });
      g.battlePlayerRoundScore = 0;
      g.battlePlayerWordMeaning = '';
      g.battlePendingCheck = null;
      g._battleCheckingWord = false;
      if (g._battlePendingCheckTimer) {
        clearTimeout(g._battlePendingCheckTimer);
        g._battlePendingCheckTimer = null;
      }
      g._battlePlayerReadyAnimStart = Date.now();

      if (g._battleOnline) {
        // 联网对战：把超时 0 分同步到云端，并标记自己已出牌
        g._battlePlayerPlayed = true;
        g.battlePhase = 'player_played';
        this._syncPlayToServer('', [], 0, 1, true);
        // 若对手也已出牌/超时，则直接揭晓；否则等待对手出牌或超时
        if (g._battleOnlineOpponentPlayed) {
          this.startReveal('player');
        }
      } else {
        // 本地人机：玩家超时后直接揭晓，超时方（玩家）先展示 +0
        this.startReveal('player');
      }
    } else if (side === 'bot') {
      g._battleBotTimedOut = true;
      g.battleBotWord = '';
      g.battleBotCards = [];
      g.battleBotRoundScore = 0;
      g.battleBotWordMeaning = '';
      g.battleBotWordLength = 0;
      g.battleBotReady = true;
      g.battleBotThinking = false;
      g._battleBotReadyAnimStart = Date.now();
      // Bot 超时后直接揭晓，超时方（Bot）先展示 +0
      this.startReveal('bot');
    }
  }

  checkReveal() {
    const g = this.game;
    try {
      cloudLog(g, '[Battle] checkReveal phase=' + g.battlePhase + ' timeline=' + (g._battleAnimTimeline ? g._battleAnimTimeline.step : 'null') + ' isHost=' + g._battleIsHost + ' round=' + g.battleRound);
      console.log('[Battle] checkReveal phase=' + g.battlePhase + ' timeline=' + (g._battleAnimTimeline ? g._battleAnimTimeline.step : 'null') + ' isHost=' + g._battleIsHost + ' round=' + g.battleRound);

      // 优先处理因本地仍在揭晓动画而延迟的云端回合推进
      if (g._battlePendingRoom && (g.battlePhase !== 'revealing' || (g._battleAnimTimeline && g._battleAnimTimeline.step === 'done'))) {
        const pendingRoom = g._battlePendingRoom;
        g._battlePendingRoom = null;
        cloudLog(g, '[Battle] 揭晓动画已结束，应用延迟的回合推进 currentRound=' + (pendingRoom.currentRound || 'null'));
        this._applyRoomState(pendingRoom);
        return;
      }
      if (g.battlePhase === 'revealing' && g._battleAnimTimeline && g._battleAnimTimeline.step === 'done') {
        const elapsedSinceDone = Date.now() - g._battleAnimTimeline.stepStartTime;
        cloudLog(g, '[Battle] reveal 已 done，等待 ' + elapsedSinceDone + 'ms 后进入下一状态');
        if (elapsedSinceDone >= 800) {
          if (g.battleRound >= g.battleTotalRounds) {
            cloudLog(g, '[Battle] 最后一回合结束，进入 battle_end');
            g.battlePhase = 'battle_end';
          } else {
            if (g._battleOnline) {
              // 联网对战：揭晓动画结束后进入 round_end，由房主调用 battleNextRound 生成统一手牌；
              // 好友等待轮询同步，避免本地 _startRound 生成不同手牌。
              cloudLog(g, '[Battle] 联网对战 reveal 结束，进入 round_end');
              g.battlePhase = 'round_end';
              g._battleRoundEndStartTime = Date.now();
              if (g._battleIsHost) {
                this.nextRound();
              }
            } else {
              g.battleRound++;
              this._startRound();
            }
          }
        }
      }

      // 防御性恢复：如果因为网络抖动/房主推进失败导致长时间卡在 round_end，主动补救
      if (g._battleOnline && g.battlePhase === 'round_end' && g._battleRoundEndStartTime) {
        const stuckMs = Date.now() - g._battleRoundEndStartTime;
        if (stuckMs >= 3000) {
          cloudLog(g, '[Battle] 检测到 round_end 卡住 ' + stuckMs + 'ms，主动恢复');
          console.log('[Battle] 检测到 round_end 卡住 ' + stuckMs + 'ms，主动恢复');
          // 房主/好友都先主动拉取一次最新房间状态；如果云端已推进则直接同步，避免不必要的 battleNextRound 重试
          wx.cloud.callFunction({
            name: 'battleGet',
            data: { roomId: g._battleRoomId },
            success: (res) => {
              if (res.result && res.result.code === 0) {
                const room = res.result.room;
                const cloudRound = room && room.currentRound ? room.currentRound : 0;
                cloudLog(g, '[Battle] round_end 卡住恢复拉取房间 cloudRound=' + cloudRound + ' localRound=' + g.battleRound);
                console.log('[Battle] round_end 卡住恢复拉取房间 cloudRound=' + cloudRound + ' localRound=' + g.battleRound);
                if (cloudRound > g.battleRound) {
                  // 云端已推进，直接同步
                  this._applyRoomState(room);
                } else if (g._battleIsHost) {
                  // 云端未推进且是房主：重置调用锁后重试推进
                  if (g._battleNextRoundCalling) {
                    cloudLog(g, '[Battle] 重置 _battleNextRoundCalling 后重试推进');
                    g._battleNextRoundCalling = false;
                  }
                  this.nextRound();
                }
              } else if (g._battleIsHost) {
                if (g._battleNextRoundCalling) g._battleNextRoundCalling = false;
                this.nextRound();
              }
            },
            fail: (err) => {
              console.error('[battleGet] 主动恢复拉取失败:', err);
              if (g._battleIsHost) {
                if (g._battleNextRoundCalling) g._battleNextRoundCalling = false;
                this.nextRound();
              }
            }
          });
          // 防止短时间内频繁触发，重置计时
          g._battleRoundEndStartTime = Date.now();
        }
      }

      // 防御性恢复：揭晓动画完成后长时间未离开 revealing，强制进入 round_end/battle_end
      if (g.battlePhase === 'revealing' && g._battleAnimTimeline && g._battleAnimTimeline.step === 'done' && g._battleRevealStartTime) {
        const doneMs = Date.now() - g._battleAnimTimeline.stepStartTime;
        if (doneMs >= 3000) {
          cloudLog(g, '[Battle] 检测到 reveal done 后 3 秒未离开 revealing，强制推进');
          console.log('[Battle] 检测到 reveal done 后 3 秒未离开 revealing，强制推进');
          if (g.battleRound >= g.battleTotalRounds) {
            g.battlePhase = 'battle_end';
          } else {
            g.battlePhase = 'round_end';
            g._battleRoundEndStartTime = Date.now();
            if (g._battleIsHost) {
              this.nextRound();
            }
          }
        }
      }

      // 防御性恢复：player_played 状态长时间未进入 revealing，主动拉取房间看看对手是否已出牌
      if (g._battleOnline && g.battlePhase === 'player_played' && g._battlePlayerReadyAnimStart) {
        const playedMs = Date.now() - g._battlePlayerReadyAnimStart;
        if (playedMs >= 10000) {
          cloudLog(g, '[Battle] 检测到 player_played 卡住 ' + playedMs + 'ms，主动拉取房间');
          console.log('[Battle] 检测到 player_played 卡住 ' + playedMs + 'ms，主动拉取房间');
          wx.cloud.callFunction({
            name: 'battleGet',
            data: { roomId: g._battleRoomId },
            success: (res) => {
              if (res.result && res.result.code === 0) {
                this._applyRoomState(res.result.room);
              }
            },
            fail: (err) => {
              console.error('[battleGet] player_played 恢复拉取失败:', err);
            }
          });
          // 重置计时，避免频繁拉取
          g._battlePlayerReadyAnimStart = Date.now();
        }
      }
    } catch (e) {
      cloudLog(g, '[Battle] checkReveal 异常: ' + (e && e.message ? e.message : String(e)) + ' stack=' + (e && e.stack ? e.stack : 'null'));
      console.error('[Battle] checkReveal 异常:', e);
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
    g._battleHomeConfirmPopup = false;
    g._battleHomeConfirmAnimStart = null;
    g._battleRoomClosedPopup = false;
    g._battleRoomClosedAnimStart = null;
    this._resetToSinglePlayer();
  }

  _showRoomClosedPopup() {
    const g = this.game;
    if (!g._battleOnline || g._battleRoomClosedPopup) return;
    // 停止轮询，避免弹窗弹出后继续请求
    if (g._battleRoomPollTimer) {
      clearInterval(g._battleRoomPollTimer);
      g._battleRoomPollTimer = null;
    }
    g._battleRoomClosedPopup = true;
    g._battleRoomClosedAnimStart = Date.now();
  }

  // 关闭房间并返回首页：当用户主动点击左上角退出对战时调用
  closeRoomAndReturnHomepage() {
    const g = this.game;
    const roomId = g._battleRoomId;
    if (!roomId) {
      if (g.returnToHomepage) g.returnToHomepage();
      return;
    }
    // 先调用云函数关闭房间
    wx.cloud.callFunction({
      name: 'battleClose',
      data: { roomId },
      success: (res) => {
        cloudLog(g, '[Battle] battleClose success: ' + JSON.stringify(res.result));
      },
      fail: (err) => {
        cloudLog(g, '[Battle] battleClose fail: ' + (err && err.message ? err.message : String(err)));
      },
      complete: () => {
        // 无论关闭是否成功，都清空本地对战状态并返回首页
        if (g.returnToHomepage) g.returnToHomepage();
      }
    });
  }

  closeRoomClosedPopupAndExit() {
    const g = this.game;
    g._battleRoomClosedPopup = false;
    g._battleRoomClosedAnimStart = null;
    if (g.returnToHomepage) {
      g.returnToHomepage();
    }
  }

  // 好友对战：发起重新开始邀请
  requestRestart() {
    const g = this.game;
    if (!g._battleOnline || !g._battleRoomId) return;
    cloudLog(g, '[Battle] requestRestart roomId=' + g._battleRoomId);
    wx.cloud.callFunction({
      name: 'battleRequestRestart',
      data: { roomId: g._battleRoomId },
      success: (res) => {
        cloudLog(g, '[Battle] requestRestart success: ' + JSON.stringify({ code: res.result && res.result.code }));
        if (res.result && res.result.code === 0) {
          // 本地立即显示"正在邀请"弹窗，并关闭对战结束弹窗
          g._battleModeSelectPopup = {
            mode: 'friend_restart_inviting',
            title: '重新挑战',
            roomId: g._battleRoomId,
            startTime: Date.now(),
            closing: false
          };
          g.battlePhase = 'selecting'; // 关闭 battle_end 结束弹窗
          if (g.renderer) g.renderer.lastBattlePhase = null;
          // 切到 game.js 的好友房轮询，由它统一处理对方接受后的倒计时与开局
          if (res.result && res.result.room && g.applyFriendRoomState) {
            g.applyFriendRoomState(res.result.room);
          }
          if (g.startFriendRoomPolling) {
            g.startFriendRoomPolling(g._battleRoomId);
          }
        } else {
          const msg = res.result && res.result.message ? res.result.message : '邀请失败，请重试';
          g.hintToast = { text: msg, expireAt: Date.now() + 2000 };
        }
      },
      fail: (err) => {
        cloudLog(g, '[Battle] requestRestart fail: ' + (err && err.message ? err.message : String(err)));
        g.hintToast = { text: '邀请失败，请重试', expireAt: Date.now() + 2000 };
      }
    });
  }

  // 好友对战：接受重新开始邀请
  acceptRestart() {
    const g = this.game;
    if (!g._battleOnline || !g._battleRoomId) return;
    cloudLog(g, '[Battle] acceptRestart roomId=' + g._battleRoomId);
    wx.cloud.callFunction({
      name: 'battleAcceptRestart',
      data: { roomId: g._battleRoomId },
      success: (res) => {
        cloudLog(g, '[Battle] acceptRestart success: ' + JSON.stringify({ code: res.result && res.result.code }));
        if (res.result && res.result.code === 0 && res.result.room) {
          // 交给 game.js 的好友房状态机处理倒计时与开局
          if (g.applyFriendRoomState) {
            g.applyFriendRoomState(res.result.room);
          }
          if (!g._battleRoomPollTimer && g.startFriendRoomPolling) {
            g.startFriendRoomPolling(g._battleRoomId);
          }
        } else {
          const msg = res.result && res.result.message ? res.result.message : '接受失败，请重试';
          g.hintToast = { text: msg, expireAt: Date.now() + 2000 };
          if (g._battleModeSelectPopup) {
            g._battleModeSelectPopup.startPressed = false;
          }
        }
      },
      fail: (err) => {
        cloudLog(g, '[Battle] acceptRestart fail: ' + (err && err.message ? err.message : String(err)));
        g.hintToast = { text: '接受失败，请重试', expireAt: Date.now() + 2000 };
        if (g._battleModeSelectPopup) {
          g._battleModeSelectPopup.startPressed = false;
        }
      }
    });
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
    if (g._battleRoomPollTimer) {
      clearInterval(g._battleRoomPollTimer);
      g._battleRoomPollTimer = null;
    }
    g._battleAnimTimeline = null;
    g._battleFlyingScores = [];
    g._battleAvatarGlowAnim = null;
    g._battlePlayerPlayed = false;
    g._battleBotStrategy = null;
    g._battleTurnDeadline = null;
    g._battleTurnCountdownSide = null;
    g._battlePlayerTimedOut = false;
    g._battleBotTimedOut = false;
    g._battleOnline = false;
    g._battleRoomId = null;
    g._battleIsHost = false;
    g._battleOpponentOpenId = null;
    g._battleHostPlay = null;
    g._battleGuestPlay = null;
    g._battleOnlinePlayerPlayed = false;
    g._battleOnlineOpponentPlayed = false;
    g._battlePendingRoom = null;
    g._battleRoundEndStartTime = null;
    g._battleRoundStartTime = null;
    g._battleNextRoundPressed = false;
    g._battleNextRoundCalling = false;
    g._battleNextRoundCallingStartTime = null;
    g._battleRoomClosedPopup = false;
    g._battleRoomClosedAnimStart = null;
    if (g.audioManager) g.audioManager.stopSound('battle_matching');
  }
}

module.exports = { BattleManager };
