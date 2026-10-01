// [US-101] Types the New position sheet owns: the fields it carries across its Standard / PMCC
// toggle and what it reports once a PMCC is recorded. Kept apart from the sheet, so the forms
// can import them without importing the sheet that imports them.

/** The fields both strategies share, copied across the sheet's toggle. */
export type SharedFields = { ticker: string; contracts: string }

/** What each form exposes through its `sharedRef` for the sheet to read and write. */
export type SharedFieldsHandle = {
  getShared: () => SharedFields
  setShared: (values: SharedFields) => void
}

/** What the sheet reports to the list once a PMCC is recorded, for its confirmation banner. */
export type PmccRecorded = { id: string; ticker: string }
