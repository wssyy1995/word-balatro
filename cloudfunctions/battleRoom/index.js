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

async function ensureCollection() {
  try {
    await db.createCollection('rooms');
  } catch (e) {
    // 集合已存在或其他错误，忽略
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };

  try {
    await ensureCollection();

    let roomId = generateRoomId();
    let exists = true;
    let retry = 0;
    while (exists && retry < 5) {
      const check = await db.collection('rooms').where({ roomId }).get();
      if (!check.data || check.data.length === 0) {
        exists = false;
      } else {
        roomId = generateRoomId();
        retry++;
      }
    }

    const now = Date.now();
    const addRes = await db.collection('rooms').add({
      data: {
        roomId: roomId,
        host: OPENID,
        hostReady: false,
        guest: null,
        guestReady: false,
        status: 'waiting',
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

    return { code: 0, roomId: roomId, _id: addRes._id };
  } catch (e) {
    console.error('[battleRoom] 创建房间失败:', e);
    return { code: -1, message: e.message || '创建房间失败' };
  }
};
