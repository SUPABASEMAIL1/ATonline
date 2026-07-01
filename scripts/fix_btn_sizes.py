import os
import re

def fix_buttons(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".tsx"):
                path = os.path.join(root, file)
                with open(path, "r") as f:
                    content = f.read()
                
                def add_size(match):
                    class_attr = match.group(1)
                    if "btn " in class_attr and "btn-sm" not in class_attr and "btn-md" not in class_attr and "btn-lg" not in class_attr:
                        # Add btn-md
                        new_classes = class_attr.replace("btn ", "btn btn-md ", 1)
                        return match.group(0).replace(class_attr, new_classes)
                    return match.group(0)
                
                new_content = re.sub(r'className=[\'\"]([^\'\"]*btn [^\'\"]*)[\'\"]', add_size, content)
                
                if new_content != content:
                    with open(path, "w") as f:
                        f.write(new_content)
                    print(f"Fixed sizes in: {path}")

if __name__ == "__main__":
    fix_buttons("src/components")
