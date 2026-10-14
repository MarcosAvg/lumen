-- Lumen · migración inicial (infraestructura).
--
-- PostgreSQL 13+ ya incluye `gen_random_uuid()` en el núcleo, por lo que las
-- claves UUID de los recursos expuestos no requieren extensión. Se habilita
-- `pgcrypto` para disponer de `gen_random_bytes()` en la generación de tokens
-- opacos (sesiones, endpoints push) sin depender de infraestructura externa.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
