// ===== 游戏数据 =====

// 字母分数
const LETTER_SCORE = {
  A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1,
  J:8, K:5, L:1, M:3, N:1, O:1, P:3, Q:10, R:1,
  S:1, T:1, U:1, V:4, W:4, X:8, Y:4, Z:10
};

// 字母分布（98张牌）
const LETTER_DISTRIBUTION = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9,
  J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6,
  S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1
};

// 人头牌标记
const FACE_CARDS = new Set(['J', 'Q', 'K']);


const { WORD_DATA } = require('./words');
// ===== 商店池 =====
const SHOP_POOL = {
  witch: [
    {name:'女巫·字母A强化', type:'witch', trigger:'letter_a', value:2, cost:5, desc:'字母A分数×2'},
    {name:'女巫·字母E强化', type:'witch', trigger:'letter_e', value:2, cost:5, desc:'字母E分数×2'},
    {name:'女巫·元音强化', type:'witch', trigger:'has_vowel', value:2, cost:6, desc:'含元音时分数×2'},
    {name:'女巫·五字母强化', type:'witch', trigger:'length_5', value:2, cost:7, desc:'5+字母单词×2'},
    {name:'女巫·六字母强化', type:'witch', trigger:'length_6', value:3, cost:8, desc:'6+字母单词×3'},
    {name:'女巫·人头牌强化', type:'witch', trigger:'has_face', value:3, cost:6, desc:'含J/Q/Z时×3'},
    {name:'女巫·高分字母强化', type:'witch', trigger:'high_letter', value:2, cost:5, desc:'含J/Q/X/Z时×2'},
    {name:'女巫·筹码强化', type:'witch', trigger:'always', value:20, cost:5, desc:'每次出牌+20筹码'},
  ],
  crystal: [
    {name:'水晶球·额外弃牌', type:'crystal', effect:'extra_discard', value:1, cost:3, desc:'下一回合弃牌次数+1'},
    {name:'水晶球·保底守护', type:'crystal', effect:'extra_safety', value:1, cost:4, desc:'下一回合保底延长1回合'},
    {name:'水晶球·额外出牌', type:'crystal', effect:'extra_hands', value:1, cost:5, desc:'下一回合出牌次数+1'},
    {name:'水晶球·金币祝福', type:'crystal', effect:'bonus_gold', value:3, cost:3, desc:'下一回合开始时获得3金币'},
    {name:'水晶球·目标减免', type:'crystal', effect:'reduce_target', value:0.8, cost:5, desc:'下一回合目标分数×0.8'},
  ],
  potion: [
    {name:'魔法药水·字母强化', type:'potion', effect:'upgrade_letter', cost:4, desc:'选择一张字母牌，分数翻倍'},
    {name:'魔法药水·王牌强化', type:'potion', effect:'upgrade_face', cost:5, desc:'选择一张王牌，分数×3'},
    {name:'魔法药水·通用强化', type:'potion', effect:'upgrade_any', cost:6, desc:'选择任意牌，分数翻倍'},
  ]
};
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

module.exports = {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA,
  SHOP_POOL, onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords
};
