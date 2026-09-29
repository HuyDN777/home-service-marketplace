(function () {
  let socket, retryTimer;
  let stopped = false;
  const listeners = new Set();
  function connect() {
    if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/realtime`);
    socket.addEventListener('message', event => {
      try { const update = JSON.parse(event.data); listeners.forEach(listener => listener(update)); } catch {}
    });
    socket.addEventListener('close', () => { if (!stopped) retryTimer = setTimeout(connect, 2000); });
    socket.addEventListener('error', () => socket.close());
  }
  window.RealtimeUpdates = {
    subscribe(listener) { listeners.add(listener); connect(); return () => listeners.delete(listener); },
    close() { stopped = true; clearTimeout(retryTimer); socket?.close(); }
  };
})();
