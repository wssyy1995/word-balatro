/**
 * 云函数：getGlobalRank
 *
 * 职责：
 * 1. 获取用户 OPENID
 * 2. 查询 user_best_round 表，按 best_round 降序取 Top 50
 * 3. 根据 openid 关联 user_word_books 表的 totalUnique（单词量）
 * 4. 根据 openid 关联 users 表的头像昵称；未授权则使用默认头像 + 脱敏名称
 * 5. 计算当前玩家自己的全球排名（best_round 比自己高的人数 + 1）
 * 6. 返回 { topList: Top50数组, self: 自己排名信息 }
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({ name: 'getGlobalRank', data: {} })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function maskName(openid) {
  if (!openid || openid.length < 4) return '匿名玩家';
  return `玩家****${openid.slice(-4)}`;
}

function formatRecord(raw, idx, openid, userMap, wordMap, selfOpenid) {
  const user = userMap[openid] || {};
  return {
    rank: idx + 1,
    openid,
    bestRound: raw.best_round || 0,
    wordCount: wordMap[openid] || 0,
    avatarUrl: user.avatarUrl || '',
    nickname: user.nickname || maskName(openid),
    isSelf: openid === selfOpenid,
  };
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[GetGlobalRank] OPENID:', OPENID);

  if (!OPENID) {
    console.error('[GetGlobalRank] 无法获取 OPENID');
    return { code: -1, message: '无法获取 OPENID' };
  }

  try {
    // 1. 取 Top 50 最高回合
    const topRes = await db.collection('user_best_round')
      .orderBy('best_round', 'desc')
      .limit(50)
      .get();

    const topData = topRes.data || [];
    const topOpenids = topData.map(d => d._openid);

    // 2. 批量查这 50 人的单词量
    let wordMap = {};
    if (topOpenids.length > 0) {
      const wordRes = await db.collection('user_word_books')
        .where({ _openid: _.in(topOpenids) })
        .get();
      (wordRes.data || []).forEach(d => {
        wordMap[d._openid] = d.totalUnique || 0;
      });
    }

    // 3. 批量查这 50 人的头像昵称
    let userMap = {};
    if (topOpenids.length > 0) {
      const userRes = await db.collection('users')
        .where({ _openid: _.in(topOpenids) })
        .get();
      (userRes.data || []).forEach(d => {
        userMap[d._openid] = d;
      });
    }

    // 4. 合并 Top 50
    const topList = topData.map((d, idx) =>
      formatRecord(d, idx, d._openid, userMap, wordMap, OPENID)
    );

    // 5. 查自己的 best_round
    const selfRoundRes = await db.collection('user_best_round')
      .where({ _openid: OPENID })
      .get();
    const selfBestRound = selfRoundRes.data[0]?.best_round || 0;

    // 6. 计算自己的全球排名：best_round 比自己高的人数 + 1
    let selfRank = 1;
    if (selfBestRound > 0) {
      const countRes = await db.collection('user_best_round')
        .where({ best_round: _.gt(selfBestRound) })
        .count();
      selfRank = (countRes.total || 0) + 1;
    } else {
      // 没有最高回合记录时，排在已有记录之后
      const totalRes = await db.collection('user_best_round').count();
      selfRank = (totalRes.total || 0) + 1;
    }

    // 7. 查自己的单词量
    const selfWordRes = await db.collection('user_word_books')
      .where({ _openid: OPENID })
      .get();
    const selfWordCount = selfWordRes.data[0]?.totalUnique || 0;

    // 8. 查自己的头像昵称
    const selfUserRes = await db.collection('users')
      .where({ _openid: OPENID })
      .get();
    const selfUser = selfUserRes.data[0] || {};

    const self = {
      rank: selfRank,
      openid: OPENID,
      bestRound: selfBestRound,
      wordCount: selfWordCount,
      avatarUrl: selfUser.avatarUrl || '',
      nickname: selfUser.nickname || maskName(OPENID),
      isSelf: true,
    };

    console.log('[GetGlobalRank] Top50:', topList.length, 'selfRank:', selfRank);

    return { code: 0, topList, self };
  } catch (e) {
    console.error('[GetGlobalRank] 查询失败', e);
    return { code: -1, message: e.message || '查询失败' };
  }
};
