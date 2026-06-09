/**
 * 云函数：login
 *
 * 职责：
 * 1. 获取用户 OPENID（静默）
 * 2. 若 users 表中无此用户，插入新记录（含 createTime + lastLoginTime）
 * 3. 若已存在，仅更新 lastLoginTime 和设备信息，createTime 保持不变
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'login',
 *     data: { brand, model, system, platform, language, version, SDKVersion, screenWidth, screenHeight, pixelRatio }
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID, UNIONID, APPID } = cloud.getWXContext();
  console.log('[Login] OPENID:', OPENID, 'UNIONID:', UNIONID);

  if (!OPENID) {
    console.error('[Login] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  const now = db.serverDate();

  // 从前端传入的设备/环境信息
  const deviceInfo = {
    brand: event.brand || '',
    model: event.model || '',
    system: event.system || '',
    platform: event.platform || '',
    language: event.language || '',
    wechatVersion: event.version || '',
    SDKVersion: event.SDKVersion || '',
    screenWidth: event.screenWidth || 0,
    screenHeight: event.screenHeight || 0,
    pixelRatio: event.pixelRatio || 1,
  };

  try {
    // 查询用户是否已存在
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();
    console.log('[Login] 查询结果条数:', userRes.data.length);

    if (userRes.data.length === 0) {
      // 新用户：首次创建，createTime 与 lastLoginTime 同时写入
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          unionid: UNIONID || '',
          appid: APPID || '',
          createTime: now,
          lastLoginTime: now,
          deviceInfo: deviceInfo,
        }
      });
      console.log('[Login] 新用户已创建:', OPENID);
      return { code: 0, isNew: true, openid: OPENID };
    } else {
      // 老用户：只更新 lastLoginTime 和设备信息
      // createTime 不在 update 字段列表中，因此永远不会被修改
      const userId = userRes.data[0]._id;
      await db.collection('users').doc(userId).update({
        data: {
          lastLoginTime: now,
          deviceInfo: deviceInfo,
        }
      });
      console.log('[Login] 老用户已更新:', OPENID);
      return { code: 0, isNew: false, openid: OPENID };
    }
  } catch (e) {
    console.error('[Login] 数据库操作失败:', e);
    return { code: -1, message: e.message || '数据库操作失败' };
  }
};
