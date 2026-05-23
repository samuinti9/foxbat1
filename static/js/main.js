/**
 * MISSION CONTROL v3.0 - OFFICIAL REBUILD
 * Optimized for High-Reliability Flight Tracking
 */

let map, darkTheme, satelliteTheme, lightThemeMap, nightShadow;
let isLightMode = false;
let atcGhostLines = [];
let sysConfig = { units: 'metric', showATC: true, anim: true, maskVIP: false, antiSpoof: true, voiceEnabled: true };
let markers = {};
let trailHistory = {};
let telemetryHistory = {}; // Store speed/alt history for the graph
let telemetryChart = null;
let selectedId = null;
let isFollow = false;
let flightPath, predictionPath, satComLink;
let lastSpokenId = null; 
let voiceSynthesis = window.speechSynthesis;
let missionEvents = [];
let cmdHistory = [];
let cmdHistoryIndex = -1;


// --- UNIFIED VOICE SELECTOR ---
// Selects the deepest, most authoritative male voice available across all platforms.
// Browser TTS voices vary widely by OS — this list covers Windows, macOS, ChromeOS, Android, and Linux.
function getTacticalVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Check if user has explicitly selected a voice from settings
    const savedVoiceName = localStorage.getItem('foxbat_voice_name');
    if (savedVoiceName) {
        const found = voices.find(v => v.name === savedVoiceName);
        if (found) return found;
    }

    // TIER 1: Known deep male voices by exact name (highest priority)
    // Google remote voices are highest quality; prioritize them
    const tier1 = [
        'Google UK English Male',   // Chrome — clean professional British male (BEST)
        'Google US English',        // Chrome — clean US male
        'Microsoft David',          // Windows — deep US male
        'Microsoft Mark',           // Windows — UK male
        'Microsoft Guy Online',     // Windows Azure
        'Daniel',                   // macOS/iOS — British male
        'Alex',                     // macOS — US male
        'Rishi',                    // macOS — Indian English male
        'en-GB-Wavenet-B',         // Android — British male
        'en-US-Wavenet-D',         // Android — US male
        'en-US-Standard-B',        // Android — US male
    ];

    for (const name of tier1) {
        const found = voices.find(v => v.name.includes(name));
        if (found) return found;
    }

    // TIER 2: Any voice with "Male" in the name (but NOT "Female")
    const maleVoice = voices.find(v => 
        v.name.toLowerCase().includes('male') && 
        !v.name.toLowerCase().includes('female') &&
        (v.lang.startsWith('en'))
    );
    if (maleVoice) return maleVoice;

    // TIER 3: English voice with lowest default pitch (heuristic: pick last English voice — browsers often list male after female)
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    if (englishVoices.length > 0) {
        // Prefer en-GB for authoritative British tone, then en-US
        const gb = englishVoices.find(v => v.lang === 'en-GB');
        if (gb) return gb;
        return englishVoices[englishVoices.length - 1];
    }

    // TIER 4: absolute fallback
    return voices[0] || null;
}

function populateVoiceSelector() {
    const selector = document.getElementById('cfg-voice-select');
    if (!selector) return;

    const voices = window.speechSynthesis.getVoices();
    selector.innerHTML = '';

    if (!voices || voices.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'NO VOICES DETECTED';
        option.value = '';
        selector.appendChild(option);
        return;
    }

    // Sort voices to make English/US/UK voices appear first
    const sortedVoices = [...voices].sort((a, b) => {
        const aEn = a.lang.startsWith('en');
        const bEn = b.lang.startsWith('en');
        if (aEn && !bEn) return -1;
        if (!aEn && bEn) return 1;
        return a.name.localeCompare(b.name);
    });

    sortedVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})${voice.localService ? ' [LOCAL]' : ' [REMOTE]'}`;
        selector.appendChild(option);
    });

    // Restore selection
    const savedName = localStorage.getItem('foxbat_voice_name') || getTacticalVoice()?.name || '';
    if (savedName) {
        selector.value = savedName;
    }

    // Load sliders
    const savedPitch = localStorage.getItem('foxbat_voice_pitch') || '0.75';
    const savedRate = localStorage.getItem('foxbat_voice_rate') || '0.95';

    const inputPitch = document.getElementById('cfg-voice-pitch');
    const inputRate = document.getElementById('cfg-voice-rate');
    const lblPitch = document.getElementById('lbl-pitch');
    const lblRate = document.getElementById('lbl-rate');

    if (inputPitch) {
        inputPitch.value = savedPitch;
        if (lblPitch) lblPitch.textContent = savedPitch;
    }
    if (inputRate) {
        inputRate.value = savedRate;
        if (lblRate) lblRate.textContent = savedRate;
    }
}

function applyVoiceChange() {
    const selector = document.getElementById('cfg-voice-select');
    if (!selector) return;
    localStorage.setItem('foxbat_voice_name', selector.value);
}

function applyVoiceSettings() {
    const inputPitch = document.getElementById('cfg-voice-pitch');
    const inputRate = document.getElementById('cfg-voice-rate');
    const lblPitch = document.getElementById('lbl-pitch');
    const lblRate = document.getElementById('lbl-rate');

    if (inputPitch) {
        localStorage.setItem('foxbat_voice_pitch', inputPitch.value);
        if (lblPitch) lblPitch.textContent = inputPitch.value;
    }
    if (inputRate) {
        localStorage.setItem('foxbat_voice_rate', inputRate.value);
        if (lblRate) lblRate.textContent = inputRate.value;
    }
}

function testSelectedVoice() {
    const selector = document.getElementById('cfg-voice-select');
    const name = selector ? selector.value : '';
    A10.speak(`Warthog voice module configured. Testing text to speech interface using ${name || 'default system'} voice.`);
}

// Log available voices for debugging (runs once when voices load)
window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    console.log('[A10 VOICE DEBUG] Available voices on this device:');
    voices.forEach((v, i) => console.log(`  [${i}] ${v.name} (${v.lang}) ${v.localService ? 'LOCAL' : 'REMOTE'}`));
    const selected = getTacticalVoice();
    console.log('[A10 VOICE DEBUG] Selected voice:', selected ? selected.name : 'NONE');
    populateVoiceSelector();
};

// Make globally accessible for onclicks
window.applyVoiceChange = applyVoiceChange;
window.applyVoiceSettings = applyVoiceSettings;
window.testSelectedVoice = testSelectedVoice;

// --- A10 SYSTEM ENGINE ---
const A10 = {
    isSpeaking: false,
    isListening: false,
    transcriptEl: null,
    wavesEl: null,
    recognition: null,
    waitingForSector: false,
    
    init() {
        this.transcriptEl = document.getElementById('a10-transcript');
        this.wavesEl = document.getElementById('a10-voice-waves');
        
        // Initialize Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                if (this.transcriptEl) this.transcriptEl.innerText = "LISTENING...";
                if (this.wavesEl) this.wavesEl.classList.add('active');
                document.getElementById('btn-a10-mic').style.color = 'var(--col-red)';
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.toUpperCase();
                if (this.transcriptEl) this.transcriptEl.innerText = `USER: ${transcript}`;
                this.processCommand(transcript);
            };

            this.recognition.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                if (this.transcriptEl) this.transcriptEl.innerText = `ERROR: ${event.error}`;
                this.stopListening();
            };

            this.recognition.onend = () => {
                this.stopListening();
            };
        } else {
            console.warn("Speech Recognition API not supported in this browser.");
        }
        
        populateVoiceSelector();
        console.log("A10 Core Initialized.");
        
        // Setup hotkey (Spacebar) to listen
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && !this.isListening) {
                e.preventDefault();
                this.listen();
            }
        });
    },

    listen() {
        if (!this.recognition) {
            this.speak("Speech recognition is not supported in this environment.");
            return;
        }
        if (this.isListening) {
            this.recognition.stop();
        } else {
            // Cancel any ongoing speech so A10 doesn't talk over the user
            window.speechSynthesis.cancel();
            this.recognition.start();
        }
    },
    
    stopListening() {
        this.isListening = false;
        if (this.wavesEl && !this.isSpeaking) this.wavesEl.classList.remove('active');
        document.getElementById('btn-a10-mic').style.color = '';
    },
    
    processCommand(transcript) {
        const t = transcript.toUpperCase().trim();
        
        // Conversational handling when waiting for sector input
        if (this.waitingForSector) {
            console.log('[A10 SECTOR] Waiting for sector, heard:', JSON.stringify(t));

            // Fuzzy sector matching — handles many speech recognition variants
            const sectorMap = [
                { key: 'INDIA',       aliases: ['INDIA', 'INDIAN'] },
                { key: 'MIDDLE EAST', aliases: ['MIDDLE EAST', 'MIDEAST', 'MID EAST', 'MIDDLE', 'DUBAI', 'GULF'] },
                { key: 'USA',         aliases: ['USA', 'US', 'UNITED STATES', 'AMERICA', 'AMERICAN', 'STATES'] },
                { key: 'RUSSIA',      aliases: ['RUSSIA', 'RUSSIAN', 'MOSCOW'] },
                { key: 'DELHI',       aliases: ['DELHI', 'NEW DELHI'] },
                { key: 'MUMBAI',      aliases: ['MUMBAI', 'BOMBAY'] },
                { key: 'LONDON',      aliases: ['LONDON', 'UK', 'ENGLAND', 'BRITAIN'] },
                { key: 'SINGAPORE',   aliases: ['SINGAPORE'] },
            ];

            let matchedSector = null;
            for (const entry of sectorMap) {
                if (entry.aliases.some(alias => t.includes(alias))) {
                    matchedSector = entry.key;
                    break;
                }
            }

            if (matchedSector) {
                this.waitingForSector = false;
                processCommand(`JUMP ${matchedSector}`);
            } else if (t.includes('CANCEL') || t.includes('ABORT') || t.includes('CLEAR') || t.includes('STOP') || t.includes('NOTHING') || t.includes('NEVER MIND')) {
                this.waitingForSector = false;
                this.speak("Sector jump cancelled. Standing by.");
            } else {
                this.speak("I did not catch that sector. Choose India, Middle East, USA, Russia, London, Singapore, Delhi, or Mumbai. Or say cancel.", () => {
                    this.listen();
                });
            }
            return;
        }

        // Standard commands
        // Debug: log what was heard
        console.log('[A10 CMD] Heard:', JSON.stringify(t));

        const isSectorJump =
            t.includes('SECTOR JUMP') ||
            t.includes('JUMP SECTOR') ||
            t.includes('JUMP TO SECTOR') ||
            t.includes('GO TO SECTOR') ||
            t.includes('SECTOR NAVIGATION') ||
            t.includes('NAVIGATE SECTOR') ||
            t.includes('SELECT SECTOR') ||
            t.includes('SECTOR SELECT') ||
            t.includes('SWITCH SECTOR') ||
            t.includes('SECTOR SWITCH') ||
            t.includes('CHANGE SECTOR') ||
            t.includes('SECTOR CHANGE') ||
            t === 'JUMP' ||
            t === 'SECTOR';

        if (isSectorJump) {
            this.waitingForSector = true;
            this.speak("Which sector would you like to jump to? Say India, Middle East, USA, or Russia.", () => {
                this.listen();
            });
        } else if (t.includes('LOCK FASTEST') || t.includes('FASTEST BOGEY') || t === 'FASTEST') {
            processCommand('LOCK FASTEST');
        } else if (t.includes('LOCK HIGHEST') || t.includes('HIGHEST BOGEY') || t === 'HIGHEST') {
            processCommand('LOCK HIGHEST');
        } else if (t.includes('WEATHER REPORT') || t.includes('WEATHER')) {
            processCommand('WEATHER REPORT');
        } else if (t.includes('SATELLITE')) {
            processCommand('THEME SAT');
        } else if (t.includes('STEALTH') || t.includes('DARK THEME') || t.includes('DARK MODE')) {
            processCommand('THEME DARK');
        } else if (t.includes('START DRILL') || t.includes('INITIATE DRILL') || t.includes('EMERGENCY DRILL') || t === 'DRILL') {
            processCommand('START DRILL');
        } else if (t.includes('CANCEL LOCK') || t.includes('RELEASE LOCK') || t.includes('CLOSE DETAILS') || t === 'CLOSE') {
            processCommand('CANCEL LOCK');
        } else if (t.includes('BOGEY IDENTIFIED') || t.includes('BOGEY')) {
            processCommand('BOGEY IDENTIFIED');
        } else if (t.includes('ANY THREAT') || t.includes('THREAT')) {
            processCommand('ANY THREAT');
        } else if (t.includes('ZOOM IN') || t.includes('ENLARGE')) {
            processCommand('ZOOM IN');
        } else if (t.includes('ZOOM OUT') || t.includes('WIDEN')) {
            processCommand('ZOOM OUT');
        } else if (t.includes('IDENTIFY YOURSELF') || t.includes('WHO ARE YOU')) {
            processCommand('IDENTIFY YOURSELF');
        } else if ((t.includes('HEY') || t.includes('HAY') || t.includes('HI') || t.includes('HELLO')) && (t.includes('A10') || t.includes('A-10') || t.includes('A 10'))) {
            processCommand('HEY A10');
        } else if (t.includes('HELLO') || t.includes('A10') || t.includes('A-10') || t.includes('A 10')) {
            processCommand('HELLO');
        } else if (t.includes('REPORT') || t.includes('STATUS')) {
            processCommand('STATS');
        } else {
            this.speak(`Command not recognized: ${transcript}`);
        }
    },

    speak(text, callback) {
        if (!sysConfig.voiceEnabled) return;
        
        // Stop current speech
        window.speechSynthesis.cancel();
 
        const msg = new SpeechSynthesisUtterance(text);
        msg.rate = parseFloat(localStorage.getItem('foxbat_voice_rate')) || 0.95;
        msg.pitch = parseFloat(localStorage.getItem('foxbat_voice_pitch')) || 0.75;
 
        const speakNow = () => {
            const techVoice = getTacticalVoice();
            if (techVoice) msg.voice = techVoice;
 
            msg.onstart = () => {
                this.isSpeaking = true;
                if (this.wavesEl) this.wavesEl.classList.add('active');
                if (this.transcriptEl) {
                    const lines = text.toUpperCase().split('.').map(l => l.trim()).filter(l => l.length > 0);
                    const formatted = lines.map(l => `<div style="margin-bottom: 6px; display: flex; gap: 8px; line-height: 1.4;"><span style="color:var(--col-cyan);">></span> <span>${l}</span></div>`).join('');
                    this.transcriptEl.innerHTML = formatted;
                }
            };
 
            msg.onend = () => {
                this.isSpeaking = false;
                if (this.wavesEl && !this.isListening) this.wavesEl.classList.remove('active');
                if (callback) callback();
            };
 
            window.speechSynthesis.speak(msg);
        };
 
        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = speakNow;
        } else {
            speakNow();
        }
    }
};

window.onload = () => {
    initRadarSystem();
    A10.init();
};

window.missionInterval = null;

function applySettings() {
    const maskEl  = document.getElementById('cfg-mask');
    const spoofEl = document.getElementById('cfg-spoof');
    if (maskEl)  sysConfig.maskVIP    = maskEl.checked;
    if (spoofEl) sysConfig.antiSpoof  = spoofEl.checked;
    logMissionEvent(`CONFIG UPDATED: VIP_MASK=${sysConfig.maskVIP} ANTI_SPOOF=${sysConfig.antiSpoof}`, 'INFO');
}

function startMission(mode) {
    const modal = document.getElementById('startup-modal');
    if (modal) modal.classList.add('hidden');
    
    // Configure based on Mode
    if (mode === 'global') {
        map.setView([25, 10], 3);
        switchTheme('dark');
    } else if (mode === 'tactical') {
        map.setView([20, 80], 4);
        switchTheme('dark');
    } else if (mode === 'satellite') {
        map.setView([28.61, 77.23], 6);
        switchTheme('sat');
    } else if (mode === 'stealth') {
        map.setView([28.61, 77.23], 5);
        switchTheme('dark');
    }

    if (!window.missionInterval) {
        fetchData();
        window.missionInterval = setInterval(fetchData, 10000);
        
        // --- SATELLITE INTERFERENCE ENGINE ---
        setInterval(() => {
            if (Math.random() > 0.92) {
                document.body.classList.add('glitch-active');
                setTimeout(() => {
                    document.body.classList.remove('glitch-active');
                }, Math.random() * 500);
            }
        }, 3000);
    }
}

function initRadarSystem() {
    // 1. Map Initialization (Failsafe)
    try {
        map = L.map('map', { 
            zoomControl: false, 
            attributionControl: false 
        }).setView([28.61, 77.23], 5);

        darkTheme = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', {
            subdomains: 'abcd',
            maxZoom: 19
        });

        lightThemeMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png', {
            subdomains: 'abcd',
            maxZoom: 19
        });

        satelliteTheme = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

        isLightMode = localStorage.getItem('theme') === 'light';
        if (isLightMode) {
            document.body.classList.add('light-theme');
            lightThemeMap.addTo(map);
        } else {
            darkTheme.addTo(map);
        }

        nightShadow = L.polygon([], { color: '#000', fillOpacity: 0.2, stroke: false, interactive: false }).addTo(map);
        flightPath = L.polyline([], { color: '#22d3ee', weight: 2, dashArray: '5, 10', opacity: 0.7 }).addTo(map);
        predictionPath = L.polyline([], { color: '#facc15', weight: 2, dashArray: '2, 8', opacity: 0.5 }).addTo(map);
        satComLink = L.polyline([], { color: '#4ade80', weight: 1, dashArray: '1, 15', opacity: 0.3 }).addTo(map);

        console.log("RADAR SYSTEM: ONLINE");
    } catch (e) {
        console.error("CRITICAL MAP FAILURE:", e);
        return;
    }

    // --- TACTICAL ATC BOUNDARIES (GHOST LINES) ---
    const atcSectors = [
        { name: "NORTH ATC", color: "#10b981", coords: [[32, 70], [32, 85], [24, 85], [24, 70], [32, 70]] },
        { name: "WEST ATC", color: "#38bdf8", coords: [[24, 65], [24, 80], [14, 80], [14, 65], [24, 65]] },
        { name: "SOUTH ATC", color: "#f59e0b", coords: [[14, 70], [14, 90], [5, 90], [5, 70], [14, 70]] },
        { name: "EAST ATC", color: "#8b5cf6", coords: [[28, 85], [28, 98], [18, 98], [18, 85], [28, 85]] }
    ];
    atcSectors.forEach(s => {
        const line = L.polyline(s.coords, { color: s.color, weight: 1, opacity: 0.2, dashArray: '5, 10', interactive: false }).addTo(map);
        atcGhostLines.push(line);
    });

    // --- GLOBAL AIRPORT NETWORK ---
    const airports = [
        { name: "DELHI", lat: 28.5562, lon: 77.1000, terminals: ["T1", "T2", "T3"] },
        { name: "MUMBAI", lat: 19.0896, lon: 72.8656, terminals: ["T1", "T2"] },
        { name: "BANGALORE", lat: 13.1986, lon: 77.7066, terminals: ["T1", "T2"] },
        { name: "LONDON-LHR", lat: 51.4700, lon: -0.4543, terminals: ["T2", "T3", "T4", "T5"] },
        { name: "NEW YORK-JFK", lat: 40.6413, lon: -73.7781, terminals: ["T1", "T4", "T5", "T7", "T8"] },
        { name: "DUBAI-DXB", lat: 25.2532, lon: 55.3657, terminals: ["T1", "T2", "T3"] },
        { name: "SINGAPORE-SIN", lat: 1.3644, lon: 103.9915, terminals: ["T1", "T2", "T3", "T4"] },
        { name: "TOKYO-HND", lat: 35.5494, lon: 139.7798, terminals: ["T1", "T2", "T3"] },
        { name: "PARIS-CDG", lat: 49.0097, lon: 2.5479, terminals: ["T1", "T2", "T3"] },
        { name: "SYDNEY-SYD", lat: -33.9399, lon: 151.1753, terminals: ["T1", "T2", "T3"] },
        { name: "FRANKFURT-FRA", lat: 50.0379, lon: 8.5622, terminals: ["T1", "T2"] },
        { name: "LOS ANGELES-LAX", lat: 33.9416, lon: -118.4085, terminals: ["T1-T8", "TBIT"] },
        { name: "HONG KONG-HKG", lat: 22.3080, lon: 113.9185, terminals: ["T1"] }
    ];

    airports.forEach(a => {
        // --- AIRPORT GROUND RECTANGLE ---
        L.rectangle([[a.lat - 0.02, a.lon - 0.03], [a.lat + 0.02, a.lon + 0.03]], {
            color: '#22d3ee',
            weight: 1,
            fillColor: '#22d3ee',
            fillOpacity: 0.05,
            dashArray: '2, 5',
            interactive: false
        }).addTo(map);

        const icon = L.divIcon({
            className: 'airport-icon',
            html: `<div style="width:12px; height:12px; border:1px solid #22d3ee; background:rgba(34,211,238,0.1); position:relative; box-shadow:0 0 10px rgba(34,211,238,0.3);">
                    <div style="position:absolute; top:50%; left:-4px; right:-4px; height:1px; background:rgba(34,211,238,0.5);"></div>
                    <div style="position:absolute; left:50%; top:-4px; bottom:-4px; width:1px; background:rgba(34,211,238,0.5);"></div>
                   </div>`,
            iconSize: [12, 12]
        });
        L.marker([a.lat, a.lon], { icon }).addTo(map).on('click', () => openAirportIntel(a)).bindTooltip(a.name, { direction: 'top', className: 'mini-label' });
    });

    // --- NEW: TACTICAL OCEANIC CORRIDORS ---
    const oceanicCorridors = [
        { name: "PACIFIC-ALPHA", coords: [[-35, 175], [-15, 180], [20, -155]], color: "#38bdf8" },
        { name: "TRANS-INDIAN", coords: [[-30, 60], [-10, 80], [5, 100]], color: "#facc15" },
        { name: "ATLANTIC-BRIDGE", coords: [[40, -70], [45, -40], [50, -10]], color: "#fb923c" }
    ];
    oceanicCorridors.forEach(c => {
        L.polyline(c.coords, { color: c.color, weight: 1, dashArray: '10, 20', opacity: 0.15, interactive: false }).addTo(map);
        // Add waypoint markers at midpoints
        const mid = c.coords[Math.floor(c.coords.length/2)];
        L.circleMarker(mid, { radius: 2, color: c.color, opacity: 0.3 }).addTo(map).bindTooltip(c.name, { permanent: true, direction: 'right', className: 'mini-label-ocean' });
    });

    // --- NEW: TACTICAL AIRSPACE GRID ---
    renderTacticalGrid();

    // --- NEW: AIRSPACE SECTOR LABELS (FIRs) ---
    const firs = [
        { name: "DELHI FIR", lat: 28.5, lon: 77.0, color: "#10b981" },
        { name: "MUMBAI FIR", lat: 19.0, lon: 72.8, color: "#38bdf8" },
        { name: "CHENNAI FIR", lat: 13.0, lon: 80.2, color: "#f59e0b" },
        { name: "KOLKATA FIR", lat: 22.6, lon: 88.4, color: "#8b5cf6" },
        { name: "SINGAPORE FIR", lat: 1.3, lon: 103.8, color: "#22d3ee" },
        { name: "PACIFIC-WEST FIR", lat: 15.0, lon: 150.0, color: "#64748b" }
    ];
    firs.forEach(f => {
        L.marker([f.lat, f.lon], { 
            icon: L.divIcon({ className: 'fir-label', html: f.name, iconSize: [100, 20] }),
            interactive: false
        }).addTo(map);
    });

    map.on('move zoom', () => {
        const c = map.getCenter();
        const latEl = document.getElementById('map-lat');
        const lngEl = document.getElementById('map-lng');
        const zEl   = document.getElementById('map-zoom');
        if (latEl) latEl.innerText = c.lat.toFixed(2) + '°';
        if (lngEl) lngEl.innerText = c.lng.toFixed(2) + '°';
        if (zEl)   zEl.innerText  = 'Z' + map.getZoom();
    });

    map.on('zoomend', () => {
        logMissionEvent(`RADAR SCALE ADJUSTED: Z${map.getZoom()}`, "INFO");
    });

    map.on('moveend', () => {
        fetchData();
    });

    // 3. Search Engine
    document.getElementById('search-bar').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (q.length > 2) logMissionEvent(`QUERYING AIRSPACE: "${q}"`, "INFO");
        Object.values(markers).forEach(m => {
            const f = m._data;
            if (f) {
                const match = !q || f.callsign.toLowerCase().includes(q) || f.country.toLowerCase().includes(q);
                if (match) m.addTo(map); else map.removeLayer(m);
            }
        });
    });

    // 4. Mission Loop will be started via startMission() mode selector.
    
    // 5. TACTICAL GEOFENCE DEPLOYMENT (Right-Click)
    let activeGeofenceCircle = null;
    map.on('contextmenu', async function(e) {
        if (activeGeofenceCircle) {
            map.removeLayer(activeGeofenceCircle);
        }
        
        // Deploy a 100km radius circle
        activeGeofenceCircle = L.circle(e.latlng, {
            color: '#f43f5e',
            fillColor: '#f43f5e',
            fillOpacity: 0.1,
            radius: 100000 
        }).addTo(map);

        document.getElementById('tarmac-log').innerHTML += `<br><span style="color:#f43f5e;">> GEOFENCE DEPLOYED [${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}]</span>`;

        try {
            await fetch('/api/hub/geofence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: true, lat: e.latlng.lat, lon: e.latlng.lng, radius_km: 100.0 })
            });
        } catch(err) { console.error("Geofence Sync Error"); }
    });

    // --- NEW: TACTICAL PIN DEPLOYMENT (Double Click) ---
    map.on('dblclick', function(e) {
        const pin = L.marker(e.latlng, {
            icon: L.divIcon({
                className: 'tactical-pin',
                html: `<div style="color:#f43f5e; font-size:18px; filter:drop-shadow(0 0 5px #f43f5e);">📍</div>`,
                iconSize: [20, 20]
            })
        }).addTo(map);
        
        const pinId = 'PIN-' + Math.floor(Math.random() * 1000);
        pin.bindTooltip(`Tactical Node: ${pinId}`, { permanent: true, direction: 'right', className: 'mini-label' });
        logMissionEvent(`TACTICAL PIN DROPPED: ${pinId} [${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}]`, "SUCCESS");
        
        pin.on('click', () => { map.removeLayer(pin); logMissionEvent(`TACTICAL PIN REMOVED: ${pinId}`, "INFO"); });
    });

    // --- COMMAND CONSOLE INITIALIZATION ---
    const cmdInput = document.getElementById('command-input');
    if (cmdInput) {
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = cmdInput.value.trim().toUpperCase();
                processCommand(cmd);
                cmdHistory.unshift(cmd);
                if (cmdHistory.length > 20) cmdHistory.pop();
                cmdHistoryIndex = -1;
                cmdInput.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (cmdHistoryIndex < cmdHistory.length - 1) {
                    cmdHistoryIndex++;
                    cmdInput.value = cmdHistory[cmdHistoryIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (cmdHistoryIndex > 0) {
                    cmdHistoryIndex--;
                    cmdInput.value = cmdHistory[cmdHistoryIndex];
                } else {
                    cmdHistoryIndex = -1;
                    cmdInput.value = '';
                }
            }
        });

        const suggestionsBox = document.getElementById('cmd-suggestions');
        const availableCmds = ["SEARCH ", "JUMP ", "THEME ", "FOLLOW", "WEATHER", "STATS", "CLEAR", "CLEAR LOG", "GEOFENCE", "SIM", "HELP"];
        
        cmdInput.addEventListener('input', (e) => {
            const val = cmdInput.value.toUpperCase();
            if (!val) {
                suggestionsBox.classList.add('hidden');
                return;
            }
            
            const filtered = availableCmds.filter(c => c.startsWith(val));
            if (filtered.length > 0) {
                suggestionsBox.classList.remove('hidden');
                suggestionsBox.innerHTML = filtered.map(c => 
                    `<div style="color:#22d3ee; font-size:0.6rem; padding:4px; cursor:pointer; font-family:'Roboto Mono';" onclick="document.getElementById('command-input').value='${c}'; document.getElementById('cmd-suggestions').classList.add('hidden'); document.getElementById('command-input').focus();">${c}</div>`
                ).join('');
            } else {
                suggestionsBox.classList.add('hidden');
            }
        });

        // Close suggestions on blur
        document.addEventListener('click', (e) => {
            if (e.target !== cmdInput) suggestionsBox.classList.add('hidden');
        });
    }
}

async function fetchData() {
    try {
        let url = '/api/hub/flights';
        if (map && map.getZoom() >= 4) {
            const bounds = map.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            
            const lamin = Math.max(-90, Math.min(90, sw.lat));
            const lamax = Math.max(-90, Math.min(90, ne.lat));
            
            // Normalize longitude coordinates to [-180, 180]
            let lomin = sw.lng;
            let lomax = ne.lng;
            lomin = ((lomin + 180) % 360 + 360) % 360 - 180;
            lomax = ((lomax + 180) % 360 + 360) % 360 - 180;
            
            url += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
        }
        
        const r = await fetch(url);
        const json = await r.json();
        const flightData = json.data || json; 
        const source = json.source || "UNKNOWN";

        // Update UI Badges
        const badge = document.getElementById('data-source-badge');
        if (badge) {
            badge.innerText = `SOURCE: ${source}`;
            badge.style.color = source === "LIVE_OPENSKY" ? "#4ade80" : "#facc15";
        }
        
        const sysSource = document.getElementById('sys-source');
        if (sysSource) {
            sysSource.innerText = source === "LIVE_OPENSKY" ? "SOURCE: LIVE_NETWORK_ADSB" : "SOURCE: SIMULATED_UPLINK";
        }

        // Update Radar Markers
        updateRadar(flightData);

    } catch (e) {
        console.error("API UPLINK FAILURE", e);
    }
}

// --- TACTICAL TELEMETRY GENERATOR ---
// Cleaned: Telemetry Log removed permanently per user request.

function updateRadar(flights) {
    const now = new Date().toLocaleTimeString([], { hour12: false });
    const activeIds = new Set();
    let hasAlert = false;
    let alertCall = "";

    if (!flights || !Array.isArray(flights)) {
        flights = [];
    }

    flights.forEach(f => {
        
        // SECURITY CONFIG: Strict Anti-Spoofing (Ignore objects > Mach 3 / ~3700 km/h)
        if (sysConfig.antiSpoof && f.velocity > 1027) return; 
        
        // SECURITY CONFIG: Mask VIP/Military
        // If enabled, hide any aircraft without a proper callsign sequence indicating commercial, or squawking special ops.
        const isTactical = !f.callsign || f.callsign.includes('MIL') || f.squawk === '7777';
        if (sysConfig.maskVIP && isTactical) return;

        activeIds.add(f.id);
        const isE = (f.squawk === "7700");
        const isS = (f.id === selectedId);

        // --- VOICE ALERT LOGIC (Background updates silent per user request; announced via ANY THREAT command) ---
        if (isE && f.id !== lastSpokenId) {
            lastSpokenId = f.id;
            logMissionEvent(`EMERGENCY 7700 DETECTED: ${f.callsign}`, "CRITICAL");
        }

        if (f.geofence_violation && f.id !== lastSpokenId) {
            lastSpokenId = f.id;
            logMissionEvent(`GEOFENCE INCURSION: ${f.callsign}`, "WARNING");
        }

        if (isE) { hasAlert = true; alertCall = f.callsign; }
        
        // GEOFENCE VIOLATION TRIGGER
        const isViolating = f.geofence_violation;
        if (isViolating) { hasAlert = true; alertCall = f.callsign + " [GEOFENCE INCURSION]"; }

        // Icon Logic (Clean Amber)
        let color = isE || isViolating ? 'var(--neon-red)' : (isS ? 'var(--neon-cyan)' : 'var(--neon-amber)');

        if (markers[f.id]) {
            const m = markers[f.id];
            m.setLatLng([f.lat, f.lon]);
            
            // Optimization: Skip DOM lookup if possible
            const el = m.getElement();
            if(el) {
                const inner = el.querySelector('div');
                if(inner) {
                    inner.style.transform = `rotate(${f.heading}deg)`;
                    inner.style.color = color;
                }
            }
            
            const old = m._data || {};
            if (Math.abs(old.altitude - f.altitude) > 50 || old.callsign !== f.callsign || old.geofence_violation !== f.geofence_violation) {
                const birdModel = getBirdModel(f);
                m.setTooltipContent(`
                    <div style="display: flex; flex-direction: column; gap: 3px; min-width: 120px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                            <span style="font-weight:900; color:${color}; font-family:var(--font-display); font-size:0.7rem; letter-spacing:1px; line-height:1;">${f.callsign || 'UNK'}</span>
                            <span style="font-size:0.45rem; color:var(--col-cyan); opacity:0.9; letter-spacing:0.5px; line-height:1;">${birdModel}</span>
                        </div>
                        <div style="font-size:0.5rem; opacity:0.7; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px; line-height:1; font-family:var(--font-mono);">
                            FL${Math.round((f.altitude*3.28)/100)} <span style="color:var(--col-dim); margin:0 4px;">|</span> ${Math.round(f.velocity * 1.94)}KT
                        </div>
                    </div>
                `);
            }
        } else {
            const icon = L.divIcon({
                className: 'custom-plane',
                html: `<div style="transform:rotate(${f.heading}deg); color:${color}; transition: 0.3s linear;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));">
                            <path d="M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z"/>
                        </svg>
                       </div>`,
                iconSize: [24, 24]
            });
            const m = L.marker([f.lat, f.lon], { icon }).addTo(map);
            
            const birdModel = getBirdModel(f);
            m.bindTooltip(`
                <div style="display: flex; flex-direction: column; gap: 3px; min-width: 120px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                        <span style="font-weight:900; color:${color}; font-family:var(--font-display); font-size:0.7rem; letter-spacing:1px; line-height:1;">${f.callsign || 'UNK'}</span>
                        <span style="font-size:0.45rem; color:var(--col-cyan); opacity:0.9; letter-spacing:0.5px; line-height:1;">${birdModel}</span>
                    </div>
                    <div style="font-size:0.5rem; opacity:0.7; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px; line-height:1; font-family:var(--font-mono);">
                        FL${Math.round((f.altitude*3.28)/100)} <span style="color:var(--col-dim); margin:0 4px;">|</span> ${Math.round(f.velocity * 1.94)}KT
                    </div>
                </div>
            `, {
                permanent: true,
                direction: 'bottom',
                offset: [0, 15],
                className: 'plane-label-wrapper'
            });

            m.on('click', () => openFlightDetails(m._data));
            markers[f.id] = m;
        }
        markers[f.id]._data = f;

        // Trail Tracking & Intelligent Prediction
        if (isS) {
            if (!trailHistory[f.id]) trailHistory[f.id] = [];
            trailHistory[f.id].push({ lat: f.lat, lon: f.lon, time: now });
            if (trailHistory[f.id].length > 100) trailHistory[f.id].shift();
            
            const latlngs = trailHistory[f.id].map(p => [p.lat, p.lon]);
            flightPath.setLatLngs(latlngs);

            // CALCULATE PREDICTION (15 minutes ahead)
            const speedKms = (f.velocity || 250) / 1000; // velocity is in m/s
            const distKm = speedKms * 900; // 15 mins = 900s
            const predictedCoords = calculateProjectedPoint(f.lat, f.lon, f.heading, distKm);
            predictionPath.setLatLngs([[f.lat, f.lon], predictedCoords]);

            // --- SAT-COM LINK VISUALIZATION ---
            // Connect to a mock satellite waypoint in the ocean
            const satCoords = [-10, 150]; // Middle of the Pacific
            satComLink.setLatLngs([[f.lat, f.lon], satCoords]);

            if (isFollow) map.panTo([f.lat, f.lon]);
        }

        // --- BLACKBOX TELEMETRY LOGGING (With Smart Seeding) ---
        if (!telemetryHistory[f.id]) {
            // Seed with 5 historical points to make the graph look 'live' immediately
            telemetryHistory[f.id] = { alt: [], spd: [], time: [] };
            for(let i=5; i>0; i--) {
                const pastTime = new Date(Date.now() - (i * 10000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                telemetryHistory[f.id].alt.push(f.altitude + (Math.random() * 100 - 50));
                telemetryHistory[f.id].spd.push(f.velocity + (Math.random() * 10 - 5));
                telemetryHistory[f.id].time.push(pastTime);
            }
        }
        
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        telemetryHistory[f.id].alt.push(f.altitude);
        telemetryHistory[f.id].spd.push(f.velocity);
        telemetryHistory[f.id].time.push(now);

        if (telemetryHistory[f.id].alt.length > 30) {
            telemetryHistory[f.id].alt.shift();
            telemetryHistory[f.id].spd.shift();
            telemetryHistory[f.id].time.shift();
        }

        // Live Chart Update
            if (isS && telemetryChart) {
                telemetryChart.data.labels = telemetryHistory[f.id].time;
                telemetryChart.data.datasets[0].data = telemetryHistory[f.id].alt;
                telemetryChart.data.datasets[1].data = telemetryHistory[f.id].spd;
                telemetryChart.update('none'); // Update without animation for performance
            }

            // Update Vertical HUD if selected
            if (isS) {
                updateVerticalHUD(f, flights);
            }
        });

    // Cleanup
    Object.keys(markers).forEach(id => {
        if (!activeIds.has(id)) { map.removeLayer(markers[id]); delete markers[id]; }
    });

    // HUD Updates
    const banner = document.getElementById('alert-relay');
    if (hasAlert) {
        banner.classList.remove('hidden');
        document.getElementById('alert-id').innerText = alertCall;
    } else {
        banner.classList.add('hidden');
    }

    // Ensure flights is an array
    if (!flights || !Array.isArray(flights)) flights = [];

    const statCountEl = document.getElementById('stat-count');
    if (statCountEl) {
        statCountEl.innerText = flights.length.toString().padStart(3, '0');
    }

    let tV = 0; let mAlt = 0;
    if (flights.length > 0) {
        flights.forEach(f => { tV += (f.velocity || 0); if (f.altitude > mAlt) mAlt = f.altitude; });
    }
    
    const statSpeedEl = document.getElementById('stat-speed');
    if (statSpeedEl) {
        if (flights.length > 0) {
            statSpeedEl.innerText = sysConfig.units === 'aviation' ? 
                Math.round((tV / flights.length) * 1.94384 || 0) + ' kts' : 
                Math.round((tV / flights.length) * 3.6 || 0) + ' km/h';
        } else {
            statSpeedEl.innerText = sysConfig.units === 'aviation' ? '0 kts' : '0 km/h';
        }
    }

    const statAltEl = document.getElementById('stat-alt');
    if (statAltEl) {
        if (flights.length > 0) {
            statAltEl.innerText = sysConfig.units === 'aviation' ? 
                Math.round(mAlt * 3.28) + ' ft' : 
                Math.round(mAlt) + ' m';
        } else {
            statAltEl.innerText = sysConfig.units === 'aviation' ? '0 ft' : '0 m';
        }
    }

    // Live Map Centre Readout (updates on pan/zoom)
    const centre = map.getCenter();
    const zoom   = map.getZoom();
    const latEl  = document.getElementById('map-lat');
    const lngEl  = document.getElementById('map-lng');
    const zEl    = document.getElementById('map-zoom');
    if (latEl) latEl.innerText = centre.lat.toFixed(2) + '°';
    if (lngEl) lngEl.innerText = centre.lng.toFixed(2) + '°';
    if (zEl)   zEl.innerText  = 'Z' + zoom;

    // --- SYSTEM PULSE UPDATES ---
    const latency = Math.floor(Math.random() * 20) + 30; // Simulated stable latency
    const signal = Math.floor(Math.random() * 5) + 95;   // Simulated signal strength
    const load = Math.min(100, Math.round((flights.length / 300) * 100)); // Load relative to 300 aircraft

    const latPulse = document.getElementById('pulse-latency');
    const sigPulse = document.getElementById('pulse-signal');
    const loadPulse = document.getElementById('pulse-load');

    if (latPulse) {
        latPulse.innerText = latency + 'ms';
        latPulse.style.color = latency > 100 ? '#f43f5e' : '#4ade80';
    }
    if (sigPulse) sigPulse.innerText = signal + '%';
    if (loadPulse) {
        loadPulse.innerText = load + '%';
        loadPulse.style.color = load > 80 ? '#facc15' : '#4ade80';
    }

    // --- GLOBAL THREAT LEVEL (DEFCON) ---
    const threatEl = document.getElementById('stat-threat');
    if (threatEl) {
        const emergencyCount = flights.filter(f => f.squawk === '7700' || f.geofence_violation).length;
        let threat = 'LOW', tColor = 'var(--col-green)';
        if (emergencyCount > 3)      { threat = 'DELTA';   tColor = 'var(--col-red)'; }
        else if (emergencyCount > 1) { threat = 'CHARLIE'; tColor = 'var(--col-amber)'; }
        else if (emergencyCount > 0) { threat = 'BRAVO';   tColor = 'var(--col-amber)'; }
        threatEl.textContent = threat;
        threatEl.style.color = tColor;
    }

    // --- TACTICAL RADAR PERRIPHERAL ---
    const radarPings = document.getElementById('radar-pings');
    if (radarPings && flights.length > 0) {
        radarPings.innerHTML = '';
        const center = map.getCenter();
        const zoom = map.getZoom();
        const scale = Math.pow(2, zoom - 5) * 2;

        // OPTIMIZATION FIX: Limit radar peripheral pings to 30 elements to prevent DOM lagging
        const pingSample = flights.slice(0, 30);

        pingSample.forEach(f => {
            const dx = (f.lon - center.lng) * scale;
            const dy = (center.lat - f.lat) * scale;
            if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
                const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
                const delay = (angle / 360) * 4;
                const p = document.createElement('div');
                p.style.cssText = `position:absolute; left:${65+dx}px; top:${65+dy}px; width:4px; height:4px; background:#4ade80; border-radius:50%; box-shadow:0 0 5px #4ade80; animation: airport-ping 4s infinite linear; animation-delay: -${delay}s; opacity:0; pointer-events:none;`;
                radarPings.appendChild(p);
            }
        });
    }

    // Tarmac Log - Rich Multi-Row Feed
    const log = document.getElementById('tarmac-log');
    
    // OPTIMIZATION FIX: Only re-render the log text periodically or if empty, to reduce reflows
    if (log && flights.length > 0 && (log.innerHTML.includes('INITIATING SCAN') || Math.random() < 0.2)) {
        const statuses = [
            { label: 'DOCKING',  color: '#4ade80' },
            { label: 'BOARDING', color: '#facc15' },
            { label: 'PUSHBACK', color: '#38bdf8' },
            { label: 'TAXIING',  color: '#fb923c' },
            { label: 'AIRBORNE', color: '#a78bfa' },
            { label: 'HOLDING',  color: '#f43f5e' }
        ];
        const gates  = ['A','B','C','D','E'];
        const sample = [...flights].sort(() => Math.random()-0.5).slice(0, 15);
        log.innerHTML = sample.map(f => {
            const st  = statuses[Math.floor(Math.random() * statuses.length)];
            const gate= `${gates[Math.floor(Math.random()*gates.length)]}-${Math.floor(Math.random()*30+1)}`;
            const hex = Math.floor(Math.random()*0xFFFFFF).toString(16).toUpperCase().padStart(6,'0');
            return `<div style="border-bottom:1px solid rgba(255,255,255,0.05); padding:4px 0; line-height:1.6;">
                        <span style="color:#64748b; font-size:0.5rem;">[${gate}]</span>
                        <span style="color:#fff; font-weight:bold; font-size:0.55rem;"> ${f.callsign || 'UNK'}</span>
                        <span style="color:${st.color}; font-size:0.5rem; float:right; font-weight:bold;">${st.label}</span>
                        <br><span style="color:#334155; font-size:0.45rem;">0x${hex} · ${f.country}</span>
                    </div>`;
        }).join('');
    }
}

// --- BIRD MODEL DECODER (Deep Intelligence Variety) ---
function getBirdModel(f) {
    if (!f || !f.id) return "UNKNOWN BIRD";
    
    const id = f.id;
    const callsign = f.callsign || "UNK";
    const hex = parseInt(id, 16);
    
    // Create a unique hash from ID + Callsign to ensure variety
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    for (let i = 0; i < callsign.length; i++) hash = ((hash << 5) - hash) + callsign.charCodeAt(i);
    hash = Math.abs(hash);

    const models = {
        "BOEING":     ["737-800", "777-300ER", "787-9 Dreamliner", "747-8 Intercontinental", "737 MAX 8"],
        "AIRBUS":     ["A320neo", "A350-900", "A380-800", "A330-900", "A321LR"],
        "EMBRAER":    ["E190-E2", "E175", "ERJ-145", "Phenom 300"],
        "BOMBARDIER": ["CRJ-900", "Global 7500", "Challenger 350", "Dash 8-Q400"]
    };

    let mfr = "AIRBUS";
    // Check known blocks first
    if (hex >= 0xA00000 && hex <= 0xAFFFFF) mfr = "BOEING";
    else if (hex >= 0x400000 && hex <= 0x43FFFF) mfr = "BOMBARDIER";
    else if (hex >= 0xE00000 && hex <= 0xEFFFFF) mfr = "EMBRAER";
    else {
        const mfrs = ["BOEING", "AIRBUS", "EMBRAER", "BOMBARDIER"];
        mfr = mfrs[hash % 4];
    }

    const modelList = models[mfr];
    const model = modelList[hash % modelList.length];
    
    return `${mfr} ${model}`;
}

function openFlightDetails(f) {
    selectedId = f.id;
    const panel = document.getElementById('flight-details-panel');
    const content = document.getElementById('details-content');
    if (!panel || !content) return;
    
    const birdModel = getBirdModel(f);
    const altFt = Math.round(f.altitude * 3.28);
    const speedKt = Math.round(f.velocity * 1.94);
    const vRate = f.vertical_rate ? Math.round(Math.abs(f.vertical_rate * 196)) : 0;
    
    // A10 speech disabled for manual flight clicks (mic or threat only)
    
    panel.classList.remove('hidden');

    content.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
            <div style="width: 50px; height: 50px; background: rgba(34, 211, 238, 0.1); border: 1px solid var(--neon-cyan); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">✈️</div>
            <div>
                <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--neon-cyan);">${f.callsign || 'VECTOR-X'}</div>
                <div style="font-size: 0.6rem; color: #94a3b8; letter-spacing: 1px;">SQUAWK: ${f.squawk || '0000'} | ${f.country || 'INTERNATIONAL'}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div class="stat-box" style="display: flex; flex-direction: column;">
                <label style="font-size: 0.5rem; color: var(--col-muted); letter-spacing: 1px;">ALTITUDE</label>
                <span style="font-size: 0.9rem; font-weight: bold; color: var(--col-text);">${Math.round(f.altitude * 3.28)} FT</span>
            </div>
            <div class="stat-box" style="display: flex; flex-direction: column;">
                <label style="font-size: 0.5rem; color: var(--col-muted); letter-spacing: 1px;">AIRSPEED</label>
                <span style="font-size: 0.9rem; font-weight: bold; color: var(--col-text);">${Math.round(f.velocity * 1.94)} KT</span>
            </div>
            <div class="stat-box" style="display: flex; flex-direction: column;">
                <label style="font-size: 0.5rem; color: var(--col-muted); letter-spacing: 1px;">HEADING</label>
                <span style="font-size: 0.9rem; font-weight: bold; color: var(--col-text);">${Math.round(f.heading)}°</span>
            </div>
            <div class="stat-box" style="display: flex; flex-direction: column;">
                <label style="font-size: 0.5rem; color: var(--col-muted); letter-spacing: 1px;">VERTICAL</label>
                <span style="font-size: 0.9rem; font-weight: bold; color: ${f.vertical_rate > 0 ? 'var(--col-green)' : (f.vertical_rate < 0 ? 'var(--col-red)' : 'var(--col-muted)')};">
                    ${f.vertical_rate > 0 ? '↑' : (f.vertical_rate < 0 ? '↓' : '•')} ${vRate} FPM
                </span>
            </div>
        </div>
        
        <div style="margin-bottom: 20px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid var(--glass-border);">
            <div style="font-size: 0.5rem; color: var(--col-muted); letter-spacing: 1px; margin-bottom: 4px;">BIRD INTEL (MODEL)</div>
            <div style="font-size: 0.8rem; font-family: var(--font-display); color: var(--col-cyan); letter-spacing: 1px;">
                ${getBirdModel(f)}
            </div>
            <div style="font-size: 0.5rem; color: var(--col-dim); margin-top: 4px;">ICAO_HEX: ${f.id.toUpperCase()}</div>
        </div>

        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: 8px; padding: 15px;">
            <div style="font-family: var(--font-display); font-size: 0.5rem; color: #64748b; margin-bottom: 10px; letter-spacing: 1px;">BLACKBOX TELEMETRY</div>
            <canvas id="telemetry-chart" style="width: 100%; height: 120px;"></canvas>
        </div>

        <button onclick="toggleFollowMode()" class="tactical-btn" style="width: 100%; padding: 12px; border-color: var(--neon-cyan); color: var(--neon-cyan); margin-top: 20px;">
            ${isFollow ? '🛰️ TERMINATE RADAR LOCK' : '📍 INITIATE MISSION LOCK'}
        </button>
    `;

    setTimeout(() => initTelemetryChart(f.id), 100);
}

function closeDetails() {
    const panel = document.getElementById('flight-details-panel');
    if (panel) panel.classList.add('hidden');
    selectedId = null;
    isFollow = false;
    flightPath.setLatLngs([]);
    predictionPath.setLatLngs([]);
    satComLink.setLatLngs([]);
    if (ringsGroup) ringsGroup.clearLayers();
}

function initTelemetryChart(id) {
    const ctx = document.getElementById('telemetry-chart');
    if (!ctx) return;
    
    if (telemetryChart) telemetryChart.destroy();
    
    const history = telemetryHistory[id] || { alt: [], spd: [], time: [] };

    telemetryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.time,
            datasets: [
                {
                    label: 'ALT',
                    data: history.alt,
                    borderColor: '#facc15',
                    backgroundColor: 'rgba(250, 204, 21, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'SPD',
                    data: history.spd,
                    borderColor: '#22d3ee',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.4,
                    yAxisID: 'y1',
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            elements: { point: { radius: 0 } },
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { 
                    display: true, 
                    position: 'left',
                    min: 0,
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: { color: '#64748b', font: { size: 7 }, maxTicksLimit: 3 }
                },
                y1: { 
                    display: true, 
                    position: 'right',
                    min: 0,
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 7 }, maxTicksLimit: 3 }
                }
            }
        }
    });
}

function openAirportIntel(a) {
    const dock = document.getElementById('data-dock');
    if (!dock) return;
    dock.style.display = 'block';

    // CALCULATE LIVE PROXIMITY TRAFFIC
    let trafficCount = 0;
    const radiusKm = 100; // Track planes within 100km of the airport
    
    Object.values(markers).forEach(m => {
        const f = m._data;
        if (f) {
            const dist = getDistance(a.lat, a.lon, f.lat, f.lon);
            if (dist < radiusKm) trafficCount++;
        }
    });

    // Calculate a dynamic congestion score (0-100%)
    const congestion = Math.min(100, Math.round((trafficCount / 20) * 100));
    const statusColor = congestion > 80 ? '#f43f5e' : (congestion > 50 ? '#facc15' : '#4ade80');

    dock.innerHTML = `
        <div style="animation: slideIn 0.3s ease-out; position: relative;">
            <button onclick="closeDetails()" style="position:absolute; top:-10px; right:-10px; background:#f43f5e; border:none; color:white; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold;">×</button>
            <h3 style="color:#22d3ee; margin-bottom:15px; font-family:'Orbitron'; font-size:0.9rem; letter-spacing:1px;">AIRPORT INTEL</h3>
            
            <div style="background:rgba(34,211,238,0.05); border:1px solid rgba(34,211,238,0.2); padding:12px; border-radius:8px; margin-bottom:15px;">
                <div style="color:#94a3b8; font-size:0.5rem; text-transform:uppercase;">Station / Node</div>
                <div style="color:#fff; font-weight:bold; font-size:0.85rem;">${a.name} INTERNATIONAL</div>
                <div style="color:${statusColor}; font-family:'Roboto Mono'; font-size:0.65rem; margin-top:2px;">CONGESTION: ${congestion}% [${trafficCount} ACTIVE VECTORS]</div>
            </div>

            <div style="display:grid; gap:10px;">
                ${a.terminals.map(t => {
                    const terminalLoad = Math.max(10, Math.min(95, congestion + (Math.random() * 10 - 5)));
                    return `<div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; border-left:4px solid ${statusColor};">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div style="font-size:0.7rem; font-weight:bold; color:#fff;">TERMINAL ${t}</div>
                                    <div style="font-size:0.55rem; color:${statusColor}; font-weight:bold;">${Math.round(terminalLoad)}%</div>
                                </div>
                                <div style="width:100%; height:3px; background:rgba(255,255,255,0.05); border-radius:2px; margin-top:6px; overflow:hidden;">
                                    <div style="width:${terminalLoad}%; height:100%; background:${statusColor}; box-shadow:0 0 5px ${statusColor};"></div>
                                </div>
                            </div>`;
                }).join('')}
            </div>

            <div style="margin-top:15px; background:rgba(15, 23, 42, 0.8); border:1px dashed rgba(34,211,238,0.2); padding:10px; border-radius:8px;">
                <div style="color:#64748b; font-size:0.5rem; text-transform:uppercase; margin-bottom:5px;">Tactical Advisory</div>
                <div style="color:#cbd5e1; font-size:0.6rem; line-height:1.4;">
                    ${congestion > 70 ? 'CRITICAL TRAFFIC VOLUME. DELAYS EXPECTED FOR ALL OUTBOUND VECTORS.' : 'NOMINAL AIRSPACE FLOW. ALL TERMINALS OPERATING AT OPTIMAL CAPACITY.'}
                </div>
            </div>
        </div>
    `;
}

/**
 * Helper: Haversine Distance (Simplified for local flat-grid performance)
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function closeDetails() {
    selectedId = null;
    isFollow = false;
    if (telemetryChart) { telemetryChart.destroy(); telemetryChart = null; }
    if (flightPath) flightPath.setLatLngs([]);
    if (predictionPath) predictionPath.setLatLngs([]);
    const dock = document.getElementById('data-dock');
    if (dock) dock.style.display = 'none';
}
function toggleFollowMode() { 
    isFollow = !isFollow; 
    document.getElementById('follow-trigger').innerText = isFollow ? '🛰️ TERMINATE LOCK' : '📍 RADAR LOCK'; 
    logMissionEvent(isFollow ? "RADAR LOCK INITIATED" : "RADAR LOCK TERMINATED", isFollow ? "SUCCESS" : "INFO");
}
function jumpTo(lat, lng) { 
    if (map) {
        map.flyTo([lat, lng], 8, { duration: 2 });
        logMissionEvent(`MISSION JUMP: [${lat}, ${lng}]`, "INFO");
    }
}

let weatherLayers = [];
function toggleWeather() { 
    const weatherHud = document.getElementById('weather-hud');
    if (weatherLayers.length > 0) {
        weatherLayers.forEach(l => map.removeLayer(l));
        weatherLayers = [];
        if (weatherHud) weatherHud.classList.add('hidden');
        logMissionEvent("WEATHER RADAR: OFFLINE", "INFO");
        return;
    }

    logMissionEvent("WEATHER RADAR: SCANNING...", "INFO");
    if (weatherHud) weatherHud.classList.remove('hidden');
    
    // Create complex storm cells with multiple intensity layers
    const bounds = map.getBounds();
    const stormCount = 4 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < stormCount; i++) {
        const lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
        const lon = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
        const baseRadius = Math.random() * 40000 + 30000;
        
        // Layer 1: Outer advisory (Large, very faint)
        const outer = L.circle([lat, lon], {
            radius: baseRadius,
            color: '#fb923c',
            fillColor: '#fb923c',
            fillOpacity: 0.05,
            weight: 1,
            dashArray: '10, 10'
        }).addTo(map);
        
        // Layer 2: Precipitation core (Medium, orange)
        const core = L.circle([lat, lon], {
            radius: baseRadius * 0.6,
            color: '#f97316',
            fillColor: '#f97316',
            fillOpacity: 0.15,
            weight: 0
        }).addTo(map);
        
        // Layer 3: Severe cell (Small, red)
        const severe = L.circle([lat, lon], {
            radius: baseRadius * 0.2,
            color: '#f43f5e',
            fillColor: '#f43f5e',
            fillOpacity: 0.3,
            weight: 0
        }).addTo(map);
        
        weatherLayers.push(outer, core, severe);
    }
    
    const disruption = 15 + Math.floor(Math.random() * 60);
    const indexEl = document.getElementById('weather-index');
    if (indexEl) {
        indexEl.innerText = disruption + '%';
        indexEl.style.color = disruption > 50 ? '#f43f5e' : (disruption > 25 ? '#fb923c' : '#4ade80');
    }
    
    logMissionEvent(`STORM CELLS DETECTED - IMPACT SCORE: ${disruption}%`, disruption > 50 ? "CRITICAL" : "WARNING");
    
    if (disruption > 50) {
        announceEmergency(`Tactical Advisory. Severe weather disruption detected in active airspace. Global impact score ${disruption} percent.`);
    }
}

function processCommand(cmd) {
    logMissionEvent(`${cmd}`, "COMMAND");
    
    // Normalize command
    cmd = cmd.toUpperCase().trim();

    if (cmd.startsWith('SEARCH ')) {
        const q = cmd.replace('SEARCH ', '').toLowerCase();
        document.getElementById('search-bar').value = q;
        document.getElementById('search-bar').dispatchEvent(new Event('input'));
    } else if (cmd === 'CLEAR' || cmd === 'CANCEL' || cmd === 'CANCEL LOCK' || cmd === 'CLOSE') {
        if (activeGeofenceCircle) map.removeLayer(activeGeofenceCircle);
        closeDetails();
        A10.speak("Tactical overlays and target lock cleared.");
    } else if (cmd === 'CLEAR LOG') {
        const logEl = document.getElementById('mission-log');
        if (logEl) logEl.innerHTML = '> LOG WIPED';
        logMissionEvent("MISSION LOG REINITIALIZED", "SUCCESS");
    } else if (cmd === 'WEATHER' || cmd === 'WEATHER REPORT') {
        toggleWeather();
        setTimeout(() => {
            const indexEl = document.getElementById('weather-index');
            const index = indexEl ? indexEl.innerText : 'unknown';
            A10.speak(`Tactical weather scan complete. Airspace disruption score is ${index}.`);
        }, 800);
    } else if (cmd === 'FOLLOW') {
        toggleFollowMode();
    } else if (cmd.startsWith('THEME ')) {
        const t = cmd.replace('THEME ', '').toLowerCase();
        if (t === 'sat' || t === 'satellite') {
            switchTheme('sat');
            A10.speak("Switching to satellite imagery.");
        } else if (t === 'dark' || t === 'stealth') {
            switchTheme('dark');
            A10.speak("Switching to dark tactical vector theme.");
        } else if (t === 'light') {
            toggleAppTheme();
        }
    } else if (cmd.startsWith('JUMP ')) {
        const city = cmd.replace('JUMP ', '').toUpperCase();
        const locations = {
            'INDIA': [20.59, 78.96],
            'MIDDLE EAST': [25.20, 55.27],
            'USA': [37.09, -95.71],
            'RUSSIA': [55.75, 37.62],
            'DELHI': [28.61, 77.23],
            'MUMBAI': [19.08, 72.86],
            'CHENNAI': [13.08, 80.27],
            'BANGALORE': [12.97, 77.59],
            'LONDON': [51.50, -0.12],
            'NEW YORK': [40.71, -74.00],
            'DUBAI': [25.20, 55.27],
            'SINGAPORE': [1.35, 103.81]
        };
        if (locations[city]) {
            jumpTo(locations[city][0], locations[city][1]);
            A10.speak(`Jumping tactical view to ${city}.`);
        } else {
            logMissionEvent(`SECTOR ${city} NOT FOUND`, "WARNING");
            A10.speak(`Sector ${city} not found.`);
        }
    } else if (cmd === 'GEOFENCE') {
        logMissionEvent("RIGHT-CLICK MAP TO DEPLOY GEOFENCE", "INFO");
    } else if (cmd === 'STATS' || cmd === 'STATUS' || cmd === 'REPORT') {
        const count = Object.keys(markers).length;
        const emergencies = Object.values(markers).filter(m => m._data && m._data.squawk === '7700').length;
        logMissionEvent(`AIRSPACE STATUS: ${count} ACTIVE | EMERGENCIES: ${emergencies}`, "SUCCESS");
        A10.speak(`System status nominal. Tracking ${count} active aircraft in current sector.`);
    } else if (cmd === 'SIM' || cmd === 'START DRILL' || cmd === 'INITIATE DRILL' || cmd === 'DRILL') {
        A10.speak("Initiating simulated emergency drill.");
        setTimeout(() => simulateIncursion('7700'), 1500);
    } else if (cmd.startsWith('SEARCH SHIP ')) {
        const q = cmd.replace('SEARCH SHIP ', '').toUpperCase();
        const ship = Object.values(ships).find(s => s.id.includes(q));
        if (ship) {
            openVesselIntel(ship.id);
            map.flyTo([ship.lat, ship.lon], 7);
            logMissionEvent(`MARITIME VECTOR LOCKED: ${ship.id}`, "SUCCESS");
        } else {
            logMissionEvent(`VESSEL ${q} NOT IN RANGE`, "WARNING");
        }
    } else if (cmd.startsWith('SECTOR ALERT ')) {
        const sector = cmd.replace('SECTOR ALERT ', '').toUpperCase();
        logMissionEvent(`BROADCASTING TACTICAL ALERT TO ${sector}`, "CRITICAL");
        announceEmergency(`Tactical Alert. Sector ${sector} is now under restricted flight protocols. All non essential vectors must vacate.`);
    } else if (cmd === 'ZOOM IN' || cmd === 'ENLARGE') {
        map.zoomIn();
        A10.speak("Zooming in on active sector.");
    } else if (cmd === 'ZOOM OUT' || cmd === 'WIDEN') {
        map.zoomOut();
        A10.speak("Widening tactical view.");
    } else if (cmd === 'BOGEY IDENTIFIED' || cmd === 'BOGEY') {
        A10.speak("Radar lock confirmed. Interrogating transponder sequence. Vector tracking active.");
    } else if (cmd === 'ANY THREAT' || cmd === 'THREAT') {
        const threats = Object.values(markers).filter(m => m._data && (m._data.squawk === '7700' || m._data.geofence_violation));
        if (threats.length > 0) {
            const t = threats[0]._data;
            const model = getBirdModel(t);
            A10.speak(`Identified the bogey. Flight ${t.callsign}, ${model}.`);
        } else {
            // Do not speak anything when there are no threats per user request ('rest dont')
            logMissionEvent("SCAN COMPLETE: NO THREATS DETECTED", "INFO");
        }
    } else if (cmd === 'LOCK FASTEST' || cmd === 'FASTEST BOGEY') {
        const flights = Object.values(markers).map(m => m._data).filter(f => f && f.velocity);
        if (flights.length > 0) {
            flights.sort((a, b) => b.velocity - a.velocity);
            const target = flights[0];
            openFlightDetails(target);
            map.flyTo([target.lat, target.lon], 7);
            const birdModel = getBirdModel(target);
            A10.speak(`Locking fastest target. Flight ${target.callsign}, ${birdModel}. Speed is ${Math.round(target.velocity * 1.94)} knots.`);
        } else {
            A10.speak("No active vectors with velocity telemetry found.");
        }
    } else if (cmd === 'LOCK HIGHEST' || cmd === 'HIGHEST BOGEY') {
        const flights = Object.values(markers).map(m => m._data).filter(f => f && f.altitude);
        if (flights.length > 0) {
            flights.sort((a, b) => b.altitude - a.altitude);
            const target = flights[0];
            openFlightDetails(target);
            map.flyTo([target.lat, target.lon], 7);
            const birdModel = getBirdModel(target);
            A10.speak(`Locking highest target. Flight ${target.callsign}, ${birdModel}. Altitude is ${Math.round(target.altitude * 3.28)} feet.`);
        } else {
            A10.speak("No active vectors with altitude telemetry found.");
        }
    } else if (cmd === 'IDENTIFY YOURSELF' || cmd === 'WHO ARE YOU') {
        A10.speak("I am A-10. The tactical artificial intelligence core integrated into the FOXBAT SENTINEL platform. I am reporting for active duty. My systems are optimized for real-time intelligence gathering and flight tracking telemetry.");
    } else if (cmd === 'HEY A10' || ((cmd.includes('HEY') || cmd.includes('HI') || cmd.includes('HELLO')) && (cmd.includes('A10') || cmd.includes('A-10') || cmd.includes('A 10')))) {
        A10.speak("I am A-10.");
    } else if (cmd === 'HELLO' || cmd === 'A10' || cmd === 'A-10') {
        A10.speak("Standing by for tasking.");
    } else if (cmd === 'HELP') {
        logMissionEvent("CMD LIST: SEARCH [ID] | JUMP [CITY] | THEME [DARK/SAT] | FOLLOW | WEATHER | STATS | SIM | ZOOM IN | ZOOM OUT | LOCK FASTEST | LOCK HIGHEST | CANCEL LOCK | ANY THREAT | BOGEY IDENTIFIED", "INFO");
    } else if (cmd === 'TEST VOICE') {
        announceEmergency("System Check. Tactical AI Voice Uplink is operational and secure.");
        logMissionEvent("VOICE SYNTHESIS TEST INITIATED", "SUCCESS");
    } else {
        logMissionEvent(`INVALID COMMAND: ${cmd}. TYPE HELP.`, "WARNING");
    }
}

function simulateIncursion(type = 'GEOFENCE') {
    logMissionEvent(`INITIATING TACTICAL SIMULATION [${type}]...`, "WARNING");
    document.getElementById('sim-banner').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('hidden');
    
    // Pick a random flight to "hijack" for simulation
    const flightIds = Object.keys(markers);
    if (flightIds.length === 0) {
        logMissionEvent("SIMULATION FAILED: NO ACTIVE VECTORS", "CRITICAL");
        return;
    }
    
    const targetId = flightIds[Math.floor(Math.random() * flightIds.length)];
    const flight = markers[targetId]._data;
    
    // Reset flight first
    flight.geofence_violation = false;
    flight.squawk = "0000";
    
    if (type === 'GEOFENCE') {
        flight.geofence_violation = true;
        flight.callsign = "SIM-INTRUDER";
        logMissionEvent(`SIMULATED INCURSION DETECTED: ${flight.callsign}`, "CRITICAL");
        announceEmergency(`Identified the bogey. Simulated Tactical Alert. Airspace incursion detected by ${flight.callsign}. This is a training exercise.`);
    } else if (type === '7700') {
        flight.squawk = "7700";
        logMissionEvent(`SIMULATED EMERGENCY DETECTED: ${flight.callsign}`, "CRITICAL");
        announceEmergency(`Identified the bogey. Warning. Simulated Emergency Squawk 7 7 0 0 detected for flight ${flight.callsign}. This is a training exercise.`);
    } else if (type === '7500') {
        flight.squawk = "7500";
        logMissionEvent(`SIMULATED HIJACK ALERT: ${flight.callsign}`, "CRITICAL");
        announceEmergency(`Identified the bogey. Critical Security Breach. Simulated Code 7 5 0 0 detected for flight ${flight.callsign}. Immediate intercept required. This is a training exercise.`);
    } else if (type === '7600') {
        flight.squawk = "7600";
        logMissionEvent(`SIMULATED COMMS FAILURE: ${flight.callsign}`, "WARNING");
        announceEmergency(`Identified the bogey. Tactical Advisory. Simulated radio failure Code 7 6 0 0 detected for flight ${flight.callsign}. Monitor vector closely.`);
    }
    
    // Highlight the flight
    openFlightDetails(flight);
    map.flyTo([flight.lat, flight.lon], 7);
}

function endSimulation() {
    document.getElementById('sim-banner').classList.add('hidden');
    logMissionEvent("TACTICAL SIMULATION TERMINATED", "SUCCESS");
    
    // Reset all mock data by clearing markers (they will re-populate next cycle)
    Object.keys(markers).forEach(id => {
        markers[id]._data.geofence_violation = false;
        markers[id]._data.squawk = "0000";
    });
    
    closeDetails();
}
function switchTheme(type) { if (!map) return; if (type === 'sat') { map.removeLayer(darkTheme); map.removeLayer(lightThemeMap); satelliteTheme.addTo(map); } else { map.removeLayer(satelliteTheme); if(isLightMode) lightThemeMap.addTo(map); else darkTheme.addTo(map); } }

function applySettings() {
    const elUnits = document.getElementById('cfg-units');
    const elAtc = document.getElementById('cfg-atc');
    const elAnim = document.getElementById('cfg-anim');
    const elVoice = document.getElementById('cfg-voice');
    const elMask = document.getElementById('cfg-mask');
    const elSpoof = document.getElementById('cfg-spoof');

    if(elUnits) sysConfig.units = elUnits.value;
    if(elAtc) sysConfig.showATC = elAtc.checked;
    if(elAnim) sysConfig.anim = elAnim.checked;
    if(elVoice) sysConfig.voiceEnabled = elVoice.checked;
    if(elMask) sysConfig.maskVIP = elMask.checked;
    if(elSpoof) sysConfig.antiSpoof = elSpoof.checked;

    atcGhostLines.forEach(l => {
        if (sysConfig.showATC) map.addLayer(l);
        else map.removeLayer(l);
    });

    const scan = document.querySelector('.radar-scan');
    if (scan) scan.style.animationPlayState = sysConfig.anim ? 'running' : 'paused';
    const pings = document.getElementById('radar-pings');
    if (pings) pings.style.display = sysConfig.anim ? 'block' : 'none';
}

function toggleAppTheme() {
    isLightMode = !isLightMode;
    document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    if (map) {
        if (isLightMode) {
            map.removeLayer(darkTheme);
            map.removeLayer(satelliteTheme);
            lightThemeMap.addTo(map);
        } else {
            map.removeLayer(lightThemeMap);
            map.removeLayer(satelliteTheme);
            darkTheme.addTo(map);
        }
    }
}

function updateTerminator() {
    const l = []; const n = new Date();
    const d = -23.44 * Math.cos((360 / 365) * (n.getUTCDate() + 10) * (Math.PI / 180));
    for (let i = -180; i <= 180; i += 2) {
        let a = Math.atan(-Math.cos((i + (n.getUTCHours() * 15) + (n.getUTCMinutes() / 4)) * (Math.PI / 180)) / Math.tan(d * (Math.PI / 180))) * (180 / Math.PI);
        l.push([a, i]);
    }
    if (nightShadow) nightShadow.setLatLngs(d > 0 ? [...l, [90, 180], [90, -180]] : [...l, [-90, 180], [-90, -180]]);
}

/**
 * Helper: Project point based on heading and distance
 */
function calculateProjectedPoint(lat, lon, heading, distKm) {
    const R = 6371;
    const brng = heading * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distKm / R) +
                 Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distKm / R) * Math.cos(lat1),
                 Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2));

    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

/**
 * Tactical AI Voice Synthesis
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function closeDetails() {
    selectedId = null;
    isFollow = false;
    const dock = document.getElementById('data-dock');
    if (dock) dock.style.display = 'none';
    if (flightPath) flightPath.setLatLngs([]);
    if (predictionPath) predictionPath.setLatLngs([]);
    if (satComLink) satComLink.setLatLngs([]);
    const vHud = document.getElementById('vertical-hud-container');
    if (vHud) vHud.classList.add('hidden');
}

function toggleFollowMode() {
    isFollow = !isFollow;
    const btn = document.getElementById('follow-trigger');
    if (btn) btn.innerText = isFollow ? '🛰️ TERMINATE MISSION LOCK' : '📍 INITIATE RADAR LOCK';
    logMissionEvent(isFollow ? "RADAR LOCK INITIATED" : "RADAR LOCK TERMINATED", isFollow ? "SUCCESS" : "INFO");
}

function openAirportIntel(airport) {
    selectedId = airport.name;
    const dock = document.getElementById('data-dock');
    if (!dock) return;
    dock.style.display = 'block';
    
    // Procedural Terminal Data
    const loads = airport.terminals.map(() => Math.floor(Math.random() * 60) + 20);
    
    dock.innerHTML = `
        <div style="animation: slideIn 0.3s ease-out; position: relative;">
            <button onclick="closeDetails()" style="position:absolute; top:-10px; right:-10px; background:#f43f5e; border:none; color:white; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold;">×</button>
            <h3 style="color:#22d3ee; font-size:0.9rem; margin-bottom:15px; font-family:'Orbitron'; letter-spacing:1px;">AIRPORT HUB INTEL</h3>
            <div style="background:rgba(34,211,238,0.05); border:1px solid rgba(34,211,238,0.2); padding:12px; border-radius:8px; margin-bottom:15px;">
                <div style="color:#94a3b8; font-size:0.5rem; text-transform:uppercase;">Hub Name</div>
                <div style="color:#fff; font-weight:bold; font-size:0.85rem;">${airport.name} INTL AIRPORT</div>
            </div>
            <div style="color:#94a3b8; font-size:0.5rem; margin-bottom:10px; text-transform:uppercase;">Terminal Occupancy</div>
            ${airport.terminals.map((t, i) => `
                <div style="margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.55rem; margin-bottom:2px;">
                        <span style="color:#fff;">${t}</span>
                        <span style="color:${loads[i] > 70 ? '#f43f5e' : '#4ade80'};">${loads[i]}% LOAD</span>
                    </div>
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.05); border-radius:2px;">
                        <div style="width:${loads[i]}%; height:100%; background:${loads[i] > 70 ? '#f43f5e' : '#22d3ee'}; border-radius:2px;"></div>
                    </div>
                </div>
            `).join('')}
            <div style="margin-top:15px; background:rgba(34,211,238,0.1); border:1px dashed #22d3ee; padding:10px; border-radius:6px; color:#22d3ee; font-size:0.55rem; text-align:center;">
                TACTICAL SECTOR STATUS: CLEAR
            </div>
        </div>
    `;
}

function announceEmergency(text) {
    if (!voiceSynthesis || !sysConfig.voiceEnabled) return;
    
    // Stop any current speech
    voiceSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.75; 
    utterance.rate = 0.95;
    utterance.volume = 1.0;

    const speakNow = () => {
        const preferredVoice = getTacticalVoice();
        if (preferredVoice) utterance.voice = preferredVoice;
        voiceSynthesis.speak(utterance);
    };

    if (voiceSynthesis.getVoices().length === 0) {
        voiceSynthesis.onvoiceschanged = speakNow;
    } else {
        speakNow();
    }
}


/**
 * MISSION LOG SYSTEM
 */
function logMissionEvent(msg, level = "INFO") {
    const logEl = document.getElementById('mission-log');
    if (!logEl) return;

    const time = new Date().toLocaleTimeString([], { hour12: false });
    
    let color = "#94a3b8"; // INFO
    let prefix = "●";
    
    if (level === "CRITICAL") { color = "#f43f5e"; prefix = "☣"; }
    else if (level === "WARNING") { color = "#facc15"; prefix = "⚠️"; }
    else if (level === "SUCCESS") { color = "#4ade80"; prefix = "✔"; }
    else if (level === "COMMAND") { color = "#22d3ee"; prefix = ">"; }
    
    const entry = document.createElement('div');
    entry.style.cssText = `
        border-bottom: 1px solid rgba(255,255,255,0.02); 
        padding: 6px 0; 
        color: ${color};
        animation: slideInLeft 0.3s ease-out;
        display: flex;
        gap: 8px;
        align-items: flex-start;
    `;
    
    entry.innerHTML = `
        <span style="font-size: 0.5rem; opacity: 0.4; font-family: 'Roboto Mono';">${time}</span>
        <span style="font-size: 0.6rem; font-weight: 900;">${prefix}</span>
        <span style="flex: 1; line-height: 1.2;">${msg}</span>
    `;
    
    logEl.prepend(entry);
    
    // Limit to last 100 events
    if (logEl.childNodes.length > 100) {
        logEl.removeChild(logEl.lastChild);
    }
}

/**
 * VERTICAL SEPARATION HUD LOGIC
 */
function updateVerticalHUD(selectedFlight, allFlights) {
    const container = document.getElementById('vertical-hud-container');
    const profile = document.getElementById('vertical-profile');
    const coordEl = document.getElementById('hud-live-coords');
    if (!container || !profile) return;

    if (coordEl) coordEl.innerText = `${selectedFlight.lat.toFixed(4)} , ${selectedFlight.lon.toFixed(4)}`;

    container.classList.remove('hidden');
    profile.innerHTML = '';

    // Add Altitude Axis Labels
    const labels = [0, 10000, 20000, 30000, 40000];
    labels.forEach(alt => {
        const l = document.createElement('div');
        l.style.cssText = `
            position: absolute;
            bottom: ${(alt / 45000) * 100}%;
            left: -35px;
            font-size: 0.4rem;
            color: rgba(255,255,255,0.3);
            font-family: 'Roboto Mono', monospace;
        `;
        l.innerText = alt / 1000 + 'K';
        profile.appendChild(l);
    });

    // Find nearby flights (within 100km)
    const nearby = allFlights.filter(f => {
        if (f.id === selectedFlight.id) return false;
        const dist = getDistance(selectedFlight.lat, selectedFlight.lon, f.lat, f.lon);
        return dist < 100;
    }).slice(0, 15);

    // Scale constants
    const maxAlt = 45000 / 3.28; // ~13700m
    const maxDist = 100; // km

    // Helper to create a node
    const createNode = (f, isSelected) => {
        const altPercent = Math.min(100, (f.altitude / maxAlt) * 100);
        
        // Horizontal position based on relative longitude (simple projection)
        let leftPercent = 50;
        if (!isSelected) {
            const dist = getDistance(selectedFlight.lat, selectedFlight.lon, f.lat, f.lon);
            const bearing = Math.atan2(f.lon - selectedFlight.lon, f.lat - selectedFlight.lat);
            leftPercent = 50 + (Math.sin(bearing) * (dist / maxDist) * 45);
        }

        const node = document.createElement('div');
        node.className = 'vertical-node';
        
        // --- TCAS ALERT LOGIC ---
        const vertDiff = Math.abs(f.altitude - selectedFlight.altitude);
        const horizDist = getDistance(selectedFlight.lat, selectedFlight.lon, f.lat, f.lon);
        const isTrafficConflict = vertDiff < 300 && horizDist < 10; // 300m (~1000ft) and 10km

        const color = isTrafficConflict ? '#f43f5e' : (isSelected ? '#22d3ee' : '#facc15');
        
        node.style.cssText = `
            position: absolute;
            bottom: ${altPercent}%;
            left: ${leftPercent}%;
            width: ${isSelected ? '10px' : '6px'};
            height: ${isSelected ? '10px' : '6px'};
            background: ${color};
            border-radius: 50%;
            box-shadow: 0 0 10px ${color};
            z-index: ${isSelected ? 10 : 5};
            cursor: pointer;
        `;
        
        if (!isSelected) {
            node.onclick = () => openFlightDetails(f);
        }

        const label = document.createElement('span');
        label.className = 'node-label';
        label.style.cssText = `
            position: absolute;
            top: -15px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.45rem;
            color: ${isSelected ? '#fff' : '#94a3b8'};
            font-weight: ${isSelected ? 'bold' : 'normal'};
            white-space: nowrap;
            pointer-events: none;
            font-family: 'Roboto Mono', monospace;
        `;
        label.innerText = f.callsign;
        node.appendChild(label);
        
        profile.appendChild(node);
        
        // TCAS WARNING VISUAL
        if (isTrafficConflict) {
            node.style.animation = 'emergency-pulse 0.4s infinite alternate';
            if (isSelected) {
                logMissionEvent(`TCAS ALERT: TRAFFIC NEARBY - ${f.callsign}`, "CRITICAL");
            }
        }

        // Add a safety buffer line for the selected flight
        if (isSelected) {
            const line = document.createElement('div');
            line.style.cssText = `
                position: absolute;
                bottom: ${altPercent}%;
                left: 0;
                width: 100%;
                height: 1px;
                background: rgba(34, 211, 238, 0.1);
                border-top: 1px dashed rgba(34, 211, 238, 0.3);
                pointer-events: none;
            `;
            profile.appendChild(line);
        }
    };

    createNode(selectedFlight, true);
    nearby.forEach(f => createNode(f, false));
}


/**
 * TACTICAL AIRSPACE GRID
 */
function renderTacticalGrid() {
    const gridStyle = { color: 'rgba(34, 211, 238, 0.05)', weight: 1, interactive: false };
    // Longitude lines
    for (let lon = -180; lon <= 180; lon += 10) {
        L.polyline([[ -90, lon], [90, lon]], gridStyle).addTo(map);
    }
    // Latitude lines
    for (let lat = -90; lat <= 90; lat += 10) {
        L.polyline([[lat, -180], [lat, 180]], gridStyle).addTo(map);
    }
}


setInterval(updateTerminator, 60000);
updateTerminator();


