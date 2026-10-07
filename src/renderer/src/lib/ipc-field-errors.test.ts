import { vi } from 'vitest'
import type { UseFormSetError } from 'react-hook-form'
import { apiError } from '../api/error'
import { applyIpcFieldErrors } from './ipc-field-errors'

type Values = { amount: string; date: string }

const SAVE = 'Could not save. Try again.'

function route(
  error: ReturnType<typeof apiError>,
  showUnplacedMessages?: boolean
): ReturnType<typeof vi.fn<UseFormSetError<Values>>> {
  const setError = vi.fn<UseFormSetError<Values>>()
  applyIpcFieldErrors<Values>(error, setError, {
    target: (field) =>
      field === 'amountPerContract' ? 'amount' : field === 'date' ? 'date' : null,
    saveMessage: SAVE,
    showUnplacedMessages
  })
  return setError
}

const detail = (...fields: string[]): ReturnType<typeof apiError> =>
  apiError(400, { detail: fields.map((field) => ({ field, code: 'x', message: `${field} bad` })) })

describe('applyIpcFieldErrors', () => {
  it('places each field error on its target path', () => {
    const setError = route(detail('amountPerContract', 'date'))
    expect(setError.mock.calls).toEqual([
      ['amount', { message: 'amountPerContract bad' }],
      ['date', { message: 'date bad' }]
    ])
  })

  it('shows the save message for a field error with no target', () => {
    const setError = route(detail('__root__'))
    expect(setError.mock.calls).toEqual([['root.save', { message: SAVE }]])
  })

  it('shows the save message for a 400 without field errors', () => {
    expect(route(apiError(400, {})).mock.calls).toEqual([['root.save', { message: SAVE }]])
  })

  it.each([
    ['a null body', null],
    ['a non-array detail', { detail: 'boom' }],
    ['a malformed detail entry', { detail: [{ field: 'date' }] }]
  ])('shows the save message for a 400 with %s', (_label, body) => {
    expect(route(apiError(400, body)).mock.calls).toEqual([['root.save', { message: SAVE }]])
  })

  it('shows the save message for a non-400 failure', () => {
    expect(route(apiError(500, 'boom')).mock.calls).toEqual([['root.save', { message: SAVE }]])
  })

  describe('with showUnplacedMessages', () => {
    it('shows a field error with no target as its own message', () => {
      const setError = route(detail('__phase__'), true)
      expect(setError.mock.calls).toEqual([['root.save', { message: '__phase__ bad' }]])
    })

    it('still places a field error with a target on its path', () => {
      const setError = route(detail('date'), true)
      expect(setError.mock.calls).toEqual([['date', { message: 'date bad' }]])
    })

    it('shows the save message for a failure without field errors', () => {
      expect(route(apiError(500, 'boom'), true).mock.calls).toEqual([
        ['root.save', { message: SAVE }]
      ])
    })
  })
})
