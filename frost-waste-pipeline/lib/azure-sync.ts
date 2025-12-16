import { BlobServiceClient } from "@azure/storage-blob";
import { createServiceRoleClient } from "./supabase";

// Konfiguration från deras dokument
const AZURE_CONN_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "arrivalwastedata";

export async function syncFromAzure() {
  if (!AZURE_CONN_STRING) throw new Error("Azure Connection String missing");

  const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONN_STRING);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  console.log("🔄 Checking Azure for new files...");

  // 1. LISTA FILER I 'incoming'
  // Deras mapp: sacollecctanalytics.blob.core.windows.net/arrivalwastedata/incoming
  for await (const blob of containerClient.listBlobsFlat({ prefix: "incoming/" })) {
    
    console.log(`📄 Found file: ${blob.name}`);
    
    // 2. LADDA NER TILL FROST
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    
    // Konvertera stream till buffer för uppladdning till Supabase
    const chunks = [];
    for await (const chunk of downloadBlockBlobResponse.readableStreamBody!) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // 3. SKICKA TILL VÅR AI-PROCESS (Samma som när man drar & släpper)
    // (Här anropar vi din uploadAndEnqueueDocument funktion internt)
    await uploadToFrost(blob.name, buffer);

    // 4. FLYTTA TILL 'processing' I AZURE (Så vi inte hämtar den igen)
    // ... kod för att flytta blob ...
  }
}

export async function pushToAzure(documentId: string, csvData: string) {
    // Denna körs när en fil blir "Verified" i Frost
    if (!AZURE_CONN_STRING) throw new Error("Azure Connection String missing");
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONN_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Deras output-mapp
    const fileName = `output/processed_${documentId}.csv`;
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    console.log(`🚀 Uploading processed data to Azure: ${fileName}`);
    await blockBlobClient.upload(csvData, csvData.length);
}

// Hjälpfunktion för demo
async function uploadToFrost(filename: string, buffer: Buffer) {
    console.log("🤖 Frost AI processing started for:", filename);
    // ... Logic to insert into Supabase "documents" table ...
    // I en riktig implementation skulle vi här:
    // 1. Skapa en File från buffer
    // 2. Anropa processDocument internt
    // 3. Spara till Supabase storage
}

