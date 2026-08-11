/**
 * 云函数：updateUserProfile
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 将用户授权获取的头像、昵称更新到 users 表
 * 3. 若 users 表无此用户，以 _id = OPENID 新建记录（_id 唯一约束防并发重复）；
 *    若存在同 _openid 的重复记录，保留 createTime 最早的一条并删除多余记录（自愈清理）
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
const _ = db.command;

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

    if (userRes.data.length > 0) {
      // 存在重复记录时保留 createTime 最早的一条，多余记录删除（自愈清理）
      const sorted = [...userRes.data].sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0));
      const keep = sorted[0];
      await db.collection('users').doc(keep._id).update({
        data: {
          avatarUrl,
          nickname,
          lastLoginTime: now,
        }
      });
      if (sorted.length > 1) {
        const dupIds = sorted.slice(1).map(u => u._id);
        await db.collection('users').where({ _id: _.in(dupIds) }).remove();
        console.log('[UpdateUserProfile] 清理重复用户记录:', dupIds.length, '条');
      }
      console.log('[UpdateUserProfile] 用户头像昵称已更新');
    } else {
      // 新用户：用 _id = OPENID 插入，_id 唯一约束保证并发调用也只会有一条记录
      await db.collection('users').doc(OPENID).set({
        data: {
          _openid: OPENID,
          avatarUrl,
          nickname,
          createTime: now,
          lastLoginTime: now,
        }
      });
      console.log('[UpdateUserProfile] 新用户已创建并保存头像昵称');
    }

    return { code: 0, message: '更新成功' };
  } catch (e) {
    console.error('[UpdateUserProfile] 更新失败', e);
    return { code: -1, message: e.message || '更新失败' };
  }
};
