import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_project_access
from app.api.projects import _project_or_404
from app.db.models import Document, User
from app.db.session import get_db
from app.rag.extract import MAX_UPLOAD_BYTES, extract_text
from app.rag.service import EmptyDocument, RAGUnavailable, answer_question, delete_document, ingest_document

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["documents"], dependencies=[Depends(require_project_access)])

MAX_CONTENT_CHARS = 200_000
SourceType = Literal["note", "meeting", "document"]
UNAVAILABLE = "Document search is temporarily unavailable. Please try again."


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=MAX_CONTENT_CHARS)
    source_type: SourceType = "note"
    doc_date: date | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def _summary(doc: Document, chars: int | None = None) -> dict:
    return {
        "id": doc.id, "title": doc.title, "source_type": doc.source_type, "doc_date": doc.doc_date,
        "chunk_count": doc.chunk_count, "char_count": chars if chars is not None else len(doc.content),
        "created_at": doc.created_at,
    }


def _ingest(db: Session, project_id: int, user: User, **fields) -> dict:
    try:
        doc = ingest_document(db, project_id=project_id, user_id=user.id, **fields)
    except EmptyDocument:
        raise HTTPException(status_code=422, detail="The document contains no usable text.")
    except RAGUnavailable:
        raise HTTPException(status_code=503, detail=UNAVAILABLE)
    return _summary(doc)


@router.get("/{project_id}/documents")
def list_documents(project_id: int, db: Session = Depends(get_db)) -> list[dict]:
    _project_or_404(db, project_id)
    rows = db.execute(
        select(Document, func.length(Document.content))
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    ).all()
    return [_summary(doc, chars) for doc, chars in rows]


@router.post("/{project_id}/documents", status_code=201)
def create_document(
    project_id: int, body: DocumentCreate,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> dict:
    """Add pasted text (notes, meeting minutes) to the project's knowledge base."""
    _project_or_404(db, project_id)
    return _ingest(
        db, project_id, user, title=body.title.strip(), content=body.content,
        source_type=body.source_type, doc_date=body.doc_date,
    )


@router.post("/{project_id}/documents/upload", status_code=201)
def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    title: str | None = Form(None, max_length=200),
    source_type: SourceType = Form("document"),
    doc_date: date | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a .txt, .md or .pdf file. Only the extracted text is stored."""
    _project_or_404(db, project_id)
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (maximum 2 MB).")
    filename = (file.filename or "document").replace("\\", "/").split("/")[-1]
    try:
        text = extract_text(filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if len(text) > MAX_CONTENT_CHARS:
        raise HTTPException(status_code=413, detail="The document text is too long (maximum 200,000 characters).")
    clean_title = (title or "").strip() or filename.rsplit(".", 1)[0][:200] or "Untitled"
    return _ingest(db, project_id, user, title=clean_title, content=text, source_type=source_type, doc_date=doc_date)


@router.delete("/{project_id}/documents/{doc_id}")
def remove_document(project_id: int, doc_id: int, db: Session = Depends(get_db)) -> dict:
    _project_or_404(db, project_id)
    try:
        deleted = delete_document(db, project_id, doc_id)
    except RAGUnavailable:
        raise HTTPException(status_code=503, detail=UNAVAILABLE)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"deleted": doc_id}


@router.post("/{project_id}/ask")
def ask(project_id: int, body: AskRequest, db: Session = Depends(get_db)) -> dict:
    """Answer a question using only this project's documents, with citations."""
    _project_or_404(db, project_id)
    try:
        return answer_question(project_id, body.question.strip())
    except RAGUnavailable:
        raise HTTPException(status_code=503, detail=UNAVAILABLE)