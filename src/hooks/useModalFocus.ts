import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export type ModalFocusOptions = {
  open: boolean
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  fallbackFocusRef?: RefObject<HTMLElement | null>
  dismissible?: boolean
}

function canReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected || element === document.body) {
    return false
  }
  return !(
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.disabled
  )
}

export function useModalFocus({
  open,
  containerRef,
  onClose,
  returnFocusRef,
  fallbackFocusRef,
  dismissible = true,
}: ModalFocusOptions): void {
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  }, [onClose, dismissible])

  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return
    const returnTarget =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    const fallbackTarget = fallbackFocusRef?.current

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    ;(focusables()[0] ?? container).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (dismissibleRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!container.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const active = document.activeElement
      if (active && active !== document.body && !container.contains(active)) {
        return
      }
      if (canReceiveFocus(returnTarget)) {
        returnTarget.focus()
      } else {
        fallbackTarget?.focus()
      }
    }
  }, [open, containerRef, returnFocusRef, fallbackFocusRef])
}
