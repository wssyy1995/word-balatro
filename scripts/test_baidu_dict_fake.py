#!/usr/bin/env python3
"""
百度词典版API - 测试"似真非真"的不存在单词
包括：拼写错误、看起来合理的假词、常见误拼
"""

import urllib.request
import urllib.parse
import json
import time

BAIDU_AI_API_KEY = 'H6PjbJLH4kV4N0SJHpkJ7M3t'
BAIDU_AI_SECRET_KEY = 'rJHicSBtLMQyrbidglmZY52Aoth5KP4o'

def http_post(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def http_get(url):
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_access_token():
    params = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': BAIDU_AI_API_KEY,
        'client_secret': BAIDU_AI_SECRET_KEY
    })
    data = http_get(f'https://aip.baidubce.com/oauth/2.0/token?{params}')
    return data['access_token']

def query_dict(word, token):
    body = json.dumps({'from': 'en', 'to': 'zh', 'q': word}).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    url = f'https://aip.baidubce.com/rpc/2.0/mt/texttrans-with-dict/v1?access_token={token}'
    try:
        data = http_post(url, body, headers)
    except Exception as e:
        return {
            'word': word, 'valid': False, 'from': 'ERROR',
            'dst': '', 'reason': str(e),
            'phEn': '', 'phAm': '', 'wordMeans': [], 'parts': []
        }

    trans = data.get('result', {}).get('trans_result', [{}])[0]
    if not trans or 'dict' not in trans:
        return {
            'word': word, 'valid': False, 'from': 'N/A',
            'dst': trans.get('dst', ''), 'reason': 'no dict',
            'phEn': '', 'phAm': '', 'wordMeans': [], 'parts': []
        }

    dict_data = json.loads(trans['dict']) if isinstance(trans['dict'], str) else trans['dict']
    simple = dict_data.get('word_result', {}).get('simple_means', {})
    from_val = simple.get('from', '')
    VALID = ['original', 'deformation', 'green']
    is_valid = from_val in VALID

    symbols = (simple.get('symbols') or [{}])[0]
    parts = symbols.get('parts', [])
    word_means = simple.get('word_means', [])

    return {
        'word': word,
        'valid': is_valid,
        'from': from_val,
        'dst': trans.get('dst', ''),
        'phEn': symbols.get('ph_en', ''),
        'phAm': symbols.get('ph_am', ''),
        'wordMeans': word_means,
        'parts': [
            {'part': p.get('part', p.get('part_name', '')), 'means': p.get('means', [])}
            for p in parts
        ]
    }

def escape_md(text):
    return str(text).replace('|', '\\|').replace('\n', ' ')

def main():
    print('正在获取 access_token...')
    token = get_access_token()
    print('access_token 获取成功，开始批量查询...\n')

    # 测试词：看起来像真词但实际不存在
    TEST_WORDS = [
        # === 常见拼写错误 ===
        'recieve',      # 错误: receive
        'definately',   # 错误: definitely
        'seperate',     # 错误: separate
        'occured',      # 错误: occurred
        'accomodate',   # 错误: accommodate
        'neccessary',   # 错误: necessary
        'enviroment',   # 错误: environment
        'tommorow',     # 错误: tomorrow
        'wich',         # 错误: which
        'beleive',      # 错误: believe
        'acheive',      # 错误: achieve
        'bussiness',    # 错误: business
        'supercede',    # 错误: supersede
        'publically',   # 错误: publicly
        'existance',    # 错误: existence

        # === 看起来像真词的假词 ===
        'snirt',        # 像 snort + dirt
        'floop',        # 像 flop + loop
        'twicken',      # 像 quicken 的变体
        'brastle',      # 像 brash + bristle
        'prindle',      # 像 spindle 的变体
        'clamble',      # 像 scramble 的前缀
        'sneeter',      # 像 sneeze 的变体
        'grindle',      # 像 grind + spindle
        'gleeter',      # 像 gleam + glitter
        'shindle',      # 像 shingle + spindle
        'brustle',      # 像 bristle + bustle
        'thrance',      # 像 trance + throne
        'slother',      # 像 sloth + bother
        'quingle',      # 像 single 的变体
        'striddle',     # 像 stride + straddle
        'pronce',       # 像 pounce 的变体
        'scrimble',     # 像 scramble 的变体
        'fristle',      # 像 bristle 的变体
        'glimple',      # 像 glimpse 的变体
        'snounce',      # 像 snout + bounce
    ]

    results = []
    for word in TEST_WORDS:
        try:
            r = query_dict(word, token)
            results.append(r)
            time.sleep(0.2)
        except Exception as e:
            results.append({
                'word': word, 'valid': False, 'from': 'ERROR',
                'dst': '', 'reason': str(e),
                'phEn': '', 'phAm': '', 'wordMeans': [], 'parts': []
            })

    # 输出 Markdown 表格
    print("| 单词 | 有效? | from | 翻译 | 音标(英) | word_means | 词性+释义 |")
    print("|------|-------|------|------|----------|------------|-----------|")
    for r in results:
        valid = '✅' if r['valid'] else '❌'
        word = r['word']
        from_val = r.get('from', '')
        dst = r.get('dst', '')
        phEn = r.get('phEn', '')
        wordMeans = '；'.join(r.get('wordMeans', [])[:5])

        parts_list = []
        for p in r.get('parts', []):
            part_name = p.get('part', '')
            means = '；'.join(p.get('means', [])[:3])
            parts_list.append(f"{part_name}: {means}")
        parts_str = ' \| '.join(parts_list)

        print(f"| {escape_md(word)} | {valid} | {escape_md(from_val)} | {escape_md(dst)} | {escape_md(phEn)} | {escape_md(wordMeans)} | {escape_md(parts_str)} |")

    print(f"\n**总计: {len(results)} 个词 | ✅ 有效: {sum(1 for r in results if r['valid'])} | ❌ 无效: {sum(1 for r in results if not r['valid'])}**")

    # 列出被误判为有效的词
    false_positives = [r for r in results if r['valid']]
    if false_positives:
        print(f"\n**⚠️ 被误判为有效的词 ({len(false_positives)} 个):**")
        for r in false_positives:
            print(f"  - {r['word']} (from={r['from']}, dst={r['dst']})")

if __name__ == '__main__':
    main()
