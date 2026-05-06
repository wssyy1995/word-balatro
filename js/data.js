// ===== 游戏数据 =====

// 字母分数
const LETTER_SCORE = {
  A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, I:9,
  J:10, K:11, L:12, M:13, N:14, O:15, P:16, Q:17, R:18,
  S:19, T:20, U:21, V:22, W:23, X:24, Y:25, Z:26
};

// 字母分布（98张牌）
const LETTER_DISTRIBUTION = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9,
  J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6,
  S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1
};

// 人头牌标记
const FACE_CARDS = new Set(['X', 'Y', 'Z']);


const { WORD_DATA, SEED_WORDS } = require('./words');

// 在线校验缓存
const onlineWordCache = new Set();

// 在线检测状态缓存（当前回合内有效）
const wordCheckState = new Map();

// 正在检测中的单词（防并发重复请求）
const checkingWords = new Set();

// 单词释义缓存
const wordMeaningCache = new Map();

// 字母升级记录（跨回合保留）
const letterUpgrades = new Map();

// 获取升级后的字母分数
function getLetterScore(letter) {
  const base = LETTER_SCORE[letter];
  const upgrade = letterUpgrades.get(letter);
  if (upgrade && upgrade.mult) {
    return Math.floor(base * upgrade.mult);
  }
  return base;
}

module.exports = {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA, SEED_WORDS,
  onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords,
  getLetterScore
};
