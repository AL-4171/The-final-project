// ================= COMPLETE FIXED DASHBOARD.JS =================
// Working PDF reports with CHARTS in all report types

// ── Auth Guard ──
(function () {
  if (!localStorage.getItem("hydroUser")) {
    window.location.replace("../landing/landing.html");
  }
})();

const db = window.hydroGenDB;

const envTemp = document.getElementById("envTemp");
const envHum = document.getElementById("envHum");
const envSoil = document.getElementById("envSoil");

const cardTemp = document.getElementById("cardTemp");
const cardHum = document.getElementById("cardHum");
const cardSoil = document.getElementById("cardSoil");
const cardPump = document.getElementById("cardPump");

const tankFill = document.getElementById("tankLevelFill");
const tankPercent = document.getElementById("tankLevelPercent");
const tankLiters = document.getElementById("tankLevelCm");
const tankCmValue = document.getElementById("tankLevelCmValue");

const pumpToggle = document.getElementById("pumpToggle");
const pumpText = document.getElementById("pumpStatusText");

const alertsBox = document.getElementById("alertsContainer");
const sound = document.getElementById("alertSound");

const liveBadge = document.querySelector(".live-badge");

const maxTankLevelCm = 30;
const maxCapacityLiters = 2;
let lastWaterLevel = null;
let consumptionHistory = [];
let isAIActive = false;
let historyData = [];
let activeAlertConditions = {
    soil_critical: false, soil_warning: false,
    temp_critical: false, temp_warning: false,
    water_critical: false, water_warning: false,
    hum_critical: false, hum_warning: false
};
let mode = "hour";
let weatherRainExpected = false;
let currentSensorData = null;
let lastPumpState = false;
let chatInitialized = false;
let chart = null;

function updateNotificationCount() {
    const alerts = document.querySelectorAll("#alertsContainer .alert-item");
    const badge = document.getElementById("notifBadge");

    const count = alerts.length;

    if (count > 0) {
        badge.innerText = count;
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
}

document.querySelectorAll(".btn-primary").forEach(btn => {
  btn.addEventListener("click", () => {
    const url = btn.dataset.link;
    window.location.href = url;
  });
});
document.querySelectorAll(".btn-secondary").forEach(btn => {
  btn.addEventListener("click", () => {
    const url = btn.dataset.link;
    window.location.href = url;
  });
});
// ===================== CONVERT WATER CM TO PERCENTAGE =====================
function waterCmToPercent(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return 100;
    return (waterLevelCm / maxTankLevelCm) * 100;
}

function waterCmToLiters(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return maxCapacityLiters;
    return (waterLevelCm / maxTankLevelCm) * maxCapacityLiters;
}

function getWaterHeightCm(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return maxTankLevelCm;
    return waterLevelCm;
}

// ================= PLAY ALERT SOUND =================
function playAlertSound() {
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Audio play failed:", e));
    }
}

// ================= ADD ALERT TO UI =================
function addAlertToUI(alertId, message, type) {
    if (!alertsBox) return;
    if (document.getElementById(`alert-${alertId}`)) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const alertClass = type === 'critical' ? 'alert-critical' : (type === 'warning' ? 'alert-warning' : 'alert-success');
    const icon = type === 'critical' ? '🚨' : (type === 'warning' ? '⚠️' : '✅');
    
    if (alertsBox.querySelector('.no-alerts-message')) {
        alertsBox.innerHTML = '';
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.id = `alert-${alertId}`;
    alertDiv.className = `alert-item ${alertClass}`;
    alertDiv.innerHTML = `
        <div>${icon}</div>
        <div class="flex-grow-1"><strong>${message}</strong><div class="small opacity-75">${timeStr}</div></div>
        <button class="btn-close btn-sm" onclick="dismissAlert('${alertId}')" style="background: none; border: none; cursor: pointer; font-size: 12px;">✕</button>
    `;
    alertsBox.insertBefore(alertDiv, alertsBox.firstChild);
    
    if (type === 'critical') playAlertSound();
    
    while (alertsBox.children.length > 8) alertsBox.removeChild(alertsBox.lastChild);
updateNotificationCount();
}

window.dismissAlert = function(alertId) {
    const alert = document.getElementById(`alert-${alertId}`);
    if (alert) alert.remove();
    updateNotificationCount();
    setTimeout(showNoAlertsMessage, 100);
};

function removeResolvedAlert(alertId) {
    const alert = document.getElementById(`alert-${alertId}`);
    if (alert) alert.remove();
    updateNotificationCount();
}

function showNoAlertsMessage() {
    if (alertsBox && alertsBox.children.length === 0) {
        const noAlertsDiv = document.createElement('div');
        noAlertsDiv.className = 'no-alerts-message text-center py-4 text-gray-500';
        noAlertsDiv.innerText = '✅ No active alerts - All systems normal';
        alertsBox.appendChild(noAlertsDiv);
    }
}

// ================= INTELLIGENT AI CONTROL =================
function calculateWaterNeed(d) {
    let needScore = 0;
    if (d.soil < 20) needScore += 60;
    else if (d.soil < 30) needScore += 50;
    else if (d.soil < 40) needScore += 35;
    else if (d.soil < 50) needScore += 20;
    else if (d.soil > 70) needScore -= 15;
    
    if (d.temp > 38) needScore += 25;
    else if (d.temp > 33) needScore += 18;
    else if (d.temp > 28) needScore += 10;
    else if (d.temp < 15) needScore -= 10;
    
    if (d.hum < 25) needScore += 15;
    else if (d.hum < 35) needScore += 10;
    else if (d.hum > 75) needScore -= 10;
    
    const waterPercent = waterCmToPercent(d.water);
    if (waterPercent < 15) needScore = 0;
    else if (waterPercent < 30) needScore *= 0.5;
    if (weatherRainExpected) needScore *= 0.6;
    
    return Math.min(100, Math.max(0, Math.round(needScore)));
}

function runAI(d) {
    if (!isAIActive) return;
    const waterNeed = calculateWaterNeed(d);
    const waterPercent = waterCmToPercent(d.water);
    const tankHasWater = waterPercent > 15;
    let shouldRun = false, reason = "";
    
    if (waterNeed > 50 && tankHasWater && !weatherRainExpected) {
        shouldRun = true;
        reason = `Soil dry (${d.soil}%) + Heat (${d.temp}°C)`;
    } else if (waterNeed > 70 && tankHasWater) {
        shouldRun = true;
        reason = `Critical dryness (${waterNeed}% need)`;
    } else if (waterNeed < 25) {
        shouldRun = false;
        reason = "Soil moisture sufficient";
    } else if (!tankHasWater) {
        shouldRun = false;
        reason = "Low water tank";
    } else if (weatherRainExpected && waterNeed < 55) {
        shouldRun = false;
        reason = "Rain expected";
    }
    
    if (shouldRun !== lastPumpState) {
        pumpRef.set(shouldRun ? 1 : 0);
        lastPumpState = shouldRun;
        addAlertToUI(`ai_action_${Date.now()}`, `🤖 AI: ${shouldRun ? "Started irrigation" : "Stopped irrigation"} (${reason})`, 'success');
        setTimeout(() => removeResolvedAlert(`ai_action_${Date.now()}`), 5000);
    }
    
    const insightText = document.getElementById("smartInsight");
    if (insightText) insightText.innerHTML = shouldRun ? `🤖 AI: Watering (Need: ${waterNeed}%)` : `🤖 AI: Idle - ${reason}`;
}

// ================= PUMP & AI CONTROL =================

const manualToggle   = document.getElementById("pumpToggle");
const aiToggleSwitch = document.getElementById("aiToggle");
let isWritingToPump  = false;
let pumpWriteTimer   = null;

// ── helpers ──
function lockPumpWrite() {
  isWritingToPump = true;
  clearTimeout(pumpWriteTimer);
  // safety: always release after 3s max, never stays stuck
  pumpWriteTimer = setTimeout(() => { isWritingToPump = false; }, 3000);
}
function unlockPumpWrite() {
  clearTimeout(pumpWriteTimer);
  isWritingToPump = false;
}

// ── Manual Toggle ──
manualToggle?.addEventListener("change", async () => {
  if (isWritingToPump) {
    // snap back to prevent stuck state
    manualToggle.checked = !manualToggle.checked;
    return;
  }

  if (aiToggleSwitch) aiToggleSwitch.checked = false;
  isAIActive = false;

  const desired = manualToggle.checked;
  lockPumpWrite();
  try {
    await pumpRef.set(desired ? 1 : 0);
  } catch (e) {
    console.error("Pump write failed:", e);
    manualToggle.checked = !desired; // rollback
  } finally {
    unlockPumpWrite();
  }
});

// ── AI Toggle ──
aiToggleSwitch?.addEventListener("change", () => {
  isAIActive = aiToggleSwitch.checked;

  if (isAIActive) {
    if (manualToggle) {
      manualToggle.checked  = false;
      manualToggle.disabled = true;
      manualToggle.closest("label").style.opacity = "0.4";
    }
    if (currentSensorData) runAI(currentSensorData);
  } else {
    if (manualToggle) {
      manualToggle.disabled = false;
      manualToggle.checked = typeof lastPumpState !== "undefined" ? lastPumpState : false; manualToggle.closest("label").style.opacity = "1";
    }
    const insightText = document.getElementById("smartInsight");
    if (insightText) insightText.innerHTML = "🔵 Manual Mode Active";
  }
});

// ================= CREATE CHART =================
function createChart() {
    const ctx = document.getElementById("analyticsChart");
    if (!ctx) return;
    
    chart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [
            { label: "Temperature (°C)", data: [], borderColor: "#ff6384", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Humidity (%)", data: [], borderColor: "#36a2eb", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Soil Moisture (%)", data: [], borderColor: "#4bc0c0", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Water Level (%)", data: [], borderColor: "#ffcd56", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 }
        ]},
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: "index", intersect: false },
            plugins: { tooltip: { enabled: true }, legend: { position: "top" } },
            scales: { y: { min: 0, max: 100, title: { display: true, text: "Value" } }, x: { title: { display: true, text: "Time Period" }, ticks: { autoSkip: true, maxRotation: 45 } } }
        }
    });
}

// ================= HISTORY LISTENER =================
db.ref("history").on("value", snap => {
    historyData = [];
    const hourMap = new Map();
    
    snap.forEach(child => {
        const v = child.val();
        if (!v) return;
        const waterPercent = waterCmToPercent(v.water);
        const date = new Date(v.time);
        const hourKey = `${date.toDateString()}_${date.getHours()}`;
        
        if (!hourMap.has(hourKey) || v.time > hourMap.get(hourKey).time) {
            hourMap.set(hourKey, {
                temp: +v.temp || 0, hum: +v.hum || 0, soil: +v.soil || 0,
                water: waterPercent, waterRaw: v.water,
                time: +v.time || Date.now(), hour: date.getHours(), date: date
            });
        }
    });
    
    historyData = Array.from(hourMap.values());
    historyData.sort((a, b) => a.time - b.time);
    buildChart();
});

// ================= UPDATE CARD COLORS =================
function updateCardColors(temp, hum, soil, pumpOn) {

    // ===== Temperature =====
    const tempStatus = document.getElementById("tempStatus");

    if (temp > 40) {
        tempStatus.innerText = "Critical 🔥";
        tempStatus.className = "status critical";
    } else if (temp > 30) {
        tempStatus.innerText = "Hot ⚠️";
        tempStatus.className = "status warning";
    } else if (temp < 15) {
        tempStatus.innerText = "Cold ❄️";
        tempStatus.className = "status warning";
    } else {
        tempStatus.innerText = "Normal";
        tempStatus.className = "status normal";
    }

    // ===== Humidity =====
    const humStatus = document.getElementById("humStatus");

    if (hum < 20) {
        humStatus.innerText = "Dry ⚠️";
        humStatus.className = "status warning";
    } else if (hum > 80) {
        humStatus.innerText = "High 💧";
        humStatus.className = "status warning";
    } else {
        humStatus.innerText = "Normal";
        humStatus.className = "status normal";
    }

    // ===== Soil =====
    const soilStatus = document.getElementById("soilStatus");

    if (soil < 20) {
        soilStatus.innerText = "Critical 🌱";
        soilStatus.className = "status critical";
    } else if (soil < 35) {
        soilStatus.innerText = "Dry 🌱";
        soilStatus.className = "status warning";
    } else {
        soilStatus.innerText = "Healthy 🌿";
        soilStatus.className = "status normal";
    }

    // ===== Pump =====
    if (pumpText) {
        pumpText.innerText = pumpOn ? "ON 🟢" : "OFF 🔴";
        pumpText.className = pumpOn ? "status normal" : "status critical";
    }
}

// ================= FEATURE CARDS UPDATE =================
function updateWaterPrediction(d) {
    let msg = "Stable ✅";
    if (d.soil < 25) msg = "Water needed soon 🚨";
    else if (d.hum > 80) msg = "Rain expected 🌧";
    const el = document.getElementById("waterPrediction");
    if (el) el.innerText = msg;
}

function updateSystemHealth(d) {
    let score = 100;
    if (d.temp > 40) score -= 25;
    if (d.soil < 25) score -= 35;
    if (d.hum < 25) score -= 20;
    const waterPercent = waterCmToPercent(d.water);
    if (waterPercent < 20) score -= 20;
    let status = score > 70 ? "Excellent ✅" : (score > 40 ? "Warning ⚠️" : "Critical 🚨");
    const el = document.getElementById("systemHealth");
    if (el) el.innerText = status + " (" + Math.max(0, score) + "%)";
}

function updateSmartInsight(d) {
    let msg = "✅ System Optimal";
    if (d.soil < 25 && d.temp > 32) msg = "🚿 ACTION: Start watering now";
    else if (d.soil < 20) msg = "🚨 ACTION: Immediate irrigation required";
    else if (d.hum > 85) msg = "⏸ ACTION: Stop watering (Rain expected)";
    else if (waterCmToPercent(d.water) < 20) msg = "⚠️ ACTION: Refill water tank";
    else if (d.temp > 38) msg = "🔥 ACTION: Provide shade, extreme heat";
    else if (d.hum < 25) msg = "💨 ACTION: Increase humidity";
    const el = document.getElementById("smartInsight");
    if (el && !isAIActive) el.innerText = msg;
}

function updatePlantStress(d) {
    let stress = 0;
    if (d.temp > 35) stress += 30;
    if (d.soil < 30) stress += 45;
    if (d.hum < 30) stress += 25;
    let level = stress > 70 ? "High 🚨" : (stress > 40 ? "Medium ⚠️" : "Low 🌿");
    const el = document.getElementById("plantStress");
    if (el) el.innerText = level + " (" + stress + "%)";
}

// ================= LIVE SENSOR LISTENER =================
db.ref("sensors").on("value", async (snap) => {
    const d = snap.val();
    if (!d) return;
    
    currentSensorData = d;
    envTemp.innerText = d.temp + " °C";
    envHum.innerText = d.hum + " %";
    envSoil.innerText = d.soil + " %";
    
    const waterPercent = waterCmToPercent(d.water);
    const volume = waterCmToLiters(d.water);
    const waterHeightCm = getWaterHeightCm(d.water);
    
    tankFill.style.height = waterPercent + "%";
document.getElementById("tankProgressFill").style.width = waterPercent + "%";
document.getElementById("tankPercentText").innerText = Math.round(waterPercent) + "%";

document.getElementById("tankLitersText").innerText =
    volume.toFixed(2) + " / " + maxCapacityLiters + " L";
    tankPercent.innerText = Math.round(waterPercent) + "%";
    tankLiters.innerText = volume.toFixed(2) + " L";
    if (tankCmValue) tankCmValue.innerText = waterHeightCm.toFixed(1) + " cm";
    
    const pumpSnapshot = await pumpRef.once('value');
    updateCardColors(d.temp, d.hum, d.soil, pumpSnapshot.val() === 1);
    updateWaterPrediction(d);
    updateSystemHealth(d);
    updateSmartInsight(d);
    updatePlantStress(d);
    // handleSensorAlerts(d);
    
    const now = new Date();
    const existingIndex = historyData.findIndex(item => {
        const itemDate = new Date(item.time);
        return itemDate.toDateString() === now.toDateString() && itemDate.getHours() === now.getHours();
    });
    
    const newEntry = { temp: d.temp, hum: d.hum, soil: d.soil, water: waterPercent, waterRaw: d.water, time: Date.now(), hour: now.getHours(), date: now };
    
    if (existingIndex >= 0) {
        historyData[existingIndex] = newEntry;
    } else {
        historyData.push(newEntry);
        await db.ref('history').push({ temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: Date.now() });
    }
    
    historyData.sort((a, b) => a.time - b.time);
    if (historyData.length > 48) historyData = historyData.slice(-48);
    
    buildChart();
    if (isAIActive) runAI(d);
    trackConsumption(waterPercent);
});

document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

function buildChart() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => ds.data = []);
    if (historyData.length === 0) { chart.update(); return; }
    
    if (mode === "hour") {
        const displayData = historyData.slice(-12);
        displayData.forEach(d => {
            const date = new Date(d.time);
            let hour = date.getHours();
            let ampm = hour >= 12 ? 'PM' : 'AM';
            let hour12 = hour % 12 || 12;
            chart.data.labels.push(`${hour12}:00 ${ampm}`);
            chart.data.datasets[0].data.push(d.temp);
            chart.data.datasets[1].data.push(d.hum);
            chart.data.datasets[2].data.push(d.soil);
            chart.data.datasets[3].data.push(d.water);
        });
    } else if (mode === "day") {
        const dailyMap = new Map();
        historyData.forEach(d => {
            const dayKey = new Date(d.time).toLocaleDateString("en-GB");
            if (!dailyMap.has(dayKey) || d.time > dailyMap.get(dayKey).time) {
                dailyMap.set(dayKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: dayKey });
            }
        });
        Array.from(dailyMap.values()).slice(-7).forEach(day => {
            chart.data.labels.push(day.label);
            chart.data.datasets[0].data.push(day.temp);
            chart.data.datasets[1].data.push(day.hum);
            chart.data.datasets[2].data.push(day.soil);
            chart.data.datasets[3].data.push(day.water);
        });
    } else if (mode === "month") {
        const monthlyMap = new Map();
        historyData.forEach(d => {
            const monthKey = new Date(d.time).toLocaleDateString("en-GB", { month: 'short', year: 'numeric' });
            if (!monthlyMap.has(monthKey) || d.time > monthlyMap.get(monthKey).time) {
                monthlyMap.set(monthKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: monthKey });
            }
        });
        Array.from(monthlyMap.values()).slice(-6).forEach(month => {
            chart.data.labels.push(month.label);
            chart.data.datasets[0].data.push(month.temp);
            chart.data.datasets[1].data.push(month.hum);
            chart.data.datasets[2].data.push(month.soil);
            chart.data.datasets[3].data.push(month.water);
        });
    }
    chart.update();
}

// ================= PUMP CONTROL =================
const pumpRef = db.ref("controls/pump");
pumpRef.on("value", snap => {
    const val = !!snap.val();
    lastPumpState = val;

    // release write lock as soon as Firebase echoes back
    unlockPumpWrite();

    pumpText.innerText = val ? "ON 🟢" : "OFF 🔴";
    pumpText.className = val ? "status normal" : "status critical";

    if (!isAIActive && !isWritingToPump) {
        if (manualToggle) {
            manualToggle.checked  = val;
            manualToggle.disabled = false;
            manualToggle.checked = typeof lastPumpState !== "undefined" ? lastPumpState : false; manualToggle.closest("label").style.opacity = "1";
        }
    } else if (isAIActive) {
        if (manualToggle) {
            manualToggle.disabled = true;
            manualToggle.closest("label").style.opacity = "0.4";
        }
    }

    if (currentSensorData) {
        updateCardColors(
            currentSensorData.temp,
            currentSensorData.hum,
            currentSensorData.soil,
            val
        );
    }
});



function trackConsumption(percent) {
    if (lastWaterLevel !== null && percent < lastWaterLevel) {
        let diff = lastWaterLevel - percent;
        if (diff > 0 && diff < 50) {
            consumptionHistory.push(diff);
            let total = consumptionHistory.reduce((a, b) => a + b, 0);
            const el = document.getElementById("waterUsage");
            if (el) el.innerText = total.toFixed(2) + "% used";
            if (consumptionHistory.length > 20) consumptionHistory.shift();
        }
    }
    lastWaterLevel = percent;
}

// ================= PERSISTENT SENSOR ALERTS =================
function handleSensorAlerts(d) {
    const waterPercent = waterCmToPercent(d.water);
    
    if (d.soil < 20 && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = true;
        addAlertToUI("soil_critical", "🚨 CRITICAL: Soil is extremely dry (" + d.soil + "%) - Immediate watering required!", "critical");
    } else if (d.soil >= 25 && activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = false;
        removeResolvedAlert("soil_critical");
        addAlertToUI(`soil_recovered_${Date.now()}`, "✅ Soil moisture recovered to " + d.soil + "%", "success");
        setTimeout(() => removeResolvedAlert(`soil_recovered_${Date.now()}`), 5000);
    } else if (d.soil >= 20 && d.soil < 30 && !activeAlertConditions.soil_warning && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_warning = true;
        addAlertToUI("soil_warning", "⚠️ WARNING: Low soil moisture (" + d.soil + "%) - Consider watering soon", "warning");
    } else if (d.soil >= 30 && activeAlertConditions.soil_warning) {
        activeAlertConditions.soil_warning = false;
        removeResolvedAlert("soil_warning");
    }
    
    if (d.temp > 42 && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = true;
        addAlertToUI("temp_critical", "🚨 CRITICAL: Extreme temperature detected (" + d.temp + "°C) - Plants at risk!", "critical");
    } else if (d.temp <= 40 && activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = false;
        removeResolvedAlert("temp_critical");
        addAlertToUI(`temp_recovered_${Date.now()}`, "✅ Temperature normalized to " + d.temp + "°C", "success");
        setTimeout(() => removeResolvedAlert(`temp_recovered_${Date.now()}`), 5000);
    } else if (d.temp > 38 && d.temp <= 42 && !activeAlertConditions.temp_warning && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_warning = true;
        addAlertToUI("temp_warning", "⚠️ WARNING: High temperature (" + d.temp + "°C) - Monitor plants closely", "warning");
    } else if (d.temp <= 38 && activeAlertConditions.temp_warning) {
        activeAlertConditions.temp_warning = false;
        removeResolvedAlert("temp_warning");
    }
    
    if (waterPercent < 15 && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = true;
        addAlertToUI("water_critical", "🚨 CRITICAL: Water tank critically low (" + Math.round(waterPercent) + "%) - Refill immediately!", "critical");
    } else if (waterPercent >= 20 && activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = false;
        removeResolvedAlert("water_critical");
        addAlertToUI(`water_recovered_${Date.now()}`, "✅ Water tank level recovered to " + Math.round(waterPercent) + "%", "success");
        setTimeout(() => removeResolvedAlert(`water_recovered_${Date.now()}`), 5000);
    } else if (waterPercent >= 15 && waterPercent < 30 && !activeAlertConditions.water_warning && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_warning = true;
        addAlertToUI("water_warning", "⚠️ WARNING: Water tank low (" + Math.round(waterPercent) + "%) - Consider refilling", "warning");
    } else if (waterPercent >= 30 && activeAlertConditions.water_warning) {
        activeAlertConditions.water_warning = false;
        removeResolvedAlert("water_warning");
    }
    
    if (d.hum < 20 && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = true;
        addAlertToUI("hum_critical", "🚨 CRITICAL: Extremely low humidity (" + d.hum + "%) - Plants drying out fast!", "critical");
    } else if (d.hum >= 25 && activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = false;
        removeResolvedAlert("hum_critical");
        addAlertToUI(`hum_recovered_${Date.now()}`, "✅ Humidity recovered to " + d.hum + "%", "success");
        setTimeout(() => removeResolvedAlert(`hum_recovered_${Date.now()}`), 5000);
    } else if (d.hum >= 20 && d.hum < 30 && !activeAlertConditions.hum_warning && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_warning = true;
        addAlertToUI("hum_warning", "⚠️ WARNING: Low humidity (" + d.hum + "%) - Monitor plant health", "warning");
    } else if (d.hum >= 30 && activeAlertConditions.hum_warning) {
        activeAlertConditions.hum_warning = false;
        removeResolvedAlert("hum_warning");
    }
    
    setTimeout(showNoAlertsMessage, 100);
}

// ================= CHART MODE SETTER =================
window.setMode = function(m) {
    mode = m;
    buildChart();
};

// ================= WEATHER =================
const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
const CITY = "Port Said";

// ── Weather Emoji Fallback ──
function getWeatherEmoji(condition) {
  const map = {
    'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️', 'Drizzle': '🌦️',
    'Thunderstorm': '⛈️', 'Snow': '❄️', 'Mist': '🌫️', 'Fog': '🌫️',
    'Haze': '🌫️', 'Dust': '🌪️', 'Smoke': '💨', 'Tornado': '🌪️'
  };
  return map[condition] || '🌤️';
}

window.loadWeather = async function() {
    const weatherMain = document.getElementById("weatherMain");
    const weatherForecast = document.getElementById("weatherForecast");
    const refreshBtn = document.getElementById("weatherRefreshBtn");
    
    if (!weatherMain || !weatherForecast) return;
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refresh';
    }
    
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`);
        const data = await res.json();
        if (data.cod !== "200") throw new Error();
        
        const now = new Date();
        weatherMain.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div><h5 class="mb-0">📍 ${CITY}</h5><small>${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</small></div>
                <div class="text-end">
                    <img src="https://openweathermap.org/img/wn/${data.list[0].weather[0].icon}@2x.png" width="50"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';"
                        alt="${data.list[0].weather[0].description}">
                    <span style="display:none; font-size:38px; line-height:1;">${getWeatherEmoji(data.list[0].weather[0].main)}</span>
                    <div class="display-6">${Math.round(data.list[0].main.temp)}°C</div>
                    <small>${data.list[0].weather[0].description}</small>
                </div>
            </div>
        `;
        
        weatherRainExpected = data.list.some(i => i.weather[0].main.toLowerCase().includes("rain"));
        
        let forecastHtml = '';
        data.list.slice(0, 6).forEach(item => {
            const time = new Date(item.dt_txt);
            forecastHtml += `
  <div class="forecast-item">
    <div class="small">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png" width="40"
      onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
      alt="${item.weather[0].description}">
    <span style="display:none; font-size:22px;">${getWeatherEmoji(item.weather[0].main)}</span>
    <div class="fw-bold">${Math.round(item.main.temp)}°C</div>
    <small class="d-block">${item.weather[0].description}</small>
  </div>`;
        });
        weatherForecast.innerHTML = forecastHtml;
        
        if (weatherRainExpected && !activeAlertConditions.rain_alert) {
            activeAlertConditions.rain_alert = true;
            addAlertToUI("rain_alert", "🌧 Rain forecast detected - AI may adjust irrigation schedule", "warning");
        } else if (!weatherRainExpected && activeAlertConditions.rain_alert) {
            activeAlertConditions.rain_alert = false;
            removeResolvedAlert("rain_alert");
        }
    } catch (err) {
        console.error(err);
        weatherMain.innerHTML = "❌ Weather connection error";
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    }
};

// ================= PDF REPORT - WITH WORKING CHARTS =================
async function captureChartAsImage() {
    return new Promise((resolve) => {
        setTimeout(() => {
            const canvas = document.getElementById("analyticsChart");
            if (canvas) {
                try {
                    const imgData = canvas.toDataURL("image/png", 1.0);
                    resolve(imgData);
                } catch(e) {
                    console.warn("Chart capture failed", e);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        }, 800);
    });
}

window.downloadPDF = async function(reportType) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        let y = 25;
        
        const originalMode = mode;
        mode = reportType;
        buildChart();
        
        // Wait for chart to render and capture
        await new Promise(r => setTimeout(r, 800));
        const chartImage = await captureChartAsImage();
        
        const primary = [41, 128, 185];
        const dark = [44, 62, 80];
        const lightGray = [245, 245, 245];
        
        // Header
        doc.setFillColor(...primary);
        doc.rect(0, 0, 297, 35, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("HydroGen Smart Report", 20, 22);
        doc.setFontSize(12);
        doc.text(`${reportType.toUpperCase()} REPORT`, 20, 32);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 20);
        
        // Current Readings
        doc.setTextColor(0, 0, 0);
        y = 50;
        doc.setFontSize(14);
        doc.setTextColor(...dark);
        doc.text("Current Sensor Readings", 20, y);
        y += 10;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text(`Temperature: ${envTemp.innerText}`, 20, y); y += 8;
        doc.text(`Humidity: ${envHum.innerText}`, 20, y); y += 8;
        doc.text(`Soil Moisture: ${envSoil.innerText}`, 20, y); y += 8;
        
        const sensors = await db.ref('sensors').once('value');
        const waterCm = sensors.val()?.water || 30;
        doc.text(`Water Level: ${Math.round(waterCmToPercent(waterCm))}%`, 20, y); y += 15;
        
        // CHART - Now properly captured
        if (chartImage) {
            doc.addImage(chartImage, "PNG", 20, y, 250, 90);
            y += 100;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150, 150, 150);
            doc.text("Chart temporarily unavailable", 20, y);
            y += 15;
        }
        
        // Data Table
        doc.setFontSize(14);
        doc.setTextColor(...dark);
        doc.text("Historical Data Summary", 20, y); y += 10;
        
        doc.setFillColor(...primary);
        doc.rect(20, y, 257, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("Time Period", 22, y + 5);
        doc.text("Temp (°C)", 90, y + 5);
        doc.text("Humidity (%)", 140, y + 5);
        doc.text("Soil (%)", 190, y + 5);
        doc.text("Water (%)", 240, y + 5);
        y += 8;
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        
        let displayData = [];
        if (reportType === "hour") {
            displayData = historyData.slice(-12).map(d => {
                const date = new Date(d.time);
                let hour = date.getHours();
                let ampm = hour >= 12 ? 'PM' : 'AM';
                let hour12 = hour % 12 || 12;
                return { label: `${hour12.toString().padStart(2, ' ')}:00 ${ampm}`, temp: d.temp, hum: d.hum, soil: d.soil, water: d.water };
            });
        } else if (reportType === "day") {
            const dailyMap = new Map();
            historyData.forEach(d => {
                const dayKey = new Date(d.time).toLocaleDateString("en-GB");
                if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { temp: [], hum: [], soil: [], water: [] });
                const g = dailyMap.get(dayKey);
                g.temp.push(d.temp); g.hum.push(d.hum); g.soil.push(d.soil); g.water.push(d.water);
            });
            displayData = Array.from(dailyMap.entries()).map(([label, vals]) => ({
                label: label,
                temp: vals.temp.reduce((a,b)=>a+b,0)/vals.temp.length,
                hum: vals.hum.reduce((a,b)=>a+b,0)/vals.hum.length,
                soil: vals.soil.reduce((a,b)=>a+b,0)/vals.soil.length,
                water: vals.water.reduce((a,b)=>a+b,0)/vals.water.length
            })).slice(-7);
        } else {
            const monthlyMap = new Map();
            historyData.forEach(d => {
                const monthKey = new Date(d.time).toLocaleDateString("en-GB", { month: 'short', year: 'numeric' });
                if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, { temp: [], hum: [], soil: [], water: [] });
                const g = monthlyMap.get(monthKey);
                g.temp.push(d.temp); g.hum.push(d.hum); g.soil.push(d.soil); g.water.push(d.water);
            });
            displayData = Array.from(monthlyMap.entries()).map(([label, vals]) => ({
                label: label,
                temp: vals.temp.reduce((a,b)=>a+b,0)/vals.temp.length,
                hum: vals.hum.reduce((a,b)=>a+b,0)/vals.hum.length,
                soil: vals.soil.reduce((a,b)=>a+b,0)/vals.soil.length,
                water: vals.water.reduce((a,b)=>a+b,0)/vals.water.length
            })).slice(-6);
        }
        
        for (let i = 0; i < displayData.length; i++) {
            const item = displayData[i];
            if (y > 190) { 
                doc.addPage(); 
                y = 25;
                doc.setFillColor(...primary);
                doc.rect(20, y, 257, 8, "F");
                doc.setTextColor(255, 255, 255);
                doc.text("Time Period", 22, y + 5);
                doc.text("Temp (°C)", 90, y + 5);
                doc.text("Humidity (%)", 140, y + 5);
                doc.text("Soil (%)", 190, y + 5);
                doc.text("Water (%)", 240, y + 5);
                y += 8;
                doc.setTextColor(0, 0, 0);
            }
            if (i % 2 === 0) { doc.setFillColor(...lightGray); doc.rect(20, y, 257, 7, "F"); }
            doc.setDrawColor(200);
            doc.rect(20, y, 257, 7);
            doc.text(item.label, 22, y + 5);
            doc.text(item.temp.toFixed(1), 95, y + 5);
            doc.text(item.hum.toFixed(1), 145, y + 5);
            doc.text(item.soil.toFixed(1), 195, y + 5);
            doc.text(item.water.toFixed(1), 245, y + 5);
            y += 7;
        }
        
        // Footer
        doc.setFillColor(...primary);
        doc.rect(0, 200, 297, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("HydroGen AI System © 2026 - Smart Irrigation • Data Driven • Sustainable", 20, 207);
        
        mode = originalMode;
        buildChart();
        doc.save(`HydroGen_${reportType}_Report.pdf`);
        addAlertToUI(`pdf_${Date.now()}`, `📄 ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report downloaded`, "success");
        setTimeout(() => removeResolvedAlert(`pdf_${Date.now()}`), 5000);
        
    } catch (error) {
        console.error("PDF Error:", error);
        addAlertToUI(`pdf_error_${Date.now()}`, "❌ Failed to generate PDF report", "warning");
        setTimeout(() => removeResolvedAlert(`pdf_error_${Date.now()}`), 5000);
    }
};

// ================= AI CHAT ASSISTANT =================
let API_LOADED = false;
let OPENROUTER_API_KEY = null;
let GROQ_API_KEY = null;
let cachedZones = [];
let lastZoneFetch = 0;

async function loadAPIs() {
    if (API_LOADED) return true;
    try {
        const snapshot = await database.ref('config').once('value');
        const config = snapshot.val();
        OPENROUTER_API_KEY = config?.openrouterKey || null;
        GROQ_API_KEY = config?.groqKey || null;
        API_LOADED = true;
        return !!(OPENROUTER_API_KEY || GROQ_API_KEY);
    } catch(e) { return false; }
}

function getCurrentTemp() { return envTemp ? envTemp.innerText : 25; }
function getCurrentHumidity() { return envHum ? envHum.innerText : 60; }
function getCurrentSoil() { return envSoil ? envSoil.innerText : 50; }
function getCurrentTankPercent() { return typeof waterLevelPercent !== 'undefined' ? waterLevelPercent : 50; }
function getCurrentTankLiters() { return typeof waterLevelLiters !== 'undefined' ? waterLevelLiters.toFixed(1) : "1.0"; }
function getPumpStatusText() { return pumpText ? pumpText.innerText : 'OFF'; }
function getAIMode() { return isAIActive ? "AUTO 🤖" : "MANUAL 👤"; }
function isRainExpected() { return typeof weatherRainExpected !== 'undefined' ? weatherRainExpected : false; }
function isTankOverflowing() { return false; }

async function getRealZones() {
    const now = Date.now();
    if (cachedZones.length > 0 && (now - lastZoneFetch) < 5000) return cachedZones;
    if (typeof zones !== 'undefined' && zones.length > 0) {
        cachedZones = zones;
        lastZoneFetch = now;
        return cachedZones;
    }
    return [];
}

async function getRealWeatherData() {
    const rainExpected = isRainExpected();
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    let weatherDescription = "";
    let weatherIcon = "☀️";
    if (rainExpected) { weatherDescription = "Rain expected"; weatherIcon = "🌧️"; }
    else if (humidity > 70) { weatherDescription = "Humid and cloudy"; weatherIcon = "☁️"; }
    else if (temp > 30) { weatherDescription = "Hot and sunny"; weatherIcon = "☀️"; }
    else { weatherDescription = "Mild and clear"; weatherIcon = "🌤️"; }
    return { rainExpected, temperature: temp, humidity, description: weatherDescription, icon: weatherIcon };
}

async function tryOpenRouterAPI(question) {
    if (!OPENROUTER_API_KEY) return null;
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    const soil = getCurrentSoil();
    const tank = getCurrentTankPercent();
    const tankLiters = getCurrentTankLiters();
    const pumpOn = getPumpStatusText();
    const isOverflow = isTankOverflowing();
    const rainExpected = isRainExpected();
    const zonesList = await getRealZones();
    
    let zonesInfo = "";
    if (zonesList.length > 0) {
        zonesInfo = `\n🏞️ IRRIGATION ZONES (${zonesList.length} total):\n`;
        zonesList.forEach((zone, i) => {
            zonesInfo += `   ${i+1}. ${zone.name}: ${zone.isRunning ? '🟢 RUNNING' : '⚪ IDLE'} | ⏱️ ${zone.duration || 30}min | 💧 ${zone.waterPerCycle || 10}L\n`;
        });
    }
    
    const systemPrompt = `You are HydroGen AI 🌱, a professional agricultural expert and smart irrigation assistant.
📊 CURRENT SYSTEM STATUS:
🌡️ Temperature: ${temp}°C
💧 Humidity: ${humidity}%
🌱 Soil Moisture: ${soil}%
💦 Water Tank: ${tank}% (${tankLiters}L / 2L)
🚰 Pump: ${pumpOn === 'ON' ? "🟢 ON" : "⚫ OFF"}
🤖 AI Mode: ${getAIMode()}
🌧️ Rain Expected: ${rainExpected ? "✅ Yes" : "❌ No"}
⚠️ Overflow: ${isOverflow ? "🚨 YES - Use water!" : "✅ Normal"}${zonesInfo}
Answer the user's question based on the data above.`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-lite-001",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: question }],
                max_tokens: 600,
                temperature: 0.7
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply && reply.length > 10) return reply;
        }
        return null;
    } catch(e) { return null; }
}

async function getLocalResponse(question) {
    const q = question.toLowerCase();
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    const soil = getCurrentSoil();
    const tank = getCurrentTankPercent();
    const tankLiters = getCurrentTankLiters();
    const pumpOn = getPumpStatusText();
    const isOverflow = isTankOverflowing();
    const rainExpected = isRainExpected();
    const zonesList = await getRealZones();
    const weatherData = await getRealWeatherData();
    
    if (q.includes('weather') || q.includes('forecast') || q.includes('rain')) {
        const w = weatherData;
        let rainAdvice = w.rainExpected ? "🌧️ **Rain expected!** Excellent for natural irrigation." : "☀️ **No rain expected.** Rely on irrigation system.";
        return `## 🌤️ **Weather Forecast & Analysis**\n\n${w.icon} **Current Conditions:** ${w.description}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n| 📊 Parameter | 📈 Value |\n|--------------|----------|\n| 🌡️ Temperature | ${w.temperature}°C |\n| 💧 Humidity | ${w.humidity}% |\n| 🌧️ Rain Expected | ${w.rainExpected ? '✅ YES' : '❌ NO'} |\n\n### 📋 **Smart Recommendations**\n${rainAdvice}\n💡 **Tip:** ${w.humidity > 60 ? 'High humidity - good for water collection!' : 'Monitor soil moisture closely.'}`;
    }
    
    if (q.includes('zone') || q.includes('zones') || q.includes('how many zones')) {
        if (zonesList.length === 0) return `## 🏞️ **Irrigation Zones**\n\n📭 **You have 0 zones configured.**`;
        let zoneDetails = "";
        zonesList.forEach((zone, idx) => {
            zoneDetails += `\n**${idx + 1}. ${zone.icon || '🌱'} ${zone.name}** — ${zone.isRunning ? '🟢 RUNNING' : '⚪ IDLE'}\n`;
            zoneDetails += `   ⏱️ Duration: ${zone.duration || 30} min | 💧 ${zone.waterPerCycle || 10}L | 🎯 Target: ${zone.soilTarget || 60}%\n`;
        });
        return `## 🏞️ **Your Irrigation Zones**\n\n**Total Zones:** ${zonesList.length}\n\n${zoneDetails}`;
    }
    
    if (q.includes('should i water') || q.includes('water now') || q.includes('watering needed')) {
        if (isOverflow) return `## 🚨 **URGENT: Tank Overflow!**\n\nStart irrigation IMMEDIATELY to use excess water!`;
        if (tank < 10) return `## 🚫 **Cannot Water - Tank Empty**\n\nTank: ${tank}%. Activate water collection.`;
        if (soil < 30) return `## 💧 **YES - Water NOW!**\n\nSoil: ${soil}% (CRITICAL) | Tank: ${tank}%\nDuration: 20-25 minutes`;
        if (soil < 45) return `## 💧 **YES - Water Soon**\n\nSoil: ${soil}% (Low) | Duration: 15 minutes`;
        if (soil > 75) return `## ✅ **NO - Hold Off**\n\nSoil: ${soil}% (Too wet)`;
        return `## ✅ **NO - Soil Optimal**\n\nSoil: ${soil}% | Tank: ${tank}%`;
    }
    
    if (q.includes('soil')) return `## 🌱 **Soil: ${soil}%**\n\n${soil < 35 ? '⚠️ DRY - Water needed' : (soil > 70 ? '⚠️ WET - Hold off' : '✅ OPTIMAL')}\nOptimal range: 50-70%`;
    if (q.includes('tank')) return `## 💧 **Tank: ${tank}%**\n\n${tank < 20 ? '🔴 CRITICAL - Refill!' : (tank < 40 ? '🟠 LOW' : (tank > 95 ? '⚠️ Near full' : '🟡 OK'))}\nAvailable: ${tankLiters}L / 2L`;
    if (q.includes('system status')) return `## 📊 **System Status**\n\n🌡️ ${temp}°C | 🌱 ${soil}% | 💦 ${tank}% | 📍 ${zonesList.length} zones | 🚰 Pump ${pumpOn}`;
    if (q.includes('tomato')) return `## 🍅 **Tomato Guide**\n\nOptimal: 18-28°C, Soil 60-70%\nYour: ${temp}°C, ${soil}%\n${soil < 55 ? '⚠️ Water soon!' : '✅ Good'}\nTips: Prune suckers, stake support, water consistently.`;
    if (q.includes('basil')) return `## 🌿 **Basil Guide**\n\nOptimal: 18-28°C, Soil 55-65%\nYour: ${temp}°C, ${soil}%\n${soil < 50 ? '⚠️ Water soon!' : '✅ Good'}\nTips: Pinch flowers, harvest from top.`;
    
    return `## 🤖 **HydroGen AI** 🌱\n\n👋 Hello! I'm your agricultural assistant!\n\n### 📊 **Current Status**\n🌡️ ${temp}°C | 🌱 ${soil}% | 💦 ${tank}% | 📍 ${zonesList.length} zones\n\n### 💡 **Try:**\n• "Should I water?" 💧\n• "How many zones?" 🏞️\n• "Weather forecast?" 🌤️\n• "Tomato guide" 🍅\n• "Website pages" 🌐\n\n**Ask me anything!** 🔥`;
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const msg = input.value.trim();
    if (!msg) return;
    addChatMessage('You', msg);
    input.value = '';
    addChatMessage('AI', '💭 Thinking...', 'typing');
    await loadAPIs();
    let response = null;
    if (OPENROUTER_API_KEY) response = await tryOpenRouterAPI(msg);
    if (!response && GROQ_API_KEY) response = await tryOpenRouterAPI(msg);
    if (!response) response = await getLocalResponse(msg);
    document.querySelectorAll(".typing").forEach(e => e.remove());
    addChatMessage('AI', response);
}

function addChatMessage(sender, text, type = '') {
    const box = document.getElementById('chatBox');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `msg ${sender.toLowerCase()} ${type}`;
    let formatted = text.replace(/## (.*?)\n/g, '<strong style="color:#10b981;display:block;margin:10px 0 5px 0;">$1</strong>').replace(/\n/g, '<br>');
    div.innerHTML = `<span><b>${sender === 'AI' ? '🤖 HydroGen AI' : '👤 You'}:</b><br>${formatted}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

window.quickAsk = (q) => { document.getElementById('userInput').value = q; sendMessage(); };
window.toggleChat = () => { const w = document.getElementById('chatWindow'); if (w) w.style.display = w.style.display === 'flex' ? 'none' : 'flex'; };

function initAIChat() {
    if (typeof chatInitialized !== "undefined" && chatInitialized) return;
    window.chatInitialized = true;
    setTimeout(() => {
        addChatMessage("AI", `## 🤖 **HydroGen AI Assistant** 🌱\n\n👋 Hello! I'm your intelligent agricultural assistant!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n### 📊 **Current System Status**\n\n| 📊 Parameter | 📈 Value |\n|--------------|----------|\n| 🌡️ Temperature | ${getCurrentTemp()}°C |\n| 💧 Humidity | ${getCurrentHumidity()}% |\n| 🌱 Soil | ${getCurrentSoil()}% |\n| 💦 Tank | ${getCurrentTankPercent()}% |\n| 🚰 Pump | ${getPumpStatusText()} |\n| 🤖 AI Mode | ${getAIMode()} |\n| 🌤️ Weather | ${isRainExpected() ? 'Rain Expected' : 'Clear'} |\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n### 💡 **Try These Questions**\n\n• 🌤️ *"Weather forecast?"*\n• 🏞️ *"How many zones?"*\n• 💧 *"Should I water?"*\n• 📊 *"System status"*\n\n💡 **Ask me anything about your HydroGen system!** 🔥`);
    }, 1500);
}


// logout + notif + profile handled by theme.js
// ================= INITIALIZE =================
createChart();
loadWeather();
setInterval(loadWeather, 300000);
setTimeout(() => initAIChat(), 2000);
showNoAlertsMessage();
