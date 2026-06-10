-- Pendências CCI → cliente. Assuntos que o admin precisa que o cliente
-- responda. Aparecem em notificações quando o cliente loga, dentro de uma
-- janela de tempo configurada pelo admin. Ficam visíveis até serem
-- marcadas como resolvidas pelo admin.

CREATE TABLE IF NOT EXISTS cci_pendencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL,
  descricao       text,
  prioridade      text NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')) DEFAULT 'media',
  -- Escopo: pode ser uma rede inteira (chave_api_id) OU um cliente específico.
  -- Pelo menos um precisa estar preenchido (validação no service).
  chave_api_id    uuid REFERENCES chaves_api(id)  ON DELETE CASCADE,
  cliente_id      uuid REFERENCES clientes(id)    ON DELETE CASCADE,
  -- Janela de exibição. NULL em mostrar_apos = imediatamente.
  -- NULL em mostrar_ate = sem prazo (até ser resolvida).
  mostrar_apos    timestamptz,
  mostrar_ate     timestamptz,
  -- Status de resolução
  status          text NOT NULL CHECK (status IN ('aberta', 'resolvida')) DEFAULT 'aberta',
  resolvida_em    timestamptz,
  resolvida_por   uuid REFERENCES cci_usuarios_sistema(id),
  -- Auditoria
  criada_em       timestamptz NOT NULL DEFAULT now(),
  criada_por      uuid REFERENCES cci_usuarios_sistema(id),
  atualizada_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (chave_api_id IS NOT NULL OR cliente_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pendencias_chave_api ON cci_pendencias(chave_api_id) WHERE chave_api_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pendencias_cliente   ON cci_pendencias(cliente_id)   WHERE cliente_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pendencias_status    ON cci_pendencias(status);

-- Respostas dos clientes às pendências. Cliente pode mandar várias mensagens
-- por pendência (histórico de conversa). Apenas o admin marca como resolvida.
CREATE TABLE IF NOT EXISTS cci_pendencia_resposta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id    uuid NOT NULL REFERENCES cci_pendencias(id) ON DELETE CASCADE,
  -- Quem respondeu (cliente ou admin):
  autor_tipo      text NOT NULL CHECK (autor_tipo IN ('cliente', 'admin')),
  autor_id        uuid,                -- usuario_sistema.id ou cliente.id
  autor_nome      text,                -- snapshot do nome no momento
  texto           text NOT NULL,
  criada_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pendencia_resposta_pend ON cci_pendencia_resposta(pendencia_id, criada_em);

-- Trigger pra atualizar `atualizada_em` automaticamente
CREATE OR REPLACE FUNCTION trg_pendencias_atualizada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizada_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pendencias_set_atualizada ON cci_pendencias;
CREATE TRIGGER trg_pendencias_set_atualizada
  BEFORE UPDATE ON cci_pendencias
  FOR EACH ROW EXECUTE FUNCTION trg_pendencias_atualizada();

-- RLS (padrão permissivo do projeto)
ALTER TABLE cci_pendencias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cci_pendencia_resposta  ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_pendencias_all       ON cci_pendencias          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_pendencia_resp_all   ON cci_pendencia_resposta  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON cci_pendencias         TO anon, authenticated;
GRANT ALL ON cci_pendencia_resposta TO anon, authenticated;
