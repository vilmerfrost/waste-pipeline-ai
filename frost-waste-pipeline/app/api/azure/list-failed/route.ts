import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export async function GET() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || "arrivalwastedata";

    if (!connectionString) {
      return NextResponse.json(
        { error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    const connector = new AzureBlobConnector(connectionString, containerName);
    const files = await connector.listFailedFiles();

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error: any) {
    console.error("Error listing failed files:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list files" },
      { status: 500 }
    );
  }
}

