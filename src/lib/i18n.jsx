import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { messages } from './messages'

export const LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
]

const I18nCtx = createContext(null)

function initialLang() {
  try {
    const saved = localStorage.getItem('pws.lang')
    if (saved && messages[saved]) return saved
  } catch { /* 저장소 사용 불가 */ }
  const nav = (navigator.language || 'ko').slice(0, 2)
  return messages[nav] ? nav : 'ko'
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    try { localStorage.setItem('pws.lang', lang) } catch { /* 무시 */ }
  }, [lang])

  const value = useMemo(() => {
    const t = (key, vars) => {
      let s = messages[lang]?.[key] ?? messages.ko[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
      return s
    }
    return { lang, setLang, t }
  }, [lang])

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export const useT = () => useContext(I18nCtx)
