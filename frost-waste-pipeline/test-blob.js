const { BlobServiceClient } = require('@azure/storage-blob');

const connectionString = "DefaultEndpointsProtocol=https;AccountName=dlpdqsource001;AccountKey=NQ+N8SZE6yxr2kI+vNWQl4wXNCCScXvlrB07IaRzE2DBU9x7KH1Q/a59zXMgCqz5qnfqiAei0P04+AStZEkTaA==;EndpointSuffix=core.windows.net";

async function main() {
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  
  console.log('📦 ALL CONTAINERS:');
  console.log('');
  for await (const container of blobService.listContainers()) {
    console.log('  ✓ ' + container.name);
  }
  
  console.log('');
  console.log('📁 FILES IN "unable-to-process":');
  console.log('');
  try {
    const container1 = blobService.getContainerClient('unable-to-process');
    let count1 = 0;
    for await (const blob of container1.listBlobsFlat()) {
      console.log('  - ' + blob.name + ' (' + blob.properties.contentLength + ' bytes)');
      count1++;
    }
    console.log('Total: ' + count1 + ' files');
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
  
  console.log('');
  console.log('📁 FILES IN "unsupported-file-format":');
  console.log('');
  try {
    const container2 = blobService.getContainerClient('unsupported-file-format');
    let count2 = 0;
    for await (const blob of container2.listBlobsFlat()) {
      console.log('  - ' + blob.name + ' (' + blob.properties.contentLength + ' bytes)');
      count2++;
    }
    console.log('Total: ' + count2 + ' files');
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
  
  console.log('');
  console.log('📁 FILES IN "completed":');
  console.log('');
  try {
    const container3 = blobService.getContainerClient('completed');
    let count3 = 0;
    for await (const blob of container3.listBlobsFlat()) {
      console.log('  - ' + blob.name + ' (' + blob.properties.contentLength + ' bytes)');
      count3++;
    }
    console.log('Total: ' + count3 + ' files');
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

main().catch(console.error);
