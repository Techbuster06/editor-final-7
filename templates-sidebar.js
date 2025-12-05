const TemplatesSidebar = (function () {
  const basePath = 'assets/templates/';

  const carouselFiles = [
    'carousel1.png',
    'carousel2.png',
    'carousel3.png',
    'carousel4.png'
  ];

  const carouselMockup = 'carousel_mockup.jpg';

  const generalFiles = [
    'event_promo_2.jpg',
    'product_announcement.jpg',
    'quote_graphic.jpg'
  ];

  const videoFiles = [];

  function mkThumbItem(filename, label) {
    const btn = document.createElement('button');
    btn.className = 'template-thumb';
    btn.type = 'button';
    btn.setAttribute('aria-label', label || filename);
    btn.tabIndex = 0;

    const img = document.createElement('img');
    img.alt = label || filename;
    img.src = basePath + filename;
    btn.appendChild(img);

    const lbl = document.createElement('div');
    lbl.className = 'thumb-label';
    lbl.textContent = label || filename;
    btn.appendChild(lbl);

    const dispatchApplyEvent = () => {
      document.dispatchEvent(
        new CustomEvent('template:apply', {
          detail: { url: basePath + filename }
        })
      );
    };

    btn.addEventListener('click', dispatchApplyEvent);

    btn.addEventListener('keyup', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        dispatchApplyEvent();
      }
    });

    return btn;
  }

  async function init() {
    const container = document.querySelector('#templates-container');
    if (!container) {
      console.warn(
        'templates-sidebar: #templates-container not found. Ensure the placeholder div exists in editor.html.'
      );
      return;
    }

    try {
        const response = await fetch('templates-sidebar.html');
        if (!response.ok) {
            throw new Error('Failed to fetch templates HTML');
        }
        const html = await response.text();
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading templates sidebar:', error);
        return;
    }

    const templatesSection = document.querySelector('#templates-section');

    const mainPreview = templatesSection.querySelector('.carousel-main-preview');
    if (mainPreview) {
      mainPreview.src = basePath + carouselMockup;
    }

    const thumbsCarousel = templatesSection.querySelector('.thumbnails-carousel');
    if (thumbsCarousel) {
      carouselFiles.forEach((f, idx) => {
        thumbsCarousel.appendChild(mkThumbItem(f, `Carousel ${idx + 1}`));
      });
    }

    const thumbsGeneral = templatesSection.querySelector('.thumbnails-general');
    if (thumbsGeneral) {
      generalFiles.forEach((f, idx) => {
        thumbsGeneral.appendChild(mkThumbItem(f, `General ${idx + 1}`));
      });
    }

    const thumbsVideo = templatesSection.querySelector('.thumbnails-video');
    if (thumbsVideo) {
      videoFiles.forEach((f, idx) => {
        thumbsVideo.appendChild(mkThumbItem(f, `Video ${idx + 1}`));
      });
    }

    document.addEventListener('templates:open', () => {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.dispatchEvent(new CustomEvent('sidebar:loaded'));
  }

  init();

})();