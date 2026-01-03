/**
 * Browse Azure Blob Storage containers and folders
 * Lists all containers and their top-level folders
 */

import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

export const dynamic = "force-dynamic";

interface FolderInfo {
  name: string;
  path: string;
  fileCount: number;
}

interface ContainerInfo {
  name: string;
  folders: FolderInfo[];
  rootFileCount: number;
}

export async function GET() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      return NextResponse.json(
        { success: false, error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers: ContainerInfo[] = [];

    // List all containers
    for await (const container of blobServiceClient.listContainers()) {
      const containerClient = blobServiceClient.getContainerClient(container.name);
      const folders = new Map<string, number>();
      let rootFileCount = 0;

      // List all blobs to identify folders
      for await (const blob of containerClient.listBlobsFlat()) {
        const parts = blob.name.split("/");
        
        if (parts.length > 1) {
          // This blob is in a folder
          const folderName = parts[0];
          folders.set(folderName, (folders.get(folderName) || 0) + 1);
        } else {
          // This blob is at the root level
          rootFileCount++;
        }
      }

      // Convert map to array of folder info
      const folderList: FolderInfo[] = Array.from(folders.entries()).map(([name, count]) => ({
        name,
        path: `${container.name}/${name}`,
        fileCount: count,
      }));

      // Sort folders alphabetically
      folderList.sort((a, b) => a.name.localeCompare(b.name));

      containers.push({
        name: container.name,
        folders: folderList,
        rootFileCount,
      });
    }

    // Sort containers alphabetically
    containers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      containers,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Error browsing Azure containers:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

