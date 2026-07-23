# PostgreSQL Async Refactor — Instrukcja dla kontynuacji

## Co to jest?

Refaktor całego kodu żeby obsługiwał zarówno SQLite jak i PostgreSQL. Problem: drizzle ORM zwraca RÓŻNE typy query builderów — SQLite ma `.get()`, `.all()`, `.run()` (sync), a Postgres ich nie ma (async). Rozwiązanie: helpery `dbGet`/`dbAll`/`dbRun` które detectują runtime który driver jest używany.

## Co JUZ zostało zrobione (commit: 21 plików)

### `server/utils/db.ts` — helpery (DZIAŁA, NIE DOTYKAĆ)
- `useDb()` — sync, SQLite-only, rzuca error dla postgres
- `useDbAsync()` — async, zwraca `Promise<SqliteDb>` (type lie — na runtime może być PgDb)
- `dbGet(chain)` — zastępuje `.get()`, na SQLite wywołuje `.get()`, na Postgres `(await chain)[0]`
- `dbAll(chain)` — zastępuje `.all()`, na SQLite wywołuje `.all()`, na Postgres `await chain`
- `dbRun(chain)` — zastępuje `.run()`, normalizuje wynik do `{ changes: number }`
- `hasGetMethod(obj)` — type guard do runtime detection

### `server/utils/settings.ts` — SKONWERTOWANE
- `getSetting()`, `putSetting()`, `deleteSetting()` → async, używają `useDbAsync()` + helpers

### Pliki gdzie dodano `await` do `getSetting()`/`putSetting()`/`deleteSetting()` — SKONWERTOWANE
- `server/api/prep-config.get.ts`
- `server/api/admin/jellyfin/presets.get.ts`
- `server/api/admin/jellyfin/presets.put.ts`
- `server/api/admin/prep-config.get.ts`
- `server/api/admin/prep-config.put.ts`
- `server/api/admin/disk-status.put.ts`
- `server/api/admin/discord-mentions.put.ts`
- `server/api/admin/discord-locale.put.ts`
- `server/utils/ranking-config.ts`
- `server/utils/brute-force.ts` (częściowo — getSetting/putSetting)
- `server/utils/sync/index.ts` (częściowo — defaultSyncSettingsOverrides, getDefaultSyncSettings, getSyncUserSettings)
- `server/utils/sync/providers/jellyfin.ts`
- `server/api/admin/users.post.ts` (await getDefaultSyncSettings)
- `server/api/admin/users/[id].put.ts` (await getDefaultSyncSettings)
- `server/api/admin/users/[id]/sync.post.ts` (await getDefaultSyncSettings)
- `server/api/auth/register.post.ts` (await getDefaultSyncSettings)
- `server/api/user/password.post.ts` (await getDefaultSyncSettings)

### Testy — SKONWERTOWANE
- `test/utils/settings.test.ts`
- `test/utils/brute-force.test.ts`

---

## Jak konwertować plik — WZÓR

### Krok 1: Import
```ts
// BEFORE:
import { useDb } from '#server/utils/db'

// AFTER:
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
```

### Krok 2: `useDb()` → `await useDbAsync()`
```ts
// BEFORE:
const db = useDb()

// AFTER:
const db = await useDbAsync()
```

### Krok 3: `.get()` → `await dbGet(...)`
```ts
// BEFORE:
const user = db.select().from(users).where(eq(users.id, id)).get()

// AFTER:
const user = await dbGet(db.select().from(users).where(eq(users.id, id)))
```

### Krok 4: `.all()` → `await dbAll(...)`
```ts
// BEFORE:
const items = db.select().from(wishlist).where(eq(wishlist.userId, uid)).all()

// AFTER:
const items = await dbAll(db.select().from(wishlist).where(eq(wishlist.userId, uid)))
```

### Krok 5: `.run()` → `await dbRun(...)`
```ts
// BEFORE:
db.update(users).set({ name: 'foo' }).where(eq(users.id, id)).run()

// AFTER:
await dbRun(db.update(users).set({ name: 'foo' }).where(eq(users.id, id)))
```

### Krok 6: `result.changes` → destrukturyzacja z `dbRun()`
```ts
// BEFORE:
const result = db.update(notifications).set({read: true}).where(eq(...)).run()
if (result.changes > 0) { ... }

// AFTER:
const { changes } = await dbRun(db.update(notifications).set({read: true}).where(eq(...)))
if (changes > 0) { ... }
```

### Krok 7: Wywołanie wewnątrz `.all().filter()` / `.all().map()`
```ts
// BEFORE:
const rows = db.select().from(x).where(y).all().filter(z)

// AFTER:
const allRows = await dbAll(db.select().from(x).where(y))
const rows = allRows.filter(z)
```

---

## ZASADA KONWERSJI

Każdy plik przechodzi przez ten sam pattern:
1. Zmieniam import z `useDb` na `useDbAsync, dbGet, dbAll, dbRun`
2. Każde `const db = useDb()` → `const db = await useDbAsync()`
3. Usuwam terminal methods (`.get()`, `.all()`, `.run()`) z chain
4. Owijam chain w odpowiedni helper
5. Dodaję `await` przed helperem

---

## PLIKI DO SKONWERTOWANIA (57 plików, ~84 zamiany .get/.all/.run + ~57 useDb)

### SERWER/UTILS (12 plików)

**`server/utils/user.ts`** — 1 zamiana
- `db.select().from(users).where(eq(...)).get()` → `await dbGet(...)`
- `getFreshUser()` musi stać się `async` i zwracać `Promise<User | undefined>`

**`server/utils/session-validate.ts`** — 3 zamiany
- `validateSession()`: `.get()` → `await dbGet(...)`
- `touchSession()`: `.run()` → `await dbRun(...)`
- `enforceMaxSessions()`: `.all()` → `await dbAll(...)`, `.run()` w pętli → `await dbRun(...)`

**`server/utils/notifications.ts`** — 6 zamian
- `getNotificationLocale()` (linia 23): SYNC! → musi stać się async. Uwaga: jest wywoływana z `notifyDownloadComplete()` i `notifyRequestStatus()` które wywołują `createT(getNotificationLocale())`. `createT` przyjmuje string, więc trzeba `await getNotificationLocale()` i przekazać do `createT()`
- `createNotification()`: `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`
- `getUserNotifications()`: `.all()` → `await dbAll(...)` — musi stać się async
- `getUnreadCount()`: `.all()` → `await dbAll(...)` — musi stać się async
- `markAsRead()`: `.run()` → `await dbRun(...)` — musi stać się async
- `markAllAsRead()`: `.run()` → `await dbRun(...)` — musi stać się async
- WAŻNE: `result.changes` — używaj destrukturyzacji `const { changes } = await dbRun(...)`

**`server/utils/user.ts`** — 1 zamiana
- `getFreshUser()`: `.get()` → `await dbGet(...)` — musi stać się async

**`server/utils/log.ts`** — 1 zamiana
- `logActivity()`: `.run()` → `await dbRun(...)` — musi stać się async

**`server/utils/limits.ts`** — 2 zamiany
- `checkDailyLimit()`: 2x `.all()` → `await dbAll(...)` — musi stać się async

**`server/utils/push.ts`** — 2 zamiany
- `.all()` → `await dbAll(...)`, `.run()` w pętli → `await dbRun(...)`

**`server/utils/seed.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/utils/disk.ts`** — 2 zamiany
- 2x `.get()` → `await dbGet(...)`

**`server/utils/discord.ts`** — 2 zamiany
- 2x `.get()` → `await dbGet(...)`

**`server/utils/prowlarr.ts`** — 4 zamiany
- 3x `.get()` → `await dbGet(...)`, 1x `.all()` → `await dbAll(...)`

**`server/utils/torrent-sync.ts`** — 7 zamian (TRUDNY)
- `getPrepSpeedMb()`: `.get()` → `await dbGet(...)` — sync → async
- `isPrepCountdownEnabled()`: `.get()` → `await dbGet(...)` — sync → async
- `syncTorrentStatus()`: `.all()` → `await dbAll(...)`, 4x `.run()` → `await dbRun(...)`
- `notifyJellyfinIfNeeded()`: `.all()` → `await dbAll(...)`, `.run()` → `await dbRun(...)`
- WAŻNE: `notifyJellyfinIfNeeded` wywołuje `isPrepCountdownEnabled()` i `getPrepSpeedMb()` — te MUSZĄ być async

### SERWER/UTILS/SYNC (1 plik do dokończenia)

**`server/utils/sync/index.ts`** — RESZTA do konwersji
- Już skonwertowane: `defaultSyncSettingsOverrides()`, `getDefaultSyncSettings()`, `getSyncUserSettings()`
- DO KONWERSJI:
  - `upsertSyncUserSettings()` (linia ~75): `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`
  - `getUserSyncStatuses()` (linia ~140): `.all()` → `await dbAll(...)`
  - `syncUserCreate()` (linia ~200): `.run()` → `await dbRun(...)`
  - `updateSyncStatus()` (linia ~370): `.run()` → `await dbRun(...)`
  - `syncUserDelete()` (linia ~280): 2x `.run()` → `await dbRun(...)`
  - `getProviderUserId()` (linia ~130): `.get()` → `await dbGet(...)`

### SERWER/PLUGINS (2 pliki)

**`server/plugins/logs-cleanup.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)`

**`server/plugins/user-expiry.ts`** — 1 zamiana
- `.run()` w pętli → `await dbRun(...)`

### SERWER/API/AUTH (3 pliki)

**`server/api/auth/login.post.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/auth/logout.post.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)`

**`server/api/auth/register.post.ts`** — 3 zamiany
- `.get()` → `await dbGet(...)`, 2x `.run()` → `await dbRun(...)`

### SERWER/API/ADMIN (14 plików)

**`server/api/admin/users.get.ts`** — 2 zamiany
- 2x `.all()` → `await dbAll(...)`

**`server/api/admin/users.post.ts`** — 3 zamiany
- `.get()` → `await dbGet(...)`, 2x `.run()` → `await dbRun(...)`

**`server/api/admin/users/[id].put.ts`** — 3 zamiany
- `.get()` → `await dbGet(...)`, 2x `.run()` → `await dbRun(...)`

**`server/api/admin/users/[id].delete.ts`** — 3 zamiany
- `.get()` → `await dbGet(...)`, 2x `.run()` → `await dbRun(...)`

**`server/api/admin/users/[id]/sync.post.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/admin/discord-locale.get.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/admin/jellyfin/avatar.delete.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/admin/jellyfin/avatar.post.ts`** — 0 zamian (.get()/.all()/.run() nie występują, tylko useDb())

**`server/api/admin/logs.get.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/admin/sessions.get.ts`** — 0 zamian (tylko useDb())

**`server/api/admin/sessions/[id].delete.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)`

**`server/api/admin/sessions/delete-all.post.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)`

**`server/api/admin/trackers/index.get.ts`** — 1 zamiana
- `.all()` → `await dbAll(...)`

**`server/api/admin/trackers/index.post.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/admin/trackers/[id].delete.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/admin/trackers/[id].put.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/admin/trackers/test-login.post.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

### SERWER/API/BROWSE (1 plik — TRUDNY)

**`server/api/browse/download.post.ts`** — 1+ zamiana + TRANSAKCJA
- `.get()` na linii ~210 → `await dbGet(...)`
- `db.transaction(() => {...})` na linii ~121 → `await db.transaction(async () => {...})`
- WEWNĄTRZ transakcji: `.all()` → `await dbAll(...)` — uwaga: `db` wewnątrz transakcji to callback db, nie useDbAsync()!

### SERWER/API/TORRENTS (3 pliki)

**`server/api/torrents/list.get.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.all()` → `await dbAll(...)`

**`server/api/torrents/[id].get.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/torrents/[id].delete.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/torrents/add.post.ts`** — 0+ zamiana + TRANSAKCJA
- `db.transaction(() => {...})` na linii ~108 → `await db.transaction(async () => {...})`
- WEWNĄTRZ transakcji: `.all()` → `await dbAll(...)`
- `const db = useDb()` na linii 85 → `const db = await useDbAsync()`

### SERWER/API/REQUESTS (4 pliki)

**`server/api/requests/list.get.ts`** — 1 zamiana
- `.all()` → `await dbAll(...)`

**`server/api/requests/mine.get.ts`** — 0 zamian (tylko useDb())

**`server/api/requests/my.get.ts`** — 0 zamian (tylko useDb())

**`server/api/requests/[id].patch.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/requests/post.post.ts`** — 0 zamian (tylko useDb())

### SERWER/API/NOTIFICATIONS (2 pliki)

**`server/api/notifications/subscribe.post.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/notifications/unsubscribe.post.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)` — wewnątrz pętli

### SERWER/API/WISHLIST (3 pliki)

**`server/api/wishlist/index.get.ts`** — 1 zamiana
- `.all()` → `await dbAll(...)`

**`server/api/wishlist/index.delete.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/wishlist/index.post.ts`** — 0 zamian (tylko useDb())

**`server/api/wishlist/check.get.ts`** — 0 zamian (tylko useDb())

### SERWER/API/USER (5 plików)

**`server/api/user/me.get.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/user/limits.get.ts`** — 1 zamiana
- `.get()` → `await dbGet(...)`

**`server/api/user/password.post.ts`** — 2 zamiany
- `.get()` → `await dbGet(...)`, `.run()` → `await dbRun(...)`

**`server/api/user/avatar.delete.ts`** — 1 zamiana
- `.run()` → `await dbRun(...)`

**`server/api/user/avatar.put.ts`** — 0 zamian (tylko useDb())

**`server/api/user/avatar/upload.post.ts`** — 0 zamian (tylko useDb())

---

## SZCZEGÓLNE PRZYPADKI

### Transakcje (2 pliki)
```ts
// BEFORE:
db.transaction(() => {
  const items = db.select().from(x).where(y).all()
  db.insert(z).values({...}).run()
})

// AFTER:
await db.transaction(async () => {
  const items = await dbAll(db.select().from(x).where(y))
  await dbRun(db.insert(z).values({...}))
})
```
WAŻNE: `db` wewnątrz callbacku transakcji to INNY obiekt niż ten z `useDbAsync()`. W transakcjach drizzle przekazuje swój callback db — on też musi obsługiwać helpers. Ale poniewaz callback db jest tego samego typu, helpers działają tak samo.

### `result.changes` (4 wystąpienia w notifications.ts)
```ts
// BEFORE:
const result = db.update(...).set({...}).where(...).run()
return result.changes

// AFTER:
const { changes } = await dbRun(db.update(...).set({...}).where(...))
return changes
```

### `notifyDownloadComplete` i `notifyRequestStatus` w notifications.ts
Te funkcje są sync i wywołują `getNotificationLocale()` which jest sync. Po konwersji `getNotificationLocale()` na async, te funkcje TEŻ muszą stać się async. Sprawdź kto je wywołuje i dodaj `await`.

### `getFreshUser()` w user.ts
Sync → async. Sprawdź wszystkich wywołujących (import w innych plikach), upewnij się że wszędzie jest `await`.

### `getNotificationLocale()` w notifications.ts
Sync → async. Jest wywoływana w:
- `notifyDownloadComplete()` linia 128: `const t = createT(getNotificationLocale())`
- `notifyRequestStatus()` linia 167: `const t = createT(getNotificationLocale())`

Po konwersji: `const t = createT(await getNotificationLocale())`

---

## KOLEJNOŚĆ PRACY (zalecana)

1. **Pliki utils bez cascade'ów**: `user.ts`, `log.ts`, `limits.ts`, `disk.ts`, `discord.ts`, `prowlarr.ts`, `push.ts`, `seed.ts`
2. **notifications.ts** (trudny — wiele sync → async, cascade do wywołujących)
3. **session-validate.ts** (potrzebne przez auth middleware)
4. **torrent-sync.ts** (trudny — 7 zamian, sync→async cascade)
5. **sync/index.ts** (reszta do konwersji)
6. **API handlers** (proste — większość to tylko zamiana useDb→useDbAsync + helper)
7. **Transakcje** (download.post.ts, add.post.ts)
8. **Plugins** (logs-cleanup.ts, user-expiry.ts)
9. **Testy** — aktualizuj mocki: `useDb` → `useDbAsync`, `.get()`/.all()/.run() na helpery

---

## WERYFIKACJA PO KAŻDEJ GRUPIE

```bash
pnpm typecheck 2>&1 | tail -5    # Sprawdź czy 0 errors
pnpm lint 2>&1 | tail -5         # Sprawdź czy 0 errors
pnpm test 2>&1 | tail -10        # Sprawdź czy 103 pliki, 625 testów pass
```

---

## COMMON PITFALLS

1. **Sync→async cascade**: Gdy robisz `async` na funkcję, sprawdź WSZYSTkich wywołujących i dodaj `await`
2. **`.all().filter()`**: Nie da się zrobić `await dbAll(...).filter(...)` — najpierw `await`, potem `.filter()`
3. **`.all().map()`**: Jak wyżej —分开
4. **Pętle z `.run()`**: `for (const x of items) { db.delete(...).run() }` → `for (const x of items) { await dbRun(...) }`
5. **Transakcje**: `db.transaction(() => {...})` → `await db.transaction(async () => {...})`
6. **Testy**: Zmień `vi.mock` z `useDb` na `useDbAsync`, zmień `.mockReturnValue` na `.mockResolvedValue`
7. **`getSetting()` jest teraz async** — nie wywołuj go w kontekście synchronicznym

---

## STATUS PO OSTATNIM COMMICIE

- **21 plików** zmienionych
- **0** typecheck errors
- **0** lint errors
- **103** pliki testowe, **625** testów — WSZYSTKO PASS
- **57** plików server/ pozostało do konwersji (patrz lista wyżej)
- **~84** zamiany `.get()`/`.all()`/`.run()` pozostało
- **~57** zamian `useDb()` → `await useDbAsync()` pozostało
