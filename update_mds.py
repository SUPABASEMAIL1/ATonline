import os

rule_text = """
## 🗣️ COMMUNICATION RULE (MANDATORY)
- **Short & To the Point:** Always keep your answers extremely short and directly to the point. No long explanations.
- **Language:** ALWAYS reply in **Roman Urdu** (e.g., "Han bhai, fix kar diya hai").
"""

def append_to_file(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'a') as f:
            f.write(rule_text)
        print(f"Updated {filepath}")

append_to_file("AGENTS.md")
append_to_file("GEMINI.md")
