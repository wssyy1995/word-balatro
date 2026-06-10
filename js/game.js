// ===== 游戏核心逻辑 =====
const {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA, EXPAND_WORD_DATA,
  onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords,
  calcBaseTarget
} = require('./data');
const { AnimationManager, Easing } = require('./animation');
const { AudioManager } = require('./audio');
const { StorageManager } = require('./storage');
const { generateShopItems, applyCrystalEffects, upgradeLetter, SHOP_POOL } = require('./shop');
const { getSkillForLevel, checkSkill, getSkillFailText, giveReward, createRewardItem, SKILL_POOL, shuffleSkills, WITCH_CARDS, WITCH_SKILLS } = require('./witch_skills');

// 把 wx.request 包成标准 Promise（RequestTask 直接用 await 会挂住）
function requestPromise(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

// ===== 百度翻译词典版 API（前端不存密钥，token 从云函数获取，本地缓存7天）=====
const BAIDU_TOKEN_CACHE_KEY = 'baidu_dict_token_v1';
const BAIDU_TOKEN_CACHE_DAYS = 7;

let _baiduAccessToken = null;
let _baiduTokenExpireAt = 0;

// 从本地缓存加载 token
function loadBaiduToken() {
  try {
    const cached = wx.getStorageSync(BAIDU_TOKEN_CACHE_KEY);
    if (cached && cached.token && cached.expireAt > Date.now()) {
      _baiduAccessToken = cached.token;
      _baiduTokenExpireAt = cached.expireAt;
      return true;
    }
  } catch (e) {}
  _baiduAccessToken = null;
  _baiduTokenExpireAt = 0;
  return false;
}

// 保存 token 到本地缓存（有效期7天）
function saveBaiduToken(token) {
  const expireAt = Date.now() + BAIDU_TOKEN_CACHE_DAYS * 24 * 60 * 60 * 1000;
  _baiduAccessToken = token;
  _baiduTokenExpireAt = expireAt;
  try {
    wx.setStorageSync(BAIDU_TOKEN_CACHE_KEY, { token, expireAt });
  } catch (e) {}
}

// 调用云函数刷新 token
async function refreshBaiduToken() {
  try {
    const res = await wx.cloud.callFunction({ name: 'baiduDict', data: {} });
    if (res.result && res.result.code === 0 && res.result.access_token) {
      saveBaiduToken(res.result.access_token);
      console.log('[BaiduDict] token refreshed via cloud function, cache 7 days');
      return res.result.access_token;
    }
    console.log('[BaiduDict] cloud function returned error:', res.result);
  } catch (e) {
    console.log('[BaiduDict] cloud function failed:', e.message || e);
  }
  return null;
}

// 获取可用 token（优先缓存，过期则调云函数刷新）
async function getBaiduAccessToken() {
  const now = Date.now();
  // 内存或本地缓存有效（留60秒缓冲）
  if (_baiduAccessToken && _baiduTokenExpireAt > now + 60000) {
    return _baiduAccessToken;
  }
  // 尝试从本地 storage 加载
  if (loadBaiduToken() && _baiduTokenExpireAt > now + 60000) {
    return _baiduAccessToken;
  }
  // 调云函数刷新
  return refreshBaiduToken();
}

// 调用百度词典版接口（带 token 失效自动重试）
async function baiduDictRequest(word, retry = true) {
  const accessToken = await getBaiduAccessToken();
  if (!accessToken) return null;

  try {
    const resp = await requestPromise({
      url: `https://aip.baidubce.com/rpc/2.0/mt/texttrans-with-dict/v1?access_token=${accessToken}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { from: 'en', to: 'zh', q: word },
      timeout: 5000
    });

    // token 失效，清除缓存并重试一次
    if (resp.statusCode === 401 || resp.data?.error_code === 110 || resp.data?.error_code === 111) {
      console.log('[BaiduDict] token expired, will refresh via cloud function');
      _baiduAccessToken = null;
      _baiduTokenExpireAt = 0;
      try { wx.removeStorageSync(BAIDU_TOKEN_CACHE_KEY); } catch (e) {}
      if (retry) {
        const newToken = await refreshBaiduToken();
        if (newToken) {
          return baiduDictRequest(word, false);
        }
      }
      return null;
    }

    if (resp.statusCode === 200 && resp.data?.result?.trans_result?.[0]) {
      return resp.data.result.trans_result[0];
    }
  } catch (e) {
    console.log(`[BaiduDict] request "${word}" failed:`, e.message || e);
  }
  return null;
}

// 工具函数
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDeck() {
  const cards = [];
  for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      const baseScore = LETTER_SCORE[letter];
      const upgrade = letterUpgrades.get(letter);
      let score = baseScore;
      let upgraded = false;
      let upgradeMult = 1;
      let upgradeAdd = 0;
      if (upgrade) {
        if (upgrade.mult) score = Math.floor(score * upgrade.mult);
        if (upgrade.add) score += upgrade.add;
        upgraded = true;
        upgradeMult = upgrade.mult || 1;
        upgradeAdd = upgrade.add || 0;
      }
      cards.push({
        letter, baseScore, score,
        isFace: FACE_CARDS.has(letter),
        id: Math.random().toString(36).substr(2, 9),
        selected: false,
        upgraded, upgradeMult, upgradeAdd
      });
    }
  }
  return shuffle(cards);
}

function draw(deck, count) {
  const drawn = deck.splice(0, Math.min(count, deck.length));
  return drawn;
}

function getSeedWord(minLen = 3, maxLen = 6, excludeLetters = []) {
  // 从本地词库中按长度过滤后随机选取保底词
  const candidates = [];
  for (const word of WORD_DATA.keys()) {
    const upper = word.toUpperCase();
    if (word.length >= minLen && word.length <= maxLen) {
      const hasExcluded = excludeLetters.some(l => upper.includes(l));
      if (!hasExcluded) {
        candidates.push(word);
      }
    }
  }
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  // 兜底：返回不含排除字母的词
  const fallbacks = ['the', 'it', 'on', 'up', 'do', 'go', 'me', 'we', 'to', 'so'];
  const validFallbacks = fallbacks.filter(w => !excludeLetters.some(l => w.toUpperCase().includes(l)));
  return validFallbacks.length > 0 ? validFallbacks[0] : 'the';
}

const VOWELS = ['A', 'E', 'I', 'O', 'U'];

function getCandidatesByLen(minLen, maxLen, excludeLetters) {
  const candidates = [];
  for (const word of WORD_DATA.keys()) {
    const upper = word.toUpperCase();
    if (word.length >= minLen && word.length <= maxLen) {
      const hasExcluded = excludeLetters.some(l => upper.includes(l));
      if (!hasExcluded) candidates.push(word);
    }
  }
  return candidates;
}

function getVowelSet(word) {
  const s = new Set();
  for (const ch of word.toUpperCase()) {
    if (VOWELS.includes(ch)) s.add(ch);
  }
  return s;
}

function countVowelFreq(word) {
  const freq = {};
  for (const ch of word.toUpperCase()) {
    if (VOWELS.includes(ch)) {
      freq[ch] = (freq[ch] || 0) + 1;
    }
  }
  return freq;
}

function drawWithSafety(deck, count, round, safetyRounds, seedMinLen = 3, seedMaxLen = 6, excludeLetters = [], dailyWord = null) {
  // 固定生成一个长度3的种子词（不从牌堆抽取，直接创建）
  const candidates3 = getCandidatesByLen(3, 3, excludeLetters);
  shuffle(candidates3);

  let seedWord3 = candidates3[0] || getSeedWord(3, 3, excludeLetters);
  let seedLetters3 = seedWord3.toUpperCase().split('').filter(l => !excludeLetters.includes(l));

  let seedLetters4 = [];
  let seedWord4 = null;

  if (dailyWord) {
    // 学习模式：用每日新词替代第二个种子词（保留完整字母含重复）
    let dailyLetters = dailyWord.toUpperCase().split('').filter(l => !excludeLetters.includes(l));
    // 限制每日新词字母数，确保不超过手牌容量
    const maxDailyLen = Math.max(0, count - seedLetters3.length);
    if (dailyLetters.length > maxDailyLen) {
      // 优先保留完整单词的前部字母，而不是随机打乱
      dailyLetters = dailyLetters.slice(0, maxDailyLen);
    }
    seedLetters4 = dailyLetters;
    console.log('种子词：', seedWord3 + '(正常) + ' + dailyWord + '(每日)');
  } else {
    // 普通模式：再生成一个长度4的种子词
    // 要求：两个种子词的所有字母加起来，不同元音不能超过2个
    const candidates4 = getCandidatesByLen(4, 4, excludeLetters);
    shuffle(candidates4);

    // 将长度4候选词按元音集合分组（key 为排序后的元音字符串），实现 O(1) 查表
    const groups4 = new Map();
    for (const w of candidates4) {
      const key = Array.from(getVowelSet(w)).sort().join('');
      if (!groups4.has(key)) groups4.set(key, []);
      groups4.get(key).push(w);
    }

    for (const w3 of candidates3) {
      const v3 = getVowelSet(w3);
      if (v3.size > 2) continue;

      const v3Freq = countVowelFreq(w3);
      if (Object.values(v3Freq).some(c => c > 2)) continue;

      const v3Arr = Array.from(v3).sort();
      const possibleKeys = new Set(['']);

      for (let mask = 1; mask < (1 << v3Arr.length); mask++) {
        const subset = [];
        for (let i = 0; i < v3Arr.length; i++) {
          if (mask & (1 << i)) subset.push(v3Arr[i]);
        }
        possibleKeys.add(subset.join(''));
      }

      if (v3.size === 1) {
        for (const v of VOWELS) {
          if (!v3.has(v)) possibleKeys.add([v3Arr[0], v].sort().join(''));
        }
      }

      if (v3.size === 0) {
        for (const v of VOWELS) possibleKeys.add(v);
        for (let i = 0; i < VOWELS.length; i++) {
          for (let j = i + 1; j < VOWELS.length; j++) {
            possibleKeys.add([VOWELS[i], VOWELS[j]].sort().join(''));
          }
        }
      }

      const allValid4 = [];
      for (const key of possibleKeys) {
        const group = groups4.get(key);
        if (!group) continue;
        for (const w4 of group) {
          const v4Freq = countVowelFreq(w4);
          let valid = true;
          for (const v of VOWELS) {
            const total = (v3Freq[v] || 0) + (v4Freq[v] || 0);
            if (total > 2) {
              valid = false;
              break;
            }
          }
          if (valid) allValid4.push(w4);
        }
      }
      if (allValid4.length > 0) {
        seedWord3 = w3;
        seedWord4 = allValid4[Math.floor(Math.random() * allValid4.length)];
        break;
      }
    }

    if (!seedWord4) seedWord4 = candidates4[0] || getSeedWord(4, 4, excludeLetters);
    seedLetters3 = seedWord3.toUpperCase().split('').filter(l => !excludeLetters.includes(l));
    seedLetters4 = seedWord4.toUpperCase().split('').filter(l => !excludeLetters.includes(l));
    console.log('种子词：', seedWord3 + ',' + seedWord4);
  }

  const allSeedLetters = [...seedLetters3, ...seedLetters4];
  const seedLetterSet = new Set(allSeedLetters);

  const makeSeedCards = (letters) => letters.map(letter => {
    const baseScore = LETTER_SCORE[letter];
    const upgrade = letterUpgrades.get(letter);
    let score = baseScore;
    let upgraded = false;
    let upgradeMult = 1;
    let upgradeAdd = 0;
    if (upgrade) {
      if (upgrade.mult) score = Math.floor(score * upgrade.mult);
      if (upgrade.add) score += upgrade.add;
      upgraded = true;
      upgradeMult = upgrade.mult || 1;
      upgradeAdd = upgrade.add || 0;
    }
    return { letter, baseScore, score, isFace: FACE_CARDS.has(letter),
      id: Math.random().toString(36).substr(2, 9), selected: false, upgraded, upgradeMult, upgradeAdd, _isSeedCard: true };
  });

  const seedCards3 = makeSeedCards(seedLetters3);
  // 学习模式下，每日新词的牌额外标记
  const seedCards4 = dailyWord
    ? seedLetters4.map(letter => {
        const baseScore = LETTER_SCORE[letter];
        const upgrade = letterUpgrades.get(letter);
        let score = baseScore;
        let upgraded = false;
        let upgradeMult = 1;
        let upgradeAdd = 0;
        if (upgrade) {
          if (upgrade.mult) score = Math.floor(score * upgrade.mult);
          if (upgrade.add) score += upgrade.add;
          upgraded = true;
          upgradeMult = upgrade.mult || 1;
          upgradeAdd = upgrade.add || 0;
        }
        return { letter, baseScore, score, isFace: FACE_CARDS.has(letter),
          id: Math.random().toString(36).substr(2, 9), selected: false, upgraded, upgradeMult, upgradeAdd, _isSeedCard: true, _isDailyChallengeCard: true };
      })
    : makeSeedCards(seedLetters4);
  const allSeedCards = [...seedCards3, ...seedCards4];

  // 过滤牌堆：随机补牌的字母不能跟种子单词字母重复
  // 种子词字母的牌保留在 deck 中，仅抽出不含种子词字母的随机牌
  const remaining = count - allSeedLetters.length;
  const randomCards = [];
  const toKeep = [];

  shuffle(deck);
  for (const card of deck) {
    // 随机补牌不能包含种子词字母，也不能包含任何元音
    const isValid = !seedLetterSet.has(card.letter) && !VOWELS.includes(card.letter);
    if (randomCards.length < remaining && isValid) {
      randomCards.push(card);
    } else {
      toKeep.push(card);
    }
  }

  // 若过滤后牌堆不足，补充新牌堆并再次过滤
  if (randomCards.length < remaining) {
    const extraDeck = createDeck();
    shuffle(extraDeck);
    for (const card of extraDeck) {
      const isValid = !seedLetterSet.has(card.letter) && !VOWELS.includes(card.letter);
      if (randomCards.length < remaining && isValid) {
        randomCards.push(card);
      } else {
        toKeep.push(card);
      }
    }
  }

  // 重建 deck（保留未被抽走的牌，含种子词字母的牌仍留在牌堆供后续补牌）
  deck.length = 0;
  deck.push(...toKeep);

  // 将种子卡牌打乱后逐个随机穿插到 randomCards 中，避免按单词顺序连续出现
  shuffle(allSeedCards);
  const hand = [...randomCards];
  for (const card of allSeedCards) {
    const pos = Math.floor(Math.random() * (hand.length + 1));
    hand.splice(pos, 0, card);
  }
  return hand;
}

function ensureValidWordInHand(deck, hand, seedMinLen = 3, seedMaxLen = 6, maxHandSize = 9, excludeLetters = []) {
  const hasWord = hasValidWordInHand(hand);
  console.log('[ensureValidWordInHand] hasValidWord:', hasWord);
  if (hasWord) return;

  const seedWord = getSeedWord(seedMinLen, seedMaxLen, excludeLetters);
  console.log('[ensureValidWordInHand] seedword:', seedWord);
  const seedLetters = seedWord.toUpperCase().split('').filter(l => !excludeLetters.includes(l));

  for (const letter of seedLetters) {
    const idx = deck.findIndex(c => c.letter === letter);
    if (idx >= 0) deck.splice(idx, 1);
  }

  const seedCards = seedLetters.map(letter => {
    const baseScore = LETTER_SCORE[letter];
    const upgrade = letterUpgrades.get(letter);
    let score = baseScore;
    let upgraded = false;
    let upgradeMult = 1;
    let upgradeAdd = 0;
    if (upgrade) {
      if (upgrade.mult) score = Math.floor(score * upgrade.mult);
      if (upgrade.add) score += upgrade.add;
      upgraded = true;
      upgradeMult = upgrade.mult || 1;
      upgradeAdd = upgrade.add || 0;
    }
    return { letter, baseScore, score, isFace: FACE_CARDS.has(letter),
      id: Math.random().toString(36).substr(2, 9), selected: false, upgraded, upgradeMult, upgradeAdd };
  });

  // 用 seedCards 替换 hand 中的 null 占位符
  let seedIdx = 0;
  for (let i = 0; i < hand.length && seedIdx < seedCards.length; i++) {
    if (hand[i] === null) {
      hand[i] = seedCards[seedIdx++];
    }
  }
  // 如果还有剩余的 seedCards 且 hand 未满，才 push 到末尾
  while (seedIdx < seedCards.length && hand.length < maxHandSize) {
    hand.push(seedCards[seedIdx++]);
  }
}

// 补牌时确保元音规则：至少2种不同元音，且每种元音不超过2张
function drawWithVowelRules(deck, hand, need, maxAttempts = 10) {
  const VOWELS = ['A', 'E', 'I', 'O', 'U'];

  // 统计保留手牌中的元音
  const handVowelCounts = {};
  for (const card of hand) {
    if (card && VOWELS.includes(card.letter)) {
      handVowelCounts[card.letter] = (handVowelCounts[card.letter] || 0) + 1;
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const drawn = deck.splice(0, need);

    const vowelCounts = { ...handVowelCounts };
    for (const card of drawn) {
      if (VOWELS.includes(card.letter)) {
        vowelCounts[card.letter] = (vowelCounts[card.letter] || 0) + 1;
      }
    }

    const vowelTypes = Object.keys(vowelCounts).length;
    const maxVowelCount = Math.max(0, ...Object.values(vowelCounts));

    if (vowelTypes >= 2 && maxVowelCount <= 2) {
      return drawn;
    }

    // 不满足，放回 deck 并重新洗牌
    deck.push(...drawn);
    shuffle(deck);
  }

  // 兜底：直接返回
  return deck.splice(0, need);
}

// 频率表算法：O(|WORD_DATA|) 远快于全排列 O(n!)
function hasValidWordInHand(hand) {
  const letterCounts = {};
  for (const card of hand) {
    if (!card) continue;
    const l = card.letter.toLowerCase();
    letterCounts[l] = (letterCounts[l] || 0) + 1;
  }

  for (const word of WORD_DATA.keys()) {
    if (word.length < 2) continue;
    if (canFormWord(word, letterCounts)) return true;
  }
  for (const word of EXPAND_WORD_DATA.keys()) {
    if (word.length < 2) continue;
    if (canFormWord(word, letterCounts)) return true;
  }
  for (const word of onlineWordCache) {
    if (word.length < 2) continue;
    if (canFormWord(word, letterCounts)) return true;
  }
  return false;
}

function canFormWord(word, letterCounts) {
  const needed = {};
  for (const ch of word) {
    needed[ch] = (needed[ch] || 0) + 1;
  }
  for (const [ch, count] of Object.entries(needed)) {
    if ((letterCounts[ch] || 0) < count) return false;
  }
  return true;
}

function findAllValidWordsInHand(hand) {
  const cards = hand.filter(Boolean);
  const letterCounts = {};
  for (const card of cards) {
    const l = card.letter.toLowerCase();
    letterCounts[l] = (letterCounts[l] || 0) + 1;
  }

  const results = [];
  const seenWords = new Set();

  function tryWord(word) {
    if (seenWords.has(word)) return;
    if (word.length < 2 || word.length > cards.length) return;

    const needed = {};
    for (const ch of word) {
      needed[ch] = (needed[ch] || 0) + 1;
    }
    for (const [ch, count] of Object.entries(needed)) {
      if ((letterCounts[ch] || 0) < count) return;
    }

    // 找到组成该单词的 cards
    const used = new Set();
    const wordCards = [];
    for (const ch of word) {
      for (let i = 0; i < cards.length; i++) {
        if (!used.has(i) && cards[i].letter.toLowerCase() === ch) {
          used.add(i);
          wordCards.push(cards[i]);
          break;
        }
      }
    }

    seenWords.add(word);
    const preview = calcWordScore(wordCards, [], null, [], this._lastPlayedLetters);
    if (preview.valid) {
      results.push({ word, cards: wordCards, score: preview.score });
    }
  }

  for (const word of WORD_DATA.keys()) tryWord(word);
  for (const word of EXPAND_WORD_DATA.keys()) tryWord(word);
  for (const word of onlineWordCache) tryWord(word);

  results.sort((a, b) => b.cards.length - a.cards.length || b.score - a.score);
  return results;
}

function findValidWordInHand(hand) {
  const all = findAllValidWordsInHand(hand);
  return all.length > 0 ? all[0] : null;
}

// 判断单张卡是否匹配女巫牌的 trigger 条件
// index: 卡牌在单词中的位置（从0开始），用于 initial_vowel 等需要位置信息的 trigger
function _matchCardTrigger(card, trigger, index = -1, joker = null) {
  switch (trigger) {
    case 'letter_a': return card.letter === 'A';
    case 'letter_e': return card.letter === 'E';
    case 'has_vowel': return 'AEIOU'.includes(card.letter);
    case 'high_letter': return ['J','Q','X','Z'].includes(card.letter);
    case 'initial_vowel': return index === 0 && 'AEIOU'.includes(card.letter);
    case 'predicted_letter': return joker && card.letter === (joker._predictedLetter || '');
    default: return false;
  }
}

// 判断整手牌是否匹配女巫牌的 trigger 条件
function _matchWordTrigger(cards, trigger) {
  switch (trigger) {
    case 'has_face': return cards.some(c => ['J','Q','X','Y','Z'].includes(c.letter));
    case 'length_3': return cards.length >= 3;
    case 'length_4': return cards.length >= 4;
    case 'length_5': return cards.length >= 5;
    case 'length_6': return cards.length >= 6;
    case 'double_same': {
      const word = cards.map(c => c.letter.toLowerCase()).join('');
      for (let k = 1; k < word.length; k++) {
        if (word[k] === word[k - 1]) return true;
      }
      return false;
    }
    case 'firstend_same': {
      const word = cards.map(c => c.letter.toLowerCase()).join('');
      return word.length >= 2 && word[0] === word[word.length - 1];
    }

    default: return false;
  }
}

function calcWordScore(cards, jokers, pendingCheck = null, equippedCardSkills = [], lastPlayedLetters = null) {
  if (!cards || cards.length === 0) return { valid: false, score: 0 };

  const activeJokers = (jokers || []).filter(j => j && !j._disabled);

  let mult = cards.length; // 基础倍率 = 单词长度
  let hasFace = false;
  for (const c of cards) {
    if (c.isFace) hasFace = true;
  }

  const word = cards.map(c => c.letter.toLowerCase()).join('');

  // === 先处理 limit 型女巫牌（字母之神）：所有字母基础分变为最高分 ===
  const letterGod = activeJokers.find(j => j.type === 'witch' && j.scope === 'limit' && j.trigger === 'letter_god');
  let maxBaseScore = 0;
  if (letterGod) {
    maxBaseScore = Math.max(...cards.map(c => c.score));
  }

  // 计算每个字母的倍率（女巫牌对单个字母的加成）
  const cardMults = cards.map(() => 1);
  const cardAddScores = cards.map(() => 0);

  for (const j of activeJokers) {
    if (j.type !== 'witch') continue;
    // limit 型女巫牌不参与常规倍率计算
    if (j.scope === 'limit') continue;
    switch (j.scope) {
      case 'per_card':
        cards.forEach((c, i) => {
          if (_matchCardTrigger(c, j.trigger, i, j)) {
            if (j.operation === 'add') {
              cardAddScores[i] += j.value;
            } else {
              cardMults[i] *= j.value;
            }
          }
        });
        break;
      case 'whole_word': {
        let wwMatched;
        if (j.trigger === 'illegal_boost' || j.operation === 'multi_accumulation') {
          wwMatched = j.value > 0;
        } else if (j.trigger === 'end_ed') {
          wwMatched = pendingCheck?.endEdValid || false;
        } else if (j.trigger === 'end_s') {
          wwMatched = pendingCheck?.endSValid || false;
        } else if (j.trigger === 'no_duplicate') {
          // 消元术：与上一手无重复字母时触发，第一手不触发
          const currentLetters = new Set(cards.map(c => c.letter.toUpperCase()));
          const lastLetters = lastPlayedLetters;
          if (!lastLetters || lastLetters.size === 0) {
            wwMatched = false; // 第一手不触发
          } else {
            // 检查是否有交集
            let hasOverlap = false;
            for (const letter of currentLetters) {
              if (lastLetters.has(letter)) {
                hasOverlap = true;
                break;
              }
            }
            wwMatched = !hasOverlap;
          }
        } else {
          wwMatched = _matchWordTrigger(cards, j.trigger);
        }
        if (wwMatched) {
          if (j.trigger === 'illegal_boost' || j.operation === 'multi_adds_value' || j.operation === 'multi_accumulation') {
            mult += j.value;
          } else {
            mult = Math.ceil(mult * j.value);
          }
        } else if (j.penalty !== undefined) {
          // 未触发时执行惩罚（no_duplicate 第一手不惩罚）
          if (j.trigger !== 'no_duplicate' || (lastPlayedLetters && lastPlayedLetters.size > 0)) {
            mult += j.penalty;
          }
        }
        break;
      }
      // flat_bonus 在 baseScore 累加后单独处理
    }
  }

  let baseScore = 0;
  for (let i = 0; i < cards.length; i++) {
    const cardScore = letterGod ? maxBaseScore : cards[i].score;
    baseScore += cardScore * cardMults[i] + cardAddScores[i];
  }

  // === 装备卡牌：德莱薇尔 - 最后一个字母分数算多次（含 per_card 女巫牌加成，多张叠加） ===
  let lastLetterDoubleExtra = 0;
  const doubleCount = (equippedCardSkills || []).filter(s => s === 'last_letter_double').length;
  if (doubleCount > 0 && cards.length > 0) {
    const lastIdx = cards.length - 1;
    const lastCardScore = letterGod ? maxBaseScore : cards[lastIdx].score;
    for (let i = 0; i < doubleCount; i++) {
      const extra = lastCardScore * cardMults[lastIdx] + cardAddScores[lastIdx];
      lastLetterDoubleExtra += extra;
      baseScore += extra;
    }
  }

  for (const j of activeJokers) {
    if (j.type === 'witch' && j.scope === 'flat_bonus') {
      baseScore += j.value;
    }
  }

  const totalScore = Math.ceil(baseScore * mult);
  return { valid: true, score: totalScore, base: baseScore, mult, word, hasFace, _lastLetterDouble: lastLetterDoubleExtra };
}

// 从释义字符串开头提取词性标记，如 n./v./adj./n&v./adj&adv.
function extractPosFromMeaning(meaning) {
  if (!meaning) return '';
  // 匹配单个词性（如 n. adj.）或 & 连接的多个词性（如 n&v. adj&adv.）
  const m = meaning.match(/^([a-z]+(?:&[a-z]+)*\.)/);
  return m ? m[1] : '';
}

// 通用：letter_X_mult_half 惩罚检测（支持 letter_a_mult_half / letter_e_mult_half 等）
function applyLetterMultHalf(witchSkill, playedInOrder, result) {
  if (!witchSkill) return null;
  const match = witchSkill.skill.match(/letter_([a-z])_mult_half/);
  if (!match) return null;
  const letter = match[1];
  const hasLetter = playedInOrder.some(c => c.letter.toLowerCase() === letter);
  if (!hasLetter) return null;
  const originalScore = result.score;
  const originalMult = result.mult;
  const halvedMult = Math.max(1, Number((originalMult / 2).toFixed(1)));
  const halvedScore = Math.ceil(result.base * halvedMult);
  return {
    triggered: true,
    originalScore,
    originalMult,
    halvedMult,
    halvedScore,
    angryTip: witchSkill.angry_tip
  };
}

function isValidWord(word) {
  word = word.toLowerCase();
  if (WORD_DATA.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L1(WORD_DATA) hit`);
    return true;
  }
  if (EXPAND_WORD_DATA.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L2(EXPAND_WORD_DATA) hit`);
    return true;
  }
  if (onlineWordCache.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L2.5(onlineCache) hit`);
    return true;
  }
  console.log(`[WordCheck] word="${word}" layer=L1+L2 miss`);
  return false;
}

async function isValidWordOnline(word) {
  word = word.toLowerCase();
  // 防御性检查（该函数也可能被单独调用）
  if (WORD_DATA.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L1(WORD_DATA) hit`);
    return true;
  }
  if (EXPAND_WORD_DATA.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L2(EXPAND_WORD_DATA) hit`);
    if (!wordMeaningCache.has(word)) {
      const meaning = EXPAND_WORD_DATA.get(word);
      wordMeaningCache.set(word, { meaning });
    }
    onlineWordCache.add(word);
    wordCheckState.set(word, 'valid');
    return true;
  }
  if (onlineWordCache.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L2.5(onlineCache) hit`);
    return true;
  }
  if (checkingWords.has(word)) {
    console.log(`[WordCheck] word="${word}" layer=L3 checking in progress, skip`);
    return false;
  }

  checkingWords.add(word);
  console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) requesting...`);

  try {
    const result = await baiduDictRequest(word);

    if (result && result.dict) {
      const dict = typeof result.dict === 'string' ? JSON.parse(result.dict) : result.dict;
      const simple = dict?.word_result?.simple_means;
      const from = simple?.from || '';

      // 白名单：只有 original(标准词)、deformation(变形词)、green(专有名词) 算有效
      // net/netdata 等未知类型视为无效（网络拼凑词）
      const VALID_FROM_TYPES = ['original', 'deformation', 'green'];
      const isValid = VALID_FROM_TYPES.includes(from);

      if (isValid) {
        console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) VALID (from=${from})`);
        onlineWordCache.add(word);
        wordCheckState.set(word, 'valid');

        // 缓存中文释义
        if (!wordMeaningCache.has(word) && simple) {
          const wordMeans = simple.word_means || [];
          const symbols = simple.symbols?.[0];
          const parts = symbols?.parts || [];
          const phEn = symbols?.ph_en || '';
          const phAm = symbols?.ph_am || '';

          // 构建 entries（取前2个词性）
          const entries = parts.slice(0, 2).map(p => ({
            pos: p.part || p.part_name || '',
            def: (p.means || []).slice(0, 3).join('；')
          }));

          // 汇总释义（限制单条最长20字符，超出截断）
          const MAX_MEANING_LEN = 20;
          let meaning = wordMeans.length > 0 ? wordMeans.join('；') : (entries[0]?.def || '');
          if (meaning.length > MAX_MEANING_LEN) meaning = meaning.substring(0, MAX_MEANING_LEN) + '...';
          const trimmedEntries = entries.length > 0 ? entries : [{ pos: '', def: meaning }];
          trimmedEntries.forEach(e => {
            if (e.def && e.def.length > MAX_MEANING_LEN) e.def = e.def.substring(0, MAX_MEANING_LEN) + '...';
          });

          wordMeaningCache.set(word, {
            entries: trimmedEntries,
            pos: entries[0]?.pos || '',
            meaning,
            phEn,
            phAm
          });
        }
        checkingWords.delete(word);
        return true;
      } else {
        console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) INVALID (from=netdata)`);
      }
    } else {
      console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) INVALID (no dict)`);
    }
  } catch (e) {
    console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) ERROR:`, e.message || e);
  }

  wordCheckState.set(word, 'invalid');
  checkingWords.delete(word);
  return false;
}

function getWordMeaning(word) {
  word = word.toLowerCase();

  // 1. 本地缓存
  if (wordMeaningCache.has(word)) {
    const cached = wordMeaningCache.get(word);
    if (cached.entries) return cached;
    if (cached.meaning) return { entries: [{ pos: cached.pos || '', def: cached.meaning }], pos: cached.pos || '', meaning: cached.meaning };
  }

  // 2. 核心离线词库
  if (WORD_DATA.has(word)) {
    const info = WORD_DATA.get(word);
    const result = { entries: [{ pos: info.pos || '', def: info.meaning }], pos: info.pos || '', meaning: info.meaning };
    wordMeaningCache.set(word, result);
    return result;
  }

  // 3. 扩展离线词库
  if (EXPAND_WORD_DATA.has(word)) {
    const meaning = EXPAND_WORD_DATA.get(word);
    const result = { meaning };
    wordMeaningCache.set(word, result);
    return result;
  }

  return null;
}

function truncateMeaning(str, maxLen = 20) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

function formatMeaning(meaningObj) {
  if (!meaningObj) return '';
  const MAX_LEN = 20;
  if (meaningObj.entries && meaningObj.entries.length > 0) {
    const text = meaningObj.entries.map(e => `${e.pos} ${e.def}`).join('；');
    return truncateMeaning(text, MAX_LEN);
  }
  return truncateMeaning(meaningObj.meaning || '', MAX_LEN);
}

// ===== 游戏主类 =====
class Game {
  constructor(savedProgress = null) {
    this.storageManager = new StorageManager();
    this.audioManager = new AudioManager();
    this.audioManager.preloadAll();

    if (savedProgress) {
      this._restoreFromProgress(savedProgress);
    } else {
      // ===== 全新游戏 =====
      letterUpgrades.clear();
      this.round = 1;
      this.gold = 4;
      // 应用装备的女巫卡牌初始技能
      this._applyEquippedCardBonus('init');
      this.jokers = [];
      this.maxJokerSlots = 4;
      this.crystalEffects = [];
      this.potions = [];
      this.potionMode = null;
      this._potionSelectedLetter = null;
      this._potionUpgrading = null;
      this._randomUpgradePopup = null;
      this.state = 'playing';
      this.shopItems = null;
      this.safetyRounds = 3;
      this.extraDiscards = 0;
      this.cardBookUnlocked = this.storageManager.loadCardBookUnlocked() || false;
      this.cardBookOpen = false;
      this.cardBookPage = 0;
      this._cardBookAnimStartTime = null;
      this._closingCardBook = false;
      this._closeCardBookStartTime = null;
      this._cardBookDetailLevel = null;
      this._closingCardBookDetail = false;
      this._cardBookDetailStartTime = null;
      this._closeCardBookDetailStartTime = null;
      this._cardBookEquipBtnPressed = false;
      this._cardBookCloseBtnPressed = false;
      this._cardBookCellPressed = null;
      this.collectedWitchCards = this.storageManager.loadCollectedWitchCards() || [];
      this.equippedWitchCards = this.storageManager.loadEquippedWitchCard();
      console.log('[CardBook] 新游戏加载 collectedWitchCards:', JSON.stringify(this.collectedWitchCards));
      this._newWitchCardThisShop = null;
      this._cardBookIconFlashStart = null;
      this._forceCardBookFlash = false;
      this._cardBookNewBadge = false;
      this.extraSafety = 0;
      this.extraHands = 0;
      this.baseHandSize = 9;
      this.totalScore = 0;
      this.gameOverReason = null;
      this.roundScores = [];
      this._shuffledSkills = shuffleSkills([...SKILL_POOL]);
      console.log('初始化SKILL_NAME=[' + this._shuffledSkills.map(s => s.skill).join(',') + ']');
      // 每日单词挑战：新游戏时加载今日词
      this._initDailyChallenge();
      this.resetRound();
    }

    // 公共初始化（新游戏和恢复都需要）
    this.animManager = new AnimationManager();
    this.flyingCards = [];
    this.hintToast = null;
    this._changeLetterPopup = null;
    this._changeLetterHint = null;
    this._witchDetailPopup = null;
    this._hudWitchPopup = null;
    this._witchAngryTip = null;
    this.pendingCheck = null;
    this.settlementData = null;
    this.witchRewardData = null;
    this._lifeExtensionAnim = null;
    this._playHandAnimCompleted = false;
    this._playHandCompleting = false;
    this._closingSettlement = false;
    this._closeStartTime = null;
    this._closingWitchReward = false;
    this._closeWitchRewardStartTime = null;
    this._shopToGameTransition = null;
    this._challengeBtnPressed = false;
    this._sellingProp = null;
    this._successBtnPressed = false;
    this._successPressedBtn = null;
    this._successBtnPressTime = null;
    this._closingConfirmBuy = false;
    this._closeConfirmBuyStartTime = null;
    this._confirmBuyItemData = null;
    this._confirmBuySuccess = false;
    this._confirmBuySuccessTime = null;
    this._lifeExtensionBtnPressed = false;
    this._restartBtnPressed = false;
    this._restartBtnPressTime = null;
    this._reviveBtnPressed = false;
    this._reviveBtnPressTime = null;
    this._closingGameOver = false;
    this._closeStartTime = null;
    this._witchStarBurst = null;
    this._witchStarBurstAuto = false;
    this._disableWitchAnim = null;
    this._hastePlayActive = false;
    this._hastePlayStartTime = null;
    this._letterGodAnim = null;
    this._debugLabelShow = null;
    this._witchSkillProtectUsed = false;
    this._dailyWordsPopup = null;
    this._dailyWordsClosePressed = false;
    this._dailyWordsBackPressed = false;
    this._dailyWordsSwitchPressed = false;
    this._dailyWordsSwitchHint = null;
    this._dailyWordsScrollY = 0;
    this._dailyWordsScrollStartY = 0;
    this._dailyWordsScrollStartTouchY = 0;
    this._dailyWordsScrollVelocity = 0;
    this._dailyWordsScrollState = 'idle';
    this._dailyWordsScrollLastTouchY = 0;
    this._dailyWordsScrollLastTime = 0;
    this._dailyWordsScrollDragStartY = 0;
    this._dailyWordsScrollTouchStartY = 0;
    this._dailyWordsScrollBounceTarget = 0;
    this._dailyWordsScrollBounceStartY = 0;
    this._dailyWordsScrollBounceStartTime = 0;
    this._shouldToastFly = false;

    // 装备女巫卡牌跨回合状态
    this._shopDiscountActive = false;   // 菲兰瑟娅/女巫奖励：本回合商店折扣
    this._shopDiscountRate = 0.6;       // 默认折扣率
    this._overflowBonus = 0;            // 格莱薇妮娅：下回合初始溢出分

    // 设置弹窗
    this._settingsPopup = null;
    this._closingSettings = false;
    this._closeSettingsStartTime = null;
    this._settingsCloseBtnPressed = false;
    this._settingsSoundPressed = false;
    this._settingsRankPressed = false;
    this._settingsFeedbackPressed = false;

    // 问题反馈
    this._feedbackPage = 'main';           // 'main' | 'feedback'
    this._feedbackTransition = null;       // { from, to, startTime, duration }
    this._feedbackText = '';
    this._feedbackInputFocused = false;
    this._feedbackBackPressed = false;
    this._feedbackSubmitPressed = false;
    this._feedbackSubmitting = false;
    this._feedbackSubmitToast = null;

    // 加载用户设置
    this.settings = this.storageManager.getSettings();
    if (this.audioManager) {
      this.audioManager.setSoundEnabled(this.settings.soundEnabled !== false);
      this.audioManager.setMusicEnabled(this.settings.musicEnabled !== false);
    }

    // 新手引导（优先从独立存储读取，游戏进度清除后仍保留）
    const savedGuidePhase = this.storageManager.loadGuidePhase();
    if (savedGuidePhase !== null) {
      this.guidePhase = savedGuidePhase;
    } else if (savedProgress && savedProgress.guidePhase !== undefined) {
      this.guidePhase = savedProgress.guidePhase;
    } else if (this.guidePhase === undefined) {
      this.guidePhase = 0;
    }
    // 恢复引导时间戳
    if (savedProgress && savedProgress._guideOverlayStartTime !== undefined) {
      this._guideOverlayStartTime = savedProgress._guideOverlayStartTime;
    }
    // Phase 1 恢复时若缺少 overlay 时间，设为过去值让延迟立即结束（避免恢复后卡住）
    if (this.guidePhase === 1 && !this._guideOverlayStartTime) {
      this._guideOverlayStartTime = Date.now() - 2000;
    }
    // Phase 2~4 恢复时若正在引导则重新开始文字动画
    if (this._guideTextStartTime === undefined && this.guidePhase >= 2 && this.guidePhase <= 4) {
      this._guideTextStartTime = Date.now();
    }
    this._guideCardGiftStartTime = null;

    // 商店女巫技能引导（独立于游戏进度，永久保留）
    const savedShopGuidePhase = this.storageManager.loadShopGuidePhase();
    if (savedShopGuidePhase !== null) {
      this.shopGuidePhase = savedShopGuidePhase;
    } else if (savedProgress && savedProgress.shopGuidePhase !== undefined) {
      this.shopGuidePhase = savedProgress.shopGuidePhase;
    } else if (this.shopGuidePhase === undefined) {
      this.shopGuidePhase = 0;
    }
    // 恢复商店引导时间戳
    if (savedProgress && savedProgress._shopGuideStartTime !== undefined) {
      this._shopGuideStartTime = savedProgress._shopGuideStartTime;
    }
    if (savedProgress && savedProgress._shopGuideTextStartTime !== undefined) {
      this._shopGuideTextStartTime = savedProgress._shopGuideTextStartTime;
    }
    // Phase 1 恢复时若缺少 startTime，设为过去值让延迟立即结束
    if (this.shopGuidePhase === 1 && !this._shopGuideStartTime) {
      this._shopGuideStartTime = Date.now() - 2000;
    }
    // Phase 2 恢复时若缺少 textStartTime，重新开始文字动画
    if (this.shopGuidePhase === 2 && !this._shopGuideTextStartTime) {
      this._shopGuideTextStartTime = Date.now();
    }
    this._shopGuideExitStartTime = null;

    // 卡牌图鉴引导（独立于游戏进度，永久保留）
    const savedCardBookGuidePhase = this.storageManager.loadCardBookGuidePhase();
    if (savedCardBookGuidePhase !== null) {
      this.cardBookGuidePhase = savedCardBookGuidePhase;
    } else if (savedProgress && savedProgress.cardBookGuidePhase !== undefined) {
      this.cardBookGuidePhase = savedProgress.cardBookGuidePhase;
    } else if (this.cardBookGuidePhase === undefined) {
      this.cardBookGuidePhase = 0;
    }
    if (savedProgress && savedProgress._cardBookGuideStartTime !== undefined) {
      this._cardBookGuideStartTime = savedProgress._cardBookGuideStartTime;
    }
    if (savedProgress && savedProgress._cardBookGuideTextStartTime !== undefined) {
      this._cardBookGuideTextStartTime = savedProgress._cardBookGuideTextStartTime;
    }
    if (savedProgress && savedProgress._cardBookGuideText2StartTime !== undefined) {
      this._cardBookGuideText2StartTime = savedProgress._cardBookGuideText2StartTime;
    }
    if (this.cardBookGuidePhase === 1 && !this._cardBookGuideStartTime) {
      this._cardBookGuideStartTime = Date.now() - 2000;
    }
    if (this.cardBookGuidePhase === 3 && !this._cardBookGuideExitStartTime) {
      this._cardBookGuideExitStartTime = Date.now() - 2000;
    }
    this._cardBookGuideExitStartTime = this._cardBookGuideExitStartTime || null;

    // 追踪本实例的所有 setTimeout，restart 时统一清除防止闭包泄漏
    this._timeoutIds = [];
    this._destroyed = false;
  }

  _restoreFromProgress(p) {
    this.round = p.round;
    this.gold = p.gold;
    this.score = p.score;
    this.totalScore = p.totalScore;
    this.roundScores = p.roundScores || [];
    this.jokers = p.jokers || [];
    this.maxJokerSlots = p.maxJokerSlots || 4;
    this.potions = p.potions || [];
    this.potionMode = p.potionMode || null;
    this._prePotionState = p._prePotionState || null;
    this._potionSelectedLetter = p._potionSelectedLetter || null;
    this.crystalEffects = p.crystalEffects || [];
    this.shopItems = p.shopItems || null;
    this.settlementData = p.settlementData || null;
    this.state = p.state || 'playing';

    // 兼容：旧存档 state 为 potion 但没有 potionMode，重置为 playing
    if (this.state === 'potion' && !this.potionMode) {
      this.state = 'playing';
      this._prePotionState = null;
      this._potionSelectedLetter = null;
    }
    this._shuffledSkills = p._shuffledSkills || shuffleSkills([...SKILL_POOL]);
    this.discardsLeft = p.discardsLeft;
    this.handsLeft = p.handsLeft;
    this.hand = p.hand || [];
    this.deck = p.deck || [];
    this.selected = p.selected || [];
    this.baseHandSize = p.baseHandSize || 9;
    this.extraHands = p.extraHands || 0;
    this.extraDiscards = p.extraDiscards || 0;
    this.extraSafety = p.extraSafety || 0;
    this.extraLetters = p.extraLetters || 0;
    this.witchSkillPassed = p.witchSkillPassed !== undefined ? p.witchSkillPassed : true;
    this._witchSkillProtectUsed = p._witchSkillProtectUsed !== undefined ? p._witchSkillProtectUsed : false;
    this._lifeExtensionBonus = p._lifeExtensionBonus || 0;
    this.safetyRounds = p.safetyRounds !== undefined ? p.safetyRounds : 3;
    this.cardBookUnlocked = this.storageManager ? this.storageManager.loadCardBookUnlocked() : false;
    this.cardBookOpen = false;
    this.cardBookPage = 0;
    this._cardBookAnimStartTime = null;
    this._closingCardBook = false;
    this._closeCardBookStartTime = null;
    this._cardBookDetailLevel = null;
    this._closingCardBookDetail = false;
    this._cardBookDetailStartTime = null;
    this._closeCardBookDetailStartTime = null;
    this._cardBookEquipBtnPressed = false;
    this._cardBookCloseBtnPressed = false;
    this._rankCloseBtnPressed = false;
    this._cardBookCellPressed = null;
    this.collectedWitchCards = this.storageManager ? this.storageManager.loadCollectedWitchCards() : [];
    this.equippedWitchCards = this.storageManager ? this.storageManager.loadEquippedWitchCard() : [];
    console.log('[CardBook] 存档恢复加载 collectedWitchCards:', JSON.stringify(this.collectedWitchCards));
    this._newWitchCardThisShop = null;
    this._cardBookIconFlashStart = null;
    this._cardBookNewBadge = false;
    this.gameOverReason = p.gameOverReason || null;
    this.target = p.target;
    this._maxHandSize = p._maxHandSize;
    this._seedMinLen = p._seedMinLen;
    this._seedMaxLen = p._seedMaxLen;
    this._lastInitialLetter = p._lastInitialLetter || null;
    this._lastPlayedLetters = p._lastPlayedLetters ? new Set(p._lastPlayedLetters) : null;

    // 清理卡牌上的动画残留状态（旧的 animOffset 可能导致卡牌飞到屏幕外）
    const sanitizeCard = (card) => {
      if (!card) return;
      delete card.animOffset;
      delete card.selectOffset;
      delete card.jumpOffsetY;
      delete card.newCard;
      delete card._flyIndex;
      delete card._originalScore;
      delete card._scorePulseAnim;
      delete card._scoreScale;
    };
    this.hand.forEach(sanitizeCard);
    this.deck.forEach(sanitizeCard);

    // 清理女巫牌上的动画残留状态
    (this.jokers || []).forEach(j => {
      if (!j) return;
      delete j._triggered;
      delete j._jumpOffsetY;
      delete j._shieldAnimStart;
      delete j._letterGodAnimStart;
      delete j._destroying;
      delete j._destroyStart;
      delete j._wwJumpStart;
      delete j._wwJumpDone;
      delete j._ruleBreakerFlash;
      // 恢复禁用状态由 resetRound 逻辑处理，但恢复时也统一清理
      if (j._disabled === undefined) j._disabled = false;
    });

    // 同步 selected 数组：移除 hand 中不存在的 id，同步卡牌的 selected 字段
    const handIds = new Set(this.hand.filter(Boolean).map(c => c.id));
    this.selected = this.selected.filter(id => handIds.has(id));
    this.hand.forEach(card => {
      if (!card) return;
      card.selected = this.selected.includes(card.id);
    });

    // 同步手牌中卡牌的升级分数（letterUpgrades 已由 storage.loadProgress 恢复）
    this._syncHandCardScores();

    // 恢复引导状态
    this.guidePhase = (p.guidePhase !== undefined) ? p.guidePhase : 0;
    // 恢复商店引导状态
    this.shopGuidePhase = (p.shopGuidePhase !== undefined) ? p.shopGuidePhase : 0;
    if (p._shopGuideStartTime !== undefined) this._shopGuideStartTime = p._shopGuideStartTime;
    if (p._shopGuideTextStartTime !== undefined) this._shopGuideTextStartTime = p._shopGuideTextStartTime;
    // 恢复卡牌图鉴引导状态
    this.cardBookGuidePhase = (p.cardBookGuidePhase !== undefined) ? p.cardBookGuidePhase : 0;
    if (p._cardBookGuideStartTime !== undefined) this._cardBookGuideStartTime = p._cardBookGuideStartTime;
    if (p._cardBookGuideTextStartTime !== undefined) this._cardBookGuideTextStartTime = p._cardBookGuideTextStartTime;
    if (p._cardBookGuideText2StartTime !== undefined) this._cardBookGuideText2StartTime = p._cardBookGuideText2StartTime;
    if (p._cardBookGuideExitStartTime !== undefined) this._cardBookGuideExitStartTime = p._cardBookGuideExitStartTime;

    // 恢复装备女巫卡牌跨回合状态
    if (p._shopDiscountActive !== undefined) this._shopDiscountActive = p._shopDiscountActive;
    if (p._shopDiscountRate !== undefined) this._shopDiscountRate = p._shopDiscountRate;
    if (p._overflowBonus !== undefined) this._overflowBonus = p._overflowBonus;

    // 修复：恢复后清理手牌中的 null 占位符并重新补牌
    if (this.state === 'playing') {
      const validHand = this.hand.filter(Boolean);
      const need = (this._maxHandSize || this.baseHandSize || 9) - validHand.length;
      if (need > 0) {
        // 如果 deck 不够，补充新牌
        if (!this.deck || this.deck.length < need) {
          const extraDeck = createDeck();
          this.deck = this.deck ? [...this.deck, ...extraDeck] : extraDeck;
        }
        const newCards = draw(this.deck, need);
        newCards.forEach(c => {
          c.selected = false;
          c.animOffset = null;
          c.selectOffset = 0;
          c.jumpOffsetY = 0;
          c.newCard = false;
        });
        this.hand = [...validHand, ...newCards];
        this._syncHandCardScores();
        // 确保手牌中有合法单词
        const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
        const excludeLetters = witchSkill && witchSkill.skill === 'no_letter_a' ? ['A'] : [];
        ensureValidWordInHand(this.deck, this.hand, this._seedMinLen, this._seedMaxLen, this._maxHandSize, excludeLetters);
      } else {
        this.hand = validHand;
      }
    }

    console.log('[Game] 从存档恢复，回合:', this.round, '状态:', this.state, '目标分:', this.target);
    console.log('[Game] 恢复 jokers:', JSON.stringify(this.jokers), 'potions:', JSON.stringify(this.potions));

    // 每日单词挑战：恢复时也初始化
    this._initDailyChallenge();
  }

  _syncHandCardScores() {
    this.hand.forEach(card => {
      if (!card) return;
      const baseScore = LETTER_SCORE[card.letter];
      const upgrade = letterUpgrades.get(card.letter);
      if (upgrade) {
        let newScore = baseScore;
        if (upgrade.mult) newScore = Math.floor(newScore * upgrade.mult);
        if (upgrade.add) newScore += upgrade.add;
        card.baseScore = baseScore;
        card.score = newScore;
        card.upgraded = true;
        card.upgradeMult = upgrade.mult || 1;
        card.upgradeAdd = upgrade.add || 0;
      } else {
        card.baseScore = baseScore;
        card.score = baseScore;
        card.upgraded = false;
        card.upgradeMult = 1;
        card.upgradeAdd = 0;
      }
    });

    // 同步牌堆中卡牌的升级分数
    this.deck.forEach(card => {
      if (!card) return;
      const baseScore = LETTER_SCORE[card.letter];
      const upgrade = letterUpgrades.get(card.letter);
      if (upgrade) {
        let newScore = baseScore;
        if (upgrade.mult) newScore = Math.floor(newScore * upgrade.mult);
        if (upgrade.add) newScore += upgrade.add;
        card.baseScore = baseScore;
        card.score = newScore;
        card.upgraded = true;
        card.upgradeMult = upgrade.mult || 1;
        card.upgradeAdd = upgrade.add || 0;
      } else {
        card.baseScore = baseScore;
        card.score = baseScore;
        card.upgraded = false;
        card.upgradeMult = 1;
        card.upgradeAdd = 0;
      }
    });
  }

  // 封装 setTimeout，自动追踪 ID，destroy 时统一清除
  _delay(callback, ms) {
    if (this._destroyed) return null;
    const id = setTimeout(() => {
      const idx = this._timeoutIds.indexOf(id);
      if (idx >= 0) this._timeoutIds.splice(idx, 1);
      if (!this._destroyed) callback();
    }, ms);
    this._timeoutIds.push(id);
    return id;
  }

  _clearAllTimeouts() {
    this._timeoutIds.forEach(id => clearTimeout(id));
    this._timeoutIds = [];
  }

  destroy() {
    this._destroyed = true;
    this._clearAllTimeouts();
    // 清理 storageManager 的防抖定时器，防止实例销毁后仍触发保存
    if (this.storageManager && this.storageManager._saveTimer) {
      clearTimeout(this.storageManager._saveTimer);
      this.storageManager._saveTimer = null;
    }
    if (this.audioManager) {
      this.audioManager.destroy();
      this.audioManager = null;
    }
    if (this.animManager) {
      this.animManager.clear();
    }
  }

  resetRound() {
    // 上报：回合开始
    if (typeof wx !== 'undefined' && wx.reportEvent) {
      wx.reportEvent("round_start", {
        "round": this.round
      });
    }

    wordCheckState.clear();
    this.pendingCheck = null;

    // 根据女巫技能设置保底词长度
    const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (witchSkill && witchSkill.skill === 'force_letter_3') {
      this._seedMinLen = 3;
      this._seedMaxLen = 3;
    } else if (witchSkill && witchSkill.skill === 'force_letter_4') {
      this._seedMinLen = 4;
      this._seedMaxLen = 4;
    } else {
      this._seedMinLen = 3;
      this._seedMaxLen = 6;
    }

    this.deck = createDeck();
    // no_letter_a：牌堆中排除指定字母
    const excludeLetters = witchSkill && witchSkill.skill === 'no_letter_a' ? ['A'] : [];
    if (excludeLetters.length > 0) {
      this.deck = this.deck.filter(c => !excludeLetters.includes(c.letter));
    }
    this.target = calcBaseTarget(this.round);
    if (this._lifeExtensionBonus) {
      this.target += this._lifeExtensionBonus;
      this._lifeExtensionBonus = 0;
    }
    this._reduceTargetAnim = null;
    applyCrystalEffects(this);
    const handSize = this.baseHandSize + (this.extraLetters || 0);
    this._maxHandSize = handSize;

    // 学习模式：从10个新词中随机选1个未学习的，作为种子词传入 drawWithSafety
    let dailyWord = null;
    if (this.settings && this.settings.dailyWordChallengeEnabled && this.dailyChallenge && this.dailyChallenge.words && this.dailyChallenge.words.length > 0) {
      const collected = this.dailyChallenge.collected || [];
      const words = this.dailyChallenge.words.filter(item => {
        const w = typeof item === 'string' ? item : item.word;
        return !collected.includes(w.toLowerCase());
      });
      if (words.length > 0) {
        const randomItem = words[Math.floor(Math.random() * words.length)];
        dailyWord = typeof randomItem === 'string' ? randomItem : randomItem.word;
      }
    }

    this.hand = drawWithSafety(this.deck, handSize, this.round, this.safetyRounds + this.extraSafety, this._seedMinLen, this._seedMaxLen, excludeLetters, dailyWord);

    this.selected = [];
    this.score = 0;
    // 格莱薇妮娅：下回合初始分加上溢出加成（延迟500ms后更新，让HUD先显示0再做缩放动画）
    if (this._overflowBonus > 0) {
      const bonus = this._overflowBonus;
      this._overflowBonus = 0;
      setTimeout(() => {
        this.score = bonus;
        if (this.storageManager) this.storageManager.saveProgress();
      }, 500);
      console.log('[EquippedSkill] score_overflow will apply after 500ms, bonus:', bonus);
    }
    this.handsLeft = 4 + this.extraHands;
    this.discardsLeft = 3 + this.extraDiscards;
    // 应用装备的女巫卡牌回合技能
    this._applyEquippedCardBonus('round');
    this.extraHands = 0;
    this.extraDiscards = 0;
    this.extraSafety = 0;
    this.extraLetters = 0;
    this.witchSkillPassed = true;
    this._illegalWordShieldUsed = 0;
    this._witchSkillProtectUsed = 0;
    this._witchDetailPopup = null;
    this._hudWitchPopup = null;
    this._lastPlayedLetters = null; // 新回合开始，清除上一手字母记录
    // 清除所有女巫牌的动画状态，防止上一回合的动画残留
    (this.jokers || []).forEach(j => {
      if (j) {
        j._triggered = false;
        j._jumpOffsetY = 0;
        j._shieldAnimStart = null;
        j._letterGodAnimStart = null;
        j._destroying = false;
        j._destroyStart = null;
        j._wwJumpStart = null;
        j._wwJumpDone = false;
        j._ruleBreakerFlash = false;
        // 预言家：回合开始时随机预言一个字母
        if (j.trigger === 'predicted_letter') {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
          j._predictedLetter = letters[Math.floor(Math.random() * letters.length)];
        }
      }
    });

    // disable_one_witch_card：回合开始时随机禁用1张女巫牌（延迟1秒播放边框动画）
    const disableSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (disableSkill && disableSkill.skill === 'disable_one_witch_card' && this.jokers && this.jokers.length > 0) {
      const validJokers = this.jokers.filter(j => j);
      if (validJokers.length > 0) {
        this.jokers.forEach(j => { if (j) j._disabled = false; });
        const target = validJokers[Math.floor(Math.random() * validJokers.length)];
        target._disabled = true;
        this._disableWitchAnim = { startTime: Date.now() + 1000, jokerIndex: this.jokers.indexOf(target) };
      }
    } else {
      (this.jokers || []).forEach(j => { if (j) j._disabled = false; });
      this._disableWitchAnim = null;
    }

    // === 争分夺秒：每回合开始时重置，由 applyCrystalEffects 重新激活 ===
    this._hastePlayActive = false;
    this._hastePlayStartTime = null;

    // 第一回合触发新手引导（Phase 1 带入场延迟：1s全亮 → 500ms渐暗 → UI出现）
    if (this.round === 1 && (this.guidePhase === 0 || this.guidePhase === undefined)) {
      this.guidePhase = 1;
      this._guideOverlayStartTime = Date.now();
    }

    // 第2回合后台按需下载商店引导帧序列（witch_guide_3），避免进入商店时等待
    if (this.round === 2 && this.shopGuidePhase === 0) {
      if (this.cloudStorage && this.renderer) {
        this.cloudStorage.preloadGuideGroup(3, this.renderer).catch(err => {
          console.error('[ShopGuide] 按需下载 witch_guide_3 失败:', err);
        });
      }
    }

    // 第3回合后台按需下载卡牌图鉴引导帧序列（witch_guide_4）
    if (this.round === 3 && this.cardBookGuidePhase === 0) {
      if (this.cloudStorage && this.renderer) {
        this.cloudStorage.preloadGuideGroup(4, this.renderer).catch(err => {
          console.error('[CardBookGuide] 按需下载 witch_guide_4 失败:', err);
        });
      }
    }

    this.state = 'playing';
  }

  // 按需预加载当前回合和下一回合的女巫头像与卡牌
  _preloadWitchAvatars() {
    if (!this.cloudStorage || !this.renderer) return;

    // 当前回合（存档恢复时可能需要兜底下载）
    const currentSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (currentSkill && currentSkill.skill) {
      this.cloudStorage.preloadWitchAvatarForLevel(currentSkill.level, this.renderer);
      this.cloudStorage.preloadWitchCardForLevel(currentSkill.level, this.renderer);
    }

    // 下一回合（后台提前下载）
    const nextSkill = getSkillForLevel(this.round + 1, this._shuffledSkills);
    if (nextSkill && nextSkill.skill) {
      this.cloudStorage.preloadWitchAvatarForLevel(nextSkill.level, this.renderer);
      this.cloudStorage.preloadWitchCardForLevel(nextSkill.level, this.renderer);
    }
  }

  advanceGuide() {
    if (this.guidePhase < 1 || this.guidePhase > 4) return;

    // 阶段3特殊处理：给 has_vowel 卡牌
    if (this.guidePhase === 3) {
      // 如果还没给过，插入 has_vowel 女巫牌
      const hasVowel = this.jokers.find(j => j && j.trigger === 'has_vowel');
      if (!hasVowel) {
        const gift = SHOP_POOL.witch.find(w => w.trigger === 'has_vowel');
        if (gift) {
          this.jokers.push({ ...gift, _guideGift: true });
          if (this.storageManager) this.storageManager.saveProgress();
        }
      }
    }

    this.guidePhase++;
    this._guideTextStartTime = Date.now();
    this._guideSkipTyping = false;
    this._guideTapTime = null;

    // 阶段5（完成）：先触发退场动画，再清理引导状态
    if (this.guidePhase >= 5) {
      this.guidePhase = 5;
      this._guideExitStartTime = Date.now();
      this._guideTextStartTime = null;
      this._guideCardGiftStartTime = null;
    }

    if (this.storageManager) {
      this.storageManager.saveProgress();
      // 引导完成时单独持久化，防止游戏结束后 clearProgress 丢失
      if (this.guidePhase >= 5) {
        this.storageManager.saveGuidePhase(this.guidePhase);
      }
    }
  }

  advanceShopGuide() {
    if (this.shopGuidePhase < 1 || this.shopGuidePhase > 2) return;

    this.shopGuidePhase++;
    this._shopGuideSkipTyping = false;
    this._shopGuideTapTime = null;

    if (this.shopGuidePhase === 2) {
      this._shopGuideTextStartTime = Date.now();
    }

    // 阶段3（退场）：触发退场动画
    if (this.shopGuidePhase >= 3) {
      this.shopGuidePhase = 3;
      this._shopGuideExitStartTime = Date.now();
      this._shopGuideTextStartTime = null;
    }

    if (this.storageManager) {
      this.storageManager.saveProgress();
      if (this.shopGuidePhase >= 4) {
        this.storageManager.saveShopGuidePhase(this.shopGuidePhase);
      }
    }
  }

  advanceCardBookGuide() {
    if (this.cardBookGuidePhase < 1 || this.cardBookGuidePhase > 2) return;

    this.cardBookGuidePhase++;
    this._cardBookGuideSkipTyping = false;
    this._cardBookGuideTapTime = null;

    if (this.cardBookGuidePhase === 2) {
      this._cardBookGuideText2StartTime = Date.now();
    }

    // Phase 3（退场）：触发退场动画
    if (this.cardBookGuidePhase >= 3) {
      this.cardBookGuidePhase = 3;
      this._cardBookGuideExitStartTime = Date.now();
    }

    if (this.storageManager) {
      this.storageManager.saveProgress();
      if (this.cardBookGuidePhase >= 4) {
        this.storageManager.saveCardBookGuidePhase(this.cardBookGuidePhase);
      }
    }
  }

  toggleSelect(cardId) {
    // 如果有非法提示或女巫约束失败提示，先清除
    if (this.pendingCheck && (this.pendingCheck.state === 'invalid' || this.pendingCheck.state === 'witch_failed')) {
      this.pendingCheck = null;
    }
    // 清除字母置换提示
    if (this._changeLetterHint) {
      this._changeLetterHint = null;
    }
    // 清除字母跳跃偏移
    this.hand.forEach(c => { if (c) c.jumpOffsetY = 0; });
    const idx = this.selected.indexOf(cardId);
    const card = this.hand.find(c => c && c.id === cardId);
    if (!card) return;
    // 点击字母卡牌音效
    if (this.audioManager) this.audioManager.play('card_placement');
    if (idx >= 0) {
      this.selected.splice(idx, 1);
      card.selected = false;
      if (this.animManager) this.animManager.cardDeselect(card);
    } else {
      if (this.selected.length >= 9) return;
      this.selected.push(cardId);
      card.selected = true;
      if (this.animManager) this.animManager.cardSelect(card);
    }
  }

  showHint() {
    const words = findAllValidWordsInHand(this.hand);
    if (words.length === 0) {
      this.hintToast = { text: '没有可组成的单词', expireAt: Date.now() + 2000, startTime: Date.now() };
      return;
    }
    const topWords = words.slice(0, 10);
    const lines = [`提示：${words.length} 个合法单词`];
    topWords.forEach((w, i) => {
      lines.push(`${i + 1}. ${w.word.toUpperCase()} (${w.cards.length}牌 ${w.score}分)`);
    });
    if (words.length > 10) lines.push('...');
    this.hintToast = { text: lines.join('\n'), expireAt: Date.now() + 2000, startTime: Date.now() };
  }

  async playHand() {
    if (this.selected.length < 2 || this.pendingCheck) return { valid: false };

    // 争分夺秒 20 秒过期检查
    if (this._hastePlayActive && this._hastePlayStartTime && Date.now() - this._hastePlayStartTime > 20000) {
      this._hastePlayActive = false;
    }

    const played = this.hand.filter(c => c && c.selected);
    const playedInOrder = this.getSelectedCards();
    const word = playedInOrder.map(c => c.letter.toLowerCase()).join('');

    // 重置动画完成标志
    this._playHandAnimCompleted = false;
    this._playHandCompleting = false;

    // 设置检测中状态
    this.pendingCheck = {
      word,
      cards: played,
      cardsInOrder: playedInOrder,
      state: 'checking',
      startTime: Date.now(),
      result: null,
      meaning: null,
      resolveTime: null,
    };

    let valid = isValidWord(word);
    if (!valid) valid = await isValidWordOnline(word);

    // 实例已销毁（如 restart），立即停止后续逻辑
    if (this._destroyed) return { valid: false };

    // === end_ed / end_s 变形单词校验（主单词合法后才校验） ===
    const endEdJoker = (this.jokers || []).find(j => j && j.trigger === 'end_ed' && !j._disabled);
    const endSJoker = (this.jokers || []).find(j => j && j.trigger === 'end_s' && !j._disabled);
    if (endEdJoker || endSJoker) {
      const lowerWord = word.toLowerCase();
      const edPromise = endEdJoker
        ? (isValidWord(lowerWord + 'ed') ? Promise.resolve(true) : isValidWordOnline(lowerWord + 'ed'))
        : Promise.resolve(false);
      const sPromise = endSJoker
        ? (isValidWord(lowerWord + 's') ? Promise.resolve(true) : isValidWordOnline(lowerWord + 's'))
        : Promise.resolve(false);
      const [edValid, sValid] = await Promise.all([edPromise, sPromise]);
      this.pendingCheck.endEdValid = edValid;
      this.pendingCheck.endSValid = sValid;
    }

    if (!valid) {
      this.pendingCheck.state = 'invalid';
      this.pendingCheck.resolveTime = Date.now();
      if (this.audioManager) this.audioManager.play('card_illegal');

      // 勇敢试错：每次非法单词倍率 +1；若同时触发容错咒文，不生效
      const hasShield = (this.jokers || []).some(j => j.trigger === 'shield_illegal');
      (this.jokers || []).forEach(j => {
        if (j.trigger === 'illegal_boost' && !hasShield) {
          j.value = (j.value || 0) + 1;
        }
      });

      // 检查是否有"出现非法单词，游戏结束"的女巫技能
      const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
      if (witchSkill && witchSkill.skill === 'forbid_illegal_words' && !this._ruleBreakerAvailable) {
        this.hintToast = { text: '单词不存在 + 女巫诅咒触发！', expireAt: Date.now() + 2000, startTime: Date.now() };
        this._delay(() => {
          this.state = 'gameover';
          this.gameOverReason = 'forbidden_word';
          if (this.audioManager) this.audioManager.play('game_over');
          if (this.storageManager) {
            this.storageManager.setHighScore(this.totalScore);
            this.storageManager.setBestRound(this.round);
            uploadScoreAndRound(this.storageManager.getHighScore(), this.storageManager.getBestRound());
            this.storageManager.updateStats(this);
            this.storageManager.clearProgress();
          }
        }, 1000);
        if (this.storageManager) this.storageManager.saveProgress();
        return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
      }

      // 检查是否有"容错咒文"女巫牌（非法单词不扣出牌次数）
      const shieldJoker = (this.jokers || []).find(j => j.trigger === 'shield_illegal');
      if (shieldJoker) {
        // 触发容错咒文动画：跳跃 + 紫色光晕
        shieldJoker._triggered = true;
        shieldJoker._shieldAnimStart = Date.now();
      } else {
        // 检查装备卡牌：喀薇娅 - 非法单词保护（每张提供1次，可叠加）
        let shieldCount = 0;
        for (const level of this.equippedWitchCards || []) {
          const eqCard = WITCH_CARDS.find(c => c.card_id === `witch_card_${level}`);
          if (eqCard && eqCard.card_skill_name === 'illegal_words_one') shieldCount++;
        }
        if (shieldCount > this._illegalWordShieldUsed) {
          this._illegalWordShieldUsed++;
          console.log('[EquippedSkill] illegal_words_one shielded illegal word, used:', this._illegalWordShieldUsed, 'total:', shieldCount);
        } else if (!this._hastePlayActive) {
          this.handsLeft--;
        }
      }
      if (this.handsLeft <= 0) {
        const triggered = this._checkLifeExtension();
        if (!triggered) {
          // 延迟 1.5 秒进入 gameover，让玩家先看到"单词不存在"提示
          this._delay(() => {
            this.state = 'gameover';
            this.gameOverReason = 'out_of_hands';
            if (this.audioManager) this.audioManager.play('game_over');
            if (this.storageManager) {
              this.storageManager.setHighScore(this.totalScore);
              this.storageManager.setBestRound(this.round);
              uploadScoreAndRound(this.storageManager.getHighScore(), this.storageManager.getBestRound());
              this.storageManager.updateStats(this);
              this.storageManager.clearProgress();
            }
          }, 1500);
        }
      }
      if (this.storageManager) this.storageManager.saveProgress();
      return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
    }

    // 获取所有装备卡牌技能名
    const equippedCardSkills = [];
    for (const level of this.equippedWitchCards || []) {
      const card = WITCH_CARDS.find(c => c.card_id === `witch_card_${level}`);
      if (card) equippedCardSkills.push(card.card_skill_name);
    }

    // === 女巫技能约束检查 ===
    const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (witchSkill) {
      // 装备卡牌：艾莉瑟瑞丝 - 有女巫的回合首次出牌跳过约束检查（多张叠加次数）
      const protectCount = equippedCardSkills.filter(s => s === 'witch_skill_protect').length;
      if (protectCount > this._witchSkillProtectUsed) {
        this._witchSkillProtectUsed++;
        console.log('[EquippedSkill] witch_skill_protect skipped skill check, used:', this._witchSkillProtectUsed, 'total:', protectCount);
        // 跳过约束检查，witchSkillPassed 保持 true
      } else if (!checkSkill(witchSkill.skill, this, playedInOrder)) {
        this.witchSkillPassed = false;
        this.pendingCheck.state = 'witch_failed';
        this.pendingCheck.resolveTime = Date.now();
        this.pendingCheck.witchFailText = getSkillFailText(witchSkill.skill);
        this.pendingCheck._witchFailAnimStart = Date.now();
        this._witchStarBurstAuto = true; // 触发 HUD 女巫头像星星动画
        if (this.audioManager) this.audioManager.play('card_illegal');
        if (witchSkill.angry_tip) {
          this._witchAngryTip = { text: witchSkill.angry_tip, expireAt: Date.now() + 4000 };
        }
        if (!this._hastePlayActive) {
          this.handsLeft--;
        }
        if (this.handsLeft <= 0) {
          const triggered = this._checkLifeExtension();
          if (!triggered) {
            this._delay(() => {
              this.state = 'gameover';
              this.gameOverReason = 'out_of_hands';
              if (this.audioManager) this.audioManager.play('game_over');
              if (this.storageManager) {
                this.storageManager.setHighScore(this.totalScore);
                this.storageManager.setBestRound(this.round);
                uploadScoreAndRound(this.storageManager.getHighScore(), this.storageManager.getBestRound());
                this.storageManager.updateStats(this);
                this.storageManager.clearProgress();
              }
            }, 1500);
          }
        }
        if (this.storageManager) this.storageManager.saveProgress();
        return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
      }
    }

    // === 字母之神触发（limit 型女巫牌，优先处理）===
    const letterGod = (this.jokers || []).find(j => j.type === 'witch' && j.scope === 'limit' && j.trigger === 'letter_god' && !j._disabled);
    let letterGodTriggered = false;
    if (letterGod && (letterGod.usesLeft === undefined || letterGod.usesLeft > 0)) {
      letterGodTriggered = true;
      // 递减剩余次数
      letterGod.usesLeft = (letterGod.usesLeft === undefined ? letterGod.limit : letterGod.usesLeft) - 1;
      letterGod._triggered = true;
      letterGod._letterGodAnimStart = Date.now();
      // 保存原始分数，实际分数立即更新为最高分（供 calcWordScore 使用）
      const maxScore = Math.max(...played.map(c => c.score));
      const maxCard = played.find(c => c.score === maxScore) || played[0];
      played.forEach(c => {
        if (c._originalScore === undefined) c._originalScore = c.score;
        c.score = maxScore;
      });
      // 设置字母之神动画状态，由 renderer 播放星星飞行动画
      this._letterGodAnim = {
        startTime: Date.now() + 1000, // 延迟1秒，等烟花放完后再开始
        maxCardId: maxCard.id,
        playedCardIds: played.map(c => c.id),
      };
      if (this.storageManager) this.storageManager.saveProgress();
    }

    const result = calcWordScore(playedInOrder, this.jokers, this.pendingCheck, equippedCardSkills, this._lastPlayedLetters);

    // === 以小博大（最后一次出牌且不满4字母，20%概率倍率+8） ===
    const lastPrayer = (this.jokers || []).find(j => j && j.type === 'witch' && j.scope === 'whole_word' && j.trigger === 'last_chance' && !j._disabled);
    let lastPrayerResult = null;
    if (lastPrayer && this.handsLeft === 1 && playedInOrder.length < 4) {
      const success = Math.random() < 0.2;
      const boostValue = 8;
      if (success) {
        result.mult += boostValue;
        result.score = Math.ceil(result.base * result.mult);
      }
      lastPrayerResult = {
        success,
        jokerIndex: this.jokers.indexOf(lastPrayer),
        value: boostValue,
      };
    }

    // === letter_X_mult_half 惩罚检测（通用） ===
    const currentWitchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    this.pendingCheck.multHalfResult = applyLetterMultHalf(currentWitchSkill, playedInOrder, result);

    this.pendingCheck.letterGodTriggered = letterGodTriggered;
    this.pendingCheck.letterGodIndex = letterGodTriggered ? this.jokers.indexOf(letterGod) : -1;
    this.pendingCheck.lastPrayerResult = lastPrayerResult;
    this.pendingCheck.state = 'valid';
    this.pendingCheck.result = result;
    this.pendingCheck.meaning = getWordMeaning(word);
    // 始终设置 resolveTime 和 animPhase = 0（烟花立即开始）
    this.pendingCheck.resolveTime = Date.now();
    this.pendingCheck.animPhase = 0;

    // === 首领连击：连续打出首字母相同的单词，本牌倍率累加+3；中断后重置 ===
    const currentInitial = playedInOrder[0]?.letter;
    if (currentInitial) {
      (this.jokers || []).forEach(j => {
        if (j && j.trigger === 'initial_succession') {
          if (this._lastInitialLetter === currentInitial) {
            j.value = (j.value || 0) + 3;
          } else {
            j.value = 0;
          }
        }
      });
      this._lastInitialLetter = currentInitial;
    }

    // 计算每个字母跳跃时触发的女巫牌索引（scope === 'per_card'）
    const jokers = this.jokers || [];
    const jokerTriggers = [];
    for (let i = 0; i < playedInOrder.length; i++) {
      const card = playedInOrder[i];
      const triggered = [];
      for (let j = 0; j < jokers.length; j++) {
        const joker = jokers[j];
        if (!joker || joker._disabled) continue;
        if (joker.type !== 'witch' || joker.scope !== 'per_card') continue;
        if (_matchCardTrigger(card, joker.trigger, i, joker)) triggered.push(j);
      }
      jokerTriggers.push(triggered);
    }
    // 始终生效的女巫牌（flat_bonus），在字母跳跃阶段就显示紫色边框
    const globalTriggered = [];
    for (let j = 0; j < jokers.length; j++) {
      const joker = jokers[j];
      if (!joker || joker._disabled) continue;
      if (joker.type !== 'witch') continue;
      if (joker.scope === 'flat_bonus') {
        globalTriggered.push(j);
      }
    }
    // 构建 perCardSteps：每张 per_card 对应一次独立的字母跳跃步骤
    const perCardSteps = [];
    for (let i = 0; i < playedInOrder.length; i++) {
      const triggered = jokerTriggers[i] || [];
      if (triggered.length === 0) {
        perCardSteps.push({ cardIdx: i, jokerIdx: null });
      } else {
        triggered.forEach(jIdx => {
          perCardSteps.push({ cardIdx: i, jokerIdx: jIdx });
        });
      }
    }
    // 装备卡牌：德莱薇尔 - 最后一个字母额外跳跃（每张叠加一次动画）
    const doubleCount = equippedCardSkills.filter(s => s === 'last_letter_double').length;
    if (doubleCount > 0 && playedInOrder.length > 0) {
      const lastIdx = playedInOrder.length - 1;
      const lastTriggered = jokerTriggers[lastIdx] || [];
      const lastJokerIdx = lastTriggered.length > 0 ? lastTriggered[lastTriggered.length - 1] : null;
      for (let i = 0; i < doubleCount; i++) {
        perCardSteps.push({ cardIdx: lastIdx, jokerIdx: lastJokerIdx, isDouble: true });
      }
    }
    this.pendingCheck.perCardSteps = perCardSteps;
    this.pendingCheck.jokerTriggers = jokerTriggers;
    this.pendingCheck.globalTriggered = globalTriggered;

    // 预处理 whole_word 女巫牌（用于 phase 1.5 波浪动画 + phase 2 倍率弹出）
    const wholeWordJokers = [];
    jokers.forEach((joker, idx) => {
      if (!joker || joker._disabled) return;
      if (joker.type === 'witch' && joker.scope === 'whole_word') {
        let matched;
        if (joker.trigger === 'illegal_boost' || joker.operation === 'multi_accumulation') {
          matched = joker.value > 0;
        } else if (joker.trigger === 'end_ed') {
          matched = this.pendingCheck.endEdValid || false;
        } else if (joker.trigger === 'end_s') {
          matched = this.pendingCheck.endSValid || false;
        } else if (joker.trigger === 'no_duplicate') {
          const currentLetters = new Set(playedInOrder.map(c => c.letter.toUpperCase()));
          const lastLetters = this._lastPlayedLetters;
          if (!lastLetters || lastLetters.size === 0) {
            matched = false; // 第一手不触发
          } else {
            matched = !Array.from(currentLetters).some(l => lastLetters.has(l));
          }
        } else {
          matched = _matchWordTrigger(playedInOrder, joker.trigger);
        }
        if (matched) {
          wholeWordJokers.push({ idx, joker });
        } else if (joker.penalty !== undefined) {
          // no_duplicate 第一手不惩罚
          if (joker.trigger === 'no_duplicate') {
            const lastLetters = this._lastPlayedLetters;
            if (lastLetters && lastLetters.size > 0) {
              wholeWordJokers.push({ idx, joker, isPenalty: true });
            }
          } else {
            wholeWordJokers.push({ idx, joker, isPenalty: true });
          }
        }
      }
    });
    // 临死祈祷成功时，追加到 whole_word 列表（动画复用）
    if (lastPrayerResult && lastPrayerResult.success) {
      wholeWordJokers.push({
        idx: lastPrayerResult.jokerIndex,
        joker: { trigger: 'last_chance', value: lastPrayerResult.value }
      });
    }
    this.pendingCheck.wholeWordJokers = wholeWordJokers;

    if (this.audioManager) {
      this.audioManager.play('card_valid');
    }

    // 计分动画由 renderer.js 事件驱动推进，不再使用固定时间轴
    return result;
  }

  _checkLifeExtension() {
    const lifeExtIdx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'life_extension');
    if (lifeExtIdx < 0) return false;
    const joker = this.jokers[lifeExtIdx];
    if (joker.usesLeft !== undefined && joker.usesLeft <= 0) return false;

    const diff = this.target - this.score;
    this._lifeExtensionBonus = diff * 2;
    if (joker.usesLeft !== undefined) joker.usesLeft--;
    if (joker.usesLeft !== undefined && joker.usesLeft <= 0) {
      joker._destroying = true;
      joker._destroyStart = Date.now();
      this._delay(() => {
        const idx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'life_extension');
        if (idx >= 0) this.jokers.splice(idx, 1);
        if (this.storageManager) this.storageManager.saveProgress();
      }, 900);
    }
    this._lifeExtensionAnim = { startTime: Date.now(), jokerIndex: lifeExtIdx, diff };
    this.state = 'life_extended';
    if (this.storageManager) this.storageManager.saveProgress();
    return true;
  }

  completePlayHand() {
    if (this._playHandCompleting) return;
    if (!this.pendingCheck || this.pendingCheck.state !== 'valid') return;
    this._playHandCompleting = true;

    const result = this.pendingCheck.result;
    const played = this.pendingCheck.cards;
    const playedInOrder = this.pendingCheck.cardsInOrder;
    const playedWord = this.pendingCheck.word;
    this._applyScore(result);
    this._executePlayHand(played, playedInOrder, result);

    // 每日单词挑战：检查是否收集到目标词
    if (playedWord) {
      this._checkDailyWordCollect(playedWord);
    }

    // 计分动画结束，更新上一手单词记录
    if (playedInOrder && playedInOrder.length > 0) {
      this._lastPlayedLetters = new Set(playedInOrder.map(c => c.letter.toUpperCase()));
    }

    // 清除 pendingCheck，重置单词预览区
    this.pendingCheck = null;

    // 结算判断
    if (this.score >= this.target) {
      this._showSettlement();
    } else if (this.handsLeft <= 0) {
      const triggered = this._checkLifeExtension();
      if (!triggered) {
        this.state = 'gameover';
        this.gameOverReason = 'out_of_hands';
        if (this.audioManager) this.audioManager.play('game_over');
        if (this.storageManager) {
          this.storageManager.setHighScore(this.totalScore);
          this.storageManager.setBestRound(this.round);
          uploadScoreAndRound(this.storageManager.getHighScore(), this.storageManager.getBestRound());
          this.storageManager.updateStats(this);
          this.storageManager.clearProgress();
        }
      }
    }

    this._playHandCompleting = false;
  }

  _applyScore(result) {
    const score = this.pendingCheck?.multHalfResult?.halvedScore ?? result.score;
    this.score += score;
    this.totalScore += score;
    if (this.audioManager) {
      this._delay(() => {}, 200);
    }
  }

  _executePlayHand(playedCards, playedInOrder, result) {
    // 清除字母跳跃偏移
    this.hand.forEach(c => { if (c) c.jumpOffsetY = 0; });
    // 清除女巫牌触发状态
    (this.jokers || []).forEach(j => {
      if (j) {
        j._triggered = false;
        j._jumpOffsetY = 0;
        j._letterGodAnimStart = null;
        j._wwJumpStart = null;
        j._wwJumpDone = false;
      }
    });

    // 恢复字母之神修改过的卡牌分数，清除视觉过渡状态
    playedCards.forEach(c => {
      if (c && c._originalScore !== undefined) {
        c.score = c._originalScore;
        delete c._originalScore;
      }
      delete c._scorePulseAnim;
    });

    // 检查字母之神是否次数耗尽，触发撕裂自毁动画
    const letterGodIdx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'letter_god');
    if (letterGodIdx >= 0) {
      const letterGod = this.jokers[letterGodIdx];
      if (letterGod.usesLeft !== undefined && letterGod.usesLeft <= 0) {
        letterGod._destroying = true;
        letterGod._destroyStart = Date.now();
        // 延迟从数组中移除（给动画留出 900ms）
        this._delay(() => {
          const idx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'letter_god');
          if (idx >= 0) this.jokers.splice(idx, 1);
          if (this.storageManager) this.storageManager.saveProgress();
        }, 900);
      }
    }

    // 检查争分夺秒是否次数耗尽，触发撕裂自毁动画
    // 争分夺秒已改为水晶球牌，无需自毁逻辑

    // 使用传入的 playedCards 而不是依赖 this.hand 的 selected 状态
    //（防止动画期间 selected 被意外清除导致 finalPlayedCards 为空）
    const finalPlayedCards = playedCards.filter(c => c);
    const removedIndices = [];
    this.hand.forEach((c, i) => {
      if (c && finalPlayedCards.includes(c)) {
        removedIndices.push(i);
      }
    });

    // 旧牌飞出（同时播放洗牌音效）
    if (this.audioManager) this.audioManager.play('card_shuffle');
    finalPlayedCards.forEach((card, i) => {
      card._flyIndex = removedIndices[i];
      card.selected = false;
      this.animManager.flyOut(card, 'left', () => {
        const fi = this.flyingCards.indexOf(card);
        if (fi >= 0) this.flyingCards.splice(fi, 1);
        card._flyIndex = undefined;
      });
    });
    this.flyingCards.push(...finalPlayedCards);
    this.selected = [];

    // 用 null 占位符替换旧牌位置
    this.hand = this.hand.map(c => finalPlayedCards.includes(c) ? null : c);

    // 0.6秒后：把打出的牌放回牌堆底部，然后重新洗牌，再补牌
    this._delay(() => {
      // 1. 打出的牌回到牌堆底部
      for (const card of finalPlayedCards) {
        if (card) this.deck.push(card);
      }
      // 2. 洗牌（防止连续抽到同样的牌）
      this.deck = shuffle([...this.deck]);
      // 3. 从牌堆顶部补牌
      const need = finalPlayedCards.length;
      const validHand = this.hand.filter(Boolean);
      const newCards = drawWithVowelRules(this.deck, validHand, need);

      let newIdx = 0;
      this.hand = this.hand.map(c => {
        if (c === null && newIdx < newCards.length) {
          const nc = newCards[newIdx++];
          nc.newCard = true;
          nc.selectOffset = 0;
          nc.jumpOffsetY = 0;
          nc.animOffset = { x: -200, y: -20, rotation: -20, opacity: 0.4, scale: 0.6 };
          this.animManager.flyIn(nc, 'left', null, 0);
          return nc;
        }
        // 清除保留旧卡牌的各种偏移，避免与新牌位置不对齐
        if (c) {
          c.selectOffset = 0;
          c.jumpOffsetY = 0;
        }
        return c;
      });

      this.hand = this.hand.filter(c => c !== null);
      this.hand.forEach(c => { if (c) c.selected = false; });
      if (this.storageManager) this.storageManager.saveProgress();
    }, 600);

    if (!this._hastePlayActive) {
      this.handsLeft--
    }
    if (this.storageManager) this.storageManager.saveProgress();
  }

  _showSettlement() {
    // 上报：回合通关
    if (typeof wx !== 'undefined' && wx.reportEvent) {
      wx.reportEvent("round_pass", {
        "round": this.round
      });
    }

    if (this.audioManager) this.audioManager.play('round_win');
    let baseGold = 4;
    // 装备卡结算加成（多张叠加）
    let coinBonus = 0;
    let handPenalty = 0;
    let discountCount = 0;
    let overflowCount = 0;
    for (const level of this.equippedWitchCards || []) {
      const cardConfig = WITCH_CARDS.find(c => c.card_id === `witch_card_${level}`);
      if (!cardConfig) continue;
      switch (cardConfig.card_skill_name) {
        case 'each_round_coin_plus1':
          coinBonus += 1;
          break;
        case 'each_round_hand_plus1':
          handPenalty += 2;
          break;
        case 'shop_discount':
          discountCount++;
          break;
        case 'score_overflow':
          overflowCount++;
          break;
      }
    }
    baseGold += coinBonus - handPenalty;
    if (discountCount > 0 && this.score >= this.target * 1.3) {
      // 每张额外折扣40%，最低2折
      this._shopDiscountActive = true;
      this._shopDiscountRate = Math.max(0.2, 1 - 0.4 * discountCount);
      console.log('[EquippedSkill] shop_discount activated, count:', discountCount, 'rate:', this._shopDiscountRate, 'score:', this.score, 'target:', this.target);
    }
    if (overflowCount > 0) {
      const overflow = this.score - this.target;
      if (overflow > 0) {
        this._overflowBonus = Math.round(overflow * 0.1 * overflowCount);
        console.log('[EquippedSkill] score_overflow bonus:', this._overflowBonus, 'overflow:', overflow, 'count:', overflowCount);
      }
    }
    const extraHands = this.handsLeft * 2;
    const extraDiscards = this.discardsLeft * 1;
    const totalGold = baseGold + extraHands + extraDiscards;

    // 女巫技能信息（奖励在 witch_reward 阶段根据概率发放）
    const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    const hasWitchReward = witchSkill && this.witchSkillPassed;

    this.settlementData = {
      baseGold,
      extraHands,
      extraDiscards,
      totalGold,
      round: this.round,
      witchSkill: hasWitchReward ? witchSkill : null,
    };
    this.state = 'settlement';

    // 上报最高通关回合数（fire-and-forget）
    try {
      wx.cloud.callFunction({
        name: 'updateBestRound',
        data: { round: this.round }
      }).then(res => {
        console.log('[UpdateBestRound] 云函数返回:', res.result);
      }).catch(err => {
        console.error('[UpdateBestRound] 云函数调用失败:', err);
      });
    } catch (e) {
      console.error('[UpdateBestRound] 上报异常:', e);
    }

    if (this.storageManager) this.storageManager.saveProgress();
  }

  _checkCardBookUnlock() {
    if (this.round >= 3 && !this.cardBookUnlocked) {
      this.cardBookUnlocked = true;
      if (this.storageManager) this.storageManager.saveCardBookUnlocked(true);
    }

    // 收集本回合的女巫卡牌
    const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (witchSkill && witchSkill.level) {
      const level = witchSkill.level;
      if (!this.collectedWitchCards.includes(level)) {
        this.collectedWitchCards.push(level);
        console.log('[CardBook] 收集新卡 level=' + level + ', 当前:', JSON.stringify(this.collectedWitchCards));
        this._newWitchCardThisShop = level;
        this._cardBookIconFlashStart = Date.now();
        this._cardBookNewBadge = false;
        setTimeout(() => {
          this._cardBookNewBadge = true;
        }, 2000);
        if (this.storageManager) {
          const ok = this.storageManager.saveCollectedWitchCards(this.collectedWitchCards);
          if (!ok) {
            console.error('[CardBook] 保存验证失败，尝试重试');
            this.storageManager.saveCollectedWitchCards(this.collectedWitchCards);
          }
        }
      } else {
        console.log('[CardBook] 重复收集检查 level=' + level + ', 当前已有:', JSON.stringify(this.collectedWitchCards));
      }
    }
  }

  claimSettlement() {
    if (!this.settlementData) return;
    this.gold += this.settlementData.totalGold;
    // settlementData 暂时保留用于 closing 动画，200ms 后再处理
    this._closingSettlement = true;
    this._closeStartTime = Date.now();
    this._delay(() => {
      const witchSkill = this.settlementData ? this.settlementData.witchSkill : null;
      this.settlementData = null;
      this._closingSettlement = false;
      if (witchSkill) {
        // 进入女巫奖励阶段
        this.witchRewardData = {
          skill: witchSkill,
          phase: 'gift',
          giftStartTime: Date.now(),
          startTime: Date.now(),
          result: null,
          rewardItem: null,
        };
        this.state = 'witch_reward';
      } else {
        // 进入商店前取消所有女巫牌禁用状态
        (this.jokers || []).forEach(j => { if (j) j._disabled = false; });
        this._disableWitchAnim = null;
        this.state = 'shop';
        this._checkCardBookUnlock();
        this.shopItems = generateShopItems(this);
        if (this.storageManager) this.storageManager.saveProgress();
      }
    }, 200);
  }

  resolveWitchReward() {
    if (!this.witchRewardData || this.witchRewardData.phase !== 'gift') return;
    const skill = this.witchRewardData.skill;
    const rate = skill.rate || 1;
    const hit = Math.random() < rate;
    this.witchRewardData.result = hit;
    if (hit) {
      this.witchRewardData.rewardItem = createRewardItem(skill.reward);
    } else if (rate < 1) {
      // 鼓励奖：随机 1~5 金币
      const bonusGold = Math.floor(Math.random() * 5) + 1;
      this.witchRewardData.consolationGold = bonusGold;
      this.gold += bonusGold;
    }
    if (this.audioManager) this.audioManager.play('buy_success');
    this.witchRewardData.phase = 'result';
  }

  closeWitchReward(action) {
    this._closingWitchReward = true;
    this._closeWitchRewardStartTime = Date.now();
    this._delay(() => {
      const data = this.witchRewardData;
      this.witchRewardData = null;
      this._closingWitchReward = false;

      switch (action) {
        case 'ok':
          if (data && data.rewardItem) {
            if (data.rewardItem.effect === 'extra_hand') {
              this.extraHands += 1;
            } else if (data.rewardItem.effect === 'extra_letter') {
              this.baseHandSize += 1;
            } else if (data.rewardItem.effect === 'extra_witch_slot') {
              this.maxJokerSlots = (this.maxJokerSlots || 4) + 1;
            } else if (data.rewardItem.effect === 'double_coin') {
              this.gold *= 2;
            } else if (data.rewardItem.effect === 'shop_discount_5') {
              this._shopDiscountActive = true;
              this._shopDiscountRate = 0.5;
            }
          }
          // 进入商店前取消所有女巫牌禁用状态
          (this.jokers || []).forEach(j => { if (j) j._disabled = false; });
          this._disableWitchAnim = null;
          this.state = 'shop';
          this._checkCardBookUnlock();
          this.shopItems = generateShopItems(this);
          if (this.storageManager) this.storageManager.saveProgress();
          break;
        case 'stash':
          if (data && data.rewardItem) {
            if (!this.potions) this.potions = [];
            if (this.potions.length < 2) {
              this.potions.push({ ...data.rewardItem });
            }
          }
          // 进入商店前取消所有女巫牌禁用状态
          (this.jokers || []).forEach(j => { if (j) j._disabled = false; });
          this._disableWitchAnim = null;
          this.state = 'shop';
          this._checkCardBookUnlock();
          this.shopItems = generateShopItems(this);
          if (this.storageManager) this.storageManager.saveProgress();
          break;
        case 'use':
          if (data && data.rewardItem) {
            this.potionMode = { ...data.rewardItem };
            this._prePotionState = 'shop';
            this.state = 'potion';
            if (this.storageManager) this.storageManager.saveProgress();
          }
          break;
      }
    }, 200);
  }

  discard() {
    if (this.discardsLeft <= 0 || this.selected.length === 0) return false;
    
    if (this.audioManager) this.audioManager.play('card_shuffle');
    
    const removedIndices = [];
    const discardedCards = [];
    this.hand.forEach((c, i) => { 
      if (c && c.selected) {
        removedIndices.push(i);
        discardedCards.push(c);
      }
    });

    // 旧牌飞出
    discardedCards.forEach((card, i) => {
      card._flyIndex = removedIndices[i];
      card.selected = false;
      this.animManager.flyOut(card, 'left', () => {
        const fi = this.flyingCards.indexOf(card);
        if (fi >= 0) this.flyingCards.splice(fi, 1);
        card._flyIndex = undefined;
      });
    });
    this.flyingCards.push(...discardedCards);
    this.selected = [];

    // 用 null 占位符替换旧牌位置（其他牌索引完全不动）
    this.hand = this.hand.map(c => discardedCards.includes(c) ? null : c);

    // 1秒后：把弃掉的牌放回牌堆底部，然后重新洗牌，再补牌
    this._delay(() => {
      // 1. 弃掉的牌回到牌堆底部
      for (const card of discardedCards) {
        if (card) this.deck.push(card);
      }
      // 2. 洗牌
      this.deck = shuffle([...this.deck]);

      // 赫丝佩瑞丝：弃牌后补入的字母排除原弃牌字母
      const discardedLetters = discardedCards.map(c => c.letter);
      const hasOutCardDifferent = (this.equippedWitchCards || []).some(l => l === 21);
      if (hasOutCardDifferent) {
        this.deck = this.deck.filter(c => !discardedLetters.includes(c.letter));
        const need = discardedCards.length;
        if (this.deck.length < need) {
          const extraDeck = createDeck();
          const filteredExtra = extraDeck.filter(c => !discardedLetters.includes(c.letter));
          this.deck = [...this.deck, ...filteredExtra];
        }
      }

      // 3. 从牌堆顶部补牌
      const need = discardedCards.length;
      const validHand = this.hand.filter(Boolean);
      const newCards = drawWithVowelRules(this.deck, validHand, need);

      let newIdx = 0;
      this.hand = this.hand.map(c => {
        if (c === null && newIdx < newCards.length) {
          const nc = newCards[newIdx++];
          nc.newCard = true;
          nc.selectOffset = 0;
          nc.jumpOffsetY = 0;
          nc.animOffset = { x: -200, y: -20, rotation: -20, opacity: 0.4, scale: 0.6 };
          this.animManager.flyIn(nc, 'left', null, 0);
          return nc;
        }
        // 清除保留旧卡牌的各种偏移，避免与新牌位置不对齐
        if (c) {
          c.selectOffset = 0;
          c.jumpOffsetY = 0;
        }
        return c;
      });

      this.hand = this.hand.filter(c => c !== null);
      this.hand.forEach(c => { if (c) c.selected = false; });
    }, 600);

    this.discardsLeft--
    return true;
  }



  // ===== 调试功能 =====
  resetHands() {
    this.handsLeft = 4;
  }

  addScore(delta) {
    this.score += delta;
    this.totalScore += delta;
  }

  // 应用装备的女巫卡牌技能 bonus（多张叠加）
  _applyEquippedCardBonus(timing) {
    if (!this.equippedWitchCards || this.equippedWitchCards.length === 0) return;
    for (const level of this.equippedWitchCards) {
      const cardConfig = WITCH_CARDS.find(c => c.card_id === `witch_card_${level}`);
      if (!cardConfig) continue;
      switch (cardConfig.card_skill_name) {
        case 'each_round_coin_plus1':
          // 结算加成在 _showSettlement 中处理
          break;
        case 'each_round_hand_plus1':
          if (timing === 'round') {
            this.handsLeft += 1;
            console.log('[EquippedSkill] each_round_hand_plus1 applied, handsLeft:', this.handsLeft);
          }
          break;
        case 'illegal_words_one':
          // 回合级标记在 resetRound 中重置，实际生效在 playHand 非法单词逻辑中
          break;
        case 'witch_skill_extra_hands':
          if (timing === 'round') {
            const ws = getSkillForLevel(this.round, this._shuffledSkills);
            if (ws && ws.skill) {
              this.handsLeft += 1;
              this.discardsLeft += 1;
              console.log('[EquippedSkill] witch_skill_extra_hands applied, handsLeft:', this.handsLeft, 'discardsLeft:', this.discardsLeft);
            }
          }
          break;
      }
    }
  }

  // ===== 每日单词挑战 =====

  _initDailyChallenge() {
    this.dailyChallenge = null;

    const saved = this.storageManager ? this.storageManager.getDailyChallenge() : null;
    const today = new Date().toISOString().slice(0, 10);

    if (saved && saved.date === today && saved.words && saved.words.length === 10) {
      this.dailyChallenge = saved;
      console.log('[DailyChallenge] 恢复今日挑战:', saved.words, '已收集:', saved.collected);
    } else {
      // 日期不对或没有数据，异步加载
      this._loadDailyWords();
    }
  }

  _loadDailyWords() {
    try {
      wx.cloud.callFunction({
        name: 'getDailyWords',
        data: {}
      }).then(res => {
        if (res.result && res.result.code === 0 && res.result.words) {
          const today = res.result.date;
          const words = res.result.words;

          // 尝试保留本地已有的收集进度
          const saved = this.storageManager ? this.storageManager.getDailyChallenge() : null;
          let collected = [];
          let rewarded = false;
          if (saved && saved.date === today) {
            collected = saved.collected || [];
            // 过滤掉可能不在新词列表中的旧收集
            const wordList = words.map(w => (typeof w === 'string' ? w : w.word).toLowerCase());
            collected = collected.filter(w => wordList.includes(w));
            rewarded = saved.rewarded || false;
          }

          this.dailyChallenge = { date: today, words, collected, rewarded };
          if (this.storageManager) {
            this.storageManager.saveDailyChallenge(this.dailyChallenge);
          }
          console.log('[DailyChallenge] 加载今日词:', words, '已收集:', collected);
        }
      }).catch(err => {
        console.error('[DailyChallenge] 加载失败:', err);
      });
    } catch (e) {
      console.error('[DailyChallenge] 调用异常:', e);
    }
  }

  _getDailyChallengeSeedLetters() {
    if (!this.dailyChallenge || !this.dailyChallenge.words) return [];
    const allLetters = [];
    for (const item of this.dailyChallenge.words) {
      const word = typeof item === 'string' ? item : item.word;
      for (const ch of word.toUpperCase()) {
        allLetters.push(ch);
      }
    }
    // 去重并打乱
    const unique = [...new Set(allLetters)];
    shuffle(unique);
    // 最多取 8 个字母注入手牌，避免手牌全是目标词字母
    return unique.slice(0, Math.min(unique.length, 8));
  }

  _checkDailyWordCollect(word) {
    if (!this.settings || !this.settings.dailyWordChallengeEnabled) return;
    if (!this.dailyChallenge || !this.dailyChallenge.words) return;
    const w = word.toLowerCase();
    const wordList = this.dailyChallenge.words.map(item => typeof item === 'string' ? item.toLowerCase() : item.word.toLowerCase());
    if (!wordList.includes(w)) return;
    if (this.dailyChallenge.collected.includes(w)) return;

    this.dailyChallenge.collected.push(w);
    if (this.storageManager) {
      this.storageManager.saveDailyChallenge(this.dailyChallenge);
    }

    // 显示收集提示
    const remaining = this.dailyChallenge.words.length - this.dailyChallenge.collected.length;
    this.hintToast = {
      text: `今日新词「${w}」收集成功！(${remaining}个待收集)`,
      expireAt: Date.now() + 3500,
      startTime: Date.now(),
      starFlyAt: Date.now() + 2000
    };

    // 检查是否集齐
    if (remaining === 0 && !this.dailyChallenge.rewarded) {
      this._showDailyChallengeReward();
    }
  }

  _showDailyChallengeReward() {
    this.dailyChallenge.rewarded = true;
    if (this.storageManager) {
      this.storageManager.saveDailyChallenge(this.dailyChallenge);
    }
    // 奖励金币
    const rewardGold = 50;
    this.gold += rewardGold;
    // 用 toast 提示代替弹窗
    this.hintToast = {
      text: '恭喜！今日10个新词全部收集完成！',
      expireAt: Date.now() + 4000,
      startTime: Date.now(),
      starFlyAt: Date.now() + 2000
    };
    if (this.audioManager) this.audioManager.play('buy_success');
  }

  // 今日新词弹窗滚动物理更新（惯性滚动 + 边界回弹）
  _updateDailyWordsScroll(deltaTime) {
    if (!this._dailyWordsPopup) return;
    if (this._dailyWordsScrollState === 'dragging') return;

    const maxScroll = this._dailyWordsMaxScroll || 0;
    const state = this._dailyWordsScrollState;

    // 惯性滚动
    if (state === 'inertia') {
      const dt = Math.min(deltaTime, 32); // 限制最大时间步长，防止卡顿后跳变
      this._dailyWordsScrollY += this._dailyWordsScrollVelocity * dt;
      this._dailyWordsScrollVelocity *= Math.pow(0.92, dt / 16);

      // 到达边界或速度足够小，切换状态
      if (this._dailyWordsScrollY < 0 || this._dailyWordsScrollY > maxScroll) {
        this._dailyWordsScrollState = 'bounce';
        this._dailyWordsScrollBounceTarget = this._dailyWordsScrollY < 0 ? 0 : maxScroll;
      } else if (Math.abs(this._dailyWordsScrollVelocity) < 0.05) {
        this._dailyWordsScrollState = 'idle';
        this._dailyWordsScrollVelocity = 0;
      }
    }

    // 边界回弹（easeOutBack，轻微过冲后回落）
    if (state === 'bounce') {
      const target = this._dailyWordsScrollBounceTarget || 0;
      const startY = this._dailyWordsScrollBounceStartY || target;
      const elapsed = Date.now() - (this._dailyWordsScrollBounceStartTime || Date.now());
      const duration = 450;
      const progress = Math.min(elapsed / duration, 1);
      const eased = Easing.easeOutBack(progress);
      this._dailyWordsScrollY = startY + (target - startY) * eased;

      if (progress >= 1) {
        this._dailyWordsScrollY = target;
        this._dailyWordsScrollState = 'idle';
        this._dailyWordsScrollVelocity = 0;
      }
    }
  }

  winRound() {
    this.score = this.target;
    this.totalScore += this.target;
    this._showSettlement();
  }

  // 原地复活：gameover 时恢复 1 次出牌机会
  revive() {
    this.handsLeft = 1;
    this.state = 'playing';
    this.gameOverReason = null;
    this._closingGameOver = false;
    this._closeStartTime = null;
    this._restartBtnPressed = false;
    this._restartBtnPressTime = null;
    this._reviveBtnPressed = false;
    this._reviveBtnPressTime = null;
    this._showingRankList = false;
    if (this.storageManager) {
      const today = new Date().toISOString().slice(0, 10);
      this.storageManager.saveDailyRevive(today, true);
      this.storageManager.saveProgress();
    }
  }

  nextRound() {
    if (this.audioManager) this.audioManager.play('levelup');
    
    this.roundScores.push({ round: this.round, score: this.score });
    this.round++;
    this.shopItems = null;
    this._shopDiscountActive = false; // 折扣只持续一回合商店
    this._shopDiscountRate = 0.6;
    this.resetRound();
    this._preloadWitchAvatars();
    if (this.storageManager) this.storageManager.saveProgress();
  }

  jumpToRound(targetRound) {
    if (targetRound < 1) targetRound = 1;
    this.roundScores.push({ round: this.round, score: this.score });
    this.round = targetRound;
    this.score = 0;
    this.shopItems = null;
    this.resetRound();
    this.state = 'playing';
    if (this.storageManager) this.storageManager.saveProgress();
  }

  getSelectedCards() {
    return this.selected.map(id => this.hand.find(c => c && c.id === id)).filter(Boolean);
  }

  clearSelection() {
    if (this.selected.length === 0 && !(this.pendingCheck && (this.pendingCheck.state === 'invalid' || this.pendingCheck.state === 'witch_failed'))) return;
    // 如果有非法提示或女巫约束失败提示，先清除
    if (this.pendingCheck && (this.pendingCheck.state === 'invalid' || this.pendingCheck.state === 'witch_failed')) {
      this.pendingCheck = null;
    }
    // 清除字母跳跃偏移
    this.hand.forEach(c => { if (c) c.jumpOffsetY = 0; });
    this.selected.forEach(id => {
      const card = this.hand.find(c => c && c.id === id);
      if (card) {
        card.selected = false;
        if (this.animManager) this.animManager.cardDeselect(card);
      }
    });
    this.selected = [];
  }

  update(deltaTime) {
    // 更新动画
    if (this.animManager) {
      this.animManager.update(Date.now());
    }

    // === 女巫牌排序动画状态归零（退出排序后的清理）===
    if (!this._jokerSortState && this.jokers) {
      this.jokers.forEach((joker) => {
        if (!joker) return;
        joker._sortOffsetX = 0;
        joker._sortOffsetY = 0;
        joker._sortScale = 1;
        joker._sortOpacity = 1;
        joker._sortGlow = 0;
      });
    }
    // 今日新词弹窗滚动物理更新
    this._updateDailyWordsScroll(deltaTime);

    // toast 弹出 2s 后触发星星飞行动画
    if (this.hintToast && this.hintToast.starFlyAt && Date.now() > this.hintToast.starFlyAt && !this.hintToast._starFlown) {
      this.hintToast._starFlown = true;
      if (this.renderer) this.renderer._startToastFlyStar(this);
    }

    // 清除过期的 hintToast
    if (this.hintToast && Date.now() > this.hintToast.expireAt) {
      this.hintToast = null;
    }
    // switch 打开提示 2s 后自动隐藏
    if (this._dailyWordsSwitchHint && Date.now() > this._dailyWordsSwitchHint.expireAt) {
      this._dailyWordsSwitchHint = null;
    }

    // 字母置换提示按钮 2.5s 后自动隐藏
    if (this._changeLetterHint && Date.now() - this._changeLetterHint.startTime > 2500) {
      this._changeLetterHint = null;
    }

    // 随机强化药水：转盘抽奖状态转换
    if (this._randomUpgradePopup) {
      const popup = this._randomUpgradePopup;
      if (popup.phase === 'spinning') {
        const elapsed = Date.now() - popup.spinStartTime;
        if (elapsed >= 3000) {
          popup.phase = 'paused';
          popup.pauseStartTime = Date.now();
        }
      } else if (popup.phase === 'paused') {
        const pauseElapsed = Date.now() - popup.pauseStartTime;
        if (pauseElapsed >= 1300) {
          const letter = popup.targetLetter;
          const mult = popup.randomMult || 2;
          const existing = letterUpgrades.get(letter) || {};
          const totalMult = (existing.mult || 1) * mult;
          const oldAdd = existing.add || 0;
          const newAdd = Math.floor(oldAdd * mult);
          const baseScore = LETTER_SCORE[letter];
          const newScore = Math.floor(baseScore * totalMult) + newAdd;
          const oldScore = Math.floor(baseScore * (existing.mult || 1)) + oldAdd;

          console.log('[RandomUpgrade] 抽奖倍率:', popup.randomMult, '目标字母:', letter, '基础分:', LETTER_SCORE[letter]);
          console.log('[RandomUpgrade] 升级前 letterUpgrades:', JSON.stringify(letterUpgrades.get(letter)));
          const savedPotionMode = this.potionMode;
          upgradeLetter(this, letter);
          this.potionMode = savedPotionMode; // 保留 potionMode 让转盘背景继续显示
          const upgradedCard = this.hand.find(c => c && c.letter === letter);
          console.log('[RandomUpgrade] 升级后字母牌分数:', upgradedCard ? upgradedCard.score : 'N/A', 'upgradeMult:', upgradedCard ? upgradedCard.upgradeMult : 'N/A');

          this._potionUpgrading = {
            startTime: Date.now(),
            letter,
            oldScore,
            newScore,
            upgradeMult: totalMult,
            upgradeAdd: newAdd,
            randomMult: popup.randomMult
          };
          popup.phase = 'done'; // 标记完成，保留转盘状态供背景显示
        }
      }
    }
  }

  startRandomSpin() {
    if (this._randomUpgradePopup && this._randomUpgradePopup.phase !== 'idle') return;
    if (this.audioManager) this.audioManager.play('spin_wheel');

    const handLetters = [...new Set(this.hand.filter(c => c).map(c => c.letter))];
    const targetLetter = handLetters.length > 0
      ? handLetters[Math.floor(Math.random() * handLetters.length)]
      : 'A';

    // 带权重生成随机倍数 1.5~4.0（保留1位小数）
    // 10% 概率 3.0~4.0，50% 概率 1.5~2.0，40% 概率 2.0~3.0
    function genMult() {
      const r = Math.random();
      let min, max;
      if (r < 0.10) { min = 3.0; max = 4.0; }
      else if (r < 0.60) { min = 1.5; max = 2.0; }
      else { min = 2.0; max = 3.0; }
      return Math.round((Math.random() * (max - min) + min) * 10) / 10;
    }
    const randomMult = genMult();
    // 生成30个展示用的随机倍数序列（最后一个是最终倍数）
    const multSequence = [];
    for (let i = 0; i < 29; i++) {
      multSequence.push(genMult());
    }
    multSequence.push(randomMult);

    this._randomUpgradePopup = {
      phase: 'spinning',
      targetLetter,
      randomMult,
      multSequence,
      spinStartTime: Date.now(),
    };
  }
}

function uploadScoreAndRound(currentScore, currentRound) {
  if (!wx.setUserCloudStorage) return;

  const doUpload = (updates) => {
    if (updates.length === 0) {
      console.log('[Rank] 云端数据已更高，无需上传');
      return;
    }
    wx.setUserCloudStorage({
      KVDataList: updates,
      success: () => console.log('[Rank] 上传成功', updates),
      fail: (err) => console.error('[Rank] 上传失败', err),
    });
  };

  if (wx.getUserCloudStorage) {
    wx.getUserCloudStorage({
      keyList: ['score', 'bestround'],
      success: (res) => {
        const kvList = res.KVDataList || [];
        const cloudScore = parseInt(kvList.find(kv => kv.key === 'score')?.value || '0', 10);
        const cloudRound = parseInt(kvList.find(kv => kv.key === 'bestround')?.value || '0', 10);

        const updates = [];
        if (currentRound > cloudRound) {
          // 规则1：round 创新高，同时更新 round 和 score
          updates.push({ key: 'score', value: String(currentScore) });
          updates.push({ key: 'bestround', value: String(currentRound) });
        } else if (currentScore > cloudScore) {
          // 规则2：round 没创新高，但 score 创新高，只更新 score
          updates.push({ key: 'score', value: String(currentScore) });
        }
        // 规则3：都不高，不更新
        doUpload(updates);
      },
      fail: (err) => {
        console.error('[Rank] 读取云端数据失败', err);
        // 读取失败时保守处理：不上传，避免覆盖更高的云端记录
      }
    });
  } else {
    // 不支持读取时直接上传两个字段
    doUpload([
      { key: 'score', value: String(currentScore) },
      { key: 'bestround', value: String(currentRound) }
    ]);
  }
}

module.exports = { Game, calcWordScore, isValidWord, isValidWordOnline, getWordMeaning, formatMeaning, findValidWordInHand, findAllValidWordsInHand, uploadScoreAndRound };
