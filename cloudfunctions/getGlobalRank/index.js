const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const limit = event.limit || 50;

  try {
    // 查询前 N 名
    const topRes = await db.collection('rankings')
      .orderBy('score', 'desc')
      .limit(limit)
      .get();

    // 从 users 集合补查昵称头像（兼容旧数据）
    const openids = topRes.data.map(item => item._openid).filter(Boolean);
    let userMap = {};
    if (openids.length > 0) {
      try {
        const userRes = await db.collection('users')
          .where({ _openid: db.command.in(openids) })
          .get();
        userRes.data.forEach(u => {
          userMap[u._openid] = u;
        });
      } catch (e) {
        console.error('getGlobalRank 补查 users 失败', e);
      }
    }

    const list = topRes.data.map((item, index) => ({
      rank: index + 1,
      openid: item._openid,
      nickname: item.nickname || (userMap[item._openid]?.nickname) || '匿名玩家',
      avatarUrl: item.avatarUrl || (userMap[item._openid]?.avatarUrl) || '',
      score: item.score || 0
    }));

    // 查询自己的排名
    let selfRank = null;
    let selfData = null;
    if (OPENID) {
      const selfRes = await db.collection('rankings').where({ _openid: OPENID }).get();
      if (selfRes.data.length > 0) {
        selfData = selfRes.data[0];
        const countRes = await db.collection('rankings')
          .where({ score: _.gt(selfData.score) })
          .count();
        selfRank = countRes.total + 1;
      }
    }

    return {
      success: true,
      list,
      selfRank,
      selfData: selfData ? {
        openid: selfData._openid,
        nickname: selfData.nickname || '匿名玩家',
        avatarUrl: selfData.avatarUrl || '',
        score: selfData.score || 0
      } : null
    };
  } catch (e) {
    console.error('getGlobalRank error', e);
    return { success: false, errMsg: e.message };
  }
};
