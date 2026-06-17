/**
 * 云函数：updateUserProfile
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 将用户授权获取的头像、昵称更新到 users 表
 * 3. 若 users 表无此用户，则新建记录
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'updateUserProfile',
 *     data: { avatarUrl: string, nickname: string }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[UpdateUserProfile] OPENID:', OPENID);

  if (!OPENID) {
    console.error('[UpdateUserProfile] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const { avatarUrl, nickname } = event || {};
  if (!avatarUrl || !nickname) {
    return { code: -1, message: '缺少头像或昵称' };
  }

  const now = db.serverDate();

  try {
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();

    if (userRes.data.length === 0) {
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          avatarUrl,
          nickname,
          createTime: now,
          lastLoginTime: now,
        }
      });
      console.log('[UpdateUserProfile] 新用户已创建并保存头像昵称');
    } else {
      await db.collection('users').doc(userRes.data[0]._id).update({
        data: {
          avatarUrl,
          nickname,
          lastLoginTime: now,
        }
      });
      console.log('[UpdateUserProfile] 用户头像昵称已更新');
    }

    return { code: 0, message: '更新成功' };
  } catch (e) {
    console.error('[UpdateUserProfile] 更新失败', e);
    return { code: -1, message: e.message || '更新失败' };
  }
};
