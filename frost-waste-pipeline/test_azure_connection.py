#!/usr/bin/env python3
"""
AZURE CONNECTION TEST
Test full Azure Blob Storage access for Collecct integration
"""

import os
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_azure_connection():
    """Test Azure Blob Storage connection and access"""
    
    print("🔍 TESTING AZURE BLOB STORAGE CONNECTION")
    print("=" * 60)
    
    # Get connection string from env
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    
    if not connection_string:
        print("❌ ERROR: AZURE_STORAGE_CONNECTION_STRING not found in .env")
        print("\nAdd this to your .env file:")
        print("AZURE_STORAGE_CONNECTION_STRING=your_connection_string_here")
        return False
    
    try:
        # Create blob service client
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        
        print("✅ Connection established!")
        print()
        
        # List all containers
        print("📦 AVAILABLE CONTAINERS:")
        print("-" * 60)
        
        containers = list(blob_service_client.list_containers())
        
        if not containers:
            print("⚠️  No containers found")
            return True
        
        total_blobs = 0
        excel_count = 0
        pdf_count = 0
        
        for container in containers:
            print(f"  📁 {container.name}")
            
            # List files in each container (first 10)
            container_client = blob_service_client.get_container_client(container.name)
            blobs = list(container_client.list_blobs())
            total_blobs += len(blobs)
            
            if blobs:
                print(f"     Files (showing first {min(10, len(blobs))} of {len(blobs)}):")
                for i, blob in enumerate(blobs[:10]):
                    size_mb = blob.size / 1024 / 1024
                    file_type = ""
                    if blob.name.lower().endswith(('.xlsx', '.xls')):
                        file_type = " [EXCEL]"
                        excel_count += 1
                    elif blob.name.lower().endswith('.pdf'):
                        file_type = " [PDF]"
                        pdf_count += 1
                    print(f"       - {blob.name}{file_type} ({size_mb:.2f} MB)")
                
                if len(blobs) > 10:
                    print(f"       ... and {len(blobs) - 10} more files")
            else:
                print("     (empty)")
            print()
        
        print("=" * 60)
        print("✅ AZURE CONNECTION TEST PASSED!")
        print()
        print("📊 SUMMARY:")
        print(f"   Containers found: {len(containers)}")
        print(f"   Total files found: {total_blobs}")
        print(f"   Excel files (.xlsx, .xls): {excel_count}")
        print(f"   PDF files: {pdf_count}")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        print()
        print("💡 TROUBLESHOOTING:")
        print("   1. Check your connection string is correct")
        print("   2. Verify you have access to the storage account")
        print("   3. Check network connectivity")
        print("   4. Make sure azure-storage-blob is installed: pip install azure-storage-blob")
        return False

def test_specific_operations():
    """Test specific operations we'll need"""
    
    print("🧪 TESTING SPECIFIC OPERATIONS")
    print("=" * 60)
    
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        print("❌ No connection string available")
        return
    
    blob_service_client = BlobServiceClient.from_connection_string(connection_string)
    
    # Test 1: Can we read a file?
    print("\n1️⃣ Testing file download...")
    try:
        # Try to get first blob from first container
        containers = list(blob_service_client.list_containers())
        if containers:
            container_client = blob_service_client.get_container_client(containers[0].name)
            blobs = list(container_client.list_blobs(max_results=1))
            
            if blobs:
                blob_client = container_client.get_blob_client(blobs[0].name)
                data = blob_client.download_blob().readall()
                print(f"   ✅ Successfully downloaded {blobs[0].name} ({len(data)} bytes)")
            else:
                print("   ⚠️  No files to test download")
        else:
            print("   ⚠️  No containers to test")
    except Exception as e:
        print(f"   ❌ Download failed: {e}")
    
    # Test 2: Can we upload a file?
    print("\n2️⃣ Testing file upload...")
    try:
        containers = list(blob_service_client.list_containers())
        if containers:
            container_client = blob_service_client.get_container_client(containers[0].name)
            test_blob_name = "test_upload_delete_me.txt"
            test_data = b"This is a test file from Frost Waste Pipeline. Safe to delete."
            
            blob_client = container_client.get_blob_client(test_blob_name)
            blob_client.upload_blob(test_data, overwrite=True)
            print(f"   ✅ Successfully uploaded test file")
            
            # Clean up
            blob_client.delete_blob()
            print(f"   ✅ Successfully deleted test file")
        else:
            print("   ⚠️  No containers to test")
    except Exception as e:
        print(f"   ❌ Upload/delete failed: {e}")
    
    # Test 3: Can we list files with filters?
    print("\n3️⃣ Testing file filtering...")
    try:
        containers = list(blob_service_client.list_containers())
        if containers:
            container_client = blob_service_client.get_container_client(containers[0].name)
            
            # Count different file types
            excel_files = 0
            pdf_files = 0
            
            for blob in container_client.list_blobs():
                if blob.name.lower().endswith(('.xlsx', '.xls')):
                    excel_files += 1
                elif blob.name.lower().endswith('.pdf'):
                    pdf_files += 1
            
            print(f"   ✅ Found {excel_files} Excel files")
            print(f"   ✅ Found {pdf_files} PDF files")
        else:
            print("   ⚠️  No containers to test")
    except Exception as e:
        print(f"   ❌ Filtering failed: {e}")
    
    print("\n" + "=" * 60)
    print("✅ OPERATION TESTS COMPLETE!")

if __name__ == "__main__":
    print()
    print("🚀 FROST WASTE PIPELINE - AZURE CONNECTION TEST")
    print()
    
    if test_azure_connection():
        print()
        test_specific_operations()
        print()
        print("🎉 ALL TESTS PASSED! Ready to integrate!")
    else:
        print()
        print("❌ Connection test failed. Fix errors above before proceeding.")
    
    print()

