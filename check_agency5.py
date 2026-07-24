#!/usr/bin/env python3
import sys
sys.path.insert(0, '/media/unified/hobiz/build/opencode')
from import_polycc import merge_all_cache_to_json
stats = merge_all_cache_to_json()
for k, v in stats.items():
    print(f'{k}: {v}')
