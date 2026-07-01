import os
import re

files_to_update = [
    "src/components/inventory/ProductModal.tsx",
    "src/components/inventory/ProductDetailHub.tsx",
    "src/components/pos/CheckoutModal.tsx",
    "src/components/customers/CustomerModal.tsx",
    "src/components/expenses/ExpenseModal.tsx",
    "src/components/inventory/suppliers/SupplierModal.tsx",
    "src/components/users/UserModal.tsx"
]

for file in files_to_update:
    if os.path.exists(file):
        with open(file, "r") as f:
            content = f.read()
            
        # Replace maxWidth="md" or maxWidth="sm" with maxWidth="lg"
        new_content = re.sub(r'maxWidth="(md|sm)"', 'maxWidth="lg"', content)
        
        # Replace sm:grid-cols-2 with md:grid-cols-2
        new_content = new_content.replace("sm:grid-cols-2", "md:grid-cols-2")
        new_content = new_content.replace("sm:col-span-2", "md:col-span-2")
        
        if new_content != content:
            with open(file, "w") as f:
                f.write(new_content)
            print(f"Updated {file}")

