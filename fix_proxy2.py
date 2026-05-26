import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    raw = f.read()

# The file is huge. Let me find the exact generated script section
# Looking for: args.append('--proxy-server=http://' + PROXY)
marker = "--proxy-server=http://"
idx = raw.find(marker)
if idx < 0:
    print("ERROR: marker not found")
    sys.exit(1)

# Find the block of generated code
# It's inside the scriptContent variable
# Find the section that starts with the PROXY line in the generated python
proxy_line_marker = "PROXY = "
proxy_idx = raw.find(proxy_line_marker)
print(f"Found PROXY at {proxy_idx}")

# Replace the whole chrome args block
# Current: args.append('--proxy-server=http://' + PROXY)
# New: parse PROXY and build proper URL with auth

old_block = """                        args.append('--proxy-server=http://' + PROXY)
                        args.append(url)"""

new_block = """                        # Build proxy URL with auth support
                        proxy_parts = PROXY.split(':')
                        if len(proxy_parts) >= 4:
                            proxy_url = proxy_parts[2] + ':' + proxy_parts[3] + '@' + proxy_parts[0] + ':' + proxy_parts[1]
                        else:
                            proxy_url = PROXY
                        args.append('--proxy-server=http://' + proxy_url)
                        args.append(url)"""

raw = raw.replace(old_block, new_block)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(raw)

print("OK - fixed proxy auth in generated script")
