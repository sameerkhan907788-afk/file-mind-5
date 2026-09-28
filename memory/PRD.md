# File Mind — Product Requirements (Live)

## Vision
Private, offline-first document toolkit for mobile. Scan, import, view, and organize files and PDFs on device. No cloud, no accounts, no notifications.

## Confirmed Requirements
- Home Screen is the default route (`/`).
- Bottom tabs: Home, Files, PDF, AI.
- Quick Tools: Scan, PDF Tools, All Tools, Vault.
- Full offline: uses `expo-file-system`, `expo-sqlite`, bundled `pdf.js` and Tesseract assets.
- Zero Emergent branding. Custom File Mind logo + splash.
- Expo Notifications completely removed (package, permissions, UI).
- Real (non-mocked) implementations for: file import, image import, Images→PDF, PDF viewer, OCR, Download/Share.
- Global safe back navigation via `useSafeBack` hook — `canGoBack()` guarded with `/` fallback; no `GO_BACK` crashes.
- Storage card on Home shows real bytes used / free.

## Native-only flows (require Expo Go / dev build)
- PDF Viewer (bundled `pdf.js` in WebView) — gated by `Platform.OS !== 'web'`.
- OCR (Tesseract in WebView) — gated by `Platform.OS !== 'web'`.
- `expo-file-system.documentDirectory` persistence (null on web).

## Out of scope
- Backend / cloud sync (offline-only product).
- Push notifications.
- Accounts / login.

## Testing status (last verified)
- Frontend regression PASSED (iteration_2). Home default, no Emergent, no notifications, safe back on 12 deep routes, file import chooser opens, PDF/OCR web-gated as designed.
