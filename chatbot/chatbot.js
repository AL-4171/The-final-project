/**
 * chatbot.js — HydroGen Universal AI Chatbot
 * Works on: Home, Dashboard, Irrigation, Analytics, Reports, Settings
 *
 * FIXED: Beautiful responsive tables that fit within response card
 * FIXED: Weather forecast working properly
 * FIXED: Text wrapping in chat input
 */

(function () {
    'use strict';

    // ── Guard against double-init ──────────────────────────────────────────────
    if (window.hydrogenChatbotLoaded) {
        console.log('🤖 [Chatbot] Already initialized — skipping.');
        return;
    }
    window.hydrogenChatbotLoaded = true;
    console.log('🤖 [Chatbot] Initializing HydroGen Universal Chatbot v3.5...');

    // ── Wait for DOM ───────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BOOT
    // ══════════════════════════════════════════════════════════════════════════
    async function boot() {
        console.log('🤖 [Chatbot] DOM ready — booting...');

        setupChatUI();
        setupSidebarListener();

        await waitForFirebase();
        await fetchSensorData();
        await loadAPIs();

        setInterval(fetchSensorData, 30000);

        setTimeout(sendWelcomeMessage, 1200);
        console.log('✅ [Chatbot] Boot complete!');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SIDEBAR LISTENER
    // ══════════════════════════════════════════════════════════════════════════
    function setupSidebarListener() {
        const sideMenu = document.getElementById('sideMenu');
        const menuBtn = document.getElementById('menuBtn');
        const closeBtn = document.getElementById('closeBtn');
        const menuOverlay = document.getElementById('menuOverlay');

        function updateChatZIndex() {
            const chatWindow = document.getElementById('chatWindow');
            const chatIcon = document.getElementById('chatIcon');
            
            if (sideMenu && sideMenu.classList.contains('open')) {
                if (chatWindow) chatWindow.style.zIndex = '100';
                if (chatIcon) chatIcon.style.zIndex = '100';
                document.body.classList.add('sidebar-open');
            } else {
                if (chatWindow) chatWindow.style.zIndex = '1000';
                if (chatIcon) chatIcon.style.zIndex = '1000';
                document.body.classList.remove('sidebar-open');
            }
        }

        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                setTimeout(updateChatZIndex, 50);
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                setTimeout(updateChatZIndex, 50);
            });
        }
        if (menuOverlay) {
            menuOverlay.addEventListener('click', () => {
                setTimeout(updateChatZIndex, 50);
            });
        }
        
        updateChatZIndex();
        
        if (sideMenu) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.attributeName === 'class') {
                        updateChatZIndex();
                    }
                });
            });
            observer.observe(sideMenu, { attributes: true });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FIREBASE WAIT
    // ══════════════════════════════════════════════════════════════════════════
    function waitForFirebase() {
        return new Promise(resolve => {
            if (window.hydroGenDB) {
                console.log('🔥 [Chatbot] Firebase DB already available.');
                return resolve();
            }
            console.log('⏳ [Chatbot] Waiting for Firebase...');
            const t = setInterval(() => {
                if (window.hydroGenDB) {
                    console.log('🔥 [Chatbot] Firebase DB connected.');
                    clearInterval(t);
                    resolve();
                }
            }, 100);
            setTimeout(() => {
                clearInterval(t);
                console.warn('⚠️ [Chatbot] Firebase timeout — running in offline mode.');
                resolve();
            }, 5000);
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET REAL SENSOR DATA FROM FIREBASE
    // ══════════════════════════════════════════════════════════════════════════
    let _sensorCache = null;
    let _lastSensorFetch = 0;

    async function fetchSensorData() {
        if (!window.hydroGenDB) {
            _sensorCache = { temp: 25, hum: 60, soil: 50, tank: 70, pumpOn: false };
            return;
        }
        
        const now = Date.now();
        if (_sensorCache && now - _lastSensorFetch < 15000) {
            return _sensorCache;
        }
        
        try {
            const sensorsSnap = await window.hydroGenDB.ref('sensors').once('value');
            const sensorsData = sensorsSnap.val() || {};
            
            const pumpSnap = await window.hydroGenDB.ref('controls/pump').once('value');
            const pumpState = pumpSnap.val() === 1;
            
            let rawWater = sensorsData.water !== undefined ? parseFloat(sensorsData.water) : 12;
            const tankPercent = Math.round(((12 - Math.min(12, Math.max(0, rawWater))) / 12) * 100);
            
            _sensorCache = {
                temp: sensorsData.temp !== undefined ? parseFloat(sensorsData.temp) : 25,
                hum: sensorsData.hum !== undefined ? parseFloat(sensorsData.hum) : 60,
                soil: sensorsData.soil !== undefined ? parseFloat(sensorsData.soil) : 50,
                tank: tankPercent,
                pumpOn: pumpState,
                rawWater: rawWater
            };
            _lastSensorFetch = now;
            
            console.log('🌡️ [Chatbot] REAL sensor data from Firebase:', _sensorCache);
            
        } catch (e) {
            console.warn('⚠️ [Chatbot] Sensor fetch error:', e);
            if (!_sensorCache) {
                _sensorCache = { temp: 25, hum: 60, soil: 50, tank: 70, pumpOn: false, rawWater: 12 };
            }
        }
        return _sensorCache;
    }

    function getSensorData() {
        return _sensorCache || { temp: 25, hum: 60, soil: 50, tank: 70, pumpOn: false, rawWater: 12 };
    }

    // ===================== GET REAL WEATHER FORECAST FROM OPENWEATHER =====================
    async function getRealWeatherForecast() {
        const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
        const CITY = "Port Said";
        
        try {
            console.log('🌤️ [Weather] Fetching forecast for', CITY);
            const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`);
            
            if (!res.ok) {
                console.warn('⚠️ [Weather] API returned', res.status);
                return null;
            }
            
            const data = await res.json();
            if (data.cod !== "200") throw new Error(data.message);
            
            const current = data.list[0];
            const rainExpected = data.list.slice(0, 3).some(item => 
                item.weather[0].main.toLowerCase().includes('rain') ||
                (item.pop && item.pop > 0.3)
            );
            
            // Update global weather variable for consistency
            if (typeof window !== 'undefined') {
                window.weatherRainExpected = rainExpected;
            }
            
            // Get next 6 forecasts
            let forecast = [];
            for (let i = 0; i < Math.min(6, data.list.length); i++) {
                const item = data.list[i];
                const time = new Date(item.dt_txt);
                forecast.push({
                    time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    temp: Math.round(item.main.temp),
                    condition: item.weather[0].description,
                    icon: item.weather[0].icon,
                    rain: item.weather[0].main.toLowerCase().includes('rain')
                });
            }
            
            console.log('✅ [Weather] Forecast fetched, rain expected:', rainExpected);
            
            return {
                current: {
                    temp: Math.round(current.main.temp),
                    feelsLike: Math.round(current.main.feels_like),
                    humidity: current.main.humidity,
                    wind: Math.round(current.wind.speed),
                    condition: current.weather[0].description,
                    icon: current.weather[0].icon,
                    rainExpected: rainExpected
                },
                forecast: forecast,
                city: CITY
            };
        } catch(e) {
            console.error('❌ [Weather] Fetch error:', e);
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // API MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════
    const API = {
        openrouter: { key: null, name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemini-2.0-flash-lite-001' },
        groq:       { key: null, name: 'Groq',       endpoint: 'https://api.groq.com/openai/v1/chat/completions',   model: 'llama-3.1-8b-instant' }
    };
    let apiLoaded = false;
    let activeApiName = 'Local Knowledge';

    async function loadAPIs() {
        if (apiLoaded) return;
        console.log('🔑 [APIs] Loading API keys from Firebase config...');

        try {
            if (window.hydroGenDB) {
                const snap = await window.hydroGenDB.ref('config').once('value');
                const cfg  = snap.val() || {};

                API.openrouter.key = cfg.openrouterKey || cfg.OPENROUTER_KEY || null;
                API.groq.key       = cfg.groqKey       || cfg.GROQ_KEY       || null;

                if (API.openrouter.key) {
                    console.log('✅ [APIs] OpenRouter API key loaded');
                } else {
                    console.log('⚠️ [APIs] OpenRouter key not found');
                }

                if (API.groq.key) {
                    console.log('✅ [APIs] Groq API key loaded');
                } else {
                    console.log('⚠️ [APIs] Groq key not found');
                }

                if (!API.openrouter.key && !API.groq.key) {
                    console.log('📚 [APIs] Using Local Knowledge Base only.');
                    activeApiName = 'Local Knowledge';
                } else {
                    activeApiName = API.openrouter.key ? 'OpenRouter AI' : 'Groq AI';
                }
            } else {
                console.log('⚠️ [APIs] Firebase DB not available — Local Knowledge Base only.');
            }
        } catch (e) {
            console.error('❌ [APIs] Failed to load API keys:', e);
        }
        apiLoaded = true;
        console.log(`🤖 [APIs] Active engine: ${activeApiName}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ZONE DATA
    // ══════════════════════════════════════════════════════════════════════════
    let _cachedZones = [];
    let _lastZoneFetch = 0;

    async function getZones() {
        const now = Date.now();
        if (_cachedZones.length > 0 && now - _lastZoneFetch < 10000) return _cachedZones;
        try {
            if (window.hydroGenDB) {
                const uid  = localStorage.getItem('userId') || 'fcyeSoWkmqcfqgafPCQAN6vtV5M2';
                const snap = await window.hydroGenDB.ref(`users_w/${uid}/zones`).once('value');
                const data = snap.val();
                if (data) {
                    _cachedZones = Object.values(data);
                    _lastZoneFetch = now;
                    console.log(`📦 [Zones] Loaded ${_cachedZones.length} zones.`);
                    return _cachedZones;
                }
            }
        } catch (e) { console.warn('⚠️ [Zones] Fetch error:', e); }
        return [];
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD SYSTEM PROMPT
    // ══════════════════════════════════════════════════════════════════════════
    async function buildSystemPrompt() {
        const d = getSensorData();
        const zones = await getZones();
        const rain = window.weatherRainExpected || false;
        const page = detectPage();
        const liters = ((d.tank / 100) * 2).toFixed(2);

        let zonesBlock = '';
        if (zones.length > 0) {
            zonesBlock = `\n🏞️ IRRIGATION ZONES (${zones.length}):\n`;
            zones.forEach((z, i) => {
                zonesBlock += `  ${i + 1}. ${z.icon || '🌱'} ${z.name} — ${z.isRunning ? 'RUNNING' : 'IDLE'} | ${z.duration || 30}min | ${z.waterPerCycle || 10}L\n`;
            });
        }

        return `You are HydroGen AI — a professional agricultural expert and smart irrigation assistant.

REAL LIVE SYSTEM DATA (from Firebase sensors):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌡️ Temperature: ${d.temp}°C
💧 Air Humidity: ${d.hum}%
🌱 Soil Moisture: ${d.soil}%
💦 Water Tank: ${d.tank}% (${liters}L / 2L capacity)
🚰 Pump: ${d.pumpOn ? 'ON — RUNNING' : 'OFF'}
🌧️ Rain Expected: ${rain ? 'YES — delay non-critical irrigation' : 'No'}
📍 Current Page: ${page}
${zonesBlock}

IMPORTANT: These are the REAL sensor readings. Use ONLY these values.

You can use markdown tables to present data clearly. Format tables properly with headers and rows.

Respond in clear, friendly English. Keep responses concise.`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // API CALLS
    // ══════════════════════════════════════════════════════════════════════════
    async function callOpenRouter(messages, systemPrompt) {
        if (!API.openrouter.key) return null;
        console.log('🌐 [OpenRouter] Attempting API call...');
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 12000);
            const res  = await fetch(API.openrouter.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${API.openrouter.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.href },
                body:    JSON.stringify({ model: API.openrouter.model, messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 700, temperature: 0.7 }),
                signal:  ctrl.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                const data  = await res.json();
                const reply = data.choices?.[0]?.message?.content;
                if (reply && reply.length > 10) {
                    console.log('✅ [OpenRouter] Response received.');
                    activeApiName = 'OpenRouter AI';
                    return reply;
                }
            }
        } catch (e) {
            console.log('⚠️ [OpenRouter] Error:', e.message);
        }
        return null;
    }

    async function callGroq(messages, systemPrompt) {
        if (!API.groq.key) return null;
        console.log('🌐 [Groq] Attempting API call...');
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 12000);
            const res  = await fetch(API.groq.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${API.groq.key}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ model: API.groq.model, messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 700, temperature: 0.7 }),
                signal:  ctrl.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                const data  = await res.json();
                const reply = data.choices?.[0]?.message?.content;
                if (reply && reply.length > 10) {
                    console.log('✅ [Groq] Response received.');
                    activeApiName = 'Groq AI';
                    return reply;
                }
            }
        } catch (e) {
            console.log('⚠️ [Groq] Error:', e.message);
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LOCAL KNOWLEDGE BASE
    // ══════════════════════════════════════════════════════════════════════════
    async function getLocalResponse(question) {
        console.log('📚 [Local] Using built-in knowledge base...');
        const q = question.toLowerCase();
        const d = getSensorData();
        const rain = window.weatherRainExpected || false;
        const zones = await getZones();
        const liters = ((d.tank / 100) * 2).toFixed(2);

        if (q.includes('soil') || q.includes('moisture')) {
            let status = '';
            let advice = '';
            if (d.soil < 15) { status = '🚨 CRITICAL'; advice = 'Water immediately!'; }
            else if (d.soil < 30) { status = '⚠️ LOW'; advice = 'Water soon'; }
            else if (d.soil < 50) { status = '🟡 Below optimal'; advice = 'Water within 2-3 hours'; }
            else if (d.soil < 75) { status = '✅ OPTIMAL'; advice = 'No watering needed'; }
            else { status = '🔵 HIGH'; advice = 'Do NOT water'; }
            
            return `🌱 **Soil Moisture: ${d.soil}%** (${status})\n\n${advice}`;
        }

        if (q.includes('temp') || q.includes('temperature')) {
            let status = '';
            let advice = '';
            if (d.temp < 5) { status = '🥶 Freezing'; advice = 'Protect plants'; }
            else if (d.temp < 15) { status = '🌤️ Cool'; advice = 'Less watering needed'; }
            else if (d.temp < 28) { status = '✅ Optimal'; advice = 'Normal irrigation'; }
            else if (d.temp < 36) { status = '🌡️ Warm'; advice = 'Monitor soil closely'; }
            else { status = '🔥 HOT'; advice = 'Water morning + evening'; }
            
            return `🌡️ **Temperature: ${d.temp}°C** (${status})\n\n${advice}`;
        }

        if (q.includes('tank') || q.includes('water level')) {
            let status = '';
            let advice = '';
            if (d.tank < 10) { status = '🚨 CRITICAL'; advice = 'Activate water collection!'; }
            else if (d.tank < 25) { status = '⚠️ Low'; advice = 'Reserve for essential watering'; }
            else if (d.tank < 50) { status = '🟡 Moderate'; advice = 'Adequate for short-term'; }
            else if (d.tank < 80) { status = '🟢 Good'; advice = 'Sufficient for normal ops'; }
            else { status = '💧 Full'; advice = 'Tank is full'; }
            
            return `💦 **Water Tank: ${d.tank}%** (${status})\n\n📊 Volume: ${liters}L / 2L\n\n${advice}`;
        }

        if (q.includes('should i water') || q.includes('water now') || q.includes('watering needed')) {
            if (d.tank < 10) {
                return `🚫 Cannot water — Tank at ${d.tank}% (critical). Activate water collection first.`;
            }
            if (d.soil > 70) {
                return `✅ No watering needed. Soil at ${d.soil}% (optimal range).`;
            }
            if (d.soil < 20) {
                return `🚨 CRITICAL — Water immediately! Soil at ${d.soil}%. Run irrigation for 20-30 minutes.`;
            }
            if (d.soil < 40) {
                return `💧 Watering recommended. Soil at ${d.soil}% (below optimal). Tank: ${d.tank}% | Temp: ${d.temp}°C`;
            }
            return `✅ Soil is adequate at ${d.soil}%. No immediate watering needed.`;
        }

        if (q.includes('sensor') || q.includes('status') || q.includes('all data') || q.includes('live data')) {
            // Beautiful table format for sensor data
            return `📊 **Live Sensor Report**

| Sensor | Value | Status |
|--------|-------|--------|
| 🌡️ Temperature | ${d.temp}°C | ${d.temp > 35 ? '⚠️ High' : d.temp < 15 ? '⚠️ Low' : '✅ Normal'} |
| 💧 Humidity | ${d.hum}% | ${d.hum < 30 ? '⚠️ Low' : d.hum > 70 ? '💧 High' : '✅ Normal'} |
| 🌱 Soil Moisture | ${d.soil}% | ${d.soil < 30 ? '⚠️ Low' : d.soil > 70 ? '🔵 High' : '✅ Good'} |
| 💦 Water Tank | ${d.tank}% | ${d.tank < 25 ? '⚠️ Low' : d.tank > 80 ? '💧 Full' : '✅ OK'} |
| 🚰 Pump | ${d.pumpOn ? '🟢 RUNNING' : '⚫ OFF'} | — |

${d.soil < 30 ? '⚠️ **Alert:** Soil moisture is low. Consider watering soon.' : ''}
${d.tank < 20 ? '⚠️ **Alert:** Water tank is low. Monitor collection system.' : ''}`;
        }

        if (q.includes('zone') || q.includes('how many zone')) {
            if (zones.length === 0) {
                return `🏞️ **No Zones Configured**

You have no irrigation zones yet.

**To add a zone:**
1. Go to 💧 Irrigation page
2. Click "➕ Add New Zone"
3. Set name, duration, and water amount

💡 Tip: Create separate zones for different plant types!`;
            }
            
            let zonesTable = '| # | Zone | Status | Duration |\n|---|------|--------|----------|\n';
            zones.forEach((z, i) => {
                zonesTable += `| ${i+1} | ${z.icon || '🌱'} ${z.name} | ${z.isRunning ? '🟢 RUNNING' : '⚫ IDLE'} | ${z.duration || 30} min |\n`;
            });
            
            return `🏞️ **Your Irrigation Zones** (${zones.length} total)

${zonesTable}

💡 Go to Irrigation page to manage zones and schedules.`;
        }

        if (q.includes('weather') || q.includes('rain') || q.includes('forecast') || q.includes('temperature outside')) {
            const weatherData = await getRealWeatherForecast();
            
            if (weatherData) {
                const w = weatherData;
                const rainEmoji = w.current.rainExpected ? '🌧️ YES' : '☀️ NO';
                const rainAdvice = w.current.rainExpected ? 
                    '🌧️ **Rain expected!** This is excellent for natural irrigation. Reduce or pause scheduled watering.' : 
                    '☀️ **No rain forecast.** Rely on your HydroGen irrigation system.';
                
                // Build forecast table
                let forecastTable = '| Time | Temp | Condition | Rain |\n|------|------|-----------|------|\n';
                w.forecast.forEach(f => {
                    forecastTable += `| ${f.time} | ${f.temp}°C | ${f.condition} | ${f.rain ? '🌧️ Yes' : '☀️ No'} |\n`;
                });
                
                return `🌤️ **Weather Forecast — ${w.city}**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Current Conditions:**

| 📊 Parameter | 📈 Value |
|--------------|----------|
| 🌡️ Temperature | ${w.current.temp}°C |
| 🌡️ Feels Like | ${w.current.feelsLike}°C |
| 💧 Humidity | ${w.current.humidity}% |
| 🌬️ Wind | ${w.current.wind} km/h |
| ☁️ Conditions | ${w.current.condition} |
| 🌧️ Rain Expected | ${rainEmoji} |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Next 6-Hour Forecast:**

${forecastTable}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🌾 **Agricultural Advisory**

${rainAdvice}

💡 **Collection Tip:** ${w.current.humidity > 60 ? 'High humidity — excellent for water collection!' : 'Moderate humidity — collection is active but slower.'}

💧 **Irrigation Advice:** ${w.current.temp > 35 ? 'Extreme heat — water in early morning and evening only!' : 'Normal temperatures — standard irrigation schedule recommended.'}`;
            } else {
                // Fallback to sensor-based weather
                return `🌤️ **Weather Update**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Parameter | Value |
|-----------|-------|
| 🌡️ Temperature | ${d.temp}°C |
| 💧 Humidity | ${d.hum}% |
| 🌧️ Rain Expected | ${rain ? '✅ YES — delay irrigation' : '❌ No'} |

${rain ? '🌧️ Rain expected — reduce or pause scheduled irrigation!' : '☀️ No rain forecast — rely on HydroGen for irrigation.'}

💡 ${d.hum > 60 ? 'High humidity is great for atmospheric water collection!' : 'Lower humidity reduces collection efficiency. Monitor tank levels.'}`;
            }
        }

        if (q.includes('hello') || q.includes('hi') || q.includes('help') || q.length < 10) {
            const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
            return `👋 ${greet}! I'm HydroGen AI.

📊 **Current Status:**
| Metric | Value |
|--------|-------|
| 🌡️ Temperature | ${d.temp}°C |
| 💧 Humidity | ${d.hum}% |
| 🌱 Soil | ${d.soil}% |
| 💦 Tank | ${d.tank}% |

Ask me:
• 💧 "Should I water now?"
• 📊 "Show all sensor data"
• 🌱 "Soil moisture status"
• 💦 "Water tank level"`;
        }

        return `🤔 Try asking: "Should I water now?" or "Show all sensor data"`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MAIN AI RESPONSE
    // ══════════════════════════════════════════════════════════════════════════
    async function getAIResponse(question) {
        await fetchSensorData();
        
        const systemPrompt = await buildSystemPrompt();
        const messages = [{ role: 'user', content: question }];

        const orRes = await callOpenRouter(messages, systemPrompt);
        if (orRes) return orRes;

        const groqRes = await callGroq(messages, systemPrompt);
        if (groqRes) return groqRes;

        console.log('📚 [Chatbot] Using local knowledge base.');
        activeApiName = 'Local Knowledge';
        return await getLocalResponse(question);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE DETECTION
    // ══════════════════════════════════════════════════════════════════════════
    function detectPage() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('dashboard'))  return 'dashboard';
        if (path.includes('irrigation')) return 'irrigation';
        if (path.includes('analytic'))   return 'analytics';
        if (path.includes('report'))     return 'reports';
        if (path.includes('setting'))    return 'settings';
        return 'home';
    }

    const PAGE_QUESTIONS = {
        home:      ['💧 Should I water?', '📊 All sensor data', '💦 Tank level'],
        dashboard: ['💧 Should I water?', '📊 All sensor data', '💦 Tank level'],
        irrigation:['💧 Should I water?', '🏞️ My zones', '📊 All sensor data'],
        analytics: ['📊 All sensor data', '💧 Should I water?'],
        reports:   ['📊 All sensor data', '💧 Should I water?'],
        settings:  ['📊 All sensor data', '💧 Should I water?']
    };

    function getPageQuestions() {
        return PAGE_QUESTIONS[detectPage()] || PAGE_QUESTIONS.home;
    }

    function sendWelcomeText() {
        const d = getSensorData();
        const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
        return `👋 ${greet}! I'm HydroGen AI.

📊 **Live Status:**
| Metric | Value |
|--------|-------|
| 🌡️ Temperature | ${d.temp}°C |
| 💧 Humidity | ${d.hum}% |
| 🌱 Soil | ${d.soil}% |
| 💦 Tank | ${d.tank}% |

Ask me: "Should I water now?" or "Show all sensor data"`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHAT UI - Beautiful table formatting
    // ══════════════════════════════════════════════════════════════════════════
    let isExpanded = false;

    function setupChatUI() {
        window.toggleChat = toggleChat;
        window.sendChatMessage = sendChatMessage;
        window.quickAsk = quickAsk;
        window.toggleChatExpand = toggleChatExpand;

        const header = document.querySelector('.chat-header');
        if (header) {
            header.innerHTML = `
                <div class="chat-header-left">
                    <div class="chat-header-icon">🤖</div>
                    <div class="chat-header-info">
                        <div class="chat-header-title">HydroGen AI</div>
                        <div class="chat-header-subtitle">Smart Assistant</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <span class="chat-online-dot"></span>
                    <button class="chat-expand-btn" onclick="toggleChatExpand()"><i class="fas fa-expand"></i></button>
                    <button class="chat-close-btn" onclick="toggleChat()"><i class="fas fa-times"></i></button>
                </div>`;
        }

        const suggBox = document.querySelector('.suggestions');
        if (suggBox) {
            const qs = getPageQuestions();
            suggBox.innerHTML = qs.map(q => `<button onclick="quickAsk('${q.replace(/'/g, "\\'")}')">${q}</button>`).join('');
        }

        const sendBtn = document.querySelector('.chat-input button');
        if (sendBtn && sendBtn.textContent.trim() === 'Send') {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }

        const input = document.getElementById('userInput');
        if (input) {
            // Make it a textarea for better multiline support
            const textarea = document.createElement('textarea');
            textarea.id = 'userInput';
            textarea.placeholder = input.placeholder || 'Ask me anything...';
            textarea.rows = '1';
            textarea.style.whiteSpace = 'pre-wrap';
            textarea.style.wordWrap = 'break-word';
            textarea.style.wordBreak = 'break-word';
            textarea.style.overflow = 'hidden';
            textarea.style.resize = 'none';
            textarea.style.minHeight = '40px';
            textarea.style.maxHeight = '120px';
            textarea.style.lineHeight = '1.4';
            
            // Replace input with textarea
            input.parentNode.replaceChild(textarea, input);
            
            // Auto-resize textarea
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                let newHeight = Math.min(this.scrollHeight, 120);
                this.style.height = newHeight + 'px';
            });
            
            textarea.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                }
            });
        }

        console.log('🔧 [Chatbot] UI ready.');
    }

    function toggleChat() {
        const w = document.getElementById('chatWindow');
        if (!w) return;
        const open = w.style.display === 'flex';
        w.style.display = open ? 'none' : 'flex';
    }

    function toggleChatExpand() {
        const w = document.getElementById('chatWindow');
        if (!w) return;
        isExpanded = !isExpanded;
        w.classList.toggle('expanded', isExpanded);
        const btn = document.querySelector('.chat-expand-btn i');
        if (btn) { btn.className = isExpanded ? 'fas fa-compress' : 'fas fa-expand'; }
    }

    function appendMsg(text, who) {
        const box = document.getElementById('chatBox');
        if (!box) return;
        const div = document.createElement('div');
        div.className = `msg ${who}`;
        
        if (who === 'ai') {
            div.innerHTML = `<strong>🤖 HydroGen AI</strong><br>${formatMessageWithTables(text)}`;
        } else {
            div.innerHTML = `<strong>You</strong><br>${escapeHtml(text)}`;
        }
        
        div.style.whiteSpace = 'normal';
        div.style.wordWrap = 'break-word';
        div.style.wordBreak = 'break-word';
        
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showTyping() {
        const box = document.getElementById('chatBox');
        if (!box) return null;
        const div = document.createElement('div');
        div.className = 'typing-indicator';
        div.id = 'typingIndicator';
        div.innerHTML = '<span></span><span></span><span></span>';
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    }

    function removeTyping() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
    }

    // Beautiful table formatter that fits within the response card - UPDATED for equal columns
    function formatMessageWithTables(text) {
        if (!text) return '';
        
        // Handle markdown tables
        text = text.replace(/((?:\|[^\n]+\|\n?)+)/g, (block) => {
            const lines = block.trim().split('\n').filter(l => l.trim());
            if (lines.length === 0) return block;
            
            // Filter out separator lines (like |---|---|)
            const dataLines = lines.filter(l => !/^\s*\|[\s\-:|]+\|\s*$/.test(l));
            if (dataLines.length === 0) return block;
            
            const parseRow = (line) => {
                return line.split('|').filter(c => c !== undefined).slice(1, -1).map(c => c.trim());
            };
            
            // Get column count from first data row
            const firstRowCells = parseRow(dataLines[0]);
            const colCount = firstRowCells.length;
            
            // Calculate equal width percentage
            const colWidthPercent = (100 / colCount).toFixed(2);
            
            // Generate header
            let headerHtml = '<thead>';
            if (dataLines[0]) {
                const headerCells = parseRow(dataLines[0]);
                headerHtml += '<tr>';
                headerCells.forEach(cell => {
                    headerHtml += `<th style="padding:10px 12px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);font-weight:700;font-size:12px;border:1px solid #6ee7b7;text-align:left;color:#065f46;width:${colWidthPercent}%;word-break:break-word;">${escapeHtml(cell)}</th>`;
                });
                headerHtml += '</tr>';
            }
            headerHtml += '</thead>';
            
            // Generate body rows
            let bodyHtml = '<tbody>';
            for (let i = 1; i < dataLines.length; i++) {
                const cells = parseRow(dataLines[i]);
                const rowClass = i % 2 === 0 ? 'even' : 'odd';
                bodyHtml += `<tr class="table-row-${rowClass}">`;
                cells.forEach(cell => {
                    bodyHtml += `<td style="padding:8px 12px;border:1px solid rgba(0,0,0,0.08);font-size:12px;vertical-align:top;word-break:break-word;line-height:1.5;">${escapeHtml(cell)}</td>`;
                });
                // Fill missing cells if any
                for (let j = cells.length; j < colCount; j++) {
                    bodyHtml += `<td style="padding:8px 12px;border:1px solid rgba(0,0,0,0.08);font-size:12px;vertical-align:top;">—</td>`;
                }
                bodyHtml += '</tr>';
            }
            bodyHtml += '</tbody>';
            
            return `<div class="chat-table-wrapper" style="overflow-x:auto;margin:12px 0;width:100%;border-radius:12px;">
                        <table style="border-collapse:collapse;width:100%;min-width:280px;border-radius:12px;overflow:hidden;background:inherit;table-layout:fixed;">
                            ${headerHtml}${bodyHtml}
                        </table>
                    </div>`;
        });
        
        // Format other markdown elements
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^### (.*?)$/gm, '<h4 style="margin:10px 0 5px 0;font-size:13px;color:#065f46;font-weight:600;">$1</h4>')
            .replace(/^## (.*?)$/gm, '<h3 style="margin:10px 0 5px 0;font-size:14px;color:#065f46;font-weight:600;">$1</h3>')
            .replace(/^# (.*?)$/gm, '<h2 style="margin:10px 0 5px 0;font-size:15px;color:#065f46;font-weight:600;">$1</h2>')
            .replace(/^[•\-] (.*?)$/gm, '<li style="margin:4px 0;line-height:1.5;">$1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, (match) => `<ul style="margin:8px 0;padding-left:24px;">${match}</ul>`)
            .replace(/^(\d+)\. (.*?)$/gm, '<li style="margin:4px 0;line-height:1.5;">$2</li>')
            .replace(/(<li.*<\/li>\n?)+/g, (match) => `<ol style="margin:8px 0;padding-left:24px;">${match}</ol>`)
            .replace(/━+/g, '<hr style="margin:10px 0;border:none;border-top:1px solid #e2e8f0;">')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }

    async function sendChatMessage() {
        const input = document.getElementById('userInput');
        if (!input) return;
        const question = input.value.trim();
        if (!question) return;

        input.value = '';
        input.style.height = 'auto';
        
        appendMsg(question, 'you');

        const typing = showTyping();

        try {
            const answer = await getAIResponse(question);
            removeTyping();
            appendMsg(answer, 'ai');
        } catch (e) {
            removeTyping();
            console.error('❌ [Chatbot] Error:', e);
            appendMsg('Sorry, I encountered an error. Please try again.', 'ai');
        }
    }

    function quickAsk(question) {
        const input = document.getElementById('userInput');
        if (input) { 
            input.value = question;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        }
        sendChatMessage();
    }

    function sendWelcomeMessage() {
        const box = document.getElementById('chatBox');
        if (!box) return;
        const existingMsgs = box.querySelectorAll('.msg');
        if (existingMsgs.length > 0) {
            const firstMsg = existingMsgs[0];
            if (firstMsg && firstMsg.classList.contains('ai')) {
                firstMsg.innerHTML = `<strong>🤖 HydroGen AI</strong><br>${formatMessageWithTables(sendWelcomeText())}`;
            } else {
                appendMsg(sendWelcomeText(), 'ai');
            }
        } else {
            appendMsg(sendWelcomeText(), 'ai');
        }
    }

})();