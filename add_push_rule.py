import os

rule_text = """
## 🚀 MANDATORY ALL-PROJECT PUSH RULE (MANDATORY)

- **Push Everywhere:** Whenever you make ANY code change, bug fix, or schema update, you MUST ALWAYS push the updated code to ALL 4 projects immediately. 
- **Command:** `git push origin main && git push atonline main && git push minimahalpos main && git push pizzamilano main`
- **Never Skip:** Never assume a fix is just for one project. Code updates must be synced globally so all clones stay 100% identical.
"""

for filepath in ["AGENTS.md", "GEMINI.md"]:
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            content = f.read()
        
        if "MANDATORY ALL-PROJECT PUSH RULE" not in content:
            content = content.replace("---", f"---\n{rule_text}\n", 1)
            with open(filepath, "w") as f:
                f.write(content)
            print(f"Added push rule to {filepath}")
