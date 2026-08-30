/**
 * 云函数：syncSaveData
 *
 * 职责：用户游戏存档的云端备份与恢复（复用 users 表，新增 saveData 字段）
 *
 * action = 'upload'：
 *   前端定时（每 5 分钟）全量上传本地用户游戏数据快照（progress/settings/图鉴/引导/每日类等，
 *   不含 word_book——单词本已由 syncWordBook 增量同步到 user_word_books）。
 *   云端整体覆盖写入 users 文档的 saveData 字段（last-write-wins），并记录服务器时间 savedAt。
 *   OPENID 由云端 getWXContext 获取，前端不可传，防伪造。
 *
 * action = 'download'：
 *   返回该用户的 saveData；无记录时返回 null（不报错）。
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({ name: 'syncSaveData', data: { action: 'upload', saveData } })
 *   wx.cloud.callFunction({ name: 'syncSaveData', data: { action: 'download' } })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 单文档 512KB 限制，留有余量
const MAX_SAVE_DATA_SIZE = 400 * 1024;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    console.error('[SyncSaveData] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const action = event.action;

  if (action === 'upload') {
    const saveData = event.saveData;
    if (!saveData || typeof saveData !== 'object') {
      return { code: -1, message: 'saveData 无效' };
    }

    const size = JSON.stringify(saveData).length;
    if (size > MAX_SAVE_DATA_SIZE) {
      console.error('[SyncSaveData] saveData 过大:', size);
      return { code: -1, message: 'saveData 过大: ' + size };
    }

    try {
      const data = {
        saveData: Object.assign({}, saveData, { savedAt: db.serverDate() }),
      };
      const res = await db.collection('users').doc(OPENID).update({ data });
      if (res.stats.updated === 0) {
        // users 文档不存在（极端情况：login 尚未执行），直接创建
        await db.collection('users').doc(OPENID).set({
          data: Object.assign({
            _openid: OPENID,
            createTime: db.serverDate(),
            lastLoginTime: db.serverDate(),
          }, data),
        });
        console.log('[SyncSaveData] 用户文档不存在，已新建并写入 saveData:', OPENID);
      }
      console.log('[SyncSaveData] 上传成功, size:', size);
      return { code: 0, size };
    } catch (e) {
      console.error('[SyncSaveData] 上传失败:', e);
      return { code: -1, message: e.message || '数据库操作失败' };
    }
  }

  if (action === 'download') {
    try {
      const res = await db.collection('users').doc(OPENID).get();
      const saveData = (res.data && res.data.saveData) || null;
      console.log('[SyncSaveData] 下载:', saveData ? '有存档' : '无存档');
      return { code: 0, saveData };
    } catch (e) {
      // 文档不存在视为无存档，不报错
      console.log('[SyncSaveData] 用户文档不存在，无存档:', e.message);
      return { code: 0, saveData: null };
    }
  }

  return { code: -1, message: '未知 action: ' + action };
};
