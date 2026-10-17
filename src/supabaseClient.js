import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

const supabaseUrl = String(env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// persistSession/autoRefreshToken desactivados: esta app no usa el login de
// Supabase (usa su propio sistema de cookie de agente, "sb_agente"), asi
// que el cliente nunca tiene una sesion real que refrescar. Dejarlos
// prendidos por default igual hacia correr el manejo de sesion de fondo,
// que compite por un candado del navegador (Navigator LockManager) cuando
// hay varias pestañas/conversaciones abiertas a la vez -- "Acquiring an
// exclusive Navigator LockManager lock ... immediately failed", visto en
// produccion. Sin sesion real que mantener, no hace falta nada de esto.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
