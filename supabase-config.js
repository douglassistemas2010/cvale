// ============================================
// CONFIGURAÇÃO SUPABASE - Cockpit Minhas Atividades
// ============================================
// Preencha SUPABASE_URL e SUPABASE_ANON_KEY com os valores do seu projeto
// (Supabase > Project Settings > API). A anon key é pública por design
// (protegida pelas políticas de RLS criadas em supabase/schema.sql) —
// pode ficar neste arquivo mesmo em repositório público no GitHub.
const SUPABASE_URL = 'https://chnebivdbwabitgvmkat.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_u5aedyAAum54EeiDdk4vBQ_E6JQmzRL';

// db.schema: 'cvale' — este app usa uma gaveta (schema) própria dentro do
// banco-principal compartilhado, em vez do schema "public" padrão. O schema
// "cvale" também precisa estar em Project Settings > API > Exposed schemas.
const supabaseClient = (SUPABASE_URL.startsWith('http'))
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'cvale' } })
    : null;

if (!supabaseClient) {
    console.warn('⚠️ Supabase não configurado (supabase-config.js). Rodando apenas com localStorage/SEED.');
}

// Estado de autenticação (somente o dono do cockpit consegue gravar — ver RLS em schema.sql)
const CockpitAuth = {
    usuario: null,

    async inicializar() {
        if (!supabaseClient) return;
        const { data } = await supabaseClient.auth.getSession();
        this.usuario = data?.session?.user || null;
        this.atualizarIndicador();

        supabaseClient.auth.onAuthStateChange((_evento, session) => {
            this.usuario = session?.user || null;
            this.atualizarIndicador();
        });
    },

    estaLogado() {
        return !!this.usuario;
    },

    async entrar() {
        if (!supabaseClient) {
            alert('Configure o Supabase em supabase-config.js antes de entrar.');
            return;
        }
        const email = window.prompt('E-mail de acesso (modo edição):');
        if (!email) return;
        const senha = window.prompt('Senha:');
        if (!senha) return;

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
        if (error) {
            alert('Não foi possível entrar: ' + error.message);
            return;
        }
        this.atualizarIndicador();
    },

    async sair() {
        if (!supabaseClient) return;
        await supabaseClient.auth.signOut();
        this.atualizarIndicador();
    },

    atualizarIndicador() {
        const btn = document.getElementById('btnAuthSupabase');
        if (!btn) return;
        if (this.estaLogado()) {
            btn.innerHTML = '<span data-icon="unlock" style="margin-right: 0.25rem;"></span>Modo edição';
            btn.title = 'Logado como ' + this.usuario.email + ' — clique para sair';
        } else {
            btn.innerHTML = '<span data-icon="lock" style="margin-right: 0.25rem;"></span>Somente leitura';
            btn.title = 'Clique para entrar e habilitar edição/gravação';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};
