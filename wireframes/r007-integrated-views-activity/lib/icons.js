(function () {
  var paths = {
    add: '<path d="M12 5v14M5 12h14"/>',
    alert: '<path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.2 4.4 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.8 4.4a2 2 0 0 0-3.6 0Z"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'arrow-up': '<path d="m18 15-6-6-6 6"/>',
    'arrow-down': '<path d="m6 9 6 6 6-6"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6Z"/><path d="M6 12h9a4 4 0 0 1 0 8H6Z"/>',
    borders: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
    'border-none': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/>',
    'border-all': '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
    'border-outer': '<rect x="4" y="4" width="16" height="16" rx="1"/><rect x="8" y="8" width="8" height="8" rx=".5" stroke-dasharray="2 2"/>',
    'border-inner': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M12 4v16M4 12h16"/>',
    'border-horizontal': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M4 9h16M4 15h16"/>',
    'border-vertical': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M9 4v16M15 4v16"/>',
    'border-left': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M4 4v16"/>',
    'border-right': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M20 4v16"/>',
    'border-top': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M4 4h16"/>',
    'border-bottom': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="2 2"/><path d="M4 20h16"/>',
    'border-style': '<path d="M4 6h16M4 12h12M4 18h8"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    currency: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 7v10"/>',
    cut: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.6 8.6 10.8 6.8M8.6 15.4 19.4 8.6"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    edit: '<path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20H4v-4Z"/>',
    export: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/>',
    filter: '<path d="M4 5h16l-6 7v5l-4 2v-7Z"/>',
    fill: '<path d="m14 3 7 7-9 9H5v-7Z"/><path d="m5 12 7 7M3 21h18"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    fullscreen: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    import: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    italic: '<path d="M10 4h8M6 20h8M14 4 10 20"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    more: '<path d="M12 12h.01M19 12h.01M5 12h.01"/>',
    paste: '<path d="M9 5h6M9 3h6v4H9Z"/><path d="M7 5H5a2 2 0 0 0-2 2v13h18V7a2 2 0 0 0-2-2h-2"/>',
    redo: '<path d="m15 5 4 4-4 4"/><path d="M19 9h-8a6 6 0 0 0-6 6v1"/>',
    remove: '<path d="M5 12h14"/>',
    'remove-format': '<path d="m4 20 5-5M14 4l6 6-9 9H5v-6Z"/><path d="M15 15h6"/>',
    rows: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1A1.7 1.7 0 0 0 5 14.6a1.7 1.7 0 0 0-1.5-1H3v-3h.5A1.7 1.7 0 0 0 5 9.6a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1A1.7 1.7 0 0 0 8.7 6a1.7 1.7 0 0 0 1-1.5V4h3v.5a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.5v3h-.5a1.7 1.7 0 0 0-1.5 1Z"/>',
    sort: '<path d="M3 6h18M6 12h12M10 18h4"/>',
    'text-color': '<path d="m5 19 7-16 7 16M8 13h8"/><path d="M4 22h16"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 16h10l1-16"/>',
    underline: '<path d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16"/>',
    undo: '<path d="m9 5-4 4 4 4"/><path d="M5 9h8a6 6 0 0 1 6 6v1"/>',
    wrap: '<path d="M4 6h16M4 10h12a4 4 0 1 1 0 8h-2"/><path d="m16 15-3 3 3 3"/>',
    'align-left': '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    'align-center': '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    'align-right': '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    'align-vertical': '<path d="M4 5h16M4 19h16M8 9h8v6H8Z"/>',
    'vertical-top': '<path d="M4 4h16"/><rect x="8" y="7" width="8" height="5" rx="1"/>',
    'vertical-middle': '<path d="M4 4h16M4 20h16"/><rect x="8" y="10" width="8" height="5" rx="1"/>',
    'vertical-bottom': '<path d="M4 20h16"/><rect x="8" y="12" width="8" height="5" rx="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>'
  };

  function svg(name) {
    var path = paths[name] || paths.grid;
    return '<span class="wf-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  }

  function render(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-wf-icon]'), function (node) {
      node.innerHTML = svg(node.getAttribute('data-wf-icon'));
    });
  }

  window.WireframeIcons = { svg: svg, render: render, names: Object.keys(paths) };
  document.addEventListener('DOMContentLoaded', function () {
    render(document);
  });
})();
