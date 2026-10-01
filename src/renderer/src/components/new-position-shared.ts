// [US-101] The New position sheet carries these fields across its Standard / PMCC toggle.
// Owned by the sheet but kept apart from it, so the forms can import the handle type
// without importing the sheet that imports them.

/** The fields both strategies share, copied across the sheet's toggle. */
export type SharedFields = { ticker: string; contracts: string }

/** What each form exposes through its `sharedRef` for the sheet to read and write. */
export type SharedFieldsHandle = {
  getShared: () => SharedFields
  setShared: (values: SharedFields) => void
}
