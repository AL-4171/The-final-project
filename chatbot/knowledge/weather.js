/**
 * weather.js — HydroGen Weather Knowledge Module
 * Provides weather-specific local knowledge and agriculture advisories.
 */

window.WeatherKnowledge = (function () {

    function isRainExpected() {
        return window.weatherRainExpected || false;
    }

    function getWeatherContext() {
        const sensors = window.SensorKnowledge ? window.SensorKnowledge.getSensorContext() : { temp: 25, hum: 60 };
        const rain = isRainExpected();
        let description, icon, collectionRate;

        if (rain) {
            description = "Rain expected";
            icon = "🌧️";
            collectionRate = "Very High";
        } else if (sensors.hum > 75) {
            description = "Humid and overcast";
            icon = "☁️";
            collectionRate = "High";
        } else if (sensors.hum > 55) {
            description = "Partly cloudy";
            icon = "⛅";
            collectionRate = "Moderate";
        } else if (sensors.temp > 35) {
            description = "Hot and sunny";
            icon = "☀️";
            collectionRate = "Low";
        } else {
            description = "Clear and mild";
            icon = "🌤️";
            collectionRate = "Moderate";
        }

        return { ...sensors, rain, description, icon, collectionRate };
    }

    function weatherReport() {
        const w = getWeatherContext();

        return `${w.icon} **Current Weather Conditions**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Parameter | Value |
|-----------|-------|
| 🌡️ Temperature | ${w.temp}°C |
| 💧 Air Humidity | ${w.hum}% |
| 🌧️ Rain Expected | ${w.rain ? "✅ YES — delay irrigation" : "❌ No"} |
| ☁️ Conditions | ${w.description} |
| 💦 Collection Rate | ${w.collectionRate} |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🌾 Agricultural Advisory:
${w.rain
    ? "🌧️ Rain expected — reduce or pause scheduled irrigation to avoid overwatering. Let natural rain do the work!"
    : w.hum > 70
    ? "☁️ High humidity is great for atmospheric water collection. Normal irrigation can proceed."
    : w.temp > 35
    ? "🔥 Extreme heat — increase irrigation frequency and water in early morning/evening only."
    : "✅ Good conditions for normal irrigation operations."}

### 💡 Smart Tips:
• ${w.hum > 60 ? "High humidity = more water from air. Collection system is working efficiently." : "Lower humidity reduces air-to-water collection. Monitor tank levels."}
• ${w.temp > 30 ? "Mulching soil surface will significantly reduce water evaporation in this heat." : "Current temperature allows normal watering schedule."}
• ${w.rain ? "If rain is light (< 5mm), your irrigation may still be needed for deep watering." : "No rain forecast — rely fully on your HydroGen system."}`;
    }

    function irrigationRecommendation() {
        const w = getWeatherContext();
        const soil = w.soil || 50;

        if (w.rain && soil > 40) {
            return `🌧️ **Skip Irrigation — Rain is Coming**

Rain is expected and soil moisture (${soil}%) is adequate.

**Recommendation:** Pause all scheduled irrigation for 12-24 hours.
**Reason:** Natural rain will replenish soil moisture and overwatering risks root disease.`;
        }

        if (w.temp > 38) {
            return `🔥 **Heat Alert — Adjust Irrigation**

Temperature is ${w.temp}°C — extreme heat conditions.

**Recommendations:**
• Water deeply in early morning (5-8 AM) and evening (7-9 PM)
• Avoid any midday watering — up to 50% evaporation loss
• Increase session duration by 30-40%
• Apply mulch to retain soil moisture
• Check soil moisture every 3-4 hours`;
        }

        return `✅ **Normal Irrigation Conditions**

Temperature: ${w.temp}°C | Humidity: ${w.hum}% | Rain: ${w.rain ? "Expected" : "None"}

Your standard irrigation schedule is appropriate. ${w.hum > 65 ? "High humidity reduces irrigation demand slightly." : ""}`;
    }

    function seasonalTips(q) {
        const lq = q.toLowerCase();
        const w = getWeatherContext();

        if (lq.includes("best time") || lq.includes("when to water") || lq.includes("watering time")) {
            return `⏰ **Best Times to Water Your Crops**

### 🌅 Top Watering Windows:

| Time | Efficiency | Why |
|------|-----------|-----|
| 5–9 AM | ⭐⭐⭐⭐⭐ Best | Cool temp, low evaporation, leaves dry by day |
| 6–9 PM | ⭐⭐⭐⭐ Great | Cooler, roots absorb well overnight |
| 10 AM–4 PM | ⭐ Worst | ${w.temp > 28 ? "High evaporation loses 30-50% of water" : "Moderate evaporation, avoid if possible"} |

### 📊 Current Conditions:
• Time-based advice: ${new Date().getHours() >= 5 && new Date().getHours() < 9 ? "🟢 GREAT time to water now!" :
                       new Date().getHours() >= 9 && new Date().getHours() < 17 ? "🟡 Suboptimal — water tonight if needed" :
                       new Date().getHours() >= 17 && new Date().getHours() < 21 ? "🟢 Good evening window!" :
                       "⚫ Night — soil absorbs well but watch for fungal risk"}

💡 **Pro tip:** Use HydroGen's scheduling feature to automate morning irrigation automatically!`;
        }

        if (lq.includes("drought") || lq.includes("dry season") || lq.includes("water saving") || lq.includes("save water")) {
            return `💧 **Water Conservation in Dry Conditions**

### 🌱 HydroGen Smart Conservation Strategies:

**1. AI Irrigation Mode**
Let the AI decide when to water based on real-time soil, temp, and humidity data.

**2. Mulching**
Apply 3-5cm of organic mulch around plants to reduce evaporation by up to 70%.

**3. Deep Watering**
Water less frequently but more deeply to encourage drought-resistant root systems.

**4. Zone Optimization**
Group plants by water need. Your HydroGen zones allow precise water delivery.

**5. Morning Watering**
Early morning (5-9 AM) watering loses 40% less water to evaporation than midday.

### 📊 Current Conservation Score:
• Humidity: ${w.hum}% — collection efficiency: ${w.hum > 60 ? "High 🟢" : "Low 🔴"}
• Temperature: ${w.temp}°C — evaporation: ${w.temp > 30 ? "High ⚠️" : "Normal ✅"}

💡 **Tip:** HydroGen's atmospheric water generation is most efficient at humidity > 60%.`;
        }

        if (lq.includes("rain") || lq.includes("rainfall") || lq.includes("forecast")) {
            return weatherReport();
        }

        return null;
    }

    return { weatherReport, irrigationRecommendation, seasonalTips, getWeatherContext, isRainExpected };
})();
