// Shared modal shell used by the onboarding, stats, and result dialogs so they
// look and behave identically. Closes on Escape and overlay click; light
// "paper" card on a dimmed scrim.

import { useEffect, type ReactNode } from 'react'

/** Max card width on larger screens. Below it, the modal is full-width-minus-padding. */
type ModalSize = 'md' | 'wide'

const SIZE_CLASS: Record<ModalSize, string> = {
  md: 'max-w-md', // ~448px, the default for onboarding / stats / intro
  wide: 'max-w-xl', // ~576px, room for the result card's two-up station cards
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Hide the default close (X) button — e.g. for a forced first-run card. */
  hideClose?: boolean
  /** Max width on desktop; defaults to 'md'. The result card opts into 'wide'. */
  size?: ModalSize
  children: ReactNode
}

export default function Modal({ open, onClose, title, hideClose, size = 'md', children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative max-h-[90vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-2xl bg-paper p-6 text-ink shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="mb-4 flex items-start justify-between gap-4">
            {title ? (
              <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            ) : (
              <span />
            )}
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-stone"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
