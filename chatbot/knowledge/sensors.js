/**
 * sensors.js — HydroGen Sensor Knowledge Module
 * Provides structured local responses about sensor data and conditions.
 */

window.SensorKnowledge = (function () {

    function getSensorContext() {
        const get = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? (parseFloat(el.innerText) || fallback) : fallback;
        };
        const pumpEl = document.getElementById("pumpStatusText");
        return {
            temp:    get("envTemp", 25),
            hum:     get("envHum", 60),
            soil:    get("envSoil", 50),
            tank:    get("tankLevelPercent", 70),
            pumpOn:  pumpEl ? pumpEl.innerText.includes("ON") : false
        };
    }

    function soilStatus(soil) {
        if (soil < 15) return { label: "CRITICAL — Severe Drought",  emoji: "🔴", advice: "Water immediately. Plants are at serious risk of permanent damage." };
        if (soil < 30) return { label: "LOW — Dry",                   emoji: "🟠", advice: "Water soon. Soil is too dry for optimal growth." };
        if (soil < 50) return { label: "BELOW OPTIMAL",               emoji: "🟡", advice: "Preventive watering recommended within 2-3 hours." };
        if (soil < 75) return { label: "OPTIMAL — Good",              emoji: "🟢", advice: "Soil is in the ideal range. No watering needed yet." };
        return           { label: "HIGH — Very Moist",                 emoji: "🔵", advice: "Do NOT water — risk of root rot and fungal disease." };
    }

    function tempStatus(temp) {
        if (temp < 5)  return { label: "Freezing",    emoji: "🥶", advice: "Risk of frost damage. Protect sensitive crops." };
        if (temp < 15) return { label: "Cool",         emoji: "🌤️", advice: "Reduced evaporation — less frequent watering needed." };
        if (temp < 28) return { label: "Optimal",      emoji: "✅", advice: "Ideal growing temperature. Normal irrigation schedule." };
        if (temp < 36) return { label: "Warm",         emoji: "🌡️", advice: "Increased evaporation. Monitor soil moisture closely." };
        return           { label: "HOT — Heat Stress", emoji: "🔥", advice: "Critical heat. Water deeply morning and evening. Mulch to retain moisture." };
    }

    function humidityStatus(hum) {
        if (hum < 20) return { label: "Very Dry Air",   emoji: "🏜️", advice: "Very low humidity speeds evaporation significantly." };
        if (hum < 40) return { label: "Dry Air",        emoji: "🌬️", advice: "Low humidity — plants lose water faster." };
        if (hum < 65) return { label: "Comfortable",    emoji: "😊", advice: "Ideal humidity range for most crops." };
        if (hum < 80) return { label: "Humid",          emoji: "💧", advice: "Good humidity. Watch for mildew on dense foliage." };
        return           { label: "Very Humid",          emoji: "🌧️", advice: "High humidity — risk of fungal disease. Improve air circulation." };
    }

    function tankStatus(tank) {
        if (tank < 10) return { label: "CRITICAL — Nearly Empty", emoji: "🚨", advice: "Immediately activate water collection. Pause non-critical irrigation." };
        if (tank < 25) return { label: "Low",                     emoji: "⚠️", advice: "Reserve for essential watering only." };
        if (tank < 50) return { label: "Moderate",                emoji: "🟡", advice: "Adequate for short-term needs." };
        if (tank < 80) return { label: "Good",                    emoji: "🟢", advice: "Sufficient for normal operations." };
        return           { label: "Full",                          emoji: "💧", advice: "Tank is full. Collection can be paused." };
    }

    function fullSensorReport() {
        const d = getSensorContext();
        const s = soilStatus(d.soil);
        const t = tempStatus(d.temp);
        const h = humidityStatus(d.hum);
        const k = tankStatus(d.tank);

        return `📊 **Live Sensor Report**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Sensor | Value | Status |
|--------|-------|--------|
| 🌡️ Temperature | ${d.temp}°C | ${t.emoji} ${t.label} |
| 💧 Humidity | ${d.hum}% | ${h.emoji} ${h.label} |
| 🌱 Soil Moisture | ${d.soil}% | ${s.emoji} ${s.label} |
| 💦 Water Tank | ${d.tank}% | ${k.emoji} ${k.label} |
| 🚰 Pump | ${d.pumpOn ? "🟢 RUNNING" : "⚫ OFF"} | — |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 📋 Recommendations
• 🌱 Soil: ${s.advice}
• 🌡️ Temp: ${t.advice}
• 💧 Humidity: ${h.advice}
• 💦 Tank: ${k.advice}`;
    }

    function shouldWater() {
        const d = getSensorContext();
        const s = soilStatus(d.soil);
        const k = tankStatus(d.tank);

        if (d.tank < 10) {
            return `🚫 **Cannot Water — Tank Critical**

Water tank is at ${d.tank}%. Minimum 15% required.

🎯 Action: Activate atmospheric water collection immediately.`;
        }

        if (d.soil > 70) {
            return `✅ **No Watering Needed**

Soil moisture is ${d.soil}% — ${s.label}. ${s.advice}

⏰ Next check recommended when soil drops below 60%.`;
        }

        if (d.soil < 20) {
            return `🚨 **CRITICAL — Water Immediately!**

Soil moisture is ${d.soil}% (${s.label}). ${s.advice}

🎯 Recommended: 25 min watering at full flow.
💦 Tank: ${d.tank}% — ${k.label}.`;
        }

        return `💧 **Watering Recommended**

Soil moisture is ${d.soil}% (${s.label}).
${s.advice}

💦 Tank: ${d.tank}% — ${k.label}.
🌡️ Temp: ${d.temp}°C — ${tempStatus(d.temp).label}.`;
    }

    function sensorFAQ(q) {
        const lq = q.toLowerCase();
        const d  = getSensorContext();

        if (lq.includes("soil") || lq.includes("moisture")) {
            const s = soilStatus(d.soil);
            return `🌱 **Soil Moisture — ${d.soil}%**

${s.emoji} Status: **${s.label}**
📋 ${s.advice}

### 🌿 Optimal ranges by crop:
| Crop | Min | Optimal | Max |
|------|-----|---------|-----|
| Vegetables | 40% | 60-70% | 85% |
| Herbs | 35% | 50-65% | 75% |
| Flowers | 30% | 55-70% | 80% |
| Grass/Lawn | 25% | 45-60% | 75% |
| Fruit Trees | 35% | 55-65% | 80% |

💡 **Tip:** Soil moisture below 30% for more than 12 hours causes irreversible stress in most crops.`;
        }

        if (lq.includes("temp") || lq.includes("temperature") || lq.includes("hot") || lq.includes("cold")) {
            const t = tempStatus(d.temp);
            return `🌡️ **Temperature — ${d.temp}°C**

${t.emoji} Status: **${t.label}**
📋 ${t.advice}

### 📊 Temperature impact on irrigation:
| Temperature | Evaporation Rate | Recommended Action |
|------------|------------------|--------------------|
| < 15°C | Very low | Reduce watering frequency |
| 15–28°C | Normal | Standard schedule |
| 28–35°C | High | Increase by 20-30% |
| > 35°C | Very high | Water morning + evening |

💡 **Tip:** Water in the early morning (5-9 AM) to minimize evaporation on hot days.`;
        }

        if (lq.includes("humid") || lq.includes("humidity")) {
            const h = humidityStatus(d.hum);
            return `💧 **Humidity — ${d.hum}%**

${h.emoji} Status: **${h.label}**
📋 ${h.advice}

### 💡 Agriculture facts:
• HydroGen collects water from air — higher humidity = faster collection
• At ${d.hum}% humidity, water collection efficiency is ${d.hum > 70 ? 'HIGH' : d.hum > 50 ? 'MODERATE' : 'LOW'}
• High humidity (>75%) + poor airflow = fungal disease risk
• Ideal humidity for most crops: 40–65%`;
        }

        if (lq.includes("tank") || lq.includes("water level") || lq.includes("water storage")) {
            const k = tankStatus(d.tank);
            const liters = ((d.tank / 100) * 2).toFixed(2);
            return `💦 **Water Tank — ${d.tank}%**

${k.emoji} Status: **${k.label}**
📋 ${k.advice}

### 📊 Tank Details:
• Current Volume: **${liters}L** / 2L total capacity
• Collection method: Atmospheric water generation
• Collection efficiency at current humidity (${d.hum}%): ${d.hum > 70 ? 'High' : d.hum > 50 ? 'Moderate' : 'Low'}

💡 **Tip:** Keep tank above 25% to ensure uninterrupted irrigation operations.`;
        }

        if (lq.includes("pump")) {
            return `🚰 **Pump Status — ${d.pumpOn ? "RUNNING 🟢" : "OFF ⚫"}**

${d.pumpOn ? "The pump is currently active and delivering water to irrigation zones." : "The pump is currently idle."}

### 🎮 Pump Modes:
| Mode | Description |
|------|-------------|
| 🤖 AUTO (AI) | AI decides when to run based on soil, temp, humidity, and tank |
| ✋ MANUAL | You control pump on/off directly |
| 🚨 EMERGENCY STOP | Halts all irrigation immediately |

### 💡 Agriculture best practices:
• Avoid running pump when tank < 10%
• Best irrigation times: 5-9 AM and 6-9 PM
• Avoid midday irrigation (12-3 PM) — high evaporation loss`;
        }

        return null;
    }

    return { fullSensorReport, shouldWater, sensorFAQ, getSensorContext, soilStatus, tempStatus, humidityStatus, tankStatus };
})();
