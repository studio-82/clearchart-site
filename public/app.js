// Clearchart marketing site: hero chart toggle, role tabs, waitlist form.

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero chart: paper vs Clearchart ---------- */

  const chart = document.getElementById('hero-chart');
  if (chart) {
    const options = chart.querySelectorAll('.chart__option');
    const sheets = chart.querySelectorAll('.sheet');
    let touched = false;

    const setView = (view) => {
      chart.dataset.view = view;
      options.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.view === view)));
      sheets.forEach((sheet) => {
        const active = sheet.dataset.sheet === view;
        sheet.toggleAttribute('inert', !active);
        sheet.setAttribute('aria-hidden', String(!active));
      });
    };

    options.forEach((btn) => {
      btn.addEventListener('click', () => {
        touched = true;
        setView(btn.dataset.view);
      });
    });

    // The one orchestrated moment: once the chart is on screen, show the paper
    // version briefly, then resolve it into Clearchart.
    if (reduceMotion || !('IntersectionObserver' in window)) {
      setView('digital');
    } else {
      setView('paper');
      const observer = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        window.setTimeout(() => { if (!touched) setView('digital'); }, 2400);
      }, { threshold: 0.6 });
      observer.observe(chart.querySelector('.chart__stage'));
    }
  }

  /* ---------- Role tabs ---------- */

  const tablist = document.querySelector('.roles__tabs');
  if (tablist) {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
      });
      if (focus) tab.focus();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (e.key in keys) {
          e.preventDefault();
          select(tabs[(i + keys[e.key] + tabs.length) % tabs.length], true);
        } else if (e.key === 'Home') {
          e.preventDefault();
          select(tabs[0], true);
        } else if (e.key === 'End') {
          e.preventDefault();
          select(tabs[tabs.length - 1], true);
        }
      });
    });
  }

  /* ---------- Waitlist form ---------- */

  const form = document.getElementById('waitlist-form');
  if (!form) return;

  const status = document.getElementById('form-status');
  const submit = document.getElementById('waitlist-submit');
  const done = document.getElementById('form-done');

  // With an endpoint (the local server sets one), sign-ups are saved there.
  // Without one (static hosting), joining opens a pre-filled email instead.
  const endpoint = form.dataset.endpoint;
  const contact = form.dataset.contact;
  if (!endpoint) document.getElementById('form-email-note').hidden = false;

  const showDone = (mode) => {
    form.hidden = true;
    done.hidden = false;
    done.dataset.mode = mode;
    const panel = done.querySelector(`[data-done="${mode}"]`);
    panel.hidden = false;
    panel.querySelector('h3').focus();
  };

  const optionText = (select) => (select.value ? select.selectedOptions[0].text : 'Not given');

  const emailLink = () => {
    const el = form.elements;
    const checkedText = (name) => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`))
      .map((input) => input.parentElement.textContent.trim());
    const lines = [
      `Name: ${el.name.value.trim()}`,
      `Work email: ${el.email.value.trim()}`,
      `Role: ${optionText(el.role)}`,
      `State or territory: ${optionText(el.state)}`,
      `Organisation: ${el.organisation.value.trim()}`,
      `Type of organisation: ${optionText(el.orgType)}`,
      `Number of beds: ${optionText(el.size)}`,
      `Charting today: ${checkedText('charting')[0] || 'Not given'}`,
      `Seen happen: ${checkedText('pains').join('; ') || 'Not given'}`,
      `Anything else: ${el.notes.value.trim() || 'Nothing'}`,
      '',
      "I'm happy to be emailed about the waitlist and Clearchart's launch.",
    ];
    const subject = `Clearchart waitlist: ${el.organisation.value.trim()}`;
    return `mailto:${contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const rules = [
    { el: form.elements.name, check: (v) => v.trim().length > 0, message: 'Enter your name.' },
    {
      el: form.elements.email,
      check: (v) => emailPattern.test(v.trim()),
      message: (v) => (v.trim() ? 'Enter an email address in the format name@organisation.com.au.' : 'Enter your work email.'),
    },
    { el: form.elements.role, check: (v) => v !== '', message: 'Choose your role.' },
    { el: form.elements.state, check: (v) => v !== '', message: 'Choose your state or territory.' },
    { el: form.elements.organisation, check: (v) => v.trim().length > 0, message: "Enter your organisation's name." },
    { el: form.elements.orgType, check: (v) => v !== '', message: 'Choose a type of organisation.' },
    {
      el: form.elements.consent,
      check: (_, el) => el.checked,
      message: 'Tick this box so we can email you about the waitlist.',
    },
  ];

  const errorFor = (el) => document.getElementById(`${el.id}-error`);

  const showError = (el, message) => {
    const err = errorFor(el);
    el.setAttribute('aria-invalid', 'true');
    err.textContent = message;
    err.hidden = false;
  };

  const clearError = (el) => {
    const err = errorFor(el);
    el.removeAttribute('aria-invalid');
    err.textContent = '';
    err.hidden = true;
  };

  const validate = () => {
    let firstInvalid = null;
    rules.forEach(({ el, check, message }) => {
      const value = el.type === 'checkbox' ? '' : el.value;
      if (check(value, el)) {
        clearError(el);
      } else {
        showError(el, typeof message === 'function' ? message(value) : message);
        firstInvalid = firstInvalid || el;
      }
    });
    return firstInvalid;
  };

  // Re-check a field once someone fixes it, so the error doesn't linger.
  rules.forEach(({ el, check }) => {
    const event = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(event, () => {
      if (el.getAttribute('aria-invalid') === 'true' && check(el.type === 'checkbox' ? '' : el.value, el)) {
        clearError(el);
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (!endpoint) {
      const link = emailLink();
      document.getElementById('done-mailto').href = link;
      window.location.href = link;
      showDone('email');
      return;
    }

    const data = new FormData(form);
    const payload = {
      name: data.get('name').trim(),
      email: data.get('email').trim(),
      role: data.get('role'),
      state: data.get('state'),
      organisation: data.get('organisation').trim(),
      orgType: data.get('orgType'),
      size: data.get('size') || '',
      charting: data.get('charting') || '',
      pains: data.getAll('pains'),
      notes: (data.get('notes') || '').trim(),
      consent: true,
      website: data.get('website') || '',
    };

    submit.disabled = true;
    submit.textContent = 'Joining the waitlist…';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'not-saved');

      document.getElementById('done-name').textContent = payload.name.split(' ')[0];
      document.getElementById('done-email').textContent = payload.email;
      showDone('saved');
    } catch (err) {
      status.textContent = err.message && err.message !== 'not-saved' && err.message !== 'Failed to fetch'
        ? err.message
        : "Your details weren't saved. Check your connection and select Join the waitlist again.";
      status.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Join the waitlist';
    }
  });
})();
