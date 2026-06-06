/* =========================================================
   BlockCode ESP32/Arduino — lógica de frontend
   - Definición de bloques + plantillas de código
   - Drag & drop (HTML5) desde paleta a zonas y entre zonas
   - Bloques de control (for / if) aceptan bloques anidados
   - Generación del .cpp final y envío a Flask como JSON
   ========================================================= */

/* ---------- DEFINICIÓN DE BLOQUES ----------
   Cada bloque tiene:
   - label: texto visible
   - params: lista de parámetros editables {name, type, default, [options]}
   - hasChildren: true si admite bloques anidados (for, if)
   - generate(params, body?): devuelve la línea/bloque de C++ resultante
-------------------------------------------- */
const BLOCK_DEFS = {
  pinMode: {
    label: 'pinMode',
    params: [
      { name: 'pin',  type: 'number', default: 2 },
      { name: 'mode', type: 'select', options: ['OUTPUT', 'INPUT', 'INPUT_PULLUP'], default: 'OUTPUT' }
    ],
    generate: (p) => `pinMode(${p.pin}, ${p.mode});`
  },
  serialBegin: {
    label: 'Serial.begin',
    params: [{ name: 'baud', type: 'number', default: 115200 }],
    generate: (p) => `Serial.begin(${p.baud});`
  },
  digitalHigh: {
    label: 'Encender pin (HIGH)',
    params: [{ name: 'pin', type: 'number', default: 2 }],
    generate: (p) => `digitalWrite(${p.pin}, HIGH);`
  },
  digitalLow: {
    label: 'Apagar pin (LOW)',
    params: [{ name: 'pin', type: 'number', default: 2 }],
    generate: (p) => `digitalWrite(${p.pin}, LOW);`
  },
  analogWrite: {
    label: 'PWM analogWrite',
    params: [
      { name: 'pin',   type: 'number', default: 2 },
      { name: 'value', type: 'text',   default: '128' }
    ],
    generate: (p) => `analogWrite(${p.pin}, ${p.value});`
  },
  digitalRead: {
    label: 'Leer pin digital',
    params: [
      { name: 'pin', type: 'number', default: 4 },
      { name: 'var', type: 'text',   default: 'estado' }
    ],
    generate: (p) => `int ${p.var} = digitalRead(${p.pin});`
  },
  analogRead: {
    label: 'Leer pin analógico',
    params: [
      { name: 'pin', type: 'number', default: 34 },
      { name: 'var', type: 'text',   default: 'potValue' }
    ],
    generate: (p) => `int ${p.var} = analogRead(${p.pin});`
  },
  mapValue: {
    label: 'Mapear valor (map)',
    params: [
      { name: 'src',      type: 'text',   default: 'potValue' },
      { name: 'fromLow',  type: 'number', default: 0 },
      { name: 'fromHigh', type: 'number', default: 4095 },
      { name: 'toLow',    type: 'number', default: 0 },
      { name: 'toHigh',   type: 'number', default: 255 },
      { name: 'dst',      type: 'text',   default: 'brightness' }
    ],
    generate: (p) => `int ${p.dst} = map(${p.src}, ${p.fromLow}, ${p.fromHigh}, ${p.toLow}, ${p.toHigh});`
  },
  delay: {
    label: 'Esperar (delay)',
    params: [{ name: 'ms', type: 'number', default: 1000 }],
    generate: (p) => `delay(${p.ms});`
  },
  for: {
    label: 'Repetir N veces',
    hasChildren: true,
    params: [
      { name: 'var',   type: 'text',   default: 'i' },
      { name: 'count', type: 'number', default: 10 }
    ],
    generate: (p, body) =>
      `for (int ${p.var} = 0; ${p.var} < ${p.count}; ${p.var}++) {\n${body}\n}`
  },
  if: {
    label: 'Si (if)',
    hasChildren: true,
    params: [{ name: 'condition', type: 'text', default: 'estado == HIGH' }],
    generate: (p, body) => `if (${p.condition}) {\n${body}\n}`
  },
  serialPrint: {
    label: 'Serial.println',
    params: [
      { name: 'text', type: 'text',   default: 'Hola ESP32' },
      { name: 'tipo', type: 'select', options: ['texto', 'variable'], default: 'texto' }
    ],
    generate: (p) => p.tipo === 'variable'
      ? `Serial.println(${p.text});`
      : `Serial.println("${String(p.text).replace(/"/g, '\\"')}");`
  }
};

/* ---------- CREACIÓN DE BLOQUES EN EL DOM ---------- */
let blockIdCounter = 0;

function createBlockElement(type, savedParams = null) {
  const def = BLOCK_DEFS[type];
  if (!def) throw new Error('Bloque desconocido: ' + type);

  const id = ++blockIdCounter;
  const div = document.createElement('div');
  div.className = 'workspace-block';
  div.dataset.block = type;
  div.dataset.id = id;
  div.draggable = true;

  // Valores iniciales (defaults o restaurados)
  const initial = savedParams || Object.fromEntries(def.params.map(p => [p.name, p.default]));

  let html = `<span class="block-label">${def.label}</span>
              <button class="remove-btn" title="Eliminar bloque">×</button>
              <div class="block-params">`;
  for (const p of def.params) {
    const v = initial[p.name];
    if (p.type === 'select') {
      html += `<label>${p.name}: <select data-param="${p.name}">`;
      for (const opt of p.options) {
        html += `<option value="${opt}"${opt === v ? ' selected' : ''}>${opt}</option>`;
      }
      html += `</select></label>`;
    } else {
      const safe = String(v).replace(/"/g, '&quot;');
      html += `<label>${p.name}: <input type="${p.type}" data-param="${p.name}" value="${safe}"></label>`;
    }
  }
  html += `</div>`;
  if (def.hasChildren) {
    html += `<div class="inner-zone" data-zone="children"></div>`;
  }
  div.innerHTML = html;

  // Botón eliminar
  div.querySelector('.remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    div.remove();
    updatePreview();
  });

  // Actualizar preview cuando cambien los parámetros
  div.querySelectorAll(':scope > .block-params input, :scope > .block-params select')
    .forEach(el => el.addEventListener('input', updatePreview));

  // Drag para reordenar / mover entre zonas
  div.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/block-id', div.dataset.id);
    e.dataTransfer.setData('text/block-type', type);
    e.dataTransfer.effectAllowed = 'move';
  });

  // Si tiene zona interna (for/if), habilitar drop ahí
  const inner = div.querySelector(':scope > .inner-zone');
  if (inner) setupDropZone(inner);

  return div;
}

/* ---------- DROP ZONES ---------- */
function setupDropZone(zone) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', (e) => {
    if (e.target === zone) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');

    const id = e.dataTransfer.getData('text/block-id');
    const type = e.dataTransfer.getData('text/block-type');

    if (id) {
      // Mover bloque existente
      const existing = document.querySelector(`.workspace-block[data-id="${id}"]`);
      if (existing && !existing.contains(zone)) {
        zone.appendChild(existing);
      }
    } else if (type) {
      // Nuevo bloque desde la paleta
      zone.appendChild(createBlockElement(type));
    }
    updatePreview();
  });
}

/* ---------- INICIALIZACIÓN ---------- */
document.querySelectorAll('.palette-block').forEach(pb => {
  pb.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/block-type', pb.dataset.block);
    e.dataTransfer.effectAllowed = 'copy';
  });
});

document.querySelectorAll('#setup-zone, #loop-zone').forEach(setupDropZone);

/* ---------- GENERACIÓN DE CÓDIGO ---------- */
function indentLines(text, indent) {
  if (!text) return '';
  return text.split('\n').map(l => l.length ? indent + l : l).join('\n');
}

function readBlockParams(blockEl) {
  const params = {};
  blockEl.querySelectorAll(':scope > .block-params [data-param]').forEach(el => {
    params[el.dataset.param] = el.value;
  });
  return params;
}

function generateFromZone(zone) {
  const lines = [];
  for (const child of zone.children) {
    if (!child.classList.contains('workspace-block')) continue;
    const type = child.dataset.block;
    const def = BLOCK_DEFS[type];
    const params = readBlockParams(child);

    if (def.hasChildren) {
      const innerZone = child.querySelector(':scope > .inner-zone');
      const body = generateFromZone(innerZone);
      const indentedBody = indentLines(body, '  ');
      lines.push(def.generate(params, indentedBody));
    } else {
      lines.push(def.generate(params));
    }
  }
  return lines.join('\n');
}

function generateCode() {
  const setupBody = indentLines(generateFromZone(document.getElementById('setup-zone')), '  ');
  const loopBody  = indentLines(generateFromZone(document.getElementById('loop-zone')),  '  ');
  return `#include <Arduino.h>

void setup() {
${setupBody}
}

void loop() {
${loopBody}
}
`;
}

/* ---------- SERIALIZACIÓN A JSON (estructura de bloques) ---------- */
function serializeBlocks(zone) {
  const arr = [];
  for (const child of zone.children) {
    if (!child.classList.contains('workspace-block')) continue;
    const type = child.dataset.block;
    const def = BLOCK_DEFS[type];
    const entry = { type, params: readBlockParams(child) };
    if (def.hasChildren) {
      entry.children = serializeBlocks(child.querySelector(':scope > .inner-zone'));
    }
    arr.push(entry);
  }
  return arr;
}

/* ---------- PREVIEW EN VIVO ---------- */
function updatePreview() {
  document.getElementById('code-output').textContent = generateCode();
}

/* ---------- BOTONES ---------- */
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los bloques?')) return;
  document.getElementById('setup-zone').innerHTML = '';
  document.getElementById('loop-zone').innerHTML = '';
  updatePreview();
});

function showStatus(text) {
  const out = document.getElementById('server-output');
  if (out) out.textContent = text;
}

async function sendToServer(endpoint) {
  const serverUrl = document.getElementById('server-url').value.trim().replace(/\/$/, '');
  const payload = {
    code: generateCode(),
    blocks: {
      setup: serializeBlocks(document.getElementById('setup-zone')),
      loop:  serializeBlocks(document.getElementById('loop-zone'))
    }
  };
  showStatus(`→ POST ${serverUrl}${endpoint}\nEnviando...`);
  try {
    const res = await fetch(`${serverUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
    showStatus(`← HTTP ${res.status}\n\n${pretty}`);
    return { ok: res.ok, text, data: JSON.parse(text) };
  } catch (err) {
    showStatus(`✗ Error de red: ${err.message}\n\n¿Está corriendo Flask? ¿CORS habilitado?`);
    return { ok: false };
  }
}

async function sendToESP32(endpoint) {
  const esp32Url = document.getElementById('esp32-url').value.trim().replace(/\/$/, '');
  // Send only blocks — skip the generated C++ string to save ESP32 memory.
  const payload = {
    blocks: {
      setup: serializeBlocks(document.getElementById('setup-zone')),
      loop:  serializeBlocks(document.getElementById('loop-zone'))
    }
  };
  showStatus(`→ POST ${esp32Url}${endpoint}\nEnviando programa al ESP32...`);
  try {
    const res = await fetch(`${esp32Url}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
    showStatus(`← HTTP ${res.status}\n\n${pretty}`);
  } catch (err) {
    showStatus(`✗ Error de red: ${err.message}\n\n¿Está encendido el ESP32 y conectado al WiFi?`);
  }
}

const btnUpload = document.getElementById('btn-upload');
if (btnUpload) {
  btnUpload.addEventListener('click', () => {
    if (confirm('El programa se enviará al ESP32 vía WiFi y comenzará a ejecutarse de inmediato. ¿Continuar?')) {
      sendToESP32('/program');
    }
  });
}

/* ---------- ESTADO INICIAL DE EJEMPLO (Blink) ---------- */
function loadDemo() {
  const setupZone = document.getElementById('setup-zone');
  const loopZone  = document.getElementById('loop-zone');
  setupZone.appendChild(createBlockElement('serialBegin', { baud: 115200 }));
  setupZone.appendChild(createBlockElement('pinMode',     { pin: 2, mode: 'OUTPUT' }));
  loopZone.appendChild(createBlockElement('analogRead',   { pin: 34, var: 'potValue' }));
  loopZone.appendChild(createBlockElement('mapValue',     { src: 'potValue', fromLow: 0, fromHigh: 4095, toLow: 0, toHigh: 255, dst: 'brightness' }));
  loopZone.appendChild(createBlockElement('analogWrite',  { pin: 2, value: 'brightness' }));
  loopZone.appendChild(createBlockElement('serialPrint',  { text: 'potValue', tipo: 'variable' }));
  loopZone.appendChild(createBlockElement('delay',        { ms: 10 }));
  updatePreview();
}
loadDemo();
