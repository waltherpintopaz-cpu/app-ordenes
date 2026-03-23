import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function QRScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const detectadoRef = useRef(false);
  const audioContextRef = useRef(null);

  const [deviceId, setDeviceId] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [errorScanner, setErrorScanner] = useState("");

  const detener = () => {
    try {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (readerRef.current) {
        readerRef.current.reset();
      }
    } catch (err) {
      console.error(err);
    } finally {
      detectadoRef.current = false;
      setEscaneando(false);
    }
  };

  const reproducirPitidoDeteccion = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const duracion = 0.12;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1240, now);
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duracion);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + duracion);
    } catch (err) {
      console.error(err);
    }

    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(60);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const iniciar = async (deviceIdForzar) => {
    if (!videoRef.current || !readerRef.current) {
      setErrorScanner("No hay camara disponible.");
      return;
    }

    try {
      setErrorScanner("");
      setEscaneando(true);

      const selectedDeviceId = deviceIdForzar || deviceId || undefined;
      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err) => {
          if (result && !detectadoRef.current) {
            detectadoRef.current = true;
            const text = String(result.getText() || "").trim();
            reproducirPitidoDeteccion();
            detener();
            onDetected?.(text);
          }

          if (err && err?.name !== "NotFoundException") {
            console.error(err);
          }
        }
      );
    } catch (err) {
      console.error(err);
      setErrorScanner("No se pudo iniciar el escaner.");
      setEscaneando(false);
    }
  };

  const prepararEscaner = async () => {
    try {
      setIniciando(true);
      setErrorScanner("");
      detectadoRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const trasera =
        devices.find((d) => {
          const label = String(d.label || "").toLowerCase();
          return label.includes("back") || label.includes("rear") || label.includes("trase");
        }) || devices[0];

      const selected = trasera?.deviceId || "";
      setDeviceId(selected);
      await iniciar(selected || undefined);
    } catch (err) {
      console.error(err);
      setErrorScanner("No se pudo abrir la camara. Revisa permisos.");
      setEscaneando(false);
    } finally {
      setIniciando(false);
    }
  };

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();
    prepararEscaner();

    return () => {
      try {
        if (controlsRef.current) controlsRef.current.stop();
        if (readerRef.current) readerRef.current.reset();
        if (audioContextRef.current) audioContextRef.current.close();
      } catch (err) {
        console.error(err);
      }
    };
  }, []);

  return (
    <div
      onClick={() => {
        detener();
        onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.85)",
        zIndex: 10001,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          borderRadius: "18px",
          background: "#0b1224",
          border: "1px solid rgba(255,255,255,0.16)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
          padding: "14px",
          display: "grid",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "14px" }}>
            {iniciando
              ? "Abriendo camara..."
              : escaneando
              ? "Escaneando QR automaticamente"
              : "Escaner QR"}
          </div>
          <button
            onClick={() => {
              detener();
              onClose?.();
            }}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            x
          </button>
        </div>

        <div
          style={{
            borderRadius: "14px",
            overflow: "hidden",
            background: "#000",
            minHeight: "300px",
            border: "1px solid rgba(255,255,255,0.16)",
            position: "relative",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: "100%",
              height: "min(72vh, 520px)",
              objectFit: "cover",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "14% 10%",
              border: "2px solid rgba(56,189,248,0.95)",
              borderRadius: "16px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.28)",
              pointerEvents: "none",
            }}
          />
        </div>

        {errorScanner && (
          <div style={{ color: "#fecaca", fontSize: "13px", display: "grid", gap: "8px" }}>
            <div>{errorScanner}</div>
            <button
              onClick={prepararEscaner}
              style={{
                background: "#1f3a8a",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 600,
                width: "fit-content",
              }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
