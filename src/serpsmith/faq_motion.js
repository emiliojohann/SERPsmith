/* Native details remain the no-JS fallback; enhancement is lazy and delegated. */
(() => {
  'use strict';
  if (window.__serpsmithFaqMotion || !Element.prototype.animate) return;
  window.__serpsmithFaqMotion = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const groups = new WeakMap();
  const moving = new Set();
  const itemSelector = 'details.serpsmith-faq-item';

  function reflect(state) {
    state.item.dataset.faqExpanded = String(state.target);
    state.summary.setAttribute('aria-expanded', String(state.target));
    state.answer.setAttribute('aria-hidden', String(!state.target));
    state.answer.inert = !state.target;
  }

  function cancel(state) {
    for (const animation of state.animations) {
      animation.onfinish = animation.oncancel = null;
      animation.cancel();
    }
    state.animations = [];
    moving.delete(state);
    state.item.style.removeProperty('height');
    state.item.style.removeProperty('overflow');
  }

  function settle(state) {
    cancel(state);
    state.item.open = state.target;
    reflect(state);
  }

  function groupFor(list) {
    if (groups.has(list)) return groups.get(list);
    const states = Array.from(list.querySelectorAll(itemSelector))
      .filter(item => item.closest('.serpsmith-faq-list') === list)
      .map(item => ({
        item, summary: item.querySelector('summary.serpsmith-faq-question'),
        answer: item.querySelector('.serpsmith-faq-answer'),
        target: item.open, animations: []
      })).filter(state => state.summary && state.answer);
    // Remove the native mutex only once we can manage this whole group.
    if (states.length !== list.querySelectorAll(itemSelector).length) return null;
    let selected = false;
    for (const state of states) {
      state.item.removeAttribute('name');
      state.target = state.target && !selected;
      selected = selected || state.target;
      settle(state);
    }
    groups.set(list, states);
    return states;
  }

  function timing(list) {
    const css = getComputedStyle(list.closest('section.serpsmith-faq'));
    const raw = css.getPropertyValue('--serpsmith-faq-duration').trim();
    const match = raw.match(/^(\d*\.?\d+)(ms|s)$/);
    const duration = match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : 250;
    return { duration, easing: css.getPropertyValue('--serpsmith-faq-easing').trim() || 'ease', fill: 'both' };
  }

  function transition(state, target, options) {
    // Sample before cancel: a reversal starts at the currently painted frame.
    const start = state.item.getBoundingClientRect().height;
    const opacity = state.item.open ? getComputedStyle(state.answer).opacity : '0';
    cancel(state);
    state.target = target;
    reflect(state);
    if (reduced.matches || !options.duration || !state.item.isConnected) {
      settle(state);
      return;
    }
    // Measure in natural layout, including wrapped text, padding and borders.
    state.item.open = target;
    const end = state.item.getBoundingClientRect().height;
    state.item.open = true; // Keep closing content rendered until completion.
    const css = getComputedStyle(state.item);
    const extra = css.boxSizing === 'border-box' ? 0 :
      ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, key) => sum + (parseFloat(css[key]) || 0), 0);
    state.item.style.overflow = 'hidden';
    try {
      const height = state.item.animate([
        { height: `${Math.max(0, start - extra)}px` },
        { height: `${Math.max(0, end - extra)}px` }
      ], options);
      state.animations.push(height);
      const fade = state.answer.animate([
        { opacity }, { opacity: target ? 1 : 0 }
      ], options);
      state.animations.push(fade);
      moving.add(state);
      height.onfinish = () => settle(state);
      // External cancellation must also restore a clean, correct native state.
      height.oncancel = fade.oncancel = () => settle(state);
    } catch (_) {
      // Invalid CSS timing or unavailable animation support must not trap content.
      settle(state);
    }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    const origin = event.target instanceof Element ? event.target : event.target.parentElement;
    const summary = origin && origin.closest('summary.serpsmith-faq-question');
    if (!summary) return;
    const interactive = origin.closest('a,button,input,select,textarea,label,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"]');
    if (interactive && interactive !== summary && summary.contains(interactive)) return;
    const item = summary.parentElement;
    const list = item.closest('.serpsmith-faq-list');
    if (!item.matches(itemSelector) || !list || !list.closest('section.serpsmith-faq')) return;
    const states = groupFor(list);
    const state = states && states.find(entry => entry.item === item && entry.summary === summary);
    if (!state) return;
    event.preventDefault();
    const target = !state.target;
    const options = timing(list);
    for (const sibling of states) {
      if (sibling !== state && sibling.target) transition(sibling, false, options);
    }
    transition(state, target, options);
  });

  const settleMoving = () => Array.from(moving).forEach(settle);
  window.addEventListener('resize', settleMoving, { passive: true });
  if (reduced.addEventListener) reduced.addEventListener('change', settleMoving);
  else reduced.addListener(settleMoving);
})();
