import json
import re

log_path = r"C:\Users\Payandeh\.gemini\antigravity-ide\brain\9633ec72-f5b0-46d2-9160-c29ec10166dc\.system_generated\logs\transcript_full.jsonl"
found = None
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        content = data.get('content', '')
        if 'wh-settings.html' in content and 'blind_counting' in content and 'max_recounts' in content:
            found = content

if found:
    # Try to extract the file content from the tool output
    lines = found.split('\n')
    cleaned_lines = []
    in_file = False
    for line in lines:
        if line.startswith('1: '):
            in_file = True
        if in_file:
            # remove line number like '1: '
            match = re.match(r'^\d+: (.*)$', line)
            if match:
                cleaned_lines.append(match.group(1))
            else:
                if 'The above content does NOT show' in line:
                    in_file = False
                elif line.strip() == '':
                    pass
                else:
                    # some lines might not have numbers if they were wrapped? No, they all have numbers
                    pass
    
    with open('recovered.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(cleaned_lines))
    print(f"Recovered {len(cleaned_lines)} lines")
else:
    print("Not found")
