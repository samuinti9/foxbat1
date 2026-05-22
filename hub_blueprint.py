from flask import Blueprint, jsonify, request
import data_hub
import time

hub_bp = Blueprint('hub', __name__)

# --- NEW FEATURE: DYNAMIC SCALING ---
# Automatically adjusts sampling to maintain performance
def get_sampling_rate(flight_count):
    if flight_count > 5000: return 20  # 1 in 20
    if flight_count > 2000: return 10  # 1 in 10
    return 5                           # 1 in 5

@hub_bp.route('/flights')
def get_flights():
    global ACTIVE_GEOFENCE
    
    filters = {}
    lamin = request.args.get('lamin', type=float)
    lomin = request.args.get('lomin', type=float)
    lamax = request.args.get('lamax', type=float)
    lomax = request.args.get('lomax', type=float)
    
    if lamin is not None and lomin is not None and lamax is not None and lomax is not None:
        filters['bbox'] = (lamin, lomin, lamax, lomax)
        
    flights = data_hub.fetch_and_process_flights(ACTIVE_GEOFENCE, filters)
    
    # --- NEW FEATURE: FLIGHT CATEGORIZATION ---
    for f in flights:
        if f['velocity'] > 250: f['category'] = "HIGH_SPEED_INTERCEPT"
        elif f['altitude'] > 12000: f['category'] = "STRATOSPHERIC"
        else: f['category'] = "CIVILIAN_COMMERCIAL"
        
    health = data_hub.get_health()
    source = "LIVE_OPENSKY" if health["status"] == "NOMINAL" else "SIMULATED_UPLINK"
        
    return jsonify({
        "source": source,
        "sampling_optimized": True,
        "count": len(flights),
        "data": flights
    })

@hub_bp.route('/status')
def hub_status():
    return jsonify({
        "module": "DATA_HUB_BLUEPRINT",
        "health": data_hub.get_health(),
        "engine": "FOXBAT_V5_STABLE"
    })

# --- GLOBAL GEOFENCE STATE (Shared with fetch logic) ---
ACTIVE_GEOFENCE = { "active": False, "lat": 0.0, "lon": 0.0, "radius_km": 100.0 }

@hub_bp.route('/geofence', methods=['POST'])
def set_geofence():
    global ACTIVE_GEOFENCE
    data = request.json
    ACTIVE_GEOFENCE['active'] = data.get('active', False)
    ACTIVE_GEOFENCE['lat'] = data.get('lat', 0.0)
    ACTIVE_GEOFENCE['lon'] = data.get('lon', 0.0)
    ACTIVE_GEOFENCE['radius_km'] = data.get('radius_km', 100.0)
    return jsonify({"success": True, "status": "GEOFENCE_UPDATED"})
