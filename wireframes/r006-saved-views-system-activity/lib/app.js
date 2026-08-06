(function () {
  "use strict";

  function query(selector, root) {
    return (root || document).querySelector(selector);
  }

  function queryAll(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function setHidden(element, hidden) {
    if (element) {
      element.hidden = hidden;
    }
  }

  var sheetCapacity = 1000;
  var visibleSheetRows = 28;
  var sheetColumnCount = 26;
  var cellHistory = [];
  var cellRedoHistory = [];
  var sheetClipboard = "";
  var sheetCutPending = false;
  var selectionAnchor = null;
  var activeSelectionTarget = null;
  var activeContextTarget = null;
  var activeFormatPopoverTrigger = null;
  var currentPostgresTableName = "";
  var spreadsheetView = { freezeRows: "0", freezeColumns: "0", zoom: "100" };
  var namedSheetColumns = [
    { key: "order-id", label: "Order ID", postgresName: "order_id", field: "Number", format: "Plain text", storage: "bigint", required: true },
    { key: "customer", label: "Customer", postgresName: "customer", field: "Relation", format: "Related record", storage: "foreign key", relationTarget: "finance/invoices", relationFieldTemplate: "{invoice_number} — {customer_name}", relatedRecordTemplate: "{invoice_number}", required: true },
    { key: "email", label: "Email", postgresName: "email", field: "Email", format: "Email link", storage: "text", required: true },
    { key: "status", label: "Status", postgresName: "status", field: "Select", format: "Badge", storage: "text", required: false },
    { key: "total", label: "Total", postgresName: "total", field: "Price", format: "Currency", storage: "numeric", required: false },
    { key: "paid", label: "Paid", postgresName: "paid", field: "Switch", format: "Yes/no", storage: "boolean", required: false },
    { key: "ordered-at", label: "Ordered at", postgresName: "ordered_at", field: "Date and time", format: "Date/time", storage: "timestamptz", required: false }
  ];
  var sheetRecords = [
    ["1084", "Northstar Market", "ap@northstar.co", "Processing", "₱1,280.00", "Yes", "Jul 24, 10:32 AM"],
    ["1083", "Harbor Goods", "orders@harborgoods.ph", "Ready", "₱845.50", "No", "Jul 24, 9:18 AM"],
    ["1082", "Acacia Retail", "team@acaciaretail.com", "Shipped", "₱2,410.00", "Yes", "Jul 23, 3:04 PM"],
    ["1081", "Luna Home", "ops@lunahome.co", "Processing", "₱720.00", "Yes", "Jul 23, 11:48 AM"]
  ];
  var sheetRecordCount = 248;
  var relationTargetRecords = {
    "finance/invoices": [
      { id: "invoice_9321", invoice_number: "INV-9321", customer_name: "Northstar Market", first_name: "Mia", last_name: "Santos", company_name: "Northstar Market", name: "Northstar Market" },
      { id: "invoice_9317", invoice_number: "INV-9317", customer_name: "Harbor Goods", first_name: "Noah", last_name: "Reyes", company_name: "Harbor Goods", name: "Harbor Goods" },
      { id: "invoice_9308", invoice_number: "INV-9308", customer_name: "Acacia Retail", first_name: "Elena", last_name: "Cruz", company_name: "Acacia Retail", name: "Acacia Retail" }
    ],
    default: [
      { id: "record_1", first_name: "Mia", last_name: "Santos", company_name: "Northstar Market", customer_name: "Northstar Market", invoice_number: "INV-9321", name: "Northstar Market" },
      { id: "record_2", first_name: "Noah", last_name: "Reyes", company_name: "Harbor Goods", customer_name: "Harbor Goods", invoice_number: "INV-9317", name: "Harbor Goods" },
      { id: "record_3", first_name: "Elena", last_name: "Cruz", company_name: "Acacia Retail", customer_name: "Acacia Retail", invoice_number: "INV-9308", name: "Acacia Retail" }
    ]
  };

  function sheetColumnLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function sheetColumn(index) {
    return namedSheetColumns[index] || {
      key: "column-" + sheetColumnLetter(index).toLowerCase(),
      label: "",
      postgresName: "column_" + sheetColumnLetter(index).toLowerCase(),
      field: "Text",
      format: "Plain text",
      storage: "text",
      required: false
    };
  }

  function isUntitledFileRoute(params) {
    return !!params && params.get("new") === "1" && params.get("table") === "untitled-file";
  }

  function initUntitledFileState() {
    var params = new URLSearchParams(window.location.search);
    if (!isUntitledFileRoute(params)) {
      return;
    }
    namedSheetColumns = [];
    sheetRecords = [];
    sheetRecordCount = 0;
    currentPostgresTableName = "";
  }

  function updateSheetSummary() {
    var summary = query("[data-sheet-summary]");
    if (summary) {
      summary.textContent = sheetRecordCount + " records · " + sheetCapacity.toLocaleString() + " rows · " + namedSheetColumns.filter(Boolean).length + " named columns";
    }
  }

  function findSheetColumn(key) {
    return namedSheetColumns.find(function (column) {
      return column && column.key === key;
    });
  }

  function relationRecordsFor(column) {
    return relationTargetRecords[(column || {}).relationTarget] || relationTargetRecords.default;
  }

  function formatRelationTemplate(template, record) {
    var normalizedTemplate = String(template || "{name}").trim() || "{name}";
    return normalizedTemplate.replace(/\{([a-z_]+)\}/gi, function (token, key) {
      return record && record[key] !== undefined ? record[key] : token;
    });
  }

  function relationRecordFor(column, value) {
    return relationRecordsFor(column).find(function (record) {
      return record.id === value;
    });
  }

  function relationDisplayValue(column, value, template) {
    var record = relationRecordFor(column, value);
    return record ? formatRelationTemplate(template, record) : value;
  }

  function relationFileOption(panel, value) {
    return queryAll("[data-relation-file-option]", panel).find(function (option) {
      return option.getAttribute("data-relation-file-value") === value;
    });
  }

  function setRelationFilePickerValue(panel, value) {
    var target = query("[data-column-relation-target]", panel);
    var search = query("[data-relation-file-search]", panel);
    var option = relationFileOption(panel, value);
    if (target) {
      target.value = value;
    }
    if (search) {
      search.value = option ? option.getAttribute("data-relation-file-label") : value;
    }
  }

  function filterRelationFileOptions(panel, term) {
    var normalizedTerm = String(term || "").trim().toLowerCase();
    var options = queryAll("[data-relation-file-option]", panel);
    var hasMatch = false;
    options.forEach(function (option) {
      var haystack = [
        option.getAttribute("data-relation-file-label"),
        option.getAttribute("data-relation-file-folder")
      ].join(" ").toLowerCase();
      var matches = !normalizedTerm || haystack.indexOf(normalizedTerm) !== -1;
      option.hidden = !matches;
      hasMatch = hasMatch || matches;
    });
    var empty = query("[data-relation-file-empty]", panel);
    if (empty) {
      empty.hidden = hasMatch;
    }
  }

  function openRelationFilePicker(panel, term) {
    var options = query("[data-relation-file-options]", panel);
    var search = query("[data-relation-file-search]", panel);
    if (options) {
      options.hidden = false;
    }
    if (search) {
      search.setAttribute("aria-expanded", "true");
    }
    filterRelationFileOptions(panel, term);
  }

  function closeRelationFilePicker(panel) {
    var options = query("[data-relation-file-options]", panel);
    var search = query("[data-relation-file-search]", panel);
    if (options) {
      options.hidden = true;
    }
    if (search) {
      search.setAttribute("aria-expanded", "false");
    }
  }

  function postgresColumnName(value, fallback) {
    var normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) {
      return fallback;
    }
    if (!/^[a-z]/.test(normalized)) {
      normalized = "column_" + normalized;
    }
    return normalized;
  }

  function postgresTableName(value, fallback) {
    var normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) {
      return fallback;
    }
    if (!/^[a-z]/.test(normalized)) {
      normalized = "table_" + normalized;
    }
    return normalized;
  }

  function resolveCellColumn(cell) {
    var key = cell.getAttribute("data-column-key");
    var configured = findSheetColumn(key);
    if (configured) {
      return configured;
    }
    var letter = cell.getAttribute("data-column") || "A";
    return sheetColumn(Math.max(0, letter.charCodeAt(0) - 65));
  }

  function snapshotCell(cell) {
    return {
      row: cell.getAttribute("data-row"),
      column: cell.getAttribute("data-column"),
      columnKey: cell.getAttribute("data-column-key"),
      value: cell.getAttribute("data-value") || "",
      error: cell.getAttribute("data-error") || "",
      errorCode: cell.getAttribute("data-error-code") || ""
    };
  }

  function snapshotsMatch(left, right) {
    return left.value === right.value && left.error === right.error && left.errorCode === right.errorCode;
  }

  function refreshHistoryControls() {
    [
      { command: "undo", enabled: cellHistory.length > 0 },
      { command: "redo", enabled: cellRedoHistory.length > 0 }
    ].forEach(function (state) {
      queryAll("[data-sheet-command='" + state.command + "']").forEach(function (button) {
        button.disabled = !state.enabled;
        button.setAttribute("aria-disabled", String(!state.enabled));
      });
    });
  }

  function recordCellChange(before, after) {
    if (snapshotsMatch(before, after)) {
      return;
    }
    cellHistory.push({ kind: "cell", before: before, after: after });
    if (cellHistory.length > 100) {
      cellHistory.shift();
    }
    cellRedoHistory = [];
    refreshHistoryControls();
  }

  function formatSnapshot(cell) {
    return {
      row: cell.getAttribute("data-row"),
      column: cell.getAttribute("data-column"),
      font: cell.getAttribute("data-format-font") || "sans",
      size: cell.getAttribute("data-format-size") || "12",
      bold: cell.getAttribute("data-format-bold") || "false",
      italic: cell.getAttribute("data-format-italic") || "false",
      underline: cell.getAttribute("data-format-underline") || "false",
      color: cell.getAttribute("data-format-color") || "default",
      fill: cell.getAttribute("data-format-fill") || "default",
      borders: cell.getAttribute("data-format-borders") || "false",
      borderColor: cell.getAttribute("data-format-border-color") || "black",
      borderStyle: cell.getAttribute("data-format-border-style") || "solid",
      align: cell.getAttribute("data-format-align") || "left",
      vertical: cell.getAttribute("data-format-vertical") || "middle",
      wrap: cell.getAttribute("data-format-wrap") || "false",
      display: cell.getAttribute("data-display-format") || "automatic"
    };
  }

  function paletteChoices() {
    return [
      ["black", "Black", "#202124"], ["gray-700", "Dark gray", "#5f6368"], ["gray-500", "Gray", "#9aa0a6"], ["gray-300", "Light gray", "#dadce0"], ["gray-100", "Very light gray", "#f1f3f4"],
      ["white", "White", "#ffffff"], ["red", "Red", "#ea4335"], ["orange", "Orange", "#f29900"], ["yellow", "Yellow", "#fbbc04"], ["green", "Green", "#34a853"],
      ["teal", "Teal", "#46bdc6"], ["cyan", "Cyan", "#12cdd4"], ["blue", "Blue", "#4285f4"], ["indigo", "Indigo", "#5e97f6"], ["purple", "Purple", "#a142f4"],
      ["magenta", "Magenta", "#d93ca9"], ["red-light", "Light red", "#f4c7c3"], ["orange-light", "Light orange", "#fce8b2"], ["yellow-light", "Light yellow", "#fff2cc"], ["green-light", "Light green", "#d9ead3"],
      ["teal-light", "Light teal", "#d0e0e3"], ["cyan-light", "Light cyan", "#c9daf8"], ["blue-light", "Light blue", "#cfe2f3"], ["indigo-light", "Light indigo", "#d9d2e9"], ["purple-light", "Light purple", "#ead1dc"],
      ["red-medium", "Medium red", "#e06666"], ["orange-medium", "Medium orange", "#f6b26b"], ["yellow-medium", "Medium yellow", "#ffd966"], ["green-medium", "Medium green", "#93c47d"], ["teal-medium", "Medium teal", "#76a5af"],
      ["blue-medium", "Medium blue", "#6d9eeb"], ["indigo-medium", "Medium indigo", "#8e7cc3"], ["purple-medium", "Medium purple", "#c27ba0"], ["red-dark", "Dark red", "#cc4125"], ["orange-dark", "Dark orange", "#e69138"],
      ["yellow-dark", "Dark yellow", "#bf9000"], ["green-dark", "Dark green", "#6aa84f"], ["teal-dark", "Dark teal", "#45818e"], ["blue-dark", "Dark blue", "#3c78d8"], ["indigo-dark", "Dark indigo", "#674ea7"],
      ["purple-dark", "Dark purple", "#a64d79"], ["red-deep", "Deep red", "#990000"], ["orange-deep", "Deep orange", "#b45f06"], ["yellow-deep", "Deep yellow", "#7f6000"], ["green-deep", "Deep green", "#38761d"],
      ["teal-deep", "Deep teal", "#134f5c"], ["blue-deep", "Deep blue", "#1155cc"], ["indigo-deep", "Deep indigo", "#351c75"], ["purple-deep", "Deep purple", "#741b47"]
    ];
  }

  function paletteHex(token, fallback) {
    var match = paletteChoices().find(function (choice) { return choice[0] === token; });
    if (match) return match[2];
    var legacy = { dark: "#202124", medium: "#5f6368", light: "#dadce0" };
    return legacy[token] || fallback || "";
  }

  function applyFormatSnapshot(snapshot) {
    var cell = query("[data-row='" + snapshot.row + "'][data-column='" + snapshot.column + "']");
    if (!cell) {
      return;
    }
    var attributes = {
      "data-format-font": snapshot.font,
      "data-format-size": snapshot.size,
      "data-format-bold": snapshot.bold,
      "data-format-italic": snapshot.italic,
      "data-format-underline": snapshot.underline,
      "data-format-color": snapshot.color,
      "data-format-fill": snapshot.fill,
      "data-format-borders": snapshot.borders,
      "data-format-border-color": snapshot.borderColor,
      "data-format-border-style": snapshot.borderStyle,
      "data-format-align": snapshot.align,
      "data-format-vertical": snapshot.vertical,
      "data-format-wrap": snapshot.wrap,
      "data-display-format": snapshot.display
    };
    Object.keys(attributes).forEach(function (name) {
      cell.setAttribute(name, attributes[name]);
    });
    if (snapshot.color === "default") {
      cell.style.removeProperty("--sheet-format-text");
    } else {
      cell.style.setProperty("--sheet-format-text", paletteHex(snapshot.color, "#202124"));
    }
    if (snapshot.fill === "default") {
      cell.style.removeProperty("--sheet-format-fill");
    } else {
      cell.style.setProperty("--sheet-format-fill", paletteHex(snapshot.fill, "#f1f3f4"));
    }
    cell.style.setProperty("--sheet-format-border", paletteHex(snapshot.borderColor, "#5f6368"));
    cell.style.setProperty("--sheet-format-border-width", ({ solid: "1px", medium: "2px", thick: "3px", dashed: "1px", dotted: "1px", double: "3px" })[snapshot.borderStyle] || "1px");
    cell.style.fontSize = snapshot.size + "px";
    renderCellValue(cell, cell.getAttribute("data-value") || "", cell.getAttribute("data-column-key"));
  }

  function recordFormatChange(before, after) {
    cellHistory.push({ kind: "format", before: before, after: after });
    if (cellHistory.length > 100) {
      cellHistory.shift();
    }
    cellRedoHistory = [];
    refreshHistoryControls();
  }

  function applyCellSnapshot(snapshot) {
    var cell = query("[data-row='" + snapshot.row + "'][data-column='" + snapshot.column + "']");
    if (!cell) {
      return;
    }
    clearCellError(cell);
    cell.setAttribute("data-value", snapshot.value);
    renderCellValue(cell, snapshot.value, snapshot.columnKey);
    if (snapshot.error) {
      setCellError(cell, snapshot.error, snapshot.errorCode);
    } else {
      updateSheetRowValidation(cell.closest("[data-sheet-row]"));
    }
    selectCell(cell);
  }

  function clearSelectedCell(cell) {
    if (!cell) {
      return;
    }
    var before = snapshotCell(cell);
    clearCellError(cell);
    cell.setAttribute("data-value", "");
    renderCellValue(cell, "", cell.getAttribute("data-column-key"));
    updateSheetRowValidation(cell.closest("[data-sheet-row]"));
    selectCell(cell);
    recordCellChange(before, snapshotCell(cell));
  }

  function copySelectedCell(cell) {
    if (!cell) {
      return;
    }
    sheetClipboard = cell.getAttribute("data-value") || "";
    function fallbackCopy() {
      var helper = document.createElement("textarea");
      helper.value = sheetClipboard;
      helper.setAttribute("aria-hidden", "true");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      try {
        document.execCommand("copy");
      } catch (error) {}
      helper.remove();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        var clipboardWrite = navigator.clipboard.writeText(sheetClipboard);
        if (clipboardWrite && typeof clipboardWrite.catch === "function") {
          clipboardWrite.catch(fallbackCopy);
        }
      } else {
        fallbackCopy();
      }
    } catch (error) {
      fallbackCopy();
    }
    showToast("Cell copied", sheetClipboard || "Blank cell copied.");
  }

  function undoCellChange() {
    var change = cellHistory.pop();
    if (!change) {
      showToast("Nothing to undo", "There are no earlier table changes in this session.");
      return;
    }
    cellRedoHistory.push(change);
    if (change.kind === "format") {
      change.before.forEach(applyFormatSnapshot);
      refreshFormattingToolbar();
    } else {
      applyCellSnapshot(change.before);
    }
    refreshHistoryControls();
  }

  function redoCellChange() {
    var change = cellRedoHistory.pop();
    if (!change) {
      showToast("Nothing to redo", "There are no later table changes in this session.");
      return;
    }
    cellHistory.push(change);
    if (change.kind === "format") {
      change.after.forEach(applyFormatSnapshot);
      refreshFormattingToolbar();
    } else {
      applyCellSnapshot(change.after);
    }
    refreshHistoryControls();
  }

  function renderCellValue(cell, value, columnKey) {
    var column = findSheetColumn(columnKey);
    var displayFormat = cell.getAttribute("data-display-format") || "automatic";
    var displayValue = value;
    if (displayFormat === "currency" && value) {
      displayValue = formatPriceValue(value);
    } else if (displayFormat === "percent" && value && Number.isFinite(Number(String(value).replace(/[^0-9.-]/g, "")))) {
      displayValue = String(value).replace(/[^0-9.-]/g, "") + "%";
    } else if (displayFormat === "plain") {
      displayValue = String(value || "").replace(/^₱/, "");
    }
    if (column && column.field === "Relation" && column.format === "Related record" && displayValue) {
      displayValue = relationDisplayValue(column, displayValue, column.relatedRecordTemplate);
    }
    cell.innerHTML = "";
    if (column && column.field === "Select" && displayValue) {
      var pill = document.createElement("span");
      pill.className = "status-pill";
      pill.textContent = displayValue;
      cell.appendChild(pill);
    } else {
      cell.textContent = displayValue;
    }
  }

  function createSheetCell(className, role, columnIndex) {
    var cell = document.createElement("div");
    cell.className = className;
    cell.setAttribute("role", role);
    cell.setAttribute("aria-colindex", String(columnIndex));
    return cell;
  }

  function buildSpreadsheetGrid() {
    var grid = query("[data-grid]");
    if (!grid) {
      return;
    }
    grid.innerHTML = "";
    grid.setAttribute("aria-rowcount", String(sheetCapacity + 2));
    grid.setAttribute("aria-colcount", String(sheetColumnCount + 1));
    grid.setAttribute("data-sheet-capacity", String(sheetCapacity));

    var coordinateRow = document.createElement("div");
    coordinateRow.className = "data-grid__row data-grid__row--coordinates";
    coordinateRow.setAttribute("role", "row");
    coordinateRow.setAttribute("aria-rowindex", "1");
    var coordinateCorner = createSheetCell("data-grid__cell data-grid__cell--coordinate data-grid__cell--rownum", "columnheader", 1);
    coordinateCorner.setAttribute("aria-label", "Spreadsheet coordinates");
    coordinateRow.appendChild(coordinateCorner);
    for (var coordinateIndex = 0; coordinateIndex < sheetColumnCount; coordinateIndex += 1) {
      var coordinate = createSheetCell("data-grid__cell data-grid__cell--coordinate", "columnheader", coordinateIndex + 2);
      coordinate.textContent = sheetColumnLetter(coordinateIndex);
      coordinate.setAttribute("data-coordinate", sheetColumnLetter(coordinateIndex));
      coordinate.setAttribute("data-column-drag-index", String(coordinateIndex));
      coordinate.setAttribute("draggable", "true");
      coordinate.tabIndex = 0;
      coordinateRow.appendChild(coordinate);
    }
    grid.appendChild(coordinateRow);

    var fieldRow = document.createElement("div");
    fieldRow.className = "data-grid__row data-grid__row--fields";
    fieldRow.setAttribute("role", "row");
    fieldRow.setAttribute("aria-rowindex", "2");
    var fieldCorner = createSheetCell("data-grid__cell data-grid__cell--header data-grid__cell--rownum", "columnheader", 1);
    fieldCorner.textContent = "#";
    fieldRow.appendChild(fieldCorner);
    for (var fieldIndex = 0; fieldIndex < sheetColumnCount; fieldIndex += 1) {
      var column = sheetColumn(fieldIndex);
      var fieldCell = createSheetCell("data-grid__cell data-grid__cell--header", "columnheader", fieldIndex + 2);
      fieldCell.setAttribute("data-column-key", column.key);
      fieldCell.setAttribute("data-column-letter", sheetColumnLetter(fieldIndex));
      fieldCell.setAttribute("data-column-drag-index", String(fieldIndex));
      fieldCell.setAttribute("draggable", "true");
      fieldCell.tabIndex = 0;
      var headerMain = document.createElement("span");
      headerMain.className = "header-main";
      var headerTitle = document.createElement("span");
      headerTitle.className = "header-title";
      headerTitle.setAttribute("data-column-label", "");
      headerTitle.textContent = column.label;
      headerMain.appendChild(headerTitle);
      fieldCell.appendChild(headerMain);
      if (column.label) {
        fieldCell.setAttribute("data-column-header", column.key);
      } else {
        fieldCell.classList.add("data-grid__cell--empty-header");
        fieldCell.setAttribute("data-empty-header", sheetColumnLetter(fieldIndex));
        fieldCell.setAttribute("aria-label", "Empty column " + sheetColumnLetter(fieldIndex) + ". Double-click to name.");
      }
      fieldRow.appendChild(fieldCell);
    }
    grid.appendChild(fieldRow);

    for (var rowNumber = 1; rowNumber <= visibleSheetRows; rowNumber += 1) {
      var row = document.createElement("div");
      row.className = "data-grid__row";
      row.setAttribute("role", "row");
      row.setAttribute("aria-rowindex", String(rowNumber + 2));
      row.setAttribute("data-sheet-row", String(rowNumber));
      var values = sheetRecords[rowNumber - 1] || [];
      var rowHeader = createSheetCell("data-grid__cell data-grid__cell--rownum", "rowheader", 1);
      rowHeader.textContent = String(rowNumber);
      rowHeader.tabIndex = 0;
      rowHeader.setAttribute("draggable", "true");
      rowHeader.setAttribute("data-sheet-row-header", String(rowNumber));
      if (values[0]) {
        rowHeader.setAttribute("data-record-id", values[0]);
        row.setAttribute("data-record-row", "");
      }
      row.appendChild(rowHeader);
      for (var cellIndex = 0; cellIndex < sheetColumnCount; cellIndex += 1) {
        var cellColumn = sheetColumn(cellIndex);
        var value = values[cellIndex] || "";
        var bodyCell = createSheetCell("data-grid__cell", "gridcell", cellIndex + 2);
        bodyCell.setAttribute("data-cell", "");
        bodyCell.setAttribute("data-row", String(rowNumber));
        bodyCell.setAttribute("data-column", sheetColumnLetter(cellIndex));
        bodyCell.setAttribute("data-column-key", cellColumn.key);
        bodyCell.setAttribute("data-named-column", namedSheetColumns[cellIndex] && namedSheetColumns[cellIndex].label ? "true" : "false");
        bodyCell.setAttribute("data-value", value);
        renderCellValue(bodyCell, value, cellColumn.key);
        row.appendChild(bodyCell);
      }
      grid.appendChild(row);
    }
    if (window.WireframeIcons) {
      window.WireframeIcons.render(grid);
    }
    updateSheetSummary();
  }

  function resetCellHistory() {
    cellHistory = [];
    cellRedoHistory = [];
    refreshHistoryControls();
  }

  function moveArrayItem(items, fromIndex, toIndex) {
    var moved = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, moved);
  }

  function moveGridChild(parent, fromIndex, toIndex, offset) {
    var children = Array.prototype.slice.call(parent.children, offset || 0);
    var moved = children[fromIndex];
    var target = children[toIndex];
    if (!moved || !target || moved === target) {
      return;
    }
    parent.insertBefore(moved, fromIndex < toIndex ? target.nextSibling : target);
  }

  function clearColumnError(index) {
    var coordinate = query("[data-column-drag-index='" + index + "'][data-coordinate]");
    var header = query("[data-column-drag-index='" + index + "'][data-column-letter]");
    if (coordinate) {
      coordinate.removeAttribute("data-column-invalid");
      coordinate.removeAttribute("aria-invalid");
      coordinate.removeAttribute("data-column-error-open");
      coordinate.setAttribute("aria-label", "Move column " + sheetColumnLetter(index));
    }
    if (header) {
      header.removeAttribute("data-column-invalid");
      header.removeAttribute("aria-invalid");
      header.removeAttribute("data-column-error-open");
      header.removeAttribute("data-column-error-side");
      var column = namedSheetColumns[index];
      var letter = sheetColumnLetter(index);
      var headerLabel = query("[data-column-label]", header);
      if (headerLabel) {
        headerLabel.textContent = column && column.label ? column.label : "";
      }
      header.setAttribute("aria-label", column && column.label ? column.label : "Empty column " + letter + ". Double-click to name.");
      if (header.columnErrorTimer) {
        window.clearTimeout(header.columnErrorTimer);
        header.columnErrorTimer = null;
      }
      var popover = query(".column-error-popover", header);
      if (popover) {
        popover.remove();
      }
    }
  }

  function showUnnamedColumnError(index) {
    clearColumnError(index);
    var letter = sheetColumnLetter(index);
    var header = query("[data-column-drag-index='" + index + "'][data-column-letter]");
    if (!header) {
      return;
    }
    header.setAttribute("data-column-invalid", "true");
    header.setAttribute("aria-invalid", "true");
    var headerLabel = query("[data-column-label]", header);
    if (headerLabel) {
      headerLabel.textContent = "#ERROR!";
    }
    header.setAttribute("aria-label", "Column " + letter + ". #ERROR!. Missing column name. Name this column before the layout can be saved.");
    var popover = document.createElement("div");
    popover.className = "column-error-popover";
    popover.setAttribute("role", "alert");
    var title = document.createElement("strong");
    title.className = "column-error-popover__title";
    title.textContent = "Missing column name";
    var copy = document.createElement("p");
    copy.textContent = "Name column " + letter + " before this layout can be saved.";
    popover.appendChild(title);
    popover.appendChild(copy);
    header.appendChild(popover);
    var headerRect = header.getBoundingClientRect();
    var sheet = query("[data-sheet-scroll]");
    var sheetRect = sheet ? sheet.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    var popoverWidth = Math.min(304, window.innerWidth - 32);
    var visibleLeft = Math.max(sheetRect.left, 0) + 8;
    var visibleRight = Math.min(sheetRect.right, window.innerWidth) - 8;
    var clampedLeft = Math.min(Math.max(headerRect.left, visibleLeft), visibleRight - popoverWidth);
    popover.style.position = "fixed";
    popover.style.top = (headerRect.top - 1) + "px";
    popover.style.left = clampedLeft + "px";
  }

  function validateColumnLayout(preferredErrorIndex) {
    var lastNamedIndex = -1;
    for (var columnIndex = 0; columnIndex < sheetColumnCount; columnIndex += 1) {
      clearColumnError(columnIndex);
      if (namedSheetColumns[columnIndex] && namedSheetColumns[columnIndex].label) {
        lastNamedIndex = columnIndex;
      }
    }
    var invalidIndexes = [];
    for (var gapIndex = 0; gapIndex <= lastNamedIndex; gapIndex += 1) {
      if (!namedSheetColumns[gapIndex] || !namedSheetColumns[gapIndex].label) {
        invalidIndexes.push(gapIndex);
      }
    }
    invalidIndexes.forEach(function (index) {
      showUnnamedColumnError(index);
    });
    return invalidIndexes;
  }

  function refreshColumnPositions() {
    queryAll("[data-coordinate]").forEach(function (coordinate, index) {
      var letter = sheetColumnLetter(index);
      coordinate.textContent = letter;
      coordinate.setAttribute("data-coordinate", letter);
      coordinate.setAttribute("data-column-drag-index", String(index));
      coordinate.setAttribute("aria-colindex", String(index + 2));
      coordinate.setAttribute("aria-label", "Move column " + letter);
    });
    queryAll("[data-column-letter]").forEach(function (header, index) {
      var letter = sheetColumnLetter(index);
      var config = namedSheetColumns[index];
      var key = config ? config.key : "column-" + letter.toLowerCase();
      header.setAttribute("data-column-letter", letter);
      header.setAttribute("data-column-drag-index", String(index));
      header.setAttribute("data-column-key", key);
      header.setAttribute("aria-colindex", String(index + 2));
      if (config) {
        header.setAttribute("aria-label", config.label);
      } else {
        header.setAttribute("data-empty-header", letter);
        header.setAttribute("aria-label", "Empty column " + letter + ". Double-click to name.");
      }
    });
    queryAll("[data-sheet-row]").forEach(function (row) {
      queryAll("[data-cell]", row).forEach(function (cell, index) {
        var letter = sheetColumnLetter(index);
        var config = namedSheetColumns[index];
        cell.setAttribute("data-column", letter);
        cell.setAttribute("aria-colindex", String(index + 2));
        cell.setAttribute("data-column-key", config ? config.key : "column-" + letter.toLowerCase());
        cell.setAttribute("data-named-column", config && config.label ? "true" : "false");
      });
    });
  }

  function reorderColumn(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= sheetColumnCount || toIndex >= sheetColumnCount) {
      return;
    }
    while (namedSheetColumns.length < sheetColumnCount) {
      namedSheetColumns.push(null);
    }
    var movedColumn = namedSheetColumns[fromIndex];
    for (var errorIndex = 0; errorIndex < sheetColumnCount; errorIndex += 1) {
      clearColumnError(errorIndex);
    }
    if (fromIndex !== toIndex) {
      moveArrayItem(namedSheetColumns, fromIndex, toIndex);
      var fieldRow = query(".data-grid__row--fields");
      moveGridChild(fieldRow, fromIndex, toIndex, 1);
      queryAll("[data-sheet-row]").forEach(function (row) {
        moveGridChild(row, fromIndex, toIndex, 1);
      });
    }
    refreshColumnPositions();
    resetCellHistory();
    updateAllSheetRowValidation();
    var invalidColumns = validateColumnLayout(toIndex);
    var movedLabel = movedColumn && movedColumn.label ? movedColumn.label : "Empty column " + sheetColumnLetter(fromIndex);
    var errorCopy = invalidColumns.length ? " Name the red column" + (invalidColumns.length > 1 ? "s" : "") + " before this layout can be saved." : "";
    showToast("Column moved", movedLabel + " moved from " + sheetColumnLetter(fromIndex) + " to " + sheetColumnLetter(toIndex) + ". Display order only." + errorCopy);
  }

  function renumberSheetRows() {
    queryAll("[data-sheet-row]").forEach(function (row, index) {
      clearRowError(row);
      var rowNumber = index + 1;
      row.setAttribute("data-sheet-row", String(rowNumber));
      row.setAttribute("aria-rowindex", String(rowNumber + 2));
      var rowHeader = query("[data-sheet-row-header]", row);
      rowHeader.setAttribute("data-sheet-row-header", String(rowNumber));
      var labelNode = Array.prototype.find.call(rowHeader.childNodes, function (node) {
        return node.nodeType === 3;
      });
      if (labelNode) {
        labelNode.nodeValue = String(rowNumber);
      } else {
        rowHeader.insertBefore(document.createTextNode(String(rowNumber)), rowHeader.firstChild);
      }
      queryAll("[data-cell]", row).forEach(function (cell) {
        cell.setAttribute("data-row", String(rowNumber));
      });
    });
    updateAllSheetRowValidation();
  }

  function reorderRow(fromIndex, toIndex) {
    var rows = queryAll("[data-sheet-row]");
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) {
      return;
    }
    var grid = query("[data-grid]");
    var moved = rows[fromIndex];
    var target = rows[toIndex];
    grid.insertBefore(moved, fromIndex < toIndex ? target.nextSibling : target);
    renumberSheetRows();
    resetCellHistory();
    showToast("Row moved", "Row " + (fromIndex + 1) + " moved to " + (toIndex + 1) + ". Display order only.");
  }

  function clearDragState() {
    queryAll("[data-dragging], [data-column-drop-target], [data-row-drop-target]").forEach(function (element) {
      element.removeAttribute("data-dragging");
      element.removeAttribute("data-column-drop-target");
      element.removeAttribute("data-row-drop-target");
    });
  }

  function initGridReordering() {
    var columnDrag = null;
    var rowDrag = null;

    queryAll("[data-column-drag-index]").forEach(function (handle) {
      handle.addEventListener("dragstart", function (event) {
        if (event.target.closest("button, input, select")) {
          event.preventDefault();
          return;
        }
        var index = Number(handle.getAttribute("data-column-drag-index"));
        columnDrag = index;
        handle.setAttribute("data-dragging", "true");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", "column:" + index);
        }
      });
      handle.addEventListener("dragover", function (event) {
        if (columnDrag === null) {
          return;
        }
        event.preventDefault();
        clearDragState();
        handle.setAttribute("data-column-drop-target", "true");
      });
      handle.addEventListener("drop", function (event) {
        if (columnDrag === null) {
          return;
        }
        event.preventDefault();
        var targetIndex = Number(handle.getAttribute("data-column-drag-index"));
        var sourceIndex = columnDrag;
        columnDrag = null;
        clearDragState();
        reorderColumn(sourceIndex, targetIndex);
      });
      handle.addEventListener("dragend", function () {
        columnDrag = null;
        clearDragState();
      });
      handle.addEventListener("keydown", function (event) {
        if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
          return;
        }
        event.preventDefault();
        var index = Number(handle.getAttribute("data-column-drag-index"));
        var targetIndex = Math.max(0, Math.min(sheetColumnCount - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
        reorderColumn(index, targetIndex);
        var nextHandle = query("[data-column-drag-index='" + targetIndex + "'][" + (handle.hasAttribute("data-coordinate") ? "data-coordinate" : "data-column-letter") + "]");
        if (nextHandle) {
          nextHandle.focus();
        }
      });
    });

    queryAll("[data-sheet-row-header]").forEach(function (rowHeader) {
      rowHeader.addEventListener("dragstart", function (event) {
        rowDrag = Number(rowHeader.getAttribute("data-sheet-row-header")) - 1;
        rowHeader.setAttribute("data-dragging", "true");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", "row:" + rowDrag);
        }
      });
      rowHeader.addEventListener("dragover", function (event) {
        if (rowDrag === null) {
          return;
        }
        event.preventDefault();
        clearDragState();
        rowHeader.setAttribute("data-row-drop-target", "true");
      });
      rowHeader.addEventListener("drop", function (event) {
        if (rowDrag === null) {
          return;
        }
        event.preventDefault();
        var targetIndex = Number(rowHeader.getAttribute("data-sheet-row-header")) - 1;
        var sourceIndex = rowDrag;
        rowDrag = null;
        clearDragState();
        reorderRow(sourceIndex, targetIndex);
      });
      rowHeader.addEventListener("dragend", function () {
        rowDrag = null;
        clearDragState();
      });
      rowHeader.addEventListener("keydown", function (event) {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
          return;
        }
        event.preventDefault();
        var index = Number(rowHeader.getAttribute("data-sheet-row-header")) - 1;
        var targetIndex = Math.max(0, Math.min(visibleSheetRows - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
        reorderRow(index, targetIndex);
        var nextHeader = query("[data-sheet-row-header='" + (targetIndex + 1) + "']");
        if (nextHeader) {
          nextHeader.focus();
        }
      });
    });
  }

  function showToast(title, copy) {
    var toast = query("[data-toast]");
    if (!toast) {
      return;
    }
    query("[data-toast-title]", toast).textContent = title;
    query("[data-toast-copy]", toast).textContent = copy;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 3200);
  }

  function initNavigation() {
    var shell = query("[data-app-shell]");
    var backdrop = query("[data-nav-close].app-backdrop");
    var mobileNavigation = window.matchMedia("(max-width: 920px)");
    if (!shell) {
      return;
    }

    function setNavigation(open) {
      var shouldOpen = Boolean(open && mobileNavigation.matches);
      shell.setAttribute("data-nav-open", shouldOpen ? "true" : "false");
      setHidden(backdrop, !shouldOpen);
    }

    queryAll("[data-nav-trigger]").forEach(function (button) {
      button.addEventListener("click", function () {
        setNavigation(true);
      });
    });

    queryAll("[data-nav-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        setNavigation(false);
      });
    });

    if (mobileNavigation.addEventListener) {
      mobileNavigation.addEventListener("change", function (event) {
        if (!event.matches) {
          setNavigation(false);
        }
      });
    }

    setNavigation(false);
  }

  function currentDepartment(params) {
    var selectedFolder = params.get("folder") || params.get("department");
    return selectedFolder === "finance"
      ? { key: "finance", label: "Finance" }
      : { key: "operations", label: "Operations" };
  }

  function initFileExplorer() {
    var explorer = query("[data-file-explorer]");
    if (!explorer) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var requestedFolder = params.get("folder") || params.get("department");
    var department = currentDepartment(params);
    var activeCollection = requestedFolder === "operations" || requestedFolder === "finance"
      ? department.key
      : "root";
    var collections = queryAll("[data-explorer-collection]", explorer);
    var count = query("[data-explorer-count]", explorer);
    var sectionTitle = query("[data-explorer-section-title]", explorer);
    var folderCrumb = query("[data-explorer-folder-crumb]", explorer);
    var folderCrumbText = query("[data-explorer-folder-crumb-text]", explorer);
    var newFile = query("[data-explorer-new-file]", explorer);
    var importFile = query("[data-explorer-import]", explorer);
    var search = query("[data-explorer-search]");
    var empty = query("[data-explorer-empty]", explorer);
    var view = "list";

    function activeItems() {
      return queryAll("[data-explorer-item]", explorer).filter(function (item) {
        return item.closest("[data-explorer-collection]") === query("[data-explorer-collection='" + activeCollection + "']", explorer);
      });
    }

    function refreshSearch() {
      var term = search ? search.value.trim().toLowerCase() : "";
      var visible = 0;
      activeItems().forEach(function (item) {
        var match = !term || (item.getAttribute("data-search") || "").toLowerCase().indexOf(term) !== -1;
        item.hidden = !match;
        if (match) visible += 1;
      });
      if (empty) {
        empty.hidden = visible > 0;
      }
      if (count) {
        var noun = activeCollection === "root" ? "folders" : "files";
        count.textContent = visible + " " + noun;
      }
    }

    function setView(nextView) {
      view = nextView;
      explorer.setAttribute("data-explorer-view", view);
      queryAll("[data-explorer-view]", explorer).forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-explorer-view") === view));
      });
    }

    collections.forEach(function (collection) {
      collection.hidden = collection.getAttribute("data-explorer-collection") !== activeCollection;
    });
    if (activeCollection === "root") {
      document.title = "Acme Inc. files";
      if (sectionTitle) sectionTitle.textContent = "Folders";
      if (folderCrumb) folderCrumb.hidden = true;
      if (newFile) newFile.hidden = true;
      if (importFile) importFile.hidden = true;
    } else {
      document.title = department.label + " · Acme Inc.";
      if (sectionTitle) sectionTitle.textContent = "Files";
      if (folderCrumb) folderCrumb.hidden = false;
      if (folderCrumbText) folderCrumbText.textContent = department.label;
      if (newFile) {
        newFile.hidden = false;
        newFile.setAttribute("href", "./table.html?new=1&folder=" + department.key + "&table=untitled-file");
      }
      if (importFile) {
        importFile.hidden = false;
        importFile.setAttribute("href", "./import.html?folder=" + department.key);
      }
    }

    queryAll("[data-explorer-view]", explorer).forEach(function (button) {
      button.addEventListener("click", function () {
        setView(button.getAttribute("data-explorer-view"));
      });
    });
    if (search) {
      search.addEventListener("input", refreshSearch);
    }
    setView(view);
    refreshSearch();
  }

  function initDepartmentContext() {
    var params = new URLSearchParams(window.location.search);
    var department = currentDepartment(params);

    queryAll("[data-department-name]").forEach(function (element) {
      element.textContent = department.label;
    });

    queryAll("[data-department-return]").forEach(function (link) {
      link.setAttribute("href", "./browse.html?folder=" + department.key);
    });
    queryAll("[data-department-create]").forEach(function (link) {
      link.setAttribute("href", "./table.html?new=1&folder=" + department.key + "&table=untitled-file");
    });

    queryAll("[data-department-import]").forEach(function (link) {
      link.setAttribute("href", "./import.html?folder=" + department.key);
    });

    queryAll("[data-department-table-link]").forEach(function (link) {
      link.setAttribute("href", "./table.html?imported=1&folder=" + department.key);
    });
  }

  function initDepartmentBrowse() {
    var browser = query("[data-department-browser]");
    if (!browser) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var department = currentDepartment(params);
    var lists = queryAll("[data-department-list]");
    var activeList = null;

    lists.forEach(function (list) {
      var active = list.getAttribute("data-department-list") === department.key;
      list.hidden = !active;
      if (active) {
        activeList = list;
      }
    });

    queryAll("[data-department-link]").forEach(function (link) {
      if (link.getAttribute("data-department-link") === department.key) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    queryAll("[data-department-title], [data-department-crumb]").forEach(function (element) {
      element.textContent = department.label;
    });

    var copy = query("[data-department-copy]");
    if (copy) {
      copy.textContent = "Tables managed by " + department.label + ".";
    }

    var count = query("[data-object-count]");
    if (count && activeList) {
      var total = queryAll("[data-object-row]", activeList).length;
      count.textContent = total + (total === 1 ? " table" : " tables");
    }

    var create = query("[data-department-action='create']");
    var importLink = query("[data-department-action='import']");
    if (create) {
      create.setAttribute("href", "./table.html?new=1&folder=" + department.key + "&table=untitled-file");
    }
    if (importLink) {
      importLink.setAttribute("href", "./import.html?department=" + department.key);
    }

    document.title = department.label + " tables · Tabular";
  }

  function initObjectSearch() {
    var input = query("[data-object-search]");
    var activeList = query("[data-object-list]:not([hidden])") || query("[data-object-list]");
    var rows = activeList ? queryAll("[data-object-row]", activeList) : [];
    var count = query("[data-object-count]");
    var empty = query("[data-object-empty]");
    if (!input || !rows.length) {
      return;
    }

    input.addEventListener("input", function () {
      var term = input.value.trim().toLowerCase();
      var visible = 0;
      rows.forEach(function (row) {
        var matches = !term || row.getAttribute("data-search").toLowerCase().indexOf(term) !== -1;
        row.hidden = !matches;
        if (matches) {
          visible += 1;
        }
      });
      count.textContent = visible + (visible === 1 ? " table" : " tables");
      empty.hidden = visible !== 0;
    });
  }

  function initQueryState() {
    var params = new URLSearchParams(window.location.search);
    var department = currentDepartment(params);
    var banner = query("[data-query-banner]");
    var copy = query("[data-query-banner-copy]");
    var tableTitle = query("[data-table-title]");
    var tableLabels = {
      "customer-orders": "Customer orders",
      inventory: "Inventory",
      vendors: "Vendors",
      "stock-movements": "Stock movements",
      "purchase-requests": "Purchase requests",
      invoices: "Invoices",
      expenses: "Expenses",
      budgets: "Budgets",
      "untitled-file": "Untitled File"
    };
    var tableKey = params.get("table") || "customer-orders";
    var tableLabel = tableLabels[tableKey];

    if (tableTitle && tableLabel) {
      tableTitle.textContent = tableLabel;
      document.title = tableLabel + " · Acme Inc.";
    }
    queryAll("[data-table-link]").forEach(function (link) {
      if (link.getAttribute("data-table-link") === tableKey) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    var grid = query("[data-grid]");
    if (grid && tableLabel) {
      grid.setAttribute("aria-label", tableLabel + " spreadsheet");
    }
    queryAll("[data-department-name]").forEach(function (element) {
      element.textContent = department.label;
    });

    if (params.get("created") === "1" && !isUntitledFileRoute(params) && banner) {
      copy.textContent = "Customer orders was created as public.customer_orders.";
      banner.hidden = false;
    }
    if (params.get("imported") === "1" && banner) {
      copy.textContent = "Q3 orders was imported with 248 exact-value records.";
      banner.hidden = false;
      if (tableTitle) {
        tableTitle.textContent = "Q3 orders";
      }
    }
    if (params.get("state") === "error") {
      showSpreadsheetError();
    }
  }

  function initSpreadsheetTitle() {
    var title = query("[data-table-title]");
    var input = query("[data-table-title-input]");
    if (!title || !input) {
      return;
    }

    function finishEditing(commit) {
      var fallback = title.textContent.trim() || "Untitled spreadsheet";
      var nextTitle = commit && input.value.trim() ? input.value.trim() : fallback;
      title.textContent = nextTitle;
      title.setAttribute("aria-label", "Rename " + nextTitle);
      input.value = nextTitle;
      input.hidden = true;
      title.hidden = false;
      document.title = nextTitle + " · Acme Inc.";
    }

    function startEditing() {
      input.value = title.textContent.trim();
      title.hidden = true;
      input.hidden = false;
      input.focus();
      input.select();
    }

    title.addEventListener("click", startEditing);
    title.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startEditing();
      }
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        finishEditing(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishEditing(false);
      }
    });
    input.addEventListener("blur", function () {
      if (!input.hidden) {
        finishEditing(true);
      }
    });
  }

  function clearCellError(cell) {
    if (!cell) {
      return;
    }
    cell.removeAttribute("data-invalid");
    cell.removeAttribute("aria-invalid");
    cell.removeAttribute("data-error");
    cell.removeAttribute("data-error-code");
    cell.removeAttribute("data-error-open");
    cell.removeAttribute("data-error-side");
    cell.removeAttribute("aria-label");
    if (cell.errorPopoverTimer) {
      window.clearTimeout(cell.errorPopoverTimer);
      cell.errorPopoverTimer = null;
    }
    var popover = query(".cell-error-popover", cell);
    if (popover) {
      popover.remove();
    }
  }

  function setCellError(cell, message, code) {
    if (!cell) {
      return;
    }
    clearCellError(cell);
    var errorCode = code || "#ERROR!";
    cell.setAttribute("data-invalid", "true");
    cell.setAttribute("aria-invalid", "true");
    cell.setAttribute("data-error", message);
    cell.setAttribute("data-error-code", errorCode);
    cell.setAttribute("data-error-open", "true");
    cell.setAttribute("aria-label", errorCode + ". Error: " + message);
    cell.innerHTML = "";
    var token = document.createElement("span");
    token.className = "cell-error-token";
    token.textContent = errorCode;
    var popover = document.createElement("div");
    popover.className = "cell-error-popover";
    popover.setAttribute("role", "alert");
    var title = document.createElement("strong");
    title.className = "cell-error-popover__title";
    title.textContent = "Error";
    var copy = document.createElement("p");
    copy.textContent = message;
    popover.appendChild(title);
    popover.appendChild(copy);
    cell.appendChild(token);
    cell.appendChild(popover);
    var rect = cell.getBoundingClientRect();
    var sheet = query("[data-sheet-scroll]");
    var sheetRect = sheet ? sheet.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    var pinnedRowHeaderEdge = sheetRect.left + 56;
    var rightEdge = Math.min(sheetRect.right, window.innerWidth) - 8;
    var canOpenRight = rect.right + 320 <= rightEdge;
    var canOpenLeft = rect.left - 320 >= pinnedRowHeaderEdge;
    cell.setAttribute("data-error-side", canOpenRight || !canOpenLeft ? "right" : "left");
    cell.errorPopoverTimer = window.setTimeout(function () {
      cell.removeAttribute("data-error-open");
      cell.errorPopoverTimer = null;
    }, 3600);
    updateSheetRowValidation(cell.closest("[data-sheet-row]"));
  }

  function clearRowError(row) {
    if (!row) {
      return;
    }
    var rowHeader = query("[data-sheet-row-header]", row);
    if (!rowHeader) {
      return;
    }
    rowHeader.removeAttribute("data-row-invalid");
    rowHeader.removeAttribute("aria-invalid");
    rowHeader.removeAttribute("data-row-error");
    rowHeader.removeAttribute("aria-describedby");
    rowHeader.removeAttribute("aria-label");
    var popover = query(".row-error-popover", rowHeader);
    if (popover) {
      popover.remove();
    }
  }

  function sheetRowValidationIssues(row) {
    if (!row) {
      return [];
    }
    var namedCells = queryAll("[data-cell][data-named-column='true']", row);
    var hasData = namedCells.some(function (cell) {
      return (cell.getAttribute("data-value") || "").trim() !== "" || cell.getAttribute("data-invalid") === "true";
    });
    if (!hasData) {
      return [];
    }
    var issues = [];
    namedSheetColumns.filter(Boolean).forEach(function (column) {
      if (!column.required) {
        return;
      }
      var cell = query("[data-cell][data-column-key='" + column.key + "']", row);
      if (!cell || !(cell.getAttribute("data-value") || "").trim()) {
        issues.push({ column: column.label, detail: "Required" });
      }
    });
    namedCells.forEach(function (cell) {
      var value = (cell.getAttribute("data-value") || "").trim();
      var error = cell.getAttribute("data-error");
      if (error && value) {
        var column = resolveCellColumn(cell);
        var prefix = column.label + " ";
        var detail = error.indexOf(prefix) === 0 ? error.slice(prefix.length) : error;
        detail = detail.charAt(0).toUpperCase() + detail.slice(1);
        detail = detail.replace(/[.\s]+$/, "");
        issues.push({ column: column.label || cell.getAttribute("data-column"), detail: detail });
      }
    });
    return issues;
  }

  function updateSheetRowValidation(row) {
    if (!row) {
      return;
    }
    var rowHeader = query("[data-sheet-row-header]", row);
    if (!rowHeader) {
      return;
    }
    clearRowError(row);
    var issues = sheetRowValidationIssues(row);
    if (!issues.length) {
      return;
    }
    var rowNumber = row.getAttribute("data-sheet-row");
    var message = "This row cannot be added to PostgreSQL. " + issues.map(function (issue) {
      return issue.column + ": " + issue.detail + ".";
    }).join(" ");
    var tooltipId = "row-error-" + rowNumber;
    rowHeader.setAttribute("data-row-invalid", "true");
    rowHeader.setAttribute("aria-invalid", "true");
    rowHeader.setAttribute("data-row-error", message);
    rowHeader.setAttribute("aria-label", "Row " + rowNumber + ". " + message);
    rowHeader.setAttribute("aria-describedby", tooltipId);
    var popover = document.createElement("div");
    popover.className = "row-error-popover";
    popover.id = tooltipId;
    popover.setAttribute("role", "tooltip");
    var title = document.createElement("strong");
    title.className = "row-error-popover__title";
    title.textContent = "Row not added";
    var copy = document.createElement("p");
    copy.className = "row-error-popover__intro";
    copy.textContent = "This row cannot be added to PostgreSQL.";
    var list = document.createElement("ul");
    list.className = "row-error-popover__list";
    issues.forEach(function (issue) {
      var item = document.createElement("li");
      var label = document.createElement("strong");
      label.textContent = issue.column;
      var detail = document.createElement("span");
      detail.textContent = issue.detail;
      item.appendChild(label);
      item.appendChild(detail);
      list.appendChild(item);
    });
    popover.appendChild(title);
    popover.appendChild(copy);
    popover.appendChild(list);
    rowHeader.appendChild(popover);
  }

  function updateAllSheetRowValidation() {
    queryAll("[data-sheet-row]").forEach(updateSheetRowValidation);
  }

  function sheetRowHasData(cell) {
    var row = cell.closest("[data-sheet-row]");
    if (!row) {
      return false;
    }
    return queryAll("[data-cell][data-named-column='true']", row).some(function (other) {
      return other !== cell && (other.getAttribute("data-value") || "").trim() !== "";
    });
  }

  function showSpreadsheetError() {
    var customer = query("[data-row='5'][data-column='B']");
    var email = query("[data-row='5'][data-column='C']");
    var status = query("[data-row='5'][data-column='D']");
    var total = query("[data-row='5'][data-column='E']");
    var paid = query("[data-row='5'][data-column='F']");
    var orderedAt = query("[data-row='5'][data-column='G']");
    [
      [customer, "Pine & Co."],
      [status, "Processing"],
      [total, "₱1,640.00"],
      [paid, "No"],
      [orderedAt, "Jul 25, 10:40 AM"]
    ].forEach(function (entry) {
      if (!entry[0]) {
        return;
      }
      entry[0].setAttribute("data-value", entry[1]);
      renderCellValue(entry[0], entry[1], entry[0].getAttribute("data-column-key"));
    });
    if (email) {
      setCellError(email, "Email is required before this row can be saved.", "#ERROR!");
      selectCell(email);
    }
  }

  function clearGridSelection() {
    queryAll("[aria-selected='true'], [data-range-selected], [data-row-selected], [data-column-selected]").forEach(function (selected) {
      selected.removeAttribute("aria-selected");
      selected.removeAttribute("data-range-selected");
      selected.removeAttribute("data-row-selected");
      selected.removeAttribute("data-column-selected");
    });
  }

  function selectedCells() {
    var cells = queryAll("[data-cell][aria-selected='true'], [data-cell][data-range-selected='true'], [data-cell][data-row-selected='true'], [data-cell][data-column-selected='true']");
    return cells.filter(function (cell, index) {
      return cells.indexOf(cell) === index;
    });
  }

  function applyRangeSelection(anchor, cell) {
    if (!anchor || !cell) {
      return;
    }
    var startRow = Number(anchor.getAttribute("data-row"));
    var endRow = Number(cell.getAttribute("data-row"));
    var startColumn = (anchor.getAttribute("data-column") || "A").charCodeAt(0) - 65;
    var endColumn = (cell.getAttribute("data-column") || "A").charCodeAt(0) - 65;
    var minRow = Math.min(startRow, endRow);
    var maxRow = Math.max(startRow, endRow);
    var minColumn = Math.min(startColumn, endColumn);
    var maxColumn = Math.max(startColumn, endColumn);
    queryAll("[data-cell]").forEach(function (candidate) {
      var row = Number(candidate.getAttribute("data-row"));
      var column = (candidate.getAttribute("data-column") || "A").charCodeAt(0) - 65;
      if (row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn) {
        candidate.setAttribute("data-range-selected", "true");
        candidate.setAttribute("aria-selected", "true");
      }
    });
    cell.removeAttribute("data-range-selected");
  }

  function selectCell(cell, extend) {
    if (!cell) {
      return;
    }
    var anchor = extend && selectionAnchor ? selectionAnchor : cell;
    clearGridSelection();
    if (extend && anchor !== cell) {
      applyRangeSelection(anchor, cell);
    }
    cell.setAttribute("aria-selected", "true");
    selectionAnchor = anchor;
    activeSelectionTarget = { type: "cell", element: cell };
    var grid = query("[data-grid]");
    if (!cell.id) {
      cell.id = "grid-cell-" + (queryAll("[data-cell]").indexOf(cell) + 1);
    }
    if (grid) {
      grid.setAttribute("aria-activedescendant", cell.id);
    }
    refreshFormattingToolbar();
  }

  function selectRow(rowHeader) {
    var row = rowHeader && rowHeader.closest("[data-sheet-row]");
    if (!row) {
      return;
    }
    clearGridSelection();
    rowHeader.setAttribute("aria-selected", "true");
    rowHeader.setAttribute("data-row-selected", "true");
    queryAll("[data-cell]", row).forEach(function (cell) {
      cell.setAttribute("data-row-selected", "true");
    });
    selectionAnchor = null;
    activeSelectionTarget = { type: "row", element: rowHeader };
    var grid = query("[data-grid]");
    if (grid) {
      grid.removeAttribute("aria-activedescendant");
    }
    refreshFormattingToolbar();
  }

  function columnIndexFromElement(element) {
    if (!element) {
      return -1;
    }
    if (element.hasAttribute("data-column-drag-index")) {
      return Number(element.getAttribute("data-column-drag-index"));
    }
    var letter = element.getAttribute("data-column") || element.getAttribute("data-column-letter") || element.getAttribute("data-coordinate");
    return letter ? letter.charCodeAt(0) - 65 : -1;
  }

  function selectColumn(header) {
    var index = columnIndexFromElement(header);
    if (index < 0) {
      return;
    }
    clearGridSelection();
    queryAll("[data-column-drag-index='" + index + "']").forEach(function (element) {
      element.setAttribute("data-column-selected", "true");
      element.setAttribute("aria-selected", "true");
    });
    var letter = sheetColumnLetter(index);
    queryAll("[data-cell][data-column='" + letter + "']").forEach(function (cell) {
      cell.setAttribute("data-column-selected", "true");
    });
    selectionAnchor = null;
    activeSelectionTarget = { type: "column", element: header, index: index };
    var grid = query("[data-grid]");
    if (grid) {
      grid.removeAttribute("aria-activedescendant");
    }
    refreshFormattingToolbar();
  }

  function priceInputValue(value) {
    return String(value || "").replace(/[^0-9.-]/g, "");
  }

  function formatPriceValue(value) {
    var normalized = String(value || "").replace(/,/g, "").trim();
    if (!normalized) {
      return "";
    }
    var amount = Number(normalized);
    if (!Number.isFinite(amount)) {
      return value;
    }
    return "₱" + amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function datetimeInputValue(value) {
    var match = String(value || "").match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM)$/);
    if (!match) {
      return "";
    }
    var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]) + 1;
    var hour = Number(match[3]) % 12 + (match[5] === "PM" ? 12 : 0);
    return "2026-" + String(month).padStart(2, "0") + "-" + String(match[2]).padStart(2, "0") + "T" + String(hour).padStart(2, "0") + ":" + match[4];
  }

  function formatDatetimeValue(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) {
      return value || "";
    }
    var hour = Number(match[4]);
    var period = hour >= 12 ? "PM" : "AM";
    var displayHour = hour % 12 || 12;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[Number(match[2]) - 1] + " " + Number(match[3]) + ", " + displayHour + ":" + match[5] + " " + period;
  }

  function editCell(cell, seed) {
    if (!cell || cell.getAttribute("data-editing") === "true") {
      return;
    }
    var original = cell.getAttribute("data-value") || "";
    var originalError = cell.getAttribute("data-error");
    var originalErrorCode = cell.getAttribute("data-error-code");
    var columnKey = cell.getAttribute("data-column-key");
    var originalSnapshot = snapshotCell(cell);
    clearCellError(cell);
    cell.setAttribute("data-editing", "true");
    cell.innerHTML = "";
    var column = resolveCellColumn(cell);
    var field = column.field || "Text";
    var editorType = "text";
    var control;
    var outsideEditorHandler = null;
    var selectOptionButtons = [];

    if (field === "Select") {
      editorType = "select";
      var selectFrame = document.createElement("span");
      selectFrame.className = "sheet-cell-select-frame";
      control = document.createElement("button");
      control.type = "button";
      control.className = "sheet-cell-editor sheet-cell-editor--select";
      control.value = original || "Processing";
      control.textContent = control.value;
      control.setAttribute("aria-haspopup", "listbox");
      control.setAttribute("aria-expanded", "true");
      var selectMenu = document.createElement("span");
      selectMenu.className = "sheet-cell-select-menu";
      selectMenu.setAttribute("role", "listbox");
      ["Processing", "Ready", "Shipped", "Cancelled"].forEach(function (optionValue) {
        var option = document.createElement("button");
        option.type = "button";
        option.className = "sheet-cell-select-menu__option";
        option.value = optionValue;
        option.textContent = optionValue;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(optionValue === control.value));
        selectOptionButtons.push(option);
        selectMenu.appendChild(option);
      });
      selectFrame.appendChild(control);
      selectFrame.appendChild(selectMenu);
      cell.appendChild(selectFrame);
    } else if (field === "Relation") {
      editorType = "relation";
      control = document.createElement("select");
      control.className = "sheet-cell-editor sheet-cell-editor--select";
      var relationRecords = relationRecordsFor(column);
      var selectedRelation = relationRecordFor(column, original);
      if (!selectedRelation && original) {
        var existingOption = document.createElement("option");
        existingOption.value = original;
        existingOption.textContent = original;
        existingOption.selected = true;
        control.appendChild(existingOption);
      }
      relationRecords.forEach(function (record) {
        var relationOption = document.createElement("option");
        relationOption.value = record.id;
        relationOption.textContent = formatRelationTemplate(column.relationFieldTemplate, record);
        relationOption.selected = !!selectedRelation && record.id === selectedRelation.id;
        control.appendChild(relationOption);
      });
    } else if (field === "Price") {
      editorType = "price";
      var priceFrame = document.createElement("span");
      priceFrame.className = "sheet-cell-editor-frame sheet-cell-editor-frame--price";
      var currency = document.createElement("span");
      currency.className = "sheet-cell-editor__prefix";
      currency.textContent = "₱";
      control = document.createElement("input");
      control.className = "sheet-cell-editor sheet-cell-editor--price";
      control.type = "text";
      control.inputMode = "decimal";
      control.value = seed !== undefined ? seed : (originalError ? original : priceInputValue(original));
      priceFrame.appendChild(currency);
      priceFrame.appendChild(control);
      cell.appendChild(priceFrame);
    } else if (field === "Number") {
      editorType = "number";
      control = document.createElement("input");
      control.className = "sheet-cell-editor sheet-cell-editor--number";
      control.type = "number";
      control.step = "any";
      control.inputMode = "decimal";
      control.value = seed !== undefined ? seed : priceInputValue(original);
    } else if (field === "Switch") {
      editorType = "switch";
      var switchFrame = document.createElement("label");
      switchFrame.className = "sheet-switch-editor";
      control = document.createElement("input");
      control.type = "checkbox";
      control.setAttribute("role", "switch");
      control.checked = /^(?:true|yes|1)$/i.test(seed !== undefined ? seed : original);
      var switchTrack = document.createElement("span");
      switchTrack.className = "sheet-switch-editor__track";
      var switchValue = document.createElement("span");
      switchValue.className = "sheet-switch-editor__value";
      switchValue.textContent = control.checked ? "Yes" : "No";
      switchFrame.appendChild(control);
      switchFrame.appendChild(switchTrack);
      switchFrame.appendChild(switchValue);
      cell.appendChild(switchFrame);
      control.addEventListener("change", function () {
        switchValue.textContent = control.checked ? "Yes" : "No";
      });
    } else if (field === "Date and time") {
      editorType = "datetime";
      control = document.createElement("input");
      control.className = "sheet-cell-editor sheet-cell-editor--datetime";
      control.type = "datetime-local";
      control.value = datetimeInputValue(original);
    } else {
      control = document.createElement("input");
      control.className = "sheet-cell-editor";
      control.type = "text";
      control.value = seed !== undefined ? seed : original;
    }

    cell.setAttribute("data-editor-type", editorType);
    control.setAttribute("aria-label", "Edit " + (column.label || "cell"));
    if (!control.parentElement) {
      cell.appendChild(control);
    }

    function finish(commit) {
      if (cell.getAttribute("data-editing") !== "true") {
        return;
      }
      var value = original;
      var errorMessage = "";
      var errorCode = "";
      if (commit && field === "Switch") {
        value = control.checked ? "Yes" : "No";
      } else if (commit && field === "Price") {
        var priceValue = control.value.trim();
        if (priceValue && !Number.isFinite(Number(priceValue.replace(/,/g, "")))) {
          value = priceValue;
          errorCode = "#VALUE!";
          errorMessage = column.label + " expects a number value. '" + priceValue + "' is text and cannot be converted to a number.";
        } else {
          value = formatPriceValue(priceValue);
        }
      } else if (commit && field === "Number") {
        var numberValue = control.value.trim();
        if (numberValue && (!control.validity.valid || !Number.isFinite(Number(numberValue)))) {
          value = numberValue;
          errorCode = "#VALUE!";
          errorMessage = column.label + " expects a number value. '" + numberValue + "' cannot be converted to a number.";
        } else {
          value = column.format === "Currency" ? formatPriceValue(numberValue) : numberValue;
        }
      } else if (commit && field === "Date and time") {
        value = formatDatetimeValue(control.value);
      } else if (commit && field === "Relation") {
        value = control.value;
      } else if (commit) {
        value = control.value;
      }
      cell.setAttribute("data-value", value);
      cell.removeAttribute("data-editing");
      cell.removeAttribute("data-editor-type");
      if (outsideEditorHandler) {
        document.removeEventListener("pointerdown", outsideEditorHandler);
      }
      renderCellValue(cell, value, columnKey);
      if (!commit && originalError) {
        setCellError(cell, originalError, originalErrorCode);
      } else if (errorMessage) {
        setCellError(cell, errorMessage, errorCode);
      } else if (commit && field === "Email" && ((!value && sheetRowHasData(cell)) || (value && value.indexOf("@") === -1))) {
        setCellError(cell, value ? "Email expects a valid email address. '" + value + "' is not valid." : "Email is required before this row can be saved.", "#ERROR!");
      }
      updateSheetRowValidation(cell.closest("[data-sheet-row]"));
      if (commit) {
        recordCellChange(originalSnapshot, snapshotCell(cell));
      }
      selectCell(cell);
      var activeGrid = query("[data-grid]");
      if (activeGrid) {
        activeGrid.focus({ preventScroll: true });
      }
    }

    control.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Tab") {
        finish(true);
      }
    });
    selectOptionButtons.forEach(function (option) {
      option.addEventListener("click", function () {
        control.value = option.value;
        control.textContent = option.value;
        finish(true);
      });
    });
    if (editorType === "select" || editorType === "relation") {
      control.addEventListener("change", function () {
        finish(true);
      });
    }
    outsideEditorHandler = function (event) {
      if (!cell.contains(event.target)) {
        finish(true);
      }
    };
    window.setTimeout(function () {
      if (cell.getAttribute("data-editing") === "true") {
        document.addEventListener("pointerdown", outsideEditorHandler);
      }
    }, 0);
    control.focus();
    if (typeof control.select === "function" && editorType !== "datetime") {
      control.select();
    }
    if ((editorType === "select" || editorType === "relation") && typeof control.showPicker === "function") {
      try {
        control.showPicker();
      } catch (error) {
        // Browsers that restrict scripted native pickers still retain the focused select editor.
      }
    }
  }

  function initGrid() {
    var grid = query("[data-grid]");
    var cells = queryAll("[data-cell]");
    var columnCount = grid ? Number(grid.getAttribute("aria-colcount")) - 1 : sheetColumnCount;
    if (!grid || !cells.length) {
      return;
    }

    cells.forEach(function (cell, index) {
      cell.id = "grid-cell-" + (index + 1);
      cell.addEventListener("click", function (event) {
        selectCell(cell, event.shiftKey);
        grid.focus({ preventScroll: true });
      });
      cell.addEventListener("dblclick", function () {
        editCell(cell);
      });
    });

    queryAll("[data-sheet-row-header]").forEach(function (rowHeader) {
      rowHeader.addEventListener("click", function () {
        selectRow(rowHeader);
        var row = rowHeader.closest("[data-sheet-row]");
        queryAll("[data-invalid='true'][data-error-open]", row).forEach(function (invalidCell) {
          invalidCell.removeAttribute("data-error-open");
        });
      });
    });

    queryAll("[data-sheet-row-header][data-record-id]").forEach(function (rowHeader) {
      rowHeader.addEventListener("dblclick", function () {
        openContextPanel("row", rowHeader.getAttribute("data-record-id"));
      });
    });

    grid.addEventListener("copy", function (event) {
      var active = query("[data-cell][aria-selected='true']") || query("[data-cell]");
      sheetClipboard = active.getAttribute("data-value") || "";
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", sheetClipboard);
      }
      event.preventDefault();
      showToast("Cell copied", sheetClipboard || "Blank cell copied.");
    });

    grid.addEventListener("keydown", function (event) {
      if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") {
        return;
      }
      var navigationCells = queryAll("[data-cell]");
      var active = query("[data-cell][aria-selected='true']") || navigationCells[0];
      var key = event.key.toLowerCase();
      var commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && key === "c") {
        event.preventDefault();
        copySelectedCell(active);
        return;
      }
      if (commandKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoCellChange();
        } else {
          undoCellChange();
        }
        return;
      }
      if (event.ctrlKey && key === "y") {
        event.preventDefault();
        redoCellChange();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        clearSelectedCell(active);
        return;
      }
      var index = navigationCells.indexOf(active);
      var next = index;
      if (event.key === "ArrowRight") {
        next = Math.min(navigationCells.length - 1, index + 1);
      } else if (event.key === "ArrowLeft") {
        next = Math.max(0, index - 1);
      } else if (event.key === "ArrowDown") {
        next = Math.min(navigationCells.length - 1, index + columnCount);
      } else if (event.key === "ArrowUp") {
        next = Math.max(0, index - columnCount);
      } else if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        editCell(active);
        return;
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        editCell(active, event.key);
        return;
      } else {
        return;
      }
      event.preventDefault();
      selectCell(navigationCells[next], event.shiftKey);
      navigationCells[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    selectCell(cells[0]);
  }

  function openContextPanel(mode, value) {
    var panel = query("[data-context-panel]");
    if (!panel) {
      return;
    }
    var columnForm = query("[data-column-form]", panel);
    var tableForm = query("[data-table-settings-form]", panel);
    var rowDetail = query("[data-row-detail]", panel);
    var actions = query("[data-column-panel-actions]", panel);
    var tableActions = query("[data-table-panel-actions]", panel);
    var title = query("[data-context-title]", panel);

    if (mode === "row") {
      columnForm.hidden = true;
      tableForm.hidden = true;
      rowDetail.hidden = false;
      actions.hidden = true;
      tableActions.hidden = true;
      title.textContent = "Order " + value;
      query("[data-row-detail-id]", rowDetail).textContent = "Order " + value;
    } else if (mode === "table") {
      var params = new URLSearchParams(window.location.search);
      var tableKey = params.get("table") || "customer-orders";
      var tableTitle = query("[data-table-title]");
      var isUntitledFile = isUntitledFileRoute(params);
      var displayName = tableTitle ? tableTitle.textContent.trim() : "Customer orders";
      var automaticPostgresName = postgresTableName(isUntitledFile ? displayName : tableKey, isUntitledFile ? "untitled_file" : "customer_orders");
      var tableNameInput = query("[data-table-settings-name]", panel);
      var postgresNameInput = query("[data-table-settings-postgres-name]", panel);
      columnForm.hidden = true;
      tableForm.hidden = false;
      rowDetail.hidden = true;
      actions.hidden = true;
      tableActions.hidden = false;
      title.textContent = "Table settings";
      tableNameInput.value = displayName;
      query("[data-table-settings-folder]", panel).value = currentDepartment(params).label;
      postgresNameInput.value = currentPostgresTableName || automaticPostgresName;
      postgresNameInput.setAttribute("data-postgres-name-derived", String(isUntitledFile && !currentPostgresTableName));
      if (isUntitledFile && !tableNameInput.hasAttribute("data-postgres-name-sync")) {
        tableNameInput.setAttribute("data-postgres-name-sync", "true");
        tableNameInput.addEventListener("input", function () {
          if (postgresNameInput.getAttribute("data-postgres-name-derived") === "true") {
            postgresNameInput.value = postgresTableName(tableNameInput.value, "untitled_file");
          }
        });
        postgresNameInput.addEventListener("input", function () {
          var derivedName = postgresTableName(tableNameInput.value, "untitled_file");
          postgresNameInput.setAttribute("data-postgres-name-derived", String(postgresTableName(postgresNameInput.value, derivedName) === derivedName));
        });
      }
    } else {
      var config = findSheetColumn(value) || namedSheetColumns[2];
      columnForm.hidden = false;
      tableForm.hidden = true;
      rowDetail.hidden = true;
      actions.hidden = false;
      tableActions.hidden = true;
      title.textContent = "Configure " + config.label;
      panel.setAttribute("data-active-column", config.key);
      query("[data-column-panel-name]", panel).value = config.label;
      query("[data-column-panel-field]", panel).value = config.field;
      query("[data-column-panel-format]", panel).value = config.field === "Relation" ? "Related record" : config.format;
      query("[data-column-storage]", panel).value = config.storage;
      query("[data-column-postgres-name]", panel).value = config.postgresName || postgresColumnName(config.key, "column");
      setRelationFilePickerValue(panel, config.relationTarget || "finance/invoices");
      query("[data-column-relation-field-template]", panel).value = config.relationFieldTemplate || "{first_name} {last_name}";
      query("[data-column-related-record-template]", panel).value = config.relatedRecordTemplate || "{first_name} {last_name}";
      query("[data-column-required]", panel).checked = config.required;
      syncColumnRelationControls(panel);
    }
    panel.setAttribute("data-open", "true");
    panel.setAttribute("aria-hidden", "false");
    panel.removeAttribute("inert");
    query("[data-close-context]", panel).focus();
  }

  function closeContextPanel() {
    var panel = query("[data-context-panel]");
    if (panel) {
      panel.setAttribute("data-open", "false");
      panel.setAttribute("aria-hidden", "true");
      panel.setAttribute("inert", "");
    }
  }

  function syncColumnRelationControls(panel) {
    if (!panel) {
      return;
    }
    var field = query("[data-column-panel-field]", panel);
    var format = query("[data-column-panel-format]", panel);
    var relationSettings = query("[data-relation-field-settings]", panel);
    var relatedRecordSettings = query("[data-related-record-format-settings]", panel);
    if (relationSettings && field) {
      relationSettings.hidden = field.value !== "Relation";
    }
    if (relatedRecordSettings && format) {
      relatedRecordSettings.hidden = !field || field.value !== "Relation" || format.value !== "Related record";
    }
  }

  function bindColumnHeader(header) {
    if (!header || header.getAttribute("data-column-header-bound") === "true") {
      return;
    }
    header.setAttribute("data-column-header-bound", "true");
    header.addEventListener("dblclick", function () {
      openContextPanel("column", header.getAttribute("data-column-header"));
    });
  }

  function renderNamedHeader(header, config, index) {
    var letter = header.getAttribute("data-column-letter");
    namedSheetColumns[index] = config;
    header.innerHTML = "";
    header.classList.remove("data-grid__cell--empty-header");
    header.removeAttribute("data-empty-header");
    header.setAttribute("data-column-header", config.key);
    header.setAttribute("data-column-key", config.key);
    header.setAttribute("aria-label", config.label);
    var headerMain = document.createElement("span");
    headerMain.className = "header-main";
    var headerTitle = document.createElement("span");
    headerTitle.className = "header-title";
    headerTitle.setAttribute("data-column-label", "");
    headerTitle.textContent = config.label;
    headerMain.appendChild(headerTitle);
    header.appendChild(headerMain);
    queryAll("[data-cell][data-column='" + letter + "']").forEach(function (cell) {
      cell.setAttribute("data-column-key", config.key);
      cell.setAttribute("data-named-column", "true");
    });
    updateSheetSummary();
    bindColumnHeader(header);
    validateColumnLayout();
    if (window.WireframeIcons) {
      window.WireframeIcons.render(header);
    }
  }

  function initColumnAndRowPanels() {
    var menu = query("[data-context-menu]");
    var columnPanel = query("[data-context-panel]");
    var fieldControl = query("[data-column-panel-field]");
    var formatControl = query("[data-column-panel-format]");
    var relationFileSearch = query("[data-relation-file-search]");
    var relationFileOptions = query("[data-relation-file-options]");
    queryAll("[data-column-header]").forEach(bindColumnHeader);

    if (fieldControl) {
      fieldControl.addEventListener("change", function () {
        if (fieldControl.value === "Relation") {
          query("[data-column-storage]", columnPanel).value = "foreign key";
          if (formatControl) {
            formatControl.value = "Related record";
          }
        }
        syncColumnRelationControls(columnPanel);
      });
    }
    if (formatControl) {
      formatControl.addEventListener("change", function () {
        if (fieldControl && fieldControl.value === "Relation") {
          formatControl.value = "Related record";
        }
        syncColumnRelationControls(columnPanel);
      });
    }
    if (relationFileSearch) {
      relationFileSearch.addEventListener("focus", function () {
        openRelationFilePicker(columnPanel, "");
        relationFileSearch.select();
      });
      relationFileSearch.addEventListener("input", function () {
        openRelationFilePicker(columnPanel, relationFileSearch.value);
      });
      relationFileSearch.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          setRelationFilePickerValue(columnPanel, query("[data-column-relation-target]", columnPanel).value);
          closeRelationFilePicker(columnPanel);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          openRelationFilePicker(columnPanel, relationFileSearch.value);
        } else if (event.key === "Enter") {
          var firstMatch = queryAll("[data-relation-file-option]", columnPanel).find(function (option) {
            return !option.hidden;
          });
          if (firstMatch) {
            event.preventDefault();
            setRelationFilePickerValue(columnPanel, firstMatch.getAttribute("data-relation-file-value"));
            closeRelationFilePicker(columnPanel);
          }
        }
      });
      relationFileSearch.addEventListener("blur", function () {
        window.setTimeout(function () {
          closeRelationFilePicker(columnPanel);
          setRelationFilePickerValue(columnPanel, query("[data-column-relation-target]", columnPanel).value);
        }, 120);
      });
    }
    if (relationFileOptions) {
      relationFileOptions.addEventListener("click", function (event) {
        var option = event.target.closest("[data-relation-file-option]");
        if (!option) {
          return;
        }
        setRelationFilePickerValue(columnPanel, option.getAttribute("data-relation-file-value"));
        closeRelationFilePicker(columnPanel);
      });
    }

    queryAll("[data-open-column-panel]").forEach(function (button) {
      button.addEventListener("click", function () {
        var requestedColumn = button.getAttribute("data-open-column-panel") || (menu && menu.getAttribute("data-column")) || "email";
        if (menu) {
          menu.hidden = true;
        }
        openContextPanel("column", requestedColumn);
      });
    });

    queryAll("[data-open-row]").forEach(function (button) {
      button.addEventListener("click", function () {
        openContextPanel("row", button.getAttribute("data-open-row"));
      });
    });

    queryAll("[data-close-context]").forEach(function (button) {
      button.addEventListener("click", closeContextPanel);
    });

    var saveColumn = query("[data-save-column]");
    if (saveColumn) {
      saveColumn.addEventListener("click", function () {
        var panel = query("[data-context-panel]");
        var activeColumn = panel.getAttribute("data-active-column") || "email";
        var config = findSheetColumn(activeColumn) || namedSheetColumns[2];
        var name = query("[data-column-panel-name]").value.trim() || "Email";
        config.label = name;
        config.field = query("[data-column-panel-field]").value;
        config.format = query("[data-column-panel-format]").value;
        config.storage = query("[data-column-storage]").value;
        config.postgresName = postgresColumnName(query("[data-column-postgres-name]").value, config.postgresName || "column");
        query("[data-column-postgres-name]").value = config.postgresName;
        config.relationTarget = query("[data-column-relation-target]").value;
        config.relationFieldTemplate = query("[data-column-relation-field-template]").value.trim() || "{name}";
        config.relatedRecordTemplate = query("[data-column-related-record-template]").value.trim() || "{name}";
        config.required = query("[data-column-required]").checked;
        var headerLabel = query("[data-column-header='" + activeColumn + "'] [data-column-label]");
        if (headerLabel) {
          headerLabel.textContent = name;
        }
        queryAll("[data-cell][data-column-key='" + activeColumn + "']").forEach(function (cell) {
          renderCellValue(cell, cell.getAttribute("data-value") || "", activeColumn);
        });
        updateAllSheetRowValidation();
        closeContextPanel();
        showToast("Column updated", name + " uses the selected field and format. PostgreSQL column: " + config.postgresName + ".");
      });
    }

    var saveTable = query("[data-save-table]");
    if (saveTable) {
      saveTable.addEventListener("click", function () {
        var params = new URLSearchParams(window.location.search);
        var tableKey = params.get("table") || "customer-orders";
        var isUntitledFile = isUntitledFileRoute(params);
        var name = query("[data-table-settings-name]").value.trim() || (isUntitledFile ? "Untitled File" : "Untitled spreadsheet");
        var automaticPostgresName = postgresTableName(isUntitledFile ? name : tableKey, isUntitledFile ? "untitled_file" : "customer_orders");
        var postgresName = postgresTableName(query("[data-table-settings-postgres-name]").value, automaticPostgresName);
        var tableTitle = query("[data-table-title]");
        var titleInput = query("[data-table-title-input]");
        var grid = query("[data-grid]");
        if (tableTitle) {
          tableTitle.textContent = name;
          tableTitle.setAttribute("aria-label", "Rename " + name);
        }
        if (titleInput) titleInput.value = name;
        if (grid) grid.setAttribute("aria-label", name + " spreadsheet");
        currentPostgresTableName = isUntitledFile && postgresName === automaticPostgresName ? "" : postgresName;
        document.title = name + " · Acme Inc.";
        closeContextPanel();
        showToast("Table settings applied", name + " remains connected to PostgreSQL table " + (currentPostgresTableName || automaticPostgresName) + ".");
      });
    }

    document.addEventListener("click", function (event) {
      if (menu && !menu.hidden && !menu.contains(event.target)) {
        menu.hidden = true;
      }
    });
  }

  function initEmptyHeaderNaming() {
    var emptyHeaders = queryAll("[data-empty-header]");
    if (!emptyHeaders.length) {
      return;
    }

    function restoreEmptyHeader(header) {
      header.innerHTML = "";
      var headerMain = document.createElement("span");
      headerMain.className = "header-main";
      var headerTitle = document.createElement("span");
      headerTitle.className = "header-title";
      headerTitle.setAttribute("data-column-label", "");
      headerMain.appendChild(headerTitle);
      header.appendChild(headerMain);
    }

    function beginNaming(header) {
      if (!header.hasAttribute("data-empty-header") || header.getAttribute("data-editing") === "true") {
        return;
      }
      var letter = header.getAttribute("data-column-letter");
      var index = letter.charCodeAt(0) - 65;
      var outsideHeaderHandler = null;
      clearColumnError(index);
      header.setAttribute("data-editing", "true");
      header.innerHTML = "";
      var input = document.createElement("input");
      input.className = "sheet-header-name-editor";
      input.type = "text";
      input.setAttribute("aria-label", "Name column " + letter);
      header.appendChild(input);

      function finish(commit) {
        if (header.getAttribute("data-editing") !== "true") {
          return;
        }
        var name = input.value.trim();
        header.removeAttribute("data-editing");
        if (outsideHeaderHandler) {
          document.removeEventListener("pointerdown", outsideHeaderHandler);
        }
        if (commit && name) {
          renderNamedHeader(header, {
            key: "column-" + letter.toLowerCase(),
            label: name,
            field: "Text",
            format: "Plain text",
            storage: "text",
            required: false
          }, index);
          showToast("Column named", name + " was added as a Text column.");
        } else {
          restoreEmptyHeader(header);
          validateColumnLayout(index);
        }
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Tab") {
          finish(true);
        }
      });
      outsideHeaderHandler = function (event) {
        if (!header.contains(event.target)) {
          finish(true);
        }
      };
      window.setTimeout(function () {
        if (header.getAttribute("data-editing") === "true") {
          document.addEventListener("pointerdown", outsideHeaderHandler);
        }
      }, 0);
      input.focus();
      input.select();
    }

    emptyHeaders.forEach(function (emptyHeader) {
      emptyHeader.addEventListener("dblclick", function () {
        beginNaming(emptyHeader);
      });
      emptyHeader.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          beginNaming(emptyHeader);
        }
      });
    });
  }

  function initSheetRowAdder() {
    var input = query("[data-add-row-count]");
    var button = query("[data-add-rows]");
    var grid = query("[data-grid]");
    if (!input || !button || !grid) {
      return;
    }
    button.addEventListener("click", function () {
      var amount = Math.floor(Number(input.value));
      if (!Number.isFinite(amount) || amount < 1) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        showToast("Rows not added", "Enter a positive number of rows.");
        return;
      }
      input.removeAttribute("aria-invalid");
      sheetCapacity += amount;
      grid.setAttribute("aria-rowcount", String(sheetCapacity + 2));
      grid.setAttribute("data-sheet-capacity", String(sheetCapacity));
      query("[data-row-capacity]").textContent = sheetCapacity.toLocaleString() + " rows";
      updateSheetSummary();
      showToast("Rows added", amount.toLocaleString() + " blank rows were added to the bottom of the sheet.");
    });
  }

  function initImportWizard() {
    var wizard = query("[data-import-wizard]");
    if (!wizard) {
      return;
    }
    var step = 1;

    function updateStep(nextStep) {
      step = Math.max(1, Math.min(3, nextStep));
      wizard.setAttribute("data-step", String(step));
      queryAll("[data-import-screen]", wizard).forEach(function (screen) {
        screen.hidden = Number(screen.getAttribute("data-import-screen")) !== step;
      });
      queryAll("[data-step-indicator]", wizard).forEach(function (indicator) {
        var number = Number(indicator.getAttribute("data-step-indicator"));
        indicator.setAttribute("data-active", number === step ? "true" : "false");
        indicator.setAttribute("data-complete", number < step ? "true" : "false");
      });
    }

    queryAll("[data-import-source]", wizard).forEach(function (button) {
      button.addEventListener("click", function () {
        queryAll("[data-import-source]", wizard).forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
        var source = button.getAttribute("data-import-source");
        var summary = query("[data-source-summary]", wizard);
        var strong = query("strong", summary);
        var meta = query(".app-meta", summary);
        if (source === "xlsx") {
          strong.textContent = "Q3-orders.xlsx";
          meta.textContent = "248 rows · 6 columns · 51 KB";
        } else if (source === "google") {
          strong.textContent = "Q3 Orders";
          meta.textContent = "Google Sheets · 248 rows · latest values";
        } else {
          strong.textContent = "Q3-orders.csv";
          meta.textContent = "248 rows · 6 columns · 38 KB";
        }
      });
    });

    queryAll("[data-import-next]", wizard).forEach(function (button) {
      button.addEventListener("click", function () {
        updateStep(step + 1);
      });
    });
    queryAll("[data-import-back]", wizard).forEach(function (button) {
      button.addEventListener("click", function () {
        updateStep(step - 1);
      });
    });

    var run = query("[data-import-run]", wizard);
    if (run) {
      run.addEventListener("click", function () {
        var ready = query("[data-import-ready]", wizard);
        var progress = query("[data-import-progress]", wizard);
        var success = query("[data-import-success]", wizard);
        var actions = query("[data-import-final-actions]", wizard);
        ready.hidden = true;
        actions.hidden = true;
        progress.hidden = false;
        window.setTimeout(function () {
          progress.hidden = true;
          success.hidden = false;
        }, 900);
      });
    }

    updateStep(1);
  }

  function closeSheetMenus(returnFocus) {
    closeSheetSubmenus(false);
    queryAll("[data-sheet-menu-trigger]").forEach(function (trigger) {
      var wasOpen = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", "false");
      var panel = query("[data-sheet-menu='" + trigger.getAttribute("data-sheet-menu-trigger") + "']");
      if (panel) {
        panel.hidden = true;
      }
      if (returnFocus && wasOpen) {
        trigger.focus();
      }
    });
  }

  function closeSheetSubmenus(returnFocus) {
    queryAll("[data-sheet-submenu-trigger]").forEach(function (trigger) {
      var wasOpen = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", "false");
      var panel = query("[data-sheet-submenu='" + trigger.getAttribute("data-sheet-submenu-trigger") + "']");
      if (panel) {
        panel.hidden = true;
      }
      if (returnFocus && wasOpen) {
        trigger.focus({ preventScroll: true });
      }
    });
  }

  function openSheetSubmenu(trigger, focusFirst) {
    if (!trigger) {
      return;
    }
    var name = trigger.getAttribute("data-sheet-submenu-trigger");
    var panel = query("[data-sheet-submenu='" + name + "']");
    if (!panel) {
      return;
    }
    var alreadyOpen = trigger.getAttribute("aria-expanded") === "true";
    closeSheetSubmenus(false);
    if (alreadyOpen && !focusFirst) {
      return;
    }
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    if (focusFirst) {
      var first = query("[role^='menuitem']:not([aria-disabled='true'])", panel);
      if (first) {
        first.focus({ preventScroll: true });
      }
    }
  }

  function openSheetMenu(trigger, focusFirst) {
    if (!trigger) {
      return;
    }
    var name = trigger.getAttribute("data-sheet-menu-trigger");
    var panel = query("[data-sheet-menu='" + name + "']");
    var alreadyOpen = trigger.getAttribute("aria-expanded") === "true";
    closeSheetMenus(false);
    if (alreadyOpen && !focusFirst) {
      return;
    }
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    if (focusFirst) {
      var first = query("[role^='menuitem']:not([aria-disabled='true'])", panel);
      if (first) {
        first.focus();
      }
    }
  }

  function initSheetMenubar() {
    var menubar = query("[data-sheet-menubar]");
    if (!menubar) {
      return;
    }
    var triggers = queryAll("[data-sheet-menu-trigger]", menubar);
    triggers.forEach(function (trigger, index) {
      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        openSheetMenu(trigger, false);
      });
      trigger.addEventListener("keydown", function (event) {
        var nextIndex = index;
        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % triggers.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + triggers.length) % triggers.length;
        } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSheetMenu(trigger, true);
          return;
        } else {
          return;
        }
        event.preventDefault();
        triggers[nextIndex].focus();
        if (trigger.getAttribute("aria-expanded") === "true") {
          openSheetMenu(triggers[nextIndex], false);
        }
      });
    });

    queryAll("[data-sheet-submenu-trigger]", menubar).forEach(function (trigger) {
      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        openSheetSubmenu(trigger, false);
      });
      trigger.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSheetSubmenu(trigger, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeSheetSubmenus(true);
        }
      });
    });

    queryAll("[data-sheet-menu], [data-sheet-submenu]", menubar).forEach(function (panel) {
      panel.addEventListener("keydown", function (event) {
        var items = queryAll("[role^='menuitem']:not([aria-disabled='true'])", panel).filter(function (item) {
          return !item.closest("[hidden]");
        });
        var index = items.indexOf(document.activeElement);
        if (event.key === "ArrowRight" && document.activeElement && document.activeElement.matches("[data-sheet-submenu-trigger]")) {
          event.preventDefault();
          openSheetSubmenu(document.activeElement, true);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          items[(index + 1 + items.length) % items.length].focus();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          items[(index - 1 + items.length) % items.length].focus();
        } else if (event.key === "Home") {
          event.preventDefault();
          items[0].focus();
        } else if (event.key === "End") {
          event.preventDefault();
          items[items.length - 1].focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          if (panel.matches("[data-sheet-submenu]")) {
            closeSheetSubmenus(true);
          } else {
            closeSheetMenus(true);
          }
        }
      });
    });

    document.addEventListener("pointerdown", function (event) {
      if (!event.target.closest("[data-sheet-menubar]")) {
        closeSheetMenus(false);
      }
    });
  }

  function refreshFormattingToolbar() {
    var cells = selectedCells();
    var first = cells[0];
    var states = first ? formatSnapshot(first) : formatSnapshot(query("[data-cell]"));
    ["bold", "italic", "underline", "wrap"].forEach(function (command) {
      var key = command;
      var value = states && states[key] === "true";
      queryAll("[data-format-command='" + command + "']").forEach(function (button) {
        button.setAttribute("aria-pressed", String(value));
        if (button.getAttribute("role") === "menuitemcheckbox") {
          button.setAttribute("aria-checked", String(value));
        }
      });
    });
    queryAll("[data-format-select='font']").forEach(function (select) {
      select.value = states ? states.font : "sans";
    });
    queryAll("[data-format-select='size']").forEach(function (select) {
      select.value = states ? states.size : "12";
    });
    queryAll("[data-format-size-input]").forEach(function (input) {
      input.value = states ? states.size : "12";
    });
    queryAll("[data-sheet-command^='font-size-']").forEach(function (button) {
      var size = button.getAttribute("data-sheet-command").replace("font-size-", "");
      var selected = (states ? states.size : "12") === size;
      button.setAttribute("aria-checked", String(selected));
      var marker = query("[data-menu-check]", button);
      if (marker) marker.textContent = selected ? "✓" : "";
    });
    queryAll("[data-format-command^='number-']").forEach(function (button) {
      var format = button.getAttribute("data-format-command").replace("number-", "");
      var selected = (states ? states.display : "automatic") === format;
      button.setAttribute("aria-checked", String(selected));
      var marker = query("[data-menu-check]", button);
      if (marker) marker.textContent = selected ? "✓" : "";
    });
    refreshHistoryControls();
  }

  function formatPopoverDefinition(type) {
    var definitions = {
      "text-color": {
        title: "Text color",
        property: "color",
        kind: "palette",
        reset: "Reset",
        options: paletteChoices()
      },
      "fill-color": {
        title: "Fill color",
        property: "fill",
        kind: "palette",
        reset: "Reset",
        options: paletteChoices(),
        conditional: true
      },
      borders: {
        title: "Borders",
        property: "borders",
        kind: "border-grid",
        options: [
          ["all", "All borders", "border-all"], ["inner", "Inner borders", "border-inner"], ["horizontal", "Horizontal borders", "border-horizontal"], ["vertical", "Vertical borders", "border-vertical"], ["outer", "Outer borders", "border-outer"],
          ["left", "Left border", "border-left"], ["top", "Top border", "border-top"], ["right", "Right border", "border-right"], ["bottom", "Bottom border", "border-bottom"], ["false", "No borders", "border-none"]
        ]
      },
      horizontal: {
        title: "Horizontal alignment",
        property: "align",
        kind: "alignment",
        options: [
          ["left", "Left", "align-left"], ["center", "Center", "align-center"], ["right", "Right", "align-right"]
        ]
      },
      vertical: {
        title: "Vertical alignment",
        property: "vertical",
        kind: "alignment",
        options: [
          ["top", "Top", "vertical-top"], ["middle", "Middle", "vertical-middle"], ["bottom", "Bottom", "vertical-bottom"]
        ]
      }
    };
    return definitions[type];
  }

  function closeFormatPopover(returnFocus) {
    var popover = query("[data-format-popover]");
    if (!popover) {
      return;
    }
    popover.hidden = true;
    queryAll("[data-format-popover-trigger]").forEach(function (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    });
    if (returnFocus && activeFormatPopoverTrigger && !activeFormatPopoverTrigger.hidden) {
      activeFormatPopoverTrigger.focus({ preventScroll: true });
    }
    activeFormatPopoverTrigger = null;
  }

  function openFormatPopover(trigger) {
    var popover = query("[data-format-popover]");
    var type = trigger && trigger.getAttribute("data-format-popover-trigger");
    var definition = formatPopoverDefinition(type);
    if (!popover || !trigger || !definition) {
      return;
    }
    var wasOpen = trigger.getAttribute("aria-expanded") === "true";
    closeFormatPopover(false);
    if (wasOpen) {
      return;
    }
    activeFormatPopoverTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    popover.innerHTML = "";
    popover.className = "sheet-format-popover sheet-format-popover--" + definition.kind;
    popover.setAttribute("aria-label", definition.title);
    popover.setAttribute("data-format-popover-type", type);
    var first = selectedCells()[0] || query("[data-cell]");
    var state = first ? formatSnapshot(first) : {};
    function applyChoice(option) {
      applyFormatToSelection(definition.property, option[0], definition.title + " updated");
      closeFormatPopover(true);
      var overflow = query("[data-toolbar-overflow]");
      var overflowTrigger = query("[data-toolbar-overflow-trigger]");
      if (overflow) overflow.hidden = true;
      if (overflowTrigger) overflowTrigger.setAttribute("aria-expanded", "false");
      closeSheetMenus(false);
    }
    function choiceButton(option, className) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(state[definition.property] === option[0]));
      button.setAttribute("data-format-option", option[0]);
      button.addEventListener("click", function () {
        applyChoice(option);
      });
      return button;
    }
    if (definition.kind === "palette") {
      var reset = choiceButton(["default", definition.reset, ""], "sheet-palette__reset");
      reset.innerHTML = '<span data-wf-icon="remove-format"></span><span>' + definition.reset + '</span>';
      popover.appendChild(reset);
      var palette = document.createElement("div");
      palette.className = "sheet-palette__grid";
      definition.options.forEach(function (option) {
        var button = choiceButton(option, "sheet-palette__swatch");
        button.setAttribute("aria-label", option[1]);
        button.style.setProperty("--sheet-swatch", option[2]);
        button.innerHTML = state[definition.property] === option[0] ? '<span data-wf-icon="check"></span>' : "";
        palette.appendChild(button);
      });
      popover.appendChild(palette);
      var standard = document.createElement("div");
      standard.className = "sheet-palette__label";
      standard.textContent = "Standard";
      popover.appendChild(standard);
      var standardPalette = document.createElement("div");
      standardPalette.className = "sheet-palette__grid sheet-palette__grid--standard";
      [
        ["standard-black", "Black", "#000000"], ["standard-white", "White", "#ffffff"],
        ["standard-blue", "Blue", "#4285f4"], ["standard-red", "Red", "#ea4335"],
        ["standard-yellow", "Yellow", "#fbbc04"], ["standard-green", "Green", "#34a853"],
        ["standard-orange", "Orange", "#ff6d01"], ["standard-teal", "Teal", "#46bdc6"]
      ].forEach(function (option) {
        var button = choiceButton(option, "sheet-palette__swatch");
        button.setAttribute("aria-label", option[1]);
        button.style.setProperty("--sheet-swatch", option[2]);
        button.innerHTML = state[definition.property] === option[0] ? '<span data-wf-icon="check"></span>' : "";
        standardPalette.appendChild(button);
      });
      popover.appendChild(standardPalette);
      var custom = document.createElement("button");
      custom.type = "button";
      custom.className = "sheet-palette__custom";
      custom.innerHTML = '<span data-wf-icon="add"></span><span>Custom</span>';
      custom.addEventListener("click", function () { showToast("Custom color", "Custom palette editing is represented in this wireframe."); });
      popover.appendChild(custom);
      if (definition.conditional) {
        var conditional = document.createElement("button");
        conditional.type = "button";
        conditional.className = "sheet-palette__conditional";
        conditional.textContent = "Conditional formatting";
        conditional.addEventListener("click", function () { showToast("Conditional formatting", "Rules are a later spreadsheet review state."); });
        popover.appendChild(conditional);
      }
    } else {
      var iconGrid = definition.kind === "border-grid" || definition.kind === "alignment";
      if (!iconGrid) {
        var title = document.createElement("div");
        title.className = "sheet-format-popover__title";
        title.textContent = definition.title;
        popover.appendChild(title);
      }
      var choiceGrid = document.createElement("div");
      choiceGrid.className = "sheet-format-popover__choices";
      definition.options.forEach(function (option) {
        var button = choiceButton(option, "sheet-format-popover__option");
        button.setAttribute("aria-label", option[1]);
        button.setAttribute("title", option[1]);
        var preview = document.createElement("span");
        preview.className = "sheet-format-popover__preview";
        if (iconGrid) {
          preview.setAttribute("data-wf-icon", option[2]);
        }
        button.appendChild(preview);
        if (!iconGrid) {
          var label = document.createElement("span");
          label.textContent = option[1];
          var check = document.createElement("span");
          check.className = "sheet-format-popover__check";
          check.textContent = state[definition.property] === option[0] ? "✓" : "";
          button.appendChild(label);
          button.appendChild(check);
        }
        choiceGrid.appendChild(button);
      });
      if (definition.kind === "border-grid") {
        choiceGrid.classList.add("sheet-border-grid__choices");
        var borderLayout = document.createElement("div");
        borderLayout.className = "sheet-border-grid";
        borderLayout.appendChild(choiceGrid);
        var borderExtras = document.createElement("div");
        borderExtras.className = "sheet-border-grid__extras";
        var borderFlyout = document.createElement("div");
        borderFlyout.className = "sheet-border-grid__flyout";
        borderFlyout.hidden = true;
        function openBorderFlyout(kind, control) {
          var open = borderFlyout.getAttribute("data-border-flyout") === kind && !borderFlyout.hidden;
          borderFlyout.innerHTML = "";
          borderFlyout.hidden = open;
          borderFlyout.setAttribute("data-border-flyout", open ? "" : kind);
          queryAll("[data-border-extra]").forEach(function (button) { button.setAttribute("aria-expanded", "false"); });
          if (open) return;
          control.setAttribute("aria-expanded", "true");
          if (kind === "color") {
            borderFlyout.className = "sheet-border-grid__flyout sheet-border-grid__flyout--color";
            borderFlyout.setAttribute("role", "menu");
            borderFlyout.setAttribute("aria-label", "Border color");
            var colorGrid = document.createElement("div");
            colorGrid.className = "sheet-border-color-grid";
            [
              ["black", "Black", "#202124"], ["gray-700", "Dark gray", "#5f6368"], ["gray-300", "Light gray", "#dadce0"], ["white", "White", "#ffffff"],
              ["red", "Red", "#ea4335"], ["blue", "Blue", "#4285f4"], ["green", "Green", "#34a853"], ["yellow", "Yellow", "#fbbc04"]
            ].forEach(function (choice) {
              var swatch = document.createElement("button");
              swatch.type = "button";
              swatch.className = "sheet-border-color-grid__swatch";
              swatch.setAttribute("role", "menuitemradio");
              swatch.setAttribute("aria-label", choice[1]);
              swatch.setAttribute("aria-checked", String(state.borderColor === choice[0]));
              swatch.style.setProperty("--sheet-swatch", choice[2]);
              swatch.addEventListener("click", function () {
                applyFormatToSelection("borderColor", choice[0], "Border color updated");
                control.querySelector(".sheet-border-grid__indicator").style.background = choice[2];
                borderFlyout.hidden = true;
                control.setAttribute("aria-expanded", "false");
              });
              colorGrid.appendChild(swatch);
            });
            borderFlyout.appendChild(colorGrid);
          } else {
            borderFlyout.className = "sheet-border-grid__flyout sheet-border-grid__flyout--style";
            borderFlyout.setAttribute("role", "menu");
            borderFlyout.setAttribute("aria-label", "Border style");
            ["solid", "medium", "thick", "dashed", "dotted", "double"].forEach(function (style) {
              var option = document.createElement("button");
              option.type = "button";
              option.className = "sheet-border-style-option";
              option.setAttribute("role", "menuitemradio");
              option.setAttribute("aria-label", style.charAt(0).toUpperCase() + style.slice(1) + " border");
              option.setAttribute("aria-checked", String(state.borderStyle === style));
              option.innerHTML = '<span class="sheet-border-style-option__line" data-border-line="' + style + '"></span>';
              option.addEventListener("click", function () {
                applyFormatToSelection("borderStyle", style, "Border style updated");
                borderFlyout.hidden = true;
                control.setAttribute("aria-expanded", "false");
              });
              borderFlyout.appendChild(option);
            });
          }
        }
        [
          ["Border color", "edit", "sheet-border-grid__color", "color"],
          ["Border style", "border-style", "sheet-border-grid__style", "style"]
        ].forEach(function (extra) {
          var control = document.createElement("button");
          control.type = "button";
          control.className = "sheet-border-grid__control " + extra[2];
          control.setAttribute("aria-label", extra[0]);
          control.setAttribute("title", extra[0]);
          control.setAttribute("aria-haspopup", "menu");
          control.setAttribute("aria-expanded", "false");
          control.setAttribute("data-border-extra", extra[3]);
          control.innerHTML = '<span data-wf-icon="' + extra[1] + '"></span><span class="sheet-border-grid__indicator"></span><span data-wf-icon="chevron-down"></span>';
          control.addEventListener("click", function () {
            openBorderFlyout(extra[3], control);
          });
          borderExtras.appendChild(control);
        });
        borderLayout.appendChild(borderExtras);
        popover.appendChild(borderLayout);
        popover.appendChild(borderFlyout);
      } else {
        popover.appendChild(choiceGrid);
      }
    }
    if (window.WireframeIcons) window.WireframeIcons.render(popover);
    popover.hidden = false;
    var rect = trigger.getBoundingClientRect();
    var width = popover.offsetWidth;
    var height = Math.min(popover.scrollHeight, window.innerHeight - 16);
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    var below = rect.bottom + 6;
    var top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 6);
    popover.style.left = left + "px";
    popover.style.top = top + "px";
    var firstOption = query("button", popover);
    if (firstOption) firstOption.focus({ preventScroll: true });
  }

  function updateFormatSnapshot(snapshot, property, value) {
    var next = Object.assign({}, snapshot);
    next[property] = value;
    return next;
  }

  function applyFormatToSelection(property, value, label) {
    var cells = selectedCells();
    if (!cells.length) {
      var active = query("[data-cell][aria-selected='true']") || query("[data-cell]");
      if (active) {
        cells = [active];
      }
    }
    if (!cells.length) {
      return;
    }
    var before = cells.map(formatSnapshot);
    var after = before.map(function (snapshot) {
      return updateFormatSnapshot(snapshot, property, value);
    });
    after.forEach(applyFormatSnapshot);
    recordFormatChange(before, after);
    refreshFormattingToolbar();
    showToast(label || "Formatting updated", cells.length === 1 ? "1 cell formatted." : cells.length + " cells formatted.");
  }

  function clearSelectionFormatting() {
    var cells = selectedCells();
    if (!cells.length) {
      return;
    }
    var before = cells.map(formatSnapshot);
    var after = before.map(function (snapshot) {
      return Object.assign({}, snapshot, {
        font: "sans", size: "12", bold: "false", italic: "false", underline: "false",
        color: "default", fill: "default", borders: "false", borderColor: "black", borderStyle: "solid", align: "left",
        vertical: "middle", wrap: "false", display: "automatic"
      });
    });
    after.forEach(applyFormatSnapshot);
    recordFormatChange(before, after);
    refreshFormattingToolbar();
    showToast("Formatting cleared", cells.length === 1 ? "1 cell reset." : cells.length + " cells reset.");
  }

  function runFormatCommand(command) {
    var first = selectedCells()[0] || query("[data-cell]");
    var state = first ? formatSnapshot(first) : null;
    if (!state) {
      return;
    }
    if (command === "bold" || command === "italic" || command === "underline" || command === "wrap") {
      applyFormatToSelection(command, state[command] === "true" ? "false" : "true", "Formatting updated");
    } else if (command === "text-dark") {
      applyFormatToSelection("color", state.color === "dark" ? "default" : "dark", "Text color updated");
    } else if (command === "fill-light") {
      applyFormatToSelection("fill", state.fill === "light" ? "default" : "light", "Fill color updated");
    } else if (command === "borders") {
      applyFormatToSelection("borders", state.borders === "true" ? "false" : "true", "Borders updated");
    } else if (command === "align-cycle") {
      var alignments = ["left", "center", "right"];
      applyFormatToSelection("align", alignments[(alignments.indexOf(state.align) + 1) % alignments.length], "Alignment updated");
    } else if (command === "vertical-cycle") {
      var verticals = ["middle", "top", "bottom"];
      applyFormatToSelection("vertical", verticals[(verticals.indexOf(state.vertical) + 1) % verticals.length], "Vertical alignment updated");
    } else if (/^number-/.test(command)) {
      applyFormatToSelection("display", command.replace("number-", ""), "Number format updated");
    } else if (command === "currency") {
      applyFormatToSelection("display", "currency", "Number format updated");
    } else if (command === "clear-format") {
      clearSelectionFormatting();
    }
  }

  function activeCell() {
    if (activeSelectionTarget && activeSelectionTarget.type === "cell") {
      return activeSelectionTarget.element;
    }
    return selectedCells()[0] || query("[data-cell]");
  }

  function pasteIntoCell(cell) {
    if (!cell) {
      return;
    }
    var before = snapshotCell(cell);
    clearCellError(cell);
    cell.setAttribute("data-value", sheetClipboard);
    renderCellValue(cell, sheetClipboard, cell.getAttribute("data-column-key"));
    updateSheetRowValidation(cell.closest("[data-sheet-row]"));
    recordCellChange(before, snapshotCell(cell));
    if (sheetCutPending) {
      sheetCutPending = false;
    }
    selectCell(cell);
    showToast("Value pasted", sheetClipboard || "Blank value pasted.");
  }

  function clearCells(cells) {
    (cells || []).forEach(clearSelectedCell);
  }

  function sortVisibleRows(columnIndex, descending) {
    var grid = query("[data-grid]");
    var rows = queryAll("[data-sheet-row]");
    rows.sort(function (left, right) {
      var leftCell = queryAll("[data-cell]", left)[columnIndex];
      var rightCell = queryAll("[data-cell]", right)[columnIndex];
      var leftValue = (leftCell && leftCell.getAttribute("data-value") || "").toLowerCase();
      var rightValue = (rightCell && rightCell.getAttribute("data-value") || "").toLowerCase();
      if (!leftValue && rightValue) return 1;
      if (leftValue && !rightValue) return -1;
      return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * (descending ? -1 : 1);
    });
    rows.forEach(function (row) {
      grid.appendChild(row);
    });
    renumberSheetRows();
    showToast("Column sorted", descending ? "Values sorted descending." : "Values sorted ascending.");
  }

  function openSheetConfirmation(type) {
    var dialog = query("[data-sheet-confirm]");
    if (!dialog) {
      return;
    }
    var isColumn = type === "column";
    query("[data-sheet-confirm-title]", dialog).textContent = isColumn ? "Delete column?" : "Delete row?";
    query("[data-sheet-confirm-copy]", dialog).textContent = isColumn
      ? "Deleting a named column changes the connected PostgreSQL table and cannot be undone here."
      : "Deleting this row removes its record from the connected PostgreSQL table.";
    var accept = query("[data-sheet-confirm-accept]", dialog);
    accept.textContent = isColumn ? "Delete column" : "Delete row";
    dialog.onclose = function () {
      if (dialog.returnValue === "confirm") {
        showToast(isColumn ? "Column deletion reviewed" : "Row deletion reviewed", "This destructive wireframe action stops before changing PostgreSQL.");
      }
    };
    dialog.showModal();
  }

  function setMenuRadioState(prefix, value) {
    queryAll("[data-sheet-command^='" + prefix + "']").forEach(function (button) {
      var selected = button.getAttribute("data-sheet-command") === prefix + value;
      button.setAttribute("aria-checked", String(selected));
      var marker = query("[data-menu-check]", button);
      if (marker) marker.textContent = selected ? "✓" : "";
    });
  }

  function setFrozenAxis(axis, value) {
    var normalized = value === "current" ? (axis === "rows" ? "4" : "7") : value;
    spreadsheetView[axis === "rows" ? "freezeRows" : "freezeColumns"] = normalized;
    var grid = query("[data-grid]");
    if (grid) grid.setAttribute("data-freeze-" + axis, normalized);
    setMenuRadioState("freeze-" + axis + "-", value);
    showToast(normalized === "0" ? "Freeze cleared" : "Freeze updated", normalized === "0" ? "The sheet is no longer frozen." : normalized + " " + (axis === "rows" ? "row" : "column") + (normalized === "1" ? " is" : "s are") + " frozen in this view.");
  }

  function setSheetZoom(value) {
    spreadsheetView.zoom = value;
    var grid = query("[data-grid]");
    if (grid) grid.setAttribute("data-zoom", value);
    setMenuRadioState("zoom-", value);
    showToast("Zoom " + value + "%", "This view change applies only to you.");
  }

  function applyFontSize(value) {
    var next = Math.max(8, Math.min(72, Number(value) || 12));
    applyFormatToSelection("size", String(next), "Font size updated");
  }

  function runSheetCommand(command) {
    var cell = activeCell();
    var target = activeContextTarget || activeSelectionTarget;
    if (command === "undo") {
      undoCellChange();
    } else if (command === "redo") {
      redoCellChange();
    } else if (command === "copy" || command === "cut") {
      copySelectedCell(cell);
      sheetCutPending = command === "cut";
      if (sheetCutPending) showToast("Ready to move", "Paste the copied value into another cell.");
    } else if (command === "paste" || command === "paste-values") {
      pasteIntoCell(cell);
    } else if (command === "clear") {
      clearCells(selectedCells());
    } else if (command === "select-all") {
      clearGridSelection();
      queryAll("[data-cell]").forEach(function (item) {
        item.setAttribute("aria-selected", "true");
        item.setAttribute("data-range-selected", "true");
      });
      activeSelectionTarget = { type: "cell", element: query("[data-cell]") };
      refreshFormattingToolbar();
    } else if (command === "find") {
      showToast("Find and replace", "Search controls will open here in a later review round.");
    } else if (command === "table-settings") {
      openContextPanel("table");
    } else if (command === "make-copy") {
      showToast("Copy ready", "A copy opens as a new table draft in a later review state.");
    } else if (command === "version-history") {
      showToast("Version history", "Changes remains the table history route in this wireframe.");
    } else if (command === "theme") {
      showToast("Theme", "Table themes are represented but not persisted in this review round.");
    } else if (command === "toggle-gridlines") {
      var grid = query("[data-grid]");
      var hidden = grid.getAttribute("data-gridlines") === "false";
      grid.setAttribute("data-gridlines", hidden ? "true" : "false");
      var item = query("[data-sheet-command='toggle-gridlines']");
      item.setAttribute("aria-checked", String(hidden));
      query("[data-menu-check]", item).textContent = hidden ? "✓" : "";
    } else if (/^freeze-rows-/.test(command)) {
      setFrozenAxis("rows", command.replace("freeze-rows-", ""));
    } else if (/^freeze-rows-/.test(command)) {
      setFrozenAxis("rows", command.replace("freeze-rows-", ""));
    } else if (/^freeze-columns-/.test(command)) {
      setFrozenAxis("columns", command.replace("freeze-columns-", ""));
    } else if (/^zoom-/.test(command)) {
      setSheetZoom(command.replace("zoom-", ""));
    } else if (command === "size-down" || command === "size-up") {
      var currentSize = Number((formatSnapshot(cell || query("[data-cell]")).size) || 12);
      applyFontSize(currentSize + (command === "size-up" ? 1 : -1));
    } else if (/^font-size-/.test(command)) {
      applyFontSize(command.replace("font-size-", ""));
    } else if (command === "fullscreen") {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () {
          showToast("Full screen unavailable", "Your browser did not allow this view change.");
        });
      }
    } else if (command === "edit-cell") {
      editCell(cell);
    } else if (command === "configure-column" || command === "rename-column") {
      var configureCell = target && target.type === "column" ? target.element : cell;
      var key = configureCell && (configureCell.getAttribute("data-column-key") || (resolveCellColumn(configureCell) || {}).key);
      openContextPanel("column", key || "email");
      if (command === "rename-column") {
        window.setTimeout(function () { query("[data-column-panel-name]").focus(); }, 0);
      }
    } else if (command === "sort-asc" || command === "sort-desc") {
      sortVisibleRows(target && target.index >= 0 ? target.index : columnIndexFromElement(cell), command === "sort-desc");
    } else if (command === "clear-row") {
      clearCells(queryAll("[data-cell]", target.element.closest("[data-sheet-row]")));
    } else if (command === "clear-column") {
      var letter = sheetColumnLetter(target.index);
      clearCells(queryAll("[data-cell][data-column='" + letter + "']"));
    } else if (command === "move-row-up" || command === "move-row-down") {
      var rowIndex = queryAll("[data-sheet-row]").indexOf(target.element.closest("[data-sheet-row]"));
      reorderRow(rowIndex, Math.max(0, Math.min(visibleSheetRows - 1, rowIndex + (command === "move-row-up" ? -1 : 1))));
    } else if (command === "move-column-left" || command === "move-column-right") {
      reorderColumn(target.index, Math.max(0, Math.min(sheetColumnCount - 1, target.index + (command === "move-column-left" ? -1 : 1))));
    } else if (command === "delete-row" || command === "delete-column") {
      openSheetConfirmation(command === "delete-column" ? "column" : "row");
    } else if (command === "format") {
      runFormatCommand("bold");
    } else if (/^(insert|duplicate|paste-row|paste-column|resize)/.test(command)) {
      showToast("Command ready", "This structural action is represented but stops before changing PostgreSQL.");
    }
    closeSheetMenus(false);
  }

  function contextMenuItems(type) {
    if (type === "row") {
      return [
        ["cut", "Cut", "cut", "⌘X"], ["copy", "Copy", "copy", "⌘C"], ["paste-row", "Paste row", "paste", "⌘V"], null,
        ["insert-row-above", "Insert 1 row above", "arrow-up"], ["insert-row-below", "Insert 1 row below", "arrow-down"], ["duplicate-row", "Duplicate row", "copy"], null,
        ["delete-row", "Delete row", "trash", "", true], ["clear-row", "Clear row", "remove-format"], ["resize-row", "Resize row", "rows"], null,
        ["move-row-up", "Move row up", "arrow-up"], ["move-row-down", "Move row down", "arrow-down"]
      ];
    }
    if (type === "column") {
      return [
        ["cut", "Cut", "cut", "⌘X"], ["copy", "Copy", "copy", "⌘C"], ["paste-column", "Paste column values", "paste", "⌘V"], null,
        ["insert-column-left", "Insert 1 column left", "columns"], ["insert-column-right", "Insert 1 column right", "columns"], null,
        ["delete-column", "Delete column", "trash", "", true], ["clear-column", "Clear column", "remove-format"], ["resize-column", "Resize column", "columns"], null,
        ["sort-asc", "Sort sheet A → Z", "sort"], ["sort-desc", "Sort sheet Z → A", "sort"], ["move-column-left", "Move column left", "arrow-left"], ["move-column-right", "Move column right", "arrow-right"], null,
        ["rename-column", "Rename column", "edit"], ["configure-column", "Column settings", "settings"]
      ];
    }
    return [
      ["edit-cell", "Edit cell", "edit", "Enter"], ["cut", "Cut", "cut", "⌘X"], ["copy", "Copy", "copy", "⌘C"],
      ["paste", "Paste", "paste", "⌘V"], ["paste-values", "Paste special: values only", "paste", "⇧⌘V"], null,
      ["insert-row-above", "Insert 1 row above", "arrow-up"], ["insert-row-below", "Insert 1 row below", "arrow-down"], ["insert-column-left", "Insert 1 column left", "columns"], ["insert-column-right", "Insert 1 column right", "columns"], null,
      ["clear", "Clear contents", "remove-format"], ["format", "Format selection", "bold"], ["configure-column", "Column settings", "settings"]
    ];
  }

  function closeSheetContextMenu(returnFocus) {
    var menu = query("[data-context-menu]");
    if (!menu || menu.hidden) {
      return;
    }
    menu.hidden = true;
    if (returnFocus && activeContextTarget && activeContextTarget.element) {
      activeContextTarget.element.focus({ preventScroll: true });
    }
  }

  function openSheetContextMenu(type, element, x, y) {
    var menu = query("[data-context-menu]");
    if (!menu || !element) {
      return;
    }
    activeContextTarget = { type: type, element: element, index: columnIndexFromElement(element) };
    menu.innerHTML = "";
    menu.setAttribute("aria-label", type.charAt(0).toUpperCase() + type.slice(1) + " actions");
    contextMenuItems(type).forEach(function (item) {
      if (!item) {
        menu.appendChild(document.createElement("hr"));
        return;
      }
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.setAttribute("data-context-command", item[0]);
      if (item[4]) button.setAttribute("data-destructive", "true");
      var icon = document.createElement("span");
      icon.setAttribute("data-wf-icon", item[2]);
      var label = document.createElement("span");
      label.textContent = item[1];
      var shortcut = document.createElement("kbd");
      shortcut.textContent = item[3] || "";
      button.appendChild(icon);
      button.appendChild(label);
      button.appendChild(shortcut);
      menu.appendChild(button);
    });
    if (window.WireframeIcons) window.WireframeIcons.render(menu);
    menu.hidden = false;
    var width = 286;
    var measuredHeight = Math.min(menu.scrollHeight, window.innerHeight - 20);
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - measuredHeight - 8)) + "px";
    var first = query("button", menu);
    if (first) first.focus({ preventScroll: true });
  }

  function initSheetContextMenus() {
    var menu = query("[data-context-menu]");
    if (!menu) {
      return;
    }
    queryAll("[data-cell]").forEach(function (cell) {
      cell.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        selectCell(cell, event.shiftKey);
        openSheetContextMenu("cell", cell, event.clientX, event.clientY);
      });
    });
    queryAll("[data-sheet-row-header]").forEach(function (rowHeader) {
      rowHeader.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        selectRow(rowHeader);
        openSheetContextMenu("row", rowHeader, event.clientX, event.clientY);
      });
    });
    queryAll("[data-coordinate], [data-column-letter]").forEach(function (header) {
      header.addEventListener("click", function () {
        selectColumn(header);
      });
      header.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        selectColumn(header);
        openSheetContextMenu("column", header, event.clientX, event.clientY);
      });
    });
    menu.addEventListener("click", function (event) {
      var button = event.target.closest("[data-context-command]");
      if (!button) return;
      var command = button.getAttribute("data-context-command");
      closeSheetContextMenu(false);
      runSheetCommand(command);
    });
    menu.addEventListener("keydown", function (event) {
      var items = queryAll("button", menu);
      var index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1 + items.length) % items.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSheetContextMenu(true);
      }
    });
    document.addEventListener("pointerdown", function (event) {
      if (!menu.hidden && !menu.contains(event.target)) {
        closeSheetContextMenu(false);
      }
    });
    var scroll = query("[data-sheet-scroll]");
    if (scroll) scroll.addEventListener("scroll", function () { closeSheetContextMenu(false); }, { passive: true });
  }

  function initSpreadsheetCommandSurface() {
    var surface = query(".sheet-command-surface");
    if (!surface) {
      return;
    }
    initSheetMenubar();
    surface.addEventListener("click", function (event) {
      var commandButton = event.target.closest("[data-sheet-command]");
      var popoverTrigger = event.target.closest("[data-format-popover-trigger]");
      var formatButton = event.target.closest("[data-format-command]");
      var overflowTrigger = event.target.closest("[data-toolbar-overflow-trigger]");
      if (commandButton) {
        runSheetCommand(commandButton.getAttribute("data-sheet-command"));
      } else if (popoverTrigger) {
        openFormatPopover(popoverTrigger);
      } else if (formatButton) {
        runFormatCommand(formatButton.getAttribute("data-format-command"));
        closeSheetMenus(false);
      } else if (overflowTrigger) {
        var panel = query("[data-toolbar-overflow]");
        var expanded = overflowTrigger.getAttribute("aria-expanded") === "true";
        overflowTrigger.setAttribute("aria-expanded", String(!expanded));
        panel.hidden = expanded;
      }
    });
    queryAll("[data-format-select]", surface).forEach(function (select) {
      select.addEventListener("change", function () {
        var property = select.getAttribute("data-format-select");
        applyFormatToSelection(property, select.value, property === "font" ? "Font updated" : "Font size updated");
      });
    });
    queryAll("[data-format-size-input]", surface).forEach(function (input) {
      input.addEventListener("change", function () {
        applyFontSize(input.value);
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          applyFontSize(input.value);
          input.blur();
        }
      });
    });
    document.addEventListener("pointerdown", function (event) {
      var panel = query("[data-toolbar-overflow]");
      var trigger = query("[data-toolbar-overflow-trigger]");
      var formatPopover = query("[data-format-popover]");
      if (panel && !panel.hidden && !event.target.closest(".sheet-toolbar-overflow")) {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
      if (formatPopover && !formatPopover.hidden && !formatPopover.contains(event.target) && !event.target.closest("[data-format-popover-trigger]")) {
        closeFormatPopover(false);
      }
    });
    var formatPopover = query("[data-format-popover]");
    if (formatPopover) {
      formatPopover.addEventListener("keydown", function (event) {
        var options = queryAll("button", formatPopover);
        var index = options.indexOf(document.activeElement);
        if (event.key === "ArrowDown") {
          event.preventDefault();
          options[(index + 1 + options.length) % options.length].focus();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          options[(index - 1 + options.length) % options.length].focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeFormatPopover(true);
        }
      });
    }
    refreshFormattingToolbar();
  }

  function initGlobalKeys() {
    document.addEventListener("keydown", function (event) {
      var commandKey = event.metaKey || event.ctrlKey;
      var key = event.key.toLowerCase();
      if (commandKey && (key === "b" || key === "i" || key === "u") && !event.target.matches("input, select, textarea")) {
        event.preventDefault();
        runFormatCommand(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
      if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
        if (!activeSelectionTarget || !activeSelectionTarget.element) return;
        event.preventDefault();
        var rect = activeSelectionTarget.element.getBoundingClientRect();
        openSheetContextMenu(activeSelectionTarget.type, activeSelectionTarget.element, rect.left + 18, rect.top + 18);
        return;
      }
      if (event.key !== "Escape") {
        return;
      }
      closeSheetContextMenu(true);
      closeSheetMenus(false);
      closeFormatPopover(true);
      var overflow = query("[data-toolbar-overflow]");
      var overflowTrigger = query("[data-toolbar-overflow-trigger]");
      if (overflow) overflow.hidden = true;
      if (overflowTrigger) overflowTrigger.setAttribute("aria-expanded", "false");
      closeContextPanel();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNavigation();
    initDepartmentContext();
    initFileExplorer();
    initDepartmentBrowse();
    initObjectSearch();
    initUntitledFileState();
    buildSpreadsheetGrid();
    initGrid();
    initGridReordering();
    initQueryState();
    initSpreadsheetTitle();
    initColumnAndRowPanels();
    initEmptyHeaderNaming();
    initSpreadsheetCommandSurface();
    initSheetContextMenus();
    initSheetRowAdder();
    initImportWizard();
    initGlobalKeys();
  });
})();
