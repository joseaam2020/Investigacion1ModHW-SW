// merged.js — glue for merged editor + canvas
// Relies on functions from app.js (createBlockElement, setupDropZone, generateCode, updatePreview)
(function(){
  // Ensure DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    if (location.protocol === 'file:') {
      const warning = document.getElementById('file-warning');
      if (warning) warning.hidden = false;
    }

    // Hook Save button
    const btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.addEventListener('click', downloadCpp);

    // Initialize palette drag handlers (app.js already sets these on page load when included)
    // Ensure the workspace drop zones are wired (app.js already calls setupDropZone on load)

    // Create a simple pin list on the canvas for visual mapping (example GPIO pins)
    renderPinList();
    setupBoardScaling();

    // Keep preview updated but hidden
    if (typeof updatePreview === 'function') updatePreview();
  });

  function downloadCpp() {
    if (typeof generateCode !== 'function') {
      alert('La función generateCode() no está disponible. Asegúrate de que app.js esté cargado.');
      return;
    }
    const code = generateCode();
    const blob = new Blob([code], { type: 'text/x-c' });
    const name = `blockcode_${new Date().toISOString().replace(/[:.]/g,'-')}.cpp`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderPinList() {
    const left = document.getElementById('pin-list-left');
    const right = document.getElementById('pin-list-right');
    if (!left || !right) return;
    const leftPins = ['EN', 'VP (ADC)', 'VN (ADC)', 'IO34', 'IO35', 'IO32', 'IO33', 'IO25', 'IO26', 'IO27', 'IO14', 'IO12','IO13', 'GND', 'VIN'];
    const rightPins = ['IO23', 'IO22', 'TX0', 'RX0', 'IO21', 'IO19', 'IO18', 'IO5', 'TX2', 'RX2', 'IO4', 'IO2', 'IO15', 'GND', '3V3'];

    left.innerHTML = leftPins.map((label) => makePinRow(label, 'left')).join('');
    right.innerHTML = rightPins.map((label) => makePinRow(label, 'right')).join('');
  }

  function makePinRow(label, side) {
    const active = /^IO()$/.test(label) ? ' active' : '';
    const pinLabel = `<span class="pin-label">${label}</span>`;
    const pinButton = `<button type="button" class="pin-button${active}" aria-label="${label}"></button>`;
    // Left rail: label outside (left), button inside (right, touching board)
    // Right rail: button inside (left, touching board), label outside (right)
    return `<div class="pin-row pin-row-${side}">${side === 'left' ? `${pinLabel}${pinButton}` : `${pinButton}${pinLabel}`}</div>`;
  }

  function setupBoardScaling() {
    const stage = document.querySelector('.canvas-stage');
    const board = document.querySelector('.esp-board');
    if (!stage || !board) return;

    const root = document.documentElement;
    const BASE = {
      boardWidth: 520,
      pinRailWidth: 140,
      pinRailOffset: 74,
      pinRailGap: 12,
      pinRowGap: 8,
      pinRowMinHeight: 22,
      pinLabelWidth: 92,
      pinButtonWidth: 54,
      pinButtonHeight: 23,
      pinButtonRadius: 5,
      pinFontSize: 0.84
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    let frame = null;

    function updateScale() {
      const boardRect = board.getBoundingClientRect();
      if (boardRect.width === 0) { frame = null; return; }
      const ratio = clamp(boardRect.width / BASE.boardWidth, 0.68, 1);

      // Compute pin rail content height so the stage is tall enough to center both.
      // Effective row height is max(min-height, button-height) since buttons drive row size.
      const nPins = 15;
      const rowH   = Math.max(16, Math.round(Math.max(BASE.pinRowMinHeight, BASE.pinButtonHeight) * ratio));
      const rowGap = Math.max(6,  Math.round(BASE.pinRailGap * ratio));
      const pinContentH = nPins * rowH + (nPins - 1) * rowGap;

      // Stage height = tallest of board or pin column; board is centered in that space
      const stageH  = Math.max(Math.round(boardRect.height), pinContentH);
      const boardTop = Math.round((stageH - boardRect.height) / 2);

      root.style.setProperty('--board-height',   `${stageH}px`);
      root.style.setProperty('--board-top',      `${boardTop}px`);
      // Position rails using the board's actual measured half-width (no --board-scale on the board itself)
      root.style.setProperty('--board-half-px',  `${Math.round(boardRect.width / 2)}px`);
      root.style.setProperty('--pin-rail-width',       `${Math.round(BASE.pinRailWidth * ratio)}px`);
      root.style.setProperty('--pin-rail-offset',      `${Math.max(50, Math.round(BASE.pinRailOffset * ratio))}px`);
      root.style.setProperty('--pin-rail-gap',         `${Math.max(6, Math.round(BASE.pinRailGap * ratio))}px`);
      root.style.setProperty('--pin-row-gap',          `${Math.max(4, Math.round(BASE.pinRowGap * ratio))}px`);
      root.style.setProperty('--pin-row-min-height',   `${rowH}px`);
      root.style.setProperty('--pin-label-width',      `${Math.round(BASE.pinLabelWidth * ratio)}px`);
      root.style.setProperty('--pin-button-width',     `${Math.round(BASE.pinButtonWidth * ratio)}px`);
      root.style.setProperty('--pin-button-height',    `${Math.max(16, Math.round(BASE.pinButtonHeight * ratio))}px`);
      root.style.setProperty('--pin-button-radius',    `${Math.max(4, Math.round(BASE.pinButtonRadius * ratio))}px`);
      root.style.setProperty('--pin-font-size',        `${Math.max(0.62, BASE.pinFontSize * ratio).toFixed(2)}rem`);
      frame = null;
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = requestAnimationFrame(updateScale);
    }

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(stage);
    resizeObserver.observe(board);

    window.addEventListener('resize', scheduleUpdate, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    }

    // Use rAF so the first measurement runs after the browser has fully painted
    scheduleUpdate();
  }

})();
