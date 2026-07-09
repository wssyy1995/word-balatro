/**
 * 云函数：getBattleOpponent
 *
 * 职责：根据对手 openid 查询头像、昵称、荣誉杯数量
 * 调用方式：wx.cloud.callFunction({ name: 'getBattleOpponent', data: { opponentOpenId: 'xxx' } })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function maskName(openid) {
  if (!openid || openid.length < 4) return '匿名玩家';
  return `玩家****${openid.slice(-4)}`;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { opponentOpenId } = event || {};

  if (!OPENID) {
    return { code: -1, message: '无法获取 OPENID' };
  }

  // 如果不传 opponentOpenId，则查询自己的信息（用于本地荣誉杯同步）
  const targetOpenId = opponentOpenId || OPENID;

  try {
    // 1. 查 users 表头像昵称
    const userRes = await db.collection('users').where({ _openid: targetOpenId }).get();
    const user = userRes.data && userRes.data[0] ? userRes.data[0] : {};

    // 2. 查 user_honor_trophy 表荣誉杯
    const trophyRes = await db.collection('user_honor_trophy').where({ _openid: targetOpenId }).get();
    const trophy = trophyRes.data && trophyRes.data[0] ? trophyRes.data[0] : {};

    return {
      code: 0,
      opponent: {
        openid: targetOpenId,
        avatarUrl: user.avatarUrl || '',
        nickname: user.nickname || maskName(targetOpenId),
        trophies: trophy.honor_trophy || 0
      }
    };
  } catch (e) {
    console.error('[GetBattleOpponent] 查询失败', e);
    return { code: -1, message: e.message || '查询失败' };
  }
};
