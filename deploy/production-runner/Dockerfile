FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY runner.py .
COPY studio ./studio
USER nobody
ENV PYTHONUNBUFFERED=1 RUNNER_WORKDIR=/tmp
CMD ["python", "runner.py"]
