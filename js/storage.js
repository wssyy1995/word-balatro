// ===== 本地存储管理器 =====
const { letterUpgrades } = require('./data');

class StorageManager {
  constructor() {
    this.prefix = 'word_balatro_';
  }

  // 设置存储项
  set(key, value) {
    try {
      wx.setStorageSync(this.prefix + key, value);
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  }

  // 获取存储项
  get(key, defaultValue = null) {
    try {
      return wx.getStorageSync(this.prefix + key) || defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  // 删除存储项
  remove(key) {
    try {
      wx.removeStorageSync(this.prefix + key);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 清空所有游戏数据（只清除 progress，不碰 card_book 等跨局持久化数据）
  clear() {
    try {
      wx.removeStorageSync(this.prefix + 'progress');
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 游戏进度存档 =====
  
  saveProgress(game) {
    // 防抖：500ms 内多次调用只保存最后一次
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._doSaveProgress(game);
    }, 500);
  }

  _doSaveProgress(game) {
    // 实例已销毁则跳过保存
    if (game._destroyed) return;
    const progress = {
      round: game.round,
      gold: game.gold,
      score: game.score,
      totalScore: game.totalScore,
      roundScores: game.roundScores,
      jokers: game.jokers,
      maxJokerSlots: game.maxJokerSlots,
      potions: game.potions || [],
      potionMode: game.potionMode || null,
      _prePotionState: game._prePotionState || null,
      _potionSelectedLetter: game._potionSelectedLetter || null,
      crystalEffects: game.crystalEffects || [],
      shopItems: game.shopItems,
      state: game.state,
      _shuffledSkills: game._shuffledSkills,
      discardsLeft: game.discardsLeft,
      handsLeft: game.handsLeft,
      hand: game.hand,
      deck: game.deck,
      selected: game.selected,
      baseHandSize: game.baseHandSize,
      extraHands: game.extraHands || 0,
      extraDiscards: game.extraDiscards || 0,
      extraSafety: game.extraSafety || 0,
      extraLetters: game.extraLetters || 0,
      witchSkillPassed: game.witchSkillPassed,
      _lifeExtensionBonus: game._lifeExtensionBonus || 0,
      target: game.target,
      _maxHandSize: game._maxHandSize,
      _seedMinLen: game._seedMinLen,
      _seedMaxLen: game._seedMaxLen,
      guidePhase: game.guidePhase,
      _guideOverlayStartTime: game._guideOverlayStartTime,
      letterUpgrades: [...letterUpgrades.entries()],
      timestamp: Date.now(),
      version: 1
    };
    return this.set('progress', progress);
  }

  loadProgress() {
    const progress = this.get('progress', null);
    if (!progress) return null;

    // 兼容旧存档
    if (progress.maxJokerSlots === undefined) {
      progress.maxJokerSlots = 4;
    }

    // 恢复模块级的 letterUpgrades
    letterUpgrades.clear();
    if (progress.letterUpgrades) {
      for (const [k, v] of progress.letterUpgrades) {
        letterUpgrades.set(k, v);
      }
    }

    return progress;
  }

  hasProgress() {
    return !!this.get('progress');
  }

  clearProgress() {
    return this.remove('progress');
  }

  // ===== 新手引导状态（独立于游戏进度，永久保留）=====
  saveGuidePhase(phase) {
    return this.set('guide_phase', phase);
  }

  loadGuidePhase() {
    return this.get('guide_phase', null);
  }

  // ===== 最高分 =====
  
  getHighScore() {
    return this.get('high_score', 0);
  }

  setHighScore(score) {
    const current = this.getHighScore();
    if (score > current) {
      this.set('high_score', score);
      return true;
    }
    return false;
  }

  // ===== 统计数据 =====
  
  getStats() {
    return this.get('stats', {
      totalGames: 0,
      totalScore: 0,
      highestRound: 0,
      totalWords: 0,
      totalDiscards: 0
    });
  }

  updateStats(game) {
    const stats = this.getStats();
    stats.totalGames++;
    stats.totalScore += game.totalScore;
    if (game.round > stats.highestRound) {
      stats.highestRound = game.round;
    }
    return this.set('stats', stats);
  }

  // ===== 卡牌图鉴解锁状态（跨局永久保留）=====

  saveCardBookUnlocked(unlocked) {
    return this.set('card_book_unlocked', unlocked);
  }

  loadCardBookUnlocked() {
    return this.get('card_book_unlocked', false);
  }

  // ===== 已收集女巫卡牌（跨局永久保留）=====

  saveCollectedWitchCards(cards) {
    // 深拷贝后存储，避免引用问题
    const toSave = Array.isArray(cards) ? [...cards] : [];
    console.log('[CardBook] saveCollectedWitchCards:', JSON.stringify(toSave));
    this.set('collected_witch_cards', toSave);
    // 写入后立即验证
    const verify = this.get('collected_witch_cards', []);
    console.log('[CardBook] saveCollectedWitchCards 验证:', JSON.stringify(verify));
    return JSON.stringify(toSave) === JSON.stringify(verify);
  }

  loadCollectedWitchCards() {
    const result = this.get('collected_witch_cards', []);
    // 防御性检查：确保返回的是数组
    const safe = Array.isArray(result) ? result : [];
    console.log('[CardBook] loadCollectedWitchCards:', JSON.stringify(safe));
    return safe;
  }

  // ===== 已装备女巫卡牌（跨局永久保留）=====

  saveEquippedWitchCard(level) {
    return this.set('equipped_witch_card', level);
  }

  loadEquippedWitchCard() {
    return this.get('equipped_witch_card', null);
  }

  // ===== 设置 =====

  getSettings() {
    return this.get('settings', {
      soundEnabled: true,
      musicEnabled: true,
      vibrationEnabled: true
    });
  }

  saveSettings(settings) {
    return this.set('settings', settings);
  }
}

module.exports = { StorageManager };
