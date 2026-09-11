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
// 第一关1关=450
function calcBaseTarget(round) {
  function getCoefficient(r) {
    if (r <= 5) return 40;
    if (r <= 10) return 35;
    if (r <= 20) return 37;
    if (r <= 30) return 40;
    if (r <= 40) return 44;
    if (r <= 50) return 50;
    return 60;
  }
  let target = 450;
  for (let r = 2; r <= round; r++) {
    target += getCoefficient(r) * (r - 1);
  }
  return target;
}

// ===== fill_blanks（完形填空）女巫试炼兜底数据 =====
// 云函数失败/超时或存档缺失时使用；数据规范：word 长度 3~7、纯小写、example 中必须出现 word 或其常见变形
const FILL_BLANK_FALLBACK = [
  { word: 'abuse', example: 'The report showed the abuse of power by officials.', example_zh: '这份报告揭示了官员滥用权力的问题。' },
  { word: 'adapt', example: 'It took him a long time to adapt to the new environment.', example_zh: '他花了很长时间适应新环境。' },
  { word: 'await', example: 'A warm welcome awaits you at the airport.', example_zh: '机场有人热烈欢迎你的到来。' },
  { word: 'award', example: 'She received an award for her excellent work.', example_zh: '她因出色的工作获得了奖项。' },
  { word: 'amend', example: 'The law was amended last year.', example_zh: '这项法律去年被修订了。' },
  { word: 'cease', example: 'The rain ceased at midnight.', example_zh: '雨在午夜停了。' },
  { word: 'boost', example: 'The new policy helped boost the economy.', example_zh: '新政策有助于促进经济发展。' },
  { word: 'curb', example: 'The government took steps to curb inflation.', example_zh: '政府采取措施抑制通货膨胀。' },
  { word: 'deem', example: 'The plan was deemed too risky.', example_zh: '这个计划被认为风险太大。' },
  { word: 'comply', example: 'All citizens must comply with the law.', example_zh: '所有公民都必须遵守法律。' }
];

function getRandomFillBlankFallback() {
  const item = FILL_BLANK_FALLBACK[Math.floor(Math.random() * FILL_BLANK_FALLBACK.length)];
  return { word: item.word, example: item.example, example_zh: item.example_zh };
}

module.exports = {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA, EXPAND_WORD_DATA,
  onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords,
  getLetterScore, calcBaseTarget,
  FILL_BLANK_FALLBACK, getRandomFillBlankFallback
};
