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
  
  saveProgress() {
    // 直接保存，不再防抖。微信小程序本地存储无需防抖，
    // 500ms 防抖反而引入致命竞态：旧实例/其他路径残留的定时器会覆盖正确存档。
    this._doSaveProgress();
  }

  saveProgressImmediate() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._doSaveProgress();
  }

  _doSaveProgress() {
    const game = wx.game;
    if (!game) return;
    // 实例已销毁则跳过保存
    if (game._destroyed) return;
    // 深拷贝 jokers/potions，彻底切断引用，避免保存后数组被意外修改
    const jokersSnapshot = JSON.parse(JSON.stringify(game.jokers || []));
    const potionsSnapshot = JSON.parse(JSON.stringify(game.potions || []));
    const progress = {
      round: game.round,
      gold: game.gold,
      score: game.score,
      totalScore: game.totalScore,
      roundScores: game.roundScores,
      jokers: jokersSnapshot,
      maxJokerSlots: game.maxJokerSlots,
      potions: potionsSnapshot,
      crystalEffects: game.crystalEffects || [],
      shopItems: game.shopItems,
      state: game.state === 'potion' ? (game._prePotionState || 'shop') : game.state,
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
      _witchSkillProtectUsed: game._witchSkillProtectUsed || false,
      _lifeExtensionBonus: game._lifeExtensionBonus || 0,
      target: game.target,
      _maxHandSize: game._maxHandSize,
      _seedMinLen: game._seedMinLen,
      _seedMaxLen: game._seedMaxLen,
      _lastInitialLetter: game._lastInitialLetter || null,
      _lastPlayedLetters: game._lastPlayedLetters ? [...game._lastPlayedLetters] : null,
      _shopDiscountActive: game._shopDiscountActive || false,
      _shopDiscountRate: game._shopDiscountRate || 0.6,
      _overflowBonus: game._overflowBonus || 0,
      settlementData: game.settlementData || null,
      guidePhase: game.guidePhase,
      _guideOverlayStartTime: game._guideOverlayStartTime,
      shopGuidePhase: game.shopGuidePhase,
      _shopGuideStartTime: game._shopGuideStartTime,
      _shopGuideTextStartTime: game._shopGuideTextStartTime,
      cardBookGuidePhase: game.cardBookGuidePhase,
      _cardBookGuideStartTime: game._cardBookGuideStartTime,
      _cardBookGuideTextStartTime: game._cardBookGuideTextStartTime,
      _cardBookGuideText2StartTime: game._cardBookGuideText2StartTime,
      _cardBookGuideExitStartTime: game._cardBookGuideExitStartTime,
      letterUpgrades: [...letterUpgrades.entries()],
      _dailyShareDate: game._dailyShareDate || null,
      _dailyShareCount: game._dailyShareCount || 0,
      timestamp: Date.now(),
      version: 1
    };
    this.set('progress', progress);
    // 回读验证，确认写入成功
    const verify = wx.getStorageSync(this.prefix + 'progress');
    // 回读验证成功（静默）
    return true;
  }

  _getGame() {
    return typeof wx !== 'undefined' ? wx.game : null;
  }

  loadProgress() {
    const progress = this.get('progress', null);
    if (!progress) return null;

    console.log('[Load] 读取存档 jokers:', JSON.stringify(progress.jokers), 'potions:', JSON.stringify(progress.potions));

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
    try {
      const value = wx.getStorageSync(this.prefix + 'guide_phase');
      return value !== undefined && value !== null && value !== '' ? value : null;
    } catch (e) {
      return null;
    }
  }

  // ===== 商店女巫技能引导（独立于游戏进度，永久保留）=====
  saveShopGuidePhase(phase) {
    return this.set('shop_guide_phase', phase);
  }

  loadShopGuidePhase() {
    return this.get('shop_guide_phase', null);
  }

  // ===== 卡牌图鉴引导（独立于游戏进度，永久保留）=====
  saveCardBookGuidePhase(phase) {
    return this.set('cardbook_guide_phase', phase);
  }

  loadCardBookGuidePhase() {
    return this.get('cardbook_guide_phase', null);
  }

  // ===== 女巫排序提示（仅弹一次）=====
  saveJokerSortHintShown(shown = true) {
    return this.set('joker_sort_hint_shown', shown);
  }

  loadJokerSortHintShown() {
    return this.get('joker_sort_hint_shown', false);
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

  // ===== 最佳回合 =====

  getBestRound() {
    return this.get('best_round', 0);
  }

  setBestRound(round) {
    const current = this.getBestRound();
    if (round > current) {
      this.set('best_round', round);
      return true;
    }
    return false;
  }

  // ===== 每日复活次数 =====

  saveDailyRevive(dateStr, used = true) {
    return this.set('daily_revive', { date: dateStr, used });
  }

  loadDailyRevive() {
    return this.get('daily_revive', null);
  }

  isDailyReviveUsed() {
    const data = this.loadDailyRevive();
    if (!data) return false;
    const today = new Date().toISOString().slice(0, 10);
    return data.date === today && data.used === true;
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

  saveEquippedWitchCard(levels) {
    return this.set('equipped_witch_card', levels);
  }

  loadEquippedWitchCard() {
    const loaded = this.get('equipped_witch_card', null);
    if (loaded === null) return [];
    if (typeof loaded === 'number') return [loaded];
    return Array.isArray(loaded) ? loaded : [];
  }

  // ===== 设置 =====

  getSettings() {
    const saved = this.get('settings', {});
    return {
      soundEnabled: true,
      musicEnabled: true,
      vibrationEnabled: true,
      dailyWordChallengeEnabled: false,
      dailyWordHintShown: false,
      ...saved
    };
  }

  saveSettings(settings) {
    return this.set('settings', settings);
  }

  // ===== 单词本（历史打出单词记录） =====
  // 结构：{ words: { word: count }, pending: { word: count }, lastSyncAt: number }

  getWordBook() {
    return this.get('word_book', { words: {}, pending: {}, lastSyncAt: 0 });
  }

  saveWordBook(wordBook) {
    return this.set('word_book', wordBook);
  }

  /**
   * 记录一个打出的合法单词
   * @param {string} word 单词（小写）
   * @returns {{ totalUnique: number, totalCount: number, isNew: boolean }}
   */
  addPlayedWord(word) {
    if (!word) return { totalUnique: 0, totalCount: 0, isNew: false };
    const lower = String(word).toLowerCase().trim();
    if (!lower) return { totalUnique: 0, totalCount: 0, isNew: false };

    const book = this.getWordBook();
    book.words = book.words || {};
    book.pending = book.pending || {};

    const isNew = !book.words[lower];
    book.words[lower] = (book.words[lower] || 0) + 1;
    book.pending[lower] = (book.pending[lower] || 0) + 1;

    this.saveWordBook(book);
    console.log('[WordBook] 本地更新:', lower, 'count:', book.words[lower], 'pending:', book.pending[lower]);

    return {
      totalUnique: Object.keys(book.words).length,
      totalCount: Object.values(book.words).reduce((sum, c) => sum + c, 0),
      isNew
    };
  }

  clearPendingWords() {
    const book = this.getWordBook();
    book.pending = {};
    book.lastSyncAt = Date.now();
    console.log('[WordBook] pending 已清空，lastSyncAt:', book.lastSyncAt);
    return this.saveWordBook(book);
  }

  // ===== 每日单词挑战 =====

  getDailyChallenge() {
    return this.get('daily_challenge', null);
  }

  saveDailyChallenge(data) {
    return this.set('daily_challenge', data);
  }

  clearDailyChallenge() {
    return this.remove('daily_challenge');
  }
}

module.exports = { StorageManager };
