# Open items

Things to decide, build or check. Move an item to [progress.md](progress.md) (done) or [decisions.md](decisions.md) (decided) when it's settled.

## To decide

- **End plates for terminal strips:** usually one per strip or group, vendor-specific (e.g. Weidmüller WAP 2.5-10, 1.5 mm). Per-strip switch with a thickness in the catalog, or a separate catalog part?
- **Arrow-key nudges and rows:** dragging moves a part's whole row on a rail; nudging only moves the selection. Should nudges move the row too?
- **Stacking as a tower:** parts mounted on top of each other aren't modelled. "Stackable" is reserved for it.

## To build

- **Bill of materials:** bridges (cross-connectors) are drawn but not listed as parts; end plates and end brackets likewise.
- **"Source code" link** in the deployed app (footer or About page), as the AGPL asks for users reached over the network.

## To check in the browser

Built on 2026-11-18 and covered by tests, but not yet looked at:

- [ ] Rail and gutter captions with the cut length
- [ ] An expandable part with a count
- [ ] Type fill colours, especially dark ones
- [ ] Collapsing and searching the part list groups
- [ ] Dimensions with several rails, including labels close together
- [x] Export: Letter pages (checked by the owner 2026-11-18)
- [ ] Export: Full size PNG
- [x] A relay with its base (checked by the owner 2026-11-18)
- [x] Copy / paste (checked by the owner 2026-11-18)
- [ ] Copy / paste of a rail with its parts
- [ ] Wire space zones and warnings
- [ ] Middle-drag moving a single part out of a row

## Before production

- S3 / MinIO image store (with the Docker / Dokploy deployment).
- Login rate limiting (noted in `guidelines/permissions.md`).
- Cleanup of orphaned image files (files are never deleted today).
