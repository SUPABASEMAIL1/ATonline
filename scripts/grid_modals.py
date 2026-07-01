import os
import re

files_to_update = [
    "src/components/customers/CustomerModal.tsx",
    "src/components/expenses/ExpenseModal.tsx",
    "src/components/inventory/suppliers/SupplierModal.tsx"
]

for file in files_to_update:
    if os.path.exists(file):
        with open(file, "r") as f:
            content = f.read()
            
        # We replace the wrapper divs that hold the actual fields
        # They usually follow the h3 title section.
        # Let's just find <div className="space-y-6"> and change it to <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        # and see if it breaks.
        new_content = content.replace('className="space-y-6"', 'className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"')
        
        if new_content != content:
            with open(file, "w") as f:
                f.write(new_content)
            print(f"Gridified {file}")
