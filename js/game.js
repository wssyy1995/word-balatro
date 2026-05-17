// ===== 游戏核心逻辑 =====
const {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA, EXPAND_WORD_DATA,
  onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords
} = require('./data');
const { AnimationManager } = require('./animation');
const { AudioManager } = require('./audio');
const { StorageManager } = require('./storage');
const { generateShopItems, applyCrystalEffects, upgradeLetter } = require('./shop');
const { getSkillForLevel, checkSkill, getSkillFailText, giveReward, createRewardItem, SKILL_POOL, shuffleSkills } = require('./witch_skills');

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

function drawWithSafety(deck, count, round, safetyRounds, seedMinLen = 3, seedMaxLen = 6, excludeLetters = []) {
  const seedWord = getSeedWord(seedMinLen, seedMaxLen, excludeLetters);
  const seedLetters = seedWord.toUpperCase().split('').filter(l => !excludeLetters.includes(l));

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

  for (const letter of seedLetters) {
    const idx = deck.findIndex(c => c.letter === letter);
    if (idx >= 0) deck.splice(idx, 1);
  }

  const remaining = count - seedLetters.length;
  const randomCards = deck.splice(0, remaining);
  const insertPos = Math.floor(Math.random() * (randomCards.length + 1));
  const hand = [...randomCards.slice(0, insertPos), ...seedCards, ...randomCards.slice(insertPos)];
  return hand;
}

function ensureValidWordInHand(deck, hand, seedMinLen = 3, seedMaxLen = 6, maxHandSize = 9, excludeLetters = []) {
  if (hasValidWordInHand(hand)) return;

  const seedWord = getSeedWord(seedMinLen, seedMaxLen, excludeLetters);
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
  // 如果还有剩余的 seedCards，push 到末尾
  while (seedIdx < seedCards.length) {
    hand.push(seedCards[seedIdx++]);
  }

  // 如果 hand 超过最大限制，把多余的牌塞回 deck
  while (hand.length > maxHandSize && deck.length > 0) {
    const extra = hand.pop();
    if (extra) deck.unshift(extra);
  }
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
    const preview = calcWordScore(wordCards, []);
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
function _matchCardTrigger(card, trigger) {
  switch (trigger) {
    case 'letter_a': return card.letter === 'A';
    case 'letter_e': return card.letter === 'E';
    case 'has_vowel': return 'AEIOU'.includes(card.letter);
    case 'high_letter': return ['J','Q','X','Z'].includes(card.letter);
    default: return false;
  }
}

// 判断整手牌是否匹配女巫牌的 trigger 条件
function _matchWordTrigger(cards, trigger) {
  switch (trigger) {
    case 'has_face': return cards.some(c => c.isFace);
    case 'length_3': return cards.length >= 3;
    case 'length_4': return cards.length >= 4;
    case 'length_5': return cards.length >= 5;
    case 'length_6': return cards.length >= 6;
    default: return false;
  }
}

function calcWordScore(cards, jokers) {
  if (!cards || cards.length === 0) return { valid: false, score: 0 };

  let mult = cards.length; // 基础倍率 = 单词长度
  let hasFace = false;
  for (const c of cards) {
    if (c.isFace) hasFace = true;
  }

  const word = cards.map(c => c.letter.toLowerCase()).join('');

  // === 先处理 limit 型女巫牌（字母之神）：所有字母基础分变为最高分 ===
  const letterGod = (jokers || []).find(j => j.type === 'witch' && j.scope === 'limit' && j.trigger === 'letter_god');
  let maxBaseScore = 0;
  if (letterGod) {
    maxBaseScore = Math.max(...cards.map(c => c.score));
  }

  // 计算每个字母的倍率（女巫牌对单个字母的加成）
  const cardMults = cards.map(() => 1);

  for (const j of jokers) {
    if (j.type !== 'witch') continue;
    // limit 型女巫牌不参与常规倍率计算
    if (j.scope === 'limit') continue;
    switch (j.scope) {
      case 'per_card':
        cards.forEach((c, i) => {
          if (_matchCardTrigger(c, j.trigger)) cardMults[i] *= j.value;
        });
        break;
      case 'whole_word': {
        const wwMatched = j.trigger === 'illegal_boost' ? j.value > 0 : _matchWordTrigger(cards, j.trigger);
        if (wwMatched) {
          if (j.trigger === 'illegal_boost') {
            mult += j.value;
          } else {
            mult = Math.ceil(mult * j.value);
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
    baseScore += cardScore * cardMults[i];
  }

  for (const j of jokers) {
    if (j.type === 'witch' && j.scope === 'flat_bonus') {
      baseScore += j.value;
    }
  }

  const totalScore = Math.ceil(baseScore * mult);
  return { valid: true, score: totalScore, base: baseScore, mult, word, hasFace };
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

// 后台调用 MyMemory 把英文定义译成中文
async function fetchChineseTranslation(word, enDef, pos) {
  try {
    const transResp = await requestPromise({
      url: `https://api.mymemory.translated.net/get?q=${encodeURIComponent(enDef.slice(0, 120))}&langpair=en|zh-CN`,
      method: 'GET',
      timeout: 5000
    });
    if (transResp.statusCode === 200 && transResp.data?.responseData?.translatedText) {
      const zhDef = transResp.data.responseData.translatedText;
      if (zhDef && !zhDef.includes('MYMEMORY WARNING')) {
        wordMeaningCache.set(word, { entries: [{ pos, def: zhDef }], pos, meaning: zhDef });
      }
    }
  } catch (e) {
    // 翻译失败，保留英文定义
  }
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
    const resp = await requestPromise({
      url: `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
      method: 'GET',
      timeout: 3000
    });

    if (resp.statusCode === 200) {
      console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) VALID`);
      onlineWordCache.add(word);
      wordCheckState.set(word, 'valid');

      if (Array.isArray(resp.data) && resp.data[0]?.meanings?.length > 0) {
        const entries = resp.data[0].meanings.slice(0, 2).map(m => ({
          pos: m.partOfSpeech || '',
          def: m.definitions?.[0]?.definition || ''
        }));

        // 如果还没有释义缓存，先存入英文定义，再后台翻译中文
        if (!wordMeaningCache.has(word)) {
          const enDef = entries[0]?.def || '';
          const pos = entries[0]?.pos || '';
          wordMeaningCache.set(word, { entries: [{ pos, def: enDef }], pos, meaning: enDef });
          fetchChineseTranslation(word, enDef, pos);
        }
      }
      checkingWords.delete(word);
      return true;
    }
    // 404 或其他状态码：单词不存在或接口异常
    console.log(`[WordCheck] word="${word}" layer=L3(onlineAPI) INVALID (status=${resp.statusCode})`);
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

function formatMeaning(meaningObj) {
  if (!meaningObj) return '';
  if (meaningObj.entries && meaningObj.entries.length > 0) {
    return meaningObj.entries.map(e => `${e.pos} ${e.def}`).join('；');
  }
  return meaningObj.meaning || '';
}

// ===== 游戏主类 =====
class Game {
  constructor() {
    // 新游戏时清除字母升级记录
    letterUpgrades.clear();
    this.round = 1;
    this.gold = 4;
    this.jokers = [];
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
    this.extraSafety = 0;
    this.extraHands = 0;
    this.baseHandSize = 9;
    this.totalScore = 0;
    this.gameOverReason = null;
    this.roundScores = [];
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
    this._lifeExtensionBonus = 0;
    this._lifeExtensionAnim = null;
    this._shuffledSkills = shuffleSkills([...SKILL_POOL]);
    console.log('初始化SKILL_NAME=[' + this._shuffledSkills.map(s => s.skill).join(',') + ']');
    this.audioManager = new AudioManager();
    this.storageManager = new StorageManager();
    this.audioManager.preloadAll();
    this.resetRound();
  }

  resetRound() {
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
    this.target = Math.floor(150 + 50 * this.round * (this.round - 1));
    if (this._lifeExtensionBonus) {
      this.target += this._lifeExtensionBonus;
      this._lifeExtensionBonus = 0;
    }
    this._reduceTargetAnim = null;
    applyCrystalEffects(this);
    const handSize = this.baseHandSize + (this.extraLetters || 0);
    this._maxHandSize = handSize;
    this.hand = drawWithSafety(this.deck, handSize, this.round, this.safetyRounds + this.extraSafety, this._seedMinLen, this._seedMaxLen, excludeLetters);
    this.selected = [];
    this.score = 0;
    this.handsLeft = 4 + this.extraHands;
    this.discardsLeft = 3 + this.extraDiscards;
    this.extraHands = 0;
    this.extraDiscards = 0;
    this.extraSafety = 0;
    this.extraLetters = 0;
    this.witchSkillPassed = true;
    this._witchDetailPopup = null;
    this._hudWitchPopup = null;
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
      }
    });
    this.state = 'playing';
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
    if (idx >= 0) {
      this.selected.splice(idx, 1);
      card.selected = false;
      if (this.animManager) this.animManager.cardDeselect(card);
      if (this.audioManager) this.audioManager.play('deselect');
    } else {
      if (this.selected.length >= 9) return;
      this.selected.push(cardId);
      card.selected = true;
      if (this.animManager) this.animManager.cardSelect(card);
      if (this.audioManager) this.audioManager.play('select');
    }
  }

  showHint() {
    const words = findAllValidWordsInHand(this.hand);
    if (words.length === 0) {
      this.hintToast = { text: '没有可组成的单词', expireAt: Date.now() + 2000 };
      return;
    }
    const topWords = words.slice(0, 10);
    const lines = [`提示：${words.length} 个合法单词`];
    topWords.forEach((w, i) => {
      lines.push(`${i + 1}. ${w.word.toUpperCase()} (${w.cards.length}牌 ${w.score}分)`);
    });
    if (words.length > 10) lines.push('...');
    this.hintToast = { text: lines.join('\n'), expireAt: Date.now() + 2000 };
  }

  async playHand() {
    if (this.selected.length < 2 || this.pendingCheck) return { valid: false };
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

    if (!valid) {
      this.pendingCheck.state = 'invalid';
      this.pendingCheck.resolveTime = Date.now();
      if (this.audioManager) this.audioManager.play('invalid');

      // 勇敢试错：每次非法单词倍率 +1；若同时触发容错咒文，倍率 -0.1
      const hasShield = (this.jokers || []).some(j => j.trigger === 'shield_illegal');
      (this.jokers || []).forEach(j => {
        if (j.trigger === 'illegal_boost') {
          j.value = (j.value || 0) + (hasShield ? -0.1 : 1);
        }
      });

      // 检查是否有"出现非法单词，游戏结束"的女巫技能
      const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
      if (witchSkill && witchSkill.skill === 'forbid_illegal_words') {
        this.hintToast = { text: '单词不存在 + 女巫诅咒触发！', expireAt: Date.now() + 2000 };
        setTimeout(() => {
          this.state = 'gameover';
          this.gameOverReason = 'forbidden_word';
          if (this.storageManager) {
            this.storageManager.setHighScore(this.totalScore);
            this.storageManager.updateStats(this);
            this.storageManager.clearProgress();
          }
        }, 1000);
        if (this.storageManager) this.storageManager.saveProgress(this);
        return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
      }

      // 检查是否有"容错咒文"女巫牌（非法单词不扣出牌次数）
      const shieldJoker = (this.jokers || []).find(j => j.trigger === 'shield_illegal');
      if (shieldJoker) {
        // 触发容错咒文动画：跳跃 + 紫色光晕
        shieldJoker._triggered = true;
        shieldJoker._shieldAnimStart = Date.now();
      } else {
        this.handsLeft--;
      }
      if (this.handsLeft <= 0) {
        const triggered = this._checkLifeExtension();
        if (!triggered) {
          // 延迟 1.5 秒进入 gameover，让玩家先看到"单词不存在"提示
          setTimeout(() => {
            this.state = 'gameover';
            this.gameOverReason = 'out_of_hands';
            if (this.storageManager) {
              this.storageManager.setHighScore(this.totalScore);
              this.storageManager.updateStats(this);
              this.storageManager.clearProgress();
            }
          }, 1500);
        }
      }
      if (this.storageManager) this.storageManager.saveProgress(this);
      return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
    }

    // === 女巫技能约束检查 ===
    const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    if (witchSkill && !checkSkill(witchSkill.skill, this, playedInOrder)) {
      this.witchSkillPassed = false;
      this.pendingCheck.state = 'witch_failed';
      this.pendingCheck.resolveTime = Date.now();
      this.pendingCheck.witchFailText = getSkillFailText(witchSkill.skill);
      this.pendingCheck._witchFailAnimStart = Date.now();
      this._witchStarBurstAuto = true; // 触发 HUD 女巫头像星星动画
      if (witchSkill.angry_tip) {
        this._witchAngryTip = { text: witchSkill.angry_tip, expireAt: Date.now() + 4000 };
      }
      if (this.audioManager) this.audioManager.play('invalid');
      this.handsLeft--;
      if (this.handsLeft <= 0) {
        const triggered = this._checkLifeExtension();
        if (!triggered) {
          setTimeout(() => {
            this.state = 'gameover';
            this.gameOverReason = 'out_of_hands';
            if (this.storageManager) {
              this.storageManager.setHighScore(this.totalScore);
              this.storageManager.updateStats(this);
              this.storageManager.clearProgress();
            }
          }, 1500);
        }
      }
      if (this.storageManager) this.storageManager.saveProgress(this);
      return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
    }

    // === 字母之神触发（limit 型女巫牌，优先处理）===
    const letterGod = (this.jokers || []).find(j => j.type === 'witch' && j.scope === 'limit' && j.trigger === 'letter_god');
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
      if (this.storageManager) this.storageManager.saveProgress(this);
    }

    const result = calcWordScore(played, this.jokers);

    // === letter_X_mult_half 惩罚检测（通用） ===
    const currentWitchSkill = getSkillForLevel(this.round, this._shuffledSkills);
    this.pendingCheck.multHalfResult = applyLetterMultHalf(currentWitchSkill, playedInOrder, result);

    this.pendingCheck.letterGodTriggered = letterGodTriggered;
    this.pendingCheck.letterGodIndex = letterGodTriggered ? this.jokers.indexOf(letterGod) : -1;
    this.pendingCheck.state = 'valid';
    this.pendingCheck.result = result;
    this.pendingCheck.meaning = getWordMeaning(word);
    // 始终设置 resolveTime 和 animPhase = 0（烟花立即开始）
    this.pendingCheck.resolveTime = Date.now();
    this.pendingCheck.animPhase = 0;

    // 计算每个字母跳跃时触发的女巫牌索引（scope === 'per_card'）
    const jokers = this.jokers || [];
    const jokerTriggers = [];
    for (let i = 0; i < playedInOrder.length; i++) {
      const card = playedInOrder[i];
      const triggered = [];
      for (let j = 0; j < jokers.length; j++) {
        const joker = jokers[j];
        if (joker.type !== 'witch' || joker.scope !== 'per_card') continue;
        if (_matchCardTrigger(card, joker.trigger)) triggered.push(j);
      }
      jokerTriggers.push(triggered);
    }
    // 始终生效的女巫牌（flat_bonus），在字母跳跃阶段就显示紫色边框
    const globalTriggered = [];
    for (let j = 0; j < jokers.length; j++) {
      const joker = jokers[j];
      if (joker.type !== 'witch') continue;
      if (joker.scope === 'flat_bonus') {
        globalTriggered.push(j);
      }
    }
    this.pendingCheck.jokerTriggers = jokerTriggers;
    this.pendingCheck.globalTriggered = globalTriggered;

    // 预处理 whole_word 女巫牌（用于 phase 1.5 波浪动画 + phase 2 倍率弹出）
    const wholeWordJokers = [];
    jokers.forEach((joker, idx) => {
      if (joker.type === 'witch' && joker.scope === 'whole_word') {
        const matched = joker.trigger === 'illegal_boost'
          ? joker.value > 0
          : _matchWordTrigger(playedInOrder, joker.trigger);
        if (matched) {
          wholeWordJokers.push({ idx, joker });
        }
      }
    });
    this.pendingCheck.wholeWordJokers = wholeWordJokers;

    if (this.audioManager) {
      this.audioManager.play('valid');
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
      setTimeout(() => {
        const idx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'life_extension');
        if (idx >= 0) this.jokers.splice(idx, 1);
        if (this.storageManager) this.storageManager.saveProgress(this);
      }, 900);
    }
    this._lifeExtensionAnim = { startTime: Date.now(), jokerIndex: lifeExtIdx, diff };
    this.state = 'life_extended';
    if (this.storageManager) this.storageManager.saveProgress(this);
    return true;
  }

  completePlayHand() {
    if (this._playHandCompleting) return;
    if (!this.pendingCheck || this.pendingCheck.state !== 'valid') return;
    this._playHandCompleting = true;

    const result = this.pendingCheck.result;
    const played = this.pendingCheck.cards;
    const playedInOrder = this.pendingCheck.cardsInOrder;
    this._applyScore(result);
    this._executePlayHand(played, playedInOrder, result);

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
        if (this.storageManager) {
          this.storageManager.setHighScore(this.totalScore);
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
      setTimeout(() => this.audioManager.play('score'), 200);
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
        setTimeout(() => {
          const idx = (this.jokers || []).findIndex(j => j && j.scope === 'limit' && j.trigger === 'letter_god');
          if (idx >= 0) this.jokers.splice(idx, 1);
          if (this.storageManager) this.storageManager.saveProgress(this);
        }, 900);
      }
    }

    // 使用传入的 playedCards 而不是依赖 this.hand 的 selected 状态
    //（防止动画期间 selected 被意外清除导致 finalPlayedCards 为空）
    const finalPlayedCards = playedCards.filter(c => c);
    const removedIndices = [];
    this.hand.forEach((c, i) => {
      if (c && finalPlayedCards.includes(c)) {
        removedIndices.push(i);
      }
    });

    // 旧牌飞出
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
    setTimeout(() => {
      // 1. 打出的牌回到牌堆底部
      for (const card of finalPlayedCards) {
        if (card) this.deck.push(card);
      }
      // 2. 洗牌（防止连续抽到同样的牌）
      this.deck = shuffle([...this.deck]);
      // 3. 从牌堆顶部补牌
      const need = finalPlayedCards.length;
      const newCards = this.deck.splice(0, need);

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
      const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
      const excludeLetters = witchSkill && witchSkill.skill === 'no_letter_a' ? ['A'] : [];
      ensureValidWordInHand(this.deck, this.hand, this._seedMinLen, this._seedMaxLen, this._maxHandSize, excludeLetters);
      this.hand.forEach(c => { if (c) c.selected = false; });
    }, 600);

    this.handsLeft--
    if (this.storageManager) this.storageManager.saveProgress(this);
  }

  _showSettlement() {
    const baseGold = 3 + Math.round(this.round / 3);
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
  }

  claimSettlement() {
    if (!this.settlementData) return;
    this.gold += this.settlementData.totalGold;
    // settlementData 暂时保留用于 closing 动画，200ms 后再处理
    this._closingSettlement = true;
    this._closeStartTime = Date.now();
    setTimeout(() => {
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
        this.state = 'shop';
        if (!this.shopItems) {
          this.shopItems = generateShopItems(this);
        }
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
      // 鼓励奖：随机 1~3 金币
      const bonusGold = Math.floor(Math.random() * 3) + 1;
      this.witchRewardData.consolationGold = bonusGold;
      this.gold += bonusGold;
    }
    this.witchRewardData.phase = 'result';
  }

  closeWitchReward(action) {
    this._closingWitchReward = true;
    this._closeWitchRewardStartTime = Date.now();
    setTimeout(() => {
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
            } else if (data.rewardItem.effect === 'double_coin') {
              this.gold *= 2;
            }
          }
          this.state = 'shop';
          if (!this.shopItems) this.shopItems = generateShopItems(this);
          if (this.storageManager) this.storageManager.saveProgress(this);
          break;
        case 'stash':
          if (data && data.rewardItem) {
            if (!this.potions) this.potions = [];
            if (this.potions.length < 2) {
              this.potions.push({ ...data.rewardItem });
            }
          }
          this.state = 'shop';
          if (!this.shopItems) this.shopItems = generateShopItems(this);
          if (this.storageManager) this.storageManager.saveProgress(this);
          break;
        case 'use':
          if (data && data.rewardItem) {
            this.potionMode = { ...data.rewardItem };
            this._prePotionState = 'shop';
            this.state = 'potion';
            if (this.storageManager) this.storageManager.saveProgress(this);
          }
          break;
      }
    }, 200);
  }

  discard() {
    if (this.discardsLeft <= 0 || this.selected.length === 0) return false;
    
    if (this.audioManager) this.audioManager.play('discard');
    
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
    setTimeout(() => {
      // 1. 弃掉的牌回到牌堆底部
      for (const card of discardedCards) {
        if (card) this.deck.push(card);
      }
      // 2. 洗牌
      this.deck = shuffle([...this.deck]);
      // 3. 从牌堆顶部补牌
      const need = discardedCards.length;
      const newCards = this.deck.splice(0, need);

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

      // 移除未被替换的占位符
      this.hand = this.hand.filter(c => c !== null);

      const witchSkill = getSkillForLevel(this.round, this._shuffledSkills);
      const excludeLetters = witchSkill && witchSkill.skill === 'no_letter_a' ? ['A'] : [];
      ensureValidWordInHand(this.deck, this.hand, this._seedMinLen, this._seedMaxLen, this._maxHandSize, excludeLetters);
      this.hand.forEach(c => { if (c) c.selected = false; });
    }, 600);

    this.discardsLeft--
    if (this.storageManager) this.storageManager.saveProgress(this);
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

  winRound() {
    this.score = this.target;
    this.totalScore += this.target;
    this._showSettlement();
  }

  nextRound() {
    if (this.audioManager) this.audioManager.play('levelup');
    
    this.roundScores.push({ round: this.round, score: this.score });
    this.round++;
    this.shopItems = null;
    this.resetRound();
  }

  jumpToRound(targetRound) {
    if (targetRound < 1) targetRound = 1;
    this.roundScores.push({ round: this.round, score: this.score });
    this.round = targetRound;
    this.score = 0;
    this.shopItems = null;
    this.resetRound();
    this.state = 'playing';
    if (this.storageManager) this.storageManager.saveProgress(this);
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
    if (this.audioManager) this.audioManager.play('deselect');
  }

  update(deltaTime) {
    // 更新动画
    if (this.animManager) {
      this.animManager.update(Date.now());
    }
    // 清除过期的 hintToast
    if (this.hintToast && Date.now() > this.hintToast.expireAt) {
      this.hintToast = null;
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
        if (pauseElapsed >= 2000) {
          const letter = popup.targetLetter;
          const potion = this.potionMode;
          const mult = potion ? (potion.value || 4) : 4;
          const existing = letterUpgrades.get(letter) || {};
          const totalMult = (existing.mult || 1) * mult;
          const totalAdd = existing.add || 0;
          const baseScore = LETTER_SCORE[letter];
          const newScore = Math.floor(baseScore * totalMult) + totalAdd;
          const oldScore = Math.floor(baseScore * (existing.mult || 1)) + totalAdd;

          const savedPotionMode = this.potionMode;
          upgradeLetter(this, letter);
          this.potionMode = savedPotionMode; // 保留 potionMode 让转盘背景继续显示

          this._potionUpgrading = {
            startTime: Date.now(),
            letter,
            oldScore,
            newScore,
            upgradeMult: totalMult,
            upgradeAdd: totalAdd
          };
          popup.phase = 'done'; // 标记完成，保留转盘状态供背景显示
        }
      }
    }
  }

  startRandomSpin() {
    if (this._randomUpgradePopup && this._randomUpgradePopup.phase !== 'idle') return;

    const handLetters = [...new Set(this.hand.filter(c => c).map(c => c.letter))];
    const targetLetter = handLetters.length > 0
      ? handLetters[Math.floor(Math.random() * handLetters.length)]
      : 'A';

    this._randomUpgradePopup = {
      phase: 'spinning',
      targetLetter,
      spinStartTime: Date.now(),
    };
  }
}

module.exports = { Game, calcWordScore, isValidWord, isValidWordOnline, getWordMeaning, formatMeaning, findValidWordInHand, findAllValidWordsInHand };
