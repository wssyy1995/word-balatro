// ===== 对战模式核心逻辑 =====
const { LETTER_SCORE, FACE_CARDS } = require('./data');

// Bot AI：根据手牌找最佳单词
class BattleBot {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
  }

  // 根据难度选择单词
  chooseWord(hand, wordData, expandWordData) {
    const validWords = this._findAllValidWords(hand, wordData, expandWordData);
    if (validWords.length === 0) return null;

    // 按分数排序
    validWords.sort((a, b) => b.score - a.score);

    switch (this.difficulty) {
      case 'easy':
        // 简单：随机选一个长度3-4的词
        const easyWords = validWords.filter(w => w.word.length >= 3 && w.word.length <= 4);
        if (easyWords.length > 0) {
          return easyWords[Math.floor(Math.random() * easyWords.length)];
        }
        //  fallback 到最短词
        return validWords[validWords.length - 1];
      case 'hard':
        // 困难：选最高分
        return validWords[0];
      case 'medium':
      default:
        // 中等：选最高分，但限制长度不超过6（模拟人类习惯）
        const mediumWords = validWords.filter(w => w.word.length <= 6);
        if (mediumWords.length > 0) {
          return mediumWords[0];
        }
        return validWords[0];
    }
  }

  // 找出所有可用当前手牌拼出的合法单词
  _findAllValidWords(hand, wordData, expandWordData) {
    const results = [];
    const seen = new Set();

    // 构建手牌字母计数
    const handCounts = {};
    for (const card of hand) {
      if (!card) continue;
      const l = card.letter.toLowerCase();
      handCounts[l] = (handCounts[l] || 0) + 1;
    }

    const allWords = [];
    if (wordData) {
      for (const word of wordData.keys()) {
        if (word.length >= 2) allWords.push(word);
      }
    }
    if (expandWordData) {
      for (const word of expandWordData.keys()) {
        if (word.length >= 2 && !seen.has(word)) {
          allWords.push(word);
          seen.add(word);
        }
      }
    }

    for (const word of allWords) {
      if (seen.has(word)) continue;
      const cards = this._canFormWord(word, hand);
      if (cards) {
        seen.add(word);
        const score = this._calcWordScore(cards);
        results.push({ word, cards, score });
      }
    }

    return results;
  }

  // 检查是否可以用手牌拼出单词，返回使用的卡牌数组
  _canFormWord(word, hand) {
    const cards = hand.filter(Boolean);
    const used = new Set();
    const result = [];

    for (const ch of word.toLowerCase()) {
      let found = false;
      for (let i = 0; i < cards.length; i++) {
        if (!used.has(i) && cards[i].letter.toLowerCase() === ch) {
          used.add(i);
          result.push(cards[i]);
          found = true;
          break;
        }
      }
      if (!found) return null;
    }

    return result;
  }

  // 计算单词分数（和单人模式一致）
  _calcWordScore(cards) {
    if (!cards || cards.length === 0) return 0;
    const mult = cards.length;
    let baseScore = 0;
    for (const c of cards) {
      baseScore += c.score || LETTER_SCORE[c.letter] || 1;
    }
    return Math.ceil(baseScore * mult);
  }
}

// 生成对战用的牌堆（简化版，无升级）
function createBattleDeck() {
  const LETTER_DISTRIBUTION = {
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9,
    J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6,
    S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1
  };
  const cards = [];
  for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      cards.push({
        letter,
        baseScore: LETTER_SCORE[letter] || 1,
        score: LETTER_SCORE[letter] || 1,
        isFace: FACE_CARDS.has(letter),
        id: Math.random().toString(36).substr(2, 9),
        selected: false,
      });
    }
  }
  // 洗牌
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

module.exports = { BattleBot, createBattleDeck, shuffle };
