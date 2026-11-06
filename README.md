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

## Automatic DFDs from a Google Form

Instead of copying the master by hand, the team can submit the intake form and get a
finished DFD by email. The menu still works alongside it.

**What happens on submit:** the script copies the master DFD template into a new doc named
`<project> - DFD`, runs the same build as the menu, shares the doc with the submitter as an
editor, and emails them the link. If anything fails, the submitter and the trigger owner get
an email with the error and the answers.

**The form needs:**
- a question whose title starts with "Spreadsheet" (or any answer that is a Google Sheets link)
- optionally, a question starting with "Project" for the doc name
- optionally, a question starting with "Email", or turn on **Settings > Responses > Collect
  email addresses**, so the script knows who to share with

Change the `QUESTION_*` values in `FormTrigger.gs` if your titles differ.

### Setup (one time, by the person who will own the new DFDs)

1. Open the form > three-dot menu > **Apps Script**. Name the project "DFD Builder Form".
2. Add three files: `Code.gs` from this repo, `FormTrigger.gs` from this repo, and replace
   `appsscript.json` with `form-trigger/appsscript.json` (turn on **Show "appsscript.json"**
   under Project Settings first). The form needs a different manifest than the doc because
   it also copies files and sends email.
3. In `FormTrigger.gs`, set `MASTER_DOC_URL` to the master DFD template link. Optionally set
   `OUTPUT_FOLDER_URL` to a shared drive folder so the whole team can find the DFDs.
4. Choose `installFormTrigger` in the function dropdown and click **Run**. Approve the
   permissions (same "unverified app" warning as the menu: **Advanced > Go to ...**).
5. Submit a test response. To re-run on the latest response without submitting again, run
   `testWithLastResponse`. Runs and errors show under **Executions** (left sidebar).

### Things to know

- Everything runs as the person who ran `installFormTrigger`. That account must be able to
  open the master template and every project spreadsheet people submit, and it owns the
  new docs (use a shared drive folder if that matters).
- Running `installFormTrigger` again is safe; it replaces the old trigger.
- When you change `Code.gs`, update it in both places: the master template's script and the
  form's script.

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

Fix it in the master template's Apps Script project (and the form's, if you use the form). DFDs copied before the fix keep the
old version; only new copies get the update.
