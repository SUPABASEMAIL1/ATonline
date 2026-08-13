with open("AGENTS.md", "r") as f:
    agents = f.read()

rule_text = """
## 🌍 UNIVERSAL REUSABILITY RULE (MANDATORY)

- **Code is Universal:** This system is designed for **multiple clones/shops**. NEVER fix a bug, UI issue, or add a feature in a "shop-specific" or "one-off" way.
- **Global Code Changes:** ALL fixes (whether it's CSS, layout, logic, or bug fixes) MUST be implemented in the core codebase (`src/`, `index.css`, `shared/`) so that the exact same code runs universally across all current and future clones.
- **Future-Proofing:** Every time you write code, ask yourself: *"Will this work seamlessly on the next new clone without any manual changes?"* If the answer is no, your code is wrong.
"""

if "UNIVERSAL REUSABILITY RULE" not in agents:
    agents = agents.replace("---", f"---\n{rule_text}\n", 1)
    with open("AGENTS.md", "w") as f:
        f.write(agents)

with open("GEMINI.md", "r") as f:
    gemini = f.read()

if "UNIVERSAL REUSABILITY RULE" not in gemini:
    gemini = gemini.replace("---", f"---\n{rule_text}\n", 1)
    with open("GEMINI.md", "w") as f:
        f.write(gemini)

print("Rules added successfully")
