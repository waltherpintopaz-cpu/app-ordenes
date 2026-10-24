-- Guarda la fecha limite REAL que se otorgo en la ultima prorroga por
-- chat (no solo la fecha en que se pidio, que ya existia en
-- prorroga_chat_ultima_fecha). Sin esto, procesarProrroga() no tenia
-- forma de saber si ya habia una prorroga activa otorgada hoy mismo --
-- bug real (2026-10-24): un cliente pregunto "¿Tengo prorroga?" (una
-- pregunta de estado, no un pedido nuevo) y el bot le otorgo OTRA
-- prorroga, extendiendo la fecha que ya tenia sin necesidad.
alter table clientes add column if not exists prorroga_chat_ultimo_limite date;
