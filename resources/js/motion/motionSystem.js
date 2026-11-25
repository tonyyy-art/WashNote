import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

let lenisInstance = null;
let lenisTickerCallback = null;
let lenisScrollListenerBound = false;
let activeViewContext = null;
let reducedMotionQuery = null;
let reducedMotionListener = null;
let pendingRefreshRafId = null;
const activeStandaloneTweens = new Set();
let activeToastTween = null;

/**
 * Check whether motion should be minimized for accessibility preferences.
 */
export function shouldReduceMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detect constrained mobile/low-end environments conservatively so motion stays lightweight.
 */
export function isLowEndDevice() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    if (navigator.connection?.saveData === true) {
        return true;
    }

    const lowCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
    const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;

    return lowCores || lowMem;
}

function canUseRichMotion() {
    return !shouldReduceMotion() && !isLowEndDevice();
}

/**
 * Initialize Lenis smooth scroll synchronized with GSAP ticker and ScrollTrigger.
 */
export function initSmoothScroll() {
    if (typeof window === 'undefined' || !canUseRichMotion()) {
        destroySmoothScroll();
        return null;
    }

    if (lenisInstance) {
        return lenisInstance;
    }

    lenisInstance = new Lenis({
        duration: 0.85,
        easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
        smoothWheel: true,
        touchMultiplier: 1.15,
    });

    lenisInstance.on('scroll', ScrollTrigger.update);
    lenisScrollListenerBound = true;

    lenisTickerCallback = (time) => {
        if (lenisInstance) {
            lenisInstance.raf(time * 1000);
        }
    };

    gsap.ticker.add(lenisTickerCallback);
    gsap.ticker.lagSmoothing(0);

    if (!reducedMotionQuery && typeof window.matchMedia === 'function') {
        reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        reducedMotionListener = (event) => {
            if (event.matches) {
                destroySmoothScroll({ detachMediaListener: false });
                cleanupViewMotion();
            } else {
                initSmoothScroll();
            }
        };
        reducedMotionQuery.addEventListener('change', reducedMotionListener);
    }

    return lenisInstance;
}

/**
 * Cleanly destroy Lenis instance, ticker integration, and OS reduced-motion listener.
 */
export function destroySmoothScroll({ detachMediaListener = true } = {}) {
    if (detachMediaListener && reducedMotionQuery && reducedMotionListener) {
        if (typeof reducedMotionQuery.removeEventListener === 'function') {
            reducedMotionQuery.removeEventListener('change', reducedMotionListener);
        }
        reducedMotionQuery = null;
        reducedMotionListener = null;
    }

    if (lenisTickerCallback) {
        gsap.ticker.remove(lenisTickerCallback);
        lenisTickerCallback = null;
    }

    if (lenisInstance) {
        if (lenisScrollListenerBound && typeof lenisInstance.off === 'function') {
            lenisInstance.off('scroll', ScrollTrigger.update);
        }
        lenisInstance.destroy();
        lenisInstance = null;
        lenisScrollListenerBound = false;
    }
}

/**
 * Reset scroll position cleanly when switching SPA views.
 */
export function scrollToPageTop() {
    if (typeof window === 'undefined') {
        return;
    }

    if (lenisInstance && typeof lenisInstance.scrollTo === 'function') {
        lenisInstance.scrollTo(0, { immediate: true });
        return;
    }

    window.scrollTo(0, 0);
}

/**
 * Scroll smoothly (or immediately under reduced-motion) to a target selector or element.
 */
export function scrollToElement(target, offset = -16) {
    if (typeof window === 'undefined' || !target) {
        return;
    }

    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) {
        return;
    }

    if (lenisInstance && !shouldReduceMotion()) {
        lenisInstance.scrollTo(el, { offset });
        return;
    }

    el.scrollIntoView({ behavior: shouldReduceMotion() ? 'auto' : 'smooth', block: 'start' });
}

/**
 * Clean up active GSAP context, standalone tweens, pending animation frame, and ScrollTriggers belonging to the outgoing view.
 */
export function cleanupViewMotion() {
    if (pendingRefreshRafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pendingRefreshRafId);
        pendingRefreshRafId = null;
    }

    for (const tween of activeStandaloneTweens) {
        if (tween && typeof tween.kill === 'function') {
            tween.kill();
        }
    }
    activeStandaloneTweens.clear();

    if (activeViewContext) {
        activeViewContext.revert();
        activeViewContext = null;
    }
}

/**
 * Create a scoped motion controller for a mounted view container.
 * Intro animations play once per mount so filters, toasts, and small state updates never replay entrances.
 */
export function createViewMotion(container) {
    let introPlayed = false;

    function refresh() {
        if (typeof window === 'undefined') {
            return;
        }
        if (pendingRefreshRafId !== null) {
            window.cancelAnimationFrame(pendingRefreshRafId);
        }
        pendingRefreshRafId = window.requestAnimationFrame(() => {
            pendingRefreshRafId = null;
            ScrollTrigger.refresh();
        });
    }

    function runIntro() {
        if (!container || introPlayed) {
            refresh();
            return;
        }

        introPlayed = true;
        cleanupViewMotion();

        if (shouldReduceMotion()) {
            return;
        }

        const cards = [...container.querySelectorAll('[data-motion-card]')];
        const reveals = [...container.querySelectorAll('[data-motion-reveal]')];
        const rich = canUseRichMotion();

        if (cards.length === 0 && reveals.length === 0) {
            return;
        }

        activeViewContext = gsap.context(() => {
            if (cards.length > 0) {
                gsap.fromTo(
                    cards,
                    {
                        opacity: 0.25,
                        y: rich ? 8 : 0,
                    },
                    {
                        opacity: 1,
                        y: 0,
                        duration: rich ? 0.14 : 0.08,
                        stagger: rich ? 0.012 : 0,
                        ease: 'power2.out',
                        clearProps: 'transform,opacity',
                    }
                );
            }

            if (reveals.length > 0) {
                const viewportCutoff = window.innerHeight * 0.96;
                const immediateReveals = [];
                const scrollReveals = [];

                for (const section of reveals) {
                    const rect = section.getBoundingClientRect();
                    if (rect.top <= viewportCutoff) {
                        immediateReveals.push(section);
                    } else {
                        scrollReveals.push(section);
                    }
                }

                if (immediateReveals.length > 0) {
                    gsap.fromTo(
                        immediateReveals,
                        { opacity: 0.3, y: rich ? 6 : 0 },
                        {
                            opacity: 1,
                            y: 0,
                            duration: rich ? 0.16 : 0.09,
                            stagger: rich ? 0.015 : 0,
                            delay: 0,
                            ease: 'power2.out',
                            clearProps: 'transform,opacity',
                        }
                    );
                }

                if (rich) {
                    for (const section of scrollReveals) {
                        gsap.fromTo(
                            section,
                            { opacity: 0, y: 14 },
                            {
                                opacity: 1,
                                y: 0,
                                duration: 0.32,
                                ease: 'power2.out',
                                clearProps: 'transform,opacity',
                                scrollTrigger: {
                                    trigger: section,
                                    start: 'top 94%',
                                    once: true,
                                },
                            }
                        );
                    }
                }
            }
        }, container);

        refresh();
    }

    function trackStandaloneTween(tween) {
        if (!tween) {
            return;
        }
        activeStandaloneTweens.add(tween);
        tween.eventCallback('onComplete', () => {
            activeStandaloneTweens.delete(tween);
        });
    }

    function animateStateFade(selector = '[data-motion-state]') {
        if (!container || shouldReduceMotion()) {
            return;
        }

        const targets = container.querySelectorAll(selector);
        if (targets.length === 0) {
            return;
        }

        gsap.killTweensOf(targets);
        trackStandaloneTween(
            gsap.fromTo(
                targets,
                { opacity: 0 },
                { opacity: 1, duration: 0.16, ease: 'power1.out', clearProps: 'opacity' }
            )
        );
    }

    function animateTabPanel(selector = '[data-motion-tabpanel]') {
        if (!container || shouldReduceMotion()) {
            refresh();
            return;
        }

        const targets = container.querySelectorAll(selector);
        if (targets.length > 0) {
            gsap.killTweensOf(targets);
            trackStandaloneTween(
                gsap.fromTo(
                    targets,
                    { opacity: 0, y: canUseRichMotion() ? 6 : 0 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: canUseRichMotion() ? 0.2 : 0.12,
                        ease: 'power2.out',
                        clearProps: 'transform,opacity',
                    }
                )
            );
        }

        refresh();
    }

    return {
        runIntro,
        refresh,
        animateStateFade,
        animateTabPanel,
        hasPlayedIntro: () => introPlayed,
    };
}

/**
 * Smoothly glide the mobile bottom navigation active indicator to the active button.
 */
export function syncBottomNavIndicator(navEl, activeBtn, immediate = false) {
    if (!navEl) {
        return;
    }

    const indicator = navEl.querySelector('#bottom-nav-indicator');
    if (!indicator) {
        return;
    }

    if (!activeBtn) {
        gsap.set(indicator, { opacity: 0 });
        return;
    }

    const targetWidth = Math.max(24, Math.round(activeBtn.offsetWidth * 0.5));
    const targetX = activeBtn.offsetLeft + (activeBtn.offsetWidth - targetWidth) / 2;

    if (immediate || shouldReduceMotion()) {
        gsap.set(indicator, { x: targetX, width: targetWidth, opacity: 1 });
        return;
    }

    gsap.to(indicator, {
        x: targetX,
        width: targetWidth,
        opacity: 1,
        duration: 0.26,
        ease: 'power3.out',
    });
}

/**
 * Cancel any active toast animation cleanly during session reset.
 */
export function cleanupToastMotion() {
    if (activeToastTween && typeof activeToastTween.kill === 'function') {
        activeToastTween.kill();
        activeToastTween = null;
    }
}

/**
 * Subtle toast reveal animation that never touches view contexts or triggers view re-renders.
 */
export function animateToastElement(el) {
    cleanupToastMotion();

    if (!el || shouldReduceMotion()) {
        return;
    }

    gsap.killTweensOf(el);
    activeToastTween = gsap.fromTo(
        el,
        { opacity: 0, y: canUseRichMotion() ? -6 : 0 },
        {
            opacity: 1,
            y: 0,
            duration: 0.2,
            ease: 'power2.out',
            clearProps: 'transform,opacity',
            onComplete: () => {
                activeToastTween = null;
            },
        }
    );
}
