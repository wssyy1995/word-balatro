const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { score, nickname, avatarUrl } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID || typeof score !== 'number') {
    return { success: false, errMsg: '参数错误' };
  }

  try {
    const userRes = await db.collection('rankings').where({ _openid: OPENID }).get();

    if (userRes.data.length > 0) {
      const old = userRes.data[0];
      // 只更新最高分
      if (score > (old.score || 0)) {
        await db.collection('rankings').doc(old._id).update({
          data: {
            score,
            updateTime: db.serverDate(),
            ...(nickname ? { nickname } : {}),
            ...(avatarUrl ? { avatarUrl } : {})
          }
        });
        return { success: true, updated: true, isNewRecord: true };
      }
      return { success: true, updated: false, isNewRecord: false };
    } else {
      // 首次上传
      await db.collection('rankings').add({
        data: {
          _openid: OPENID,
          score,
          nickname: nickname || '匿名玩家',
          avatarUrl: avatarUrl || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
      return { success: true, updated: true, isNewRecord: true };
    }
  } catch (e) {
    console.error('updateRank error', e);
    return { success: false, errMsg: e.message };
  }
};
