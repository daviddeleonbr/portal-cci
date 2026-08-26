-- ============================================================
-- Motivo de devolução para NOTA FISCAL e BOLETOS
-- ============================================================
--
-- Além do motivo por item (167), o admin pode devolver apontando problema no
-- arquivo da Nota Fiscal e/ou nos Boletos anexados. Cada um tem seu texto.

alter table nf_manifestacao
  add column if not exists motivo_devol_nf     text,
  add column if not exists motivo_devol_boleto text;
