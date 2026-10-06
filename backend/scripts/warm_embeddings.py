"""Download and test the embedding model.  Run: python -m scripts.warm_embeddings"""
from app.rag.embeddings import embed

vector = embed(["hello world"])[0]
print(f"Embedding model ready. Vector dimensions: {len(vector)}")