import os
import re

color_map = {
    # Emerald -> Primary
    r"bg-\[\#10b981\]": "bg-primary",
    r"bg-emerald-500": "bg-primary",
    r"bg-emerald-600": "bg-primary",
    r"text-\[\#10b981\]": "text-primary",
    r"text-emerald-500": "text-primary",
    r"text-emerald-600": "text-primary",
    r"border-\[\#10b981\]": "border-primary",
    r"border-emerald-500": "border-primary",
    r"border-emerald-600": "border-primary",
    
    # Dark backgrounds -> App/Surface
    r"bg-\[\#0[aA]0[aA]0[aA]\]": "bg-app",
    r"text-\[\#0[aA]0[aA]0[aA]\]": "text-default",
    r"bg-\[\#171717\]": "bg-surface",
    r"bg-\[\#121212\]": "bg-surface",
    r"bg-\[\#1[aA]1[aA]1[aA]\]": "bg-surface",
    r"bg-\[\#111\]": "bg-surface",
    r"bg-\[\#111111\]": "bg-surface",
}

def update_colors(directory):
    count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts") or file.endswith(".css"):
                path = os.path.join(root, file)
                with open(path, "r") as f:
                    content = f.read()
                
                new_content = content
                for pattern, replacement in color_map.items():
                    new_content = re.sub(pattern, replacement, new_content)
                    
                if new_content != content:
                    with open(path, "w") as f:
                        f.write(new_content)
                    count += 1
                    print(f"Updated: {path}")
    print(f"\nTotal files updated: {count}")

if __name__ == "__main__":
    update_colors("src")
