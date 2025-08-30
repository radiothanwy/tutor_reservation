// COMPLETE REPLACEMENT for your secure-config.js
// This version bypasses CORS issues entirely by using JSONP for everything

const SECURE_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxFVTZ_z57DInEyVicULCGTHcfg4nCOXbCWrB1j7iR-KP6YKAmK1VsMKkndyxT-gyw5eQ/exec',
  ADMIN_API_URL: 'https://script.google.com/macros/s/AKfycbz41y2G6MADljUNoCK4iMAPW4ANBptpomkXSPPofuW9Ikr6EMWpf9y46wJqc5PZ3YnOew/exec',
  ADMIN_KEY: 'thoraya2025',
  REQUEST_TIMEOUT: 15000,
  MAX_RETRIES: 3,
  IS_PRODUCTION: window.location.hostname.includes('github.io'),
  DEBUG_MODE: !window.location.hostname.includes('github.io'),
  ALLOWED_ORIGINS: [
    'https://radiothanwy.github.io',
    'https://radiothanwy.github.io/tutor_reservation'
  ]
};

// SIMPLIFIED API CLIENT - JSONP ONLY (no CORS issues)
class SecureApiClient {
  constructor(config) {
    this.config = config;
    this.requestId = 0;
    console.log('SecureApiClient initialized with config:', config.API_URL);
  }

  async submitForm(formData) {
    console.log('Submitting form data:', formData);
    
    // Build URL with all form data as query parameters
    const params = new URLSearchParams({
      action: 'submitform',
      origin: window.location.origin,
      firstName: formData.firstName || '',
      lastName: formData.lastName || '',
      email: formData.email || '',
      phone: formData.phone || '',
      grade: formData.grade || '',
      gender: formData.gender || '',
      englishLevel: formData.englishLevel || '',
      preferredDays: formData.preferredDays || '',
      preferredTime: formData.preferredTime || '',
      sessionLength: formData.sessionLength || '',
      gpa: formData.gpa || '',
      learningGoals: (formData.learningGoals || '').substring(0, 200),
      referral: formData.referral || '',
      userAgent: navigator.userAgent.substring(0, 100),
      formTime: formData.formTime || '',
      timestamp: new Date().toISOString()
    });

    const url = `${this.config.API_URL}?${params.toString()}`;
    return this._jsonp(url);
  }

  async queryReservation(reservationId) {
    const clean = String(reservationId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const params = new URLSearchParams({
      action: 'queryreservation',
      origin: window.location.origin,
      reservationId: clean
    });
    
    const url = `${this.config.API_URL}?${params.toString()}`;
    return this._jsonp(url);
  }

  async getReservations() {
    const params = new URLSearchParams({
      action: 'getreservations',
      origin: window.location.origin
    });
    
    const url = `${this.config.ADMIN_API_URL}?${params.toString()}`;
    return this._jsonp(url);
  }

  async updateStatus(reservationId, newStatus) {
    const params = new URLSearchParams({
      action: 'updatestatus',
      origin: window.location.origin,
      reservationId: reservationId,
      status: newStatus
    });
    
    const url = `${this.config.ADMIN_API_URL}?${params.toString()}`;
    return this._jsonp(url);
  }

  async healthCheck() {
    const params = new URLSearchParams({
      action: 'health',
      origin: window.location.origin
    });
    
    const url = `${this.config.API_URL}?${params.toString()}`;
    return this._jsonp(url);
  }

  // JSONP implementation that actually works
  _jsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `jsonpCallback_${++this.requestId}_${Date.now()}`;
      const finalUrl = url + `&callback=${callbackName}`;
      
      console.log('JSONP request to:', finalUrl);
      
      let script, timeoutId;

      // Set up timeout
      timeoutId = setTimeout(() => {
        this._cleanup(callbackName, script);
        reject(new Error('Request timeout after ' + this.config.REQUEST_TIMEOUT + 'ms'));
      }, this.config.REQUEST_TIMEOUT);

      // Set up callback
      window[callbackName] = (response) => {
        this._cleanup(callbackName, script, timeoutId);
        console.log('JSONP response received:', response);
        
        if (response && response.success !== false) {
          resolve(response);
        } else {
          reject(new Error(response && response.error ? response.error : 'Request failed'));
        }
      };

      // Create and load script
      script = document.createElement('script');
      script.src = finalUrl;
      script.onerror = () => {
        this._cleanup(callbackName, script, timeoutId);
        reject(new Error('Failed to load script - check your Google Apps Script URL'));
      };
      
      document.head.appendChild(script);
    });
  }

  _cleanup(callbackName, script, timeoutId) {
    try { clearTimeout(timeoutId); } catch (e) {}
    try { delete window[callbackName]; } catch (e) {}
    try { 
      if (script && script.parentNode) {
        script.parentNode.removeChild(script); 
      }
    } catch (e) {}
  }
}

// Form Handler (unchanged)
class SecureFormHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.startTime = Date.now();
  }

  async submitForm(formData) {
    try {
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

// Environment validation
const SecurityUtils = {
  validateEnvironment() {
    const issues = [];
    if (!SECURE_CONFIG.API_URL) issues.push('API URL not configured');
    return { isValid: issues.length === 0, issues };
  }
};

// Notifications
class SecureNotificationSystem {
  static show(msg, type='info', duration=5000) {
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
      fontSize: '14px', fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'margin-left:10px; cursor:pointer; font-weight:bold;';
    closeBtn.onclick = () => n.remove();
    n.appendChild(closeBtn);
    
    document.body.appendChild(n);
    if (duration > 0) setTimeout(() => n.remove(), duration);
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing secure configuration...');
  
  try {
    window.secureApiClient = new SecureApiClient(SECURE_CONFIG);
    window.secureFormHandler = new SecureFormHandler(window.secureApiClient);
    
    console.log('Secure configuration loaded successfully');
    SecureNotificationSystem.show('System ready', 'success', 3000);
    
    // Test health check
    if (SECURE_CONFIG.DEBUG_MODE) {
      window.secureApiClient.healthCheck()
        .then(response => {
          console.log('Health check result:', response);
          if (response.success) {
            SecureNotificationSystem.show('Connection verified', 'success', 3000);
          } else {
            SecureNotificationSystem.show('Health check failed: ' + (response.error || 'Unknown error'), 'warning', 8000);
          }
        })
        .catch(e => { 
          console.error('Health check error:', e);
          SecureNotificationSystem.show('Connection test failed: ' + e.message, 'error', 8000); 
        });
    }
    
  } catch (e) {
    console.error('Initialization error:', e);
    SecureNotificationSystem.show('System initialization failed: ' + e.message, 'error', 0);
  }
});