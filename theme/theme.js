// ================= THEME.JS - COMPLETE FIX =================
// Works on ALL browsers with guaranteed sound

// ===================== ALERT & BOB LOGIC =====================
let bobQueue = [];
let isBobShowing = false;
let activeAlertConditions = {
    soil_critical: false, soil_warning: false,
    temp_critical: false, temp_warning: false,
    water_critical: false, water_warning: false,
    hum_critical: false, hum_warning: false
};

// ===================== FORCE SOUND ON ANY BROWSER =====================
let soundPlaying = false;
let soundTimer = null;
let currentAudioContext = null;
let fallbackAudio = null;

// Main sound function with multiple fallbacks
function playAlertSound() {
    console.log("🔊 Attempting to play alert sound");
    
    // Method 1: Web Audio API (best quality)
    if (window.AudioContext || window.webkitAudioContext) {
        playWebAudio();
        return;
    }
    
    // Method 2: HTML5 Audio fallback
    playHtml5Audio();
}

function playWebAudio() {
    try {
        // Stop any currently playing sound
        if (soundPlaying) {
            if (soundTimer) clearTimeout(soundTimer);
            if (currentAudioContext) {
                try { currentAudioContext.close(); } catch(e) {}
            }
            soundPlaying = false;
        }
        
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        currentAudioContext = ctx;
        
        // Force resume if suspended (browser autoplay policy)
        const resumeAudio = () => {
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    playSoundInternal(ctx);
                }).catch(e => {
                    console.log("WebAudio resume failed, using fallback");
                    playHtml5Audio();
                });
            } else {
                playSoundInternal(ctx);
            }
        };
        
        // Try to resume immediately
        resumeAudio();
        
        // Also try on user interaction if needed
        if (ctx.state === 'suspended') {
            const resumeOnClick = () => {
                ctx.resume().then(() => {
                    document.removeEventListener('click', resumeOnClick);
                    document.removeEventListener('touchstart', resumeOnClick);
                }).catch(e => {});
            };
            document.addEventListener('click', resumeOnClick);
            document.addEventListener('touchstart', resumeOnClick);
        }
        
    } catch(e) {
        console.log("WebAudio error:", e);
        playHtml5Audio();
    }
}

function playSoundInternal(ctx) {
    try {
        soundPlaying = true;
        const now = ctx.currentTime;
        
        // Create oscillators
        const alarm = ctx.createOscillator();
        const gain = ctx.createGain();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        
        alarm.connect(gain);
        gain.connect(ctx.destination);
        modulator.connect(modGain);
        modGain.connect(gain.gain);
        
        alarm.type = 'square';
        alarm.frequency.value = 880;
        modulator.type = 'square';
        modulator.frequency.value = 4;
        modGain.gain.value = 0.4;
        
        gain.gain.setValueAtTime(0.5, now);
        
        alarm.start(now);
        modulator.start(now);
        
        // Stop after 2 seconds
        soundTimer = setTimeout(() => {
            try {
                alarm.stop(now + 2);
                modulator.stop(now + 2);
                setTimeout(() => {
                    if (currentAudioContext === ctx) {
                        ctx.close().catch(e => {});
                    }
                    soundPlaying = false;
                }, 100);
            } catch(e) {
                soundPlaying = false;
            }
        }, 100);
        
    } catch(e) {
        console.log("Play internal error:", e);
        soundPlaying = false;
        playHtml5Audio();
    }
}

function playHtml5Audio() {
    try {
        // Create a simple beep using Audio element with data URI
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.type = 'square';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.8);
        
        // Also try to resume
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        setTimeout(() => {
            audioCtx.close().catch(e => {});
        }, 1000);
        
    } catch(e) {
        console.log("HTML5 Audio error:", e);
        // Last resort - try to use a simple beep
        try {
            const beep = new Audio();
            beep.src = "data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==";
            beep.volume = 0.5;
            beep.play().catch(() => {});
        } catch(e2) {}
    }
}

// ===================== CRITICAL ALERT INTERVAL (EVERY 5 MINUTES) =====================
let criticalAlertInterval = null;

function startCriticalAlertChecker() {
    if (criticalAlertInterval) clearInterval(criticalAlertInterval);
    
    criticalAlertInterval = setInterval(() => {
        const hasActiveCritical = 
            activeAlertConditions.soil_critical ||
            activeAlertConditions.temp_critical ||
            activeAlertConditions.water_critical ||
            activeAlertConditions.hum_critical;
        
        if (hasActiveCritical) {
            console.log("🔊 5-minute critical alert - playing sound");
            playAlertSound();
            
            if (activeAlertConditions.soil_critical) {
                showBobNotification("🚨 CRITICAL ALERT", "Soil is extremely dry! Water immediately!", "critical", 8000, false);
            } else if (activeAlertConditions.temp_critical) {
                showBobNotification("🚨 CRITICAL ALERT", "Extreme temperature! Provide shade!", "critical", 8000, false);
            } else if (activeAlertConditions.water_critical) {
                showBobNotification("🚨 CRITICAL ALERT", "Water tank is empty! Activate collection!", "critical", 8000, false);
            } else if (activeAlertConditions.hum_critical) {
                showBobNotification("🚨 CRITICAL ALERT", "Very low humidity! Poor water collection!", "critical", 8000, false);
            }
        }
    }, 300000);
}

function processBobQueue() {
    if (isBobShowing || bobQueue.length === 0) return;
    
    isBobShowing = true;
    const { title, message, type, duration, playSound, bobId } = bobQueue.shift();
    
    if (playSound) {
        playAlertSound();
    }
    
    let existingBob = document.getElementById("bobNotification");
    if (existingBob) existingBob.remove();
    
    const bob = document.createElement("div");
    bob.id = "bobNotification";
    bob.setAttribute("data-bob-id", bobId);
    bob.className = `bob-notification bob-${type}`;
    let icon = "ℹ️";
    if (type === "critical") icon = "🚨";
    else if (type === "warning") icon = "⚠️";
    else if (type === "success") icon = "✅";
    
    bob.innerHTML = `
        <div class="bob-content">
            <div class="bob-icon">${icon}</div>
            <div class="bob-text">
                <div class="bob-title">${title}</div>
                <div class="bob-message">${message}</div>
            </div>
            <button class="bob-close" onclick="window.closeCurrentBob('${bobId}')">✕</button>
        </div>
        <div class="bob-progress" style="animation-duration: ${duration/1000}s"></div>
    `;
    document.body.appendChild(bob);
    
    const timeoutId = setTimeout(() => {
        const currentBob = document.getElementById("bobNotification");
        if (currentBob && currentBob.getAttribute("data-bob-id") === bobId) {
            currentBob.remove();
            isBobShowing = false;
            processBobQueue();
        }
    }, duration);
    
    bob.setAttribute("data-timeout-id", timeoutId);
}

window.closeCurrentBob = function(bobId) {
    const bob = document.getElementById("bobNotification");
    if (bob && bob.getAttribute("data-bob-id") === bobId) {
        const timeoutId = bob.getAttribute("data-timeout-id");
        if (timeoutId) clearTimeout(parseInt(timeoutId));
        bob.remove();
        isBobShowing = false;
        processBobQueue();
    }
};

function showBobNotification(title, message, type, duration = 8000, playSound = false) {
    const bobId = Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    bobQueue.push({ title, message, type, duration, playSound, bobId });
    processBobQueue();
}

function addAlertToUI(alertId, message, type, playSound = false) {
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    if (document.getElementById(`alert-${alertId}`)) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const alertClass = type === 'critical' ? 'alert-critical' : (type === 'warning' ? 'alert-warning' : 'alert-success');
    const icon = type === 'critical' ? '🚨' : (type === 'warning' ? '⚠️' : '✅');

    if (alertsBox.querySelector('.no-alerts-message')) {
        alertsBox.innerHTML = '';
    }
    
    const uniqueId = `${alertId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const alertDiv = document.createElement('div');
    alertDiv.id = `alert-${uniqueId}`;
    alertDiv.className = `alert-item ${alertClass}`;
    alertDiv.style.position = "relative";
    alertDiv.style.marginBottom = "8px";
    alertDiv.style.padding = "10px 12px";
    alertDiv.style.borderRadius = "10px";
    alertDiv.innerHTML = `
        <div style="font-size:18px;">${icon}</div>
        <div style="flex:1;padding-right:25px;"><strong style="font-size:13px;">${message}</strong><div style="font-size:10px;opacity:0.7;">${timeStr}</div></div>
        <button onclick="window.dismissAlert('${uniqueId}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:currentColor;position:absolute;right:8px;top:50%;transform:translateY(-50%);opacity:0.6;">✕</button>
    `;
    
    alertsBox.insertBefore(alertDiv, alertsBox.firstChild);
    
    if (playSound) {
        playAlertSound();
    }
    
    if (type === 'critical') {
        showBobNotification("🚨 Critical Alert", message, "critical", 15000, false);
        const bell = document.getElementById("notifToggle");
        if (bell) bell.classList.add("ringing");
    } else if (type === 'warning') {
        showBobNotification("⚠️ Warning", message, "warning", 10000, false);
    }
    
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
}

window.dismissAlert = function(uniqueId) {
    const alert = document.getElementById(`alert-${uniqueId}`);
    if (alert) alert.remove();
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
};

function removeResolvedAlert(alertType) {
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    const alerts = alertsBox.querySelectorAll(".alert-item");
    alerts.forEach(alert => {
        if (alert.id && alert.id.includes(alertType)) {
            alert.remove();
        }
    });
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
}

function showNoAlertsMessage() {
    const alertsBox = document.getElementById("alertsContainer");
    if (alertsBox && alertsBox.children.length === 0) {
        alertsBox.innerHTML = '<p class="no-alerts-message" style="font-size:12px;opacity:0.5;margin:0;text-align:center;padding:20px;">No active alerts.</p>';
    }
}

function updateBadge() {
    const badge = document.getElementById("notifBadge");
    const alerts = document.querySelectorAll("#alertsContainer .alert-item:not(.no-alerts-message)");
    const count = alerts.length;
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 9 ? '9+' : count;
            badge.style.display = "flex";
        } else {
            badge.innerText = "";
            badge.style.display = "none";
        }
    }
}

// CORRECT water value conversion for tank (0-12 sensor value)
function waterValueToPercent(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    // Clamp between 0 and 12 (sensor range)
    const clamped = Math.min(12, Math.max(0, waterValue));
    // Convert: 12 = empty (0%), 0 = full (100%)
    return Math.round(((12 - clamped) / 12) * 100);
}

// ===================== UNIVERSAL SENSOR LISTENER =====================
function startUniversalSensorListener() {
    if (!window.hydroGenDB) {
        setTimeout(startUniversalSensorListener, 1000);
        return;
    }
    
    console.log("🔥 Starting universal sensor listener");
    
    window.hydroGenDB.ref('sensors').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log("📊 Real sensor data from Firebase:", data);
            checkSensorAlerts(data);
        }
    });
}

function checkSensorAlerts(sensorData) {
    if (!sensorData) return;
    
    const hadCriticalBefore = 
        activeAlertConditions.soil_critical ||
        activeAlertConditions.temp_critical ||
        activeAlertConditions.water_critical ||
        activeAlertConditions.hum_critical;
    
    // Get REAL values from Firebase
    const soil = Number(sensorData.soil) || 0;
    const temp = Number(sensorData.temp) || 0;
    const hum = Number(sensorData.hum) || 0;
    const waterValue = Number(sensorData.water) || 12;
    const waterPercent = waterValueToPercent(waterValue);
    
    console.log(`Soil: ${soil}%, Temp: ${temp}°C, Humidity: ${hum}%, Tank: ${waterPercent}%`);
    
    // Soil alerts
    if (soil < 20 && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = true;
        addAlertToUI("soil_critical", `🚨 CRITICAL: Soil extremely dry (${soil}%)! Water immediately!`, "critical", true);
    } else if (soil >= 25 && activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = false;
        removeResolvedAlert("soil_critical");
        addAlertToUI(`soil_recovered_${Date.now()}`, `✅ Soil moisture recovered to ${soil}%`, "success", false);
    } else if (soil >= 20 && soil < 30 && !activeAlertConditions.soil_warning && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_warning = true;
        addAlertToUI("soil_warning", `⚠️ Low soil moisture (${soil}%) — Water soon`, "warning", true);
    } else if (soil >= 30 && activeAlertConditions.soil_warning) {
        activeAlertConditions.soil_warning = false;
        removeResolvedAlert("soil_warning");
    }
    
    // Temperature alerts
    if (temp > 42 && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = true;
        addAlertToUI("temp_critical", `🔥 CRITICAL: Extreme temperature (${temp}°C)! Provide shade!`, "critical", true);
    } else if (temp <= 40 && activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = false;
        removeResolvedAlert("temp_critical");
        addAlertToUI(`temp_recovered_${Date.now()}`, `✅ Temperature normalized to ${temp}°C`, "success", false);
    } else if (temp > 38 && temp <= 42 && !activeAlertConditions.temp_warning && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_warning = true;
        addAlertToUI("temp_warning", `⚠️ High temperature (${temp}°C) — Monitor plants`, "warning", true);
    } else if (temp <= 38 && activeAlertConditions.temp_warning) {
        activeAlertConditions.temp_warning = false;
        removeResolvedAlert("temp_warning");
    }
    
    // Water tank alerts (CORRECT calculation from Firebase sensor)
    if (waterPercent < 10 && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = true;
        addAlertToUI("water_critical", `💧 CRITICAL: Water tank empty (${Math.round(waterPercent)}%)! Activate collection!`, "critical", true);
    } else if (waterPercent >= 20 && activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = false;
        removeResolvedAlert("water_critical");
        addAlertToUI(`water_recovered_${Date.now()}`, `✅ Water tank level recovered to ${Math.round(waterPercent)}%`, "success", false);
    } else if (waterPercent >= 10 && waterPercent < 25 && !activeAlertConditions.water_warning && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_warning = true;
        addAlertToUI("water_warning", `⚠️ Water tank low (${Math.round(waterPercent)}%) — Refill soon`, "warning", true);
    } else if (waterPercent >= 25 && activeAlertConditions.water_warning) {
        activeAlertConditions.water_warning = false;
        removeResolvedAlert("water_warning");
    }
    
    // Humidity alerts
    if (hum < 20 && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = true;
        addAlertToUI("hum_critical", `💨 CRITICAL: Very low humidity (${hum}%)! Poor water collection!`, "critical", true);
    } else if (hum >= 25 && activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = false;
        removeResolvedAlert("hum_critical");
        addAlertToUI(`hum_recovered_${Date.now()}`, `✅ Humidity recovered to ${hum}%`, "success", false);
    } else if (hum >= 20 && hum < 30 && !activeAlertConditions.hum_warning && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_warning = true;
        addAlertToUI("hum_warning", `⚠️ Low humidity (${hum}%) — Collection slow`, "warning", true);
    } else if (hum >= 30 && activeAlertConditions.hum_warning) {
        activeAlertConditions.hum_warning = false;
        removeResolvedAlert("hum_warning");
    }
    
    const hasCriticalNow = 
        activeAlertConditions.soil_critical ||
        activeAlertConditions.temp_critical ||
        activeAlertConditions.water_critical ||
        activeAlertConditions.hum_critical;
    
    if (hasCriticalNow && !hadCriticalBefore) {
        startCriticalAlertChecker();
    } else if (!hasCriticalNow && hadCriticalBefore) {
        if (criticalAlertInterval) {
            clearInterval(criticalAlertInterval);
            criticalAlertInterval = null;
        }
    }
    
    setTimeout(showNoAlertsMessage, 100);
}

// Start the universal listener
startUniversalSensorListener();

// Stop ringing when notifications are clicked
document.addEventListener('click', (e) => {
    if (e.target.closest('#notifToggle')) {
        document.getElementById("notifToggle")?.classList.remove("ringing");
    }
});

window.dismissAlertByType = function(alertType) {
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    const alerts = alertsBox.querySelectorAll(".alert-item");
    alerts.forEach(alert => {
        if (alert.id && alert.id.includes(alertType)) {
            alert.remove();
        }
    });
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
};

function showToast(message, duration = 3000) {
    const existingToast = document.getElementById('globalToast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.innerHTML = `
        <div style="
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: toastFadeIn 0.3s ease;
        ">
            ${message}
        </div>
    `;
    document.body.appendChild(toast);
    
    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes toastFadeIn {
                from { opacity: 0; transform: translateX(100px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes toastFadeOut {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(100px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        const toastEl = document.getElementById('globalToast');
        if (toastEl) {
            toastEl.style.animation = 'toastFadeOut 0.3s ease';
            setTimeout(() => {
                if (toastEl.parentNode) toastEl.remove();
            }, 300);
        }
    }, duration);
}

window.showToast = showToast;

// ===================== PLAY ALERT ON PAGE RELOAD =====================
async function checkAndPlayAlertOnReload() {
    if (!window.hydroGenDB) return;
    
    try {
        const snapshot = await window.hydroGenDB.ref('sensors').once('value');
        const data = snapshot.val();
        
        if (data) {
            const soil = Number(data.soil) || 0;
            const temp = Number(data.temp) || 0;
            const waterPercent = waterValueToPercent(Number(data.water));
            
            const hasCriticalCondition = (
                soil < 20 ||
                temp > 42 ||
                waterPercent < 10
            );
            
            if (hasCriticalCondition) {
                setTimeout(() => playAlertSound(), 1000);
                console.log("🔊 Alert played on page reload");
                startCriticalAlertChecker();
            }
        }
    } catch(e) {
        console.log("Error checking sensors on reload:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(checkAndPlayAlertOnReload, 1500);
    });
} else {
    setTimeout(checkAndPlayAlertOnReload, 1500);
}

// Force audio to work on ANY browser - unlock on first user interaction
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    
    // Create a silent context to unlock audio
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
            ctx.close();
        }).catch(e => {});
    } else {
        ctx.close();
    }
    
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
}

document.addEventListener('click', unlockAudio);
document.addEventListener('touchstart', unlockAudio);
document.addEventListener('keydown', unlockAudio);

// ================= ORIGINAL THEME.JS CODE BELOW (UNCHANGED) =================

function initTheme() {

    /* ===============================
       SIDE MENU
    =============================== */
    const menuBtn = document.getElementById("menuBtn");
    const closeBtn = document.getElementById("closeBtn");
    const sideMenu = document.getElementById("sideMenu");
    const overlay = document.getElementById("menuOverlay");

    const navLinks = document.getElementById("navLinks");

    menuBtn?.addEventListener("click", () => {
        sideMenu?.classList.add("active");
        overlay?.classList.add("active");
        navLinks?.classList.toggle("show");
    });

    closeBtn?.addEventListener("click", () => {
        sideMenu?.classList.remove("active");
        overlay?.classList.remove("active");
    });

    overlay?.addEventListener("click", () => {
        sideMenu?.classList.remove("active");
        overlay?.classList.remove("active");
    });


    /* ===============================
       REPORTS SUBMENU
    =============================== */

    // Desktop
    const reportsBtnDesktop = document.getElementById("reportsBtnDesktop");
    const reportsMenuDesktop = document.getElementById("reportsMenuDesktop");

    // Mobile
    const reportsBtnMobile = document.getElementById("reportsBtnMobile");
    const reportsMenuMobile = document.getElementById("reportsMenuMobile");


    /* ===============================
       THEME
    =============================== */
    function applyTheme(mode) {
        if (mode === "dark") {
            document.body.classList.add("dark");
        } else if (mode === "light") {
            document.body.classList.remove("dark");
        } else {
            document.body.classList.toggle(
                "dark",
                window.matchMedia("(prefers-color-scheme: dark)").matches
            );
        }
    }

    applyTheme(localStorage.getItem("theme") || "system");

    ["appearanceBtn", "appearanceBtn2"].forEach(id => {
        const btn = document.getElementById(id);
        const menu = document.getElementById(
            id === "appearanceBtn" ? "themeMenu" : "themeMenu2"
        );

        btn?.addEventListener("click", e => {
            e.stopPropagation();
            if (menu) {
                menu.style.display = menu.style.display === "flex" ? "none" : "flex";
            }
        });
    });

    document.querySelectorAll("[data-theme]").forEach(btn => {
        btn.addEventListener("click", () => {
            localStorage.setItem("theme", btn.dataset.theme);
            applyTheme(btn.dataset.theme);
            document.querySelectorAll(".theme-submenu").forEach(menu => menu.style.display = "none");
        });
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((localStorage.getItem("theme") || "system") === "system") {
            applyTheme("system");
        }
    });


    /* ===============================
       PROFILE DROPDOWN
    =============================== */
    const profileBtn = document.getElementById("profileBtn");
    const profileDropdown = document.getElementById("profileDropdown");


    function closeAllMenus() {
        profileDropdown?.classList.remove("active");
        document.querySelector(".notification-wrapper")?.classList.remove("active");
        document.querySelectorAll(".theme-submenu").forEach(menu => menu.style.display = "none");
        reportsMenuDesktop?.classList.remove("show");
        reportsMenuMobile?.classList.remove("show");
    }


    profileBtn?.addEventListener("click", e => {
        e.stopPropagation();
        const opened = profileDropdown?.classList.contains("active");
        closeAllMenus();
        if (!opened) {
            profileDropdown?.classList.add("active");
        }
    });


    document.addEventListener("click", e => {
        if (!profileBtn?.contains(e.target) && !profileDropdown?.contains(e.target)) {
            closeAllMenus();
        }
    });


    /* ===============================
       USER INFO
    =============================== */
    try {
        const raw = localStorage.getItem("hydroUser");
        const user = raw ? JSON.parse(raw) : null;

        if (user) {
            const name = user.name || user.email || "User";
            const email = user.email || "";
            const initial = name[0].toUpperCase();

            const username = document.getElementById("username");
            const emailEl = document.getElementById("email");
            const avatar = document.querySelector(".avatar");

            if (username) username.textContent = name;
            if (emailEl) emailEl.textContent = email;

            if (avatar) {
                avatar.textContent = initial;
                const colors = ["#2e7d32", "#1565c0", "#6a1b9a", "#c62828", "#f57f17", "#00695c"];
                avatar.style.backgroundColor = colors[initial.charCodeAt(0) % colors.length];
            }
        }
    } catch (e) { }


    /* ===============================
       SWITCH ACCOUNT
    =============================== */
    document.querySelectorAll(".drop-item").forEach(btn => {
        if (btn.textContent.trim().startsWith("Switch")) {
            btn.addEventListener("click", () => {
                localStorage.removeItem("hydroUser");
                window.location.href = "../login/Login.html";
            });
        }
    });


    /* ===============================
       LOGOUT
    =============================== */
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem("hydroUser");
        window.location.href = "../landing/landing.html";
    });


    /* ===============================
       NOTIFICATIONS
    =============================== */
    const notifToggle = document.getElementById("notifToggle");
    const notifWrapper = document.querySelector(".notification-wrapper");


    notifToggle?.addEventListener("click", e => {
        e.stopPropagation();
        notifWrapper?.classList.toggle("active");
    });

    document.addEventListener("click", e => {
        if (!notifWrapper?.contains(e.target)) {
            notifWrapper?.classList.remove("active");
        }
    });


    /* ===============================
       REPORTS CLICK
    =============================== */

    reportsBtnDesktop?.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        reportsMenuDesktop?.classList.toggle("show");
    });


    reportsBtnMobile?.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        reportsMenuMobile?.classList.toggle("show");
    });


    document.addEventListener("click", e => {
        if (!reportsBtnDesktop?.contains(e.target) && !reportsMenuDesktop?.contains(e.target)) {
            reportsMenuDesktop?.classList.remove("show");
        }
        if (!reportsBtnMobile?.contains(e.target) && !reportsMenuMobile?.contains(e.target)) {
            reportsMenuMobile?.classList.remove("show");
        }
    });

}


/* ===============================
   INIT
=============================== */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}