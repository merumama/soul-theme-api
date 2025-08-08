#!/usr/bin/env bash
set -e
python -V
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
