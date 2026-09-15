#!/bin/zsh
# 把线上 sitemap 的全部 URL 推送给 IndexNow（Bing/Yandex/Naver/Seznam）。
# 内容更新部署后跑一次即可。key 文件: public/f3705a770ce94ece9aa3974eb3c8b332.txt
set -e
HOST=learn.agentmentor.dev
KEY=f3705a770ce94ece9aa3974eb3c8b332
TMP=$(mktemp)
curl -s "https://$HOST/sitemap.xml" | grep -o '<loc>[^<]*' | sed 's/<loc>//' | \
python3 -c "
import json, sys
urls = [l.strip() for l in sys.stdin if l.strip()]
json.dump({'host': '$HOST', 'key': '$KEY',
           'keyLocation': 'https://$HOST/$KEY.txt', 'urlList': urls}, open('$TMP', 'w'))
print(f'{len(urls)} URLs', file=sys.stderr)
"
curl -s -o /dev/null -w "IndexNow HTTP %{http_code}\n" -X POST https://api.indexnow.org/indexnow \
  -H "Content-Type: application/json; charset=utf-8" --data @$TMP
rm -f $TMP
