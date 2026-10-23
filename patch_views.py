import os
import re

def patch_method(content, method_name):
    # Find the start of the method
    method_idx = content.find(f"def {method_name}(")
    if method_idx == -1: return content
    
    # Find the next return Response({'message' or return Response({'success'
    search_space = content[method_idx:method_idx+3000]
    
    match = re.search(r"^[ \t]*return Response\(\{['\"](?:message|success)['\"]", search_space, re.MULTILINE)
    if match:
        insert_idx = method_idx + match.start()
        # Find the indentation
        indent = search_space[match.start() - 20:match.start()].split('\n')[-1]
        if not indent.strip():
            injection = f"{indent}broadcast_count_task_update()\n"
            content = content[:insert_idx] + injection + content[insert_idx:]
    return content

file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend', 'inventory', 'views.py')
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import if missing
if 'broadcast_count_task_update' not in content:
    content = content.replace('from .models import ', 'from .signals import broadcast_count_task_update\nfrom .models import ', 1)

methods = ['claim_tasks', 'bulk_submit', 'bulk_approve', 'bulk_manager_approve', 'bulk_cancel', 'reject', 'manager_reject']
for m in methods:
    content = patch_method(content, m)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching complete.")
