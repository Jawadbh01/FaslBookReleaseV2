importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Config is posted from the main thread via a one-time message
let messagingInitialized = false;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG" && !messagingInitialized) {
    messagingInitialized = true;
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      self.registration.showNotification(title || "FaslBook", {
        body: body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: payload.data,
      });
    });
  }
});
