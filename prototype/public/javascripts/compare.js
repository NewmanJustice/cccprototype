(function () {
  const STORAGE_KEY = 'cc_compare_selection';
  const MAX_ITEMS = 5;

  const checkboxes = Array.from(document.querySelectorAll('[data-compare-id]'));
  const primaryButtons = Array.from(document.querySelectorAll('[data-compare-primary]'));
  const inlineButtons = Array.from(document.querySelectorAll('[data-compare-inline]'));
  const errorEl = document.querySelector('[data-compare-error]');

  if (!checkboxes.length && !primaryButtons.length && !inlineButtons.length) {
    return;
  }

  const loadSelection = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) {
        const unique = [];
        stored.forEach(id => {
          if (typeof id === 'string' && id.trim() && !unique.includes(id.trim())) {
            unique.push(id.trim());
          }
        });
        return unique.slice(0, MAX_ITEMS);
      }
    } catch (e) {
      return [];
    }
    return [];
  };

  let selection = loadSelection();

  const saveSelection = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  };

  const setError = (message) => {
    if (!errorEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.removeAttribute('hidden');
    } else {
      errorEl.textContent = '';
      errorEl.setAttribute('hidden', '');
    }
  };

  const updateCheckboxes = () => {
    checkboxes.forEach(cb => {
      cb.checked = selection.includes(cb.dataset.compareId);
    });
  };

  const buildCompareHref = () => {
    if (selection.length < 2) return '#';
    const qs = selection.map(encodeURIComponent).join(',');
    return `/compare?ids=${qs}`;
  };

  const updateButtons = () => {
    const active = selection.length >= 2;
    const href = buildCompareHref();

    primaryButtons.forEach(btn => {
      btn.href = href;
      btn.setAttribute('aria-disabled', active ? 'false' : 'true');
      btn.classList.toggle('govuk-button--disabled', !active);
      btn.textContent = `Compare selected (${selection.length})`;
    });

    inlineButtons.forEach(link => {
      const id = link.dataset.compareInline;
      const show = active && selection.includes(id);
      link.hidden = !show;
      if (show) link.href = href;
    });

    if (selection.length === MAX_ITEMS) {
      setError(`You have selected the maximum of ${MAX_ITEMS}. Deselect one to add another.`);
    } else if (selection.length < MAX_ITEMS) {
      setError('');
    }
  };

  const enforceLimit = () => {
    if (selection.length >= MAX_ITEMS) {
      setError(`You can compare up to ${MAX_ITEMS} features. Deselect one to choose another.`);
      return false;
    }
    setError('');
    return true;
  };

  const onCheckboxChange = (event) => {
    const cb = event.target;
    const id = cb.dataset.compareId;
    const isChecked = cb.checked;

    if (isChecked) {
      if (selection.includes(id)) {
        // already selected
      } else if (!enforceLimit()) {
        cb.checked = false;
        return;
      } else {
        selection.push(id);
      }
    } else {
      selection = selection.filter(x => x !== id);
      setError('');
    }

    saveSelection();
    updateCheckboxes();
    updateButtons();
  };

  const preventInactiveCompare = (event) => {
    if (selection.length < 2) {
      event.preventDefault();
      setError('Select at least two features to compare.');
    }
  };

  checkboxes.forEach(cb => cb.addEventListener('change', onCheckboxChange));
  primaryButtons.forEach(btn => btn.addEventListener('click', preventInactiveCompare));

  // Initial paint
  updateCheckboxes();
  updateButtons();
})();
