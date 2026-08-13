with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'r') as f:
    lines = f.readlines()

# Delete lines 2712 to 2797 (0-indexed: 2711 to 2797)
del lines[2711:2797]

with open('supabase/schema/SUPER_MASTER_SCHEMA.sql', 'w') as f:
    f.writelines(lines)

print("Fixed")
