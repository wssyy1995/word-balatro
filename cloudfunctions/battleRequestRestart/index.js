/**
 * 云函数：battleRequestRestart
 * 职责：好友对战结束弹窗中，任意一方发起"重新开始此房间"邀请
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

    const isHost = room.host === OPENID;
    const isGuest = room.guest === OPENID;
    if (!isHost && !isGuest) {
      return { code: -1, message: '你不是房间玩家' };
    }

    const now = Date.now();
    const restartRequest = {
      fromOpenId: OPENID,
      fromSide: isHost ? 'host' : 'guest',
      timestamp: now,
      accepted: false,
      acceptedAt: null
    };

    await db.collection('rooms').doc(room._id).update({
      data: {
        restartRequest,
        updateTime: now
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battleRequestRestart] 发起重开邀请失败:', e);
    return { code: -1, message: e.message || '发起重开邀请失败' };
  }
};
