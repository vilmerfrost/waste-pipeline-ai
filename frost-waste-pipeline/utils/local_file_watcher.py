"""
Local File Watcher for Collecct Demo
Watches /tmp/collecct/incoming/ for new files and processes them automatically
"""

import os
import sys
import time
import logging
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import shutil

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.extraction_agent import CollecctExtractorAgent

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FileProcessingHandler(FileSystemEventHandler):
    """
    Handles file creation events and processes them
    """
    
    def __init__(self, incoming_dir: str, review_dir: str, processed_dir: str, failed_dir: str):
        self.incoming_dir = Path(incoming_dir)
        self.review_dir = Path(review_dir)
        self.processed_dir = Path(processed_dir)
        self.failed_dir = Path(failed_dir)
        self.extractor = CollecctExtractorAgent()
        
        # Create directories
        for dir_path in [self.review_dir, self.processed_dir, self.failed_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"File watcher initialized")
        logger.info(f"  Watching: {self.incoming_dir}")
        logger.info(f"  Results: {self.review_dir}")
        logger.info(f"  Processed: {self.processed_dir}")
        logger.info(f"  Failed: {self.failed_dir}")
    
    def on_created(self, event):
        """
        Called when a new file is created
        """
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        
        # Only process PDF and Excel files
        if file_path.suffix.lower() not in ['.pdf', '.xlsx', '.xls']:
            logger.debug(f"Skipping non-document file: {file_path.name}")
            return
        
        # Wait a moment for file to be fully written
        time.sleep(1)
        
        logger.info(f"📄 New file detected: {file_path.name}")
        self.process_file(file_path)
    
    def process_file(self, file_path: Path):
        """
        Process a single file
        """
        try:
            # Detect language (simple heuristic)
            language = self._detect_language(str(file_path))
            
            logger.info(f"🤖 Processing {file_path.name} (language: {language})...")
            
            # Extract data
            result = self.extractor.extract_from_document(str(file_path), language)
            
            # Save to review directory
            file_id = file_path.stem
            review_path = self.review_dir / f"{file_id}_extraction.json"
            self.extractor.export_to_json(result, str(review_path))
            
            logger.info(f"✅ Processed {file_path.name}")
            logger.info(f"   Summary: {result.summary}")
            logger.info(f"   Confidence: {result.confidence_score * 100:.1f}%")
            logger.info(f"   Valid rows: {result.valid_rows}/{result.total_rows}")
            
            if result.validation_issues:
                logger.info(f"   Issues: {len(result.validation_issues)}")
            
            # Move to processed directory
            processed_path = self.processed_dir / file_path.name
            shutil.move(str(file_path), str(processed_path))
            logger.info(f"📦 Moved to processed: {processed_path}")
            
        except Exception as e:
            logger.error(f"❌ Error processing {file_path.name}: {e}")
            
            # Move to failed directory
            failed_path = self.failed_dir / file_path.name
            try:
                shutil.move(str(file_path), str(failed_path))
                logger.info(f"📦 Moved to failed: {failed_path}")
            except Exception as move_error:
                logger.error(f"Failed to move file: {move_error}")
    
    def _detect_language(self, file_path: str) -> str:
        """
        Simple language detection based on filename
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


def main():
    """
    Main function to start file watcher
    """
    import argparse
    
    parser = argparse.ArgumentParser(description='Collecct Local File Watcher')
    parser.add_argument('--incoming', type=str, default='/tmp/collecct/incoming',
                       help='Directory to watch for new files')
    parser.add_argument('--review', type=str, default='/tmp/collecct/review',
                       help='Directory for extraction results')
    parser.add_argument('--processed', type=str, default='/tmp/collecct/processed',
                       help='Directory for processed files')
    parser.add_argument('--failed', type=str, default='/tmp/collecct/failed',
                       help='Directory for failed files')
    
    args = parser.parse_args()
    
    # Create incoming directory if it doesn't exist
    incoming_path = Path(args.incoming)
    incoming_path.mkdir(parents=True, exist_ok=True)
    
    print("="*60)
    print("🚀 COLLECCT FILE WATCHER STARTING")
    print("="*60)
    print(f"📂 Watching: {args.incoming}")
    print(f"📂 Results: {args.review}")
    print(f"📂 Processed: {args.processed}")
    print(f"📂 Failed: {args.failed}")
    print()
    print("💡 Drop PDF/Excel files in the incoming directory")
    print("   They will be processed automatically!")
    print()
    print("Press Ctrl+C to stop")
    print("="*60)
    print()
    
    # Create event handler
    event_handler = FileProcessingHandler(
        incoming_dir=args.incoming,
        review_dir=args.review,
        processed_dir=args.processed,
        failed_dir=args.failed
    )
    
    # Create observer
    observer = Observer()
    observer.schedule(event_handler, args.incoming, recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Stopping file watcher...")
        observer.stop()
    
    observer.join()
    logger.info("File watcher stopped")


if __name__ == "__main__":
    main()
