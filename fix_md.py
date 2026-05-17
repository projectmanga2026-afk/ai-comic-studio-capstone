
import re

file_path = r'e:\new workflow\Appendix_A_Source_Code.md'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    stripped = line.strip()
    if stripped == 'python':
        new_lines.append('`python\n')
    elif stripped == 'json':
        new_lines.append('`json\n')
    elif stripped in ['	sx', 'sx', '	s']:
        new_lines.append('`	sx\n')
    elif stripped in ['jupyter', 'ipynb']:
        new_lines.append('`python\n')
    elif stripped == '':
        new_lines.append('`\n')
    else:
        new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

