/**
 * 云函数：updateBestRound
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 若 user_best_round 表中无此用户，插入新记录（best_round = 当前回合数）
 * 3. 若已存在，比较当前回合数与表中 best_round：
 *    - 当前回合数 > best_round：更新 best_round 和 update_time
 *    - 否则：不操作
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'updateBestRound',
 *     data: { round: number }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[UpdateBestRound] OPENID:', OPENID, '当前回合:', event.round);

  if (!OPENID) {
    console.error('[UpdateBestRound] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const round = event.round || 0;
  if (round <= 0) {
    return { code: -1, message: '回合数无效' };
  }

  const now = db.serverDate();

  try {
    // 查询用户是否已有记录
    const res = await db.collection('user_best_round').where({
      _openid: OPENID
    }).get();

    console.log('[UpdateBestRound] 查询结果条数:', res.data.length);

    if (res.data.length === 0) {
      // 新记录：首次创建
      await db.collection('user_best_round').add({
        data: {
          _openid: OPENID,
          best_round: round,
          create_time: now,
          update_time: now,
        }
      });
      console.log('[UpdateBestRound] 新记录已创建, best_round:', round);
      return { code: 0, isNew: true, bestRound: round };
    }

    const record = res.data[0];
    const currentBest = record.best_round || 0;

    if (round > currentBest) {
      // 当前回合数更大，更新记录
      await db.collection('user_best_round').doc(record._id).update({
        data: {
          best_round: round,
          update_time: now,
        }
      });
      console.log('[UpdateBestRound] 记录已更新, best_round:', currentBest, '->', round);
      return { code: 0, isUpdated: true, oldBest: currentBest, newBest: round };
    }

    // 无需更新
    console.log('[UpdateBestRound] 无需更新, 当前best_round:', currentBest, '本轮:', round);
    return { code: 0, isUpdated: false, bestRound: currentBest };

  } catch (e) {
    console.error('[UpdateBestRound] 数据库操作失败:', e);
    return { code: -1, message: e.message || '数据库操作失败' };
  }
};
