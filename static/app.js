function readMapViewCookie() {
  const raw = document.cookie.split('; ').find(item => item.startsWith('urbexatlas-map-view='))?.split('=')[1];
  if (!raw) return null;
  try {
    const view = JSON.parse(decodeURIComponent(raw));
    if (Number.isFinite(view.lat) && Number.isFinite(view.lng) && Number.isFinite(view.zoom)) return view;
  } catch (_) {}
  return null;
}
function saveMapViewCookie() {
  const center = map.getCenter();
  const view = {lat: Number(center.lat.toFixed(7)), lng: Number(center.lng.toFixed(7)), zoom: map.getZoom()};
  document.cookie = `urbexatlas-map-view=${encodeURIComponent(JSON.stringify(view))}; Max-Age=31536000; Path=/; SameSite=Lax`;
}
const savedMapView = readMapViewCookie();
const map = L.map('map').setView(savedMapView ? [savedMapView.lat, savedMapView.lng] : [51.1657, 10.4515], savedMapView?.zoom ?? 6);
const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'});
const satelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google'});
satelliteTiles.addTo(map);
const layers = {markers: new Map(), arrows: new Map(), labels: new Map()};
let data = {spots: [], arrows: [], labels: []};
let addMode = false, arrowMode = false, labelMode = false, arrowStart = null, pendingCoords = null;
const $ = id => document.getElementById(id);
function makeSpotIcon(colorValue) { return L.divIcon({className: 'spot-marker', html: `<span style="background:${colorValue || '#d86b3f'}"></span>`, iconSize: [16,16], iconAnchor: [8,8]}); }
function makeLabelIcon(label) { return L.divIcon({className: 'map-label', html: `<span style="color:${label.color || '#ffffff'};font-size:${label.font_size || 16}px">${esc(label.text)}</span>`, iconSize: null, iconAnchor: [0, 0]}); }
function setTileLayer(layer, activeButton) { map.eachLayer(item => { if (item === osmTiles || item === satelliteTiles) map.removeLayer(item); }); layer.addTo(map); document.querySelectorAll('.map-btn').forEach(button => button.classList.remove('active')); activeButton.classList.add('active'); }
map.on('moveend', saveMapViewCookie);

async function api(path, options = {}) {
  const res = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || 'Serverfehler');
  return payload;
}
function esc(text) { const div = document.createElement('div'); div.textContent = text ?? ''; return div.innerHTML; }
function spotById(id) { return data.spots.find(s => s.id === Number(id)); }
function setHint(text) { $('hint').textContent = text; }
function setMode(mode) {
  addMode = mode === 'add'; arrowMode = mode === 'arrow'; labelMode = mode === 'label'; arrowStart = null;
  $('addSpotBtn').classList.toggle('active', addMode); $('arrowModeBtn').classList.toggle('active', arrowMode); $('addLabelBtn').classList.toggle('active', labelMode);
  map.getContainer().style.cursor = (addMode || arrowMode || labelMode) ? 'crosshair' : '';
  setHint(addMode ? 'Klicke auf einen Punkt der Karte, um die Koordinaten zu übernehmen.' : arrowMode ? 'Klicke zuerst auf den Startspot, danach auf den Zielspot.' : labelMode ? 'Klicke auf die Karte, um eine Beschriftung zu platzieren.' : 'Klicke auf „Spot markieren“, dann auf einen Punkt der Karte.');
}
function render() {
  for (const marker of layers.markers.values()) marker.remove();
  for (const item of layers.arrows.values()) { item.line.remove(); item.decorator?.remove(); }
  for (const label of layers.labels.values()) label.remove();
  layers.markers.clear(); layers.arrows.clear(); layers.labels.clear();
  data.spots.forEach(spot => {
    const marker = L.marker([spot.latitude, spot.longitude], {icon: makeSpotIcon(spot.color)}).addTo(map);
    marker.bindPopup(`<strong>${esc(spot.name)}</strong><br><small>${esc(spot.description || 'Keine Beschreibung')}</small><br><small>${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}</small>`);
    marker.on('click', () => { if (arrowMode) chooseArrowSpot(spot); });
    layers.markers.set(spot.id, marker);
  });
  data.arrows.forEach(arrow => {
    const from = spotById(arrow.from_spot_id), to = spotById(arrow.to_spot_id); if (!from || !to) return;
    const line = L.polyline([[from.latitude, from.longitude], [to.latitude, to.longitude]], {color:arrow.color || '#d86b3f', weight:3, opacity:.85}).addTo(map);
    let decorator; if (L.polylineDecorator) decorator = L.polylineDecorator(line, {patterns:[{offset:'100%', repeat:0, symbol:L.Symbol.arrowHead({pixelSize:22, polygon:false, pathOptions:{stroke:true, color:arrow.color || '#d86b3f', weight:3}})}]}).addTo(map);
    layers.arrows.set(arrow.id, {line, decorator});
  });
  data.labels.forEach(label => {
    const marker = L.marker([label.latitude, label.longitude], {icon: makeLabelIcon(label), draggable: true}).addTo(map);
    marker.on('click', () => openLabelDialog({lat: label.latitude, lng: label.longitude}, label));
    marker.on('dragend', async event => {
      const position = event.target.getLatLng();
      await api(`/api/labels/${label.id}`, {method:'PATCH', body:JSON.stringify({latitude:position.lat, longitude:position.lng})});
      await reload();
    });
    layers.labels.set(label.id, marker);
  });
  $('spotCount').textContent = data.spots.length; $('arrowCount').textContent = data.arrows.length; $('labelCount').textContent = data.labels.length;
  $('spotList').className = 'list' + (data.spots.length ? '' : ' empty'); $('arrowList').className = 'list' + (data.arrows.length ? '' : ' empty'); $('labelList').className = 'list' + (data.labels.length ? '' : ' empty');
  $('spotList').innerHTML = data.spots.length ? data.spots.map(s => `<div class="item"><div class="item-main"><div class="item-title">${esc(s.name)}</div><div class="item-meta">${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</div></div><input class="item-color" type="color" value="${s.color || '#d86b3f'}" title="Markerfarbe speichern" data-color-spot="${s.id}"><button class="delete" title="Spot löschen" data-delete-spot="${s.id}">×</button></div>`).join('') : 'Noch keine Spots angelegt.';
  $('labelList').innerHTML = data.labels.length ? data.labels.map(label => `<div class="item"><div class="item-main"><button class="item-link" data-edit-label="${label.id}">${esc(label.text)}</button><div class="item-meta">${label.font_size}px · ${label.latitude.toFixed(4)}, ${label.longitude.toFixed(4)}</div></div><input class="item-color" type="color" value="${label.color || '#ffffff'}" title="Textfarbe speichern" data-color-label="${label.id}"><button class="delete" title="Beschriftung löschen" data-delete-label="${label.id}">×</button></div>`).join('') : 'Noch keine Beschriftungen angelegt.';
  $('arrowList').innerHTML = data.arrows.length ? data.arrows.map(a => `<div class="item"><div class="item-main"><div class="item-title">${esc(spotById(a.from_spot_id)?.name || '?')} → ${esc(spotById(a.to_spot_id)?.name || '?')}</div><div class="item-meta">${esc(a.label || 'Verbindung')}</div></div><input class="item-color" type="color" value="${a.color || '#d86b3f'}" title="Pfeilfarbe speichern" data-color-arrow="${a.id}"><button class="delete" title="Pfeil löschen" data-delete-arrow="${a.id}">×</button></div>`).join('') : 'Noch keine Verbindungen angelegt.';
}
async function reload() { data = await api('/api/data'); render(); }
function openSpotDialog(latlng) { pendingCoords = latlng; $('coords').textContent = `Koordinaten: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; $('spotForm').reset(); $('spotDialog').showModal(); setMode(null); setTimeout(() => $('spotForm').elements.name.focus(), 50); }
function openLabelDialog(latlng, label = null) { pendingCoords = latlng; $('labelForm').dataset.editId = label?.id || ''; $('labelDialogTitle').textContent = label ? 'Beschriftung bearbeiten' : 'Beschriftung setzen'; $('labelCoords').textContent = `Koordinaten: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; $('labelForm').elements.text.value = label?.text || ''; $('labelForm').elements.color.value = label?.color || '#ffffff'; $('labelForm').elements.font_size.value = label?.font_size || 16; $('fontSizeOutput').textContent = label?.font_size || 16; $('labelDialog').showModal(); setMode(null); setTimeout(() => $('labelForm').elements.text.focus(), 50); }
function chooseArrowSpot(spot) { if (!arrowStart) { arrowStart = spot; setHint(`Start: „${spot.name}“. Jetzt den Zielspot anklicken.`); return; } if (arrowStart.id === spot.id) return setHint('Start und Ziel müssen unterschiedliche Spots sein.'); const from = arrowStart; arrowStart = null; api('/api/arrows', {method:'POST', body:JSON.stringify({from_spot_id:from.id, to_spot_id:spot.id})}).then(() => reload()).then(() => setHint(`Pfeil von „${from.name}“ nach „${spot.name}“ gespeichert.`)).catch(e => setHint(e.message)); }
$('addSpotBtn').onclick = () => setMode(addMode ? null : 'add'); $('addLabelBtn').onclick = () => setMode(labelMode ? null : 'label'); $('arrowModeBtn').onclick = () => setMode(arrowMode ? null : 'arrow');
map.on('click', e => { if (addMode) openSpotDialog(e.latlng); else if (labelMode) openLabelDialog(e.latlng); });
$('spotForm').addEventListener('submit', async e => { e.preventDefault(); const form = new FormData(e.target); try { await api('/api/spots', {method:'POST', body:JSON.stringify({name:form.get('name'), description:form.get('description'), color:form.get('color'), latitude:pendingCoords.lat, longitude:pendingCoords.lng})}); $('spotDialog').close(); await reload(); } catch (err) { alert(err.message); } });
$('spotForm').addEventListener('close', () => setMode(null));
$('labelForm').elements.font_size.addEventListener('input', e => $('fontSizeOutput').textContent = e.target.value);
$('labelForm').addEventListener('submit', async e => { e.preventDefault(); const form = new FormData(e.target); const editId = e.target.dataset.editId; const payload = {text:form.get('text'), color:form.get('color'), font_size:Number(form.get('font_size')), latitude:pendingCoords.lat, longitude:pendingCoords.lng}; try { await api(editId ? `/api/labels/${editId}` : '/api/labels', {method:editId ? 'PATCH' : 'POST', body:JSON.stringify(payload)}); $('labelDialog').close(); await reload(); } catch (err) { alert(err.message); } });
$('labelForm').addEventListener('close', () => setMode(null));
$('spotList').addEventListener('click', async e => { const id = e.target.dataset.deleteSpot; if (id && confirm('Spot und seine Pfeile löschen?')) { await api(`/api/spots/${id}`, {method:'DELETE'}); reload(); } });
$('labelList').addEventListener('click', async e => { const deleteId = e.target.dataset.deleteLabel; const editId = e.target.dataset.editLabel; if (deleteId && confirm('Beschriftung löschen?')) { await api(`/api/labels/${deleteId}`, {method:'DELETE'}); reload(); } else if (editId) { const label = data.labels.find(item => item.id === Number(editId)); if (label) openLabelDialog({lat:label.latitude, lng:label.longitude}, label); } });
$('labelList').addEventListener('change', async e => { const id = e.target.dataset.colorLabel; if (id) { await api(`/api/labels/${id}`, {method:'PATCH', body:JSON.stringify({color:e.target.value})}); reload(); } });
$('arrowList').addEventListener('click', async e => { const id = e.target.dataset.deleteArrow; if (id && confirm('Pfeil löschen?')) { await api(`/api/arrows/${id}`, {method:'DELETE'}); reload(); } });
$('spotList').addEventListener('change', async e => { const id = e.target.dataset.colorSpot; if (id) { await api(`/api/spots/${id}`, {method:'PATCH', body:JSON.stringify({color:e.target.value})}); reload(); } });
$('arrowList').addEventListener('change', async e => { const id = e.target.dataset.colorArrow; if (id) { await api(`/api/arrows/${id}`, {method:'PATCH', body:JSON.stringify({color:e.target.value})}); reload(); } });
$('osmBtn').onclick = () => setTileLayer(osmTiles, $('osmBtn'));
$('satelliteBtn').onclick = () => setTileLayer(satelliteTiles, $('satelliteBtn'));
$('mobileMenuBtn').onclick = () => { const open = $('sidebar').classList.toggle('open'); $('mobileMenuBtn').setAttribute('aria-expanded', open); $('mobileMenuBtn').textContent = open ? '×' : '☰'; };
document.querySelectorAll('.sidebar button').forEach(button => button.addEventListener('click', () => { if (window.matchMedia('(max-width: 760px)').matches && button.id !== 'mobileMenuBtn') { $('sidebar').classList.remove('open'); $('mobileMenuBtn').setAttribute('aria-expanded', 'false'); $('mobileMenuBtn').textContent = '☰'; } }));
reload().catch(() => { $('statusText').textContent = 'Backend nicht erreichbar'; document.querySelector('.dot').style.background = '#d86b3f'; });
