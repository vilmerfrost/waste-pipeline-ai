"use server";

import { redirect } from "next/navigation";
import { createServerComponentClient } from "../../lib/supabase";

export async function login(formData: FormData) {
  const supabase = await createServerComponentClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirect("/login?message=Fel lösenord eller email.");
  }

  return redirect("/");
}