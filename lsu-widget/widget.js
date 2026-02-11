(function () {
  const DATA_URL = '/data/lsu_events.json';
  const SOURCES_URL = '/data/sources.json';
  const STORAGE_KEY = 'lsuWidgetNotifications';
  const VIEW_LABELS = {
    live: 'Live Now',
    week: 'This Week',
    calendar: 'Full Calendar'
  };
  const CATEGORY_OPTIONS = [
    { value: 'all', label: 'All categories' },
    { value: 'Athletics', label: 'Athletics' },
    { value: 'Campus', label: 'Campus life' },
    { value: 'Academic', label: 'Academic' }
  ];

  class LSUWidget {
    constructor(root) {
      this.root = root;
      this.root.classList.add('lsu-widget');
      this.state = {
        view: 'live',
        category: 'all',
        search: '',
        now: new Date(),
        notifications: this.getNotificationPreference()
      };
      this.loading = true;
      this.renderSkeleton();
      this.refresh();
      this.startClock();
    }

    startClock() {
      setInterval(() => {
        this.state.now = new Date();
        if (this.data) {
          this.render();
        }
      }, 60_000);
    }

    async refresh() {
      this.setLoading(true);
      try {
        const [eventsRes, sourcesRes] = await Promise.all([
          fetch(`${DATA_URL}?ts=${Date.now()}`),
          fetch(`${SOURCES_URL}?ts=${Date.now()}`)
        ]);
        if (!eventsRes.ok) throw new Error('Failed to load events');
        if (!sourcesRes.ok) throw new Error('Failed to load sources');
        this.data = await eventsRes.json();
        this.sources = await sourcesRes.json();
        this.error = null;
      } catch (error) {
        console.error('[LSU Widget] fetch failed', error);
        this.error = error.message;
      } finally {
        this.setLoading(false);
        this.render();
      }
    }

    setLoading(flag) {
      this.loading = flag;
      this.root.classList.toggle('lsu-widget--loading', !!flag);
    }

    getNotificationPreference() {
      try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
      } catch (_) {
        return false;
      }
    }

    setNotificationPreference(value) {
      try {
        localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
      } catch (_) {
        /* ignore */
      }
    }

    renderSkeleton() {
      this.root.innerHTML = `
        <div class="lsu-widget__skeleton">
          <div class="lsu-widget__skeleton-row"></div>
          <div class="lsu-widget__skeleton-grid">
            <div></div><div></div><div></div>
          </div>
          <div class="lsu-widget__skeleton-cards">
            <div></div><div></div><div></div>
          </div>
        </div>`;
    }

    render() {
      if (this.error) {
        this.root.innerHTML = `
          <div class="lsu-widget__error">
            <p>We couldn't reach LSU data just now.</p>
            <button class="lsu-widget__button lsu-widget__button--primary js-refresh">Retry</button>
          </div>`;
        this.root.querySelector('.js-refresh').addEventListener('click', () => this.refresh());
        return;
      }

      if (!this.data) {
        this.renderSkeleton();
        return;
      }

      const { events = [], timezone = 'America/Chicago', updated_at, highlights = [], deadline_radar = [] } = this.data;
      const filteredEvents = this.applyFilters(events);
      const viewEvents = {
        live: filteredEvents.filter((evt) => this.isLive(evt)),
        week: filteredEvents.filter((evt) => this.isWithinWeek(evt)),
        calendar: filteredEvents
      };

      const statsRow = this.buildStats(viewEvents, timezone, updated_at);
      const highlightCards = this.buildHighlights(events, highlights);
      const timeline = this.buildTimeline(filteredEvents);
      const radar = this.buildDeadlineRadar(deadline_radar, events);
      const quickLinks = this.buildQuickLinks();
      const sourceSummary = this.buildSourceSummary();

      this.root.innerHTML = `
        <header class="lsu-widget__hero">
          <div>
            <p class="lsu-widget__eyebrow">Live LSU signal</p>
            <h2>LSU Live Widget</h2>
            <p class="lsu-widget__intro">Unified athletics, campus, and academic radar built for static embeds.</p>
          </div>
          <button class="lsu-widget__notification ${this.state.notifications ? 'is-on' : ''} js-notify">
            ${this.state.notifications ? 'Notifications enabled' : 'Enable notifications'}
          </button>
        </header>

        ${statsRow}

        <div class="lsu-widget__layout">
          <section class="lsu-widget__panel lsu-widget__panel--primary">
            <div class="lsu-widget__tabs">
              ${Object.keys(VIEW_LABELS)
                .map(
                  (view) => `
                    <button class="lsu-widget__tab ${this.state.view === view ? 'is-active' : ''}" data-view="${view}">
                      ${VIEW_LABELS[view]}
                    </button>`
                )
                .join('')}
            </div>
            <div class="lsu-widget__filters">
              <select class="lsu-widget__select">
                ${CATEGORY_OPTIONS.map(
                  (option) => `
                    <option value="${option.value}" ${option.value === this.state.category ? 'selected' : ''}>
                      ${option.label}
                    </option>`
                ).join('')}
              </select>
              <input class="lsu-widget__search" type="search" placeholder="Search LSU events" value="${this.state.search}">
            </div>
            ${this.renderViewPanes(viewEvents)}
          </section>

          <aside class="lsu-widget__panel lsu-widget__panel--secondary">
            <section>
              <div class="lsu-widget__section-head">
                <h3>Next up</h3>
                <span>Auto-highlighted</span>
              </div>
              <div class="lsu-widget__highlight-grid">${highlightCards}</div>
            </section>

            <section>
              <div class="lsu-widget__section-head">
                <h3>Countdown lane</h3>
                <span>Closest arrivals</span>
              </div>
              ${timeline}
            </section>

            <section>
              <div class="lsu-widget__section-head">
                <h3>Deadline radar</h3>
                <span>Academic focus</span>
              </div>
              ${radar}
            </section>

            <section>
              <div class="lsu-widget__section-head">
                <h3>Quick launch</h3>
                <span>Open in new tab</span>
              </div>
              ${quickLinks}
            </section>

            <section>
              <div class="lsu-widget__section-head">
                <h3>Source health</h3>
                <span>Status & latency</span>
              </div>
              ${sourceSummary}
            </section>
          </aside>
        </div>
      `;

      this.attachEvents();
    }

    renderViewPanes(viewEvents) {
      return `
        <div class="lsu-widget__panes">
          ${Object.keys(VIEW_LABELS)
            .map(
              (view) => `
                <section class="lsu-widget__pane ${this.state.view === view ? 'is-active' : ''}" data-view="${view}">
                  ${this.renderEvents(viewEvents[view])}
                </section>`
            )
            .join('')}
        </div>`;
    }

    attachEvents() {
      this.root.querySelectorAll('.lsu-widget__tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          this.state.view = tab.dataset.view;
          this.render();
        });
      });

      const select = this.root.querySelector('.lsu-widget__select');
      select?.addEventListener('change', (event) => {
        this.state.category = event.target.value;
        this.render();
      });

      const search = this.root.querySelector('.lsu-widget__search');
      search?.addEventListener('input', (event) => {
        this.state.search = event.target.value;
        this.render();
      });

      const notifyButton = this.root.querySelector('.js-notify');
      notifyButton?.addEventListener('click', () => {
        this.state.notifications = !this.state.notifications;
        this.setNotificationPreference(this.state.notifications);
        this.render();
      });

      this.root.querySelectorAll('.js-add-to-calendar').forEach((button) => {
        button.addEventListener('click', () => {
          const eventId = button.dataset.event;
          const event = (this.data?.events || []).find((evt) => evt.id === eventId);
          if (event) this.downloadICS(event);
        });
      });
    }

    applyFilters(events) {
      const term = this.state.search.trim().toLowerCase();
      return events
        .filter((event) => {
          if (this.state.category !== 'all' && event.category !== this.state.category) return false;
          if (!term) return true;
          return [event.title, event.location, event.status].some((field) => field?.toLowerCase().includes(term));
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    }

    isLive(event) {
      const now = this.state.now.getTime();
      const start = new Date(event.start).getTime();
      const end = event.end ? new Date(event.end).getTime() : start + 2 * 60 * 60 * 1000;
      return now >= start && now <= end;
    }

    isWithinWeek(event) {
      const now = this.state.now.getTime();
      const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
      const start = new Date(event.start).getTime();
      return start >= now && start <= weekAhead;
    }

    renderEvents(events) {
      if (!events || events.length === 0) {
        return '<div class="lsu-widget__empty">No events match your filters.</div>';
      }
      return `
        <div class="lsu-widget__cards">
          ${events
            .map(
              (event) => `
                <article class="lsu-widget__card">
                  <div class="lsu-widget__card-head">
                    <span class="lsu-widget__pill">${event.category || 'LSU'}</span>
                    <span class="lsu-widget__countdown">${this.formatCountdown(event.start)}</span>
                  </div>
                  <h4>${event.title}</h4>
                  <p class="lsu-widget__time">${this.formatRange(event.start, event.end)}</p>
                  ${event.location ? `<p class="lsu-widget__location">${event.location}</p>` : ''}
                  <div class="lsu-widget__card-actions">
                    <button class="lsu-widget__button lsu-widget__button--primary js-add-to-calendar" data-event="${event.id}">
                      Add to calendar
                    </button>
                    ${event.url ? `<a class="lsu-widget__button lsu-widget__button--ghost" href="${event.url}" target="_blank" rel="noopener">Details</a>` : ''}
                  </div>
                </article>`
            )
            .join('')}
        </div>`;
    }

    buildHighlights(events, highlightIds) {
      if (!events.length) {
        return '<div class="lsu-widget__empty">Nothing to highlight yet.</div>';
      }
      const highlighted = highlightIds
        .map((id) => events.find((evt) => evt.id === id))
        .filter(Boolean)
        .slice(0, 3);
      const fallback = highlighted.length ? highlighted : events.slice(0, 3);
      return fallback
        .map(
          (event) => `
            <article class="lsu-widget__highlight-card">
              <span class="lsu-widget__pill">${event.category || 'LSU'}</span>
              <h4>${event.title}</h4>
              <p>${this.formatRange(event.start, event.end)}</p>
              <span class="lsu-widget__tag">${this.formatCountdown(event.start)}</span>
            </article>`
        )
        .join('');
    }

    buildTimeline(events) {
      if (!events.length) {
        return '<div class="lsu-widget__empty">No upcoming events captured.</div>';
      }
      const upcoming = events
        .filter((evt) => new Date(evt.start) > this.state.now)
        .slice(0, 4);
      return `
        <ul class="lsu-widget__timeline">
          ${upcoming
            .map(
              (event) => `
                <li>
                  <div>
                    <strong>${this.formatDate(event.start)}</strong>
                    <span>${this.formatCountdown(event.start)}</span>
                  </div>
                  <p>${event.title}</p>
                </li>`
            )
            .join('')}
        </ul>`;
    }

    buildDeadlineRadar(radar, events) {
      const list = radar.length
        ? radar
        : events
            .filter((evt) => evt.category === 'Academic' || evt.status === 'deadline')
            .slice(0, 5)
            .map((evt) => ({ id: evt.id, title: evt.title, date: evt.start }));
      if (!list.length) {
        return '<div class="lsu-widget__empty">No academic deadlines on record.</div>';
      }
      return `
        <ul class="lsu-widget__deadline">
          ${list
            .map(
              (item) => `
                <li>
                  <strong>${this.formatDate(item.date)}</strong>
                  <p>${item.title}</p>
                </li>`
            )
            .join('')}
        </ul>`;
    }

    buildQuickLinks() {
      const links = [
        { label: 'Athletics hub', href: 'https://lsusports.net' },
        { label: 'Ticket office', href: 'https://lsusports.net/tickets/' },
        { label: 'Campus events', href: 'https://calendar.lsu.edu' },
        { label: 'Academic calendar', href: 'https://www.lsu.edu/registrar/AcademicCalendar/' },
        { label: 'Campus map', href: 'https://map.lsu.edu' }
      ];
      return `
        <ul class="lsu-widget__links">
          ${links
            .map((link) => `<li><a href="${link.href}" target="_blank" rel="noopener">${link.label}</a></li>`)
            .join('')}
        </ul>`;
    }

    buildStats(viewEvents, timezone, updatedAt) {
      const liveCount = viewEvents.live.length;
      const weekCount = viewEvents.week.length;
      const totalSources = this.sources?.sources?.length || 0;
      const healthySources = this.sources?.sources?.filter((src) => src.status === 'ok').length || 0;
      return `
        <section class="lsu-widget__metrics">
          <article>
            <span>Live now</span>
            <strong>${liveCount}</strong>
            <p>Events happening this minute</p>
          </article>
          <article>
            <span>Within 7 days</span>
            <strong>${weekCount}</strong>
            <p>Scheduled this week</p>
          </article>
          <article>
            <span>Source health</span>
            <strong>${healthySources}/${totalSources}</strong>
            <p>${timezone} · updated ${this.formatRelative(updatedAt)}</p>
          </article>
        </section>`;
    }

    buildSourceSummary() {
      const sources = this.sources?.sources || [];
      if (!sources.length) {
        return '<div class="lsu-widget__empty">Source telemetry unavailable.</div>';
      }
      return `
        <ul class="lsu-widget__sources">
          ${sources
            .map(
              (src) => `
                <li>
                  <span class="lsu-widget__status-dot ${src.status === 'ok' ? 'is-ok' : src.status === 'error' ? 'is-error' : 'is-warn'}"></span>
                  <div>
                    <strong>${src.name}</strong>
                    <p>${src.status || 'unknown'}${src.events ? ` · ${src.events} events` : ''}</p>
                  </div>
                  ${src.latency_ms ? `<span>${src.latency_ms}ms</span>` : ''}
                </li>`
            )
            .join('')}
        </ul>`;
    }

    formatRange(start, end) {
      const startDate = new Date(start);
      const endDate = end ? new Date(end) : null;
      const sameDay = endDate && startDate.toDateString() === endDate.toDateString();
      const startStr = startDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      if (!endDate) return startStr;
      const endStr = endDate.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        ...(sameDay ? {} : { month: 'short', day: 'numeric' })
      });
      return `${startStr} · ${endStr}`;
    }

    formatDate(input) {
      return new Date(input).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }

    formatRelative(input) {
      if (!input) return 'recently';
      const diff = Date.now() - new Date(input).getTime();
      const minutes = Math.max(1, Math.round(diff / 60000));
      if (minutes < 60) return `${minutes} min ago`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} hr ago`;
      const days = Math.round(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    formatCountdown(input) {
      const diff = new Date(input).getTime() - Date.now();
      if (diff <= 0) return 'in progress';
      const minutes = Math.round(diff / 60000);
      if (minutes < 60) return `in ${minutes} min`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `in ${hours} hr`;
      const days = Math.round(hours / 24);
      return `in ${days} day${days === 1 ? '' : 's'}`;
    }

    downloadICS(event) {
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LSU Widget//EN',
        'BEGIN:VEVENT',
        `UID:${event.id}@lsu-widget`,
        `DTSTAMP:${this.toICSDate(new Date())}`,
        `DTSTART:${this.toICSDate(new Date(event.start))}`,
        `DTEND:${this.toICSDate(new Date(event.end || event.start))}`,
        `SUMMARY:${this.escapeICS(event.title)}`,
        event.location ? `LOCATION:${this.escapeICS(event.location)}` : null,
        event.url ? `URL:${this.escapeICS(event.url)}` : null,
        'END:VEVENT',
        'END:VCALENDAR'
      ]
        .filter(Boolean)
        .join('\n');
      const blob = new Blob([lines], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${event.id}.ics`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    toICSDate(date) {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    escapeICS(value) {
      return (value || '').replace(/,/g, '\\,').replace(/;/g, '\\;');
    }
  }

  function autoMount() {
    const mount = document.getElementById('lsu-widget');
    if (mount) new LSUWidget(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
