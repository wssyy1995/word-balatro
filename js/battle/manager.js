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
    // 清除对战结束弹窗按钮锁，避免重开后按钮无响应
    g._battleShareBtnLocked = false;
    g._battleRestartBtnLocked = false;
    g._battleHomeBtnLocked = false;
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

    // 联网对战：把出牌同步到云端
    if (g._battleOnline) {
      cloudLog(g, '[Battle] playHand 准备同步到云端 roomId=' + (g._battleRoomId || 'null') + ' word=' + word + ' score=' + score);
      this._syncPlayToServer(word, selected, score);
    }

    // 如果对方已经就绪，直接进入揭晓阶段
    if (g.battleBotReady) {
      this.startReveal();
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

  // 联网对战：同步出牌到服务器
  _syncPlayToServer(word, cards, score) {
    const g = this.game;
    if (!g._battleRoomId) {
      cloudLog(g, '[Battle] _syncPlayToServer 跳过，无 roomId');
      return;
    }
    cloudLog(g, '[Battle] _syncPlayToServer 调用 roomId=' + g._battleRoomId + ' word=' + word + ' score=' + score + ' cardsCount=' + (cards ? cards.length : 0));
    wx.cloud.callFunction({
      name: 'battlePlay',
      data: {
        roomId: g._battleRoomId,
        word,
        cards: cards.map(c => ({ id: c.id, letter: c.letter, score: c.score })),
        score
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
        }
      },
      fail: (err) => {
        cloudLog(g, '[Battle] _syncPlayToServer fail err=' + (err && err.message ? err.message : String(err)));
        console.error('[battlePlay] 同步失败:', err);
      }
    });
  }

  // 联网对战：轮询房间状态
  startRoomPolling() {
    const g = this.game;
    if (!g._battleOnline || !g._battleRoomId) return;
    if (g._battleRoomPollTimer) {
      clearInterval(g._battleRoomPollTimer);
    }
    g._battleRoomPollTimer = setInterval(() => {
      if (!g._battleOnline || !g._battleRoomId) {
        clearInterval(g._battleRoomPollTimer);
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
        }
      });
    }, 1500);
  }

  // 联网对战：应用房间状态
  _applyRoomState(room) {
    const g = this.game;
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
    if (!g._battleOpponentOpenId) {
      g._battleOpponentOpenId = opponentOpenId;
      // 首次确定对手 openid 时，异步加载对手真实头像/昵称/荣誉杯
      this._loadOnlineOpponent(opponentOpenId);
    }

    const hostPlay = room.hostPlay;
    const guestPlay = room.guestPlay;

    cloudLog(g, '[Battle] _applyRoomState host=' + (hostPlay ? 'yes' : 'no') + ' guest=' + (guestPlay ? 'yes' : 'no') + ' isHost=' + g._battleIsHost + ' myOpenId=' + (myOpenId || '').slice(-6) + ' oppOpenId=' + (opponentOpenId || '').slice(-6));
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
      } else if (!g._battleIsHost && hostPlay && hostPlay.openid && hostPlay.openid !== myOpenId) {
        opponentPlay = hostPlay;
      }
    }

    cloudLog(g, '[Battle] _applyRoomState myPlay=' + (myPlay ? myPlay.word : 'null') + ' opponentPlay=' + (opponentPlay ? opponentPlay.word : 'null') + ' hostOpenid=' + (hostPlay ? (hostPlay.openid || '').slice(-6) : 'null') + ' guestOpenid=' + (guestPlay ? (guestPlay.openid || '').slice(-6) : 'null'));

    // 只同步当前回合的出牌，避免开局/跨回合时旧数据误判
    // 严格用本地 battleRound 作为当前回合；云端 currentRound 仅作参考
    const currentRound = g.battleRound || 1;
    const isMyPlayCurrent = myPlay && (myPlay.round === undefined || myPlay.round === currentRound);
    const isOpponentPlayCurrent = opponentPlay && (opponentPlay.round === undefined || opponentPlay.round === currentRound);

    // 回合推进检测：云端 currentRound 大于本地，说明房主已经推进到下一回合
    if (g._battleOnline && room.currentRound && room.currentRound > currentRound) {
      cloudLog(g, '[Battle] 检测到云端进入第' + room.currentRound + '回合，本地同步');
      g.battleRound = room.currentRound;
      this._startRound({
        seedWords: room.seedWords,
        hand: room.hand
      });
      return;
    }

    cloudLog(g, '[Battle] _applyRoomState currentRound=' + currentRound + ' myRound=' + (myPlay ? myPlay.round : 'null') + ' oppRound=' + (opponentPlay ? opponentPlay.round : 'null'));

    // 如果本地还没标记自己出牌，但服务端已有，则同步回来（极少情况）
    if (!g._battleOnlinePlayerPlayed && myPlay && isMyPlayCurrent) {
      g._battleOnlinePlayerPlayed = true;
    }

    // 对方已出牌
    if (!g._battleOnlineOpponentPlayed && opponentPlay && isOpponentPlayCurrent) {
      g._battleOnlineOpponentPlayed = true;
      g.battleBotReady = true;
      g._battleBotReadyAnimStart = Date.now();
      g.battleBotWord = opponentPlay.word;
      g.battleBotCards = (opponentPlay.cards || []).map(c => createBattleCard(c.letter));
      g.battleBotRoundScore = opponentPlay.score || 0;
      g.battleBotWordMeaning = getBattleWordMeaning(opponentPlay.word, g._battleSeedWords);
      if (g.audioManager) g.audioManager.play('battle_play_card');

      if (g.battlePhase === 'player_played' || g._battlePlayerPlayed) {
        this.startReveal();
      }
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

  nextRound() {
    const g = this.game;
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
      wx.cloud.callFunction({
        name: 'battleNextRound',
        data: { roomId: g._battleRoomId },
        success: (res) => {
          if (res.result && res.result.code === 0 && res.result.room) {
            g.battleRound++;
            this._startRound({
              seedWords: res.result.room.seedWords,
              hand: res.result.room.hand
            });
          } else {
            cloudLog(g, '[Battle] battleNextRound 失败: ' + JSON.stringify(res.result));
          }
        },
        fail: (err) => {
          cloudLog(g, '[Battle] battleNextRound 调用失败: ' + (err && err.message ? err.message : String(err)));
        }
      });
      return;
    }

    g.battleRound++;
    this._startRound();
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
    if (g._battleOnline) return; // 联网对战不本地计时
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
      // 玩家超时后直接揭晓，超时方（玩家）先展示 +0
      this.startReveal('player');
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
    if (g.battlePhase === 'revealing' && g._battleAnimTimeline && g._battleAnimTimeline.step === 'done') {
      if (Date.now() - g._battleAnimTimeline.stepStartTime >= 800) {
        if (g.battleRound >= g.battleTotalRounds) {
          g.battlePhase = 'battle_end';
        } else {
          if (g._battleOnline) {
            // 联网对战：揭晓动画结束后进入 round_end，由房主调用 battleNextRound 生成统一手牌；
            // 好友等待轮询同步，避免本地 _startRound 生成不同手牌。
            g.battlePhase = 'round_end';
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
    g._battleRoomClosedPopup = false;
    g._battleRoomClosedAnimStart = null;
    if (g.audioManager) g.audioManager.stopSound('battle_matching');
  }
}

module.exports = { BattleManager };
