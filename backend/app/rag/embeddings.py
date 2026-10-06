"""Local sentence embeddings (no API cost, no data leaves the machine)."""
from functools import lru_cache

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


@lru_cache
def _model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_NAME)  # downloads ~90 MB on first use


def embed(texts: list[str]) -> list[list[float]]:
    """Unit-length vectors, so squared-L2 distance d relates to cosine similarity by cos = 1 - d/2."""
    vectors = _model().encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return vectors.tolist()