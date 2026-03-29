# Face Embedding Service (Python)

This service extracts normalized face embeddings for pretestBooth KYC and booth check-in.

## API contract

- `POST /v1/embeddings`
  - Request:
    ```json
    {
      "image": "data:image/jpeg;base64,..."
    }
    ```
  - Response:
    ```json
    {
      "embedding": [0.0123, -0.0456, ...],
      "model": "buffalo_l",
      "version": "1"
    }
    ```

- `GET /health`

If `FACE_EMBEDDING_API_KEY` is set, caller must provide `x-api-key` header.

## Local run (Windows / PowerShell)

```powershell
Set-Location services/face-embedding-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:FACE_EMBEDDING_API_KEY = "change-me-face-key"
uvicorn app.main:app --host 0.0.0.0 --port 8010
```

## Docker run

```bash
docker build -t pretestbooth-face-embedding .
docker run --rm -p 8010:8010 \
  -e FACE_EMBEDDING_API_KEY=change-me-face-key \
  pretestbooth-face-embedding
```

## Backend integration variables

Set these in backend `.env`:

- `FACE_EMBEDDING_SERVICE_URL=http://localhost:8010/v1/embeddings`
- `FACE_EMBEDDING_SERVICE_API_KEY=change-me-face-key`
- `FACE_EMBEDDING_USE_MOCK=false`
- `FACE_EMBEDDING_DIM=512`

