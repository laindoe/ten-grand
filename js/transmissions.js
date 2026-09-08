// ============================================================
// TEN GRAND — Transmissions archive filtering
// Combines pillar filter (buttons), series filter (dropdown), and
// text search (input) client-side. No framework, no dependencies.
// ============================================================

(() => {
  const grid = document.getElementById('transmissions-grid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.transmission-card'));
  const pillarButtons = document.querySelectorAll('[data-filter-pillar]');
  const seriesSelect = document.getElementById('series-filter');
  const searchInput = document.getElementById('search-input');
  const emptyState = document.getElementById('archive-empty');

  let activePillar = 'all';

  function applyFilters() {
    const activeSeries = seriesSelect ? seriesSelect.value : 'all';
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let visibleCount = 0;

    cards.forEach((card) => {
      const pillars = (card.dataset.pillars || '').split(' ').filter(Boolean);
      const series = card.dataset.series || '';
      const search = card.dataset.search || '';

      const matchesPillar = activePillar === 'all' || pillars.includes(activePillar);
      const matchesSeries = activeSeries === 'all' || series === activeSeries;
      const matchesSearch = query === '' || search.includes(query);

      const visible = matchesPillar && matchesSeries && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    if (emptyState) emptyState.hidden = visibleCount > 0;
  }

  pillarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activePillar = button.dataset.filterPillar;
      pillarButtons.forEach((b) => b.classList.toggle('is-active', b === button));
      applyFilters();
    });
  });

  if (seriesSelect) seriesSelect.addEventListener('change', applyFilters);
  if (searchInput) searchInput.addEventListener('input', applyFilters);
})();
