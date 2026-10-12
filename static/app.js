const map = L.map('map').setView([51.1657, 10.4515], 6);
const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'});
const satelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google'});
osmTiles.addTo(map);
const layers = {markers: new Map(), arrows: new Map()};
let data = {spots: [], arrows: []};
let addMode = false, arrowMode = false, arrowStart = null, pendingCoords = null;
let markerColor = localStorage.getItem('urbexatlas-marker-color') || '#d86b3f';
let arrowColor = localStorage.getItem('urbexatlas-arrow-color') || '#d86b3f';
const $ = id => document.getElementById(id);
function makeSpotIcon() { return L.divIcon({className: 'spot-marker', html: `<span style="background:${markerColor}"></span>`, iconSize: [16,16], iconAnchor: [8,8]}); }
function setTileLayer(layer, activeButton) { map.eachLayer(item => { if (item === osmTiles || item === satelliteTiles) map.removeLayer(item); }); layer.addTo(map); document.querySelectorAll('.map-btn').forEach(button => button.classList.remove('active')); activeButton.classList.add('active'); }

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
  addMode = mode === 'add'; arrowMode = mode === 'arrow'; arrowStart = null;
  $('addSpotBtn').classList.toggle('active', addMode); $('arrowModeBtn').classList.toggle('active', arrowMode);
  map.getContainer().style.cursor = (addMode || arrowMode) ? 'crosshair' : '';
  setHint(addMode ? 'Klicke auf einen Punkt der Karte, um die Koordinaten zu übernehmen.' : arrowMode ? 'Klicke zuerst auf den Startspot, danach auf den Zielspot.' : 'Klicke auf „Spot markieren“, dann auf einen Punkt der Karte.');
}
function render() {
  for (const marker of layers.markers.values()) marker.remove();
  for (const item of layers.arrows.values()) { item.line.remove(); item.decorator?.remove(); }
  layers.markers.clear(); layers.arrows.clear();
  data.spots.forEach(spot => {
    const marker = L.marker([spot.latitude, spot.longitude], {icon: makeSpotIcon()}).addTo(map);
    marker.bindPopup(`<strong>${esc(spot.name)}</strong><br><small>${esc(spot.description || 'Keine Beschreibung')}</small><br><small>${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}</small>`);
    marker.on('click', () => { if (arrowMode) chooseArrowSpot(spot); });
    layers.markers.set(spot.id, marker);
  });
  data.arrows.forEach(arrow => {
    const from = spotById(arrow.from_spot_id), to = spotById(arrow.to_spot_id); if (!from || !to) return;
    const line = L.polyline([[from.latitude, from.longitude], [to.latitude, to.longitude]], {color:arrowColor, weight:3, opacity:.85}).addTo(map);
    let decorator; if (L.polylineDecorator) decorator = L.polylineDecorator(line, {patterns:[{offset:'100%', repeat:0, symbol:L.Symbol.arrowHead({pixelSize:22, polygon:false, pathOptions:{stroke:true, color:arrowColor, weight:3}})}]}).addTo(map);
    layers.arrows.set(arrow.id, {line, decorator});
  });
  $('spotCount').textContent = data.spots.length; $('arrowCount').textContent = data.arrows.length;
  $('spotList').className = 'list' + (data.spots.length ? '' : ' empty'); $('arrowList').className = 'list' + (data.arrows.length ? '' : ' empty');
  $('spotList').innerHTML = data.spots.length ? data.spots.map(s => `<div class="item"><div class="item-main"><div class="item-title">${esc(s.name)}</div><div class="item-meta">${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</div></div><button class="delete" title="Spot löschen" data-delete-spot="${s.id}">×</button></div>`).join('') : 'Noch keine Spots angelegt.';
  $('arrowList').innerHTML = data.arrows.length ? data.arrows.map(a => `<div class="item"><div class="item-main"><div class="item-title">${esc(spotById(a.from_spot_id)?.name || '?')} → ${esc(spotById(a.to_spot_id)?.name || '?')}</div><div class="item-meta">${esc(a.label || 'Verbindung')}</div></div><button class="delete" title="Pfeil löschen" data-delete-arrow="${a.id}">×</button></div>`).join('') : 'Noch keine Verbindungen angelegt.';
}
async function reload() { data = await api('/api/data'); render(); }
function openSpotDialog(latlng) { pendingCoords = latlng; $('coords').textContent = `Koordinaten: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; $('spotForm').reset(); $('spotDialog').showModal(); setMode(null); setTimeout(() => $('spotForm').elements.name.focus(), 50); }
function chooseArrowSpot(spot) { if (!arrowStart) { arrowStart = spot; setHint(`Start: „${spot.name}“. Jetzt den Zielspot anklicken.`); return; } if (arrowStart.id === spot.id) return setHint('Start und Ziel müssen unterschiedliche Spots sein.'); const from = arrowStart; arrowStart = null; api('/api/arrows', {method:'POST', body:JSON.stringify({from_spot_id:from.id, to_spot_id:spot.id})}).then(() => reload()).then(() => setHint(`Pfeil von „${from.name}“ nach „${spot.name}“ gespeichert.`)).catch(e => setHint(e.message)); }
$('addSpotBtn').onclick = () => setMode(addMode ? null : 'add'); $('arrowModeBtn').onclick = () => setMode(arrowMode ? null : 'arrow');
map.on('click', e => { if (addMode) openSpotDialog(e.latlng); });
$('spotForm').addEventListener('submit', async e => { e.preventDefault(); const form = new FormData(e.target); try { await api('/api/spots', {method:'POST', body:JSON.stringify({name:form.get('name'), description:form.get('description'), latitude:pendingCoords.lat, longitude:pendingCoords.lng})}); $('spotDialog').close(); await reload(); } catch (err) { alert(err.message); } });
$('spotForm').addEventListener('close', () => setMode(null));
$('spotList').addEventListener('click', async e => { const id = e.target.dataset.deleteSpot; if (id && confirm('Spot und seine Pfeile löschen?')) { await api(`/api/spots/${id}`, {method:'DELETE'}); reload(); } });
$('arrowList').addEventListener('click', async e => { const id = e.target.dataset.deleteArrow; if (id && confirm('Pfeil löschen?')) { await api(`/api/arrows/${id}`, {method:'DELETE'}); reload(); } });
$('osmBtn').onclick = () => setTileLayer(osmTiles, $('osmBtn'));
$('satelliteBtn').onclick = () => setTileLayer(satelliteTiles, $('satelliteBtn'));
$('markerColor').value = markerColor; $('arrowColor').value = arrowColor;
$('markerColor').addEventListener('input', e => { markerColor = e.target.value; localStorage.setItem('urbexatlas-marker-color', markerColor); render(); });
$('arrowColor').addEventListener('input', e => { arrowColor = e.target.value; localStorage.setItem('urbexatlas-arrow-color', arrowColor); render(); });
reload().catch(() => { $('statusText').textContent = 'Backend nicht erreichbar'; document.querySelector('.dot').style.background = '#d86b3f'; });
