/**
 * connect.js — Logic for the user code-entry page (index.html)
 * Handles 6-box input, code validation, and BAT download trigger
 */

(function () {
  const boxes   = Array.from(document.querySelectorAll('.code-box'));
  const btn     = document.getElementById('connect-btn');
  const errMsg  = document.getElementById('error-msg');
  const steps   = document.getElementById('download-steps');

  // Auto-fill from ?code= URL param (when admin shares a direct link)
  const urlCode = new URLSearchParams(location.search).get('code') || '';
  if (urlCode) {
    urlCode.toUpperCase().slice(0, 6).split('').forEach((ch, i) => {
      if (boxes[i]) { boxes[i].value = ch; boxes[i].classList.add('filled'); }
    });
    updateBtn();
    // Auto-trigger if full code present
    if (urlCode.length >= 6) setTimeout(() => btn.click(), 400);
  }

  // ── 6-box keyboard navigation ──────────────────────────────────────────────

  boxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      box.value = val ? val[val.length - 1] : '';
      box.classList.toggle('filled', !!box.value);
      clearError();

      if (box.value && i < boxes.length - 1) {
        boxes[i + 1].focus();
      }
      updateBtn();
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].value = '';
        boxes[i - 1].classList.remove('filled');
        updateBtn();
      }
      if (e.key === 'ArrowLeft' && i > 0)   boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });

    // Allow pasting a full code into any box
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
      pasted.split('').forEach((ch, idx) => {
        if (boxes[idx]) {
          boxes[idx].value = ch;
          boxes[idx].classList.add('filled');
        }
      });
      const nextEmpty = boxes.find(b => !b.value);
      (nextEmpty || boxes[boxes.length - 1]).focus();
      clearError();
      updateBtn();
    });
  });

  // Auto-focus first box on load
  boxes[0].focus();

  // ── Button state ───────────────────────────────────────────────────────────

  function getCode() {
    return boxes.map(b => b.value).join('');
  }

  function updateBtn() {
    btn.disabled = getCode().length < 6;
  }

  function setError(msg) {
    errMsg.textContent = msg;
    boxes.forEach(b => b.classList.add('error'));
    setTimeout(() => boxes.forEach(b => b.classList.remove('error')), 600);
  }

  function clearError() {
    errMsg.textContent = '';
  }

  // ── Connect button ─────────────────────────────────────────────────────────

  btn.addEventListener('click', async () => {
    const code = getCode();
    if (code.length < 6) return;

    setLoading(true);
    clearError();

    try {
      // Validate code with server
      const res = await fetch(`/api/validate/${code}`);
      const data = await res.json();

      if (!data.valid) {
        setError(data.message || 'Invalid or expired connection code. Ask your support agent for a new one.');
        setLoading(false);
        return;
      }

      // Trigger BAT download
      triggerDownload(`/download/${code}`);
      showDownloadSteps();

    } catch (err) {
      setError('Could not reach the server. Please check your connection.');
      setLoading(false);
    }
  });

  // Allow pressing Enter to submit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btn.disabled) btn.click();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setLoading(on) {
    btn.classList.toggle('loading', on);
    btn.disabled = on;
  }

  function triggerDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function showDownloadSteps() {
    steps.classList.add('visible');
    setLoading(false);

    // Animate steps in sequence
    const stepEls = steps.querySelectorAll('.step');
    stepEls.forEach((el, i) => {
      setTimeout(() => el.classList.add('show'), i * 300 + 200);
    });

    // Mark step 1 as done immediately
    const s1 = document.getElementById('step1');
    setTimeout(() => s1.classList.add('done'), 600);
  }
})();
