FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the full repo root so `backend` is importable as a package
COPY . .

EXPOSE 3001

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
