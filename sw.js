// PacingApp Service Worker 6.0.8.4
// Liegt unter /PacingApp/sw.js

var CACHE_NAME = 'pacing-v6084';
var CHECK_INTERVAL_MS = 5 * 60 * 1000; // alle 5 Minuten prüfen

self.addEventListener('install', function(e) {
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(clients.claim());
});

// Nachrichten vom Haupt-App empfangen
self.addEventListener('message', function(e) {
    if (!e.data) { return; }

    if (e.data.type === 'NOTIFY') {
        // Direkte Notification-Anfrage von der App
        showNotif(e.data.title, e.data.body, e.data.tag, e.data.requireInteraction);
    }

    if (e.data.type === 'PAUSE_START') {
        // Pause gestartet: Zeitstempel merken
        self._pauseStart = e.data.ts;
        self._pauseWarn1 = false;
        self._pauseWarn2 = false;
        self._pauseWarn3 = false;
        self._lang = e.data.lang || 'de';
        startPauseTimer();
    }

    if (e.data.type === 'PAUSE_END') {
        // Pause beendet: Timer stoppen
        self._pauseStart = null;
        if (self._pauseTimer) { clearInterval(self._pauseTimer); self._pauseTimer = null; }
    }

    if (e.data.type === 'SET_LANG') {
        self._lang = e.data.lang || 'de';
    }
});

function showNotif(title, body, tag, requireInteraction) {
    return self.registration.showNotification(title, {
        body: body,
        icon: '/PacingApp/icon.png',
        badge: '/PacingApp/icon.png',
        tag: tag || 'pacing',
        requireInteraction: requireInteraction || false,
        vibrate: [200, 100, 200]
    });
}

var TEXTS = {
    de: {
        w1: 'Pause läuft seit {m} Min. — vergessen zu beenden?',
        w2: 'Schon {m} Min. Pause! Bitte Pause beenden.',
        w3: '{m} Min. Pause! Tippen zum Beenden.',
        t1: '💜 PacingApp',
        t2: '🟠 PacingApp',
        t3: '🔴 PacingApp – Pause!'
    },
    en: {
        w1: 'Rest running for {m} min — forgotten to end?',
        w2: 'Already {m} min rest! Please end rest.',
        w3: '{m} min rest! Tap to end.',
        t1: '💜 PacingApp',
        t2: '🟠 PacingApp',
        t3: '🔴 PacingApp – Rest!'
    },
    nl: {
        w1: 'Rust loopt al {m} min — vergeten te beëindigen?',
        w2: 'Al {m} min rust! Beëindig de rust.',
        w3: '{m} min rust! Tikken om te beëindigen.',
        t1: '💜 PacingApp',
        t2: '🟠 PacingApp',
        t3: '🔴 PacingApp – Rust!'
    },
    fr: {
        w1: 'Repos en cours depuis {m} min — oublié de terminer?',
        w2: 'Déjà {m} min de repos! Terminez le repos.',
        w3: '{m} min de repos! Appuyer pour terminer.',
        t1: '💜 PacingApp',
        t2: '🟠 PacingApp',
        t3: '🔴 PacingApp – Repos!'
    },
    es: {
        w1: 'Descanso en curso {m} min — ¿olvidaste terminar?',
        w2: '¡Ya {m} min de descanso! Termina el descanso.',
        w3: '¡{m} min de descanso! Toca para terminar.',
        t1: '💜 PacingApp',
        t2: '🟠 PacingApp',
        t3: '🔴 PacingApp – ¡Descanso!'
    }
};

function txt(key, minuten) {
    var l = TEXTS[self._lang] || TEXTS['de'];
    return (l[key] || '').replace('{m}', minuten);
}

function startPauseTimer() {
    if (self._pauseTimer) { clearInterval(self._pauseTimer); }
    self._pauseTimer = setInterval(function() {
        if (!self._pauseStart) { clearInterval(self._pauseTimer); return; }
        var minuten = Math.round((Date.now() - self._pauseStart) / 60000);

        if (minuten >= 90 && !self._pauseWarn3) {
            self._pauseWarn3 = true;
            showNotif(txt('t3', minuten), txt('w3', minuten), 'pause-vergessen', true);
        } else if (minuten >= 60 && !self._pauseWarn2) {
            self._pauseWarn2 = true;
            showNotif(txt('t2', minuten), txt('w2', minuten), 'pause-lang', false);
        } else if (minuten >= 30 && !self._pauseWarn1) {
            self._pauseWarn1 = true;
            showNotif(txt('t1', minuten), txt('w1', minuten), 'pause-kurz', false);
        }
    }, CHECK_INTERVAL_MS);
}

// Notification-Klick: App öffnen
self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(cs) {
            for (var i = 0; i < cs.length; i++) {
                if (cs[i].url.indexOf('PacingApp') >= 0) {
                    return cs[i].focus();
                }
            }
            return clients.openWindow('/PacingApp/');
        })
    );
});
