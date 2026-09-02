// Mockup harness. Loads exactly what the game loads -- the same fonts, the same
// stylesheet -- plus the story stylesheet under review, so a screenshot of a
// mockup is a screenshot of the real look and not an approximation of it.
//
// ?state=untouched|part|complete picks which variant of the page is shown.
import '@fontsource/unifrakturcook/latin-700.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '../src/styles.css';
import './story.css';

const state = new URLSearchParams(location.search).get('state') ?? 'part';
document.documentElement.dataset.state = state;
