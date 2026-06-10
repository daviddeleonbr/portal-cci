-- Recorrência pra pendências.
--
-- Sem `recorrencia` (null) = comportamento original: aparece dentro da
-- janela mostrar_apos/mostrar_ate até ser resolvida (modal mostra 1x por
-- sessão de aba).
--
-- Com `recorrencia` definida, a pendência reaparece periodicamente até ser
-- resolvida. A tabela `cci_pendencia_visualizacao` registra a última vez
-- que cada cliente viu a pendência — usado pra calcular se deve mostrar
-- de novo conforme o padrão.
--
-- Formatos suportados em `recorrencia` (JSON):
--   { "tipo": "diaria" }                          → todo dia
--   { "tipo": "dias_semana", "dias": [1,3,5] }    → seg/qua/sex (0=dom...6=sáb)
--   { "tipo": "intervalo", "dias": 7 }            → a cada 7 dias desde a última exibição

ALTER TABLE cci_pendencias
  ADD COLUMN IF NOT EXISTS recorrencia jsonb;

-- Registra quando cada cliente viu cada pendência. UM registro por par
-- (pendencia, cliente) — atualizado a cada exibição.
CREATE TABLE IF NOT EXISTS cci_pendencia_visualizacao (
  pendencia_id     uuid NOT NULL REFERENCES cci_pendencias(id) ON DELETE CASCADE,
  cliente_id       uuid NOT NULL REFERENCES clientes(id)       ON DELETE CASCADE,
  visualizada_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pendencia_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_pendencia_visualiz_cliente
  ON cci_pendencia_visualizacao(cliente_id);

ALTER TABLE cci_pendencia_visualizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_pendencia_visualiz_all
  ON cci_pendencia_visualizacao FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON cci_pendencia_visualizacao TO anon, authenticated;
