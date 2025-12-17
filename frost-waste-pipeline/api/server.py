"""
Collecct API Server
Provides endpoints for review dashboard and Simplitics webhook integration
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json
from pathlib import Path
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Collecct Processing API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
REVIEW_DIR = Path(os.getenv("REVIEW_DIR", "/tmp/collecct/review"))
FAILED_DIR = Path(os.getenv("FAILED_DIR", "/tmp/collecct/failed"))
PROCESSED_DIR = Path(os.getenv("PROCESSED_DIR", "/tmp/collecct/processed"))

# Create directories
for dir_path in [REVIEW_DIR, FAILED_DIR, PROCESSED_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)


# Models
class FileInfo(BaseModel):
    id: str
    filename: str
    status: str
    uploaded: str
    totalRows: int
    validRows: int
    confidence: float
    processingTime: float


class ValidationIssue(BaseModel):
    row: int
    field: str
    type: str
    message: str


class DataRow(BaseModel):
    id: int
    weight_kg: float
    address: str
    waste_type: str
    date: str
    confidence: float


class ExtractionData(BaseModel):
    filename: str
    summary: str
    confidence: float
    data: List[DataRow]
    issues: List[ValidationIssue]
    originalUrl: str


class ApprovalRequest(BaseModel):
    fileId: str
    data: List[DataRow]


class RejectionRequest(BaseModel):
    fileId: str
    reason: str


# Endpoints

@app.get("/")
async def root():
    return {
        "service": "Collecct Processing API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/files/pending", response_model=List[FileInfo])
async def get_pending_files():
    """
    Get list of files pending human review
    """
    files = []
    
    for json_file in REVIEW_DIR.glob("*_extraction.json"):
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            files.append(FileInfo(
                id=json_file.stem.replace('_extraction', ''),
                filename=data['filename'],
                status='pending',
                uploaded=data.get('processed_at', 'unknown'),
                totalRows=len(data['data']) + len([i for i in data['issues'] if i['type'] == 'error']),
                validRows=len(data['data']),
                confidence=data['confidence'],
                processingTime=float(data.get('processed_at', '0'))
            ))
        except Exception as e:
            logger.error(f"Error loading {json_file}: {e}")
            continue
    
    return files


@app.get("/api/files/{file_id}", response_model=ExtractionData)
async def get_file_data(file_id: str):
    """
    Get detailed extraction data for a specific file
    """
    json_file = REVIEW_DIR / f"{file_id}_extraction.json"
    
    if not json_file.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(json_file, 'r') as f:
            data = json.load(f)
        
        # Convert to response format with IDs
        data_rows = []
        for idx, row in enumerate(data['data'], start=1):
            data_rows.append(DataRow(
                id=idx,
                weight_kg=row.get('weight_kg', 0),
                address=row.get('address', ''),
                waste_type=row.get('waste_type', ''),
                date=row.get('date', ''),
                confidence=row.get('confidence', 0.5)
            ))
        
        # Convert to response format
        return ExtractionData(
            filename=data['filename'],
            summary=data['summary'],
            confidence=data['confidence'],
            data=data_rows,
            issues=[ValidationIssue(**issue) for issue in data['issues']],
            originalUrl=f"/api/files/{file_id}/original"
        )
    
    except Exception as e:
        logger.error(f"Error loading file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files/{file_id}/original")
async def get_original_file(file_id: str):
    """
    Get original file (PDF/Excel) for viewing
    """
    # Check for common extensions
    for ext in ['.pdf', '.xlsx', '.xls']:
        file_path = FAILED_DIR / f"{file_id}{ext}"
        if file_path.exists():
            return FileResponse(file_path)
    
    raise HTTPException(status_code=404, detail="Original file not found")


@app.post("/api/files/{file_id}/approve")
async def approve_file(file_id: str, request: ApprovalRequest):
    """
    Approve extraction and send to Collecct
    """
    try:
        json_file = REVIEW_DIR / f"{file_id}_extraction.json"
        
        if not json_file.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Load original data
        with open(json_file, 'r') as f:
            original_data = json.load(f)
        
        # Update with approved/edited data
        original_data['data'] = [row.dict() for row in request.data]
        original_data['status'] = 'approved'
        original_data['approved_at'] = str(asyncio.get_event_loop().time())
        
        # Save to processed directory
        output_file = PROCESSED_DIR / f"{file_id}_approved.json"
        with open(output_file, 'w') as f:
            json.dump(original_data, f, indent=2)
        
        # TODO: Upload to Azure Blob processed-files container
        # orchestrator.approve_and_upload(str(output_file))
        
        # Remove from review queue
        json_file.unlink()
        
        logger.info(f"Approved file {file_id}")
        
        return {
            "status": "success",
            "message": f"File {file_id} approved and sent to Collecct"
        }
    
    except Exception as e:
        logger.error(f"Error approving file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/files/{file_id}/reject")
async def reject_file(file_id: str, request: RejectionRequest):
    """
    Reject file and mark for manual processing
    """
    try:
        json_file = REVIEW_DIR / f"{file_id}_extraction.json"
        
        if not json_file.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Load data
        with open(json_file, 'r') as f:
            data = json.load(f)
        
        # Add rejection metadata
        data['status'] = 'rejected'
        data['rejection_reason'] = request.reason
        data['rejected_at'] = str(asyncio.get_event_loop().time())
        
        # Save to processed directory
        output_file = PROCESSED_DIR / f"{file_id}_rejected.json"
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        # TODO: Mark in Azure Blob for manual processing
        # orchestrator.reject_file(data['filename'], request.reason)
        
        # Remove from review queue
        json_file.unlink()
        
        logger.info(f"Rejected file {file_id}: {request.reason}")
        
        return {
            "status": "success",
            "message": f"File {file_id} rejected and marked for manual processing"
        }
    
    except Exception as e:
        logger.error(f"Error rejecting file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/webhook/simplitics")
async def simplitics_webhook(
    filename: str,
    container: str = "failed-files"
):
    """
    Webhook endpoint for Simplitics to trigger processing
    Called when Simplitics marks a file as 'failed'
    
    Args:
        filename: Name of failed file in blob storage
        container: Blob container name
    """
    try:
        logger.info(f"Webhook triggered for {filename} in {container}")
        
        # TODO: Trigger orchestrator to fetch and process this specific file
        # This can be done async or queued
        # orchestrator.process_single_file(filename, container)
        
        return {
            "status": "queued",
            "message": f"File {filename} queued for processing",
            "filename": filename
        }
    
    except Exception as e:
        logger.error(f"Error in webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats():
    """
    Get processing statistics
    """
    pending_count = len(list(REVIEW_DIR.glob("*_extraction.json")))
    approved_count = len(list(PROCESSED_DIR.glob("*_approved.json")))
    rejected_count = len(list(PROCESSED_DIR.glob("*_rejected.json")))
    
    return {
        "pending": pending_count,
        "approved": approved_count,
        "rejected": rejected_count,
        "total_processed": approved_count + rejected_count
    }


# Run server
if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting Collecct API Server...")
    print("   Docs: http://localhost:8000/docs")
    print("   Review Dashboard API ready")
    print()
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
