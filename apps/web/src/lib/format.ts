const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** ISO timestamp from the API → local date and time, e.g. "14 Nov 2026, 09:30". */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** ISO timestamp from the API → local date, e.g. "14 Nov 2026". */
export const formatDate = (iso: string) => date.format(new Date(iso));
