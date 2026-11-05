/**
 * DFD Builder
 *
 * Fills a DFD Google Doc from a content spreadsheet:
 *   - one doc tab per Parent Menu Item (created if missing)
 *   - one copy of the TEMPLATE tab per page (Child Menu Item, or the parent itself
 *     when the parent row has its own URL, like the Homepage)
 *   - page name in the Title, CA and URL cells linked, Design left unlinked
 *   - feedback bullets turned into checkboxes
 *
 * Team use: put this script in the master DFD template doc (Extensions > Apps Script).
 * Copies of that doc carry the script, and the "DFD Builder" menu runs it on the open doc.
 * Solo use: fill DOC_URL and SHEET_URL below and Run > buildDfd from the editor.
 */

const CONFIG = {
  // Only needed when running buildDfd from the script editor.
  DOC_URL: 'PASTE_DFD_DOC_URL_HERE',
  SHEET_URL: 'PASTE_SPREADSHEET_URL_HERE',

  SHEET_TAB: 'Content Pages - All Teams',
  TEMPLATE_TAB: 'TEMPLATE',

  // Parent Menu Items left out of the DFD entirely.
  SKIP_PARENTS: ['Privacy Policy', 'Terms of Use'],

  // Spreadsheet parent name -> doc tab title, where they differ.
  TAB_NAMES: { 'Homepage': 'Home' },

  // Leave tabs that already have content alone (so re-running never duplicates pages).
  SKIP_FILLED_TABS: true,

  // Turn the feedback bullets into checkboxes.
  CHECKBOXES: true,

  LINK_COLOR: '#1155cc',
};

// ---------- entry points ----------

/** Adds the DFD Builder menu when the doc opens (container-bound script). */
function onOpen() {
  DocumentApp.getUi()
    .createMenu('DFD Builder')
    .addItem('Build pages from spreadsheet...', 'buildFromMenu')
    .addToUi();
}

/** Menu action: asks for the spreadsheet link and builds this doc. */
function buildFromMenu() {
  const ui = DocumentApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const last = props.getProperty('SHEET_URL') || '';
  const res = ui.prompt('DFD Builder',
    'Paste the project spreadsheet link' + (last ? ' (leave blank to reuse the last one)' : '') + ':',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const sheetUrl = res.getResponseText().trim() || last;
  try {
    const log = build_(DocumentApp.getActiveDocument().getId(), sheetUrl);
    props.setProperty('SHEET_URL', sheetUrl);
    ui.alert('DFD Builder', log.join('\n'), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('DFD Builder: something went wrong', String(e.message || e), ui.ButtonSet.OK);
  }
}

/** Editor action: builds the doc in CONFIG.DOC_URL. */
function buildDfd() {
  if (CONFIG.DOC_URL.indexOf('/document/') < 0) throw new Error('DOC_URL should be a Google Doc link (docs.google.com/document/...).');
  Logger.log(build_(idFromUrl_(CONFIG.DOC_URL), CONFIG.SHEET_URL).join('\n'));
}

// ---------- build ----------

function build_(docId, sheetUrl) {
  if (String(sheetUrl).indexOf('/spreadsheets/') < 0) {
    throw new Error('That should be a Google Sheets link (docs.google.com/spreadsheets/...).');
  }
  const groups = readPages_(idFromUrl_(sheetUrl));
  if (!groups.length) throw new Error('No pages found in "' + CONFIG.SHEET_TAB + '".');
  const log = [];

  // 1. Create any parent tabs the doc doesn't have yet.
  let doc = DocumentApp.openById(docId);
  const existing = allTabs_(doc).map(t => t.getTitle().trim());
  Logger.log('Doc: "' + doc.getName() + '"\nTabs found: ' + existing.join(', ') +
             '\nPages per tab: ' + groups.map(g => g.tab + ' (' + g.pages.length + ')').join(', '));
  const missing = groups.map(g => g.tab).filter(t => existing.indexOf(t) < 0);
  if (missing.length) {
    log.push('Created tabs: ' + missing.join(', '));
    doc.saveAndClose(); // so the reopen below sees the new tabs
    docsBatchUpdate_(docId, missing.map(title => ({ addDocumentTab: { tabProperties: { title: title } } })));
    Utilities.sleep(2000);
    doc = DocumentApp.openById(docId);
  }

  // 2. Copy the TEMPLATE block once per page.
  const tabs = allTabs_(doc);
  const stillMissing = groups.map(g => g.tab)
    .filter(t => !tabs.some(x => x.getTitle().trim() === t));
  if (stillMissing.length) {
    if (missing.length) {
      log.push('Google hasn\'t made the new tabs visible to this run yet. Run DFD Builder again to fill them.');
      return log;
    }
    throw new Error('These tabs are missing: ' + stillMissing.join(', ') +
                    '. Tabs in the doc: ' + tabs.map(t => t.getTitle()).join(', ') + '.');
  }
  const template = tabs.filter(t => t.getTitle().trim() === CONFIG.TEMPLATE_TAB)[0];
  if (!template) throw new Error('No tab named "' + CONFIG.TEMPLATE_TAB + '" in the doc.');
  const tplBody = template.asDocumentTab().getBody();

  const filledTabIds = [];
  groups.forEach(g => {
    const tab = tabs.filter(t => t.getTitle().trim() === g.tab)[0];
    const body = tab.asDocumentTab().getBody();
    if (CONFIG.SKIP_FILLED_TABS && !isEmpty_(body)) {
      log.push('Skipped "' + g.tab + '" (already has content)');
      return;
    }
    g.pages.forEach(p => appendTemplate_(body, tplBody, p));
    // Drop the empty paragraph a new tab starts with.
    const first = body.getChild(0);
    if (body.getNumChildren() > 1 && first.getType() === DocumentApp.ElementType.PARAGRAPH &&
        first.asParagraph().getText() === '' && !hasNonText_(first)) {
      body.removeChild(first);
    }
    filledTabIds.push(tab.getId());
    log.push('Filled "' + g.tab + '": ' + g.pages.map(p => p.name).join(', '));
  });
  doc.saveAndClose();

  // 3. Checkboxes (DocumentApp can't set them, the Docs API can).
  if (CONFIG.CHECKBOXES && filledTabIds.length) applyCheckboxes_(docId, filledTabIds);

  if (!filledTabIds.length) log.push('Nothing to fill: every tab already has content.');
  return log;
}

// ---------- spreadsheet ----------

function readPages_(sheetId) {
  const res = Sheets.Spreadsheets.get(sheetId, {
    ranges: ["'" + CONFIG.SHEET_TAB + "'!A1:Z"],
    includeGridData: true,
    fields: 'sheets.data.rowData.values(formattedValue,hyperlink,chipRuns,textFormatRuns)',
  });
  const rows = ((res.sheets[0].data[0] || {}).rowData || []).map(r => r.values || []);
  const header = (rows[0] || []).map(c => ((c && c.formattedValue) || '').trim().toLowerCase());
  const col = name => {
    const i = header.indexOf(name.toLowerCase());
    if (i < 0) throw new Error('Column "' + name + '" not found in "' + CONFIG.SHEET_TAB + '".');
    return i;
  };
  const P = col('Parent Menu Item'), C = col('Child Menu Item'), U = col('URL'), A = col('CA Link');

  const groups = [];
  let cur = null;
  rows.slice(1).forEach(r => {
    const parent = text_(r[P]);
    const child = text_(r[C]);
    if (parent) {
      cur = { parent: parent, tab: CONFIG.TAB_NAMES[parent] || parent, pages: [] };
      groups.push(cur);
    }
    if (!cur) return;
    const url = link_(r[U]) || text_(r[U]);
    if (!child && !url) return; // parent heading row with no page of its own
    cur.pages.push({ name: child || cur.tab, url: url, ca: link_(r[A]) });
  });
  return groups.filter(g => g.pages.length && CONFIG.SKIP_PARENTS.indexOf(g.parent) < 0);
}

function text_(cell) {
  return ((cell && cell.formattedValue) || '').trim();
}

function link_(cell) {
  if (!cell) return '';
  if (cell.hyperlink) return cell.hyperlink;
  const chips = cell.chipRuns || [];
  for (let i = 0; i < chips.length; i++) {
    const p = chips[i].chip && chips[i].chip.richLinkProperties;
    if (p && p.uri) return p.uri;
  }
  const runs = cell.textFormatRuns || [];
  for (let i = 0; i < runs.length; i++) {
    const l = runs[i].format && runs[i].format.link;
    if (l && l.uri) return l.uri;
  }
  return '';
}

// ---------- doc ----------

function appendTemplate_(body, tpl, page) {
  const T = DocumentApp.ElementType;
  let titleSet = false;
  let autoPara = null; // empty paragraph Docs may add after an appended table

  for (let i = 0; i < tpl.getNumChildren(); i++) {
    const src = tpl.getChild(i);
    const type = src.getType();
    let added = null;

    if (type === T.PARAGRAPH) {
      added = body.appendParagraph(src.copy().asParagraph());
      if (!titleSet && added.getHeading() === DocumentApp.ParagraphHeading.TITLE) {
        added.setText(page.name);
        titleSet = true;
      }
    } else if (type === T.LIST_ITEM) {
      try {
        added = body.appendListItem(src.copy().asListItem());
      } catch (e) {
        added = body.appendListItem(src.asListItem().getText());
      }
    } else if (type === T.TABLE) {
      added = body.appendTable(src.copy().asTable());
      linkCells_(added, page);
      const last = body.getChild(body.getNumChildren() - 1);
      autoPara = (last.getType() === T.PARAGRAPH && last.asParagraph().getText() === '') ? last : null;
      continue;
    } else {
      continue;
    }

    if (autoPara) {
      try { body.removeChild(autoPara); } catch (e) { /* not removable; leave it */ }
      autoPara = null;
    }
  }
}

function linkCells_(table, page) {
  const row = table.getRow(0);
  if (row.getNumCells() > 1) setLink_(row.getCell(1), page.ca);
  if (row.getNumCells() > 2) setLink_(row.getCell(2), page.url);
}

function setLink_(cell, url) {
  if (!url) return;
  const t = cell.editAsText();
  const end = t.getText().replace(/\s+$/, '').length - 1;
  if (end < 0) return;
  t.setLinkUrl(0, end, url).setForegroundColor(0, end, CONFIG.LINK_COLOR).setUnderline(0, end, true);
}

function applyCheckboxes_(docId, tabIds) {
  const d = Docs.Documents.get(docId, { includeTabsContent: true });
  const requests = [];
  tabIds.forEach(id => {
    const tab = findApiTab_(d.tabs || [], id);
    if (!tab) return;
    let run = null;
    tab.documentTab.body.content.forEach(el => {
      if (el.paragraph && el.paragraph.bullet) {
        if (run && run.endIndex === el.startIndex) run.endIndex = el.endIndex;
        else {
          run = { startIndex: el.startIndex, endIndex: el.endIndex, tabId: id };
          requests.push({ createParagraphBullets: { range: run, bulletPreset: 'BULLET_CHECKBOX' } });
        }
      } else {
        run = null;
      }
    });
  });
  if (requests.length) docsBatchUpdate_(docId, requests);
}

// Calls the Docs REST API directly, so newer request types (like addDocumentTab)
// aren't dropped by an outdated Advanced Service client.
function docsBatchUpdate_(docId, requests) {
  const res = UrlFetchApp.fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ requests: requests }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Docs API error ' + res.getResponseCode() + ': ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function findApiTab_(tabs, id) {
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].tabProperties.tabId === id) return tabs[i];
    const hit = findApiTab_(tabs[i].childTabs || [], id);
    if (hit) return hit;
  }
  return null;
}

function allTabs_(doc) {
  const out = [];
  const walk = tabs => tabs.forEach(t => { out.push(t); walk(t.getChildTabs()); });
  walk(doc.getTabs());
  return out;
}

function isEmpty_(body) {
  if (body.getText().trim() !== '') return false;
  for (let i = 0; i < body.getNumChildren(); i++) {
    if (body.getChild(i).getType() === DocumentApp.ElementType.TABLE) return false;
    if (hasNonText_(body.getChild(i))) return false;
  }
  return true;
}

function hasNonText_(el) {
  if (!el.getNumChildren) return false;
  for (let i = 0; i < el.getNumChildren(); i++) {
    if (el.getChild(i).getType() !== DocumentApp.ElementType.TEXT) return true;
  }
  return false;
}

function idFromUrl_(url) {
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('Could not read a file ID from: ' + url);
  return m[1];
}
