"""Chroma access. One collection per project keeps projects isolated from each other."""
from functools import lru_cache

import chromadb

from app.core.config import get_settings


@lru_cache
def _client():
    s = get_settings()
    return chromadb.HttpClient(host=s.chroma_host, port=s.chroma_port)


def get_collection(project_id: int):
    # embedding_function=None: we always pass our own embeddings (the thin client has no default).
    return _client().get_or_create_collection(name=f"project_{project_id}_docs", embedding_function=None)