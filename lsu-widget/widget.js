(function () {
  const DATA_URL = '/data/lsu_events.json';
  const SOURCES_URL = '/data/sources.json';
  const STORAGE_KEY = 'lsuWidgetNotifications';

  const VIEW_LABELS = {
    live: 'Live Now',
    week: 'This Week',
    calendar: 'Calendar'
  };

  const CATEGORY_OPTIONS = [
    { value: 'all', label: 'All Categories' },
    { value: 'Athletics', label: 'Athletics' },
    { value: 'Campus', label: 'Campus Life' },
    { value: 'Academic', label: 'Academic' }
  ];

  class LSUWidget {
    constructor(root) {
      this.root = root;
      this.state = {
        view: 'live',
        category: 'all',
        search: '',
        notifications: this.getNotificationPreference(),
        now: new Date()
      };
      this.data = null;
      this.sources = null;
      this.error = null;
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
      }, 60 * 1000);
    }

    async refresh() {
      this.setLoading(true);
      try {
        const [eventsRes, sourcesRes] = await Promise.all([
          fetch(`${DATA_URL}?ts=${Date.now()}`),
          fetch(`${SOURCES_URL}?ts=${Date.now()}`)
        ]);

        if (!eventsRes.ok) throw new Error('Failed to load events');
        if (!sourcesRes.ok) throw new Error('Failed to load source health');

        this.data = await eventsRes.json();
        this.sources = await sourcesRes.json();
        this.error = null;
      } catch (err) {
        console.error('[LSU Widget] data fetch failed', err);
        this.error = err.message;
      } finally {
        this.setLoading(false);
        this.render();
      }
    }

    setLoading(isLoading) {
      this.loading = isLoading;
      this.root.classList.toggle('lsu-widget--loading', !!isLoading);
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
      this.root.innerHTML = '<div class="lsu-widget__loading">Loading LSU activity…</div>';
    }

    render() {
      if (this.error) {
        this.root.innerHTML = `
          <div class="lsu-widget__error">
            <p>We could not load LSU events right now.</p>
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
      const activeEvents = this.applyFilters(events);
      const liveEvents = activeEvents.filter((event) => this.isLive(event));
      const weekEvents = activeEvents.filter((event) => this.isWithinWeek(event));
      const calendarEvents = activeEvents;
      const viewEvents = {
        live: liveEvents,
        week: weekEvents,
        calendar: calendarEvents
      };

      const highlightCards = this.buildHighlights(events, highlights);
      const radarEntries = this.buildDeadlineRadar(deadline_radar, events);
      const quickLinks = this.buildQuickLinks();
      const sourceHealth = this.buildSourceHealth();

      this.root.innerHTML = `
        <div class="lsu-widget__header">
          <div class="lsu-widget__title-block">
            <h2 class="lsu-widget__title">LSU Live Activity</h2>
            <div class="lsu-widget__meta">
              <span>Last updated ${this.formatRelative(updated_at)}</span>
              <span>Timezone: ${timezone}</span>
              ${sourceHealth}
            </div>
          </div>
          <button class="lsu-widget__notification-toggle ${this.state.notifications ? 'is-on' : ''} js-notify">
            ${this.state.notifications ? 'Notifications on' : 'Enable notifications'}
          </button>
        </div>

        <div class="lsu-widget__tabs">
          ${Object.keys(VIEW_LABELS)
            .map(
              (view) => `
                <button class="lsu-widget__tab ${this.state.view === view ? 'lsu-widget__tab--active' : ''}"
                        data-view="${view}">
                  ${VIEW_LABELS[view]}
                </button>`
            )
            .join('')}
        </div>

        <div class="lsu-widget__filters">
          <select class="lsu-widget__select" name="category">
            ${CATEGORY_OPTIONS.map(
              (option) => `
                <option value="${option.value}" ${option.value === this.state.category ? 'selected' : ''}>
                  ${option.label}
                </option>`
            ).join('')}
          </select>
          <input class="lsu-widget__search" type="search" placeholder="Search LSU events" value="${this.state.search}">
        </div>

        <div class="lsu-widget__panes">
          ${Object.keys(VIEW_LABELS)
            .map(
              (view) => `
                <section class="lsu-widget__pane ${this.state.view === view ? 'lsu-widget__pane--active' : ''}" data-view="${view}">
                  ${this.renderEvents(viewEvents[view])}
                </section>`
            )
            .join('')}
        </div>

        <section class="lsu-widget__highlights">
          <h3>Spotlight: Next up for LSU</h3>
          <div class="lsu-widget__highlight-grid">
            ${highlightCards}
          </div>
        </section>

        <section class="lsu-widget__quick-links">
          <h3>Quick launch</h3>
          ${quickLinks}
        </section>

        <section class="lsu-widget__radar">
          <h3>Deadline radar</h3>
          ${radarEntries}
        </section>
      `;

      this.attachEvents();
    }

    attachEvents() {
      this.root.querySelectorAll('.lsu-widget__tab').forEach((button) => {
        button.addEventListener('click', () => {
          this.state.view = button.dataset.view;
          this.render();
        });
      });

      const categorySelect = this.root.querySelector('.lsu-widget__select');
      if (categorySelect) {
        categorySelect.addEventListener('change', (event) => {
          this.state.category = event.target.value;
          this.render();
        });
      }

      const searchInput = this.root.querySelector('.lsu-widget__search');
      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          this.state.search = event.target.value;
          this.render();
        });
      }

      const notifyButton = this.root.querySelector('.js-notify');
      if (notifyButton) {
        notifyButton.addEventListener('click', () => {
          this.state.notifications = !this.state.notifications;
          this.setNotificationPreference(this.state.notifications);
          this.render();
          const message = this.state.notifications
            ? 'Notifications enabled. We will surface urgent LSU alerts when available.'
            : 'Notifications disabled.';
          alert(message);
        });
      }

      this.root.querySelectorAll('.js-add-to-calendar').forEach((button) => {
        button.addEventListener('click', () => {
          const eventId = button.dataset.event;
          const event = (this.data?.events || []).find((item) => item.id === eventId);
          if (event) {
            this.downloadICS(event);
          }
        });
      });
    }

    renderEvents(events) {
      if (!events || events.length === 0) {
        return '<div class="lsu-widget__empty">No events match your filters.</div>';
      }
      return `
        <div class="lsu-widget__cards">
          ${events
            .map((event) => `
              <article class="lsu-widget__card">
                <div class="lsu-widget__card-header">
                  <h4>${event.title}</h4>
                  <span class="lsu-widget__pill">${event.category || 'General'}</span>
                </div>
                <div class="lsu-widget__time">🕒 ${this.formatRange(event.start, event.end)}</div>
                ${event.location ? `<div class="lsu-widget__location">📍 ${event.location}</div>` : ''}
                <div class="lsu-widget__card-actions">
                  <button class="lsu-widget__button lsu-widget__button--primary js-add-to-calendar" data-event="${event.id}">
                    Add to calendar
                  </button>
                  ${event.url ? `
                    <a class="lsu-widget__button lsu-widget__button--ghost" href="${event.url}" target="_blank" rel="noopener">
                      Details
                    </a>
                  ` : ''}
                </div>
              </article>
            `)
            .join('')}
        </div>`;
    }

    applyFilters(events) {
      const searchTerm = this.state.search.trim().toLowerCase();
      return events
        .filter((event) => {
          if (this.state.category !== 'all' && event.category !== this.state.category) {
            return false;
          }
          if (!searchTerm) return true;
          return (
            event.title?.toLowerCase().includes(searchTerm) ||
            event.location?.toLowerCase().includes(searchTerm) ||
            event.status?.toLowerCase().includes(searchTerm)
          );
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    }

    isLive(event) {
      const now = this.state.now;
      const start = new Date(event.start);
      const end = event.end ? new Date(event.end) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      return now >= start && now <= end;
    }

    isWithinWeek(event) {
      const now = this.state.now;
      const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const start = new Date(event.start);
      return start >= now && start <= weekAhead;
    }

    buildHighlights(events, highlightIds) {
      if (!events.length) {
        return '<div class="lsu-widget__empty">No spotlight events yet.</div>';
      }
      const highlighted = highlightIds
        .map((id) => events.find((event) => event.id === id))
        .filter(Boolean);

      const fallback = highlighted.length ? highlighted : events.slice(0, 3);

      return fallback
        .slice(0, 3)
        .map(
          (event) => `
            <div class="lsu-widget__highlight-card">
              <div class="lsu-widget__pill">${event.category || 'LSU'}</div>
              <h4>${event.title}</h4>
              <p>${this.formatRange(event.start, event.end)}</p>
            </div>
          `
        )
        .join('');
    }

    buildQuickLinks() {
      const links = [
        { label: 'LSU Athletics Hub', href: 'https://lsusports.net' },
        { label: 'Buy Tickets', href: 'https://lsusports.net/tickets/' },
        { label: 'Campus Event Calendar', href: 'https://calendar.lsu.edu' },
        { label: 'Academic Deadlines', href: 'https://www.lsu.edu/registrar/AcademicCalendar/' },
        { label: 'Campus Map', href: 'https://map.lsu.edu' }
      ];

      return `
        <ul>
          ${links
            .map((link) => `
              <li><a href="${link.href}" target="_blank" rel="noopener">${link.label}</a></li>
            `)
            .join('')}
        </ul>`;
    }

    buildDeadlineRadar(radar, events) {
      const upcomingDeadlines = radar.length
        ? radar
        : events
            .filter((event) => event.status === 'deadline' || event.category === 'Academic')
            .slice(0, 5)
            .map((event) => ({
              id: event.id,
              title: event.title,
              date: event.start
            }));

      if (!upcomingDeadlines.length) {
        return '<div class="lsu-widget__empty">No academic deadlines this week.</div>';
      }

      return `
        <ul>
          ${upcomingDeadlines
            .slice(0, 5)
            .map((deadline) => `
              <li>
                <strong>${deadline.title}</strong>
                <div>${this.formatDate(deadline.date)}</div>
              </li>
            `)
            .join('')}
        </ul>`;
    }

    buildSourceHealth() {
      if (!this.sources?.sources?.length) {
        return '<div class="lsu-widget__source-health">Source status unavailable</div>';
      }

      const healthyCount = this.sources.sources.filter((source) => source.status === 'ok').length;
      const total = this.sources.sources.length;
      const healthClass = healthyCount === total
        ? 'lsu-widget__source-dot--ok'
        : healthyCount === 0
          ? 'lsu-widget__source-dot--error'
          : 'lsu-widget__source-dot--warn';

      return `
        <div class="lsu-widget__source-health">
          <span class="lsu-widget__source-dot ${healthClass}"></span>
          ${healthyCount}/${total} sources healthy
        </div>`;
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

      return `${startStr} – ${endStr}`;
    }

    formatDate(dateValue) {
      const date = new Date(dateValue);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }

    formatRelative(dateValue) {
      if (!dateValue) return 'recently';
      const date = new Date(dateValue);
      const diffMs = Date.now() - date.getTime();
      const minutes = Math.round(diffMs / 60000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes} min ago`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} hr ago`;
      const days = Math.round(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    downloadICS(event) {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LSU Widget//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${event.id}@lsu-widget`,
        `DTSTAMP:${this.toICSDate(new Date())}`,
        `DTSTART:${this.toICSDate(new Date(event.start))}`,
        `DTEND:${this.toICSDate(new Date(event.end || event.start))}`,
        `SUMMARY:${this.escapeICS(event.title)}`,
        `DESCRIPTION:${this.escapeICS(event.url || '')}`,
        event.location ? `LOCATION:${this.escapeICS(event.location)}` : '',
        'END:VEVENT',
        'END:VCALENDAR'
      ]
        .filter(Boolean)
        .join('\n');

      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${event.id}.ics`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    toICSDate(date) {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    escapeICS(value) {
      return (value || '').replace(/,/g, '\\,').replace(/;/g, '\\;');
    }
  }

  window.LSUWidget = LSUWidget;

  function autoMount() {
    const container = document.getElementById('lsu-widget');
    if (container) {
      new LSUWidget(container);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
