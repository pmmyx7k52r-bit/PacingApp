// PacingApp Service Worker 6.0.8.6
// Zuverlässige Pause-Notifications via IndexedDB + Sync

self.addEventListener('install', function(e) { self.skipWaiting(); });

self.addEventListener('activate', function(e) {
    e.waitUntil(clients.claim().then(checkPause));
});

// IndexedDB Helfer
function dbOp(mode, ops) {
    return new Promise(function(res, rej) {
        var req = indexedDB.open('pacing', 1);
        req.onupgradeneeded = function(e) { e.target.result.createObjectStore('kv'); };
        req.onsuccess = function(e) {
            var db = e.target.result;
            var tx = db.transaction('kv', mode);
            var store = tx.objectStore('kv');
            var result = ops(store);
            tx.oncomplete = function() { res(result && result._val !== undefined ? result._val : undefined); };
            tx.onerror = rej;
        };
        req.onerror = rej;
    });
}
function dbSet(key, val) {
    return dbOp('readwrite', function(s) { s.put(val, key); });
}
function dbGet(key) {
    return new Promise(function(res, rej) {
        var req = indexedDB.open('pacing', 1);
        req.onupgradeneeded = function(e) { e.target.result.createObjectStore('kv'); };
        req.onsuccess = function(e) {
            var tx = e.target.result.transaction('kv', 'readonly');
            var r = tx.objectStore('kv').get(key);
            r.onsuccess = function() { res(r.result); };
            r.onerror = function() { res(undefined); };
        };
        req.onerror = function() { res(undefined); };
    });
}

var TEXTS = {
    de: {
        w1: ['PacingApp \uD83D\uDC9C Pause', 'Pause l\u00e4uft {m} Min. \u2014 vergessen zu beenden?'],
        w2: ['PacingApp \uD83D\uDFE0 Pause', 'Schon {m} Min. Pause! Bitte beenden.'],
        w3: ['PacingApp \uD83D\uDD34 Pause!', '{m} Min. Pause! Sofort beenden!'],
        pn: ['PacingApp \u26A0\uFE0F Pause n\u00f6tig!', 'Zu lange ohne Pause. Jetzt pausieren \u2014 sonst wird die App gesperrt!']
    },
    en: {
        w1: ['PacingApp \uD83D\uDC9C Rest', 'Rest running {m} min \u2014 forgotten to end?'],
        w2: ['PacingApp \uD83D\uDFE0 Rest', 'Already {m} min rest! Please end.'],
        w3: ['PacingApp \uD83D\uDD34 Rest!', '{m} min rest! End immediately!'],
        pn: ['PacingApp \u26A0\uFE0F Rest needed!', 'Too long without rest. Rest now \u2014 app will lock otherwise!']
    },
    nl: {
        w1: ['PacingApp \uD83D\uDC9C Rust', 'Rust loopt {m} min \u2014 vergeten?'],
        w2: ['PacingApp \uD83D\uDFE0 Rust', 'Al {m} min rust! Beeindig nu.'],
        w3: ['PacingApp \uD83D\uDD34 Rust!', '{m} min rust! Direct beeindigen!'],
        pn: ['PacingApp \u26A0\uFE0F Rust nodig!', 'Te lang actief. Rust nu \u2014 app wordt anders vergrendeld!']
    },
    fr: {
        w1: ['PacingApp \uD83D\uDC9C Repos', 'Repos depuis {m} min \u2014 oubli\u00e9?'],
        w2: ['PacingApp \uD83D\uDFE0 Repos', 'D\u00e9j\u00e0 {m} min! Terminez le repos.'],
        w3: ['PacingApp \uD83D\uDD34 Repos!', '{m} min de repos! Terminez!'],
        pn: ['PacingApp \u26A0\uFE0F Repos n\u00e9cessaire!', 'Trop longtemps actif. Repos maintenant \u2014 l\'app sera bloqu\u00e9e sinon!']
    },
    es: {
        w1: ['PacingApp \uD83D\uDC9C Descanso', 'Descanso {m} min \u2014 olvidaste?'],
        w2: ['PacingApp \uD83D\uDFE0 Descanso', 'Ya {m} min! Termina el descanso.'],
        w3: ['PacingApp \uD83D\uDD34 Descanso!', '{m} min! Termina ahora!'],
        pn: ['PacingApp \u26A0\uFE0F Descanso necesario!', 'Demasiado activo. Descansa ahora \u2014 la app se bloquear\u00e1!']
    }
};

function T(lang, key, m) {
    var l = TEXTS[lang] || TEXTS.de;
    var arr = l[key] || ['PacingApp', ''];
    return [arr[0], arr[1].replace('{m}', m || '')];
}

function notif(title, body, tag, req) {
    return self.registration.showNotification(title, {
        body: body, tag: tag,
        requireInteraction: !!req,
        renotify: true,
        vibrate: req ? [300,100,300,100,300] : [200,100,200]
    });
}

// Kern-Check: liest aus DB und sendet Notifications
function checkPause() {
    return Promise.all([
        dbGet('pauseStart'), dbGet('lang'),
        dbGet('warn1'), dbGet('warn2'), dbGet('warn3')
    ]).then(function(vals) {
        var startTs = vals[0], lang = vals[1] || 'de';
        var w1 = vals[2], w2 = vals[3], w3 = vals[4];
        if (!startTs) { return; }
        var m = Math.round((Date.now() - startTs) / 60000);
        var t;
        if (m >= 90 && !w3) {
            t = T(lang, 'w3', m);
            return dbSet('warn3', true).then(function() { return notif(t[0], t[1], 'p90', true); });
        } else if (m >= 60 && !w2) {
            t = T(lang, 'w2', m);
            return dbSet('warn2', true).then(function() { return notif(t[0], t[1], 'p60', true); });
        } else if (m >= 30 && !w1) {
            t = T(lang, 'w1', m);
            return dbSet('warn1', true).then(function() { return notif(t[0], t[1], 'p30', false); });
        }
    });
}

// Pause-nötig Check (Timer_Vorzwang)
function checkPauseNoetig() {
    return Promise.all([dbGet('pauseNoetigTs'), dbGet('lang')]).then(function(vals) {
        var ts = vals[0], lang = vals[1] || 'de';
        if (!ts) { return; }
        var m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) { return; } // Zu frisch
        var t = T(lang, 'pn', '');
        return dbSet('pauseNoetigTs', null).then(function() {
            return notif(t[0], t[1], 'pnoetig', true);
        });
    });
}

// Background Sync - zuverlässigste Methode
self.addEventListener('sync', function(e) {
    if (e.tag === 'pacing-pause-check') {
        e.waitUntil(checkPause());
    }
    if (e.tag === 'pacing-pause-noetig') {
        e.waitUntil(checkPauseNoetig());
    }
});

// Fetch - SW aktiv halten via periodischen Fetch-Trick
self.addEventListener('fetch', function(e) {
    // Normales Fetch durchleiten
    e.respondWith(fetch(e.request).catch(function() {
        return new Response('offline');
    }));
});

self.addEventListener('message', function(e) {
    if (!e.data) { return; }
    var d = e.data;

    if (d.type === 'PAUSE_START') {
        var ts = d.ts || Date.now();
        Promise.all([
            dbSet('pauseStart', ts),
            dbSet('warn1', false),
            dbSet('warn2', false),
            dbSet('warn3', false),
            dbSet('lang', d.lang || 'de'),
            dbSet('pauseNoetigTs', null)
        ]).then(function() {
            // Background Sync registrieren - iOS weckt SW bei nächster Gelegenheit
            if (self.registration.sync) {
                self.registration.sync.register('pacing-pause-check').catch(function(){});
            }
        });
    }

    if (d.type === 'PAUSE_END') {
        dbSet('pauseStart', null);
        dbSet('pauseNoetigTs', null);
    }

    if (d.type === 'SET_LANG') {
        dbSet('lang', d.lang || 'de');
    }

    if (d.type === 'PAUSE_NOETIG') {
        // App sendet: Timer-Vorzwang aktiv, Notification nötig
        dbSet('pauseNoetigTs', Date.now()).then(function() {
            dbGet('lang').then(function(lang) {
                var t = T(lang || 'de', 'pn', '');
                notif(t[0], t[1], 'pnoetig', true);
            });
        });
    }

    if (d.type === 'NOTIFY') {
        notif(d.title, d.body, d.tag || 'pacing', d.requireInteraction);
    }
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs) {
            for (var i = 0; i < cs.length; i++) {
                if (cs[i].url.indexOf('PacingApp') >= 0) { return cs[i].focus(); }
            }
            return clients.openWindow('https://pmmyx7k52r-bit.github.io/PacingApp/druck.html');
        })
    );
});
