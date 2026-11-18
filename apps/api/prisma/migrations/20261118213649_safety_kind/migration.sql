-- New component kind SAFETY (owner, 2026-11-18): safety devices, with the same fields as
-- STANDARD and their own colour in the editor. Listed right after STANDARD.
ALTER TYPE "ComponentKind" ADD VALUE 'SAFETY' AFTER 'STANDARD';
