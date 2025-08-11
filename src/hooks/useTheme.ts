import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system'

export const useTheme = (): [Theme, (theme: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('manga-reminder-theme')
    return (saved as Theme) || 'system'
  })

  // テーマを適用
  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (newTheme: 'light' | 'dark') => {
      root.classList.remove('light', 'dark')
      root.classList.add(newTheme)
    }

    if (theme === 'system') {
      // システム設定に従う
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light')
      }

      // 初期設定
      applyTheme(mediaQuery.matches ? 'dark' : 'light')
      
      // 変更を監視
      mediaQuery.addEventListener('change', handleChange)
      
      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    } else {
      // 明示的なテーマを適用
      applyTheme(theme)
    }
  }, [theme])

  // テーマをlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('manga-reminder-theme', theme)
  }, [theme])

  return [theme, setTheme]
}