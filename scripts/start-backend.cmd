@echo off
setlocal
cd /d "%~dp0\.."

if not exist ".env" (
  echo The project .env file is missing.
  echo Copy .env.example to .env and add your PostgreSQL settings first.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo The project Python environment is missing.
  echo Follow the Start the backend setup steps in README.md first.
  pause
  exit /b 1
)

echo Applying database migrations...
".venv\Scripts\python.exe" -m alembic -c alembic.ini upgrade head
if errorlevel 1 (
  echo Database migration failed. Check that PostgreSQL is running and .env has the correct settings.
  pause
  exit /b 1
)

echo Starting the Enterprise GTM AI backend at http://127.0.0.1:8000
".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --reload
pause
