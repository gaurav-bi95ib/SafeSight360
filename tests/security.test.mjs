import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../public/assets/js/sanitize.js';

test('untrusted names are safely encoded before HTML template insertion', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('unsafe')"> & Co`),
    '&lt;img src=x onerror=&quot;alert(&#39;unsafe&#39;)&quot;&gt; &amp; Co'
  );
});

test('escapeHtml safely handles nullish and numeric values', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(250), '250');
});
