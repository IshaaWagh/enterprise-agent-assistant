"""Split text into overlapping chunks that respect paragraph and sentence boundaries."""
import re


def _split_long(text: str, size: int) -> list[str]:
    """Break an over-long paragraph on sentence boundaries, then on spaces as a last resort."""
    out, current = [], ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        while len(sentence) > size:
            cut = sentence.rfind(" ", 0, size)
            cut = cut if cut > 0 else size
            if current:
                out.append(current)
                current = ""
            out.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if current and len(current) + len(sentence) + 1 > size:
            out.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        out.append(current)
    return out


def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    text = re.sub(r"\r\n?", "\n", text).strip()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        for piece in _split_long(paragraph, size) if len(paragraph) > size else [paragraph]:
            if current and len(current) + len(piece) + 2 > size:
                chunks.append(current)
                tail = current[-overlap:]
                tail = tail[tail.find(" ") + 1 :] if " " in tail else tail  # start on a word boundary
                current = f"{tail}\n\n{piece}".strip()
            else:
                current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks