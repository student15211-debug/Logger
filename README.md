# Past Paper Logger

A private, offline-first IB past paper library built with React, TypeScript, Vite, Tailwind CSS, Dexie, and IndexedDB.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The app starts with no subjects or attempts. Add a subject in **Settings**, then use **Log Attempt**.

## Checks

```sh
npm test
npm run build
npm run preview
```

The production build includes an installable PWA manifest and a service worker that precaches the app for offline use. Install it from your browser after opening the production build on localhost or a secure origin.

## Local data

Records and drafts live in IndexedDB. A draft mirror in localStorage protects the latest wizard edits while IndexedDB writes finish. Export a JSON backup from **Settings** regularly; it includes subjects, papers, attempts, question marks, preferences, and the current draft. Import validates the file before replacing the existing dataset in a transaction. CSV export is for reading and analysis; JSON is the restore format.

No account, backend, remote API, or cloud sync is used.
"# Logger" 
