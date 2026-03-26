function getWhatsAppConfig() {
  return {
    accessToken: String(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim(),
    phoneNumberId: String(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim(),
    apiVersion: String(process.env.WHATSAPP_CLOUD_API_VERSION || "v23.0").trim(),
  };
}

function isWhatsAppConfigured() {
  const config = getWhatsAppConfig();
  return Boolean(config.accessToken && config.phoneNumberId);
}

async function sendWhatsAppText({ to, text }) {
  const config = getWhatsAppConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    throw new Error(
      "WhatsApp Cloud API is not configured. Set WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID."
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      }),
    }
  );

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.error?.error_user_msg || raw || "WhatsApp Cloud API request failed";
    throw new Error(message);
  }

  return {
    providerReference: payload?.messages?.[0]?.id || null,
    status: "SENT",
    raw: payload,
  };
}

module.exports = {
  getWhatsAppConfig,
  isWhatsAppConfigured,
  sendWhatsAppText,
};
