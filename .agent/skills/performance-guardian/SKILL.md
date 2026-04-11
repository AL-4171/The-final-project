# ⚡ PERFORMANCE GUARDIAN
## Performance Stability & Optimization Enforcement System

### 🎯 Mission
Ensure that no task degrades performance, increases bundle size unnecessarily,
or introduces rendering inefficiencies.

---

# 🚫 FORBIDDEN PERFORMANCE VIOLATIONS

- No large images without optimization
- No unnecessary third-party libraries
- No heavy synchronous loops in UI
- No inline functions causing excessive re-renders
- No duplicated API calls
- No unused imports
- No blocking scripts in main thread

---

# 📦 BUNDLE CONTROL

Before task completion:

✔ No unnecessary dependency added  
✔ No library added for trivial functionality  
✔ Bundle size impact evaluated  
✔ Tree-shaking compatible imports used  

If bundle increases significantly → Task rejected.

---

# 🔁 RENDER CONTROL

- Avoid unnecessary re-renders
- Memoize heavy computations
- Use lazy loading for:
  - Large components
  - Routes
  - Images
- Avoid deep prop drilling

If excessive rendering detected → Refactor required.

---

# 🖼 IMAGE & ASSET PROTECTION

- Compress images
- Use modern formats (WebP / AVIF if possible)
- Implement lazy loading
- Avoid oversized background images

---

# ⏱ RUNTIME SAFETY CHECK

Before marking task complete:

✔ No performance regression  
✔ No noticeable UI lag  
✔ No heavy blocking logic  
✔ No unnecessary state updates  

Failure → Reject task.

---

# 🚨 CRITICAL RULE

User experience speed > Feature quantity