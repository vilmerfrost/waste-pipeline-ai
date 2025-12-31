const { BlobServiceClient } = require('@azure/storage-blob');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

async function testListFailed() {
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  
  const failedFolders = [
    'unable-to-process',
    'unsupported-file-format'  // Note: singular, not plural!
  ];
  
  const allFiles = [];
  
  for (const folder of failedFolders) {
    console.log(`\n📁 Checking: ${folder}`);
    
    try {
      const containerClient = blobService.getContainerClient(folder);
      
      let count = 0;
      for await (const blob of containerClient.listBlobsFlat()) {
        allFiles.push({
          id: blob.name.replace(/\//g, '_').replace(/\./g, '_'),
          name: blob.name,
          size: blob.properties.contentLength,
          source_folder: folder
        });
        count++;
        
        if (count <= 3) {
          console.log(`  ✓ ${blob.name}`);
        }
      }
         console.log(`  Total: ${count} files`);
      
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }
  
  console.log(`\n📊 TOTAL FILES FOUND: ${allFiles.length}`);
  console.log(`\nThis is what the API should return!`);
}

testListFailed().catch(console.error);
