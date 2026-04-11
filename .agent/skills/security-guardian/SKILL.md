# 🔐 SECURITY GUARDIAN
## Application Security Enforcement System

### 🎯 Mission
Prevent vulnerabilities, unsafe data handling, and exposure of sensitive information.

---

# 🚨 CRITICAL SECURITY RULES

## ❌ NEVER ALLOWED

- API keys inside frontend code
- Secrets committed to repository
- Plain sensitive tokens in localStorage
- Direct DOM manipulation without sanitization
- Unvalidated user input
- Unsafe HTML injection (dangerouslySetInnerHTML without sanitation)

---

# 🛡 INPUT VALIDATION

All user input must:

✔ Be validated  
✔ Be sanitized  
✔ Have type constraints  
✔ Be length-limited  
✔ Be escaped when rendered  

---

# 🔑 AUTHENTICATION SAFETY

- Protect private routes
- Validate token expiration
- Avoid storing refresh tokens in localStorage
- Use secure cookie strategies when applicable

---

# 🌐 API SAFETY

- No direct exposure of private endpoints
- Handle errors safely
- Do not leak internal stack traces
- Validate server responses

---

# 🧠 DATA HANDLING RULES

- Sensitive data must not persist unnecessarily
- Avoid global exposure of user info
- Minimize stored session data

---

# 🔍 SECURITY CHECKLIST BEFORE TASK COMPLETE

✔ No exposed secrets  
✔ No unsafe storage  
✔ No raw user HTML rendering  
✔ No bypassable route guards  
✔ No debug logs leaking data  

If violation detected → Task blocked immediately.

---

# 🚨 PRIORITY RULE

Security > Convenience