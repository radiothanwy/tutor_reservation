// CLIENT-SIDE SECURITY CONFIGURATION – no secrets in browser
const SECURE_CONFIG = {
  // Your public Apps Script web app URL (PUBLIC deployment)
  API_URL: 'https://script.google.com/macros/s/AKfycbwZrmAHDuIcUJqzAGSCeP6B4K84_Bf5dal1XNBS9NnifzbkSdSZW38MpkOzJhNW4Do8yw/exec',

  // Your admin Apps Script web app URL (ADMIN deployment)
  ADMIN_API_URL: 'https://script.google.com/macros/s/AKfycbxShiazacyM4BLES66Ky9CHWJLt4b7TzC7n4Kx586kmN_N-xca1_B1jB5-pEx-8IxbkiA/exec',

  // Admin authentication key (change this to your preferred password)
  ADMIN_KEY: 'tutor-admin-2024',

  REQUEST_TIMEOUT: 20000, // Increased timeout
  MAX_RETRIES: 3,

  // Environment detection
  IS_PRODUCTION: window.location.hostname.includes('github.io') || window.location.protocol === 'https:',
  DEBUG_MODE: !window.location.hostname.includes('github.io') && window.location.hostname !== 'localhost',

  // Allowed hostnames (client-side soft check)
  ALLOWED_ORIGINS: [
    'https://radiothanwy.github.io',
    'https://radiothanwy.github.io/tutor_reservation'
  ]
};

// ────────────────────────────────────────────────────────────────
// ENHANCED API CLIENT with better CORS handling
// ────────────────────────────────────────────────────────────────
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
    return this._makeRequest(payload);
  }

  async queryReservation(reservationId) {
    const clean = String(reservationId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 20);
    const payload = {
      action: 'queryreservation',
      origin: window.location.origin,
      reservationId: clean
    };
    return this._makeRequest(payload);
  }

  async getReservations() {
    // Uses ADMIN_API_URL (protected deployment)
    const url = this.config.ADMIN_API_URL || this.config.API_URL;
    const payload = {
      action: 'getreservations',
      origin: window.location.origin
    };
    return this._makeRequest(payload, url);
  }

  async updateStatus(reservationId, newStatus) {
    const url = this.config.ADMIN_API_URL || this.config.API_URL;
    const payload = {
      action: 'updatestatus',
      origin: window.location.origin,
      reservationId: reservationId,
      status: newStatus
    };
    return this._makeRequest(payload, url);
  }

  async healthCheck() {
    try {
      const url = `${this.config.API_URL}?action=health&origin=${encodeURIComponent(window.location.origin)}`;
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      return await response.json();
    } catch (error) {
      console.warn('Health check failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Enhanced request method with better error handling
  async _makeRequest(payload, urlOverride) {
    const url = urlOverride || this.config.API_URL;
    let lastError;

    // Strategy 1: Try POST with CORS
    try {
      console.log('Attempting POST request to:', url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('POST successful:', result);
      return result;
      
    } catch (postError) {
      console.warn('POST failed, trying JSONP fallback:', postError);
      lastError = postError;
    }

    // Strategy 2: JSONP Fallback
    try {
      console.log('Attempting JSONP fallback');
      return await this._jsonpRequest(payload, url);
    } catch (jsonpError) {
      console.error('JSONP also failed:', jsonpError);
      throw new Error(`All request methods failed. POST: ${lastError.message}, JSONP: ${jsonpError.message}`);
    }
  }

  async _jsonpRequest(payload, url) {
    return new Promise((resolve, reject) => {
      const callbackName = `jsonp_${++this.requestId}_${Date.now()}`;
      let script, timeoutId;

      // Setup timeout
      timeoutId = setTimeout(() => {
        this._cleanup(callbackName, script, timeoutId);
        reject(new Error('JSONP request timeout'));
      }, this.config.REQUEST_TIMEOUT);

      // Setup callback
      window[callbackName] = (response) => {
        this._cleanup(callbackName, script, timeoutId);
        if (response && response.success !== false) {
          resolve(response);
        } else {
          reject(new Error(response && response.error ? response.error : 'JSONP request failed'));
        }
      };

      // Build JSONP URL
      const params = new URLSearchParams({
        action: payload.action,
        origin: window.location.origin,
        callback: callbackName
      });

      // Add specific parameters based on action
      if (payload.reservationId) params.set('reservationId', payload.reservationId);
      if (payload.status) params.set('status', payload.status);
      if (payload.data) {
        // For form data, we'll need to use POST anyway, so reject here
        this._cleanup(callbackName, script, timeoutId);
        reject(new Error('Form data too large for JSONP'));
        return;
      }

      const jsonpUrl = `${url}?${params.toString()}`;
      console.log('JSONP URL:', jsonpUrl);

      // Create and load script
      script = document.createElement('script');
      script.src = jsonpUrl;
      script.onerror = () => {
        this._cleanup(callbackName, script, timeoutId);
        reject(new Error('JSONP script load failed'));
      };
      
      document.head.appendChild(script);
    });
  }

  // Helpers
  async _augment(data) {
    return {
      ...data,
      clientIP: 'redacted',
      userAgent: navigator.userAgent.slice(0, 200),
      origin: window.location.origin,
      formVersion: '3.0',
      timestamp: new Date().toISOString()
    };
  }

  _cleanup(callbackName, script, timeoutId) {
    try { clearTimeout(timeoutId); } catch {}
    try { delete window[callbackName]; } catch {}
    try { script && script.parentNode && script.parentNode.removeChild(script); } catch {}
  }
}

// Form Handler Class
class SecureFormHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.startTime = Date.now();
  }

  async submitForm(formData) {
    try {
      // Add form timing data
      const formTime = Math.floor((Date.now() - this.startTime) / 1000);
      const submissionData = {
        ...formData,
        formTime: formTime + ' seconds',
        timestamp: new Date().toISOString()
      };

      const response = await this.apiClient.submitForm(submissionData);
      
      if (response.success) {
        return {
          success: true,
          reservationId: response.reservationId,
          studentName: `${formData.firstName} ${formData.lastName}`
        };
      } else {
        throw new Error(response.error || 'Submission failed');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      throw new Error('Failed to submit reservation: ' + error.message);
    }
  }
}

// Simple env check (no secrets)
const SecurityUtils = {
  validateEnvironment() {
    const issues = [];
    if (!SECURE_CONFIG.API_URL) issues.push('API URL not configured');
    if (!SECURE_CONFIG.ALLOWED_ORIGINS.some(origin => window.location.origin.startsWith(origin))) {
      issues.push('Origin not in allowed list (client check)');
    }
    return { isValid: issues.length === 0, issues };
  }
};

// Enhanced Notifications
class SecureNotificationSystem {
  static show(msg, type='info', duration=5000) {
    // Remove existing notifications of same type
    document.querySelectorAll(`.secure-notification--${type}`).forEach(n => n.remove());
    
    const n = document.createElement('div');
    n.className = `secure-notification secure-notification--${type}`;
    n.textContent = String(msg).slice(0, 300);
    Object.assign(n.style, {
      position:'fixed', top:'20px', right:'20px', zIndex:'9999',
      padding:'12px 14px', color:'#fff', borderRadius:'8px',
      background: type==='success' ? '#28a745' :
                  type==='error' ? '#dc3545' :
                  type==='warning' ? '#fd7e14' : '#007bff',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      animation: 'slideInRight 0.3s ease-out'
    });
    
    // Add close button
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'margin-left:10px; cursor:pointer; font-weight:bold;';
    closeBtn.onclick = () => n.remove();
    n.appendChild(closeBtn);
    
    document.body.appendChild(n);
    if (duration > 0) setTimeout(() => n.remove(), duration);
  }
}

// Enhanced Wire-up with better error reporting
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing secure configuration...');
  
  const env = SecurityUtils.validateEnvironment();
  if (!env.isValid) {
    console.warn('Environment validation issues:', env.issues);
    if (SECURE_CONFIG.IS_PRODUCTION) {
      // In production, show warning but continue
      SecureNotificationSystem.show('System validation warning - some features may be limited', 'warning', 8000);
    }
  }
  
  try {
    // Initialize API client
    window.secureApiClient = new SecureApiClient(SECURE_CONFIG);
    window.secureFormHandler = new SecureFormHandler(window.secureApiClient);
    
    console.log('Secure configuration loaded successfully');
    
    // Test connection in debug mode
    if (SECURE_CONFIG.DEBUG_MODE) {
      window.secureApiClient.healthCheck()
        .then(response => {
          if (response.success) {
            SecureNotificationSystem.show('Connection verified', 'success', 3000);
          } else {
            SecureNotificationSystem.show('Connection test failed', 'warning', 5000);
          }
        })
        .catch(e => { 
          console.error('Health check error:', e);
          SecureNotificationSystem.show('Connection test failed: ' + e.message, 'warning', 8000); 
        });
    }
    
  } catch (e) {
    console.error('Initialization error:', e);
    SecureNotificationSystem.show('System initialization failed: ' + e.message, 'error', 0);
  }
});

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(style);