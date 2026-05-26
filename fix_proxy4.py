import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    raw = f.read()

# Find the exact text in the file around --proxy-server
idx = raw.find('--proxy-server=http://')
if idx < 0:
    print("ERROR: not found")
    sys.exit(1)

# Show surrounding context to find exact text
start = max(0, idx - 80)
end = min(len(raw), idx + 100)
context = raw[start:end]
print("Context found:")
print(repr(context))

# The pattern should be: args.append(\'--proxy-server=http://\' + PROXY)
# The old code has escaped single quotes \' inside a JS string
# In the raw file this appears as:  args.append(\'--proxy-server
old_text = "args.append(\\'--proxy-server=http://\\' + PROXY)"

if old_text in raw:
    new_text = """args.append(\\'--proxy-server=http://\\' + proxy_url)"""
    
    # Also need to add the proxy_url calculation before this line
    # Let me find where to insert it
    insert_before = old_text
    insert_lines = [
        "                            proxy_parts = PROXY.split(\\':\\')",
        "                            if len(proxy_parts) >= 4:",
        "                                proxy_url = proxy_parts[2] + \\':\\' + proxy_parts[3] + \\'@\\' + proxy_parts[0] + \\':\\' + proxy_parts[1]",
        "                            else:",
        "                                proxy_url = PROXY",
    ]
    insert_code = "\\n".join(insert_lines) + "\\n"
    
    # Insert the proxy_url calculation before the args.append line
    raw = raw.replace(old_text, insert_code + new_text)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(raw)
    print("OK - replaced with auth support")
else:
    print("Old text NOT found with \\' escaping")
    # Try without escaping
    old_text2 = "args.append('--proxy-server=http://' + PROXY)"
    if old_text2 in raw:
        print("Found without escaping")
