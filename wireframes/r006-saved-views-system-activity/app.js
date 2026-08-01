(function () {
  'use strict';

  var icons = {
    activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    alert: '<path d="M12 9v4m0 4h.01"/><path d="M10.3 4.5 2.8 17.6A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.4L13.7 4.5a2 2 0 0 0-3.4 0Z"/>',
    'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
    filter: '<path d="M4 5h16l-6 7v5l-4 2v-7Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
    import: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    redo: '<path d="m15 5 4 4-4 4"/><path d="M19 9h-8a6 6 0 0 0-6 6v1"/>',
    rows: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2 2a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.4h-3a1.7 1.7 0 0 0-1-1.4 1.7 1.7 0 0 0-1.9.3l-2-2A1.7 1.7 0 0 0 5 15a1.7 1.7 0 0 0-1.5-1H3v-3h.5A1.7 1.7 0 0 0 5 9a1.7 1.7 0 0 0-.3-1.9l2-2A1.7 1.7 0 0 0 8.6 5a1.7 1.7 0 0 0 1-1.5V3h3v.5a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l2 2a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.4 1H21v3h-.5a1.7 1.7 0 0 0-1.1 1.4Z"/>',
    sort: '<path d="M3 6h18M6 12h12m-8 6h4"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    undo: '<path d="m9 5-4 4 4 4"/><path d="M5 9h8a6 6 0 0 1 6 6v1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'
  };

  function icon(name) {
    return '<span class="wf-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.grid) + '</svg></span>';
  }

  function renderIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon]'), function (node) {
      node.innerHTML = icon(node.getAttribute('data-icon'));
    });
  }

  function showToast(message) {
    var toast = document.querySelector('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.hidden = true; }, 3000);
  }

  function initSavedViews() {
    var trigger = document.querySelector('[data-view-trigger]');
    if (!trigger) return;
    var menu = document.querySelector('[data-view-menu]');
    var dialog = document.querySelector('[data-view-dialog]');
    var form = document.querySelector('[data-view-form]');
    var currentLabel = document.querySelector('[data-current-view]');
    var dirty = document.querySelector('[data-dirty-state]');
    var saveButton = document.querySelector('[data-save-current]');
    var params = new URLSearchParams(window.location.search);
    var isEditor = params.get('role') === 'editor';

    function setMenu(open) {
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    }

    function setDirty(value) {
      dirty.textContent = value ? 'Unsaved changes' : 'Saved';
      dirty.dataset.clean = String(!value);
      saveButton.disabled = !value;
    }

    function applyView(id, label) {
      Array.prototype.forEach.call(menu.querySelectorAll('[data-view-option]'), function (option) {
        option.setAttribute('aria-checked', String(option.dataset.viewOption === id));
      });
      currentLabel.textContent = label;
      var rows = Array.prototype.slice.call(document.querySelectorAll('[data-grid-body] tr'));
      rows.forEach(function (row) {
        if (id === 'ready') row.hidden = row.dataset.status !== 'Ready';
        else if (id === 'unpaid') row.hidden = row.dataset.paid !== 'No';
        else if (id === 'my-follow-ups') row.hidden = row.dataset.status !== 'Processing';
        else row.hidden = row.dataset.status === 'Cancelled';
      });
      var visible = rows.filter(function (row) { return !row.hidden; }).length;
      document.querySelector('[data-visible-count]').textContent = visible + ' of ' + rows.length + ' records';
      var filter = document.querySelector('[data-view-filter]');
      var sort = document.querySelector('[data-view-sort]');
      if (id === 'ready') filter.innerHTML = icon('filter') + ' Status is Ready';
      else if (id === 'unpaid') filter.innerHTML = icon('filter') + ' Paid is No';
      else if (id === 'my-follow-ups') filter.innerHTML = icon('filter') + ' Status is Processing';
      else filter.innerHTML = icon('filter') + ' Status is not Cancelled';
      sort.innerHTML = icon('sort') + (id === 'unpaid' ? ' Total · highest' : ' Ordered at · newest');
      setDirty(false);
      setMenu(false);
    }

    function openDialog() {
      setMenu(false);
      if (isEditor) {
        var shared = dialog.querySelector('input[value="shared"]');
        shared.disabled = true;
        document.querySelector('[data-shared-message]').hidden = false;
      }
      dialog.showModal();
      window.setTimeout(function () { dialog.querySelector('input[name="viewName"]').focus(); }, 0);
    }

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(menu.hidden);
    });
    document.addEventListener('click', function (event) {
      if (!menu.contains(event.target) && event.target !== trigger) setMenu(false);
    });
    menu.addEventListener('click', function (event) {
      var option = event.target.closest('[data-view-option]');
      if (option) applyView(option.dataset.viewOption, option.dataset.viewLabel);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-view-dialog]'), function (button) {
      button.addEventListener('click', openDialog);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-dialog]'), function (button) {
      button.addEventListener('click', function () { dialog.close(); });
    });
    document.querySelector('[data-make-dirty]').addEventListener('click', function () { setDirty(true); });
    saveButton.addEventListener('click', function () {
      setDirty(false);
      showToast(currentLabel.textContent + ' was updated.');
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var name = String(data.get('viewName') || '').trim();
      var access = data.get('access');
      if (!name) return;
      if (access === 'shared' && isEditor) {
        document.querySelector('[data-shared-message]').hidden = false;
        return;
      }
      currentLabel.textContent = name;
      var firstSharedHeading = Array.prototype.slice.call(menu.querySelectorAll('.view-menu__heading')).find(function (heading) {
        return heading.textContent.trim() === 'Shared';
      });
      var option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', 'true');
      option.dataset.viewOption = 'created-' + Date.now();
      option.dataset.viewLabel = name;
      option.innerHTML = icon(access === 'shared' ? 'users' : 'user') + '<span><strong></strong><small>' + (access === 'shared' ? 'Owner published' : 'Just now') + '</small></span>' + icon('check');
      option.querySelector('strong').textContent = name;
      Array.prototype.forEach.call(menu.querySelectorAll('[data-view-option]'), function (existing) { existing.setAttribute('aria-checked', 'false'); });
      if (access === 'shared') menu.insertBefore(option, menu.querySelector('.view-menu__footer'));
      else menu.insertBefore(option, firstSharedHeading);
      dialog.close();
      setDirty(false);
      showToast(access === 'shared' ? name + ' was published.' : name + ' was saved privately.');
    });

    setDirty(true);
    if (params.get('dialog') === 'create') openDialog();
  }

  var jobDetails = {
    'import-current': {
      kind: 'Import', title: 'Import values', status: 'Running', statusClass: 'status--running',
      fields: [['Target', 'Operations / Customer orders'], ['Source', 'Q4 customer orders.csv'], ['Progress', '159 of 248 records'], ['Started', 'Today at 4:18 PM']],
      timeline: [['Import started', '4:18 PM'], ['Values and fields validated', '4:18 PM'], ['159 records staged', 'Just now']]
    },
    'row-order': {
      kind: 'Maintenance', title: 'Row order maintenance', status: 'Queued', statusClass: '',
      fields: [['Target', 'Operations / Customer orders'], ['Scope', 'Shared row order'], ['Requested', 'Today at 4:17 PM'], ['Starts', 'After current row writes']],
      timeline: [['Row move committed', '4:17 PM'], ['Maintenance queued', '4:17 PM'], ['Waiting for current writes', 'Just now']]
    },
    'import-q3': {
      kind: 'Dead letter', title: 'Import values', status: 'Dead letter', statusClass: 'status--attention',
      fields: [['Target', 'Operations / Q3 orders'], ['Source', 'Q3 orders.csv'], ['Attempts', '3 of 3'], ['Last attempt', 'Today at 4:02 PM']],
      error: 'The source changed after preview. Review the current file before retrying.',
      timeline: [['Import queued', '3:52 PM'], ['Attempt 1 failed', '3:54 PM'], ['Attempt 2 failed', '3:57 PM'], ['Moved to dead letters', '4:02 PM']],
      actions: ['acknowledge', 'retry']
    },
    'publish-view': {
      kind: 'Saved view', title: 'Publish shared view', status: 'Completed', statusClass: 'status--complete',
      fields: [['Target', 'Operations / Customer orders'], ['View', 'Ready to ship'], ['Published by', 'Chris B.'], ['Completed', 'Today at 3:38 PM']],
      timeline: [['Owner authority confirmed', '3:38 PM'], ['View definition validated', '3:38 PM'], ['Shared view published', '3:38 PM']]
    },
    export: {
      kind: 'Export', title: 'Export CSV', status: 'Completed', statusClass: 'status--complete',
      fields: [['Target', 'Operations / Customer orders'], ['View', 'Unpaid orders'], ['Records', '126'], ['Completed', 'Today at 3:05 PM']],
      timeline: [['Authorized query compiled', '3:05 PM'], ['126 records written', '3:05 PM'], ['Download prepared', '3:05 PM']]
    }
  };

  function initSystemActivity() {
    var panel = document.querySelector('[data-job-panel]');
    if (!panel) return;
    var content = document.querySelector('[data-job-content]');
    var actions = document.querySelector('[data-job-actions]');
    var lastTrigger = null;
    var params = new URLSearchParams(window.location.search);

    function detailMarkup(job) {
      var fields = job.fields.map(function (item) { return '<dt>' + item[0] + '</dt><dd>' + item[1] + '</dd>'; }).join('');
      var timeline = job.timeline.map(function (item) { return '<li><strong>' + item[0] + '</strong><small>' + item[1] + '</small></li>'; }).join('');
      return '<div class="detail-status"><strong>Current status</strong><span class="status ' + job.statusClass + '">' + job.status + '</span></div>' +
        '<dl class="detail-list">' + fields + '</dl>' +
        (job.error ? '<section class="detail-section"><h3>Last error</h3><div class="error-box">' + job.error + '</div></section>' : '') +
        '<section class="detail-section"><h3>History</h3><ol class="timeline">' + timeline + '</ol></section>';
    }

    function openJob(id, trigger) {
      var job = jobDetails[id];
      if (!job) return;
      lastTrigger = trigger || lastTrigger;
      document.querySelector('[data-job-kind]').textContent = job.kind;
      document.querySelector('[data-job-title]').textContent = job.title;
      content.innerHTML = detailMarkup(job);
      actions.innerHTML = '';
      if (job.actions && job.actions.indexOf('acknowledge') >= 0) {
        var acknowledge = document.createElement('button');
        acknowledge.type = 'button'; acknowledge.className = 'button'; acknowledge.dataset.acknowledgeJob = id; acknowledge.textContent = 'Acknowledge'; actions.appendChild(acknowledge);
      }
      if (job.actions && job.actions.indexOf('retry') >= 0) {
        var retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'button button--primary'; retry.dataset.retryJob = id; retry.textContent = 'Review and retry'; actions.appendChild(retry);
      }
      panel.hidden = false;
      var selected = document.querySelector('[data-job-row="' + id + '"]');
      Array.prototype.forEach.call(document.querySelectorAll('[data-job-row]'), function (row) { row.setAttribute('aria-selected', String(row === selected)); });
      document.querySelector('[data-close-job]').focus();
    }

    function closeJob() {
      panel.hidden = true;
      Array.prototype.forEach.call(document.querySelectorAll('[data-job-row]'), function (row) { row.removeAttribute('aria-selected'); });
      if (lastTrigger) lastTrigger.focus();
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-job-row]'), function (row) {
      row.addEventListener('click', function () { openJob(row.dataset.jobRow, row); });
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openJob(row.dataset.jobRow, row); }
      });
    });
    document.querySelector('[data-close-job]').addEventListener('click', closeJob);
    actions.addEventListener('click', function (event) {
      var retry = event.target.closest('[data-retry-job]');
      var acknowledge = event.target.closest('[data-acknowledge-job]');
      if (retry) {
        var job = jobDetails[retry.dataset.retryJob];
        job.kind = 'Import'; job.status = 'Queued'; job.statusClass = ''; job.error = null; job.actions = [];
        job.timeline.push(['Retry queued', 'Just now']);
        var row = document.querySelector('[data-job-row="' + retry.dataset.retryJob + '"]');
        row.dataset.group = 'active';
        row.querySelector('.status').className = 'status';
        row.querySelector('.status').textContent = 'Queued';
        openJob(retry.dataset.retryJob, row);
        showToast('Import retry was queued.');
      }
      if (acknowledge) {
        var ackJob = jobDetails[acknowledge.dataset.acknowledgeJob];
        ackJob.status = 'Acknowledged'; ackJob.statusClass = 'status--complete'; ackJob.actions = [];
        ackJob.timeline.push(['Failure acknowledged', 'Just now']);
        openJob(acknowledge.dataset.acknowledgeJob, document.querySelector('[data-job-row="' + acknowledge.dataset.acknowledgeJob + '"]'));
        showToast('Dead letter was acknowledged.');
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-activity-filter]'), function (tab) {
      tab.addEventListener('click', function () {
        var filter = tab.dataset.activityFilter;
        var visible = 0;
        Array.prototype.forEach.call(document.querySelectorAll('[data-job-row]'), function (row) {
          row.hidden = filter !== 'all' && row.dataset.group !== filter;
          if (!row.hidden) visible += 1;
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-activity-filter]'), function (other) { other.setAttribute('aria-selected', String(other === tab)); });
        document.querySelector('[data-activity-empty]').hidden = visible !== 0;
      });
    });

    var retentionDialog = document.querySelector('[data-retention-dialog]');
    document.querySelector('[data-open-retention]').addEventListener('click', function () { retentionDialog.showModal(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-retention]'), function (button) { button.addEventListener('click', function () { retentionDialog.close(); }); });
    document.querySelector('[data-retention-form]').addEventListener('submit', function (event) {
      event.preventDefault();
      var days = new FormData(event.currentTarget).get('retention');
      document.querySelector('[data-open-retention]').innerHTML = icon('history') + ' Retention: ' + days + ' days';
      retentionDialog.close();
      showToast('Activity retention was updated to ' + days + ' days.');
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !panel.hidden) closeJob(); });
    if (params.get('job')) openJob(params.get('job'), document.querySelector('[data-job-row="' + params.get('job') + '"]'));
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderIcons(document);
    initSavedViews();
    initSystemActivity();
  });
}());
