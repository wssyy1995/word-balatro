/**
 * 云函数：updateHonorTrophy
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 客户端传来本地累计荣誉杯数 count（对战每胜一场本地 +1 后上传总数）
 * 3. user_honor_trophy 表中无此用户：插入新记录（honor_trophy = count）
 * 4. 已存在：取 max(已有, count) 更新，保证幂等——重试 / 重复调用不会重复计数或回退
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'updateHonorTrophy',
 *     data: { count: number }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[UpdateHonorTrophy] OPENID:', OPENID, 'count:', event.count);

  if (!OPENID) {
    console.error('[UpdateHonorTrophy] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const count = Math.floor(event.count || 0);
  if (count <= 0) {
    return { code: -1, message: '荣誉杯数无效' };
  }

  const now = db.serverDate();

  try {
    // 查询用户是否已有记录
    const res = await db.collection('user_honor_trophy').where({
      _openid: OPENID
    }).get();

    console.log('[UpdateHonorTrophy] 查询结果条数:', res.data.length);

    if (res.data.length === 0) {
      // 新记录：首次创建
      await db.collection('user_honor_trophy').add({
        data: {
          _openid: OPENID,
          honor_trophy: count,
          create_time: now,
          update_time: now,
        }
      });
      console.log('[UpdateHonorTrophy] 新记录已创建, honor_trophy:', count);
      return { code: 0, isNew: true, honorTrophy: count };
    }

    const record = res.data[0];
    const current = record.honor_trophy || 0;

    if (count > current) {
      // 客户端总数更大，更新记录
      await db.collection('user_honor_trophy').doc(record._id).update({
        data: {
          honor_trophy: count,
          update_time: now,
        }
      });
      console.log('[UpdateHonorTrophy] 记录已更新, honor_trophy:', current, '->', count);
      return { code: 0, isUpdated: true, oldCount: current, newCount: count };
    }

    // 无需更新
    console.log('[UpdateHonorTrophy] 无需更新, 当前honor_trophy:', current, '本次:', count);
    return { code: 0, isUpdated: false, honorTrophy: current };

  } catch (e) {
    console.error('[UpdateHonorTrophy] 数据库操作失败:', e);
    return { code: -1, message: e.message || '数据库操作失败' };
  }
};
