from analytics_engine import get_historical_stats, get_replay_data, generate_pdf_report
import os
import sys
import sqlite3
import time
import io

# Ensure project root is importable when pytest runs from workspace root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def create_test_db(path):
    conn = sqlite3.connect(path)
    c = conn.cursor()
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
    stats = [
        (now - 120, 5, 450.2, 10000),
        (now - 60, 7, 480.5, 11000),
        (now, 6, 470.0, 10500),
    ]
    c.executemany('INSERT INTO flight_stats VALUES (?,?,?,?)', stats)
    archive = [
        (now - 30, 'FLT123', 51.5, -0.12, 90, 3000),
        (now - 20, 'FLT456', 52.0, -1.0, 180, 3200),
        (now - 10, 'FLT789', 50.9, 0.0, 270, 2800),
    ]
    c.executemany('INSERT INTO flight_archive VALUES (?,?,?,?,?,?)', archive)
    conn.commit()
    conn.close()


def test_get_historical_stats(tmp_path):
    db = tmp_path / "test.db"
    create_test_db(str(db))
    hist = get_historical_stats(db_path=str(db))
    assert isinstance(hist, list)
    assert len(hist) == 3
    assert all('time' in h and 'total_flights' in h for h in hist)


def test_get_replay_data_and_pdf(tmp_path):
    db = tmp_path / "test.db"
    create_test_db(str(db))
    replay = get_replay_data(5, db_path=str(db))
    assert isinstance(replay, list)
    assert len(replay) == 3
    # Generate PDF and ensure it's non-empty and looks like PDF
    buf = generate_pdf_report(db_path=str(db))
    data = buf.getvalue()
    assert len(data) > 100
    assert data.startswith(b'%PDF')
