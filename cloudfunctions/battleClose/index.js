/**
 * 云函数：battleClose
 *
 * 职责：房主或好友退出对战时，将房间状态标记为 closed，通知另一方对战结束。
 * 调用方式：wx.cloud.callFunction({ name: 'battleClose', data: { roomId: 'NB56AE' } })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { roomId } = event;

  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };
  if (!roomId) return { code: -1, message: '房间号不能为空' };

  try {
    const roomRes = await db.collection('rooms').where({ roomId }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { code: -1, message: '房间不存在' };
    }
    const room = roomRes.data[0];

    // 只有房间内的房主或好友可以关闭房间
    if (room.host !== OPENID && room.guest !== OPENID) {
      return { code: -1, message: '无权限操作该房间' };
    }

    // 只有 playing/ready/waiting 状态允许关闭
    if (room.status === 'closed') {
      return { code: 0, message: '房间已关闭', room };
    }
    if (!['waiting', 'ready', 'playing'].includes(room.status)) {
      return { code: -1, message: '房间当前状态不可关闭' };
    }

    const now = Date.now();
    await db.collection('rooms').doc(room._id).update({
      data: {
        status: 'closed',
        closedBy: OPENID,
        closeTime: now,
        updateTime: now
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, message: '房间已关闭', room: updated.data };
  } catch (e) {
    console.error('[battleClose] 关闭房间失败:', e);
    return { code: -1, message: e.message || '关闭房间失败' };
  }
};
