// --- DATA SCIENCE ENGINE (Chart.js Integration) ---
// Wrapped in DOMContentLoaded to guarantee Chart.js + DOM are ready before execution
document.addEventListener('DOMContentLoaded', function () {

let trafficChart = null;
let countryChart = null;
let altitudeChart = null;
let speedChart = null;

function initCharts(historicalData, liveFlights) {
    // 1. Traffic Timeline
    const ctxTraffic = document.getElementById('chart-traffic');
    if (ctxTraffic && !trafficChart) {
        trafficChart = new Chart(ctxTraffic, {
            type: 'line',
            data: {
                labels: historicalData.map(d => d.time),
                datasets: [{
                    label: 'Global Active Flights',
                    data: historicalData.map(d => d.total_flights),
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
    }

    // 2. Country Pie
    const ctxCountry = document.getElementById('chart-country');
    if (ctxCountry && !countryChart && liveFlights.length > 0) {
        const countryCounts = {};
        liveFlights.forEach(f => countryCounts[f.country] = (countryCounts[f.country] || 0) + 1);
        const topCountries = Object.entries(countryCounts).sort((a,b)=>b[1]-a[1]).slice(0, 5);
        
        countryChart = new Chart(ctxCountry, {
            type: 'doughnut',
            data: {
                labels: topCountries.map(c => c[0]),
                datasets: [{
                    data: topCountries.map(c => c[1]),
                    backgroundColor: ['#38bdf8', '#4ade80', '#facc15', '#f43f5e', '#a78bfa'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#64748b', font: { size: 10 } } } } }
        });
    }

    // 3. Altitude Bar
    const ctxAlt = document.getElementById('chart-altitude');
    if (ctxAlt && !altitudeChart && liveFlights.length > 0) {
        const bins = [0, 0, 0, 0, 0]; // 0-2k, 2-5k, 5-10k, 10-12k, 12k+
        liveFlights.forEach(f => {
            if (f.altitude < 2000) bins[0]++;
            else if (f.altitude < 5000) bins[1]++;
            else if (f.altitude < 10000) bins[2]++;
            else if (f.altitude < 12000) bins[3]++;
            else bins[4]++;
        });
        
        altitudeChart = new Chart(ctxAlt, {
            type: 'bar',
            data: {
                labels: ['<2km', '2-5km', '5-10km', '10-12km', '>12km'],
                datasets: [{
                    label: 'Count',
                    data: bins,
                    backgroundColor: 'rgba(34, 211, 238, 0.4)',
                    borderColor: '#22d3ee',
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#64748b' } } } }
        });
    }

    // 4. Speed Distribution — Bar Histogram
    const ctxSpeed = document.getElementById('chart-speed');
    if (ctxSpeed && !speedChart && liveFlights.length > 0) {
        const speedBins = getSpeedBins(liveFlights);
        speedChart = new Chart(ctxSpeed, {
            type: 'bar',
            data: {
                labels: ['<200', '200-400', '400-600', '600-800', '>800'],
                datasets: [{
                    label: 'Flights (km/h)',
                    data: speedBins,
                    backgroundColor: ['#38bdf8','#4ade80','#facc15','#f43f5e','#a78bfa'],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } }
                }
            }
        });
    }
}

function getSpeedBins(flights) {
    const bins = [0, 0, 0, 0, 0];
    flights.forEach(f => {
        // velocity may be m/s (OpenSky) or already km/h (simulated)
        // simulated sends 150-900 range directly as km/h-like values
        const v = f.velocity > 10 ? f.velocity : f.velocity * 3.6;
        if (v < 200) bins[0]++;
        else if (v < 400) bins[1]++;
        else if (v < 600) bins[2]++;
        else if (v < 800) bins[3]++;
        else bins[4]++;
    });
    return bins;
}

function updateCharts(historicalData, liveFlights) {
    if (!trafficChart) {
        initCharts(historicalData, liveFlights);
        return;
    }

    // Update Traffic Timeline
    trafficChart.data.labels = historicalData.map(d => d.time);
    trafficChart.data.datasets[0].data = historicalData.map(d => d.total_flights);
    trafficChart.update('none');

    // Update Country — destroy & recreate so labels refresh
    if (liveFlights.length > 0) {
        const countryCounts = {};
        liveFlights.forEach(f => countryCounts[f.country || 'Unknown'] = (countryCounts[f.country || 'Unknown'] || 0) + 1);
        const topCountries = Object.entries(countryCounts).sort((a,b)=>b[1]-a[1]).slice(0, 7);
        if (countryChart) {
            countryChart.data.labels = topCountries.map(c => c[0]);
            countryChart.data.datasets[0].data = topCountries.map(c => c[1]);
            countryChart.update();
        }

        // Update Altitude Histogram
        const altBins = [0,0,0,0,0];
        liveFlights.forEach(f => {
            const alt = f.altitude || 0;
            if (alt < 2000) altBins[0]++;
            else if (alt < 5000) altBins[1]++;
            else if (alt < 10000) altBins[2]++;
            else if (alt < 12000) altBins[3]++;
            else altBins[4]++;
        });
        if (altitudeChart) { altitudeChart.data.datasets[0].data = altBins; altitudeChart.update('none'); }

        // Update Speed Histogram
        const speedBins = getSpeedBins(liveFlights);
        if (speedChart) { speedChart.data.datasets[0].data = speedBins; speedChart.update('none'); }
    }
}

// Fetch data from our new API endpoint and build the Intelligence Boards
async function fetchAnalytics() {
    try {
        // Fetch Live Data
        const res = await fetch('/api/hub/flights');
        const flightsRaw = await res.json();
        const flights = flightsRaw.data || flightsRaw;
        
        // Fetch Historical Stats
        const statsRes = await fetch('/api/analytics/stats');
        const statsJSON = await statsRes.json();
        const historicalData = statsJSON.metrics || [];
        
        if (!Array.isArray(flights)) return;

        // --- COMPUTE AIRLINE DOMINANCE ---
        const airlineCounts = {};
        flights.forEach(f => {
            const brand = getAirline(f.callsign);
            if (brand !== "Private / General Aviation" && brand !== "Commercial Air Carrier") {
                airlineCounts[brand] = (airlineCounts[brand] || 0) + 1;
            }
        });

        const sortedAirlines = Object.entries(airlineCounts)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5);

        let boardHTML = '';
        sortedAirlines.forEach(([name, count]) => {
            const percentage = Math.min((count / (flights.length || 1)) * 100 * 5, 100); 
            boardHTML += `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                        <span>${name}</span>
                        <span style="color: #38bdf8;">${count} Flights Tracked</span>
                    </div>
                    <div style="width: 100%; background: #1e293b; height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${percentage}%; background: #38bdf8; height: 100%; box-shadow: 0 0 10px #38bdf8;"></div>
                    </div>
                </div>`;
        });
        const alb = document.getElementById('airline-leaderboard');
        if(alb) alb.innerHTML = boardHTML || '<div style="text-align:center; padding: 20px; color: #94a3b8;">Scanning sector signatures...</div>';

        // --- SCAN FOR RECENT EMERGENCY LOGS ---
        let emergencyHTML = '';
        flights.filter(f => f.squawk === '7700').forEach(f => {
            emergencyHTML += `> [${new Date().toLocaleTimeString()}] 🚨 EMERGENCY: ${f.callsign} squawk 7700 at ${f.altitude}m<br>`;
        });
        
        const elog = document.getElementById('emergency-log');
        if (elog && emergencyHTML) {
            elog.innerHTML = emergencyHTML;
        }

        // --- UPDATE KPI CARD (PRESERVE COUNTS) ---
        if (historicalData && historicalData.length > 0) {
            // Store for CSV Export
            window.globalChartData = historicalData;
            
            document.getElementById('kpi-snapshots').innerText = historicalData.length;
            
            const totalFlightsMap = historicalData.map(d => d.total_flights);
            const maxTraffic = totalFlightsMap.length > 0 ? Math.max(...totalFlightsMap) : 0;
            document.getElementById('kpi-peak-traffic').innerText = maxTraffic;
            
            const speedsMap = historicalData.map(d => d.avg_speed);
            const maxSpeed = speedsMap.length > 0 ? Math.max(...speedsMap) : 0;
            document.getElementById('kpi-max-speed').innerHTML = `${Math.round(maxSpeed * 0.5399)}<span style="font-size:1rem; color:#94a3b8; font-weight:normal;"> kt</span>`;
            
            const avgAlt = Math.round(historicalData.reduce((a,b)=>a+b.avg_altitude, 0) / historicalData.length);
            document.getElementById('kpi-avg-alt').innerHTML = `FL${Math.round((avgAlt * 3.28)/100)}`;

            // --- UPDATE CHARTS ---
            updateCharts(historicalData, flights);
        } else {
            document.getElementById('kpi-snapshots').innerText = "0";
            document.getElementById('kpi-peak-traffic').innerText = "0";
            document.getElementById('kpi-max-speed').innerHTML = "0";
            document.getElementById('kpi-avg-alt').innerHTML = "N/A";
        }

        updateEnvironmentAndHubs(flights.length);
        updateWeatherAndPredictions();
        
    } catch (err) {
        console.error("Analytics board update failed:", err);
    }
}

// --- AIRLINE BRANDING HELPER ---
const airlineDict = {
    'IGO': 'IndiGo', 'AIC': 'Air India', 'UAE': 'Emirates', 'BAW': 'British Airways', 
    'AAL': 'American', 'DAL': 'Delta', 'UAL': 'United', 'RYR': 'Ryanair', 
    'THY': 'Turkish', 'QTR': 'Qatar', 'SIA': 'Singapore Airlines', 'EZS': 'easyJet', 'VTI': 'Vistara'
};
function getAirline(callsign) {
    if (!callsign || callsign.length < 3) return "Private / General Aviation";
    let code = callsign.substring(0, 3).toUpperCase();
    return airlineDict[code] || "Commercial Air Carrier";
}

// --- NEW ENVIRONMENTAL & HUB SIMULATION ---
function updateEnvironmentAndHubs(flightCount) {
    const totalFuelMt = (flightCount * 2.5).toFixed(1);
    const totalCO2 = (flightCount * 3.1).toFixed(1);

    const fuelEl = document.getElementById('env-fuel');
    const co2El = document.getElementById('env-co2');
    if (fuelEl) fuelEl.innerText = totalFuelMt + " mt";
    if (co2El) co2El.innerText = totalCO2 + " tons";

    const hubs = [
        { name: 'DELHI (DEL)', zone: 'North' },
        { name: 'DUBAI (DXB)', zone: 'Middle East' },
        { name: 'LONDON (LHR)', zone: 'Europe' },
        { name: 'NEW YORK (JFK)', zone: 'US East' }
    ];
    let html = '';
    hubs.forEach(h => {
        const delay = Math.floor(Math.random() * 15);
        const status = delay > 10 ? '<span style="color:#ef4444;">CONGESTED</span>' : '<span style="color:#10b981;">OPTIMAL</span>';
        html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px;">${h.name}</td>
            <td style="padding: 10px;">${status}</td>
            <td style="padding: 10px;">+${delay}m</td>
        </tr>`;
    });
    const hb = document.getElementById('hub-body');
    if(hb) hb.innerHTML = html;
}

// --- NEW WEATHER & DELAY PREDICTIONS ---
function updateWeatherAndPredictions() {
    const score = Math.floor(Math.random() * 40) + 10;
    const scoreEl = document.getElementById('weather-score');
    const statusEl = document.getElementById('weather-status');
    
    if (scoreEl && statusEl) {
        scoreEl.innerText = score;
        if (score < 20) {
            statusEl.innerText = "OPTIMAL"; statusEl.style.color = "#10b981";
        } else if (score < 35) {
            statusEl.innerText = "ADVISORY"; statusEl.style.color = "#f59e0b";
        } else {
            statusEl.innerText = "CRITICAL"; statusEl.style.color = "#ef4444";
        }
    }

    const predictions = [
        "JFK Sector: Expecting +12m delay due to crosswinds.",
        "LHR Approach: Holding patterns likely in 20 minutes.",
        "SIN Hub: High humidity impacting climb gradients.",
        "DXB Operations: Clear skies, no predictive delays."
    ];
    let html = '';
    predictions.forEach(p => {
        html += `<div style="padding: 10px; background: rgba(168, 85, 247, 0.03); border-left: 3px solid #a855f7; margin-bottom: 8px;">${p}</div>`;
    });
    const predDiv = document.getElementById('predictive-delays');
    if (predDiv) predDiv.innerHTML = html;
}

// --- DATABASE MAINTENANCE ---
async function resetDatabase() {
    if(!confirm("Are you sure you want to PERMANENTLY WIPE all historical flight logs?")) return;
    try {
        const res = await fetch('/api/reset', { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            location.reload(); 
        }
    } catch(e) {}
}

// --- TERMINAL CONSOLE ENGINE ---
function addLog(msg) {
    const term = document.getElementById('system-console');
    if(term) {
        term.innerHTML += msg + "<br>";
        term.scrollTop = term.scrollHeight; 
    }
}

// --- COMMAND CENTER ACTION LOGIC ---
function forceSync() {
    addLog(`> [${new Date().toLocaleTimeString()}] ⟳ INITIATING MANUAL AIRSPACE SYNC...`);
    fetchAnalytics();
    fetchTopFlights();
    addLog(`> [${new Date().toLocaleTimeString()}] ✔ Intelligence boards updated.`);
}

function testEmergency() {
    addLog(`> [${new Date().toLocaleTimeString()}] ⚠️ INITIATING EMERGENCY SIMULATION...`);
    setTimeout(() => {
        const log = document.getElementById('emergency-log');
        if(log) {
            log.innerHTML = `> [${new Date().toLocaleTimeString()}] 🚨 SIMULATED: AIC101 (Air India) squawk 7700 at 10,500m - ENGINE FAIL SIMULATION<br>` + log.innerHTML;
        }
        addLog(`> [${new Date().toLocaleTimeString()}] ✔ Alert propagated to Global Sector Hubs.`);
    }, 1000);
}

function exportCSV() {
    if (!window.globalChartData) return;
    let csvContent = "data:text/csv;charset=utf-8,Timestamp,Total_Airplanes_Tracked,Avg_Speed_Kmh,Avg_Altitude_Meters\n";
    window.globalChartData.forEach(function(row) {
        csvContent += `${row.time},${row.total_flights},${row.avg_speed},${row.avg_altitude}\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "flight_analytics_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- PDF INTEL REPORT DOWNLOADER ---
async function downloadIntelReport() {
    addLog(`> [${new Date().toLocaleTimeString()}] 📄 GENERATING TACTICAL INTEL REPORT...`);
    try {
        const response = await fetch('/api/analytics/report');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OASIS_Intel_Report_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            addLog(`> [${new Date().toLocaleTimeString()}] ✔ Intelligence Report generated successfully.`);
        } else {
            addLog(`> [${new Date().toLocaleTimeString()}] ✖ Report Generation Error: Backend Offline.`);
        }
    } catch (error) {
        addLog(`> [${new Date().toLocaleTimeString()}] ✖ System Fault: PDF Uplink Failure.`);
    }
}

// --- HARDWARE TELEMETRY SIMULATION ---
setInterval(() => {
    let cpu = Math.floor(Math.random() * 54) + 40; 
    let ram = (Math.random() * 15 + 5).toFixed(1); 
    if (document.getElementById('hw-cpu')) {
        document.getElementById('hw-cpu').innerText = cpu + "%";
        document.getElementById('hw-cpu-bar').style.width = cpu + "%";
        document.getElementById('hw-cpu-bar').style.background = cpu > 85 ? '#ef4444' : '#f43f5e'; 
    }
    if (document.getElementById('hw-ram')) {
        document.getElementById('hw-ram').innerText = ram + " MB/s";
        document.getElementById('hw-ram-bar').style.width = (ram / 25 * 100) + "%";
    }
}, 1500);

// --- THREAT INTELLIGENCE STREAM ---
const threats = ["PERFORMING SWEEP Sector 7...", "MONITORING 7700 CODES...", "NO CONFLICTS DETECTED.", "SYNCING SAT PING..."];
setInterval(() => {
    const term = document.getElementById('threat-console');
    if(!term) return;
    term.innerHTML += `> [${new Date().toLocaleTimeString()}] ${threats[Math.floor(Math.random() * threats.length)]}<br>`;
    term.scrollTop = term.scrollHeight;
}, 4000);

// --- RAW DATA HEX SIMULATION ---
setInterval(() => {
    const matrix = document.getElementById('hex-matrix');
    if(!matrix) return;
    let html = '';
    const hexChars = '0123456789ABCDEF';
    for(let i=0; i<15; i++) {
        let h1=''; let h2=''; let h3='';
        for(let j=0; j<6; j++) h1 += hexChars[Math.floor(Math.random()*16)];
        for(let j=0; j<4; j++) h2 += hexChars[Math.floor(Math.random()*16)];
        for(let j=0; j<4; j++) h3 += hexChars[Math.floor(Math.random()*16)];
        html += `<div style="opacity: ${Math.random()>0.3?1:0.2};">0x${h1} 0x${h2} : [${h3}]</div>`;
    }
    matrix.innerHTML = html;
}, 300); 

// --- WORLD CLOCK ---
const zones = [{label:'UTC',offset:0},{label:'DELHI',offset:5.5},{label:'NY',offset:-5},{label:'LON',offset:1},{label:'TOK',offset:9}];
setInterval(() => {
    const clockDiv = document.getElementById('world-clocks');
    if (!clockDiv) return;
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    clockDiv.innerHTML = zones.map(z => {
        const time = new Date(utc + (3600000 * z.offset));
        return `<span>${z.label}: <b style="color:#fff;">${time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</b></span>`;
    }).join(' ');
}, 1000);

// --- SATELLITE NODE GRID ---
setInterval(() => {
    const grid = document.getElementById('node-grid');
    if (!grid) return;
    let html = '';
    for (let i = 0; i < 60; i++) {
        let color = '#10b981';
        let rand = Math.random();
        if (rand > 0.95) color = '#ef4444';
        else if (rand > 0.85) color = '#f59e0b';
        html += `<div style="height:12px; background:${color}; border-radius:2px; opacity:${Math.random()*0.5+0.5}; box-shadow:0 0 5px ${color};"></div>`;
    }
    grid.innerHTML = html;
}, 3000);

// GLOBAL SPEED ANOMALY
async function fetchTopFlights() {
    try {
        const res = await fetch('/api/hub/flights');
        const resData = await res.json();
        const data = resData.data || resData;
        if (resData.error || !Array.isArray(data)) return;
        data.sort((a,b) => b.velocity - a.velocity);
        const top5 = data.slice(0, 5);
        let tbodyHTML = top5.map(f => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px; font-weight:bold; color:#fff;">${f.callsign || 'UNK'}</td>
                <td style="padding:10px;">${f.country || 'N/A'}</td>
                <td style="padding:10px; color:#ef4444; font-weight:bold;">${Math.round(f.velocity*3.6)} km/h</td>
                <td style="padding:10px; color:#10b981;">${Math.round(f.altitude)} m</td>
            </tr>`).join('');
        const tb = document.getElementById('leaderboard-body');
        if(tb) tb.innerHTML = tbodyHTML;
    } catch(e) {}
}

fetchAnalytics();
fetchTopFlights();
setInterval(fetchAnalytics, 15000);
setInterval(fetchTopFlights, 10000);

// Expose functions for HTML onclick handlers
window.fetchAnalytics = fetchAnalytics;
window.fetchTopFlights = fetchTopFlights;
window.exportCSV = exportCSV;
window.downloadIntelReport = downloadIntelReport;
window.resetDatabase = resetDatabase;
window.forceSync = forceSync;
window.testEmergency = testEmergency;

console.log('[FOXBAT] Analytics engine initialized. Chart.js version:', typeof Chart !== 'undefined' ? Chart.version : 'NOT LOADED');

}); // end DOMContentLoaded
