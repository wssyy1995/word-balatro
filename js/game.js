// ===== 游戏核心逻辑 =====
const {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  WORD_DATA,
  SHOP_POOL, onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades, checkingWords
} = require('./data');
const { AnimationManager } = require('./animation');
const { AudioManager } = require('./audio');
const { StorageManager } = require('./storage');

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
      if (upgrade) {
        score = Math.floor(baseScore * upgrade.mult);
        upgraded = true;
        upgradeMult = upgrade.mult;
      }
      cards.push({
        letter, baseScore, score,
        isFace: FACE_CARDS.has(letter),
        id: Math.random().toString(36).substr(2, 9),
        selected: false,
        upgraded, upgradeMult
      });
    }
  }
  return shuffle(cards);
}

function draw(deck, count) {
  const drawn = deck.splice(0, Math.min(count, deck.length));
  return drawn;
}

function getSeedWord(minLen = 3, maxLen = 6) {
  const candidates = [...WORD_DATA.keys()].filter(w => w.length >= minLen && w.length <= maxLen);
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  return 'cat';
}

function drawWithSafety(deck, count, round, safetyRounds) {
  const seedWord = getSeedWord();
  const seedLetters = seedWord.toUpperCase().split('');

  const seedCards = seedLetters.map(letter => {
    const baseScore = LETTER_SCORE[letter];
    const upgrade = letterUpgrades.get(letter);
    let score = baseScore;
    let upgraded = false;
    let upgradeMult = 1;
    if (upgrade) {
      score = Math.floor(baseScore * upgrade.mult);
      upgraded = true;
      upgradeMult = upgrade.mult;
    }
    return { letter, baseScore, score, isFace: FACE_CARDS.has(letter),
      id: Math.random().toString(36).substr(2, 9), selected: false, upgraded, upgradeMult };
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

function ensureValidWordInHand(deck, hand) {
  if (hasValidWordInHand(hand)) return;

  const seedWord = getSeedWord(6, 3);
  const seedLetters = seedWord.toUpperCase().split('');

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
    if (upgrade) {
      score = Math.floor(baseScore * upgrade.mult);
      upgraded = true;
      upgradeMult = upgrade.mult;
    }
    return { letter, baseScore, score, isFace: FACE_CARDS.has(letter),
      id: Math.random().toString(36).substr(2, 9), selected: false, upgraded, upgradeMult };
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

  // 如果 hand 超过 9 张，把多余的牌塞回 deck
  while (hand.length > 9 && deck.length > 0) {
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
    if (word.length < 3) continue;
    if (canFormWord(word, letterCounts)) return true;
  }
  for (const word of onlineWordCache) {
    if (word.length < 3) continue;
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
    if (word.length < 3 || word.length > cards.length) return;

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
  for (const word of onlineWordCache) tryWord(word);

  results.sort((a, b) => b.cards.length - a.cards.length || b.score - a.score);
  return results;
}

function findValidWordInHand(hand) {
  const all = findAllValidWordsInHand(hand);
  return all.length > 0 ? all[0] : null;
}

function calcWordScore(cards, jokers) {
  if (!cards || cards.length === 0) return { valid: false, score: 0 };

  let baseScore = 0;
  let mult = 1;
  let hasFace = false;

  for (const c of cards) {
    baseScore += c.score;
    if (c.isFace) hasFace = true;
  }

  const lengthBonus = cards.length >= 5 ? 10 + cards.length * 2 : 0;
  const word = cards.map(c => c.letter.toLowerCase()).join('');

  for (const j of jokers) {
    if (j.type !== 'witch') continue;
    switch (j.trigger) {
      case 'always': baseScore += j.value; break;
      case 'letter_a': if (cards.some(c => c.letter === 'A')) mult *= j.value; break;
      case 'letter_e': if (cards.some(c => c.letter === 'E')) mult *= j.value; break;
      case 'has_vowel': if (cards.some(c => 'AEIOU'.includes(c.letter))) mult *= j.value; break;
      case 'length_5': if (cards.length >= 5) mult *= j.value; break;
      case 'length_6': if (cards.length >= 6) mult *= j.value; break;
      case 'has_face': if (hasFace) mult *= j.value; break;
      case 'high_letter': if (cards.some(c => ['J','Q','X','Z'].includes(c.letter))) mult *= j.value; break;
    }
  }

  baseScore += lengthBonus;
  const totalScore = baseScore * mult;
  return { valid: true, score: totalScore, base: baseScore, mult, word, hasFace };
}

function isValidWord(word) {
  word = word.toLowerCase();
  return WORD_DATA.has(word) || onlineWordCache.has(word);
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
  if (WORD_DATA.has(word)) return true;
  if (onlineWordCache.has(word)) return true;
  if (checkingWords.has(word)) return false; // 已在检测中，避免重复请求

  checkingWords.add(word);

  try {
    const resp = await requestPromise({
      url: `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
      method: 'GET',
      timeout: 3000
    });

    if (resp.statusCode === 200) {
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
  } catch (e) {
    // 网络请求失败（断网、DNS 错误等）
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

  // 2. 离线词库
  if (WORD_DATA.has(word)) {
    const info = WORD_DATA.get(word);
    const result = { entries: [{ pos: info.pos || '', def: info.meaning }], pos: info.pos || '', meaning: info.meaning };
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
    this.round = 1;
    this.gold = 4;
    this.jokers = [];
    this.crystalEffects = [];
    this.potionMode = null;
    this.state = 'playing';
    this.shopItems = null;
    this.safetyRounds = 3;
    this.extraDiscards = 0;
    this.extraSafety = 0;
    this.extraHands = 0;
    this.totalScore = 0;
    this.gameOverReason = null;
    this.roundScores = [];
    this.animManager = new AnimationManager();
    this.flyingCards = [];
    this.hintToast = null;
    this.audioManager = new AudioManager();
    this.storageManager = new StorageManager();
    this.audioManager.preloadAll();
    this.resetRound();
  }

  resetRound() {
    wordCheckState.clear();
    this.crystalEffects.forEach(eff => {
      if (eff.effect === 'extra_discard') this.extraDiscards += eff.value;
      if (eff.effect === 'extra_safety') this.extraSafety += eff.value;
      if (eff.effect === 'extra_hands') this.extraHands += eff.value;
      if (eff.effect === 'bonus_gold') this.gold += eff.value;
      if (eff.effect === 'reduce_target') this.target = Math.floor(this.target * eff.value);
    });
    this.crystalEffects = [];

    this.deck = createDeck();
    this.hand = drawWithSafety(this.deck, 9, this.round, this.safetyRounds + this.extraSafety);
    this.selected = [];
    this.score = 0;
    this.target = Math.floor(150 * this.round * (this.round + 1) / 2);
    this.handsLeft = 4 + this.extraHands;
    this.discardsLeft = 3 + this.extraDiscards;
    this.extraDiscards = 0;
    this.extraSafety = 0;
    this.state = 'playing';
  }

  toggleSelect(cardId) {
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
    if (this.selected.length < 3) return { valid: false };
    const played = this.hand.filter(c => c && c.selected);
    const playedInOrder = this.getSelectedCards();
    const word = playedInOrder.map(c => c.letter.toLowerCase()).join('');

    let valid = isValidWord(word);
    if (!valid) valid = await isValidWordOnline(word);
    if (!valid) {
      if (this.audioManager) this.audioManager.play('invalid');
      return { valid: false, word: playedInOrder.map(c => c.letter).join('') };
    }

    const result = calcWordScore(played, this.jokers);
    this.score += result.score;
    this.totalScore += result.score;

    if (this.audioManager) {
      this.audioManager.play('valid');
      setTimeout(() => this.audioManager.play('score'), 200);
    }

    const removedIndices = [];
    const playedCards = [];
    this.hand.forEach((c, i) => { 
      if (c && c.selected) {
        removedIndices.push(i);
        playedCards.push(c);
      }
    });

    // 旧牌飞出
    playedCards.forEach((card, i) => {
      card._flyIndex = removedIndices[i];
      card.selected = false;
      this.animManager.flyOut(card, 'left', () => {
        const fi = this.flyingCards.indexOf(card);
        if (fi >= 0) this.flyingCards.splice(fi, 1);
        card._flyIndex = undefined;
      });
    });
    this.flyingCards.push(...playedCards);
    this.selected = [];

    // 用 null 占位符替换旧牌位置（其他牌索引完全不动）
    this.hand = this.hand.map(c => playedCards.includes(c) ? null : c);

    // 1秒后补牌
    setTimeout(() => {
      const need = Math.min(playedCards.length, this.deck.length);
      const newCards = this.deck.splice(0, need);

      let newIdx = 0;
      this.hand = this.hand.map(c => {
        if (c === null && newIdx < newCards.length) {
          const nc = newCards[newIdx++];
          nc.newCard = true;
          nc.animOffset = { x: -200, y: -20, rotation: -20, opacity: 0.4, scale: 0.6 };
          this.animManager.flyIn(nc, 'left', null, 0);
          return nc;
        }
        return c;
      });

      // 移除未被替换的占位符
      this.hand = this.hand.filter(c => c !== null);

      ensureValidWordInHand(this.deck, this.hand);
      this.hand.forEach(c => { if (c) c.selected = false; });
    }, 600);

    this.handsLeft--;
    if (this.score >= this.target) {
      this.state = 'shop';
      this.gold += 3 + this.round;
    } else if (this.handsLeft <= 0) {
      this.state = 'gameover';
      this.gameOverReason = 'out_of_hands';
      if (this.storageManager) {
        this.storageManager.setHighScore(this.totalScore);
        this.storageManager.updateStats(this);
        this.storageManager.clearProgress();
      }
    }
    if (this.storageManager) this.storageManager.saveProgress(this);
    return result;
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

    // 1秒后补牌
    setTimeout(() => {
      const need = Math.min(discardedCards.length, this.deck.length);
      const newCards = this.deck.splice(0, need);

      let newIdx = 0;
      this.hand = this.hand.map(c => {
        if (c === null && newIdx < newCards.length) {
          const nc = newCards[newIdx++];
          nc.newCard = true;
          nc.animOffset = { x: -200, y: -20, rotation: -20, opacity: 0.4, scale: 0.6 };
          this.animManager.flyIn(nc, 'left', null, 0);
          return nc;
        }
        return c;
      });

      // 移除未被替换的占位符
      this.hand = this.hand.filter(c => c !== null);

      ensureValidWordInHand(this.deck, this.hand);
      this.hand.forEach(c => { if (c) c.selected = false; });
    }, 600);

    this.discardsLeft--;
    if (this.storageManager) this.storageManager.saveProgress(this);
    return true;
  }

  buyItem(idx) {
    const item = this.shopItems[idx];
    if (!item || this.gold < item.cost) return false;
    this.gold -= item.cost;

    if (this.audioManager) this.audioManager.play('buy');

    if (item.type === 'witch') {
      if (this.jokers.length >= 5) return false;
      this.jokers.push({...item});
      this.shopItems[idx] = null;
      return true;
    } else if (item.type === 'crystal') {
      this.crystalEffects.push({...item});
      this.shopItems[idx] = null;
      if (this.storageManager) this.storageManager.saveProgress(this);
      return true;
    } else if (item.type === 'potion') {
      this.potionMode = {...item};
      this.shopItems[idx] = null;
      this.state = 'potion';
      if (this.storageManager) this.storageManager.saveProgress(this);
      return true;
    }
    return false;
  }

  upgradeCard(cardId) {
    if (!this.potionMode) return false;
    const card = this.hand.find(c => c && c.id === cardId);
    if (!card) return false;

    const effect = this.potionMode.effect;
    let mult = 2;
    if (effect === 'upgrade_face') {
      mult = card.isFace ? 3 : 2;
    }

    card.upgraded = true;
    const newMult = (card.upgradeMult || 1) * mult;
    card.upgradeMult = newMult;
    card.score = Math.floor(card.baseScore * newMult);

    if (this.audioManager) this.audioManager.play('upgrade');

    const existing = letterUpgrades.get(card.letter);
    const totalMult = existing ? existing.mult * mult : mult;
    letterUpgrades.set(card.letter, { mult: totalMult });

    this.potionMode = null;
    this.state = 'shop';
    if (this.storageManager) this.storageManager.saveProgress(this);
    return true;
  }

  nextRound() {
    if (this.audioManager) this.audioManager.play('levelup');
    
    this.roundScores.push({ round: this.round, score: this.score });
    this.round++;
    this.shopItems = null;
    this.resetRound();
  }

  getSelectedCards() {
    return this.selected.map(id => this.hand.find(c => c && c.id === id)).filter(Boolean);
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
  }
}

module.exports = { Game, calcWordScore, isValidWord, isValidWordOnline, getWordMeaning, formatMeaning, findValidWordInHand, findAllValidWordsInHand };
