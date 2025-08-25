Sports, [25-Aug-25 11:41 AM]
// CONFIG
const PLAYLIST_URL = 'https://raw.githubusercontent.com/cfshorts/Fstv24-7/refs/heads/main/FSTV24.m3u8';
const BATCH = 80; // initial batch size
const AD_URL = 'https://www.effectiveratecpm.com/p6z2dgj0?key=a6119989a3bcbd81864f3300c5394f67';
const FALLBACK_LOGO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%23111"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="%23aaa" font-family="Arial" font-size="18">No Logo</text></svg>';

// DOM
const container = document.getElementById('channel-container');
const loader = document.getElementById('loader');
const searchInput = document.getElementById('search');
const yearEl = document.getElementById('year');
const modal = document.getElementById('player-modal');
const closeBtn = document.getElementById('close-modal');
const videoEl = document.getElementById('player');
const tipEl = document.getElementById('tip');

yearEl.textContent = new Date().getFullYear();

let allChannels = [];
let viewChannels = [];
let loaded = 0;
let adClickCount = Number(localStorage.getItem('adClickCount') || '0');

// Parse channel line headers (if any): url?|Referer=...&Origin=...&User-Agent=...
function parseUrlAndHeaders(rawUrl) {
  const [base, hdr] = rawUrl.split('|');
  const headers = {};
  if (hdr) {
    hdr.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) headers[k.trim().toLowerCase()] = decodeURIComponent(v.trim());
    });
  }
  return { baseUrl: (base || '').trim(), headers, hasHeader: !!hdr };
}

// Fetch playlist (directly; no worker)
async function fetchPlaylistText() {
  const res = await fetch(PLAYLIST_URL);
  if (!res.ok) throw new Error('Playlist fetch failed');
  return await res.text();
}

// Parse .m3u
function parseM3U(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    if (L.startsWith('#EXTINF')) {
      const nameMatch = L.match(/,(.*)$/);
      const logoMatch = L.match(/tvg-logo="([^"]*)"/i);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
      const logo = logoMatch ? logoMatch[1].trim() : '';
      const url = (lines[i + 1] || '').trim();
      if (url && !url.startsWith('#')) out.push({ name, logo, url });
    }
  }
  return out;
}

// Card template
function cardTemplate(ch, idx) {
  const div = document.createElement('div');
  div.className = 'card';
  const img = document.createElement('img');
  img.className = 'logo'; img.loading = 'lazy';
  img.src = ch.logo || FALLBACK_LOGO; img.alt = ch.name;
  img.onerror = () => { img.src = FALLBACK_LOGO; };
  const p = document.createElement('p');
  p.className = 'title'; p.textContent = ch.name || 'Unknown';
  div.append(img, p);
  div.addEventListener('click', () => onPlay(ch, idx));
  return div;
}

// Ad every 3 clicks (global)
function maybeOpenAd() {
  adClickCount += 1;
  localStorage.setItem('adClickCount', String(adClickCount));
  if (adClickCount % 3 === 0) {
    try { window.open(AD_URL, '_blank', 'noopener'); } catch(e) {}
  }
}

// Open player (direct for plain .m3u8; show tip if headers required)
function onPlay(ch, idx) {
  maybeOpenAd();

  const { baseUrl, hasHeader } = parseUrlAndHeaders(ch.url);

  // If the channel requires Referer/Origin headers, we can't set that from browser without a proxy.
  if (hasHeader) {
    openModal();
    showTip("This channel is protected (needs Referer/Origin). Configure proxy later to play it.");
    stopVideo();
    return;
  }

  // Direct play path
  openModal();
  hideTip();

  // HLS.js path
  if (window.Hls && Hls.isSupported()) {
    if (window._hls) { try { window._hls.destroy(); } catch(e) {} }
    const hls = new Hls({ lowLatencyMode: true });

Sports, [25-Aug-25 11:41 AM]
window._hls = hls;
    hls.loadSource(baseUrl);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { videoEl.play().catch(()=>{}); });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data && data.fatal) {
        try { hls.destroy(); } catch(e) {}
        // basic fallback
        videoEl.src = baseUrl;
        videoEl.play().catch(()=>{});
      }
    });
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    videoEl.src = baseUrl;
    videoEl.play().catch(()=>{});
  } else {
    // Fallback
    videoEl.src = baseUrl;
    videoEl.play().catch(()=>{});
  }
}

// Modal helpers
function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}
function stopVideo() {
  try { if (window._hls) window._hls.destroy(); } catch(e) {}
  videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load();
}
function hideTip(){ tipEl.hidden = true; }
function showTip(msg){ tipEl.textContent = msg; tipEl.hidden = false; }

closeBtn.addEventListener('click', () => {
  stopVideo();
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
});

// Render batches
function renderNextBatch() {
  const slice = viewChannels.slice(loaded, loaded + BATCH);
  slice.forEach((ch, i) => container.appendChild(cardTemplate(ch, loaded + i)));
  loaded += slice.length;
  loader.style.display = loaded >= viewChannels.length ? 'none' : 'block';
}

function applySearch() {
  const term = searchInput.value.trim().toLowerCase();
  container.innerHTML = '';
  loaded = 0;
  viewChannels = term ? allChannels.filter(c => c.name.toLowerCase().includes(term)) : allChannels.slice();
  renderNextBatch();
}

window.addEventListener('scroll', () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
  if (nearBottom && loaded < viewChannels.length) renderNextBatch();
});
searchInput.addEventListener('input', applySearch);

// Init
(async function init() {
  try {
    const txt = await fetchPlaylistText();
    allChannels = parseM3U(txt);
    viewChannels = allChannels.slice();
    renderNextBatch(); // first 80 on load
  } catch (e) {
    loader.textContent = 'Failed to load playlist.';
    console.error(e);
  }
})();