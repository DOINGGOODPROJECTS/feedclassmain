"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ScanResponse =
  | {
      found: true;
      child: {
        id: string;
        studentId: string;
        fullName: string;
        profileImageUrl: string | null;
        school: { id: string; name: string; code: string } | null;
        class: { id: string; name: string } | null;
        subscription: {
          status: string;
          isSubscribed: boolean;
          isGracePeriod: boolean;
          gracePeriodEndsAt: string | null;
          eligibleForMeal: boolean;
          mealsRemaining?: number;
          mealType?: string | null;
          planName?: string | null;
        };
      };
      scan: {
        id: string;
        mealType: string;
        servedAt: string;
        outcome: "APPROVED" | "BLOCKED" | "DUPLICATE";
        reason: string;
      };
      mealServeId: string | null;
      verification?: MealVerificationResponse["verification"] | null;
      source: string;
      scannedAt: string;
    }
  | {
      found: false;
      message: string;
      source: string;
    };

const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";
const SCANNER_API_TOKEN =
  process.env.NEXT_PUBLIC_SCANNER_API_TOKEN?.trim() || "";
const SCANNER_EMAIL =
  process.env.NEXT_PUBLIC_SCANNER_EMAIL || "admin@feedclass.test";
const SCANNER_PASSWORD =
  process.env.NEXT_PUBLIC_SCANNER_PASSWORD || "password123";

type MealVerificationResponse = {
  verification: {
    mealServeId: string;
    schoolId: string;
    serveDate: string;
    mealType: string;
    leafHash: string;
    merkleProof: Array<{ position: "left" | "right"; hash: string }>;
    batchRoot: string | null;
    txHash: string | null;
    confirmationStatus: "UNANCHORED" | "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";
    anchored: boolean;
  };
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const zxingReaderRef = useRef<any>(null);
  const zxingControlsRef = useRef<any>(null);
  const scanningRef = useRef(true);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<string | null>(null);

  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<MealVerificationResponse["verification"] | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const graceDaysRemaining =
    scanResult && scanResult.found && scanResult.child.subscription.isGracePeriod
      ? Math.max(
          0,
          Math.ceil(
            (new Date(scanResult.child.subscription.gracePeriodEndsAt || "").getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  const detectorSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "BarcodeDetector" in window;
  }, []);

  useEffect(() => {
    scanningRef.current = scanningEnabled;
  }, [scanningEnabled]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function startWithBarcodeDetector() {
      try {
        setStatus("Requesting camera access");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("Camera ready");
        }

        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });

        intervalId = setInterval(async () => {
          if (!scanningRef.current || busyRef.current) return;
          if (!videoRef.current || !detectorRef.current) return;

          try {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (!barcodes || barcodes.length === 0) return;

            const rawValue = barcodes[0]?.rawValue || "";
            if (!rawValue || rawValue === lastCodeRef.current) return;

            await handleScan(rawValue);
          } catch (scanError) {
            console.error(scanError);
          }
        }, 500);
      } catch (err) {
        console.error(err);
        setError("Camera access was denied or unavailable.");
        setStatus("Camera unavailable");
      }
    }

    async function startWithZXing() {
      try {
        setStatus("Requesting camera access");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        zxingReaderRef.current = reader;

        if (!videoRef.current) {
          setError("Camera preview is not available yet.");
          setStatus("Camera unavailable");
          return;
        }

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          async (result: any) => {
            if (!scanningRef.current || busyRef.current) return;
            const rawValue =
              result?.getText?.() ?? result?.text ?? result?.toString?.() ?? "";
            if (!rawValue || rawValue === lastCodeRef.current) return;
            await handleScan(rawValue);
          }
        );

        zxingControlsRef.current = controls;
        setStatus("Camera ready");
      } catch (err) {
        console.error(err);
        setError("Camera access was denied or unavailable.");
        setStatus("Camera unavailable");
      }
    }

    if (detectorSupported) {
      startWithBarcodeDetector();
    } else {
      startWithZXing();
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (zxingControlsRef.current) {
        zxingControlsRef.current.stop();
      }
      if (zxingReaderRef.current?.reset) {
        zxingReaderRef.current.reset();
      }
    };
  }, [detectorSupported]);

  async function handleScan(code: string) {
    busyRef.current = true;
    lastCodeRef.current = code;
    setLastScannedCode(code);
    setBusy(true);
    setStatus("Checking badge");
    setError(null);

    try {
      const token = await getBackendAccessToken();
      const response = await fetch(`${BACKEND_BASE}/scanner/meal-scans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...token,
        },
        body: JSON.stringify({ qrPayload: code, mealType: "LUNCH" }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const failure: ScanResponse = {
          found: false,
          message:
            payload && typeof payload.message === "string"
              ? payload.message
              : "Badge verification failed.",
          source: "FeedClass backend",
        };
        setScanResult(failure);
        setVerification(null);
        setStatus("Badge not found");
        return;
      }

      const result: ScanResponse = {
        found: true,
        child: payload.child,
        scan: payload.scan,
        mealServeId: payload.mealServeId || null,
        verification: payload.verification || null,
        source: "FeedClass backend",
        scannedAt: payload.scan?.servedAt || new Date().toISOString(),
      };
      setScanResult(result);
      if (result.verification) {
        setVerification(result.verification);
        setVerificationError(null);
      } else if (result.mealServeId) {
        await handleVerifyMeal(result.mealServeId);
      } else {
        setVerification(null);
        setVerificationError(null);
      }
      setStatus("Badge verified");
    } catch (err) {
      console.error(err);
      setError("Failed to reach the FeedClass backend.");
      setStatus("Network error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function getBackendAccessToken(): Promise<Record<string, string>> {
    if (SCANNER_API_TOKEN) {
      return { "x-api-token": SCANNER_API_TOKEN };
    }

    if (accessTokenRef.current) {
      return { Authorization: `Bearer ${accessTokenRef.current}` };
    }

    const response = await fetch(`${BACKEND_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: SCANNER_EMAIL,
        password: SCANNER_PASSWORD,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.accessToken) {
      throw new Error(payload?.message || "Scanner login failed.");
    }

    accessTokenRef.current = payload.accessToken;
    return { Authorization: `Bearer ${payload.accessToken as string}` };
  }

  async function handleVerifyMeal(explicitMealId?: string) {
    const targetMealId = explicitMealId || "";
    if (!targetMealId) {
      return;
    }

    setVerifying(true);
    setVerificationError(null);

    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch(
          `${BACKEND_BASE}/blockchain/verify-meal/${encodeURIComponent(targetMealId)}`
        );
        const payload = (await response.json()) as MealVerificationResponse | { message?: string };

        if (!response.ok || !("verification" in payload)) {
          setVerification(null);
          setVerificationError(
            "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Failed to load blockchain proof."
          );
          return;
        }

        setVerification(payload.verification);
        if (
          payload.verification.batchRoot ||
          payload.verification.txHash ||
          payload.verification.merkleProof.length > 0 ||
          payload.verification.confirmationStatus !== "UNANCHORED"
        ) {
          return;
        }

        if (attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    } catch (verifyError) {
      console.error(verifyError);
      setVerification(null);
      setVerificationError("Failed to reach the FeedClass backend verification endpoint.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(239,71,111,0.25),_transparent_55%),radial-gradient(circle_at_20%_80%,_rgba(255,183,3,0.2),_transparent_60%)]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(17,17,17,0.04)_0%,_rgba(17,17,17,0)_40%,_rgba(17,17,17,0.06)_100%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-none flex-col gap-12 px-8 py-14 sm:px-12 lg:px-20">
        <section className="w-full">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-black/60">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            Feedclass QR Scanner
          </div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-[var(--surface-contrast)] sm:text-5xl">
            Feedclass QR Scanner.
            <span className="block font-serif text-[var(--accent-strong)]">
              Validate in real time.
            </span>
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-black/70">
            Point the camera at a QR badge to check against the MySQL roster. The
            demo falls back to dummy data when the database is offline.
          </p>
        </section>

        <section className="grid w-full grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-16">
          <div className="flex w-full flex-col gap-6">
            <div className="min-h-[420px] rounded-3xl border border-black/10 bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] lg:min-h-[520px]">
              <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-black/50">
                  Scanner Status
                </p>
                <p className="text-xl font-medium text-black">{status}</p>
              </div>
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scanningEnabled
                    ? "bg-black text-white hover:bg-black/85"
                    : "bg-white text-black ring-1 ring-black/20 hover:bg-black/5"
                }`}
                onClick={() => setScanningEnabled((prev) => !prev)}
                type="button"
              >
                {scanningEnabled ? "Pause" : "Resume"}
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3">
                <span className="text-sm text-black/60">Detector</span>
                <span className="text-sm font-semibold text-black">
                  {detectorSupported ? "BarcodeDetector" : "ZXing (fallback)"}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-black/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(0,0,0,0.02))] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">
                How To Scan
              </p>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl bg-black/5 px-4 py-3">
                  <p className="text-sm font-semibold text-black">Hold badge inside the frame</p>
                  <p className="mt-1 text-sm text-black/65">
                    Keep the QR code centered and fully visible before moving closer.
                  </p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-3">
                  <p className="text-sm font-semibold text-black">Wait for automatic verification</p>
                  <p className="mt-1 text-sm text-black/65">
                    The scanner checks the code immediately and shows the result below.
                  </p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-3">
                  <p className="text-sm font-semibold text-black">If scanning fails</p>
                  <p className="mt-1 text-sm text-black/65">
                    Improve lighting, steady the camera, and fill more of the frame with the badge.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {lastScannedCode ? (
              <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">Last scanned code</p>
                <p className="mt-2 break-all text-sm font-medium text-black">{lastScannedCode}</p>
              </div>
            ) : null}
          </div>
          </div>

          <div className="flex w-full flex-col gap-6">
            <div className="relative h-[420px] w-full max-w-4xl overflow-hidden rounded-[32px] border border-black/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.25)] lg:h-[520px]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[70%] w-[70%] rounded-3xl border border-white/40">
                <div className="absolute -left-1 -top-1 h-6 w-6 border-l-4 border-t-4 border-white" />
                <div className="absolute -right-1 -top-1 h-6 w-6 border-r-4 border-t-4 border-white" />
                <div className="absolute -bottom-1 -left-1 h-6 w-6 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 h-6 w-6 border-b-4 border-r-4 border-white" />
                <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[linear-gradient(90deg,_transparent,_rgba(255,255,255,0.9),_transparent)]" />
              </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="rounded-3xl border border-black/10 bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-black/50">
                  Validation
                </p>
                <p className="text-2xl font-semibold text-black">
                  {scanResult
                    ? scanResult.found
                      ? "Access granted"
                      : "Access denied"
                    : "Awaiting scan"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  scanResult
                    ? scanResult.found
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                    : "bg-black/10 text-black/60"
                }`}
              >
                {scanResult
                  ? scanResult.found
                    ? "Verified"
                    : "Denied"
                  : "Idle"}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Name
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.child.fullName
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Student ID
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.child.studentId
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  School
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.child.school?.name || "—"
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Subscription
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.child.subscription.status.replaceAll("_", " ")
                    : "—"}
                </p>
              </div>
            </div>
            {scanResult && scanResult.found ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-3xl border border-black/10 bg-black/5 p-4">
                  <div
                    className="h-52 w-full rounded-2xl bg-white bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${scanResult.child.profileImageUrl || "/qr-placeholder.svg"})`,
                    }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-black/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50">Class</p>
                    <p className="text-lg font-semibold text-black">{scanResult.child.class?.name || "—"}</p>
                  </div>
                  <div className="rounded-2xl bg-black/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50">Meal access</p>
                    <p className="text-lg font-semibold text-black">
                      {scanResult.child.subscription.eligibleForMeal ? "Eligible" : "Not eligible"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50">Meals remaining</p>
                    <p className="text-lg font-semibold text-black">
                      {scanResult.child.subscription.isGracePeriod
                        ? `Grace meal · ${graceDaysRemaining ?? 0} day${graceDaysRemaining === 1 ? "" : "s"} left`
                        : scanResult.child.subscription.mealsRemaining ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50">Meal type</p>
                    <p className="text-lg font-semibold text-black">
                      {scanResult.child.subscription.mealType || scanResult.scan.mealType}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/5 px-4 py-4 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50">Scan result</p>
                    <p className="mt-2 text-sm text-black/65">{scanResult.scan.reason}</p>
                  </div>
                </div>
              </div>
            ) : scanResult && !scanResult.found ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {scanResult.message}
              </div>
            ) : null}
          </div>
        </section>

        <section className="w-full">
          <div className="rounded-3xl border border-black/10 bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-black/50">
                Blockchain Proof
              </p>
              <p className="text-2xl font-semibold text-black">
                Proof is loaded automatically after a successful served-meal scan.
              </p>
            </div>

            {verificationError ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {verificationError}
              </div>
            ) : null}

            {!verification && !verificationError ? (
              <div className="mt-6 rounded-2xl border border-black/10 bg-black/5 px-4 py-4 text-sm text-black/65">
                {scanResult && scanResult.found
                  ? "Waiting for the backend proof record for this served meal."
                  : "Scan a child QR badge first. When the backend records a served meal and returns a `mealServeId`, the CELO proof will appear here automatically."}
              </div>
            ) : null}

            {verification ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-black/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">Confirmation status</p>
                  <p className="mt-2 text-lg font-semibold text-black">{verification.confirmationStatus}</p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">Batch root</p>
                  <p className="mt-2 break-all text-sm font-semibold text-black">{verification.batchRoot || "—"}</p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-4 lg:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">Leaf hash</p>
                  <p className="mt-2 break-all text-sm font-semibold text-black">{verification.leafHash}</p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-4 lg:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">Transaction hash</p>
                  <p className="mt-2 break-all text-sm font-semibold text-black">{verification.txHash || "Not submitted yet"}</p>
                </div>
                <div className="rounded-2xl bg-black/5 px-4 py-4 lg:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/50">Merkle proof</p>
                  <div className="mt-3 space-y-3">
                    {verification.merkleProof.length > 0 ? (
                      verification.merkleProof.map((entry, index) => (
                        <div key={`${entry.hash}-${index}`} className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                            Sibling {index + 1} · {entry.position}
                          </p>
                          <p className="mt-2 break-all text-sm font-semibold text-black">{entry.hash}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-black/60">No stored proof yet for this meal batch.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
