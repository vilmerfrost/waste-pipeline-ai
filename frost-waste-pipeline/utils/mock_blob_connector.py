"""
Mock Azure Blob Connector for Collecct Demo
Simulates Azure Blob Storage using local filesystem
"""

import os
import shutil
import json
from pathlib import Path
from typing import List, Dict, Optional
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MockBlobConnector:
    """
    Mock Azure Blob Storage connector using local filesystem
    Perfect for testing without Azure credentials
    """
    
    def __init__(self, base_dir: str = "/tmp/collecct/mock-blob"):
        """
        Initialize mock blob connector
        
        Args:
            base_dir: Base directory for mock blob storage
        """
        self.base_dir = Path(base_dir)
        self.failed_container = self.base_dir / "failed-files"
        self.processed_container = self.base_dir / "processed-files"
        
        # Create directories
        self.failed_container.mkdir(parents=True, exist_ok=True)
        self.processed_container.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Mock blob connector initialized at {self.base_dir}")
    
    def list_failed_files(self) -> List[Dict]:
        """
        List all files in the failed-files container
        
        Returns:
            List of file metadata dicts
        """
        files = []
        
        for file_path in self.failed_container.glob("*"):
            if file_path.is_file():
                stat = file_path.stat()
                files.append({
                    'name': file_path.name,
                    'size': stat.st_size,
                    'created': datetime.fromtimestamp(stat.st_ctime),
                    'modified': datetime.fromtimestamp(stat.st_mtime),
                    'content_type': self._guess_content_type(file_path)
                })
        
        logger.info(f"Found {len(files)} failed files in mock blob")
        return files
    
    def download_file(self, blob_name: str, local_path: str) -> bool:
        """
        Download a specific file from mock blob storage
        
        Args:
            blob_name: Name of blob to download
            local_path: Local path to save file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            source_path = self.failed_container / blob_name
            
            if not source_path.exists():
                logger.error(f"File not found: {blob_name}")
                return False
            
            # Create directory if doesn't exist
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Copy file
            shutil.copy2(source_path, local_path)
            
            logger.info(f"Downloaded {blob_name} to {local_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error downloading {blob_name}: {e}")
            return False
    
    def upload_processed_file(self, local_path: str, blob_name: str, 
                             container_name: str = "processed-files") -> bool:
        """
        Upload processed file to mock blob storage
        
        Args:
            local_path: Path to local file
            blob_name: Name to save as in blob
            container_name: Target container (default: processed-files)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if container_name == "processed-files":
                target_dir = self.processed_container
            else:
                target_dir = self.base_dir / container_name
                target_dir.mkdir(parents=True, exist_ok=True)
            
            target_path = target_dir / blob_name
            
            # Copy file
            shutil.copy2(local_path, target_path)
            
            logger.info(f"Uploaded {blob_name} to {container_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error uploading {blob_name}: {e}")
            return False
    
    def mark_as_processing(self, blob_name: str) -> bool:
        """
        Mark file as processing (creates metadata file)
        
        Args:
            blob_name: Name of blob to mark
            
        Returns:
            True if successful
        """
        try:
            metadata_path = self.failed_container / f"{blob_name}.meta"
            metadata = {
                'status': 'processing',
                'processor': 'frost-night-factory',
                'timestamp': datetime.utcnow().isoformat()
            }
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f)
            
            logger.info(f"Marked {blob_name} as processing")
            return True
            
        except Exception as e:
            logger.error(f"Error marking {blob_name}: {e}")
            return False
    
    def delete_from_failed(self, blob_name: str) -> bool:
        """
        Delete file from failed-files container
        
        Args:
            blob_name: Name of blob to delete
            
        Returns:
            True if successful
        """
        try:
            file_path = self.failed_container / blob_name
            if file_path.exists():
                file_path.unlink()
            
            # Also delete metadata if exists
            metadata_path = self.failed_container / f"{blob_name}.meta"
            if metadata_path.exists():
                metadata_path.unlink()
            
            logger.info(f"Deleted {blob_name} from failed-files")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting {blob_name}: {e}")
            return False
    
    def fetch_and_process_batch(self, batch_size: int = 10, 
                                download_dir: str = "/tmp/collecct/processing") -> List[str]:
        """
        Fetch a batch of failed files for processing
        
        Args:
            batch_size: Max number of files to fetch
            download_dir: Local directory to download to
            
        Returns:
            List of local file paths
        """
        files = self.list_failed_files()
        batch = files[:batch_size]
        
        downloaded_paths = []
        
        for file_info in batch:
            blob_name = file_info['name']
            local_path = os.path.join(download_dir, blob_name)
            
            # Mark as processing
            self.mark_as_processing(blob_name)
            
            # Download
            if self.download_file(blob_name, local_path):
                downloaded_paths.append(local_path)
        
        logger.info(f"Fetched batch of {len(downloaded_paths)} files")
        return downloaded_paths
    
    def seed_sample_files(self):
        """
        Create sample files for testing
        """
        logger.info("Seeding mock blob with sample files...")
        
        # Create some sample file names (they won't have content, but structure is there)
        sample_files = [
            "waste_invoice_20241215.pdf",
            "collecct_data_batch_5.xlsx",
            "avfall_rapport_20241214.pdf",
            "waste_report_finland.xlsx",
            "invoice_norway_20241213.pdf"
        ]
        
        for filename in sample_files:
            sample_path = self.failed_container / filename
            if not sample_path.exists():
                # Create empty file as placeholder
                sample_path.touch()
                logger.info(f"Created sample file: {filename}")
        
        logger.info(f"✅ Seeded {len(sample_files)} sample files")
        logger.info(f"   Drop real PDF/Excel files in: {self.failed_container}")
    
    def _guess_content_type(self, file_path: Path) -> str:
        """
        Guess content type from file extension
        """
        ext = file_path.suffix.lower()
        content_types = {
            '.pdf': 'application/pdf',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel'
        }
        return content_types.get(ext, 'application/octet-stream')
    
    @property
    def container_client(self):
        """
        Mock container client for compatibility with orchestrator
        """
        return self


# CLI interface
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Mock Azure Blob Connector')
    parser.add_argument('--seed', action='store_true', help='Seed with sample files')
    parser.add_argument('--list', action='store_true', help='List files in mock blob')
    parser.add_argument('--base-dir', type=str, default='/tmp/collecct/mock-blob',
                       help='Base directory for mock blob')
    
    args = parser.parse_args()
    
    connector = MockBlobConnector(base_dir=args.base_dir)
    
    if args.seed:
        connector.seed_sample_files()
    
    if args.list:
        files = connector.list_failed_files()
        if files:
            print(f"\n✅ Found {len(files)} files in mock blob:")
            for f in files:
                print(f"  - {f['name']} ({f['size']} bytes)")
        else:
            print("\n❌ No files found in mock blob")
            print(f"   Drop files in: {connector.failed_container}")


if __name__ == "__main__":
    main()
