/**
 * Dialer Module
 * Manages the dial pad input and display.
 */
class Dialer {
  constructor() {
    this.input = document.getElementById('dialerInput');
    this.dialPad = document.getElementById('dialPad');
    this.backspaceBtn = document.getElementById('backspaceBtn');
    this.callBtn = document.getElementById('callBtn');

    this.onCall = null; // Callback when CALL pressed

    this.init();
  }

  init() {
    // ── Dial Pad Key Presses ──
    this.dialPad.addEventListener('click', (e) => {
      const key = e.target.closest('.dial-key');
      if (!key) return;

      const digit = key.dataset.digit;
      if (digit) {
        this.appendDigit(digit);
      }
    });

    // ── Backspace ──
    this.backspaceBtn.addEventListener('click', () => {
      this.input.value = this.input.value.slice(0, -1);
      this.updateCallButton();
    });

    // Long press backspace to clear
    let backspaceTimer;
    this.backspaceBtn.addEventListener('mousedown', () => {
      backspaceTimer = setTimeout(() => {
        this.input.value = '';
        this.updateCallButton();
      }, 600);
    });
    this.backspaceBtn.addEventListener('mouseup', () => clearTimeout(backspaceTimer));
    this.backspaceBtn.addEventListener('mouseleave', () => clearTimeout(backspaceTimer));

    // ── Input Filtering ──
    this.input.addEventListener('input', () => {
      this.input.value = this.input.value.replace(/[^0-9*#+]/g, '');
      this.updateCallButton();
    });

    // ── Keyboard Shortcuts ──
    document.addEventListener('keydown', (e) => {
      // Don't capture if typing in another input
      if (e.target.tagName === 'INPUT' && e.target !== this.input) return;

      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        this.appendDigit(e.key);
        this.input.focus();
      }

      if (e.key === 'Backspace' && document.activeElement === this.input) {
        // Let default behavior handle it
      }

      if (e.key === 'Enter' && this.input.value.length >= 3) {
        e.preventDefault();
        this.triggerCall();
      }
    });

    // ── Call Button ──
    this.callBtn.addEventListener('click', () => {
      this.triggerCall();
    });

    this.updateCallButton();
  }

  /**
   * Append a digit to the dial input.
   */
  appendDigit(digit) {
    if (this.input.value.length >= 20) return;
    this.input.value += digit;
    this.updateCallButton();
  }

  /**
   * Update the call button state based on input.
   */
  updateCallButton() {
    this.callBtn.disabled = this.input.value.length < 3;
  }

  /**
   * Trigger the call action.
   */
  triggerCall() {
    const number = this.input.value.trim();
    if (number.length < 3) return;
    if (this.onCall) {
      this.onCall(number);
    }
  }

  /**
   * Get the current dial value.
   */
  getValue() {
    return this.input.value.trim();
  }

  /**
   * Clear the input.
   */
  clear() {
    this.input.value = '';
    this.updateCallButton();
  }

  /**
   * Set the call callback.
   */
  setOnCall(callback) {
    this.onCall = callback;
  }
}

window.Dialer = Dialer;
