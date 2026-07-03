/**
 * 云函数：battleJoin
 * 职责：加入好友对战房间
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

    if (room.status !== 'waiting') {
      return { code: -1, message: '房间已开始或已结束' };
    }
    if (room.host === OPENID) {
      return { code: 0, roomId, role: 'host', room };
    }
    if (room.guest && room.guest !== OPENID) {
      return { code: -1, message: '房间已满' };
    }

    const now = Date.now();
    await db.collection('rooms').doc(room._id).update({
      data: {
        guest: OPENID,
        status: 'ready',
        updateTime: now,
        [`scores.${OPENID}`]: 0
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, roomId, role: 'guest', room: updated.data };
  } catch (e) {
    console.error('[battleJoin] 加入房间失败:', e);
    return { code: -1, message: e.message || '加入房间失败' };
  }
};
