"""
Collecct Orchestration Agent
Coordinates entire workflow from Blob → Extraction → Review → Upload
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.blob_connector import CollecctBlobConnector
from utils.mock_blob_connector import MockBlobConnector
from agents.extraction_agent import CollecctExtractorAgent, ExtractionResult

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CollecctOrchestrator:
    """
    Main orchestrator for Collecct processing workflow
    """
    
    def __init__(self, 
                 azure_connection_string: Optional[str] = None,
                 work_dir: str = "/tmp/collecct/processing",
                 review_dir: str = "/tmp/collecct/review",
                 use_mock: bool = False):
        """
        Initialize orchestrator
        
        Args:
            azure_connection_string: Azure Blob Storage connection string (not needed if use_mock=True)
            work_dir: Working directory for file processing
            review_dir: Directory for files pending review
            use_mock: If True, use mock blob connector instead of Azure
        """
        if use_mock:
            self.blob_connector = MockBlobConnector()
        else:
            if not azure_connection_string:
                raise ValueError("azure_connection_string required when use_mock=False")
            self.blob_connector = CollecctBlobConnector(azure_connection_string)
        self.extractor = CollecctExtractorAgent()
        self.work_dir = Path(work_dir)
        self.review_dir = Path(review_dir)
        
        # Create directories
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.review_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info("Orchestrator initialized")
    
    def process_batch(self, batch_size: int = 10) -> Dict:
        """
        Process a batch of failed files
        
        Args:
            batch_size: Number of files to process
            
        Returns:
            Processing summary
        """
        logger.info(f"Starting batch processing (size: {batch_size})")
        start_time = time.time()
        
        # Step 1: Fetch files from blob
        logger.info("Step 1: Fetching failed files from Azure Blob...")
        downloaded_files = self.blob_connector.fetch_and_process_batch(
            batch_size=batch_size,
            download_dir=str(self.work_dir)
        )
        
        if not downloaded_files:
            logger.warning("No failed files found to process")
            return {
                'status': 'no_files',
                'message': 'No failed files found',
                'processing_time': time.time() - start_time
            }
        
        logger.info(f"Downloaded {len(downloaded_files)} files")
        
        # Step 2: Extract and validate
        logger.info("Step 2: Extracting and validating data...")
        extraction_results = []
        
        for file_path in downloaded_files:
            try:
                # Detect language (simple heuristic)
                language = self._detect_language(file_path)
                
                # Extract
                result = self.extractor.extract_from_document(file_path, language)
                extraction_results.append(result)
                
                # Save to review directory
                file_id = os.path.splitext(os.path.basename(file_path))[0]
                review_path = self.review_dir / f"{file_id}_extraction.json"
                self.extractor.export_to_json(result, str(review_path))
                
                logger.info(f"Processed {result.filename}: {result.valid_rows}/{result.total_rows} valid (confidence: {result.confidence_score})")
                
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                continue
        
        # Step 3: Generate batch summary
        summary = self._generate_batch_summary(extraction_results)
        
        total_time = time.time() - start_time
        
        logger.info(f"Batch processing complete in {total_time:.2f}s")
        logger.info(f"Summary: {summary['total_valid_rows']}/{summary['total_rows']} valid rows")
        
        return {
            'status': 'success',
            'files_processed': len(extraction_results),
            'summary': summary,
            'processing_time': total_time,
            'results': extraction_results
        }
    
    def approve_and_upload(self, extraction_file: str) -> bool:
        """
        Approve extraction and upload back to Collecct
        
        Args:
            extraction_file: Path to extraction JSON file
            
        Returns:
            True if successful
        """
        try:
            # Load extraction result
            with open(extraction_file, 'r') as f:
                data = json.load(f)
            
            logger.info(f"Approving {data['filename']}...")
            
            # Upload to processed-files container
            blob_name = f"processed/{data['filename']}.json"
            success = self.blob_connector.upload_processed_file(
                extraction_file,
                blob_name,
                container_name="processed-files"
            )
            
            if success:
                # Delete from failed-files container
                original_blob = data['filename']
                self.blob_connector.delete_from_failed(original_blob)
                logger.info(f"Successfully processed {data['filename']}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error approving file: {e}")
            return False
    
    def reject_file(self, filename: str, reason: str) -> bool:
        """
        Reject file and mark for manual processing
        
        Args:
            filename: Name of file to reject
            reason: Rejection reason
            
        Returns:
            True if successful
        """
        try:
            logger.info(f"Rejecting {filename}: {reason}")
            
            # Add metadata to blob indicating rejection
            blob_client = self.blob_connector.container_client.get_blob_client(filename)
            metadata = {
                'status': 'rejected',
                'reason': reason,
                'rejected_at': datetime.utcnow().isoformat()
            }
            blob_client.set_blob_metadata(metadata)
            
            logger.info(f"File {filename} marked for manual processing")
            return True
            
        except Exception as e:
            logger.error(f"Error rejecting file: {e}")
            return False
    
    def run_continuous(self, interval_seconds: int = 300, batch_size: int = 10):
        """
        Run orchestrator continuously, checking for new files
        
        Args:
            interval_seconds: Time between checks (default: 5 min)
            batch_size: Files to process per batch
        """
        logger.info(f"Starting continuous processing (interval: {interval_seconds}s, batch: {batch_size})")
        
        while True:
            try:
                result = self.process_batch(batch_size)
                
                if result['status'] == 'success':
                    logger.info(f"Processed {result['files_processed']} files")
                elif result['status'] == 'no_files':
                    logger.info("No files to process, waiting...")
                
            except Exception as e:
                logger.error(f"Error in continuous processing: {e}")
            
            # Wait before next iteration
            logger.info(f"Waiting {interval_seconds}s before next check...")
            time.sleep(interval_seconds)
    
    def _detect_language(self, file_path: str) -> str:
        """
        Simple language detection based on filename
        TODO: Implement proper language detection
        
        Args:
            file_path: Path to file
            
        Returns:
            Language code (sv, fi, no, en)
        """
        filename_lower = file_path.lower()
        
        if 'fin' in filename_lower or 'suomi' in filename_lower:
            return 'fi'
        elif 'nor' in filename_lower or 'norge' in filename_lower:
            return 'no'
        elif 'eng' in filename_lower or 'english' in filename_lower:
            return 'en'
        else:
            return 'sv'  # Default Swedish
    
    def _generate_batch_summary(self, results: List[ExtractionResult]) -> Dict:
        """
        Generate summary statistics for batch
        
        Args:
            results: List of extraction results
            
        Returns:
            Summary dict
        """
        if not results:
            return {}
        
        total_rows = sum(r.total_rows for r in results)
        total_valid = sum(r.valid_rows for r in results)
        avg_confidence = sum(r.confidence_score for r in results) / len(results)
        total_time = sum(r.processing_time for r in results)
        
        # Count issues
        total_errors = sum(
            len([i for i in r.validation_issues if i.issue_type.value == 'error'])
            for r in results
        )
        total_warnings = sum(
            len([i for i in r.validation_issues if i.issue_type.value == 'warning'])
            for r in results
        )
        
        return {
            'files_processed': len(results),
            'total_rows': total_rows,
            'total_valid_rows': total_valid,
            'total_errors': total_errors,
            'total_warnings': total_warnings,
            'avg_confidence': round(avg_confidence, 2),
            'total_processing_time': round(total_time, 2)
        }


# CLI Interface
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Collecct Orchestrator')
    parser.add_argument('connection_string', nargs='?', help='Azure Blob Storage connection string (not needed with --mock)')
    parser.add_argument('--mock', action='store_true', help='Use mock blob connector (no Azure credentials needed)')
    parser.add_argument('--batch-size', type=int, default=10, help='Files per batch (default: 10)')
    parser.add_argument('--continuous', action='store_true', help='Run continuously')
    parser.add_argument('--interval', type=int, default=300, help='Check interval in seconds (default: 300)')
    
    args = parser.parse_args()
    
    print("🚀 Collecct Orchestrator Starting...")
    print(f"   Mode: {'Mock Blob (Demo)' if args.mock else 'Azure Blob (Production)'}")
    print(f"   Batch size: {args.batch_size}")
    print(f"   Run mode: {'Continuous' if args.continuous else 'Single batch'}")
    if args.continuous:
        print(f"   Interval: {args.interval}s")
    print()
    
    orchestrator = CollecctOrchestrator(
        azure_connection_string=args.connection_string,
        use_mock=args.mock
    )
    
    if args.continuous:
        orchestrator.run_continuous(
            interval_seconds=args.interval,
            batch_size=args.batch_size
        )
    else:
        result = orchestrator.process_batch(batch_size=args.batch_size)
        
        print("\n" + "="*60)
        print("BATCH PROCESSING COMPLETE")
        print("="*60)
        print(f"Status: {result['status']}")
        
        if result['status'] == 'success':
            summary = result['summary']
            print(f"\nFiles processed: {summary['files_processed']}")
            print(f"Total rows: {summary['total_rows']}")
            print(f"Valid rows: {summary['total_valid_rows']}")
            print(f"Errors: {summary['total_errors']}")
            print(f"Warnings: {summary['total_warnings']}")
            print(f"Avg confidence: {summary['avg_confidence'] * 100:.1f}%")
            print(f"Processing time: {summary['total_processing_time']:.2f}s")
            
            print(f"\n✅ Results saved to /tmp/collecct/review/")
            print("   Review files and approve/reject in dashboard")
        
        print()


if __name__ == "__main__":
    main()
