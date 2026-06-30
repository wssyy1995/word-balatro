// ===== 每日成就系统 =====

const DAILY_TASKS = [
  { id: 'consecutiveRounds', icon: '🔥', imgKey: 'study_toast_star', name: '连续闯关 10 回合', target: 10, reward: 30, progressKey: 'consecutiveRounds' },
  { id: 'potionsUsed', icon: '🧪', imgKey: 'potion', name: '使用 5 张魔法药水牌', target: 5, reward: 10, progressKey: 'potionsUsed' },
  { id: 'sharedToFriends', icon: '🔗', imgKey: 'share', name: '分享给好友', target: 1, reward: 10, progressKey: 'sharedToFriends' },
  { id: 'gamesCompleted', icon: '⚔️', imgKey: 'battle_vs', name: '完成 3 局双人对战', target: 3, reward: 15, progressKey: 'gamesCompleted' },
  { id: 'battleWins', icon: '🏆', imgKey: 'battle_hornor_trophy', name: '赢得 1 局对战模式', target: 1, reward: 10, progressKey: 'battleWins' }

];

class DailyAchievements {
  constructor(game, autoLoad = false) {
    this.game = game;
    this.storageKey = 'daily_achievements_v2';
    if (autoLoad) {
      this.load();
    }
  }

  // 获取今日日期字符串 YYYY-MM-DD
  _getToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 从本地存储恢复每日成就
  load() {
    const storage = this.game && this.game.storageManager;
    if (!storage) return;

    const saved = storage.get(this.storageKey);
    if (!saved || !saved.records) {
      this._ensureInit();
      return;
    }

    const today = this._getToday();
    const validRecords = {};
    let hasExpired = false;

    Object.keys(saved.records).forEach(index => {
      const record = saved.records[index];
      if (record && record.completedDate === today) {
        validRecords[index] = record;
      } else {
        hasExpired = true;
      }
    });

    // 所有记录都过期，删除存储
    if (hasExpired && Object.keys(validRecords).length === 0) {
      storage.remove(this.storageKey);
      this._ensureInit();
      return;
    }

    // 恢复到游戏内存
    this._ensureInit();
    const achievements = this.game._dailyAchievements;
    achievements.claimed = {};

    Object.keys(validRecords).forEach(indexStr => {
      const index = parseInt(indexStr, 10);
      const record = validRecords[indexStr];
      const task = DAILY_TASKS[index];
      if (!task) return;

      // 恢复进度：优先用保存的进度，未保存则按完成状态给目标值
      if (typeof record.progress === 'number') {
        achievements[task.progressKey] = record.progress;
      } else if (record.completed) {
        achievements[task.progressKey] = task.target;
      }

      // 恢复领取状态
      if (record.claimed) {
        achievements.claimed[index] = true;
      }
    });
  }

  // 保存每日成就到本地存储
  save() {
    const storage = this.game && this.game.storageManager;
    if (!storage) return;

    const today = this._getToday();
    const records = {};
    const tasks = this.getTasks();

    tasks.forEach(task => {
      if (task.isCompleted || task.current > 0) {
        records[task.index] = {
          name: task.name,
          completed: task.isCompleted,
          completedDate: today,
          claimed: task.isClaimed,
          progress: task.current
        };
      }
    });

    if (Object.keys(records).length === 0) {
      storage.remove(this.storageKey);
      return;
    }

    storage.set(this.storageKey, {
      records,
      savedAt: Date.now()
    });
  }

  _ensureInit() {
    this.game._dailyAchievements = this.game._dailyAchievements || {};
    if (!this.game._dailyAchievements.claimed) {
      this.game._dailyAchievements.claimed = {};
    }
  }

  // 获取当前任务列表（包含进度、完成状态、领取状态）
  getTasks() {
    const achievements = this.game._dailyAchievements || {};
    return DAILY_TASKS.map((task, index) => ({
      ...task,
      index,
      current: achievements[task.progressKey] || 0,
      isCompleted: (achievements[task.progressKey] || 0) >= task.target,
      isClaimed: !!(achievements.claimed && achievements.claimed[index])
    }));
  }

  // 获取单个任务
  getTask(index) {
    const tasks = this.getTasks();
    return tasks[index] || null;
  }

  // 判断某项成就是否已完成
  isCompleted(index) {
    const task = DAILY_TASKS[index];
    if (!task) return false;
    const achievements = this.game._dailyAchievements || {};
    return (achievements[task.progressKey] || 0) >= task.target;
  }

  // 判断某项奖励是否已领取
  isClaimed(index) {
    const achievements = this.game._dailyAchievements || {};
    return !!(achievements.claimed && achievements.claimed[index]);
  }

  // 领取某项奖励，返回奖励金币数；不可领取时返回 null
  claim(index) {
    if (!this.isCompleted(index)) return null;
    if (this.isClaimed(index)) return null;
    this._ensureInit();
    const achievements = this.game._dailyAchievements;
    achievements.claimed = achievements.claimed || {};
    achievements.claimed[index] = true;
    this.save();
    const task = DAILY_TASKS[index];
    return task ? task.reward : 0;
  }

  // 增加某项进度
  addProgress(key, value = 1) {
    this._ensureInit();
    const achievements = this.game._dailyAchievements;
    achievements[key] = (achievements[key] || 0) + value;
    this.save();
  }

  // 设置某项进度为当前值和传入值的较大者（适合最高分等）
  setProgress(key, value) {
    this._ensureInit();
    const achievements = this.game._dailyAchievements;
    achievements[key] = Math.max(achievements[key] || 0, value);
    this.save();
  }

  // 是否有已完成但未领取的奖励
  hasUnclaimedReward() {
    return this.getTasks().some(task => task.isCompleted && !task.isClaimed);
  }

  // 重置每日进度（新的一天调用）
  resetDaily() {
    this.game._dailyAchievements = {
      claimed: {}
    };
    this.save();
  }
}

module.exports = { DailyAchievements, DAILY_TASKS };
