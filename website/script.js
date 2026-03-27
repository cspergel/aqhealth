/* ========================================
   AQHealth.ai — Marketing Site Scripts
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector('.nav').offsetHeight;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
        // Close mobile nav if open
        document.getElementById('navLinks').classList.remove('open');
      }
    });
  });

  // --- Mobile nav toggle ---
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  // --- Nav scroll effect ---
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Intersection Observer for fade-up animations ---
  const fadeElements = document.querySelectorAll('.fade-up');
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger siblings
        const siblings = entry.target.parentElement.querySelectorAll('.fade-up');
        let delay = 0;
        siblings.forEach((sib, i) => {
          if (sib === entry.target) delay = i * 80;
        });
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, Math.min(delay, 400));
        fadeObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  fadeElements.forEach(el => fadeObserver.observe(el));

  // --- Counter animation ---
  const counters = document.querySelectorAll('.number-value');
  let countersAnimated = false;

  const animateCounters = () => {
    if (countersAnimated) return;
    countersAnimated = true;

    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      const format = counter.getAttribute('data-format');
      const duration = 2000;
      const startTime = performance.now();

      const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

      const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        let value = Math.round(eased * target);

        if (format === 'comma') {
          counter.textContent = value.toLocaleString();
        } else {
          counter.textContent = value;
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      };

      requestAnimationFrame(update);
    });
  };

  const numbersSection = document.getElementById('numbers');
  if (numbersSection) {
    const numbersObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Small delay so it looks intentional
          setTimeout(animateCounters, 300);
          numbersObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    numbersObserver.observe(numbersSection);
  }

  // --- Subtle parallax on hero visual ---
  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual && window.matchMedia('(min-width: 768px)').matches) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < 800) {
        const translate = scrolled * 0.08;
        const scale = 1 - scrolled * 0.0002;
        heroVisual.style.transform = `translateY(${translate}px) scale(${Math.max(scale, 0.92)})`;
        heroVisual.style.opacity = Math.max(1 - scrolled * 0.001, 0.3);
      }
    }, { passive: true });
  }

  // --- Typewriter effect for ask bar ---
  const askbarText = document.querySelector('.askbar-text');
  if (askbarText) {
    const fullText = askbarText.textContent;
    askbarText.textContent = '';
    let charIndex = 0;
    let started = false;

    const typeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) {
          started = true;
          const type = () => {
            if (charIndex < fullText.length) {
              askbarText.textContent += fullText.charAt(charIndex);
              charIndex++;
              setTimeout(type, 30);
            }
          };
          setTimeout(type, 500);
          typeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    typeObserver.observe(askbarText.closest('.screenshot-card'));
  }

});
