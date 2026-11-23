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
                destroySmoothScroll();
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
 * Cleanly destroy Lenis instance and remove GSAP ticker integration.
 */
export function destroySmoothScroll() {
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
 * Clean up active GSAP context and ScrollTriggers belonging to the outgoing view.
 */
export function cleanupViewMotion() {
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
        window.requestAnimationFrame(() => {
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
                        opacity: 0,
                        y: rich ? 12 : 0,
                    },
                    {
                        opacity: 1,
                        y: 0,
                        duration: rich ? 0.24 : 0.16,
                        stagger: rich ? 0.032 : 0.015,
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
                        { opacity: 0, y: rich ? 10 : 0 },
                        {
                            opacity: 1,
                            y: 0,
                            duration: rich ? 0.3 : 0.18,
                            stagger: rich ? 0.04 : 0,
                            delay: rich ? 0.06 : 0,
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

    function animateStateFade(selector = '[data-motion-state]') {
        if (!container || shouldReduceMotion()) {
            return;
        }

        const targets = container.querySelectorAll(selector);
        if (targets.length === 0) {
            return;
        }

        gsap.fromTo(
            targets,
            { opacity: 0 },
            { opacity: 1, duration: 0.18, ease: 'power1.out', clearProps: 'opacity' }
        );
    }

    function animateTabPanel(selector = '[data-motion-tabpanel]') {
        if (!container || shouldReduceMotion()) {
            refresh();
            return;
        }

        const targets = container.querySelectorAll(selector);
        if (targets.length > 0) {
            gsap.fromTo(
                targets,
                { opacity: 0, y: canUseRichMotion() ? 6 : 0 },
                {
                    opacity: 1,
                    y: 0,
                    duration: canUseRichMotion() ? 0.22 : 0.12,
                    ease: 'power2.out',
                    clearProps: 'transform,opacity',
                }
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
 * Subtle toast reveal animation that never touches view contexts or triggers view re-renders.
 */
export function animateToastElement(el) {
    if (!el || shouldReduceMotion()) {
        return;
    }

    gsap.fromTo(
        el,
        { opacity: 0, y: canUseRichMotion() ? -6 : 0 },
        { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity' }
    );
}
