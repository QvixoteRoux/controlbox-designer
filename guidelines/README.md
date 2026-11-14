# Guidelines

Project rules for people and agents. Each file covers one area; read the file for the area you're working on before changing anything there.

| File                                                 | Covers                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| [stack.md](stack.md)                                 | Languages, libraries, repo layout                                            |
| [units-and-coordinates.md](units-and-coordinates.md) | 0.1 mm units, platen and cabinet-face coordinate systems, orientation        |
| [data-model.md](data-model.md)                       | Entities, component kinds and their attributes, assumptions still to confirm |
| [permissions.md](permissions.md)                     | Viewer / Designer / Admin, the `can()` helper                                |
| [revisions.md](revisions.md)                         | Working vs released, new revision flow, snapshots                            |
| [platen-editor.md](platen-editor.md)                 | Drag, numeric position, snapping, locking                                    |

Changing a rule: update the guideline in the same commit as the code that depends on it.
