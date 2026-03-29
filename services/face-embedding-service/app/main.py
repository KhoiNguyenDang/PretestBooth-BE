from __future__ import annotations

import base64
import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException, status
from insightface.app import FaceAnalysis
from pydantic import BaseModel, Field


API_KEY = os.getenv("FACE_EMBEDDING_API_KEY") or os.getenv("FACE_EMBEDDING_SERVICE_API_KEY", "")
MODEL_NAME = os.getenv("INSIGHTFACE_MODEL_NAME", "buffalo_l")
MODEL_VERSION = os.getenv("INSIGHTFACE_MODEL_VERSION", "1")
DETECTION_SIZE = int(os.getenv("INSIGHTFACE_DET_SIZE", "640"))


class EmbeddingRequest(BaseModel):
    image: str = Field(min_length=100, description="Face image as data URL")


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    model: str
    version: str


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    if norm == 0:
        raise ValueError("embedding norm is zero")
    return vector / norm


def parse_data_url(data_url: str) -> np.ndarray:
    if not data_url.startswith("data:image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image must be a data URL",
        )

    try:
        _, encoded = data_url.split(",", 1)
        binary = base64.b64decode(encoded, validate=True)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid data URL payload",
        ) from exc

    np_arr = np.frombuffer(binary, dtype=np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image decode failed",
        )

    return image


def pick_primary_face(faces: list[Any]):
    if not faces:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no face detected",
        )

    def area(face: Any) -> float:
        bbox = face.bbox
        return float(max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1]))

    return sorted(faces, key=area, reverse=True)[0]


app = FastAPI(title="pretestBooth Face Embedding Service", version="1.0.0")


@app.on_event("startup")
def startup_event() -> None:
    providers = ["CPUExecutionProvider"]
    engine = FaceAnalysis(name=MODEL_NAME, providers=providers)
    engine.prepare(ctx_id=-1, det_size=(DETECTION_SIZE, DETECTION_SIZE))
    app.state.engine = engine


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def create_embedding(
    payload: EmbeddingRequest,
    x_api_key: str | None = Header(default=None),
) -> EmbeddingResponse:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid API key",
        )

    image = parse_data_url(payload.image)
    faces = app.state.engine.get(image)
    face = pick_primary_face(faces)

    embedding = getattr(face, "normed_embedding", None)
    if embedding is None:
        embedding = normalize_vector(face.embedding)

    vector = np.asarray(embedding, dtype=np.float32)
    vector = normalize_vector(vector)

    return EmbeddingResponse(
        embedding=[float(value) for value in vector.tolist()],
        model=MODEL_NAME,
        version=MODEL_VERSION,
    )
