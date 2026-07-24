#!/usr/bin/env python3
import sys, traceback
sys.path.insert(0, '.')
try:
    from app import app
    with app.test_client() as c:
        r = c.get('/')
        print('Status:', r.status_code)
        print('Length:', len(r.data))
        if r.status_code == 500:
            print(r.data.decode()[:2000])
except Exception as e:
    traceback.print_exc()