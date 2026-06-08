/**
 * 百度词典版API 批量测试脚本
 * 测试至少30个单词，输出返回的 from 字段、词性、释义等
 */

const https = require('https');
const querystring = require('querystring');

const BAIDU_AI_API_KEY = 'H6PjbJLH4kV4N0SJHpkJ7M3t';
const BAIDU_AI_SECRET_KEY = 'rJHicSBtLMQyrbidglmZY52Aoth5KP4o';

function request(options) {
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

async function getAccessToken() {
  const params = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: BAIDU_AI_API_KEY,
    client_secret: BAIDU_AI_SECRET_KEY
  });
  const resp = await request({
    hostname: 'aip.baidubce.com',
    path: '/oauth/2.0/token?' + params,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (resp.statusCode === 200 && resp.data?.access_token) {
    return resp.data.access_token;
  }
  throw new Error('获取 access_token 失败: ' + JSON.stringify(resp.data));
}

async function queryDict(word, token) {
  const resp = await request({
    hostname: 'aip.baidubce.com',
    path: `/rpc/2.0/mt/texttrans-with-dict/v1?access_token=${token}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'en', to: 'zh', q: word })
  });

  if (resp.statusCode === 200 && resp.data?.result?.trans_result?.[0]) {
    const t = resp.data.result.trans_result[0];
    if (!t.dict) {
      return { word, hasDict: false, valid: false, reason: 'no dict field' };
    }
    const dict = typeof t.dict === 'string' ? JSON.parse(t.dict) : t.dict;
    const simple = dict?.word_result?.simple_means;
    const from = simple?.from || '';
    const VALID_FROM_TYPES = ['original', 'deformation', 'green'];
    const isValid = VALID_FROM_TYPES.includes(from);

    const symbols = simple?.symbols?.[0];
    const parts = symbols?.parts || [];
    const wordMeans = simple?.word_means || [];

    return {
      word,
      hasDict: true,
      valid: isValid,
      from,
      dst: t.dst,
      phEn: symbols?.ph_en || '',
      phAm: symbols?.ph_am || '',
      wordMeans: wordMeans.slice(0, 5),
      parts: parts.slice(0, 3).map(p => ({
        part: p.part || p.part_name || '',
        means: (p.means || []).slice(0, 3)
      })),
      exchange: simple?.exchange || null
    };
  }
  return { word, hasDict: false, valid: false, reason: 'api error', raw: resp.data };
}

const TEST_WORDS = [
  // 常见词
  'hello', 'world', 'water',
  // 过去式/变形
  'went', 'took', 'ran', 'did', 'saw', 'eaten',
  // 复数
  'apples', 'children', 'mice', 'feet', 'oxen', 'geese',
  // 国家/地区
  'china', 'america', 'france', 'japan', 'paris', 'london',
  // 生僻词
  'ephemeral', 'serendipity', 'ubiquitous', 'plethora', 'lugubrious',
  // 缩写
  "don't", "won't", "can't",
  // 专有/品牌
  'google', 'iphone',
  // 无效/拼凑词
  'xyzabc', 'qwerty', 'aaaaaa',
  // 其他
  'balatro', 'mon'
];

async function main() {
  console.log('正在获取 access_token...');
  const token = await getAccessToken();
  console.log('access_token 获取成功\n');

  console.log('='.repeat(100));
  console.log('单词'.padEnd(12), '有效?'.padEnd(6), 'from'.padEnd(14), '翻译'.padEnd(12), '音标(英)'.padEnd(16), '词性+释义(前3)');
  console.log('='.repeat(100));

  for (const word of TEST_WORDS) {
    const r = await queryDict(word, token);
    const validStr = r.valid ? '✅' : '❌';
    const fromStr = r.from || 'N/A';
    const dstStr = (r.dst || '').slice(0, 10);
    const phStr = (r.phEn || '').slice(0, 14);

    let partsStr = '';
    if (r.parts && r.parts.length > 0) {
      partsStr = r.parts.map(p => `${p.part}(${p.means.join('；').slice(0, 20)})`).join(' | ');
    } else if (r.wordMeans && r.wordMeans.length > 0) {
      partsStr = r.wordMeans.slice(0, 3).join('；');
    }

    console.log(
      word.padEnd(12),
      validStr.padEnd(6),
      fromStr.padEnd(14),
      dstStr.padEnd(12),
      phStr.padEnd(16),
      partsStr.slice(0, 60)
    );

    // 延迟 200ms 避免触发限流
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('='.repeat(100));

  // 统计
  const validCount = TEST_WORDS.filter((_, i) => {
    // 这里不重新计算，只是占位
    return true;
  });
}

main().catch(console.error);
