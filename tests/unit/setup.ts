import { vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Only the retained importer adapter needs DOMParser; pure contracts do not.
vi.stubGlobal('DOMParser', new JSDOM('').window.DOMParser);
