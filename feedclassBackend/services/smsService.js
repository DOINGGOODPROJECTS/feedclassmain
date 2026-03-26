function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

function getSmsProvider() {
  const explicitProvider = String(process.env.SMS_PROVIDER || "")
    .trim()
    .toUpperCase();

  if (explicitProvider) {
    return explicitProvider;
  }

  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  ) {
    return "TWILIO";
  }

  if (process.env.INFOBIP_BASE_URL && process.env.INFOBIP_API_KEY && process.env.INFOBIP_SENDER) {
    return "INFOBIP";
  }

  return "";
}

function getSmsConfig() {
  const provider = getSmsProvider();

  if (provider === "TWILIO") {
    return {
      provider,
      accountSid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
      authToken: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
      fromNumber: String(process.env.TWILIO_FROM_NUMBER || "").trim(),
      messagingServiceSid: String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim(),
    };
  }

  if (provider === "INFOBIP") {
    return {
      provider,
      baseUrl: normalizeBaseUrl(process.env.INFOBIP_BASE_URL),
      apiKey: String(process.env.INFOBIP_API_KEY || "").trim(),
      sender: String(process.env.INFOBIP_SENDER || "").trim(),
    };
  }

  return { provider: "" };
}

function isSmsConfigured() {
  const config = getSmsConfig();

  if (config.provider === "TWILIO") {
    return Boolean(
      config.accountSid && config.authToken && (config.fromNumber || config.messagingServiceSid)
    );
  }

  if (config.provider === "INFOBIP") {
    return Boolean(config.baseUrl && config.apiKey && config.sender);
  }

  return false;
}

async function sendViaTwilio({ to, text }) {
  const config = getSmsConfig();
  if (!config.accountSid || !config.authToken || (!config.fromNumber && !config.messagingServiceSid)) {
    throw new Error(
      "Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID."
    );
  }

  const params = new URLSearchParams();
  params.set("To", to);
  if (config.messagingServiceSid) {
    params.set("MessagingServiceSid", config.messagingServiceSid);
  } else {
    params.set("From", config.fromNumber);
  }
  params.set("Body", text);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
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
    throw new Error(payload?.message || raw || "Twilio SMS request failed");
  }

  return {
    providerReference: payload?.sid || null,
    status: String(payload?.status || "queued").toUpperCase(),
    raw: payload,
  };
}

async function sendViaInfobip({ to, text }) {
  const config = getSmsConfig();
  if (!config.baseUrl || !config.apiKey || !config.sender) {
    throw new Error("Infobip SMS is not configured. Set INFOBIP_BASE_URL, INFOBIP_API_KEY, and INFOBIP_SENDER.");
  }

  const response = await fetch(`${config.baseUrl}/sms/3/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `App ${config.apiKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          sender: config.sender,
          destinations: [{ to }],
          content: {
            text,
          },
        },
      ],
    }),
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const providerMessage =
      payload?.requestError?.serviceException?.text ||
      payload?.requestError?.policyException?.text ||
      raw ||
      "Infobip SMS request failed";
    throw new Error(providerMessage);
  }

  const message = payload?.messages?.[0] || null;
  return {
    providerReference: message?.messageId || null,
    status: message?.status?.name || "SENT",
    raw: payload,
  };
}

async function sendSms({ to, text }) {
  if (!to || !text) {
    throw new Error("SMS recipient and text are required");
  }

  const config = getSmsConfig();

  if (config.provider === "TWILIO") {
    return sendViaTwilio({ to, text });
  }

  if (config.provider === "INFOBIP") {
    return sendViaInfobip({ to, text });
  }

  throw new Error(
    "SMS provider is not configured. Set SMS_PROVIDER=TWILIO with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID."
  );
}

module.exports = {
  getSmsProvider,
  getSmsConfig,
  isSmsConfigured,
  sendSms,
};
