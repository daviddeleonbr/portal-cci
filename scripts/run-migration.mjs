import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Supabase connection string ───────────────────────────
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// You can find this in: Supabase Dashboard > Settings > Database > Connection string (URI)
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('\n  Uso: DATABASE_URL="postgresql://..." node scripts/run-migration.mjs\n');
  console.error('  Encontre a connection string em:');
  console.error('  Supabase Dashboard > Settings > Database > Connection string (URI)\n');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run() {
  const sql = readFileSync(resolve(__dirname, '../supabase/migrations/001_mascaras_dre.sql'), 'utf-8');

  console.log('Conectando ao Supabase...');
  await client.connect();
  console.log('Conectado! Executando migration...\n');

  await client.query(sql);
  console.log('Migration executada com sucesso!');
  console.log('Tabelas criadas: mascaras_dre, grupos_dre, mapeamento_contas');

  await client.end();
}

run().catch(err => {
  console.error('Erro:', err.message);
  client.end();
  process.exit(1);
});
