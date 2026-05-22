/**
 * OASIS ORBITAL ENGINE (CesiumJS Integration)
 * Handles the transition and rendering of 3D global flight data.
 */

let viewer = null;
let is3DMode = false;
let entities = {};

function initGlobe() {
    if (viewer) return;

    // Use a specific Cesium Ion access token if you have one, 
    // otherwise it uses the default (with limitations).
    Cesium.Ion.defaultAccessToken = ''; 

    viewer = new Cesium.Viewer('cesiumContainer', {
        terrainProvider: Cesium.createWorldTerrain(),
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        fullScreenButton: false,
        selectionIndicator: false,
        infoBox: false,
        imageryProvider: new Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors, © CARTO'
        })
    });

    // Dark theme for the globe
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.BLACK;
    
    // Hide standard Cesium logo
    viewer._cesiumWidget._creditContainer.style.display = "none";
}

function toggleOrbitalView() {
    const map2D = document.getElementById('map');
    const container3D = document.getElementById('cesiumContainer');
    const toggleBtn = document.getElementById('orbital-toggle');

    if (!is3DMode) {
        // Switch to 3D
        initGlobe();
        map2D.style.visibility = 'hidden';
        container3D.style.visibility = 'visible';
        container3D.style.zIndex = '100';
        toggleBtn.innerText = '🗺️ 2D';
        toggleBtn.style.background = 'rgba(56, 189, 248, 0.2)';
        toggleBtn.style.borderColor = '#38bdf8';
        toggleBtn.style.color = '#38bdf8';
        is3DMode = true;
        
        // Initial flight load for 3D
        update3DFlights();
        
        // Start 3D sync loop
        window.orbitalInterval = setInterval(update3DFlights, 5000);
    } else {
        // Switch to 2D
        map2D.style.visibility = 'visible';
        container3D.style.visibility = 'hidden';
        container3D.style.zIndex = '1';
        toggleBtn.innerText = '🌍 3D';
        toggleBtn.style.background = 'rgba(168, 85, 247, 0.2)';
        toggleBtn.style.borderColor = '#a855f7';
        toggleBtn.style.color = '#a855f7';
        is3DMode = false;
        
        clearInterval(window.orbitalInterval);
    }
}

async function update3DFlights() {
    if (!is3DMode) return;

    try {
        const response = await fetch('/api/flights');
        const data = await response.json();
        const flights = data.data || data;

        // Clean up entities not in the current stream
        const currentIds = flights.map(f => f.icao24);
        Object.keys(entities).forEach(id => {
            if (!currentIds.includes(id)) {
                viewer.entities.remove(entities[id]);
                delete entities[id];
            }
        });

        // Add or update entities
        flights.forEach(f => {
            const position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.altitude || 10000);
            
            if (entities[f.icao24]) {
                // Update position
                entities[f.icao24].position = position;
                // Update label/desc
                entities[f.icao24].label.text = f.callsign || "UNK";
            } else {
                // Create new entity
                entities[f.icao24] = viewer.entities.add({
                    id: f.icao24,
                    position: position,
                    point: {
                        pixelSize: 8,
                        color: f.squawk === '7700' ? Cesium.Color.RED : Cesium.Color.CYAN,
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 1
                    },
                    label: {
                        text: f.callsign || "UNK",
                        font: '12px Roboto Mono',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -12)
                    }
                });
            }
        });
    } catch (error) {
        console.error("Orbital Link Failure:", error);
    }
}
