let socketServer = null;

function attachRealtimeServer(wss) { socketServer = wss; }

function publish(type = 'orders_changed', payload = {}) {
    if (!socketServer) return;
    const message = JSON.stringify({ type, payload, sent_at: new Date().toISOString() });
    for (const client of socketServer.clients) {
        if (client.readyState === 1) client.send(message);
    }
}

module.exports = { attachRealtimeServer, publish };
