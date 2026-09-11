/**
 * 云函数：getFillBlank
 *
 * 职责：
 * 从 fill_blank 集合随机取一条完形填空题目 { word, example, example_zh }
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'getFillBlank',
 *     data: {}
 *   })
 *
 * 返回：{ code: 0, data: { word, example, example_zh } }
 * 失败/集合为空时返回内置兜底数据（fallback: true），保证前端可用
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 内置兜底（与前端 js/data.js 的 FILL_BLANK_FALLBACK 保持一致）
const FALLBACK = [
  { word: 'abuse', example: 'The report showed the abuse of power by officials.', example_zh: '这份报告揭示了官员滥用权力的问题。' },
  { word: 'adapt', example: 'It took him a long time to adapt to the new environment.', example_zh: '他花了很长时间适应新环境。' },
  { word: 'await', example: 'A warm welcome awaits you at the airport.', example_zh: '机场有人热烈欢迎你的到来。' },
  { word: 'award', example: 'She received an award for her excellent work.', example_zh: '她因出色的工作获得了奖项。' },
  { word: 'amend', example: 'The law was amended last year.', example_zh: '这项法律去年被修订了。' },
  { word: 'cease', example: 'The rain ceased at midnight.', example_zh: '雨在午夜停了。' },
  { word: 'boost', example: 'The new policy helped boost the economy.', example_zh: '新政策有助于促进经济发展。' },
  { word: 'curb', example: 'The government took steps to curb inflation.', example_zh: '政府采取措施抑制通货膨胀。' },
  { word: 'deem', example: 'The plan was deemed too risky.', example_zh: '这个计划被认为风险太大。' },
  { word: 'comply', example: 'All citizens must comply with the law.', example_zh: '所有公民都必须遵守法律。' }
];

function randomFallback() {
  return FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
}

exports.main = async (event, context) => {
  try {
    const col = db.collection('fill_blank');
    const countRes = await col.count();
    const total = countRes.total || 0;

    if (total > 0) {
      const rand = Math.floor(Math.random() * total);
      const res = await col.skip(rand).limit(1).get();
      if (res.data && res.data.length > 0) {
        const { word, example, example_zh } = res.data[0];
        console.log('[GetFillBlank] 命中记录:', word);
        return { code: 0, data: { word, example, example_zh } };
      }
    }

    // 集合为空：返回兜底数据
    return { code: 0, data: randomFallback(), fallback: true };
  } catch (e) {
    console.error('[GetFillBlank] 数据库操作失败:', e);
    return { code: 0, data: randomFallback(), fallback: true };
  }
};
