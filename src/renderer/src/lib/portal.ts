/**
 * Returns the sheet portal mount point.
 *
 * Sheets are portalled into `#sheet-portal` (rendered by AppShell) so they
 * stay within the app root rather than being direct children of document.body.
 * Falls back to document.body when the portal div is not yet mounted (e.g. in
 * tests that render a sheet in isolation without AppShell).
 */
export function getSheetPortal(): Element {
  return document.getElementById('sheet-portal') ?? document.body
}
