/**
 * 云函数：battleStart
 * 职责：房主在好友已加入并准备后，正式开始对战
 *       将房间状态从 ready 改为 playing，并生成第一回合双方一致的种子词和手牌
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { roomId } = event;
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };
  if (!roomId) return { code: -1, message: '房间号不能为空' };

  try {
    const roomRes = await db.collection('rooms').where({ roomId }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { code: -1, message: '房间不存在' };
    }
    const room = roomRes.data[0];

    if (room.host !== OPENID) {
      return { code: -1, message: '只有房主可以开始对战' };
    }
    if (room.status !== 'ready' && room.status !== 'waiting') {
      return { code: -1, message: '房间已开始或已结束' };
    }
    if (!room.guest) {
      return { code: -1, message: '好友尚未加入' };
    }

    const now = Date.now();
    const roundData = generateRoundData();
    await db.collection('rooms').doc(room._id).update({
      data: {
        status: 'playing',
        hostReady: true,
        updateTime: now,
        currentTurn: room.host,
        turnDeadline: now + 15000,
        currentRound: 1,
        hostPlay: null,
        guestPlay: null,
        seedWords: roundData.seedWords,
        hand: roundData.hand,
        restartRequest: _.remove()
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battleStart] 开始对战失败:', e);
    return { code: -1, message: e.message || '开始对战失败' };
  }
};
