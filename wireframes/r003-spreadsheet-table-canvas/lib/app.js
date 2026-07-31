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
  var namedSheetColumns = [
    { key: "order-id", label: "Order ID", field: "Number", format: "Plain text", storage: "bigint", required: true },
    { key: "customer", label: "Customer", field: "Relation", format: "Related record", storage: "foreign key", required: true },
    { key: "email", label: "Email", field: "Email", format: "Email link", storage: "text", required: true },
    { key: "status", label: "Status", field: "Select", format: "Badge", storage: "text", required: false },
    { key: "total", label: "Total", field: "Price", format: "Currency", storage: "numeric", required: false },
    { key: "paid", label: "Paid", field: "Switch", format: "Yes/no", storage: "boolean", required: false },
    { key: "ordered-at", label: "Ordered at", field: "Date and time", format: "Date/time", storage: "timestamptz", required: false }
  ];
  var sheetRecords = [
    ["1084", "Northstar Market", "ap@northstar.co", "Processing", "₱1,280.00", "Yes", "Jul 24, 10:32 AM"],
    ["1083", "Harbor Goods", "orders@harborgoods.ph", "Ready", "₱845.50", "No", "Jul 24, 9:18 AM"],
    ["1082", "Acacia Retail", "team@acaciaretail.com", "Shipped", "₱2,410.00", "Yes", "Jul 23, 3:04 PM"],
    ["1081", "Luna Home", "ops@lunahome.co", "Processing", "₱720.00", "Yes", "Jul 23, 11:48 AM"]
  ];

  function sheetColumnLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function sheetColumn(index) {
    return namedSheetColumns[index] || {
      key: "column-" + sheetColumnLetter(index).toLowerCase(),
      label: "",
      field: "Text",
      format: "Plain text",
      storage: "text",
      required: false
    };
  }

  function findSheetColumn(key) {
    return namedSheetColumns.find(function (column) {
      return column && column.key === key;
    });
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

  function recordCellChange(before, after) {
    if (snapshotsMatch(before, after)) {
      return;
    }
    cellHistory.push({ before: before, after: after });
    if (cellHistory.length > 100) {
      cellHistory.shift();
    }
    cellRedoHistory = [];
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
      return;
    }
    cellRedoHistory.push(change);
    applyCellSnapshot(change.before);
  }

  function redoCellChange() {
    var change = cellRedoHistory.pop();
    if (!change) {
      return;
    }
    cellHistory.push(change);
    applyCellSnapshot(change.after);
  }

  function renderCellValue(cell, value, columnKey) {
    var column = findSheetColumn(columnKey);
    cell.innerHTML = "";
    if (column && column.field === "Select" && value) {
      var pill = document.createElement("span");
      pill.className = "status-pill";
      pill.textContent = value;
      cell.appendChild(pill);
    } else {
      cell.textContent = value;
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
        var menuButton = document.createElement("button");
        menuButton.className = "header-button";
        menuButton.type = "button";
        menuButton.setAttribute("aria-label", "Open " + column.label + " column menu");
        menuButton.setAttribute("data-header-menu", column.key);
        var menuIcon = document.createElement("span");
        menuIcon.setAttribute("data-wf-icon", "more");
        menuButton.appendChild(menuIcon);
        fieldCell.appendChild(menuButton);
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
  }

  function resetCellHistory() {
    cellHistory = [];
    cellRedoHistory = [];
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
    return params.get("department") === "finance"
      ? { key: "finance", label: "Finance" }
      : { key: "operations", label: "Operations" };
  }

  function initDepartmentContext() {
    var params = new URLSearchParams(window.location.search);
    var department = currentDepartment(params);

    queryAll("[data-department-name]").forEach(function (element) {
      element.textContent = department.label;
    });

    queryAll("[data-department-return]").forEach(function (link) {
      link.setAttribute("href", "./browse.html?department=" + department.key);
    });

    queryAll("[data-department-import]").forEach(function (link) {
      link.setAttribute("href", "./import.html?department=" + department.key);
    });

    queryAll("[data-department-table-link]").forEach(function (link) {
      link.setAttribute("href", "./table.html?imported=1&department=" + department.key);
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
      create.setAttribute("href", "./create-table.html?department=" + department.key);
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

  var fieldTypes = {
    text: { storage: "text", format: "plain text", sql: "text" },
    email: { storage: "text", format: "email link", sql: "text" },
    relation: { storage: "foreign key", format: "related record", sql: "bigint REFERENCES public.customers(id)" },
    price: { storage: "numeric", format: "currency", sql: "numeric" },
    select: { storage: "text + check", format: "label", sql: "text" },
    switch: { storage: "boolean", format: "yes / no", sql: "boolean" },
    datetime: { storage: "timestamptz", format: "date and time", sql: "timestamptz" }
  };

  function sqlIdentifier(value, fallback) {
    var normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized || fallback;
  }

  function builderColumnMarkup(index) {
    return [
      '<div class="column-card" data-builder-column>',
      '  <label class="app-field">',
      '    <span class="app-label">Column name</span>',
      '    <input class="app-input" type="text" value="New field ' + index + '" data-column-name>',
      "  </label>",
      '  <label class="app-field">',
      '    <span class="app-label">Field</span>',
      '    <select class="app-select" data-field-type>',
      '      <option value="text" selected>Text</option>',
      '      <option value="email">Email</option>',
      '      <option value="relation">Relation</option>',
      '      <option value="price">Price</option>',
      '      <option value="select">Select</option>',
      '      <option value="switch">Switch</option>',
      '      <option value="datetime">Date and time</option>',
      "    </select>",
      "  </label>",
      '  <div class="column-card__inference" data-inference>text · plain text</div>',
      '  <button class="app-button app-button--ghost app-button--icon column-card__remove" type="button" data-remove-builder-column aria-label="Remove new column">',
      '    <span data-wf-icon="trash"></span>',
      "  </button>",
      "</div>"
    ].join("");
  }

  function updateBuilder() {
    var builder = query("[data-table-builder]");
    if (!builder) {
      return;
    }
    var tableName = query("[data-table-name]", builder);
    var identity = query("[data-object-identity]");
    var name = sqlIdentifier(tableName.value, "new_table");
    var lines = ["  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY"];

    queryAll("[data-builder-column]", builder).forEach(function (column) {
      var fieldSelect = query("[data-field-type]", column);
      var columnName = query("[data-column-name]", column);
      var config = fieldTypes[fieldSelect.value] || fieldTypes.text;
      query("[data-inference]", column).textContent = config.storage + " · " + config.format;
      var identifier = sqlIdentifier(columnName.value, "new_field");
      if (fieldSelect.value === "relation" && !/_id$/.test(identifier)) {
        identifier += "_id";
      }
      lines.push("  " + identifier + " " + config.sql);
    });

    if (identity) {
      identity.textContent = "public." + name;
    }
    var help = query("#table-name-help");
    if (help) {
      help.innerHTML = 'Created as <span class="app-code">public.' + name + "</span>.";
    }
    var preview = query("[data-sql-preview]");
    if (preview) {
      preview.textContent = "CREATE TABLE public." + name + " (\n" + lines.join(",\n") + "\n);";
    }
  }

  function initTableBuilder() {
    var builder = query("[data-table-builder]");
    var list = query("[data-column-list]");
    if (!builder || !list) {
      return;
    }

    function bindColumn(column) {
      queryAll("input, select", column).forEach(function (control) {
        control.addEventListener("input", updateBuilder);
        control.addEventListener("change", updateBuilder);
      });
      var remove = query("[data-remove-builder-column]", column);
      remove.addEventListener("click", function () {
        if (queryAll("[data-builder-column]", list).length === 1) {
          showToast("Keep one column", "A new table needs at least one usable column.");
          return;
        }
        column.remove();
        updateBuilder();
      });
    }

    queryAll("[data-builder-column]", list).forEach(bindColumn);
    queryAll("[data-add-builder-column]").forEach(function (button) {
      button.addEventListener("click", function () {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = builderColumnMarkup(queryAll("[data-builder-column]", list).length + 1);
        var column = wrapper.firstElementChild;
        list.appendChild(column);
        bindColumn(column);
        if (window.WireframeIcons) {
          window.WireframeIcons.render(column);
        }
        query("[data-column-name]", column).focus();
        updateBuilder();
      });
    });

    builder.addEventListener("submit", function (event) {
      event.preventDefault();
      var department = currentDepartment(new URLSearchParams(window.location.search));
      var tableName = query("[data-table-name]", builder);
      var error = query("[data-table-name-error]", builder);
      if (!tableName.value.trim()) {
        tableName.setAttribute("aria-invalid", "true");
        error.hidden = false;
        tableName.focus();
        return;
      }
      tableName.removeAttribute("aria-invalid");
      error.hidden = true;
      var button = query("[data-create-table]", builder);
      button.disabled = true;
      button.textContent = "Creating table…";
      window.setTimeout(function () {
        window.location.href = "./table.html?created=1&department=" + department.key + "&table=customer-orders";
      }, 450);
    });

    updateBuilder();
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
      budgets: "Budgets"
    };
    var tableKey = params.get("table") || "customer-orders";
    var tableLabel = tableLabels[tableKey];

    if (tableTitle && tableLabel) {
      tableTitle.textContent = tableLabel;
      document.title = tableLabel + " · Tabular";
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

    if (params.get("created") === "1" && banner) {
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

  function selectCell(cell) {
    queryAll("[data-cell][aria-selected='true']").forEach(function (selected) {
      selected.removeAttribute("aria-selected");
    });
    cell.setAttribute("aria-selected", "true");
    var grid = query("[data-grid]");
    if (!cell.id) {
      cell.id = "grid-cell-" + (queryAll("[data-cell]").indexOf(cell) + 1);
    }
    if (grid) {
      grid.setAttribute("aria-activedescendant", cell.id);
    }
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

    if (field === "Select") {
      editorType = "select";
      control = document.createElement("select");
      control.className = "sheet-cell-editor sheet-cell-editor--select";
      ["Processing", "Ready", "Shipped", "Cancelled"].forEach(function (optionValue) {
        var option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        option.selected = optionValue === original;
        control.appendChild(option);
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
      cell.addEventListener("click", function () {
        selectCell(cell);
        grid.focus({ preventScroll: true });
      });
      cell.addEventListener("dblclick", function () {
        editCell(cell);
      });
    });

    queryAll("[data-sheet-row-header]").forEach(function (rowHeader) {
      rowHeader.addEventListener("click", function () {
        queryAll("[data-cell][aria-selected='true']").forEach(function (selected) {
          selected.removeAttribute("aria-selected");
        });
        var activeGrid = query("[data-grid]");
        if (activeGrid) {
          activeGrid.removeAttribute("aria-activedescendant");
        }
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
      selectCell(navigationCells[next]);
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
    var rowDetail = query("[data-row-detail]", panel);
    var actions = query("[data-column-panel-actions]", panel);
    var title = query("[data-context-title]", panel);

    if (mode === "row") {
      columnForm.hidden = true;
      rowDetail.hidden = false;
      actions.hidden = true;
      title.textContent = "Order " + value;
      query("[data-row-detail-id]", rowDetail).textContent = "Order " + value;
    } else {
      var config = findSheetColumn(value) || namedSheetColumns[2];
      columnForm.hidden = false;
      rowDetail.hidden = true;
      actions.hidden = false;
      title.textContent = "Configure " + config.label;
      panel.setAttribute("data-active-column", config.key);
      query("[data-column-panel-name]", panel).value = config.label;
      query("[data-column-panel-field]", panel).value = config.field;
      query("[data-column-panel-format]", panel).value = config.format;
      query("[data-column-storage]", panel).value = config.storage;
      query("[data-column-required]", panel).checked = config.required;
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

  function bindColumnHeader(header) {
    if (!header || header.getAttribute("data-column-header-bound") === "true") {
      return;
    }
    header.setAttribute("data-column-header-bound", "true");
    header.addEventListener("dblclick", function (event) {
      if (event.target.closest("[data-header-menu]")) {
        return;
      }
      openContextPanel("column", header.getAttribute("data-column-header"));
    });
  }

  function bindHeaderMenuButton(button) {
    if (!button || button.getAttribute("data-header-menu-bound") === "true") {
      return;
    }
    button.setAttribute("data-header-menu-bound", "true");
    button.addEventListener("click", function (event) {
      var menu = query("[data-context-menu]");
      if (!menu) {
        return;
      }
      event.stopPropagation();
      var rect = button.getBoundingClientRect();
      menu.hidden = false;
      menu.setAttribute("data-column", button.getAttribute("data-header-menu"));
      menu.style.top = Math.min(window.innerHeight - 210, rect.bottom + 5) + "px";
      menu.style.left = Math.min(window.innerWidth - 232, Math.max(10, rect.left - 170)) + "px";
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
    var menuButton = document.createElement("button");
    menuButton.className = "header-button";
    menuButton.type = "button";
    menuButton.setAttribute("aria-label", "Open " + config.label + " column menu");
    menuButton.setAttribute("data-header-menu", config.key);
    var menuIcon = document.createElement("span");
    menuIcon.setAttribute("data-wf-icon", "more");
    menuButton.appendChild(menuIcon);
    header.appendChild(headerMain);
    header.appendChild(menuButton);
    queryAll("[data-cell][data-column='" + letter + "']").forEach(function (cell) {
      cell.setAttribute("data-column-key", config.key);
      cell.setAttribute("data-named-column", "true");
    });
    var summary = query("[data-sheet-summary]");
    if (summary) {
      summary.textContent = "248 records · " + sheetCapacity.toLocaleString() + " rows · " + namedSheetColumns.filter(Boolean).length + " named columns";
    }
    bindColumnHeader(header);
    bindHeaderMenuButton(menuButton);
    validateColumnLayout();
    if (window.WireframeIcons) {
      window.WireframeIcons.render(header);
    }
  }

  function initColumnAndRowPanels() {
    var menu = query("[data-context-menu]");
    queryAll("[data-column-header]").forEach(bindColumnHeader);
    queryAll("[data-header-menu]").forEach(bindHeaderMenuButton);

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
        showToast("Column updated", name + " now uses the selected field, output format, and PostgreSQL storage.");
      });
    }

    document.addEventListener("click", function (event) {
      if (menu && !menu.hidden && !menu.contains(event.target) && !event.target.closest("[data-header-menu]")) {
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
      query("[data-sheet-summary]").textContent = "248 records · " + sheetCapacity.toLocaleString() + " rows · " + namedSheetColumns.filter(Boolean).length + " named columns";
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

  function initGlobalKeys() {
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }
      var menu = query("[data-context-menu]");
      if (menu) {
        menu.hidden = true;
      }
      closeContextPanel();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNavigation();
    initDepartmentContext();
    initDepartmentBrowse();
    initObjectSearch();
    initTableBuilder();
    buildSpreadsheetGrid();
    initGrid();
    initGridReordering();
    initQueryState();
    initColumnAndRowPanels();
    initEmptyHeaderNaming();
    initSheetRowAdder();
    initImportWizard();
    initGlobalKeys();
  });
})();
