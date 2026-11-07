# Prowlarr Indexer Management

## Overview

Lode can manage the indexers of the connected Prowlarr instance from its own admin panel. Admins no longer need to open the Prowlarr UI to add, configure, enable, disable, test, or delete indexers.

The feature lives on a dedicated page at `/admin/indexers` and is linked from the Private Trackers page (`/admin/trackers`). It uses the Prowlarr v1 API (`/api/v1/indexer/*`) through a server-side client. The existing search client (`server/utils/prowlarr.ts`) is not modified.

## Requirements

- Prowlarr URL and API key configured through `NUXT_PROWLARR_URL` and `NUXT_PROWLARR_API_KEY`.
- Admin role.
- Prowlarr 2.6+ (tested against 2.6.5 and 2.7.0).

## Admin UI

### Indexer list

The list shows every indexer returned by Prowlarr with:

- display name, definition name and language
- privacy badge (`public`, `semiPrivate`, `private`)
- protocol (`torrent` / `usenet`)
- enabled state with an inline toggle
- Prowlarr background-disabled state (from `/api/v1/indexerstatus`)
- query/grab statistics (from `/api/v1/indexerstats`)
- linked Private Tracker entry, if one exists
- per-indexer test result
- edit, test and delete actions

Filters: text search, privacy, protocol and status. Bulk selection supports enable, disable, delete and test all.

### Add / edit indexer

Adding an indexer is a two-step flow:

1. Pick a definition from the Prowlarr schema catalog. The catalog is filtered and paginated server-side because the raw schema is roughly 6 MB.
2. Fill the dynamic form generated from the definition's fields.

Supported field types:

| Prowlarr type | Control |
| --- | --- |
| `textbox` | text input |
| `password` | password input (masked values are kept when left empty) |
| `number` | number input (integer or float) |
| `checkbox` | checkbox |
| `select` | select with numeric or URL option values |
| `info` | read-only information block |
| `cardigannCaptcha` | CAPTCHA image plus answer input |

`baseUrl` is a dynamic select populated from the definition's `indexerUrls`, so no extra `getUrls` request is needed. Advanced fields are collapsed by default. The hidden `definitionFile` field is filled automatically.

Global settings exposed by the form: name, enabled, priority, app profile and tags.

The form can test the current values before saving. Validation failures returned by Prowlarr are displayed field-by-field in a readable list.

### CAPTCHA

Some Cardigann definitions require a CAPTCHA. The "Load CAPTCHA" button calls:

```
POST /api/admin/indexers/captcha
```

The server proxies `POST /api/v1/indexer/action/checkCaptcha` and returns the image as base64. The answer is submitted in the `cardigannCaptcha` field.

## Tracker integration

Private and semi-private indexers can be linked to the existing Private Trackers page. The indexer form shows an optional "Lode tracker entry" section for non-public definitions:

- tracker type: counting or GUID
- GUID auth: cookie or login URL + username + password
- login URL defaults to the selected indexer base URL

On create/update Lode upserts the matching `custom_trackers` row by exact indexer name. When an indexer is renamed, the linked tracker row is renamed too. The list shows whether a tracker entry exists and links to `/admin/trackers?indexer=<name>`, which pre-fills the tracker form.

The indexer page does not delete tracker rows when an indexer is deleted. This avoids losing credentials that may be reused; the trackers page marks entries without a matching Prowlarr indexer.

## API endpoints

All routes require an admin session.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/indexers` | List indexers with stats, status and tracker links |
| `POST` | `/api/admin/indexers` | Create an indexer and optional tracker entry |
| `GET` | `/api/admin/indexers/[id]` | Get one indexer and its tracker link |
| `PUT` | `/api/admin/indexers/[id]` | Update an indexer and optional tracker entry |
| `PATCH` | `/api/admin/indexers/[id]` | Quick update of enabled / priority / app profile |
| `DELETE` | `/api/admin/indexers/[id]` | Delete an indexer |
| `PUT` | `/api/admin/indexers/bulk` | Enable or disable many indexers |
| `DELETE` | `/api/admin/indexers/bulk` | Delete many indexers |
| `GET` | `/api/admin/indexers/schema` | Paginated, filtered schema catalog |
| `GET` | `/api/admin/indexers/schema/[name]` | Full definition for one schema entry |
| `GET` | `/api/admin/indexers/meta` | App profiles, tags and Prowlarr version |
| `POST` | `/api/admin/indexers/test` | Test an indexer resource or an existing id |
| `POST` | `/api/admin/indexers/test-all` | Test every indexer |
| `POST` | `/api/admin/indexers/captcha` | Request a CAPTCHA image |

## Error handling

The admin client maps Prowlarr responses to application errors:

- validation failures (`400` array from Prowlarr) -> `400` with a joined message and readable failures
- missing indexer -> `404`
- unreachable or timed-out Prowlarr -> `502` / `504`
- missing configuration -> `503`

The API key is only sent in the `X-Api-Key` header and is never returned to the browser. Password field values are masked by Prowlarr and are forwarded back unchanged when the admin leaves the field empty.

## Limitations

- Indexer-to-tracker links are matched by exact indexer name. No database migration is required, but renaming an indexer outside Lode breaks the link until the tracker name is updated.
- Prowlarr's schema endpoint has no server-side pagination; the full catalog is cached in memory for five minutes and filtered in Lode.
- The admin API does not manage download clients, indexer proxies, or application sync profiles. Those remain Prowlarr settings.
