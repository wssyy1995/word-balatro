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

  // 清空所有游戏数据
  clear() {
    try {
      const keys = wx.getStorageInfoSync().keys;
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          wx.removeStorageSync(key);
        }
      });
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
      letterUpgrades: [...letterUpgrades.entries()],
      timestamp: Date.now()
    };
    return this.set('progress', progress);
  }

  loadProgress() {
    const progress = this.get('progress', null);
    if (progress && progress.maxJokerSlots === undefined) {
      progress.maxJokerSlots = 4;
    }
    return progress;
  }

  hasProgress() {
    return !!this.get('progress');
  }

  clearProgress() {
    return this.remove('progress');
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
