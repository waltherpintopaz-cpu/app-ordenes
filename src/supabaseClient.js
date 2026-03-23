import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

const supabaseUrl = String(env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
