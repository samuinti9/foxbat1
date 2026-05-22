import requests
import time
import sqlite3
import math
import random
import os
from dotenv import load_dotenv

load_dotenv()

OPENSKY_USER = os.getenv("OPENSKY_USER")
OPENSKY_PASSWORD = os.getenv("OPENSKY_PASSWORD")

# --- MATH ALGORITHMS FOR TCAS ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in kilometers
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# --- DEAD RECKONING FLIGHT PATH PREDICTION ALGORITHM ---
def predict_future_position(lat, lon, heading, velocity_ms, time_seconds=300):
    R = 6371.0 # Earth radius in km
    d = (velocity_ms * time_seconds) / 1000.0 # Distance traveled in km
    
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    brng = math.radians(heading)
    
    lat2 = math.asin(math.sin(lat1) * math.cos(d/R) + math.cos(lat1) * math.sin(d/R) * math.cos(brng))
    lon2 = lon1 + math.atan2(math.sin(brng) * math.sin(d/R) * math.cos(lat1), math.cos(d/R) - math.sin(lat1) * math.sin(lat2))
    
    return [math.degrees(lat2), math.degrees(lon2)]

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect('flights.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS flight_stats
                 (timestamp REAL, total_flights INTEGER, avg_speed REAL, avg_altitude REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS flight_archive
                 (timestamp REAL, callsign TEXT, lat REAL, lon REAL, heading REAL, altitude REAL)''')
    conn.commit()
    conn.close()

# Cache and State
cached_flight_data = []
last_fetch_time = 0
last_db_log = 0
CACHE_DURATION = 10
last_bbox = None
api_health = {"latency": 0, "status": "NOMINAL"}

def generate_mock_flights(geofence_state, filters=None):
    processed_data = []
    r = random.Random(int(time.time() / 1800))
    callsign_prefixes = ["AIC", "IGO", "SEJ", "VTI", "GOW", "BAW", "UAE", "QTR", "CPA", "DLH"]
    
    bbox = filters.get('bbox') if filters else None
    
    if bbox:
        lamin, lomin, lamax, lomax = bbox
        # Generate 45 mock flights distributed inside the bounding box
        for i in range(45):
            offset_lat_ratio = ((i * 0.17) % 1.0)
            offset_lon_ratio = ((i * 0.23) % 1.0)
            
            lat_range = max(0.1, lamax - lamin)
            lon_range = max(0.1, lomax - lomin)
            
            speed_factor = 0.005 + (i % 5) * 0.002
            dir_lat = 1 if (i % 2 == 0) else -1
            dir_lon = 1 if (i % 3 == 0) else -1
            
            lat = lamin + ((offset_lat_ratio * lat_range) + (time.time() * speed_factor * 0.01 * dir_lat)) % lat_range
            lon = lomin + ((offset_lon_ratio * lon_range) + (time.time() * speed_factor * 0.01 * dir_lon)) % lon_range
            
            alt_m = 3000 + (i * 450) % 9000
            heading = (i * 40) % 360
            velocity = 120 + (i * 12) % 180
            squawk = "7700" if (i == 13) else "2000"
            
            f = {
                'id': f"mock{i:03d}",
                'callsign': f"{r.choice(callsign_prefixes)}{300 + i}",
                'country': "Local Sector",
                'lon': lon,
                'lat': lat,
                'altitude': alt_m,
                'velocity': velocity,
                'heading': heading,
                'vertical_rate': r.choice([-1, 0, 1]),
                'squawk': squawk,
                'signal_strength': r.randint(70, 100),
                'geofence_violation': False
            }
            
            future_pos = predict_future_position(f['lat'], f['lon'], f['heading'], f['velocity'], 300)
            f['pred_lat'], f['pred_lon'] = future_pos[0], future_pos[1]
            
            if geofence_state['active']:
                dist = haversine(f['lat'], f['lon'], geofence_state['lat'], geofence_state['lon'])
                if dist <= geofence_state['radius_km']:
                    f['geofence_violation'] = True
                    
            processed_data.append(f)
    else:
        # Major global hubs matching radar navigation locations
        hubs = [
            (28.61, 77.23, "India"),          # Delhi
            (19.08, 72.86, "India"),          # Mumbai
            (51.50, -0.12, "United Kingdom"), # London
            (40.71, -74.00, "United States"), # New York
            (25.20, 55.27, "UAE"),            # Dubai
            (1.35, 103.81, "Singapore")        # Singapore
        ]
        
        for i in range(90):
            hub = hubs[i % len(hubs)]
            hub_lat, hub_lon, country = hub
            
            offset_lat = ((i * 0.7) % 6.0) - 3.0
            offset_lon = ((i * 0.8) % 6.0) - 3.0
            
            dir_lat = 1 if (i % 2 == 0) else -1
            dir_lon = 1 if (i % 3 == 0) else -1
            
            speed_factor = 0.004 + (i % 4) * 0.001
            
            lat = hub_lat + offset_lat + (time.time() * speed_factor * dir_lat) % 4.0 - 2.0
            lon = hub_lon + offset_lon + (time.time() * speed_factor * dir_lon) % 4.0 - 2.0
            
            alt_m = 4000 + (i * 350) % 8000
            if filters:
                if filters.get('min_alt') and alt_m < filters['min_alt']: continue
                if filters.get('max_alt') and alt_m > filters['max_alt']: continue
                
            heading = (i * 45) % 360
            velocity = 150 + (i * 10) % 150
            squawk = "7700" if (i % 30 == 11) else "2000"
            
            f = {
                'id': f"mock{i:03d}",
                'callsign': f"{r.choice(callsign_prefixes)}{300 + i}",
                'country': country,
                'lon': lon,
                'lat': lat,
                'altitude': alt_m,
                'velocity': velocity,
                'heading': heading,
                'vertical_rate': r.choice([-2, 0, 2]),
                'squawk': squawk,
                'signal_strength': r.randint(65, 100),
                'geofence_violation': False
            }
            
            future_pos = predict_future_position(f['lat'], f['lon'], f['heading'], f['velocity'], 300)
            f['pred_lat'], f['pred_lon'] = future_pos[0], future_pos[1]
            
            if geofence_state['active']:
                dist = haversine(f['lat'], f['lon'], geofence_state['lat'], geofence_state['lon'])
                if dist <= geofence_state['radius_km']:
                    f['geofence_violation'] = True
                    
            processed_data.append(f)
            
    # Conflicts
    analysis_subset = processed_data[:200]
    for idx1 in range(len(analysis_subset)):
        for idx2 in range(idx1 + 1, len(analysis_subset)):
            f1, f2 = analysis_subset[idx1], analysis_subset[idx2]
            dist_km = haversine(f1['lat'], f1['lon'], f2['lat'], f2['lon'])
            alt_diff = abs(f1['altitude'] - f2['altitude'])
            if alt_diff < 500 and dist_km < 10.0:
                f1['is_conflict'] = f2['is_conflict'] = True
                f1['conflict_with'], f2['conflict_with'] = f2['callsign'], f1['callsign']

    return processed_data

def fetch_and_process_flights(geofence_state, filters=None):
    global cached_flight_data, last_fetch_time, last_db_log, api_health, last_bbox
    
    current_time = time.time()
    bbox = filters.get('bbox') if filters else None
    
    bbox_changed = (bbox != last_bbox)
    
    if not bbox_changed and (current_time - last_fetch_time < CACHE_DURATION) and len(cached_flight_data) > 0:
        return cached_flight_data

    start_time = time.time()
    try:
        url = 'https://opensky-network.org/api/states/all'
        params = {}
        
        if bbox:
            lamin, lomin, lamax, lomax = bbox
            if lamin > lamax: lamin, lamax = lamax, lamin
            if lomin > lomax: lomin, lomax = lomax, lomin
            lamin = max(-90.0, min(90.0, lamin))
            lamax = max(-90.0, min(90.0, lamax))
            lomin = max(-180.0, min(180.0, lomin))
            lomax = max(-180.0, min(180.0, lomax))
            params = {'lamin': lamin, 'lomin': lomin, 'lamax': lamax, 'lomax': lomax}
            
        auth = None
        if OPENSKY_USER and OPENSKY_PASSWORD:
            auth = (OPENSKY_USER, OPENSKY_PASSWORD)
            
        response = requests.get(url, params=params, auth=auth, timeout=10)
        api_health["latency"] = round((time.time() - start_time) * 1000, 2)
        
        if response.status_code == 200:
            api_health["status"] = "NOMINAL"
            data = response.json()
            states = data.get('states', [])
            processed_data = []
            
            if states:
                if bbox:
                    sample_step = 1
                    max_flights = 400
                else:
                    sample_step = 8
                    max_flights = 600
                    
                sample = states[::sample_step][:max_flights] 
                
                for flight in sample:
                    if flight[5] is not None and flight[6] is not None: 
                        alt_m = flight[7] if flight[7] else 0
                        if filters:
                            if filters.get('min_alt') and alt_m < filters['min_alt']: continue
                            if filters.get('max_alt') and alt_m > filters['max_alt']: continue

                        f = {
                            'id': flight[0],
                            'callsign': str(flight[1]).strip() if flight[1] else "Unknown",
                            'country': flight[2],
                            'lon': flight[5],
                            'lat': flight[6],
                            'altitude': alt_m,
                            'velocity': flight[9] if flight[9] else 0,
                            'heading': flight[10] if flight[10] else 0,
                            'vertical_rate': flight[11] if flight[11] else 0,
                            'squawk': str(flight[14]).strip() if flight[14] else "0000"
                        }
                        
                        f['signal_strength'] = random.randint(40, 100)
                        
                        if f['velocity'] > 0 and f['heading'] > 0:
                            future_pos = predict_future_position(f['lat'], f['lon'], f['heading'], f['velocity'], 300)
                            f['pred_lat'], f['pred_lon'] = future_pos[0], future_pos[1]
                        
                        f['geofence_violation'] = False
                        if geofence_state['active']:
                            dist = haversine(f['lat'], f['lon'], geofence_state['lat'], geofence_state['lon'])
                            if dist <= geofence_state['radius_km']:
                                f['geofence_violation'] = True
                                
                        processed_data.append(f)
            
            # Conflict Detection
            analysis_subset = processed_data[:200]
            for i in range(len(analysis_subset)):
                for j in range(i + 1, len(analysis_subset)):
                    f1, f2 = analysis_subset[i], analysis_subset[j]
                    dist_km = haversine(f1['lat'], f1['lon'], f2['lat'], f2['lon'])
                    alt_diff = abs(f1['altitude'] - f2['altitude'])
                    if alt_diff < 500 and dist_km < 10.0:
                        f1['is_conflict'] = f2['is_conflict'] = True
                        f1['conflict_with'], f2['conflict_with'] = f2['callsign'], f1['callsign']

            cached_flight_data = processed_data
            last_fetch_time = current_time
            last_bbox = bbox
            
            if current_time - last_db_log > 60 and len(processed_data) > 0:
                log_to_db(processed_data, current_time)
                last_db_log = current_time
                
            return processed_data
        else:
            api_health["status"] = "LIMIT (SIM ACTIVE)"
            mock_data = generate_mock_flights(geofence_state, filters)
            cached_flight_data = mock_data
            last_bbox = bbox
            return mock_data
    except Exception as e:
        print(f"DATA HUB ERROR: {e}")
        api_health["status"] = "ERROR (SIM ACTIVE)"
        mock_data = generate_mock_flights(geofence_state, filters)
        cached_flight_data = mock_data
        last_bbox = bbox
        return mock_data

def log_to_db(data, timestamp):
    count = len(data)
    avg_speed = (sum(f['velocity'] for f in data) / count) * 3.6
    avg_alt = sum(f['altitude'] for f in data) / count
    
    conn = sqlite3.connect('flights.db')
    c = conn.cursor()
    c.execute("INSERT INTO flight_stats VALUES (?, ?, ?, ?)", (timestamp, count, avg_speed, avg_alt))
    
    archive = [(timestamp, f['callsign'], f['lat'], f['lon'], f['heading'], f['altitude']) for f in data]
    c.executemany("INSERT INTO flight_archive VALUES (?, ?, ?, ?, ?, ?)", archive)
    
    conn.commit()
    conn.close()

def get_health():
    return api_health
