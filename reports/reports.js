 
    /* ----------------------------------------------------------------
       THEME  — mirrors theme.js pattern exactly
    ---------------------------------------------------------------- */
    function applyTheme(t) {
      if (t === 'dark' ||
         (t === 'system' && matchMedia('(prefers-color-scheme:dark)').matches)) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    }

    // Apply saved theme immediately (prevents flash)
    (function () {
      const saved = localStorage.getItem('theme') || 'system';
      applyTheme(saved);
    })();

    // Theme switcher buttons inside profile dropdown
    document.querySelectorAll('#themeMenu button[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.theme;
        localStorage.setItem('theme', t);
        applyTheme(t);
      });
    });

    // Appearance toggle (show/hide sub-menu)
    document.getElementById('appearanceBtn')?.addEventListener('click', () => {
      document.getElementById('themeMenu').classList.toggle('open');
    });

    /* ----------------------------------------------------------------
       APP BANNER
    ---------------------------------------------------------------- */
    function openApp()    { /* deep-link to mobile app if needed */ }
    function closeBanner(){ document.getElementById('appBanner').style.display = 'none'; }

    /* ----------------------------------------------------------------
       PROFILE DROPDOWN  (click-to-toggle, same pattern as Home.js)
    ---------------------------------------------------------------- */
    const profileBtn      = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    profileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      profileDropdown?.classList.remove('open');
    });

    profileDropdown?.addEventListener('click', e => e.stopPropagation());

    /* ----------------------------------------------------------------
       SIDEBAR
    ---------------------------------------------------------------- */
    const menuBtn  = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sideMenu = document.getElementById('sideMenu');
    const overlay  = document.getElementById('menuOverlay');

    function openMenu()  { sideMenu.classList.add('open'); overlay.classList.add('open'); }
    function closeMenu() { sideMenu.classList.remove('open'); overlay.classList.remove('open'); }

    menuBtn?.addEventListener('click', openMenu);
    closeBtn?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);

    /* ----------------------------------------------------------------
       MOBILE REPORTS ACCORDION
    ---------------------------------------------------------------- */
    const mobileToggle  = document.getElementById('reportsBtnMobile');
    const mobileSubmenu = document.getElementById('reportsMenuMobile');
    const mobileArrow   = document.getElementById('mobileArrow');

    mobileToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = mobileSubmenu.classList.toggle('open');
      mobileArrow.classList.toggle('open', isOpen);
    });

    /* ----------------------------------------------------------------
       SCROLL REVEAL  (IntersectionObserver — same as Home.js)
    ---------------------------------------------------------------- */
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.10 });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    /* ----------------------------------------------------------------
       REPORT ACTIONS
    ---------------------------------------------------------------- */
    const reportRoutes = {
      daily:   '../daily/daily.html',
      weekly:  '../weekly/weekly.html',
      monthly: '../monthly/monthly.html',
    };

    function viewReport(type) {
      window.location.href = reportRoutes[type] || '#';
    }

    function downloadReport(type) {
      /* 🔧 Replace stub with real Firebase Storage URL / Blob download */
      const fileName = `HydroGen_${type}_report.pdf`;
      showToast(`Preparing ${fileName}…`);
      setTimeout(() => showToast(`✅ ${fileName} ready!`), 1400);
    }

    /* ----------------------------------------------------------------
       TOAST NOTIFICATION
    ---------------------------------------------------------------- */
    function showToast(msg) {
      const existing = document.getElementById('rpt-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'rpt-toast';
      Object.assign(toast.style, {
        position:     'fixed',
        bottom:       '28px',
        left:         '50%',
        transform:    'translateX(-50%) translateY(20px)',
        background:   document.body.classList.contains('dark') ? '#1e293b' : '#06420d',
        color:        document.body.classList.contains('dark') ? '#7dd3a6' : '#fff',
        border:       document.body.classList.contains('dark') ? '1px solid #334155' : 'none',
        padding:      '12px 24px',
        borderRadius: '12px',
        fontSize:     '14px',
        fontWeight:   '600',
        boxShadow:    '0 8px 24px rgba(0,0,0,.2)',
        opacity:      '0',
        transition:   'opacity .3s, transform .3s',
        zIndex:       '9999',
        whiteSpace:   'nowrap',
        fontFamily:   '"Inter", "Segoe UI", sans-serif',
      });
      toast.textContent = msg;
      document.body.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 400);
      }, 3200);
    }
