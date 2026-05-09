import { useEffect, useRef, useState } from 'react'

interface PromptBarProps {
  onSubmit: (prompt: string) => void
}

/**
 * Bottom input — Linear/Raycast-style command bar. Soft surface, glowing
 * focus ring, prominent send button on the right. Enter spawns.
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
    <div className="px-3 py-3 border-t border-border dark:border-border-dark
                    bg-bg/80 dark:bg-bg-dark/80 backdrop-blur-xl">
      <div
        className={`flex items-stretch rounded-xl border transition-all duration-200
                    bg-surface dark:bg-surface-dark
                    ${
                      focused
                        ? 'border-accent shadow-glow'
                        : 'border-border dark:border-border-dark shadow-sm'
                    }`}
      >
        <div className="flex items-center pl-4 pr-3">
          <span className={`font-mono text-base transition-colors ${
            focused ? 'text-accent' : 'text-ink-subtle'
          }`}>
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
          placeholder="Describe a task and press Enter…"
          spellCheck={false}
          className="flex-1 bg-transparent font-display text-base text-ink dark:text-ink-dark
                     placeholder:text-ink-subtle dark:placeholder:text-ink-dark-subtle
                     focus:outline-none py-3 no-drag"
        />
        <div className="flex items-center pr-2">
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="btn-primary"
          >
            Spawn
            <span className="kbd ml-1 bg-white/15 border-white/20 text-white/80">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}
