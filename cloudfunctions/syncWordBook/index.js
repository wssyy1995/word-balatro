/**
 * 云函数：syncWordBook
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 接收前端传来的增量单词数据 { word: count }
 * 3. 使用 $inc 原子累加到 user_word_books 集合
 * 4. 自动计算 totalUnique（新增去重单词数）与 totalCount（总打出次数）
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'syncWordBook',
 *     data: { words: { hello: 1, world: 2 } }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[SyncWordBook] OPENID:', OPENID, '增量:', JSON.stringify(event.words));

  if (!OPENID) {
    console.error('[SyncWordBook] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const words = event.words || {};
  const entries = Object.entries(words).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return { code: 0, message: '无待同步单词' };
  }

  try {
    const res = await db.collection('user_word_books').where({
      _openid: OPENID
    }).get();

    const now = db.serverDate();

    if (res.data.length === 0) {
      // 新记录：首次创建
      const totalCount = entries.reduce((sum, [, count]) => sum + count, 0);
      const totalUnique = entries.length;
      await db.collection('user_word_books').add({
        data: {
          _openid: OPENID,
          words,
          totalUnique,
          totalCount,
          create_time: now,
          update_time: now,
        }
      });
      console.log('[SyncWordBook] 新记录已创建, totalUnique:', totalUnique, 'totalCount:', totalCount);
      return { code: 0, isNew: true, totalUnique, totalCount };
    }

    const record = res.data[0];
    const existingWords = record.words || {};

    // 计算新增去重单词数
    let addedUnique = 0;
    const updates = {};
    for (const [word, count] of entries) {
      if (!existingWords[word]) addedUnique++;
      updates[`words.${word}`] = _.inc(count);
    }
    const addedCount = entries.reduce((sum, [, count]) => sum + count, 0);

    updates.totalUnique = _.inc(addedUnique);
    updates.totalCount = _.inc(addedCount);
    updates.update_time = now;

    await db.collection('user_word_books').doc(record._id).update({
      data: updates
    });

    console.log('[SyncWordBook] 记录已更新, addedUnique:', addedUnique, 'addedCount:', addedCount);
    return { code: 0, isUpdated: true, addedUnique, addedCount };

  } catch (e) {
    console.error('[SyncWordBook] 数据库操作失败:', e);
    return { code: -1, message: e.message || '数据库操作失败' };
  }
};
