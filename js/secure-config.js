// CLIENT-SIDE SECURITY CONFIGURATION
// This should be placed in js/secure-config.js

const SECURE_CONFIG = {
  // API Configuration - These will be replaced during deployment
  API_URL: 'PLACEHOLDER_SCRIPT_URL',
  API_KEY: 'PLACEHOLDER_API_KEY',
  ADMIN_KEY: 'PLACEHOLDER_ADMIN_KEY',
  
  // Security settings
  REQUEST_TIMEOUT: 15000, // 15 seconds
  MAX_RETRIES: 3,
  
  // Environment detection
  IS_PRODUCTION: window.location.hostname.includes('github.io') || window.location.protocol === 'https:',
  DEBUG_MODE: !window.location.hostname.includes('github.io') && window.location.hostname !== 'localhost'
};

// SECURE API CLIENT
class SecureApiClient {
  constructor(config) {
    this.config = config;
    this.requestId = 0;
    
    // Validate configuration on initialization
    if (!this.isConfigValid()) {
      console.error('Invalid API configuration detected');
      throw new Error('Configuration validation failed');
    }
  }

  // Validate configuration
  isConfigValid() {
    return this.config.API_URL && 
           this.config.API_URL !== 'PLACEHOLDER_SCRIPT_URL' &&
           this.config.API_KEY && 
           this.config.API_KEY !== 'PLACEHOLDER_API_KEY' &&
           this.config.API_URL.includes('script.google.com');
  }

  // Generate request signature for additional security
  generateRequestSignature(data) {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2);
    return {
      timestamp,
      nonce,
      signature: btoa(`${timestamp}-${nonce}-${JSON.stringify(data)}`).substring(0, 32)
    };
  }

  // Secure form submission
  async submitForm(formData) {
    const requestData = {
      ...formData,
      clientIP: await this.getClientIP(),
      userAgent: navigator.userAgent.substring(0, 200), // Limit length
      origin: window.location.origin,
      ...this.generateRequestSignature(formData)
    };

    const params = new URLSearchParams({
      apikey: this.config.API_KEY,
      data: encodeURIComponent(JSON.stringify(requestData)),
      callback: `secureCallback_${++this.requestId}_${Date.now()}`
    });

    return this.makeSecureJSONPRequest(`${this.config.API_URL}?${params.toString()}`);
  }

  // Admin function - get reservations
  async getReservations() {
    const params = new URLSearchParams({
      action: 'getReservations',
      apikey: this.config.API_KEY,
      adminKey: this.config.ADMIN_KEY,
      timestamp: Date.now().toString(),
      callback: `adminCallback_${++this.requestId}_${Date.now()}`
    });

    return this.makeSecureJSONPRequest(`${this.config.API_URL}?${params.toString()}`);
  }

  // Admin function - update status
  async updateStatus(reservationId, status) {
    const params = new URLSearchParams({
      action: 'updateStatus',
      apikey: this.config.API_KEY,
      adminKey: this.config.ADMIN_KEY,
      reservationId: reservationId,
      status: status,
      timestamp: Date.now().toString(),
      callback: `updateCallback_${++this.requestId}_${Date.now()}`
    });

    return this.makeSecureJSONPRequest(`${this.config.API_URL}?${params.toString()}`);
  }

  // Student function - query reservation
  async queryReservation(reservationId) {
    // Sanitize reservation ID
    const cleanId = reservationId.replace(/[^A-Z0-9]/gi, '').toUpperCase().substring(0, 20);
    
    const params = new URLSearchParams({
      action: 'queryReservation',
      apikey: this.config.API_KEY,
      reservationId: cleanId,
      timestamp: Date.now().toString(),
      callback: `queryCallback_${++this.requestId}_${Date.now()}`
    });

    return this.makeSecureJSONPRequest(`${this.config.API_URL}?${params.toString()}`);
  }

  // Secure JSONP implementation with timeout and cleanup
  makeSecureJSONPRequest(url) {
    return new Promise((resolve, reject) => {
      const callbackMatch = url.match(/callback=([^&]+)/);
      if (!callbackMatch) {
        reject(new Error('No callback specified'));
        return;
      }

      const callbackName = callbackMatch[1];
      let timeoutId, script;

      // Set up timeout
      timeoutId = setTimeout(() => {
        this.cleanup(callbackName, script, timeoutId);
        reject(new Error('Request timeout - please try again'));
      }, this.config.REQUEST_TIMEOUT);

      // Set up callback
      window[callbackName] = (response) => {
        this.cleanup(callbackName, script, timeoutId);
        
        if (response.success === false) {
          reject(new Error(response.error || 'Request failed'));
        } else {
          resolve(response);
        }
      };

      // Create and inject script
      script = document.createElement('script');
      script.onerror = () => {
        this.cleanup(callbackName, script, timeoutId);
        reject(new Error('Network error - please check your connection'));
      };

      // Security: Validate URL before injection
      if (!this.isValidScriptUrl(url)) {
        reject(new Error('Invalid script URL'));
        return;
      }

      script.src = url;
      document.head.appendChild(script);
    });
  }

  // Validate script URL for security
  isValidScriptUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'script.google.com' && 
             urlObj.pathname.includes('/macros/s/') &&
             urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Cleanup JSONP resources
  cleanup(callbackName, script, timeoutId) {
    if (timeoutId) clearTimeout(timeoutId);
    if (window[callbackName]) delete window[callbackName];
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
  }

  // Get client IP (best effort)
  async getClientIP() {
    try {
      // This is a fallback - in production, server should determine IP
      const response = await fetch('https://httpbin.org/ip', { 
        method: 'GET',
        timeout: 3000 
      });
      const data = await response.json();
      return data.origin || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Health check
  async healthCheck() {
    const params = new URLSearchParams({
      action: 'health',
      apikey: this.config.API_KEY,
      timestamp: Date.now().toString(),
      callback: `healthCallback_${Date.now()}`
    });

    return this.makeSecureJSONPRequest(`${this.config.API_URL}?${params.toString()}`);
  }
}

// SECURE FORM HANDLER
class SecureFormHandler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.securityChecks = {
      honeypot: true,
      timing: true,
      validation: true,
      rateLimit: true
    };
    this.startTime = Date.now();
    this.submissionAttempts = 0;
    this.maxSubmissionAttempts = 3;
  }

  // Comprehensive form validation
  validateFormData(formData) {
    const errors = [];

    // Required field validation
    const requiredFields = {
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email address',
      phone: 'Phone number',
      grade: 'Grade level',
      gender: 'Gender',
      englishLevel: 'English proficiency',
      preferredDays: 'Preferred days',
      preferredTime: 'Preferred time',
      sessionLength: 'Session length'
    };

    Object.entries(requiredFields).forEach(([field, label]) => {
      if (!formData[field] || !formData[field].toString().trim()) {
        errors.push(`${label} is required`);
      }
    });

    // Email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (formData.email && !emailRegex.test(formData.email.trim())) {
      errors.push('Please enter a valid email address');
    }

    // Phone validation
    const phoneRegex = /^[\d\s\-\(\)\+]{10,}$/;
    if (formData.phone && !phoneRegex.test(formData.phone.trim())) {
      errors.push('Please enter a valid phone number');
    }

    // Name validation (no numbers or special characters)
    const nameRegex = /^[a-zA-Z\s\-'\.]{2,50}$/;
    if (formData.firstName && !nameRegex.test(formData.firstName.trim())) {
      errors.push('First name contains invalid characters');
    }
    if (formData.lastName && !nameRegex.test(formData.lastName.trim())) {
      errors.push('Last name contains invalid characters');
    }

    // GPA validation
    if (formData.gpa) {
      const gpa = parseFloat(formData.gpa);
      if (isNaN(gpa) || gpa < 0 || gpa > 4) {
        errors.push('GPA must be between 0.0 and 4.0');
      }
    }

    // Grade validation
    const validGrades = ['4', '5', '6', '7', '8', '9', '10', '11', '12'];
    if (formData.grade && !validGrades.includes(formData.grade.toString())) {
      errors.push('Please select a valid grade level');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Security checks before submission
  performSecurityChecks(formData) {
    // 1. Honeypot check
    if (this.securityChecks.honeypot) {
      const honeypotField = document.querySelector('.honeypot input');
      if (honeypotField && honeypotField.value !== '') {
        console.warn('Honeypot triggered');
        return { passed: false, reason: 'Security validation failed' };
      }
    }

    // 2. Timing check (prevent automated submissions)
    if (this.securityChecks.timing) {
      const timeSpent = (Date.now() - this.startTime) / 1000;
      if (timeSpent < 15) {
        return { passed: false, reason: 'Please take more time to complete the form carefully' };
      }
      if (timeSpent > 1800) { // 30 minutes
        return { passed: false, reason: 'Form session expired. Please refresh and try again' };
      }
    }

    // 3. Rate limiting check
    if (this.securityChecks.rateLimit) {
      this.submissionAttempts++;
      if (this.submissionAttempts > this.maxSubmissionAttempts) {
        return { passed: false, reason: 'Too many submission attempts. Please refresh the page' };
      }
    }

    // 4. Terms agreement check
    const termsCheckbox = document.getElementById('terms');
    if (!termsCheckbox || !termsCheckbox.checked) {
      return { passed: false, reason: 'You must agree to the terms and conditions' };
    }

    return { passed: true };
  }

  // Sanitize form data
  sanitizeFormData(formData) {
    const sanitized = {};

    Object.entries(formData).forEach(([key, value]) => {
      if (typeof value === 'string') {
        sanitized[key] = value
          .trim()
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/[<>]/g, '')
          .replace(/javascript:/gi, '')
          .replace(/vbscript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .substring(0, 500);
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }

  // Main submission handler
  async submitForm(formData) {
    try {
      // 1. Validate form data
      const validation = this.validateFormData(formData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // 2. Perform security checks
      const securityCheck = this.performSecurityChecks(formData);
      if (!securityCheck.passed) {
        throw new Error(securityCheck.reason);
      }

      // 3. Sanitize data
      const sanitizedData = this.sanitizeFormData(formData);

      // 4. Add metadata
      const submissionData = {
        ...sanitizedData,
        submissionTime: new Date().toISOString(),
        formTime: `${Math.floor((Date.now() - this.startTime) / 1000)} seconds`,
        formVersion: '2.0',
        securityPassed: true
      };

      // 5. Submit via secure API client
      const result = await this.apiClient.submitForm(submissionData);
      
      return result;

    } catch (error) {
      console.error('Form submission error:', error.message);
      throw error;
    }
  }
}

// NOTIFICATION SYSTEM
class SecureNotificationSystem {
  static show(message, type = 'info', duration = 5000) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.secure-notification');
    existing.forEach(el => el.remove());

    // Create notification
    const notification = document.createElement('div');
    notification.className = `secure-notification secure-notification--${type}`;
    notification.innerHTML = `
      <div class="secure-notification__content">
        <i class="fas fa-${this.getIcon(type)}"></i>
        <span>${this.sanitizeMessage(message)}</span>
        <button class="secure-notification__close" onclick="this.parentElement.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      min-width: 300px;
      max-width: 500px;
      padding: 15px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease-out;
      background: ${this.getBackgroundColor(type)};
    `;

    document.body.appendChild(notification);

    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) {
          notification.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => notification.remove(), 300);
        }
      }, duration);
    }
  }

  static getIcon(type) {
    const icons = {
      success: 'check-circle',
      error: 'exclamation-triangle',
      warning: 'exclamation-circle',
      info: 'info-circle'
    };
    return icons[type] || icons.info;
  }

  static getBackgroundColor(type) {
    const colors = {
      success: 'linear-gradient(135deg, #28a745, #20c997)',
      error: 'linear-gradient(135deg, #dc3545, #e83e8c)',
      warning: 'linear-gradient(135deg, #ffc107, #fd7e14)',
      info: 'linear-gradient(135deg, #007bff, #6610f2)'
    };
    return colors[type] || colors.info;
  }

  static sanitizeMessage(message) {
    return String(message)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .substring(0, 200);
  }
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  
  .secure-notification__content {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .secure-notification__close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    margin-left: auto;
    padding: 5px;
  }
`;
document.head.appendChild(notificationStyles);

// UTILITY FUNCTIONS
const SecurityUtils = {
  // Generate CSRF token
  generateCSRFToken() {
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
  },

  // Check if running in secure context
  isSecureContext() {
    return window.isSecureContext && location.protocol === 'https:';
  },

  // Validate environment
  validateEnvironment() {
    const issues = [];

    if (!SECURE_CONFIG.API_URL || SECURE_CONFIG.API_URL === 'PLACEHOLDER_SCRIPT_URL') {
      issues.push('API URL not configured');
    }

    if (!SECURE_CONFIG.API_KEY || SECURE_CONFIG.API_KEY === 'PLACEHOLDER_API_KEY') {
      issues.push('API key not properly configured');
    }

    if (!this.isSecureContext() && SECURE_CONFIG.IS_PRODUCTION) {
      issues.push('Insecure context detected');
    }

    return {
      isValid: issues.length === 0,
      issues: issues
    };
  }
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', function() {
  // Validate environment
  const envCheck = SecurityUtils.validateEnvironment();
  if (!envCheck.isValid) {
    if (SECURE_CONFIG.DEBUG_MODE) {
      console.warn('Environment issues detected:', envCheck.issues);
      SecureNotificationSystem.show(
        'Configuration issues detected. Check console for details.',
        'warning'
      );
    }
    
    // Show user-friendly error in production
    if (SECURE_CONFIG.IS_PRODUCTION) {
      SecureNotificationSystem.show(
        'System temporarily unavailable. Please try again later.',
        'error',
        0 // Don't auto-hide
      );
      return;
    }
  }

  // Initialize secure API client
  try {
    window.secureApiClient = new SecureApiClient(SECURE_CONFIG);
    
    // Initialize form handler
    window.secureFormHandler = new SecureFormHandler(window.secureApiClient);

    // Test connection if in debug mode
    if (SECURE_CONFIG.DEBUG_MODE) {
      window.secureApiClient.healthCheck()
        .then(result => {
          console.log('Health check passed:', result);
          SecureNotificationSystem.show('Connection to server verified', 'success', 3000);
        })
        .catch(error => {
          console.error('Health check failed:', error.message);
          SecureNotificationSystem.show(
            'Unable to connect to server. Please check your connection.',
            'error'
          );
        });
    }

    console.log('Secure configuration loaded successfully');
    
  } catch (error) {
    console.error('Failed to initialize secure API client:', error.message);
    SecureNotificationSystem.show(
      'System initialization failed. Please refresh the page.',
      'error',
      0
    );
  }
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SECURE_CONFIG,
    SecureApiClient,
    SecureFormHandler,
    SecurityUtils,
    SecureNotificationSystem
  };
}
