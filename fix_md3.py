import re

file_path = r'e:\new workflow\Appendix_A_Source_Code.md'

with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# I accidentally deleted the closing backticks! Let's put them back.
# Find every '### File:' and insert a closing ``` right before it, 
# UNLESS it is immediately following a '## ' header.

# Actually, an easier way is to just look for lines starting with '### File:'
# and if there is an active code block, close it before the new header.
# Let's just do it cleanly by splitting lines.

lines = text.split('\n')
new_lines = []
in_code_block = False

for line in lines:
    if line.startswith('```') and not in_code_block:
        in_code_block = True
        new_lines.append(line)
    elif line.startswith('### File:') or line.startswith('## '):
        if in_code_block:
            new_lines.append('```')
            new_lines.append('')
            in_code_block = False
        new_lines.append(line)
    else:
        new_lines.append(line)

# If we end the file while in a code block, close it
if in_code_block:
    new_lines.append('```')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print("Closing backticks correctly inserted.")
