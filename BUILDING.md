# Building TakeoffDesk from source

There is nothing to compile: TakeoffDesk is plain ES modules, CSS and one page of markup that run in the browser. "Building"
means running it locally, testing it, compiling its help, and packing the browser edition.

Nothing built is kept in this repository; this file says how to make the browser edition from the source.

## Requirements

- **Node.js 20.19 or newer** (22 recommended) — the local server and the tests. No npm packages for the app itself.
- **PHP 8.1 or newer** — re-renders the page when you change `app/ui.inc` or `app/settings.inc`, compiles the help, and
  renders the browser edition's page. To only run the app you can do without it: the server then uses the pre-rendered
  `devshell/index.html`.
- **Python 3** (optional) — some tests compare against independent readers; the test runner sets them up from
  `tests/tools/*/requirements.txt`, and skips them without Python.
- A current Chrome, Edge, Firefox or Safari.

## Run

```sh
node devshell/serve.mjs                   # http://127.0.0.1:8000/   (npm start does the same)
```

The first time a library is needed (pdf.js, three.js, …) it is downloaded once from the npm registry, by exact version, into
`devshell/vendor/` and checked against `devshell/vendor.json`. `npm run fetch-vendor` downloads them all up front;
`--offline` never downloads.

## Test

```sh
npm test                                  # every test in tests/bin; npm test -- --only test-takeoffcraft.mjs
```

## Help and languages

```sh
php devshell/build-help.php               # compiles app/help/*.md into app/help/help.js (+ help.<locale>.js); --check lints only
```

Words: `app/lang/en.json` and translations beside it. See `CONTRIBUTING.md`.

## The browser edition

The browser edition is the whole app as a folder of static files: put it on any web server, in any folder, and open it
in a browser. The server needs no PHP and no Node, and the app contacts no server of its own.

```sh
node devshell/edition.mjs                       # → dist/takeoffdesk-browser-edition-vdev/
node devshell/edition.mjs --version 0.7 --zip   # → dist/takeoffdesk-browser-edition-v0.7.0/, its .zip and SHA256SUMS
```

- It needs Node.js and PHP (above). Libraries it does not have yet are downloaded by exact version and checked against
  `devshell/vendor.json`, as for the tests; `--offline` stops instead.
- It copies `app/` without its sources (`ui.inc` and `settings.inc` are rendered into `index.html`, the help's `.md` files
  are compiled already), the shared shell from `devshell/site/` and every library the app loads, each in
  `assets/vendor/<library>/<version>/` with its LICENSE and SOURCE.txt. Library URLs are pinned to those versions and
  `.mjs` files are renamed `.js` (some servers do not know the type). It adds README.md, INSTALL.md (servers, updating,
  removing), THIRD_PARTY.md, LICENSE, NOTICE, PROVENANCE.md, TRADEMARKS.md, release.json, `.htaccess` and `web.config`.
- `--out <dir>` writes somewhere other than `dist/` (which git ignores). With `--zip` the zip has one top folder, its files
  in sorted order and one date on every file. Set `SOURCE_DATE_EPOCH` and the same source gives the same zip, byte for byte.
- `devshell/edition/` holds what the packer needs: the service worker for "Save for offline", the
  INSTALL.md template, the notices, and the libraries' names, sources and license texts (`kit.json`).
- For a release, check out its tag first.

## Layout

| Path | What |
|---|---|
| `app/` | the app — `ui.inc`, `settings.inc`, `manifest.json` (stylesheets, entry module, import map), modules, `help/`, `lang/` |
| `devshell/` | the local server, the page renderer, the edition packer, the shell files, library versions |
| `tests/`, `fixtures/` | the tests and the drawings they use (made for testing) |
| `LICENSE`, `THIRD_PARTY.md` | Apache-2.0; the libraries the app loads and their licenses |
| `web/`, `windows/`, `linux/`, `macos/`, `ios/`, `android/` | a README each: where TakeoffDesk ships on that platform |
| `dist/` | what `devshell/edition.mjs` makes (not in git) |

More: `devshell/README.md`.
