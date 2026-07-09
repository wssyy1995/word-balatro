/**
 * 云函数：battleReady
 * 职责：好友对战玩家点击"准备/开始对战"后上报状态
 *       guest 点击后标记 guestReady = true
 *       host 点击后若 guestReady 为 true，则把房间状态改为 playing
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
    let updateData = { updateTime: now };

    if (isGuest) {
      updateData.guestReady = true;
      updateData.guestReadyAt = now;
      // 好友点击开始后，仅标记准备状态，不立即开始对战；
      // 双方客户端进入 10 秒倒计时，倒计时结束后由房主调用 battleStart 正式开始。
    } else if (isHost) {
      updateData.hostReady = true;
      // 房主不再通过点击开始对战；由客户端倒计时结束后调用 battleStart。
      // 保留 hostReady 字段用于状态记录。
    }

    await db.collection('rooms').doc(room._id).update({ data: updateData });
    const updated = await db.collection('rooms').doc(room._id).get();
    return { code: 0, room: updated.data };
  } catch (e) {
    console.error('[battleReady] 准备失败:', e);
    return { code: -1, message: e.message || '准备失败' };
  }
};
