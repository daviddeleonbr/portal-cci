-- Retorno de dúvidas em 24h vale para as DUAS partes (não só a contratante).
update cci_clausulas
   set corpo = (
     select jsonb_agg(case when b->>'texto' = $t$A CONTRATANTE deverá responder às dúvidas e às inconsistências identificadas e comunicadas pela CONTRATADA, pelos canais definidos entre as partes, no prazo máximo de {{entregas.prazoRetorno}}, contado do envio da comunicação. O retorno fora desse prazo prorroga, na mesma proporção, os prazos de entrega a cargo da CONTRATADA que dele dependam.$t$
                           then jsonb_set(b, '{texto}', to_jsonb($t$As partes deverão responder uma à outra, pelos canais definidos entre elas, no prazo máximo de {{entregas.prazoRetorno}}, contado do envio da comunicação: a CONTRATANTE, quanto às dúvidas e às inconsistências identificadas e comunicadas pela CONTRATADA; e a CONTRATADA, quanto às dúvidas apresentadas pela CONTRATANTE. O retorno da CONTRATANTE fora desse prazo prorroga, na mesma proporção, os prazos de entrega a cargo da CONTRATADA que dele dependam.$t$::text)) else b end order by i)
       from jsonb_array_elements(corpo) with ordinality as x(b, i))
 where chave = 'geral_prazos_entregas';
