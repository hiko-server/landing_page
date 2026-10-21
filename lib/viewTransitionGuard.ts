/**
 * Cross-document view transitions (`@view-transition { navigation: auto }`
 * in styles/globals.css) are started by the browser, not by the app, so no
 * code holds their promises. When Chromium gives one up — the new page took
 * longer than its ~4 s budget to reveal (a slow sign-in redirect to /admin,
 * a slow network), the document was hidden, the opt-in no longer matched —
 * `ready`, `finished` and `updateCallbackDone` reject ("Transition was
 * aborted because of invalid state. ViewTransition opt-in disabled") and,
 * with nobody listening, surface as an uncaught error in the console.
 *
 * This inline script (pages/_document.tsx renders it in <head>, so it runs
 * before the first rendering opportunity, where `pagereveal` fires, even
 * when the body arrives late; lib/security/inlineScripts.ts hashes it for
 * the CSP):
 *
 *   - attaches no-op handlers to both sides of every cross-document
 *     transition — `pageswap` on the page being left, `pagereveal` on the
 *     page being shown — exactly as lib/viewTransition.ts does for the
 *     app's own same-document transitions;
 *   - and, because Chromium can abort the incoming page's transition before
 *     `pagereveal` (the event then carries no transition, yet its promises
 *     still reject with nobody able to hold them), marks exactly such a
 *     rejection handled: a DOMException (InvalidStateError, AbortError or
 *     TimeoutError) about a transition. It is registered first, so the
 *     error reporter (lib/errors/capture.ts) never files it either. The
 *     app's own transitions never get here (their promises are held).
 *
 * The transitions themselves are untouched: they run, or are skipped, as before.
 *
 * Plain ES5, no globals: it runs before any bundle, in every browser
 * (the events simply never fire where cross-document transitions are not
 * supported).
 */
export const VIEW_TRANSITION_GUARD_SCRIPT =
  '(function(){function n(){}function g(e){var t=e&&e.viewTransition;if(!t)return;' +
  'if(t.ready)t.ready.catch(n);if(t.finished)t.finished.catch(n);if(t.updateCallbackDone)t.updateCallbackDone.catch(n)}' +
  'addEventListener("pagereveal",g);addEventListener("pageswap",g);' +
  'addEventListener("unhandledrejection",function(e){var r=e.reason;' +
  'if(typeof DOMException!=="undefined"&&r instanceof DOMException&&/^(InvalidStateError|AbortError|TimeoutError)$/.test(r.name)&&/transition/i.test(r.message)){' +
  'e.preventDefault();e.stopImmediatePropagation()}})})()'
