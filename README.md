# \# Enterprise GTM AI

# 

# A local prototype of an AI-assisted go-to-market workspace for B2B sales teams.

# 

# The project is being built as a portfolio project. It is not ready for public deployment or real customer data.

# 

# \## What works now

# 

# \- Company profile onboarding with load, create, and update.

# \- AI-assisted company research with suggestions for the profile.

# \- Review and apply research suggestions.

# \- Ideal Customer Profile (ICP) onboarding with saved targeting details.

# \- FastAPI backend, PostgreSQL database, and Alembic migrations.

# \- React and TypeScript frontend.

# 

# \## Technology

# 

# \- Frontend: React, TypeScript, and Vite

# \- Backend: Python and FastAPI

# \- Database: PostgreSQL

# \- ORM: SQLAlchemy

# \- Database migrations: Alembic

# \- AI research: OpenAI API

# 

# \## Run locally on Windows

# 

# \### Requirements

# 

# \- Python

# \- Node.js and npm

# \- PostgreSQL

# \- The project’s `.venv` virtual environment

# 

# \### Configure local settings

# 

# The project uses a `.env` file in the project root. Configure the PostgreSQL settings and, if using AI research, your OpenAI API key there.

# 

# Never commit `.env` or share your API key. The repository’s `.gitignore` excludes `.env`.

# 

# \### Start the backend

# 

# Open a PowerShell window and run:

# 

# ```powershell

# Set-Location C:\\Enterprise-GTM-AI

# .\\.venv\\Scripts\\python.exe -m alembic -c .\\alembic.ini upgrade head

# .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir backend --reload

