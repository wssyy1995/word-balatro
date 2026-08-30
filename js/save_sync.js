// ===== 存档云端同步管理器 =====
// 复用 users 表 saveData 字段做全量快照备份：
// - 上传：游戏内每 5 分钟定时上传 + 切后台（wx.onHide）时强制上传，全量覆盖（last-write-wins）
// - 恢复：仅当游戏启动时本地无可用存档，才从云端拉取并写回本地存储
// 注意：word_book 不上传（已有 syncWordBook 增量同步到 user_word_books 集合）
const { StorageManager } = require('./storage');

const SYNC_INTERVAL = 5 * 60 * 1000; // 定时上传间隔：5 分钟
const RESTORE_TIMEOUT = 5000;        // 启动时云端恢复最长等待，超时则按无存档继续

// saveData 字段 → 本地存储键（storage 前缀 word_balatro_）映射
const KEY_MAP = {
  progress: 'progress',
  settings: 'settings',
  highScore: 'high_score',
  bestRound: 'best_round',
  stats: 'stats',
  cardBookUnlocked: 'card_book_unlocked',
  collectedWitchCards: 'collected_witch_cards',
  equippedWitchCard: 'equipped_witch_card',
  guidePhase: 'guide_phase',
  shopGuidePhase: 'shop_guide_phase',
  cardBookGuidePhase: 'cardbook_guide_phase',
  jokerSortHintShown: 'joker_sort_hint_shown',
  roundEntered: 'round_entered',
  honorTrophies: 'honor_trophies',
  dailyRevive: 'daily_revive',
  dailyChallenge: 'daily_challenge',
  goldenWord: 'golden_word',
  goldenWordCalendar: 'golden_word_calendar',
  dailyAchievements: 'daily_achievements_v2',
};

class SaveSyncManager {
  constructor() {
    this.storage = new StorageManager();
    this._timer = null;
    this._uploading = false;
    this._pendingUpload = false; // 上传在途时收到新上传请求，完成后用最新数据补传一次
  }

  // 打包当前所有需要云端备份的用户数据
  buildSaveData() {
    const s = this.storage;
    return {
      version: 1,
      clientTime: Date.now(),
      progress: s.get('progress', null),
      settings: s.get('settings', null),
      highScore: s.get('high_score', null),
      bestRound: s.get('best_round', null),
      stats: s.get('stats', null),
      cardBookUnlocked: s.get('card_book_unlocked', null),
      collectedWitchCards: s.get('collected_witch_cards', null),
      equippedWitchCard: s.get('equipped_witch_card', null),
      guidePhase: s.get('guide_phase', null),
      shopGuidePhase: s.get('shop_guide_phase', null),
      cardBookGuidePhase: s.get('cardbook_guide_phase', null),
      jokerSortHintShown: s.get('joker_sort_hint_shown', null),
      roundEntered: s.get('round_entered', null),
      honorTrophies: s.get('honor_trophies', null),
      dailyRevive: s.get('daily_revive', null),
      dailyChallenge: s.get('daily_challenge', null),
      goldenWord: s.get('golden_word', null),
      goldenWordCalendar: s.get('golden_word_calendar', null),
      dailyAchievements: s.get('daily_achievements_v2', null),
    };
  }

  // 全量上传（fire-and-forget，失败仅记日志，等待下个周期重试）
  uploadSave() {
    if (this._uploading) {
      // 上一次上传仍在进行：标记待补传，完成后用最新数据立即重传，
      // 避免在途旧快照晚于新快照到达而把云端覆盖回旧数据
      this._pendingUpload = true;
      return;
    }
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return;
    const game = wx.game;
    if (!game || game._destroyed) return;

    const saveData = this.buildSaveData();
    // 本地还没有存档（新用户未开始游戏）时不上传，避免空快照覆盖云端
    if (!saveData.progress) return;

    this._uploading = true;
    // 看门狗：iOS 上云函数回调可能完全丢失（README 有 battleNextRound 同款记录），
    // 15 秒后强制复位锁，避免定时上传永久停摆
    setTimeout(() => { this._uploading = false; }, 15000);
    wx.cloud.callFunction({
      name: 'syncSaveData',
      data: { action: 'upload', saveData },
    }).then(res => {
      if (res.result && res.result.code === 0) {
        console.log('[SaveSync] 定时上传成功, size:', res.result.size);
      } else {
        console.warn('[SaveSync] 上传业务失败:', res.result);
      }
    }).catch(err => {
      console.error('[SaveSync] 上传调用失败:', err);
    }).then(() => {
      this._uploading = false;
      if (this._pendingUpload) {
        this._pendingUpload = false;
        this.uploadSave();
      }
    });
  }

  // 启动定时上传（幂等，重复调用不会叠加定时器）
  startAutoUpload() {
    if (this._timer) return;
    this._timer = setInterval(() => this.uploadSave(), SYNC_INTERVAL);
    console.log('[SaveSync] 定时上传已启动，间隔', SYNC_INTERVAL / 1000, '秒');
  }

  // 启动时恢复：本地无可用存档时调用，从云端拉取 saveData 并写回本地存储
  // 返回 true 表示恢复成功；云端无存档/超时/失败均返回 false（按无存档继续启动）
  async tryRestoreFromCloud() {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return false;
    try {
      const res = await Promise.race([
        wx.cloud.callFunction({
          name: 'syncSaveData',
          data: { action: 'download' },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('restore timeout')), RESTORE_TIMEOUT)),
      ]);
      const saveData = res && res.result && res.result.saveData;
      if (!saveData || !saveData.progress) {
        console.log('[SaveSync] 云端无可用存档，按新游戏启动');
        return false;
      }
      // 云端存档可能备份于很久以前：刷新 timestamp，避免写回后被 initGameInstance 的
      // 7 天过期规则立即清理（云端恢复的目的就是让回归玩家找回旧进度；
      // 仅影响云端恢复路径，本地存档的过期判定逻辑不变）
      if (typeof saveData.progress === 'object') {
        saveData.progress.timestamp = Date.now();
      }
      Object.keys(KEY_MAP).forEach(field => {
        const value = saveData[field];
        if (value !== undefined && value !== null) {
          this.storage.set(KEY_MAP[field], value);
        }
      });
      console.log('[SaveSync] 云端存档已恢复到本地, 回合:', saveData.progress.round);
      return true;
    } catch (e) {
      console.error('[SaveSync] 云端恢复失败:', e);
      return false;
    }
  }
}

module.exports = { SaveSyncManager };
