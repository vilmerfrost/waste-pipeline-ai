/**
 * Debug endpoint to test Azure connection
 * Returns detailed information about Azure connectivity
 */

import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    azure: {
      connectionString: null,
      containers: [],
      errors: [],
    },
  };

  try {
    // Check environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    results.environment = {
      hasConnectionString: !!connectionString,
      connectionStringLength: connectionString?.length || 0,
      connectionStringPreview: connectionString 
        ? `${connectionString.substring(0, 50)}...` 
        : "NOT SET",
      nodeEnv: process.env.NODE_ENV,
    };

    if (!connectionString) {
      results.azure.errors.push("AZURE_STORAGE_CONNECTION_STRING is not set");
      return NextResponse.json(results);
    }

    // Try to connect to Azure
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // List containers
    const containersToCheck = [
      "unable-to-process",
      "unsupported-file-format", 
      "completed",
      "arrivalwastedata"
    ];

    for (const containerName of containersToCheck) {
      try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const exists = await containerClient.exists();
        
        let fileCount = 0;
        let files: string[] = [];
        
        if (exists) {
          for await (const blob of containerClient.listBlobsFlat()) {
            fileCount++;
            if (files.length < 5) {
              files.push(blob.name);
            }
          }
        }

        results.azure.containers.push({
          name: containerName,
          exists,
          fileCount,
          sampleFiles: files,
        });
      } catch (error: any) {
        results.azure.containers.push({
          name: containerName,
          exists: false,
          error: error.message,
        });
      }
    }

    results.azure.status = "connected";
    
  } catch (error: any) {
    results.azure.status = "error";
    results.azure.errors.push(error.message);
  }

  return NextResponse.json(results, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    }
  });
}




