import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { error: "Missing filename" },
        { status: 400 }
      );
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || "arrivalwastedata";

    if (!connectionString) {
      return NextResponse.json(
        { error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    const connector = new AzureBlobConnector(connectionString, containerName);

    // Check if file exists in processed folder (success!)
    const inProcessed = await connector.fileExists("processed", filename);
    if (inProcessed) {
      return NextResponse.json({
        status: "accepted",
        message: "File accepted by Simplitics",
      });
    }

    // Check if back in failed folders (rejected)
    const inFailed = await connector.fileExists("failed-to-process", filename);
    const inUnsupported = await connector.fileExists("unsupported-file-formats", filename);

    if (inFailed || inUnsupported) {
      return NextResponse.json({
        status: "rejected",
        message: "File rejected by Simplitics",
      });
    }

    // Still processing
    return NextResponse.json({
      status: "processing",
      message: "File still being processed",
    });
  } catch (error: any) {
    console.error("Error monitoring file:", error);
    return NextResponse.json(
      { error: error.message || "Failed to monitor file" },
      { status: 500 }
    );
  }
}

