-- New component kind RELAY (owner, 2026-11-18): a relay, usually plugged into a base (socket,
-- a second part number) typed in the same catalog entry. The row's sizes hold the outline of
-- base and relay together; attributes keep both as typed. Listed right after FUSE.
ALTER TYPE "ComponentKind" ADD VALUE 'RELAY' AFTER 'FUSE';
