# RCIRL — Local Property Management + AI Marketing Suite

Runs entirely on your computer. Two small servers, one shared SQLite database:

```
RCIRL_Local/
├── php-app/            The property management web app (PHP + SQLite)
│                        — add/edit/delete properties, upload photos,
│                        the existing poster/PDF generator, import/export xlsx
├── python-service/     AI extras (FastAPI) — marketing copy, Nano Banana
│                        posters, PDF brochures, social media assets,
│                        xlsx sync — reads/writes the SAME database directly
└── run_local.py        Starts both with one command
```

Both pieces read and write the exact same `php-app/property_data/property_manager.db`
file. There's no syncing between them — it's the same data, always.

## First-time setup

**1. Install PHP** (if you don't already have it)
- Windows/Mac: install [XAMPP](https://www.apachefriends.org/) or [MAMP](https://www.mamp.info/), or just PHP from [php.net](https://www.php.net/downloads)
- Needs the `sqlite3`, `xml`, and `mbstring` extensions — these are included in any normal PHP install.
- Check it worked: `php -v`

**2. Install Python dependencies**
```bash
cd python-service
pip install -r requirements.txt
cd ..
```

**3. (Optional) Add API keys** for the AI features — copy `python-service/.env.example`
to `python-service/.env` and fill in whichever keys you want to use. Without
keys, the PDF brochure, social media asset generator, and xlsx import/export
still work fully — only marketing copy / Nano Banana posters need keys.

**4. Run it**
```bash
python run_local.py
```

This automatically migrates your existing `property_data/*.xlsx` into
SQLite the first time (only once — after that it uses the database), starts
both servers, and opens your browser to the app.

- Property app: http://localhost:8000
- AI service + API docs: http://localhost:8001/docs

Press `Ctrl+C` in the terminal to stop both.

## What changed from the xlsx-only version

- **Database:** property data now lives in `property_data/property_manager.db`
  (SQLite) instead of being read/written from the xlsx files on every click.
  The original `residential.xlsx` etc. are kept as a backup, untouched after
  migration — they're not the live data anymore.
- **Photo naming:** uploaded photos are now named after the property's
  Property ID, sequentially — e.g. `RES001_01.jpg`, `RES001_02.jpg` — instead
  of timestamp-based names.
- **xlsx still works both ways:** the app's own Import/Export Excel buttons
  are unchanged. The Python service adds the same import/export as an API
  (`POST /xlsx/import/{cat}`, `POST /xlsx/export/{cat}`) for scripting/automation.
- **Google Sheets was dropped** in favor of plain xlsx — no Google Cloud
  setup needed for a local-only tool.

## AI features — what needs a key, what doesn't

| Feature | Needs a key? | Notes |
|---|---|---|
| PDF brochure generator | No | Works right now |
| Social media asset generator | No | Works right now |
| xlsx import/export | No | Works right now |
| Marketing copy generator | Yes — `OPENAI_API_KEY` | platform.openai.com/api-keys |
| Nano Banana poster generation | Yes — `GEMINI_API_KEY` | aistudio.google.com/apikey |

Each AI endpoint returns a clear error telling you exactly which key is
missing if you call it before setting one up — nothing fails silently.

## Running it for a client

### Just demoing on your own laptop
Nothing extra needed — follow "First-time setup" above, then double-click
**`Start RCIRL.bat`** (Windows) or **`Start RCIRL.command`** (Mac) instead of
typing `python run_local.py`. A window opens, your browser opens to the app,
done.

### Installing it on the client's computer for their own ongoing use
This is a real install, not a demo — do this once, in person or over a
remote session:

1. **Install PHP and Python on their machine** (steps 1–2 in "First-time
   setup" above). If they're non-technical, just do this part yourself.
2. **Copy the whole `RCIRL_Local` folder** onto their computer — anywhere,
   e.g. `Documents\RCIRL_Local`. Don't put it inside OneDrive/Dropbox if it
   auto-syncs — SQLite doesn't like the file being moved/locked mid-write
   by a sync client. Local disk only.
3. Run `pip install -r python-service/requirements.txt` once.
4. **Add your AI keys** to `python-service/.env` if they're paying for those
   features themselves (or leave blank — brochure/social/xlsx still work
   without any key).
5. Run the migration once: `python run_local.py` will auto-detect and do
   this on first launch.
6. **Give them the shortcut**: drag `Start RCIRL.bat` (or `.command` on Mac)
   onto their Desktop. That's their "open the app" icon from now on —
   double-click it, wait a few seconds, browser opens. Closing the black
   window stops the app.

### What the client should know
- **It's not on the internet.** Nothing about this is cloud-hosted — it
  only works on the computer it's installed on, only while the app is
  running. No remote access, no "check it from my phone" unless you set
  that up separately (out of scope here).
- **Back up `php-app/property_data/property_manager.db` regularly** — that
  single file is the entire property database. No automatic cloud backup
  exists. A simple weekly copy to a USB drive or Google Drive folder (not
  the live working folder, just a copy) is enough.
- **Uploaded photos** live in `php-app/uploads/` — back that up too.
- If multiple staff need to use it on different computers at the same
  time, this setup won't do that — it's single-machine only. That's a
  different (bigger) project if they need it.



- **"PHP is not installed"**: install it (see step 1), make sure it's on your PATH.
- **Database looks out of date**: both servers read the same file live, no
  caching — if you don't see a change, check you uploaded/imported into the
  right category.
- **Want to re-run the xlsx migration**: delete `php-app/property_data/property_manager.db`
  and run `python run_local.py` again — it'll detect the missing db and re-migrate.
  (This will NOT pick up changes you've made in the app since the original
  migration — it only reads from the xlsx files.)
