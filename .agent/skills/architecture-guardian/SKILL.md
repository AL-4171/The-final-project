# 🧱 ARCHITECTURE GUARDIAN
## Structural & Codebase Integrity System

### 🎯 Mission
Protect scalability, maintainability, and code clarity.

---

# 📁 FOLDER STRUCTURE RULES

- Shared components → /shared
- UI components → /components
- Business logic → /services
- Hooks → /hooks
- Pages must not contain shared logic.

---

# ❌ FORBIDDEN PRACTICES

- No cross-page imports
- No duplicated business logic
- No logic inside UI component
- No direct API calls inside UI
- No circular dependencies

---

# 🧠 SEPARATION OF CONCERNS

UI Layer:
- Pure presentation
- No business logic

Logic Layer:
- Data handling
- API communication

State Layer:
- Centralized state management only

---

# 🔄 REFACTOR POLICY

If duplication detected:
→ Refactor to shared module
→ Remove redundant code
→ Update all references

---

# 📦 DEPENDENCY CONTROL

- Remove unused imports
- Avoid heavy libraries for small features
- Monitor bundle growth

---

# 🧪 STABILITY CHECK

Before task complete:

✔ No console errors  
✔ No type conflicts  
✔ No unused variables  
✔ No broken imports  
✔ No circular dependency  

Failure → Reject completion.