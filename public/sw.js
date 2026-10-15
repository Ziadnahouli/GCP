// public/sw.js - Background Calling & Native Notification Handler

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    if (data.type === 'INCOMING_CALL') {
      const options = {
        body: `Incoming ultra-low latency call from ${data.callerName || 'Peer'}`,
        icon: data.callerAvatar || '/favicon.ico',
        badge: '/favicon.ico',
        tag: `call-${data.callId}`,
        renotify: true,
        requireInteraction: true, // Remains on Windows action center until user acts
        vibrate: [300, 100, 300, 100, 300, 200, 500],
        data: {
          callId: data.callId,
          callerId: data.callerId,
          channelId: data.channelId,
          url: data.channelId
            ? `/channels/${data.channelId}?callId=${data.callId}&autoAnswer=true`
            : `/?callId=${data.callId}&autoAnswer=true`,
        },
        actions: [
          {
            action: 'accept',
            title: '📞 Accept',
          },
          {
            action: 'decline',
            title: '✖ Decline',
          },
        ],
      };

      event.waitUntil(
        self.registration.showNotification(
          `Incoming Call • ${data.callerName || 'Peer'}`,
          options
        )
      );
    }
  } catch (err) {
    console.error('Failed to parse push event payload:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};

  if (event.action === 'decline') {
    // Send background decline beacon
    event.waitUntil(
      fetch(`/api/calls/${notificationData.callId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user_declined_from_os_notification' }),
      }).catch((err) => {
        console.warn('Decline beacon failed:', err);
      })
    );
    return;
  }

  // Accept or clicked banner directly: Focus or open main application window
  const targetUrl = notificationData.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
