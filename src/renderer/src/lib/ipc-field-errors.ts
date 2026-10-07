// Routes a failed IPC save's field errors onto a React Hook Form instance.
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ipcFieldErrorsOf, type ApiError } from '../api/error'

type IpcFieldErrorRouting<T extends FieldValues> = {
  /** The form path an IPC field error belongs on, or `null` when it has none. */
  target: (field: string) => Path<T> | null
  /** Shown as `root.save` for a failure with no field errors or an unplaceable one. */
  saveMessage: string
  /**
   * Show an unplaceable field error's own message as `root.save` instead of `saveMessage`,
   * for a form whose server rejections (a phase or not-found guard) are written for the trader.
   */
  showUnplacedMessages?: boolean
}

export function applyIpcFieldErrors<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
  { target, saveMessage, showUnplacedMessages = false }: IpcFieldErrorRouting<T>
): void {
  const fieldErrors = ipcFieldErrorsOf(error)
  if (fieldErrors.length === 0) {
    setError('root.save', { message: saveMessage })
    return
  }
  fieldErrors.forEach((fe) => {
    const path = target(fe.field)
    if (path === null)
      setError('root.save', { message: showUnplacedMessages ? fe.message : saveMessage })
    else setError(path, { message: fe.message })
  })
}
