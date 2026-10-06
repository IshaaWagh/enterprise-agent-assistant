"""Turn an uploaded file into plain text. Raises ValueError with a user-safe message."""
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_PDF_PAGES = 100
ALLOWED = {".txt", ".md", ".pdf"}


def extract_text(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED:
        raise ValueError("Unsupported file type. Upload a .txt, .md or .pdf file.")

    if suffix == ".pdf":
        try:
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted:
                raise ValueError("Password-protected PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise ValueError(f"PDFs are limited to {MAX_PDF_PAGES} pages.")
            text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except PyPdfError:
            raise ValueError("This PDF could not be read.")
        if not text.strip():
            raise ValueError("No text found in this PDF. Scanned (image-only) PDFs are not supported.")
        return text

    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("The file is not valid UTF-8 text.")