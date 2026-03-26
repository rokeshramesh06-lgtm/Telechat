import { createClient } from "@supabase/supabase-js";

let supabase = null;

export function getDb() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}
