/**
 * 云函数：login
 *
 * 职责：
 * 1. 获取用户 OPENID（静默）
 * 2. 若 users 表中无此用户，以 _id = OPENID 插入新记录（含 createTime + lastLoginTime），
 *    _id 唯一约束保证并发首次登录也只会有一条记录
 * 3. 若已存在，仅更新 lastLoginTime 和设备信息，createTime 保持不变；
 *    若存在同 _openid 的重复记录，保留 createTime 最早的一条并删除多余记录（自愈清理）
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
const _ = db.command;

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
    // 查询用户是否已存在（兼容旧数据：历史重复记录的 _id 是自动生成的）
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();
    console.log('[Login] 查询结果条数:', userRes.data.length);

    if (userRes.data.length > 0) {
      // 老用户：只更新 lastLoginTime 和设备信息
      // createTime 不在 update 字段列表中，因此永远不会被修改
      // 存在重复记录时保留 createTime 最早的一条，多余记录删除（自愈清理，保证一个 _openid 只有一条数据）
      const sorted = [...userRes.data].sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0));
      const keep = sorted[0];
      // 若保留记录缺头像/昵称而重复记录里有，先合并再删除，避免丢数据
      const profileSource = sorted.find(u => u.avatarUrl);
      const mergedProfile = (!keep.avatarUrl && profileSource)
        ? { avatarUrl: profileSource.avatarUrl, nickname: profileSource.nickname || '' }
        : {};
      await db.collection('users').doc(keep._id).update({
        data: {
          lastLoginTime: now,
          deviceInfo: deviceInfo,
          ...mergedProfile,
        }
      });
      if (sorted.length > 1) {
        const dupIds = sorted.slice(1).map(u => u._id);
        await db.collection('users').where({ _id: _.in(dupIds) }).remove();
        console.log('[Login] 清理重复用户记录:', dupIds.length, '条');
      }
      console.log('[Login] 老用户已更新:', OPENID);
      return { code: 0, isNew: false, openid: OPENID };
    }

    // 新用户：用 _id = OPENID 插入，_id 唯一约束保证并发调用也只会有一条记录
    // （并发首次登录时两个请求都会走到这里，同 _id 的 set 只会覆盖，不会插入第二条）
    await db.collection('users').doc(OPENID).set({
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
  } catch (e) {
    console.error('[Login] 数据库操作失败:', e);
    return { code: -1, message: e.message || '数据库操作失败' };
  }
};
