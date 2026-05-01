// ===== 游戏核心逻辑 =====
const {
  LETTER_SCORE, LETTER_DISTRIBUTION, FACE_CARDS,
  DICTIONARY, COMMON_WORDS, WORD_DATA,
  SHOP_POOL, onlineWordCache, wordCheckState,
  wordMeaningCache, letterUpgrades
} = require('./data');
const { AnimationManager } = require('./animation');
const { AudioManager } = require('./audio');
const { StorageManager } = require('./storage');

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
  const candidates = [...DICTIONARY].filter(w => w.length >= minLen && w.length <= maxLen);
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
  const validInHand = findAllValidWordsInHand(hand);
  if (validInHand.length > 0) return;

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

  hand.push(...seedCards);

  while (hand.length > 9 && deck.length > 0) {
    deck.unshift(hand.pop());
  }
}

function findAllValidWordsInHand(hand) {
  const letters = hand.map(c => c.letter);
  const results = [];

  function* permute(arr, k) {
    if (k === 1) { yield [...arr]; return; }
    for (let i = 0; i < k; i++) {
      yield* permute(arr, k - 1);
      if (k % 2 === 0) [arr[i], arr[k - 1]] = [arr[k - 1], arr[i]];
      else [arr[0], arr[k - 1]] = [arr[k - 1], arr[0]];
    }
  }

  for (let len = 3; len <= Math.min(9, letters.length); len++) {
    const seen = new Set();
    const gens = [...permute([...letters], len)];
    for (const p of gens) {
      const word = p.join('').toLowerCase();
      if (seen.has(word)) continue;
      seen.add(word);
      if (DICTIONARY.has(word) || COMMON_WORDS.includes(word) || onlineWordCache.has(word)) {
        const indices = [];
        const used = new Set();
        for (const ch of p) {
          for (let i = 0; i < letters.length; i++) {
            if (!used.has(i) && letters[i] === ch) {
              used.add(i);
              indices.push(i);
              break;
            }
          }
        }
        const cards = indices.map(i => hand[i]);
        const preview = calcWordScore(cards, []);
        if (preview.valid) results.push({ word, cards, score: preview.score });
      }
    }
  }

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
  return DICTIONARY.has(word) || COMMON_WORDS.includes(word) || onlineWordCache.has(word);
}

async function isValidWordOnline(word) {
  word = word.toLowerCase();
  if (DICTIONARY.has(word)) return true;
  if (COMMON_WORDS.includes(word)) return true;
  if (onlineWordCache.has(word)) return true;

  try {
    const resp = await wx.request({
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
        wordMeaningCache.set(word, { entries, pos: entries[0]?.pos || '', meaning: entries[0]?.def || '' });
      }
      return true;
    }
  } catch (e) {
    // 网络请求失败
  }

  wordCheckState.set(word, 'invalid');
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
    this.roundScores = [];
    this.animManager = new AnimationManager();
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
    this.handsLeft = 999;
    this.discardsLeft = 3 + this.extraDiscards;
    this.extraDiscards = 0;
    this.extraSafety = 0;
    this.state = 'playing';
  }

  toggleSelect(cardId) {
    const idx = this.selected.indexOf(cardId);
    const card = this.hand.find(c => c.id === cardId);
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

  async playHand() {
    if (this.selected.length < 3) return { valid: false };
    const played = this.hand.filter(c => c.selected);
    const word = played.map(c => c.letter.toLowerCase()).join('');

    let valid = isValidWord(word);
    if (!valid) valid = await isValidWordOnline(word);
    if (!valid) {
      if (this.audioManager) this.audioManager.play('invalid');
      return { valid: false, word: played.map(c => c.letter).join('') };
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
      if (c.selected) {
        removedIndices.push(i);
        playedCards.push(c);
      }
    });

    this.hand = this.hand.filter(c => !c.selected);
    ensureValidWordInHand(this.deck, this.hand);
    const need = Math.min(9 - this.hand.length, this.deck.length);
    const newCards = this.deck.splice(0, need);

    const sortedIndices = [...removedIndices].sort((a, b) => a - b);
    for (let i = 0; i < sortedIndices.length && i < newCards.length; i++) {
      const idx = sortedIndices[i];
      newCards[i].newCard = true;
      newCards[i].flyDir = idx <= 4 ? 'left' : 'right';
      this.hand.splice(idx, 0, newCards[i]);
    }
    for (let i = sortedIndices.length; i < newCards.length; i++) {
      newCards[i].newCard = true;
      newCards[i].flyDir = 'left';
      this.hand.push(newCards[i]);
    }

    this.selected = [];
    this.hand.forEach(c => { c.selected = false; });

    if (this.score >= this.target) {
      this.state = 'shop';
      this.gold += 3 + this.round;
    }
    if (this.storageManager) this.storageManager.saveProgress(this);
    return result;
  }

  discard() {
    if (this.discardsLeft <= 0 || this.selected.length === 0) return false;
    
    if (this.audioManager) this.audioManager.play('discard');
    
    const removedIndices = [];
    this.hand.forEach((c, i) => { if (c.selected) removedIndices.push(i); });

    this.hand = this.hand.filter(c => !c.selected);
    ensureValidWordInHand(this.deck, this.hand);
    const need = Math.min(9 - this.hand.length, this.deck.length);
    const newCards = this.deck.splice(0, need);

    const sortedIndices = [...removedIndices].sort((a, b) => a - b);
    for (let i = 0; i < sortedIndices.length && i < newCards.length; i++) {
      const idx = sortedIndices[i];
      newCards[i].newCard = true;
      newCards[i].flyDir = idx <= 4 ? 'left' : 'right';
      this.hand.splice(idx, 0, newCards[i]);
    }
    for (let i = sortedIndices.length; i < newCards.length; i++) {
      newCards[i].newCard = true;
      newCards[i].flyDir = 'left';
      this.hand.push(newCards[i]);
    }

    this.discardsLeft--;
    this.selected = [];
    this.hand.forEach(c => { c.selected = false; });
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
    const card = this.hand.find(c => c.id === cardId);
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
    return this.hand.filter(c => this.selected.includes(c.id));
  }

  update(deltaTime) {
    // 更新动画
    if (this.animManager) {
      this.animManager.update(Date.now());
    }
  }
}

module.exports = { Game, calcWordScore, isValidWord, getWordMeaning, formatMeaning, findValidWordInHand, findAllValidWordsInHand };
