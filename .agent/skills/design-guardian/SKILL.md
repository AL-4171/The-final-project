# 🎨 DESIGN GUARDIAN
## Unified Visual Identity Enforcement System

### 🎯 Mission
Ensure complete visual consistency across the entire product.

---

# 🔒 STRICT RULES

## ❌ Forbidden
- No inline styles
- No hardcoded hex colors
- No random Tailwind utility mixing
- No local component styling overrides
- No page-specific theme hacks

---

# 🎨 DESIGN TOKEN SYSTEM (MANDATORY)

All styling must use global tokens:

## Colors
- --color-primary
- --color-secondary
- --color-bg
- --color-text
- --color-success
- --color-danger
- --color-warning

If a new color is required:
1. Add it to global theme.
2. Document it.
3. Use it via variable only.

---

# 🧱 COMPONENT GOVERNANCE

- All Buttons must use Global Button component.
- All Inputs must use Global Input component.
- All Cards must use Global Card component.
- No duplicated UI logic.

If change required:
→ Update base component.
→ Never override locally.

---

# 📐 SPACING & TYPOGRAPHY LOCK

- Use 4px spacing scale only.
- Use predefined typography scale.
- Border radius must follow token.
- Shadow must follow shadow levels.

---

# 📱 RESPONSIVE PROTECTION

Any UI change must:
- Work on Mobile
- Work on Tablet
- Work on Desktop
- Avoid layout shifts

---

# 🔍 AUTO VISUAL AUDIT BEFORE COMPLETION

Before marking task done:

✔ No color mismatch  
✔ No spacing inconsistency  
✔ No typography conflict  
✔ No visual hierarchy break  
✔ No dark/light mode conflict  

If any fail → Task rejected.