// ============================================================
//  Turn the Page — main.js
// ============================================================

// ------------------------------------------------------------
//  Mobile Navigation Toggle
// ------------------------------------------------------------
const navToggle = document.querySelector('.nav-toggle');
const mainNav   = document.getElementById('main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', isOpen);
    navToggle.textContent = isOpen ? '✕' : '☰';
  });
}

// ------------------------------------------------------------
//  Netlify Identity — redirect officers to /admin/ after login
// ------------------------------------------------------------
if (window.netlifyIdentity) {
  window.netlifyIdentity.on('init', user => {
    if (!user) {
      window.netlifyIdentity.on('login', () => {
        document.location.href = '/admin/';
      });
    }
  });
}
