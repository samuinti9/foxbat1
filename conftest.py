"""
Root conftest.py – ensures the project root is on sys.path for all pytest runs.
This is the pytest-idiomatic way to make flat-layout (non-packaged) modules
importable without setting PYTHONPATH manually in every environment.
"""
import sys
import os

# Insert project root at the front of sys.path before any test collection begins.
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
