import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

// GET /api/settings - Fetch current settings
export async function GET() {
  const supabase = createServiceRoleClient();

  try {
    const { data: settings, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", "default")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      settings: settings || {
        auto_approve_threshold: 80,
        enterprise_auto_approve: false,
        material_synonyms: {
          "Trä": ["Brädor", "Virke", "Lastpall", "Spont"],
          "Gips": ["Gipsskivor", "Rivningsgips", "Gipsspill"],
          "Betong": ["Armerad betong", "Betongkross"],
          "Brännbart": ["Restavfall", "Blandat brännbart"]
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/settings - Update settings
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();

  try {
    const body = await request.json();
    const { auto_approve_threshold, enterprise_auto_approve, material_synonyms } = body;

    // Validate threshold
    if (auto_approve_threshold !== undefined) {
      if (auto_approve_threshold < 60 || auto_approve_threshold > 99) {
        return NextResponse.json(
          { success: false, error: "Threshold must be between 60% and 99%" },
          { status: 400 }
        );
      }
    }

    // Update settings
    const { data, error } = await supabase
      .from("settings")
      .update({
        ...(auto_approve_threshold !== undefined && { auto_approve_threshold }),
        ...(enterprise_auto_approve !== undefined && { enterprise_auto_approve }),
        ...(material_synonyms !== undefined && { material_synonyms })
      })
      .eq("user_id", "default")
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      settings: data,
      message: "Inställningar uppdaterade!"
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

