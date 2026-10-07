import { apiError, firstErrorMessage, ipcFieldErrorsOf } from './error'

const FIELD_ERROR = { field: 'fillDate', code: 'close_date_before_open', message: 'bad date' }

describe('ipcFieldErrorsOf', () => {
  it('returns the field errors of the 400 body throwMappedIpcErrors builds', () => {
    expect(ipcFieldErrorsOf(apiError(400, { detail: [FIELD_ERROR] }))).toEqual([FIELD_ERROR])
  })

  it('returns nothing for a non-400 failure, even with a detail array', () => {
    expect(ipcFieldErrorsOf(apiError(500, { detail: [FIELD_ERROR] }))).toEqual([])
  })

  it.each([
    ['a null body', null],
    ['a string body', 'boom'],
    ['a body without detail', {}],
    ['a non-array detail', { detail: 'boom' }],
    ['a detail entry that is not an object', { detail: ['boom'] }],
    ['a detail entry missing its message', { detail: [{ field: 'x', code: 'y' }] }],
    ['a detail entry with a non-string field', { detail: [{ field: 1, code: 'y', message: 'z' }] }]
  ])('returns nothing for %s', (_label, body) => {
    expect(ipcFieldErrorsOf(apiError(400, body))).toEqual([])
  })
})

describe('firstErrorMessage', () => {
  it('returns the first field error message', () => {
    expect(firstErrorMessage(apiError(400, { detail: [FIELD_ERROR] }), 'fallback')).toBe('bad date')
  })

  it.each([
    ['no error', undefined],
    ['a null error', null],
    ['a null body', apiError(500, null)],
    ['a body without detail', apiError(500, { message: 'boom' })],
    ['an empty detail', apiError(400, { detail: [] })]
  ])('falls back for %s', (_label, error) => {
    expect(firstErrorMessage(error, 'fallback')).toBe('fallback')
  })
})
