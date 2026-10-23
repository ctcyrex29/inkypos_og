import '@testing-library/jest-dom/vitest';

// jsdom lacks these browser APIs that Radix menus (Select) call when opening.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
