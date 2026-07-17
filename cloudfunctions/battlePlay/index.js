/**
 * 云函数：battlePlay
 * 职责：玩家出牌同步
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { roomId, word, cards, score, isTimeout } = event;
  console.log('[battlePlay] 收到请求 OPENID=' + (OPENID || 'null') + ' roomId=' + (roomId || 'null') + ' word=' + (word || 'null') + ' cardsCount=' + (Array.isArray(cards) ? cards.length : 'invalid') + ' score=' + (score !== undefined ? score : 'null') + ' isTimeout=' + !!isTimeout);
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };
  if (!roomId) {
    return { code: -1, message: '参数错误' };
  }
  // 超时出牌允许空 word / 空 cards；正常出牌必须校验
  if (!isTimeout && (!word || !Array.isArray(cards))) {
    return { code: -1, message: '参数错误' };
  }

  try {
    const roomRes = await db.collection('rooms').where({ roomId }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { code: -1, message: '房间不存在' };
    }
    const room = roomRes.data[0];
    console.log('[battlePlay] 查到房间 _id=' + room._id + ' status=' + room.status + ' host=' + (room.host || '').slice(-6) + ' guest=' + (room.guest || '').slice(-6) + ' currentRound=' + room.currentRound);
    if (room.status !== 'playing') return { code: -1, message: '房间未开始对局' };

    const isHost = room.host === OPENID;
    const isGuest = room.guest === OPENID;
    console.log('[battlePlay] 身份判断 isHost=' + isHost + ' isGuest=' + isGuest);
    if (!isHost && !isGuest) return { code: -1, message: '你不是房间玩家' };

    const playerKey = isHost ? 'hostPlay' : 'guestPlay';
    // 跨局防护：客户端上报的 gameId 与房间当前 gameId 不一致，说明是上一局的迟到/重试请求，
    // 拒绝写入，避免把上一局的出牌覆盖到新一局。
    if (room.gameId && event.gameId && room.gameId !== event.gameId) {
      console.log('[battlePlay] 拒绝跨局写入 roomGameId=' + room.gameId + ' clientGameId=' + event.gameId);
      return { code: -1, message: '对局已更替' };
    }
    const now = Date.now();
    const currentRound = room.currentRound || 1;
    const playData = { word: word || '', cards: cards || [], score: score || 0, openid: OPENID, time: now, round: currentRound, isTimeout: !!isTimeout };

    console.log('[battlePlay] 准备写入 playerKey=' + playerKey + ' word=' + word + ' round=' + currentRound);
    // 云数据库对 null 字段不能直接创建子字段，需先 remove 再 set
    await db.collection('rooms').doc(room._id).update({
      data: {
        [playerKey]: _.remove(),
        updateTime: now
      }
    });
    await db.collection('rooms').doc(room._id).update({
      data: {
        [playerKey]: playData,
        updateTime: now
      }
    });

    const updated = await db.collection('rooms').doc(room._id).get();
    console.log('[battlePlay] 写入后 hostPlay=' + (updated.data.hostPlay ? updated.data.hostPlay.word : 'null') + ' guestPlay=' + (updated.data.guestPlay ? updated.data.guestPlay.word : 'null'));
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battlePlay] 出牌同步失败:', e);
    return { code: -1, message: e.message || '出牌同步失败' };
  }
};
