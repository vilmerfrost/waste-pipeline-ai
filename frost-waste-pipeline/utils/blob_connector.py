"""
Azure Blob Storage Connector for Collecct
Fetches failed files from Simplitics processing
"""

from azure.storage.blob import BlobServiceClient, BlobClient
from azure.core.exceptions import ResourceNotFoundError
import os
import json
from datetime import datetime
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CollecctBlobConnector:
    """
    Connects to Collecct's Azure Blob Storage
    Monitors and fetches files marked as 'failed' by Simplitics
    """
    
    def __init__(self, connection_string: str, container_name: str = "failed-files"):
        """
        Initialize connection to Azure Blob Storage
        
        Args:
            connection_string: Azure Storage connection string
            container_name: Container where failed files are stored
        """
        self.connection_string = connection_string
        self.container_name = container_name
        self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        self.container_client = self.blob_service_client.get_container_client(container_name)
        
    def list_failed_files(self) -> List[Dict]:
        """
        List all files in the failed-files container
        
        Returns:
            List of file metadata dicts
        """
        try:
            blobs = self.container_client.list_blobs()
            files = []
            
            for blob in blobs:
                files.append({
                    'name': blob.name,
                    'size': blob.size,
                    'created': blob.creation_time,
                    'modified': blob.last_modified,
                    'content_type': blob.content_settings.content_type if blob.content_settings else 'unknown'
                })
            
            logger.info(f"Found {len(files)} failed files in blob storage")
            return files
            
        except Exception as e:
            logger.error(f"Error listing failed files: {e}")
            return []
    
    def download_file(self, blob_name: str, local_path: str) -> bool:
        """
        Download a specific file from blob storage
        
        Args:
            blob_name: Name of blob to download
            local_path: Local path to save file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            
            # Create directory if doesn't exist
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Download file
            with open(local_path, "wb") as download_file:
                download_file.write(blob_client.download_blob().readall())
            
            logger.info(f"Downloaded {blob_name} to {local_path}")
            return True
            
        except ResourceNotFoundError:
            logger.error(f"File not found: {blob_name}")
            return False
        except Exception as e:
            logger.error(f"Error downloading {blob_name}: {e}")
            return False
    
    def upload_processed_file(self, local_path: str, blob_name: str, 
                             container_name: str = "processed-files") -> bool:
        """
        Upload processed file back to blob storage
        
        Args:
            local_path: Path to local file
            blob_name: Name to save as in blob
            container_name: Target container (default: processed-files)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get or create container
            container_client = self.blob_service_client.get_container_client(container_name)
            
            # Upload file
            blob_client = container_client.get_blob_client(blob_name)
            with open(local_path, "rb") as data:
                blob_client.upload_blob(data, overwrite=True)
            
            logger.info(f"Uploaded {blob_name} to {container_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error uploading {blob_name}: {e}")
            return False
    
    def mark_as_processing(self, blob_name: str) -> bool:
        """
        Add metadata to blob indicating it's being processed
        
        Args:
            blob_name: Name of blob to mark
            
        Returns:
            True if successful
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            metadata = {
                'status': 'processing',
                'processor': 'frost-night-factory',
                'timestamp': datetime.utcnow().isoformat()
            }
            blob_client.set_blob_metadata(metadata)
            logger.info(f"Marked {blob_name} as processing")
            return True
            
        except Exception as e:
            logger.error(f"Error marking {blob_name}: {e}")
            return False
    
    def delete_from_failed(self, blob_name: str) -> bool:
        """
        Delete file from failed-files container after successful processing
        
        Args:
            blob_name: Name of blob to delete
            
        Returns:
            True if successful
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_client.delete_blob()
            logger.info(f"Deleted {blob_name} from failed-files")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting {blob_name}: {e}")
            return False
    
    def fetch_and_process_batch(self, batch_size: int = 10, 
                                download_dir: str = "/tmp/collecct/failed") -> List[str]:
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


# CLI interface for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python blob_connector.py <connection_string>")
        print("\nExample:")
        print("  python blob_connector.py 'DefaultEndpointsProtocol=https;...'")
        sys.exit(1)
    
    connection_string = sys.argv[1]
    
    print("🔌 Connecting to Azure Blob Storage...")
    connector = CollecctBlobConnector(connection_string)
    
    print("📋 Listing failed files...")
    files = connector.list_failed_files()
    
    if files:
        print(f"\n✅ Found {len(files)} failed files:")
        for f in files[:10]:  # Show first 10
            print(f"  - {f['name']} ({f['size']} bytes)")
        
        if len(files) > 10:
            print(f"  ... and {len(files) - 10} more")
        
        # Test download first file
        if input("\n📥 Download first file? (y/n): ").lower() == 'y':
            first_file = files[0]['name']
            local_path = f"/tmp/collecct/test/{first_file}"
            
            if connector.download_file(first_file, local_path):
                print(f"✅ Downloaded to {local_path}")
            else:
                print("❌ Download failed")
    else:
        print("❌ No failed files found")
