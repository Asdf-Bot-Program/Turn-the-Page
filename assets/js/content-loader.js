// ============================================================
//  Turn the Page — content-loader.js
//  Fetches CMS markdown files from GitHub and renders them
// ============================================================

// ------------------------------------------------------------
//  !! CONFIGURATION — Update both values before pushing !!
// ------------------------------------------------------------
const CONFIG = {
  repoOwner : 'Asdf-Bot-Program',   // e.g. 'jsmith'
  repoName  : 'Turn-the-Page',          // your actual repo name
  branch    : 'main',
};

const API_BASE = `https://api.github.com/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents`;
const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.repoOwner}/${CONFIG.repoName}/${CONFIG.branch}`;

// ============================================================
//  UTILITIES
// ============================================================

// ------------------------------------------------------------
//  Parse YAML frontmatter from a raw markdown string.
//  Returns { data: {}, body: '' }
// ------------------------------------------------------------
function parseFrontmatter(rawText) {
  const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: rawText };

  try {
    // jsyaml is loaded via CDN in each HTML page
    const data = jsyaml.load(match[1]) || {};
    const body = match[2].trim();
    return { data, body };
  } catch (err) {
    console.error('Frontmatter parse error:', err);
    return { data: {}, body: rawText };
  }
}

// ------------------------------------------------------------
//  Format an ISO date string into something human-readable
//  e.g. "2025-04-15T00:00:00.000Z" → "April 15, 2025"
// ------------------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ------------------------------------------------------------
//  Format just the day number and abbreviated month
//  e.g. "2025-04-15" → { day: '15', month: 'Apr' }
// ------------------------------------------------------------
function formatDateParts(dateStr) {
  if (!dateStr) return { day: '??', month: '???' };
  const d = new Date(dateStr);
  if (isNaN(d)) return { day: '??', month: '???' };
  return {
    day  : d.getDate().toString().padStart(2, '0'),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

// ------------------------------------------------------------
//  Slugify a filename (strip the .md extension)
// ------------------------------------------------------------
function slugFrom(filename) {
  return filename.replace(/\.md$/, '');
}

// ------------------------------------------------------------
//  Escape HTML to prevent XSS in text fields
// ------------------------------------------------------------
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------
//  Show a loading state inside a container
// ------------------------------------------------------------
function showLoading(el) {
  el.innerHTML = `
    <div class="content-loading">
      <span class="loading-ornament">✦</span>
      <p>The scribes are retrieving the records…</p>
    </div>`;
}

// ------------------------------------------------------------
//  Show an empty state inside a container
// ------------------------------------------------------------
function showEmpty(el, message) {
  el.innerHTML = `
    <div class="content-empty">
      <span class="content-empty-ornament">✦ ✦ ✦</span>
      <p>${esc(message)}</p>
    </div>`;
}

// ------------------------------------------------------------
//  Show an error state inside a container
// ------------------------------------------------------------
function showError(el, message) {
  el.innerHTML = `
    <div class="content-empty">
      <span class="content-empty-ornament">✦</span>
      <p style="color:var(--burgundy)">${esc(message)}</p>
    </div>`;
}

// ============================================================
//  FETCHING
// ============================================================

// ------------------------------------------------------------
//  Fetch the list of .md files from a GitHub folder.
//  Returns an array of { name, slug, downloadUrl } objects.
// ------------------------------------------------------------
async function fetchFolder(folder) {
  const res = await fetch(`${API_BASE}/${folder}`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (res.status === 404) return [];          // folder exists but is empty or missing
  if (res.status === 403) throw new Error('GitHub API rate limit reached. Please try again later.');
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const files = await res.json();
  return files
    .filter(f => f.name.endsWith('.md') && f.name !== '.gitkeep')
    .map(f => ({ name: f.name, slug: slugFrom(f.name), downloadUrl: f.download_url }));
}

// ------------------------------------------------------------
//  Fetch and parse a single markdown file.
//  Returns { slug, data, body }
// ------------------------------------------------------------
async function fetchAndParse(fileInfo) {
  const res  = await fetch(fileInfo.downloadUrl);
  const text = await res.text();
  const { data, body } = parseFrontmatter(text);
  return { slug: fileInfo.slug, data, body };
}

// ------------------------------------------------------------
//  Fetch all parsed entries from a folder.
//  Returns a sorted array of { slug, data, body } objects.
// ------------------------------------------------------------
async function loadFolder(folder, sortKey = 'date', sortAsc = false) {
  const files   = await fetchFolder(folder);
  if (!files.length) return [];
  const entries = await Promise.all(files.map(fetchAndParse));

  // Sort by the given frontmatter key
  entries.sort((a, b) => {
    const va = a.data[sortKey] || '';
    const vb = b.data[sortKey] || '';
    if (va < vb) return sortAsc ? -1 :  1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });

  return entries;
}

// ============================================================
//  RENDERERS — one per page type
// ============================================================

// ------------------------------------------------------------
//  NOTICEBOARD
// ------------------------------------------------------------
async function renderNoticeboard() {
  const el = document.getElementById('notice-list');
  if (!el) return;

  showLoading(el);

  try {
    const posts = await loadFolder('posts', 'date', false);

    if (!posts.length) {
      showEmpty(el, 'No announcements have been posted yet. Check back soon.');
      return;
    }

    el.innerHTML = posts.map(({ slug, data, body }) => `
      <article class="notice-card" id="${esc(slug)}">
        <span class="notice-tag">${esc(data.tag) || 'Guild News'}</span>
        <h2 class="notice-title">${esc(data.title)}</h2>
        <p class="notice-date">
          Posted by <span class="officer-name">${esc(data.officer)}</span>
          &nbsp;·&nbsp; ${formatDate(data.date)}
        </p>
        <div class="notice-body">${marked.parse(body)}</div>
      </article>
    `).join('');

  } catch (err) {
    console.error(err);
    showError(el, err.message || 'Could not load announcements. Please try again later.');
  }
}

// ------------------------------------------------------------
//  ROSTER — character card grid
// ------------------------------------------------------------
async function renderRoster() {
  const el = document.getElementById('roster-grid');
  if (!el) return;

  showLoading(el);

  try {
    const characters = await loadFolder('characters', 'character_name', true);

    if (!characters.length) {
      showEmpty(el, 'The roster is empty. Characters will appear here once added by an officer.');
      return;
    }

    el.innerHTML = characters.map(({ slug, data }) => {
      const portraitHTML = data.portrait
        ? `<img class="character-portrait" src="${esc(data.portrait)}" alt="Portrait of ${esc(data.character_name)}">`
        : `<div class="character-portrait-placeholder">⚜</div>`;

      const statusClass = {
        'Active'    : 'character-status--active',
        'Traveling' : 'character-status--traveling',
        'On Hiatus' : 'character-status--hiatus',
      }[data.character_status] || 'character-status--active';

      const classList = data.secondary_class
        ? `${esc(data.primary_class)} · ${esc(data.secondary_class)}`
        : esc(data.primary_class);

      // Use the first 120 characters of personality as a blurb
      const blurb = data.personality
        ? esc(data.personality).slice(0, 120) + (data.personality.length > 120 ? '…' : '')
        : '';

      return `
        <a href="character.html?slug=${esc(slug)}" class="character-card">
          ${portraitHTML}
          <div class="character-info">
            <h2 class="character-name">${esc(data.character_name)}</h2>
            <p class="character-meta">${esc(data.race)} &nbsp;·&nbsp; ${classList}</p>
            <span class="character-rank">${esc(data.guild_rank)}</span>
            <span class="character-status ${statusClass}">${esc(data.character_status)}</span>
            ${blurb ? `<p class="character-blurb">${blurb}</p>` : ''}
          </div>
        </a>`;
    }).join('');

  } catch (err) {
    console.error(err);
    showError(el, err.message || 'Could not load the roster. Please try again later.');
  }
}

// ------------------------------------------------------------
//  CHARACTER PROFILE — single character page
// ------------------------------------------------------------
async function renderCharacterProfile() {
  const main = document.getElementById('profile-main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    showError(main, 'No character specified.');
    return;
  }

  showLoading(main);

  try {
    const res  = await fetch(`${RAW_BASE}/characters/${slug}.md`);
    if (!res.ok) throw new Error('Character not found.');
    const text = await res.text();
    const { data: d } = parseFrontmatter(text);

    // Update page title
    document.title = `Turn the Page | ${d.character_name || 'Character Profile'}`;

    // Update banner
    const bannerTitle    = document.getElementById('profile-banner-title');
    const bannerSubtitle = document.getElementById('profile-banner-subtitle');
    if (bannerTitle)    bannerTitle.textContent    = d.character_name || 'Character Profile';
    if (bannerSubtitle) bannerSubtitle.textContent = `${d.race || ''} ${d.guild_rank ? '· ' + d.guild_rank : ''}`;

    const statusClass = {
      'Active'    : 'character-status--active',
      'Traveling' : 'character-status--traveling',
      'On Hiatus' : 'character-status--hiatus',
    }[d.character_status] || 'character-status--active';

    const classList = d.secondary_class
      ? `${esc(d.primary_class)} / ${esc(d.secondary_class)}`
      : esc(d.primary_class);

    // RP Hooks list
    let hooksHTML = '<p class="profile-field-value" style="font-style:italic;color:var(--ink-faint)">None listed.</p>';
    if (d.rp_hooks && Array.isArray(d.rp_hooks) && d.rp_hooks.length) {
      hooksHTML = `<ul class="rp-hooks-list">
        ${d.rp_hooks.map(h => `<li>${esc(h.hook || h)}</li>`).join('')}
      </ul>`;
    }

    main.innerHTML = `
      <div class="profile-layout">

        <!-- Header -->
        <div class="profile-header">
          ${d.portrait
            ? `<img class="profile-portrait" src="${esc(d.portrait)}" alt="Portrait of ${esc(d.character_name)}">`
            : `<div class="character-portrait-placeholder" style="border-radius:4px;border:3px solid var(--gold);height:300px;">⚜</div>`}
          <div class="profile-headline">
            <h2>${esc(d.character_name)}</h2>
            <p class="profile-subtitle">${esc(d.race)} &nbsp;·&nbsp; ${formatDate(d.date) || ''}</p>
            <div class="profile-badges">
              <span class="character-rank">${esc(d.guild_rank)}</span>
              <span class="character-status ${statusClass}">${esc(d.character_status)}</span>
            </div>
            <p><strong style="font-family:var(--font-heading);font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-faint)">Age:</strong>
               <span style="font-style:italic;color:var(--ink-light)"> ${esc(d.age)}</span></p>
            <p><strong style="font-family:var(--font-heading);font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-faint)">Pronouns:</strong>
               <span style="font-style:italic;color:var(--ink-light)"> ${esc(d.gender_pronouns)}</span></p>
            <p><strong style="font-family:var(--font-heading);font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-faint)">Class:</strong>
               <span style="font-style:italic;color:var(--ink-light)"> ${classList}</span></p>
            ${d.combat_style ? `<p style="margin-top:0.5rem;font-style:italic;color:var(--ink-light);font-size:0.9rem">${esc(d.combat_style)}</p>` : ''}
          </div>
        </div>

        <!-- Appearance -->
        <div class="profile-section">
          <h3 class="profile-section-title">Appearance</h3>
          ${field('Physical Description', d.physical_description)}
          ${field('Notable Features',     d.notable_features)}
        </div>

        <!-- Character -->
        <div class="profile-section">
          <h3 class="profile-section-title">Character</h3>
          ${field('Personality',       d.personality)}
          ${field('Strengths',         d.strengths)}
          ${field('Flaws & Weaknesses',d.flaws_weaknesses)}
          ${field('Fears',             d.fears)}
          ${field('Motivations & Goals',d.motivations_goals)}
        </div>

        <!-- Background -->
        <div class="profile-section">
          <h3 class="profile-section-title">Background</h3>
          ${field('Birthplace', d.birthplace)}
          ${field('Birthsign',  d.birthsign)}
          <div class="profile-field">
            <span class="profile-field-label">History & Backstory</span>
            <div class="profile-field-value">${d.backstory ? marked.parse(String(d.backstory)) : '<em>Not yet recorded.</em>'}</div>
          </div>
          ${d.secrets ? field('Secrets', d.secrets) : ''}
        </div>

        <!-- Guild Role -->
        <div class="profile-section">
          <h3 class="profile-section-title">Guild Role</h3>
          ${field('What They Bring to the Estate', d.contribution)}
          ${field('How They Found the Sugar Falls Estate', d.how_found)}
          ${field('Usual Corner at the Sugar Falls', d.usual_corner)}
          ${field('First Night at the Sugar Falls', d.first_night)}
          ${field('Notable Relationships', d.relationships)}
        </div>

        <!-- RP Hooks -->
        <div class="profile-section">
          <h3 class="profile-section-title">RP Hooks</h3>
          ${hooksHTML}
        </div>

        <!-- OOC -->
        <div class="profile-section profile-ooc">
          <h3 class="profile-section-title">Out of Character</h3>
          ${field('Player / Discord Handle', d.player_discord)}
          ${field('RP Preferences',          d.rp_preferences)}
          ${d.comfort_limits ? field('Comfort & Limits', d.comfort_limits) : ''}
        </div>

        <div style="margin-top:2rem;text-align:center">
          <a href="roster.html" class="btn btn--outline">← Back to the Roster</a>
        </div>
      </div>`;

  } catch (err) {
    console.error(err);
    showError(main, err.message || 'Could not load this character. Please try again later.');
  }
}

// Helper: render a single labelled field
function field(label, value) {
  if (!value) return '';
  return `
    <div class="profile-field">
      <span class="profile-field-label">${label}</span>
      <p class="profile-field-value">${esc(String(value))}</p>
    </div>`;
}

// ------------------------------------------------------------
//  STORY ARCHIVE — list page
// ------------------------------------------------------------
async function renderStories() {
  const el = document.getElementById('story-list');
  if (!el) return;

  showLoading(el);

  try {
    const stories = await loadFolder('stories', 'date', false);

    if (!stories.length) {
      showEmpty(el, 'No stories have been added yet. The road so far begins here.');
      return;
    }

    el.innerHTML = stories.map(({ slug, data }) => {
      const badgeClass = data.type === 'Prose'
        ? 'story-type-badge--prose'
        : 'story-type-badge--transcript';

      return `
        <a href="story.html?slug=${esc(slug)}" class="story-card">
          <span class="story-type-badge ${badgeClass}">${esc(data.type) || 'Session Transcript'}</span>
          <div class="story-info">
            <h2 class="story-title">${esc(data.title)}</h2>
            <p class="story-meta">
              ${formatDate(data.date)}
              ${data.arc ? `&nbsp;·&nbsp; <span class="story-arc">${esc(data.arc)}</span>` : ''}
            </p>
          </div>
        </a>`;
    }).join('');

  } catch (err) {
    console.error(err);
    showError(el, err.message || 'Could not load the story archive. Please try again later.');
  }
}

// ------------------------------------------------------------
//  STORY FULL PAGE — individual story/transcript
// ------------------------------------------------------------
async function renderStoryFull() {
  const main = document.getElementById('story-main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    showError(main, 'No story specified.');
    return;
  }

  showLoading(main);

  try {
    const res  = await fetch(`${RAW_BASE}/stories/${slug}.md`);
    if (!res.ok) throw new Error('Story not found.');
    const text = await res.text();
    const { data: d, body } = parseFrontmatter(text);

    document.title = `Turn the Page | ${d.title || 'Story'}`;

    const bannerTitle    = document.getElementById('story-banner-title');
    const bannerSubtitle = document.getElementById('story-banner-subtitle');
    if (bannerTitle)    bannerTitle.textContent    = d.title || 'Untitled';
    if (bannerSubtitle) bannerSubtitle.textContent =
      `${d.type || 'Session Transcript'} · ${formatDate(d.date)}${d.arc ? ' · ' + d.arc : ''}`;

    const badgeClass = d.type === 'Prose'
      ? 'story-type-badge--prose'
      : 'story-type-badge--transcript';

    main.innerHTML = `
      <div style="max-width:800px; margin:0 auto;">
        <div style="margin-bottom:1.5rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
          <span class="story-type-badge ${badgeClass}">${esc(d.type) || 'Session Transcript'}</span>
          ${d.arc ? `<span class="story-arc">${esc(d.arc)}</span>` : ''}
          <span style="font-style:italic; color:var(--ink-faint); font-size:0.85rem">${formatDate(d.date)}</span>
        </div>
        <div class="story-body prose-content">
          ${body ? marked.parse(body) : '<p><em>No content recorded yet.</em></p>'}
        </div>
        <div style="margin-top:2.5rem; text-align:center;">
          <a href="road-so-far.html" class="btn btn--outline">← Back to the Road So Far</a>
        </div>
      </div>`;

  } catch (err) {
    console.error(err);
    showError(main, err.message || 'Could not load this story. Please try again later.');
  }
}

// ------------------------------------------------------------
//  CALENDAR — events list
// ------------------------------------------------------------
async function renderEvents() {
  const el = document.getElementById('event-list');
  if (!el) return;

  showLoading(el);

  try {
    // Sort ascending by date so next events are first
    const events = await loadFolder('events', 'date', true);

    if (!events.length) {
      showEmpty(el, 'No events are currently scheduled. Check back soon.');
      return;
    }

    const now = new Date();
    // Separate upcoming vs past
    const upcoming = events.filter(e => !e.data.date || new Date(e.data.date) >= now);
    const past      = events.filter(e =>  e.data.date && new Date(e.data.date) <  now);

    function eventCard({ data: d }) {
      const { day, month } = formatDateParts(d.date);
      const openClass = d.open_to === 'Invite Only'
        ? 'event-open--invite'
        : 'event-open--all';

      return `
        <div class="event-card">
          <div class="event-date-block">
            <span class="event-date-day">${day}</span>
            <span class="event-date-month">${month}</span>
          </div>
          <div class="event-info">
            <h2 class="event-title">
              ${esc(d.title)}
              <span class="event-open ${openClass}">${esc(d.open_to) || 'All Members'}</span>
            </h2>
            <p class="event-ic">${esc(d.ic_premise)}</p>
            <p class="event-ooc">${esc(d.ooc_details)}</p>
          </div>
        </div>`;
    }

    let html = '';

    if (upcoming.length) {
      html += upcoming.map(eventCard).join('');
    } else {
      html += `<div class="content-empty">
        <span class="content-empty-ornament">✦ ✦ ✦</span>
        <p>No upcoming events at the moment.</p>
      </div>`;
    }

    if (past.length) {
      html += `
        <h3 style="font-family:var(--font-heading);color:var(--ink-faint);font-size:0.8rem;
                   letter-spacing:0.12em;text-transform:uppercase;text-align:center;
                   margin:2.5rem 0 1rem; opacity:0.7;">Past Events</h3>
        <div style="opacity:0.55">
          ${past.map(eventCard).join('')}
        </div>`;
    }

    el.innerHTML = html;

  } catch (err) {
    console.error(err);
    showError(el, err.message || 'Could not load events. Please try again later.');
  }
}

// ============================================================
//  INIT — detect current page and run the right renderer
// ============================================================
document.addEventListener('DOMContentLoaded', function init() {
  const path = window.location.pathname.split('/').pop() || 'index.html';

  const routes = {
    'noticeboard.html' : renderNoticeboard,
    'roster.html'      : renderRoster,
    'character.html'   : renderCharacterProfile,
    'road-so-far.html' : renderStories,
    'story.html'       : renderStoryFull,
    'calendar.html'    : renderEvents,
  };

  const renderer = routes[path];
  if (renderer) renderer();
})();
