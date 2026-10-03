# Enterprise Multi-Agent AI Assistant

A multi-agent AI assistant that analyses GitHub and Jira data to predict project
risk, trace root causes, recommend actions, and (with human approval) act on them.

> Status: under active development.

## Quick start (backend)

```bash
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```