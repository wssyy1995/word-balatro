/**
 * 云函数：battleRoom
 * 职责：创建好友对战房间
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 第一回合种子词/手牌生成（与 battleStart/battleNextRound 保持一致） =====
// 创建房间时就生成，让好友加入后即可预览到与房主一致的手牌，
// 不必等到 battleStart 才看到统一字母牌。
const LETTER_SCORE = {
  A:11, B:12, C:13, D:14, E:15, F:16, G:17, H:18, I:19,
  J:20, K:21, L:22, M:23, N:24, O:25, P:26, Q:27, R:28,
  S:29, T:30, U:31, V:32, W:33, X:34, Y:35, Z:36
};

const LETTER_DISTRIBUTION = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9,
  J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6,
  S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1
};

const SEED_WORDS_3 = [
  { word: 'cat', meaning: '猫' }, { word: 'dog', meaning: '狗' },
  { word: 'sun', meaning: '太阳' }, { word: 'hat', meaning: '帽子' },
  { word: 'pen', meaning: '笔' }, { word: 'cup', meaning: '杯子' },
  { word: 'bed', meaning: '床' }, { word: 'box', meaning: '盒子' },
  { word: 'egg', meaning: '鸡蛋' }, { word: 'ice', meaning: '冰' }
];
const SEED_WORDS_4 = [
  { word: 'book', meaning: '书' }, { word: 'look', meaning: '看' },
  { word: 'time', meaning: '时间' }, { word: 'fish', meaning: '鱼' },
  { word: 'moon', meaning: '月亮' }, { word: 'star', meaning: '星星' },
  { word: 'hand', meaning: '手' }, { word: 'rain', meaning: '雨' },
  { word: 'tree', meaning: '树' }, { word: 'bird', meaning: '鸟' },
  { word: 'cake', meaning: '蛋糕' }, { word: 'door', meaning: '门' },
  { word: 'fire', meaning: '火' }, { word: 'gold', meaning: '金子' },
  { word: 'king', meaning: '国王' }, { word: 'lamp', meaning: '灯' }
];

function createCard(letter) {
  return {
    letter,
    baseScore: LETTER_SCORE[letter] || 1,
    score: LETTER_SCORE[letter] || 1,
    isFace: letter === 'X' || letter === 'Y' || letter === 'Z',
    id: Math.random().toString(36).substr(2, 9),
    selected: false
  };
}

function createBattleDeck() {
  const cards = [];
  for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      cards.push(createCard(letter));
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

function generateSeedWords() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return [pick(SEED_WORDS_3), pick(SEED_WORDS_4), pick(SEED_WORDS_4)];
}

function generateRoundData() {
  const seedWords = generateSeedWords();
  const requiredLetters = getRequiredLetters(seedWords.map(s => s.word));
  let hand = requiredLetters.map(letter => createCard(letter));
  const deck = createBattleDeck();
  while (hand.length < 12 && deck.length > 0) {
    hand.push(deck.shift());
  }
  hand = shuffle(hand);
  return {
    seedWords,
    hand: hand.map(c => ({ letter: c.letter, baseScore: c.baseScore, score: c.score, isFace: c.isFace, id: c.id }))
  };
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function ensureCollection() {
  try {
    await db.createCollection('rooms');
  } catch (e) {
    // 集合已存在或其他错误，忽略
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };

  try {
    await ensureCollection();

    let roomId = generateRoomId();
    let exists = true;
    let retry = 0;
    while (exists && retry < 5) {
      const check = await db.collection('rooms').where({ roomId }).get();
      if (!check.data || check.data.length === 0) {
        exists = false;
      } else {
        roomId = generateRoomId();
        retry++;
      }
    }

    const now = Date.now();
    // 创建房间时即生成第一回合统一种子词/手牌，双方客户端可在开局前预览
    const roundData = generateRoundData();
    const addRes = await db.collection('rooms').add({
      data: {
        roomId: roomId,
        host: OPENID,
        hostReady: false,
        guest: null,
        guestReady: false,
        status: 'waiting',
        createTime: now,
        updateTime: now,
        round: 1,
        currentRound: 1,
        totalRounds: 10,
        playerCards: {},
        seedWords: roundData.seedWords,
        hand: roundData.hand,
        playedWords: [],
        scores: { [OPENID]: 0 },
        roundScores: {},
        currentTurn: null,
        turnDeadline: null,
        winner: null
      }
    });

    const created = await db.collection('rooms').doc(addRes._id).get();
    return { code: 0, roomId: roomId, _id: addRes._id, room: created.data };
  } catch (e) {
    console.error('[battleRoom] 创建房间失败:', e);
    return { code: -1, message: e.message || '创建房间失败' };
  }
};
