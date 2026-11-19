# Project notes

Running notes on the project, kept in git: what was built, what was decided, what's still open, plans for upcoming features, and bugs.

`guidelines/` holds the rules the code follows. These notes record how the project got there and what comes next.

| File                         | What goes in it                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [progress.md](progress.md)   | Dated log of changes: what was built or changed, with commit ids. Newest at the bottom.                                             |
| [decisions.md](decisions.md) | Owner decisions that shape the product, grouped by area, with the date. A changed decision is struck through and the new one added. |
| [open.md](open.md)           | Open items: questions to decide, features not started, things to check in the browser, work needed before production.               |
| [bugs.md](bugs.md)           | Known bugs and corrections: open ones first, then fixed ones with the commit that fixed them.                                       |
| [plans/](plans/)             | One file per feature plan, named `YYYY-MM-DD-topic.md`. Keep it after the work is done and add a "Status" line.                     |

## Rules

- **The repo is public.** No passwords, keys, emails, IP addresses, account names or machine setup here. Those go in `localnotes/` (untracked).
- Dates are absolute (`2026-11-18`), never "today" or "last week".
- One fact in one place: link to a guideline or another note instead of copying it.
- Update the notes in the same commit as the change they describe.
