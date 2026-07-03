/**
 * 云函数：battlePlay
 * 职责：玩家出牌同步
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { roomId, word, cards, score } = event;
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };
  if (!roomId || !word || !Array.isArray(cards)) {
    return { code: -1, message: '参数错误' };
  }

  try {
    const roomRes = await db.collection('rooms').where({ roomId }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { code: -1, message: '房间不存在' };
    }
    const room = roomRes.data[0];
    if (room.status !== 'playing') return { code: -1, message: '房间未开始对局' };

    const isHost = room.host === OPENID;
    const isGuest = room.guest === OPENID;
    if (!isHost && !isGuest) return { code: -1, message: '你不是房间玩家' };

    const playerKey = isHost ? 'hostPlay' : 'guestPlay';
    const now = Date.now();

    await db.collection('rooms').doc(room._id).update({
      data: {
        [playerKey]: { word, cards, score, openid: OPENID, time: now },
        updateTime: now
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battlePlay] 出牌同步失败:', e);
    return { code: -1, message: e.message || '出牌同步失败' };
  }
};
