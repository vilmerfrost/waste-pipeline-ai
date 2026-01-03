/**
 * Azure Blob Storage Connector - TypeScript Implementation
 * Matches Python azure_blob_connector.py functionality
 */

import { BlobServiceClient, ContainerClient, BlockBlobClient } from "@azure/storage-blob";

export interface FileInfo {
  id: string;
  name: string;
  full_path: string;
  size: number;
  source_folder: string;
  created: Date;
  modified: Date;
  content_type: string;
}

export class AzureBlobConnector {
  private containerClient: ContainerClient;
  private containerName: string;
  private connectionString: string;
  private blobServiceClient: BlobServiceClient;

  constructor(connectionString: string, containerName: string = "arrivalwastedata") {
    this.connectionString = connectionString;
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(containerName);
    this.containerName = containerName;
  }

  /**
   * List all files from failed containers
   * Checks containers: unable-to-process and unsupported-file-format
   * @param customFolders - Optional array of {container, folder} to check instead of defaults
   */
  async listFailedFiles(customFolders?: Array<{container: string; folder: string; enabled?: boolean}>): Promise<FileInfo[]> {
    const allFailedFiles: FileInfo[] = [];
    
    // Use custom folders if provided, otherwise use defaults
    const foldersToCheck = customFolders 
      ? customFolders.filter(f => f.enabled !== false).map(f => ({
          container: f.container,
          folder: f.folder || ""
        }))
      : [
          { container: 'unable-to-process', folder: '' },
          { container: 'unsupported-file-format', folder: '' }
        ];
    
    for (const { container: containerName, folder } of foldersToCheck) {
      try {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        
        // List blobs - if folder is specified, use it as prefix
        const listOptions = folder ? { prefix: folder + "/" } : {};
        
        for await (const blob of containerClient.listBlobsFlat(listOptions)) {
          // Skip folder markers
          if (blob.name.endsWith("/")) continue;
          
          const fileInfo: FileInfo = {
            id: blob.name.replace(/\//g, "_").replace(/\./g, "_"),
            name: blob.name.split("/").pop() || blob.name,
            full_path: blob.name,
            size: blob.properties.contentLength || 0,
            source_folder: containerName,
            created: blob.properties.createdOn || new Date(),
            modified: blob.properties.lastModified || new Date(),
            content_type: blob.properties.contentType || "unknown",
          };
          
          allFailedFiles.push(fileInfo);
        }
        
        const locationLabel = folder ? `${containerName}/${folder}` : containerName;
        console.log(`✅ Found ${allFailedFiles.length} files in ${locationLabel}`);
        
      } catch (error) {
        const locationLabel = folder ? `${containerName}/${folder}` : containerName;
        console.error(`❌ Error listing files in ${locationLabel}:`, error);
        continue;
      }
    }
    
    return allFailedFiles;
  }

  /**
   * Download file from blob to buffer
   * @param blobPath - Full path to blob (or just blob name if containerName is provided)
   * @param containerName - Optional container name (if not provided, uses default container)
   */
  async downloadFile(blobPath: string, containerName?: string): Promise<Buffer> {
    const container = containerName 
      ? this.blobServiceClient.getContainerClient(containerName)
      : this.containerClient;
    
    const blobClient = container.getBlobClient(blobPath);
    const downloadResponse = await blobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error("No readable stream body");
    }
    
    const chunks: Uint8Array[] = [];
    for await (const chunk of downloadResponse.readableStreamBody as any) {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      }
    }
    
    return Buffer.concat(chunks);
  }

  /**
   * Upload processed Excel file to incoming/ folder
   */
  async uploadToIncoming(buffer: Buffer, filename: string): Promise<boolean> {
    try {
      const blobPath = `incoming/${filename}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);
      
      // Convert Buffer to Uint8Array for upload
      const uint8Array = new Uint8Array(buffer);
      
      await blockBlobClient.uploadData(uint8Array, {
        blobHTTPHeaders: {
          blobContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });

      return true;
    } catch (error) {
      console.error("Error uploading to incoming:", error);
      return false;
    }
  }

  /**
   * Check if file exists in specified folder
   */
  async fileExists(folder: string, filename: string): Promise<boolean> {
    try {
      const blobPath = `${folder}/${filename}`;
      const blobClient = this.containerClient.getBlobClient(blobPath);
      return await blobClient.exists();
    } catch {
      return false;
    }
  }

  /**
   * Delete file from blob
   */
  async deleteFile(blobPath: string): Promise<boolean> {
    try {
      const blobClient = this.containerClient.getBlobClient(blobPath);
      await blobClient.delete();
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
  }

  /**
   * Upload Excel file to output container/folder
   * @param fileName - Name of the file to upload
   * @param fileContent - File content as Buffer
   * @param contentType - MIME type of the file
   * @param outputPath - Optional output path (container or container/folder). Defaults to "completed"
   */
  async uploadToCompleted(
    fileName: string, 
    fileContent: Buffer,
    contentType: string = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    outputPath?: string
  ): Promise<string> {
    // Parse output path - can be "container" or "container/folder"
    const pathToUse = outputPath || "completed";
    const pathParts = pathToUse.split("/");
    const containerName = pathParts[0];
    const folderPath = pathParts.slice(1).join("/");
    
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    
    // Ensure container exists
    await containerClient.createIfNotExists();

    // Build full blob path
    const blobPath = folderPath ? `${folderPath}/${fileName}` : fileName;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    
    // Convert Buffer to Uint8Array for upload
    const uint8Array = new Uint8Array(fileContent);
    
    await blockBlobClient.uploadData(uint8Array, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });

    console.log(`✅ Uploaded to Azure: ${containerName}/${blobPath}`);
    
    return blockBlobClient.url;
  }

  /**
   * Delete file from input container after successful processing
   */
  async deleteFromInput(containerName: string, fileName: string): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(fileName);
    
    await blobClient.deleteIfExists();
    console.log(`🗑️ Deleted from ${containerName}: ${fileName}`);
  }

  /**
   * Fetch all files from input containers (unable-to-process, unsupported-file-format)
   */
  async fetchFilesFromInput(): Promise<Array<{ name: string; url: string; container: string }>> {
    const files: Array<{ name: string; url: string; container: string }> = [];
    const inputContainers = ["unable-to-process", "unsupported-file-format"];

    for (const containerName of inputContainers) {
      try {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        
        for await (const blob of containerClient.listBlobsFlat()) {
          if (blob.name.endsWith("/")) continue; // Skip folder markers
          
          const blobClient = containerClient.getBlobClient(blob.name);
          files.push({
            name: blob.name,
            url: blobClient.url,
            container: containerName
          });
        }
      } catch (error) {
        console.error(`Error fetching from ${containerName}:`, error);
      }
    }

    return files;
  }
}

