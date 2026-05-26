import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Change proxyServer to include full proxy (ip:puerto:user:pass)
old_proxy_var = "const proxyServer = proxy ? proxy.split(':').slice(0,2).join(':') : ''"
new_proxy_var = "const proxyServer = proxy"
content = content.replace(old_proxy_var, new_proxy_var)

# 2. Change the chrome launch to include auth in proxy URL
old_chrome = "'                        args.append(\\'--proxy-server=http://\\' + PROXY)\\n'"
new_chrome = "'                        args.append(\\'--proxy-server=http://\\' + PROXY.replace(\\':\\', \\':\\', 1).replace(\\':\\', \\'@\\'))\\n'"
content = content.replace(old_chrome, new_chrome)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('OK')
