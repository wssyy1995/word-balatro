const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { nickname, avatarUrl } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, errMsg: '未获取到用户 OPENID' };
  }

  try {
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();

    if (userRes.data.length > 0) {
      const old = userRes.data[0];
      const updateData = { updateTime: db.serverDate() };
      if (nickname) updateData.nickname = nickname;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;
      await db.collection('users').doc(old._id).update({ data: updateData });
      return { success: true, updated: true };
    } else {
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          nickname: nickname || '匿名玩家',
          avatarUrl: avatarUrl || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
      return { success: true, updated: true };
    }
  } catch (e) {
    console.error('syncUserInfo error', e);
    return { success: false, errMsg: e.message };
  }
};
