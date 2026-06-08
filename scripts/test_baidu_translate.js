/**
 * 百度翻译API 测试脚本
 * 
 * 测试两个接口：
 * 1. 通用版（fanyi-api.baidu.com）- MD5签名，门槛低，100万字符/月免费
 * 2. 词典版（aip.baidubce.com）- OAuth2+access_token，返回音标/词性/时态
 * 
 * 使用方法：
 *   node test_baidu_translate.js
 * 
 * 配置说明：
 *   通用版需要：百度翻译开放平台 → 管理控制台 → 获取 APP ID 和 密钥
 *   词典版需要：百度AI开放平台 → 机器翻译 → 获取 API Key 和 Secret Key
 *   （两者账号体系不同，需分别申请）
 */

const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

// ============================================================
// 请在这里填入你的百度翻译配置
// ============================================================

// 通用版配置（fanyi-api.baidu.com）
const BAIDU_TRANSLATE_APPID = '';      // 百度翻译 APP ID
const BAIDU_TRANSLATE_SECRET = '';      // 百度翻译 密钥

// 词典版配置（aip.baidubce.com）
const BAIDU_AI_API_KEY = '';            // 百度AI开放平台 API Key
const BAIDU_AI_SECRET_KEY = '';         // 百度AI开放平台 Secret Key

// 测试单词列表
const TEST_WORDS = ['hello', 'world', 'apple', 'beautiful', 'run', 'xyzabc'];

// ============================================================
// 通用版：MD5签名
// ============================================================
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function request(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============================================================
// 测试1：百度翻译通用版（带词典信息）
// ============================================================
async function testTranslate(word) {
  if (!BAIDU_TRANSLATE_APPID || !BAIDU_TRANSLATE_SECRET) {
    console.log('❌ 通用版未配置：请先填写 BAIDU_TRANSLATE_APPID 和 BAIDU_TRANSLATE_SECRET\n');
    return null;
  }

  const salt = Date.now().toString();
  const sign = md5(BAIDU_TRANSLATE_APPID + word + salt + BAIDU_TRANSLATE_SECRET);

  const params = querystring.stringify({
    q: word,
    from: 'en',
    to: 'zh',
    appid: BAIDU_TRANSLATE_APPID,
    salt: salt,
    sign: sign,
    dict: '1'   // 返回词典信息
  });

  try {
    const resp = await request({
      hostname: 'fanyi-api.baidu.com',
      path: '/api/trans/vip/translate?' + params,
      method: 'GET',
      timeout: 5000
    });

    console.log(`\n--- 通用版查询 "${word}" ---`);
    console.log('状态码:', resp.statusCode);
    
    if (resp.data.error_code) {
      console.log('错误码:', resp.data.error_code, '错误信息:', resp.data.error_msg);
      return null;
    }

    // 打印完整响应
    console.log('完整响应:');
    console.log(JSON.stringify(resp.data, null, 2));

    // 解析词典信息
    if (resp.data.trans_result && resp.data.trans_result[0]) {
      const result = resp.data.trans_result[0];
      console.log('\n📖 解析结果:');
      console.log('  原文:', result.src);
      console.log('  翻译:', result.dst);
      
      if (result.dict) {
        const dict = typeof result.dict === 'string' ? JSON.parse(result.dict) : result.dict;
        const simple = dict?.word_result?.simple_means;
        if (simple) {
          console.log('  音标(英):', simple.symbols?.[0]?.ph_en || '无');
          console.log('  音标(美):', simple.symbols?.[0]?.ph_am || '无');
          console.log('  词性释义:');
          simple.symbols?.[0]?.parts?.forEach(p => {
            console.log(`    ${p.part} → ${p.means?.join('；')}`);
          });
          console.log('  中文释义:', simple.word_means?.join('；') || '无');
        } else {
          console.log('  词典信息结构:', JSON.stringify(dict, null, 2).slice(0, 500));
        }
      } else {
        console.log('  ⚠️ 未返回词典信息（dict字段为空）');
      }
    }
    
    return resp.data;
  } catch (e) {
    console.log(`❌ 通用版查询 "${word}" 失败:`, e.message);
    return null;
  }
}

// ============================================================
// 测试2：百度翻译词典版（OAuth2 + access_token）
// ============================================================
async function getAccessToken() {
  if (!BAIDU_AI_API_KEY || !BAIDU_AI_SECRET_KEY) {
    return null;
  }

  const params = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: BAIDU_AI_API_KEY,
    client_secret: BAIDU_AI_SECRET_KEY
  });

  try {
    const resp = await request({
      hostname: 'aip.baidubce.com',
      path: '/oauth/2.0/token?' + params,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (resp.data.access_token) {
      console.log('✅ access_token 获取成功');
      return resp.data.access_token;
    } else {
      console.log('❌ 获取 access_token 失败:', resp.data);
      return null;
    }
  } catch (e) {
    console.log('❌ 获取 access_token 失败:', e.message);
    return null;
  }
}

async function testDict(word, accessToken) {
  if (!accessToken) {
    console.log('❌ 词典版未配置：请先填写 BAIDU_AI_API_KEY 和 BAIDU_AI_SECRET_KEY\n');
    return null;
  }

  try {
    const resp = await request({
      hostname: 'aip.baidubce.com',
      path: `/rpc/2.0/mt/texttrans-with-dict/v1?access_token=${accessToken}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'en',
        to: 'zh',
        q: word
      })
    });

    console.log(`\n--- 词典版查询 "${word}" ---`);
    console.log('状态码:', resp.statusCode);

    if (resp.data.error_code) {
      console.log('错误码:', resp.data.error_code, '错误信息:', resp.data.error_msg);
      return null;
    }

    // 打印完整响应
    console.log('完整响应:');
    console.log(JSON.stringify(resp.data, null, 2));

    // 解析词典信息
    if (resp.data.result?.trans_result?.[0]) {
      const result = resp.data.result.trans_result[0];
      console.log('\n📖 解析结果:');
      console.log('  原文:', result.src);
      console.log('  翻译:', result.dst);
      
      if (result.dict) {
        const dict = typeof result.dict === 'string' ? JSON.parse(result.dict) : result.dict;
        const simple = dict?.word_result?.simple_means;
        if (simple) {
          console.log('  音标(英):', simple.symbols?.[0]?.ph_en || '无');
          console.log('  音标(美):', simple.symbols?.[0]?.ph_am || '无');
          console.log('  词性释义:');
          simple.symbols?.[0]?.parts?.forEach(p => {
            console.log(`    ${p.part} → ${p.means?.join('；')}`);
          });
          console.log('  中文释义:', simple.word_means?.join('；') || '无');
          console.log('  时态变化:', JSON.stringify(simple.exchange || {}, null, 2).replace(/\n/g, '\n    '));
          console.log('  词汇标签:', simple.tags?.core?.join(', ') || '无');
        } else {
          console.log('  词典信息结构:', JSON.stringify(dict, null, 2).slice(0, 500));
        }
      } else {
        console.log('  ⚠️ 未返回词典信息（dict字段为空）→ 该词可能不存在或不是标准单词');
      }
    }

    return resp.data;
  } catch (e) {
    console.log(`❌ 词典版查询 "${word}" 失败:`, e.message);
    return null;
  }
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  console.log('========================================');
  console.log('   百度翻译API 测试脚本');
  console.log('========================================\n');

  // 检查配置
  const hasTranslate = BAIDU_TRANSLATE_APPID && BAIDU_TRANSLATE_SECRET;
  const hasDict = BAIDU_AI_API_KEY && BAIDU_AI_SECRET_KEY;

  if (!hasTranslate && !hasDict) {
    console.log('⚠️ 请先配置API密钥后再运行测试脚本。');
    console.log('\n配置方式：');
    console.log('1. 通用版（简单，推荐先测）：');
    console.log('   访问 https://fanyi-api.baidu.com → 注册 → 管理控制台 → 获取 APP ID 和 密钥');
    console.log('2. 词典版（返回音标词性等）：');
    console.log('   访问 https://ai.baidu.com → 机器翻译 → 获取 API Key 和 Secret Key');
    console.log('\n然后将密钥填入脚本顶部的配置区。\n');
    return;
  }

  // 测试通用版
  if (hasTranslate) {
    console.log('🧪 开始测试【通用版】（fanyi-api.baidu.com）');
    for (const word of TEST_WORDS) {
      await testTranslate(word);
      await new Promise(r => setTimeout(r, 500)); // 避免触发限流
    }
  }

  // 测试词典版
  if (hasDict) {
    console.log('\n\n========================================');
    console.log('🧪 开始测试【词典版】（aip.baidubce.com）');
    const accessToken = await getAccessToken();
    if (accessToken) {
      for (const word of TEST_WORDS) {
        await testDict(word, accessToken);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log('\n\n========================================');
  console.log('   测试完成');
  console.log('========================================\n');

  // 给出建议
  console.log('💡 下一步建议：');
  console.log('1. 观察返回数据中 dict 字段是否非空 → 可作为单词有效性判断依据');
  console.log('2. 对比通用版和词典版的返回结构，看哪个更适合你的游戏需求');
  console.log('3. 如果通用版的 dict 字段已经够用，就用通用版（更简单）');
  console.log('4. 如果需要更详细的音标/词性/时态，就用词典版');
}

main().catch(console.error);
