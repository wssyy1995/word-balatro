// ===== 游戏数据 =====

// 字母分数

// const LETTER_SCORE = {
//   A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8, I:9,
//   J:10, K:11, L:12, M:13, N:14, O:15, P:16, Q:17, R:18,
//   S:19, T:20, U:21, V:22, W:23, X:24, Y:25, Z:26
// };
//  beta:难度降低
const LETTER_SCORE = {
  A:11, B:12, C:13, D:14, E:15, F:16, G:17, H:18, I:19,
  J:20, K:21, L:22, M:23, N:24, O:25, P:26, Q:27, R:28,
  S:29, T:30, U:31, V:32, W:33, X:34, Y:35, Z:36
};

// 字母分布（98张牌）
const LETTER_DISTRIBUTION = {
  A:8, B:2, C:3, D:4, E:8, F:3, G:3, H:2, I:8,
  J:2, K:2, L:4, M:3, N:5, O:7, P:3, Q:2, R:5,
  S:4, T:5, U:5, V:2, W:2, X:2, Y:2, Z:2
};

// 人头牌标记
const FACE_CARDS = new Set(['X', 'Y', 'Z']);


const { WORD_DATA } = require('./words');
const { EXPAND_WORD_DATA } = require('./expand_words');

// 带容量上限的 Set（LRU 淘汰）
class LimitedSet extends Set {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }
  add(value) {
    if (this.size >= this.maxSize && !this.has(value)) {
      const first = this.values().next().value;
      this.delete(first);
    }
    super.add(value);
    return this;
  }
}

// 带容量上限的 Map（LRU 淘汰）
class LimitedMap extends Map {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }
  set(key, value) {
    if (this.size >= this.maxSize && !this.has(key)) {
      const first = this.keys().next().value;
      this.delete(first);
    }
    super.set(key, value);
    return this;
  }
}

// 在线校验缓存（上限 500 条）
const onlineWordCache = new LimitedSet(500);

// 在线检测状态缓存（当前回合内有效）
const wordCheckState = new Map();

// 正在检测中的单词（防并发重复请求）
const checkingWords = new Set();

// 单词释义缓存（上限 500 条）
const wordMeaningCache = new LimitedMap(500);

// 字母升级记录（跨回合保留）
const letterUpgrades = new Map();

// 获取升级后的字母分数（支持乘法 + 加法叠加）
function getLetterScore(letter) {
  const base = LETTER_SCORE[letter];
  const upgrade = letterUpgrades.get(letter);
  let score = base;
  if (upgrade) {
    if (upgrade.mult) score = Math.floor(score * upgrade.mult);
    if (upgrade.add) score += upgrade.add;
  }
  return score;
}

// 计算基础目标分（分段递增系数）
// 1关=150；2~5关系数20；6~10关系数25；11~20关系数33；21~30关系数43；31~40关系数55；41~50关系数60；51+关系数60
function calcBaseTarget(round) {
  function getCoefficient(r) {
    if (r <= 5) return 20;
    if (r <= 10) return 25;
    if (r <= 20) return 33;
    if (r <= 30) return 43;
    if (r <= 40) return 55;
    if (r <= 50) return 60;
    return 60;
  }
  let target = 150;
  for (let r = 2; r <= round; r++) {
    target += getCoefficient(r) * (r - 1);
  }
  return target;
}

module.exports = {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA, EXPAND_WORD_DATA,
  onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords,
  getLetterScore, calcBaseTarget
};
