// CLIENT-SIDE SECURITY CONFIGURATION — no secrets in browser
const SECURE_CONFIG = {
  // Your public Apps Script web app URL (PUBLIC deployment)
  API_URL: 'https://script.google.com/macros/s/AKfycbwKgZGVPJZtbfaVK4il9QL88iEW2ACS75R_tK1c_Xxly1te-Ra7mHhlmeZXWAdV3JOlqQ/exec',

  // Your admin Apps Script web app URL (ADMIN deployment)
  ADMIN_API_URL: 'https://script.google.com/macros/s/AKfycbwHmvzkN2qAN076HKZch_UF-D53hhCgKdJQeRHD4KdcmHuW6KV-R32iRh-J2crVQWORCA/exec',

  REQUEST_TIMEOUT: 15000,
  MAX_RETRIES: 2,

  // Environment detection
  IS_PRODUCTION: window.location.hostname.includes('github.io') || window.location.protocol === 'https:',
  DEBUG_MODE: !window.location.hostname.includes('github.io') && window.location.hostname !== 'localhost',

  // Allowed hostnames (client-side soft check)
  ALLOWED_ORIGINS: [
    'https://radiothanwy.github.io',
    'https://radiothanwy.github.io/tutor_reservation'
  ]
};

// ─────────────────────────────────────────────
// API CLIENT (no keys; CORS POST + JSONP fallback)
// ─────────────────────────────────────────────
class SecureApiClient {
  constructor(config) {
    this.config = config;
    this.requestId = 0;

    if (!this.isConfigValid()) {
      console.error('Invalid configuration:', this.config.API_URL);
      throw new Error('Configuration validation failed');
    }
  }

  isConfigValid() {
    return Boolean(
      this.config.API_URL &&
      this.config.API_URL.startsWith('https://script.google.com/macros/s/')
    );
  }

  async submitForm(formData) {
    const payload = {
      action: 'submitform',
      origin: window.location.origin,
      data: await this._augment(formData)
    };
    return this._postOrJsonp(payload);
  }

  async queryReservation(reservationId) {
    const clean = String(reservationId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 20);
    const payload = {
      action: 'queryreservation',
      origin: window.location.origin,
      reservationId: clean
    };
    return this._postOrJsonp(payload);
  }

  async getReservationsAdmin() {
    // Uses ADMIN_API_URL (protected deployment)
    const url = this.config.ADMIN_API_URL || this.config.API_URL;
    const payload = {
      action: 'getreservations',
      origin: window.location.origin
    };
    return this._postOrJsonp(payload, url);
  }

  async healthCheck() {
    const url = `${this.config.API_URL}?action=health&origin=${encodeURIComponent(window.location.origin)}&callback=health_${Date.now()}`;
    return this._jsonp(url);
  }

  // Helpers
  async _augment(data) {
    return {
      ...data,
      clientIP: 'redacted', // GAS can't reliably read this; avoid leaking
      userAgent: navigator.userAgent.slice(0, 200),
      origin: window.location.origin,
      formVersion: '3.0'
    };
  }

  async _postOrJsonp(payload, urlOverride) {
    const url = (urlOverride || this.config.API_URL);
    // Try POST with CORS
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(to);
      const json = await res.json();
      if (json && json.success !== false) return json;
      throw new Error(json && json.error ? json.error : 'Request failed');
    } catch (e) {
      // Fallback JSONP (GET)
      const params = new URLSearchParams({
        action: payload.action,
        origin: window.location.origin,
        reservationId: payload.reservationId || '',
        callback: `cb_${++this.requestId}_${Date.now()}`
      });
      const url2 = `${url}?${params.toString()}`;
      return this._jsonp(url2);
    }
  }

  _jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbMatch = url.match(/callback=([^&]+)/);
      const cbName = cbMatch ? cbMatch[1] : `cb_${++this.requestId}_${Date.now()}`;
      let script, timeoutId;

      timeoutId = setTimeout(() => {
        this._cleanup(cbName, script, timeoutId);
        reject(new Error('Request timeout'));
      }, this.config.REQUEST_TIMEOUT);

      window[cbName] = (response) => {
        this._cleanup(cbName, script, timeoutId);
        if (response && response.success !== false) resolve(response);
        else reject(new Error(response && response.error ? response.error : 'Request failed'));
      };

      script = document.createElement('script');
      script.src = url.includes('callback=') ? url : `${url}&callback=${cbName}`;
      script.onerror = () => {
        this._cleanup(cbName, script, timeoutId);
        reject(new Error('Network error'));
      };
      document.head.appendChild(script);
    });
  }

  _cleanup(cbName, script, timeoutId) {
    try { clearTimeout(timeoutId); } catch {}
    try { delete window[cbName]; } catch {}
    try { script && script.parentNode && script.parentNode.removeChild(script); } catch {}
  }
}

// Simple env check (no secrets)
const SecurityUtils = {
  validateEnvironment() {
    const issues = [];
    if (!SECURE_CONFIG.API_URL) issues.push('API URL not configured');
    if (!SECURE_CONFIG.ALLOWED_ORIGINS.includes(window.location.origin)) {
      issues.push('Origin not in allowed list (client check)');
    }
    return { isValid: issues.length === 0, issues };
  }
};

// Notifications (unchanged)
class SecureNotificationSystem {
  static show(msg, type='info', duration=5000) {
    const n = document.createElement('div');
    n.className = `secure-notification secure-notification--${type}`;
    n.textContent = String(msg).slice(0, 300);
    Object.assign(n.style, {
      position:'fixed', top:'20px', right:'20px', zIndex:'9999',
      padding:'12px 14px', color:'#fff', borderRadius:'8px',
      background: type==='success' ? '#28a745' :
                  type==='error' ? '#dc3545' :
                  type==='warning' ? '#fd7e14' : '#007bff'
    });
    document.body.appendChild(n);
    if (duration>0) setTimeout(()=> n.remove(), duration);
  }
};

// Wire-up
document.addEventListener('DOMContentLoaded', () => {
  const env = SecurityUtils.validateEnvironment();
  if (!env.isValid && SECURE_CONFIG.IS_PRODUCTION) {
    SecureNotificationSystem.show('System temporarily unavailable. Please try again later.', 'error', 0);
    return;
  }
  try {
    window.secureApiClient = new SecureApiClient(SECURE_CONFIG);
    window.secureFormHandler = new SecureFormHandler(window.secureApiClient); // your existing class
    if (SECURE_CONFIG.DEBUG_MODE) {
      window.secureApiClient.healthCheck()
        .then(()=> SecureNotificationSystem.show('Health OK', 'success'))
        .catch(e=> { console.error(e); SecureNotificationSystem.show('Health check failed', 'warning'); });
    }
  } catch (e) {
    console.error(e);
    SecureNotificationSystem.show('Initialization failed', 'error', 0);
  }
});
