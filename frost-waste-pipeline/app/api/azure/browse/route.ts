/**
 * Browse Azure Blob Storage folders within a specific container
 * Lists folder hierarchy (including empty folders and subfolders)
 * 
 * Container is determined by AZURE_CONTAINER_NAME env variable
 */

import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

export const dynamic = "force-dynamic";

interface FolderInfo {
  name: string;
  path: string;
  fullPath: string; // container/folder for easy selection
  fileCount: number;
  subfolders: FolderInfo[];
  isVirtualDirectory: boolean;
}

interface ContainerInfo {
  name: string;
  folders: FolderInfo[];
  rootFileCount: number;
}

/**
 * Recursively list folders using hierarchy with a delimiter
 * This allows us to see virtual directories (including empty ones)
 */
async function listFoldersRecursively(
  containerClient: any,
  prefix: string = "",
  containerName: string,
  depth: number = 0,
  maxDepth: number = 4
): Promise<{ folders: FolderInfo[]; fileCount: number }> {
  const folders: FolderInfo[] = [];
  let fileCount = 0;

  if (depth > maxDepth) {
    console.log(`    ${"  ".repeat(depth)}⏹️ Max depth (${maxDepth}) reached at: ${prefix || "root"}`);
    return { folders, fileCount };
  }

  const indent = "  ".repeat(depth + 1);

  try {
    // Use listBlobsByHierarchy to get virtual directories
    for await (const item of containerClient.listBlobsByHierarchy("/", { prefix: prefix })) {
      if (item.kind === "prefix") {
        // This is a virtual directory (folder)
        const folderName = item.name.replace(prefix, "").replace(/\/$/, "");
        const fullPrefix = item.name;
        
        console.log(`${indent}📁 Found folder: ${folderName}`);
        
        // Recursively get subfolders
        const subResult = await listFoldersRecursively(
          containerClient,
          fullPrefix,
          containerName,
          depth + 1,
          maxDepth
        );

        const folder: FolderInfo = {
          name: folderName,
          path: prefix ? `${prefix}${folderName}` : folderName,
          fullPath: `${containerName}/${fullPrefix.replace(/\/$/, "")}`,
          fileCount: subResult.fileCount,
          subfolders: subResult.folders,
          isVirtualDirectory: true,
        };

        folders.push(folder);
      } else {
        // This is a blob (file)
        fileCount++;
      }
    }
    
    if (fileCount > 0) {
      console.log(`${indent}📄 ${fileCount} file(s) at this level`);
    }
  } catch (error: any) {
    console.error(`${indent}❌ Error listing folder ${prefix}:`, error?.message || error);
  }

  return { folders, fileCount };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log("\n" + "=".repeat(60));
  console.log("🔍 AZURE BROWSE: Starting folder scan...");
  console.log("=".repeat(60));
  
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const defaultContainer = process.env.AZURE_CONTAINER_NAME;
    
    if (!connectionString) {
      console.error("❌ AZURE_STORAGE_CONNECTION_STRING not configured");
      return NextResponse.json(
        { success: false, error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    // Check for query params to browse a specific path
    const { searchParams } = new URL(request.url);
    const targetContainer = searchParams.get("container") || defaultContainer;
    const targetPrefix = searchParams.get("prefix") || "";
    const maxDepth = parseInt(searchParams.get("maxDepth") || "4");

    console.log(`📦 Container: ${targetContainer || "(all containers - no AZURE_CONTAINER_NAME set)"}`);
    console.log(`📂 Prefix filter: ${targetPrefix || "(root)"}`);
    console.log(`🔢 Max depth: ${maxDepth}`);

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers: ContainerInfo[] = [];

    // If targeting a specific container, only browse that one
    // Otherwise, list all containers (but recommend setting AZURE_CONTAINER_NAME)
    const containersToList: { name: string }[] = [];
    
    if (targetContainer) {
      containersToList.push({ name: targetContainer });
      console.log(`\n🎯 Browsing single container: ${targetContainer}`);
    } else {
      console.log("\n⚠️ No AZURE_CONTAINER_NAME set - listing all containers (slower)");
      console.log("   💡 Tip: Set AZURE_CONTAINER_NAME in your environment for faster browsing");
      for await (const container of blobServiceClient.listContainers()) {
        containersToList.push(container);
        console.log(`  📦 Found container: ${container.name}`);
      }
    }

    console.log(`\n📊 Processing ${containersToList.length} container(s)...\n`);

    for (const container of containersToList) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`📦 Scanning container: ${container.name}`);
      console.log(`${"─".repeat(50)}`);
      
      try {
        const containerClient = blobServiceClient.getContainerClient(container.name);
        
        // Check if container exists
        const exists = await containerClient.exists();
        if (!exists) {
          console.warn(`  ⚠️ Container "${container.name}" does not exist - skipping`);
          continue;
        }
        
        console.log(`  ✅ Container exists, scanning folders...`);

        // Get folder hierarchy recursively
        const result = await listFoldersRecursively(
          containerClient,
          targetPrefix,
          container.name,
          0,
          maxDepth
        );

        // Sort folders alphabetically
        result.folders.sort((a, b) => a.name.localeCompare(b.name));

        containers.push({
          name: container.name,
          folders: result.folders,
          rootFileCount: result.fileCount,
        });
        
        const totalFolders = countFolders(result.folders);
        console.log(`\n  📊 Summary for ${container.name}:`);
        console.log(`     - Root level files: ${result.fileCount}`);
        console.log(`     - Total folders found: ${totalFolders}`);
        
      } catch (containerError: any) {
        console.error(`  ❌ Error accessing container ${container.name}:`, containerError?.message || containerError);
        // Continue with other containers
      }
    }

    // Sort containers alphabetically
    containers.sort((a, b) => a.name.localeCompare(b.name));

    const duration = Date.now() - startTime;
    console.log("\n" + "=".repeat(60));
    console.log(`✅ AZURE BROWSE: Complete in ${duration}ms`);
    console.log(`   Containers: ${containers.length}`);
    console.log(`   Total folders: ${containers.reduce((sum, c) => sum + countFolders(c.folders), 0)}`);
    console.log("=".repeat(60) + "\n");

    return NextResponse.json({
      success: true,
      containers,
      defaultContainer: defaultContainer || null,
      timestamp: new Date().toISOString(),
      scanDuration: duration,
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("\n" + "=".repeat(60));
    console.error(`❌ AZURE BROWSE: Failed after ${duration}ms`);
    console.error(`   Error: ${error?.message || error}`);
    console.error("=".repeat(60) + "\n");
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Helper to count total folders recursively
function countFolders(folders: FolderInfo[]): number {
  return folders.reduce((sum, folder) => {
    return sum + 1 + countFolders(folder.subfolders);
  }, 0);
}
