import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";
import { createServiceRoleClient } from "@/lib/supabase";

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

    // Fetch folder settings from database
    const supabase = createServiceRoleClient();
    const { data: settings } = await supabase
      .from("settings")
      .select("azure_input_folders")
      .eq("user_id", "default")
      .single();

    const inputFolders = settings?.azure_input_folders;

    const connector = new AzureBlobConnector(connectionString, containerName);
    const files = await connector.listFailedFiles(inputFolders);

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
      inputFolders: inputFolders || "default",
    });
  } catch (error: any) {
    console.error("Error listing failed files:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list files" },
      { status: 500 }
    );
  }
}

