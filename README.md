# The Live Flight Tracking App (FOXBAT)

Lightweight Flight tracking / analytics prototype. Key features:

- Real-time tracking collected into `flights.db` (SQLite)
- Analytics and replay via `analytics_engine.py`
- PDF reporting via ReportLab
- Tests under `tests/` (pytest)

Quick start

1. Create a project venv and activate it (Windows PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Run tests:

```powershell
.\.venv\Scripts\pytest -q
```

3. Run the test runner that creates a temporary DB and PDF report:

```powershell
.\.venv\Scripts\python scripts/run_analytics_tests.py
```

Git and Deployment

- Initialize a git repo in the project root, commit, and push to GitHub (see commands in the project root or CI pipeline). A GitHub Actions workflow is included to run tests on push.

Vercel Deployment

1. Install the Vercel CLI locally or globally:

```powershell
npm install -g vercel
```

2. Login and deploy from the project root:

```powershell
vercel login
vercel --prod
```

3. Vercel will use `app.py` and `requirements.txt` with `vercel.json`.

If you prefer GitHub-based deployment, connect the repository to Vercel and it will deploy automatically on push to the selected branch.
