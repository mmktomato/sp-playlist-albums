import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, type RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useModalFocus } from './useModalFocus'

type HarnessProps = {
  open: boolean
  onClose?: () => void
  dismissible?: boolean
  targetDisabled?: boolean
  showTarget?: boolean
}

function Modal({
  onClose,
  dismissible,
  fallbackRef,
}: {
  onClose: () => void
  dismissible?: boolean
  fallbackRef: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus({
    open: true,
    containerRef: ref,
    onClose,
    fallbackFocusRef: fallbackRef,
    dismissible,
  })
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">Inside</button>
    </div>
  )
}

function Harness({
  open,
  onClose = () => {},
  dismissible,
  targetDisabled = false,
  showTarget = true,
}: HarnessProps) {
  const fallbackRef = useRef<HTMLElement>(null)
  return (
    <>
      <main ref={fallbackRef} tabIndex={-1}>
        {showTarget && (
          <button type="button" disabled={targetDisabled}>
            Opener
          </button>
        )}
        <button type="button">Elsewhere</button>
      </main>
      {open && (
        <Modal
          onClose={onClose}
          dismissible={dismissible}
          fallbackRef={fallbackRef}
        />
      )}
    </>
  )
}

function openFrom(props: Partial<HarnessProps> = {}) {
  const result = render(<Harness open={false} {...props} />)
  screen.getByRole('button', { name: 'Opener' }).focus()
  result.rerender(<Harness open {...props} />)
  return {
    ...result,
    rerenderWith: (next: Partial<HarnessProps>) =>
      result.rerender(<Harness {...props} open {...next} />),
  }
}

describe('useModalFocus', () => {
  it('focuses inside on open and returns focus to the opener on close', () => {
    const { rerenderWith } = openFrom()
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()

    rerenderWith({ open: false })

    expect(screen.getByRole('button', { name: 'Opener' })).toHaveFocus()
  })

  it('falls back when the opener is disabled', () => {
    const { rerenderWith } = openFrom()
    rerenderWith({ targetDisabled: true })
    rerenderWith({ targetDisabled: true, open: false })

    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('falls back when the opener is gone', () => {
    const { rerenderWith } = openFrom()
    rerenderWith({ showTarget: false })
    rerenderWith({ showTarget: false, open: false })

    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('keeps focus that was moved out of the modal before closing', () => {
    const { rerenderWith } = openFrom()
    screen.getByRole('main').focus()

    rerenderWith({ open: false })

    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('ignores Escape while not dismissible', async () => {
    const onClose = vi.fn()
    const { rerenderWith } = openFrom({ onClose, dismissible: false })

    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    rerenderWith({ dismissible: true })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
