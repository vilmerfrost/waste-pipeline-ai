import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

// POST /api/settings/synonyms - Add or remove synonym
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();

  try {
    const body = await request.json();
    const { action, category, synonym } = body;

    // Validate required fields (synonym not required for add_category/remove_category)
    if (!action || !category) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: action and category" },
        { status: 400 }
      );
    }

    // Synonym is required for add/remove actions
    if ((action === "add" || action === "remove") && !synonym) {
      return NextResponse.json(
        { success: false, error: "Missing required field: synonym" },
        { status: 400 }
      );
    }

    // Fetch current settings
    const { data: settings, error: fetchError } = await supabase
      .from("settings")
      .select("material_synonyms")
      .eq("user_id", "default")
      .single();

    if (fetchError) throw fetchError;

    let materialSynonyms = settings.material_synonyms || {};

    if (action === "add") {
      // Add synonym to category
      if (!materialSynonyms[category]) {
        materialSynonyms[category] = [];
      }
      
      // Check if synonym already exists
      if (!materialSynonyms[category].includes(synonym)) {
        materialSynonyms[category].push(synonym);
      }
    } else if (action === "remove") {
      // Remove synonym from category
      if (materialSynonyms[category]) {
        materialSynonyms[category] = materialSynonyms[category].filter(
          (s: string) => s !== synonym
        );
      }
    } else if (action === "add_category") {
      // Add new category
      if (!materialSynonyms[category]) {
        materialSynonyms[category] = [];
      }
    } else if (action === "remove_category") {
      // Remove entire category
      delete materialSynonyms[category];
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    // Update settings
    const { data, error: updateError } = await supabase
      .from("settings")
      .update({ material_synonyms: materialSynonyms })
      .eq("user_id", "default")
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      material_synonyms: data.material_synonyms,
      message: action === "add" ? "Synonym tillagd!" : "Synonym borttagen!"
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

