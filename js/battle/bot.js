// ===== 对战模式 Bot AI =====
const { LETTER_SCORE } = require('../data');

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

module.exports = { BattleBot };
