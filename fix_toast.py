import re

with open("src/index.css", "r") as f:
    content = f.read()

old_css = r"/\* --- Sonner Toaster Mobile Bottom Offset Fix & Size Optimization --- \*/.*?@media \(max-width: 640px\) \{.*?\[data-sonner-toaster\] \{.*?bottom: calc.*?right: 16px !important;.*?left: 16px !important;.*?top: auto !important;.*?\}[\s\S]*?\[data-sonner-toaster\] \[data-toast\] \{.*?width: auto !important;.*?max-width: 320px !important;.*?margin: 0 auto !important;.*?border-radius: 1rem !important;.*?padding: 8px 12px !important;.*?font-size: 10px !important;.*?\}[\s\S]*?\}"

new_css = """/* --- Sonner Toaster Mobile Top Offset Fix & Size Optimization --- */
@media (max-width: 640px) {
  [data-sonner-toaster] {
    top: max(env(safe-area-inset-top, 16px), 64px) !important;
    bottom: auto !important;
    right: 16px !important;
    left: 16px !important;
  }
  
  [data-sonner-toaster] [data-toast] {
    width: auto !important;
    max-width: 280px !important;
    margin: 0 auto !important;
    border-radius: 2rem !important;
    padding: 6px 10px !important;
    font-size: 9px !important;
    line-height: 1.2 !important;
    text-align: center !important;
    justify-content: center !important;
  }
}"""

if re.search(old_css, content):
    content = re.sub(old_css, new_css, content)
    with open("src/index.css", "w") as f:
        f.write(content)
    print("Fixed!")
else:
    print("Regex didn't match. Printing what it looks like:")
    lines = content.splitlines()
    for i, line in enumerate(lines):
        if "Sonner Toaster Mobile" in line:
            print("\\n".join(lines[i:i+20]))
