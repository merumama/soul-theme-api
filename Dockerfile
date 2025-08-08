FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data

# Uvicorn on $PORT (HF Spaces uses PORT env)
EXPOSE 7860
CMD ["bash", "-lc", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
