/**
 * 云函数：battleRoom
 * 职责：创建好友对战房间
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };

  try {
    let roomId = generateRoomId();
    let exists = true;
    let retry = 0;
    while (exists && retry < 5) {
      const check = await db.collection('rooms').doc(roomId).get().catch(() => null);
      if (!check) {
        exists = false;
      } else {
        roomId = generateRoomId();
        retry++;
      }
    }

    const now = Date.now();
    await db.collection('rooms').doc(roomId).set({
      data: {
        _id: roomId,
        host: OPENID,
        hostReady: false,
        guest: null,
        guestReady: false,
        status: 'waiting', // waiting -> ready -> playing -> finished
        createTime: now,
        updateTime: now,
        round: 1,
        totalRounds: 10,
        playerCards: {},
        seedWords: [],
        playedWords: [],
        scores: { [OPENID]: 0 },
        roundScores: {},
        currentTurn: null,
        turnDeadline: null,
        winner: null
      }
    });

    return { code: 0, roomId };
  } catch (e) {
    console.error('[battleRoom] 创建房间失败:', e);
    return { code: -1, message: e.message || '创建房间失败' };
  }
};
