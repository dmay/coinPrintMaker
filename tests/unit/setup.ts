import { vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Only the retained importer adapter needs DOMParser; pure contracts do not.
const window = new JSDOM('').window;
vi.stubGlobal('DOMParser', window.DOMParser);
vi.stubGlobal('XMLSerializer', window.XMLSerializer);
