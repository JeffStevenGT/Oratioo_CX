import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    raw = f.read()

# The generated JS code uses escaped quotes: args.append(\'--proxy-server...\')
old = """                            args.append(\\'--proxy-server=http://\\' + PROXY)"""
new = """                            proxy_parts = PROXY.split(\\':\\')
                            if len(proxy_parts) >= 4:
                                proxy_url = proxy_parts[2] + \\':\\' + proxy_parts[3] + \\'@\\' + proxy_parts[0] + \\':\\' + proxy_parts[1]
                            else:
                                proxy_url = PROXY
                            args.append(\\'--proxy-server=http://\\' + proxy_url)"""

if old in raw:
    raw = raw.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(raw)
    print("OK - replaced successfully")
else:
    print("Old text not found")
    # Show what's around --proxy-server
    idx = raw.find('--proxy-server')
    if idx >= 0:
        print(repr(raw[idx-100:idx+200]))
