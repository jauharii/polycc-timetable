#!/usr/bin/env python3
import json, os
path = '/media/unified/hobiz/build/opencode/data/agencies.json'
if os.path.exists(path):
    d = json.load(open(path))
    print(f'agencies.json: {len(d)} entries')
    for a in d[:10]:
        print(f'  {a}')
else:
    print('agencies.json NOT FOUND')
