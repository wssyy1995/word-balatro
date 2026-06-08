/**
 * 云函数：baiduDict
 * 
 * 只负责一件事：用百度 AI 的 API Key + Secret Key 换取 access_token
 * 前端拿到 access_token 后，自行直连百度词典版接口查询单词
 * 
 * 调用方式（前端）：
 *   wx.cloud.callFunction({ name: 'baiduDict', data: {} })
 */

const https = require('https');
const querystring = require('querystring');

// 百度 AI 开放平台密钥（仅在云函数内部使用，前端不可见）
const BAIDU_AI_API_KEY = 'H6PjbJLH4kV4N0SJHpkJ7M3t';
const BAIDU_AI_SECRET_KEY = 'rJHicSBtLMQyrbidglmZY52Aoth5KP4o';

function requestPromise(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

exports.main = async (event, context) => {
  try {
    const params = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: BAIDU_AI_API_KEY,
      client_secret: BAIDU_AI_SECRET_KEY
    });

    const resp = await requestPromise({
      hostname: 'aip.baidubce.com',
      path: '/oauth/2.0/token?' + params,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000
    });

    if (resp.statusCode === 200 && resp.data?.access_token) {
      return {
        code: 0,
        access_token: resp.data.access_token,
        expires_in: resp.data.expires_in || 2592000
      };
    }

    return {
      code: -1,
      message: resp.data?.error_description || '获取 access_token 失败',
      raw: resp.data
    };
  } catch (e) {
    return {
      code: -1,
      message: e.message || '云函数内部错误'
    };
  }
};
