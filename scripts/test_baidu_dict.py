#!/usr/bin/env python3
"""
百度词典版API 批量测试脚本
测试至少30个单词，输出返回的 from 字段、词性、释义等
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
    data = http_post(url, body, headers)

    trans = data.get('result', {}).get('trans_result', [{}])[0]
    if not trans or 'dict' not in trans:
        return {
            'word': word,
            'valid': False,
            'from': 'N/A',
            'dst': trans.get('dst', ''),
            'reason': 'no dict field',
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
        'wordMeans': word_means[:5],
        'parts': [
            {
                'part': p.get('part', p.get('part_name', '')),
                'means': (p.get('means') or [])[:3]
            }
            for p in parts[:3]
        ],
        'exchange': simple.get('exchange')
    }

def main():
    print('正在获取 access_token...')
    token = get_access_token()
    print('access_token 获取成功\n')

    TEST_WORDS = [
        # 常见词
        'hello', 'world', 'water',
        # 过去式/变形
        'went', 'took', 'ran', 'did', 'saw', 'eaten',
        # 复数
        'apples', 'children', 'mice', 'feet', 'oxen', 'geese',
        # 国家/地区
        'china', 'america', 'france', 'japan', 'paris', 'london',
        # 生僻词
        'ephemeral', 'serendipity', 'ubiquitous', 'plethora', 'lugubrious',
        # 缩写
        "don't", "won't", "can't",
        # 专有/品牌
        'google', 'iphone',
        # 无效/拼凑词
        'xyzabc', 'qwerty', 'aaaaaa',
        # 其他
        'balatro', 'mon'
    ]

    print('=' * 120)
    print(f"{'单词':<12} {'有效?':<6} {'from':<14} {'翻译':<12} {'音标(英)':<16} {'词性+释义(前3)'}")
    print('=' * 120)

    results = []
    for word in TEST_WORDS:
        try:
            r = query_dict(word, token)
            results.append(r)
            valid_str = '✅' if r['valid'] else '❌'
            from_str = r['from'] or 'N/A'
            dst_str = (r['dst'] or '')[:10]
            ph_str = (r['phEn'] or '')[:14]

            if r['parts']:
                parts_str = ' | '.join(
                    f"{p['part']}({'; '.join(p['means'])[:20]})"
                    for p in r['parts']
                )
            elif r['wordMeans']:
                parts_str = '; '.join(r['wordMeans'][:3])
            else:
                parts_str = ''

            print(f"{word:<12} {valid_str:<6} {from_str:<14} {dst_str:<12} {ph_str:<16} {parts_str[:60]}")
            time.sleep(0.2)
        except Exception as e:
            print(f"{word:<12} ERROR: {e}")

    print('=' * 120)

    valid_count = sum(1 for r in results if r['valid'])
    invalid_count = len(results) - valid_count
    print(f"\n总计: {len(results)} 个词 | ✅ 有效: {valid_count} | ❌ 无效: {invalid_count}")

    print("\n--- 无效词详情 ---")
    for r in results:
        if not r['valid']:
            print(f"  {r['word']:<12} from={r['from']:<12} dst={r['dst']}")

    print("\n--- 变形词详情（有 exchange.word_proto） ---")
    for r in results:
        if r.get('exchange') and r['exchange'].get('word_proto'):
            print(f"  {r['word']:<12} proto={r['exchange']['word_proto']}")

if __name__ == '__main__':
    main()
