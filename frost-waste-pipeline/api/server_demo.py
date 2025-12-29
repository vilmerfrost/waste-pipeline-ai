"""
Collecct Demo API Server
Web upload interface for drag & drop file processing
NO AZURE CREDENTIALS NEEDED
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json
import shutil
from pathlib import Path
import logging
import time
from datetime import datetime

# Add parent directory to path
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.extraction_agent import CollecctExtractorAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Collecct Demo API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/collecct/uploads"))
REVIEW_DIR = Path(os.getenv("REVIEW_DIR", "/tmp/collecct/review"))
PROCESSED_DIR = Path(os.getenv("PROCESSED_DIR", "/tmp/collecct/processed"))

# Create directories
for dir_path in [UPLOAD_DIR, REVIEW_DIR, PROCESSED_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Initialize extractor
extractor = CollecctExtractorAgent()


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


class ExtractionData(BaseModel):
    filename: str
    summary: str
    confidence: float
    data: List[Dict]
    issues: List[Dict]
    downloadUrl: str


# Endpoints

@app.get("/")
async def root():
    return {
        "service": "Collecct Demo API",
        "version": "1.0.0",
        "status": "running",
        "mode": "demo",
        "message": "NO Azure credentials needed - perfect for demos!"
    }


@app.post("/api/upload/process")
async def upload_and_process(file: UploadFile = File(...)):
    """
    Upload file and process immediately
    Returns extraction results
    """
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"📤 Uploaded file: {file.filename}")
        
        # Detect language
        language = _detect_language(file.filename)
        
        # Extract data
        logger.info(f"🤖 Processing {file.filename}...")
        result = extractor.extract_from_document(str(file_path), language)
        
        # Save to review directory
        file_id = file_path.stem
        review_path = REVIEW_DIR / f"{file_id}_extraction.json"
        extractor.export_to_json(result, str(review_path))
        
        # Move to processed
        processed_path = PROCESSED_DIR / file.filename
        shutil.move(str(file_path), str(processed_path))
        
        logger.info(f"✅ Processed {file.filename}: {result.valid_rows}/{result.total_rows} valid rows")
        
        # Prepare response
        response_data = {
            "filename": result.filename,
            "summary": result.summary,
            "confidence": result.confidence_score,
            "confidence_score": result.confidence_score,  # Also include for compatibility
            "validRows": result.valid_rows,
            "totalRows": result.total_rows,
            "data": result.extracted_data,
            "issues": [
                {
                    "row": i.row_index,
                    "field": i.field,
                    "type": i.issue_type.value,
                    "message": i.message
                }
                for i in result.validation_issues
            ],
            "downloadUrl": f"/api/files/{file_id}/download"
        }
        
        return JSONResponse(content=response_data)
    
    except Exception as e:
        logger.error(f"Error processing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files/pending", response_model=List[FileInfo])
async def get_pending_files():
    """
    Get list of files pending review
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
        
        return ExtractionData(
            filename=data['filename'],
            summary=data['summary'],
            confidence=data['confidence'],
            data=data['data'],
            issues=data['issues'],
            downloadUrl=f"/api/files/{file_id}/download"
        )
    
    except Exception as e:
        logger.error(f"Error loading file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files/{file_id}/download")
async def download_extraction(file_id: str):
    """
    Download extraction JSON file
    """
    json_file = REVIEW_DIR / f"{file_id}_extraction.json"
    
    if not json_file.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        json_file,
        media_type="application/json",
        filename=f"{file_id}_extraction.json"
    )


@app.get("/api/stats")
async def get_stats():
    """
    Get processing statistics
    """
    pending_count = len(list(REVIEW_DIR.glob("*_extraction.json")))
    processed_count = len(list(PROCESSED_DIR.glob("*")))
    approved_count = len(list(PROCESSED_DIR.glob("*_approved.json")))
    
    return {
        "pending": pending_count,
        "processed": processed_count,
        "approved": approved_count,
        "total_processed": pending_count + processed_count,
        "total": pending_count + processed_count,
        "mode": "demo"
    }


@app.get("/api/activities")
async def get_activities():
    """
    Get recent activities for activity feed
    """
    activities = []
    
    # Get recent processed files
    processed_files = sorted(PROCESSED_DIR.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
    
    for file_path in processed_files:
        if file_path.name.endswith('_approved.json'):
            activities.append({
                "id": file_path.stem,
                "type": "approved",
                "message": f"Godkände {file_path.name.replace('_approved.json', '')} - skickat till Power BI",
                "time": datetime.fromtimestamp(file_path.stat().st_mtime).strftime('%H:%M'),
                "filename": file_path.name
            })
        elif file_path.name.endswith('_rejected.json'):
            activities.append({
                "id": file_path.stem,
                "type": "rejected",
                "message": f"Avvisade {file_path.name.replace('_rejected.json', '')}",
                "time": datetime.fromtimestamp(file_path.stat().st_mtime).strftime('%H:%M'),
                "filename": file_path.name
            })
    
    # Get recent extractions
    review_files = sorted(REVIEW_DIR.glob("*_extraction.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:5]
    
    for file_path in review_files:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                activities.append({
                    "id": file_path.stem,
                    "type": "processed",
                    "message": f"Processade {data.get('filename', file_path.name)} - {len(data.get('data', []))} rader",
                    "time": datetime.fromtimestamp(file_path.stat().st_mtime).strftime('%H:%M'),
                    "filename": data.get('filename')
                })
        except:
            pass
    
    # Sort by time (most recent first)
    activities.sort(key=lambda x: x['time'], reverse=True)
    
    return activities[:10]


@app.get("/api/blob/failed")
async def get_failed_files():
    """
    Get list of failed files from blob storage
    For auto-fetcher to check
    """
    try:
        # In demo mode, check mock blob or return empty
        # In production, this would check Azure Blob
        import sys
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        from utils.mock_blob_connector import MockBlobConnector
        
        connector = MockBlobConnector()
        files = connector.list_failed_files()
        
        return files
        
    except Exception as e:
        logger.error(f"Error getting failed files: {e}")
        return []


@app.post("/api/process/auto")
async def process_file_auto(req: Request):
    """
    Auto-process a file from blob storage
    Called by auto-fetcher
    """
    try:
        body = await req.json()
        filename = body.get('filename')
        if not filename:
            raise HTTPException(status_code=400, detail="filename required")
        
        logger.info(f"🤖 Auto-processing: {filename}")
        
        # Download from blob
        import sys
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        from utils.mock_blob_connector import MockBlobConnector
        
        connector = MockBlobConnector()
        local_path = UPLOAD_DIR / filename
        
        if connector.download_file(filename, str(local_path)):
            # Process file
            language = _detect_language(filename)
            result = extractor.extract_from_document(str(local_path), language)
            
            # Save to review
            file_id = local_path.stem
            review_path = REVIEW_DIR / f"{file_id}_extraction.json"
            extractor.export_to_json(result, str(review_path))
            
            logger.info(f"✅ Auto-processed {filename}")
            
            return {
                "status": "success",
                "filename": filename,
                "file_id": file_id
            }
        else:
            raise HTTPException(status_code=404, detail="File not found in blob")
            
    except Exception as e:
        logger.error(f"Error auto-processing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _detect_language(filename: str) -> str:
    """
    Simple language detection based on filename
    """
    filename_lower = filename.lower()
    
    if 'fin' in filename_lower or 'suomi' in filename_lower:
        return 'fi'
    elif 'nor' in filename_lower or 'norge' in filename_lower:
        return 'no'
    elif 'eng' in filename_lower or 'english' in filename_lower:
        return 'en'
    else:
        return 'sv'  # Default Swedish


# Run server
if __name__ == "__main__":
    import uvicorn
    
    print("="*60)
    print("🚀 COLLECCT DEMO API SERVER")
    print("="*60)
    print("✅ NO Azure credentials needed")
    print("✅ Perfect for demos and testing")
    print()
    print("📡 API Server: http://localhost:8000")
    print("📚 API Docs: http://localhost:8000/docs")
    print()
    print("💡 Upload files via POST /api/upload/process")
    print("   Or use the web-upload.jsx component")
    print()
    print("="*60)
    print()
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
