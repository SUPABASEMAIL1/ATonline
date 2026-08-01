# OpenCode Chat Context (Session) Guide

Jab aap apna terminal (ya OpenCode) band karte hain, to aapka purana chat context (jis baat cheet par aap kaam kar rahe thay) aam taur par khatam ho jata hai. 

Lekin agar aap chahte hain ki **purani chat wahin se dobara shuru ho**, to aap `--continue` (ya `-c`) flag ka istemal kar sakte hain.

## 1. Naya Session Continue Kaise Karein?

Agar aapne apna terminal band kar diya hai, aur aap pichli chat ko wapas laana chahte hain, to command mein `--continue` add kar dein.

**Example Command:**
```bash
opencode --port 52262 --continue
```
*Is command se OpenCode port `52262` par start hoga aur aapki aakhri chat history wapas aa jayegi.*

## 2. Pata Kaise Chalega Ke Pichla Port Ya Session Kaunsa Tha?

Agar aap bhool gaye hain ke kaunse port ya session par kaam kar rahe thay, ya phir ek session se doosre par shift karna chahte hain, to iske 2 asaan tareeqay hain:

### Tareeqa A: VS Code Terminal Tabs Se (Sabse Asaan)
Aapke VS Code mein neeche jahan terminal khula hota hai, wahan right side par **Terminal Tabs** (ya dropdown list) hoti hai. Aap wahan alag alag tabs par click karke dekh sakte hain ke kis tab mein kaunsa port (e.g. 43181, 31476) run ho raha hai. Aap simply tab change kar ke doosre session par shift ho sakte hain.

### Tareeqa B: Session List Command Se
Agar aapne terminals band kar diye hain, to naya terminal khol kar ye command likhein:
```bash
opencode session list
```
Ye command aapko aapke tamam pichle sessions ki list aur unki ek **ID** dikhayegi.

Phir us specific session ko wapas kholne ke liye uski ID use karein:
```bash
opencode --session <wahan_se_dekhi_hui_ID>
```
*(Misaal ke taur par: `opencode --session abc1234`)*

## 3. Asaan Alfazon Mein (Summary)
- Naya chat start karna hai: `opencode --port 52262`
- Purana chat wapas lana hai: `opencode --port 52262 --continue`
- Session ki list dekhni hai: `opencode session list`

**Note:** Jab bhi aap chat ko resume karna chahein, bas `--continue` lagana na bhoolein!
