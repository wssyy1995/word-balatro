/**
 * 云函数：battleGet
 * 职责：查询房间状态
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { roomId } = event;
  console.log('[battleGet] 收到请求 OPENID=' + (OPENID || 'null') + ' roomId=' + (roomId || 'null'));
  if (!OPENID) return { code: -1, message: '无法获取 OPENID' };
  if (!roomId) return { code: -1, message: '房间号不能为空' };

  try {
    const roomRes = await db.collection('rooms').where({ roomId }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { code: -1, message: '房间不存在' };
    }

    return { code: 0, room: roomRes.data[0] };
  } catch (e) {
    console.error('[battleGet] 查询房间失败:', e);
    return { code: -1, message: e.message || '查询房间失败' };
  }
};
