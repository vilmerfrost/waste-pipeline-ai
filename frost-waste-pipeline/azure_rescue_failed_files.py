#!/usr/bin/env python3
"""
AZURE AUTO-FETCH - RESCUE FAILED FILES
Pull files from unable-to-process and unsupported-file-format containers
Process them with our adaptive extraction system

This script can work in two modes:
1. Direct mode: Downloads files and uploads via API
2. API mode: Calls the existing /api/auto-fetch/manual endpoint (recommended)
"""

import os
import sys
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
import requests
from pathlib import Path
import tempfile

# Load environment variables
load_dotenv()

# Configuration
CONTAINERS_TO_FETCH = [
    "unable-to-process",
    "unsupported-file-format"
]

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

def fetch_failed_files_via_api(limit=None, api_url=None):
    """
    Fetch files using the existing /api/auto-fetch/manual endpoint
    This is the recommended approach as it handles everything server-side
    """
    
    base_url = api_url or API_BASE_URL
    
    print("🚀 AZURE AUTO-FETCH - RESCUE MISSION (API MODE)")
    print("=" * 70)
    print(f"📡 Calling API: {base_url}/api/auto-fetch/manual")
    print()
    
    try:
        response = requests.post(
            f"{base_url}/api/auto-fetch/manual",
            timeout=300,  # 5 minutes timeout
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ API Response:")
            print(f"   Total files found: {data.get('total', 0)}")
            print(f"   Files processed: {data.get('processed', 0)}")
            print(f"   Errors: {data.get('errors', 0)}")
            
            if data.get('files'):
                print("\n📄 Processed files:")
                for file_info in data['files']:
                    status_icon = "✅" if file_info.get('status') == 'queued' else "❌"
                    print(f"   {status_icon} {file_info.get('filename')} - {file_info.get('status')}")
                    if file_info.get('documentId'):
                        print(f"      Document ID: {file_info.get('documentId')}")
            
            return True
        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to API at {base_url}")
        print("   Make sure the Next.js server is running:")
        print("   npm run dev")
        return False
    except requests.exceptions.Timeout:
        print("❌ API request timed out (processing may take a while)")
        return False
    except Exception as e:
        print(f"❌ Error calling API: {e}")
        return False

def fetch_failed_files_direct(limit=10, dry_run=False):
    """
    Fetch files directly from Azure and show what would be fetched
    NOTE: Direct upload mode requires a file upload API endpoint.
    For production use, prefer --api-mode which uses /api/auto-fetch/manual
    """
    
    print("🚀 AZURE AUTO-FETCH - RESCUE MISSION (DIRECT MODE)")
    print("=" * 70)
    print("⚠️  NOTE: Direct mode lists files only.")
    print("   Use --api-mode for automatic fetching and processing.")
    print()
    
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        print("❌ AZURE_STORAGE_CONNECTION_STRING not found in .env")
        return False
    
    blob_service_client = BlobServiceClient.from_connection_string(connection_string)
    
    total_found = 0
    
    for container_name in CONTAINERS_TO_FETCH:
        print(f"\n📦 Checking container: {container_name}")
        print("-" * 70)
        
        try:
            container_client = blob_service_client.get_container_client(container_name)
            blobs = list(container_client.list_blobs())
            
            # Filter for Excel and PDF files
            valid_files = [
                blob for blob in blobs
                if blob.name.lower().endswith(('.xlsx', '.xls', '.pdf'))
            ]
            
            print(f"   Found {len(valid_files)} valid files (Excel/PDF)")
            total_found += len(valid_files)
            
            # Show files up to limit
            files_to_show = valid_files[:limit] if limit else valid_files
            
            for blob in files_to_show:
                size_mb = blob.size / 1024 / 1024
                file_type = "PDF" if blob.name.lower().endswith('.pdf') else "EXCEL"
                print(f"   📄 {blob.name} [{file_type}] ({size_mb:.2f} MB)")
            
            if limit and len(valid_files) > limit:
                print(f"\n   ℹ️  Showing first {limit} of {len(valid_files)} files")
                print(f"   ℹ️  Use --api-mode to fetch and process all files")
        
        except Exception as e:
            print(f"   ❌ Error accessing container: {e}")
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 SUMMARY:")
    print(f"   Total files found: {total_found}")
    
    if not dry_run:
        print("\n   💡 To fetch and process these files, use:")
        print(f"      python azure_rescue_failed_files.py --api-mode")
    
    print("=" * 70)
    
    return total_found > 0

def get_content_type(filename):
    """Get content type based on file extension"""
    ext = filename.lower().split('.')[-1]
    content_types = {
        'pdf': 'application/pdf',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel'
    }
    return content_types.get(ext, 'application/octet-stream')

def list_failed_files():
    """Just list what files are available without fetching"""
    
    print("📋 LISTING FAILED FILES IN AZURE")
    print("=" * 70)
    
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        print("❌ AZURE_STORAGE_CONNECTION_STRING not found in .env")
        return
    
    blob_service_client = BlobServiceClient.from_connection_string(connection_string)
    
    for container_name in CONTAINERS_TO_FETCH:
        print(f"\n📦 Container: {container_name}")
        print("-" * 70)
        
        try:
            container_client = blob_service_client.get_container_client(container_name)
            blobs = list(container_client.list_blobs())
            
            # Categorize files
            excel_files = [b for b in blobs if b.name.lower().endswith(('.xlsx', '.xls'))]
            pdf_files = [b for b in blobs if b.name.lower().endswith('.pdf')]
            other_files = [b for b in blobs if b not in excel_files and b not in pdf_files]
            
            print(f"   📊 Excel files: {len(excel_files)}")
            print(f"   📄 PDF files: {len(pdf_files)}")
            print(f"   📁 Other files: {len(other_files)}")
            print(f"   📦 Total: {len(blobs)}")
            
            # Show sample filenames
            if excel_files:
                print(f"\n   Sample Excel files:")
                for blob in excel_files[:3]:
                    size_mb = blob.size / 1024 / 1024
                    print(f"     - {blob.name} ({size_mb:.2f} MB)")
            
            if pdf_files:
                print(f"\n   Sample PDF files:")
                for blob in pdf_files[:3]:
                    size_mb = blob.size / 1024 / 1024
                    print(f"     - {blob.name} ({size_mb:.2f} MB)")
        
        except Exception as e:
            print(f"   ❌ Error: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Fetch failed files from Azure and process them",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use API mode (recommended - uses existing endpoint)
  python azure_rescue_failed_files.py --api-mode
  
  # Direct mode - download and upload files
  python azure_rescue_failed_files.py --limit 10
  
  # Dry run - just see what would be fetched
  python azure_rescue_failed_files.py --dry-run
  
  # List available files
  python azure_rescue_failed_files.py --list
        """
    )
    
    parser.add_argument("--limit", type=int, default=None, 
                       help="Max files to fetch (default: None = all)")
    parser.add_argument("--dry-run", action="store_true", 
                       help="List files without fetching")
    parser.add_argument("--list", action="store_true", 
                       help="Just list available files")
    parser.add_argument("--api-mode", action="store_true",
                       help="Use API mode (calls /api/auto-fetch/manual) [RECOMMENDED]")
    parser.add_argument("--api-url", type=str, default=None,
                       help="Override API base URL")
    
    args = parser.parse_args()
    
    print()
    
    if args.list:
        list_failed_files()
    elif args.dry_run:
        # Dry run - just list what would be fetched
        success = fetch_failed_files_direct(limit=args.limit, dry_run=True)
        print("\n💡 This was a dry run. Use --api-mode to actually fetch files.")
    else:
        # Default: Use API mode (recommended)
        api_url = args.api_url or API_BASE_URL
        success = fetch_failed_files_via_api(limit=args.limit, api_url=api_url)
        if success:
            print("\n🎉 Files fetched successfully via API!")
        else:
            print("\n❌ Failed to fetch files via API")
            print("   💡 Make sure Next.js server is running: npm run dev")
            sys.exit(1)
    
    print()

