// Cria o cliente Supabase usado por toda a aplicação.
// Depende de config.js e da lib supabase-js (CDN) já carregados antes deste script.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
