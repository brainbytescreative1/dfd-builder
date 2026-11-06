/**
 * DFD Builder: form trigger
 *
 * Builds a new DFD every time the intake Google Form is submitted:
 *   1. copies the master DFD template into a new doc named after the project
 *   2. runs the same build as the "DFD Builder" menu (build_ in Code.gs)
 *   3. shares the new doc with the submitter and emails them the link
 *
 * This file goes in the FORM's Apps Script project (open the form > three-dot menu >
 * Apps Script), next to Code.gs, with form-trigger/appsscript.json as the manifest.
 * See "Automatic DFDs from a Google Form" in README.md.
 */

const FORM_CONFIG = {
  // The master DFD template the form copies. Required.
  MASTER_DOC_URL: 'PASTE_MASTER_DFD_TEMPLATE_URL_HERE',

  // Folder (ideally in a shared drive) for the new DFDs. Leave blank for the
  // installer's My Drive root.
  OUTPUT_FOLDER_URL: '',

  // Form questions, matched case-insensitively against the start of the question title.
  // The spreadsheet question can also be found by any answer that is a Sheets link.
  QUESTION_SHEET: 'spreadsheet',
  QUESTION_PROJECT: 'project',
  QUESTION_EMAIL: 'email',

  // New doc name. {project} is replaced with the project name answer.
  DOC_NAME: '{project} - DFD',

  // Who gets an email when a build fails (besides the submitter, when known).
  // Blank means the person who installed the trigger.
  ERROR_EMAIL: '',

  // How many times to re-run the build while Google catches up on newly created tabs.
  BUILD_ATTEMPTS: 3,
};

// ---------- setup ----------

/**
 * Run once from the editor (Run > installFormTrigger) by the account that will own the
 * new DFDs. Replaces any existing DFD Builder form trigger, so it is safe to re-run.
 */
function installFormTrigger() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('Open this script from the form (form > Apps Script), not a doc or a standalone project.');
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onDfdFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onDfdFormSubmit').forForm(form).onFormSubmit().create();
  // Fail now, not on the first submission, if the template can't be read.
  DriveApp.getFileById(idFromUrl_(FORM_CONFIG.MASTER_DOC_URL)).getName();
  Logger.log('Form trigger installed for "' + form.getTitle() + '".');
}

/** Editor helper: re-runs the trigger on the most recent response, for testing. */
function testWithLastResponse() {
  const responses = FormApp.getActiveForm().getResponses();
  if (!responses.length) throw new Error('The form has no responses yet. Submit one first.');
  onDfdFormSubmit({ response: responses[responses.length - 1] });
}

// ---------- trigger ----------

function onDfdFormSubmit(e) {
  const answers = readAnswers_(e.response);
  const to = answers.email;
  try {
    if (!answers.sheetUrl) throw new Error('The response has no Google Sheets link.');
    const project = answers.project || 'Untitled project';
    const name = FORM_CONFIG.DOC_NAME.replace('{project}', project);

    const master = DriveApp.getFileById(idFromUrl_(FORM_CONFIG.MASTER_DOC_URL));
    const copy = FORM_CONFIG.OUTPUT_FOLDER_URL
      ? master.makeCopy(name, DriveApp.getFolderById(idFromUrl_(FORM_CONFIG.OUTPUT_FOLDER_URL)))
      : master.makeCopy(name);

    let log = [];
    for (let i = 0; i < FORM_CONFIG.BUILD_ATTEMPTS; i++) {
      if (i) Utilities.sleep(5000);
      log = log.concat(build_(copy.getId(), answers.sheetUrl));
      if (!log.some(l => l.indexOf('Run DFD Builder again') >= 0)) break;
      log = log.filter(l => l.indexOf('Run DFD Builder again') < 0);
    }

    if (to) {
      try { copy.addEditor(to); } catch (err) { log.push('Could not share with ' + to + ': ' + err.message); }
      MailApp.sendEmail(to, 'DFD ready: ' + name,
        'Your DFD is ready:\n' + copy.getUrl() + '\n\n' + log.join('\n'));
    }
    Logger.log(copy.getUrl() + '\n' + log.join('\n'));
  } catch (err) {
    const msg = 'DFD Builder could not build a DFD from a form response.\n\n' +
      'Error: ' + (err.message || err) + '\n\nAnswers:\n' + JSON.stringify(answers, null, 2);
    const recipients = [FORM_CONFIG.ERROR_EMAIL || Session.getEffectiveUser().getEmail(), to]
      .filter((x, i, a) => x && a.indexOf(x) === i);
    recipients.forEach(r => MailApp.sendEmail(r, 'DFD Builder: build failed', msg));
    throw err; // also shows as a failed run under Executions
  }
}

function readAnswers_(response) {
  const out = { sheetUrl: '', project: '', email: response.getRespondentEmail() || '' };
  const starts = (title, key) => title.toLowerCase().trim().indexOf(key.toLowerCase()) === 0;
  response.getItemResponses().forEach(ir => {
    const title = ir.getItem().getTitle();
    const value = String(ir.getResponse() || '').trim();
    if (!value) return;
    if (!out.sheetUrl && (starts(title, FORM_CONFIG.QUESTION_SHEET) || value.indexOf('/spreadsheets/') >= 0)) {
      out.sheetUrl = value;
    } else if (!out.project && starts(title, FORM_CONFIG.QUESTION_PROJECT)) {
      out.project = value;
    } else if (!out.email && starts(title, FORM_CONFIG.QUESTION_EMAIL)) {
      out.email = value;
    }
  });
  return out;
}
