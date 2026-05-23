// Buy Me A Coffee — subtle, time-cooled promoter toast.
// Respects permanent dismiss and stretches cooldown after a click.
// Copyright (c) 2026 Gerhard Kanzler — MIT (see LICENSE)

const BMC_URL = 'https://buymeacoffee.com/gk.appscreen';

const BMC_KEY_LAST_SHOWN = 'bmcLastShown';
const BMC_KEY_DISMISSED = 'bmcPermanentlyDismissed';
const BMC_KEY_SUPPORTED = 'bmcSupported';

const BMC_INITIAL_DELAY_MS    = 90 * 1000;                  // wait 90s before first show
const BMC_COOLDOWN_NORMAL_MS  = 3  * 24 * 60 * 60 * 1000;   // 3 days between shows
const BMC_COOLDOWN_SUPPORT_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days after they clicked support
const BMC_AUTO_HIDE_MS        = 14 * 1000;                  // auto-fade after 14s

function bmcShouldShow() {
    if (localStorage.getItem(BMC_KEY_DISMISSED) === 'true') return false;
    const lastShown = parseInt(localStorage.getItem(BMC_KEY_LAST_SHOWN) || '0', 10);
    const supported = localStorage.getItem(BMC_KEY_SUPPORTED) === 'true';
    const cooldown = supported ? BMC_COOLDOWN_SUPPORT_MS : BMC_COOLDOWN_NORMAL_MS;
    return Date.now() - lastShown > cooldown;
}

function bmcShowToast() {
    if (!bmcShouldShow()) return;
    const toast = document.getElementById('bmc-toast');
    if (!toast) return;
    toast.classList.add('visible');
    localStorage.setItem(BMC_KEY_LAST_SHOWN, String(Date.now()));
    setTimeout(bmcHideToast, BMC_AUTO_HIDE_MS);
}

function bmcHideToast() {
    document.getElementById('bmc-toast')?.classList.remove('visible');
}

function bmcDismissPermanently() {
    localStorage.setItem(BMC_KEY_DISMISSED, 'true');
    bmcHideToast();
}

function bmcMarkSupported() {
    localStorage.setItem(BMC_KEY_SUPPORTED, 'true');
    // Toast hides on its own; the long cooldown means we won't pester them again soon.
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('bmc-close')?.addEventListener('click', bmcHideToast);
    document.getElementById('bmc-dont-show')?.addEventListener('click', bmcDismissPermanently);
    document.getElementById('bmc-cta')?.addEventListener('click', bmcMarkSupported);

    setTimeout(bmcShowToast, BMC_INITIAL_DELAY_MS);
});
