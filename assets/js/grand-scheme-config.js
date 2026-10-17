// The only PDF URL setting lives in _data/grand_scheme.yml.
// Jekyll supplies its base-path-aware URL to the HTML, including the no-JS fallback.
export const PDF_URL = new URL(document.body.dataset.pdfUrl, location.href).href;

export const PAGE_DETAILS = [
  { title: 'The Grand Scheme', description: 'Opening cover of The Grand Scheme, a blueprint for a new creative economy.' },
  { title: 'The Blueprint', description: 'From idea to impact: creative output, digital infrastructure, human infrastructure, and a foundation of independent creators and ideas.' },
  { title: 'Construction / Ten Grand Network', description: 'The Ten Grand Network connects independent creators with people and resources, from idea, assembly, and capital to stage and press.' },
  { title: 'Expansion / Grandure Studio', description: 'The expansion panel introduces Grandure Studio.' },
  { title: 'The Invitation', description: 'The closing invitation to participate in Ten Grand. This prototype includes a link back to the Ten Grand website.' },
];

// Optional HTML actions. Keys are one-based PDF page numbers.
// Rectangles are [left, top, width, height], each normalized to 0–1 from the top-left.
// A hotspot may specify `href` OR `description` (opens an accessible detail dialog).
// Example: 3: [{ label: 'About the network', rect: [.1, .2, .3, .15], description: 'Your description here.' }]
export const HOTSPOTS = {};
