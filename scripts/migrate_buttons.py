import os
import re

utilities_to_strip = [
    r"bg-primary", r"hover:bg-primary", r"hover:bg-primary-hover", r"text-white", 
    r"bg-surface", r"border-default", r"border", r"text-default", r"hover:bg-gray-50", r"dark:hover:bg-white/5",
    r"bg-danger", r"hover:opacity-90",
    r"bg-transparent", r"hover:bg-app",
    r"inline-flex", r"flex", r"items-center", r"justify-center", r"gap-\d", r"gap-1\.5", r"gap-x-\d", r"gap-y-\d",
    r"rounded-\w+", r"rounded-\[.*?\]",
    r"font-\w+", r"text-\[\d+px\]", r"text-\w+", r"uppercase", r"tracking-\w+", r"tracking-\[.*?\]",
    r"transition-\w+", r"duration-\d+",
    r"active:scale-\d+", r"hover:scale-\[\d+\.\d+\]", r"transform",
    r"disabled:opacity-\d+", r"disabled:cursor-not-allowed",
    r"shadow-\w+", r"shadow-emerald-\w+/\d+", r"shadow-red-\w+/\d+", r"hover:shadow-\w+/\d+", r"shadow-\[.*?\]",
    r"px-\d+", r"py-\d+", r"py-\d+\.\d+", r"px-\d+\.\d+", r"p-\d+", r"p-\d+\.\d+"
]

def clean_classes(class_str, btn_type):
    # Add the new base classes
    classes = class_str.split()
    new_classes = [f"btn {btn_type}"]
    
    # Keep layout/positioning/margin/width classes
    for c in classes:
        # Check if it matches any pattern to strip
        should_strip = False
        for pattern in utilities_to_strip:
            if re.fullmatch(pattern, c):
                should_strip = True
                break
        
        # We also want to keep specific responsive utilities like w-full, sm:w-auto, flex-1, sm:flex-none, mt-4, mb-2, col-span-2, flex-[2]
        # Any class starting with sm:, md:, lg:, w-, h-, m-, mt-, mb-, ml-, mr-, col-, flex-1, flex-auto, flex-none etc.
        # But we must strip responsive padding/text if they exist (sm:px-4). Let's be aggressive with stripping visual, conservative with layout.
        
        if c.startswith(('sm:', 'md:', 'lg:')):
            if any(re.search(pattern, c.split(':', 1)[1]) for pattern in utilities_to_strip):
                should_strip = True
                
        if not should_strip and c not in new_classes:
            new_classes.append(c)
            
    return " ".join(new_classes)

def migrate_buttons(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".tsx"):
                path = os.path.join(root, file)
                with open(path, "r") as f:
                    content = f.read()
                
                # Match <button className="..."> or <button ... className="...">
                # We will use a regex substitution with a function
                def replace_button(match):
                    full_match = match.group(0)
                    class_attr = match.group(1)
                    
                    if "bg-primary" in class_attr and "text-white" in class_attr:
                        btn_type = "btn-primary"
                    elif "bg-danger" in class_attr and "text-white" in class_attr:
                        btn_type = "btn-danger"
                    elif "bg-surface" in class_attr and "border" in class_attr:
                        btn_type = "btn-secondary"
                    elif "bg-transparent" in class_attr and "hover:bg-app" in class_attr:
                        btn_type = "btn-ghost"
                    else:
                        return full_match # Not a standard button we can migrate safely
                    
                    new_classes = clean_classes(class_attr, btn_type)
                    return full_match.replace(class_attr, new_classes)
                
                new_content = re.sub(r"<button[^>]*className=[\'\"]([^\'\"]+)[\'\"][^>]*>", replace_button, content)
                
                # Also apply to <Link className="...">
                new_content = re.sub(r"<Link[^>]*className=[\'\"]([^\'\"]+)[\'\"][^>]*>", replace_button, new_content)
                
                if new_content != content:
                    with open(path, "w") as f:
                        f.write(new_content)
                    print(f"Migrated buttons in: {path}")

if __name__ == "__main__":
    migrate_buttons("src/components")
