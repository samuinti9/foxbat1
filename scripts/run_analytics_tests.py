"""Small test runner for analytics_engine.py
Creates a temporary SQLite DB, populates required tables, calls functions and writes a PDF.
"""
from analytics_engine import get_historical_stats, get_replay_data, generate_pdf_report
import os
import sqlite3
import tempfile
import time
import sys

# Ensure project root is on sys.path so local modules can be imported when running from scripts/
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


TMP_DB = os.path.join(tempfile.gettempdir(), 'test_flights.db')

# Ensure clean
try:
    os.remove(TMP_DB)
except OSError:
    pass

conn = sqlite3.connect(TMP_DB)
c = conn.cursor()

# Create tables
c.execute('''
CREATE TABLE flight_stats (
    timestamp REAL,
    total_flights INTEGER,
    avg_speed REAL,
    avg_altitude REAL
)
''')

c.execute('''
CREATE TABLE flight_archive (
    timestamp REAL,
    callsign TEXT,
    lat REAL,
    lon REAL,
    heading REAL,
    altitude REAL
)
''')

now = time.time()
# Insert sample stats (3 rows)
stats = [
    (now - 120, 5, 450.2, 10000),
    (now - 60, 7, 480.5, 11000),
    (now, 6, 470.0, 10500),
]

c.executemany('INSERT INTO flight_stats VALUES (?,?,?,?)', stats)

# Insert archive rows
archive = [
    (now - 30, 'FLT123', 51.5, -0.12, 90, 3000),
    (now - 20, 'FLT456', 52.0, -1.0, 180, 3200),
    (now - 10, 'FLT789', 50.9, 0.0, 270, 2800),
]

c.executemany('INSERT INTO flight_archive VALUES (?,?,?,?,?,?)', archive)
conn.commit()
conn.close()

print('Temporary DB created at:', TMP_DB)

# Call functions
hist = get_historical_stats(db_path=TMP_DB)
print('Historical stats (count):', len(hist))
print(hist[-1] if hist else 'no-hist')

replay = get_replay_data(2, db_path=TMP_DB)
print('Replay data (last 2 minutes) count:', len(replay))
if replay:
    print(replay[0])

# Generate PDF
buf = generate_pdf_report(db_path=TMP_DB)
out_pdf = os.path.join(tempfile.gettempdir(), 'test_report.pdf')
with open(out_pdf, 'wb') as f:
    f.write(buf.read())

print('Wrote PDF to:', out_pdf)

# Clean up
# os.remove(TMP_DB)
print('Done')
