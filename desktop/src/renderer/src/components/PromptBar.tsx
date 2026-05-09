import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface PromptBarProps {
  onSubmit: (prompt: string) => void
}

/**
 * Bottom input. Pure tinted B/W. Focus is signaled by a subtle border
 * darkening, not a colored ring. Spawn button uses real active-scale
 * physics. ⌘K-style kbd hint sits inside the button.
 */
export function PromptBar({ onSubmit }: PromptBarProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div className="px-3 py-3 border-t border-line dark:border-line-dark bg-bone dark:bg-coal">
      <div
        className={clsx(
          'flex items-stretch rounded-md transition-all duration-200 ease-quart-out',
          'bg-bone-sunk dark:bg-coal-sunk',
          'border',
          focused
            ? 'border-ink-700 dark:border-chalk-dim'
            : 'border-line dark:border-line-dark hover:border-ink-300 dark:hover:border-line-dark-strong'
        )}
      >
        <div className="flex items-center pl-3.5 pr-2 select-none">
          <span
            className={clsx(
              'font-mono text-base transition-colors duration-150',
              focused ? 'text-ink-900 dark:text-chalk' : 'text-ink-400 dark:text-chalk-subtle'
            )}
          >
            ›
          </span>
        </div>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              setValue('')
            }
          }}
          placeholder="describe a task and press enter"
          spellCheck={false}
          className="flex-1 bg-transparent
                     font-display text-base text-ink-900 dark:text-chalk
                     placeholder:text-ink-400 dark:placeholder:text-chalk-subtle
                     focus:outline-none py-3 pr-3 no-drag"
        />
        <div className="flex items-center pr-1.5">
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="btn-primary"
          >
            <span>spawn</span>
            <span className="kbd bg-bone/15 border-bone/25 text-bone/85
                             dark:bg-coal/15 dark:border-coal/25 dark:text-coal/85">
              ↵
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
