import os
import re

def migrate_modals(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".tsx"):
                path = os.path.join(root, file)
                with open(path, "r") as f:
                    content = f.read()
                
                if "ModernModal" in content:
                    # Update import statement
                    content = re.sub(r"import\s+\{\s*ModernModal\s*\}\s+from\s+[\'\"](.*?)ModernModal[\'\"]", r"import { Modal } from '\1Modal'", content)
                    content = re.sub(r"import\s+\{\s*ModernModal\s*\}\s+from\s+[\'\"](.*?)[\'\"]", r"import { Modal } from '\1'", content)
                    
                    # Prevent changing unrelated imports if any
                    
                    # Update component usage
                    content = content.replace("<ModernModal", "<Modal")
                    content = content.replace("</ModernModal>", "</Modal>")
                    
                    # Remove unsupported props
                    content = re.sub(r"bodyClassName=[\'\"][^\'\"]*[\'\"]", "", content)
                    content = re.sub(r"headerClassName=[\'\"][^\'\"]*[\'\"]", "", content)
                    
                    def remove_class_from_modal(match):
                        tag = match.group(0)
                        tag = re.sub(r"\s+className=[\'\"][^\'\"]*[\'\"]", "", tag)
                        tag = re.sub(r"\s+className=\{[^\}]+\}", "", tag)
                        tag = re.sub(r"\s+bodyClassName=\{[^\}]+\}", "", tag)
                        tag = re.sub(r"\s+headerClassName=\{[^\}]+\}", "", tag)
                        return tag
                    
                    content = re.sub(r"<Modal[^>]*>", remove_class_from_modal, content)
                    
                    with open(path, "w") as f:
                        f.write(content)
                    print(f"Migrated Modal in: {path}")

if __name__ == "__main__":
    migrate_modals("src/components")
