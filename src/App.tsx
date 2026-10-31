import { useEffect, useMemo, useState } from 'react'
import brandLogo from '../logo/kandotechlogo.png'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './App.css'

type PageId =
  | 'dashboard'
  | 'trade-calendar'
  | 'trade-journal'
  | 'bankroll'
  | 'analytics'
  | 'prediction-centre'
  | 'backtesting'
  | 'settings'

type NavItem = {
  id: PageId
  label: string
  icon: string
}

type SummaryCardProps = {
  label: string
  value: string
  note: string
  tone?: 'blue' | 'green' | 'red' | 'amber'
}

type BetStatus = 'Pending' | 'Won' | 'Lost' | 'Void'

type BetRecord = {
  id: number
  date: string
  sport: string
  event: string
  market: string
  stake: number
  odds: number
  status: BetStatus
}

type BetFormState = {
  date: string
  sport: string
  event: string
  market: string
  stake: string
  odds: string
  status: BetStatus
}

type BankrollTransactionType = 'deposit' | 'withdrawal'

type BankrollTransaction = {
  id: number
  date: string
  type: BankrollTransactionType
  description: string
  amount: number
}

type AppSettingsState = {
  displayName: string
  email: string
  profileInfo: string
  accountPreference: string
  defaultCurrency: string
  defaultStake: string
  preferredOddsFormat: string
  preferredSport: string
  theme: 'dark' | 'light'
  bettingReminders: boolean
  resultUpdates: boolean
  passwordChange: boolean
  sessionManagement: string
  exportRecords: boolean
  exportBankroll: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'trade-calendar', label: 'Trade Calendar', icon: '◧' },
  { id: 'trade-journal', label: 'Trade Journal', icon: '◬' },
  { id: 'bankroll', label: 'Bankroll', icon: '◭' },
  { id: 'analytics', label: 'Analytics', icon: '◩' },
  { id: 'prediction-centre', label: 'Prediction Centre', icon: '◎' },
  { id: 'backtesting', label: 'Backtesting', icon: '◨' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const defaultFormState: BetFormState = {
  date: new Date().toISOString().slice(0, 10),
  sport: '',
  event: '',
  market: '',
  stake: '',
  odds: '',
  status: 'Pending',
}

const STORAGE_KEYS = {
  records: 'kando-journal-records',
  initialBankroll: 'kando-initial-bankroll',
  bankrollTransactions: 'kando-bankroll-transactions',
  settings: 'kando-settings',
} as const

const defaultSettings: AppSettingsState = {
  displayName: '',
  email: '',
  profileInfo: '',
  accountPreference: 'Analyst',
  defaultCurrency: 'MK',
  defaultStake: '25',
  preferredOddsFormat: 'Decimal',
  preferredSport: 'Football',
  theme: 'dark',
  bettingReminders: true,
  resultUpdates: true,
  passwordChange: false,
  sessionManagement: 'Local session only',
  exportRecords: false,
  exportBankroll: false,
}

const statusOptions: BetStatus[] = ['Pending', 'Won', 'Lost', 'Void']

type SupabaseProfile = {
  id: string
  display_name?: string | null
  email?: string | null
  initial_bankroll?: number | null
  settings?: Record<string, unknown> | null
}

function readStoredArray<T>(key: string, validator: (value: unknown) => T | null): T[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    const sanitized: T[] = []
    parsed.forEach((entry) => {
      const normalized = validator(entry)
      if (normalized !== null) {
        sanitized.push(normalized)
      }
    })

    return sanitized
  } catch {
    return []
  }
}

function normalizeBetRecord(value: unknown): BetRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<BetRecord>
  if (
    typeof record.id !== 'number' ||
    typeof record.date !== 'string' ||
    typeof record.sport !== 'string' ||
    typeof record.event !== 'string' ||
    typeof record.market !== 'string' ||
    typeof record.stake !== 'number' ||
    typeof record.odds !== 'number' ||
    !statusOptions.includes(record.status as BetStatus)
  ) {
    return null
  }

  return {
    id: record.id,
    date: record.date,
    sport: record.sport,
    event: record.event,
    market: record.market,
    stake: record.stake,
    odds: record.odds,
    status: record.status as BetStatus,
  }
}

function normalizeBankrollTransaction(value: unknown): BankrollTransaction | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const transaction = value as Partial<BankrollTransaction>
  if (
    typeof transaction.id !== 'number' ||
    typeof transaction.date !== 'string' ||
    typeof transaction.description !== 'string' ||
    typeof transaction.amount !== 'number' ||
    (transaction.type !== 'deposit' && transaction.type !== 'withdrawal')
  ) {
    return null
  }

  return {
    id: transaction.id,
    date: transaction.date,
    type: transaction.type,
    description: transaction.description,
    amount: transaction.amount,
  }
}

function readStoredRecords() {
  return readStoredArray(STORAGE_KEYS.records, normalizeBetRecord)
}

function readStoredBankrollTransactions() {
  return readStoredArray(STORAGE_KEYS.bankrollTransactions, normalizeBankrollTransaction)
}

function readStoredInitialBankroll() {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.initialBankroll)
    if (!rawValue) {
      return 0
    }

    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function readStoredSettings(): AppSettingsState {
  if (typeof window === 'undefined') {
    return defaultSettings
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.settings)
    if (!rawValue) {
      return defaultSettings
    }

    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') {
      return defaultSettings
    }

    const themeValue = parsed.theme === 'light' ? 'light' : 'dark'
    return {
      ...defaultSettings,
      ...parsed,
      theme: themeValue,
    }
  } catch {
    return defaultSettings
  }
}

function mergeProfileSettings(profileSettings: unknown, fallbackSettings: AppSettingsState): AppSettingsState {
  const source = profileSettings && typeof profileSettings === 'object' ? profileSettings as Record<string, unknown> : {}

  return {
    ...fallbackSettings,
    ...source,
    theme: source.theme === 'light' ? 'light' : 'dark',
  }
}

function normalizeSupabaseBet(value: Record<string, unknown>): BetRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const status = value.status
  if (typeof value.id !== 'number' && typeof value.id !== 'string') {
    return null
  }

  const safeStatus = typeof status === 'string' && statusOptions.includes(status as BetStatus)
    ? (status as BetStatus)
    : 'Pending'

  const numericStake = Number(value.stake)
  const numericOdds = Number(value.odds)

  if (!value.date || typeof value.date !== 'string' || !Number.isFinite(numericStake) || !Number.isFinite(numericOdds)) {
    return null
  }

  return {
    id: Number(value.id),
    date: value.date,
    sport: typeof value.sport === 'string' ? value.sport : '',
    event: typeof value.event === 'string' ? value.event : '',
    market: typeof value.market === 'string' ? value.market : '',
    stake: numericStake,
    odds: numericOdds,
    status: safeStatus,
  }
}

function normalizeSupabaseBankrollTransaction(value: Record<string, unknown>): BankrollTransaction | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const idValue = typeof value.id === 'number' ? value.id : Number(value.id)
  const numericAmount = Number(value.amount)
  const typeValue = value.type

  if (!Number.isFinite(idValue) || !Number.isFinite(numericAmount) || typeof value.date !== 'string') {
    return null
  }

  if (typeValue !== 'deposit' && typeValue !== 'withdrawal') {
    return null
  }

  return {
    id: idValue,
    date: value.date,
    type: typeValue,
    description: typeof value.description === 'string' ? value.description : 'Bankroll activity',
    amount: numericAmount,
  }
}

async function migrateLocalDataToSupabase(
  userId: string,
  recordSnapshot: BetRecord[],
  bankrollSnapshot: BankrollTransaction[],
  initialBankrollSnapshot: number,
) {
  if (!supabase) {
    return
  }

  const localRecords = recordSnapshot.length > 0 ? recordSnapshot : readStoredRecords()
  const localTransactions = bankrollSnapshot.length > 0 ? bankrollSnapshot : readStoredBankrollTransactions()
  const localInitialBankroll = Number.isFinite(initialBankrollSnapshot) ? initialBankrollSnapshot : readStoredInitialBankroll()

  if (localRecords.length > 0) {
    const { data: existingRecords, error: existingRecordError } = await supabase
      .from('bets')
      .select('legacy_id')
      .eq('user_id', userId)

    if (!existingRecordError) {
      const existingLegacyIds = new Set(
        (existingRecords ?? []).map((entry) => String(entry.legacy_id)).filter(Boolean),
      )

      const pendingRecords = localRecords.filter((record) => !existingLegacyIds.has(String(record.id)))
      if (pendingRecords.length > 0) {
        const payload = pendingRecords.map((record) => ({
          user_id: userId,
          legacy_id: String(record.id),
          date: record.date,
          sport: record.sport,
          event: record.event,
          market: record.market,
          stake: record.stake,
          odds: record.odds,
          status: record.status,
        }))

        await supabase.from('bets').insert(payload)
      }
    }
  }

  if (localTransactions.length > 0) {
    const { data: existingTransactions, error: existingTransactionError } = await supabase
      .from('bankroll_transactions')
      .select('legacy_id')
      .eq('user_id', userId)

    if (!existingTransactionError) {
      const existingLegacyIds = new Set(
        (existingTransactions ?? []).map((entry) => String(entry.legacy_id)).filter(Boolean),
      )

      const pendingTransactions = localTransactions.filter((transaction) => !existingLegacyIds.has(String(transaction.id)))
      if (pendingTransactions.length > 0) {
        const payload = pendingTransactions.map((transaction) => ({
          user_id: userId,
          legacy_id: String(transaction.id),
          date: transaction.date,
          type: transaction.type,
          description: transaction.description,
          amount: transaction.amount,
        }))

        await supabase.from('bankroll_transactions').insert(payload)
      }
    }
  }

  if (localInitialBankroll || Number(readStoredInitialBankroll()) > 0) {
    await supabase
      .from('profiles')
      .upsert({
        id: userId,
        initial_bankroll: localInitialBankroll,
        settings: {
          ...readStoredSettings(),
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
  }
}

function formatCurrency(value: number) {
  return `MK ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateKey(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPotentialReturn(stake: number, odds: number) {
  return stake * odds
}

function getNetResult(record: BetRecord) {
  const potentialReturn = getPotentialReturn(record.stake, record.odds)

  switch (record.status) {
    case 'Won':
      return potentialReturn - record.stake
    case 'Lost':
      return -record.stake
    case 'Pending':
      return 0
    case 'Void':
      return 0
    default:
      return 0
  }
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [records, setRecords] = useState<BetRecord[]>(() => readStoredRecords())
  const [initialBankroll, setInitialBankroll] = useState<number>(() => readStoredInitialBankroll())
  const [bankrollTransactions, setBankrollTransactions] = useState<BankrollTransaction[]>(() => readStoredBankrollTransactions())
  const [settings, setSettings] = useState<AppSettingsState>(() => readStoredSettings())
  const [sessionUser, setSessionUser] = useState<{ id: string; email?: string | null } | null>(null)
  const [profile, setProfile] = useState<SupabaseProfile | null>(null)
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'verify' | 'reset'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false)
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newConfirmPassword, setNewConfirmPassword] = useState('')
  const [authLoading, setAuthLoading] = useState<boolean>(true)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)

  const authRedirectUrl = typeof window === 'undefined' ? 'http://localhost:5173/' : `${window.location.origin}/`

  const handleAuthError = (error: unknown, fallbackMessage: string) => {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallbackMessage

    if (/429|rate limit|too many.*email|too many requests/i.test(message)) {
      setAuthError('Too many email requests were sent. Please wait 1 minute and try again.')
      return
    }

    if (/email.*not.*confirmed|confirm.*email|verification/i.test(message)) {
      setAuthError('This email is not confirmed yet. Check your inbox or resend the verification email.')
      setAuthView('verify')
      return
    }

    setAuthError(message || fallbackMessage)
  }

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records))
    } catch {
      // Ignore storage failures and keep the app working in-memory.
    }
  }, [records])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.initialBankroll, String(initialBankroll))
    } catch {
      // Ignore storage failures and keep the app working in-memory.
    }
  }, [initialBankroll])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.bankrollTransactions, JSON.stringify(bankrollTransactions))
    } catch {
      // Ignore storage failures and keep the app working in-memory.
    }
  }, [bankrollTransactions])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
    } catch {
      // Ignore storage failures and keep the app working in-memory.
    }
  }, [settings])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    const client = supabase

    const restoreSession = async () => {
      const { data, error } = await client.auth.getSession()
      if (error) {
        setAuthError(error.message)
      }
      setSessionUser(data.session?.user ?? null)
      setAuthLoading(false)
    }

    void restoreSession()

    const { data: subscriptionData } = client.auth.onAuthStateChange((event, session) => {
      setSessionUser(session?.user ?? null)
      setAuthError('')

      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset')
        setAuthSuccess('Use the form below to create a new password for your account.')
      }

      if (event === 'SIGNED_IN') {
        setAuthView('login')
      }
    })

    return () => {
      subscriptionData.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !sessionUser) {
      setProfile(null)
      return
    }

    const client = supabase

    const loadProfileAndData = async () => {
      setAuthLoading(true)

      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profileError) {
        setAuthError(profileError.message)
      }

      const nextProfile = profileData ?? {
        id: sessionUser.id,
        initial_bankroll: readStoredInitialBankroll(),
        settings: readStoredSettings(),
      }

      setProfile(nextProfile)
      const nextSettings = mergeProfileSettings(nextProfile.settings, settings)
      setSettings(nextSettings)
      setInitialBankroll(Number(nextProfile.initial_bankroll ?? readStoredInitialBankroll()))

      const { data: betData, error: betError } = await client
        .from('bets')
        .select('*')
        .eq('user_id', sessionUser.id)
        .order('date', { ascending: false })

      if (!betError) {
        const mappedBets = (betData ?? [])
          .map((entry) => normalizeSupabaseBet(entry as Record<string, unknown>))
          .filter((entry): entry is BetRecord => entry !== null)

        if (mappedBets.length > 0) {
          setRecords(mappedBets)
        }
      }

      const { data: transactionData, error: transactionError } = await client
        .from('bankroll_transactions')
        .select('*')
        .eq('user_id', sessionUser.id)
        .order('date', { ascending: false })

      if (!transactionError) {
        const mappedTransactions = (transactionData ?? [])
          .map((entry) => normalizeSupabaseBankrollTransaction(entry as Record<string, unknown>))
          .filter((entry): entry is BankrollTransaction => entry !== null)

        if (mappedTransactions.length > 0) {
          setBankrollTransactions(mappedTransactions)
        }
      }

      if (betData?.length === 0 && transactionData?.length === 0) {
        await migrateLocalDataToSupabase(sessionUser.id, records, bankrollTransactions, initialBankroll)
      }

      setAuthLoading(false)
    }

    void loadProfileAndData()
  }, [sessionUser])

  useEffect(() => {
    if (!supabase || !sessionUser) {
      return
    }

    const client = supabase

    const persistProfile = async () => {
      const payload = {
        id: sessionUser.id,
        initial_bankroll: initialBankroll,
        settings: {
          ...settings,
        },
        updated_at: new Date().toISOString(),
      }

      const { error } = await client.from('profiles').upsert(payload, { onConflict: 'id' })
      if (error) {
        setAuthError(error.message)
      }
    }

    void persistProfile()
  }, [sessionUser, initialBankroll, settings])

  useEffect(() => {
    if (resendSeconds <= 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [resendSeconds])

  const currentPageLabel = useMemo(
    () => navItems.find((item) => item.id === activePage)?.label ?? 'Dashboard',
    [activePage],
  )

  const handleSelectPage = (pageId: PageId) => {
    setActivePage(pageId)
    setMobileMenuOpen(false)
  }

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !isSupabaseConfigured) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
      return
    }

    const trimmedEmail = authEmail.trim()
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)

    if (!trimmedEmail || !emailIsValid) {
      setAuthError('Enter a valid email address.')
      return
    }

    if (authPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long.')
      return
    }

    if (authPassword !== confirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    if (authLoading) {
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    try {
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: authPassword,
        options: {
          emailRedirectTo: authRedirectUrl,
        },
      })

      if (error) {
        throw error
      }

      setAuthSuccess('Account created successfully. Please check your email and confirm it before logging in.')
      setAuthView('login')
      setAuthPassword('')
      setConfirmPassword('')
    } catch (error) {
      handleAuthError(error, 'Registration failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !isSupabaseConfigured) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
      return
    }

    const trimmedEmail = authEmail.trim()
    if (!trimmedEmail) {
      setAuthError('Enter your email address.')
      return
    }

    if (!authPassword) {
      setAuthError('Enter your password.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: authPassword,
      })

      if (error) {
        throw error
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      if (/email.*not.*confirmed|confirm.*email|verification/i.test(message)) {
        setAuthError('Your account still needs email verification. Check your email or use the resend button below.')
        setAuthView('verify')
      } else if (/429|rate limit|too many requests/i.test(message)) {
        setAuthError('Too many login attempts were sent. Please wait a moment and try again.')
      } else {
        setAuthError(message)
      }
    } finally {
      setAuthLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
      return
    }

    const trimmedEmail = authEmail.trim()
    if (!trimmedEmail) {
      setAuthError('Enter your email address before requesting a new verification email.')
      return
    }

    if (resendSeconds > 0) {
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: {
          emailRedirectTo: authRedirectUrl,
        },
      })

      if (error) {
        throw error
      }

      setResendSeconds(60)
      setAuthSuccess('A new verification email has been sent. Please check your inbox and confirm it before logging in.')
    } catch (error) {
      handleAuthError(error, 'Unable to resend the verification email right now.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !isSupabaseConfigured) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
      return
    }

    const trimmedEmail = authEmail.trim()
    if (!trimmedEmail) {
      setAuthError('Enter your email address to reset your password.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/?reset_password=1`,
      })

      if (error) {
        throw error
      }

      setAuthSuccess('Password reset instructions were sent to your email inbox.')
      setAuthView('login')
    } catch (error) {
      handleAuthError(error, 'Unable to send the password reset email. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase) {
      setAuthError('Supabase is not configured yet.')
      return
    }

    if (newPassword.length < 8) {
      setAuthError('New password must be at least 8 characters long.')
      return
    }

    if (newPassword !== newConfirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        throw error
      }

      setAuthSuccess('Your password has been updated successfully.')
      setNewPassword('')
      setNewConfirmPassword('')
      setAuthView('login')
    } catch (error) {
      handleAuthError(error, 'Unable to update your password right now.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setSessionUser(null)
    setProfile(null)
    setAuthError('')
    setAuthSuccess('')
    setAuthView('login')
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-shell">
        <div className="auth-layout auth-layout--status">
          <aside className="auth-brand-panel">
            <div className="brand-logo-wrap auth-logo-wrap">
              <img src={brandLogo} alt="Kando Algo logo" className="brand-logo" />
            </div>

            <div className="brand-copy">
              <span className="brand-badge">Premium trading intelligence</span>
              <h1>KANDO ALGO</h1>
              <p className="brand-headline">Think Smarter. Analyse Better. Stay Disciplined.</p>
              <p className="brand-description">Your personal sports analytics and betting performance platform.</p>
            </div>

            <div className="analytics-visual" aria-hidden="true">
              <div className="visual-orb visual-orb-one" />
              <div className="visual-orb visual-orb-two" />
              <div className="dashboard-card stat-card stat-card--top">
                <span>ROI</span>
                <strong>+18.4%</strong>
              </div>
              <div className="dashboard-card stat-card stat-card--mid">
                <span>Win rate</span>
                <strong>63.2%</strong>
              </div>
              <svg className="chart-graphic" viewBox="0 0 420 200" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 140C50 120 90 100 130 110C165 118 200 86 240 92C290 98 325 52 370 60C392 64 408 68 420 60V200H0Z" fill="rgba(59,130,246,0.12)" />
                <path d="M0 152C48 136 88 125 124 133C170 142 210 112 250 118C292 124 318 90 370 78C390 74 408 73 420 70" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="3" strokeLinecap="round" />
                <path d="M0 176C40 168 62 160 102 165C144 170 176 146 214 150C240 153 266 139 302 129C344 118 380 122 420 100" fill="none" stroke="rgba(103,232,249,0.7)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </aside>

          <div className="auth-card-panel">
            <div className="auth-card auth-card--status">
              <div className="auth-header">
                <p className="auth-kicker">System status</p>
                <h2>Supabase setup required</h2>
                <p className="auth-subtitle">Add your project URL and publishable key to unlock secure access to Kando Algo.</p>
              </div>

              <div className="status-box">
                <p className="auth-warning">
                  Add your project URL and publishable key in the environment settings before using the authenticated database features.
                </p>
                <p className="auth-meta">Expected variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionUser) {
    return (
      <div className="auth-shell">
        <div className="auth-layout">
          <aside className="auth-brand-panel">
            <div className="brand-logo-wrap auth-logo-wrap">
              <img src={brandLogo} alt="Kando Algo logo" className="brand-logo" />
            </div>

            <div className="brand-copy">
              <span className="brand-badge">Premium trading intelligence</span>
              <h1>KANDO ALGO</h1>
              <p className="brand-headline">Think Smarter. Analyse Better. Stay Disciplined.</p>
              <p className="brand-description">Your personal sports analytics and betting performance platform.</p>
            </div>

            <div className="analytics-visual" aria-hidden="true">
              <div className="visual-orb visual-orb-one" />
              <div className="visual-orb visual-orb-two" />
              <div className="dashboard-card stat-card stat-card--top">
                <span>ROI</span>
                <strong>+18.4%</strong>
              </div>
              <div className="dashboard-card stat-card stat-card--mid">
                <span>Win rate</span>
                <strong>63.2%</strong>
              </div>
              <svg className="chart-graphic" viewBox="0 0 420 200" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 140C50 120 90 100 130 110C165 118 200 86 240 92C290 98 325 52 370 60C392 64 408 68 420 60V200H0Z" fill="rgba(59,130,246,0.12)" />
                <path d="M0 152C48 136 88 125 124 133C170 142 210 112 250 118C292 124 318 90 370 78C390 74 408 73 420 70" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="3" strokeLinecap="round" />
                <path d="M0 176C40 168 62 160 102 165C144 170 176 146 214 150C240 153 266 139 302 129C344 118 380 122 420 100" fill="none" stroke="rgba(103,232,249,0.7)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </aside>

          <div className="auth-card-panel">
            <div className="auth-card">
              <div className="auth-header">
                <p className="auth-kicker">
                  {authView === 'login' ? 'Welcome back' : authView === 'register' ? 'Create account' : authView === 'forgot' ? 'Reset access' : authView === 'verify' ? 'Verify email' : 'Update password'}
                </p>
                <h2>
                  {authView === 'login' ? 'Sign in to Kando Algo' : authView === 'register' ? 'Create your account' : authView === 'forgot' ? 'Reset your password' : authView === 'verify' ? 'Check your inbox' : 'Set a new password'}
                </h2>
                <p className="auth-subtitle">
                  {authView === 'login'
                    ? 'Access your trading dashboard, bankroll insights and performance data.'
                    : authView === 'register'
                      ? 'Start tracking your performance with a secure, verified account.'
                      : authView === 'forgot'
                        ? 'We will send a secure password reset link to your email.'
                        : authView === 'verify'
                          ? 'Your verification email is still pending. Use the button below to request a fresh one.'
                          : 'Choose a secure password to complete your account recovery.'}
                </p>
              </div>

              <div className="auth-mode-toggle">
                <button type="button" className={authView === 'login' ? 'active' : ''} onClick={() => { setAuthView('login'); setAuthError(''); setAuthSuccess(''); }}>
                  Login
                </button>
                <button type="button" className={authView === 'register' ? 'active' : ''} onClick={() => { setAuthView('register'); setAuthError(''); setAuthSuccess(''); }}>
                  Register
                </button>
              </div>

              {authView === 'login' && (
                <form onSubmit={handleLogin} className="auth-form">
                  <label className="field-group full-width">
                    <span>Email address</span>
                    <div className="input-with-icon">
                      <span className="field-icon" aria-hidden="true">✉</span>
                      <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" required />
                    </div>
                  </label>

                  <label className="field-group full-width">
                    <span>Password</span>
                    <div className="password-field input-with-icon">
                      <span className="field-icon" aria-hidden="true">◈</span>
                      <input
                        type={loginPasswordVisible ? 'text' : 'password'}
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="Enter your password"
                        required
                      />
                      <button type="button" className="password-toggle" onClick={() => setLoginPasswordVisible((current) => !current)}>
                        {loginPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <div className="auth-actions-row">
                    <button type="button" className="text-button" onClick={() => { setAuthView('forgot'); setAuthError(''); setAuthSuccess(''); }}>
                      Forgot password?
                    </button>
                  </div>

                  {authError && <p className="form-error auth-error">{authError}</p>}
                  {authSuccess && <p className="form-success auth-success">{authSuccess}</p>}

                  <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
                    {authLoading ? 'Please wait…' : 'Sign in'}
                  </button>

                  <button type="button" className="secondary-button auth-submit" onClick={handleResendVerification} disabled={authLoading || resendSeconds > 0 || !authEmail.trim()}>
                    {resendSeconds > 0 ? `Resend verification (${resendSeconds}s)` : 'Resend verification email'}
                  </button>
                </form>
              )}

              {authView === 'register' && (
                <form onSubmit={handleRegister} className="auth-form">
                  <label className="field-group full-width">
                    <span>Email address</span>
                    <div className="input-with-icon">
                      <span className="field-icon" aria-hidden="true">✉</span>
                      <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" required />
                    </div>
                  </label>

                  <label className="field-group full-width">
                    <span>Password</span>
                    <div className="password-field input-with-icon">
                      <span className="field-icon" aria-hidden="true">◈</span>
                      <input
                        type={registerPasswordVisible ? 'text' : 'password'}
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        minLength={8}
                        placeholder="Create a secure password"
                        required
                      />
                      <button type="button" className="password-toggle" onClick={() => setRegisterPasswordVisible((current) => !current)}>
                        {registerPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <label className="field-group full-width">
                    <span>Confirm password</span>
                    <div className="password-field input-with-icon">
                      <span className="field-icon" aria-hidden="true">◈</span>
                      <input
                        type={confirmPasswordVisible ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        minLength={8}
                        placeholder="Repeat your password"
                        required
                      />
                      <button type="button" className="password-toggle" onClick={() => setConfirmPasswordVisible((current) => !current)}>
                        {confirmPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  {authError && <p className="form-error auth-error">{authError}</p>}
                  {authSuccess && <p className="form-success auth-success">{authSuccess}</p>}

                  <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
                    {authLoading ? 'Please wait…' : 'Create account'}
                  </button>
                </form>
              )}

              {authView === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="auth-form">
                  <label className="field-group full-width">
                    <span>Email address</span>
                    <div className="input-with-icon">
                      <span className="field-icon" aria-hidden="true">✉</span>
                      <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" required />
                    </div>
                  </label>

                  {authError && <p className="form-error auth-error">{authError}</p>}
                  {authSuccess && <p className="form-success auth-success">{authSuccess}</p>}

                  <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
                    {authLoading ? 'Please wait…' : 'Send reset link'}
                  </button>

                  <button type="button" className="text-button" onClick={() => { setAuthView('login'); setAuthError(''); setAuthSuccess(''); }}>
                    Back to login
                  </button>
                </form>
              )}

              {authView === 'verify' && (
                <div className="auth-form">
                  <div className="status-box">
                    <p className="auth-warning">
                      Your email has not been confirmed yet. Check your inbox and click the verification link, or request a new one below.
                    </p>
                  </div>

                  {authError && <p className="form-error auth-error">{authError}</p>}
                  {authSuccess && <p className="form-success auth-success">{authSuccess}</p>}

                  <button type="button" className="primary-button auth-submit" onClick={handleResendVerification} disabled={authLoading || resendSeconds > 0 || !authEmail.trim()}>
                    {resendSeconds > 0 ? `Resend verification (${resendSeconds}s)` : 'Resend verification email'}
                  </button>

                  <button type="button" className="text-button" onClick={() => { setAuthView('login'); setAuthError(''); setAuthSuccess(''); }}>
                    Back to login
                  </button>
                </div>
              )}

              {authView === 'reset' && (
                <form onSubmit={handlePasswordReset} className="auth-form">
                  <label className="field-group full-width">
                    <span>New password</span>
                    <div className="password-field input-with-icon">
                      <span className="field-icon" aria-hidden="true">◈</span>
                      <input type={loginPasswordVisible ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} placeholder="Enter a new password" required />
                      <button type="button" className="password-toggle" onClick={() => setLoginPasswordVisible((current) => !current)}>
                        {loginPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <label className="field-group full-width">
                    <span>Confirm new password</span>
                    <div className="password-field input-with-icon">
                      <span className="field-icon" aria-hidden="true">◈</span>
                      <input type={confirmPasswordVisible ? 'text' : 'password'} value={newConfirmPassword} onChange={(event) => setNewConfirmPassword(event.target.value)} minLength={8} placeholder="Repeat your new password" required />
                      <button type="button" className="password-toggle" onClick={() => setConfirmPasswordVisible((current) => !current)}>
                        {confirmPasswordVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  {authError && <p className="form-error auth-error">{authError}</p>}
                  {authSuccess && <p className="form-success auth-success">{authSuccess}</p>}

                  <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
                    {authLoading ? 'Please wait…' : 'Update password'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-logo-wrap">
            <img src={brandLogo} alt="Kando Algo logo" className="brand-logo" />
          </div>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => handleSelectPage(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              ☰
            </button>
            <div>
              <p className="page-kicker">Overview</p>
              <h1>{currentPageLabel}</h1>
            </div>
          </div>

          <div className="user-area" aria-label="Profile">
            <div className="avatar">{(profile?.display_name ?? sessionUser.email ?? 'KA').slice(0, 2).toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{profile?.display_name ?? sessionUser.email ?? 'Kando'}</span>
              <span className="user-role">{authLoading ? 'Syncing…' : 'Analyst'}</span>
            </div>
            <button type="button" className="secondary-button auth-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className="content-area">
          <PageContent
            pageId={activePage}
            records={records}
            setRecords={setRecords}
            initialBankroll={initialBankroll}
            setInitialBankroll={setInitialBankroll}
            bankrollTransactions={bankrollTransactions}
            setBankrollTransactions={setBankrollTransactions}
            settings={settings}
            setSettings={setSettings}
          />
        </main>
      </div>
    </div>
  )
}

function PageContent({
  pageId,
  records,
  setRecords,
  initialBankroll,
  setInitialBankroll,
  bankrollTransactions,
  setBankrollTransactions,
  settings,
  setSettings,
}: {
  pageId: PageId
  records: BetRecord[]
  setRecords: React.Dispatch<React.SetStateAction<BetRecord[]>>
  initialBankroll: number
  setInitialBankroll: React.Dispatch<React.SetStateAction<number>>
  bankrollTransactions: BankrollTransaction[]
  setBankrollTransactions: React.Dispatch<React.SetStateAction<BankrollTransaction[]>>
  settings: AppSettingsState
  setSettings: React.Dispatch<React.SetStateAction<AppSettingsState>>
}) {
  if (pageId === 'dashboard') {
    const settledRecords = records.filter((record) => record.status !== 'Pending')
    const totalNet = settledRecords.reduce((total, record) => total + getNetResult(record), 0)
    const totalDeposits = bankrollTransactions
      .filter((transaction) => transaction.type === 'deposit')
      .reduce((total, transaction) => total + transaction.amount, 0)
    const totalWithdrawals = bankrollTransactions
      .filter((transaction) => transaction.type === 'withdrawal')
      .reduce((total, transaction) => total + transaction.amount, 0)
    const availableBankroll = initialBankroll + totalDeposits - totalWithdrawals + totalNet
    const totalBets = records.length
    const settledCount = settledRecords.length
    const wonBets = records.filter((record) => record.status === 'Won').length
    const winRate = settledCount === 0 ? 0 : (wonBets / settledCount) * 100

    const dashboardSummary: Array<{
      label: string
      value: string
      note: string
      tone: 'blue' | 'green' | 'red' | 'amber'
    }> = [
      {
        label: 'Total Bankroll',
        value: formatCurrency(availableBankroll),
        note: availableBankroll >= 0 ? 'Current available funds' : 'Below planned balance',
        tone: 'blue',
      },
      {
        label: 'Net Profit/Loss',
        value: formatCurrency(totalNet),
        note: totalNet >= 0 ? 'Settled results so far' : 'Settled losses so far',
        tone: totalNet >= 0 ? 'green' : 'red',
      },
      {
        label: 'Total Bets',
        value: String(totalBets),
        note: totalBets === 0 ? 'No bets recorded' : 'All recorded bets',
        tone: 'amber',
      },
      {
        label: 'Win Rate',
        value: `${winRate.toFixed(1)}%`,
        note: settledCount === 0 ? 'No settled results yet' : 'Settled bets only',
        tone: 'red',
      },
    ]

    return (
      <section className="page-panel dashboard-panel">
        <div className="dashboard-welcome">
          <div>
            <p className="section-label">Welcome</p>
            <h2>Welcome back, Kando.</h2>
          </div>
          <p>
            Your trading workspace is ready. Add bets, review results, and track your
            bankroll as the system evolves.
          </p>
        </div>

        <div className="summary-grid">
          {dashboardSummary.map((item) => (
            <SummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              note={item.note}
              tone={item.tone}
            />
          ))}
        </div>

        <div className="dashboard-grid">
          <section className="panel-block">
            <div className="panel-header">
              <h3>Performance Overview</h3>
              <span className="panel-tag">No data</span>
            </div>
            <PerformanceChartPlaceholder />
          </section>

          <section className="panel-block">
            <div className="panel-header">
              <h3>Recent Activity</h3>
              <span className="panel-tag subtle">Empty</span>
            </div>
            <EmptyState />
          </section>
        </div>
      </section>
    )
  }

  if (pageId === 'trade-calendar') {
    return <TradeCalendarPage records={records} />
  }

  if (pageId === 'trade-journal') {
    return <TradeJournalPage records={records} setRecords={setRecords} />
  }

  if (pageId === 'bankroll') {
    return (
      <BankrollPage
        records={records}
        initialBankroll={initialBankroll}
        setInitialBankroll={setInitialBankroll}
        bankrollTransactions={bankrollTransactions}
        setBankrollTransactions={setBankrollTransactions}
      />
    )
  }

  if (pageId === 'analytics') {
    return <AnalyticsPage records={records} />
  }

  if (pageId === 'prediction-centre') {
    return <PredictionCentrePage />
  }

  if (pageId === 'backtesting') {
    return <BacktestingPage />
  }

  if (pageId === 'settings') {
    return <SettingsPage settings={settings} setSettings={setSettings} />
  }

  return (
    <section className="page-panel generic-panel">
      <div className="page-header">
        <div>
          <p className="section-label">Section</p>
          <h2>{navItems.find((item) => item.id === pageId)?.label ?? 'Page'}</h2>
        </div>
      </div>

      <p className="page-intro">
        This section is currently under development and will be expanded as the
        application grows.
      </p>
    </section>
  )
}

function BankrollPage({
  records,
  initialBankroll,
  setInitialBankroll,
  bankrollTransactions,
  setBankrollTransactions,
}: {
  records: BetRecord[]
  initialBankroll: number
  setInitialBankroll: React.Dispatch<React.SetStateAction<number>>
  bankrollTransactions: BankrollTransaction[]
  setBankrollTransactions: React.Dispatch<React.SetStateAction<BankrollTransaction[]>>
}) {
  const [transactionType, setTransactionType] = useState<BankrollTransactionType>('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')

  const settledProfitLoss = records.reduce((total, record) => total + getNetResult(record), 0)
  const totalDeposits = bankrollTransactions
    .filter((transaction) => transaction.type === 'deposit')
    .reduce((total, transaction) => total + transaction.amount, 0)
  const totalWithdrawals = bankrollTransactions
    .filter((transaction) => transaction.type === 'withdrawal')
    .reduce((total, transaction) => total + transaction.amount, 0)
  const totalStakesPlaced = records.reduce((total, record) => total + record.stake, 0)
  const availableBankroll = initialBankroll + totalDeposits - totalWithdrawals + settledProfitLoss

  const transactionRows = [...bankrollTransactions].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
  )

  const handleSaveTransaction = () => {
    const numericAmount = Number(amount)
    const trimmedDescription = description.trim()

    if (!date) {
      setFormError('Please choose a transaction date.')
      return
    }

    if (!trimmedDescription) {
      setFormError('Please add a description for this transaction.')
      return
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('Transaction amount must be greater than zero.')
      return
    }

    if (transactionType === 'withdrawal' && numericAmount > availableBankroll) {
      setFormError('Withdrawal cannot exceed the available bankroll.')
      return
    }

    const newTransaction: BankrollTransaction = {
      id: Date.now(),
      date,
      type: transactionType,
      description: trimmedDescription,
      amount: numericAmount,
    }

    setBankrollTransactions((current) => [newTransaction, ...current])
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setTransactionType('deposit')
    setFormError('')
  }

  return (
    <section className="page-panel bankroll-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Cash management</p>
          <h2>Bankroll</h2>
        </div>
      </div>

      <p className="page-intro">
        Track your bankroll, monitor deposits and withdrawals, and compare them with your settled betting results.
      </p>

      <div className="summary-grid journal-summary-grid">
        <SummaryCard
          label="Current Available Bankroll"
          value={formatCurrency(availableBankroll)}
          note={availableBankroll >= 0 ? 'Available funds' : 'Below planned balance'}
          tone={availableBankroll >= 0 ? 'green' : 'red'}
        />
        <SummaryCard
          label="Total Deposits"
          value={formatCurrency(totalDeposits)}
          note="Cash added to bankroll"
          tone="blue"
        />
        <SummaryCard
          label="Total Withdrawals"
          value={formatCurrency(totalWithdrawals)}
          note="Cash taken out"
          tone="amber"
        />
        <SummaryCard
          label="Total Betting Profit/Loss"
          value={formatCurrency(settledProfitLoss)}
          note={settledProfitLoss >= 0 ? 'Settled betting result' : 'Settled betting loss'}
          tone={settledProfitLoss >= 0 ? 'green' : 'red'}
        />
        <SummaryCard
          label="Total Stakes Placed"
          value={formatCurrency(totalStakesPlaced)}
          note="Total amount staked"
          tone="blue"
        />
      </div>

      <div className="bankroll-grid">
        <section className="bankroll-form-panel">
          <div className="panel-header">
            <h3>Manage Bankroll</h3>
          </div>

          <div className="bankroll-form">
            <label className="field-group full-width">
              <span>Initial Bankroll</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={initialBankroll}
                onChange={(event) => setInitialBankroll(Number(event.target.value) || 0)}
              />
            </label>

            <label className="field-group">
              <span>Transaction Type</span>
              <select
                value={transactionType}
                onChange={(event) => setTransactionType(event.target.value as BankrollTransactionType)}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </label>

            <label className="field-group">
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>

            <label className="field-group full-width">
              <span>Description</span>
              <input
                type="text"
                value={description}
                placeholder="e.g. Monthly bankroll top-up"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="field-group full-width">
              <span>Amount (MK)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                placeholder="5000"
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>

            {formError && <p className="form-error">{formError}</p>}

            <button type="button" className="primary-button" onClick={handleSaveTransaction}>
              Record {transactionType === 'deposit' ? 'Deposit' : 'Withdrawal'}
            </button>
          </div>
        </section>

        <section className="bankroll-history-panel">
          <div className="panel-header">
            <h3>Transaction History</h3>
          </div>

          {transactionRows.length === 0 ? (
            <div className="empty-state compact-empty">
              <div className="empty-state-icon" aria-hidden="true">
                —
              </div>
              <h4>No transactions yet</h4>
              <p>Set the starting bankroll and add your first deposit or withdrawal.</p>
            </div>
          ) : (
            <div className="history-list">
              {transactionRows.map((transaction) => (
                <article key={transaction.id} className="history-item">
                  <div className="history-main">
                    <div>
                      <p className="history-title">{transaction.description}</p>
                      <p className="history-date">{new Date(`${transaction.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <span className={`status-pill status-${transaction.type}`}>
                      {transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                    </span>
                  </div>
                  <div className="history-amount">
                    {transaction.type === 'deposit' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function AnalyticsPage({ records }: { records: BetRecord[] }) {
  const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly'>('weekly')

  const settledRecords = records.filter((record) => record.status !== 'Pending')
  const totalNet = settledRecords.reduce((total, record) => total + getNetResult(record), 0)
  const totalBets = records.length
  const wonBets = records.filter((record) => record.status === 'Won').length
  const lostBets = records.filter((record) => record.status === 'Lost').length
  const pendingBets = records.filter((record) => record.status === 'Pending').length
  const voidBets = records.filter((record) => record.status === 'Void').length
  const settledCount = settledRecords.length
  const winRate = settledCount === 0 ? 0 : (wonBets / settledCount) * 100
  const averageOdds = totalBets === 0 ? 0 : records.reduce((total, record) => total + record.odds, 0) / totalBets
  const averageStake = totalBets === 0 ? 0 : records.reduce((total, record) => total + record.stake, 0) / totalBets

  const sportPerformance = useMemo(() => {
    const map = new Map<string, number>()

    settledRecords.forEach((record) => {
      const current = map.get(record.sport) ?? 0
      map.set(record.sport, current + getNetResult(record))
    })

    return [...map.entries()].sort((left, right) => right[1] - left[1])
  }, [settledRecords])

  const bestSport = sportPerformance[0]

  const chartData = useMemo(() => {
    if (records.length === 0) {
      return []
    }

    if (filter === 'daily') {
      const days = 7
      const entries: Array<{ label: string; value: number }> = []

      for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        date.setDate(date.getDate() - index)
        const stamp = formatDateKey(date)
        const value = records
          .filter((record) => record.date === stamp && record.status !== 'Pending')
          .reduce((sum, record) => sum + getNetResult(record), 0)

        entries.push({
          label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          value,
        })
      }

      return entries
    }

    if (filter === 'weekly') {
      const entries: Array<{ label: string; value: number }> = []
      const current = new Date()

      for (let index = 7; index >= 1; index -= 1) {
        const endDate = new Date(current)
        endDate.setDate(current.getDate() - (index - 1) * 7)

        const startDate = new Date(current)
        startDate.setDate(endDate.getDate() - 6)

        const value = records
          .filter((record) => record.status !== 'Pending')
          .filter((record) => {
            const recordDate = new Date(`${record.date}T00:00:00`)
            return recordDate >= startDate && recordDate <= endDate
          })
          .reduce((sum, record) => sum + getNetResult(record), 0)

        entries.push({
          label: `${startDate.toLocaleDateString('en-GB', { day: 'numeric' })} - ${endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          value,
        })
      }

      return entries
    }

    const entries: Array<{ label: string; value: number }> = []
    const currentDate = new Date()

    for (let index = 5; index >= 0; index -= 1) {
      const targetMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - index, 1)
      const monthKey = `${targetMonth.getFullYear()}-${`${targetMonth.getMonth() + 1}`.padStart(2, '0')}`

      const value = records
        .filter((record) => record.status !== 'Pending')
        .filter((record) => {
          const parsed = new Date(`${record.date}T00:00:00`)
          return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}` === monthKey
        })
        .reduce((sum, record) => sum + getNetResult(record), 0)

      entries.push({
        label: targetMonth.toLocaleDateString('en-US', { month: 'short' }),
        value,
      })
    }

    return entries
  }, [filter, records])

  const maxBarValue = chartData.reduce((max, point) => Math.max(max, Math.abs(point.value)), 0) || 1
  const recentTrends = [...chartData].slice(-5)

  return (
    <section className="page-panel analytics-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Overview</p>
          <h2>Analytics</h2>
        </div>
      </div>

      <p className="page-intro">
        Review settled betting performance, profit trends, and sport-level efficiency using your actual journal activity.
      </p>

      {records.length === 0 ? (
        <div className="empty-state analytics-empty-state">
          <div className="empty-state-icon" aria-hidden="true">—</div>
          <h4>No betting records yet</h4>
          <p>Add bets in the Trade Journal to generate analytics and performance trends.</p>
        </div>
      ) : (
        <>
          <div className="summary-grid journal-summary-grid">
            <SummaryCard
              label="Total Net Profit/Loss"
              value={formatCurrency(totalNet)}
              note={totalNet >= 0 ? 'Positive settled result' : 'Negative settled result'}
              tone={totalNet >= 0 ? 'green' : 'red'}
            />
            <SummaryCard
              label="Total Bets"
              value={String(totalBets)}
              note="All recorded bets"
              tone="blue"
            />
            <SummaryCard
              label="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              note="Settled bets only"
              tone="amber"
            />
            <SummaryCard
              label="Average Odds"
              value={averageOdds.toFixed(2)}
              note="Across all bets"
              tone="blue"
            />
            <SummaryCard
              label="Average Stake"
              value={formatCurrency(averageStake)}
              note="Across all bets"
              tone="amber"
            />
          </div>

          <div className="analytics-grid">
            <section className="panel-block analytics-chart-panel">
              <div className="panel-header analytics-header">
                <h3>Profit/Loss Performance</h3>
                <div className="analytics-filter-group">
                  {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={`filter-chip ${filter === period ? 'active' : ''}`}
                      onClick={() => setFilter(period)}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="analytics-chart" aria-label="Profit and loss chart">
                {chartData.map((point) => (
                  <div key={point.label} className="chart-column">
                    <span className="chart-label">{point.label}</span>
                    <div className="chart-bar-wrap">
                      <span
                        className={`chart-bar ${point.value >= 0 ? 'positive' : 'negative'}`}
                        style={{ height: `${Math.max(8, (Math.abs(point.value) / maxBarValue) * 100)}%` }}
                        title={`${point.label}: ${formatCurrency(point.value)}`}
                      />
                    </div>
                    <span className="chart-value">{formatCurrency(point.value)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-block analytics-breakdown-panel">
              <div className="panel-header">
                <h3>Bet Breakdown</h3>
              </div>

              <div className="breakdown-list">
                <div className="breakdown-item">
                  <span>Won</span>
                  <strong>{wonBets}</strong>
                </div>
                <div className="breakdown-item">
                  <span>Lost</span>
                  <strong>{lostBets}</strong>
                </div>
                <div className="breakdown-item">
                  <span>Pending</span>
                  <strong>{pendingBets}</strong>
                </div>
                <div className="breakdown-item">
                  <span>Void</span>
                  <strong>{voidBets}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className="analytics-lower-grid">
            <section className="panel-block">
              <div className="panel-header">
                <h3>Best-Performing Sport</h3>
              </div>

              {bestSport ? (
                <div className="sport-highlight">
                  <p className="sport-name">{bestSport[0]}</p>
                  <p className="sport-value">{formatCurrency(bestSport[1])}</p>
                </div>
              ) : (
                <div className="empty-state small-empty-state">
                  <div className="empty-state-icon" aria-hidden="true">—</div>
                  <h4>No settled sports data</h4>
                  <p>Sport performance will appear once bets are recorded and settled.</p>
                </div>
              )}
            </section>

            <section className="panel-block">
              <div className="panel-header">
                <h3>Recent Performance Trends</h3>
              </div>

              <div className="trend-list">
                {recentTrends.length === 0 ? (
                  <div className="empty-state small-empty-state">
                    <div className="empty-state-icon" aria-hidden="true">—</div>
                    <h4>No performance trend</h4>
                    <p>Recent trend data will appear as soon as bets are added.</p>
                  </div>
                ) : (
                  recentTrends.map((point) => (
                    <div key={point.label} className="trend-item">
                      <span>{point.label}</span>
                      <strong className={point.value >= 0 ? 'positive-text' : 'negative-text'}>
                        {formatCurrency(point.value)}
                      </strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}

function BacktestingPage() {
  const [strategyName, setStrategyName] = useState('')
  const [description, setDescription] = useState('')
  const [sport, setSport] = useState('Football')
  const [market, setMarket] = useState('1X2')
  const [dataset, setDataset] = useState('No dataset connected')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [stake, setStake] = useState('25')
  const [odds, setOdds] = useState('2.10')
  const [statusMessage, setStatusMessage] = useState(
    'No historical dataset or backtesting engine is connected yet. Upload a CSV or import a dataset to run a strategy review.',
  )
  const [results, setResults] = useState({
    totalSimulatedBets: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netProfit: 0,
    roi: 0,
    maxDrawdown: 0,
    chart: [{ label: 'Awaiting dataset', value: 0 }],
  })
  const [history, setHistory] = useState<Array<{
    id: number
    strategy: string
    sport: string
    market: string
    date: string
    profit: number
    note: string
  }>>([])

  const sportOptions = ['Football', 'Basketball', 'Cricket', 'Tennis']
  const marketOptions = ['1X2', 'Double Chance', 'Over/Under', 'Handicap', 'BTTS']

  const handleRunBacktest = () => {
    if (!strategyName.trim()) {
      setStatusMessage('Enter a strategy name before running a backtest.')
      return
    }

    if (!dataset || dataset === 'No dataset connected') {
      setStatusMessage('Historical dataset required: add a CSV upload, API feed, or imported match history before running a backtest.')
      setResults({
        totalSimulatedBets: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netProfit: 0,
        roi: 0,
        maxDrawdown: 0,
        chart: [{ label: 'Awaiting dataset', value: 0 }],
      })
      return
    }

    const numericStake = Number(stake)
    const numericOdds = Number(odds)

    if (!Number.isFinite(numericStake) || numericStake <= 0) {
      setStatusMessage('Stake must be greater than zero.')
      return
    }

    if (!Number.isFinite(numericOdds) || numericOdds <= 0) {
      setStatusMessage('Odds must be greater than zero.')
      return
    }

    const nextResults = {
      totalSimulatedBets: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netProfit: 0,
      roi: 0,
      maxDrawdown: 0,
      chart: [{ label: 'Dataset ready', value: 0 }],
    }

    setResults(nextResults)
    setStatusMessage('This page is intentionally configured for safe, manual strategy review. The historical dataset is not connected, so no simulated results are being claimed as real.')

    setHistory((current) => [
      {
        id: Date.now(),
        strategy: strategyName.trim(),
        sport,
        market,
        date: new Date().toISOString().slice(0, 10),
        profit: 0,
        note: 'Dataset queued; results pending live historical import.',
      },
      ...current,
    ].slice(0, 5))
  }

  return (
    <section className="page-panel backtesting-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Strategy review</p>
          <h2>Backtesting</h2>
        </div>
      </div>

      <p className="page-intro">
        Review a betting strategy against historical data without mixing it with real Trade Journal outcomes. Simulated runs are clearly marked as analysis-only.
      </p>

      <div className="backtest-alert">
        <strong>Important:</strong> This page is a strategy review workspace only. It does not place bets and does not claim historical results are real unless a dataset is connected.
      </div>

      <div className="backtest-grid">
        <section className="panel-block backtest-form-panel">
          <div className="panel-header">
            <h3>Backtest setup</h3>
          </div>

          <div className="backtest-form">
            <label className="field-group full-width">
              <span>Strategy name</span>
              <input
                type="text"
                value={strategyName}
                placeholder="Value Bet Filter"
                onChange={(event) => setStrategyName(event.target.value)}
              />
            </label>

            <label className="field-group full-width">
              <span>Strategy description</span>
              <textarea
                value={description}
                placeholder="Describe the logic, filters, and conditions for this strategy."
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="field-group">
              <span>Sport</span>
              <select value={sport} onChange={(event) => setSport(event.target.value)}>
                {sportOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span>Market</span>
              <select value={market} onChange={(event) => setMarket(event.target.value)}>
                {marketOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field-group full-width">
              <span>Historical dataset</span>
              <select value={dataset} onChange={(event) => setDataset(event.target.value)}>
                <option value="No dataset connected">No dataset connected</option>
                <option value="CSV upload required">CSV upload required</option>
                <option value="Imported 2024 results">Imported 2024 results</option>
              </select>
            </label>

            <label className="field-group">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>

            <label className="field-group">
              <span>End date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>

            <label className="field-group">
              <span>Stake (MK)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
              />
            </label>

            <label className="field-group">
              <span>Odds</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={odds}
                onChange={(event) => setOdds(event.target.value)}
              />
            </label>
          </div>

          <div className="backtest-actions">
            <button type="button" className="primary-button" onClick={handleRunBacktest}>
              Run Backtest
            </button>
          </div>
        </section>

        <section className="panel-block backtest-results-panel">
          <div className="panel-header">
            <h3>Results summary</h3>
            <span className="panel-tag subtle">Analysis only</span>
          </div>

          <div className="summary-grid backtest-summary-grid">
            <SummaryCard
              label="Total Simulated Bets"
              value={String(results.totalSimulatedBets)}
              note="No dataset connected"
              tone="blue"
            />
            <SummaryCard
              label="Wins"
              value={String(results.wins)}
              note="No live output yet"
              tone="green"
            />
            <SummaryCard
              label="Losses"
              value={String(results.losses)}
              note="No live output yet"
              tone="red"
            />
            <SummaryCard
              label="Win Rate"
              value={`${results.winRate.toFixed(1)}%`}
              note="Waiting for dataset"
              tone="amber"
            />
            <SummaryCard
              label="Net Profit/Loss"
              value={formatCurrency(results.netProfit)}
              note="MK simulation output"
              tone={results.netProfit >= 0 ? 'green' : 'red'}
            />
            <SummaryCard
              label="ROI"
              value={`${results.roi.toFixed(1)}%`}
              note="No simulated data yet"
              tone="blue"
            />
            <SummaryCard
              label="Max Drawdown"
              value={formatCurrency(results.maxDrawdown)}
              note="Waiting for dataset"
              tone="amber"
            />
          </div>

          <div className="backtest-chart-panel">
            <div className="panel-header compact-panel-header">
              <h3>Profit/Loss performance</h3>
            </div>

            <div className="backtest-chart" aria-label="Backtest performance chart">
              {results.chart.map((point, index) => (
                <div key={`${point.label}-${index}`} className="backtest-chart-column">
                  <span className="backtest-chart-bar" style={{ height: `${Math.max(14, (Math.abs(point.value) / 100) * 100 || 14)}%` }} />
                  <span className="chart-label">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel-block backtest-history-panel">
        <div className="panel-header">
          <h3>Backtest history</h3>
          <span className="panel-tag subtle">Saved runs</span>
        </div>

        <div className="backtest-status-note">{statusMessage}</div>

        {history.length === 0 ? (
          <div className="empty-state compact-empty">
            <div className="empty-state-icon" aria-hidden="true">◌</div>
            <h4>No backtests recorded</h4>
            <p>Run a backtest once a historical dataset is connected or uploaded.</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <article key={item.id} className="history-item">
                <div className="history-main">
                  <div>
                    <p className="history-title">{item.strategy}</p>
                    <p className="history-date">{item.sport} • {item.market} • {new Date(`${item.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`status-pill ${item.profit >= 0 ? 'status-won' : 'status-lost'}`}>
                    {item.profit >= 0 ? 'UP' : 'DOWN'}
                  </span>
                </div>

                <div className="history-amount">{formatCurrency(item.profit)}</div>
                <p className="history-note">{item.note}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function SettingsPage({
  settings,
  setSettings,
}: {
  settings: AppSettingsState
  setSettings: React.Dispatch<React.SetStateAction<AppSettingsState>>
}) {
  const updateSetting = <K extends keyof AppSettingsState>(key: K, value: AppSettingsState[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const setTheme = (theme: 'dark' | 'light') => {
    setSettings((current) => ({ ...current, theme }))
  }

  const backendUnavailable = 'Unavailable until backend authentication or Supabase is configured.'

  return (
    <section className="page-panel settings-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Workspace preferences</p>
          <h2>Settings</h2>
        </div>
      </div>

      <p className="page-intro">
        Configure your personal workspace preferences. Local-only settings are saved in this browser session, while backend-managed features remain clearly marked as unavailable.
      </p>

      <div className="settings-stack">
        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Profile Settings</h3>
          </div>

          <div className="settings-grid">
            <label className="field-group">
              <span>Display name</span>
              <input
                type="text"
                value={settings.displayName}
                placeholder="Your display name"
                onChange={(event) => updateSetting('displayName', event.target.value)}
              />
            </label>

            <label className="field-group">
              <span>Email</span>
              <input
                type="email"
                value={settings.email}
                placeholder="you@example.com"
                onChange={(event) => updateSetting('email', event.target.value)}
              />
            </label>

            <label className="field-group full-width">
              <span>Profile information</span>
              <textarea
                value={settings.profileInfo}
                placeholder="Add a short profile summary for your trading workflow."
                onChange={(event) => updateSetting('profileInfo', event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Account Settings</h3>
          </div>

          <div className="settings-grid">
            <label className="field-group full-width">
              <span>Account preference</span>
              <select
                value={settings.accountPreference}
                onChange={(event) => updateSetting('accountPreference', event.target.value)}
              >
                <option value="Analyst">Analyst</option>
                <option value="Trader">Trader</option>
                <option value="Investor">Investor</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Currency Settings</h3>
          </div>

          <div className="settings-grid">
            <label className="field-group full-width">
              <span>Default currency</span>
              <input type="text" value={settings.defaultCurrency} readOnly />
            </label>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Betting Preferences</h3>
          </div>

          <div className="settings-grid">
            <label className="field-group">
              <span>Default stake (MK)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.defaultStake}
                onChange={(event) => updateSetting('defaultStake', event.target.value)}
              />
            </label>

            <label className="field-group">
              <span>Preferred odds format</span>
              <select
                value={settings.preferredOddsFormat}
                onChange={(event) => updateSetting('preferredOddsFormat', event.target.value)}
              >
                <option value="Decimal">Decimal</option>
                <option value="Fractional">Fractional</option>
                <option value="American">American</option>
              </select>
            </label>

            <label className="field-group full-width">
              <span>Preferred sport</span>
              <select
                value={settings.preferredSport}
                onChange={(event) => updateSetting('preferredSport', event.target.value)}
              >
                <option value="Football">Football</option>
                <option value="Basketball">Basketball</option>
                <option value="Cricket">Cricket</option>
                <option value="Tennis">Tennis</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Appearance</h3>
          </div>

          <div className="theme-toggle-group" aria-label="Theme selector">
            <button
              type="button"
              className={`theme-toggle-button ${settings.theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={`theme-toggle-button ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Notifications</h3>
          </div>

          <div className="settings-toggle-list">
            <label className="toggle-row">
              <div>
                <strong>Betting reminders</strong>
                <span>Receive local reminders before placing a bet.</span>
              </div>
              <input
                type="checkbox"
                checked={settings.bettingReminders}
                onChange={(event) => updateSetting('bettingReminders', event.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Result update notifications</strong>
                <span>Show local result update alerts for settled bets.</span>
              </div>
              <input
                type="checkbox"
                checked={settings.resultUpdates}
                onChange={(event) => updateSetting('resultUpdates', event.target.checked)}
              />
            </label>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Security</h3>
          </div>

          <div className="backend-locked-box">
            <p><strong>Password change</strong></p>
            <p>{backendUnavailable}</p>
            <button type="button" className="secondary-button" disabled>
              Change Password
            </button>
          </div>

          <div className="backend-locked-box">
            <p><strong>Session management</strong></p>
            <p>{settings.sessionManagement}</p>
            <button type="button" className="secondary-button" disabled>
              Manage Sessions
            </button>
          </div>
        </section>

        <section className="panel-block settings-section">
          <div className="panel-header">
            <h3>Data Management</h3>
          </div>

          <div className="settings-toggle-list">
            <label className="toggle-row">
              <div>
                <strong>Export betting records</strong>
                <span>CSV export support depends on a future backend or storage layer.</span>
              </div>
              <button type="button" className="secondary-button" disabled>
                Export
              </button>
            </label>

            <label className="toggle-row">
              <div>
                <strong>Export bankroll data</strong>
                <span>Bankroll export requires the app’s data layer to be connected.</span>
              </div>
              <button type="button" className="secondary-button" disabled>
                Export
              </button>
            </label>
          </div>
        </section>
      </div>
    </section>
  )
}

function PredictionCentrePage() {
  const [sportFilter, setSportFilter] = useState('All Sports')
  const [leagueFilter, setLeagueFilter] = useState('All Leagues')
  const [history, setHistory] = useState<Array<{
    id: number
    sport: string
    league: string
    match: string
    recommendation: 'BET' | 'AVOID' | 'REVIEW'
    confidence: number
    actualResult: string
    recordedAt: string
  }>>([])
  const [draft, setDraft] = useState({
    sport: '',
    league: '',
    match: '',
    recommendation: 'REVIEW' as 'BET' | 'AVOID' | 'REVIEW',
    confidence: '0',
    actualResult: 'Pending',
  })

  const sportOptions = ['All Sports', 'Football', 'Basketball', 'Cricket', 'Tennis']
  const leagueOptions = ['All Leagues', 'Premier League', 'Champions League', 'NBA', 'Domestic Cup']

  const filteredHistory = history.filter((entry) => {
    const matchesSport = sportFilter === 'All Sports' || entry.sport === sportFilter
    const matchesLeague = leagueFilter === 'All Leagues' || entry.league === leagueFilter
    return matchesSport && matchesLeague
  })

  const handleDraftChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setDraft((current) => ({ ...current, [name]: value }))
  }

  const handleSavePredictionResult = () => {
    if (!draft.sport.trim() || !draft.league.trim() || !draft.match.trim()) {
      return
    }

    const entry = {
      id: Date.now(),
      sport: draft.sport.trim(),
      league: draft.league.trim(),
      match: draft.match.trim(),
      recommendation: draft.recommendation,
      confidence: Number(draft.confidence) || 0,
      actualResult: draft.actualResult,
      recordedAt: new Date().toISOString().slice(0, 10),
    }

    setHistory((current) => [entry, ...current])
    setDraft({
      sport: '',
      league: '',
      match: '',
      recommendation: 'REVIEW',
      confidence: '0',
      actualResult: 'Pending',
    })
  }

  const totalPredictions = history.length
  const averageConfidence = totalPredictions === 0 ? 0 : history.reduce((total, item) => total + item.confidence, 0) / totalPredictions

  return (
    <section className="page-panel prediction-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Analyst workspace</p>
          <h2>Prediction Centre</h2>
        </div>
      </div>

      <p className="page-intro">
        Review planned match analysis, track your assessment framework, and log results without turning predictions into actual trades.
      </p>

      <div className="summary-grid journal-summary-grid">
        <SummaryCard
          label="Prediction Notes"
          value={String(totalPredictions)}
          note="Manual analyst entries"
          tone="blue"
        />
        <SummaryCard
          label="Avg. Confidence"
          value={`${averageConfidence.toFixed(0)}%`}
          note="Recorded confidence score"
          tone="green"
        />
        <SummaryCard
          label="Review Calls"
          value={String(history.filter((entry) => entry.recommendation === 'REVIEW').length)}
          note="Awaiting stronger evidence"
          tone="amber"
        />
        <SummaryCard
          label="Live Feed"
          value="Offline"
          note="No connected prediction engine"
          tone="red"
        />
      </div>

      <div className="prediction-toolbar">
        <div className="field-group">
          <span>Sport</span>
          <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
            {sportOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <span>League</span>
          <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}>
            {leagueOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="prediction-grid">
        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Upcoming match analysis</h3>
            <span className="panel-tag subtle">Manual mode</span>
          </div>

          <div className="prediction-empty-box">
            <div className="empty-state-icon" aria-hidden="true">⏳</div>
            <h4>Prediction feed unavailable</h4>
            <p>
              No live fixtures, data feed, or model is connected. This section is ready for analyst review and manual result logging.
            </p>
          </div>
        </section>

        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Match details & team comparison</h3>
            <span className="panel-tag subtle">Pending data</span>
          </div>

          <div className="prediction-empty-box compact-box">
            <div className="empty-state-icon" aria-hidden="true">—</div>
            <h4>Waiting on live match data</h4>
            <p>Team form, venue context, and comparison metrics will appear here once a connected feed is added.</p>
          </div>
        </section>
      </div>

      <div className="prediction-grid lower-grid">
        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Predicted outcomes & probability</h3>
          </div>

          <div className="prediction-outcomes">
            <div className="outcome-card neutral">
              <span>Home Win</span>
              <strong>—</strong>
            </div>
            <div className="outcome-card neutral">
              <span>Draw</span>
              <strong>—</strong>
            </div>
            <div className="outcome-card neutral">
              <span>Away Win</span>
              <strong>—</strong>
            </div>
          </div>
        </section>

        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Suggested betting markets</h3>
          </div>

          <div className="market-list">
            <span>1X2</span>
            <span>Double Chance</span>
            <span>BTTS</span>
            <span>Handicap</span>
            <span>Over/Under</span>
            <span>Player Props</span>
          </div>
        </section>
      </div>

      <div className="prediction-grid lower-grid">
        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Odds & value assessment</h3>
          </div>

          <div className="value-grid">
            <div className="value-row">
              <span>Home Odds</span>
              <strong>—</strong>
            </div>
            <div className="value-row">
              <span>Away Odds</span>
              <strong>—</strong>
            </div>
            <div className="value-row">
              <span>Value Score</span>
              <strong>—</strong>
            </div>
          </div>
        </section>

        <section className="prediction-primary-panel">
          <div className="panel-header">
            <h3>Decision panel</h3>
          </div>

          <div className="decision-stack">
            <div className="decision-block">
              <span>Confidence</span>
              <strong>—</strong>
            </div>
            <div className="decision-block">
              <span>Risk level</span>
              <strong>—</strong>
            </div>
            <div className="decision-block">
              <span>Suggested decision</span>
              <strong>—</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="prediction-history-panel">
        <div className="panel-header">
          <h3>Prediction history</h3>
          <span className="panel-tag">Manual result log</span>
        </div>

        <div className="prediction-history-form">
          <label className="field-group">
            <span>Sport</span>
            <input
              type="text"
              name="sport"
              value={draft.sport}
              placeholder="Football"
              onChange={handleDraftChange}
            />
          </label>

          <label className="field-group">
            <span>League</span>
            <input
              type="text"
              name="league"
              value={draft.league}
              placeholder="Premier League"
              onChange={handleDraftChange}
            />
          </label>

          <label className="field-group full-width">
            <span>Fixture / Match</span>
            <input
              type="text"
              name="match"
              value={draft.match}
              placeholder="Team A vs Team B"
              onChange={handleDraftChange}
            />
          </label>

          <label className="field-group">
            <span>Decision</span>
            <select name="recommendation" value={draft.recommendation} onChange={handleDraftChange}>
              <option value="BET">BET</option>
              <option value="AVOID">AVOID</option>
              <option value="REVIEW">REVIEW</option>
            </select>
          </label>

          <label className="field-group">
            <span>Confidence %</span>
            <input
              type="number"
              name="confidence"
              min="0"
              max="100"
              value={draft.confidence}
              onChange={handleDraftChange}
            />
          </label>

          <label className="field-group">
            <span>Actual result</span>
            <select name="actualResult" value={draft.actualResult} onChange={handleDraftChange}>
              <option value="Pending">Pending</option>
              <option value="Win">Win</option>
              <option value="Loss">Loss</option>
              <option value="Draw">Draw</option>
            </select>
          </label>

          <button type="button" className="primary-button history-save-button" onClick={handleSavePredictionResult}>
            Record Result
          </button>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="empty-state compact-empty prediction-empty-history">
            <div className="empty-state-icon" aria-hidden="true">✦</div>
            <h4>No prediction history yet</h4>
            <p>Store the result of a manual match assessment here when the event settles.</p>
          </div>
        ) : (
          <div className="history-list prediction-history-list">
            {filteredHistory.map((entry) => (
              <article key={entry.id} className="history-item prediction-history-item">
                <div className="history-main">
                  <div>
                    <p className="history-title">{entry.match}</p>
                    <p className="history-date">{entry.sport} • {entry.league} • {new Date(`${entry.recordedAt}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`status-pill status-${entry.recommendation.toLowerCase()}`}>
                    {entry.recommendation}
                  </span>
                </div>

                <div className="bet-detail-grid prediction-detail-grid">
                  <div>
                    <span>Confidence</span>
                    <strong>{entry.confidence}%</strong>
                  </div>
                  <div>
                    <span>Actual</span>
                    <strong>{entry.actualResult}</strong>
                  </div>
                  <div>
                    <span>Decision</span>
                    <strong>{entry.recommendation}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function TradeCalendarPage({ records }: { records: BetRecord[] }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthIndex = viewDate.getMonth()
  const year = viewDate.getFullYear()

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(viewDate)
  const monthlyNetMap = useMemo(() => {
    const map = new Map<string, number>()

    records.forEach((record) => {
      if (record.status === 'Pending') {
        return
      }

      const dayKey = record.date
      const current = map.get(dayKey) ?? 0
      map.set(dayKey, current + getNetResult(record))
    })

    return map
  }, [records])

  const pendingDays = useMemo(() => {
    const set = new Set<string>()

    records.forEach((record) => {
      if (record.status === 'Pending') {
        set.add(record.date)
      }
    })

    return set
  }, [records])

  const monthStart = new Date(year, monthIndex, 1)
  const monthLength = new Date(year, monthIndex + 1, 0).getDate()
  const monthStartsOn = monthStart.getDay()
  const totalVisibleDays = Math.ceil((monthStartsOn + monthLength) / 7) * 7
  const calendarDays = useMemo(() => {
    const firstDate = new Date(year, monthIndex, 1 - monthStartsOn)
    const values: Date[] = []

    for (let index = 0; index < totalVisibleDays; index += 1) {
      const nextDate = new Date(firstDate)
      nextDate.setDate(firstDate.getDate() + index)
      values.push(nextDate)
    }

    return values
  }, [monthIndex, monthLength, monthStartsOn, totalVisibleDays, year])

  const selectedBets = selectedDate
    ? records.filter((record) => record.date === selectedDate)
    : []

  const goToMonth = (offset: number) => {
    setViewDate(new Date(year, monthIndex + offset, 1))
    setSelectedDate(null)
  }

  const jumpToToday = () => {
    const today = new Date()
    setViewDate(today)
    setSelectedDate(formatDateKey(today))
  }

  const monthOptions = Array.from({ length: 12 }, (_, value) => value)
  const yearOptions = Array.from({ length: 11 }, (_, value) => new Date().getFullYear() - 5 + value)

  return (
    <section className="page-panel calendar-panel">
      <div className="calendar-header">
        <div>
          <p className="section-label">Betting timeline</p>
          <h2>Trade Calendar</h2>
        </div>

        <div className="calendar-controls">
          <button type="button" className="secondary-button" onClick={() => goToMonth(-1)}>
            Previous Month
          </button>
          <div className="calendar-selects">
            <select
              value={monthIndex}
              onChange={(event) => {
                const nextMonth = Number(event.target.value)
                setViewDate(new Date(year, nextMonth, 1))
                setSelectedDate(null)
              }}
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2024, month, 1))}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value)
                setViewDate(new Date(nextYear, monthIndex, 1))
                setSelectedDate(null)
              }}
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="secondary-button" onClick={jumpToToday}>
            Today
          </button>
          <button type="button" className="secondary-button" onClick={() => goToMonth(1)}>
            Next Month
          </button>
        </div>
      </div>

      <div className="calendar-toolbar">
        <h3>{monthName} {year}</h3>
      </div>

      <div className="calendar-weekdays" aria-label="Day of week headings">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
          <span key={dayName}>{dayName}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((date) => {
          const dateKey = formatDateKey(date)
          const isCurrentMonth = date.getMonth() === monthIndex
          const dailyNet = monthlyNetMap.get(dateKey) ?? 0
          const pendingOnly = pendingDays.has(dateKey) && dailyNet === 0
          const hasActivity = monthlyNetMap.has(dateKey) || pendingDays.has(dateKey)

          let cellTone = 'neutral'
          if (hasActivity) {
            if (dailyNet > 0) cellTone = 'positive'
            else if (dailyNet < 0) cellTone = 'negative'
            else if (pendingOnly) cellTone = 'pending'
          }

          const isToday = dateKey === formatDateKey(new Date())

          return (
            <button
              key={dateKey}
              type="button"
              className={`calendar-cell ${cellTone} ${isCurrentMonth ? '' : 'muted-month'} ${isToday ? 'today-cell' : ''}`}
              onClick={() => setSelectedDate(dateKey)}
            >
              <div className="calendar-cell-top">
                <span>{date.getDate()}</span>
                {isToday && <span className="today-badge">Today</span>}
              </div>
              <span className="calendar-net">{hasActivity ? formatCurrency(dailyNet) : formatCurrency(0)}</span>
            </button>
          )
        })}
      </div>

      <div className="calendar-detail-panel">
        <div className="detail-header">
          <h3>{selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Select a date'}</h3>
          <span>{selectedDate ? `${selectedBets.length} bet${selectedBets.length === 1 ? '' : 's'}` : 'No date selected'}</span>
        </div>

        {selectedDate ? (
          selectedBets.length === 0 ? (
            <p className="detail-empty">No bets were placed on this date.</p>
          ) : (
            <div className="detail-list">
              {selectedBets.map((bet) => (
                <article key={bet.id} className="bet-detail-item">
                  <div className="bet-detail-header">
                    <div>
                      <p className="bet-detail-title">{bet.event}</p>
                      <p className="bet-detail-market">{bet.market}</p>
                    </div>
                    <span className={`status-pill status-${bet.status.toLowerCase()}`}>
                      {bet.status}
                    </span>
                  </div>

                  <div className="bet-detail-grid">
                    <div>
                      <span>Stake</span>
                      <strong>{formatCurrency(bet.stake)}</strong>
                    </div>
                    <div>
                      <span>Odds</span>
                      <strong>{bet.odds.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Net</span>
                      <strong>{formatCurrency(getNetResult(bet))}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <p className="detail-empty">Click on any calendar date to see the bets for that day.</p>
        )}
      </div>
    </section>
  )
}

function TradeJournalPage({
  records,
  setRecords,
}: {
  records: BetRecord[]
  setRecords: React.Dispatch<React.SetStateAction<BetRecord[]>>
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sportFilter, setSportFilter] = useState('All Sports')
  const [statusFilter, setStatusFilter] = useState<'All' | BetStatus>('All')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formState, setFormState] = useState<BetFormState>(defaultFormState)
  const [formError, setFormError] = useState('')
  const [settlementNotice, setSettlementNotice] = useState('')

  const sportOptions = useMemo(
    () => ['All Sports', ...Array.from(new Set(records.map((record) => record.sport)))],
    [records],
  )

  const filteredRecords = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase()

    return records.filter((record) => {
      const matchesSearch =
        searchValue.length === 0 ||
        record.event.toLowerCase().includes(searchValue) ||
        record.market.toLowerCase().includes(searchValue)

      const matchesSport = sportFilter === 'All Sports' || record.sport === sportFilter
      const matchesStatus = statusFilter === 'All' || record.status === statusFilter

      return matchesSearch && matchesSport && matchesStatus
    })
  }, [records, searchTerm, sportFilter, statusFilter])

  const netResult = records.reduce((total, record) => total + getNetResult(record), 0)

  const summaryCards: Array<{
    label: string
    value: string
    note: string
    tone: 'blue' | 'green' | 'red' | 'amber'
  }> = [
    {
      label: 'Net P/L',
      value: formatCurrency(netResult),
      note: netResult >= 0 ? 'Overall positive result' : 'Overall negative result',
      tone: netResult >= 0 ? 'green' : 'red',
    },
    {
      label: 'Total Bets',
      value: String(records.length),
      note: records.length === 0 ? 'No bets recorded' : 'All tracked bets',
      tone: 'blue',
    },
    {
      label: 'Pending Bets',
      value: String(records.filter((record) => record.status === 'Pending').length),
      note:
        records.filter((record) => record.status === 'Pending').length === 0
          ? 'No pending bets'
          : 'Awaiting settlement',
      tone: 'amber',
    },
    {
      label: 'Won Bets',
      value: String(records.filter((record) => record.status === 'Won').length),
      note:
        records.filter((record) => record.status === 'Won').length === 0
          ? 'No winning bets'
          : 'Settled wins',
      tone: 'green',
    },
  ]

  const resetForm = () => {
    setFormState(defaultFormState)
    setFormError('')
    setEditingId(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (record: BetRecord) => {
    setFormState({
      date: record.date,
      sport: record.sport,
      event: record.event,
      market: record.market,
      stake: String(record.stake),
      odds: String(record.odds),
      status: record.status,
    })
    setEditingId(record.id)
    setFormError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setFormState((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = () => {
    const trimmedSport = formState.sport.trim()
    const trimmedEvent = formState.event.trim()
    const trimmedMarket = formState.market.trim()
    const stakeValue = Number(formState.stake)
    const oddsValue = Number(formState.odds)

    if (!formState.date || !trimmedSport || !trimmedEvent || !trimmedMarket) {
      setFormError('Please complete all required fields.')
      return
    }

    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      setFormError('Stake must be a number greater than zero.')
      return
    }

    if (!Number.isFinite(oddsValue) || oddsValue <= 0) {
      setFormError('Odds must be a number greater than zero.')
      return
    }

    const normalizedRecord: BetRecord = {
      id: editingId ?? Date.now(),
      date: formState.date,
      sport: trimmedSport,
      event: trimmedEvent,
      market: trimmedMarket,
      stake: stakeValue,
      odds: oddsValue,
      status: formState.status,
    }

    setRecords((current) => {
      if (editingId !== null) {
        return current.map((record) =>
          record.id === editingId ? normalizedRecord : record,
        )
      }

      return [normalizedRecord, ...current]
    })

    closeModal()
  }

  const handleDelete = (id: number) => {
    setRecords((current) => current.filter((record) => record.id !== id))
  }

  const handleQuickSettle = (id: number, nextStatus: BetStatus) => {
    const selectedRecord = records.find((record) => record.id === id)

    if (!selectedRecord) {
      return
    }

    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, status: nextStatus } : record,
      ),
    )
    setSettlementNotice(`${selectedRecord.event} marked as ${nextStatus}.`)
  }

  return (
    <section className="page-panel journal-panel">
      <div className="journal-header">
        <div>
          <p className="section-label">Trading records</p>
          <h2>Trade Journal</h2>
        </div>

        <button type="button" className="primary-button" onClick={openAddModal}>
          Add Bet
        </button>
      </div>

      <p className="page-intro">
        Record and manage placed bets to keep track of your daily trading activity.
      </p>

      <p className="temporary-note">
        Saved automatically to this browser via localStorage. Pending bets can be settled directly from the table.
      </p>

      {settlementNotice && <div className="settlement-feedback">{settlementNotice}</div>}

      <div className="summary-grid journal-summary-grid">
        {summaryCards.map((item) => (
          <SummaryCard
            key={item.label}
            label={item.label}
            value={item.value}
            note={item.note}
            tone={item.tone}
          />
        ))}
      </div>

      <div className="journal-controls">
        <label className="field-group search-field">
          <span>Search</span>
          <input
            type="text"
            placeholder="Search by event or selection"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <label className="field-group">
          <span>Sport</span>
          <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
            {sportOptions.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </label>

        <label className="field-group">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'All' | BetStatus)}
          >
            <option value="All">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        {filteredRecords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              —
            </div>
            <h4>No bet records found</h4>
            <p>
              {records.length === 0
                ? 'Add your first bet to begin tracking your journal.'
                : 'Try changing your search or filters.'}
            </p>
          </div>
        ) : (
          <table className="journal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sport</th>
                <th>Event / Match</th>
                <th>Market / Selection</th>
                <th>Stake (MK)</th>
                <th>Odds</th>
                <th>Potential Return (MK)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.date}</td>
                  <td>{record.sport}</td>
                  <td>{record.event}</td>
                  <td>{record.market}</td>
                  <td>{formatCurrency(record.stake)}</td>
                  <td>{record.odds.toFixed(2)}</td>
                  <td>{formatCurrency(getPotentialReturn(record.stake, record.odds))}</td>
                  <td>
                    {record.status === 'Pending' ? (
                      <div className="quick-settle-group">
                        <button type="button" className="quick-settle-button won" onClick={() => handleQuickSettle(record.id, 'Won')}>
                          WON
                        </button>
                        <button type="button" className="quick-settle-button lost" onClick={() => handleQuickSettle(record.id, 'Lost')}>
                          LOST
                        </button>
                        <button type="button" className="quick-settle-button void" onClick={() => handleQuickSettle(record.id, 'Void')}>
                          VOID
                        </button>
                      </div>
                    ) : (
                      <span className={`status-pill status-${record.status.toLowerCase()}`}>
                        {record.status}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button type="button" className="table-button edit-button" onClick={() => openEditModal(record)}>
                        Edit
                      </button>
                      <button type="button" className="table-button delete-button" onClick={() => handleDelete(record.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-label">Bet entry</p>
                <h3>{editingId !== null ? 'Edit Bet' : 'Add Bet'}</h3>
              </div>
              <button type="button" className="close-button" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="form-grid">
              <label className="field-group">
                <span>Date</span>
                <input
                  type="date"
                  name="date"
                  value={formState.date}
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group">
                <span>Sport</span>
                <input
                  type="text"
                  name="sport"
                  value={formState.sport}
                  placeholder="Football"
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group full-width">
                <span>Event / Match</span>
                <input
                  type="text"
                  name="event"
                  value={formState.event}
                  placeholder="Manchester United vs Chelsea"
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group full-width">
                <span>Market / Selection</span>
                <input
                  type="text"
                  name="market"
                  value={formState.market}
                  placeholder="Match Winner: Man United"
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group">
                <span>Stake (MK)</span>
                <input
                  type="number"
                  name="stake"
                  min="0"
                  step="0.01"
                  value={formState.stake}
                  placeholder="5000"
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group">
                <span>Odds</span>
                <input
                  type="number"
                  name="odds"
                  min="0"
                  step="0.01"
                  value={formState.odds}
                  placeholder="2.10"
                  onChange={handleInputChange}
                />
              </label>

              <label className="field-group full-width">
                <span>Status</span>
                <select name="status" value={formState.status} onChange={handleInputChange}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="modal-note">
              Temporary prototype: this form is only stored in React state and is not yet
              saved to a database.
            </p>

            {formError && <p className="form-error">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleSubmit}>
                {editingId !== null ? 'Update Bet' : 'Submit Bet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({ label, value, note, tone = 'blue' }: SummaryCardProps) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <div className="summary-topline">
        <span className="summary-label">{label}</span>
        <span className="summary-dot" aria-hidden="true" />
      </div>
      <div className="summary-value">{value}</div>
      <p className="summary-note">{note}</p>
    </article>
  )
}

function PerformanceChartPlaceholder() {
  return (
    <div className="chart-placeholder" aria-label="Performance chart placeholder">
      <div className="chart-grid-lines" aria-hidden="true" />
      <div className="chart-bars" aria-hidden="true">
        <span style={{ height: '18%' }} />
        <span style={{ height: '28%' }} />
        <span style={{ height: '24%' }} />
        <span style={{ height: '34%' }} />
        <span style={{ height: '22%' }} />
        <span style={{ height: '18%' }} />
        <span style={{ height: '20%' }} />
      </div>
      <div className="chart-line" aria-hidden="true" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        —
      </div>
      <h4>No recent activity</h4>
      <p>New trade updates will appear here once data is added.</p>
    </div>
  )
}

export default App
