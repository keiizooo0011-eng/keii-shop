(() => {
  const copy = document.querySelector('.apk-typing-copy');
  const output = document.getElementById('apkTypingText');
  if (!copy || !output) return;

  const text = copy.dataset.apkTyping || '';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    output.textContent = text;
    return;
  }

  const TYPE_DELAY = 34;
  const DELETE_DELAY = 14;
  const HOLD_DELAY = 50000;
  const RESTART_DELAY = 650;
  let index = 0;

  const type = () => {
    if (index < text.length) {
      output.textContent += text.charAt(index++);
      window.setTimeout(type, TYPE_DELAY);
      return;
    }
    window.setTimeout(erase, HOLD_DELAY);
  };

  const erase = () => {
    if (index > 0) {
      output.textContent = text.slice(0, --index);
      window.setTimeout(erase, DELETE_DELAY);
      return;
    }
    window.setTimeout(type, RESTART_DELAY);
  };

  type();
})();
