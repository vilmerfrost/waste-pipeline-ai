import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";
import { createServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("azure_input_folders")
      .eq("user_id", "default")
      .single();

    if (settingsError) {
      console.warn("Could not fetch settings:", settingsError);
    }

    const inputFolders = settings?.azure_input_folders;
    
    // Check if folders are configured
    if (!inputFolders || !Array.isArray(inputFolders) || inputFolders.length === 0) {
      return NextResponse.json({
        success: true,
        files: [],
        count: 0,
        inputFolders: [],
        message: "No input folders configured. Please configure folders in Settings → Azure & GUIDs.",
      });
    }
    
    // Log configured folders for debugging
    const folderPaths = inputFolders
      .filter((f: any) => f.enabled !== false)
      .map((f: any) => f.folder ? `${f.container}/${f.folder}` : f.container);
    console.log(`📁 Listing files from configured folders: ${folderPaths.join(", ")}`);

    const connector = new AzureBlobConnector(connectionString, containerName);
    const files = await connector.listFailedFiles(inputFolders);

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
      inputFolders: folderPaths,
    });
  } catch (error: any) {
    console.error("Error listing failed files:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list files" },
      { status: 500 }
    );
  }
}

