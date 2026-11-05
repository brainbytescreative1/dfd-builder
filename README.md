# DFD Builder

Fills a DFD doc from the project spreadsheet: one tab per Parent Menu Item, one TEMPLATE
block per page, CA and URL linked, feedback checkboxes. Runs inside Google, so it costs no
Claude tokens.

## Team setup (one time, done by one person)

The script lives inside the master DFD template doc. Anyone who copies that doc gets the
script and a **DFD Builder** menu with it.

1. Open the master DFD template doc (the one the team copies for new projects). It needs
   a **TEMPLATE** tab. The other tabs are optional.
2. **Extensions > Apps Script**. Name the project "DFD Builder".
3. Replace `Code.gs` with this folder's `Code.gs`.
4. **Project Settings** (gear icon) > tick **Show "appsscript.json" manifest file in editor**.
   Replace `appsscript.json` with this folder's `appsscript.json`. Save.
5. Reload the doc. A **DFD Builder** menu appears next to Help.

Leave `DOC_URL` and `SHEET_URL` as they are; the menu doesn't use them.

## Making a DFD (anyone on the team)

1. **File > Make a copy** of the master DFD template.
2. In the copy: **DFD Builder > Build pages from spreadsheet...**
3. Paste the project spreadsheet link and click OK.
4. The first time, Google asks you to authorize the script. If you see "Google hasn't
   verified this app", click **Advanced > Go to DFD Builder (unsafe)**. That warning is
   normal for scripts your team writes, not ones from the Marketplace.
5. A pop-up lists which tabs were filled.

Because each copy carries its own copy of the script, each new doc asks for authorization
once.

## Behavior

- Pages come from the **Content Pages - All Teams** tab. A Parent Menu Item starts a group,
  and each Child Menu Item row is a page. A parent row with its own URL (Homepage) is also a page.
- Privacy Policy and Terms of Use are skipped (`SKIP_PARENTS` in `Code.gs`).
- "Homepage" maps to the "Home" tab (`TAB_NAMES`).
- Tabs that already have content are skipped, so running it twice never duplicates pages.
  To rebuild a tab, clear it first.
- Each block is a real copy of the TEMPLATE tab. Change TEMPLATE in the master and every
  future DFD follows it.
- If it says the new tabs aren't visible yet, run it again.

## Updating the script

Fix it in the master template's Apps Script project. DFDs copied before the fix keep the
old version; only new copies get the update.
