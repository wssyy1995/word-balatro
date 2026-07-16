/**
 * 云函数：battleAcceptRestart
 * 职责：好友对战接受"重新开始此房间"邀请，重置房间为待开始状态
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

    const isHost = room.host === OPENID;
    const isGuest = room.guest === OPENID;
    if (!isHost && !isGuest) {
      return { code: -1, message: '你不是房间玩家' };
    }

    const req = room.restartRequest;
    if (!req || req.accepted) {
      return { code: -1, message: '没有有效的重开邀请' };
    }
    if (req.fromOpenId === OPENID) {
      return { code: -1, message: '不能邀请自己' };
    }

    const now = Date.now();
    const scores = {};
    if (room.host) scores[room.host] = 0;
    if (room.guest) scores[room.guest] = 0;

    await db.collection('rooms').doc(room._id).update({
      data: {
        status: 'ready',
        currentRound: 1,
        currentTurn: _.remove(),
        turnDeadline: _.remove(),
        hostPlay: _.remove(),
        guestPlay: _.remove(),
        scores,
        roundScores: {},
        playedWords: [],
        winner: null,
        guestReady: true,
        guestReadyAt: now,
        'restartRequest.accepted': true,
        'restartRequest.acceptedAt': now,
        updateTime: now
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battleAcceptRestart] 接受重开邀请失败:', e);
    return { code: -1, message: e.message || '接受重开邀请失败' };
  }
};
