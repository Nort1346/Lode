# AGENTS.md — Jellyfin Platform Synchronization

## Overview

Implement full two-way synchronization between the main platform and Jellyfin. The goal is to treat the platform as the single source of truth — all user management happens on the platform side and propagates to Jellyfin automatically.

---

## Features to Implement

### 1. User Lifecycle Sync

Keep Jellyfin users in sync with the platform at all times.

- **Create** — when a user is created on the platform, a corresponding account is created in Jellyfin.
- **Delete** — when a user is deleted on the platform, their Jellyfin account is removed automatically.
- **Deactivate / Reactivate** — when a user is disabled on the platform, they are disabled in Jellyfin as well. Re-enabling on the platform restores access in Jellyfin.

---

### 2. User Permissions Sync

The following per-user settings must be kept in sync from the platform to Jellyfin:

- **Remux** — whether the user is allowed to remux streams.
- **Video Transcoding** — whether the user is allowed to transcode video.
- **Audio Transcoding** — whether the user is allowed to transcode audio.
- **Max Concurrent Sessions** — how many simultaneous streams the user can have.
- **Library Access** — which media libraries the user has access to.

Any change to these fields on the platform must reflect in Jellyfin without manual action.

---

### 3. Avatar Sync

User profile pictures must be synchronized between the platform and Jellyfin.

- Uploading or changing an avatar on the platform updates it in Jellyfin.
- Removing an avatar on the platform removes it in Jellyfin.
- Changes made directly inside Jellyfin should sync back to the platform (platform takes priority in case of conflict).

---

### 4. Error Handling & Reliability

- Failed sync operations should be retried automatically.
- Sync errors should be logged and visible to administrators.
- An admin should be able to manually trigger re-sync for a single user or all users at once.

---

### 5. Initial Reconciliation

On first setup, existing platform users should be matched to existing Jellyfin accounts where possible. Unmatched users should be created in Jellyfin with their current settings applied.